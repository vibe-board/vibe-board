# Denormalize Attempt Status Into Tasks Table

## Problem

`find_active_by_project_id_with_attempt_status` is still slow (5.3s for 18 tasks) because computing `has_in_progress_attempt`, `last_attempt_failed`, `executor`, `variant` requires correlated subqueries over `workspaces → sessions → execution_processes`. Even per-task indexed queries add up (N × 3 queries per request).

## Solution

Denormalize these 4 fields into the `tasks` table. Write them on event hooks, read with a simple SELECT.

## Schema Changes

```sql
ALTER TABLE tasks ADD COLUMN has_in_progress_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_attempt_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN executor TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN variant TEXT;
```

## Write Paths (event hooks in events.rs)

| Event | Updates |
|-------|---------|
| execution_process created/updated | `has_in_progress_attempt`, `last_attempt_failed`, `variant` on parent task |
| session created | `executor` on parent task |
| task created | default values (0, 0, '', NULL) |
| task deleted | no-op |

## What Gets Simplified

1. **`TaskWithAttemptStatus` struct** — deleted. `Task` carries all fields.
2. **`find_active_by_project_id_with_attempt_status`** — becomes a simple SELECT with no subqueries.
3. **`find_history_by_project_id_paginated`** — already simple, stays the same.
4. **`push_task_update_for_task`** — just fetches the task by ID, no attempt status computation.
5. **events.rs handlers** — workspace/ep hooks update the task row directly instead of calling the expensive query.
6. **`shared/types.ts`** — `TaskWithAttemptStatus` removed, `Task` gains 4 fields.

## Read Path

```sql
SELECT * FROM tasks
WHERE project_id = $1 AND status IN ('todo','inprogress','inreview')
ORDER BY created_at DESC
```

Zero JOINs, zero subqueries.

## Backfill Migration

```sql
UPDATE tasks SET
  has_in_progress_attempt = EXISTS(...),
  last_attempt_failed = CASE WHEN (...) IN ('failed','killed') THEN 1 ELSE 0 END,
  executor = (...),
  variant = (...)
WHERE status IN ('todo', 'inprogress', 'inreview');
```

Only backfill active tasks. History tasks don't need these fields (they're not loaded in Kanban).

## Risks

- **Data staleness**: if a new event path is added without updating task fields, they go stale. Mitigation: all existing event paths already call `push_task_update_for_task`; we're just changing what it does.
- **Write amplification**: every ep change now also UPDATEs the task row. This is acceptable — SQLite UPDATE is cheap, and we're already pushing WS patches for these events.
