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

/// Manages the lifecycle of the E2EE bridge connection.
pub struct BridgeManager {
    cancel_tx: Mutex<Option<oneshot::Sender<()>>>,
    handle: Mutex<Option<JoinHandle<()>>>,
    local_port: u16,
}

impl BridgeManager {
    pub fn new(local_port: u16) -> Self {
        Self {
            cancel_tx: Mutex::new(None),
            handle: Mutex::new(None),
            local_port,
        }
    }

    /// Start the bridge with the given credentials.
    /// Stops any existing bridge first.
    pub async fn start(self: &Arc<Self>, creds: &Credentials) {
        self.stop().await;

        let (cancel_tx, cancel_rx) = oneshot::channel();
        *self.cancel_tx.lock().await = Some(cancel_tx);

        let creds = creds.clone();
        let port = self.local_port;
        let handle = tokio::spawn(async move {
            info!("Starting E2EE bridge to gateway: {}", creds.gateway_url);
            match e2ee_bridge::run_bridge(&creds, port, cancel_rx).await {
                Ok(()) => info!("E2EE bridge shut down"),
                Err(e) => error!("E2EE bridge error: {e}"),
            }
        });

        *self.handle.lock().await = Some(handle);
    }

    /// Stop the running bridge (if any).
    pub async fn stop(&self) {
        // Send cancellation signal
        if let Some(tx) = self.cancel_tx.lock().await.take() {
            let _ = tx.send(());
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
                Err(_) => warn!("Bridge did not stop within 5s, aborting"),
            }
        }
    }

    /// Check if a bridge is currently running.
    pub async fn is_running(&self) -> bool {
        if let Some(handle) = self.handle.lock().await.as_ref() {
            !handle.is_finished()
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

        // Ensure directory exists so watcher can be set up
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
                        // Check if our credentials file changed
                        let creds_changed = events
                            .iter()
                            .any(|event| event.paths.iter().any(|p| p == &creds_path));
                        if creds_changed {
                            let mgr = manager.clone();
                            rt_handle.spawn(async move {
                                info!("Credentials file changed, reloading bridge");
                                match e2ee_config::load_credentials() {
                                    Ok(creds) => {
                                        mgr.start(&creds).await;
                                    }
                                    Err(e) => {
                                        warn!(
                                            "Failed to reload credentials after file change: {e}"
                                        );
                                        mgr.stop().await;
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

        // We need to store the debouncer/watcher so it doesn't get dropped.
        // Spawn a task that holds it alive.
        let _watcher_holder = tokio::spawn(async move {
            let mut debouncer = debouncer;
            if let Err(e) = debouncer.watch(&watch_dir, RecursiveMode::NonRecursive) {
                error!("Failed to watch credentials directory: {e}");
                return;
            }

            info!("Watching credentials directory: {}", watch_dir.display());

            // Keep alive forever — debouncer is moved into this task
            std::future::pending::<()>().await;
        });

        Ok(())
    }
}
