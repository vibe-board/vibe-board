use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::e2ee_config::Credentials;
use crate::e2ee_crypto::BridgeCryptoService;

/// Messages from gateway → daemon
#[derive(Deserialize)]
#[serde(tag = "type")]
enum GatewayMessage {
    #[serde(rename = "auth_ok")]
    AuthOk { user_id: String },
    #[serde(rename = "auth_error")]
    AuthError { message: String },
    #[serde(rename = "registered")]
    Registered { machine_id: String },
    #[serde(rename = "forward")]
    Forward { payload: serde_json::Value },
    #[serde(rename = "client_connected")]
    ClientConnected,
    #[serde(rename = "client_disconnected")]
    ClientDisconnected,
}

/// Run the bridge, connecting to the gateway and proxying requests to the local server.
pub async fn run_bridge(creds: &Credentials, local_port: u16) -> Result<()> {
    let crypto = BridgeCryptoService::from_master_secret_b64(&creds.master_secret)?;

    // Create signed auth token
    let auth_token = crypto.create_auth_token()?;
    let token_json = serde_json::to_string(&auth_token)?;
    let token_encoded = urlencoding::encode(&token_json);

    // Build WebSocket URL
    let ws_url = creds
        .gateway_url
        .replace("http://", "ws://")
        .replace("https://", "wss://");
    let connect_url = format!("{ws_url}/ws/daemon?token={token_encoded}");

    info!("Connecting to gateway: {}", creds.gateway_url);

    let (ws_stream, _) = connect_async(&connect_url)
        .await
        .context("Failed to connect to gateway WebSocket")?;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    info!("Connected to gateway, waiting for auth...");

    // Wait for auth response
    let first_msg = ws_receiver
        .next()
        .await
        .context("Connection closed before auth response")?
        .context("WebSocket error during auth")?;

    let auth_response: GatewayMessage = match first_msg {
        Message::Text(text) => serde_json::from_str(&text)?,
        _ => anyhow::bail!("Expected text message for auth response"),
    };

    match auth_response {
        GatewayMessage::AuthOk { user_id } => {
            info!("Authenticated as user_id={user_id}");
        }
        GatewayMessage::AuthError { message } => {
            anyhow::bail!("Authentication failed: {message}");
        }
        _ => anyhow::bail!("Unexpected first message from gateway"),
    }

    // Send register message
    let machine_id = get_machine_id();
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let platform = std::env::consts::OS.to_string();

    let register_msg = serde_json::json!({
        "type": "register",
        "machine_id": machine_id,
        "hostname": hostname,
        "platform": platform,
    });

    ws_sender
        .send(Message::Text(register_msg.to_string().into()))
        .await?;

    info!("Registered as machine_id={machine_id}, hostname={hostname}");

    // Set up channels for outgoing messages
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Spawn task to forward outgoing messages
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let local_base = format!("http://127.0.0.1:{local_port}");
    let http_client = reqwest::Client::new();

    info!(
        "Bridge active — proxying to {local_base}, waiting for WebUI connections..."
    );

    // Process incoming messages
    while let Some(msg) = ws_receiver.next().await {
        let msg = match msg {
            Ok(Message::Text(text)) => text.to_string(),
            Ok(Message::Close(_)) => {
                info!("Gateway closed connection");
                break;
            }
            Ok(Message::Ping(_)) => {
                let _ = tx.send(
                    serde_json::to_string(&serde_json::json!({"type": "pong"}))
                        .unwrap_or_default(),
                );
                continue;
            }
            Ok(_) => continue,
            Err(e) => {
                error!("WebSocket error: {e}");
                break;
            }
        };

        let gateway_msg: GatewayMessage = match serde_json::from_str(&msg) {
            Ok(m) => m,
            Err(e) => {
                warn!("Invalid gateway message: {e}");
                continue;
            }
        };

        match gateway_msg {
            GatewayMessage::Forward { payload } => {
                let tx = tx.clone();
                let client = http_client.clone();
                let base = local_base.clone();
                let crypto_content_pk = crypto.content_keypair.public_key;
                let crypto_content_sk = crypto.content_keypair.secret_key;

                tokio::spawn(async move {
                    if let Err(e) =
                        handle_forward(payload, &client, &base, &crypto_content_pk, &crypto_content_sk, &tx).await
                    {
                        warn!("Forward handling error: {e}");
                    }
                });
            }
            GatewayMessage::Registered { machine_id } => {
                info!("Registration confirmed: machine_id={machine_id}");
            }
            GatewayMessage::ClientConnected => {
                info!("WebUI client connected");
            }
            GatewayMessage::ClientDisconnected => {
                info!("WebUI client disconnected");
            }
            _ => {}
        }
    }

    send_task.abort();
    Ok(())
}

/// Handle a forwarded message from the gateway: decrypt, proxy, encrypt, send back
async fn handle_forward(
    payload: serde_json::Value,
    client: &reqwest::Client,
    local_base: &str,
    _content_pk: &[u8; 32],
    _content_sk: &[u8; 32],
    tx: &mpsc::UnboundedSender<String>,
) -> Result<()> {
    if e2ee_core::is_encrypted_payload(&payload) {
        warn!("Received encrypted payload — proxy not yet fully implemented");
    } else {
        let request: e2ee_core::BridgeRequest = serde_json::from_value(payload)
            .context("Failed to parse BridgeRequest")?;

        match request {
            e2ee_core::BridgeRequest::HttpRequest {
                id,
                method,
                path,
                headers,
                body,
            } => {
                let url = format!("{local_base}{path}");
                let method: reqwest::Method = method.parse().context("Invalid HTTP method")?;

                let mut req_builder = client.request(method, &url);
                for (key, value) in &headers {
                    req_builder = req_builder.header(key, value);
                }

                if let Some(body_b64) = body {
                    let body_bytes = BASE64.decode(&body_b64)?;
                    req_builder = req_builder.body(body_bytes);
                }

                let resp = req_builder.send().await?;
                let status = resp.status().as_u16();
                let resp_headers: Vec<(String, String)> = resp
                    .headers()
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                    .collect();
                let body_bytes = resp.bytes().await?;

                let response = e2ee_core::BridgeResponse::HttpResponse {
                    id,
                    status,
                    headers: resp_headers,
                    body: BASE64.encode(&body_bytes),
                };

                let fwd_msg = serde_json::json!({
                    "type": "forward",
                    "payload": response,
                });
                tx.send(fwd_msg.to_string())?;
            }
            e2ee_core::BridgeRequest::Ping { id } => {
                let response = e2ee_core::BridgeResponse::Pong { id };
                let fwd_msg = serde_json::json!({
                    "type": "forward",
                    "payload": response,
                });
                tx.send(fwd_msg.to_string())?;
            }
            _ => {
                warn!("Unhandled bridge request type");
            }
        }
    }

    Ok(())
}

/// Get a stable machine ID based on hostname + username
fn get_machine_id() -> String {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let username = whoami::username();
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    hostname.hash(&mut hasher);
    username.hash(&mut hasher);
    format!("m-{:016x}", hasher.finish())
}
