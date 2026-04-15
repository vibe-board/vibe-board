use std::path::PathBuf;

use axum::{
    Json, Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use db::models::{
    workspace::{Workspace, WorkspaceMode},
    workspace_repo::WorkspaceRepo,
};
use deployment::Deployment;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct TerminalQuery {
    pub workspace_id: Uuid,
    /// Optional session_id for reconnection to existing PTY session
    pub session_id: Option<Uuid>,
    #[serde(default = "default_cols")]
    pub cols: u16,
    #[serde(default = "default_rows")]
    pub rows: u16,
}

fn default_cols() -> u16 {
    80
}

fn default_rows() -> u16 {
    24
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalCommand {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalMessage {
    Output {
        data: String,
    },
    Error {
        message: String,
    },
    /// Sent when the PTY process exits
    Exit {},
    /// Sent on connect with the session_id for future reconnection
    SessionInfo {
        session_id: Uuid,
    },
    /// Sent when trying to reconnect to an expired/unknown session
    SessionExpired {},
}

pub async fn terminal_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<TerminalQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let attempt = Workspace::find_by_id(&deployment.db().pool, query.workspace_id)
        .await?
        .ok_or_else(|| ApiError::BadRequest("Attempt not found".to_string()))?;

    let container_ref = attempt
        .container_ref
        .ok_or_else(|| ApiError::BadRequest("Attempt has no workspace directory".to_string()))?;

    let base_dir = PathBuf::from(&container_ref);
    if !base_dir.exists() {
        return Err(ApiError::BadRequest(
            "Workspace directory does not exist".to_string(),
        ));
    }

    // In direct mode, container_ref is already the repo path — don't append repo name.
    // In worktree mode, container_ref is the workspace dir and repos are subdirectories.
    let mut working_dir = base_dir.clone();
    if attempt.mode == WorkspaceMode::Worktree {
        match WorkspaceRepo::find_repos_for_workspace(&deployment.db().pool, query.workspace_id)
            .await
        {
            Ok(repos) if repos.len() == 1 => {
                let repo_dir = base_dir.join(&repos[0].name);
                if repo_dir.exists() {
                    working_dir = repo_dir;
                }
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!(
                    "Failed to resolve repos for workspace {}: {}",
                    attempt.id,
                    e
                );
            }
        }
    }

    Ok(ws.on_upgrade(move |socket| {
        handle_terminal_ws(
            socket,
            deployment,
            working_dir,
            query.cols,
            query.rows,
            query.session_id,
        )
    }))
}

#[derive(Debug, Deserialize)]
pub struct DirectTerminalQuery {
    pub cwd: String,
    pub session_id: Option<Uuid>,
    #[serde(default = "default_cols")]
    pub cols: u16,
    #[serde(default = "default_rows")]
    pub rows: u16,
}

pub async fn direct_terminal_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DirectTerminalQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let working_dir = PathBuf::from(&query.cwd);

    // Validate: must be absolute
    if !working_dir.is_absolute() {
        return Err(ApiError::BadRequest(
            "cwd must be an absolute path".to_string(),
        ));
    }

    // Validate: no .. segments
    for component in working_dir.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(ApiError::BadRequest(
                "cwd must not contain '..' segments".to_string(),
            ));
        }
    }

    // Validate: exists and is a directory
    if !working_dir.is_dir() {
        return Err(ApiError::BadRequest(
            "cwd does not exist or is not a directory".to_string(),
        ));
    }

    Ok(ws.on_upgrade(move |socket| {
        handle_terminal_ws(
            socket,
            deployment,
            working_dir,
            query.cols,
            query.rows,
            query.session_id,
        )
    }))
}

#[derive(Debug, Serialize)]
pub struct HomeDirResponse {
    pub home_dir: String,
}

pub async fn get_home_dir() -> Result<Json<HomeDirResponse>, ApiError> {
    let home = dirs::home_dir()
        .ok_or_else(|| ApiError::BadRequest("Could not determine home directory".to_string()))?;

    Ok(Json(HomeDirResponse {
        home_dir: home.to_string_lossy().to_string(),
    }))
}

async fn handle_terminal_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    working_dir: PathBuf,
    cols: u16,
    rows: u16,
    reconnect_session_id: Option<Uuid>,
) {
    // Determine session: try to attach or create new
    let (session_id, mut output_rx, snapshot, session_expired, mut exit_rx) =
        if let Some(existing_id) = reconnect_session_id {
            // Try to attach to existing session
            match deployment.pty().attach_session(existing_id).await {
                Ok((snapshot, rx, exit)) => {
                    tracing::info!("Reattached to terminal session: {}", existing_id);
                    (existing_id, rx, snapshot, false, exit)
                }
                Err(_) => {
                    // Session not found or expired - create new one
                    tracing::info!(
                        "Session {} not found, creating new terminal session",
                        existing_id
                    );
                    match deployment
                        .pty()
                        .create_session(working_dir, cols, rows)
                        .await
                    {
                        Ok((new_id, rx, exit)) => (new_id, rx, vec![], true, exit),
                        Err(e) => {
                            tracing::error!("Failed to create PTY session: {}", e);
                            let _ = send_error(socket, &e.to_string()).await;
                            return;
                        }
                    }
                }
            }
        } else {
            // Create new session
            match deployment
                .pty()
                .create_session(working_dir, cols, rows)
                .await
            {
                Ok((new_id, rx, exit)) => (new_id, rx, vec![], false, exit),
                Err(e) => {
                    tracing::error!("Failed to create PTY session: {}", e);
                    let _ = send_error(socket, &e.to_string()).await;
                    return;
                }
            }
        };

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // If session expired, notify client first
    if session_expired {
        let expired_msg = TerminalMessage::SessionExpired {};
        let json = serde_json::to_string(&expired_msg).unwrap_or_default();
        if ws_sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    // Send session_id to client for future reconnection
    let session_info = TerminalMessage::SessionInfo { session_id };
    let json = serde_json::to_string(&session_info).unwrap_or_default();
    if ws_sender.send(Message::Text(json.into())).await.is_err() {
        return;
    }

    // Send screen snapshot for reconnection
    if !snapshot.is_empty() {
        let msg = TerminalMessage::Output {
            data: BASE64.encode(&snapshot),
        };
        let json = serde_json::to_string(&msg).unwrap_or_default();
        if ws_sender.send(Message::Text(json.into())).await.is_err() {
            return;
        }
    }

    let pty_service = deployment.pty().clone();
    let session_id_for_input = session_id;

    // Check if the process has already exited
    let already_exited = *exit_rx.borrow_and_update();

    // Clone before moving into the spawned task
    let mut exit_rx_for_ws = exit_rx.clone();

    let output_task = tokio::spawn(async move {
        if already_exited {
            // Process already exited, send remaining output then exit message
            while let Ok(data) = output_rx.try_recv() {
                let msg = TerminalMessage::Output {
                    data: BASE64.encode(&data),
                };
                if let Ok(json) = serde_json::to_string(&msg)
                    && ws_sender.send(Message::Text(json.into())).await.is_err()
                {
                    return ws_sender;
                }
            }
        } else {
            // Race between output and process exit
            loop {
                tokio::select! {
                    data = output_rx.recv() => {
                        match data {
                            Ok(data) => {
                                let msg = TerminalMessage::Output {
                                    data: BASE64.encode(&data),
                                };
                                let json = match serde_json::to_string(&msg) {
                                    Ok(j) => j,
                                    Err(_) => continue,
                                };
                                if ws_sender.send(Message::Text(json.into())).await.is_err() {
                                    return ws_sender;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    _ = exit_rx_for_ws.changed() => {
                        // Process exited, drain any remaining output
                        while let Ok(data) = output_rx.try_recv() {
                            let msg = TerminalMessage::Output {
                                data: BASE64.encode(&data),
                            };
                            if let Ok(json) = serde_json::to_string(&msg)
                                && ws_sender.send(Message::Text(json.into())).await.is_err()
                            {
                                return ws_sender;
                            }
                        }
                        break;
                    }
                }
            }
        }
        // Notify client
        let exit_msg = TerminalMessage::Exit {};
        if let Ok(json) = serde_json::to_string(&exit_msg) {
            let _ = ws_sender.send(Message::Text(json.into())).await;
        }
        ws_sender
    });

    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(cmd) = serde_json::from_str::<TerminalCommand>(&text) {
                    match cmd {
                        TerminalCommand::Input { data } => {
                            if let Ok(bytes) = BASE64.decode(&data) {
                                let _ = pty_service.write(session_id_for_input, &bytes).await;
                            }
                        }
                        TerminalCommand::Resize { cols, rows } => {
                            let _ = pty_service.resize(session_id_for_input, cols, rows).await;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    output_task.abort();

    // Detach session instead of closing - session persists in background
    // unless the process already exited
    if *exit_rx.borrow() {
        let _ = deployment.pty().close_session(session_id).await;
    } else {
        let _ = deployment.pty().detach_session(session_id).await;
    }
}

async fn send_error(mut socket: WebSocket, message: &str) -> Result<(), axum::Error> {
    let msg = TerminalMessage::Error {
        message: message.to_string(),
    };
    let json = serde_json::to_string(&msg).unwrap_or_default();
    socket.send(Message::Text(json.into())).await?;
    socket.close().await?;
    Ok(())
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/terminal/ws", get(terminal_ws))
        .route("/terminal/direct-ws", get(direct_terminal_ws))
        .route("/terminal/home-dir", get(get_home_dir))
}
