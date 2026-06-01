# Tool Call Duration Stats — Design

**Status:** Design approved by user during brainstorming, ready for implementation plan.
**Date:** 2026-06-01
**Branch context:** `vb/1a51-stats`

## Goal

Add a per-task-attempt aggregate of tool-call timing, surfaced as a collapsible card embedded in the conversation log alongside the existing `TokenUsageInfo` and `TaskDuration` cards. The card shows, per tool: call count, status breakdown (success / failed / denied / timed_out), total time, average, and max — across **all** executors (Claude, Codex, Cursor, Droid, opencode, mimo_code, ACP).

A single uniform duration is recorded per call: `completed_at - started_at` (wall time, including any approval-pending wait). When a call genuinely passed through `PendingApproval`, the awaiting-approval portion is recorded separately so the table can footnote it for that tool. Tools that never enter approval carry no approval data — nothing artificial is invented.

## Non-goals (v1)

- Cross-attempt or project-level dashboards. (User selected attempt-level aggregation only; global dashboards deferred.)
- Inline per-call duration badges next to individual ToolUse rows. (Data is captured for it, but rendering deferred to a follow-up PR.)
- Including the stats card in the session-export markdown bundle. (Export currently passes through unknown variants; we accept that.)
- Per-tool warning thresholds or color-coding for slow tools.
- Any changes to how individual executors interpret raw streaming output. The new wrapper is purely additive on top of patches the executors already publish.
- A frontend toggle to switch between "wall time" and "execution time" views. We record both kinds of data points where they exist, but the table presents a single uniform Total column with a footnote when relevant.

## Decisions captured during brainstorming

| Question | Answer |
|---|---|
| Aggregation granularity | Task-level: per-attempt summary (not per-call inline; not cross-attempt). |
| Where to surface | Collapsible card embedded in the conversation, like `TokenUsageInfo` / `TaskDuration`. |
| Metrics | Per-tool count + total + avg + max, plus success/failed/denied/timed_out breakdown, plus total tool seconds vs `TaskDuration` ratio. |
| Executor coverage | All executors implementing `StandardCodingAgentExecutor` (~31 impls in the codebase as of writing). |
| Approval-wait handling | Record `approved_at` only when the call genuinely passed through `PendingApproval`. Tools without approval keep `approved_at = None` — the design does not invent placeholder values. |
| Where to inject timing | At the orchestration layer that constructs MsgStore and calls into executors, **not** inside each executor's normalizer. |

## Architecture overview

```
┌──────────────────┐                 ┌──────────────────────┐
│  Executor        │  push_patch     │  ConversationMsgStore│
│  normalize_logs  │ ─────────────►  │  (wrapper, NEW)      │
│  (UNCHANGED)     │                 │                      │
└──────────────────┘                 │  • inspect patch     │
                                     │  • if ToolUse:       │
                                     │      stamp timing    │
                                     │  • forward to inner  │
                                     │                      │
                                     └──────────┬───────────┘
                                                │ push_patch
                                                ▼
                                     ┌──────────────────────┐
                                     │  Arc<MsgStore>       │
                                     │  (UNCHANGED)         │
                                     └──────────┬───────────┘
                                                │ broadcast
                            ┌───────────────────┼────────────────────┐
                            ▼                                        ▼
                  ┌────────────────────┐                    ┌─────────────────┐
                  │  DB persist        │                    │  SSE → frontend │
                  │  (entry_json with  │                    │                 │
                  │   timing fields)   │                    └────────┬────────┘
                  └────────────────────┘                             │
                                                                     ▼
                                                    ┌────────────────────────────┐
                                                    │  aggregateToolUsageStats   │
                                                    │  + toolUsageStatsPatch     │
                                                    │  → ToolUsageStatsCard      │
                                                    │  (frontend-synthesized,    │
                                                    │   mirrors TaskDuration     │
                                                    │   pattern)                 │
                                                    └────────────────────────────┘
```

The capture point is a thin wrapper over `Arc<MsgStore>`. Each call to `push_patch` passes through the wrapper, which detects ToolUse-bearing patches via the existing `extract_normalized_entry_from_patch` helper, stamps the appropriate timestamp, and forwards a re-serialized patch to the underlying `MsgStore`. Non-conversation traffic (`push_stdout`, `push_stderr`, `push_finished`, …) is forwarded unchanged.

The aggregate card is synthesized by the frontend, exactly mirroring how `TaskDuration` is constructed today (`frontend/src/hooks/useConversationHistory/constants.ts:49`, injected at `useConversationHistoryOld.ts:416`). No new REST endpoint, no new DB table, no schema migration.

## §1 — Data model

### 1.1 Extended `ToolUse` variant

`crates/executors/src/logs/mod.rs` — extend the existing `NormalizedEntryType::ToolUse` variant:

```rust
ToolUse {
    tool_name: String,
    action_type: ActionType,
    status: ToolStatus,
    /// Wall-clock instant the wrapper first observed this entry index
    /// carrying a ToolUse value.
    #[serde(skip_serializing_if = "Option::is_none")]
    started_at: Option<DateTime<Utc>>,
    /// Wall-clock instant the wrapper observed `status` transitioning
    /// out of `PendingApproval`. Stays `None` for tools that never
    /// entered `PendingApproval` (the common case for WebSearch /
    /// MCP / Read / Grep / etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    approved_at: Option<DateTime<Utc>>,
    /// Wall-clock instant the wrapper observed `status` becoming
    /// terminal (Success / Failed / Denied / TimedOut).
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<DateTime<Utc>>,
}
```

`#[serde(skip_serializing_if = "Option::is_none")]` keeps existing entry_json compact when timing data is unavailable (legacy/replayed data, or non-approval tools for `approved_at`).

### 1.2 Frontend-synthesized aggregate variant

Same file, new variant on `NormalizedEntryType`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolUsageStats {
    pub per_tool: Vec<ToolStat>,
    pub total_calls: u32,
    pub total_seconds: f64,
    pub task_duration_seconds: Option<f64>, // proportion is hidden when None
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolStat {
    pub tool_name: String,
    pub count: u32,
    pub success: u32,
    pub failed: u32,
    pub denied: u32,
    pub timed_out: u32,
    pub in_progress: u32,                  // started_at present, completed_at absent
    pub total_seconds: f64,
    pub avg_seconds: f64,
    pub max_seconds: f64,
    /// Sum of `(approved_at - started_at)` over the calls that passed
    /// through PendingApproval. Always 0 for tools that never required
    /// approval — front-end uses this to decide whether to render a
    /// per-tool footnote.
    pub awaiting_approval_seconds: f64,
    pub approved_call_count: u32,
}
```

Like `TaskDuration` today, `ToolUsageStats` is **never emitted by the backend**. It is constructed in the frontend from already-streamed entries, then injected as a virtual patch via the same machinery `taskDurationPatch` uses.

### 1.3 Type regeneration

Run `pnpm run generate-types` after the Rust types compile. The generator entry point is `crates/server/src/bin/generate_types.rs` — append the new types alongside the existing `executors::logs::TokenUsageInfo::decl()` registration. Do not edit `shared/types.ts` by hand.

### 1.4 Schema impact

**None.** All new data lives inside `entry_json` (a TEXT column). No migrations.

## §2 — Timing capture (`ConversationMsgStore` wrapper)

### 2.1 Trait abstraction

New trait in `crates/executors/src/logs/utils/tool_timing.rs` (new file):

```rust
pub trait ConversationSink: Send + Sync {
    fn push_patch(&self, patch: json_patch::Patch);
    fn push_stdout(&self, s: String);
    fn push_stderr(&self, s: String);
    fn push_session_id(&self, session_id: String);
    fn push_message_id(&self, id: String);
    fn push_finished(&self);
    fn get_history(&self) -> Vec<workspace_utils::msg_store::LogMsg>;
    fn get_receiver(&self) -> tokio::sync::broadcast::Receiver<workspace_utils::msg_store::LogMsg>;
    fn raw(&self) -> &Arc<MsgStore>;
}
```

The `raw()` accessor is an escape hatch for callers that legitimately want the underlying `MsgStore` (e.g. `history_plus_stream` returning `BoxStream`).

`Arc<MsgStore>` itself implements `ConversationSink` by direct delegation — for tests and other paths that don't need timing capture.

### 2.2 Wrapper

```rust
pub struct ConversationMsgStore {
    inner: Arc<MsgStore>,
    state: Mutex<HashMap<usize, ToolTimingState>>,
}

struct ToolTimingState {
    started_at: DateTime<Utc>,
    approved_at: Option<DateTime<Utc>>,
    last_status: ToolStatus,
}

impl ConversationMsgStore {
    pub fn wrap(inner: Arc<MsgStore>) -> Arc<Self> { Arc::new(Self { inner, state: Mutex::new(HashMap::new()) }) }
}

impl ConversationSink for ConversationMsgStore {
    fn push_patch(&self, patch: json_patch::Patch) {
        let stamped = self.stamp_if_tool_use(patch);
        self.inner.push_patch(stamped);
    }
    // … other methods forward unchanged
}
```

### 2.3 Stamping algorithm

`stamp_if_tool_use(patch)`:

1. Use `extract_normalized_entry_from_patch(&patch)` to extract `(entry_index, entry)`. If `None`, return the patch unchanged.
2. If `entry.entry_type` is not `ToolUse`, return unchanged. Also: if the patch is a REMOVE op for the entry index, drop that index from `state` and return unchanged.
3. Acquire `state` mutex.
4. Let `now = Utc::now()`.
5. Lookup `state[entry_index]`:
   - **Absent** (first time we see this index): set `entry.started_at = now`, leave `approved_at` and `completed_at` as the wrapper sees them (typically `None`). Insert `ToolTimingState { started_at: now, approved_at: None, last_status: status.clone() }`. (If `status` is already terminal — i.e., the executor emitted directly into a terminal state without a `Created` phase — also set `entry.completed_at = now`.)
   - **Present**: copy `entry.started_at = state.started_at`, `entry.approved_at = state.approved_at`.
     - If `state.last_status` was `PendingApproval { .. }` and the new `status` is **not** `PendingApproval`: set `entry.approved_at = Some(now)`, persist back into `state`.
     - If new `status` is terminal: set `entry.completed_at = Some(now)`. (If `entry.completed_at` was already set in a prior replace and we see another transition, keep the earlier value; this is defensive — the wrapper expects exactly one terminal stamp per index, but the rule "first terminal wins" prevents drift if an executor double-replaces.)
     - Update `state.last_status = status`.
6. Re-serialize the modified entry into a fresh ADD or REPLACE patch (matching the original op kind) using existing `ConversationPatch::add_normalized_entry` / `ConversationPatch::replace`.
7. Drop the mutex; return the new patch.

Important properties:
- `approved_at` is only ever set on the transition out of `PendingApproval`. A tool that goes directly `Created → Success` keeps `approved_at = None`. Per the user's decision: **do not invent a `started_at == approved_at` value for non-approval tools.**
- The mutex critical section is bounded to a single map lookup + write, with `now()` captured outside it. Patches never block each other for serialization work.
- If `completed_at < started_at` (system clock skew, NTP jump): record as-is. Frontend clamps to 0 when computing duration. We do not silently rewrite timestamps server-side.

### 2.4 Patch shapes the wrapper must handle

The repository's actual patches are produced by:

- `ConversationPatch::add_normalized_entry(idx, entry)` — single ADD op
- `ConversationPatch::replace(idx, entry)` — single REPLACE op
- `ConversationPatch::remove(idx)` — single REMOVE op
- `ConversationPatch::add_stdout` / `add_stderr` / `add_diff` / `replace_diff` / `remove_diff` — non-NormalizedEntry payloads
- `slash_commands(...)` — bulk replace at non-`/entries/N` paths

The stamping logic only fires when the patch passes both checks: (a) at least one op targets `/entries/N` for some integer N, and (b) the value is a `NORMALIZED_ENTRY` carrying a `ToolUse` entry. Everything else passes through.

`extract_normalized_entry_from_patch` already implements walk-the-ops-and-find-the-entry correctly; it returns the **last** matching op, which matches our ADD/REPLACE single-op invariant.

### 2.5 Plumbing into orchestration

Each `executor.normalize_logs(msg_store, worktree_path)` callsite is the integration point.

**Trait change** in `crates/executors/src/executors/mod.rs:477`:

```rust
fn normalize_logs(&self, sink: Arc<dyn ConversationSink>, worktree_path: &Path);
```

**Per-executor change**: every executor that implements `StandardCodingAgentExecutor` matches the new signature. As of this writing the codebase ships ~31 such impls under `crates/executors/src/executors/*.rs` (claude, codex, cursor, droid, opencode, mimo_code, acp, plus amp, auggie, autohand, cline, codebuddy_code, copilot, corust_agent, crow_cli, deepagents, dimcode, fast_agent, gemini, goose, junie, kilo, kimi, minion_code, mistral_vibe, nova, pi_acp, qa_mock, qoder, qwen, stakpak). Each keeps using `sink.push_patch(...)` / `sink.push_stdout(...)` exactly as it does today — only the parameter type changes. No internal logic touched.

The plan stage must enumerate the actual current set with `grep -l "fn normalize_logs" crates/executors/src/executors/*.rs` rather than rely on this list verbatim.

**Orchestration callsites that need to wrap:**

- `crates/local-deployment/src/container.rs:1128` — primary execution path that spawns the coding agent and calls `executor.normalize_logs(msg_store.clone(), working_dir)`.
- `crates/services/src/services/container.rs:1407` (qa-mode branch) and `:1414` (regular branch) — the unified normalize-logs dispatch in the services layer.
- `crates/services/src/services/session_export.rs:146` — replay path. Reads pre-stamped data, so wrapping is optional; the simplest move is to wrap anyway for uniformity (the wrapper is a no-op when entries already carry timing).

The plan stage should re-grep for `executor.normalize_logs(` across the workspace before committing to this list — additional callsites may exist or be added before implementation begins.

Other `Arc::new(MsgStore::new())` sites that exist purely as in-executor unit-test fixtures (e.g. `cursor.rs:1253`, `claude.rs:2974`, `codex/normalize_logs.rs:2729`) need not be wrapped; they pass through the blanket `ConversationSink` impl on `Arc<MsgStore>` and continue exercising parser logic without timing capture, which is fine for those tests.

## §3 — Frontend aggregation and rendering

### 3.1 Aggregation function

`frontend/src/hooks/useConversationHistory/aggregateToolUsageStats.ts` (new file):

```typescript
export function aggregateToolUsageStats(
  entries: NormalizedEntry[],
  taskDurationSeconds: number | null
): ToolUsageStats | null
```

Behavior:

1. Filter `entries` to those with `entry_type.type === 'tool_use'`. If empty, return `null`.
2. Group by `tool_name`. For each group, accumulate:
   - `count` += 1
   - One of `success` / `failed` / `denied` / `timed_out` based on `entry.entry_type.status.status` (the discriminator field name used by the existing `ToolStatus` enum).
   - `in_progress` += 1 if `started_at` is present but `completed_at` is absent.
   - If both `started_at` and `completed_at` are present:
     - `duration = max(0, completed_at - started_at)` — clamp negative skew to zero.
     - Update `total_seconds`, `max_seconds`. Track `count_with_timing` separately for the `avg_seconds` divisor (skip calls without timing).
   - If `approved_at` is present (which implies the call passed through `PendingApproval`):
     - `awaiting_approval = max(0, approved_at - started_at)`
     - `awaiting_approval_seconds += awaiting_approval`
     - `approved_call_count += 1`
3. Compute `avg_seconds = total_seconds / count_with_timing` (or 0 if `count_with_timing == 0`).
4. Return `ToolUsageStats { per_tool, total_calls, total_seconds, task_duration_seconds: taskDurationSeconds }`.

`per_tool` is sorted by `total_seconds` descending so the table reads "biggest contributors first".

### 3.2 Patch synthesis and injection

`frontend/src/hooks/useConversationHistory/constants.ts` — add a sibling to `taskDurationPatch`:

```typescript
export const toolUsageStatsPatch = (
  executionProcessId: string,
  stats: ToolUsageStats
): PatchTypeWithKey => ({
  type: 'NORMALIZED_ENTRY',
  content: {
    entry_type: { type: 'tool_usage_stats', ...stats },
    content: '',
    timestamp: null,
  },
  patchKey: `${executionProcessId}:tool-usage-stats`,
  executionProcessId,
});
```

`frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` — at the existing TaskDuration synthesis site (~line 416 and ~line 916), compute stats and push the new patch immediately **before** the corresponding `taskDurationPatch`. Reading order in the conversation: stats card (fine-grained per-tool) → duration card (coarse total). When `aggregateToolUsageStats` returns `null`, push nothing.

The `patchKey` makes the patch idempotent across re-renders, matching how `${executionProcessId}:duration` is used today.

### 3.3 Card component

`frontend/src/components/NormalizedConversation/ToolUsageStatsCard.tsx` (new file). Wired into `DisplayConversationEntry.tsx` at the existing dispatch (line 1046, alongside the `task_duration` branch):

```tsx
if (entry.entry_type.type === 'tool_usage_stats') {
  return <ToolUsageStatsCard stats={entry.entry_type} />;
}
```

#### Visual specification (legacy design tokens)

**Collapsed (default):**

```
┌─ 🔧 Tool calls 23 · Total 18.4s · 42% of task     ▾ ─┐
└──────────────────────────────────────────────────────┘
```

**Expanded:**

```
┌─ 🔧 Tool calls 23 · Total 18.4s · 42% of task     ▴ ─┐
│  Tool          Count   ✓ / ✗ / ⊘     Total    Avg     Max │
│  Bash            12     11 / 1 / 0    8.2s †  0.7s   3.1s │
│  WebSearch        4      4 / 0 / 0    6.1s    1.5s   2.4s │
│  mcp:context7     2      2 / 0 / 0    3.8s    1.9s   2.1s │
│  Read             6      6 / 0 / 0    0.4s    0.07s  0.2s │
│  ─────────────────────────────────────────────────────── │
│  † Bash: 3 of 12 calls awaited approval (5.1s total)     │
└───────────────────────────────────────────────────────────┘
```

Rules:
- Status column is rendered as `success / failed / denied`. The `timed_out` count is folded into the tooltip on the status cell.
- `Total / Avg / Max` columns format with `formatDuration` helper (existing or new — share with the `TaskDuration` card if possible).
- `†` marker appears next to `Total` only when `approved_call_count > 0` for that row. Bottom of the card lists each annotated tool's approval breakdown (`{tool}: {approved_call_count} of {count} calls awaited approval ({awaiting_approval_seconds}s total)`).
- Header `% of task` is hidden when `task_duration_seconds` is `null`.
- If the aggregate has any `in_progress > 0`, the header gains `· {n} in progress` (live attempt; live tools that haven't reached terminal yet).
- Sticks to legacy design tokens per project convention (`bg-primary`, `bg-muted`, `bg-background` — see `ViewProcessesDialog` / `ViewRelatedTasksDialog`). No `.new-design` styles.
- Dialog/card sizing follows the same flex pattern as existing duration card; no special layout.

### 3.4 Live behavior

For an attempt still running, every SSE-driven entry update triggers `aggregateToolUsageStats` again (cheap O(n) over current entries; React re-render naturally). The card's numbers refresh; tools currently in `Created` or `PendingApproval` show as `in_progress`. When `TaskDuration` finally appears, the stats card updates to reflect a complete picture.

`useMemo` keyed on `entries.length` plus the last entry's timestamp keeps recomputation bounded. We do not introduce incremental aggregation in v1.

## §4 — Edge cases and error handling

| Situation | Behavior |
|---|---|
| Entry has no `started_at` (legacy data, pre-feature) | Counted in `count`; not in any time totals. The row's Total/Avg/Max render as `—`. |
| `started_at` present, `completed_at` absent (tool still running, attempt killed mid-flight, or stuck in PendingApproval) | Counted in both `count` and `in_progress`; not in time totals. Header gains `· N in progress`. |
| `completed_at < started_at` (clock skew) | Frontend clamps to 0. No errors raised. |
| `approved_at` present but `completed_at` absent | Treated as in-progress. The eventual completed transition will fix it on the next aggregation. |
| Tool that never enters `PendingApproval` | `approved_at` stays `None`. Aggregator does not produce a footnote for that tool. No imaginary "approval = 0s" data. |
| Wrapper sees ADD on an already-tracked index | Tracing-warn and overwrite the prior `ToolTimingState`. Defensive only; not expected to happen. |
| Wrapper sees REMOVE | Drop the index from `state`. Subsequent ADD on the same index restarts timing. |
| Patch contains stdout/stderr/diff/slash_commands | Wrapper passes through unchanged. |
| Multi-process attempt (Setup + CodingAgent + Cleanup) | Each `execution_process` gets its own `ConversationMsgStore`. The frontend already iterates entries per-process; one stats card is synthesized per process. v1 does **not** sum stats across processes within an attempt. |
| Mock-clock test scenarios | The wrapper uses an injectable clock (see §5.1) so tests can drive `Utc::now()` deterministically. |

## §5 — Testing

### 5.1 Backend — `ConversationMsgStore` unit tests

`crates/executors/src/logs/utils/tool_timing.rs` — `#[cfg(test)] mod tests`:

| Scenario | Assertion |
|---|---|
| ADD ToolUse(Created) | Outgoing entry has `started_at` set, `approved_at` and `completed_at` `None`. |
| ADD ToolUse(Created) → REPLACE ToolUse(Success) | `started_at` preserved from the first event; `completed_at` set to second event time; `approved_at` `None`. |
| Created → PendingApproval → Created → Success | `started_at` from first; `approved_at` from third (the leaving-PendingApproval transition); `completed_at` from fourth. |
| Created → Denied (no approval phase) | `started_at` set; `approved_at` `None`; `completed_at` set. |
| Created → PendingApproval (no further events) | `started_at` set; `approved_at` `None`; `completed_at` `None`. |
| Direct emit of terminal status (some executors) | `started_at` and `completed_at` both set to the same `now()`. |
| Non-ToolUse entry (AssistantMessage etc.) | Patch passes through byte-identical. |
| stdout / stderr / diff patches | Pass through; `state` unchanged. |
| REMOVE patch on tracked index | Index dropped from `state`. |
| REMOVE then ADD same index | New ADD starts fresh `started_at`. |
| Clock-skew injection (mock clock returns earlier value on second call) | Wrapper still records both timestamps as observed; frontend tests cover the clamp. |

The wrapper accepts an injectable `Clock` trait (default impl wraps `Utc::now`). Tests pass a `MockClock` returning a controlled sequence.

### 5.2 Backend — cross-executor integration

Add one test in `crates/executors/src/executors/qa_mock.rs`:

- Configure the mock to emit `Created → Success` for two named tools.
- Run `executor.normalize_logs(conv_store, ...)` against a real `ConversationMsgStore::wrap(MsgStore::new())`.
- Drain the MsgStore history; deserialize the final ToolUse entries.
- Assert both have `started_at` and `completed_at` populated, `approved_at` `None`.

This proves that the wrapper integrates correctly with the executor → `push_patch` flow without per-executor duplication. We do **not** add the same test to all seven real executors — they share the wrapper, so testing one wired path is sufficient.

### 5.3 Frontend — aggregation unit tests

`frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts` (Vitest):

| Scenario | Expectation |
|---|---|
| Empty entries | Returns `null`. |
| Only AssistantMessage / TaskDuration entries | Returns `null`. |
| Three Bash success calls | `per_tool` length 1; `count=3`, `success=3`; `total_seconds`, `avg_seconds`, `max_seconds` correct. |
| Mixed: 2 Bash success, 1 Bash failed, 1 Read success | Two rows; status counts split correctly per row. |
| Some entries lack `started_at` (legacy) | Those entries counted in `count` but excluded from `total_seconds`; aggregator still returns valid stats. |
| One entry has `started_at` but not `completed_at` | `in_progress=1`; not in `total_seconds`. |
| Entries with and without `approved_at` for the same tool | `awaiting_approval_seconds` sums only the approved subset; `approved_call_count` matches that subset. |
| Negative duration (`completed_at < started_at`) | Clamped to 0 in `total_seconds` / `max_seconds`. |
| `taskDurationSeconds` argument is `null` | `task_duration_seconds` field on returned stats is `null`. |

### 5.4 Frontend — `ToolUsageStatsCard` rendering tests

Minimal: render with a fixed stats object, assert:
- Collapsed header shows count, total, percentage.
- Toggling expands to a table with `per_tool.length` rows.
- A row whose `approved_call_count > 0` renders the `†` marker; bottom footnote text is present.
- A row with `count_with_timing == 0` renders Total/Avg/Max as `—`.
- `% of task` is absent when `task_duration_seconds` is `null`.

No snapshot tests (legacy design churn would make them noisy).

### 5.5 No end-to-end Playwright

Aggregation is a pure function; the wrapper is a pure local wrapper; both are isolated above. The integration test in §5.2 covers the wiring. The cost of a real-executor e2e here is not justified.

## §6 — Implementation order, rollout, performance, open questions

### 6.1 Implementation order

Each step is independently mergeable, in this order:

1. **Data model + type generation.** Add the three timing fields to `ToolUse`; add `ToolUsageStats` and `ToolStat`. Run `pnpm run generate-types`. Verify the SQLx prepared queries still pass (`pnpm run prepare-db`). Run `cargo test --workspace` and `pnpm run check` — neither suite should change behavior, since `Optional` fields are backward-compatible. *No user-visible change.*

2. **`ConversationSink` trait + `ConversationMsgStore` wrapper, with unit tests (§5.1).** Implement the trait, the wrapper, the blanket `Arc<MsgStore>` impl, and the mock-clock test scaffolding. *No user-visible change; nothing wires it up yet.*

3. **Trait-level wiring + orchestration plumbing + integration test (§5.2).** Change the trait `normalize_logs` signature to `Arc<dyn ConversationSink>`. Update all `StandardCodingAgentExecutor` impls (signature only — see §2.5 for the enumeration approach). Wrap the orchestration callsites listed in §2.5. Run the qa_mock integration test. *Backend now stamps timing on every new attempt — but no UI yet.*

4. **Frontend aggregation function + patch synthesis + unit tests (§5.3).** Implement `aggregateToolUsageStats`, `toolUsageStatsPatch`, inject before each `taskDurationPatch` site. *Card data is constructed but not rendered — no visible UI yet.*

5. **`ToolUsageStatsCard` component + dispatch wiring + render tests (§5.4).** Final user-visible step: card appears in the conversation.

If any step exposes a problem, the prior steps remain useful (data model and wrapper are inert; orchestration plumbing is harmless; aggregator constructs unused data).

### 6.2 Rollout and compatibility

- **Database compatibility:** Zero migrations. New optional fields go inside `entry_json`. Legacy rows deserialize with `None` and the frontend handles them gracefully.
- **Wire-protocol compatibility:** SSE patches gain three optional fields on the ToolUse variant; older frontends ignore them. Newer frontends viewing pre-feature attempts see `None` and render `—`.
- **Rollback:** If the wrapper produces a regression, revert step 3. Steps 1, 2, 4, 5 stay merged; their effect collapses to "no timing data, card never appears (because aggregator returns null)." No code revert is required for steps 1/2/4/5 individually.
- **No feature flag.** The change is non-disruptive (additive optional fields + a frontend card that renders only when there is data). A flag would add cost without real benefit.

### 6.3 Performance impact

- **Wrapper:** every `push_patch` adds one JSON-patch parse (`extract_normalized_entry_from_patch`, ~10–100 µs on the patches we produce), a `HashMap<usize, ToolTimingState>` lookup (O(1)), and at most one re-serialization (only when the patch is a ToolUse-bearing patch). For an attempt with 1–2 thousand entries, total wrapper overhead is well under 100 ms — undetectable.
- **Memory:** the `state` map holds ~50 bytes per active tool index. A 5,000-entry attempt: ~250 KB in memory. Wrapper drops with the execution process.
- **Frontend aggregation:** O(n) across current entries, n typically ≤ a few hundred, occasionally a few thousand. Memo-keyed on `entries.length` + last timestamp, so it does not run on unrelated state changes. No incremental optimization in v1.

### 6.4 Open questions (revisit if/when relevant)

- **System clock skew.** We accept `Utc::now()` as ground truth and clamp negative durations on the frontend. We do **not** attempt to use a monotonic clock. If real-world skew turns out to be a measurable issue, switch the wrapper to `Instant::now()` deltas anchored to a single base `DateTime<Utc>` per execution. Out of scope for v1.
- **Multi-process attempts (Setup + CodingAgent + Cleanup).** v1 emits one card per execution process. If users want a single attempt-level summed card, add it as a separate aggregation pass that consumes the per-process stats. Deferred until requested.
- **AskUserQuestion tools.** Their "duration" includes human reply time. v1 reports them like any other tool; the card's tooltip mentions that durations include any blocking on user input.
- **Tools that emit only a terminal status (no `Created` phase).** Wrapper records `started_at == completed_at`, duration ≈ 0. This honestly reflects the limited visibility we have; do not retrofit synthetic durations.
- **Inline per-call duration badges.** Data is captured for it. Adding the badge next to each ToolUse row is a follow-up PR.

## File map (anchor for the implementation plan)

| Layer | File | Change |
|---|---|---|
| Backend types | `crates/executors/src/logs/mod.rs` | Extend `ToolUse` variant; add `ToolUsageStats`/`ToolStat`. |
| Backend types export | `crates/server/src/bin/generate_types.rs` | Register new types. |
| Backend wrapper | `crates/executors/src/logs/utils/tool_timing.rs` (new) | `ConversationSink` trait + `ConversationMsgStore` + unit tests. |
| Backend trait | `crates/executors/src/executors/mod.rs` | Change `StandardCodingAgentExecutor::normalize_logs` parameter type. |
| Backend executor impls | All `*.rs` under `crates/executors/src/executors/` that implement `StandardCodingAgentExecutor` (~31 files, enumerate with grep at plan time) | Match the new signature; bodies unchanged. |
| Backend orchestration | `crates/local-deployment/src/container.rs:1128`, `crates/services/src/services/container.rs:1407` & `:1414`, `crates/services/src/services/session_export.rs:146` | Wrap `MsgStore` with `ConversationMsgStore` at coding-agent execution sites (re-verify list at plan time). |
| Backend integration test | `crates/executors/src/executors/qa_mock.rs` | Add test from §5.2. |
| Frontend aggregation | `frontend/src/hooks/useConversationHistory/aggregateToolUsageStats.ts` (new) | Pure function from entries → stats. |
| Frontend patch helper | `frontend/src/hooks/useConversationHistory/constants.ts` | Add `toolUsageStatsPatch`. |
| Frontend injection | `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | Inject patch alongside the existing `taskDurationPatch` calls. |
| Frontend tests | `frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts` (new) | §5.3. |
| Frontend card | `frontend/src/components/NormalizedConversation/ToolUsageStatsCard.tsx` (new) | Card component. |
| Frontend dispatch | `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Add `tool_usage_stats` branch. |
| Generated types | `shared/types.ts` | Regenerated; do not edit by hand. |
