pub mod queue;
pub mod review;

use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    normalized_entries::{NormalizedEntry, SessionConversationEntry},
    scratch::{Scratch, ScratchType},
    session::{CreateSession, Session, SessionError, SessionWithCost},
    workspace::{Workspace, WorkspaceError},
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType, coding_agent_follow_up::CodingAgentFollowUpRequest,
    },
    profile::ExecutorProfileId,
};
use serde::Deserialize;
use services::services::container::ContainerService;
use ts_rs::TS;
use utils::{conversation_cursor::ConversationCursor, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_session_middleware};

#[derive(Debug, Deserialize)]
pub struct SessionQuery {
    pub workspace_id: Uuid,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateSessionRequest {
    pub workspace_id: Uuid,
    pub executor: Option<String>,
}

pub async fn get_sessions(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Session>>>, ApiError> {
    let pool = &deployment.db().pool;
    let sessions = Session::find_by_workspace_id(pool, query.workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(sessions)))
}

pub async fn get_session(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<SessionWithCost>>, ApiError> {
    let pool = &deployment.db().pool;
    let session_with_cost =
        Session::get_with_cost(pool, session.id)
            .await?
            .ok_or(ApiError::Session(
                db::models::session::SessionError::NotFound,
            ))?;
    Ok(ResponseJson(ApiResponse::success(session_with_cost)))
}

pub async fn create_session(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<ResponseJson<ApiResponse<Session>>, ApiError> {
    let pool = &deployment.db().pool;

    // Verify workspace exists
    let _workspace = Workspace::find_by_id(pool, payload.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    let session = Session::create(
        pool,
        &CreateSession {
            executor: payload.executor,
        },
        Uuid::new_v4(),
        payload.workspace_id,
    )
    .await?;

    Ok(ResponseJson(ApiResponse::success(session)))
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateFollowUpAttempt {
    pub prompt: String,
    pub executor_profile_id: ExecutorProfileId,
    pub retry_process_id: Option<Uuid>,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
    /// When true, allows changing the executor (e.g., from Claude Code to Amp).
    /// The previous conversation context will be included in the new prompt.
    pub allow_executor_change: Option<bool>,
}

#[derive(Debug, Deserialize, TS)]
pub struct ResetProcessRequest {
    pub process_id: Uuid,
    pub force_when_dirty: Option<bool>,
    pub perform_git_reset: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ConversationEntriesQuery {
    pub before: Option<String>,
    pub after: Option<String>,
    #[serde(default = "default_conversation_limit")]
    pub limit: i64,
}

fn default_conversation_limit() -> i64 {
    200
}

#[derive(Debug, serde::Serialize)]
pub struct SessionConversationEntryRecord {
    pub execution_process_id: Uuid,
    pub entry_index: i64,
    pub entry_json: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ConversationEntriesResponse {
    pub entries: Vec<SessionConversationEntryRecord>,
    pub first_cursor: Option<String>,
    pub last_cursor: Option<String>,
    pub has_more_before: bool,
    pub has_more_after: bool,
}

pub async fn follow_up(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateFollowUpAttempt>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    let pool = &deployment.db().pool;

    // Load workspace from session
    let workspace = Workspace::find_by_id(pool, session.workspace_id)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::ValidationError(
            "Workspace not found".to_string(),
        )))?;

    tracing::info!("{:?}", workspace);

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let executor_profile_id = payload.executor_profile_id;
    let allow_executor_change = payload.allow_executor_change.unwrap_or(false);

    // Validate executor matches session if session has prior executions
    // Skip validation if allow_executor_change is true
    let expected_executor: Option<String> =
        ExecutionProcess::latest_executor_profile_for_session(pool, session.id)
            .await?
            .map(|profile| profile.executor.to_string())
            .or_else(|| session.executor.clone());

    let executor_changed = if let Some(expected) = expected_executor {
        let actual = executor_profile_id.executor.to_string();
        if expected != actual {
            if !allow_executor_change {
                return Err(ApiError::Session(SessionError::ExecutorMismatch {
                    expected,
                    actual,
                }));
            }
            true
        } else {
            false
        }
    } else {
        false
    };

    // Update session executor if changed or not set
    if executor_changed || session.executor.is_none() {
        Session::update_executor(pool, session.id, &executor_profile_id.executor.to_string())
            .await?;
    }

    if let Some(proc_id) = payload.retry_process_id {
        let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
        let perform_git_reset = payload.perform_git_reset.unwrap_or(true);
        deployment
            .container()
            .reset_session_to_process(session.id, proc_id, perform_git_reset, force_when_dirty)
            .await?;
    }

    let latest_session_info = CodingAgentTurn::find_latest_session_info(pool, session.id).await?;

    let mut prompt = payload.prompt;

    // When executor changes, include previous conversation context in the prompt
    // and treat as initial request (no session continuity)
    if executor_changed
        && let Some(context) = CodingAgentTurn::build_context_summary(pool, session.id).await?
    {
        prompt = format!(
            "Previous conversation context (from a different executor):\n{}\n\n---\n\nCurrent request:\n{}",
            context, prompt
        );
    }

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let cleanup_action = deployment.container().cleanup_actions_for_repos(&repos);

    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|dir| !dir.is_empty())
        .cloned();

    let action_type = if let Some(info) = latest_session_info {
        // When executor changed, don't use old session_id - start fresh with new executor
        if executor_changed {
            ExecutorActionType::CodingAgentInitialRequest(
                executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                    prompt,
                    executor_profile_id: executor_profile_id.clone(),
                    working_dir,
                },
            )
        } else {
            let is_reset = payload.retry_process_id.is_some();
            ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
                prompt,
                session_id: info.session_id,
                reset_to_message_id: if is_reset { info.message_id } else { None },
                executor_profile_id: executor_profile_id.clone(),
                working_dir: working_dir.clone(),
            })
        }
    } else {
        ExecutorActionType::CodingAgentInitialRequest(
            executors::actions::coding_agent_initial::CodingAgentInitialRequest {
                prompt,
                executor_profile_id: executor_profile_id.clone(),
                working_dir,
            },
        )
    };

    let action = ExecutorAction::new(action_type, cleanup_action.map(Box::new));

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await?;

    // Clear the draft follow-up scratch on successful spawn
    // This ensures the scratch is wiped even if the user navigates away quickly
    if let Err(e) = Scratch::delete(pool, session.id, &ScratchType::DraftFollowUp).await {
        // Log but don't fail the request - scratch deletion is best-effort
        tracing::debug!(
            "Failed to delete draft follow-up scratch for session {}: {}",
            session.id,
            e
        );
    }

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn reset_process(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ResetProcessRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let force_when_dirty = payload.force_when_dirty.unwrap_or(false);
    let perform_git_reset = payload.perform_git_reset.unwrap_or(true);

    deployment
        .container()
        .reset_session_to_process(
            session.id,
            payload.process_id,
            perform_git_reset,
            force_when_dirty,
        )
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn get_conversation_entries(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ConversationEntriesQuery>,
) -> Result<ResponseJson<ApiResponse<ConversationEntriesResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let limit = query.limit.clamp(1, 500);

    // Determine direction from query params. Default to "tail" (load last entries) when neither is set.
    let (before_flag, cursor) = match (query.before.as_deref(), query.after.as_deref()) {
        (Some(s), _) => (true, ConversationCursor::decode(s)),
        (None, Some(s)) => (false, ConversationCursor::decode(s)),
        (None, None) => (true, None),
    };

    // Validate cursor if provided (treat invalid as absent rather than 400 to keep UX resilient)
    let cursor_tuple = cursor.map(|c| (c.process_created_at, c.entry_index));
    let has_cursor = cursor_tuple.is_some();

    let (rows, has_more) = match NormalizedEntry::find_by_session_flat(
        pool,
        session.id,
        cursor_tuple,
        before_flag,
        limit,
    )
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(
                "Failed to fetch session flat entries for {}: {}",
                session.id,
                e
            );
            return Ok(ResponseJson(ApiResponse::success(
                ConversationEntriesResponse {
                    entries: vec![],
                    first_cursor: None,
                    last_cursor: None,
                    has_more_before: false,
                    has_more_after: false,
                },
            )));
        }
    };

    let first_cursor = rows.first().map(|r| {
        ConversationCursor {
            process_created_at: r.process_created_at,
            entry_index: r.entry_index,
        }
        .encode()
    });
    let last_cursor = rows.last().map(|r| {
        ConversationCursor {
            process_created_at: r.process_created_at,
            entry_index: r.entry_index,
        }
        .encode()
    });

    let (has_more_before, has_more_after) = if before_flag {
        (has_more, has_cursor)
    } else {
        (has_cursor, has_more)
    };

    let entries: Vec<SessionConversationEntryRecord> = rows
        .into_iter()
        .map(
            |r: SessionConversationEntry| SessionConversationEntryRecord {
                execution_process_id: r.execution_id,
                entry_index: r.entry_index,
                entry_json: r.entry_json,
            },
        )
        .collect();

    Ok(ResponseJson(ApiResponse::success(
        ConversationEntriesResponse {
            entries,
            first_cursor,
            last_cursor,
            has_more_before,
            has_more_after,
        },
    )))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let session_id_router = Router::new()
        .route("/", get(get_session))
        .route("/conversation-entries", get(get_conversation_entries))
        .route("/follow-up", post(follow_up))
        .route("/reset", post(reset_process))
        .route("/review", post(review::start_review))
        .route("/queue", queue::routes())
        .layer(from_fn_with_state(
            deployment.clone(),
            load_session_middleware,
        ));

    let sessions_router = Router::new()
        .route("/", get(get_sessions).post(create_session))
        .nest("/{session_id}", session_id_router);

    Router::new().nest("/sessions", sessions_router)
}
