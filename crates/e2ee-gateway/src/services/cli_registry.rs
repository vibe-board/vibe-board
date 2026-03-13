use dashmap::DashMap;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::mpsc;

/// A message that can be sent to a connected daemon
pub type DaemonSender = mpsc::UnboundedSender<String>;

/// Information about a connected daemon/CLI instance
#[derive(Debug, Clone)]
pub struct CliRecord {
    pub machine_id: String,
    pub hostname: String,
    pub platform: String,
    pub user_id: String,
    pub sender: DaemonSender,
}

/// In-memory registry of connected daemon instances, scoped by user.
///
/// Thread-safe via DashMap — supports concurrent access from multiple WebSocket handlers.
#[derive(Debug, Clone)]
pub struct CliRegistry {
    /// machine_id → CliRecord
    by_machine_id: Arc<DashMap<String, CliRecord>>,
    /// user_id → Set<machine_id>
    by_user_id: Arc<DashMap<String, HashSet<String>>>,
}

impl CliRegistry {
    pub fn new() -> Self {
        Self {
            by_machine_id: Arc::new(DashMap::new()),
            by_user_id: Arc::new(DashMap::new()),
        }
    }

    /// Register a daemon connection
    pub fn register(&self, record: CliRecord) {
        let machine_id = record.machine_id.clone();
        let user_id = record.user_id.clone();

        self.by_machine_id.insert(machine_id.clone(), record);
        self.by_user_id
            .entry(user_id)
            .or_default()
            .insert(machine_id);
    }

    /// Unregister a daemon connection
    pub fn unregister(&self, machine_id: &str) {
        if let Some((_, record)) = self.by_machine_id.remove(machine_id) {
            if let Some(mut machines) = self.by_user_id.get_mut(&record.user_id) {
                machines.remove(machine_id);
                if machines.is_empty() {
                    drop(machines);
                    self.by_user_id.remove(&record.user_id);
                }
            }
        }
    }

    /// Get a specific daemon for a user (verifies ownership)
    pub fn get_for_user(&self, machine_id: &str, user_id: &str) -> Option<CliRecord> {
        self.by_machine_id
            .get(machine_id)
            .filter(|r| r.user_id == user_id)
            .map(|r| r.clone())
    }

    /// Get all online daemons for a user
    pub fn get_all_for_user(&self, user_id: &str) -> Vec<CliRecord> {
        self.by_user_id
            .get(user_id)
            .map(|machine_ids| {
                machine_ids
                    .iter()
                    .filter_map(|mid| self.by_machine_id.get(mid).map(|r| r.clone()))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Send a message to a specific daemon (verifies ownership)
    pub fn send_to_daemon(
        &self,
        machine_id: &str,
        user_id: &str,
        message: String,
    ) -> Result<(), String> {
        let record = self
            .get_for_user(machine_id, user_id)
            .ok_or_else(|| "Daemon not found or not owned by user".to_string())?;

        record
            .sender
            .send(message)
            .map_err(|_| "Daemon channel closed".to_string())
    }
}

impl Default for CliRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_record(machine_id: &str, user_id: &str) -> (CliRecord, mpsc::UnboundedReceiver<String>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let record = CliRecord {
            machine_id: machine_id.to_string(),
            hostname: "test-host".to_string(),
            platform: "linux".to_string(),
            user_id: user_id.to_string(),
            sender: tx,
        };
        (record, rx)
    }

    #[test]
    fn test_register_and_get() {
        let registry = CliRegistry::new();
        let (record, _rx) = make_record("m1", "u1");

        registry.register(record);

        let found = registry.get_for_user("m1", "u1");
        assert!(found.is_some());
        assert_eq!(found.unwrap().machine_id, "m1");

        // Different user can't access
        assert!(registry.get_for_user("m1", "u2").is_none());
    }

    #[test]
    fn test_get_all_for_user() {
        let registry = CliRegistry::new();
        let (r1, _rx1) = make_record("m1", "u1");
        let (r2, _rx2) = make_record("m2", "u1");
        let (r3, _rx3) = make_record("m3", "u2");

        registry.register(r1);
        registry.register(r2);
        registry.register(r3);

        let u1_machines = registry.get_all_for_user("u1");
        assert_eq!(u1_machines.len(), 2);

        let u2_machines = registry.get_all_for_user("u2");
        assert_eq!(u2_machines.len(), 1);

        let u3_machines = registry.get_all_for_user("u3");
        assert_eq!(u3_machines.len(), 0);
    }

    #[test]
    fn test_unregister() {
        let registry = CliRegistry::new();
        let (record, _rx) = make_record("m1", "u1");

        registry.register(record);
        assert!(registry.get_for_user("m1", "u1").is_some());

        registry.unregister("m1");
        assert!(registry.get_for_user("m1", "u1").is_none());
        assert_eq!(registry.get_all_for_user("u1").len(), 0);
    }

    #[tokio::test]
    async fn test_send_to_daemon() {
        let registry = CliRegistry::new();
        let (record, mut rx) = make_record("m1", "u1");

        registry.register(record);

        registry
            .send_to_daemon("m1", "u1", "hello".to_string())
            .unwrap();

        let msg = rx.recv().await.unwrap();
        assert_eq!(msg, "hello");

        // Wrong user can't send
        let result = registry.send_to_daemon("m1", "u2", "bad".to_string());
        assert!(result.is_err());
    }
}
