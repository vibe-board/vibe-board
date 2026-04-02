use std::sync::Arc;

use db::{
    DBService,
    models::{
        execution_process::ExecutionProcess,
        project::Project,
        scratch::{Scratch, ScratchType},
        session::Session,
        task::Task,
        workspace::Workspace,
    },
};
use sqlx::{Error as SqlxError, Sqlite, SqlitePool, decode::Decode, sqlite::SqliteOperation};
use utils::msg_store::MsgStore;
use uuid::Uuid;

#[path = "events/patches.rs"]
pub mod patches;
#[path = "events/streams.rs"]
mod streams;
#[path = "events/types.rs"]
pub mod types;

pub use patches::{
    execution_process_patch, project_patch, scratch_patch, task_patch, workspace_patch,
};
pub use types::{EventError, EventPatch, EventPatchInner, RecordTypes};

#[derive(Clone)]
pub struct EventService {
    msg_store: Arc<MsgStore>,
    db: DBService,
}

impl EventService {
    /// Creates a new EventService that will work with a DBService configured with hooks
    pub fn new(db: DBService, msg_store: Arc<MsgStore>) -> Self {
        Self { msg_store, db }
    }

    async fn push_task_update_for_task(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        task_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(task) = Task::find_by_id(pool, task_id).await? {
            let tasks = Task::find_by_project_id_with_attempt_status(pool, task.project_id).await?;

            if let Some(task_with_status) = tasks
                .into_iter()
                .find(|task_with_status| task_with_status.id == task_id)
            {
                msg_store.push_patch(task_patch::replace(&task_with_status));
            }
        }

        Ok(())
    }

    async fn push_task_update_for_session(
        pool: &SqlitePool,
        msg_store: Arc<MsgStore>,
        session_id: Uuid,
    ) -> Result<(), SqlxError> {
        if let Some(session) = Session::find_by_id(pool, session_id).await?
            && let Some(workspace) = Workspace::find_by_id(pool, session.workspace_id).await?
        {
            Self::push_task_update_for_task(pool, msg_store, workspace.task_id).await?;
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

    /// Creates the hook function that should be used with DBService::new_with_after_connect.
    /// Only sets up the preupdate_hook for DELETE operations.
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

                Ok(())
            })
        }
    }

    pub fn msg_store(&self) -> &Arc<MsgStore> {
        &self.msg_store
    }

    /// Notify that a task was created or updated.
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

    /// Notify that a task was deleted.
    pub async fn notify_task_deleted(&self, task_id: Uuid) {
        self.msg_store.push_patch(task_patch::remove(task_id));
    }

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
                    tracing::error!("notify_ep_upsert: failed to push task update: {:?}", err);
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

    /// Notify that a workspace was created or updated.
    pub async fn notify_workspace_upsert(&self, workspace_id: Uuid) {
        let pool = &self.db.pool;
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
    pub async fn notify_workspace_deleted(&self, workspace_id: Uuid, task_id: Option<Uuid>) {
        self.msg_store
            .push_patch(workspace_patch::remove(workspace_id));

        if let Some(task_id) = task_id {
            let _ = Self::push_task_update_for_task(&self.db.pool, self.msg_store.clone(), task_id)
                .await;
        }
    }

    /// Notify that a scratch was created or updated.
    pub async fn notify_scratch_upsert(&self, scratch_id: Uuid, scratch_type: &ScratchType) {
        let pool = &self.db.pool;
        match Scratch::find_by_id(pool, scratch_id, scratch_type).await {
            Ok(Some(scratch)) => {
                self.msg_store.push_patch(scratch_patch::replace(&scratch));
            }
            Ok(None) => {
                tracing::warn!(
                    scratch_id = %scratch_id,
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

    /// Notify that a scratch was deleted.
    pub async fn notify_scratch_deleted(&self, scratch_id: Uuid, scratch_type: &str) {
        self.msg_store
            .push_patch(scratch_patch::remove(scratch_id, scratch_type));
    }

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
        self.msg_store.push_patch(project_patch::remove(project_id));
    }
}
