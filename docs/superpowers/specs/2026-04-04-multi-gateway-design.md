# Multi E2E Gateway Support

## Problem

A vibe-board server can only connect to **one** E2E Gateway at a time. The `credentials.json` file stores a single gateway credential, `BridgeManager` manages a single bridge connection, and `vibe-board login --gateway <url>` overwrites any existing credential.

Users need to connect a single vibe-board server to multiple E2E Gateways simultaneously, so that different users on different gateways can all access the same vibe-board instance concurrently without data conflicts.

## Requirements

- One vibe-board server connects to N gateways simultaneously.
- Each gateway has its own independent user account, master_secret, session, and keys.
- All gateway users access the same vibe-board database (same boards, tasks, processes).
- Each bridge connection has independent reconnection/backoff logic.
- One gateway going down does not affect others.
- Backward-compatible with existing single-gateway `credentials.json`.

## Design

### 1. Credentials Data Model

**File**: `crates/server/src/e2ee_config.rs`

Change `credentials.json` from a single object to a wrapper with an array:

```rust
/// Single gateway credential (renamed from Credentials)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayCredential {
    pub gateway_url: String,
    pub master_secret: String,
    pub session_token: String,
    pub user_id: String,
}

/// Top-level credentials file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialsFile {
    pub gateways: Vec<GatewayCredential>,
}
```

File format:

```json
{
  "gateways": [
    {
      "gateway_url": "https://gw1.example.com",
      "master_secret": "abc...",
      "session_token": "tok1...",
      "user_id": "user-on-gw1"
    },
    {
      "gateway_url": "https://gw2.example.com",
      "master_secret": "def...",
      "session_token": "tok2...",
      "user_id": "user-on-gw2"
    }
  ]
}
```

**Key rules:**
- `gateway_url` is the unique key — no duplicate URLs.
- Each gateway gets its own `master_secret` (different accounts = different keypairs).
- Re-login to an existing gateway URL updates that entry in-place.

**API changes in `e2ee_config.rs`:**
- `load_credentials() -> Result<CredentialsFile>` — replaces the old single-credential loader.
- `save_credentials(file: &CredentialsFile)` — writes the full file.
- `add_or_update_gateway(cred: &GatewayCredential)` — loads file, upserts by `gateway_url`, saves.
- `remove_gateway(gateway_url: &str)` — loads file, removes matching entry, saves.
- `delete_credentials()` — unchanged, deletes entire file.

**Backward-compatible migration:**

On load, if parsing as `CredentialsFile` fails, try parsing as a single `GatewayCredential` (old format). If that succeeds, wrap it as `CredentialsFile { gateways: vec![old_cred] }` and overwrite the file with the new format. One-time, automatic, lossless.

### 2. BridgeManager Multi-Connection Management

**File**: `crates/server/src/e2ee_manager.rs`

Replace single `(cancel_tx, handle)` with a HashMap keyed by `gateway_url`:

```rust
struct BridgeInstance {
    cancel_tx: oneshot::Sender<()>,
    handle: JoinHandle<()>,
}

pub struct BridgeManager {
    bridges: Mutex<HashMap<String, BridgeInstance>>,
    local_port: u16,
}
```

**API:**

| Method | Behavior |
|--------|----------|
| `start_gateway(cred: &GatewayCredential)` | Start or restart the bridge for a specific gateway. If one is already running for this URL, stop it first, then spawn a new `run_bridge()` task. |
| `stop_gateway(gateway_url: &str)` | Stop the bridge for a specific gateway. Send cancel signal, wait with timeout. |
| `stop_all()` | Stop all running bridges. |
| `status() -> Vec<GatewayStatus>` | Return `(gateway_url, is_running)` for each bridge. |

Each `start_gateway()` spawns an independent `run_bridge()` tokio task with its own:
- `cancel_rx` for shutdown signaling
- Exponential backoff state (attempt counter)
- `DekState` and `WsConnections` (already per-connection in existing code)
- `BridgeCryptoService` derived from that gateway's `master_secret`

### 3. Credentials File Watcher

**File**: `crates/server/src/e2ee_manager.rs`

On file change, perform a diff against currently running bridges:

```
load CredentialsFile → extract gateway_url set
compare with active bridges HashMap keys:

  new URLs (in file, not in bridges)        → start_gateway(cred)
  removed URLs (in bridges, not in file)    → stop_gateway(url)
  existing URLs with changed content        → stop_gateway(url) + start_gateway(cred)
  existing URLs with same content           → no-op
```

"Changed content" = any of `(master_secret, session_token, user_id)` differs.

File deleted or unparseable → `stop_all()` (same as current behavior).

To support the diff, `BridgeManager` stores a snapshot `last_credentials: Mutex<HashMap<String, u64>>` mapping `gateway_url → hash of (master_secret, session_token, user_id)`. Updated on each successful reload. Uses `DefaultHasher` for the content hash (not cryptographic — just for change detection).

### 4. REST API Routes

**File**: `crates/server/src/routes/e2ee.rs`

**New routes:**

| Route | Method | Behavior |
|-------|--------|----------|
| `/e2ee/gateways` | `PUT` | Add or update a gateway credential. Body: `GatewayCredential` fields. Upserts into `credentials.json`, starts/restarts that bridge. |
| `/e2ee/gateways` | `DELETE` | Remove a gateway. Query param `url` (URL-encoded). Stops bridge, removes from file. |
| `/e2ee/status` | `GET` | Returns all gateway statuses (see below). |

**Backward-compatible aliases:**
- `PUT /e2ee/credentials` → same as `PUT /e2ee/gateways`
- `DELETE /e2ee/credentials` → removes all gateways (calls `stop_all()` + `delete_credentials()`)

**`GET /e2ee/status` response:**

```json
{
  "gateways": [
    {
      "gateway_url": "https://gw1.example.com",
      "user_id": "user-on-gw1",
      "bridge_running": true
    },
    {
      "gateway_url": "https://gw2.example.com",
      "user_id": "user-on-gw2",
      "bridge_running": false
    }
  ]
}
```

### 5. CLI Changes

- `vibe-board login --gateway <url>` — existing flow (authenticate, generate master_secret, get session token), but **appends** to the gateways array instead of overwriting. If the URL already exists, updates that entry.
- `vibe-board logout --gateway <url>` — new command, removes the specified gateway from `credentials.json`.
- `vibe-board logout --all` — removes all gateways (deletes the file).
- `vibe-board status` — displays all connected gateways and their bridge status.

### 6. What Does NOT Change

- **`e2ee_bridge.rs`** — `run_bridge()` and `connect_and_run()` are untouched. Already self-contained per invocation.
- **`e2ee_crypto.rs`** — Key derivation logic unchanged.
- **`e2ee-gateway` crate** — Gateway server is unaware of multi-gateway on the daemon side.
- **`e2ee-core` crate** — Encryption primitives unchanged.
- **Frontend `lib/e2ee/`** — Browser connects to one gateway at a time; no change needed.
- **`machine_id` generation** — Same machine registers with the same ID on all gateways (correct; each gateway's registry is independent).
- **Database** — All gateway users share the same vibe-board SQLite database (intended behavior).

## Files Changed

| File | Change |
|------|--------|
| `crates/server/src/e2ee_config.rs` | New data model, load/save/migrate, add/remove helpers |
| `crates/server/src/e2ee_manager.rs` | Multi-bridge HashMap, start/stop per gateway, watcher diff logic |
| `crates/server/src/routes/e2ee.rs` | New gateway routes, updated status response |
| `crates/server/src/main.rs` | Iterate all credentials on startup |
| CLI login/logout commands | Append behavior, new logout command |
