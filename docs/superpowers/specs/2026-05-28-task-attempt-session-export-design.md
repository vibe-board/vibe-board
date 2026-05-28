# Task Attempt Session Export — Design

**Status:** Design approved, ready for implementation plan.
**Date:** 2026-05-28
**Branch context:** `vb/7dac-session-export`

## Goal

Add an "Export Session" action to the task attempt dropdown menu that downloads a single `.zip` containing the full conversational history of the attempt — both as raw per-process JSONL (machine-readable) and as one combined rendered HTML page (human-readable, offline-openable).

## Non-goals (v1)

- Streaming zip generation. In-memory generation with a 200 MB cap is sufficient for v1.
- Refactoring `StandardCodingAgentExecutor::normalize_logs` to a synchronous one-shot API. The replay path uses polling for stability; see §4.1.
- Exporting `SetupScript`, `CleanupScript`, `ArchiveScript`, `CommitMessage`, or `DevServer` processes. Only `CodingAgent` processes are included.
- Re-importing an exported zip back into vibe-kanban.
- Direct sharing / cloud upload of the zip from the UI.
- Per-process selection or time-range filtering UI.
- Syntax highlighting in HTML output.

## User-facing surface

### Dropdown integration

The new menu item lives in `frontend/src/components/ui/actions-dropdown.tsx`, immediately after the existing **Copy Run Command** item (currently around line 214), still inside the `hasAttemptActions` group and before its closing `DropdownMenuSeparator`.

```tsx
<DropdownMenuItem
  disabled={!attempt?.id || !hasCodingAgentProcess}
  onClick={handleExportSession}
>
  {t('actionsMenu.exportSession')}
</DropdownMenuItem>
```

- Label key: `actionsMenu.exportSession` (English: `"Export Session"`; Chinese: `"导出会话"`; same pattern as existing keys).
- `hasCodingAgentProcess` is derived from the existing processes list available in the dropdown's surrounding context (filter processes where `run_reason === 'codingagent'`). When false (fresh attempt, never ran), the item is disabled. This prevents requesting an empty zip.
- Handler triggers a native browser download via `window.location.href` — no `fetch`/`Blob` plumbing, no extra state. Tauri's webview handles `Content-Disposition: attachment` the same way as a browser.

```tsx
const handleExportSession = (e: React.MouseEvent) => {
  e.stopPropagation();
  if (!attempt?.id) return;
  window.location.href = `/api/task-attempts/${attempt.id}/export-session`;
};
```

### Zip layout

Filename: `attempt-{branch-slug}-{YYYY-MM-DD-HHmm}.zip`
- `{branch-slug}`: `attempt.branch` with chars outside `[A-Za-z0-9._-]` replaced by `-`. If empty/null, fallback to `attempt-{first8(attempt.id)}`.
- Timestamp uses server local time at export request.

```
attempt-{branch-slug}-{YYYY-MM-DD-HHmm}.zip
├── conversation.html          # Combined rendering of all CodingAgent processes
├── README.txt                 # ~10 lines: export time, attempt id, process count, file map
└── raw/
    ├── 01-{short-id}.jsonl    # CodingAgent process #1 raw stdout
    ├── 02-{short-id}.jsonl    # process #2
    └── …
```

- File-name prefix `01/02/…` ensures zip listing renders in chronological order.
- `{short-id}` is `execution_id[..8]` for cross-reference with backend logs.
- The raw `.jsonl` files contain the executor's original stdout lines (decompressed from `.jsonl.zst`); format varies by executor.

### `conversation.html` shape

A single HTML document with inline CSS, no JavaScript, no external resources. Opens offline in any browser.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Session · {task_title} · {branch}</title>
  <style>/* ~80 lines of inline CSS */</style>
</head>
<body>
  <header class="page-header">
    <h1>{task_title}</h1>
    <dl class="meta">
      <dt>Attempt</dt><dd>{attempt_id}</dd>
      <dt>Branch</dt><dd>{branch}</dd>
      <dt>Processes</dt><dd>{n}</dd>
      <dt>Exported</dt><dd>{now}</dd>
    </dl>
  </header>

  <main>
    <section class="process" id="p1">
      <h2 class="process-header">
        Process 1 · <span class="executor">{executor_type}</span> ·
        <time>{started_at}</time> → <time>{completed_at_or_dash}</time>
        ({duration_or_running}, exit {exit_code_or_dash})
      </h2>

      <!-- One <article class="entry entry--{type}"> per NormalizedEntry -->

      <footer class="process-footer">
        Tokens: in {input} · out {output} · cost ${cost}
      </footer>
    </section>

    <!-- More <section class="process"> per process -->
  </main>

  <footer class="page-footer">Exported by vibe-kanban</footer>
</body>
</html>
```

### NormalizedEntryType → HTML mapping

| Variant | Rendering |
|---|---|
| `UserMessage` | `entry--user`; role label "User"; content → markdown |
| `UserFeedback` | `entry--user`; subtitle `Denied tool: {denied_tool}`; content → markdown |
| `AssistantMessage` | `entry--assistant`; role label "Assistant"; content → markdown |
| `ToolUse` | `entry--tool`; header `🔧 {tool_name} · {status}`; body wrapped in `<details>`; `<summary>` is a one-liner derived from `action_type`; expanded body shows full content as preformatted text |
| `SystemMessage` | `entry--system`; dim styling; content → markdown |
| `ErrorMessage` | `entry--error`; red accent; content as plain text; show `error_type` badge |
| `Thinking` | `entry--thinking`; italic dim; content → markdown |
| `Loading` | **Skipped** (transient UI state, no archival value) |
| `NextAction` | **Skipped** (control-flow metadata) |
| `TokenUsageInfo` | Aggregated into `process-footer`, not rendered as standalone entry |
| `TaskDuration` | Aggregated into `process-header`, not rendered as standalone entry |
| `UserAnsweredQuestions` | `entry--user`; render Q&A pairs as a definition list |

### CSS / typography

- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- Monospace: `ui-monospace, "SF Mono", Menlo, monospace`.
- Container: `max-width: 880px; margin: 2rem auto; padding: 0 1rem`.
- Light theme by default; `@media (prefers-color-scheme: dark)` overrides background/text.
- Each entry has `border-left: 3px solid var(--accent)` with the accent varying by entry type.
- HTML escaping for all dynamic content via `html_escape::encode_text` (or equivalent).
- Markdown rendering via `pulldown_cmark`.

## Backend architecture

### Endpoint

`GET /api/task-attempts/{id}/export-session`

- **Response 200**: `Content-Type: application/zip`, `Content-Disposition: attachment; filename="..."`, body = zip bytes.
- **Response 404** `{"error": "attempt_not_found"}` — unknown attempt id.
- **Response 404** `{"error": "no_coding_agent_processes"}` — attempt exists but has no `CodingAgent` processes (frontend already disables the menu item, but the endpoint is safe to hit directly).
- **Response 413** `{"error": "export_too_large", "bytes": <n>}` — accumulated raw bytes exceed 200 MB.
- **Response 500** on database / I/O / zip-writer errors, logged with attempt id.

Registered in `crates/server/src/routes/task_attempts.rs` alongside the existing per-attempt routes (`/merge`, `/push`, `/stop`, etc., around lines 1681–1721).

### Data flow

```
[Handler]
   │ attempt_id → DB query attempt + session
   ▼
[services::session_export::build_attempt_export(pool, attempt_id)]
   │ 1. SELECT * FROM execution_processes
   │      WHERE session_id = ? AND run_reason = 'codingagent' AND dropped = false
   │      ORDER BY started_at
   │ 2. For each process:
   │      raw_lines  = raw_log_store::read_log_lines(execution_id)
   │      entries    = replay_normalize(executor, raw_lines, worktree_path)
   │ 3. Aggregate into AttemptExport struct
   ▼
[render_html(&export)] → String
[build_zip_bytes(&export)] → Vec<u8>
   │
   ▼
[axum::Response] application/zip
```

### Module: `crates/services/src/services/session_export.rs`

```rust
pub struct ProcessExport {
    pub index: u32,                       // 1-based chronological
    pub execution_id: Uuid,
    pub executor_type: String,            // "codex" / "claude" / ...
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub status: ExecutionProcessStatus,   // in_progress / completed / failed / killed
    pub exit_code: Option<i64>,
    pub raw_lines: Vec<String>,           // may be empty if log missing
    pub raw_log_missing: bool,            // true if file not on disk
    pub entries: Vec<NormalizedEntry>,    // may be empty on missing log or normalize failure
    pub normalize_status: NormalizeStatus,
}

pub enum NormalizeStatus {
    Ok,
    Skipped { reason: String },          // e.g., "executor 'foo' not found"
    PartialTimeout,                       // replay polling hit the 30s cap
}

pub struct AttemptExport {
    pub attempt_id: Uuid,
    pub branch: String,
    pub task_title: String,
    pub exported_at: DateTime<Utc>,
    pub processes: Vec<ProcessExport>,
}

pub async fn build_attempt_export(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<AttemptExport, ExportError>;

pub fn render_html(export: &AttemptExport) -> String;
pub fn build_zip_bytes(export: &AttemptExport) -> Result<Vec<u8>, ExportError>;

pub enum ExportError {
    AttemptNotFound,
    NoCodingAgentProcesses,
    TooLarge { bytes: usize },
    Database(sqlx::Error),
    Io(std::io::Error),
    Zip(zip::result::ZipError),
}
```

`render_html` and `build_zip_bytes` are pure functions and unit-testable. `build_attempt_export` is the only DB- and disk-touching function.

## 4. Implementation notes

### 4.1 Replay: `replay_normalize`

Each `StandardCodingAgentExecutor` provides:

```rust
fn normalize_logs(&self, msg_store: Arc<MsgStore>, worktree_path: &Path);
```

This is fire-and-forget — it subscribes to `msg_store.stdout_chunked_stream()`, spawns internal tasks that emit `LogMsg::JsonPatch(...)` back into the store, and returns immediately. No join handle is exposed.

The replay function feeds historical raw lines through a fresh `MsgStore` and collects the resulting patches:

```rust
pub async fn replay_normalize(
    executor: Arc<dyn StandardCodingAgentExecutor>,
    raw_lines: Vec<String>,
    worktree_path: PathBuf,
) -> (Vec<NormalizedEntry>, NormalizeStatus) {
    let store = Arc::new(MsgStore::new());

    // 1) Pre-load history (normalize_logs uses history_plus_stream).
    for line in raw_lines {
        store.push_stdout(format!("{line}\n"));
    }
    store.push_finished();

    // 2) Kick off normalizer (internal tasks).
    executor.normalize_logs(store.clone(), &worktree_path);

    // 3) Wait until the JsonPatch count in history is stable for 250ms,
    //    capped at 30s.
    let status = wait_for_patches_to_stabilize(&store).await;

    // 4) Apply all collected patches to reconstruct entries.
    let mut value = serde_json::json!([]);
    for msg in store.get_history() {
        if let LogMsg::JsonPatch(p) = msg {
            let _ = json_patch::patch(&mut value, &p);
        }
    }
    (serde_json::from_value(value).unwrap_or_default(), status)
}
```

**Stabilization details:**
- Poll every 50 ms.
- Count `LogMsg::JsonPatch` entries in `store.get_history()`.
- "Stable" = count unchanged for 5 consecutive polls (250 ms total).
- Hard cap: 30 s. On cap → `NormalizeStatus::PartialTimeout`, render best-effort entries with a warning banner in the process header.

**Known risk:** If a normalizer has long async latency (e.g., calls into LSP), stabilization may declare "done" too early. The CodingAgent normalizers in this codebase are pure text parsers; observed parse times are sub-second per process. A v2 may add `normalize_logs_oneshot(raw_lines) -> Vec<NormalizedEntry>` as a trait default to eliminate polling.

### 4.2 Executor lookup

Each `ExecutionProcess.executor_action` carries an `ExecutorAction` value that identifies the executor by type tag (e.g., `claude`, `codex`, `mimocode`). The existing executor registry/factory in `crates/executors` already maps these to concrete `StandardCodingAgentExecutor` instances; reuse the same lookup. If the executor type is no longer registered (e.g., agent removed in a later version), `replay_normalize` is skipped with `NormalizeStatus::Skipped { reason: "executor '{type}' not found" }`; the raw JSONL is still included in the zip.

### 4.3 Size accounting

`build_attempt_export` accumulates `raw_lines.iter().map(String::len).sum()` across processes. If the running total exceeds 200 MB **before** rendering HTML, return `ExportError::TooLarge { bytes }` immediately to keep peak memory bounded. The handler maps this to HTTP 413.

### 4.4 Zip writer

Use the `zip` crate with `ZipWriter<Cursor<Vec<u8>>>`. All entries use `Deflated` compression (default level). Final `Vec<u8>` is the response body. No streaming in v1.

### 4.5 Filename sanitization

```rust
fn sanitize_branch(branch: &str) -> String {
    let cleaned: String = branch
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '-' })
        .collect();
    cleaned.trim_matches('-').to_string()
}
```

Empty after sanitization → fallback to `attempt-{first8(attempt.id)}`.

## 5. Edge cases

| Case | Behavior |
|---|---|
| Attempt not found | 404 `attempt_not_found` |
| Attempt has 0 `CodingAgent` processes | Frontend disables menu item; endpoint returns 404 `no_coding_agent_processes` |
| Process is `in_progress` during export | Included. `read_log_lines` (`BufReader.lines()`) drops incomplete trailing lines. Process header shows `(running)` instead of exit/duration |
| `.jsonl.zst` missing on disk | Process section in HTML shows `[raw log unavailable]`; no file added under `raw/`; `raw_log_missing = true` on `ProcessExport` |
| Executor type no longer registered | `NormalizeStatus::Skipped`; raw JSONL still packed; HTML header shows `[normalize unavailable: executor '{type}']` |
| `dropped = true` process | Excluded by DB filter (`AND dropped = false`) |
| Branch name has `/`, Unicode, or is empty | `sanitize_branch` strips/replaces; fallback to `attempt-{first8(id)}` |
| Total raw bytes > 200 MB | 413 `export_too_large` with `bytes` field |
| Concurrent exports of same attempt | No locking; each request is independent read-only |
| User aborts download mid-stream | Axum closes the response; no side effects |
| `replay_normalize` exceeds 30 s | `NormalizeStatus::PartialTimeout`; render collected patches with warning banner |

## 6. Testing

### Unit (in `crates/services/src/services/session_export.rs` `#[cfg(test)]`)

1. `render_html_empty()` — 0 processes still produces valid HTML with a "No data" placeholder.
2. `render_entry_each_type()` — table-driven across all `NormalizedEntryType` variants; assert each renders without panic and includes its expected CSS class.
3. `render_html_escapes_user_content()` — entry content containing `<script>alert(1)</script>` must appear escaped in the output (no raw `<script>` substring).
4. `build_zip_layout()` — construct a 2-process `AttemptExport`; `build_zip_bytes` output, when read with `zip::ZipArchive`, must contain entries named `conversation.html`, `README.txt`, `raw/01-*.jsonl`, `raw/02-*.jsonl`.
5. `replay_normalize_claude_fixture()` — feed 3–5 lines of valid Claude JSONL through `replay_normalize` for the Claude executor; assert a non-empty `Vec<NormalizedEntry>` is returned with the first entry's `entry_type` matching expectation.
6. `sanitize_branch_*` — edge cases: empty string, slashes, Unicode, all special chars.

### Integration (`crates/server/tests/...` — confirm existing route-test pattern during implementation)

7. `export_session_endpoint_happy_path()` — set up test DB with an attempt, a session, two `CodingAgent` processes; write two synthetic raw `.jsonl.zst` files into `asset_dir()/logs/`; GET the endpoint and assert:
   - 200 status
   - `Content-Type: application/zip`
   - `Content-Disposition: attachment; filename="..."`
   - Body is a valid zip with the expected entries
8. `export_session_404_when_no_processes()` — attempt with 0 `CodingAgent` processes returns 404 `no_coding_agent_processes`.

### Manual smoke

- Open the dropdown on a real attempt that has run an agent; verify the **Export Session** item appears and is enabled.
- Click; verify the browser downloads `attempt-*.zip`.
- Unzip; double-click `conversation.html`; verify it renders without errors in Chrome / Firefox / Safari.
- Spot-check that the rendered content matches what's shown in the live conversation view.

## 7. File inventory

### New

| Path | Purpose |
|---|---|
| `crates/services/src/services/session_export.rs` | Main module: `build_attempt_export`, `replay_normalize`, `render_html`, `build_zip_bytes`, sanitizer, tests |

### Modified

| Path | Change |
|---|---|
| `crates/services/src/services/mod.rs` | `pub mod session_export;` |
| `crates/services/Cargo.toml` | Add `zip`, `pulldown_cmark`, `html_escape` (only those not already declared) |
| `crates/server/src/routes/task_attempts.rs` | Register `GET /export-session` route + handler, map `ExportError` to HTTP statuses |
| `frontend/src/components/ui/actions-dropdown.tsx` | Add `DropdownMenuItem` + `handleExportSession` after the existing **Copy Run Command** item |
| `frontend/src/i18n/locales/{en,es,fr,ja,ko,zh-Hans,zh-Hant}/tasks.json` | Add `actionsMenu.exportSession` translation key (sibling of `copyRunCommand`) |

### Not changed

- `shared/types.ts` — the endpoint returns binary zip bytes; no new `ts-rs` exported types are introduced.
- Database schema — fully read-only.

## 8. Dependencies

These crates are not currently in the workspace and must be added (confirmed against `Cargo.toml` at design time):

- `zip` — in-memory zip writing
- `pulldown_cmark` — Markdown to HTML
- `html_escape` — HTML attribute/text escaping

Declare each at workspace level (`Cargo.toml`) and consume via `{ workspace = true }` from `crates/services/Cargo.toml`.

No new frontend dependencies.

## 9. Open questions for implementation

These can be resolved during the planning/implementation phase, not during design:

- Whether `crates/server/tests/` already has a pattern for integration tests touching `asset_dir()`; if not, the integration test in §6.7 will set up a temp dir following the harness pattern used by neighbouring tests.
