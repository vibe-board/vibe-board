use std::{str::FromStr, sync::Arc};

use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess, project::Project, scratch::Scratch, session::Session,
        task::Task, workspace::Workspace,
    },
};
use serde_json::json;
use sqlx::{Error as SqlxError, Sqlite, SqlitePool, decode::Decode, sqlite::SqliteOperation};
use tokio::sync::RwLock;
use utils::msg_store::MsgStore;
use uuid::Uuid;

const HOOK_RETRY_COUNT: u32 = 3;
const HOOK_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(5);

/// Retry a find_by_rowid query that may return None due to the SQLite
/// update_hook firing before the write transaction commits on the
/// querying connection.
async fn retry_find_by_rowid<T, F, Fut>(
    table: &str,
    rowid: i64,
    f: F,
) -> Result<Option<T>, sqlx::Error>
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

#[path = "events/patches.rs"]
pub mod patches;
#[path = "events/streams.rs"]
mod streams;
#[path = "events/types.rs"]
pub mod types;

pub use patches::{
    execution_process_patch, project_patch, scratch_patch, task_patch, workspace_patch,
};
pub use types::{EventError, EventPatch, EventPatchInner, HookTables, RecordTypes};

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
    #[allow(dead_code)]
    entry_count: Arc<RwLock<usize>>,
}

impl EventService {
    /// Creates a new EventService that will work with a DBService configured with hooks
    pub fn new(db: DBService, msg_store: Arc<MsgStore>, entry_count: Arc<RwLock<usize>>) -> Self {
        Self {
            msg_store,
            db,
            entry_count,
        }
    }

    async fn update_task_attempt_status(pool: &SqlitePool, task_id: Uuid) -> Result<(), SqlxError> {
        let has_in_progress: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM workspaces w
             JOIN sessions s ON s.workspace_id = w.id
             JOIN execution_processes ep ON ep.session_id = s.id
             WHERE w.task_id = $1 AND ep.status = 'running'
               AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
             LIMIT 1",
        )
        .bind(task_id)
        .fetch_one(pool)
        .await?;

        #[derive(sqlx::FromRow)]
        struct EpInfo {
            ep_status: Option<String>,
            variant: Option<String>,
        }
        let ep_info: Option<EpInfo> = sqlx::query_as(
            "SELECT ep.status as ep_status,
                JSON_EXTRACT(ep.executor_action, '$.typ.executor_profile_id.variant') as variant
             FROM workspaces w
             JOIN sessions s ON s.workspace_id = w.id
             JOIN execution_processes ep ON ep.session_id = s.id
             WHERE w.task_id = $1
               AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
               AND ep.dropped = 0
             ORDER BY ep.created_at DESC LIMIT 1",
        )
        .bind(task_id)
        .fetch_optional(pool)
        .await?;

        let last_failed = ep_info
            .as_ref()
            .is_some_and(|r| matches!(r.ep_status.as_deref(), Some("failed" | "killed")));
        let variant = ep_info.and_then(|r| r.variant);

        let executor: Option<String> = sqlx::query_scalar(
            "SELECT s.executor FROM workspaces w
             JOIN sessions s ON s.workspace_id = w.id
             WHERE w.task_id = $1
             ORDER BY s.created_at DESC LIMIT 1",
        )
        .bind(task_id)
        .fetch_optional(pool)
        .await?
        .flatten();

        sqlx::query(
            "UPDATE tasks SET
               has_in_progress_attempt = $1,
               last_attempt_failed = $2,
               executor = COALESCE($3, ''),
               variant = $4
             WHERE id = $5",
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

    async fn push_workspace_update_for_session(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        session_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(session) = Session::find_by_id(pool, session_id).await?
            && let Some(workspace_with_status) =
                Workspace::find_by_id_with_status(pool, session.workspace_id).await?
        {
            msg_store.push_patch(workspace_patch::replace(&workspace_with_status));
        }
        Ok(())
    }

    /// Creates the hook function that should be used with DBService::new_with_after_connect
    pub fn create_hook(
        msg_store: Arc<MsgStore>,
        entry_count: Arc<RwLock<usize>>,
        db_service: DBService,
    ) -> impl for<'a> Fn(
        &'a mut sqlx::sqlite::SqliteConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<(), sqlx::Error>> + Send + 'a>,
    > + Send
    + Sync
    + 'static {
        move |conn: &mut sqlx::sqlite::SqliteConnection| {
            let msg_store_for_hook = msg_store.clone();
            let entry_count_for_hook = entry_count.clone();
            let db_for_hook = db_service.clone();
            Box::pin(async move {
                let mut handle = conn.lock_handle().await?;
                let runtime_handle = tokio::runtime::Handle::current();
                handle.set_preupdate_hook({
                    let msg_store_for_preupdate = msg_store_for_hook.clone();
                    move |preupdate: sqlx::sqlite::PreupdateHookResult<'_>| {
                        if preupdate.operation != SqliteOperation::Delete {
                            return;
                        }

                        match preupdate.table {
                            "tasks" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(task_id) = <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = task_patch::remove(task_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "projects" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(project_id) = <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = project_patch::remove(project_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "workspaces" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(workspace_id) =
                                        <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = workspace_patch::remove(workspace_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "execution_processes" => {
                                if let Ok(value) = preupdate.get_old_column_value(0)
                                    && let Ok(process_id) = <Uuid as Decode<Sqlite>>::decode(value)
                                {
                                    let patch = execution_process_patch::remove(process_id);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            "scratch" => {
                                // Composite key: need both id (column 0) and scratch_type (column 1)
                                if let Ok(id_val) = preupdate.get_old_column_value(0)
                                    && let Ok(scratch_id) = <Uuid as Decode<Sqlite>>::decode(id_val)
                                    && let Ok(type_val) = preupdate.get_old_column_value(1)
                                    && let Ok(type_str) =
                                        <String as Decode<Sqlite>>::decode(type_val)
                                {
                                    let patch = scratch_patch::remove(scratch_id, &type_str);
                                    msg_store_for_preupdate.push_patch(patch);
                                }
                            }
                            _ => {}
                        }
                    }
                });

                handle.set_update_hook(move |hook: sqlx::sqlite::UpdateHookResult<'_>| {
                    let runtime_handle = runtime_handle.clone();
                    let entry_count_for_hook = entry_count_for_hook.clone();
                    let msg_store_for_hook = msg_store_for_hook.clone();
                    let db = db_for_hook.clone();

                    if let Ok(table) = HookTables::from_str(hook.table) {
                        let rowid = hook.rowid;
                        runtime_handle.spawn(async move {
                            let record_type: RecordTypes = match (table, hook.operation.clone()) {
                                (HookTables::Tasks, SqliteOperation::Delete)
                                | (HookTables::Projects, SqliteOperation::Delete)
                                | (HookTables::Workspaces, SqliteOperation::Delete)
                                | (HookTables::ExecutionProcesses, SqliteOperation::Delete)
                                | (HookTables::Scratch, SqliteOperation::Delete) => {
                                    // Deletions handled in preupdate hook for reliable data capture
                                    return;
                                }
                                (HookTables::Tasks, _) => {
                                    match retry_find_by_rowid("tasks", rowid, || {
                                        Task::find_by_rowid(&db.pool, rowid)
                                    })
                                    .await
                                    {
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
                                (HookTables::Projects, _) => {
                                    match retry_find_by_rowid("projects", rowid, || {
                                        Project::find_by_rowid(&db.pool, rowid)
                                    })
                                    .await
                                    {
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
                                (HookTables::Workspaces, _) => {
                                    match retry_find_by_rowid("workspaces", rowid, || {
                                        Workspace::find_by_rowid(&db.pool, rowid)
                                    })
                                    .await
                                    {
                                        Ok(Some(workspace)) => RecordTypes::Workspace(workspace),
                                        Ok(None) => RecordTypes::DeletedWorkspace {
                                            rowid,
                                            task_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch workspace: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                                (HookTables::ExecutionProcesses, _) => {
                                    match retry_find_by_rowid("execution_processes", rowid, || {
                                        ExecutionProcess::find_by_rowid(&db.pool, rowid)
                                    })
                                    .await
                                    {
                                        Ok(Some(process)) => {
                                            RecordTypes::ExecutionProcess(process)
                                        }
                                        Ok(None) => RecordTypes::DeletedExecutionProcess {
                                            rowid,
                                            session_id: None,
                                            process_id: None,
                                        },
                                        Err(e) => {
                                            tracing::error!(
                                                "Failed to fetch execution_process: {:?}",
                                                e
                                            );
                                            return;
                                        }
                                    }
                                }
                                (HookTables::Scratch, _) => {
                                    match retry_find_by_rowid("scratch", rowid, || async {
                                        Scratch::find_by_rowid(&db.pool, rowid)
                                            .await
                                            .map_err(|e| match e {
                                                db::models::scratch::ScratchError::Database(
                                                    sqlx_err,
                                                ) => sqlx_err,
                                                other => sqlx::Error::Protocol(other.to_string()),
                                            })
                                    })
                                    .await
                                    {
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
                            };

                            let db_op: &str = match hook.operation {
                                SqliteOperation::Insert => "insert",
                                SqliteOperation::Delete => "delete",
                                SqliteOperation::Update => "update",
                                SqliteOperation::Unknown(_) => "unknown",
                            };

                            // Handle task-related operations with direct patches
                            match &record_type {
                                RecordTypes::Task(task) => {
                                    // Re-sync denormalized attempt status before pushing patch,
                                    // because the EP hook's update_task_attempt_status may not
                                    // have completed yet (both hooks fire from the same UPDATE).
                                    if let SqliteOperation::Update = hook.operation {
                                        let _ = EventService::update_task_attempt_status(
                                            &db.pool,
                                            task.id,
                                        )
                                        .await;
                                    }
                                    // Re-read task to pick up freshly-synced denormalized fields
                                    if let Ok(Some(fresh_task)) =
                                        Task::find_by_id(&db.pool, task.id).await
                                    {
                                        let patch = match hook.operation {
                                            SqliteOperation::Insert => {
                                                task_patch::add(&fresh_task)
                                            }
                                            _ => task_patch::replace(&fresh_task),
                                        };
                                        msg_store_for_hook.push_patch(patch);
                                    }
                                    return;
                                }
                                RecordTypes::DeletedTask {
                                    task_id: Some(task_id),
                                    ..
                                } => {
                                    let patch = task_patch::remove(*task_id);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::Project(project) => {
                                    let patch = match hook.operation {
                                        SqliteOperation::Insert => project_patch::add(project),
                                        SqliteOperation::Update => project_patch::replace(project),
                                        _ => project_patch::replace(project),
                                    };
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::Scratch(scratch) => {
                                    let patch = match hook.operation {
                                        SqliteOperation::Insert => scratch_patch::add(scratch),
                                        SqliteOperation::Update => scratch_patch::replace(scratch),
                                        _ => scratch_patch::replace(scratch),
                                    };
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::DeletedScratch {
                                    scratch_id: Some(scratch_id),
                                    scratch_type: Some(scratch_type_str),
                                    ..
                                } => {
                                    let patch = scratch_patch::remove(*scratch_id, scratch_type_str);
                                    msg_store_for_hook.push_patch(patch);
                                    return;
                                }
                                RecordTypes::Workspace(workspace) => {
                                    // Emit workspace patch with status
                                    if let Ok(Some(workspace_with_status)) =
                                        Workspace::find_by_id_with_status(&db.pool, workspace.id)
                                            .await
                                    {
                                        let patch = match hook.operation {
                                            SqliteOperation::Insert => {
                                                workspace_patch::add(&workspace_with_status)
                                            }
                                            _ => workspace_patch::replace(&workspace_with_status),
                                        };
                                        msg_store_for_hook.push_patch(patch);
                                    }

                                    // Update denormalized attempt status and push task update
                                    if let Err(err) = EventService::update_task_attempt_status(
                                        &db.pool,
                                        workspace.task_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to update task attempt status after workspace change: {:?}",
                                            err
                                        );
                                    }
                                    if let Err(err) = EventService::push_task_update_for_task(
                                        &db.pool,
                                        msg_store_for_hook.clone(),
                                        workspace.task_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to push task update after workspace change: {:?}",
                                            err
                                        );
                                    }
                                    return;
                                }
                                RecordTypes::DeletedWorkspace {
                                    task_id: Some(task_id),
                                    ..
                                } => {
                                    // Update denormalized attempt status and push task update
                                    if let Err(err) = EventService::update_task_attempt_status(
                                        &db.pool,
                                        *task_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to update task attempt status after workspace removal: {:?}",
                                            err
                                        );
                                    }
                                    if let Err(err) = EventService::push_task_update_for_task(
                                        &db.pool,
                                        msg_store_for_hook.clone(),
                                        *task_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to push task update after workspace removal: {:?}",
                                            err
                                        );
                                    }
                                    return;
                                }
                                RecordTypes::ExecutionProcess(process) => {
                                    let patch = match hook.operation {
                                        SqliteOperation::Insert => {
                                            execution_process_patch::add(process)
                                        }
                                        SqliteOperation::Update => {
                                            execution_process_patch::replace(process)
                                        }
                                        _ => execution_process_patch::replace(process), // fallback
                                    };
                                    msg_store_for_hook.push_patch(patch);

                                    // Update denormalized attempt status for associated task
                                    if let Ok(Some(session)) =
                                        Session::find_by_id(&db.pool, process.session_id).await
                                        && let Ok(Some(workspace)) =
                                            Workspace::find_by_id(&db.pool, session.workspace_id)
                                                .await
                                    {
                                        if let Err(err) = EventService::update_task_attempt_status(
                                            &db.pool,
                                            workspace.task_id,
                                        )
                                        .await
                                        {
                                            tracing::error!(
                                                "Failed to update task attempt status after execution process change: {:?}",
                                                err
                                            );
                                        }
                                        if let Err(err) = EventService::push_task_update_for_task(
                                            &db.pool,
                                            msg_store_for_hook.clone(),
                                            workspace.task_id,
                                        )
                                        .await
                                        {
                                            tracing::error!(
                                                "Failed to push task update after execution process change: {:?}",
                                                err
                                            );
                                        }
                                    }

                                    if let Err(err) = EventService::push_workspace_update_for_session(
                                        &db.pool,
                                        msg_store_for_hook.clone(),
                                        process.session_id,
                                    )
                                    .await
                                    {
                                        tracing::error!(
                                            "Failed to push workspace update after execution process change: {:?}",
                                            err
                                        );
                                    }

                                    return;
                                }
                                RecordTypes::DeletedExecutionProcess {
                                    process_id: Some(process_id),
                                    session_id,
                                    ..
                                } => {
                                    let patch = execution_process_patch::remove(*process_id);
                                    msg_store_for_hook.push_patch(patch);

                                    if let Some(session_id) = session_id {
                                        // Update denormalized attempt status for associated task
                                        if let Ok(Some(session)) =
                                            Session::find_by_id(&db.pool, *session_id).await
                                            && let Ok(Some(workspace)) =
                                                Workspace::find_by_id(&db.pool, session.workspace_id)
                                                    .await
                                        {
                                            if let Err(err) =
                                                EventService::update_task_attempt_status(
                                                    &db.pool,
                                                    workspace.task_id,
                                                )
                                                .await
                                            {
                                                tracing::error!(
                                                    "Failed to update task attempt status after execution process removal: {:?}",
                                                    err
                                                );
                                            }
                                            if let Err(err) =
                                                EventService::push_task_update_for_task(
                                                    &db.pool,
                                                    msg_store_for_hook.clone(),
                                                    workspace.task_id,
                                                )
                                                .await
                                            {
                                                tracing::error!(
                                                    "Failed to push task update after execution process removal: {:?}",
                                                    err
                                                );
                                            }
                                        }

                                        if let Err(err) =
                                            EventService::push_workspace_update_for_session(
                                                &db.pool,
                                                msg_store_for_hook.clone(),
                                                *session_id,
                                            )
                                            .await
                                        {
                                            tracing::error!(
                                                "Failed to push workspace update after execution process removal: {:?}",
                                                err
                                            );
                                        }
                                    }

                                    return;
                                }
                                _ => {}
                            }

                            // Fallback: use the old entries format for other record types
                            let next_entry_count = {
                                let mut entry_count = entry_count_for_hook.write().await;
                                *entry_count += 1;
                                *entry_count
                            };

                            let event_patch: EventPatch = EventPatch {
                                op: "add".to_string(),
                                path: format!("/entries/{next_entry_count}"),
                                value: EventPatchInner {
                                    db_op: db_op.to_string(),
                                    record: record_type,
                                },
                            };

                            let patch =
                                serde_json::from_value(json!([
                                    serde_json::to_value(event_patch).unwrap()
                                ]))
                                .unwrap();

                            msg_store_for_hook.push_patch(patch);
                        });
                    }
                });

                Ok(())
            })
        }
    }

    pub fn msg_store(&self) -> &Arc<MsgStore> {
        &self.msg_store
    }
}
