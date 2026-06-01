# Tool Call Duration Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a per-task-attempt aggregate of tool-call timing as a collapsible card in the conversation log, capturing per-call timestamps via a wrapper installed at the orchestration boundary so individual executor normalizers stay untouched.

**Architecture:**
- **Backend:** Add `started_at` / `approved_at` / `completed_at` (all `Option<DateTime<Utc>>`) to `NormalizedEntryType::ToolUse`. Capture them in a new `ConversationMsgStore` wrapper that implements a new `ConversationSink` trait. Change `StandardCodingAgentExecutor::normalize_logs` and its internal helpers to take `Arc<dyn ConversationSink>` so all `push_patch` calls flow through the wrapper. Wrap at orchestration sites only.
- **Frontend:** Mirror the existing `TaskDuration` synthesis pattern — a pure `aggregateToolUsageStats` function over current entries plus a `toolUsageStatsPatch` injected before each `taskDurationPatch` site. Render a new `ToolUsageStatsCard`.
- **No DB migration. No new REST endpoints.** All new data lives inside `entry_json` (new fields are `Optional`, so legacy rows degrade gracefully).

**Tech Stack:** Rust (cargo, sqlx, ts-rs), TypeScript / React (Vite, Vitest, Tailwind legacy design), pnpm.

**Spec reference:** `docs/superpowers/specs/2026-06-01-tool-call-duration-stats-design.md` (commit `fa6856150`).

---

## Task 1: Extend `ToolUse` variant with timing fields

**Files:**
- Modify: `crates/executors/src/logs/mod.rs:75-106` (the `NormalizedEntryType` enum).

- [ ] **Step 1: Add the three optional timestamp fields to the `ToolUse` variant**

Edit `crates/executors/src/logs/mod.rs` and replace the existing `ToolUse` variant inside `NormalizedEntryType` with:

```rust
ToolUse {
    tool_name: String,
    action_type: ActionType,
    status: ToolStatus,
    /// Wall-clock instant the wrapper first observed this entry index
    /// carrying a ToolUse value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Wall-clock instant the wrapper observed `status` transitioning out
    /// of `PendingApproval`. Stays `None` for tools that never entered
    /// `PendingApproval`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    approved_at: Option<chrono::DateTime<chrono::Utc>>,
    /// Wall-clock instant the wrapper observed `status` becoming terminal
    /// (Success / Failed / Denied / TimedOut).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
},
```

`#[serde(default)]` lets older serialized entries (without these fields) deserialize as `None`. `skip_serializing_if` keeps new emissions compact when fields are unset.

- [ ] **Step 2: Add `chrono` import at the top of the file**

Confirm `crates/executors/src/logs/mod.rs` has `use chrono::{DateTime, Utc};` near the top alongside the other `use` lines. If not, add it. (Other modules in this crate already use `chrono`, so this dependency is already in `Cargo.toml`.)

If `DateTime`/`Utc` are imported, update the variant to use the bare names (`Option<DateTime<Utc>>`).

- [ ] **Step 3: Fix existing `with_tool_status` helper**

The existing `with_tool_status` helper at `crates/executors/src/logs/mod.rs:151-170` constructs a fresh `ToolUse` variant via `NormalizedEntryType::ToolUse { tool_name: ..., action_type: ..., status }` — it must now set the three new fields to `None` so it compiles. Update it as follows:

```rust
impl NormalizedEntry {
    pub fn with_tool_status(&self, status: ToolStatus) -> Option<Self> {
        if let NormalizedEntryType::ToolUse {
            tool_name,
            action_type,
            started_at,
            approved_at,
            completed_at,
            ..
        } = &self.entry_type
        {
            Some(Self {
                entry_type: NormalizedEntryType::ToolUse {
                    tool_name: tool_name.clone(),
                    action_type: action_type.clone(),
                    status,
                    started_at: *started_at,
                    approved_at: *approved_at,
                    completed_at: *completed_at,
                },
                ..self.clone()
            })
        } else {
            None
        }
    }
}
```

The wrapper (added later) is the authoritative writer of the timing fields, but `with_tool_status` must preserve whatever values are already present rather than zero them out.

- [ ] **Step 4: Find every other place that constructs the `ToolUse` literal and add the three fields**

Run:

```bash
grep -rn "NormalizedEntryType::ToolUse {" crates/ --include="*.rs"
```

For every callsite returned, append `started_at: None, approved_at: None, completed_at: None` to the struct initializer (the wrapper will fill them in later for live runs). Do not change any other field.

There will be many sites (~30+) across `crates/executors/src/executors/{acp,claude,cursor,droid,opencode,mimo_code,codex}*.rs` — this is mechanical. Apply with care.

- [ ] **Step 5: Build and verify**

Run:

```bash
cargo check --workspace --all-targets
```

Expected: compiles clean. Any compile error means a `ToolUse` constructor was missed in Step 4.

- [ ] **Step 6: Commit**

```bash
git add crates/executors/src/logs/mod.rs crates/executors/src/executors
git commit -m "feat(logs): add started_at/approved_at/completed_at to ToolUse variant"
```

---

## Task 2: Add `ToolUsageStats` / `ToolStat` types and register for ts-rs export

**Files:**
- Modify: `crates/executors/src/logs/mod.rs` (add new structs and a new `NormalizedEntryType::ToolUsageStats` variant).
- Modify: `crates/server/src/bin/generate_types.rs:242-254` (register new types).

- [ ] **Step 1: Define `ToolStat` and `ToolUsageStats` structs**

In `crates/executors/src/logs/mod.rs`, after the existing `TokenUsageInfo` struct (around line 139), add:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolStat {
    pub tool_name: String,
    pub count: u32,
    pub success: u32,
    pub failed: u32,
    pub denied: u32,
    pub timed_out: u32,
    /// Calls with `started_at` present and `completed_at` absent.
    pub in_progress: u32,
    pub total_seconds: f64,
    pub avg_seconds: f64,
    pub max_seconds: f64,
    /// Sum of `(approved_at - started_at)` across calls that passed
    /// through `PendingApproval`. Always 0 for tools that never required
    /// approval; the front-end uses this to decide whether to render a
    /// per-tool footnote.
    pub awaiting_approval_seconds: f64,
    pub approved_call_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolUsageStats {
    pub per_tool: Vec<ToolStat>,
    pub total_calls: u32,
    pub total_seconds: f64,
    /// `None` hides the "% of task" display in the card header.
    pub task_duration_seconds: Option<f64>,
}
```

- [ ] **Step 2: Add `ToolUsageStats` as a new variant on `NormalizedEntryType`**

Inside the `NormalizedEntryType` enum (already in `crates/executors/src/logs/mod.rs:73-106`), add a new variant alongside `TokenUsageInfo` and `TaskDuration`:

```rust
ToolUsageStats(ToolUsageStats),
```

This mirrors the existing `TokenUsageInfo(TokenUsageInfo)` shape so the front-end pattern matches identically.

- [ ] **Step 3: Register the new types in `generate_types.rs`**

In `crates/server/src/bin/generate_types.rs`, find the `executors::logs::TokenUsageInfo::decl(),` line (around line 246) and add immediately after it:

```rust
        executors::logs::ToolUsageStats::decl(),
        executors::logs::ToolStat::decl(),
```

- [ ] **Step 4: Regenerate shared types**

```bash
pnpm run generate-types
```

Expected: `shared/types.ts` is updated. It must now contain `ToolUsageStats` and `ToolStat` type declarations, and `NormalizedEntryType` must include a `tool_usage_stats` discriminant.

If the command fails with a Rust compilation error, fix it before continuing.

- [ ] **Step 5: Build the workspace**

```bash
cargo check --workspace --all-targets
pnpm run check
```

Expected: both pass. The new types should not break any existing TypeScript code (they're additive).

- [ ] **Step 6: Commit**

```bash
git add crates/executors/src/logs/mod.rs crates/server/src/bin/generate_types.rs shared/types.ts
git commit -m "feat(types): add ToolUsageStats / ToolStat for tool-call duration stats"
```

---

## Task 3: Scaffold `ConversationSink` trait + `Clock` abstraction

**Files:**
- Create: `crates/executors/src/logs/utils/tool_timing.rs`
- Modify: `crates/executors/src/logs/utils/mod.rs` (add `pub mod tool_timing;`).

- [ ] **Step 1: Add the new module declaration**

Edit `crates/executors/src/logs/utils/mod.rs` and add `pub mod tool_timing;` next to `pub mod patch;`. Also add to the `pub use` line at the bottom: `pub use tool_timing::{Clock, ConversationMsgStore, ConversationSink, SystemClock};`

The full file should now read:

```rust
//! Utility modules for executor framework

pub mod entry_index;
pub mod patch;
pub mod shell_command_parsing;
pub mod tool_timing;

pub use entry_index::EntryIndexProvider;
pub use patch::{ConversationPatch, extract_normalized_entry_from_patch};
pub use tool_timing::{Clock, ConversationMsgStore, ConversationSink, SystemClock};
```

- [ ] **Step 2: Create the trait scaffold and Clock abstraction**

Create `crates/executors/src/logs/utils/tool_timing.rs` with the following content. This step creates the *types* but no logic — the wrapper's stamping behavior is added in Task 4 after a failing test.

```rust
//! Tool call timing capture.
//!
//! `ConversationSink` is a typed boundary that executor `normalize_logs`
//! flows publish through. `ConversationMsgStore` is the wrapper that
//! intercepts ToolUse-bearing patches and stamps wall-clock timestamps
//! before forwarding to the underlying `MsgStore`.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use chrono::{DateTime, Utc};
use json_patch::Patch;
use tokio::sync::broadcast;
use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};

use crate::logs::ToolStatus;

/// Injectable clock so unit tests can drive timestamps deterministically.
pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

/// Typed sink that executor normalizers publish through.
///
/// Implemented for both `Arc<MsgStore>` (no-op pass-through) and
/// `Arc<ConversationMsgStore>` (stamps ToolUse timing). Helpers in the
/// executor crate take `Arc<dyn ConversationSink>` so callers can pick
/// either at construction time.
pub trait ConversationSink: Send + Sync {
    fn push_patch(&self, patch: Patch);
    fn push_stdout(&self, s: String);
    fn push_stderr(&self, s: String);
    fn push_session_id(&self, session_id: String);
    fn push_message_id(&self, id: String);
    fn push_finished(&self);
    fn get_history(&self) -> Vec<LogMsg>;
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg>;
    /// Escape hatch for callers that need the underlying `MsgStore`
    /// (e.g. for `sse_stream`, `history_plus_stream`, `spawn_forwarder`).
    fn raw(&self) -> &Arc<MsgStore>;
}

/// Blanket impl for paths that don't need timing capture (e.g. test
/// fixtures, replay-from-DB paths).
impl ConversationSink for Arc<MsgStore> {
    fn push_patch(&self, patch: Patch) {
        MsgStore::push_patch(self, patch);
    }
    fn push_stdout(&self, s: String) {
        MsgStore::push_stdout(self, s);
    }
    fn push_stderr(&self, s: String) {
        MsgStore::push_stderr(self, s);
    }
    fn push_session_id(&self, session_id: String) {
        MsgStore::push_session_id(self, session_id);
    }
    fn push_message_id(&self, id: String) {
        MsgStore::push_message_id(self, id);
    }
    fn push_finished(&self) {
        MsgStore::push_finished(self);
    }
    fn get_history(&self) -> Vec<LogMsg> {
        MsgStore::get_history(self)
    }
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg> {
        MsgStore::get_receiver(self)
    }
    fn raw(&self) -> &Arc<MsgStore> {
        self
    }
}

#[derive(Debug)]
struct ToolTimingState {
    started_at: DateTime<Utc>,
    approved_at: Option<DateTime<Utc>>,
    completed_at: Option<DateTime<Utc>>,
    last_status: ToolStatus,
}

/// Wraps an `Arc<MsgStore>` and stamps `started_at` / `approved_at` /
/// `completed_at` on `NormalizedEntryType::ToolUse` patches before
/// forwarding to the underlying store.
pub struct ConversationMsgStore {
    inner: Arc<MsgStore>,
    state: Mutex<HashMap<usize, ToolTimingState>>,
    clock: Arc<dyn Clock>,
}

impl ConversationMsgStore {
    /// Wrap with the default `SystemClock`. Production callers use this.
    pub fn wrap(inner: Arc<MsgStore>) -> Arc<Self> {
        Self::wrap_with_clock(inner, Arc::new(SystemClock))
    }

    /// Wrap with a caller-supplied clock. Tests use a mock clock here.
    pub fn wrap_with_clock(inner: Arc<MsgStore>, clock: Arc<dyn Clock>) -> Arc<Self> {
        Arc::new(Self {
            inner,
            state: Mutex::new(HashMap::new()),
            clock,
        })
    }
}

// `impl ConversationSink for ConversationMsgStore` is added in Task 4.
```

- [ ] **Step 3: Verify the file compiles**

```bash
cargo check -p executors
```

Expected: clean. The wrapper has no behavior yet — a `ConversationSink` impl is added in the next task to a failing test.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/logs/utils/mod.rs crates/executors/src/logs/utils/tool_timing.rs
git commit -m "feat(logs): scaffold ConversationSink trait and ConversationMsgStore wrapper"
```

---

## Task 4: First wrapper test — ADD `ToolUse(Created)` gets stamped

**Files:**
- Modify: `crates/executors/src/logs/utils/tool_timing.rs` (add `#[cfg(test)] mod tests` and the wrapper's `ConversationSink` impl).

- [ ] **Step 1: Add a failing test for the simplest case**

Append to `crates/executors/src/logs/utils/tool_timing.rs`:

```rust
#[cfg(test)]
mod tests {
    use std::sync::Mutex as StdMutex;

    use chrono::TimeZone;
    use serde_json::json;

    use super::*;
    use crate::logs::{
        ActionType, NormalizedEntry, NormalizedEntryType, ToolStatus,
        utils::{ConversationPatch, extract_normalized_entry_from_patch},
    };

    /// Test clock returning a controlled sequence of timestamps.
    struct MockClock {
        ticks: StdMutex<Vec<DateTime<Utc>>>,
    }

    impl MockClock {
        fn new(ticks: Vec<DateTime<Utc>>) -> Arc<Self> {
            Arc::new(Self {
                ticks: StdMutex::new(ticks),
            })
        }

        fn at(secs: i64) -> DateTime<Utc> {
            Utc.timestamp_opt(secs, 0).single().unwrap()
        }
    }

    impl Clock for MockClock {
        fn now(&self) -> DateTime<Utc> {
            let mut ticks = self.ticks.lock().unwrap();
            ticks.remove(0)
        }
    }

    fn tool_use_entry(status: ToolStatus) -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::ToolUse {
                tool_name: "Bash".to_string(),
                action_type: ActionType::Other {
                    description: "test".to_string(),
                },
                status,
                started_at: None,
                approved_at: None,
                completed_at: None,
            },
            content: String::new(),
            metadata: None,
        }
    }

    fn last_history_patch(store: &MsgStore) -> Patch {
        store
            .get_history()
            .into_iter()
            .filter_map(|m| match m {
                LogMsg::JsonPatch(p) => Some(p),
                _ => None,
            })
            .last()
            .expect("expected at least one patch in history")
    }

    #[test]
    fn add_created_tool_use_stamps_started_at() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        let patch = ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        );
        sink.push_patch(patch);

        let stored = last_history_patch(&inner);
        let (idx, entry) = extract_normalized_entry_from_patch(&stored)
            .expect("patch should contain a NormalizedEntry");
        assert_eq!(idx, 0);

        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
}
```

- [ ] **Step 2: Run the test — it should fail to compile**

```bash
cargo test -p executors logs::utils::tool_timing -- --nocapture
```

Expected: compile error — `ConversationMsgStore` doesn't implement `ConversationSink` yet (`sink.push_patch(...)` won't resolve).

- [ ] **Step 3: Implement the minimal `ConversationSink` for `ConversationMsgStore`**

In `crates/executors/src/logs/utils/tool_timing.rs`, replace the `// impl ConversationSink for ConversationMsgStore is added in Task 4.` placeholder with:

```rust
impl ConversationMsgStore {
    fn stamp_if_tool_use(&self, patch: Patch) -> Patch {
        let Some((idx, mut entry)) = extract_normalized_entry_from_patch(&patch) else {
            return patch;
        };

        let NormalizedEntryType::ToolUse {
            ref mut started_at,
            ref mut approved_at,
            ref mut completed_at,
            ref status,
            ..
        } = entry.entry_type
        else {
            return patch;
        };

        let now = self.clock.now();
        let mut state_map = self.state.lock().unwrap();
        let entry_state = state_map.entry(idx);

        match entry_state {
            std::collections::hash_map::Entry::Vacant(slot) => {
                *started_at = Some(now);
                if is_terminal(status) {
                    *completed_at = Some(now);
                }
                slot.insert(ToolTimingState {
                    started_at: now,
                    approved_at: None,
                    completed_at: *completed_at,
                    last_status: status.clone(),
                });
            }
            std::collections::hash_map::Entry::Occupied(mut slot) => {
                let prev = slot.get_mut();
                *started_at = Some(prev.started_at);
                *approved_at = prev.approved_at;
                if is_pending_approval(&prev.last_status) && !is_pending_approval(status) {
                    *approved_at = Some(now);
                    prev.approved_at = Some(now);
                }
                if is_terminal(status) {
                    let stamp = prev.completed_at.unwrap_or(now);
                    *completed_at = Some(stamp);
                    prev.completed_at = Some(stamp);
                }
                prev.last_status = status.clone();
            }
        }

        // Reconstruct using the same op kind as the original. We detect
        // op kind by re-reading the patch JSON, since ConversationPatch
        // emits only single-op patches for entries.
        match op_kind(&patch) {
            Some(OpKind::Add) => ConversationPatch::add_normalized_entry(idx, entry),
            Some(OpKind::Replace) => ConversationPatch::replace(idx, entry),
            _ => patch,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OpKind {
    Add,
    Replace,
    Remove,
}

fn op_kind(patch: &Patch) -> Option<OpKind> {
    let value = serde_json::to_value(patch).ok()?;
    let ops = value.as_array()?;
    let first = ops.first()?;
    let op = first.get("op")?.as_str()?;
    match op {
        "add" => Some(OpKind::Add),
        "replace" => Some(OpKind::Replace),
        "remove" => Some(OpKind::Remove),
        _ => None,
    }
}

fn is_terminal(status: &ToolStatus) -> bool {
    matches!(
        status,
        ToolStatus::Success
            | ToolStatus::Failed
            | ToolStatus::Denied { .. }
            | ToolStatus::TimedOut
    )
}

fn is_pending_approval(status: &ToolStatus) -> bool {
    matches!(status, ToolStatus::PendingApproval { .. })
}

impl ConversationSink for ConversationMsgStore {
    fn push_patch(&self, patch: Patch) {
        let stamped = self.stamp_if_tool_use(patch);
        self.inner.push_patch(stamped);
    }
    fn push_stdout(&self, s: String) {
        self.inner.push_stdout(s);
    }
    fn push_stderr(&self, s: String) {
        self.inner.push_stderr(s);
    }
    fn push_session_id(&self, session_id: String) {
        self.inner.push_session_id(session_id);
    }
    fn push_message_id(&self, id: String) {
        self.inner.push_message_id(id);
    }
    fn push_finished(&self) {
        self.inner.push_finished();
    }
    fn get_history(&self) -> Vec<LogMsg> {
        self.inner.get_history()
    }
    fn get_receiver(&self) -> broadcast::Receiver<LogMsg> {
        self.inner.get_receiver()
    }
    fn raw(&self) -> &Arc<MsgStore> {
        &self.inner
    }
}
```

- [ ] **Step 4: Run the test again — it should pass**

```bash
cargo test -p executors logs::utils::tool_timing::tests::add_created_tool_use_stamps_started_at -- --nocapture
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/logs/utils/tool_timing.rs
git commit -m "feat(tool-timing): stamp started_at on first ToolUse(Created) entry"
```

---

## Task 5: Test — Created → Success preserves `started_at` and stamps `completed_at`

**Files:**
- Modify: `crates/executors/src/logs/utils/tool_timing.rs` (append a test to the existing `mod tests`).

- [ ] **Step 1: Add the test**

Inside `mod tests` of `crates/executors/src/logs/utils/tool_timing.rs`, add:

```rust
    #[test]
    fn replace_with_success_stamps_completed_at_and_preserves_started_at() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(105)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(0, tool_use_entry(ToolStatus::Success)));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, Some(MockClock::at(105)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
```

- [ ] **Step 2: Run the test**

```bash
cargo test -p executors logs::utils::tool_timing::tests::replace_with_success_stamps_completed_at -- --nocapture
```

Expected: PASS (the implementation in Task 4 already covers this case).

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/logs/utils/tool_timing.rs
git commit -m "test(tool-timing): cover Created -> Success transition"
```

---

## Task 6: Test — Created → PendingApproval → Created → Success stamps `approved_at`

**Files:**
- Modify: `crates/executors/src/logs/utils/tool_timing.rs` (append test).

- [ ] **Step 1: Add the test**

```rust
    #[test]
    fn approval_round_trip_stamps_approved_at_on_leaving_pending() {
        let clock = MockClock::new(vec![
            MockClock::at(100),
            MockClock::at(101),
            MockClock::at(150),
            MockClock::at(151),
        ]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::PendingApproval {
                approval_id: "a".into(),
            }),
        ));
        sink.push_patch(ConversationPatch::replace(0, tool_use_entry(ToolStatus::Created)));
        sink.push_patch(ConversationPatch::replace(0, tool_use_entry(ToolStatus::Success)));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, Some(MockClock::at(150)));
                assert_eq!(completed_at, Some(MockClock::at(151)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
```

- [ ] **Step 2: Run**

```bash
cargo test -p executors logs::utils::tool_timing::tests::approval_round_trip -- --nocapture
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/logs/utils/tool_timing.rs
git commit -m "test(tool-timing): cover Created -> PendingApproval -> Created -> Success"
```

---

## Task 7: Tests — passthrough cases (non-ToolUse, stdout, REMOVE)

**Files:**
- Modify: `crates/executors/src/logs/utils/tool_timing.rs` (append tests).

- [ ] **Step 1: Add three tests covering passthrough**

```rust
    fn assistant_message_entry() -> NormalizedEntry {
        NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::AssistantMessage,
            content: "hi".into(),
            metadata: None,
        }
    }

    #[test]
    fn assistant_message_passes_through_unchanged() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        let original = ConversationPatch::add_normalized_entry(0, assistant_message_entry());
        sink.push_patch(original.clone());

        let stored = last_history_patch(&inner);
        assert_eq!(
            serde_json::to_value(&stored).unwrap(),
            serde_json::to_value(&original).unwrap()
        );
    }

    #[test]
    fn stdout_patch_passes_through_unchanged() {
        let clock = MockClock::new(vec![]); // no clock calls expected
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_stdout("hello\n".into());

        let history = inner.get_history();
        assert!(matches!(history.last(), Some(LogMsg::Stdout(s)) if s == "hello\n"));
    }

    #[test]
    fn remove_patch_drops_state_for_index() {
        let clock = MockClock::new(vec![
            MockClock::at(100),
            MockClock::at(200),
            MockClock::at(201),
        ]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        // ADD then REMOVE then ADD with same index — second ADD should re-stamp.
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::remove(0));
        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse { started_at, .. } => {
                assert_eq!(started_at, Some(MockClock::at(201)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
```

- [ ] **Step 2: Run — `remove_patch_drops_state_for_index` will fail**

```bash
cargo test -p executors logs::utils::tool_timing::tests -- --nocapture
```

Expected: the `remove` test fails because the wrapper currently doesn't drop state on REMOVE.

- [ ] **Step 3: Implement REMOVE handling**

In `stamp_if_tool_use`, before the `extract_normalized_entry_from_patch` call, handle REMOVE patches explicitly:

Replace the function's first lines:

```rust
fn stamp_if_tool_use(&self, patch: Patch) -> Patch {
    if let Some(OpKind::Remove) = op_kind(&patch) {
        if let Some(idx) = remove_index(&patch) {
            self.state.lock().unwrap().remove(&idx);
        }
        return patch;
    }
    let Some((idx, mut entry)) = extract_normalized_entry_from_patch(&patch) else {
        return patch;
    };
    // … rest unchanged …
```

And add the helper at the bottom of the file (next to `op_kind`):

```rust
fn remove_index(patch: &Patch) -> Option<usize> {
    let value = serde_json::to_value(patch).ok()?;
    let ops = value.as_array()?;
    let first = ops.first()?;
    let path = first.get("path")?.as_str()?;
    path.strip_prefix("/entries/")?.parse::<usize>().ok()
}
```

- [ ] **Step 4: Run again — all three tests pass**

```bash
cargo test -p executors logs::utils::tool_timing::tests -- --nocapture
```

Expected: PASS for all three.

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/logs/utils/tool_timing.rs
git commit -m "feat(tool-timing): drop state on REMOVE; cover passthrough cases"
```

---

## Task 8: Tests — direct-terminal emit, in-progress, denied-without-approval

**Files:**
- Modify: `crates/executors/src/logs/utils/tool_timing.rs` (append three tests).

- [ ] **Step 1: Add the tests**

```rust
    #[test]
    fn direct_terminal_emit_stamps_started_and_completed_to_same_now() {
        let clock = MockClock::new(vec![MockClock::at(100)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Success),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                completed_at,
                approved_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(completed_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn pending_approval_without_resolution_leaves_completed_none() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(101)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::PendingApproval {
                approval_id: "x".into(),
            }),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, None);
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn denied_without_approval_phase_keeps_approved_at_none() {
        let clock = MockClock::new(vec![MockClock::at(100), MockClock::at(101)]);
        let inner = Arc::new(MsgStore::new());
        let sink = ConversationMsgStore::wrap_with_clock(inner.clone(), clock);

        sink.push_patch(ConversationPatch::add_normalized_entry(
            0,
            tool_use_entry(ToolStatus::Created),
        ));
        sink.push_patch(ConversationPatch::replace(
            0,
            tool_use_entry(ToolStatus::Denied { reason: None }),
        ));

        let stored = last_history_patch(&inner);
        let (_, entry) = extract_normalized_entry_from_patch(&stored).unwrap();
        match entry.entry_type {
            NormalizedEntryType::ToolUse {
                started_at,
                approved_at,
                completed_at,
                ..
            } => {
                assert_eq!(started_at, Some(MockClock::at(100)));
                assert_eq!(approved_at, None);
                assert_eq!(completed_at, Some(MockClock::at(101)));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
```

- [ ] **Step 2: Run**

```bash
cargo test -p executors logs::utils::tool_timing::tests -- --nocapture
```

Expected: PASS for all three (already covered by the implementation in Task 4).

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/logs/utils/tool_timing.rs
git commit -m "test(tool-timing): direct-terminal, pending-only, denied-no-approval cases"
```

---

## Task 9: Trait signature change + ripple to internal helpers (claude.rs)

This task changes the trait method signature and propagates through the claude executor's helpers. Each subsequent task does the same for one other executor.

**Files:**
- Modify: `crates/executors/src/executors/mod.rs:477` (trait method signature).
- Modify: `crates/executors/src/logs/utils/entry_index.rs:37` (helper signature).
- Modify: `crates/executors/src/executors/claude.rs:301-313` (trait impl signature) and helper functions in the same file.

- [ ] **Step 1: Change the trait method signature**

In `crates/executors/src/executors/mod.rs`, replace line 477:

```rust
    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &Path);
```

with:

```rust
    fn normalize_logs(
        &self,
        _sink: std::sync::Arc<dyn crate::logs::utils::ConversationSink>,
        _worktree_path: &Path,
    );
```

- [ ] **Step 2: Update `EntryIndexProvider::start_from`**

In `crates/executors/src/logs/utils/entry_index.rs:37`, replace:

```rust
pub fn start_from(msg_store: &MsgStore) -> Self {
```

with:

```rust
pub fn start_from(sink: &dyn crate::logs::utils::ConversationSink) -> Self {
```

Inside the function body, replace `msg_store.get_history()` with `sink.get_history()`. Also remove `use workspace_utils::msg_store::MsgStore` from the file's `use` block if it's now unused.

- [ ] **Step 3: Update Claude trait impl signature**

In `crates/executors/src/executors/claude.rs:301`, replace:

```rust
    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
```

with:

```rust
    fn normalize_logs(
        &self,
        msg_store: Arc<dyn crate::logs::utils::ConversationSink>,
        current_dir: &Path,
    ) {
```

The body keeps using `msg_store` as before because both `push_patch` and `clone()` work via the trait object.

- [ ] **Step 4: Update internal Claude helpers**

In `crates/executors/src/executors/claude.rs`, find each function whose first parameter is `Arc<MsgStore>` (e.g. `ClaudeLogProcessor::process_logs` at line 526, `normalize_claude_stderr_logs` at line 66) and change the type to `Arc<dyn crate::logs::utils::ConversationSink>`. Run:

```bash
grep -n "Arc<MsgStore>" crates/executors/src/executors/claude.rs
```

Update each match. Internal `EntryIndexProvider::start_from(&msg_store)` calls become `EntryIndexProvider::start_from(msg_store.as_ref())` (since the helper now takes `&dyn ConversationSink` and `Arc::as_ref` returns `&T`).

For test-fixture sites in this file (e.g. `cursor.rs:1253`, `claude.rs:2974`, `codex/normalize_logs.rs:2729`) that construct `Arc::new(MsgStore::new())` and pass it to `process_logs`-like helpers, they continue to work because `Arc<MsgStore>` already implements `ConversationSink` from Task 3 — no change needed at the test fixture sites themselves.

- [ ] **Step 5: Build only the executors crate**

```bash
cargo check -p executors
```

Expected: only `claude.rs` and `mod.rs` are affected so far. Other executors will fail because their `normalize_logs` impls don't match the new trait signature — that's the goal of subsequent tasks. If `claude.rs` itself has compile errors, fix them before continuing (probably another helper signature missed in step 4).

- [ ] **Step 6: Commit**

```bash
git add crates/executors/src/executors/mod.rs crates/executors/src/executors/claude.rs crates/executors/src/logs/utils/entry_index.rs
git commit -m "refactor(executors): switch ClaudeCode normalize_logs to ConversationSink"
```

---

## Task 10: Ripple — codex, cursor, droid, opencode, mimo_code, acp executors

These six executors are the highest-traffic. Update each in the same shape as Task 9.

**Files:**
- Modify each:
  - `crates/executors/src/executors/codex.rs`
  - `crates/executors/src/executors/codex/normalize_logs.rs`
  - `crates/executors/src/executors/cursor.rs`
  - `crates/executors/src/executors/droid.rs`
  - `crates/executors/src/executors/droid/normalize_logs.rs`
  - `crates/executors/src/executors/opencode.rs`
  - `crates/executors/src/executors/opencode/normalize_logs.rs`
  - `crates/executors/src/executors/mimo_code.rs`
  - `crates/executors/src/executors/mimo_code/normalize_logs.rs`
  - `crates/executors/src/executors/acp/normalize_logs.rs`
  - `crates/executors/src/executors/acp.rs` (if present)

- [ ] **Step 1: For each file above, change every `Arc<MsgStore>` parameter to `Arc<dyn crate::logs::utils::ConversationSink>`**

In each file, run:

```bash
grep -n "Arc<MsgStore>" crates/executors/src/executors/<file>
```

Replace every parameter type. For the `normalize_logs` trait impl, also widen its first argument to match the trait. Inside bodies, no logic changes — `push_patch`, `push_stdout`, `clone()` all continue to work because they're either trait methods or `Arc::clone`.

For each free `pub fn normalize_logs(msg_store: Arc<MsgStore>, ...)` in the `*/normalize_logs.rs` files, change the first parameter type the same way.

- [ ] **Step 2: Update calls to `EntryIndexProvider::start_from`**

In every file you touch, calls of the form `EntryIndexProvider::start_from(&msg_store)` may need to become `EntryIndexProvider::start_from(msg_store.as_ref())` because the helper now takes `&dyn ConversationSink` and `&Arc<T>` does not auto-coerce in this position.

- [ ] **Step 3: Build only this subset**

```bash
cargo check -p executors
```

Fix compile errors as they arise. Most will be missed `Arc<MsgStore>` parameters in private helpers. The pattern is mechanical.

- [ ] **Step 4: Commit per executor or as a batch when all 6 compile**

```bash
git add crates/executors/src/executors/codex* crates/executors/src/executors/cursor* crates/executors/src/executors/droid* crates/executors/src/executors/opencode* crates/executors/src/executors/mimo_code* crates/executors/src/executors/acp*
git commit -m "refactor(executors): switch codex/cursor/droid/opencode/mimo_code/acp to ConversationSink"
```

---

## Task 11: Ripple — remaining executors

**Files:**
- Modify every remaining file under `crates/executors/src/executors/*.rs` that mentions `Arc<MsgStore>`. Enumerate with:

```bash
grep -l "Arc<MsgStore>" crates/executors/src/executors/*.rs
```

The remaining files (after Tasks 9 and 10) are: `amp.rs`, `auggie.rs`, `autohand.rs`, `cline.rs`, `codebuddy_code.rs`, `copilot.rs`, `corust_agent.rs`, `crow_cli.rs`, `deepagents.rs`, `dimcode.rs`, `fast_agent.rs`, `gemini.rs`, `goose.rs`, `junie.rs`, `kilo.rs`, `kimi.rs`, `minion_code.rs`, `mistral_vibe.rs`, `nova.rs`, `pi_acp.rs`, `qa_mock.rs`, `qoder.rs`, `qwen.rs`, `stakpak.rs`. Re-grep at execution time — the list may shift.

- [ ] **Step 1: For each file, perform the same parameter-type substitution as Task 10 step 1**

Type-only change. No body logic change.

- [ ] **Step 2: Build the full workspace**

```bash
cargo check --workspace --all-targets
```

Expected: clean. Any remaining failure indicates a missed callsite.

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

```bash
cargo test --workspace --all-targets
```

Expected: PASS. The signature widening is type-only and doesn't change runtime behavior of any existing test.

- [ ] **Step 4: Commit**

```bash
git add crates/executors
git commit -m "refactor(executors): switch all remaining executors to ConversationSink"
```

---

## Task 12: Wrap `MsgStore` at orchestration callsites

**Files:**
- Modify: `crates/local-deployment/src/container.rs:1128`
- Modify: `crates/services/src/services/container.rs:1407` and `:1414`
- Modify: `crates/services/src/services/session_export.rs:146`

- [ ] **Step 1: Re-verify the callsite list**

```bash
grep -rn "executor.normalize_logs(\|\.normalize_logs(" crates/local-deployment crates/services
```

Confirm the four sites listed above. If new sites have appeared, they must also be wrapped. (Test-only sites under `crates/executors/` continue to use the blanket `Arc<MsgStore>` impl and need no change.)

- [ ] **Step 2: Wrap in `local-deployment/src/container.rs:1128`**

Locate the line:

```rust
        executor.normalize_logs(msg_store.clone(), working_dir);
```

Replace with:

```rust
        let sink: std::sync::Arc<dyn executors::logs::utils::ConversationSink> =
            executors::logs::utils::ConversationMsgStore::wrap(msg_store.clone());
        executor.normalize_logs(sink, working_dir);
```

Add necessary `use` lines or use the fully qualified path inline. The `executors` crate is already a dependency of `local-deployment` (verify with the existing imports at the top of the file).

- [ ] **Step 3: Wrap in `services/src/services/container.rs:1407` (qa-mode branch)**

```rust
        #[cfg(feature = "qa-mode")]
        {
            let executor = QaMockExecutor;
            let sink: std::sync::Arc<dyn executors::logs::utils::ConversationSink> =
                executors::logs::utils::ConversationMsgStore::wrap(msg_store);
            executor.normalize_logs(sink, &working_dir);
        }
```

- [ ] **Step 4: Wrap in `services/src/services/container.rs:1414` (regular branch)**

```rust
        #[cfg(not(feature = "qa-mode"))]
        {
            if let Some(executor) =
                ExecutorConfigs::get_cached().get_coding_agent(executor_profile_id)
            {
                let sink: std::sync::Arc<dyn executors::logs::utils::ConversationSink> =
                    executors::logs::utils::ConversationMsgStore::wrap(msg_store);
                executor.normalize_logs(sink, &working_dir);
            } else {
                tracing::error!(
                    "Failed to resolve profile '{:?}' for normalization",
                    executor_profile_id
                );
            }
        }
```

- [ ] **Step 5: Replay path in `services/src/services/session_export.rs:146`**

The replay path reads pre-stamped data from the DB and re-feeds through the executor. Wrapping is harmless (the wrapper sees existing entries and re-stamps them with `now`, but stored timing fields are not re-uploaded — they're already in the DB rows). For uniformity, wrap anyway:

```rust
    let sink: std::sync::Arc<dyn executors::logs::utils::ConversationSink> =
        executors::logs::utils::ConversationMsgStore::wrap(store.clone());
    executor.normalize_logs(sink, &worktree_path);
```

Confirm the actual `executors` crate import path in this file (likely already imported as `executors` near the top of the file). Adjust if the project uses a different alias.

- [ ] **Step 6: Build the workspace**

```bash
cargo check --workspace --all-targets
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add crates/local-deployment crates/services
git commit -m "feat(orchestration): wrap MsgStore with ConversationMsgStore at executor entry points"
```

---

## Task 13: Backend integration test — qa_mock end-to-end

**Files:**
- Modify: `crates/executors/src/executors/qa_mock.rs` (add a `#[cfg(test)] mod tests` block).

- [ ] **Step 1: Add an integration test**

Append to `crates/executors/src/executors/qa_mock.rs`:

```rust
#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use workspace_utils::{log_msg::LogMsg, msg_store::MsgStore};

    use super::*;
    use crate::logs::{
        NormalizedEntryType, ToolStatus,
        utils::{ConversationMsgStore, ConversationSink, extract_normalized_entry_from_patch},
    };

    /// Pushes a synthetic Claude-format JSON line through the qa_mock executor's
    /// log normalizer (which delegates to the Claude processor) and asserts the
    /// resulting ToolUse entries carry timing data.
    #[tokio::test]
    async fn qa_mock_normalize_stamps_tool_timing() {
        let inner = Arc::new(MsgStore::new());
        let sink: Arc<dyn ConversationSink> = ConversationMsgStore::wrap(inner.clone());

        // Push a synthetic ClaudeJson assistant turn with one tool_use entry,
        // then a tool_result entry. The exact JSON shape is what claude.rs emits
        // for stream-json. Use the smallest valid synthetic that produces
        // a Created -> Success transition.
        let assistant_json = serde_json::json!({
            "type": "assistant",
            "message": {
                "id": "msg_1",
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "Read",
                    "input": {"file_path": "/tmp/x"}
                }],
                "stop_reason": null,
                "usage": {"input_tokens": 0, "output_tokens": 0}
            }
        });
        let result_json = serde_json::json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": "toolu_1",
                    "content": "ok",
                    "is_error": false
                }]
            }
        });

        sink.push_stdout(format!("{assistant_json}\n"));
        sink.push_stdout(format!("{result_json}\n"));
        sink.push_finished();

        let executor = QaMockExecutor;
        executor.normalize_logs(sink.clone(), std::path::Path::new("/tmp"));

        // Allow normalizer tasks to drain
        tokio::time::sleep(Duration::from_millis(200)).await;

        let history = inner.get_history();
        let tool_use = history
            .into_iter()
            .filter_map(|m| match m {
                LogMsg::JsonPatch(p) => extract_normalized_entry_from_patch(&p),
                _ => None,
            })
            .filter_map(|(_, entry)| match entry.entry_type {
                NormalizedEntryType::ToolUse { .. } => Some(entry),
                _ => None,
            })
            .last()
            .expect("expected at least one ToolUse entry in history");

        match tool_use.entry_type {
            NormalizedEntryType::ToolUse {
                status,
                started_at,
                completed_at,
                approved_at,
                ..
            } => {
                assert!(matches!(status, ToolStatus::Success | ToolStatus::Failed));
                assert!(started_at.is_some(), "started_at should be stamped");
                assert!(completed_at.is_some(), "completed_at should be stamped");
                assert_eq!(approved_at, None, "no approval phase, should stay None");
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }
}
```

If the synthetic ClaudeJson shape needs adjustment to match the Claude processor's parser (the parser's expectations may have evolved), inspect `crates/executors/src/executors/claude.rs` for how `ClaudeJson` deserializes and adjust `assistant_json` / `result_json` accordingly. The parser is the source of truth for what valid synthetic input looks like.

- [ ] **Step 2: Run the test**

```bash
cargo test -p executors qa_mock::tests::qa_mock_normalize_stamps_tool_timing -- --nocapture
```

Expected: PASS. If it fails because the synthetic JSON isn't recognized by the Claude parser, fix the JSON shape (search for "ClaudeJson" / "process_logs" in claude.rs to find the expected format, or scaffold against an existing snapshot test fixture in claude.rs).

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/qa_mock.rs
git commit -m "test(qa-mock): integration test asserting tool-timing capture end-to-end"
```

---

## Task 14: Frontend — `aggregateToolUsageStats` first failing test

**Files:**
- Create: `frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts`
- Create (will fill out across subsequent tasks): `frontend/src/hooks/useConversationHistory/aggregateToolUsageStats.ts`

- [ ] **Step 1: Write the failing test for the empty-input case**

Create `frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import type { NormalizedEntry } from '../../../../shared/types';
import { aggregateToolUsageStats } from '../aggregateToolUsageStats';

describe('aggregateToolUsageStats', () => {
  it('returns null for empty entries', () => {
    expect(aggregateToolUsageStats([], null)).toBeNull();
  });

  it('returns null when no tool_use entries are present', () => {
    const entries: NormalizedEntry[] = [
      {
        entry_type: { type: 'assistant_message' },
        content: 'hi',
        timestamp: null,
      },
    ];
    expect(aggregateToolUsageStats(entries, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — should fail because the file doesn't exist**

```bash
cd frontend && pnpm test -- aggregateToolUsageStats
```

Expected: FAIL — `Cannot find module '../aggregateToolUsageStats'`.

- [ ] **Step 3: Create a minimal `aggregateToolUsageStats.ts`**

Create `frontend/src/hooks/useConversationHistory/aggregateToolUsageStats.ts`:

```typescript
import type {
  NormalizedEntry,
  ToolStat,
  ToolUsageStats,
} from '../../../shared/types';

export function aggregateToolUsageStats(
  entries: NormalizedEntry[],
  taskDurationSeconds: number | null
): ToolUsageStats | null {
  const toolUses = entries.filter(
    (e) => e.entry_type.type === 'tool_use'
  );
  if (toolUses.length === 0) return null;

  // Implementation deferred to subsequent tasks; for now, return a minimal
  // valid shape so the empty-input contract holds.
  const _ignored: ToolStat[] = [];
  return {
    per_tool: _ignored,
    total_calls: toolUses.length,
    total_seconds: 0,
    task_duration_seconds: taskDurationSeconds,
  };
}
```

- [ ] **Step 4: Run — both tests should pass**

```bash
cd frontend && pnpm test -- aggregateToolUsageStats
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useConversationHistory
git commit -m "feat(frontend): scaffold aggregateToolUsageStats with empty-input handling"
```

---

## Task 15: Frontend — single-tool aggregation with timing

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/aggregateToolUsageStats.ts`
- Modify: `frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts`

- [ ] **Step 1: Add a failing test**

Append to the test file inside the `describe` block:

```typescript
  function makeToolUse(overrides: {
    tool_name: string;
    statusType:
      | 'created'
      | 'success'
      | 'failed'
      | 'denied'
      | 'pending_approval'
      | 'timed_out';
    started_at?: string;
    approved_at?: string;
    completed_at?: string;
  }): NormalizedEntry {
    const status =
      overrides.statusType === 'denied'
        ? { status: 'denied' as const, reason: null }
        : overrides.statusType === 'pending_approval'
          ? { status: 'pending_approval' as const, approval_id: 'a' }
          : { status: overrides.statusType as Exclude<typeof overrides.statusType, 'denied' | 'pending_approval'> };

    return {
      entry_type: {
        type: 'tool_use',
        tool_name: overrides.tool_name,
        action_type: { action: 'other', description: '' },
        status,
        ...(overrides.started_at && { started_at: overrides.started_at }),
        ...(overrides.approved_at && { approved_at: overrides.approved_at }),
        ...(overrides.completed_at && { completed_at: overrides.completed_at }),
      },
      content: '',
      timestamp: null,
    };
  }

  it('aggregates a single tool with three success calls', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        completed_at: '2026-06-01T00:00:02Z',
      }),
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:10Z',
        completed_at: '2026-06-01T00:00:13Z',
      }),
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:20Z',
        completed_at: '2026-06-01T00:00:21Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, 100);

    expect(stats).not.toBeNull();
    expect(stats!.per_tool).toHaveLength(1);
    const bash = stats!.per_tool[0];
    expect(bash.tool_name).toBe('Bash');
    expect(bash.count).toBe(3);
    expect(bash.success).toBe(3);
    expect(bash.total_seconds).toBeCloseTo(2 + 3 + 1);
    expect(bash.avg_seconds).toBeCloseTo(2);
    expect(bash.max_seconds).toBeCloseTo(3);
    expect(bash.in_progress).toBe(0);
    expect(bash.awaiting_approval_seconds).toBe(0);
    expect(bash.approved_call_count).toBe(0);
    expect(stats!.total_calls).toBe(3);
    expect(stats!.total_seconds).toBeCloseTo(6);
    expect(stats!.task_duration_seconds).toBe(100);
  });
```

- [ ] **Step 2: Run — should fail with empty per_tool**

```bash
cd frontend && pnpm test -- aggregateToolUsageStats
```

Expected: FAIL — `per_tool` is empty.

- [ ] **Step 3: Implement aggregation**

Replace `aggregateToolUsageStats.ts` with:

```typescript
import type {
  NormalizedEntry,
  ToolStat,
  ToolUsageStats,
} from '../../../shared/types';

interface Accumulator {
  count: number;
  success: number;
  failed: number;
  denied: number;
  timed_out: number;
  in_progress: number;
  count_with_timing: number;
  total_seconds: number;
  max_seconds: number;
  awaiting_approval_seconds: number;
  approved_call_count: number;
}

function emptyAccumulator(): Accumulator {
  return {
    count: 0,
    success: 0,
    failed: 0,
    denied: 0,
    timed_out: 0,
    in_progress: 0,
    count_with_timing: 0,
    total_seconds: 0,
    max_seconds: 0,
    awaiting_approval_seconds: 0,
    approved_call_count: 0,
  };
}

function durationSeconds(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, (end - start) / 1000);
}

export function aggregateToolUsageStats(
  entries: NormalizedEntry[],
  taskDurationSeconds: number | null
): ToolUsageStats | null {
  const buckets = new Map<string, Accumulator>();

  for (const entry of entries) {
    if (entry.entry_type.type !== 'tool_use') continue;
    const tu = entry.entry_type;
    const acc = buckets.get(tu.tool_name) ?? emptyAccumulator();
    acc.count += 1;

    switch (tu.status.status) {
      case 'success':
        acc.success += 1;
        break;
      case 'failed':
        acc.failed += 1;
        break;
      case 'denied':
        acc.denied += 1;
        break;
      case 'timed_out':
        acc.timed_out += 1;
        break;
      default:
        // Created / PendingApproval don't increment any terminal counter
        break;
    }

    const startedAt = (tu as { started_at?: string | null }).started_at;
    const completedAt = (tu as { completed_at?: string | null }).completed_at;
    const approvedAt = (tu as { approved_at?: string | null }).approved_at;

    if (startedAt && !completedAt) {
      acc.in_progress += 1;
    }

    if (startedAt && completedAt) {
      const dur = durationSeconds(startedAt, completedAt);
      acc.count_with_timing += 1;
      acc.total_seconds += dur;
      if (dur > acc.max_seconds) acc.max_seconds = dur;
    }

    if (startedAt && approvedAt) {
      acc.awaiting_approval_seconds += durationSeconds(startedAt, approvedAt);
      acc.approved_call_count += 1;
    }

    buckets.set(tu.tool_name, acc);
  }

  if (buckets.size === 0) return null;

  const per_tool: ToolStat[] = Array.from(buckets.entries())
    .map(([tool_name, acc]): ToolStat => ({
      tool_name,
      count: acc.count,
      success: acc.success,
      failed: acc.failed,
      denied: acc.denied,
      timed_out: acc.timed_out,
      in_progress: acc.in_progress,
      total_seconds: acc.total_seconds,
      avg_seconds:
        acc.count_with_timing > 0
          ? acc.total_seconds / acc.count_with_timing
          : 0,
      max_seconds: acc.max_seconds,
      awaiting_approval_seconds: acc.awaiting_approval_seconds,
      approved_call_count: acc.approved_call_count,
    }))
    .sort((a, b) => b.total_seconds - a.total_seconds);

  const total_calls = per_tool.reduce((acc, t) => acc + t.count, 0);
  const total_seconds = per_tool.reduce((acc, t) => acc + t.total_seconds, 0);

  return {
    per_tool,
    total_calls,
    total_seconds,
    task_duration_seconds: taskDurationSeconds,
  };
}
```

- [ ] **Step 4: Run all tests**

```bash
cd frontend && pnpm test -- aggregateToolUsageStats
```

Expected: PASS for all three tests so far.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useConversationHistory
git commit -m "feat(frontend): aggregate tool usage stats per-tool with timing"
```

---

## Task 16: Frontend aggregation — remaining edge cases

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts` (append tests for status mix, missing timing, in_progress, approved_at, clock skew, null taskDuration).

- [ ] **Step 1: Add the remaining tests**

Append to the test file (inside the existing `describe`):

```typescript
  it('groups by tool_name and splits status counts', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
      makeToolUse({ tool_name: 'Bash', statusType: 'failed' }),
      makeToolUse({ tool_name: 'Read', statusType: 'success' }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool.find((t) => t.tool_name === 'Bash')!;
    const read = stats.per_tool.find((t) => t.tool_name === 'Read')!;
    expect(bash.count).toBe(3);
    expect(bash.success).toBe(2);
    expect(bash.failed).toBe(1);
    expect(read.count).toBe(1);
    expect(read.success).toBe(1);
  });

  it('counts entries with no started_at but excludes them from totals', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        completed_at: '2026-06-01T00:00:02Z',
      }),
      // Legacy: no timing fields
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool[0];
    expect(bash.count).toBe(2);
    expect(bash.total_seconds).toBeCloseTo(2);
    expect(bash.avg_seconds).toBeCloseTo(2); // divided by count_with_timing=1
  });

  it('marks in_progress when started_at present but completed_at missing', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'created',
        started_at: '2026-06-01T00:00:00Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    expect(stats.per_tool[0].in_progress).toBe(1);
    expect(stats.per_tool[0].total_seconds).toBe(0);
  });

  it('sums awaiting_approval_seconds only over calls with approved_at', () => {
    const entries: NormalizedEntry[] = [
      // Approved call: 5s wait, total 6s
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:00Z',
        approved_at: '2026-06-01T00:00:05Z',
        completed_at: '2026-06-01T00:00:06Z',
      }),
      // Auto-approved call (no approval phase): 2s total
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:01:00Z',
        completed_at: '2026-06-01T00:01:02Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    const bash = stats.per_tool[0];
    expect(bash.approved_call_count).toBe(1);
    expect(bash.awaiting_approval_seconds).toBeCloseTo(5);
    expect(bash.total_seconds).toBeCloseTo(8);
  });

  it('clamps negative duration to zero (clock skew)', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({
        tool_name: 'Bash',
        statusType: 'success',
        started_at: '2026-06-01T00:00:10Z',
        completed_at: '2026-06-01T00:00:00Z',
      }),
    ];
    const stats = aggregateToolUsageStats(entries, null)!;
    expect(stats.per_tool[0].total_seconds).toBe(0);
    expect(stats.per_tool[0].max_seconds).toBe(0);
  });

  it('passes taskDurationSeconds through to the result', () => {
    const entries: NormalizedEntry[] = [
      makeToolUse({ tool_name: 'Bash', statusType: 'success' }),
    ];
    expect(aggregateToolUsageStats(entries, null)!.task_duration_seconds).toBeNull();
    expect(aggregateToolUsageStats(entries, 42)!.task_duration_seconds).toBe(42);
  });
```

- [ ] **Step 2: Run all tests**

```bash
cd frontend && pnpm test -- aggregateToolUsageStats
```

Expected: PASS for every test. The implementation in Task 15 already covers these cases.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/__tests__/aggregateToolUsageStats.test.ts
git commit -m "test(frontend): cover edge cases for tool-usage aggregation"
```

---

## Task 17: Frontend — `toolUsageStatsPatch` helper and injection

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/constants.ts` (add helper after `taskDurationPatch`).
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` (inject before each `taskDurationPatch` call at lines ~416 and ~916).

- [ ] **Step 1: Add `toolUsageStatsPatch` helper**

Append to `frontend/src/hooks/useConversationHistory/constants.ts`:

```typescript
import type { ToolUsageStats } from '../../../shared/types';

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

(Move the `import type { ToolUsageStats }` line into the existing import block at the top of the file rather than re-importing.)

- [ ] **Step 2: Inject at the first `taskDurationPatch` site**

In `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` around line 415–423, the existing block looks like:

```typescript
              entries.push(
                taskDurationPatch(
                  p.executionProcess.id,
                  liveProcess.started_at as string,
                  liveProcess.completed_at as string,
                  durationSeconds
                )
              );
```

Change it to inject the stats patch just before the duration patch:

```typescript
              const usageStats = aggregateToolUsageStats(
                p.entries
                  .filter((e) => e.type === 'NORMALIZED_ENTRY')
                  .map((e) => e.content),
                durationSeconds
              );
              if (usageStats) {
                entries.push(
                  toolUsageStatsPatch(p.executionProcess.id, usageStats)
                );
              }
              entries.push(
                taskDurationPatch(
                  p.executionProcess.id,
                  liveProcess.started_at as string,
                  liveProcess.completed_at as string,
                  durationSeconds
                )
              );
```

Add the necessary imports near the top of `useConversationHistoryOld.ts`:

```typescript
import {
  /* existing imports… */
  taskDurationPatch,
  toolUsageStatsPatch,
} from './constants';
import { aggregateToolUsageStats } from './aggregateToolUsageStats';
```

- [ ] **Step 3: Inject at the second `taskDurationPatch` site**

Around line 915–923, mirror the same injection pattern, using `proc.entries` (the surrounding variable name) and `(endMs - startMs) / 1000` for the duration argument:

```typescript
        const flatDuration = (endMs - startMs) / 1000;
        const flatUsageStats = aggregateToolUsageStats(
          proc.entries
            .filter((e) => e.type === 'NORMALIZED_ENTRY')
            .map((e) => e.content),
          flatDuration
        );
        if (flatUsageStats) {
          flat.push(toolUsageStatsPatch(ep.id, flatUsageStats));
        }
        flat.push(
          taskDurationPatch(
            ep.id,
            live.started_at as string,
            live.completed_at as string,
            flatDuration
          )
        );
```

Make sure variable names match the surrounding context. If they differ, adapt — the goal is "compute stats, push patch if non-null, then push duration patch."

- [ ] **Step 4: Frontend type-check**

```bash
cd frontend && pnpm run check
```

Expected: PASS. If TypeScript complains that `entry_type` doesn't have a `'tool_usage_stats'` discriminant, re-run `pnpm run generate-types` from the workspace root and commit `shared/types.ts` with that change.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useConversationHistory shared/types.ts
git commit -m "feat(frontend): inject toolUsageStatsPatch alongside taskDurationPatch"
```

---

## Task 18: Frontend — `ToolUsageStatsCard` component

**Files:**
- Create: `frontend/src/components/NormalizedConversation/ToolUsageStatsCard.tsx`

- [ ] **Step 1: Implement the component**

Create `frontend/src/components/NormalizedConversation/ToolUsageStatsCard.tsx`:

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';

import type { ToolStat, ToolUsageStats } from '../../../shared/types';
import { formatDuration } from '../../utils/format';

interface Props {
  stats: ToolUsageStats;
}

/// "Has timing data" proxy: at least one call is not in_progress (i.e. some
/// call reached a terminal status), so total_seconds reflects real durations.
function hasTimingData(row: ToolStat): boolean {
  return row.in_progress < row.count;
}

export function ToolUsageStatsCard({ stats }: Props) {
  const [expanded, setExpanded] = useState(false);

  const inProgressTotal = stats.per_tool.reduce(
    (acc, t) => acc + t.in_progress,
    0
  );
  const percentOfTask =
    stats.task_duration_seconds && stats.task_duration_seconds > 0
      ? Math.round((stats.total_seconds / stats.task_duration_seconds) * 100)
      : null;

  const annotatedTools = stats.per_tool.filter(
    (t) => t.approved_call_count > 0
  );

  return (
    <div className="px-4 py-2 text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Wrench className="h-3 w-3" />
        <span>
          Tool calls {stats.total_calls} · Total{' '}
          {formatDuration(stats.total_seconds)}
          {percentOfTask !== null && ` · ${percentOfTask}% of task`}
          {inProgressTotal > 0 && ` · ${inProgressTotal} in progress`}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 ml-5 rounded border border-border bg-background overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-2 py-1 font-medium">Tool</th>
                <th className="text-right px-2 py-1 font-medium">Count</th>
                <th className="text-right px-2 py-1 font-medium">
                  ✓ / ✗ / ⊘
                </th>
                <th className="text-right px-2 py-1 font-medium">Total</th>
                <th className="text-right px-2 py-1 font-medium">Avg</th>
                <th className="text-right px-2 py-1 font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {stats.per_tool.map((row) => {
                const hasTiming = hasTimingData(row);
                return (
                  <tr key={row.tool_name} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1 font-mono">{row.tool_name}</td>
                    <td className="px-2 py-1 text-right">{row.count}</td>
                    <td
                      className="px-2 py-1 text-right"
                      title={`${row.success} success, ${row.failed} failed, ${row.denied} denied, ${row.timed_out} timed_out`}
                    >
                      {row.success} / {row.failed} / {row.denied}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDuration(row.total_seconds) : '—'}
                      {row.approved_call_count > 0 && ' †'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDuration(row.avg_seconds) : '—'}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {hasTiming ? formatDuration(row.max_seconds) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {annotatedTools.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-2 py-1 text-[11px]">
              {annotatedTools.map((row) => (
                <div key={row.tool_name}>
                  † {row.tool_name}: {row.approved_call_count} of {row.count}{' '}
                  call{row.count === 1 ? '' : 's'} awaited approval (
                  {formatDuration(row.awaiting_approval_seconds)} total)
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

If `formatDuration` does not exist at `frontend/src/utils/format`, locate the existing helper used by `DisplayConversationEntry.tsx` for `task_duration` (around line 1057 — see the existing `task_duration` branch). Search:

```bash
grep -rn "function formatDuration\|export.*formatDuration" frontend/src/
```

Use whichever module exposes it and adjust the import.

- [ ] **Step 2: Frontend type-check**

```bash
cd frontend && pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NormalizedConversation/ToolUsageStatsCard.tsx
git commit -m "feat(frontend): add ToolUsageStatsCard component (legacy design)"
```

---

## Task 19: Frontend — wire `ToolUsageStatsCard` into the entry dispatcher

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` (around line 1046, alongside the `task_duration` branch).

- [ ] **Step 1: Add the dispatch branch**

In `DisplayConversationEntry.tsx`, immediately above the existing `if (entry.entry_type.type === 'task_duration')` block (around line 1046), add:

```tsx
  if (entry.entry_type.type === 'tool_usage_stats') {
    return <ToolUsageStatsCard stats={entry.entry_type} />;
  }
```

Add the import at the top of the file:

```tsx
import { ToolUsageStatsCard } from './ToolUsageStatsCard';
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm run check
```

Expected: PASS.

- [ ] **Step 3: Lint**

```bash
cd frontend && pnpm run lint
```

Expected: PASS. If unused-import or unused-variable warnings come up, clean them up.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "feat(frontend): render ToolUsageStatsCard for tool_usage_stats entries"
```

---

## Task 20: Frontend — render test for `ToolUsageStatsCard`

**Files:**
- Create: `frontend/src/components/NormalizedConversation/__tests__/ToolUsageStatsCard.test.tsx`

- [ ] **Step 1: Add the test**

Create `frontend/src/components/NormalizedConversation/__tests__/ToolUsageStatsCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ToolUsageStats } from '../../../../shared/types';
import { ToolUsageStatsCard } from '../ToolUsageStatsCard';

const baseStats: ToolUsageStats = {
  per_tool: [
    {
      tool_name: 'Bash',
      count: 12,
      success: 11,
      failed: 1,
      denied: 0,
      timed_out: 0,
      in_progress: 0,
      total_seconds: 8.2,
      avg_seconds: 0.7,
      max_seconds: 3.1,
      awaiting_approval_seconds: 5.1,
      approved_call_count: 3,
    },
    {
      tool_name: 'Read',
      count: 6,
      success: 6,
      failed: 0,
      denied: 0,
      timed_out: 0,
      in_progress: 0,
      total_seconds: 0.4,
      avg_seconds: 0.07,
      max_seconds: 0.2,
      awaiting_approval_seconds: 0,
      approved_call_count: 0,
    },
  ],
  total_calls: 18,
  total_seconds: 8.6,
  task_duration_seconds: 100,
};

describe('ToolUsageStatsCard', () => {
  it('renders collapsed header with count, total, and percentage', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    expect(screen.getByText(/Tool calls 18/)).toBeInTheDocument();
    expect(screen.getByText(/9% of task/)).toBeInTheDocument();
    // Table is not rendered when collapsed
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('expands to a table with one row per tool when clicked', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    fireEvent.click(screen.getByText(/Tool calls 18/));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('renders the † footnote only for tools with approved_call_count > 0', () => {
    render(<ToolUsageStatsCard stats={baseStats} />);
    fireEvent.click(screen.getByText(/Tool calls 18/));
    expect(screen.getByText(/3 of 12 call(s)? awaited approval/)).toBeInTheDocument();
    // Read should not have a footnote line
    expect(screen.queryByText(/Read.*awaited approval/)).toBeNull();
  });

  it('hides "% of task" when task_duration_seconds is null', () => {
    render(
      <ToolUsageStatsCard stats={{ ...baseStats, task_duration_seconds: null }} />
    );
    expect(screen.queryByText(/% of task/)).toBeNull();
  });

  it('shows in-progress count in header when any tool has in_progress > 0', () => {
    const withInProgress: ToolUsageStats = {
      ...baseStats,
      per_tool: [
        { ...baseStats.per_tool[0], in_progress: 2 },
        baseStats.per_tool[1],
      ],
    };
    render(<ToolUsageStatsCard stats={withInProgress} />);
    expect(screen.getByText(/2 in progress/)).toBeInTheDocument();
  });
});
```

If a different testing library setup is in use (e.g. plain Vitest without Testing Library), check existing component tests under `frontend/src/components/**/__tests__/` for the canonical setup and mirror it. If `@testing-library/react` is not installed, install it:

```bash
cd frontend && pnpm add -D @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Run**

```bash
cd frontend && pnpm test -- ToolUsageStatsCard
```

Expected: PASS for all five tests. Adjust the percentage assertion (`9% of task`) if `formatDuration` produces a different rounding — `8.6 / 100 = 8.6%` rounds to `9`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NormalizedConversation/__tests__/ToolUsageStatsCard.test.tsx
git commit -m "test(frontend): cover ToolUsageStatsCard rendering"
```

---

## Task 21: Final smoke verification

**Files:** none — verification only.

- [ ] **Step 1: Run full backend suite**

```bash
cargo test --workspace --all-targets
```

Expected: PASS.

- [ ] **Step 2: Run frontend checks**

```bash
pnpm run check
pnpm run lint
cd frontend && pnpm test
```

Expected: PASS.

- [ ] **Step 3: SQLx prepare verification**

```bash
pnpm run prepare-db
```

Expected: clean (no schema-affecting changes were made).

- [ ] **Step 4: Manual smoke test**

```bash
pnpm run dev
```

Open the dev URL printed by the dev script. Run a coding-agent task that uses at least 2-3 tool calls. After the task completes:

1. Confirm the new "Tool calls N · Total Xs · Y% of task" card appears in the conversation, between the last entry and the existing TaskDuration card.
2. Click to expand. Confirm the table shows one row per tool, with reasonable Total / Avg / Max numbers.
3. If any tool went through approval (e.g. the user clicked "approve" on a Bash command), confirm a `†` marker appears on that row and the bottom footnote describes the approval wait.

If the card doesn't appear:
- Browser console / network tab: check that the SSE stream contains `started_at`/`completed_at` fields on tool_use entries.
- If the entries lack those fields, the wrapper isn't being installed. Recheck Task 12 wiring at `local-deployment/src/container.rs`.

- [ ] **Step 5: Commit (no-op if nothing changed) and prepare for PR**

```bash
git status
# If everything is clean, the work is done.
```

---

## Self-review checklist

- [x] **Spec coverage:**
  - §1.1 ToolUse extension → Task 1
  - §1.2 ToolUsageStats / ToolStat → Task 2
  - §1.3 Type generation → Task 2 step 4
  - §2.1 ConversationSink trait + blanket Arc<MsgStore> impl → Task 3
  - §2.2 ConversationMsgStore wrapper → Tasks 3, 4
  - §2.3 Stamping algorithm → Tasks 4–8 (one rule per task)
  - §2.4 Patch shape detection (op_kind, REMOVE) → Task 7
  - §2.5 Trait signature change + call-graph propagation → Tasks 9–11
  - §2.5 Orchestration callsite wrapping → Task 12
  - §3.1 aggregateToolUsageStats → Tasks 14–16
  - §3.2 toolUsageStatsPatch + injection → Task 17
  - §3.3 ToolUsageStatsCard → Tasks 18, 19
  - §4 edge cases → covered by tests in Tasks 7, 8, 16, 20
  - §5.1 wrapper unit tests → Tasks 4–8
  - §5.2 qa_mock integration → Task 13
  - §5.3 frontend aggregation tests → Tasks 14–16
  - §5.4 card render tests → Task 20
  - §6.1 implementation order → matches the task numbering
  - §6.2 rollback → no separate task; implicit (Task 12 is the cut-line)

- [x] **No placeholders:** every step contains the actual code or command. No "TBD", "TODO", "implement later", or "similar to Task N" without showing the code.

- [x] **Type consistency:** `ConversationMsgStore::wrap_with_clock`, `Clock`, `SystemClock`, `MockClock`, `ConversationSink` all match between Tasks 3, 4, 5, 6, 7, 8, 13. Frontend `aggregateToolUsageStats(entries, taskDurationSeconds)` signature is consistent across Tasks 14, 15, 16, 17. `ToolStat` field names match between Tasks 2, 15, 18, 20.

- [x] **Bite-sized:** every task has a TDD shape (failing test → impl → passing test → commit) where applicable. Pure refactor tasks (9, 10, 11, 12) gate on `cargo check` / `cargo test` instead.

## Caveat: trait signature ripple

Tasks 9–11 propagate `Arc<MsgStore>` → `Arc<dyn ConversationSink>` through ~77 callsites in the executors crate. The spec described this as "signature only — no internal logic touched", which is true at the body level but does mean every helper function in the executors crate that accepts `Arc<MsgStore>` must change parameter type. This is mechanical and the blanket `Arc<MsgStore>` impl from Task 3 means existing test fixtures that construct `Arc::new(MsgStore::new())` continue to compile without further change. If during Task 11 the engineer hits unexpected friction (e.g. a helper signature that's hard to widen because of generic bounds), they should pause and surface to the user before forcing through.
