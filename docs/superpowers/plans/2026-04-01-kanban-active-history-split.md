# Kanban Active/History Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Kanban board into active tasks (todo/inprogress/inreview) with real-time WS updates, and a paginated history view for done/cancelled tasks, eliminating the need to load all project tasks at once.

**Architecture:** Kanban shows only active tasks via the existing WS stream (with a status filter added). Done/cancelled tasks move to a new REST-based paginated history endpoint. The event hook is optimized to avoid the expensive 4-join query for non-active tasks.

**Tech Stack:** Rust/Axum (backend), SQLite + sqlx (DB), React/TypeScript (frontend), WebSocket + JSON Patch (real-time)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `crates/db/src/models/task.rs` | Modify | Add `find_active_by_project_id_with_attempt_status`, `find_history_by_project_id_paginated`, `PaginatedTaskHistory` struct |
| `crates/services/src/services/events/streams.rs` | Modify | Use active-only query for WS snapshot; add status filter for live patches |
| `crates/services/src/services/events.rs` | Modify | Optimize `push_task_update_for_task` and workspace handlers to use active-only query |
| `crates/server/src/routes/tasks.rs` | Modify | Add `GET /api/tasks/history` endpoint |
| `crates/server/src/bin/generate_types.rs` | Modify | Register `PaginatedTaskHistory` for type generation |
| `frontend/src/lib/api.ts` | Modify | Add `tasksApi.getHistory` method |
| `frontend/src/hooks/useTaskHistory.ts` | Create | Cursor-based pagination hook for history |
| `frontend/src/components/tasks/TaskHistoryTable.tsx` | Create | Paginated list for done/cancelled tasks |
| `frontend/src/components/tasks/TaskKanbanBoard.tsx` | Modify | Only render 3 active columns |
| `frontend/src/pages/ProjectTasks.tsx` | Modify | Add Board/History tab switcher, filter kanban to active statuses |
| `shared/types.ts` | Generated | Regenerate via `pnpm run generate-types` |

---

## Task 1: Add active-only query and history pagination query

**Files:**
- Modify: `crates/db/src/models/task.rs:117-204`

**Step 1: Add `PaginatedTaskHistory` struct**

Add after `TaskWithAttemptStatus` (after line 46):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PaginatedTaskHistory {
    pub tasks: Vec<Task>,
    pub total_count: i64,
    pub has_more: bool,
}
```

**Step 2: Add `find_active_by_project_id_with_attempt_status`**

Add a new method after `find_by_project_id_with_attempt_status`. It's identical except the WHERE clause includes `AND t.status IN ('todo', 'inprogress', 'inreview')`. Copy the entire existing query body from lines 121-181, change the method name and the WHERE clause.

**Step 3: Add `find_history_by_project_id_paginated`**

Add a new method with this implementation:

```rust
pub async fn find_history_by_project_id_paginated(
    pool: &SqlitePool,
    project_id: Uuid,
    cursor: Option<DateTime<Utc>>,
    limit: i64,
) -> Result<PaginatedTaskHistory, sqlx::Error> {
    let tasks = if let Some(cursor_ts) = cursor {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid",
               title, description, status as "status!: TaskStatus",
               parent_workspace_id as "parent_workspace_id: Uuid",
               created_at as "created_at!: DateTime<Utc>",
               updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE project_id = $1
                 AND status IN ('done', 'cancelled')
                 AND created_at < $2
               ORDER BY created_at DESC
               LIMIT $3"#,
            project_id,
            cursor_ts,
            limit + 1
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid",
               title, description, status as "status!: TaskStatus",
               parent_workspace_id as "parent_workspace_id: Uuid",
               created_at as "created_at!: DateTime<Utc>",
               updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE project_id = $1
                 AND status IN ('done', 'cancelled')
               ORDER BY created_at DESC
               LIMIT $2"#,
            project_id,
            limit + 1
        )
        .fetch_all(pool)
        .await?
    };

    let total_count = sqlx::query_scalar!(
        r#"SELECT COUNT(*) as "count!: i64"
           FROM tasks
           WHERE project_id = $1
             AND status IN ('done', 'cancelled')"#,
        project_id
    )
    .fetch_one(pool)
    .await?;

    let has_more = tasks.len() > (limit as usize);
    let tasks: Vec<Task> = tasks.into_iter().take(limit as usize).collect();

    Ok(PaginatedTaskHistory {
        tasks,
        total_count,
        has_more,
    })
}
```

**Step 4: Run `pnpm run prepare-db` to generate SQLx offline metadata**

**Step 5: Commit**
```
git add crates/db/src/models/task.rs crates/db/.sqlx/
git commit -m "perf(db): add active-only and history-paginated task queries"
```

---

## Task 2: WS stream — active-only snapshot + status filter

**Files:**
- Modify: `crates/services/src/services/events/streams.rs:22-141`

**Step 1: Change snapshot query to active-only**

Change line 28 from:
```rust
let tasks = Task::find_by_project_id_with_attempt_status(&self.db.pool, project_id).await?;
```
to:
```rust
let tasks = Task::find_active_by_project_id_with_attempt_status(&self.db.pool, project_id).await?;
```

**Step 2: Add status filter for live patches**

Replace the `Add` handler (lines 60-69) with:
```rust
json_patch::PatchOperation::Add(op) => {
    if let Ok(task) =
        serde_json::from_value::<TaskWithAttemptStatus>(
            op.value.clone(),
        )
        && task.project_id == project_id
        && matches!(
            task.status,
            db::models::task::TaskStatus::Todo
                | db::models::task::TaskStatus::InProgress
                | db::models::task::TaskStatus::InReview
        )
    {
        return Some(Ok(LogMsg::JsonPatch(patch)));
    }
}
```

Replace the `Replace` handler (lines 71-79) with:
```rust
json_patch::PatchOperation::Replace(op) => {
    if let Ok(task) =
        serde_json::from_value::<TaskWithAttemptStatus>(
            op.value.clone(),
        )
        && task.project_id == project_id
    {
        let is_active = matches!(
            task.status,
            db::models::task::TaskStatus::Todo
                | db::models::task::TaskStatus::InProgress
                | db::models::task::TaskStatus::InReview
        );
        if is_active {
            return Some(Ok(LogMsg::JsonPatch(patch)));
        } else {
            // Task moved to done/cancelled — remove from kanban
            let remove_patch = json_patch::Patch(vec![
                json_patch::PatchOperation::Remove(
                    json_patch::RemoveOperation {
                        path: op.path.clone(),
                    },
                ),
            ]);
            return Some(Ok(LogMsg::JsonPatch(remove_patch)));
        }
    }
}
```

**Step 3: Commit**
```
git add crates/services/src/services/events/streams.rs
git commit -m "perf(streams): filter task WS stream to active statuses only"
```

---

## Task 3: Optimize event hook — avoid full-query for non-active tasks

**Files:**
- Modify: `crates/services/src/services/events.rs:46-63` (`push_task_update_for_task`)
- Modify: `crates/services/src/services/events.rs:347-361` (workspace handler)
- Modify: `crates/services/src/services/events.rs:369-383` (deleted workspace handler)

**Step 1: Optimize `push_task_update_for_task` (lines 46-63)**

Replace with:
```rust
async fn push_task_update_for_task(
    pool: &SqlitePool,
    msg_store: Arc<MsgStore>,
    task_id: Uuid,
) -> Result<(), SqlxError> {
    if let Some(task) = Task::find_by_id(pool, task_id).await? {
        let is_active = matches!(
            task.status,
            TaskStatus::Todo | TaskStatus::InProgress | TaskStatus::InReview
        );

        if is_active {
            let tasks =
                Task::find_active_by_project_id_with_attempt_status(pool, task.project_id)
                    .await?;
            if let Some(task_with_status) =
                tasks.into_iter().find(|t| t.id == task_id)
            {
                msg_store.push_patch(task_patch::replace(&task_with_status));
            }
        } else {
            // Push plain task data; stream filter converts to Remove for kanban clients
            let task_with_status = TaskWithAttemptStatus {
                task,
                has_in_progress_attempt: false,
                last_attempt_failed: false,
                executor: String::new(),
                variant: None,
            };
            msg_store.push_patch(task_patch::replace(&task_with_status));
        }
    }
    Ok(())
}
```

**Step 2: Optimize workspace handler (lines 347-361)**

Replace the block from `// Also update parent task` to the closing `}` with the same pattern: check `task.status` first, use `find_active_by_project_id_with_attempt_status` only for active tasks.

**Step 3: Optimize deleted workspace handler (lines 369-383)**

Same pattern as Step 2.

**Step 4: Commit**
```
git add crates/services/src/services/events.rs
git commit -m "perf(events): use active-only query for task patch generation"
```

---

## Task 4: Add history REST endpoint

**Files:**
- Modify: `crates/server/src/routes/tasks.rs:42-56,480-499`

**Step 1: Add query struct**

Add after `TaskQuery` (after line 45):
```rust
#[derive(Debug, Deserialize)]
pub struct TaskHistoryQuery {
    pub project_id: Uuid,
    pub cursor: Option<String>,  // ISO 8601 datetime string
    pub limit: Option<i64>,
}
```

**Step 2: Add handler**

Add after `get_tasks` (after line 56):
```rust
pub async fn get_task_history(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskHistoryQuery>,
) -> Result<ResponseJson<ApiResponse<PaginatedTaskHistory>>, ApiError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let cursor = query
        .cursor
        .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    let result = Task::find_history_by_project_id_paginated(
        &deployment.db().pool,
        query.project_id,
        cursor,
        limit,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(result)))
}
```

**Step 3: Register route**

In `router` (line 491-495), add `.route("/history", get(get_task_history))` before the `nest("/{task_id}", ...)` line:
```rust
let inner = Router::new()
    .route("/", get(get_tasks).post(create_task))
    .route("/stream/ws", get(stream_tasks_ws))
    .route("/create-and-start", post(create_task_and_start))
    .route("/history", get(get_task_history))
    .nest("/{task_id}", task_id_router);
```

**Step 4: Commit**
```
git add crates/server/src/routes/tasks.rs
git commit -m "feat(api): add paginated task history endpoint"
```

---

## Task 5: Register PaginatedTaskHistory in type generation

**Files:**
- Modify: `crates/server/src/bin/generate_types.rs:33`

**Step 1: Add type declaration**

After line 33 (`db::models::task::TaskWithAttemptStatus::decl(),`), add:
```rust
db::models::task::PaginatedTaskHistory::decl(),
```

**Step 2: Run type generation and prepare-db**

```bash
pnpm run generate-types
pnpm run prepare-db
```

**Step 3: Commit**
```
git add crates/server/src/bin/generate_types.rs shared/types.ts crates/db/.sqlx/
git commit -m "chore: regenerate types and SQLx metadata for PaginatedTaskHistory"
```

---

## Task 6: Add history API client to frontend

**Files:**
- Modify: `frontend/src/lib/api.ts:342-388`

**Step 1: Add `getHistory` method to `tasksApi`**

Add inside the `tasksApi` object (after `delete`, before the closing `}`):
```typescript
getHistory: async (
  projectId: string,
  params?: { cursor?: string; limit?: number }
): Promise<PaginatedTaskHistory> => {
  const search = new URLSearchParams({ project_id: projectId });
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit) search.set('limit', String(params.limit));
  const response = await makeRequest(`/api/tasks/history?${search}`);
  return handleApiResponse<PaginatedTaskHistory>(response);
},
```

Also add the import — check if `PaginatedTaskHistory` is already imported from `shared/types`. If not, add it to the import at the top of the file.

**Step 2: Commit**
```
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add tasksApi.getHistory for paginated history"
```

---

## Task 7: Create useTaskHistory hook

**Files:**
- Create: `frontend/src/hooks/useTaskHistory.ts`

**Step 1: Create the hook**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { tasksApi } from '@/lib/api';
import type { Task } from 'shared/types';

interface UseTaskHistoryResult {
  tasks: Task[];
  isLoading: boolean;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  isLoadingMore: boolean;
}

export const useTaskHistory = (projectId: string): UseTaskHistoryResult => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const loadInitial = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    cursorRef.current = undefined;
    try {
      const result = await tasksApi.getHistory(projectId, { limit: 50 });
      setTasks(result.tasks);
      setHasMore(result.has_more);
      setTotalCount(result.total_count);
      if (result.tasks.length > 0) {
        cursorRef.current = result.tasks[result.tasks.length - 1].created_at;
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !projectId) return;
    setIsLoadingMore(true);
    try {
      const result = await tasksApi.getHistory(projectId, {
        cursor: cursorRef.current,
        limit: 50,
      });
      setTasks((prev) => [...prev, ...result.tasks]);
      setHasMore(result.has_more);
      if (result.tasks.length > 0) {
        cursorRef.current = result.tasks[result.tasks.length - 1].created_at;
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, projectId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  return { tasks, isLoading, hasMore, totalCount, loadMore, isLoadingMore };
};
```

**Step 2: Commit**
```
git add frontend/src/hooks/useTaskHistory.ts
git commit -m "feat(frontend): add useTaskHistory hook with cursor pagination"
```

---

## Task 8: Create TaskHistoryTable component

**Files:**
- Create: `frontend/src/components/tasks/TaskHistoryTable.tsx`

**Step 1: Create the component**

```typescript
import { memo } from 'react';
import { useTaskHistory } from '@/hooks/useTaskHistory';
import { Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from 'shared/types';
import { formatDistanceToNow } from 'date-fns';

interface TaskHistoryTableProps {
  projectId: string;
  onViewTaskDetails: (task: Task) => void;
  selectedTaskId?: string;
}

function TaskHistoryTable({
  projectId,
  onViewTaskDetails,
  selectedTaskId,
}: TaskHistoryTableProps) {
  const { tasks, isLoading, hasMore, totalCount, loadMore, isLoadingMore } =
    useTaskHistory(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No completed tasks yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <div className="text-xs text-muted-foreground px-2 pb-2">
        {totalCount} completed task{totalCount !== 1 ? 's' : ''}
      </div>
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => onViewTaskDetails(task)}
          className={`text-left px-3 py-2 rounded hover:bg-accent transition-colors ${
            selectedTaskId === task.id ? 'bg-accent' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm truncate flex-1">{task.title}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(task.created_at), {
                addSuffix: true,
              })}
            </span>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {task.description}
            </p>
          )}
        </button>
      ))}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={loadMore}
          disabled={isLoadingMore}
          className="mt-2"
        >
          {isLoadingMore ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Load more
        </Button>
      )}
    </div>
  );
}

export default memo(TaskHistoryTable);
```

**Step 2: Commit**
```
git add frontend/src/components/tasks/TaskHistoryTable.tsx
git commit -m "feat(frontend): add TaskHistoryTable component"
```

---

## Task 9: Kanban board — render only active columns

**Files:**
- Modify: `frontend/src/components/tasks/TaskKanbanBoard.tsx`

**Step 1: Filter columns to active statuses**

Change line 34 from:
```tsx
{Object.entries(columns).map(([status, tasks]) => {
```
to:
```tsx
{Object.entries(columns)
  .filter(([status]) => ['todo', 'inprogress', 'inreview'].includes(status))
  .map(([status, tasks]) => {
```

**Step 2: Commit**
```
git add frontend/src/components/tasks/TaskKanbanBoard.tsx
git commit -m "fix(ui): only render active status columns in Kanban"
```

---

## Task 10: ProjectTasks page — add Board/History tab switcher

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx`

**Step 1: Add view mode state**

After the existing state declarations (near line 200), add:
```typescript
const [viewMode, setViewMode] = useState<'board' | 'history'>('board');
```

**Step 2: Filter kanban columns to active statuses only**

Change `kanbanColumns` useMemo (lines 461-501) — remove `done` and `cancelled` from the initial columns object:
```typescript
const kanbanColumns = useMemo(() => {
  const columns: KanbanColumns = {
    todo: [],
    inprogress: [],
    inreview: [],
    done: [],
    cancelled: [],
  };
  // ... rest stays the same
```

The KanbanBoard component (Task 9) already filters to 3 columns, so the data structure can stay as-is.

**Step 3: Add tab bar before the kanban board**

Find where the kanban board is rendered (around line 872). Before the kanban div, add a tab bar:
```tsx
<div className="flex items-center gap-1 px-4 pt-2">
  <Button
    variant={viewMode === 'board' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setViewMode('board')}
  >
    {t('Board')}
  </Button>
  <Button
    variant={viewMode === 'history' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => setViewMode('history')}
  >
    {t('History')}
  </Button>
</div>
```

**Step 4: Conditionally render Board vs History**

Wrap the existing kanban board rendering (around line 872) in a conditional:
```tsx
const boardContent = viewMode === 'history' ? (
  <TaskHistoryTable
    projectId={projectId!}
    onViewTaskDetails={handleViewTaskDetails}
    selectedTaskId={selectedTask?.id}
  />
) : (
  <div className="w-full h-full overflow-x-auto overflow-y-auto overscroll-x-contain">
    <TaskKanbanBoard ... />
  </div>
);
```

**Step 5: Add import**

Add `import TaskHistoryTable from '@/components/tasks/TaskHistoryTable';` at the top.

**Step 6: Commit**
```
git add frontend/src/pages/ProjectTasks.tsx
git commit -m "feat(ui): add Board/History tab switcher to ProjectTasks"
```

---

## Verification

- [ ] `cargo test --workspace` — all Rust tests pass
- [ ] `pnpm run check` — TypeScript type checks pass
- [ ] `pnpm run lint` — lint passes
- [ ] `pnpm run prepare-db` — SQLx metadata up to date
- [ ] `pnpm run generate-types` — shared types regenerated
- [ ] Open a project with many tasks → kanban loads fast with only active tasks
- [ ] Drag task between todo/inprogress/inreview columns → works
- [ ] Complete a task via ActionsDropdown → task disappears from kanban
- [ ] Switch to History tab → see done/cancelled tasks paginated
- [ ] Click "Load more" in history → loads next page
- [ ] Create a new task → appears in kanban todo column in real-time
