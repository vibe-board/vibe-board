use axum::{
    extract::{
        ws::{Message, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::AppState;

#[derive(Deserialize)]
pub struct WebUIConnectQuery {
    /// Bearer session token
    pub token: Option<String>,
}

/// GET /ws/webui — WebSocket endpoint for WebUI connections
pub async fn webui_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WebUIConnectQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_webui_socket(socket, state, query))
}

/// Messages from WebUI → gateway
#[derive(Deserialize)]
#[serde(tag = "type")]
enum WebUIMessage {
    #[serde(rename = "subscribe")]
    Subscribe { machine_id: String },
    #[serde(rename = "unsubscribe")]
    Unsubscribe { machine_id: String },
    #[serde(rename = "forward")]
    Forward {
        machine_id: String,
        payload: serde_json::Value,
    },
}

/// Messages from gateway → WebUI
#[derive(Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum GatewayToWebUI {
    #[serde(rename = "auth_ok")]
    AuthOk { user_id: String },
    #[serde(rename = "auth_error")]
    AuthError { message: String },
    #[serde(rename = "machines")]
    Machines { machines: Vec<MachineStatus> },
    #[serde(rename = "machine_online")]
    MachineOnline {
        machine_id: String,
        hostname: String,
        platform: String,
        port: u16,
    },
    #[serde(rename = "machine_offline")]
    MachineOffline { machine_id: String },
    #[serde(rename = "forward")]
    Forward {
        machine_id: String,
        payload: serde_json::Value,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Serialize)]
pub struct MachineStatus {
    pub machine_id: String,
    pub hostname: String,
    pub platform: String,
    pub port: u16,
}

async fn handle_webui_socket(socket: WebSocket, state: AppState, query: WebUIConnectQuery) {
    let (mut sender, mut receiver) = socket.split();

    // Authenticate via query param token (DB-backed)
    let user_id = match &query.token {
        Some(token) => match crate::db::get_session_user_id(&state.db, token).await {
            Ok(Some(uid)) => uid,
            _ => {
                let msg = serde_json::to_string(&GatewayToWebUI::AuthError {
                    message: "Invalid session token".to_string(),
                })
                .unwrap();
                let _ = sender.send(Message::Text(msg.into())).await;
                return;
            }
        },
        None => {
            let msg = serde_json::to_string(&GatewayToWebUI::AuthError {
                message: "Missing token parameter".to_string(),
            })
            .unwrap();
            let _ = sender.send(Message::Text(msg.into())).await;
            return;
        }
    };

    info!("WebUI connected: user_id={user_id}");

    // Send auth confirmation
    let auth_ok = serde_json::to_string(&GatewayToWebUI::AuthOk {
        user_id: user_id.clone(),
    })
    .unwrap();
    if sender.send(Message::Text(auth_ok.into())).await.is_err() {
        return;
    }

    // Send current machine list
    let online_daemons = state.cli_registry.get_all_for_user(&user_id);
    let machines: Vec<MachineStatus> = online_daemons
        .iter()
        .map(|d| MachineStatus {
            machine_id: d.machine_id.clone(),
            hostname: d.hostname.clone(),
            platform: d.platform.clone(),
            port: d.port,
        })
        .collect();

    let machines_msg = serde_json::to_string(&GatewayToWebUI::Machines { machines }).unwrap();
    if sender
        .send(Message::Text(machines_msg.into()))
        .await
        .is_err()
    {
        return;
    }

    // Register this WebUI connection in the registry
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let client_id = uuid::Uuid::new_v4().to_string();
    state
        .webui_registry
        .register(client_id.clone(), user_id.clone(), tx);

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
                warn!("WebUI WebSocket error: {e}");
                break;
            }
        };

        let webui_msg: WebUIMessage = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(e) => {
                warn!("Invalid WebUI message: {e}");
                continue;
            }
        };

        match webui_msg {
            WebUIMessage::Subscribe { machine_id } => {
                state
                    .webui_registry
                    .subscribe(&client_id, &machine_id, &user_id);
                // Notify daemon that a new client subscribed (for per-client DEK tracking)
                let notify = serde_json::json!({
                    "type": "client_connected",
                    "client_id": client_id,
                });
                let _ = state
                    .cli_registry
                    .send_to_daemon(&machine_id, &user_id, notify.to_string());
            }

            WebUIMessage::Unsubscribe { machine_id } => {
                state.webui_registry.unsubscribe(&client_id, &machine_id);
                // Notify daemon that a client unsubscribed (for DEK cleanup)
                let notify = serde_json::json!({
                    "type": "client_disconnected",
                    "client_id": client_id,
                });
                let _ = state
                    .cli_registry
                    .send_to_daemon(&machine_id, &user_id, notify.to_string());
            }

            WebUIMessage::Forward {
                machine_id,
                payload,
            } => {
                // Include client_id so the daemon can route responses back to this specific tab
                let fwd_msg = serde_json::json!({
                    "type": "forward",
                    "client_id": client_id,
                    "payload": payload
                });
                if let Err(e) =
                    state
                        .cli_registry
                        .send_to_daemon(&machine_id, &user_id, fwd_msg.to_string())
                {
                    warn!("Failed to forward to daemon {machine_id}: {e}");
                }
            }
        }
    }

    // Cleanup: notify daemons of disconnected client for DEK cleanup
    info!("WebUI disconnected: client_id={client_id}");
    let subscribed_machines = state.webui_registry.get_subscriptions(&client_id);
    for machine_id in &subscribed_machines {
        let notify = serde_json::json!({
            "type": "client_disconnected",
            "client_id": client_id,
        });
        let _ = state
            .cli_registry
            .send_to_daemon(machine_id, &user_id, notify.to_string());
    }
    state.webui_registry.unregister(&client_id);
    send_task.abort();
}
