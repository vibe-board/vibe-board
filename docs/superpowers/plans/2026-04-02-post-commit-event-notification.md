# Post-Commit Event Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile SQLite update_hook + retry mechanism with explicit post-commit `EventService::notify_*()` calls at all write sites, enforced by a compile-time `WriteResult<T>` wrapper.

**Architecture:** Write methods for 5 event-monitored tables return `WriteResult<T>` (a `#[must_use]` wrapper). Callers must call `.into_inner()` to extract the value, ensuring they've acknowledged event responsibility. New `EventService::notify_*()` methods query committed data and push JSON patches. The `update_hook` is removed entirely; `preupdate_hook` is preserved for DELETE.

**Tech Stack:** Rust, SQLx, SQLite, tokio, json_patch, MsgStore (broadcast channel)

---

### Task 1: Add `WriteResult<T>` to the `db` crate

**Files:**
- Modify: `crates/db/src/lib.rs:71-142`

- [ ] **Step 1: Add WriteResult struct to db crate**

At the top of `crates/db/src/lib.rs`, after the `use` statements and before `async fn run_migrations`, add:

```rust
/// Wrapper for database write results that enforces event notification.
///
/// Write methods for event-monitored tables (tasks, execution_processes,
/// workspaces, scratch, projects) return this type. The caller MUST call
/// `.into_inner()` to extract the value, serving as a deliberate
/// acknowledgement that event notification has been (or will be) handled.
#[must_use = "database write completed but event not emitted — call .into_inner() after sending notification"]
pub struct WriteResult<T> {
    value: T,
}

impl<T> WriteResult<T> {
    pub fn new(value: T) -> Self {
        Self { value }
    }

    /// Extract the inner value. Call this AFTER emitting the event notification.
    pub fn into_inner(self) -> T {
        self.value
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p db`
Expected: PASS (no call sites changed yet, so no warnings)

- [ ] **Step 3: Commit**

```bash
git add crates/db/src/lib.rs
git commit -m "feat(db): add WriteResult<T> must_use wrapper for event enforcement"
```

---

### Task 2: Wrap Task model write methods with WriteResult

**Files:**
- Modify: `crates/db/src/models/task.rs:241-346`

- [ ] **Step 1: Change Task::create return type**

In `crates/db/src/models/task.rs`, change `Task::create` (line ~241):

```rust
// Before:
pub async fn create(
    pool: &SqlitePool,
    data: &CreateTask,
    task_id: Uuid,
) -> Result<Self, sqlx::Error> {
    // ... query ...
    .fetch_one(pool)
    .await
}

// After:
pub async fn create(
    pool: &SqlitePool,
    data: &CreateTask,
    task_id: Uuid,
) -> Result<crate::WriteResult<Self>, sqlx::Error> {
    // ... query unchanged ...
    let task = sqlx::query_as!(/* unchanged */)
        .fetch_one(pool)
        .await?;
    Ok(crate::WriteResult::new(task))
}
```

- [ ] **Step 2: Change Task::update return type**

Same pattern for `Task::update` (line ~263):

```rust
// After:
pub async fn update(
    pool: &SqlitePool,
    id: Uuid,
    project_id: Uuid,
    title: String,
    description: Option<String>,
    status: TaskStatus,
    parent_workspace_id: Option<Uuid>,
) -> Result<crate::WriteResult<Self>, sqlx::Error> {
    let task = sqlx::query_as!(/* unchanged */)
        .fetch_one(pool)
        .await?;
    Ok(crate::WriteResult::new(task))
}
```

- [ ] **Step 3: Change Task::update_status return type**

For `Task::update_status` (line ~289). Currently returns `Result<(), sqlx::Error>`:

```rust
// After:
pub async fn update_status(
    pool: &SqlitePool,
    id: Uuid,
    status: TaskStatus,
) -> Result<crate::WriteResult<()>, sqlx::Error> {
    sqlx::query!(/* unchanged */)
        .execute(pool)
        .await?;
    Ok(crate::WriteResult::new(()))
}
```

- [ ] **Step 4: Change Task::update_parent_workspace_id return type**

For `Task::update_parent_workspace_id` (line ~305):

```rust
pub async fn update_parent_workspace_id(
    pool: &SqlitePool,
    task_id: Uuid,
    parent_workspace_id: Option<Uuid>,
) -> Result<crate::WriteResult<()>, sqlx::Error> {
    sqlx::query!(/* unchanged */)
        .execute(pool)
        .await?;
    Ok(crate::WriteResult::new(()))
}
```

- [ ] **Step 5: Change Task::nullify_children_by_workspace_id return type**

For `Task::nullify_children_by_workspace_id` (line ~322):

```rust
pub async fn nullify_children_by_workspace_id<'e, E>(
    executor: E,
    workspace_id: Uuid,
) -> Result<crate::WriteResult<u64>, sqlx::Error>
where
    E: Executor<'e, Database = Sqlite>,
{
    let result = sqlx::query!(/* unchanged */)
        .execute(executor)
        .await?;
    Ok(crate::WriteResult::new(result.rows_affected()))
}
```

- [ ] **Step 6: Change Task::delete return type**

For `Task::delete` (line ~338):

```rust
pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<crate::WriteResult<u64>, sqlx::Error>
where
    E: Executor<'e, Database = Sqlite>,
{
    let result = sqlx::query!(/* unchanged */)
        .execute(executor)
        .await?;
    Ok(crate::WriteResult::new(result.rows_affected()))
}
```

- [ ] **Step 7: Fix all Task call sites to add .into_inner()**

This is the most important step. Every call site that uses the return value of a Task write method must add `.into_inner()`. Search all files for these patterns and add `.into_inner()`:

In `crates/server/src/routes/tasks.rs`:
- Line ~124: `let task = Task::create(&deployment.db().pool, &payload, id).await?.into_inner();`
- Line ~181: `let task = Task::create(pool, &payload.task, task_id).await?.into_inner();`
- Line ~307: `let task = Task::update(&deployment.db().pool, ...).await?.into_inner();`
- Line ~380: `Task::nullify_children_by_workspace_id(&mut *tx, attempt.id).await?.into_inner();`
- Line ~385: `let rows_affected = Task::delete(&mut *tx, task.id).await?.into_inner();`

In `crates/server/src/routes/task_attempts.rs`:
- `Task::nullify_children_by_workspace_id(...)` call — add `.into_inner()`
- `Task::update_status(...)` call — add `.into_inner()`

In `crates/server/src/routes/task_attempts/pr.rs`:
- `Task::create(...)` — add `.into_inner()`
- `Task::update_status(...)` — add `.into_inner()`

In `crates/services/src/services/container.rs`:
- All `Task::update_status(...)` calls (lines ~231, ~326, ~1257, ~1351) — add `.into_inner()`

In `crates/services/src/services/pr_monitor.rs`:
- `Task::update_status(...)` call (line ~126) — add `.into_inner()`

In `crates/local-deployment/src/container.rs`:
- `Task::update_status(...)` call (line ~1455) — add `.into_inner()`

- [ ] **Step 8: Verify it compiles**

Run: `cargo check --workspace`
Expected: PASS with possible `#[must_use]` warnings (that's fine — we'll add the notify calls in Task 7)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(db): wrap Task write methods with WriteResult<T>"
```

---

### Task 3: Wrap ExecutionProcess model write methods with WriteResult

**Files:**
- Modify: `crates/db/src/models/execution_process.rs:429-531`

- [ ] **Step 1: Change ExecutionProcess::create return type**

```rust
pub async fn create(
    pool: &SqlitePool,
    data: &CreateExecutionProcess,
    process_id: Uuid,
    repo_states: &[CreateExecutionProcessRepoState],
) -> Result<crate::WriteResult<Self>, sqlx::Error> {
    // ... existing INSERT and create_many unchanged ...
    let ep = Self::find_by_id(pool, process_id)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    Ok(crate::WriteResult::new(ep))
}
```

Also remove the outdated doc comment about intentionally avoiding transactions — the race condition is now solved by explicit notification, not by avoiding transactions.

- [ ] **Step 2: Change ExecutionProcess::update_completion return type**

```rust
pub async fn update_completion(
    pool: &SqlitePool,
    id: Uuid,
    status: ExecutionProcessStatus,
    exit_code: Option<i64>,
) -> Result<crate::WriteResult<()>, sqlx::Error> {
    // ... existing query unchanged ...
    Ok(crate::WriteResult::new(()))
}
```

- [ ] **Step 3: Change ExecutionProcess::drop_at_and_after return type**

```rust
pub async fn drop_at_and_after(
    pool: &SqlitePool,
    session_id: Uuid,
    boundary_process_id: Uuid,
) -> Result<crate::WriteResult<i64>, sqlx::Error> {
    let result = sqlx::query!(/* unchanged */)
        .execute(pool)
        .await?;
    Ok(crate::WriteResult::new(result.rows_affected() as i64))
}
```

- [ ] **Step 4: Fix all ExecutionProcess call sites to add .into_inner()**

In `crates/services/src/services/container.rs`:
- Line ~272: `ExecutionProcess::update_completion(...)` — add `.into_inner()` (inside if-let-err block, so: `).await { Ok(wr) => { wr.into_inner(); }, Err(e) => ...}` — or simply the ? pattern: `.await?.into_inner();` depending on existing error handling)
- Line ~708: `ExecutionProcess::drop_at_and_after(pool, session_id, target_process_id).await?.into_inner();`
- Line ~1292: `let execution_process = ExecutionProcess::create(...).await?.into_inner();`
- Line ~1337: `ExecutionProcess::update_completion(...).await` (inside `if let Err(update_error)`) — restructure to handle WriteResult

In `crates/local-deployment/src/container.rs`:
- Line ~510: `ExecutionProcess::update_completion(...)` — add `.into_inner()`
- Wherever else `update_completion` is called

- [ ] **Step 5: Verify it compiles**

Run: `cargo check --workspace`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): wrap ExecutionProcess write methods with WriteResult<T>"
```

---

### Task 4: Wrap Workspace, Scratch, and Project model write methods with WriteResult

**Files:**
- Modify: `crates/db/src/models/workspace.rs` (create, update, update_container_ref, update_branch_name, set_archived, delete)
- Modify: `crates/db/src/models/scratch.rs` (create, update, delete)
- Modify: `crates/db/src/models/project.rs` (create, update, delete)

- [ ] **Step 1: Wrap Workspace write methods**

Apply the same `WriteResult` pattern to each:

`Workspace::create` — returns `Result<WriteResult<Self>, WorkspaceError>`:
```rust
pub async fn create(...) -> Result<crate::WriteResult<Self>, WorkspaceError> {
    let ws = sqlx::query_as!(/* unchanged */).fetch_one(pool).await?;
    Ok(crate::WriteResult::new(ws))
}
```

`Workspace::update_container_ref` — returns `Result<WriteResult<()>, sqlx::Error>`
`Workspace::update_branch_name` — returns `Result<WriteResult<()>, WorkspaceError>`
`Workspace::set_archived` — returns `Result<WriteResult<()>, sqlx::Error>`
`Workspace::update` — returns `Result<WriteResult<()>, sqlx::Error>`
`Workspace::delete` — returns `Result<WriteResult<u64>, sqlx::Error>`

- [ ] **Step 2: Wrap Scratch write methods**

`Scratch::create` — returns `Result<WriteResult<Self>, ScratchError>`:
```rust
pub async fn create(...) -> Result<crate::WriteResult<Self>, ScratchError> {
    let row = sqlx::query_as!(/* unchanged */).fetch_one(pool).await?;
    Ok(crate::WriteResult::new(Scratch::try_from(row)?))
}
```

`Scratch::update` — returns `Result<WriteResult<Self>, ScratchError>`
`Scratch::delete` — returns `Result<WriteResult<u64>, sqlx::Error>`

- [ ] **Step 3: Wrap Project write methods**

`Project::create` — returns `Result<WriteResult<Self>, sqlx::Error>`:
```rust
pub async fn create(
    executor: impl Executor<'_, Database = Sqlite>,
    data: &CreateProject,
    project_id: Uuid,
) -> Result<crate::WriteResult<Self>, sqlx::Error> {
    let project = sqlx::query_as!(/* unchanged */).fetch_one(executor).await?;
    Ok(crate::WriteResult::new(project))
}
```

`Project::update` — returns `Result<WriteResult<Self>, sqlx::Error>`
`Project::delete` — returns `Result<WriteResult<u64>, sqlx::Error>`

- [ ] **Step 4: Fix all Workspace call sites to add .into_inner()**

In `crates/server/src/routes/tasks.rs`:
- `Workspace::create(...)` — add `.into_inner()`

In `crates/server/src/routes/task_attempts.rs`:
- `Workspace::create(...)` — add `.into_inner()`
- `Workspace::update(...)` — add `.into_inner()`
- `Workspace::update_branch_name(...)` — add `.into_inner()`
- `Workspace::delete(...)` — add `.into_inner()`

In `crates/server/src/routes/task_attempts/pr.rs`:
- `Workspace::create(...)` — add `.into_inner()`
- `Workspace::update_branch_name(...)` — add `.into_inner()`

In `crates/local-deployment/src/container.rs`:
- All `Workspace::update_container_ref(...)` calls — add `.into_inner()`
- `Workspace::set_archived(...)` — no direct calls here, but check

In `crates/services/src/services/container.rs`:
- `Workspace::set_archived(...)` calls (lines ~536, ~1302) — add `.into_inner()`

**Note:** `Workspace::update` is also called internally by `Workspace::find_all_with_status` (line ~692 in workspace.rs). This is an internal call that auto-generates names — it should NOT have WriteResult. Keep the current `Workspace::update` signature for that internal use, or create a separate `update_name_internal` that doesn't wrap. The simplest approach: the `find_all_with_status` method calls `Self::update(...)` which now returns `WriteResult<()>` — just add `.into_inner()` there since that's a read-side name backfill, not a user-facing mutation that needs WS notification.

- [ ] **Step 5: Fix all Scratch call sites to add .into_inner()**

In `crates/server/src/routes/scratch.rs`:
- `Scratch::create(...)` — add `.into_inner()`
- `Scratch::update(...)` — add `.into_inner()`
- `Scratch::delete(...)` — add `.into_inner()`

In `crates/server/src/routes/sessions/mod.rs`:
- `Scratch::delete(...)` — add `.into_inner()`

In `crates/local-deployment/src/container.rs`:
- `Scratch::delete(...)` (line ~593) — add `.into_inner()`

- [ ] **Step 6: Fix all Project call sites to add .into_inner()**

In `crates/services/src/services/project.rs`:
- `Project::create(pool, &payload, id)` (line ~100) — add `.into_inner()` before `.map_err(...)`
- `Project::update(pool, existing.id, &payload)` (line ~120) — add `.into_inner()`
- `Project::delete(pool, project_id)` (line ~203) — add `.into_inner()`

- [ ] **Step 7: Verify it compiles**

Run: `cargo check --workspace`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): wrap Workspace, Scratch, Project write methods with WriteResult<T>"
```

---

### Task 5: Add `fn events()` to ContainerService trait

**Files:**
- Modify: `crates/services/src/services/container.rs:91-107`
- Modify: `crates/local-deployment/src/container.rs:84-101,1044-1079`
- Modify: `crates/local-deployment/src/lib.rs:156-166`

- [ ] **Step 1: Add events() to ContainerService trait**

In `crates/services/src/services/container.rs`, add to the trait definition (after `fn db()`):

```rust
#[async_trait]
pub trait ContainerService {
    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>;
    fn normalized_entry_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<NormalizedEntryStore>>>>;
    fn db(&self) -> &DBService;
    fn events(&self) -> &EventService;  // NEW
    fn git(&self) -> &GitService;
    // ... rest unchanged
}
```

Add the import for `EventService` at the top of the file if not already there:
```rust
use crate::services::events::EventService;
```

- [ ] **Step 2: Add events field to LocalContainerService**

In `crates/local-deployment/src/container.rs`, add to the struct (line ~84):

```rust
pub struct LocalContainerService {
    db: DBService,
    events: EventService,  // NEW
    // ... rest unchanged
}
```

Update `LocalContainerService::new()` (line ~105) to accept and store EventService:

```rust
pub async fn new(
    db: DBService,
    events: EventService,  // NEW parameter
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    config: Arc<RwLock<Config>>,
    git: GitService,
    image_service: ImageService,
    analytics: Option<AnalyticsContext>,
    approvals: Approvals,
    queued_message_service: QueuedMessageService,
) -> Self {
    Self {
        db,
        events,  // NEW
        // ... rest unchanged
    }
}
```

- [ ] **Step 3: Implement events() in ContainerService impl**

In `crates/local-deployment/src/container.rs`, add to the `impl ContainerService for LocalContainerService` block (line ~1044):

```rust
fn events(&self) -> &EventService {
    &self.events
}
```

- [ ] **Step 4: Pass EventService when constructing LocalContainerService**

In `crates/local-deployment/src/lib.rs`, the `EventService` is created at line ~168 AFTER `LocalContainerService::new()` at line ~156. Restructure:

```rust
// Create EventService BEFORE container (it no longer needs entry_count or hook db)
// We still need msg_store for both the hook and EventService
let events = EventService::new(db.clone(), events_msg_store.clone());

let container = LocalContainerService::new(
    db.clone(),
    events.clone(),  // NEW parameter
    msg_stores.clone(),
    config.clone(),
    git.clone(),
    image.clone(),
    analytics_ctx,
    approvals.clone(),
    queued_message_service.clone(),
)
.await;
```

Note: The `EventService::new` signature will change in Task 6 (removing `entry_count` param). For now, keep the old signature — Task 6 will update it.

- [ ] **Step 5: Add EventService to PrMonitorService**

In `crates/services/src/services/pr_monitor.rs`, `PrMonitorService` has a `db: DBService` field but no `events`. Since it has `container: C` where `C: ContainerService`, and we just added `fn events()` to `ContainerService`, it can now access events via `self.container.events()`. No struct change needed.

Update the call site at line ~126:
```rust
Task::update_status(&self.db.pool, workspace.task_id, TaskStatus::Done).await?.into_inner();
self.container.events().notify_task_upsert(workspace.task_id).await;
```

(The `notify_task_upsert` method will be implemented in Task 6.)

- [ ] **Step 6: Verify it compiles**

Run: `cargo check --workspace`
Expected: May fail if EventService::new signature is incompatible. We'll fix that in the next step if needed. The key is the trait and struct changes compile.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(services): add fn events() to ContainerService trait"
```

---

### Task 6: Implement EventService::notify_* methods and simplify create_hook

**Files:**
- Modify: `crates/services/src/services/events.rs` (major rewrite)

This is the core task. We extract all the notification logic from the `update_hook` into explicit `notify_*` methods, then strip the `update_hook` down to nothing (remove it).

- [ ] **Step 1: Simplify EventService struct and constructor**

Remove `entry_count` field. The `db` field stays (used by notify methods to query committed data).

```rust
#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
}

impl EventService {
    pub fn new(db: DBService, msg_store: Arc<MsgStore>) -> Self {
        Self { msg_store, db }
    }
```

- [ ] **Step 2: Implement notify_task_upsert**

Extract logic from the current `RecordTypes::Task(task)` arm in update_hook:

```rust
    /// Notify that a task was created or updated.
    /// Queries committed data, builds TaskWithAttemptStatus, and pushes a replace patch.
    pub async fn notify_task_upsert(&self, task_id: Uuid) {
        let pool = &self.db.pool;
        match Task::find_by_id(pool, task_id).await {
            Ok(Some(task)) => {
                match Task::find_by_project_id_with_attempt_status(pool, task.project_id).await {
                    Ok(task_list) => {
                        if let Some(task_with_status) =
                            task_list.into_iter().find(|t| t.id == task_id)
                        {
                            self.msg_store
                                .push_patch(task_patch::replace(&task_with_status));
                        }
                    }
                    Err(e) => {
                        tracing::error!(
                            task_id = %task_id,
                            error = %e,
                            "notify_task_upsert: find_by_project_id_with_attempt_status failed"
                        );
                    }
                }
            }
            Ok(None) => {
                tracing::warn!(task_id = %task_id, "notify_task_upsert: task not found");
            }
            Err(e) => {
                tracing::error!(task_id = %task_id, error = %e, "notify_task_upsert: query failed");
            }
        }
    }

    /// Notify that a task was deleted. Only use from preupdate_hook or explicit delete sites.
    pub async fn notify_task_deleted(&self, task_id: Uuid) {
        self.msg_store.push_patch(task_patch::remove(task_id));
    }
```

- [ ] **Step 3: Implement notify_ep_upsert and notify_ep_deleted**

Extract logic from the current `RecordTypes::ExecutionProcess(process)` arm:

```rust
    /// Notify that an execution process was created or updated.
    /// Also cascades updates to parent task and workspace.
    pub async fn notify_ep_upsert(&self, ep_id: Uuid) {
        let pool = &self.db.pool;
        match ExecutionProcess::find_by_id(pool, ep_id).await {
            Ok(Some(process)) => {
                self.msg_store
                    .push_patch(execution_process_patch::replace(&process));

                if let Err(err) = Self::push_task_update_for_session(
                    pool,
                    self.msg_store.clone(),
                    process.session_id,
                )
                .await
                {
                    tracing::error!(
                        "notify_ep_upsert: failed to push task update: {:?}",
                        err
                    );
                }

                if let Err(err) = Self::push_workspace_update_for_session(
                    pool,
                    self.msg_store.clone(),
                    process.session_id,
                )
                .await
                {
                    tracing::error!(
                        "notify_ep_upsert: failed to push workspace update: {:?}",
                        err
                    );
                }
            }
            Ok(None) => {
                tracing::warn!(ep_id = %ep_id, "notify_ep_upsert: execution process not found");
            }
            Err(e) => {
                tracing::error!(ep_id = %ep_id, error = %e, "notify_ep_upsert: query failed");
            }
        }
    }

    /// Notify that an execution process was deleted.
    /// Cascades task and workspace updates if session_id is known.
    pub async fn notify_ep_deleted(&self, ep_id: Uuid, session_id: Option<Uuid>) {
        self.msg_store
            .push_patch(execution_process_patch::remove(ep_id));

        if let Some(session_id) = session_id {
            let pool = &self.db.pool;
            if let Err(err) =
                Self::push_task_update_for_session(pool, self.msg_store.clone(), session_id).await
            {
                tracing::error!("notify_ep_deleted: failed to push task update: {:?}", err);
            }
            if let Err(err) =
                Self::push_workspace_update_for_session(pool, self.msg_store.clone(), session_id)
                    .await
            {
                tracing::error!(
                    "notify_ep_deleted: failed to push workspace update: {:?}",
                    err
                );
            }
        }
    }
```

- [ ] **Step 4: Implement notify_workspace_upsert and notify_workspace_deleted**

```rust
    /// Notify that a workspace was created or updated.
    /// Also cascades update to parent task.
    pub async fn notify_workspace_upsert(&self, workspace_id: Uuid) {
        let pool = &self.db.pool;
        // Emit workspace patch with status
        if let Ok(Some(workspace_with_status)) =
            Workspace::find_by_id_with_status(pool, workspace_id).await
        {
            self.msg_store
                .push_patch(workspace_patch::replace(&workspace_with_status));

            // Also update parent task
            if let Ok(Some(task)) = Task::find_by_id(pool, workspace_with_status.task_id).await
                && let Ok(task_list) =
                    Task::find_by_project_id_with_attempt_status(pool, task.project_id).await
                && let Some(task_with_status) = task_list
                    .into_iter()
                    .find(|t| t.id == workspace_with_status.task_id)
            {
                self.msg_store
                    .push_patch(task_patch::replace(&task_with_status));
            }
        }
    }

    /// Notify that a workspace was deleted.
    /// Cascades parent task update if task_id is known.
    pub async fn notify_workspace_deleted(&self, workspace_id: Uuid, task_id: Option<Uuid>) {
        self.msg_store
            .push_patch(workspace_patch::remove(workspace_id));

        if let Some(task_id) = task_id {
            Self::push_task_update_for_task(&self.db.pool, self.msg_store.clone(), task_id)
                .await
                .ok();
        }
    }
```

- [ ] **Step 5: Implement notify_scratch_upsert and notify_scratch_deleted**

```rust
    /// Notify that a scratch was created or updated.
    pub async fn notify_scratch_upsert(&self, scratch_id: Uuid, scratch_type: &str) {
        let pool = &self.db.pool;
        if let Ok(scratch_type_enum) = scratch_type.parse::<ScratchType>() {
            match Scratch::find_by_id(pool, scratch_id, &scratch_type_enum).await {
                Ok(Some(scratch)) => {
                    self.msg_store.push_patch(scratch_patch::replace(&scratch));
                }
                Ok(None) => {
                    tracing::warn!(
                        scratch_id = %scratch_id,
                        scratch_type = scratch_type,
                        "notify_scratch_upsert: scratch not found"
                    );
                }
                Err(e) => {
                    tracing::error!(
                        scratch_id = %scratch_id,
                        error = %e,
                        "notify_scratch_upsert: query failed"
                    );
                }
            }
        }
    }

    /// Notify that a scratch was deleted.
    pub async fn notify_scratch_deleted(&self, scratch_id: Uuid, scratch_type: &str) {
        self.msg_store
            .push_patch(scratch_patch::remove(scratch_id, scratch_type));
    }
```

- [ ] **Step 6: Implement notify_project_upsert and notify_project_deleted**

```rust
    /// Notify that a project was created or updated.
    pub async fn notify_project_upsert(&self, project_id: Uuid) {
        match Project::find_by_id(&self.db.pool, project_id).await {
            Ok(Some(project)) => {
                self.msg_store.push_patch(project_patch::replace(&project));
            }
            Ok(None) => {
                tracing::warn!(project_id = %project_id, "notify_project_upsert: project not found");
            }
            Err(e) => {
                tracing::error!(project_id = %project_id, error = %e, "notify_project_upsert: query failed");
            }
        }
    }

    /// Notify that a project was deleted.
    pub async fn notify_project_deleted(&self, project_id: Uuid) {
        self.msg_store
            .push_patch(project_patch::remove(project_id));
    }
```

- [ ] **Step 7: Remove update_hook from create_hook, keep only preupdate_hook**

Simplify `create_hook`:
- Remove the `entry_count` and `db_service` parameters
- Remove the entire `handle.set_update_hook(...)` block
- Keep only the `handle.set_preupdate_hook(...)` block (DELETE handling)
- Remove the `runtime_handle` variable (no longer needed)

```rust
    /// Creates the hook function that sets up preupdate_hook for DELETE tracking.
    /// INSERT/UPDATE events are handled by explicit notify_*() calls at write sites.
    pub fn create_hook(
        msg_store: Arc<MsgStore>,
    ) -> impl for<'a> Fn(
        &'a mut sqlx::sqlite::SqliteConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + 'a>,
    > + Send
    + Sync
    + 'static {
        move |conn: &mut sqlx::sqlite::SqliteConnection| {
            let msg_store_for_hook = msg_store.clone();
            Box::pin(async move {
                let mut handle = conn.lock_handle().await?;
                handle.set_preupdate_hook({
                    let msg_store_for_preupdate = msg_store_for_hook.clone();
                    move |preupdate: sqlx::sqlite::PreupdateHookResult<'_>| {
                        if preupdate.operation != SqliteOperation::Delete {
                            return;
                        }
                        // ... existing DELETE handling for all 5 tables — UNCHANGED ...
                        match preupdate.table {
                            "tasks" => { /* existing code unchanged */ }
                            "projects" => { /* existing code unchanged */ }
                            "workspaces" => { /* existing code unchanged */ }
                            "execution_processes" => { /* existing code unchanged */ }
                            "scratch" => { /* existing code unchanged */ }
                            _ => {}
                        }
                    }
                });
                // NO set_update_hook — INSERT/UPDATE handled by explicit notify_*() calls
                Ok(())
            })
        }
    }
```

- [ ] **Step 8: Remove retry_find_by_rowid and related constants**

Delete from the top of `events.rs`:
- `const HOOK_RETRY_COUNT: u32 = 3;`
- `const HOOK_RETRY_DELAY: std::time::Duration = ...;`
- The entire `async fn retry_find_by_rowid<T, F, Fut>(...)` function

Remove now-unused imports: `serde_json::json`, `Decode`, `SqliteOperation` (check if still needed by preupdate_hook — `SqliteOperation` is still needed for the preupdate_hook).

Clean up unused types: `EventPatch`, `EventPatchInner`, `RecordTypes` — check if they're used by streams.rs or other modules. If only used by the old hook fallback code, they can be removed. If they're part of the TS type generation, keep them.

- [ ] **Step 9: Update EventService::new call in local-deployment/src/lib.rs**

```rust
// Before:
let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

// After:
let events = EventService::new(db.clone(), events_msg_store);
```

Also update `create_hook` call:
```rust
// Before:
let hook = EventService::create_hook(
    events_msg_store.clone(),
    events_entry_count.clone(),
    DBService::new().await?,
);

// After:
let hook = EventService::create_hook(events_msg_store.clone());
```

Remove the `events_entry_count` variable entirely.
Remove the `DBService::new().await?` call inside the hook creation block (this was the extra connection pool).

- [ ] **Step 10: Verify it compiles**

Run: `cargo check --workspace`
Expected: PASS (or fixable errors from unused imports/types)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(events): implement notify_* methods, remove update_hook and retry logic"
```

---

### Task 7: Add explicit notify calls at all write sites

**Files:**
- Modify: `crates/server/src/routes/tasks.rs`
- Modify: `crates/server/src/routes/task_attempts.rs`
- Modify: `crates/server/src/routes/task_attempts/pr.rs`
- Modify: `crates/server/src/routes/scratch.rs`
- Modify: `crates/server/src/routes/sessions/mod.rs`
- Modify: `crates/services/src/services/container.rs`
- Modify: `crates/services/src/services/pr_monitor.rs`
- Modify: `crates/services/src/services/project.rs`
- Modify: `crates/local-deployment/src/container.rs`

This is a mechanical task. For each write call site, add the corresponding `notify_*` call after `.into_inner()`. Route handlers access `deployment.events()`, container methods access `self.events()`.

- [ ] **Step 1: Add notify calls in routes/tasks.rs**

```rust
// create_task (line ~124):
let task = Task::create(&deployment.db().pool, &payload, id).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;

// create_task_and_start (line ~181):
let task = Task::create(pool, &payload.task, task_id).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;

// (later in same fn) Workspace::create (line ~231):
let workspace = Workspace::create(pool, &CreateWorkspace { ... }, attempt_id, task.id).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

// update_task (line ~307):
let task = Task::update(&deployment.db().pool, ...).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;

// delete_task: nullify + delete are inside a transaction.
// Notify AFTER tx.commit() (line ~392):
tx.commit().await?;
// Notify affected children (task refs were nullified but tasks still exist)
// We need the task IDs of affected children. Query them BEFORE the transaction.
// Actually, nullify_children updates parent_workspace_id to NULL — this doesn't change
// the task's status or require WS notification to clients unless they track parent_workspace_id.
// The DELETE is handled by preupdate_hook. So for delete_task:
// - Task::delete → preupdate_hook fires → task_patch::remove emitted (existing behavior)
// - No explicit notify_task_deleted needed (preupdate_hook handles it)
// - For nullified children: only parent_workspace_id changed, evaluate if WS notification needed
```

- [ ] **Step 2: Add notify calls in routes/task_attempts.rs**

Key call sites:
```rust
// create_task_attempt — Workspace::create:
let workspace = Workspace::create(pool, &create_workspace, attempt_id, task.id).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

// update_workspace — Workspace::update:
Workspace::update(pool, workspace.id, ...).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

// rename_branch — Workspace::update_branch_name:
Workspace::update_branch_name(pool, workspace.id, &new_branch_name).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

// confirm_task_attempt_merge — Task::update_status:
Task::update_status(pool, task.id, TaskStatus::Done).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;

// delete_workspace:
// Task::nullify_children_by_workspace_id, Workspace::delete
// DELETE events handled by preupdate_hook
```

- [ ] **Step 3: Add notify calls in routes/task_attempts/pr.rs**

```rust
// create_workspace_from_pr:
let task = Task::create(pool, &create_task, task_id).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;

let workspace = Workspace::create(pool, &create_workspace, workspace_id, task_id).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

Workspace::update_branch_name(pool, workspace.id, &branch_name).await?.into_inner();
deployment.events().notify_workspace_upsert(workspace.id).await;

// attach_pr — Task::update_status:
Task::update_status(pool, task.id, TaskStatus::InProgress).await?.into_inner();
deployment.events().notify_task_upsert(task.id).await;
```

- [ ] **Step 4: Add notify calls in routes/scratch.rs**

```rust
// create_scratch:
let scratch = Scratch::create(&deployment.db().pool, id, &payload).await?.into_inner();
deployment.events().notify_scratch_upsert(scratch.id, &scratch.payload.scratch_type().to_string()).await;

// update_scratch:
let scratch = Scratch::update(&deployment.db().pool, id, &scratch_type, &payload).await?.into_inner();
deployment.events().notify_scratch_upsert(scratch.id, &scratch_type.to_string()).await;

// delete_scratch:
Scratch::delete(&deployment.db().pool, id, &scratch_type).await?.into_inner();
deployment.events().notify_scratch_deleted(id, &scratch_type.to_string()).await;
```

- [ ] **Step 5: Add notify calls in routes/sessions/mod.rs**

```rust
// follow_up — Scratch::delete:
Scratch::delete(pool, session_id, &ScratchType::DraftFollowUp).await?.into_inner();
deployment.events().notify_scratch_deleted(session_id, &ScratchType::DraftFollowUp.to_string()).await;
```

- [ ] **Step 6: Add notify calls in services/container.rs**

```rust
// finalize_task (line ~231):
Task::update_status(&self.db().pool, ctx.task.id, TaskStatus::InReview).await?.into_inner();
self.events().notify_task_upsert(ctx.task.id).await;

// cleanup_orphan_executions (line ~272):
ExecutionProcess::update_completion(&self.db().pool, process.id, ExecutionProcessStatus::Failed, None).await?.into_inner();
self.events().notify_ep_upsert(process.id).await;
// ... and the Task::update_status call later in the same function:
Task::update_status(&self.db().pool, task.id, TaskStatus::InReview).await?.into_inner();
self.events().notify_task_upsert(task.id).await;

// archive_workspace (line ~536):
Workspace::set_archived(pool, workspace_id, true).await?.into_inner();
self.events().notify_workspace_upsert(workspace_id).await;

// reset_session_to_process (line ~708):
ExecutionProcess::drop_at_and_after(pool, session_id, target_process_id).await?.into_inner();
// drop_at_and_after affects multiple EPs — notify each affected one
// For simplicity, notify the session's task update:
self.events().notify_task_upsert(/* need task_id */).await;

// start_execution (line ~1257):
Task::update_status(&self.db().pool, task.id, TaskStatus::InProgress).await?.into_inner();
self.events().notify_task_upsert(task.id).await;

// start_execution — EP::create (line ~1292):
let execution_process = ExecutionProcess::create(&self.db().pool, &create_execution_process, Uuid::new_v4(), &repo_states).await?.into_inner();
self.events().notify_ep_upsert(execution_process.id).await;

// start_execution — Workspace::set_archived (line ~1302):
Workspace::set_archived(&self.db().pool, workspace.id, false).await?.into_inner();
self.events().notify_workspace_upsert(workspace.id).await;

// start_execution — failure path (line ~1337):
ExecutionProcess::update_completion(&self.db().pool, execution_process.id, ExecutionProcessStatus::Failed, None).await.ok().map(|wr| wr.into_inner());
self.events().notify_ep_upsert(execution_process.id).await;
Task::update_status(&self.db().pool, task.id, TaskStatus::InReview).await?.into_inner();
self.events().notify_task_upsert(task.id).await;
```

- [ ] **Step 7: Add notify calls in services/pr_monitor.rs**

```rust
// check_pr_status — Task::update_status (line ~126):
Task::update_status(&self.db.pool, workspace.task_id, TaskStatus::Done).await?.into_inner();
self.container.events().notify_task_upsert(workspace.task_id).await;
```

- [ ] **Step 8: Add notify calls in services/project.rs**

`ProjectService` doesn't have an `events` field. Options:
1. Add `EventService` as a field
2. Accept it as a parameter
3. Since route handlers call project service methods and have access to `deployment.events()`, add notify calls in the route handlers instead

Option 3 is simplest. In `crates/server/src/routes/projects.rs`, after each `project_service.create_project(...)`, `project_service.update_project(...)`, `project_service.delete_project(...)` call, add:

```rust
// After create:
let project = deployment.project().create_project(pool, payload).await?;
deployment.events().notify_project_upsert(project.id).await;

// After update:
let project = deployment.project().update_project(pool, &existing, payload).await?;
deployment.events().notify_project_upsert(project.id).await;

// After delete:
deployment.project().delete_project(pool, project_id).await?;
deployment.events().notify_project_deleted(project_id).await;
```

Find the actual route handlers in `crates/server/src/routes/projects.rs` and add the notify calls there.

- [ ] **Step 9: Add notify calls in local-deployment/container.rs**

```rust
// spawn_exit_monitor — EP::update_completion (line ~510):
ExecutionProcess::update_completion(&db.pool, exec_id, status, exit_code).await?.into_inner();
// Need events access here. spawn_exit_monitor captures `self` fields.
// Add `let events = self.events.clone();` at the top of the method alongside other clones.
events.notify_ep_upsert(exec_id).await;

// finalize_task (line ~1455):
Task::update_status(&self.db.pool, ctx.task.id, TaskStatus::InReview).await?.into_inner();
self.events().notify_task_upsert(ctx.task.id).await;

// Workspace::update_container_ref calls in create() and ensure_container_exists():
Workspace::update_container_ref(&self.db.pool, workspace.id, &path).await?.into_inner();
self.events().notify_workspace_upsert(workspace.id).await;

// Scratch::delete in handle_process_exit (line ~593):
Scratch::delete(&db.pool, ctx.session.id, &ScratchType::DraftFollowUp).await?.into_inner();
// events access from captured clone:
events.notify_scratch_deleted(ctx.session.id, &ScratchType::DraftFollowUp.to_string()).await;
```

- [ ] **Step 10: Verify it compiles**

Run: `cargo check --workspace`
Expected: PASS with zero `#[must_use]` warnings about `WriteResult`

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(events): add explicit notify_* calls at all 43 write sites"
```

---

### Task 8: Clean up unused types and verify

**Files:**
- Modify: `crates/services/src/services/events/types.rs`
- Modify: `crates/services/src/services/events.rs`
- Modify: `crates/server/src/bin/generate_types.rs` (if RecordTypes is exported)

- [ ] **Step 1: Check if RecordTypes, EventPatch, EventPatchInner are still used**

Search for usages of `RecordTypes`, `EventPatch`, `EventPatchInner` outside of `events.rs`:

```bash
cargo check --workspace 2>&1 | grep "dead_code\|unused"
```

If they're only used by the removed update_hook code, they can be removed. If they're exported for TypeScript type generation (via `generate_types.rs`), keep them or remove them from generation.

- [ ] **Step 2: Remove unused types if safe**

If `RecordTypes`, `EventPatch`, `EventPatchInner` are unused:
- Remove from `types.rs`
- Remove from `pub use` in `events.rs`
- Remove from `generate_types.rs` if present

If `HookTables` is only used by `preupdate_hook` (string matching), check if it's still needed. The preupdate_hook matches on string literals (`"tasks"`, `"projects"`, etc.), not `HookTables`. So `HookTables` may be removable too.

- [ ] **Step 3: Remove find_by_rowid methods if unused**

The `find_by_rowid` methods on Task, ExecutionProcess, Workspace, Scratch, Project were only used by the update_hook. If they have no other callers, remove them:

```bash
# Check for usages
grep -rn 'find_by_rowid' crates/ --include='*.rs' | grep -v 'fn find_by_rowid'
```

If only called from the now-removed hook code, delete the methods from each model.

- [ ] **Step 4: Run full test suite**

```bash
cargo test --workspace
```

Expected: All tests pass.

- [ ] **Step 5: Run type generation check**

```bash
pnpm run generate-types:check
```

Expected: PASS (or update generation if types were removed)

- [ ] **Step 6: Run frontend checks**

```bash
pnpm run check && pnpm run lint
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(events): remove unused types, find_by_rowid methods, and hook infrastructure"
```

---

### Task 9: Manual verification

- [ ] **Step 1: Start dev server**

```bash
pnpm run dev
```

- [ ] **Step 2: Test task creation**

Create a new task. It should immediately appear in the correct status (todo or in_progress) without page refresh.

- [ ] **Step 3: Test followUp message**

Send a followUp message. The user message should appear immediately in the conversation.

- [ ] **Step 4: Test execution completion**

Wait for an execution to complete. The "stop" button should change to "send" button without refresh.

- [ ] **Step 5: Test stop button**

Click stop on a running task. Task status should update immediately.

- [ ] **Step 6: Check backend logs**

Verify no `#[must_use]` warnings about WriteResult in build output:
```bash
cargo build --workspace 2>&1 | grep -i 'must_use\|WriteResult'
```

Expected: No warnings.
