# Network Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce bandwidth consumption and improve WebSocket stability under a 3 Mbps e2ee gateway constraint.

**Architecture:** Phase 1 applies HTTP compression, PTY output batching, JSON Patch batching, and fixes the gateway double-Base64 encoding bug. Phase 2 adds backpressure to the e2ee bridge channel and enables WebSocket permessage-deflate compression.

**Tech Stack:** Rust/Axum (tower-http), tokio, tungstenite, TypeScript/React

**Spec:** `docs/compose/specs/2026-06-06-network-optimize-design.md`

---

## Phase 1

---

### Task 1: HTTP Response Compression

**Covers:** [S3]

**Files:**
- Modify: `Cargo.toml` (workspace) — add `compression-full` feature to tower-http
- Modify: `crates/server/src/routes/mod.rs` — add `CompressionLayer`

- [ ] **Step 1: Add compression feature to tower-http in workspace Cargo.toml**

In `/Cargo.toml`, find the `tower-http` line and add `compression-full`:

```toml
tower-http = { version = "0.5", features = ["cors", "request-id", "trace", "fs", "validate-request", "compression-full"] }
```

- [ ] **Step 2: Add CompressionLayer to the axum router**

In `crates/server/src/routes/mod.rs`, add the import and layer:

```rust
use tower_http::{compression::CompressionLayer, validate_request::ValidateRequestHeaderLayer};
```

Then in the `router` function, add `.layer(CompressionLayer::new())` after the `ValidateRequestHeaderLayer`:

```rust
pub fn router(
    deployment: DeploymentImpl,
    bridge_manager: Arc<BridgeManager>,
) -> IntoMakeService<Router> {
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(config_transfer::router())
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(oauth::router())
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(search::router(&deployment))
        .merge(migration::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .nest("/images", images::routes())
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(CompressionLayer::new())
        .layer(Extension(bridge_manager))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", base_routes)
        .into_make_service()
}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
pnpm run backend:check
```

Expected: no errors.

- [ ] **Step 4: Verify compression works**

Start dev server (`pnpm run dev`), then in a browser DevTools Network tab, open the app, check any `/api/tasks` or `/api/projects` response. It should show `Content-Encoding: gzip` or `br` in the response headers.

- [ ] **Step 5: Commit**

```bash
git add Cargo.toml crates/server/src/routes/mod.rs
git commit -m "feat: add HTTP response compression (gzip/brotli) via CompressionLayer"
```

---

### Task 2: Fix Gateway Double Base64

**Covers:** [S6]

**Background:**
The current flow for a WS message from server → browser is:
1. Server sends `Message::Text(json_string)` on local WS
2. `e2ee_bridge.rs:455` does `BASE64.encode(text.as_bytes())` → this is the **redundant encode**
3. Encrypted `BridgeResponse::WsData { data: base64_of_text }` sent to gateway → browser
4. `connection.ts:543` does `decodeURIComponent(escape(atob(raw)))` → decodes once

And for browser → server:
1. `remoteWs.ts:78` does `btoa(unescape(encodeURIComponent(data)))` → Base64 encodes the text
2. Encrypted `BridgeRequest::WsData { data: base64_of_text }` sent to gateway → bridge
3. `e2ee_bridge.rs:506` does `BASE64.decode(&data)` then `String::from_utf8` → decodes once

The fix: **remove the redundant `BASE64.encode` in the bridge**. Instead, send `text.to_string()` directly as `data`. The frontend already calls `atob(raw)` which would then receive the original JSON string directly — but we need to ensure the decode path on the frontend also changes to match (it must stop calling `atob` for incoming text data, or we send it still Base64-encoded and remove the frontend's `atob`).

**Chosen approach:** Remove `BASE64.encode` in `e2ee_bridge.rs` (server sends raw text as `data`), and remove the `atob` decode in `connection.ts:543` (frontend receives raw text directly). Both sides simplify symmetrically.

**Files:**
- Modify: `crates/server/src/e2ee_bridge.rs:449-458` — remove `BASE64.encode` for Text messages
- Modify: `frontend/src/lib/e2ee/connection.ts:543` — remove `atob` decode for `ws_data`
- Modify: `frontend/src/lib/e2ee/remoteWs.ts:78` — remove `btoa` encode for string sends (browser → server direction)
- Modify: `crates/server/src/e2ee_bridge.rs:506-507` — remove `BASE64.decode` for incoming WsData

- [ ] **Step 1: Fix server-side — Text WS messages no longer Base64-encoded before sending to browser**

In `crates/server/src/e2ee_bridge.rs`, find lines 449-458:

```rust
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
```

Replace with (send text directly, no Base64):

```rust
Ok(Message::Text(text)) => {
    let _ = send_encrypted_response(
        &tx_recv,
        &owner_client_id,
        e2ee_core::BridgeResponse::WsData {
            id,
            data: text.to_string(),
        },
        &owner_dek,
    );
}
```

- [ ] **Step 2: Fix server-side — incoming WsData no longer Base64-decoded**

In `crates/server/src/e2ee_bridge.rs`, find lines 505-507:

```rust
e2ee_core::BridgeRequest::WsData { id, data } => {
    let decoded = BASE64.decode(&data).context("Invalid base64 in WsData")?;
    let text = String::from_utf8(decoded).context("Invalid UTF-8 in WsData")?;
```

Replace with:

```rust
e2ee_core::BridgeRequest::WsData { id, data } => {
    let text = data;
```

(No longer need to decode Base64 since the frontend will send raw text.)

- [ ] **Step 3: Fix frontend — outgoing WsData no longer Base64-encoded (remoteWs.ts:78)**

In `frontend/src/lib/e2ee/remoteWs.ts`, find the `send` method lines 71-87:

```typescript
send(data: string | ArrayBuffer | Blob): void {
  if (this.readyState !== RemoteWs.OPEN) {
    throw new DOMException('WebSocket is not open', 'InvalidStateError');
  }
  // Convert to base64 string for the bridge protocol
  let str: string;
  if (typeof data === 'string') {
    str = btoa(unescape(encodeURIComponent(data)));
  } else if (data instanceof ArrayBuffer) {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  } else {
    // Blob — not commonly used in our codebase, ignore for now
    console.warn('RemoteWs: Blob send not supported');
    return;
  }
  this.sendData(this.id, str);
}
```

Replace with (send string directly, convert ArrayBuffer to Base64 only for binary):

```typescript
send(data: string | ArrayBuffer | Blob): void {
  if (this.readyState !== RemoteWs.OPEN) {
    throw new DOMException('WebSocket is not open', 'InvalidStateError');
  }
  let str: string;
  if (typeof data === 'string') {
    str = data;
  } else if (data instanceof ArrayBuffer) {
    str = btoa(String.fromCharCode(...new Uint8Array(data)));
  } else {
    console.warn('RemoteWs: Blob send not supported');
    return;
  }
  this.sendData(this.id, str);
}
```

- [ ] **Step 4: Fix frontend — incoming ws_data no longer Base64-decoded (connection.ts:543)**

In `frontend/src/lib/e2ee/connection.ts`, find line 543:

```typescript
const decoded = decodeURIComponent(escape(atob(raw)));
stream._onData(decoded);
```

Replace with:

```typescript
stream._onData(raw);
```

- [ ] **Step 5: Compile check**

```bash
pnpm run backend:check
pnpm run check
```

Expected: no errors.

- [ ] **Step 6: Test manually**

Start dev server. Open a task with an active AI execution in e2ee remote mode. Verify:
- Terminal works (keystrokes and output display correctly)
- Log streams render (no JSON parse errors in console)
- WebSocket connections stay alive

- [ ] **Step 7: Commit**

```bash
git add crates/server/src/e2ee_bridge.rs frontend/src/lib/e2ee/remoteWs.ts frontend/src/lib/e2ee/connection.ts
git commit -m "fix: remove double Base64 encoding in e2ee gateway WS data path"
```

---

### Task 3: PTY Output Batching (16 ms window)

**Covers:** [S4]

**Background:** Currently every PTY output chunk (often a few bytes from a key echo or a small terminal update) is immediately JSON-serialized and sent as a WebSocket frame. During active AI execution this creates hundreds of tiny frames per second, each carrying the JSON envelope overhead and triggering a separate gateway encrypt+forward cycle.

The fix: buffer PTY output for up to 16 ms (one display frame), then send all accumulated bytes as a single `{"type":"output","data":"<base64>"}` message. If the buffer reaches 8 KB before 16 ms, flush immediately.

**Files:**
- Modify: `crates/server/src/routes/terminal.rs` — replace the per-chunk send loop with a batching loop

- [ ] **Step 1: Add a helper function `send_batched_output` in terminal.rs**

In `crates/server/src/routes/terminal.rs`, add this helper above the `output_task` spawn (around line 317):

```rust
use std::time::Duration;
use tokio::time::{Instant, sleep_until};

const PTY_BATCH_WINDOW_MS: u64 = 16;
const PTY_BATCH_MAX_BYTES: usize = 8 * 1024;
```

Then replace the entire `output_task` `tokio::spawn` block (lines 317-374) with the following batching implementation:

```rust
let output_task = tokio::spawn(async move {
    let mut buf: Vec<u8> = Vec::with_capacity(PTY_BATCH_MAX_BYTES);
    let mut flush_deadline: Option<Instant> = None;

    macro_rules! flush_buf {
        ($ws:expr) => {
            if !buf.is_empty() {
                let msg = TerminalMessage::Output {
                    data: BASE64.encode(&buf),
                };
                buf.clear();
                flush_deadline = None;
                if let Ok(json) = serde_json::to_string(&msg) {
                    if $ws.send(Message::Text(json.into())).await.is_err() {
                        return ws_sender;
                    }
                }
            }
        };
    }

    if already_exited {
        while let Ok(data) = output_rx.try_recv() {
            buf.extend_from_slice(&data);
        }
        flush_buf!(ws_sender);
    } else {
        loop {
            let deadline = flush_deadline.unwrap_or_else(|| Instant::now() + Duration::from_millis(PTY_BATCH_WINDOW_MS * 10));
            tokio::select! {
                data = output_rx.recv() => {
                    match data {
                        Ok(data) => {
                            if flush_deadline.is_none() {
                                flush_deadline = Some(Instant::now() + Duration::from_millis(PTY_BATCH_WINDOW_MS));
                            }
                            buf.extend_from_slice(&data);
                            if buf.len() >= PTY_BATCH_MAX_BYTES {
                                flush_buf!(ws_sender);
                            }
                        }
                        Err(_) => {
                            flush_buf!(ws_sender);
                            break;
                        }
                    }
                }
                _ = sleep_until(deadline), if flush_deadline.is_some() => {
                    flush_buf!(ws_sender);
                }
                _ = exit_rx_for_ws.changed() => {
                    while let Ok(data) = output_rx.try_recv() {
                        buf.extend_from_slice(&data);
                    }
                    flush_buf!(ws_sender);
                    break;
                }
            }
        }
    }

    let exit_msg = TerminalMessage::Exit {};
    if let Ok(json) = serde_json::to_string(&exit_msg) {
        let _ = ws_sender.send(Message::Text(json.into())).await;
    }
    ws_sender
});
```

- [ ] **Step 2: Build check**

```bash
pnpm run backend:check
```

Expected: no errors.

- [ ] **Step 3: Manual test**

Start dev server. Open a terminal in the UI. Type quickly and run a command that produces lots of output (e.g., `find / -name "*.rs" 2>/dev/null`). Verify:
- Output still displays correctly (no garbled text)
- Output appears within ~16 ms (imperceptible delay)
- In server logs or WS inspector, fewer frames per second than before

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/terminal.rs
git commit -m "perf: batch PTY output into 16ms windows to reduce WS frame count"
```

---

### Task 4: JSON Patch Batching (10 ms window)

**Covers:** [S5]

**Background:** During rapid task state transitions (e.g., an AI execution cycling through multiple states), the `MsgStore` broadcasts a new full-Task JSON Patch for every state change. The frontend already has `dedupeOps` in `streamJsonPatchEntries.ts`, but deduplication happens after receiving the messages — all the messages still traverse the 3 Mbps gateway link.

The fix: add a `PatchBatcher` at the `MsgStore.push` call site in `EventService`, accumulating patches for 10 ms and merging by path before broadcasting.

**Files:**
- Create: `crates/services/src/services/events/patch_batcher.rs`
- Modify: `crates/services/src/services/events/mod.rs` — wire in PatchBatcher
- Modify: `crates/services/src/services/events/patches.rs` — push through batcher instead of directly to msg_store

- [ ] **Step 1: Create patch_batcher.rs**

Create `crates/services/src/services/events/patch_batcher.rs`:

```rust
use std::{collections::HashMap, time::Duration};

use json_patch::{Patch, PatchOperation};
use tokio::{sync::mpsc, time::sleep};
use utils::{log_msg::LogMsg, msg_store::MsgStore};

const BATCH_WINDOW_MS: u64 = 10;

#[derive(Clone)]
pub struct PatchBatcher {
    tx: mpsc::UnboundedSender<Patch>,
}

impl PatchBatcher {
    pub fn new(msg_store: MsgStore) -> Self {
        let (tx, mut rx) = mpsc::unbounded_channel::<Patch>();

        tokio::spawn(async move {
            loop {
                // Wait for first patch
                let first = match rx.recv().await {
                    Some(p) => p,
                    None => break,
                };

                let mut ops: Vec<PatchOperation> = first.0;
                let deadline = sleep(Duration::from_millis(BATCH_WINDOW_MS));
                tokio::pin!(deadline);

                // Drain all patches that arrive within the window
                loop {
                    tokio::select! {
                        _ = &mut deadline => break,
                        patch = rx.recv() => {
                            match patch {
                                Some(p) => ops.extend(p.0),
                                None => {
                                    // Channel closed — flush what we have and exit
                                    let merged = dedupe_ops(ops);
                                    if !merged.is_empty() {
                                        msg_store.push(LogMsg::JsonPatch(Patch(merged)));
                                    }
                                    return;
                                }
                            }
                        }
                    }
                }

                let merged = dedupe_ops(ops);
                if !merged.is_empty() {
                    msg_store.push(LogMsg::JsonPatch(Patch(merged)));
                }
            }
        });

        PatchBatcher { tx }
    }

    pub fn push_patch(&self, patch: Patch) {
        let _ = self.tx.send(patch);
    }
}

/// Keep only the last operation for each path, preserving order of first occurrence.
fn dedupe_ops(ops: Vec<PatchOperation>) -> Vec<PatchOperation> {
    let mut last_index: HashMap<String, usize> = HashMap::new();
    for (i, op) in ops.iter().enumerate() {
        last_index.insert(op.path().to_string(), i);
    }
    let mut kept: Vec<(usize, PatchOperation)> = ops
        .into_iter()
        .enumerate()
        .filter(|(i, op)| last_index.get(op.path()) == Some(i))
        .collect();
    kept.sort_by_key(|(i, _)| *i);
    kept.into_iter().map(|(_, op)| op).collect()
}
```

- [ ] **Step 2: Expose PatchBatcher from the events module**

In `crates/services/src/services/events/mod.rs`, add:

```rust
pub mod patch_batcher;
pub use patch_batcher::PatchBatcher;
```

Also add a `patch_batcher` field to `EventService`:

Find the `EventService` struct definition and add:

```rust
pub struct EventService {
    pub db: Arc<Database>,
    pub msg_store: MsgStore,
    pub patch_batcher: PatchBatcher,
}
```

And in `EventService::new` (or wherever it is constructed), initialize:

```rust
let patch_batcher = PatchBatcher::new(msg_store.clone());
EventService { db, msg_store, patch_batcher }
```

- [ ] **Step 3: Route patch broadcasts through PatchBatcher**

In `crates/services/src/services/events/patches.rs`, find all places that call `self.msg_store.push(LogMsg::JsonPatch(...))` and replace them with `self.patch_batcher.push_patch(patch)`.

Search for the pattern:
```bash
grep -n "msg_store.push" crates/services/src/services/events/patches.rs
```

For each occurrence like:
```rust
self.msg_store.push(LogMsg::JsonPatch(patch));
```

Replace with:
```rust
self.patch_batcher.push_patch(patch);
```

Note: `LogMsg::Stdout`, `LogMsg::Stderr`, `LogMsg::Finished`, `LogMsg::Ready` must still go directly to `msg_store.push` — only `JsonPatch` variants go through the batcher.

- [ ] **Step 4: Build check**

```bash
pnpm run backend:check
```

Fix any compile errors (likely: `PatchOperation` doesn't implement some trait, or the `path()` method name differs — check `json_patch` crate docs for the correct method to get a patch op's path string).

To check the correct method:
```bash
grep -rn "fn path\|\.path()" crates/ | grep -v target | head -20
```

- [ ] **Step 5: Test**

Start dev server. Trigger a rapid state transition (start and immediately stop an AI execution). In browser DevTools WebSocket inspector, verify:
- Fewer `JsonPatch` messages arrive per second than before
- The UI still updates correctly (task status, workspace state reflect changes)

- [ ] **Step 6: Commit**

```bash
git add crates/services/src/services/events/patch_batcher.rs crates/services/src/services/events/mod.rs crates/services/src/services/events/patches.rs
git commit -m "perf: batch JSON Patch broadcasts in 10ms windows to reduce gateway traffic"
```

---

## Phase 2

---

### Task 5: Bounded Channel + Backpressure in e2ee Bridge

**Covers:** [S7]

**Background:** `e2ee_bridge.rs:434` uses `mpsc::unbounded_channel::<String>()` to forward data from the gateway into each local WS sub-connection. If the local WS is slow (e.g., local backend under load), the channel buffers unlimited messages in memory. Under a 3 Mbps gateway, this can happen when bursts arrive faster than the backend processes them.

Fix: switch to `mpsc::channel::<String>(256)`. On send failure (channel full), log a warning — the gateway connection itself handles retries via WebSocket flow control.

**Files:**
- Modify: `crates/server/src/e2ee_bridge.rs:434`

- [ ] **Step 1: Replace unbounded_channel with bounded channel**

In `crates/server/src/e2ee_bridge.rs`, find line 434:

```rust
let (sub_tx, mut sub_rx) = mpsc::unbounded_channel::<String>();
```

Replace with:

```rust
let (sub_tx, mut sub_rx) = mpsc::channel::<String>(256);
```

- [ ] **Step 2: Fix the send call on line 510**

`unbounded_channel`'s `send` returns `Result<(), SendError>` synchronously. `channel`'s `send` is async and also returns `Result`. Find line 510:

```rust
let _ = sub_tx.send(text);
```

Replace with:

```rust
if sub_tx.try_send(text).is_err() {
    warn!("e2ee bridge: WS sub-connection channel full (id={id}), dropping frame");
}
```

(`try_send` is non-blocking and returns `Err` if full — appropriate here since we're in an async context and don't want to block the bridge loop.)

- [ ] **Step 3: Update the HashMap type for sub_tx**

The `ws_connections` map stores `sub_tx`. Its type will change from `mpsc::UnboundedSender<String>` to `mpsc::Sender<String>`. Find the type annotation (likely near the top of `handle_forward` or in the `BridgeContext` struct) and update it:

```rust
// Before:
ws_connections: Arc<Mutex<HashMap<u32, mpsc::UnboundedSender<String>>>>
// After:
ws_connections: Arc<Mutex<HashMap<u32, mpsc::Sender<String>>>>
```

- [ ] **Step 4: Build check**

```bash
pnpm run backend:check
```

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/e2ee_bridge.rs
git commit -m "fix: replace unbounded WS channel with bounded (256) for backpressure in e2ee bridge"
```

---

### Task 6: WebSocket permessage-deflate Compression

**Covers:** [S8]

**Background:** The e2ee bridge forwards WS frames as opaque text blobs (it reads `Message::Text(text)` and sends the text string as `data` in an encrypted JSON envelope). This means if we enable per-message deflate on the local axum WebSocket connections, the compressed bytes are what the bridge reads — and those compressed bytes (Base64-free, raw text after Task 2) flow through the gateway.

However, `tokio-tungstenite` (which the bridge uses to connect to local WS) and `axum`'s WebSocket upgrade must both negotiate deflate. Check if the axum WS upgrade accepts `permessage-deflate` and if `tokio-tungstenite` in the bridge requests it.

**Files:**
- Modify: `crates/server/src/routes/mod.rs` or individual WS handlers — configure deflate on axum WS upgrade

Note: This task requires verifying axum/tungstenite version support for permessage-deflate before implementation. If not available in current versions, document the finding and skip.

- [ ] **Step 1: Check axum and tungstenite versions and deflate support**

```bash
grep -r "axum\|tungstenite" Cargo.toml crates/server/Cargo.toml | grep -v target
cargo tree -p axum | grep tungstenite
```

Check if `axum` WS upgrade exposes a `with_extension` for permessage-deflate, or if `tungstenite` supports it via `WebSocketConfig`.

- [ ] **Step 2: If supported — enable deflate on local WS connections in the bridge**

In `crates/server/src/e2ee_bridge.rs`, where `connect_async(&ws_url)` is called (line 429), use `connect_async_with_config` with `WebSocketConfig { compression: Some(DeflateConfig::default()), ..Default::default() }`:

```rust
use tokio_tungstenite::tungstenite::protocol::{WebSocketConfig, WebSocketRole};
use tokio_tungstenite::tungstenite::extensions::deflate::DeflateConfig;

let config = WebSocketConfig {
    compression: Some(DeflateConfig::default()),
    ..Default::default()
};
match connect_async_with_config(&ws_url, Some(config), false).await {
```

- [ ] **Step 3: If not supported — document the finding**

If the current axum/tungstenite versions don't expose permessage-deflate config, add a comment to the bridge near the `connect_async` call:

```rust
// TODO: Enable permessage-deflate here once tokio-tungstenite exposes WebSocketConfig
// compression settings. Track upstream: https://github.com/snapview/tungstenite-rs
```

And commit the comment as a placeholder.

- [ ] **Step 4: Build check**

```bash
pnpm run backend:check
```

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/e2ee_bridge.rs
git commit -m "perf: enable permessage-deflate on e2ee bridge WS connections (or document blocker)"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `pnpm run backend:check` passes
- [ ] `pnpm run check` passes
- [ ] `cargo test --workspace` passes
- [ ] In browser DevTools, REST responses show `Content-Encoding: gzip`
- [ ] In browser DevTools WS inspector: terminal frames are batched (fewer, larger frames)
- [ ] In browser DevTools WS inspector: JSON Patch message rate drops during AI execution
- [ ] e2ee remote mode: terminal works, log streams render, no console errors
- [ ] WS connections stay stable (no spurious disconnects in normal operation)
