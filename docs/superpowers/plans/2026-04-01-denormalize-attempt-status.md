# Denormalize Attempt Status Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Move `has_in_progress_attempt`, `last_attempt_failed`, `executor`, `variant` from computed-on-read to stored-on-task, eliminating slow SQL subqueries.

**Architecture:** Add 4 columns to tasks table. Event hooks update them on write. Reads become simple SELECTs.

---

## Task 1: Database schema migration + backfill

**Files:**
- Create: `crates/db/migrations/20260401000001_denormalize_attempt_status.sql`

**Step 1: Create migration file**

```sql
-- Add denormalized attempt status columns to tasks
ALTER TABLE tasks ADD COLUMN has_in_progress_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_attempt_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN executor TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN variant TEXT;

-- Backfill active tasks only (history tasks don't need these fields)
UPDATE tasks SET
  has_in_progress_attempt = CASE WHEN EXISTS (
    SELECT 1 FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.status = 'running'
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent','commitmessage')
    LIMIT 1
  ) THEN 1 ELSE 0 END,
  last_attempt_failed = CASE WHEN (
    SELECT ep.status FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
    ORDER BY ep.created_at DESC LIMIT 1
  ) IN ('failed','killed') THEN 1 ELSE 0 END,
  executor = COALESCE((
    SELECT s.executor FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    WHERE w.task_id = tasks.id
    ORDER BY s.created_at DESC LIMIT 1
  ), ''),
  variant = (
    SELECT JSON_EXTRACT(ep.executor_action, '$.typ.executor_profile_id.variant')
    FROM workspaces w
    JOIN sessions s ON s.workspace_id = w.id
    JOIN execution_processes ep ON ep.session_id = s.id
    WHERE w.task_id = tasks.id
      AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
      AND ep.dropped = 0
    ORDER BY ep.created_at DESC LIMIT 1
  )
WHERE status IN ('todo', 'inprogress', 'inreview');
```

**Step 2: Run `pnpm run prepare-db`**

**Step 3: Commit**

## Task 2: Update Rust model — add fields to Task, simplify query

**Files:**
- Modify: `crates/db/src/models/task.rs`

**Step 1: Add 4 fields to `Task` struct**

Add after `updated_at`:
```rust
pub has_in_progress_attempt: bool,
pub last_attempt_failed: bool,
pub executor: String,
pub variant: Option<String>,
```

**Step 2: Remove `TaskWithAttemptStatus` struct**

Delete the `TaskWithAttemptStatus` struct and its `Deref` impl. `Task` now has all fields.

**Step 3: Add serde rename for SQLite columns**

SQLite uses snake_case for the new boolean columns (`has_in_progress_attempt` as INTEGER). The `Task` struct fields already match. Add `#[sqlx(default]` if needed for backwards compat.

Actually — since these are `FromRow` (not `query!` macro), we need to make sure the column names match. The struct field names are `has_in_progress_attempt`, `last_attempt_failed`, `executor`, `variant` — all snake_case, matching the SQL columns.

**Step 4: Simplify `find_active_by_project_id_with_attempt_status`**

Replace the entire method body with:
```rust
pub async fn find_active_by_project_id(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<Vec<Task>, sqlx::Error> {
    sqlx::query_as!(
        Task,
        r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid",
           title, description, status as "status!: TaskStatus",
           parent_workspace_id as "parent_workspace_id: Uuid",
           created_at as "created_at!: DateTime<Utc>",
           updated_at as "updated_at!: DateTime<Utc>",
           has_in_progress_attempt as "has_in_progress_attempt!: bool",
           last_attempt_failed as "last_attempt_failed!: bool",
           executor as "executor!: String",
           variant as "variant: String"
           FROM tasks
           WHERE project_id = $1
             AND status IN ('todo', 'inprogress', 'inreview')
           ORDER BY created_at DESC"#,
        project_id
    )
    .fetch_all(pool)
    .await
}
```

Rename `find_active_by_project_id_with_attempt_status` → `find_active_by_project_id` and change return type to `Vec<Task>`.

**Step 5: Update `find_history_by_project_id_paginated`**

Add the 4 new fields to the SELECT in both branches (with/without cursor):
```sql
has_in_progress_attempt, last_attempt_failed, executor, variant
```

Change `PaginatedTaskHistory.tasks` from `Vec<Task>` (already correct, just needs the new fields in the SELECT).

**Step 6: Run `pnpm run prepare-db`**

**Step 7: Commit**

## Task 3: Update event hooks to write task fields

**Files:**
- Modify: `crates/services/src/services/events.rs`

**Step 1: Replace `push_task_update_for_task`**

Replace the entire method. Now it just fetches the task by ID and pushes it:
```rust
async fn push_task_update_for_task(
    pool: &SqlitePool,
    msg_store: Arc<MsgStore>,
    task_id: Uuid,
) -> Result<(), SqlxError> {
    if let Some(task) = Task::find_by_id(pool, task_id).await? {
        msg_store.push_patch(task_patch::replace(&task));
    }
    Ok(())
}
```

**Step 2: Add a new method to compute and write attempt status to a task row**

```rust
async fn update_task_attempt_status(
    pool: &SqlitePool,
    task_id: Uuid,
) -> Result<(), SqlxError> {
    // Compute attempt status from execution_processes
    let has_in_progress: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workspaces w
         JOIN sessions s ON s.workspace_id = w.id
         JOIN execution_processes ep ON ep.session_id = s.id
         WHERE w.task_id = $1 AND ep.status = 'running'
           AND ep.run_reason IN ('setupscript','cleanupscript','codingagent','commitmessage')
         LIMIT 1"
    ).bind(task_id).fetch_one(pool).await?;

    let (last_failed, variant): (bool, Option<String>) = {
        #[derive(sqlx::FromRow)]
        struct EpInfo { ep_status: Option<String>, variant: Option<String> }
        sqlx::query_as(
            "SELECT ep.status as ep_status,
                JSON_EXTRACT(ep.executor_action, '$.typ.executor_profile_id.variant') as variant
             FROM workspaces w
             JOIN sessions s ON s.workspace_id = w.id
             JOIN execution_processes ep ON ep.session_id = s.id
             WHERE w.task_id = $1
               AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
               AND ep.dropped = 0
             ORDER BY ep.created_at DESC LIMIT 1"
        ).bind(task_id).fetch_optional(pool).await?
          .map(|r: EpInfo| (matches!(r.ep_status.as_deref(), Some("failed" | "killed")), r.variant))
          .unwrap_or((false, None))
    };

    let executor: Option<String> = sqlx::query_scalar(
        "SELECT s.executor FROM workspaces w
         JOIN sessions s ON s.workspace_id = w.id
         WHERE w.task_id = $1
         ORDER BY s.created_at DESC LIMIT 1"
    ).bind(task_id).fetch_optional(pool).await?.flatten();

    sqlx::query(
        "UPDATE tasks SET
           has_in_progress_attempt = $1,
           last_attempt_failed = $2,
           executor = COALESCE($3, ''),
           variant = $4
         WHERE id = $5"
    )
    .bind(has_in_progress > 0)
    .bind(last_failed)
    .bind(executor)
    .bind(variant)
    .bind(task_id)
    .execute(pool)
    .await?;

    Ok(())
}
```

**Step 3: Update all event hook call sites**

In the workspace handler (around line 376), deleted workspace handler (around line 415), and ep handler (around line 441), after pushing the patch, also call `update_task_attempt_status` and then re-push:

```rust
// After workspace/ep change, update task fields and push
EventService::update_task_attempt_status(&db.pool, task_id).await?;
EventService::push_task_update_for_task(&db.pool, msg_store_for_hook.clone(), task_id).await?;
```

Actually, simpler: call `update_task_attempt_status` first (writes fields), then `push_task_update_for_task` (reads and pushes).

**Step 4: Update the RecordTypes::Task handler**

The task CRUD handler (around line 291) should also push the task directly. Since `Task` now has all fields, just fetch and push:
```rust
RecordTypes::Task(task) => {
    let task_with_status = Task::find_by_id(&db.pool, task.id).await?;
    if let Some(t) = task_with_status {
        let patch = match hook.operation {
            SqliteOperation::Insert => task_patch::add(&t),
            _ => task_patch::replace(&t),
        };
        msg_store_for_hook.push_patch(patch);
    }
    return;
}
```

**Step 5: Commit**

## Task 4: Update WS stream and patch helpers

**Files:**
- Modify: `crates/services/src/services/events/streams.rs`
- Modify: `crates/services/src/services/events/patches.rs`

**Step 1: Update stream_tasks_raw**

Change `find_active_by_project_id_with_attempt_status` → `find_active_by_project_id`. The stream now works with `Task` instead of `TaskWithAttemptStatus`.

Update the snapshot builder and filter to use `Task` type. The JSON shape changes: `Task` fields are directly on the object (no more `task` wrapper from serde flatten).

**Step 2: Update patch helpers**

`task_patch::add` and `task_patch::replace` currently take `&TaskWithAttemptStatus`. Change to take `&Task`.

**Step 3: Run `pnpm run generate-types` and `pnpm run prepare-db`**

**Step 4: Commit**

## Task 5: Update generate_types and shared types

**Files:**
- Modify: `crates/server/src/bin/generate_types.rs`
- Generated: `shared/types.ts`

**Step 1: Remove `TaskWithAttemptStatus::decl()` from generate_types.rs**

`Task` now has all fields. Remove `TaskWithAttemptStatus::decl()`.

**Step 2: Run `pnpm run generate-types`**

**Step 3: Commit**

## Task 6: Update frontend

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useProjectTasks.ts`
- Modify: `frontend/src/pages/ProjectTasks.tsx`
- Modify: `frontend/src/components/tasks/TaskCard.tsx`
- Various other files using `TaskWithAttemptStatus`

**Step 1: Replace `TaskWithAttemptStatus` with `Task` everywhere**

The TS type `Task` now includes `has_in_progress_attempt`, `last_attempt_failed`, `executor`, `variant`. Replace all `TaskWithAttemptStatus` references with `Task`.

**Step 2: Update `useProjectTasks.ts`**

Change `TaskWithAttemptStatus` → `Task` in the hook's return type and internal state.

**Step 3: Update `TaskCard.tsx` memo comparator**

Fields are now on `task` directly (no `task.task` wrapper from flatten). Update comparator.

**Step 4: Update `ProjectTasks.tsx`**

The `type Task = TaskWithAttemptStatus` alias is no longer needed. Use `Task` from shared/types directly.

**Step 5: Run `pnpm run check` to verify**

**Step 6: Commit**

## Task 7: Cleanup — remove dead code

- Delete `TaskWithAttemptStatus` struct and Deref impl from `task.rs`
- Remove any remaining references
- Run `cargo test --workspace`, `pnpm run check`, `pnpm run lint`
- Final commit

## Verification

- [ ] `cargo test --workspace`
- [ ] `pnpm run check`
- [ ] [ ] `pnpm run lint`
- [ ] Kanban loads fast with active tasks
- [ ] Drag-and-drop between columns works
- [ ] Complete a task → disappears from kanban
- [ ] Create a task → appears in kanban
- [ ] WS real-time updates work
- [ ] History tab still shows paginated done/cancelled tasks
