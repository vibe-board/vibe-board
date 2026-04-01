# SQLite update_hook Race Condition Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix lost event notifications caused by SQLite update_hook's `find_by_rowid` querying a separate connection before the write transaction commits.

**Architecture:** Add a retry loop with short delay around every `find_by_rowid` call in the hook's spawned async task. When `find_by_rowid` returns `Ok(None)`, sleep 5ms and retry up to 3 times before treating the record as deleted.

**Tech Stack:** Rust, tokio, sqlx (SQLite)

---

## File Structure

- **Modify:** `crates/services/src/services/events.rs` — add retry logic to all 5 `find_by_rowid` call sites in `set_update_hook`

No new files. No other files changed.

---

### Task 1: Extract retry helper function

**Files:**
- Modify: `crates/services/src/services/events.rs`

The 5 table arms (Tasks, Projects, Workspaces, ExecutionProcesses, Scratch) all have the same `find_by_rowid` → `Ok(Some) / Ok(None) / Err` pattern. Extract a generic retry helper to avoid duplicating retry logic 5 times.

- [ ] **Step 1: Add the retry helper function inside the spawned async block**

Add this helper at the top of `events.rs` (after the imports, before `impl EventService`):

```rust
const HOOK_RETRY_COUNT: u32 = 3;
const HOOK_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(5);

/// Retry a find_by_rowid query that may return None due to the SQLite
/// update_hook firing before the write transaction commits on the
/// querying connection.
async fn retry_find_by_rowid<T, F, Fut>(table: &str, rowid: i64, f: F) -> Result<Option<T>, sqlx::Error>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<Option<T>, sqlx::Error>>,
{
    for attempt in 0..=HOOK_RETRY_COUNT {
        match f().await {
            Ok(Some(val)) => return Ok(Some(val)),
            Ok(None) if attempt < HOOK_RETRY_COUNT => {
                tracing::debug!(
                    table = table,
                    rowid = rowid,
                    attempt = attempt + 1,
                    "[event-hook] find_by_rowid returned None, retrying"
                );
                tokio::time::sleep(HOOK_RETRY_DELAY).await;
            }
            Ok(None) => {
                tracing::warn!(
                    table = table,
                    rowid = rowid,
                    "[event-hook] find_by_rowid returned None after all retries"
                );
                return Ok(None);
            }
            Err(e) => return Err(e),
        }
    }
    Ok(None)
}
```

- [ ] **Step 2: Replace ExecutionProcesses arm with retry call**

Replace the current `(HookTables::ExecutionProcesses, _)` match arm (lines ~239-268) with:

```rust
(HookTables::ExecutionProcesses, _) => {
    match retry_find_by_rowid("execution_processes", rowid, || {
        ExecutionProcess::find_by_rowid(&db.pool, rowid)
    }).await {
        Ok(Some(process)) => RecordTypes::ExecutionProcess(process),
        Ok(None) => RecordTypes::DeletedExecutionProcess {
            rowid,
            session_id: None,
            process_id: None,
        },
        Err(e) => {
            tracing::error!("Failed to fetch execution_process: {:?}", e);
            return;
        }
    }
}
```

- [ ] **Step 3: Replace Tasks arm with retry call**

Replace the current `(HookTables::Tasks, _)` match arm with:

```rust
(HookTables::Tasks, _) => {
    match retry_find_by_rowid("tasks", rowid, || {
        Task::find_by_rowid(&db.pool, rowid)
    }).await {
        Ok(Some(task)) => RecordTypes::Task(task),
        Ok(None) => RecordTypes::DeletedTask {
            rowid,
            project_id: None,
            task_id: None,
        },
        Err(e) => {
            tracing::error!("Failed to fetch task: {:?}", e);
            return;
        }
    }
}
```

- [ ] **Step 4: Replace Projects arm with retry call**

```rust
(HookTables::Projects, _) => {
    match retry_find_by_rowid("projects", rowid, || {
        Project::find_by_rowid(&db.pool, rowid)
    }).await {
        Ok(Some(project)) => RecordTypes::Project(project),
        Ok(None) => RecordTypes::DeletedProject {
            rowid,
            project_id: None,
        },
        Err(e) => {
            tracing::error!("Failed to fetch project: {:?}", e);
            return;
        }
    }
}
```

- [ ] **Step 5: Replace Workspaces arm with retry call**

```rust
(HookTables::Workspaces, _) => {
    match retry_find_by_rowid("workspaces", rowid, || {
        Workspace::find_by_rowid(&db.pool, rowid)
    }).await {
        Ok(Some(workspace)) => RecordTypes::Workspace(workspace),
        Ok(None) => RecordTypes::DeletedWorkspace {
            rowid,
            task_id: None,
        },
        Err(e) => {
            tracing::error!("Failed to fetch workspace: {:?}", e);
            return;
        }
    }
}
```

- [ ] **Step 6: Replace Scratch arm with retry call**

```rust
(HookTables::Scratch, _) => {
    match retry_find_by_rowid("scratch", rowid, || {
        Scratch::find_by_rowid(&db.pool, rowid)
    }).await {
        Ok(Some(scratch)) => RecordTypes::Scratch(scratch),
        Ok(None) => RecordTypes::DeletedScratch {
            rowid,
            scratch_id: None,
            scratch_type: None,
        },
        Err(e) => {
            tracing::error!("Failed to fetch scratch: {:?}", e);
            return;
        }
    }
}
```

- [ ] **Step 7: Build and verify**

Run: `cargo check -p services`
Expected: compiles with no errors

- [ ] **Step 8: Commit**

```bash
git add crates/services/src/services/events.rs
git commit -m "fix(events): retry find_by_rowid in SQLite hook to fix race condition

The SQLite update_hook fires before auto-commit completes. The spawned
async task queries from a separate connection pool which cannot see
the uncommitted row. Add retry with 5ms delay (up to 3 attempts) to
wait for the transaction to commit."
```

---

### Task 2: Remove diagnostic tracing

**Files:**
- Modify: `crates/services/src/services/events.rs`
- Modify: `crates/services/src/services/events/streams.rs`
- Modify: `crates/utils/src/msg_store.rs`
- Modify: `frontend/src/hooks/useJsonPatchWsStream.ts`
- Modify: `frontend/src/hooks/useExecutionProcesses.ts`

Remove the `[event-debug]` tracing added during investigation. The retry helper's own `tracing::debug` / `tracing::warn` provides sufficient observability going forward.

- [ ] **Step 1: Remove `[event-debug]` tracing from `events.rs`**

Remove:
- The `table_name` / `op_name` / `tracing::info!("[event-debug] SQLite update_hook fired")` block (lines ~178-185)
- The `tracing::info!("[event-debug] EP hook: find_by_rowid OK")` (already replaced in Task 1)
- The `tracing::error!("[event-debug] task not found in project list after hook")` — revert to the original silent fall-through behavior, or keep as a plain `tracing::warn!` without the `[event-debug]` prefix (this one is actually useful)
- The `tracing::error!("[event-debug] find_by_project_id_with_attempt_status failed")` — keep as plain `tracing::error!` without `[event-debug]` prefix

- [ ] **Step 2: Remove `[event-debug]` tracing from `streams.rs`**

Remove the two `tracing::info!("[event-debug] stream_tasks_raw received event")` and `tracing::info!("[event-debug] stream_execution_processes received event")` blocks.

- [ ] **Step 3: Remove `[event-debug]` tracing from `msg_store.rs`**

Remove the `tracing::info!("[event-debug] push_patch")` block from `push_patch`.

- [ ] **Step 4: Remove `[event-debug]` logging from frontend**

In `useJsonPatchWsStream.ts`: remove the `console.log('[event-debug] WS received patch:')` block.

In `useExecutionProcesses.ts`: remove the `useRef` / `console.log('[event-debug] isAttemptRunning changed:')` block and the `useRef` import if no longer needed.

- [ ] **Step 5: Build and verify**

Run: `cargo check -p services -p utils` and `pnpm run check`
Expected: compiles with no errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove [event-debug] diagnostic tracing"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run dev server**

```bash
pnpm run dev
```

- [ ] **Step 2: Test followUp message appears immediately**

1. Open a task, send a followUp message
2. Verify the user message appears in the conversation immediately (not after AI starts responding)

- [ ] **Step 3: Test task status updates on creation**

1. Create a new task and start execution
2. Verify the task card moves from "todo" to "in progress" without page refresh

- [ ] **Step 4: Test task status updates on completion**

1. Wait for execution to complete
2. Verify the "stop" button changes to "send" without page refresh

- [ ] **Step 5: Test stop button**

1. Start an execution, click "stop"
2. Verify the task status updates without page refresh

- [ ] **Step 6: Check backend logs for retry activity**

Search logs for `[event-hook] find_by_rowid returned None, retrying`. If present, the retry is working. The message `find_by_rowid returned None after all retries` should NOT appear for non-delete operations.
