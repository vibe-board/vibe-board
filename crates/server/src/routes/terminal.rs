use std::{path::PathBuf, time::Duration};

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

/// Batch PTY output chunks within this window before sending as a single WS frame.
const PTY_BATCH_WINDOW_MS: u64 = 16;
/// Flush immediately when the buffer exceeds this size.
const PTY_BATCH_MAX_BYTES: usize = 8 * 1024;

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

/// Snapshots smaller than this skip gzip — the gzip header + base64
/// inflation makes them larger than just sending raw.
const SNAPSHOT_COMPRESS_THRESHOLD: usize = 256;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalCommand {
    Input { data: String },
    Resize { cols: u16, rows: u16 },
    Close,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TerminalMessage {
    Output {
        data: String,
    },
    /// Same as `Output` but `data` is base64(gzip(raw_bytes)).
    /// Used for the reconnect snapshot only; live chunks stay as `Output`.
    OutputCompressed {
        data: String,
        encoding: String,
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
    // In worktree mode, container_ref is the workspace dir and repos are
    // subdirectories; open the default repo (the first non-nested / top-level
    // repo), resolving its nested-aware worktree path under the workspace root.
    let mut working_dir = base_dir.clone();
    if attempt.mode == WorkspaceMode::Worktree {
        match WorkspaceRepo::find_repos_with_target_branch_for_workspace(
            &deployment.db().pool,
            query.workspace_id,
        )
        .await
        {
            Ok(repos) if !repos.is_empty() => {
                let default_repo = repos.iter().find(|r| !r.is_nested).unwrap_or(&repos[0]);
                let subdir = WorkspaceRepo::worktree_subdir(
                    &deployment.db().pool,
                    query.workspace_id,
                    &default_repo.repo,
                )
                .await
                .unwrap_or_else(|_| PathBuf::from(&default_repo.repo.name));
                let repo_dir = base_dir.join(subdir);
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

fn gzip_encode(data: &[u8]) -> std::io::Result<Vec<u8>> {
    use std::io::Write;

    use flate2::{Compression, write::GzEncoder};
    let mut enc = GzEncoder::new(Vec::with_capacity(data.len() / 4), Compression::default());
    enc.write_all(data)?;
    enc.finish()
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
        let msg = if snapshot.len() >= SNAPSHOT_COMPRESS_THRESHOLD {
            match gzip_encode(&snapshot) {
                Ok(compressed) => TerminalMessage::OutputCompressed {
                    data: BASE64.encode(&compressed),
                    encoding: "gzip".to_string(),
                },
                Err(e) => {
                    tracing::warn!("Snapshot gzip failed, sending uncompressed: {}", e);
                    TerminalMessage::Output {
                        data: BASE64.encode(&snapshot),
                    }
                }
            }
        } else {
            TerminalMessage::Output {
                data: BASE64.encode(&snapshot),
            }
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
        // Accumulate PTY chunks; flush either when PTY_BATCH_WINDOW_MS elapses
        // or when the buffer reaches PTY_BATCH_MAX_BYTES. This reduces the
        // number of WS frames by 10-50x during active terminal output.
        let mut buf: Vec<u8> = Vec::with_capacity(PTY_BATCH_MAX_BYTES);

        macro_rules! flush_buf {
            () => {
                if !buf.is_empty() {
                    let msg = TerminalMessage::Output {
                        data: BASE64.encode(buf.as_slice()),
                    };
                    buf.clear();
                    if let Ok(json) = serde_json::to_string(&msg) {
                        if ws_sender.send(Message::Text(json.into())).await.is_err() {
                            return ws_sender;
                        }
                    }
                }
            };
        }

        if already_exited {
            // Process already exited — drain all remaining output as one frame.
            while let Ok(data) = output_rx.try_recv() {
                buf.extend_from_slice(&data);
            }
            flush_buf!();
        } else {
            let mut timer = std::pin::pin!(tokio::time::sleep(Duration::from_millis(
                PTY_BATCH_WINDOW_MS
            )));
            let mut timer_armed = false;

            loop {
                tokio::select! {
                    data = output_rx.recv() => {
                        match data {
                            Ok(data) => {
                                if buf.is_empty() {
                                    // Arm timer from the first byte in this batch.
                                    timer.as_mut().reset(
                                        tokio::time::Instant::now()
                                            + Duration::from_millis(PTY_BATCH_WINDOW_MS),
                                    );
                                    timer_armed = true;
                                }
                                buf.extend_from_slice(&data);
                                if buf.len() >= PTY_BATCH_MAX_BYTES {
                                    flush_buf!();
                                    timer_armed = false;
                                }
                            }
                            Err(_) => {
                                flush_buf!();
                                break;
                            }
                        }
                    }
                    _ = &mut timer, if timer_armed => {
                        flush_buf!();
                        timer_armed = false;
                    }
                    _ = exit_rx_for_ws.changed() => {
                        // Process exited — drain remaining output and flush.
                        while let Ok(data) = output_rx.try_recv() {
                            buf.extend_from_slice(&data);
                        }
                        flush_buf!();
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

    let mut intentional_close = false;
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
                        TerminalCommand::Close => {
                            intentional_close = true;
                            break;
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    output_task.abort();

    // Three outcomes, in priority:
    //   1. Client sent `{"type":"close"}` -> user intentionally closed the tab; kill.
    //   2. The PTY process already exited on its own -> clean up the session.
    //   3. Bare WS disconnect (reload, network drop) -> detach for reconnection.
    if intentional_close || *exit_rx.borrow() {
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

#[cfg(test)]
mod tests {
    use std::io::Read;

    use flate2::read::GzDecoder;

    use super::*;

    fn gunzip(data: &[u8]) -> Vec<u8> {
        let mut decoder = GzDecoder::new(data);
        let mut out = Vec::new();
        decoder.read_to_end(&mut out).expect("gunzip");
        out
    }

    #[test]
    fn gzip_encode_roundtrip_basic() {
        let input = b"hello terminal world".to_vec();
        let compressed = gzip_encode(&input).expect("gzip_encode");
        let decoded = gunzip(&compressed);
        assert_eq!(decoded, input);
    }

    #[test]
    fn gzip_encode_roundtrip_empty() {
        let compressed = gzip_encode(&[]).expect("gzip_encode");
        let decoded = gunzip(&compressed);
        assert!(decoded.is_empty());
    }

    #[test]
    fn output_compressed_serializes_with_encoding_field() {
        let msg = TerminalMessage::OutputCompressed {
            data: "abc".to_string(),
            encoding: "gzip".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert_eq!(
            json,
            r#"{"type":"output_compressed","data":"abc","encoding":"gzip"}"#
        );
    }

    #[test]
    fn typical_ansi_snapshot_compresses_at_least_2x() {
        // Build a vt100 emulator and feed it a colorful, repetitive screen —
        // representative of `git diff` / `cargo build` output. ANSI SGR sequences
        // and repeated whitespace gzip very well.
        let mut parser = vt100::Parser::new(24, 80, 0);
        let red = b"\x1b[31m";
        let green = b"\x1b[32m";
        let reset = b"\x1b[0m";
        for _ in 0..12 {
            parser.process(red);
            parser.process(b"-  removed line of code with some content here\r\n");
            parser.process(reset);
            parser.process(green);
            parser.process(b"+  added line of code with some content here\r\n");
            parser.process(reset);
        }
        let snapshot = parser.screen().contents_formatted();
        assert!(
            !snapshot.is_empty(),
            "vt100 snapshot should not be empty after writes"
        );

        let compressed = gzip_encode(&snapshot).expect("gzip_encode");
        assert!(
            compressed.len() * 2 < snapshot.len(),
            "expected gzip to halve the snapshot at least; got {} -> {} bytes",
            snapshot.len(),
            compressed.len()
        );
    }
}
