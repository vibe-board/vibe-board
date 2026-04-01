# Fix: SQLite update_hook race condition causing lost event notifications

## Problem

The event notification system relies on SQLite `update_hook` callbacks to detect database changes and broadcast them to WebSocket clients. The hook fires **synchronously during statement execution** (before auto-commit), then spawns an async task that queries the record from a **separate connection pool**. Because the write transaction hasn't committed yet, `find_by_rowid` on the separate pool cannot see the new/updated row and returns `None`.

### Confirmed evidence

- `SQLite update_hook fired table=execution_processes op=Insert rowid=2299` fires
- `EP hook: find_by_rowid returned None rowid=2299` — spawned task can't see the row
- No `push_patch /execution_processes/...` follows — event is silently lost
- Frontend never receives the ExecutionProcess status update
- Symptoms: task panel stays on "stop" button instead of "send"; task stays in "todo" instead of "running"; followUp messages don't appear until AI starts replying

### Why it's intermittent

The race window depends on how quickly the auto-commit completes relative to when the spawned async task runs. Under load (many tasks, slow SQL), the window is wider and the bug is more frequent.

## Solution: retry on `find_by_rowid` returning None

When the spawned async task gets `Ok(None)` from `find_by_rowid`, wait briefly and retry. The write will commit within microseconds to milliseconds, so a short delay is sufficient.

### Retry strategy

- **Max retries**: 3
- **Delay between retries**: 5ms (`tokio::time::sleep`)
- **Retry condition**: only `Ok(None)` — `Err(e)` is a real error, not a timing issue
- **Applies to all tables**: Tasks, ExecutionProcesses, Workspaces, Scratch, Projects — all use the same hook pattern and are theoretically vulnerable

### Scope

**File changed**: `crates/services/src/services/events.rs` — the `set_update_hook` spawned async block.

**Not changed**: `msg_store`, `streams.rs`, frontend, DB models.

### Implementation

Refactor the record-fetching section of the spawned async block. Currently each table has a `match` arm like:

```rust
(HookTables::ExecutionProcesses, _) => {
    match ExecutionProcess::find_by_rowid(&db.pool, rowid).await {
        Ok(Some(process)) => RecordTypes::ExecutionProcess(process),
        Ok(None) => RecordTypes::DeletedExecutionProcess { ... },
        Err(e) => { tracing::error!(...); return; }
    }
}
```

Change to retry loop:

```rust
(HookTables::ExecutionProcesses, _) => {
    let mut record = None;
    for attempt in 0..=3 {
        match ExecutionProcess::find_by_rowid(&db.pool, rowid).await {
            Ok(Some(process)) => { record = Some(process); break; }
            Ok(None) if attempt < 3 => {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                continue;
            }
            Ok(None) => {
                // After retries, treat as deleted
                break;
            }
            Err(e) => {
                tracing::error!("Failed to fetch execution_process: {:?}", e);
                return;
            }
        }
    }
    match record {
        Some(process) => RecordTypes::ExecutionProcess(process),
        None => RecordTypes::DeletedExecutionProcess { rowid, session_id: None, process_id: None },
    }
}
```

Apply the same pattern to all table arms (Tasks, Projects, Workspaces, Scratch).

### Diagnostic tracing

Keep the existing `[event-debug]` tracing for now. It will help verify the fix works. Remove in a follow-up cleanup pass.

### Testing

- Manual: create task, send followUp, stop execution — verify events arrive at frontend without refresh
- Observe logs: `find_by_rowid returned None` should no longer appear (or appear only on first attempt, then succeed on retry)

## Future consideration: Approach C

An alternative is to broadcast events directly at write call sites instead of relying on the hook. This eliminates the two-pool race entirely. Evaluation of the scope of this approach is pending. If Approach B proves insufficient or if the retry adds unacceptable latency, Approach C should be revisited.
