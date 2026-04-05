use std::{collections::HashMap, sync::Arc, time::Duration};

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
    e2ee_config::{self, CredentialsFile, GatewayCredential},
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
    /// Hash of the raw credentials file content, used to skip redundant watcher reloads.
    last_file_hash: Mutex<u64>,
    local_port: u16,
}

impl BridgeManager {
    pub fn new(local_port: u16) -> Self {
        Self {
            bridges: Mutex::new(HashMap::new()),
            last_hashes: Mutex::new(HashMap::new()),
            last_file_hash: Mutex::new(0),
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
        let content_hash = cred.content_hash();
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
            .insert(gateway_url, content_hash);
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
        let instances: Vec<(String, BridgeInstance)> = self.bridges.lock().await.drain().collect();
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

    /// Seed the file content hash from the current credentials file.
    /// Call after initial load so the watcher doesn't re-process on startup.
    pub async fn seed_file_hash(&self) {
        if let Ok(content) = std::fs::read_to_string(e2ee_config::credentials_path()) {
            self.update_file_hash_if_changed(&content).await;
        }
    }

    /// Check if file content actually changed by hashing. Returns true if changed.
    async fn update_file_hash_if_changed(&self, content: &str) -> bool {
        use std::{
            collections::hash_map::DefaultHasher,
            hash::{Hash, Hasher},
        };
        let mut h = DefaultHasher::new();
        content.hash(&mut h);
        let new_hash = h.finish();

        let mut last = self.last_file_hash.lock().await;
        if *last == new_hash {
            return false;
        }
        *last = new_hash;
        true
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
                            let path = e2ee_config::credentials_path();
                            rt_handle.spawn(async move {
                                // Read raw content to check if it actually changed
                                let content = match std::fs::read_to_string(&path) {
                                    Ok(c) => c,
                                    Err(_) => {
                                        // File deleted — stop all bridges
                                        mgr.stop_all().await;
                                        *mgr.last_file_hash.lock().await = 0;
                                        return;
                                    }
                                };

                                if !mgr.update_file_hash_if_changed(&content).await {
                                    return; // Content unchanged, skip
                                }

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
