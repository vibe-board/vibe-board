use std::{sync::Arc, time::Duration};

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
    e2ee_config::{self, Credentials},
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
        // Wait for the task to finish (with timeout)
        if let Some(handle) = self.handle.lock().await.take() {
            match tokio::time::timeout(Duration::from_secs(5), handle).await {
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
