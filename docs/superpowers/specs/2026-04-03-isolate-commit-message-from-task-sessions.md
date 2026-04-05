# Isolate Commit-Message Agent from Task Session Hierarchy

## Problem

When merging a workspace, `generate_commit_message_via_agent` creates a new session + execution_process under the workspace. This causes three issues:

1. **Session ordering bug**: The commit-only session ranks above the real working session (its `created_at` is newer, and with no qualifying processes it falls back to `created_at`). The frontend loads this empty session and shows an infinite spinner.
2. **`has_in_progress_attempt` pollution**: The query at `events.rs:88-94` includes `commitmessage` in the running-process count, so the task card shows a false "in progress" spinner during commit message generation.
3. **Executor overwrite**: The query at `events.rs:125-134` derives `executor` from `ORDER BY s.created_at DESC LIMIT 1`, so the newly created commit-message session overwrites the task's executor field.

Root principle: commit-message execution is an internal step of the merge operation. It should not participate in the task's session/process hierarchy and must never affect task-level fields.

## Solution

Stop creating session/execution_process for commit messages entirely. Store the commit-message agent's conversation directly in the merge record.

### Schema Changes

Migration: add two columns to `merges` table.

```sql
ALTER TABLE merges ADD COLUMN task_id BLOB REFERENCES tasks(id);
ALTER TABLE merges ADD COLUMN commit_message_conversation TEXT;
```

- `task_id`: weak association for future "find merges by task" queries. Nullable for backward compatibility with existing rows. Backfill from `merges.workspace_id → workspaces.task_id`.
- `commit_message_conversation`: JSON text storing the normalized entries from the commit-message agent run. NULL when commit message is disabled or uses the legacy path.

### Backend Changes

#### 1. Rewrite `generate_commit_message_via_agent` (task_attempts.rs:500-629)

Current flow:
```
Session::create → container.start_execution → poll for completion → read CodingAgentTurn.summary
```

New flow:
```
executor.run_inline(prompt, working_dir) → collect entries + final message → return (message, entries_json)
```

The function signature changes from:
```rust
async fn generate_commit_message_via_agent(...) -> Option<String>
```
to:
```rust
async fn generate_commit_message_via_agent(...) -> Option<(String, String)>
// Returns (commit_message, entries_json)
```

Implementation: use the same executor infrastructure (`ExecutorConfigs::get_cached().get_coding_agent()`) but invoke it without creating DB records. The executor launches the agent subprocess, streams stdout, normalizes entries in-memory, and returns when done. The `entries_json` is `serde_json::to_string` of the collected `Vec<NormalizedEntry>`.

Timeout handling stays the same (90s). On timeout, return None — fallback to `legacy_commit_message`.

#### 2. Update `merge_task_attempt` caller (task_attempts.rs:810-868)

Pass `entries_json` through to `Merge::create_direct`.

#### 3. Update `Merge::create_direct` (merge.rs)

Add `task_id` and `commit_message_conversation` parameters.

#### 4. Remove `commitmessage` from `update_task_attempt_status` (events.rs:88-94)

```sql
-- Before
AND ep.run_reason IN ('setupscript','cleanupscript','codingagent','commitmessage')
-- After
AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
```

#### 5. Keep `ExecutionProcessRunReason::CommitMessage`

Don't remove the enum value — existing rows in the database reference it. New code simply won't create execution_processes with this reason. No migration needed for the enum.

#### 6. Revert or keep the session ordering fix

The earlier fix (`ORDER BY latest_ep.last_used IS NULL ASC`) in session.rs can be kept as defense-in-depth. No commit-only sessions will be created going forward, but the fix protects against any edge case.

### Inline Executor Execution

The key implementation challenge: running the coding agent without the execution_process infrastructure.

Current path: `container.start_execution` → `start_execution_inner` → spawns agent subprocess → creates msg_store → streams through it → normalizer writes to DB.

New path for commit messages: inline execution within `generate_commit_message_via_agent` (stays in task_attempts.rs):
1. Resolve the executor profile via `ExecutorConfigs::get_cached().get_coding_agent()`
2. Create a temporary in-memory `MsgStore` (no DB association)
3. Call `executor.spawn(msg_store, prompt, working_dir)` — same subprocess mechanism
4. Wait for the process to complete (poll MsgStore for `Finished` message, same 90s timeout)
5. Call `executor.normalize_logs(msg_store, working_dir)` — produces normalized entries in-memory
6. Extract the commit message from the final assistant message in the MsgStore
7. Serialize normalized entries to JSON
8. Return `(commit_message, normalized_entries_json)`

No DB writes, no session, no execution_process, no log file, no persistent MsgStore subscription.

### What Does NOT Change

- `execution_processes` table schema — untouched
- `normalized_entries` table — untouched
- `sessions` table — untouched
- Frontend code — no changes needed (commit-only sessions will stop appearing)
- Existing task-field queries (other than removing 'commitmessage' from one IN clause)
- Raw log streaming, WebSocket infrastructure — untouched

### Future UI (not in scope)

A "merge history" view for a task: query `merges WHERE task_id = ?`, render each merge's `commit_message_conversation` as a read-only conversation view. This is a future feature enabled by the `task_id` and `commit_message_conversation` columns.

## Migration

1. Add columns to `merges` table
2. Backfill `task_id` from existing data: `UPDATE merges SET task_id = (SELECT task_id FROM workspaces WHERE id = merges.workspace_id)`
3. Optionally: clean up orphaned commit-message sessions and their execution_processes from existing data

## Risks

- **Inline executor**: extracting a lightweight agent execution path requires understanding the subprocess + normalizer pipeline. If tightly coupled to msg_store/execution_process, may need refactoring. Mitigation: the executor's `run` method is independent of DB state; the coupling is in the container orchestration layer, not the executor itself.
- **Commit message conversation size**: stored as JSON TEXT in SQLite. Typical commit-message conversations are <20 entries, so this is small (<50KB). Not a concern.
