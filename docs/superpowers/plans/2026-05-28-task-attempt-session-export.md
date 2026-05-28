# Task Attempt Session Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export Session" item to the task attempt actions dropdown that downloads a zip containing one combined offline-openable HTML of the attempt's CodingAgent conversation plus per-process raw JSONL.

**Architecture:** New `crates/services/src/services/session_export.rs` module exposes pure functions (`render_html`, `build_zip_bytes`) plus a DB/disk reader (`build_attempt_export`). NormalizedEntries are re-derived from raw `.jsonl.zst` files by replaying them through each executor's existing `normalize_logs` function. A new axum route `GET /api/task-attempts/{id}/export-session` streams the zip with `Content-Disposition: attachment`. Frontend adds one `DropdownMenuItem` and triggers download via `fetch` + `Blob`.

**Tech Stack:** Rust (axum, sqlx, tokio, zip, pulldown_cmark, html_escape, json-patch), React + TypeScript (i18next, fetch).

**Spec:** `docs/superpowers/specs/2026-05-28-task-attempt-session-export-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `Cargo.toml` (workspace root) | Modify | Add `zip`, `pulldown_cmark`, `html_escape` to `[workspace.dependencies]` |
| `crates/services/Cargo.toml` | Modify | Consume the three new deps via `{ workspace = true }` |
| `crates/services/src/services/mod.rs` | Modify | Register `pub mod session_export;` |
| `crates/services/src/services/session_export.rs` | Create | Replay + render + zip + types + unit tests |
| `crates/server/src/routes/task_attempts.rs` | Modify | Add `GET /export-session` handler + route registration + error mapping |
| `crates/server/tests/session_export.rs` (or extend an existing test file) | Create | End-to-end route test |
| `frontend/src/i18n/locales/{en,es,fr,ja,ko,zh-Hans,zh-Hant}/tasks.json` | Modify | Add `actionsMenu.exportSession` key |
| `frontend/src/components/ui/actions-dropdown.tsx` | Modify | New `DropdownMenuItem` + handler + `hasCodingAgentProcess` derivation |

---

## Task 1: Add workspace dependencies

**Files:**
- Modify: `Cargo.toml` (workspace root)
- Modify: `crates/services/Cargo.toml`

- [ ] **Step 1: Add the three crates to workspace dependencies**

Open `Cargo.toml` (workspace root). The `[workspace.dependencies]` block starts at line 19. After the existing `async-trait = "0.1"` line (line 35), append:

```toml
zip = { version = "2.2", default-features = false, features = ["deflate"] }
pulldown_cmark = { version = "0.12", default-features = false, features = ["html"] }
html_escape = "0.2"
```

- [ ] **Step 2: Consume them in the services crate**

Open `crates/services/Cargo.toml`. After the existing `zstd = "0.13"` line (line 53), append:

```toml
zip = { workspace = true }
pulldown_cmark = { workspace = true }
html_escape = { workspace = true }
```

- [ ] **Step 3: Verify the workspace still builds**

Run: `cargo check -p services`
Expected: compiles. New deps will show "unused" warnings — fine for now.

- [ ] **Step 4: Commit**

```bash
git add Cargo.toml crates/services/Cargo.toml
git commit -m "chore(deps): add zip, pulldown_cmark, html_escape for session export"
```

---

## Task 2: Create the session_export module skeleton

**Files:**
- Create: `crates/services/src/services/session_export.rs`
- Modify: `crates/services/src/services/mod.rs`

- [ ] **Step 1: Create the module with types only**

Create `crates/services/src/services/session_export.rs` with this content:

```rust
//! Build a downloadable zip export of a task attempt's CodingAgent conversation.
//!
//! Public surface:
//!   - `build_attempt_export`: DB + disk read, returns `AttemptExport`
//!   - `render_html`: pure, `AttemptExport` -> single combined HTML string
//!   - `build_zip_bytes`: pure, `AttemptExport` -> zip bytes
//!   - `export_filename`: pure, `AttemptExport` -> zip filename string
//!
//! See `docs/superpowers/specs/2026-05-28-task-attempt-session-export-design.md`.

use chrono::{DateTime, Utc};
use db::models::execution_process::ExecutionProcessStatus;
use executors::logs::NormalizedEntry;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ProcessExport {
    pub index: u32,
    pub execution_id: Uuid,
    pub executor_type: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub status: ExecutionProcessStatus,
    pub exit_code: Option<i64>,
    pub raw_lines: Vec<String>,
    pub raw_log_missing: bool,
    pub entries: Vec<NormalizedEntry>,
    pub normalize_status: NormalizeStatus,
}

#[derive(Debug, Clone)]
pub enum NormalizeStatus {
    Ok,
    Skipped { reason: String },
    PartialTimeout,
}

#[derive(Debug, Clone)]
pub struct AttemptExport {
    pub attempt_id: Uuid,
    pub branch: String,
    pub task_title: String,
    pub exported_at: DateTime<Utc>,
    pub processes: Vec<ProcessExport>,
}

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("attempt not found")]
    AttemptNotFound,
    #[error("no CodingAgent processes for attempt")]
    NoCodingAgentProcesses,
    #[error("export too large: {bytes} bytes")]
    TooLarge { bytes: usize },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
}

/// Max raw bytes across all processes before we refuse to build a zip in memory.
pub const MAX_EXPORT_RAW_BYTES: usize = 200 * 1024 * 1024;
```

- [ ] **Step 2: Register the module**

Open `crates/services/src/services/mod.rs`. After the existing `pub mod raw_log_store;` line (line 21), insert:

```rust
pub mod session_export;
```

Keep the file alphabetically sorted: `session_export` belongs between `raw_log_store` and `repo`.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles with unused-import warnings for the new types — fine.

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/session_export.rs crates/services/src/services/mod.rs
git commit -m "feat(services): scaffold session_export module with public types"
```

---

## Task 3: Branch sanitization helper (TDD)

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Write the failing test**

Append to `crates/services/src/services/session_export.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_branch_keeps_safe_chars() {
        assert_eq!(sanitize_branch("feature.x_1-2"), "feature.x_1-2");
    }

    #[test]
    fn sanitize_branch_replaces_slashes_and_unicode() {
        assert_eq!(sanitize_branch("user/foo/bar"), "user-foo-bar");
        assert_eq!(sanitize_branch("feat/中文"), "feat---");
    }

    #[test]
    fn sanitize_branch_trims_leading_trailing_dashes() {
        assert_eq!(sanitize_branch("/foo/"), "foo");
        assert_eq!(sanitize_branch("---abc---"), "abc");
    }

    #[test]
    fn sanitize_branch_empty_returns_empty_string() {
        assert_eq!(sanitize_branch(""), "");
        assert_eq!(sanitize_branch("///"), "");
    }
}
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cargo test -p services session_export::tests::sanitize_branch -- --nocapture`
Expected: compile error "cannot find function `sanitize_branch`".

- [ ] **Step 3: Implement `sanitize_branch`**

Insert this function in `session_export.rs` *above* the `#[cfg(test)]` block:

```rust
/// Reduce a branch name to chars safe in a zip filename.
/// Non-`[A-Za-z0-9._-]` chars become `-`. Leading/trailing `-` are trimmed.
/// Empty input or input that sanitizes to nothing returns `""`.
pub fn sanitize_branch(branch: &str) -> String {
    let cleaned: String = branch
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
        .collect();
    cleaned.trim_matches('-').to_string()
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cargo test -p services session_export::tests::sanitize_branch`
Expected: 4 tests pass.

- [ ] **Step 5: Add filename builder + test**

Append to the same `tests` mod:

```rust
#[test]
fn export_filename_uses_branch_when_present() {
    let export = sample_export("feature.x", Uuid::nil());
    let name = export_filename(&export);
    assert!(name.starts_with("attempt-feature.x-"));
    assert!(name.ends_with(".zip"));
}

#[test]
fn export_filename_falls_back_to_attempt_id_prefix_when_branch_blank() {
    let id = Uuid::parse_str("0123abcd-0000-0000-0000-000000000000").unwrap();
    let export = sample_export("//", id);
    let name = export_filename(&export);
    assert!(name.starts_with("attempt-0123abcd-"));
    assert!(name.ends_with(".zip"));
}

fn sample_export(branch: &str, attempt_id: Uuid) -> AttemptExport {
    AttemptExport {
        attempt_id,
        branch: branch.to_string(),
        task_title: "T".to_string(),
        exported_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
        processes: vec![],
    }
}
```

Insert `export_filename` in `session_export.rs` above the `#[cfg(test)]` block:

```rust
/// Build the zip filename for an export: `attempt-{branch-slug}-{YYYY-MM-DD-HHmm}.zip`.
/// If the branch is empty/all-special, fall back to `attempt-{first8(id)}`.
pub fn export_filename(export: &AttemptExport) -> String {
    let slug = {
        let s = sanitize_branch(&export.branch);
        if s.is_empty() {
            format!("attempt-{}", &export.attempt_id.to_string()[..8])
        } else {
            s
        }
    };
    let ts = export.exported_at.format("%Y-%m-%d-%H%M");
    format!("attempt-{slug}-{ts}.zip")
}
```

- [ ] **Step 6: Run the new tests**

Run: `cargo test -p services session_export::tests`
Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): add branch sanitizer and export filename builder"
```

---

## Task 4: Resolve executor + replay raw lines into NormalizedEntries (TDD)

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Write the failing test**

Append to the `tests` mod in `session_export.rs`:

```rust
#[tokio::test]
async fn replay_normalize_handles_claude_assistant_line() {
    use executors::executors::claude::ClaudeCode;
    use std::sync::Arc;

    let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]},"session_id":"s1"}"#;
    let raw_lines = vec![line.to_string()];

    let executor = Arc::new(ClaudeCode::default());
    let (entries, status) =
        replay_normalize(executor, raw_lines, std::env::temp_dir()).await;

    assert!(matches!(status, NormalizeStatus::Ok));
    assert!(!entries.is_empty(), "expected at least one normalized entry");
    assert!(
        matches!(
            entries[0].entry_type,
            executors::logs::NormalizedEntryType::AssistantMessage
        ),
        "first entry should be an AssistantMessage, got {:?}",
        entries[0].entry_type
    );
}
```

> If `ClaudeCode::default()` does not compile (e.g. the type requires construction parameters), substitute with whatever constructor exists in `crates/executors/src/executors/claude.rs`. The Claude executor's `normalize_logs` is the canonical replay target because the codebase already has unit tests asserting the same input → AssistantMessage shape.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cargo test -p services session_export::tests::replay_normalize_handles_claude_assistant_line`
Expected: compile error "cannot find function `replay_normalize`".

- [ ] **Step 3: Implement `replay_normalize`**

Insert these items in `session_export.rs` above the `#[cfg(test)]` block:

```rust
use std::{path::PathBuf, sync::Arc, time::Duration};

use executors::executors::StandardCodingAgentExecutor;
use utils::{log_msg::LogMsg, msg_store::MsgStore};

/// Cap on how long we will wait for a normalizer to settle.
const REPLAY_HARD_TIMEOUT: Duration = Duration::from_secs(30);
/// We declare normalization "done" after this many ms with no new JsonPatch.
const REPLAY_STABILIZE_WINDOW: Duration = Duration::from_millis(250);
/// Poll cadence for the stabilization check.
const REPLAY_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Re-derive NormalizedEntries from raw stdout lines by feeding them through
/// the executor's existing `normalize_logs` function.
///
/// Pre-loads all lines into a fresh `MsgStore`, kicks off the normalizer
/// (which spawns internal tasks), then waits for emitted JsonPatch count to
/// stop changing (250ms stable, 30s hard cap). Finally applies all patches
/// to reconstruct the entry array.
pub async fn replay_normalize(
    executor: Arc<dyn StandardCodingAgentExecutor + Send + Sync>,
    raw_lines: Vec<String>,
    worktree_path: PathBuf,
) -> (Vec<NormalizedEntry>, NormalizeStatus) {
    let store = Arc::new(MsgStore::new());

    for line in raw_lines {
        store.push_stdout(format!("{line}\n"));
    }
    store.push_finished();

    executor.normalize_logs(store.clone(), &worktree_path);

    let status = wait_for_patches_to_stabilize(&store).await;

    let mut value = serde_json::json!([]);
    for msg in store.get_history() {
        if let LogMsg::JsonPatch(p) = msg {
            let _ = json_patch::patch(&mut value, &p);
        }
    }
    let entries: Vec<NormalizedEntry> = serde_json::from_value(value).unwrap_or_default();
    (entries, status)
}

async fn wait_for_patches_to_stabilize(store: &MsgStore) -> NormalizeStatus {
    let start = std::time::Instant::now();
    let mut last_count = patch_count(store);
    let mut stable_for = Duration::ZERO;

    loop {
        tokio::time::sleep(REPLAY_POLL_INTERVAL).await;
        let current = patch_count(store);
        if current == last_count {
            stable_for += REPLAY_POLL_INTERVAL;
            if stable_for >= REPLAY_STABILIZE_WINDOW {
                return NormalizeStatus::Ok;
            }
        } else {
            stable_for = Duration::ZERO;
            last_count = current;
        }
        if start.elapsed() >= REPLAY_HARD_TIMEOUT {
            return NormalizeStatus::PartialTimeout;
        }
    }
}

fn patch_count(store: &MsgStore) -> usize {
    store
        .get_history()
        .iter()
        .filter(|m| matches!(m, LogMsg::JsonPatch(_)))
        .count()
}
```

If `StandardCodingAgentExecutor` requires explicit `+ Send + Sync` bounds and the compiler complains, follow the compiler's suggestion (the existing trait is `async_trait` and already `Send`-aware).

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cargo test -p services session_export::tests::replay_normalize_handles_claude_assistant_line -- --nocapture`
Expected: pass.

If it fails with "expected at least one normalized entry", the most likely cause is that ClaudeCode's `normalize_logs` does not flush its final patch before stabilization detects "no change" (race). Increase `REPLAY_STABILIZE_WINDOW` to 500 ms and re-run.

- [ ] **Step 5: Add the executor lookup helper + test**

Append to the same `tests` mod:

```rust
#[test]
fn resolve_executor_returns_some_for_known_initial_request() {
    use executors::actions::coding_agent_initial::CodingAgentInitialRequest;
    use executors::actions::{ExecutorAction, ExecutorActionType};
    use executors::profile::ExecutorProfileId;
    use executors::executors::BaseCodingAgent;

    let action = ExecutorAction::new(
        ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
            prompt: "p".to_string(),
            executor_profile_id: ExecutorProfileId {
                executor: BaseCodingAgent::ClaudeCode,
                variant: None,
            },
            working_dir: None,
        }),
        None,
    );
    let resolved = resolve_executor(&action);
    assert!(resolved.is_some(), "ClaudeCode should resolve to an agent");
    let (agent, base) = resolved.unwrap();
    assert_eq!(base, BaseCodingAgent::ClaudeCode);
    // Ensure the trait object is usable.
    let _: &dyn StandardCodingAgentExecutor = agent.as_ref();
}

#[test]
fn resolve_executor_returns_none_for_script_action() {
    use executors::actions::script::ScriptRequest;
    use executors::actions::{ExecutorAction, ExecutorActionType};

    let action = ExecutorAction::new(
        ExecutorActionType::ScriptRequest(ScriptRequest {
            script: "echo hi".to_string(),
            language: executors::actions::script::ScriptRequestLanguage::Bash,
            context: executors::actions::script::ScriptContext::SetupScript,
        }),
        None,
    );
    assert!(resolve_executor(&action).is_none());
}
```

> If `ScriptRequest`'s field names differ, inspect `crates/executors/src/actions/script.rs` and adjust. The test's *intent* is "non-coding-agent actions return None"; the exact construction depends on the script.rs API.

- [ ] **Step 6: Run the tests to confirm they fail**

Run: `cargo test -p services session_export::tests::resolve_executor`
Expected: compile error "cannot find function `resolve_executor`".

- [ ] **Step 7: Implement `resolve_executor`**

Insert above the `#[cfg(test)]` block:

```rust
use executors::actions::{ExecutorAction, ExecutorActionType};
use executors::executors::BaseCodingAgent;
use executors::profile::{ExecutorConfigs, ExecutorProfileId};

/// Given the `executor_action` payload of an ExecutionProcess, instantiate the
/// concrete `CodingAgent` so we can replay logs through it. Returns `None` if
/// the action isn't a coding agent (e.g. ScriptRequest) or the executor profile
/// is no longer registered.
pub fn resolve_executor(
    action: &ExecutorAction,
) -> Option<(
    Arc<dyn StandardCodingAgentExecutor + Send + Sync>,
    BaseCodingAgent,
)> {
    let profile_id: ExecutorProfileId = match action.typ() {
        ExecutorActionType::CodingAgentInitialRequest(req) => req.executor_profile_id.clone(),
        ExecutorActionType::CodingAgentFollowUpRequest(req) => req.executor_profile_id.clone(),
        _ => return None,
    };
    let base = profile_id.executor;
    let agent = ExecutorConfigs::get_cached().get_coding_agent(&profile_id)?;
    // `get_coding_agent` returns the concrete `CodingAgent` enum (Box-able trait object).
    Some((Arc::from(agent) as Arc<dyn StandardCodingAgentExecutor + Send + Sync>, base))
}
```

> If `get_coding_agent` returns `CodingAgent` by value, change `Arc::from(agent)` to `Arc::new(agent)`. Inspect `crates/executors/src/profile.rs` for the exact signature.

- [ ] **Step 8: Run the tests to confirm they pass**

Run: `cargo test -p services session_export::tests::resolve_executor`
Expected: 2 tests pass.

- [ ] **Step 9: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): re-derive NormalizedEntries via replay + executor resolver"
```

---

## Task 5: `build_attempt_export` — DB + disk read

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Implement the builder (no test yet; coverage comes from Task 11 integration test)**

Insert above the `#[cfg(test)]` block in `session_export.rs`:

```rust
use db::models::execution_process::{
    ExecutionProcess, ExecutionProcessRunReason,
};
use db::models::session::Session;
use db::models::task::Task;
use db::models::workspace::Workspace;
use sqlx::SqlitePool;

use crate::services::raw_log_store;

/// Walk DB + disk to build a complete `AttemptExport`.
/// Errors map directly to HTTP statuses in the route handler.
pub async fn build_attempt_export(
    pool: &SqlitePool,
    attempt_id: Uuid,
) -> Result<AttemptExport, ExportError> {
    let workspace = Workspace::find_by_id(pool, attempt_id)
        .await?
        .ok_or(ExportError::AttemptNotFound)?;

    let task = Task::find_by_id(pool, workspace.task_id)
        .await?
        .ok_or(ExportError::AttemptNotFound)?;

    // The "current" session is the most recently used; sessions are returned
    // already ordered that way by find_by_workspace_id.
    let sessions = Session::find_by_workspace_id(pool, workspace.id).await?;
    let session = sessions
        .into_iter()
        .next()
        .ok_or(ExportError::NoCodingAgentProcesses)?;

    let processes_all =
        ExecutionProcess::find_by_session_id(pool, session.id, false).await?;

    let mut processes: Vec<ProcessExport> = Vec::new();
    let mut total_raw_bytes: usize = 0;

    for (i, proc) in processes_all
        .into_iter()
        .filter(|p| matches!(p.run_reason, ExecutionProcessRunReason::CodingAgent))
        .enumerate()
    {
        let raw_opt = raw_log_store::read_log_lines(proc.id).await;
        let raw_lines = raw_opt.clone().unwrap_or_default();
        let raw_log_missing = raw_opt.is_none();

        total_raw_bytes = total_raw_bytes.saturating_add(
            raw_lines.iter().map(|s| s.len() + 1).sum::<usize>(),
        );
        if total_raw_bytes > MAX_EXPORT_RAW_BYTES {
            return Err(ExportError::TooLarge {
                bytes: total_raw_bytes,
            });
        }

        let (entries, status, executor_type) = match resolve_executor(&proc.executor_action.0.0)
        {
            Some((agent, base)) if !raw_lines.is_empty() => {
                let (entries, status) = replay_normalize(
                    agent,
                    raw_lines.clone(),
                    std::path::PathBuf::from("/"), // worktree path unused by most normalizers
                )
                .await;
                (entries, status, format!("{base:?}"))
            }
            Some((_, base)) => (
                Vec::new(),
                NormalizeStatus::Ok,
                format!("{base:?}"),
            ),
            None => (
                Vec::new(),
                NormalizeStatus::Skipped {
                    reason: "executor not resolvable".to_string(),
                },
                "unknown".to_string(),
            ),
        };

        processes.push(ProcessExport {
            index: (i as u32) + 1,
            execution_id: proc.id,
            executor_type,
            started_at: proc.started_at,
            completed_at: proc.completed_at,
            status: proc.status,
            exit_code: proc.exit_code,
            raw_lines,
            raw_log_missing,
            entries,
            normalize_status: status,
        });
    }

    if processes.is_empty() {
        return Err(ExportError::NoCodingAgentProcesses);
    }

    Ok(AttemptExport {
        attempt_id: workspace.id,
        branch: workspace.branch.clone(),
        task_title: task.title.clone(),
        exported_at: Utc::now(),
        processes,
    })
}
```

> **`executor_action.0.0` shape:** `ExecutionProcess.executor_action` is `sqlx::types::Json<ExecutorActionField>`. `ExecutorActionField` (in `crates/db/src/models/execution_process.rs`) wraps the `ExecutorAction`. If `.0.0` doesn't compile, read that file's definition of `ExecutorActionField` and unwrap one level — likely `executor_action.0.action` or similar.

> **`worktree_path` argument:** Each executor's `normalize_logs` takes a `worktree_path` parameter. Inspect `crates/executors/src/executors/claude.rs` line 600+ to confirm whether it actually uses the path during normalization. For Claude it's used only when computing relative paths for tool calls; an arbitrary path is acceptable when we don't have the live container. If the executor needs the actual worktree, fetch it via `Workspace::container_ref` and convert to `PathBuf`.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles. Fix any field-path mismatches the compiler reports (see notes above).

- [ ] **Step 3: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): implement build_attempt_export DB+disk reader"
```

---

## Task 6: HTML render — entry-level rendering (TDD)

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Write the failing tests**

Append to the `tests` mod:

```rust
use executors::logs::{NormalizedEntryType, NormalizedEntryError};

#[test]
fn render_entry_user_message_uses_user_class_and_escapes() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::UserMessage,
        content: "<script>alert(1)</script>".to_string(),
        metadata: None,
    };
    let html = render_entry(&e);
    assert!(html.contains("entry--user"), "got: {html}");
    assert!(!html.contains("<script>alert(1)</script>"), "must escape: {html}");
    assert!(html.contains("&lt;script&gt;"));
}

#[test]
fn render_entry_assistant_message_renders_markdown() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::AssistantMessage,
        content: "Here is **bold** text".to_string(),
        metadata: None,
    };
    let html = render_entry(&e);
    assert!(html.contains("entry--assistant"));
    assert!(html.contains("<strong>bold</strong>"), "markdown bold should render: {html}");
}

#[test]
fn render_entry_tool_use_wraps_in_details() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::ToolUse {
            tool_name: "Edit".to_string(),
            action_type: executors::logs::ActionType::Other {
                description: "edit src/main.rs".to_string(),
            },
            status: executors::logs::ToolStatus::Success,
        },
        content: "patch body".to_string(),
        metadata: None,
    };
    let html = render_entry(&e);
    assert!(html.contains("entry--tool"));
    assert!(html.contains("<details>"));
    assert!(html.contains("Edit"));
}

#[test]
fn render_entry_loading_returns_empty_string() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::Loading,
        content: "".to_string(),
        metadata: None,
    };
    assert_eq!(render_entry(&e), "");
}

#[test]
fn render_entry_next_action_returns_empty_string() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::NextAction {
            failed: false,
            execution_processes: 1,
            needs_setup: false,
        },
        content: "".to_string(),
        metadata: None,
    };
    assert_eq!(render_entry(&e), "");
}

#[test]
fn render_entry_error_uses_error_class() {
    let e = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::ErrorMessage {
            error_type: NormalizedEntryError::Other,
        },
        content: "boom".to_string(),
        metadata: None,
    };
    let html = render_entry(&e);
    assert!(html.contains("entry--error"));
    assert!(html.contains("boom"));
}
```

> If `ActionType::Other { description }` doesn't match the actual variant, check `crates/executors/src/logs/` for the `ActionType` enum and substitute any variant. The test only needs *some* `ActionType` value; the renderer behavior under test is the `<details>` wrap and the class name.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cargo test -p services session_export::tests::render_entry`
Expected: compile error "cannot find function `render_entry`".

- [ ] **Step 3: Implement `render_entry` + helpers**

Insert above the `#[cfg(test)]` block:

```rust
use executors::logs::{NormalizedEntryError, NormalizedEntryType};

/// Render a single NormalizedEntry to an HTML fragment.
/// Returns `""` for entry types we deliberately skip (Loading, NextAction,
/// TokenUsageInfo — Token info is aggregated into the process footer).
pub fn render_entry(entry: &NormalizedEntry) -> String {
    let timestamp = entry
        .timestamp
        .as_deref()
        .map(|t| format!(r#"<time class="ts">{}</time>"#, html_escape::encode_text(t)))
        .unwrap_or_default();

    match &entry.entry_type {
        NormalizedEntryType::UserMessage => render_message(
            "entry--user",
            "User",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::UserFeedback { denied_tool } => render_message(
            "entry--user",
            &format!("User · denied {}", html_escape::encode_text(denied_tool)),
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::AssistantMessage => render_message(
            "entry--assistant",
            "Assistant",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::SystemMessage => render_message(
            "entry--system",
            "System",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::Thinking => render_message(
            "entry--thinking",
            "Thinking",
            &timestamp,
            &markdown_to_html(&entry.content),
        ),
        NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            status,
        } => {
            let summary = format!(
                "{} · {:?}",
                html_escape::encode_text(tool_name),
                action_type
            );
            format!(
                r#"<article class="entry entry--tool" data-status="{:?}">
  <header><span class="role">🔧 {}</span>{}</header>
  <details><summary>{}</summary><pre><code>{}</code></pre></details>
</article>"#,
                status,
                html_escape::encode_text(tool_name),
                timestamp,
                summary,
                html_escape::encode_text(&entry.content),
            )
        }
        NormalizedEntryType::ErrorMessage { error_type } => {
            let label = match error_type {
                NormalizedEntryError::SetupRequired => "setup required",
                NormalizedEntryError::Other => "error",
            };
            format!(
                r#"<article class="entry entry--error">
  <header><span class="role">⚠ {}</span>{}</header>
  <pre>{}</pre>
</article>"#,
                label,
                timestamp,
                html_escape::encode_text(&entry.content),
            )
        }
        NormalizedEntryType::UserAnsweredQuestions { answers } => {
            let items: String = answers
                .iter()
                .map(|qa| {
                    format!(
                        "<dt>{}</dt><dd>{}</dd>",
                        html_escape::encode_text(&qa.question),
                        html_escape::encode_text(&qa.answer.join(", ")),
                    )
                })
                .collect();
            format!(
                r#"<article class="entry entry--user"><header><span class="role">User · answered</span>{}</header><dl class="qa">{}</dl></article>"#,
                timestamp, items,
            )
        }
        NormalizedEntryType::TaskDuration { .. }
        | NormalizedEntryType::TokenUsageInfo(_)
        | NormalizedEntryType::Loading
        | NormalizedEntryType::NextAction { .. } => String::new(),
    }
}

fn render_message(class: &str, role: &str, timestamp: &str, body_html: &str) -> String {
    format!(
        r#"<article class="entry {class}">
  <header><span class="role">{role}</span>{timestamp}</header>
  <div class="content">{body_html}</div>
</article>"#
    )
}

fn markdown_to_html(src: &str) -> String {
    use pulldown_cmark::{Options, Parser, html};
    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_FOOTNOTES);
    let parser = Parser::new_ext(src, opts);
    let mut out = String::with_capacity(src.len() + 64);
    html::push_html(&mut out, parser);
    out
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cargo test -p services session_export::tests::render_entry`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): render NormalizedEntry variants to escaped HTML fragments"
```

---

## Task 7: HTML render — full page assembly (TDD)

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Write the failing tests**

Append to the `tests` mod:

```rust
#[test]
fn render_html_empty_processes_returns_no_data_placeholder() {
    let export = sample_export("br", Uuid::nil());
    let html = render_html(&export);
    assert!(html.starts_with("<!DOCTYPE html>"));
    assert!(html.contains("No data"));
    assert!(html.contains("<style>"), "should inline CSS");
}

#[test]
fn render_html_includes_process_sections_and_meta() {
    let mut export = sample_export("br", Uuid::nil());
    export.processes.push(ProcessExport {
        index: 1,
        execution_id: Uuid::nil(),
        executor_type: "ClaudeCode".to_string(),
        started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
        completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_300, 0).unwrap()),
        status: ExecutionProcessStatus::Completed,
        exit_code: Some(0),
        raw_lines: vec!["dummy".to_string()],
        raw_log_missing: false,
        entries: vec![NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: "hi".to_string(),
            metadata: None,
        }],
        normalize_status: NormalizeStatus::Ok,
    });
    let html = render_html(&export);
    assert!(html.contains("ClaudeCode"));
    assert!(html.contains("Process 1"));
    assert!(html.contains("entry--assistant"));
}

#[test]
fn render_html_escapes_task_title_and_branch() {
    let mut export = sample_export("<evil>", Uuid::nil());
    export.task_title = "<img onerror=alert(1)>".to_string();
    let html = render_html(&export);
    assert!(!html.contains("<img onerror=alert(1)>"), "title must escape");
    assert!(!html.contains("<evil>"), "branch must escape");
    assert!(html.contains("&lt;img"));
}

#[test]
fn render_html_marks_in_progress_processes() {
    let mut export = sample_export("br", Uuid::nil());
    export.processes.push(ProcessExport {
        index: 1,
        execution_id: Uuid::nil(),
        executor_type: "ClaudeCode".to_string(),
        started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
        completed_at: None,
        status: ExecutionProcessStatus::Running,
        exit_code: None,
        raw_lines: vec![],
        raw_log_missing: false,
        entries: vec![],
        normalize_status: NormalizeStatus::Ok,
    });
    let html = render_html(&export);
    assert!(html.contains("(running)"));
}

#[test]
fn render_html_marks_missing_raw_log() {
    let mut export = sample_export("br", Uuid::nil());
    export.processes.push(ProcessExport {
        index: 1,
        execution_id: Uuid::nil(),
        executor_type: "ClaudeCode".to_string(),
        started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
        completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_100, 0).unwrap()),
        status: ExecutionProcessStatus::Completed,
        exit_code: Some(0),
        raw_lines: vec![],
        raw_log_missing: true,
        entries: vec![],
        normalize_status: NormalizeStatus::Ok,
    });
    let html = render_html(&export);
    assert!(html.contains("raw log unavailable"));
}
```

> If `ExecutionProcessStatus::Running` is named differently (e.g. `InProgress`), open `crates/db/src/models/execution_process.rs` and use the correct variant.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cargo test -p services session_export::tests::render_html`
Expected: compile error "cannot find function `render_html`".

- [ ] **Step 3: Implement `render_html` + small helpers**

Insert above the `#[cfg(test)]` block:

```rust
const PAGE_CSS: &str = r#"
:root { --bg:#fff; --fg:#1a1a1a; --muted:#666; --border:#e5e5e5;
        --accent-user:#2563eb; --accent-assistant:#059669;
        --accent-tool:#9333ea; --accent-system:#737373;
        --accent-thinking:#a16207; --accent-error:#dc2626; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0f172a; --fg:#e5e7eb; --muted:#94a3b8; --border:#1f2937; }
}
body { background:var(--bg); color:var(--fg); margin:0;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       line-height:1.55; }
main, .page-header, .page-footer { max-width:880px; margin:0 auto; padding:1rem; }
.page-header { border-bottom:1px solid var(--border); }
.meta { display:grid; grid-template-columns:max-content 1fr; gap:.25rem 1rem; font-size:.9em; color:var(--muted); }
.meta dt { font-weight:600; }
.process { margin:1.5rem 0; padding-top:.5rem; border-top:1px solid var(--border); }
.process-header { font-size:1.1rem; color:var(--muted); font-weight:500; }
.process-footer { font-size:.85em; color:var(--muted); margin-top:.5rem; }
.entry { border-left:3px solid var(--border); padding:.5rem .75rem; margin:.5rem 0; }
.entry header { font-size:.85em; color:var(--muted); margin-bottom:.25rem; display:flex; gap:.5rem; }
.entry .role { font-weight:600; color:var(--fg); }
.entry--user { border-left-color:var(--accent-user); }
.entry--assistant { border-left-color:var(--accent-assistant); }
.entry--tool { border-left-color:var(--accent-tool); }
.entry--system { border-left-color:var(--accent-system); }
.entry--thinking { border-left-color:var(--accent-thinking); font-style:italic; }
.entry--error { border-left-color:var(--accent-error); }
.entry .content pre, .entry pre { background:rgba(127,127,127,.08); padding:.5rem; overflow-x:auto;
       font-family:ui-monospace,"SF Mono",Menlo,monospace; font-size:.85em; }
.entry details summary { cursor:pointer; }
.no-data { color:var(--muted); font-style:italic; padding:2rem 0; text-align:center; }
.warn { background:rgba(220,38,38,.1); border-left:3px solid var(--accent-error); padding:.5rem; margin:.5rem 0; }
"#;

/// Render the whole AttemptExport into a single self-contained HTML document.
pub fn render_html(export: &AttemptExport) -> String {
    let mut s = String::with_capacity(8192);
    s.push_str("<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">");
    s.push_str(&format!(
        "<title>Session · {} · {}</title>",
        html_escape::encode_text(&export.task_title),
        html_escape::encode_text(&export.branch)
    ));
    s.push_str(&format!("<style>{PAGE_CSS}</style></head><body>"));

    s.push_str("<header class=\"page-header\">");
    s.push_str(&format!(
        "<h1>{}</h1>",
        html_escape::encode_text(&export.task_title)
    ));
    s.push_str(&format!(
        r#"<dl class="meta"><dt>Attempt</dt><dd>{}</dd><dt>Branch</dt><dd>{}</dd><dt>Processes</dt><dd>{}</dd><dt>Exported</dt><dd>{}</dd></dl>"#,
        export.attempt_id,
        html_escape::encode_text(&export.branch),
        export.processes.len(),
        export.exported_at.format("%Y-%m-%d %H:%M UTC"),
    ));
    s.push_str("</header><main>");

    if export.processes.is_empty() {
        s.push_str(r#"<div class="no-data">No data</div>"#);
    } else {
        for p in &export.processes {
            render_process(&mut s, p);
        }
    }

    s.push_str("</main><footer class=\"page-footer\">Exported by vibe-kanban</footer></body></html>");
    s
}

fn render_process(out: &mut String, p: &ProcessExport) {
    let header_suffix = if matches!(p.status, ExecutionProcessStatus::Running) {
        " (running)".to_string()
    } else {
        let dur = p
            .completed_at
            .map(|c| (c - p.started_at).num_seconds())
            .unwrap_or(0);
        let exit = p
            .exit_code
            .map(|e| format!(", exit {e}"))
            .unwrap_or_default();
        format!(" ({}s{})", dur, exit)
    };

    out.push_str(&format!(
        r#"<section class="process" id="p{0}"><h2 class="process-header">Process {0} · <span class="executor">{1}</span> · <time>{2}</time>{3}</h2>"#,
        p.index,
        html_escape::encode_text(&p.executor_type),
        p.started_at.format("%Y-%m-%d %H:%M:%S"),
        header_suffix,
    ));

    if let NormalizeStatus::PartialTimeout = p.normalize_status {
        out.push_str(r#"<div class="warn">[partial normalize: timeout]</div>"#);
    }
    if let NormalizeStatus::Skipped { reason } = &p.normalize_status {
        out.push_str(&format!(
            r#"<div class="warn">[normalize skipped: {}]</div>"#,
            html_escape::encode_text(reason)
        ));
    }
    if p.raw_log_missing {
        out.push_str(r#"<div class="warn">[raw log unavailable]</div>"#);
    }

    for entry in &p.entries {
        let fragment = render_entry(entry);
        if !fragment.is_empty() {
            out.push_str(&fragment);
        }
    }

    // Footer with token info if present in any entry.
    let token_summary = p.entries.iter().find_map(|e| match &e.entry_type {
        NormalizedEntryType::TokenUsageInfo(info) => Some(format!(
            "in {} · out {} · total {}",
            info.input_tokens.unwrap_or(0),
            info.output_tokens.unwrap_or(0),
            info.total_tokens,
        )),
        _ => None,
    });
    if let Some(t) = token_summary {
        out.push_str(&format!(r#"<footer class="process-footer">Tokens: {t}</footer>"#));
    }

    out.push_str("</section>");
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cargo test -p services session_export::tests::render_html`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): assemble combined attempt HTML page with inline CSS"
```

---

## Task 8: ZIP packing (`build_zip_bytes`) — TDD

**Files:**
- Modify: `crates/services/src/services/session_export.rs`

- [ ] **Step 1: Write the failing test**

Append to the `tests` mod:

```rust
#[test]
fn build_zip_bytes_layout() {
    let mut export = sample_export("br", Uuid::nil());
    export.processes.push(ProcessExport {
        index: 1,
        execution_id: Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap(),
        executor_type: "ClaudeCode".to_string(),
        started_at: DateTime::<Utc>::from_timestamp(1_700_000_000, 0).unwrap(),
        completed_at: Some(DateTime::<Utc>::from_timestamp(1_700_000_100, 0).unwrap()),
        status: ExecutionProcessStatus::Completed,
        exit_code: Some(0),
        raw_lines: vec!["line-a".to_string(), "line-b".to_string()],
        raw_log_missing: false,
        entries: vec![],
        normalize_status: NormalizeStatus::Ok,
    });
    export.processes.push(ProcessExport {
        index: 2,
        execution_id: Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap(),
        executor_type: "ClaudeCode".to_string(),
        started_at: DateTime::<Utc>::from_timestamp(1_700_000_200, 0).unwrap(),
        completed_at: None,
        status: ExecutionProcessStatus::Completed,
        exit_code: None,
        raw_lines: vec![],
        raw_log_missing: true,
        entries: vec![],
        normalize_status: NormalizeStatus::Ok,
    });

    let bytes = build_zip_bytes(&export).expect("zip build should succeed");
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("zip should be readable");

    let mut names: Vec<String> = (0..archive.len())
        .map(|i| archive.by_index(i).unwrap().name().to_string())
        .collect();
    names.sort();
    assert!(names.contains(&"conversation.html".to_string()), "names={:?}", names);
    assert!(names.contains(&"README.txt".to_string()), "names={:?}", names);
    // Process 1 has raw_lines → should produce a raw file. Process 2 is missing → omitted.
    let raw_files: Vec<&String> = names.iter().filter(|n| n.starts_with("raw/")).collect();
    assert_eq!(raw_files.len(), 1, "got: {:?}", raw_files);
    assert!(raw_files[0].starts_with("raw/01-"));
    assert!(raw_files[0].ends_with(".jsonl"));
}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cargo test -p services session_export::tests::build_zip_bytes_layout`
Expected: compile error "cannot find function `build_zip_bytes`".

- [ ] **Step 3: Implement `build_zip_bytes`**

Insert above the `#[cfg(test)]` block:

```rust
use std::io::{Cursor, Write};

use zip::{ZipWriter, write::SimpleFileOptions};

/// Pack an `AttemptExport` into an in-memory zip.
pub fn build_zip_bytes(export: &AttemptExport) -> Result<Vec<u8>, ExportError> {
    let buf = Cursor::new(Vec::with_capacity(64 * 1024));
    let mut zip = ZipWriter::new(buf);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let html = render_html(export);
    zip.start_file("conversation.html", opts)?;
    zip.write_all(html.as_bytes())?;

    zip.start_file("README.txt", opts)?;
    zip.write_all(build_readme(export).as_bytes())?;

    for p in &export.processes {
        if p.raw_lines.is_empty() && p.raw_log_missing {
            continue;
        }
        let name = format!(
            "raw/{:02}-{}.jsonl",
            p.index,
            &p.execution_id.to_string()[..8]
        );
        zip.start_file(&name, opts)?;
        for line in &p.raw_lines {
            zip.write_all(line.as_bytes())?;
            zip.write_all(b"\n")?;
        }
    }

    let cursor = zip.finish()?;
    Ok(cursor.into_inner())
}

fn build_readme(export: &AttemptExport) -> String {
    let mut s = String::new();
    s.push_str("vibe-kanban session export\n");
    s.push_str(&format!("Attempt:  {}\n", export.attempt_id));
    s.push_str(&format!("Branch:   {}\n", export.branch));
    s.push_str(&format!("Task:     {}\n", export.task_title));
    s.push_str(&format!(
        "Exported: {}\n",
        export.exported_at.format("%Y-%m-%d %H:%M:%S UTC")
    ));
    s.push_str(&format!("Processes: {}\n\n", export.processes.len()));
    s.push_str("Files:\n");
    s.push_str("  conversation.html  - combined rendered timeline (open in any browser)\n");
    s.push_str("  raw/NN-XXXXXXXX.jsonl - raw stdout per CodingAgent process, in chronological order\n");
    s
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cargo test -p services session_export::tests::build_zip_bytes_layout`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/session_export.rs
git commit -m "feat(services): pack attempt export into in-memory zip"
```

---

## Task 9: Server route + error mapping

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs`

- [ ] **Step 1: Add the handler**

Open `crates/server/src/routes/task_attempts.rs`. Add at the top of the file (near the other route handler definitions; an alphabetical neighbour is `open_task_attempt_in_editor` at line 912):

```rust
use axum::{
    body::Body,
    http::{header, StatusCode},
    response::Response,
};
use services::services::session_export::{
    build_attempt_export, build_zip_bytes, export_filename, ExportError,
};

#[axum::debug_handler]
pub async fn export_session_zip(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<Response<Body>, ApiError> {
    let pool = &deployment.db().pool;

    let export = match build_attempt_export(pool, workspace.id).await {
        Ok(e) => e,
        Err(ExportError::AttemptNotFound) => {
            return Ok(json_error(StatusCode::NOT_FOUND, "attempt_not_found"))
        }
        Err(ExportError::NoCodingAgentProcesses) => {
            return Ok(json_error(
                StatusCode::NOT_FOUND,
                "no_coding_agent_processes",
            ))
        }
        Err(ExportError::TooLarge { bytes }) => {
            return Ok(json_error_with(
                StatusCode::PAYLOAD_TOO_LARGE,
                serde_json::json!({"error":"export_too_large","bytes":bytes}),
            ))
        }
        Err(ExportError::Database(e)) => return Err(ApiError::from(e)),
        Err(ExportError::Io(e)) => {
            tracing::error!("session export io error: {e}");
            return Ok(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "io_error",
            ));
        }
        Err(ExportError::Zip(e)) => {
            tracing::error!("session export zip error: {e}");
            return Ok(json_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "zip_error",
            ));
        }
    };

    let filename = export_filename(&export);
    let bytes = build_zip_bytes(&export).map_err(|e| match e {
        ExportError::Database(db) => ApiError::from(db),
        other => {
            tracing::error!("session export pack error: {other}");
            // Fallback: surface as generic 500 via ApiError
            ApiError::from(sqlx::Error::Protocol(other.to_string()))
        }
    })?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/zip")
        .header(
            header::CONTENT_DISPOSITION,
            format!(r#"attachment; filename="{filename}""#),
        )
        .body(Body::from(bytes))
        .map_err(|e| {
            tracing::error!("failed to build export response: {e}");
            ApiError::from(sqlx::Error::Protocol("response_build_failed".to_string()))
        })
}

fn json_error(status: StatusCode, code: &str) -> Response<Body> {
    json_error_with(status, serde_json::json!({"error": code}))
}

fn json_error_with(status: StatusCode, body: serde_json::Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(body.to_string()))
        .expect("static response should always build")
}
```

> If `ApiError` already has a constructor for these classes (e.g. `ApiError::not_found(code)` or `ApiError::status(StatusCode, &str)`), prefer that idiomatic path over fabricating an `sqlx::Error::Protocol`. Inspect `crates/server/src/error.rs` (or whichever file defines `ApiError`) and use the cleanest match.

- [ ] **Step 2: Register the route**

In the same file, locate `task_attempt_id_router` at line 2285. After the `.route("/mark-seen", put(mark_seen))` line (around 2318), insert:

```rust
            .route("/export-session", get(export_session_zip))
```

- [ ] **Step 3: Build the server**

Run: `cargo check -p server`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs
git commit -m "feat(server): add GET /api/task-attempts/{id}/export-session route"
```

---

## Task 10: End-to-end integration test

**Files:**
- Create: `crates/server/tests/session_export.rs` (or extend an existing route-test file if one exists)

- [ ] **Step 1: Check existing route-test patterns**

Run: `ls crates/server/tests/ 2>/dev/null && grep -rln 'TestApp\|spawn_app\|api_router\b' crates/server/tests/ crates/server/src/ 2>/dev/null | head -5`

If a `TestApp` / `spawn_app` harness exists, reuse it. If not, follow the pattern of constructing a `DeploymentImpl` directly in-process and calling the route via `tower::ServiceExt::oneshot`. The example below assumes no harness.

- [ ] **Step 2: Write the test**

Create `crates/server/tests/session_export.rs`:

```rust
//! End-to-end test for GET /api/task-attempts/{id}/export-session.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use std::io::Read;
use tower::ServiceExt;

#[tokio::test]
async fn export_session_404_for_unknown_attempt() {
    let app = test_support::build_app().await;
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/task-attempts/00000000-0000-0000-0000-000000000000/export-session")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn export_session_zips_two_processes_happy_path() {
    let (app, fixture) = test_support::build_app_with_attempt(2).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri(&format!(
                    "/api/task-attempts/{}/export-session",
                    fixture.attempt_id
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("content-type").map(|v| v.to_str().unwrap()),
        Some("application/zip")
    );
    let disp = response
        .headers()
        .get("content-disposition")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(disp.starts_with("attachment; filename="), "{disp}");

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes.to_vec())).unwrap();

    let mut names: Vec<String> =
        (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().to_string()).collect();
    names.sort();
    assert!(names.contains(&"conversation.html".to_string()));
    assert!(names.contains(&"README.txt".to_string()));
    assert!(names.iter().any(|n| n.starts_with("raw/01-")));
    assert!(names.iter().any(|n| n.starts_with("raw/02-")));

    let mut html = String::new();
    archive.by_name("conversation.html").unwrap().read_to_string(&mut html).unwrap();
    assert!(html.contains("Process 1"));
    assert!(html.contains("Process 2"));
}

mod test_support {
    //! Stub. Replace with the project's actual test harness or wire up a
    //! TempDir-based DeploymentImpl + write synthetic raw .jsonl files into
    //! `asset_dir()/logs/{execution_id}.jsonl`.
    //!
    //! See neighbour tests in `crates/server/tests/` (if any) for the
    //! established pattern.
    use axum::Router;

    pub struct AttemptFixture {
        pub attempt_id: uuid::Uuid,
    }

    pub async fn build_app() -> Router {
        unimplemented!("wire up DeploymentImpl with an in-memory DB and call routes::router(&deployment)")
    }

    pub async fn build_app_with_attempt(_n_processes: usize) -> (Router, AttemptFixture) {
        unimplemented!("set up: temp asset_dir, in-memory DB, Workspace + Session + N CodingAgent ExecutionProcess rows, write {execution_id}.jsonl files")
    }
}
```

- [ ] **Step 3: Implement `test_support` against the actual harness**

Inspect `crates/server/src/` for the existing app factory (look for `pub fn build_app`, `pub fn api_router`, or the entry point in `crates/server/src/bin/`). Copy that wiring into `test_support`. If no harness exists, the simplest approach is:

1. Create a `tempfile::TempDir`, point `asset_dir()` at it (or its env-override equivalent — check `crates/utils/src/assets.rs`).
2. Construct a fresh `DeploymentImpl` (look at how `crates/server/src/main.rs` or `crates/local-deployment/src/lib.rs` builds one for tests).
3. Insert a `Workspace`, `Session`, and `n` `ExecutionProcess` rows (run_reason = CodingAgent, with valid `executor_action` JSON for ClaudeCode).
4. For each process id, write `<tempdir>/logs/{id}.jsonl` containing one valid Claude JSON line (e.g. `{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}`).
5. Build the router via `routes::router(&deployment)` (or whatever the equivalent is) and return it.

- [ ] **Step 4: Run the integration test**

Run: `cargo test -p server --test session_export -- --nocapture`
Expected: both tests pass.

If the harness genuinely doesn't exist and step 3 is non-trivial, fall back to a smaller test that calls `build_attempt_export` + `build_zip_bytes` directly without the axum layer, asserting the same zip contents. Document this in the task's commit message.

- [ ] **Step 5: Commit**

```bash
git add crates/server/tests/session_export.rs
git commit -m "test(server): end-to-end test for /export-session route"
```

---

## Task 11: i18n keys for all locales

**Files:**
- Modify: `frontend/src/i18n/locales/{en,es,fr,ja,ko,zh-Hans,zh-Hant}/tasks.json`

- [ ] **Step 1: Add the `exportSession` key in each locale**

In every file `frontend/src/i18n/locales/<locale>/tasks.json`, find the `"actionsMenu"` object (in `en` it starts at line 504) and add a `"exportSession"` entry **immediately after** the existing `"copyRunCommand"` line (preserving JSON validity — add the comma to the now-non-trailing line).

Strings to use:

| Locale | Key | Value |
|---|---|---|
| en | `exportSession` | `"Export session"` |
| es | `exportSession` | `"Exportar sesión"` |
| fr | `exportSession` | `"Exporter la session"` |
| ja | `exportSession` | `"セッションをエクスポート"` |
| ko | `exportSession` | `"세션 내보내기"` |
| zh-Hans | `exportSession` | `"导出会话"` |
| zh-Hant | `exportSession` | `"匯出對話"` |

Example for `en/tasks.json`:

```json
    "copyRunCommand": "Copy Run Command",
    "exportSession": "Export session",
    "commandCopied": "Copied!",
```

- [ ] **Step 2: Verify JSON validity**

Run: `for f in frontend/src/i18n/locales/*/tasks.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "OK $f" || echo "FAIL $f"; done`
Expected: every file prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/*/tasks.json
git commit -m "i18n(tasks): add actionsMenu.exportSession across locales"
```

---

## Task 12: Frontend dropdown integration

**Files:**
- Modify: `frontend/src/components/ui/actions-dropdown.tsx`

- [ ] **Step 1: Add the imports + processes hook**

Open `frontend/src/components/ui/actions-dropdown.tsx`. After the existing `import { useApi } from '@/hooks/useApi';` (line 3), add:

```tsx
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
```

If that import path differs (verify via `grep -rn "export.*useExecutionProcesses" frontend/src/hooks/`), adjust.

- [ ] **Step 2: Compute `hasCodingAgentProcess`**

Inside `ActionsDropdown`, immediately after the existing `const hasTaskActions = Boolean(task);` line (around line 41), add:

```tsx
  const sessionId = attempt?.session?.id;
  const { executionProcesses } = useExecutionProcesses(sessionId ?? '', {
    showSoftDeleted: false,
  });
  const hasCodingAgentProcess = Boolean(
    sessionId &&
      executionProcesses?.some((p) => p.run_reason === 'codingagent')
  );
```

> The `run_reason` enum in the generated `shared/types.ts` may use a different casing (e.g. `'CodingAgent'`). Confirm via `grep -n 'codingagent\|CodingAgent' shared/types.ts | head -5` and use whichever literal the type expects.

- [ ] **Step 3: Add the handler**

After the existing `handleCopyRunCommand` (ends around line 151), insert:

```tsx
  const handleExportSession = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!attempt?.id) return;
    try {
      const res = await fetch(`/api/task-attempts/${attempt.id}/export-session`);
      if (!res.ok) {
        let msg = 'Export failed';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        console.warn('export-session failed', res.status, msg);
        alert(`Export failed: ${msg}`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `attempt-${attempt.id}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Failed to export session:', err);
      alert('Export failed');
    }
  };
```

- [ ] **Step 4: Add the menu item**

Find the existing **Copy Run Command** item — in the current file it's at lines 210–214:

```tsx
              <DropdownMenuItem onClick={handleCopyRunCommand}>
                {commandCopied
                  ? t('actionsMenu.commandCopied')
                  : t('actionsMenu.copyRunCommand')}
              </DropdownMenuItem>
```

**Immediately after** that closing `</DropdownMenuItem>` (and before the `<DropdownMenuSeparator />`), insert:

```tsx
              <DropdownMenuItem
                disabled={!attempt?.id || !hasCodingAgentProcess}
                onClick={handleExportSession}
              >
                {t('actionsMenu.exportSession')}
              </DropdownMenuItem>
```

- [ ] **Step 5: Type-check the frontend**

Run: `pnpm run check`
Expected: passes with no new errors.

If you get a type error about `run_reason` literal, switch the comparison to the exact value the generated type expects.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/actions-dropdown.tsx
git commit -m "feat(frontend): add Export Session item to attempt dropdown"
```

---

## Task 13: Final verification — lint, type-check, manual smoke

**Files:** (no edits unless lint surfaces issues)

- [ ] **Step 1: Backend tests**

Run: `cargo test -p services session_export && cargo test -p server --test session_export`
Expected: all green.

- [ ] **Step 2: Workspace type-check**

Run: `cargo check --workspace`
Expected: compiles clean.

- [ ] **Step 3: Frontend lint + check**

Run: `pnpm run check && pnpm run lint`
Expected: both green.

- [ ] **Step 4: Generate-types parity check**

Run: `pnpm run generate-types:check`
Expected: no diff. (We did not introduce any new ts-rs-exported types; this should pass.)

- [ ] **Step 5: Manual smoke**

In a separate terminal:

```bash
pnpm run dev
```

Then in the app:
1. Open a task that has at least one completed agent attempt.
2. Open the attempt's actions dropdown (the `⋯` button).
3. Confirm **Export session** appears between **Copy Run Command** and the separator and is enabled.
4. Click it. A `attempt-…zip` should download.
5. Unzip and double-click `conversation.html`. The page should open in your default browser and show one section per process with rendered messages.
6. Verify `raw/01-XXXXXXXX.jsonl` is present and contains the original executor stdout.

Also test the fresh-attempt path:
7. Create a brand-new attempt; do NOT start the agent.
8. Open the dropdown. **Export session** should be **disabled** (or, if the processes hook hasn't fetched yet, clicking should produce a 404 with a non-fatal alert).

- [ ] **Step 6: (If smoke surfaces an issue) Fix + recommit**

Address each issue with the smallest possible change, run the relevant tests, and commit.

- [ ] **Step 7: Final consistency check**

Run: `git log --oneline main..HEAD`
Expected: a tidy series of commits, each touching a coherent subset of files. No commit should mix backend + frontend changes; the i18n / dropdown commits are the only frontend commits.

---

## Self-review notes

**Spec coverage:**
- Spec §1 dropdown integration → Task 12
- Spec §1 zip layout (filename, raw/ dir, README) → Tasks 3 (filename), 8 (layout + README)
- Spec §1 HTML structure + NormalizedEntryType mapping → Tasks 6 (entries), 7 (page)
- Spec §3 endpoint + error codes → Task 9
- Spec §4.1 replay mechanism → Task 4
- Spec §4.2 executor lookup → Task 4
- Spec §4.3 200 MB cap → Task 5 (`MAX_EXPORT_RAW_BYTES` enforced inside `build_attempt_export`)
- Spec §4.4 zip writer (in-memory `ZipWriter<Cursor<Vec<u8>>>`) → Task 8
- Spec §4.5 filename sanitization → Task 3
- Spec §5 edge cases:
  - attempt not found → Task 9 (404 mapping)
  - 0 CodingAgent processes → Task 9 (404 mapping); Task 12 (frontend disables item)
  - in_progress process → Task 7 (`(running)` marker)
  - missing raw log → Tasks 5 + 7 + 8 (marker in HTML, omit from raw/)
  - executor not resolvable → Tasks 5 + 7 (Skipped status + warn banner)
  - dropped processes → Task 5 (`find_by_session_id(.., false)`)
  - branch sanitization → Task 3
  - 200 MB cap → Task 5 (413 surfaced in Task 9)
  - replay 30s timeout → Task 4
- Spec §6 tests:
  - render_html_empty → Task 7
  - render_entry table-driven → Task 6
  - HTML escapes → Tasks 6 + 7
  - zip layout → Task 8
  - replay_normalize_claude_fixture → Task 4
  - sanitize_branch edge cases → Task 3
  - endpoint happy path → Task 10
  - endpoint 404 → Task 10
- Spec §7 file inventory → matches the task File Structure table above
- Spec §8 dependencies → Task 1

**Type consistency check:**
- `AttemptExport`, `ProcessExport`, `ExportError`, `NormalizeStatus`: defined in Task 2, used identically thereafter.
- `build_attempt_export`, `build_zip_bytes`, `render_html`, `render_entry`, `export_filename`, `sanitize_branch`, `replay_normalize`, `resolve_executor`: each has a single signature introduced in the task that defines it and reused unchanged downstream.

**Known soft spots (engineer should expect to debug):**
- `executor_action.0.0` path in Task 5 is a best guess at the unwrap depth of `sqlx::types::Json<ExecutorActionField>`. If incorrect, the compiler error will point straight at the right path.
- `ExecutorConfigs::get_cached().get_coding_agent(&profile_id)` in Task 4 is the documented pattern from `crates/executors/src/actions/coding_agent_initial.rs:64`. The return type (`Box<dyn ...>` vs concrete `CodingAgent`) determines whether you write `Arc::from(agent)` or `Arc::new(agent)`.
- The integration test (Task 10) leaves `test_support` as an explicit unimplemented stub; the engineer needs to find or build the test harness. A fallback test that skips axum is documented.
