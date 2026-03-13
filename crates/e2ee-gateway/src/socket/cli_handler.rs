use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::services::cli_registry::CliRecord;
use crate::AppState;

#[derive(Deserialize)]
pub struct DaemonConnectQuery {
    /// Base64 JSON-encoded SignedAuthToken
    pub token: Option<String>,
}

/// GET /ws/daemon — WebSocket endpoint for daemon connections
pub async fn daemon_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<DaemonConnectQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_daemon_socket(socket, state, query))
}

/// Messages from daemon → gateway
#[derive(Deserialize)]
#[serde(tag = "type")]
enum DaemonMessage {
    #[serde(rename = "auth")]
    Auth { token: e2ee_core::SignedAuthToken },
    #[serde(rename = "register")]
    Register {
        machine_id: String,
        hostname: String,
        platform: String,
    },
    #[serde(rename = "forward")]
    Forward { payload: serde_json::Value },
}

/// Messages from gateway → daemon
#[derive(Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
enum GatewayToDaemon {
    #[serde(rename = "auth_ok")]
    AuthOk { user_id: String },
    #[serde(rename = "auth_error")]
    AuthError { message: String },
    #[serde(rename = "registered")]
    Registered { machine_id: String },
    #[serde(rename = "client_connected")]
    ClientConnected,
    #[serde(rename = "client_disconnected")]
    ClientDisconnected,
    #[serde(rename = "forward")]
    Forward { payload: serde_json::Value },
}

async fn handle_daemon_socket(socket: WebSocket, state: AppState, query: DaemonConnectQuery) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Try to authenticate from query param first
    let mut user_id: Option<String> = None;
    if let Some(token_str) = &query.token {
        if let Ok(token) = serde_json::from_str::<e2ee_core::SignedAuthToken>(token_str) {
            match crate::auth::verify_daemon_token(&state.db, &token).await {
                Ok(uid) => {
                    user_id = Some(uid.clone());
                    let msg = serde_json::to_string(&GatewayToDaemon::AuthOk { user_id: uid })
                        .unwrap();
                    let _ = sender.send(Message::Text(msg.into())).await;
                }
                Err(e) => {
                    let msg = serde_json::to_string(&GatewayToDaemon::AuthError {
                        message: e.to_string(),
                    })
                    .unwrap();
                    let _ = sender.send(Message::Text(msg.into())).await;
                    return;
                }
            }
        }
    }

    let mut machine_id: Option<String> = None;

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Process incoming messages
    while let Some(msg) = receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text.to_string(),
            Ok(Message::Close(_)) => break,
            Ok(_) => continue,
            Err(e) => {
                warn!("Daemon WebSocket error: {e}");
                break;
            }
        };

        let daemon_msg: DaemonMessage = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(e) => {
                warn!("Invalid daemon message: {e}");
                continue;
            }
        };

        match daemon_msg {
            DaemonMessage::Auth { token } => {
                if user_id.is_some() {
                    continue; // Already authenticated
                }
                match crate::auth::verify_daemon_token(&state.db, &token).await {
                    Ok(uid) => {
                        user_id = Some(uid.clone());
                        let resp = serde_json::to_string(&GatewayToDaemon::AuthOk {
                            user_id: uid,
                        })
                        .unwrap();
                        let _ = tx.send(resp);
                    }
                    Err(e) => {
                        let resp = serde_json::to_string(&GatewayToDaemon::AuthError {
                            message: e,
                        })
                        .unwrap();
                        let _ = tx.send(resp);
                        break; // Disconnect on auth failure
                    }
                }
            }

            DaemonMessage::Register {
                machine_id: mid,
                hostname,
                platform,
            } => {
                let Some(ref uid) = user_id else {
                    warn!("Daemon tried to register before auth");
                    continue;
                };

                // Upsert machine in DB
                if let Err(e) = crate::db::upsert_machine(
                    &state.db,
                    &mid,
                    uid,
                    Some(&hostname),
                    Some(&platform),
                )
                .await
                {
                    error!("Failed to upsert machine: {e}");
                }

                // Register in CliRegistry
                state.cli_registry.register(CliRecord {
                    machine_id: mid.clone(),
                    hostname,
                    platform,
                    user_id: uid.clone(),
                    sender: tx.clone(),
                });

                machine_id = Some(mid.clone());
                info!("Daemon registered: machine_id={mid}, user_id={uid}");

                let resp =
                    serde_json::to_string(&GatewayToDaemon::Registered { machine_id: mid })
                        .unwrap();
                let _ = tx.send(resp);

                // Notify any subscribed WebUI clients
                state.webui_registry.notify_machine_online(
                    machine_id.as_deref().unwrap_or_default(),
                    user_id.as_deref().unwrap_or_default(),
                );
            }

            DaemonMessage::Forward { payload } => {
                let Some(ref uid) = user_id else { continue };
                let Some(ref mid) = machine_id else { continue };

                // Forward to all subscribed WebUI clients for this machine
                state.webui_registry.forward_to_webui(mid, uid, payload);
            }
        }
    }

    // Cleanup on disconnect
    if let Some(ref mid) = machine_id {
        info!("Daemon disconnected: machine_id={mid}");
        state.cli_registry.unregister(mid);
        state.webui_registry.notify_machine_offline(
            mid,
            user_id.as_deref().unwrap_or_default(),
        );
    }

    send_task.abort();
}
