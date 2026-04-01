use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::{e2ee_config::Credentials, e2ee_crypto::BridgeCryptoService};

/// Active WebSocket sub-connections (id → sender to local WS)
type WsConnections = Arc<Mutex<HashMap<u32, mpsc::UnboundedSender<String>>>>;

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

/// Whether an error represents a permanent auth failure that should not be retried.
fn is_auth_error(e: &anyhow::Error) -> bool {
    let msg = e.to_string();
    msg.contains("Authentication failed")
}

/// Exponential backoff: 1s * 2^attempt, capped at 30s, with random jitter.
fn backoff_delay(attempt: u32) -> Duration {
    let base = Duration::from_secs(1);
    let cap = Duration::from_secs(30);
    let exp = attempt.min(10);
    let delay = base.saturating_mul(1u32 << exp).min(cap);
    // Add 0–500ms random jitter to avoid thundering herd
    let jitter_ms: u64 = rand::random::<u64>() % 500;
    delay + Duration::from_millis(jitter_ms)
}

/// Run the bridge with automatic reconnection on disconnect.
///
/// Retries indefinitely with exponential backoff on transient failures (connection errors,
/// gateway restarts). Returns immediately on permanent auth failures.
pub async fn run_bridge(creds: &Credentials, local_port: u16) -> Result<()> {
    let crypto = BridgeCryptoService::from_master_secret_b64(&creds.master_secret)?;

    let mut attempt: u32 = 0;
    loop {
        info!(
            "Connecting to gateway: {} (attempt {})",
            creds.gateway_url,
            attempt + 1
        );

        match connect_and_run(&crypto, creds, local_port).await {
            Ok(()) => {
                warn!("Gateway connection ended unexpectedly, reconnecting...");
            }
            Err(e) if is_auth_error(&e) => {
                error!("E2EE bridge auth failed permanently: {e}");
                return Err(e);
            }
            Err(e) => {
                warn!("Gateway connection error: {e}, reconnecting...");
            }
        }

        let delay = backoff_delay(attempt);
        info!("Reconnecting in {delay:?}...");
        tokio::time::sleep(delay).await;
        attempt = attempt.saturating_add(1);
    }
}

/// Single connection attempt: connect, authenticate, register, and run the message loop.
///
/// Returns `Ok(())` when the connection ends (clean close or stream exhaustion).
/// Returns `Err` for auth failures or connection errors.
async fn connect_and_run(
    crypto: &BridgeCryptoService,
    creds: &Credentials,
    local_port: u16,
) -> Result<()> {
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

    let (ws_stream, _) = connect_async(&connect_url).await.map_err(|e| {
        anyhow::anyhow!(
            "Failed to connect to gateway WebSocket at {}: {e}",
            creds.gateway_url
        )
    })?;

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    info!("Connected to gateway, waiting for auth...");

    // Wait for auth response (with timeout)
    let first_msg = tokio::time::timeout(Duration::from_secs(10), ws_receiver.next())
        .await
        .context("Timed out waiting for gateway auth response")?
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
    // Fresh ws_connections for each connection — old sub-connections are dead after disconnect
    let ws_connections: WsConnections = Arc::new(Mutex::new(HashMap::new()));

    info!("Bridge active — proxying to {local_base}, waiting for WebUI connections...");

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
                    serde_json::to_string(&serde_json::json!({"type": "pong"})).unwrap_or_default(),
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
                let ws_conns = ws_connections.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_forward(
                        payload,
                        &client,
                        &base,
                        &crypto_content_pk,
                        &crypto_content_sk,
                        &tx,
                        &ws_conns,
                    )
                    .await
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

/// Send a bridge response back through the gateway
fn send_response(tx: &mpsc::UnboundedSender<String>, response: e2ee_core::BridgeResponse) {
    let fwd_msg = serde_json::json!({
        "type": "forward",
        "payload": response,
    });
    let _ = tx.send(fwd_msg.to_string());
}

/// Handle a forwarded message from the gateway: decrypt, proxy, encrypt, send back
async fn handle_forward(
    payload: serde_json::Value,
    client: &reqwest::Client,
    local_base: &str,
    _content_pk: &[u8; 32],
    _content_sk: &[u8; 32],
    tx: &mpsc::UnboundedSender<String>,
    ws_connections: &WsConnections,
) -> Result<()> {
    if e2ee_core::is_encrypted_payload(&payload) {
        warn!("Received encrypted payload — proxy not yet fully implemented");
        return Ok(());
    }

    let request: e2ee_core::BridgeRequest =
        serde_json::from_value(payload).context("Failed to parse BridgeRequest")?;

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

            send_response(
                tx,
                e2ee_core::BridgeResponse::HttpResponse {
                    id,
                    status,
                    headers: resp_headers,
                    body: BASE64.encode(&body_bytes),
                },
            );
        }

        e2ee_core::BridgeRequest::WsOpen { id, path, query } => {
            let ws_url = {
                let base = local_base
                    .replace("http://", "ws://")
                    .replace("https://", "wss://");
                match query {
                    Some(q) => format!("{base}{path}?{q}"),
                    None => format!("{base}{path}"),
                }
            };

            info!("Opening WS sub-connection id={id} to {ws_url}");

            match connect_async(&ws_url).await {
                Ok((ws_stream, _)) => {
                    let (mut ws_send, mut ws_recv) = ws_stream.split();

                    // Channel for sending data from bridge → local WS
                    let (sub_tx, mut sub_rx) = mpsc::unbounded_channel::<String>();
                    ws_connections.lock().await.insert(id, sub_tx);

                    // Confirm opened
                    send_response(tx, e2ee_core::BridgeResponse::WsOpened { id });

                    // Task: local WS → gateway (forward data from local WS back through bridge)
                    let tx_recv = tx.clone();
                    let ws_conns_recv = ws_connections.clone();
                    tokio::spawn(async move {
                        while let Some(msg) = ws_recv.next().await {
                            match msg {
                                Ok(Message::Text(text)) => {
                                    send_response(
                                        &tx_recv,
                                        e2ee_core::BridgeResponse::WsData {
                                            id,
                                            data: BASE64.encode(text.as_bytes()),
                                        },
                                    );
                                }
                                Ok(Message::Binary(bin)) => {
                                    send_response(
                                        &tx_recv,
                                        e2ee_core::BridgeResponse::WsData {
                                            id,
                                            data: BASE64.encode(&bin),
                                        },
                                    );
                                }
                                Ok(Message::Close(_)) => break,
                                Err(_) => break,
                                _ => {}
                            }
                        }
                        // WS closed — notify and clean up
                        send_response(&tx_recv, e2ee_core::BridgeResponse::WsClosed { id });
                        ws_conns_recv.lock().await.remove(&id);
                    });

                    // Task: gateway → local WS (forward data from bridge to local WS)
                    tokio::spawn(async move {
                        while let Some(data) = sub_rx.recv().await {
                            if ws_send.send(Message::Text(data.into())).await.is_err() {
                                break;
                            }
                        }
                    });
                }
                Err(e) => {
                    warn!("WS sub-connection failed for id={id}: {e}");
                    send_response(
                        tx,
                        e2ee_core::BridgeResponse::Error {
                            id,
                            message: format!("WebSocket connect failed: {e}"),
                        },
                    );
                }
            }
        }

        e2ee_core::BridgeRequest::WsData { id, data } => {
            let decoded = BASE64.decode(&data).context("Invalid base64 in WsData")?;
            let text = String::from_utf8(decoded).context("Invalid UTF-8 in WsData")?;
            let conns = ws_connections.lock().await;
            if let Some(sub_tx) = conns.get(&id) {
                let _ = sub_tx.send(text);
            } else {
                warn!("WsData for unknown sub-connection id={id}");
            }
        }

        e2ee_core::BridgeRequest::WsClose { id } => {
            info!("Closing WS sub-connection id={id}");
            // Removing the sender drops it, which causes the sub_rx loop to end,
            // which causes the ws_send task to close the local WS.
            ws_connections.lock().await.remove(&id);
        }

        e2ee_core::BridgeRequest::Ping { id } => {
            send_response(tx, e2ee_core::BridgeResponse::Pong { id });
        }

        e2ee_core::BridgeRequest::SseSubscribe { id, .. } => {
            send_response(
                tx,
                e2ee_core::BridgeResponse::Error {
                    id,
                    message: "SSE not yet supported".to_string(),
                },
            );
        }

        e2ee_core::BridgeRequest::SseUnsubscribe { .. } => {}
    }

    Ok(())
}

/// Get a stable machine ID based on hostname + username
fn get_machine_id() -> String {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let username = whoami::username();
    use std::{
        collections::hash_map::DefaultHasher,
        hash::{Hash, Hasher},
    };
    let mut hasher = DefaultHasher::new();
    hostname.hash(&mut hasher);
    username.hash(&mut hasher);
    format!("m-{:016x}", hasher.finish())
}
