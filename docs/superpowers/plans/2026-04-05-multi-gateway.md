# Multi E2E Gateway Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a single vibe-board server to connect to multiple E2E Gateways simultaneously, each with independent credentials, bridge connections, and reconnection logic.

**Architecture:** Upgrade `credentials.json` from a single object to a `{ gateways: [...] }` array. `BridgeManager` manages a `HashMap<String, BridgeInstance>` keyed by `gateway_url`, where each entry is an independent `run_bridge()` tokio task. The file watcher diffs the new credentials file against running bridges to start/stop/restart as needed. REST API and CLI commands are updated to support multi-gateway CRUD.

**Tech Stack:** Rust, Axum, tokio, serde_json, notify-debouncer-full

**Spec:** `docs/superpowers/specs/2026-04-04-multi-gateway-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `crates/server/src/e2ee_config.rs` | Credentials data model, load/save/migrate, add/remove helpers | Modify |
| `crates/server/src/e2ee_manager.rs` | Multi-bridge lifecycle, diff-based watcher | Modify |
| `crates/server/src/routes/e2ee.rs` | REST API routes for multi-gateway CRUD | Modify |
| `crates/server/src/main.rs` | Startup logic (iterate all gateways), CLI login/logout/status | Modify |
| `crates/server/src/e2ee_bridge.rs` | Bridge connection loop | **No change** — uses `Credentials` which becomes `GatewayCredential` (type alias) |

---

### Task 1: Upgrade Credentials Data Model (`e2ee_config.rs`)

**Files:**
- Modify: `crates/server/src/e2ee_config.rs`

- [ ] **Step 1: Write tests for the new data model**

Add a `#[cfg(test)]` module at the bottom of `e2ee_config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_credential(url: &str) -> GatewayCredential {
        GatewayCredential {
            gateway_url: url.to_string(),
            master_secret: "secret".to_string(),
            session_token: "token".to_string(),
            user_id: "user".to_string(),
        }
    }

    #[test]
    fn test_load_new_format() {
        let mut f = NamedTempFile::new().unwrap();
        let creds_file = CredentialsFile {
            gateways: vec![make_credential("https://gw1.example.com")],
        };
        write!(f, "{}", serde_json::to_string_pretty(&creds_file).unwrap()).unwrap();

        let loaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(loaded.gateways.len(), 1);
        assert_eq!(loaded.gateways[0].gateway_url, "https://gw1.example.com");
    }

    #[test]
    fn test_load_old_format_migrates() {
        let mut f = NamedTempFile::new().unwrap();
        let old = GatewayCredential {
            gateway_url: "https://old.example.com".to_string(),
            master_secret: "s".to_string(),
            session_token: "t".to_string(),
            user_id: "u".to_string(),
        };
        write!(f, "{}", serde_json::to_string_pretty(&old).unwrap()).unwrap();

        let loaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(loaded.gateways.len(), 1);
        assert_eq!(loaded.gateways[0].gateway_url, "https://old.example.com");

        // File should now be in new format
        let reloaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(reloaded.gateways.len(), 1);
    }

    #[test]
    fn test_credential_content_hash() {
        let c1 = make_credential("https://gw1.example.com");
        let mut c2 = make_credential("https://gw1.example.com");
        assert_eq!(c1.content_hash(), c2.content_hash());

        c2.session_token = "different".to_string();
        assert_ne!(c1.content_hash(), c2.content_hash());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p server --lib e2ee_config::tests -- --nocapture 2>&1 | head -30`

Expected: Compilation errors — `GatewayCredential`, `CredentialsFile`, `load_credentials_from_path`, `content_hash` don't exist yet.

- [ ] **Step 3: Implement the new data model and functions**

Replace the entire contents of `crates/server/src/e2ee_config.rs` with:

```rust
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use utils::assets;

/// Single gateway credential.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GatewayCredential {
    pub gateway_url: String,
    pub master_secret: String,
    pub session_token: String,
    pub user_id: String,
}

impl GatewayCredential {
    /// Hash of the mutable content fields (everything except gateway_url).
    /// Used for change detection in the file watcher — not cryptographic.
    pub fn content_hash(&self) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        self.master_secret.hash(&mut h);
        self.session_token.hash(&mut h);
        self.user_id.hash(&mut h);
        h.finish()
    }
}

/// Backward-compatible type alias so `e2ee_bridge.rs` compiles without changes.
pub type Credentials = GatewayCredential;

/// Top-level credentials file structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialsFile {
    pub gateways: Vec<GatewayCredential>,
}

/// Get the credentials directory path (uses asset_dir which is environment-aware)
pub fn credentials_dir() -> PathBuf {
    assets::asset_dir()
}

/// Get the credentials file path
pub fn credentials_path() -> PathBuf {
    assets::credentials_path()
}

/// Load credentials from the default path, with backward-compatible migration.
pub fn load_credentials() -> Result<CredentialsFile> {
    load_credentials_from_path(&credentials_path())
}

/// Load credentials from an arbitrary path (testable).
/// Tries new format first, falls back to old single-object format and migrates.
pub fn load_credentials_from_path(path: &Path) -> Result<CredentialsFile> {
    let data = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read credentials from {}", path.display()))?;

    // Try new format first
    if let Ok(file) = serde_json::from_str::<CredentialsFile>(&data) {
        return Ok(file);
    }

    // Fall back to old single-object format
    let old: GatewayCredential =
        serde_json::from_str(&data).context("Failed to parse credentials (old or new format)")?;
    let file = CredentialsFile {
        gateways: vec![old],
    };

    // Migrate in-place
    let migrated = serde_json::to_string_pretty(&file)?;
    std::fs::write(path, &migrated)
        .with_context(|| format!("Failed to migrate credentials at {}", path.display()))?;

    Ok(file)
}

/// Save the full credentials file to the default path with restricted permissions.
pub fn save_credentials(file: &CredentialsFile) -> Result<()> {
    save_credentials_to_path(file, &credentials_path())
}

/// Save to an arbitrary path (testable).
pub fn save_credentials_to_path(file: &CredentialsFile, path: &Path) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .with_context(|| format!("Failed to create directory {}", dir.display()))?;
    }

    let data = serde_json::to_string_pretty(file)?;
    std::fs::write(path, &data)
        .with_context(|| format!("Failed to write credentials to {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

/// Add or update a single gateway credential in the file (upsert by gateway_url).
pub fn add_or_update_gateway(cred: &GatewayCredential) -> Result<()> {
    let path = credentials_path();
    let mut file = load_credentials().unwrap_or(CredentialsFile {
        gateways: Vec::new(),
    });

    if let Some(existing) = file
        .gateways
        .iter_mut()
        .find(|g| g.gateway_url == cred.gateway_url)
    {
        *existing = cred.clone();
    } else {
        file.gateways.push(cred.clone());
    }

    save_credentials_to_path(&file, &path)
}

/// Remove a gateway by URL. Returns true if it was found and removed.
pub fn remove_gateway(gateway_url: &str) -> Result<bool> {
    let path = credentials_path();
    let mut file = load_credentials()?;
    let before = file.gateways.len();
    file.gateways.retain(|g| g.gateway_url != gateway_url);
    let removed = file.gateways.len() < before;

    if file.gateways.is_empty() {
        delete_credentials()?;
    } else {
        save_credentials_to_path(&file, &path)?;
    }

    Ok(removed)
}

/// Delete stored credentials (entire file).
pub fn delete_credentials() -> Result<()> {
    let path = credentials_path();
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p server --lib e2ee_config::tests -- --nocapture`

Expected: All 3 tests pass.

- [ ] **Step 5: Verify the rest of the crate still compiles**

Run: `cargo check -p server 2>&1 | head -40`

Expected: Should compile. `e2ee_bridge.rs` imports `Credentials` which is now a type alias for `GatewayCredential`. `routes/e2ee.rs` and `e2ee_manager.rs` import `Credentials` — they'll need updates in later tasks, but type alias keeps them compiling for now.

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/e2ee_config.rs
git commit -m "feat(e2ee): upgrade credentials data model to multi-gateway array

Rename Credentials → GatewayCredential, add CredentialsFile wrapper,
backward-compatible migration from old single-object format, add/remove
helpers, content_hash for change detection."
```

---

### Task 2: Upgrade BridgeManager to Multi-Connection (`e2ee_manager.rs`)

**Files:**
- Modify: `crates/server/src/e2ee_manager.rs`

- [ ] **Step 1: Replace the entire BridgeManager implementation**

Replace the contents of `crates/server/src/e2ee_manager.rs` with:

```rust
use std::{
    collections::HashMap,
    sync::Arc,
    time::Duration,
};

use anyhow::Result;
use notify::RecursiveMode;
use notify_debouncer_full::{DebounceEventResult, new_debouncer};
use tokio::{
    sync::{Mutex, oneshot},
    task::JoinHandle,
};
use tracing::{error, info, warn};

use crate::{
    e2ee_bridge,
    e2ee_config::{self, GatewayCredential, CredentialsFile},
};

/// A single running bridge instance.
struct BridgeInstance {
    cancel_tx: oneshot::Sender<()>,
    handle: JoinHandle<()>,
}

/// Manages the lifecycle of multiple E2EE bridge connections.
pub struct BridgeManager {
    bridges: Mutex<HashMap<String, BridgeInstance>>,
    /// Snapshot of credential content hashes for diff-based watcher reload.
    last_hashes: Mutex<HashMap<String, u64>>,
    local_port: u16,
}

impl BridgeManager {
    pub fn new(local_port: u16) -> Self {
        Self {
            bridges: Mutex::new(HashMap::new()),
            last_hashes: Mutex::new(HashMap::new()),
            local_port,
        }
    }

    /// Start or restart the bridge for a specific gateway.
    /// If one is already running for this URL, stops it first.
    pub async fn start_gateway(self: &Arc<Self>, cred: &GatewayCredential) {
        self.stop_gateway(&cred.gateway_url).await;

        let (cancel_tx, cancel_rx) = oneshot::channel();

        let cred = cred.clone();
        let port = self.local_port;
        let gateway_url = cred.gateway_url.clone();
        let handle = tokio::spawn(async move {
            info!("Starting E2EE bridge to gateway: {}", cred.gateway_url);
            match e2ee_bridge::run_bridge(&cred, port, cancel_rx).await {
                Ok(()) => info!("E2EE bridge shut down for {}", cred.gateway_url),
                Err(e) => error!("E2EE bridge error for {}: {e}", cred.gateway_url),
            }
        });

        self.bridges
            .lock()
            .await
            .insert(gateway_url.clone(), BridgeInstance { cancel_tx, handle });
        self.last_hashes
            .lock()
            .await
            .insert(gateway_url, cred.content_hash());
    }

    /// Stop the bridge for a specific gateway URL.
    pub async fn stop_gateway(&self, gateway_url: &str) {
        if let Some(instance) = self.bridges.lock().await.remove(gateway_url) {
            let _ = instance.cancel_tx.send(());
            match tokio::time::timeout(Duration::from_secs(5), instance.handle).await {
                Ok(_) => {}
                Err(_) => warn!("Bridge for {gateway_url} did not stop within 5s, aborting"),
            }
        }
        self.last_hashes.lock().await.remove(gateway_url);
    }

    /// Stop all running bridges.
    pub async fn stop_all(&self) {
        let instances: Vec<(String, BridgeInstance)> =
            self.bridges.lock().await.drain().collect();
        self.last_hashes.lock().await.clear();

        for (url, instance) in instances {
            let _ = instance.cancel_tx.send(());
            match tokio::time::timeout(Duration::from_secs(5), instance.handle).await {
                Ok(_) => {}
                Err(_) => warn!("Bridge for {url} did not stop within 5s, aborting"),
            }
        }
    }

    /// Check if a specific gateway's bridge is running.
    pub async fn is_gateway_running(&self, gateway_url: &str) -> bool {
        if let Some(instance) = self.bridges.lock().await.get(gateway_url) {
            !instance.handle.is_finished()
        } else {
            false
        }
    }

    /// Return status for all known gateways.
    pub async fn gateway_statuses(&self) -> Vec<(String, bool)> {
        let bridges = self.bridges.lock().await;
        bridges
            .iter()
            .map(|(url, inst)| (url.clone(), !inst.handle.is_finished()))
            .collect()
    }

    /// Synchronise running bridges with a credentials file.
    /// Starts new, stops removed, restarts changed, leaves unchanged.
    pub async fn sync_with_credentials(self: &Arc<Self>, file: &CredentialsFile) {
        let new_hashes: HashMap<String, u64> = file
            .gateways
            .iter()
            .map(|c| (c.gateway_url.clone(), c.content_hash()))
            .collect();

        let old_hashes = self.last_hashes.lock().await.clone();

        // Stop removed gateways
        for url in old_hashes.keys() {
            if !new_hashes.contains_key(url) {
                info!("Gateway removed: {url}, stopping bridge");
                self.stop_gateway(url).await;
            }
        }

        // Start new or restart changed gateways
        for cred in &file.gateways {
            let url = &cred.gateway_url;
            let new_hash = cred.content_hash();
            match old_hashes.get(url) {
                None => {
                    info!("New gateway: {url}, starting bridge");
                    self.start_gateway(cred).await;
                }
                Some(&old_hash) if old_hash != new_hash => {
                    info!("Gateway credentials changed: {url}, restarting bridge");
                    self.start_gateway(cred).await;
                }
                _ => {
                    // No change — leave bridge running
                }
            }
        }
    }

    /// Start watching the credentials file for changes (e.g., from CLI login).
    pub async fn start_credentials_watcher(self: Arc<Self>) -> Result<()> {
        let creds_path = e2ee_config::credentials_path();
        let watch_dir = e2ee_config::credentials_dir();

        if !watch_dir.exists() {
            std::fs::create_dir_all(&watch_dir)?;
        }

        let manager = self.clone();
        let rt_handle = tokio::runtime::Handle::current();
        let debouncer = new_debouncer(
            Duration::from_millis(500),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        let creds_changed = events
                            .iter()
                            .any(|event| event.paths.iter().any(|p| p == &creds_path));
                        if creds_changed {
                            let mgr = manager.clone();
                            rt_handle.spawn(async move {
                                info!("Credentials file changed, syncing bridges");
                                match e2ee_config::load_credentials() {
                                    Ok(file) => {
                                        mgr.sync_with_credentials(&file).await;
                                    }
                                    Err(e) => {
                                        warn!(
                                            "Failed to reload credentials after file change: {e}"
                                        );
                                        mgr.stop_all().await;
                                    }
                                }
                            });
                        }
                    }
                    Err(e) => {
                        error!("File watcher error: {e:?}");
                    }
                }
            },
        )?;

        let _watcher_holder = tokio::spawn(async move {
            let mut debouncer = debouncer;
            if let Err(e) = debouncer.watch(&watch_dir, RecursiveMode::NonRecursive) {
                error!("Failed to watch credentials directory: {e}");
                return;
            }

            info!("Watching credentials directory: {}", watch_dir.display());

            std::future::pending::<()>().await;
        });

        Ok(())
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p server 2>&1 | head -40`

Expected: Compilation errors in `main.rs` and `routes/e2ee.rs` because they still call the old API (`bridge_manager.start()`, `bridge_manager.stop()`, `bridge_manager.is_running()`). This is expected — we'll fix those in the next tasks.

- [ ] **Step 3: Commit (with `--no-verify` if needed due to compile errors in other files)**

Actually, don't commit yet — the crate won't compile until main.rs and routes are updated. Continue to Task 3.

---

### Task 3: Update `main.rs` Startup and CLI Commands

**Files:**
- Modify: `crates/server/src/main.rs`

- [ ] **Step 1: Update the startup logic in `cmd_server()`**

In `crates/server/src/main.rs`, find lines 159–175 (the BridgeManager creation and credentials loading). Replace:

```rust
    // Create BridgeManager for E2EE gateway connection lifecycle
    let bridge_manager = Arc::new(e2ee_manager::BridgeManager::new(actual_port));

    // If we have stored credentials, start bridge immediately
    match e2ee_config::load_credentials() {
        Ok(creds) => {
            bridge_manager.start(&creds).await;
        }
        Err(_) => {
            tracing::info!("No gateway credentials found, bridge will not start");
        }
    }

    // Watch credentials file for changes (e.g., from CLI login while server is running)
    if let Err(e) = bridge_manager.clone().start_credentials_watcher().await {
        tracing::warn!("Failed to start credentials file watcher: {e}");
    }
```

With:

```rust
    // Create BridgeManager for E2EE gateway connection lifecycle
    let bridge_manager = Arc::new(e2ee_manager::BridgeManager::new(actual_port));

    // If we have stored credentials, start bridges for all gateways
    match e2ee_config::load_credentials() {
        Ok(file) => {
            if file.gateways.is_empty() {
                tracing::info!("No gateway credentials found, bridge will not start");
            } else {
                tracing::info!("Starting bridges for {} gateway(s)", file.gateways.len());
                for cred in &file.gateways {
                    bridge_manager.start_gateway(cred).await;
                }
            }
        }
        Err(_) => {
            tracing::info!("No gateway credentials found, bridge will not start");
        }
    }

    // Watch credentials file for changes (e.g., from CLI login while server is running)
    if let Err(e) = bridge_manager.clone().start_credentials_watcher().await {
        tracing::warn!("Failed to start credentials file watcher: {e}");
    }
```

- [ ] **Step 2: Update `cmd_login()` to use `add_or_update_gateway()`**

In `crates/server/src/main.rs`, find lines 276–283 where credentials are saved. Replace:

```rust
    // Save credentials
    let creds = e2ee_config::Credentials {
        master_secret: master_secret_b64.clone(),
        gateway_url: gateway_url.to_string(),
        session_token: auth.token,
        user_id: auth.user_id,
    };
    e2ee_config::save_credentials(&creds)?;
```

With:

```rust
    // Save credentials (appends to multi-gateway array or updates existing entry)
    let cred = e2ee_config::GatewayCredential {
        master_secret: master_secret_b64.clone(),
        gateway_url: gateway_url.to_string(),
        session_token: auth.token,
        user_id: auth.user_id,
    };
    e2ee_config::add_or_update_gateway(&cred)?;
```

- [ ] **Step 3: Update `cmd_status()` to show all gateways**

In `crates/server/src/main.rs`, replace the `cmd_status()` function (lines 310–327):

```rust
fn cmd_status() -> anyhow::Result<()> {
    match e2ee_config::load_credentials() {
        Ok(file) => {
            if file.gateways.is_empty() {
                println!("Status: Not configured");
                println!("  Run `vibe-board login --gateway <url>` to set up");
            } else {
                println!("Status: Configured ({} gateway(s))", file.gateways.len());
                for (i, cred) in file.gateways.iter().enumerate() {
                    println!("  [{}] Gateway: {}", i + 1, cred.gateway_url);
                    println!("      User ID: {}", cred.user_id);
                }
                println!(
                    "  Credentials: {}",
                    e2ee_config::credentials_path().display()
                );
            }
        }
        Err(_) => {
            println!("Status: Not configured");
            println!("  Run `vibe-board login --gateway <url>` to set up");
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Update `cmd_logout()` and CLI to support `--gateway <url>` and `--all`**

In `crates/server/src/main.rs`, update the `Commands` enum. Replace the `Logout` variant:

```rust
    /// Delete stored gateway credentials
    Logout {
        /// Remove only this gateway (by URL). Omit to remove all.
        #[arg(long)]
        gateway: Option<String>,
    },
```

Update the match arm in `main()` from:

```rust
        Some(Commands::Logout) => cmd_logout().map_err(VibeBoardError::Other),
```

To:

```rust
        Some(Commands::Logout { gateway }) => {
            cmd_logout(gateway.as_deref()).map_err(VibeBoardError::Other)
        }
```

Replace the `cmd_logout()` function:

```rust
fn cmd_logout(gateway_url: Option<&str>) -> anyhow::Result<()> {
    match gateway_url {
        Some(url) => {
            match e2ee_config::remove_gateway(url)? {
                true => println!("Removed gateway: {url}"),
                false => println!("Gateway not found: {url}"),
            }
        }
        None => {
            e2ee_config::delete_credentials()?;
            println!("Logged out. All gateway credentials deleted.");
        }
    }
    Ok(())
}
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p server 2>&1 | head -40`

Expected: May still fail on `routes/e2ee.rs` — that's Task 4. But `main.rs` changes should be clean.

- [ ] **Step 6: Commit**

Don't commit yet — wait until routes are updated so the full crate compiles.

---

### Task 4: Update REST API Routes (`routes/e2ee.rs`)

**Files:**
- Modify: `crates/server/src/routes/e2ee.rs`

- [ ] **Step 1: Replace the entire routes file**

Replace the contents of `crates/server/src/routes/e2ee.rs` with:

```rust
use std::sync::Arc;

use axum::{
    Router,
    extract::{Extension, Query},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, put},
};
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{
    DeploymentImpl,
    e2ee_config::{self, GatewayCredential},
    e2ee_manager::BridgeManager,
};

#[derive(Deserialize)]
pub struct PutGatewayRequest {
    pub master_secret: String,
    pub gateway_url: String,
    pub session_token: String,
    pub user_id: String,
}

#[derive(Deserialize)]
pub struct DeleteGatewayQuery {
    pub url: Option<String>,
}

#[derive(Serialize)]
pub struct GatewayStatusEntry {
    pub gateway_url: String,
    pub user_id: String,
    pub bridge_running: bool,
}

#[derive(Serialize)]
pub struct E2EEStatusResponse {
    pub gateways: Vec<GatewayStatusEntry>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // New multi-gateway routes
        .route("/e2ee/gateways", put(put_gateway))
        .route("/e2ee/gateways", delete(delete_gateway))
        // Backward-compatible aliases
        .route("/e2ee/credentials", put(put_gateway))
        .route("/e2ee/credentials", delete(delete_all_credentials))
        // Status
        .route("/e2ee/status", get(get_status))
}

/// Add or update a single gateway credential.
async fn put_gateway(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
    axum::extract::Json(req): axum::extract::Json<PutGatewayRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    let cred = GatewayCredential {
        master_secret: req.master_secret,
        gateway_url: req.gateway_url,
        session_token: req.session_token,
        user_id: req.user_id,
    };

    e2ee_config::add_or_update_gateway(&cred).map_err(|e| {
        let msg = format!("Failed to save gateway credential: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    bridge_manager.start_gateway(&cred).await;

    Ok(ResponseJson(ApiResponse::success(
        "Gateway credential saved and bridge started".to_string(),
    )))
}

/// Delete a specific gateway by URL query param.
async fn delete_gateway(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
    Query(query): Query<DeleteGatewayQuery>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    let url = query.url.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            ResponseJson(ApiResponse::error("Missing 'url' query parameter")),
        )
    })?;

    bridge_manager.stop_gateway(&url).await;

    e2ee_config::remove_gateway(&url).map_err(|e| {
        let msg = format!("Failed to remove gateway: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    Ok(ResponseJson(ApiResponse::success(
        format!("Gateway removed: {url}"),
    )))
}

/// Backward-compat: DELETE /e2ee/credentials removes all gateways.
async fn delete_all_credentials(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    bridge_manager.stop_all().await;

    e2ee_config::delete_credentials().map_err(|e| {
        let msg = format!("Failed to delete credentials: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    Ok(ResponseJson(ApiResponse::success(
        "All credentials deleted and bridges stopped".to_string(),
    )))
}

/// Return status for all gateways.
async fn get_status(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> ResponseJson<ApiResponse<E2EEStatusResponse>> {
    let file = e2ee_config::load_credentials().unwrap_or(e2ee_config::CredentialsFile {
        gateways: Vec::new(),
    });

    let mut gateways = Vec::new();
    for cred in &file.gateways {
        let running = bridge_manager.is_gateway_running(&cred.gateway_url).await;
        gateways.push(GatewayStatusEntry {
            gateway_url: cred.gateway_url.clone(),
            user_id: cred.user_id.clone(),
            bridge_running: running,
        });
    }

    ResponseJson(ApiResponse::success(E2EEStatusResponse { gateways }))
}
```

- [ ] **Step 2: Verify the full crate compiles**

Run: `cargo check -p server 2>&1 | tail -5`

Expected: `Finished` — no errors.

- [ ] **Step 3: Run all existing tests to make sure nothing is broken**

Run: `cargo test -p server 2>&1 | tail -20`

Expected: All existing tests pass (bridge tests in `e2ee_bridge.rs` are unaffected because `Credentials` is a type alias).

- [ ] **Step 4: Commit all changes from Tasks 2-4**

```bash
git add crates/server/src/e2ee_manager.rs crates/server/src/routes/e2ee.rs crates/server/src/main.rs
git commit -m "feat(e2ee): support multiple simultaneous gateway connections

BridgeManager now manages a HashMap of bridge instances keyed by
gateway_url. File watcher diffs credentials to start/stop/restart
individual bridges. REST API supports add/remove per gateway.
CLI login appends to gateway array, logout supports --gateway <url>."
```

---

### Task 5: Full Integration Verification

**Files:**
- No new files — verification only.

- [ ] **Step 1: Run the full workspace test suite**

Run: `cargo test --workspace 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 2: Run cargo clippy for lint checks**

Run: `cargo clippy -p server -- -D warnings 2>&1 | tail -20`

Expected: No warnings.

- [ ] **Step 3: Verify the binary builds and CLI help is correct**

Run: `cargo build -p server 2>&1 | tail -5`

Expected: Build succeeds.

Run: `cargo run -p server -- --help 2>&1`

Expected: Shows `login`, `logout`, `status` subcommands. `logout` should show `--gateway` option.

- [ ] **Step 4: Commit any fixes if needed**

If clippy or tests reveal issues, fix and commit:

```bash
git add -u
git commit -m "fix: address clippy/test feedback from multi-gateway changes"
```
