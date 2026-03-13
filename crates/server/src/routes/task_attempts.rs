pub mod codex_setup;
pub mod cursor_setup;
pub mod gh_cli_setup;
pub mod images;
pub mod pr;
pub mod workspace_summary;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use api_types::CreateWorkspaceRequest;
use axum::{
    Extension, Json, Router,
    extract::{
        Path as AxumPath, Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post, put},
};
use db::models::{
    coding_agent_turn::CodingAgentTurn,
    execution_process::{ExecutionProcess, ExecutionProcessRunReason, ExecutionProcessStatus},
    merge::{Merge, MergeStatus, PrMerge, PullRequestInfo},
    repo::{Repo, RepoError},
    session::{CreateSession, Session, SessionError},
    task::{Task, TaskRelationships, TaskStatus},
    workspace::{CreateWorkspace, Workspace, WorkspaceError},
    workspace_repo::{CreateWorkspaceRepo, RepoWithTargetBranch, WorkspaceRepo},
};
use deployment::Deployment;
use executors::{
    actions::{
        ExecutorAction, ExecutorActionType,
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::{CodingAgent, ExecutorError},
    profile::{ExecutorConfigs, ExecutorProfileId},
};
use git::{ConflictOp, GitCliError, GitService, GitServiceError};
use git2::BranchType;
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService, diff_stream, remote_client::RemoteClientError, remote_sync,
    workspace_manager::WorkspaceManager,
};
use sqlx::Error as SqlxError;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl, error::ApiError, middleware::load_workspace_middleware,
    routes::task_attempts::gh_cli_setup::GhCliSetupError,
};

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RebaseTaskAttemptRequest {
    pub repo_id: Uuid,
    pub old_base_branch: Option<String>,
    pub new_base_branch: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct AbortConflictsRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct ContinueRebaseRequest {
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum GitOperationError {
    MergeConflicts {
        message: String,
        op: ConflictOp,
        conflicted_files: Vec<String>,
        target_branch: String,
    },
    RebaseInProgress,
}

#[derive(Debug, Deserialize)]
pub struct TaskAttemptQuery {
    pub task_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct DiffStreamQuery {
    #[serde(default)]
    pub stats_only: bool,
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceStreamQuery {
    pub archived: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateWorkspace {
    pub archived: Option<bool>,
    pub pinned: Option<bool>,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteWorkspaceQuery {
    #[serde(default)]
    pub delete_remote: bool,
    #[serde(default)]
    pub delete_branches: bool,
}

#[derive(Debug, Deserialize)]
pub struct LinkWorkspaceRequest {
    pub project_id: Uuid,
    pub issue_id: Uuid,
}

pub async fn get_task_attempts(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TaskAttemptQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<Workspace>>>, ApiError> {
    let pool = &deployment.db().pool;
    let workspaces = Workspace::fetch_all(pool, query.task_id).await?;
    Ok(ResponseJson(ApiResponse::success(workspaces)))
}

pub async fn get_workspace_count(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<i64>>, ApiError> {
    let pool = &deployment.db().pool;
    let count = Workspace::count_all(pool).await?;
    Ok(ResponseJson(ApiResponse::success(count)))
}

pub async fn get_task_attempt(
    Extension(workspace): Extension<Workspace>,
) -> Result<ResponseJson<ApiResponse<Workspace>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(workspace)))
}

pub async fn update_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<UpdateWorkspace>,
) -> Result<ResponseJson<ApiResponse<Workspace>>, ApiError> {
    let pool = &deployment.db().pool;
    let is_archiving = request.archived == Some(true) && !workspace.archived;

    Workspace::update(
        pool,
        workspace.id,
        request.archived,
        request.pinned,
        request.name.as_deref(),
    )
    .await?;
    let updated = Workspace::find_by_id(pool, workspace.id)
        .await?
        .ok_or(WorkspaceError::TaskNotFound)?;

    // Sync to remote if archived or name changed
    if (request.archived.is_some() || request.name.is_some())
        && let Ok(client) = deployment.remote_client()
    {
        let ws = updated.clone();
        let name = request.name.clone();
        let archived = request.archived;
        let stats =
            diff_stream::compute_diff_stats(&deployment.db().pool, deployment.git(), &ws).await;
        tokio::spawn(async move {
            remote_sync::sync_workspace_to_remote(
                &client,
                ws.id,
                name.map(Some),
                archived,
                stats.as_ref(),
            )
            .await;
        });
    }

    if is_archiving && let Err(e) = deployment.container().archive_workspace(workspace.id).await {
        tracing::error!("Failed to archive workspace {}: {}", workspace.id, e);
    }

    Ok(ResponseJson(ApiResponse::success(updated)))
}

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    pub executor_profile_id: ExecutorProfileId,
    pub repos: Vec<WorkspaceRepoInput>,
}

#[derive(Debug, Serialize, Deserialize, ts_rs::TS)]
pub struct WorkspaceRepoInput {
    pub repo_id: Uuid,
    pub target_branch: String,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct RunAgentSetupRequest {
    pub executor_profile_id: ExecutorProfileId,
}

#[derive(Debug, Serialize, TS)]
pub struct RunAgentSetupResponse {}

#[axum::debug_handler]
pub async fn create_task_attempt(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskAttemptBody>,
) -> Result<ResponseJson<ApiResponse<Workspace>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id.clone();

    if payload.repos.is_empty() {
        return Err(ApiError::BadRequest(
            "At least one repository is required".to_string(),
        ));
    }

    let pool = &deployment.db().pool;
    let task = Task::find_by_id(&deployment.db().pool, payload.task_id)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Compute agent_working_dir based on repo count:
    // - Single repo: join repo name with default_working_dir (if set), or just repo name
    // - Multiple repos: use None (agent runs in workspace root)
    let agent_working_dir = if payload.repos.len() == 1 {
        let repo = Repo::find_by_id(pool, payload.repos[0].repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;
        match repo.default_working_dir {
            Some(subdir) => {
                let path = PathBuf::from(&repo.name).join(&subdir);
                Some(path.to_string_lossy().to_string())
            }
            None => Some(repo.name),
        }
    } else {
        None
    };

    let attempt_id = Uuid::new_v4();
    let git_branch_name = deployment
        .container()
        .git_branch_from_workspace(&attempt_id, &task.title)
        .await;

    let workspace = Workspace::create(
        pool,
        &CreateWorkspace {
            branch: git_branch_name.clone(),
            agent_working_dir,
        },
        attempt_id,
        payload.task_id,
    )
    .await?;

    let workspace_repos: Vec<CreateWorkspaceRepo> = payload
        .repos
        .iter()
        .map(|r| CreateWorkspaceRepo {
            repo_id: r.repo_id,
            target_branch: r.target_branch.clone(),
        })
        .collect();

    WorkspaceRepo::create_many(pool, workspace.id, &workspace_repos).await?;
    if let Err(err) = deployment
        .container()
        .start_workspace(&workspace, executor_profile_id.clone())
        .await
    {
        tracing::error!("Failed to start task attempt: {}", err);
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_started",
            serde_json::json!({
                "task_id": workspace.task_id.to_string(),
                "variant": &executor_profile_id.variant,
                "executor": &executor_profile_id.executor,
                "workspace_id": workspace.id.to_string(),
                "repository_count": payload.repos.len(),
            }),
        )
        .await;

    tracing::info!("Created attempt for task {}", task.id);

    Ok(ResponseJson(ApiResponse::success(workspace)))
}

#[axum::debug_handler]
pub async fn run_agent_setup(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RunAgentSetupRequest>,
) -> Result<ResponseJson<ApiResponse<RunAgentSetupResponse>>, ApiError> {
    let executor_profile_id = payload.executor_profile_id;
    let config = ExecutorConfigs::get_cached();
    let coding_agent = config.get_coding_agent_or_default(&executor_profile_id);
    match coding_agent {
        CodingAgent::CursorAgent(_) => {
            cursor_setup::run_cursor_setup(&deployment, &workspace).await?;
        }
        CodingAgent::Codex(codex) => {
            codex_setup::run_codex_setup(&deployment, &workspace, &codex).await?;
        }
        _ => return Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)),
    }

    deployment
        .track_if_analytics_allowed(
            "agent_setup_script_executed",
            serde_json::json!({
                "executor_profile_id": executor_profile_id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RunAgentSetupResponse {})))
}

#[axum::debug_handler]
pub async fn stream_task_attempt_diff_ws(
    ws: WebSocketUpgrade,
    Query(params): Query<DiffStreamQuery>,
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    let _ = Workspace::touch(&deployment.db().pool, workspace.id).await;

    let stats_only = params.stats_only;
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_task_attempt_diff_ws(socket, deployment, workspace, stats_only).await
        {
            tracing::warn!("diff WS closed: {}", e);
        }
    })
}

async fn handle_task_attempt_diff_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    workspace: Workspace,
    stats_only: bool,
) -> anyhow::Result<()> {
    use futures_util::{SinkExt, StreamExt, TryStreamExt};
    use utils::log_msg::LogMsg;

    let stream = deployment
        .container()
        .stream_diff(&workspace, stats_only)
        .await?;

    let mut stream = stream.map_ok(|msg: LogMsg| msg.to_ws_message_unchecked());

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            // Wait for next stream item
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if sender.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            // Detect client disconnection
            msg = receiver.next() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }
    Ok(())
}

pub async fn stream_workspaces_ws(
    ws: WebSocketUpgrade,
    Query(query): Query<WorkspaceStreamQuery>,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_workspaces_ws(socket, deployment, query.archived, query.limit).await
        {
            tracing::warn!("workspaces WS closed: {}", e);
        }
    })
}

async fn handle_workspaces_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    archived: Option<bool>,
    limit: Option<i64>,
) -> anyhow::Result<()> {
    use futures_util::{SinkExt, StreamExt, TryStreamExt};

    let mut stream = deployment
        .events()
        .stream_workspaces_raw(archived, limit)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if sender.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            msg = receiver.next() => {
                if msg.is_none() {
                    break;
                }
            }
        }
    }
    Ok(())
}

/// Legacy commit message: task title + optional description (no product names).
fn legacy_commit_message(task: &Task) -> String {
    let mut msg = task.title.clone();
    if let Some(desc) = &task.description
        && !desc.trim().is_empty()
    {
        msg.push_str("\n\n");
        msg.push_str(desc);
    }
    msg
}

/// Run the workspace's coding agent to generate a conventional commit message.
/// Uses the given session and executor (same as task page "send" would use).
/// Tells the agent current and target branch; the agent can run git diff etc. itself.
/// Returns None if agent fails or timeout.
async fn generate_commit_message_via_agent(
    deployment: &DeploymentImpl,
    workspace: &Workspace,
    session: &Session,
    executor_profile_id: &ExecutorProfileId,
    session_executor_profile_id: &ExecutorProfileId,
    current_branch: &str,
    target_branch: &str,
) -> Option<String> {
    use std::time::Duration;

    let pool = &deployment.db().pool;

    let latest_session_info = CodingAgentTurn::find_latest_session_info(pool, session.id)
        .await
        .ok()
        .flatten();
    let working_dir = workspace
        .agent_working_dir
        .as_ref()
        .filter(|d| !d.is_empty())
        .cloned();

    let prompt = format!(
        "The current branch is \"{}\", the target branch is \"{}\". \
         Generate a conventional commit message for the changes that would be merged from the current branch into the target. \
         You may run git diff or other commands to inspect the changes.\n\n\
         Conventional Commits rules (use as-is, do not search):\n\
         - Subject line format: type(scope): description — one line. Type (required): feat, fix, docs, style, refactor, perf, test, chore, build, ci. Scope (optional): short noun in parentheses. Description: imperative mood, lowercase after colon, no period, under ~72 chars.\n\
         - For SIMPLE or small changes (e.g. one file, trivial fix): put ONLY the subject line in the block below. No body.\n\
         - For COMPLEX or larger changes (multiple files, non-trivial logic): put the subject line, then a blank line, then an optional body (bullet points or short paragraphs). No product or tool names.\n\n\
         You may include reasoning or explanation before or after the block. The commit message will be taken ONLY from the following block.\n\n\
         Output the commit message in a markdown code block that starts with a line containing exactly \"```commit\" and ends with a line containing exactly \"```\". Example:\n\
         ```commit\n\
         feat(merge): improve commit message prompt and parsing\n\
         ```\n\
         Or for a complex change:\n\
         ```commit\n\
         feat(auth): add login flow\n\n\
         - Email/password flow\n\
         - Session cookie handling\n\
         ```",
        current_branch, target_branch
    );

    // If the commit message executor differs from the session executor,
    // always use InitialRequest (a new session) since we can't follow up
    // with a different executor on the same session.
    let executor_differs = executor_profile_id.executor != session_executor_profile_id.executor;

    let action_type = if let Some(info) = latest_session_info
        && !executor_differs
    {
        ExecutorActionType::CodingAgentFollowUpRequest(CodingAgentFollowUpRequest {
            prompt: prompt.clone(),
            session_id: info.session_id,
            reset_to_message_id: None,
            executor_profile_id: (*executor_profile_id).clone(),
            working_dir: working_dir.clone(),
        })
    } else {
        ExecutorActionType::CodingAgentInitialRequest(CodingAgentInitialRequest {
            prompt,
            executor_profile_id: (*executor_profile_id).clone(),
            working_dir,
        })
    };

    let action = ExecutorAction::new(action_type, None);

    let execution_process = deployment
        .container()
        .start_execution(
            workspace,
            session,
            &action,
            &ExecutionProcessRunReason::CodingAgent,
        )
        .await
        .ok()?;

    // Poll until the agent run completes (or timeout).
    const POLL_INTERVAL: Duration = Duration::from_millis(500);
    const TIMEOUT: Duration = Duration::from_secs(90);
    let deadline = std::time::Instant::now() + TIMEOUT;
    let mut timed_out = false;
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(POLL_INTERVAL).await;
        let Some(ep) = ExecutionProcess::find_by_id(pool, execution_process.id)
            .await
            .ok()
            .flatten()
        else {
            continue;
        };
        if ep.status != ExecutionProcessStatus::Running {
            break;
        }
    }
    // Check if the process is still running after the timeout
    if let Some(ep) = ExecutionProcess::find_by_id(pool, execution_process.id)
        .await
        .ok()
        .flatten()
        && ep.status == ExecutionProcessStatus::Running
    {
        timed_out = true;
        tracing::debug!(
            "Commit message agent timed out after {}s, stopping execution process {}",
            TIMEOUT.as_secs(),
            execution_process.id
        );
        if let Err(e) = deployment
            .container()
            .stop_execution(&ep, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!(
                "Failed to stop timed-out commit message agent {}: {}",
                execution_process.id,
                e
            );
        }
    }

    // If we timed out, don't wait for the summary - return None immediately
    if timed_out {
        return None;
    }

    let turn = CodingAgentTurn::find_by_execution_process_id(pool, execution_process.id)
        .await
        .ok()??;
    let summary = turn.summary.as_deref().unwrap_or("").trim();
    let raw = extract_commit_message_from_agent_response(summary);
    let raw = raw.trim();
    let lines: Vec<&str> = raw
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let subject = lines.first().map(|s| (*s).to_string()).unwrap_or_default();
    if subject.is_empty() {
        return None;
    }
    // Simple commit: one line only. Complex: subject + body (remaining lines).
    let message = if lines.len() <= 1 {
        subject
    } else {
        let body = lines[1..].join("\n");
        format!("{}\n\n{}", subject, body)
    };
    Some(message)
}

/// Extracts the commit message from an agent response that may include reasoning and explanation.
/// Expects the message in a markdown code block: a line starting with "```commit" then content then "```".
/// Only the content of that block is used. Falls back to the first non-empty line if no such block is found.
fn extract_commit_message_from_agent_response(summary: &str) -> String {
    let mut in_block = false;
    let mut lines: Vec<&str> = Vec::new();

    for line in summary.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```commit") {
            in_block = true;
            continue;
        }
        if in_block {
            if trimmed == "```" {
                break;
            }
            lines.push(line);
        }
    }

    if !lines.is_empty() {
        return lines.join("\n");
    }

    // Fallback: first non-empty line (for agents that ignore the block format)
    summary
        .lines()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod commit_message_tests {
    use super::extract_commit_message_from_agent_response;

    #[test]
    fn extracts_from_commit_block_ignoring_reasoning() {
        let response = "I'll run git diff first to see the changes.\n\n\
            The diff shows updates to the merge prompt and parsing logic.\n\n\
            ```commit\n\
            feat(merge): require structured commit message block and parse it\n\
            ```\n\n\
            This ensures only the block content is used.";
        let got = extract_commit_message_from_agent_response(response);
        assert_eq!(
            got,
            "feat(merge): require structured commit message block and parse it"
        );
    }

    #[test]
    fn extracts_multiline_commit_with_body() {
        let response = "Summary of changes:\n\n\
            ```commit\n\
            feat(auth): add login flow\n\n\
            - Email/password flow\n\
            - Session cookie handling\n\
            ```";
        let got = extract_commit_message_from_agent_response(response);
        assert_eq!(
            got,
            "feat(auth): add login flow\n\n- Email/password flow\n- Session cookie handling"
        );
    }

    #[test]
    fn fallback_to_first_line_when_no_block() {
        let response = "feat(api): add endpoint\n\nSome extra text.";
        let got = extract_commit_message_from_agent_response(response);
        assert_eq!(got, "feat(api): add endpoint");
    }

    #[test]
    fn empty_response_returns_empty() {
        let got = extract_commit_message_from_agent_response("");
        assert_eq!(got, "");
    }
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct MergeTaskAttemptRequest {
    pub repo_id: Uuid,
    pub session_id: Uuid,
    pub executor_profile_id: ExecutorProfileId,
    #[serde(default)]
    pub commit_message_executor_profile_id: Option<ExecutorProfileId>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
pub struct PushTaskAttemptRequest {
    pub repo_id: Uuid,
}

#[axum::debug_handler]
pub async fn merge_task_attempt(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<MergeTaskAttemptRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    // Prevent direct merge when there's an open PR for this repo
    let merges = Merge::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id).await?;
    let has_open_pr = merges
        .iter()
        .any(|m| matches!(m, Merge::Pr(pr) if matches!(pr.pr_info.status, MergeStatus::Open)));
    if has_open_pr {
        return Err(ApiError::BadRequest(
            "Cannot merge directly when a pull request is open for this repository.".to_string(),
        ));
    }

    // Prevent direct merge into remote branches - users must create a PR instead
    let target_branch_type = deployment
        .git()
        .find_branch_type(&repo.path, &workspace_repo.target_branch)?;
    if target_branch_type == BranchType::Remote {
        return Err(ApiError::BadRequest(
            "Cannot merge directly into a remote branch. Please create a pull request instead."
                .to_string(),
        ));
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(repo.name);

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(ApiError::Workspace(WorkspaceError::TaskNotFound))?;

    let session = Session::find_by_id(pool, request.session_id)
        .await?
        .ok_or(ApiError::Session(SessionError::NotFound))?;
    if session.workspace_id != workspace.id {
        return Err(ApiError::Session(SessionError::NotFound));
    }

    if let Some(expected) = ExecutionProcess::latest_executor_profile_for_session(pool, session.id)
        .await?
        .map(|p| p.executor.to_string())
        .or_else(|| session.executor.clone())
        && expected != request.executor_profile_id.executor.to_string()
    {
        return Err(ApiError::Session(SessionError::ExecutorMismatch {
            expected,
            actual: request.executor_profile_id.executor.to_string(),
        }));
    }

    // Use the commit message executor profile override if provided, otherwise use session executor
    let commit_message_profile = request
        .commit_message_executor_profile_id
        .as_ref()
        .unwrap_or(&request.executor_profile_id);

    let commit_message = generate_commit_message_via_agent(
        &deployment,
        &workspace,
        &session,
        commit_message_profile,
        &request.executor_profile_id,
        &workspace.branch,
        &workspace_repo.target_branch,
    )
    .await
    .unwrap_or_else(|| {
        tracing::debug!(
            "Agent did not return commit message, using legacy (task title + description)"
        );
        legacy_commit_message(&task)
    });

    let merge_commit_id = deployment.git().merge_changes(
        &repo.path,
        &worktree_path,
        &workspace.branch,
        &workspace_repo.target_branch,
        &commit_message,
    )?;

    Merge::create_direct(
        pool,
        workspace.id,
        workspace_repo.repo_id,
        &workspace_repo.target_branch,
        &merge_commit_id,
    )
    .await?;
    Task::update_status(pool, task.id, TaskStatus::Done).await?;
    if !workspace.pinned
        && let Err(e) = deployment.container().archive_workspace(workspace.id).await
    {
        tracing::error!("Failed to archive workspace {}: {}", workspace.id, e);
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_merged",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn push_task_attempt_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<PushTaskAttemptRequest>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    match deployment
        .git()
        .push_to_remote(&worktree_path, &workspace.branch, false)
    {
        Ok(_) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(GitServiceError::GitCLI(GitCliError::PushRejected(_))) => Ok(ResponseJson(
            ApiResponse::error_with_data(PushError::ForcePushRequired),
        )),
        Err(e) => Err(ApiError::GitService(e)),
    }
}

pub async fn force_push_task_attempt_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<PushTaskAttemptRequest>,
) -> Result<ResponseJson<ApiResponse<(), PushError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, request.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment
        .git()
        .push_to_remote(&worktree_path, &workspace.branch, true)?;
    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum PushError {
    ForcePushRequired,
}

#[derive(serde::Deserialize, TS)]
pub struct OpenEditorRequest {
    editor_type: Option<String>,
    file_path: Option<String>,
}

#[derive(Debug, Serialize, TS)]
pub struct OpenEditorResponse {
    pub url: Option<String>,
}

pub async fn open_task_attempt_in_editor(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<OpenEditorRequest>,
) -> Result<ResponseJson<ApiResponse<OpenEditorResponse>>, ApiError> {
    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    Workspace::touch(&deployment.db().pool, workspace.id).await?;

    let workspace_path = Path::new(&container_ref);

    // For single-repo projects, open from the repo directory
    let workspace_repos =
        WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, workspace.id).await?;
    let workspace_path = if workspace_repos.len() == 1 && payload.file_path.is_none() {
        workspace_path.join(&workspace_repos[0].name)
    } else {
        workspace_path.to_path_buf()
    };

    // If a specific file path is provided, use it; otherwise use the base path
    let path = if let Some(file_path) = payload.file_path.as_ref() {
        workspace_path.join(file_path)
    } else {
        workspace_path
    };

    let editor_config = {
        let config = deployment.config().read().await;
        let editor_type_str = payload.editor_type.as_deref();
        config.editor.with_override(editor_type_str)
    };

    match editor_config.open_file(path.as_path()).await {
        Ok(url) => {
            tracing::info!(
                "Opened editor for task attempt {} at path: {}{}",
                workspace.id,
                path.display(),
                if url.is_some() { " (remote mode)" } else { "" }
            );

            deployment
                .track_if_analytics_allowed(
                    "task_attempt_editor_opened",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "editor_type": payload.editor_type.as_ref(),
                        "remote_mode": url.is_some(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(OpenEditorResponse {
                url,
            })))
        }
        Err(e) => {
            tracing::error!(
                "Failed to open editor for attempt {}: {:?}",
                workspace.id,
                e
            );
            Err(ApiError::EditorOpen(e))
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct BranchStatus {
    pub commits_behind: Option<usize>,
    pub commits_ahead: Option<usize>,
    pub has_uncommitted_changes: Option<bool>,
    pub head_oid: Option<String>,
    pub uncommitted_count: Option<usize>,
    pub untracked_count: Option<usize>,
    pub target_branch_name: String,
    pub remote_commits_behind: Option<usize>,
    pub remote_commits_ahead: Option<usize>,
    pub merges: Vec<Merge>,
    /// True if a `git rebase` is currently in progress in this worktree
    pub is_rebase_in_progress: bool,
    /// Current conflict operation if any
    pub conflict_op: Option<ConflictOp>,
    /// List of files currently in conflicted (unmerged) state
    pub conflicted_files: Vec<String>,
    /// True if the target branch is a remote branch (merging not allowed, must use PR)
    pub is_target_remote: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
pub struct RepoBranchStatus {
    pub repo_id: Uuid,
    pub repo_name: String,
    #[serde(flatten)]
    pub status: BranchStatus,
}

pub async fn get_task_attempt_branch_status(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<RepoBranchStatus>>>, ApiError> {
    let pool = &deployment.db().pool;

    let repositories = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let workspace_repos = WorkspaceRepo::find_by_workspace_id(pool, workspace.id).await?;
    let target_branches: HashMap<_, _> = workspace_repos
        .iter()
        .map(|wr| (wr.repo_id, wr.target_branch.clone()))
        .collect();

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_dir = PathBuf::from(&container_ref);

    // Batch fetch all merges for the workspace to avoid N+1 queries
    let all_merges = Merge::find_by_workspace_id(pool, workspace.id).await?;
    let merges_by_repo: HashMap<Uuid, Vec<Merge>> =
        all_merges
            .into_iter()
            .fold(HashMap::new(), |mut acc, merge| {
                let repo_id = match &merge {
                    Merge::Direct(dm) => dm.repo_id,
                    Merge::Pr(pm) => pm.repo_id,
                };
                acc.entry(repo_id).or_insert_with(Vec::new).push(merge);
                acc
            });

    let mut results = Vec::with_capacity(repositories.len());

    for repo in repositories {
        let Some(target_branch) = target_branches.get(&repo.id).cloned() else {
            continue;
        };

        let repo_merges = merges_by_repo.get(&repo.id).cloned().unwrap_or_default();

        let worktree_path = workspace_dir.join(&repo.name);

        let head_oid = deployment
            .git()
            .get_head_info(&worktree_path)
            .ok()
            .map(|h| h.oid);

        let (is_rebase_in_progress, conflicted_files, conflict_op) = {
            let in_rebase = deployment
                .git()
                .is_rebase_in_progress(&worktree_path)
                .unwrap_or(false);
            let conflicts = deployment
                .git()
                .get_conflicted_files(&worktree_path)
                .unwrap_or_default();
            let op = if conflicts.is_empty() {
                None
            } else {
                deployment
                    .git()
                    .detect_conflict_op(&worktree_path)
                    .unwrap_or(None)
            };
            (in_rebase, conflicts, op)
        };

        let (uncommitted_count, untracked_count) =
            match deployment.git().get_worktree_change_counts(&worktree_path) {
                Ok((a, b)) => (Some(a), Some(b)),
                Err(_) => (None, None),
            };

        let has_uncommitted_changes = uncommitted_count.map(|c| c > 0);

        let target_branch_type = deployment
            .git()
            .find_branch_type(&repo.path, &target_branch)?;

        let (commits_ahead, commits_behind) = match target_branch_type {
            BranchType::Local => {
                let (a, b) = deployment.git().get_branch_status(
                    &repo.path,
                    &workspace.branch,
                    &target_branch,
                )?;
                (Some(a), Some(b))
            }
            BranchType::Remote => {
                let (ahead, behind) = deployment.git().get_remote_branch_status(
                    &repo.path,
                    &workspace.branch,
                    Some(&target_branch),
                )?;
                (Some(ahead), Some(behind))
            }
        };

        let (remote_ahead, remote_behind) = if let Some(Merge::Pr(PrMerge {
            pr_info:
                PullRequestInfo {
                    status: MergeStatus::Open,
                    ..
                },
            ..
        })) = repo_merges.first()
        {
            match deployment
                .git()
                .get_remote_branch_status(&repo.path, &workspace.branch, None)
            {
                Ok((ahead, behind)) => (Some(ahead), Some(behind)),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        results.push(RepoBranchStatus {
            repo_id: repo.id,
            repo_name: repo.name,
            status: BranchStatus {
                commits_ahead,
                commits_behind,
                has_uncommitted_changes,
                head_oid,
                uncommitted_count,
                untracked_count,
                remote_commits_ahead: remote_ahead,
                remote_commits_behind: remote_behind,
                merges: repo_merges,
                target_branch_name: target_branch,
                is_rebase_in_progress,
                conflict_op,
                conflicted_files,
                is_target_remote: target_branch_type == BranchType::Remote,
            },
        });
    }

    Ok(ResponseJson(ApiResponse::success(results)))
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct ChangeTargetBranchRequest {
    pub repo_id: Uuid,
    pub new_target_branch: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct ChangeTargetBranchResponse {
    pub repo_id: Uuid,
    pub new_target_branch: String,
    pub status: (usize, usize),
}

#[derive(serde::Deserialize, Debug, TS)]
pub struct RenameBranchRequest {
    pub new_branch_name: String,
}

#[derive(serde::Serialize, Debug, TS)]
pub struct RenameBranchResponse {
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RenameBranchError {
    EmptyBranchName,
    InvalidBranchNameFormat,
    OpenPullRequest,
    BranchAlreadyExists { repo_name: String },
    RebaseInProgress { repo_name: String },
    RenameFailed { repo_name: String, message: String },
}

#[axum::debug_handler]
pub async fn change_target_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ChangeTargetBranchRequest>,
) -> Result<ResponseJson<ApiResponse<ChangeTargetBranchResponse>>, ApiError> {
    let repo_id = payload.repo_id;
    let new_target_branch = payload.new_target_branch;
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    if !deployment
        .git()
        .check_branch_exists(&repo.path, &new_target_branch)?
    {
        return Ok(ResponseJson(ApiResponse::error(
            format!(
                "Branch '{}' does not exist in repository '{}'",
                new_target_branch, repo.name
            )
            .as_str(),
        )));
    };

    WorkspaceRepo::update_target_branch(pool, workspace.id, repo_id, &new_target_branch).await?;

    let status =
        deployment
            .git()
            .get_branch_status(&repo.path, &workspace.branch, &new_target_branch)?;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_target_branch_changed",
            serde_json::json!({
                "repo_id": repo_id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        ChangeTargetBranchResponse {
            repo_id,
            new_target_branch,
            status,
        },
    )))
}

#[axum::debug_handler]
pub async fn rename_branch(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RenameBranchRequest>,
) -> Result<ResponseJson<ApiResponse<RenameBranchResponse, RenameBranchError>>, ApiError> {
    let new_branch_name = payload.new_branch_name.trim();

    if new_branch_name.is_empty() {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::EmptyBranchName,
        )));
    }
    if !deployment.git().is_branch_name_valid(new_branch_name) {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::InvalidBranchNameFormat,
        )));
    }
    if new_branch_name == workspace.branch {
        return Ok(ResponseJson(ApiResponse::success(RenameBranchResponse {
            branch: workspace.branch.clone(),
        })));
    }

    let pool = &deployment.db().pool;

    // Fail if workspace has an open PR in any repo
    let merges = Merge::find_by_workspace_id(pool, workspace.id).await?;
    let has_open_pr = merges.into_iter().any(|merge| {
        matches!(merge, Merge::Pr(pr_merge) if matches!(pr_merge.pr_info.status, MergeStatus::Open))
    });
    if has_open_pr {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RenameBranchError::OpenPullRequest,
        )));
    }

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_dir = PathBuf::from(&container_ref);

    for repo in &repos {
        let worktree_path = workspace_dir.join(&repo.name);

        if deployment
            .git()
            .check_branch_exists(&repo.path, new_branch_name)?
        {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RenameBranchError::BranchAlreadyExists {
                    repo_name: repo.name.clone(),
                },
            )));
        }

        if deployment.git().is_rebase_in_progress(&worktree_path)? {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RenameBranchError::RebaseInProgress {
                    repo_name: repo.name.clone(),
                },
            )));
        }
    }

    // Rename all repos with rollback
    let old_branch = workspace.branch.clone();
    let mut renamed_repos: Vec<&Repo> = Vec::new();

    for repo in &repos {
        let worktree_path = workspace_dir.join(&repo.name);

        match deployment.git().rename_local_branch(
            &worktree_path,
            &workspace.branch,
            new_branch_name,
        ) {
            Ok(()) => {
                renamed_repos.push(repo);
            }
            Err(e) => {
                // Rollback already renamed repos
                for renamed_repo in &renamed_repos {
                    let rollback_path = workspace_dir.join(&renamed_repo.name);
                    if let Err(rollback_err) = deployment.git().rename_local_branch(
                        &rollback_path,
                        new_branch_name,
                        &old_branch,
                    ) {
                        tracing::error!(
                            "Failed to rollback branch rename in '{}': {}",
                            renamed_repo.name,
                            rollback_err
                        );
                    }
                }
                return Ok(ResponseJson(ApiResponse::error_with_data(
                    RenameBranchError::RenameFailed {
                        repo_name: repo.name.clone(),
                        message: e.to_string(),
                    },
                )));
            }
        }
    }

    Workspace::update_branch_name(pool, workspace.id, new_branch_name).await?;
    // What will become of me?
    let updated_children_count = WorkspaceRepo::update_target_branch_for_children_of_workspace(
        pool,
        workspace.id,
        &old_branch,
        new_branch_name,
    )
    .await?;

    if updated_children_count > 0 {
        tracing::info!(
            "Updated {} child task attempts to target new branch '{}'",
            updated_children_count,
            new_branch_name
        );
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_branch_renamed",
            serde_json::json!({
                "updated_children": updated_children_count,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(RenameBranchResponse {
        branch: new_branch_name.to_string(),
    })))
}

#[axum::debug_handler]
pub async fn rebase_task_attempt(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<RebaseTaskAttemptRequest>,
) -> Result<ResponseJson<ApiResponse<(), GitOperationError>>, ApiError> {
    let pool = &deployment.db().pool;

    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, payload.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;

    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let old_base_branch = payload
        .old_base_branch
        .unwrap_or_else(|| workspace_repo.target_branch.clone());
    let new_base_branch = payload
        .new_base_branch
        .unwrap_or_else(|| workspace_repo.target_branch.clone());

    match deployment
        .git()
        .check_branch_exists(&repo.path, &new_base_branch)?
    {
        true => {
            WorkspaceRepo::update_target_branch(
                pool,
                workspace.id,
                payload.repo_id,
                &new_base_branch,
            )
            .await?;
        }
        false => {
            return Ok(ResponseJson(ApiResponse::error(
                format!(
                    "Branch '{}' does not exist in the repository",
                    new_base_branch
                )
                .as_str(),
            )));
        }
    }

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    let result = deployment.git().rebase_branch(
        &repo.path,
        &worktree_path,
        &new_base_branch,
        &old_base_branch,
        &workspace.branch.clone(),
    );
    if let Err(e) = result {
        return match e {
            GitServiceError::MergeConflicts {
                message,
                conflicted_files,
            } => Ok(ResponseJson(
                ApiResponse::<(), GitOperationError>::error_with_data(
                    GitOperationError::MergeConflicts {
                        message,
                        op: ConflictOp::Rebase,
                        conflicted_files,
                        target_branch: new_base_branch.clone(),
                    },
                ),
            )),
            GitServiceError::RebaseInProgress => Ok(ResponseJson(ApiResponse::<
                (),
                GitOperationError,
            >::error_with_data(
                GitOperationError::RebaseInProgress,
            ))),
            other => Err(ApiError::GitService(other)),
        };
    }

    deployment
        .track_if_analytics_allowed(
            "task_attempt_rebased",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "repo_id": payload.repo_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn abort_conflicts_task_attempt(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<AbortConflictsRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, payload.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment.git().abort_conflicts(&worktree_path)?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn continue_rebase_task_attempt(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ContinueRebaseRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    let repo = Repo::find_by_id(pool, payload.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = workspace_path.join(&repo.name);

    deployment.git().continue_rebase(&worktree_path)?;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn start_dev_server(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcess>>>, ApiError> {
    let pool = &deployment.db().pool;

    // Get parent task
    let task = workspace
        .parent_task(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Get parent project
    let project = task
        .parent_project(&deployment.db().pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    // Stop any existing dev servers for this project
    let existing_dev_servers =
        match ExecutionProcess::find_running_dev_servers_by_project(pool, project.id).await {
            Ok(servers) => servers,
            Err(e) => {
                tracing::error!(
                    "Failed to find running dev servers for project {}: {}",
                    project.id,
                    e
                );
                return Err(ApiError::Workspace(WorkspaceError::ValidationError(
                    e.to_string(),
                )));
            }
        };

    for dev_server in existing_dev_servers {
        tracing::info!(
            "Stopping existing dev server {} for project {}",
            dev_server.id,
            project.id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
        }
    }

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let repos_with_dev_script: Vec<_> = repos
        .iter()
        .filter(|r| r.dev_server_script.as_ref().is_some_and(|s| !s.is_empty()))
        .collect();

    if repos_with_dev_script.is_empty() {
        return Ok(ResponseJson(ApiResponse::error(
            "No dev server script configured for any repository in this workspace",
        )));
    }

    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession {
                    executor: Some("dev-server".to_string()),
                },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let mut execution_processes = Vec::new();
    for repo in repos_with_dev_script {
        let executor_action = ExecutorAction::new(
            ExecutorActionType::ScriptRequest(ScriptRequest {
                script: repo.dev_server_script.clone().unwrap(),
                language: ScriptRequestLanguage::Bash,
                context: ScriptContext::DevServer,
                working_dir: Some(repo.name.clone()),
            }),
            None,
        );

        let execution_process = deployment
            .container()
            .start_execution(
                &workspace,
                &session,
                &executor_action,
                &ExecutionProcessRunReason::DevServer,
            )
            .await?;
        execution_processes.push(execution_process);
    }

    deployment
        .track_if_analytics_allowed(
            "dev_server_started",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_processes)))
}

pub async fn get_task_attempt_children(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<TaskRelationships>>, StatusCode> {
    match Task::find_relationships_for_workspace(&deployment.db().pool, &workspace).await {
        Ok(relationships) => {
            deployment
                .track_if_analytics_allowed(
                    "task_attempt_children_viewed",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                        "children_count": relationships.children.len(),
                        "parent_count": if relationships.parent_task.is_some() { 1 } else { 0 },
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(relationships)))
        }
        Err(e) => {
            tracing::error!(
                "Failed to fetch relationships for task attempt {}: {}",
                workspace.id,
                e
            );
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn stop_task_attempt_execution(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment.container().try_stop(&workspace, false).await;

    deployment
        .track_if_analytics_allowed(
            "task_attempt_stopped",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(())))
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(tag = "type", rename_all = "snake_case")]
pub enum RunScriptError {
    NoScriptConfigured,
    ProcessAlreadyRunning,
}

#[axum::debug_handler]
pub async fn run_setup_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if any non-dev-server processes are already running for this workspace
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().setup_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };

    // Get or create a session for setup script
    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession { executor: None },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "setup_script_executed",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn run_cleanup_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;

    // Check if any non-dev-server processes are already running for this workspace
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().cleanup_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };

    // Get or create a session for cleanup script
    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession { executor: None },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::CleanupScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "cleanup_script_executed",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn run_archive_script(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, RunScriptError>>, ApiError> {
    let pool = &deployment.db().pool;
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Ok(ResponseJson(ApiResponse::error_with_data(
            RunScriptError::ProcessAlreadyRunning,
        )));
    }

    deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;

    let task = workspace
        .parent_task(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let project = task
        .parent_project(pool)
        .await?
        .ok_or(SqlxError::RowNotFound)?;

    let repos = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;
    let executor_action = match deployment.container().archive_actions_for_repos(&repos) {
        Some(action) => action,
        None => {
            return Ok(ResponseJson(ApiResponse::error_with_data(
                RunScriptError::NoScriptConfigured,
            )));
        }
    };
    let session = match Session::find_latest_by_workspace_id(pool, workspace.id).await? {
        Some(s) => s,
        None => {
            Session::create(
                pool,
                &CreateSession { executor: None },
                Uuid::new_v4(),
                workspace.id,
            )
            .await?
        }
    };

    let execution_process = deployment
        .container()
        .start_execution(
            &workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::ArchiveScript,
        )
        .await?;

    deployment
        .track_if_analytics_allowed(
            "archive_script_executed",
            serde_json::json!({
                "task_id": task.id.to_string(),
                "project_id": project.id.to_string(),
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

#[axum::debug_handler]
pub async fn gh_cli_setup_handler(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess, GhCliSetupError>>, ApiError> {
    match gh_cli_setup::run_gh_cli_setup(&deployment, &workspace).await {
        Ok(execution_process) => {
            deployment
                .track_if_analytics_allowed(
                    "gh_cli_setup_executed",
                    serde_json::json!({
                        "workspace_id": workspace.id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(execution_process)))
        }
        Err(ApiError::Executor(ExecutorError::ExecutableNotFound { program }))
            if program == "brew" =>
        {
            Ok(ResponseJson(ApiResponse::error_with_data(
                GhCliSetupError::BrewMissing,
            )))
        }
        Err(ApiError::Executor(ExecutorError::SetupHelperNotSupported)) => Ok(ResponseJson(
            ApiResponse::error_with_data(GhCliSetupError::SetupHelperNotSupported),
        )),
        Err(ApiError::Executor(err)) => Ok(ResponseJson(ApiResponse::error_with_data(
            GhCliSetupError::Other {
                message: err.to_string(),
            },
        ))),
        Err(err) => Err(err),
    }
}

pub async fn get_task_attempt_repos(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<RepoWithTargetBranch>>>, ApiError> {
    let pool = &deployment.db().pool;

    let repos =
        WorkspaceRepo::find_repos_with_target_branch_for_workspace(pool, workspace.id).await?;

    Ok(ResponseJson(ApiResponse::success(repos)))
}

pub async fn get_first_user_message(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Option<String>>>, ApiError> {
    let pool = &deployment.db().pool;

    let message = Workspace::get_first_user_message(pool, workspace.id).await?;

    Ok(ResponseJson(ApiResponse::success(message)))
}

pub async fn delete_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DeleteWorkspaceQuery>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<()>>), ApiError> {
    let pool = &deployment.db().pool;

    // Check for running execution processes
    if ExecutionProcess::has_running_non_dev_server_processes_for_workspace(pool, workspace.id)
        .await?
    {
        return Err(ApiError::Conflict(
            "Cannot delete workspace while processes are running. Stop all processes first."
                .to_string(),
        ));
    }

    // Stop any running dev servers for this workspace
    let dev_servers =
        ExecutionProcess::find_running_dev_servers_by_workspace(pool, workspace.id).await?;

    for dev_server in dev_servers {
        tracing::info!(
            "Stopping dev server {} before deleting workspace {}",
            dev_server.id,
            workspace.id
        );

        if let Err(e) = deployment
            .container()
            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
            .await
        {
            tracing::error!(
                "Failed to stop dev server {} for workspace {}: {}",
                dev_server.id,
                workspace.id,
                e
            );
        }
    }

    // Gather data needed for background cleanup
    let workspace_dir = workspace.container_ref.clone().map(PathBuf::from);
    let repositories = WorkspaceRepo::find_repos_for_workspace(pool, workspace.id).await?;

    // Nullify parent_workspace_id for any child tasks before deletion
    let children_affected = Task::nullify_children_by_workspace_id(pool, workspace.id).await?;
    if children_affected > 0 {
        tracing::info!(
            "Nullified {} child task references before deleting workspace {}",
            children_affected,
            workspace.id
        );
    }

    // Delete workspace from database (FK CASCADE will handle sessions, execution_processes, etc.)
    let rows_affected = Workspace::delete(pool, workspace.id).await?;

    if rows_affected == 0 {
        return Err(ApiError::Database(SqlxError::RowNotFound));
    }

    deployment
        .track_if_analytics_allowed(
            "workspace_deleted",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "task_id": workspace.task_id.to_string(),
            }),
        )
        .await;

    // Attempt remote workspace deletion if requested
    if query.delete_remote {
        if let Ok(client) = deployment.remote_client() {
            match client.delete_workspace(workspace.id).await {
                Ok(()) => {
                    tracing::info!("Deleted remote workspace for {}", workspace.id);
                }
                Err(e) => {
                    tracing::warn!(
                        "Failed to delete remote workspace for {}: {}",
                        workspace.id,
                        e
                    );
                }
            }
        } else {
            tracing::debug!(
                "Remote client not available, skipping remote deletion for {}",
                workspace.id
            );
        }
    }

    // Spawn background cleanup task for filesystem resources
    if let Some(workspace_dir) = workspace_dir {
        let workspace_id = workspace.id;
        let delete_branches = query.delete_branches;
        let branch_name = workspace.branch.clone();
        let repo_paths: Vec<PathBuf> = repositories.iter().map(|r| r.path.clone()).collect();

        tokio::spawn(async move {
            tracing::info!(
                "Starting background cleanup for workspace {} at {}",
                workspace_id,
                workspace_dir.display()
            );

            if let Err(e) = WorkspaceManager::cleanup_workspace(&workspace_dir, &repositories).await
            {
                tracing::error!(
                    "Background workspace cleanup failed for {} at {}: {}",
                    workspace_id,
                    workspace_dir.display(),
                    e
                );
            } else {
                tracing::info!(
                    "Background cleanup completed for workspace {}",
                    workspace_id
                );
            }

            if delete_branches {
                let git_service = GitService::new();
                for repo_path in repo_paths {
                    match git_service.delete_branch(&repo_path, &branch_name) {
                        Ok(()) => {
                            tracing::info!(
                                "Deleted branch '{}' from repo {:?}",
                                branch_name,
                                repo_path
                            );
                        }
                        Err(e) => {
                            tracing::warn!(
                                "Failed to delete branch '{}' from repo {:?}: {}",
                                branch_name,
                                repo_path,
                                e
                            );
                        }
                    }
                }
            }
        });
    }

    // Return 202 Accepted to indicate deletion was scheduled
    Ok((StatusCode::ACCEPTED, ResponseJson(ApiResponse::success(()))))
}

/// Mark all coding agent turns for a workspace as seen
#[axum::debug_handler]
pub async fn mark_seen(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let pool = &deployment.db().pool;

    CodingAgentTurn::mark_seen_by_workspace_id(pool, workspace.id).await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Links a local workspace to the remote server, associating it with a remote issue.
pub async fn link_workspace(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<LinkWorkspaceRequest>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;

    let stats =
        diff_stream::compute_diff_stats(&deployment.db().pool, deployment.git(), &workspace).await;

    client
        .create_workspace(CreateWorkspaceRequest {
            project_id: payload.project_id,
            local_workspace_id: workspace.id,
            issue_id: payload.issue_id,
            name: workspace.name.clone(),
            archived: Some(workspace.archived),
            files_changed: stats.as_ref().map(|s| s.files_changed as i32),
            lines_added: stats.as_ref().map(|s| s.lines_added as i32),
            lines_removed: stats.as_ref().map(|s| s.lines_removed as i32),
        })
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

/// Unlinks a local workspace from the remote server by deleting the remote workspace.
pub async fn unlink_workspace(
    AxumPath(workspace_id): AxumPath<uuid::Uuid>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;

    match client.delete_workspace(workspace_id).await {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(()))),
        Err(RemoteClientError::Http { status: 404, .. }) => {
            Ok(ResponseJson(ApiResponse::success(())))
        }
        Err(e) => Err(e.into()),
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/unlink", post(unlink_workspace))
        .merge(
            Router::new()
                .route(
                    "/",
                    get(get_task_attempt)
                        .put(update_workspace)
                        .delete(delete_workspace),
                )
                .route("/run-agent-setup", post(run_agent_setup))
                .route("/gh-cli-setup", post(gh_cli_setup_handler))
                .route("/start-dev-server", post(start_dev_server))
                .route("/run-setup-script", post(run_setup_script))
                .route("/run-cleanup-script", post(run_cleanup_script))
                .route("/run-archive-script", post(run_archive_script))
                .route("/branch-status", get(get_task_attempt_branch_status))
                .route("/diff/ws", get(stream_task_attempt_diff_ws))
                .route("/merge", post(merge_task_attempt))
                .route("/push", post(push_task_attempt_branch))
                .route("/push/force", post(force_push_task_attempt_branch))
                .route("/rebase", post(rebase_task_attempt))
                .route("/rebase/continue", post(continue_rebase_task_attempt))
                .route("/conflicts/abort", post(abort_conflicts_task_attempt))
                .route("/pr", post(pr::create_pr))
                .route("/pr/attach", post(pr::attach_existing_pr))
                .route("/pr/comments", get(pr::get_pr_comments))
                .route("/open-editor", post(open_task_attempt_in_editor))
                .route("/children", get(get_task_attempt_children))
                .route("/stop", post(stop_task_attempt_execution))
                .route("/change-target-branch", post(change_target_branch))
                .route("/rename-branch", post(rename_branch))
                .route("/repos", get(get_task_attempt_repos))
                .route("/first-message", get(get_first_user_message))
                .route("/mark-seen", put(mark_seen))
                .route("/link", post(link_workspace))
                .layer(from_fn_with_state(
                    deployment.clone(),
                    load_workspace_middleware,
                )),
        );

    let task_attempts_router = Router::new()
        .route("/", get(get_task_attempts).post(create_task_attempt))
        .route("/from-pr", post(pr::create_workspace_from_pr))
        .route("/count", get(get_workspace_count))
        .route("/stream/ws", get(stream_workspaces_ws))
        .route("/summary", post(workspace_summary::get_workspace_summaries))
        .nest("/{id}", task_attempt_id_router)
        .nest("/{id}/images", images::router(deployment));

    Router::new().nest("/task-attempts", task_attempts_router)
}
