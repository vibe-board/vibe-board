# Spec: Post-Commit Event Notification (消除 SQLite Hook 竞态条件)

## 问题

当前架构通过 SQLite `update_hook` 检测写操作，在 hook 内 `spawn` 异步任务，用独立连接 `find_by_rowid` 查询数据。但 hook 在 auto-commit 之前触发，独立连接看不到未提交的数据，导致 `find_by_rowid` 返回 `None`，WebSocket 事件丢失。

当前的 retry（3次 × 5ms）是概率性修复，数据库负载高时会失效。

## 方案：显式 Post-Commit 通知 + 编译时防漏

### 核心思路

`execute().await` 返回时 auto-commit 已完成。在此时间点显式调用 `EventService::notify_*()` 发送事件，数据保证可见，零竞态。

### 架构图

```
Write Call Site (route handler / service method)
    │
    ├── 1. Model::write(&pool, ...).await?    // execute + auto-commit
    │         返回 WriteResult<T> (#[must_use])
    │
    ├── 2. result.into_inner()                // 编译器强制你处理 WriteResult
    │
    └── 3. events.notify_xxx(id).await        // 数据已提交，query 必定成功
            ├── Query committed data
            ├── Build JSON Patch
            └── Push to MsgStore → WebSocket clients
```

## 详细设计

### 1. 编译时防漏：`WriteResult<T>` 包装类型

这是本方案的核心防漏机制。写方法返回 `WriteResult<T>` 而不是 `T`，忘记处理则编译器 warn。

```rust
// crates/db/src/lib.rs

/// Wrapper for database write results that enforces event notification.
///
/// Write methods for event-monitored tables (tasks, execution_processes,
/// workspaces, scratch, projects) return this type. The caller MUST call
/// `.into_inner()` to extract the value, serving as a deliberate
/// acknowledgement that event notification has been (or will be) handled.
///
/// Combined with `#[deny(unused_must_use)]`, forgetting to handle this
/// type becomes a compile error.
#[must_use = "database write completed but event not emitted — \
              call .into_inner() after sending notification"]
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

**应用于哪些方法**（仅 5 个 event-monitored 表的写方法）：

| 表 | 方法 | 返回值变更 |
|---|------|-----------|
| tasks | `create`, `update`, `update_status`, `update_parent_workspace_id` | `Result<WriteResult<T>>` |
| tasks | `delete`, `nullify_children_by_workspace_id` | `Result<WriteResult<u64>>` |
| execution_processes | `create`, `update_completion`, `drop_at_and_after` | `Result<WriteResult<T>>` |
| workspaces | `create`, `update`, `update_container_ref`, `update_branch_name`, `delete`, `set_archived` | `Result<WriteResult<T>>` |
| scratch | `create`, `update`, `delete` | `Result<WriteResult<T>>` |
| projects | `create`, `update`, `delete` | `Result<WriteResult<T>>` |

**不应用于**：`session`, `image`, `repo`, `tag`, `normalized_entries`, `coding_agent_turn` 等无 event 需求的表。

**调用示例**：
```rust
// 忘记处理 → 编译警告/错误
Task::create(&pool, &data).await?;
// warning: unused `WriteResult<Task>` that must be used

// 正确用法：
let task = Task::create(&pool, &data).await?.into_inner();
events.notify_task_upsert(task.id).await;
```

### 2. EventService 新增 notify 方法

每个 notify 方法：查询已提交数据 → 构建 JSON Patch → push 到 MsgStore。

```rust
impl EventService {
    // ---- Tasks ----
    /// 通知 task 变更（create / update / update_status）
    /// 内部查 find_by_project_id_with_attempt_status 获取完整状态
    pub async fn notify_task_upsert(&self, task_id: Uuid) { ... }
    pub async fn notify_task_deleted(&self, task_id: Uuid) { ... }

    // ---- Execution Processes ----
    /// 通知 EP 变更 + 级联更新 parent task 和 workspace
    pub async fn notify_ep_upsert(&self, ep_id: Uuid) { ... }
    pub async fn notify_ep_deleted(&self, ep_id: Uuid, session_id: Option<Uuid>) { ... }

    // ---- Workspaces ----
    /// 通知 workspace 变更 + 级联更新 parent task
    pub async fn notify_workspace_upsert(&self, workspace_id: Uuid) { ... }
    pub async fn notify_workspace_deleted(&self, workspace_id: Uuid, task_id: Option<Uuid>) { ... }

    // ---- Scratch ----
    pub async fn notify_scratch_upsert(&self, scratch_id: Uuid, scratch_type: &str) { ... }
    pub async fn notify_scratch_deleted(&self, scratch_id: Uuid, scratch_type: &str) { ... }

    // ---- Projects ----
    pub async fn notify_project_upsert(&self, project_id: Uuid) { ... }
    pub async fn notify_project_deleted(&self, project_id: Uuid) { ... }
}
```

这些方法的内部逻辑直接从当前 `update_hook` 中提取，只是从"hook 内 spawn 执行"变为"调用点直接 await"。

### 3. 移除 update_hook，保留 preupdate_hook

**移除 `update_hook`**：
- 删除 `retry_find_by_rowid()` 函数和相关常量
- 删除 `handle.set_update_hook(...)` 及其全部 INSERT/UPDATE 处理逻辑
- 删除 `entry_count` (`Arc<RwLock<usize>>`) — hook 不再生成 entries
- 删除 hook 内部的独立 `DBService::new()` 连接池
- 删除 `EventService::create_hook` 中的 `db_service` 参数

**保留 `preupdate_hook`**：
- DELETE 操作需要在删除前捕获旧值（task_id, scratch_type 等）
- preupdate_hook 没有竞态问题（数据还在，直接读旧值）
- 保持当前行为不变

**保留不变的代码**：
- `EventService::push_task_update_for_session()` — 被 notify 方法内部复用
- `EventService::push_workspace_update_for_session()` — 被 notify 方法内部复用
- 所有 `*_patch` 模块 — patch 生成逻辑不变
- `MsgStore` 和 broadcast 机制 — 不变

### 4. ContainerService trait 增加 `fn events()`

**问题**：约 20 处调用点在 service 层（`container.rs`, `pr_monitor.rs`, `project.rs`），当前无法访问 `EventService`。

**解决方案**：

```rust
// crates/services/src/services/container.rs
#[async_trait]
pub trait ContainerService {
    fn db(&self) -> &DBService;
    fn events(&self) -> &EventService;  // 新增
    // ... existing methods
}

// crates/local-deployment/src/container.rs
impl ContainerService for LocalContainerService {
    fn events(&self) -> &EventService {
        self.deployment.events()  // 通过 Deployment trait 获取
    }
}
```

对于 `ProjectService` 和 `PrMonitorService`，同样需要将 `EventService` 作为字段或参数传入。

### 5. 所有写操作调用点（43 处）

#### Tasks（15 处）

| # | 文件 | 函数 | 写操作 | 通知调用 |
|---|------|------|--------|----------|
| 1 | `server/src/routes/tasks.rs` | `create_task` | `Task::create` | `notify_task_upsert(task.id)` |
| 2 | `server/src/routes/tasks.rs` | `create_task_and_start` | `Task::create` | `notify_task_upsert(task.id)` |
| 3 | `server/src/routes/task_attempts/pr.rs` | `create_workspace_from_pr` | `Task::create` | `notify_task_upsert(task.id)` |
| 4 | `server/src/routes/tasks.rs` | `update_task` | `Task::update` | `notify_task_upsert(task.id)` |
| 5 | `server/src/routes/tasks.rs` | `delete_task` | `Task::delete` | `notify_task_deleted(task_id)` |
| 6 | `server/src/routes/tasks.rs` | `delete_task` | `Task::nullify_children_by_workspace_id` | 受影响 children 的 `notify_task_upsert` |
| 7 | `server/src/routes/task_attempts.rs` | `delete_workspace` | `Task::nullify_children_by_workspace_id` | 受影响 children 的 `notify_task_upsert` |
| 8 | `server/src/routes/task_attempts/pr.rs` | `attach_pr` | `Task::update_status` | `notify_task_upsert(task_id)` |
| 9 | `server/src/routes/task_attempts.rs` | `confirm_task_attempt_merge` | `Task::update_status` | `notify_task_upsert(task_id)` |
| 10 | `services/src/services/pr_monitor.rs` | `check_pr_status` | `Task::update_status` | `notify_task_upsert(task_id)` via events |
| 11 | `services/src/services/container.rs` | `finalize_task` | `Task::update_status` | `self.events().notify_task_upsert(task_id)` |
| 12 | `services/src/services/container.rs` | `cleanup_orphaned_sessions` | `Task::update_status` | `self.events().notify_task_upsert(task_id)` |
| 13 | `services/src/services/container.rs` | `start_execution` (InProgress) | `Task::update_status` | `self.events().notify_task_upsert(task_id)` |
| 14 | `services/src/services/container.rs` | `start_execution` (InReview on fail) | `Task::update_status` | `self.events().notify_task_upsert(task_id)` |
| 15 | `local-deployment/src/container.rs` | `finalize_task` | `Task::update_status` | `self.events().notify_task_upsert(task_id)` |

#### Execution Processes（6 处）

| # | 文件 | 函数 | 写操作 | 通知调用 |
|---|------|------|--------|----------|
| 16 | `services/src/services/container.rs` | `start_execution` | `EP::create` | `self.events().notify_ep_upsert(ep.id)` |
| 17 | `services/src/services/container.rs` | `start_execution` (fail) | `EP::update_completion` | `self.events().notify_ep_upsert(ep.id)` |
| 18 | `services/src/services/container.rs` | `cleanup_orphaned_sessions` | `EP::update_completion` | `self.events().notify_ep_upsert(ep.id)` |
| 19 | `services/src/services/container.rs` | `reset_session_to_process` | `EP::drop_at_and_after` | `self.events().notify_ep_upsert` 对受影响的 EPs |
| 20 | `local-deployment/src/container.rs` | `spawn_exit_monitor` | `EP::update_completion` | `self.events().notify_ep_upsert(ep_id)` |
| 21 | `local-deployment/src/container.rs` | `finalize_process_execution` | `EP::update_completion` | `self.events().notify_ep_upsert(ep_id)` |

#### Workspaces（13 处）

| # | 文件 | 函数 | 写操作 | 通知调用 |
|---|------|------|--------|----------|
| 22 | `server/src/routes/tasks.rs` | `create_task_and_start` | `Workspace::create` | `notify_workspace_upsert(ws.id)` |
| 23 | `server/src/routes/task_attempts.rs` | `create_task_attempt` | `Workspace::create` | `notify_workspace_upsert(ws.id)` |
| 24 | `server/src/routes/task_attempts/pr.rs` | `create_workspace_from_pr` | `Workspace::create` | `notify_workspace_upsert(ws.id)` |
| 25 | `server/src/routes/task_attempts.rs` | `update_workspace` | `Workspace::update` | `notify_workspace_upsert(ws.id)` |
| 26 | `server/src/routes/task_attempts/pr.rs` | `create_workspace_from_pr` | `Workspace::update_branch_name` | `notify_workspace_upsert(ws.id)` |
| 27 | `server/src/routes/task_attempts.rs` | `rename_branch` | `Workspace::update_branch_name` | `notify_workspace_upsert(ws.id)` |
| 28 | `server/src/routes/task_attempts.rs` | `delete_workspace` | `Workspace::delete` | `notify_workspace_deleted(ws.id, task_id)` |
| 29 | `local-deployment/src/container.rs` | `create` (ContainerService) | `Workspace::update_container_ref` ×2 | `self.events().notify_workspace_upsert(ws.id)` |
| 30 | `local-deployment/src/container.rs` | `ensure_container_exists` | `Workspace::update_container_ref` ×2 | `self.events().notify_workspace_upsert(ws.id)` |
| 31 | `services/src/services/container.rs` | `archive_workspace` | `Workspace::set_archived` | `self.events().notify_workspace_upsert(ws.id)` |
| 32 | `services/src/services/container.rs` | `start_execution` | `Workspace::set_archived` | `self.events().notify_workspace_upsert(ws.id)` |

#### Scratch（5 处）

| # | 文件 | 函数 | 写操作 | 通知调用 |
|---|------|------|--------|----------|
| 33 | `server/src/routes/scratch.rs` | `create_scratch` | `Scratch::create` | `notify_scratch_upsert(id, type)` |
| 34 | `server/src/routes/scratch.rs` | `update_scratch` | `Scratch::update` | `notify_scratch_upsert(id, type)` |
| 35 | `server/src/routes/scratch.rs` | `delete_scratch` | `Scratch::delete` | `notify_scratch_deleted(id, type)` |
| 36 | `server/src/routes/sessions/mod.rs` | `follow_up` | `Scratch::delete` | `notify_scratch_deleted(id, type)` |
| 37 | `local-deployment/src/container.rs` | `handle_process_exit` | `Scratch::delete` | `self.events().notify_scratch_deleted(id, type)` |

#### Projects（3 处）

| # | 文件 | 函数 | 写操作 | 通知调用 |
|---|------|------|--------|----------|
| 38 | `services/src/services/project.rs` | `create_project` | `Project::create` | 通过 EventService 参数 `notify_project_upsert(id)` |
| 39 | `services/src/services/project.rs` | `update_project` | `Project::update` | 通过 EventService 参数 `notify_project_upsert(id)` |
| 40 | `services/src/services/project.rs` | `delete_project` | `Project::delete` | 通过 EventService 参数 `notify_project_deleted(id)` |

> **注**：`Workspace::update_container_ref` 更新的是 container_ref 字段，通常不影响前端展示。
> 可以考虑对这类"非用户可见"的写操作使用 `.into_inner()` 而不调 notify，或用一个
> 轻量的 `notify_workspace_upsert` 统一处理。

### 6. `create_hook` 简化

移除 update_hook 后，`create_hook` 只需设置 `preupdate_hook`（处理 DELETE）：

```rust
impl EventService {
    pub fn create_hook(
        msg_store: Arc<MsgStore>,
    ) -> impl for<'a> Fn(...) + Send + Sync + 'static {
        move |conn: &mut SqliteConnection| {
            let msg_store_for_hook = msg_store.clone();
            Box::pin(async move {
                let mut handle = conn.lock_handle().await?;
                handle.set_preupdate_hook({
                    // ... 现有 DELETE 处理逻辑不变 ...
                });
                // 不再 set_update_hook
                Ok(())
            })
        }
    }
}
```

**移除的参数**：
- `entry_count: Arc<RwLock<usize>>` — 不再需要
- `db_service: DBService` — 不再需要 hook 内部查询池

**初始化简化**（`local-deployment/src/lib.rs`）：
```rust
// Before:
let hook = EventService::create_hook(
    events_msg_store.clone(),
    events_entry_count.clone(),
    DBService::new().await?,  // 额外的连接池
);

// After:
let hook = EventService::create_hook(events_msg_store.clone());
// 不再需要 events_entry_count 和额外的 DBService
```
