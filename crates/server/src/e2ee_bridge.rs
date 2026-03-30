use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{error, info, warn};

use crate::{e2ee_config::Credentials, e2ee_crypto::BridgeCryptoService};

/// Active WebSocket sub-connections (id → sender to local WS)
type WsConnections = Arc<Mutex<HashMap<u32, mpsc::UnboundedSender<String>>>>;

/// Per-client DEK state: client_id → DEK
type DekState = Arc<Mutex<HashMap<String, [u8; 32]>>>;

/// Shared context for forward message handling
struct BridgeContext {
    client: reqwest::Client,
    local_base: String,
    content_sk: [u8; 32],
    content_pk: [u8; 32],
    tx: mpsc::UnboundedSender<String>,
    ws_connections: WsConnections,
    dek_state: DekState,
}

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
    Forward {
        client_id: String,
        payload: serde_json::Value,
    },
    #[serde(rename = "client_connected")]
    ClientConnected { client_id: String },
    #[serde(rename = "client_disconnected")]
    ClientDisconnected { client_id: String },
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
/// gateway restarts). Returns immediately on permanent auth failures or cancellation.
pub async fn run_bridge(
    creds: &Credentials,
    local_port: u16,
    mut cancel_rx: oneshot::Receiver<()>,
) -> Result<()> {
    let crypto = BridgeCryptoService::from_master_secret_b64(&creds.master_secret)?;

    let mut attempt: u32 = 0;
    loop {
        // Check for cancellation before each connection attempt
        if cancel_rx.try_recv().is_ok() {
            info!("Bridge cancelled, shutting down");
            return Ok(());
        }

        info!(
            "Connecting to gateway: {} (attempt {})",
            creds.gateway_url,
            attempt + 1
        );

        // Race the connection attempt against cancellation
        tokio::select! {
            result = connect_and_run(&crypto, creds, local_port) => {
                match result {
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
            }
            _ = &mut cancel_rx => {
                info!("Bridge cancelled during connection, shutting down");
                return Ok(());
            }
        }

        let delay = backoff_delay(attempt);
        info!("Reconnecting in {delay:?}...");

        // Race the backoff sleep against cancellation
        tokio::select! {
            _ = tokio::time::sleep(delay) => {}
            _ = &mut cancel_rx => {
                info!("Bridge cancelled during backoff, shutting down");
                return Ok(());
            }
        }

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
    let machine_id = get_machine_id(local_port);
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let platform = std::env::consts::OS.to_string();

    let register_msg = serde_json::json!({
        "type": "register",
        "machine_id": machine_id,
        "hostname": hostname,
        "platform": platform,
        "port": local_port,
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
    let dek_state: DekState = Arc::new(Mutex::new(HashMap::new()));

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
            GatewayMessage::Forward { client_id, payload } => {
                let ctx = BridgeContext {
                    client: http_client.clone(),
                    local_base: local_base.clone(),
                    content_sk: crypto.content_keypair.secret_key,
                    content_pk: crypto.content_keypair.public_key,
                    tx: tx.clone(),
                    ws_connections: ws_connections.clone(),
                    dek_state: dek_state.clone(),
                };

                tokio::spawn(async move {
                    if let Err(e) = handle_forward(&ctx, &client_id, payload).await {
                        warn!("Forward handling error for client {client_id}: {e}");
                    }
                });
            }
            GatewayMessage::Registered { machine_id } => {
                info!("Registration confirmed: machine_id={machine_id}");
            }
            GatewayMessage::ClientConnected { client_id } => {
                info!("WebUI client connected: {client_id}");
            }
            GatewayMessage::ClientDisconnected { client_id } => {
                info!("WebUI client disconnected: {client_id}, removing DEK");
                dek_state.lock().await.remove(&client_id);
            }
            _ => {}
        }
    }

    send_task.abort();
    Ok(())
}

/// Send a bridge response back through the gateway, routed to a specific client
fn send_response(
    tx: &mpsc::UnboundedSender<String>,
    client_id: &str,
    response: e2ee_core::BridgeResponse,
) {
    let fwd_msg = serde_json::json!({
        "type": "forward",
        "client_id": client_id,
        "payload": response,
    });
    let _ = tx.send(fwd_msg.to_string());
}

/// Send a bridge response, encrypting with the client's DEK
fn send_encrypted_response(
    tx: &mpsc::UnboundedSender<String>,
    client_id: &str,
    response: e2ee_core::BridgeResponse,
    dek: &[u8; 32],
) -> Result<()> {
    let encrypted = e2ee_core::encrypt_json(&response, dek)?;
    send_response(tx, client_id, e2ee_core::BridgeResponse::Encrypted(encrypted));
    Ok(())
}

/// Handle a forwarded message from the gateway: DEK exchange, decrypt, proxy, encrypt, send back
async fn handle_forward(
    ctx: &BridgeContext,
    client_id: &str,
    payload: serde_json::Value,
) -> Result<()> {
    // Check for DEK exchange message (raw JSON, not a BridgeRequest)
    if let Some(msg_type) = payload.get("type").and_then(|v| v.as_str())
        && msg_type == "dek_exchange"
    {
        let wrapped_dek_b64 = payload
            .get("wrapped_dek")
            .and_then(|v| v.as_str())
            .context("dek_exchange missing wrapped_dek")?;
        let wrapped_dek = BASE64
            .decode(wrapped_dek_b64)
            .context("Invalid base64 in wrapped_dek")?;
        let dek = e2ee_core::unwrap_dek(&wrapped_dek, &ctx.content_sk, &ctx.content_pk)
            .context("Failed to unwrap DEK")?;
        ctx.dek_state
            .lock()
            .await
            .insert(client_id.to_string(), dek);
        info!("DEK exchange completed for client {client_id}");
        send_response(&ctx.tx, client_id, e2ee_core::BridgeResponse::DekOk);
        return Ok(());
    }

    // Look up this client's DEK
    let dek = {
        let deks = ctx.dek_state.lock().await;
        *deks
            .get(client_id)
            .context("Received encrypted payload but no DEK established for this client")?
    };

    // Determine the request: decrypt if encrypted, otherwise reject
    let request: e2ee_core::BridgeRequest = if e2ee_core::is_encrypted_payload(&payload) {
        let encrypted: e2ee_core::envelope::EncryptedPayload =
            serde_json::from_value(payload).context("Failed to parse EncryptedPayload")?;
        e2ee_core::decrypt_json(&encrypted, &dek).context("Failed to decrypt bridge request")?
    } else {
        anyhow::bail!(
            "Received plaintext BridgeRequest; all requests must be encrypted after DEK exchange \
             or dek_exchange before it"
        );
    };

    // Helper: send response encrypted with this client's DEK
    let send_resp = |response: e2ee_core::BridgeResponse| {
        send_encrypted_response(&ctx.tx, client_id, response, &dek)
    };

    match request {
        e2ee_core::BridgeRequest::HttpRequest {
            id,
            method,
            path,
            headers,
            body,
        } => {
            let url = format!("{}{path}", ctx.local_base);
            let method: reqwest::Method = method.parse().context("Invalid HTTP method")?;

            let mut req_builder = ctx.client.request(method, &url);
            for (key, value) in &headers {
                // Strip Origin header — the bridge forwards requests to localhost
                // where Origin (e.g. the public domain) won't match Host (127.0.0.1),
                // causing the origin middleware to reject with 403.
                if key.eq_ignore_ascii_case("origin") {
                    continue;
                }
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

            send_resp(e2ee_core::BridgeResponse::HttpResponse {
                id,
                status,
                headers: resp_headers,
                body: BASE64.encode(&body_bytes),
            })?;
        }

        e2ee_core::BridgeRequest::WsOpen { id, path, query } => {
            let ws_url = {
                let base = ctx
                    .local_base
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
                    ctx.ws_connections.lock().await.insert(id, sub_tx);

                    // Confirm opened
                    send_resp(e2ee_core::BridgeResponse::WsOpened { id })?;

                    // Task: local WS → gateway (forward data from local WS back through bridge)
                    // Capture DEK at spawn time — it doesn't change after exchange for this client
                    let tx_recv = ctx.tx.clone();
                    let ws_conns_recv = ctx.ws_connections.clone();
                    let owner_client_id = client_id.to_string();
                    let owner_dek = dek;
                    tokio::spawn(async move {
                        while let Some(msg) = ws_recv.next().await {
                            match msg {
                                Ok(Message::Text(text)) => {
                                    let _ = send_encrypted_response(
                                        &tx_recv,
                                        &owner_client_id,
                                        e2ee_core::BridgeResponse::WsData {
                                            id,
                                            data: BASE64.encode(text.as_bytes()),
                                        },
                                        &owner_dek,
                                    );
                                }
                                Ok(Message::Binary(bin)) => {
                                    let _ = send_encrypted_response(
                                        &tx_recv,
                                        &owner_client_id,
                                        e2ee_core::BridgeResponse::WsData {
                                            id,
                                            data: BASE64.encode(&bin),
                                        },
                                        &owner_dek,
                                    );
                                }
                                Ok(Message::Close(_)) => break,
                                Err(_) => break,
                                _ => {}
                            }
                        }
                        // WS closed — notify and clean up
                        let _ = send_encrypted_response(
                            &tx_recv,
                            &owner_client_id,
                            e2ee_core::BridgeResponse::WsClosed { id },
                            &owner_dek,
                        );
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
                    send_resp(e2ee_core::BridgeResponse::Error {
                        id,
                        message: format!("WebSocket connect failed: {e}"),
                    })?;
                }
            }
        }

        e2ee_core::BridgeRequest::WsData { id, data } => {
            let decoded = BASE64.decode(&data).context("Invalid base64 in WsData")?;
            let text = String::from_utf8(decoded).context("Invalid UTF-8 in WsData")?;
            let conns = ctx.ws_connections.lock().await;
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
            ctx.ws_connections.lock().await.remove(&id);
        }

        e2ee_core::BridgeRequest::Ping { id } => {
            send_resp(e2ee_core::BridgeResponse::Pong { id })?;
        }

        e2ee_core::BridgeRequest::SseSubscribe { id, .. } => {
            send_resp(e2ee_core::BridgeResponse::Error {
                id,
                message: "SSE not yet supported".to_string(),
            })?;
        }

        e2ee_core::BridgeRequest::SseUnsubscribe { .. } => {}
    }

    Ok(())
}

/// Get a stable machine ID based on hostname + username + port
fn get_machine_id(port: u16) -> String {
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
    port.hash(&mut hasher);
    format!("m-{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dek_exchange_payload_detection() {
        // dek_exchange message should NOT be detected as an encrypted payload
        let dek_msg = serde_json::json!({
            "type": "dek_exchange",
            "wrapped_dek": "dGVzdA=="
        });
        assert!(!e2ee_core::is_encrypted_payload(&dek_msg));

        // Should have type field = "dek_exchange"
        assert_eq!(
            dek_msg.get("type").and_then(|v| v.as_str()),
            Some("dek_exchange")
        );
    }

    #[test]
    fn test_send_encrypted_response_with_dek() {
        let dek = e2ee_core::generate_dek();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let response = e2ee_core::BridgeResponse::Pong { id: 42 };

        let result = send_encrypted_response(&tx, "client-1", response, &dek);
        assert!(result.is_ok());

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "forward");
        assert_eq!(parsed["client_id"], "client-1");
        // Payload should be encrypted
        assert_eq!(parsed["payload"]["type"], "encrypted");
        assert!(parsed["payload"]["c"].is_string());

        // Verify we can decrypt it back
        let encrypted: e2ee_core::envelope::EncryptedPayload =
            serde_json::from_value(parsed["payload"].clone()).unwrap();
        let decrypted: e2ee_core::BridgeResponse =
            e2ee_core::decrypt_json(&encrypted, &dek).unwrap();
        if let e2ee_core::BridgeResponse::Pong { id } = decrypted {
            assert_eq!(id, 42);
        } else {
            panic!("Expected Pong response");
        }
    }

    #[test]
    fn test_send_response_includes_client_id() {
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let response = e2ee_core::BridgeResponse::Pong { id: 1 };

        send_response(&tx, "client-abc", response);

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "forward");
        assert_eq!(parsed["client_id"], "client-abc");
        assert_eq!(parsed["payload"]["type"], "pong");
    }

    #[tokio::test]
    async fn test_dek_state_per_client() {
        let content_kp =
            e2ee_core::derive_content_keypair(&e2ee_core::generate_master_secret()).unwrap();
        let dek_state: DekState = Arc::new(Mutex::new(HashMap::new()));
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        let ctx = BridgeContext {
            client: reqwest::Client::new(),
            local_base: "http://127.0.0.1:0".to_string(),
            content_sk: content_kp.secret_key,
            content_pk: content_kp.public_key,
            tx,
            ws_connections: Arc::new(Mutex::new(HashMap::new())),
            dek_state: dek_state.clone(),
        };

        // Client A exchanges DEK
        let dek_a = e2ee_core::generate_dek();
        let wrapped_a = e2ee_core::wrap_dek(&dek_a, &content_kp.public_key).unwrap();
        let payload_a = serde_json::json!({
            "type": "dek_exchange",
            "wrapped_dek": BASE64.encode(&wrapped_a)
        });
        handle_forward(&ctx, "client-a", payload_a).await.unwrap();

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["payload"]["type"], "dek_ok");
        assert_eq!(parsed["client_id"], "client-a");

        // Client B exchanges a different DEK
        let dek_b = e2ee_core::generate_dek();
        let wrapped_b = e2ee_core::wrap_dek(&dek_b, &content_kp.public_key).unwrap();
        let payload_b = serde_json::json!({
            "type": "dek_exchange",
            "wrapped_dek": BASE64.encode(&wrapped_b)
        });
        handle_forward(&ctx, "client-b", payload_b).await.unwrap();

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["payload"]["type"], "dek_ok");
        assert_eq!(parsed["client_id"], "client-b");

        // Both DEKs should be stored independently
        let deks = dek_state.lock().await;
        assert_eq!(deks.len(), 2);
        assert_eq!(deks.get("client-a").unwrap(), &dek_a);
        assert_eq!(deks.get("client-b").unwrap(), &dek_b);
    }

    #[test]
    fn test_encrypted_payload_detection() {
        let encrypted = serde_json::json!({ "t": "encrypted", "c": "abc123" });
        assert!(e2ee_core::is_encrypted_payload(&encrypted));

        let bridge_request = serde_json::json!({
            "type": "ping",
            "id": 1
        });
        assert!(!e2ee_core::is_encrypted_payload(&bridge_request));
    }

    #[tokio::test]
    async fn test_no_dek_returns_error() {
        let content_kp =
            e2ee_core::derive_content_keypair(&e2ee_core::generate_master_secret()).unwrap();
        let (tx, _rx) = mpsc::unbounded_channel::<String>();

        let ctx = BridgeContext {
            client: reqwest::Client::new(),
            local_base: "http://127.0.0.1:0".to_string(),
            content_sk: content_kp.secret_key,
            content_pk: content_kp.public_key,
            tx,
            ws_connections: Arc::new(Mutex::new(HashMap::new())),
            dek_state: Arc::new(Mutex::new(HashMap::new())),
        };

        // Send an encrypted payload without having exchanged a DEK
        let dek = e2ee_core::generate_dek();
        let payload = e2ee_core::encrypt_json(
            &e2ee_core::BridgeRequest::Ping { id: 1 },
            &dek,
        )
        .unwrap();
        let payload_value = serde_json::to_value(payload).unwrap();

        let result = handle_forward(&ctx, "unknown-client", payload_value).await;
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("no DEK established")
        );
    }

    #[tokio::test]
    async fn test_cross_client_dek_isolation() {
        let content_kp =
            e2ee_core::derive_content_keypair(&e2ee_core::generate_master_secret()).unwrap();
        let dek_state: DekState = Arc::new(Mutex::new(HashMap::new()));
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        let ctx = BridgeContext {
            client: reqwest::Client::new(),
            local_base: "http://127.0.0.1:0".to_string(),
            content_sk: content_kp.secret_key,
            content_pk: content_kp.public_key,
            tx,
            ws_connections: Arc::new(Mutex::new(HashMap::new())),
            dek_state: dek_state.clone(),
        };

        // Client A exchanges DEK
        let dek_a = e2ee_core::generate_dek();
        let wrapped_a = e2ee_core::wrap_dek(&dek_a, &content_kp.public_key).unwrap();
        handle_forward(
            &ctx,
            "client-a",
            serde_json::json!({
                "type": "dek_exchange",
                "wrapped_dek": BASE64.encode(&wrapped_a)
            }),
        )
        .await
        .unwrap();
        let _ = rx.try_recv(); // consume dek_ok

        // Client B exchanges DEK
        let dek_b = e2ee_core::generate_dek();
        let wrapped_b = e2ee_core::wrap_dek(&dek_b, &content_kp.public_key).unwrap();
        handle_forward(
            &ctx,
            "client-b",
            serde_json::json!({
                "type": "dek_exchange",
                "wrapped_dek": BASE64.encode(&wrapped_b)
            }),
        )
        .await
        .unwrap();
        let _ = rx.try_recv(); // consume dek_ok

        // Request encrypted with client A's DEK should fail for client B
        let payload_a = e2ee_core::encrypt_json(
            &e2ee_core::BridgeRequest::Ping { id: 1 },
            &dek_a,
        )
        .unwrap();
        let payload_value = serde_json::to_value(payload_a).unwrap();

        let result = handle_forward(&ctx, "client-b", payload_value).await;
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Failed to decrypt")
        );
    }

    #[tokio::test]
    async fn test_dek_cleanup_on_disconnect() {
        let dek_state: DekState = Arc::new(Mutex::new(HashMap::new()));

        // Simulate two clients having DEKs
        {
            let mut deks = dek_state.lock().await;
            deks.insert("client-a".to_string(), [1u8; 32]);
            deks.insert("client-b".to_string(), [2u8; 32]);
        }

        // Simulate client-a disconnect: remove its DEK
        dek_state.lock().await.remove("client-a");

        let deks = dek_state.lock().await;
        assert!(deks.get("client-a").is_none());
        assert!(deks.get("client-b").is_some());
        assert_eq!(deks.len(), 1);
    }
}
