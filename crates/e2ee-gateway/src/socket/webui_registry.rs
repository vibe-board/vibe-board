use std::{collections::HashSet, sync::Arc};

use dashmap::DashMap;
use tokio::sync::mpsc;
use tracing::warn;

use crate::socket::webui_handler::GatewayToWebUI;

pub type WebUISender = mpsc::UnboundedSender<String>;

/// Information about a connected WebUI client
struct WebUIClient {
    user_id: String,
    sender: WebUISender,
    /// Set of machine_ids this client is subscribed to
    subscriptions: HashSet<String>,
}

/// Registry of connected WebUI clients and their machine subscriptions.
///
/// Supports:
/// - Registering/unregistering WebUI connections
/// - Subscribing to machine updates
/// - Forwarding messages from daemons to subscribed WebUI clients
/// - Notifying WebUI clients of machine online/offline events
#[derive(Clone)]
pub struct WebUIRegistry {
    /// client_id → WebUIClient
    clients: Arc<DashMap<String, WebUIClient>>,
    /// machine_id → Set<client_id> (reverse index for forwarding efficiency)
    subscriptions: Arc<DashMap<String, HashSet<String>>>,
    /// user_id → Set<client_id> (for broadcasting machine events)
    by_user: Arc<DashMap<String, HashSet<String>>>,
}

impl WebUIRegistry {
    pub fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            subscriptions: Arc::new(DashMap::new()),
            by_user: Arc::new(DashMap::new()),
        }
    }

    pub fn register(&self, client_id: String, user_id: String, sender: WebUISender) {
        self.clients.insert(
            client_id.clone(),
            WebUIClient {
                user_id: user_id.clone(),
                sender,
                subscriptions: HashSet::new(),
            },
        );
        self.by_user.entry(user_id).or_default().insert(client_id);
    }

    pub fn unregister(&self, client_id: &str) {
        if let Some((_, client)) = self.clients.remove(client_id) {
            // Remove from all subscription reverse indexes
            for mid in &client.subscriptions {
                if let Some(mut subs) = self.subscriptions.get_mut(mid) {
                    subs.remove(client_id);
                    if subs.is_empty() {
                        drop(subs);
                        self.subscriptions.remove(mid);
                    }
                }
            }
            // Remove from user index
            if let Some(mut user_clients) = self.by_user.get_mut(&client.user_id) {
                user_clients.remove(client_id);
                if user_clients.is_empty() {
                    drop(user_clients);
                    self.by_user.remove(&client.user_id);
                }
            }
        }
    }

    pub fn subscribe(&self, client_id: &str, machine_id: &str, user_id: &str) {
        // Verify client belongs to user
        if let Some(mut client) = self.clients.get_mut(client_id) {
            if client.user_id != user_id {
                return;
            }
            client.subscriptions.insert(machine_id.to_string());
        }

        self.subscriptions
            .entry(machine_id.to_string())
            .or_default()
            .insert(client_id.to_string());
    }

    pub fn unsubscribe(&self, client_id: &str, machine_id: &str) {
        if let Some(mut client) = self.clients.get_mut(client_id) {
            client.subscriptions.remove(machine_id);
        }

        if let Some(mut subs) = self.subscriptions.get_mut(machine_id) {
            subs.remove(client_id);
            if subs.is_empty() {
                drop(subs);
                self.subscriptions.remove(machine_id);
            }
        }
    }

    /// Get the set of machine_ids a client is subscribed to (for disconnect cleanup)
    pub fn get_subscriptions(&self, client_id: &str) -> Vec<String> {
        self.clients
            .get(client_id)
            .map(|c| c.subscriptions.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Send a response to a specific WebUI client (targeted routing by client_id)
    pub fn send_to_client(
        &self,
        client_id: &str,
        machine_id: &str,
        user_id: &str,
        payload: serde_json::Value,
    ) -> bool {
        if let Some(client) = self.clients.get(client_id) {
            if client.user_id != user_id {
                return false;
            }
            let msg = serde_json::to_string(&GatewayToWebUI::Forward {
                machine_id: machine_id.to_string(),
                payload,
            });
            if let Ok(msg) = msg {
                let _ = client.sender.send(msg);
                return true;
            }
        }
        false
    }

    /// Notify all WebUI clients of a user that a machine came online
    pub fn notify_machine_online(
        &self,
        machine_id: &str,
        user_id: &str,
        hostname: &str,
        platform: &str,
        port: u16,
    ) {
        self.broadcast_to_user(
            user_id,
            &GatewayToWebUI::MachineOnline {
                machine_id: machine_id.to_string(),
                hostname: hostname.to_string(),
                platform: platform.to_string(),
                port,
            },
        );
    }

    /// Notify all WebUI clients of a user that a machine went offline
    pub fn notify_machine_offline(&self, machine_id: &str, user_id: &str) {
        self.broadcast_to_user(
            user_id,
            &GatewayToWebUI::MachineOffline {
                machine_id: machine_id.to_string(),
            },
        );
    }

    fn broadcast_to_user(&self, user_id: &str, message: &GatewayToWebUI) {
        let msg = match serde_json::to_string(message) {
            Ok(m) => m,
            Err(e) => {
                warn!("Failed to serialize broadcast: {e}");
                return;
            }
        };

        if let Some(client_ids) = self.by_user.get(user_id) {
            for client_id in client_ids.iter() {
                if let Some(client) = self.clients.get(client_id) {
                    let _ = client.sender.send(msg.clone());
                }
            }
        }
    }
}

impl Default for WebUIRegistry {
    fn default() -> Self {
        Self::new()
    }
}
