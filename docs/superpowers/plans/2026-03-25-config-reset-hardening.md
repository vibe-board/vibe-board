# Config Reset Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent silent config reset to defaults by adding atomic writes, backup, resilient deserialization, and conditional startup saves.

**Architecture:** Three layers — (1) storage safety via atomic writes and backup helpers in `mod.rs`, (2) resilient two-phase deserialization in `v10.rs` with `extra_fields` sidecar and unknown-enum-variant tolerance, (3) conditional save on startup via `LoadOutcome` in `local-deployment`. The `update_config` route is updated to carry over `extra_fields` from in-memory state.

**Tech Stack:** Rust (serde, serde_json), existing workspace crates (services, local-deployment, server)

**Spec:** `docs/superpowers/specs/2026-03-25-config-reset-hardening-design.md`

---

### Task 1: Extra Fields Sidecar + Resilient Deserialization (v10.rs)

**Why first:** Tasks 2-4 all depend on `extra_fields` existing on Config. This task must be completed first.

**Files:**
- Modify: `crates/services/src/services/config/versions/v10.rs`

- [ ] **Step 1: Add `extra_fields` field to Config struct**

In `v10.rs`, add to the Config struct after line 88 (`commit_message_single_commit`):

```rust
    /// Unknown fields from newer config versions, preserved through round-trips.
    /// Populated manually during two-phase parse; not part of serde or ts-rs.
    #[serde(skip)]
    #[ts(skip)]
    pub extra_fields: serde_json::Map<String, serde_json::Value>,
```

- [ ] **Step 2: Add `extra_fields` to `Default` impl**

In the `Default::default()` impl (line 151-183), add after `commit_message_single_commit: false,`:

```rust
            extra_fields: serde_json::Map::new(),
```

- [ ] **Step 3: Add `extra_fields` to `from_v9_config`**

In `from_v9_config` (line 92-122), add after `commit_message_single_commit: false,`:

```rust
            extra_fields: serde_json::Map::new(),
```

- [ ] **Step 4: Add `deserialize_vec_skip_unknown` helper**

Add this function before the Config struct definition in `v10.rs`:

```rust
use serde::de::Deserializer;

/// Deserialize a Vec of enum values, silently skipping any unknown variants.
/// Logs a warning for each unknown variant encountered.
fn deserialize_vec_skip_unknown<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: serde::Deserialize<'de> + std::fmt::Debug,
{
    let values: Vec<serde_json::Value> = Vec::deserialize(deserializer)?;
    let mut result = Vec::with_capacity(values.len());
    for v in values {
        match serde_json::from_value::<T>(v.clone()) {
            Ok(item) => result.push(item),
            Err(_) => {
                tracing::warn!(
                    "Skipping unknown enum variant in config: {}",
                    v
                );
            }
        }
    }
    Ok(result)
}
```

- [ ] **Step 5: Apply `deserialize_with` to Vec<BaseCodingAgent> fields**

Update the `agent_order` and `agent_enabled` field annotations:

For `agent_order` (currently line 75-76):
```rust
    #[serde(default, deserialize_with = "deserialize_vec_skip_unknown")]
    pub agent_order: Vec<BaseCodingAgent>,
```

For `agent_enabled` (currently line 79-80):
```rust
    #[serde(default = "default_agent_enabled", deserialize_with = "deserialize_vec_skip_unknown")]
    pub agent_enabled: Vec<BaseCodingAgent>,
```

- [ ] **Step 6: Remove the old `From<String>` impl**

Remove the `impl From<String> for Config` block (lines 130-149). This is no longer used — `load_config_from_file` in `mod.rs` (Task 2) handles the two-phase parse directly.

**Why safe to remove:** The only caller was `mod.rs:77` (`Config::from(raw_config)`), which is being rewritten in Task 2. The `from_previous_version` method (which remains) is called by the v10-level code, not via this `From<String>` impl. The v9 `From<String>` impl is separate and untouched.

Keep `from_v9_config` and `from_previous_version` — they are still called from `load_config_from_file` for the migration path.

- [ ] **Step 7: Write tests**

Add a `#[cfg(test)]` module at the bottom of `v10.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extra_fields_default_is_empty() {
        let config = Config::default();
        assert!(config.extra_fields.is_empty());
    }

    #[test]
    fn test_deserialize_skips_unknown_agent_variants() {
        // JSON with a known + unknown agent in agent_enabled
        let json = serde_json::json!({
            "config_version": "v10",
            "theme": "SYSTEM",
            "executor_profile": "CLAUDE_CODE",
            "disclaimer_acknowledged": false,
            "onboarding_acknowledged": false,
            "notifications": { "sound_enabled": false, "desktop_enabled": false },
            "editor": { "editor_type": "VSCODE", "custom_command": null, "remote_ssh_host": null, "remote_ssh_user": null },
            "github": { "pr_review_enabled": false },
            "analytics_enabled": true,
            "workspace_dir": null,
            "agent_enabled": ["CLAUDE_CODE", "TOTALLY_UNKNOWN_AGENT", "AMP"],
            "agent_order": ["TOTALLY_UNKNOWN_AGENT", "CLAUDE_CODE"]
        });
        let config: Config = serde_json::from_value(json).unwrap();
        // Unknown variant should be skipped, known ones kept
        assert!(config.agent_enabled.contains(&BaseCodingAgent::ClaudeCode));
        assert!(config.agent_enabled.contains(&BaseCodingAgent::Amp));
        assert_eq!(config.agent_enabled.len(), 2); // TOTALLY_UNKNOWN_AGENT filtered out
        assert_eq!(config.agent_order.len(), 1); // Only CLAUDE_CODE
    }

    #[test]
    fn test_serde_roundtrip_preserves_all_fields() {
        let config = Config::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.config_version, config.config_version);
        assert_eq!(parsed.git_branch_prefix, config.git_branch_prefix);
        assert_eq!(parsed.commit_message_enabled, config.commit_message_enabled);
    }
}
```

- [ ] **Step 8: Run tests**

Run: `cargo test -p services -- config::versions::v10::tests --nocapture`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add crates/services/src/services/config/versions/v10.rs
git commit -m "feat(config): add extra_fields sidecar and unknown enum variant resilience"
```

---

### Task 2: Atomic Write + Backup Helpers (Storage Layer)

**Files:**
- Modify: `crates/services/src/services/config/mod.rs`
- Prerequisite: `tempfile` is already in `crates/services/Cargo.toml` dev-dependencies

- [ ] **Step 1: Implement atomic write in `save_config_to_file`**

Replace the current `save_config_to_file` function (lines 86-93 of `mod.rs`) with:

```rust
/// Saves the config to the given path using atomic write.
/// Merges `extra_fields` back into the JSON so unknown keys from newer versions survive.
pub async fn save_config_to_file(
    config: &Config,
    config_path: &PathBuf,
) -> Result<(), ConfigError> {
    // Serialize known fields (extra_fields is #[serde(skip)] so it is omitted)
    let mut value = serde_json::to_value(config)?;
    // Merge extra_fields (unknown keys from newer versions) into top-level object
    if let Some(obj) = value.as_object_mut() {
        for (k, v) in &config.extra_fields {
            obj.entry(k.clone()).or_insert_with(|| v.clone());
        }
    }
    let raw_config = serde_json::to_string_pretty(&value)?;

    // Atomic write: write to .tmp, fsync, rename
    let tmp_path = config_path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &raw_config)?;
    // fsync the temp file
    let file = std::fs::File::open(&tmp_path)?;
    file.sync_all()?;
    drop(file);
    // Atomic rename (POSIX). On all platforms Rust supports, rename replaces the target.
    std::fs::rename(&tmp_path, config_path)?;

    Ok(())
}
```

- [ ] **Step 2: Add backup helper functions**

Add above the `save_config_to_file` function in `mod.rs`:

```rust
use std::path::Path;

const MAX_BACKUPS: usize = 3;

/// Create a timestamped backup of the config file. Returns the backup path.
pub fn backup_config_file(config_path: &Path) -> Result<PathBuf, ConfigError> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_path = config_path.with_extension(format!("json.bak.{}", timestamp));
    std::fs::copy(config_path, &backup_path)?;
    tracing::info!("Config backed up to {:?}", backup_path);
    cleanup_old_backups(config_path);
    Ok(backup_path)
}

/// Keep at most MAX_BACKUPS backup files, delete oldest.
fn cleanup_old_backups(config_path: &Path) {
    let Some(parent) = config_path.parent() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    let mut backups: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.to_string_lossy()
                .contains(".json.bak.")
        })
        .collect();
    backups.sort();
    while backups.len() > MAX_BACKUPS {
        if let Some(oldest) = backups.first() {
            let _ = std::fs::remove_file(oldest);
            tracing::info!("Removed old config backup: {:?}", oldest);
        }
        backups.remove(0);
    }
}
```

- [ ] **Step 3: Add `LoadOutcome` enum and update `load_config_from_file`**

Add the `LoadOutcome` enum and rewrite `load_config_from_file` in `mod.rs`:

```rust
/// Outcome of loading config from file.
#[derive(Debug)]
#[must_use]
pub enum LoadOutcome {
    /// Parsed successfully as current version, no changes needed.
    Loaded,
    /// Migrated from an older version. Backup was created.
    Migrated { backup_path: PathBuf },
    /// JSON was corrupt or unparseable. Backup was created, using defaults.
    ParseFailed { backup_path: PathBuf },
    /// No config file found on disk.
    FileNotFound,
}

/// Load config from file. Returns (Config, LoadOutcome).
/// On parse failure, backs up the original file and returns defaults.
pub async fn load_config_from_file(config_path: &PathBuf) -> (Config, LoadOutcome) {
    let raw_config = match std::fs::read_to_string(config_path) {
        Ok(s) => s,
        Err(_) => {
            tracing::info!("No config file found, will create one");
            return (Config::default(), LoadOutcome::FileNotFound);
        }
    };

    // Two-phase parse: JSON Value first, then typed
    let value: serde_json::Value = match serde_json::from_str(&raw_config) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Config JSON parse failed: {}", e);
            let backup_path = backup_config_file(config_path.as_path())
                .unwrap_or_else(|e| {
                    tracing::error!("Failed to backup corrupt config: {}", e);
                    config_path.with_extension("json.bak.failed")
                });
            return (Config::default(), LoadOutcome::ParseFailed { backup_path });
        }
    };

    let version = value
        .get("config_version")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if version == "v10" {
        // Current version: deserialize with serde(default) for missing fields
        match serde_json::from_value::<Config>(value.clone()) {
            Ok(mut config) => {
                // Compute extra_fields: keys in the JSON not in the struct
                config.extra_fields = compute_extra_fields(&value);
                (config, LoadOutcome::Loaded)
            }
            Err(e) => {
                tracing::warn!("Config v10 deserialization failed: {}", e);
                let backup_path = backup_config_file(config_path.as_path())
                    .unwrap_or_else(|e| {
                        tracing::error!("Failed to backup config: {}", e);
                        config_path.with_extension("json.bak.failed")
                    });
                (Config::default(), LoadOutcome::ParseFailed { backup_path })
            }
        }
    } else {
        // Older version or missing version: backup then migrate
        let backup_path = backup_config_file(config_path.as_path())
            .unwrap_or_else(|e| {
                tracing::error!("Failed to backup config before migration: {}", e);
                config_path.with_extension("json.bak.failed")
            });
        match Config::from_previous_version(&raw_config) {
            Ok(config) => {
                tracing::info!("Config migrated to v10 from version '{}'", version);
                (config, LoadOutcome::Migrated { backup_path })
            }
            Err(e) => {
                tracing::warn!("Config migration failed: {}, using default", e);
                (Config::default(), LoadOutcome::ParseFailed { backup_path })
            }
        }
    }
}

/// Known top-level field names of the Config struct.
/// Must be kept in sync with the struct fields in v10.rs.
const KNOWN_CONFIG_FIELDS: &[&str] = &[
    "config_version", "theme", "executor_profile", "disclaimer_acknowledged",
    "onboarding_acknowledged", "notifications", "editor", "github",
    "analytics_enabled", "workspace_dir", "language", "git_branch_prefix",
    "showcases", "pr_auto_description_enabled", "pr_auto_description_prompt",
    "beta_workspaces", "beta_workspaces_invitation_sent",
    "commit_reminder_enabled", "commit_reminder_prompt",
    "send_message_shortcut", "agent_order", "project_order",
    "agent_enabled", "commit_message_executor_profile",
    "commit_message_enabled", "commit_message_prompt",
    "commit_message_single_commit",
];

fn compute_extra_fields(value: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    let Some(obj) = value.as_object() else {
        return serde_json::Map::new();
    };
    obj.iter()
        .filter(|(k, _)| !KNOWN_CONFIG_FIELDS.contains(&k.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}
```

- [ ] **Step 4: Update import for `Path`**

At the top of `mod.rs`, ensure `std::path::Path` is imported alongside `PathBuf`:

```rust
use std::path::{Path, PathBuf};
```

- [ ] **Step 5: Write tests**

Add a `#[cfg(test)]` module at the bottom of `mod.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_atomic_write_creates_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let config = Config::default();
        save_config_to_file(&config, &path.to_path_buf()).await.unwrap();
        assert!(path.exists());
        // No leftover .tmp file
        assert!(!dir.path().join("config.json.tmp").exists());
        // Valid JSON round-trip
        let raw = std::fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["config_version"], "v10");
    }

    #[tokio::test]
    async fn test_atomic_write_preserves_extra_fields() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let mut config = Config::default();
        config.extra_fields.insert(
            "future_v11_field".to_string(),
            serde_json::json!("preserved"),
        );
        save_config_to_file(&config, &path.to_path_buf()).await.unwrap();
        let raw = std::fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["future_v11_field"], "preserved");
    }
```

Then add these tests to the same module:

```rust
    #[tokio::test]
    async fn test_load_nonexistent_returns_file_not_found() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nope.json").to_path_buf();
        let (config, outcome) = load_config_from_file(&path).await;
        assert_eq!(config.config_version, "v10");
        assert!(matches!(outcome, LoadOutcome::FileNotFound));
    }

    #[tokio::test]
    async fn test_load_corrupt_json_backs_up_and_returns_default() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "not valid json {{{").unwrap();
        let (config, outcome) = load_config_from_file(&path.to_path_buf()).await;
        assert_eq!(config.config_version, "v10");
        assert!(matches!(outcome, LoadOutcome::ParseFailed { .. }));
        // Backup file should exist
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().to_string_lossy().contains(".bak."))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    #[tokio::test]
    async fn test_load_v10_preserves_extra_fields() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        // Write a v10 config with an extra unknown field
        let mut config = Config::default();
        let mut value = serde_json::to_value(&config).unwrap();
        value.as_object_mut().unwrap().insert(
            "future_v11_field".to_string(),
            serde_json::json!({"nested": true}),
        );
        std::fs::write(&path, serde_json::to_string_pretty(&value).unwrap()).unwrap();

        let (loaded, outcome) = load_config_from_file(&path.to_path_buf()).await;
        assert!(matches!(outcome, LoadOutcome::Loaded));
        assert_eq!(
            loaded.extra_fields.get("future_v11_field"),
            Some(&serde_json::json!({"nested": true}))
        );
    }

    #[tokio::test]
    async fn test_backup_cleanup_keeps_max_3() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{}").unwrap();
        // Create 4 backups
        for i in 1..=4 {
            let bak = dir.path().join(format!("config.json.bak.{}", i));
            std::fs::write(&bak, "backup").unwrap();
        }
        // Trigger cleanup via a new backup
        backup_config_file(&path).unwrap();
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().to_string_lossy().contains(".bak."))
            .collect();
        assert!(backups.len() <= MAX_BACKUPS);
    }
```

- [ ] **Step 6: Add KNOWN_CONFIG_FIELDS sync test**

Add to the `#[cfg(test)]` module — this ensures `KNOWN_CONFIG_FIELDS` stays in sync with the actual Config struct:

```rust
    #[test]
    fn test_known_config_fields_matches_struct() {
        let config = Config::default();
        let value = serde_json::to_value(&config).unwrap();
        let keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
        for key in &keys {
            assert!(
                KNOWN_CONFIG_FIELDS.contains(&key.as_str()),
                "Config field '{}' missing from KNOWN_CONFIG_FIELDS — add it to keep extra_fields detection correct",
                key
            );
        }
    }
```

- [ ] **Step 7: Run tests**

Run: `cargo test -p services -- config::tests --nocapture`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add crates/services/src/services/config/mod.rs
git commit -m "feat(config): add atomic writes, backup helpers, and LoadOutcome enum"
```

---

### Task 3: Conditional Save on Startup

**Files:**
- Modify: `crates/services/src/services/config/versions/v10.rs`

- [ ] **Step 1: Write test for extra_fields and unknown enum variant handling**

Add a `#[cfg(test)]` module at the bottom of `v10.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extra_fields_default_is_empty() {
        let config = Config::default();
        assert!(config.extra_fields.is_empty());
    }

    #[test]
    fn test_deserialize_skips_unknown_agent_variants() {
        // JSON with a known + unknown agent in agent_enabled
        let json = serde_json::json!({
            "config_version": "v10",
            "theme": "SYSTEM",
            "executor_profile": "CLAUDE_CODE",
            "disclaimer_acknowledged": false,
            "onboarding_acknowledged": false,
            "notifications": { "sound_enabled": false, "desktop_enabled": false },
            "editor": { "editor_type": "VSCODE", "custom_command": null, "remote_ssh_host": null, "remote_ssh_user": null },
            "github": { "pr_review_enabled": false },
            "analytics_enabled": true,
            "workspace_dir": null,
            "agent_enabled": ["CLAUDE_CODE", "TOTALLY_UNKNOWN_AGENT", "AMP"],
            "agent_order": ["TOTALLY_UNKNOWN_AGENT", "CLAUDE_CODE"]
        });
        let config: Config = serde_json::from_value(json).unwrap();
        // Unknown variant should be skipped, known ones kept
        assert!(config.agent_enabled.contains(&BaseCodingAgent::ClaudeCode));
        assert!(config.agent_enabled.contains(&BaseCodingAgent::Amp));
        assert_eq!(config.agent_enabled.len(), 2); // TOTALLY_UNKNOWN_AGENT filtered out
        assert_eq!(config.agent_order.len(), 1); // Only CLAUDE_CODE
    }

    #[test]
    fn test_serde_roundtrip_preserves_all_fields() {
        let config = Config::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.config_version, config.config_version);
        assert_eq!(parsed.git_branch_prefix, config.git_branch_prefix);
        assert_eq!(parsed.commit_message_enabled, config.commit_message_enabled);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p services -- config::versions::v10::tests --nocapture`
Expected: compile error — `extra_fields` field doesn't exist yet, `deserialize_vec_skip_unknown` not defined.

- [ ] **Step 3: Add `extra_fields` field to Config struct**

In `v10.rs`, add to the Config struct after line 88 (`commit_message_single_commit`):

```rust
    /// Unknown fields from newer config versions, preserved through round-trips.
    /// Populated manually during two-phase parse; not part of serde or ts-rs.
    #[serde(skip)]
    #[ts(skip)]
    pub extra_fields: serde_json::Map<String, serde_json::Value>,
```

- [ ] **Step 4: Add `extra_fields` to `Default` impl**

In the `Default::default()` impl (line 151-182), add after `commit_message_single_commit: false,`:

```rust
            extra_fields: serde_json::Map::new(),
```

- [ ] **Step 5: Add `extra_fields` to `from_v9_config`**

In `from_v9_config` (line 92-122), add after `commit_message_single_commit: false,`:

```rust
            extra_fields: serde_json::Map::new(),
```

- [ ] **Step 6: Add `deserialize_vec_skip_unknown` helper**

Add this function before the Config struct definition in `v10.rs`:

```rust
use serde::de::Deserializer;

/// Deserialize a Vec of enum values, silently skipping any unknown variants.
/// Logs a warning for each unknown variant encountered.
fn deserialize_vec_skip_unknown<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: serde::Deserialize<'de> + std::fmt::Debug,
{
    let values: Vec<serde_json::Value> = Vec::deserialize(deserializer)?;
    let mut result = Vec::with_capacity(values.len());
    for v in values {
        match serde_json::from_value::<T>(v.clone()) {
            Ok(item) => result.push(item),
            Err(_) => {
                tracing::warn!(
                    "Skipping unknown enum variant in config: {}",
                    v
                );
            }
        }
    }
    Ok(result)
}
```

- [ ] **Step 7: Apply `deserialize_with` to Vec<BaseCodingAgent> fields**

Update the `agent_order` and `agent_enabled` field annotations:

For `agent_order` (currently line 75-76):
```rust
    #[serde(default, deserialize_with = "deserialize_vec_skip_unknown")]
    pub agent_order: Vec<BaseCodingAgent>,
```

For `agent_enabled` (currently line 79-80):
```rust
    #[serde(default = "default_agent_enabled", deserialize_with = "deserialize_vec_skip_unknown")]
    pub agent_enabled: Vec<BaseCodingAgent>,
```

- [ ] **Step 8: Remove the old `From<String>` impl**

The old `From<String>` impl (lines 130-148) is no longer used — `load_config_from_file` in `mod.rs` now handles the two-phase parse. Remove it entirely:

```rust
// DELETE: impl From<String> for Config { ... }
```

Keep `from_v9_config` and `from_previous_version` — they are still called from `load_config_from_file` for the migration path.

- [ ] **Step 9: Run tests to verify they pass**

Run: `cargo test -p services -- config --nocapture`
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add crates/services/src/services/config/versions/v10.rs
git commit -m "feat(config): add extra_fields sidecar and unknown enum variant resilience"
```

---

### Task 3: Conditional Save on Startup

**Files:**
- Modify: `crates/local-deployment/src/lib.rs`

- [ ] **Step 1: Update import to include `LoadOutcome`**

In the `use services::services::config::` block (line 13), add `LoadOutcome`:

```rust
    config::{Config, LoadOutcome, load_config_from_file, save_config_to_file},
```

- [ ] **Step 2: Rewrite startup config flow**

Replace the function body lines 69-79 inside `new()` (from `let mut raw_config = ...` through `save_config_to_file(...)`). Keep the `async fn new()` signature at line 68 and everything from line 80 (`if let Some(workspace_dir)...`) onward unchanged.

Replace with:

```rust
        let (mut raw_config, load_outcome) = load_config_from_file(&config_path()).await;

        let mut needs_save = !matches!(load_outcome, LoadOutcome::Loaded);

        let profiles = ExecutorConfigs::get_cached();
        if !raw_config.onboarding_acknowledged
            && let Ok(recommended_executor) = profiles.get_recommended_executor_profile().await
        {
            raw_config.executor_profile = recommended_executor;
            needs_save = true;
        }

        if needs_save {
            save_config_to_file(&raw_config, &config_path()).await?;
        }

        match &load_outcome {
            LoadOutcome::Migrated { backup_path } => {
                tracing::info!("Config migrated. Backup at {:?}", backup_path);
            }
            LoadOutcome::ParseFailed { backup_path } => {
                tracing::warn!("Config parse failed. Backup at {:?}. Using defaults.", backup_path);
            }
            _ => {}
        }
```

- [ ] **Step 3: Verify the project compiles**

Run: `cargo check -p local-deployment`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add crates/local-deployment/src/lib.rs
git commit -m "feat(config): conditional save on startup with LoadOutcome"
```

---

### Task 4: Preserve extra_fields in update_config Route

**Files:**
- Modify: `crates/server/src/routes/config.rs`

- [ ] **Step 1: Update the `update_config` handler**

In `update_config` (lines 130-159), after getting `old_config` (line 144), carry over `extra_fields`:

Replace lines 130-159 with:

```rust
async fn update_config(
    State(deployment): State<DeploymentImpl>,
    Json(mut new_config): Json<Config>,
) -> ResponseJson<ApiResponse<Config>> {
    let config_path = config_path();

    // Validate git branch prefix
    if !git::is_valid_branch_prefix(&new_config.git_branch_prefix) {
        return ResponseJson(ApiResponse::error(
            "Invalid git branch prefix. Must be a valid git branch name component without slashes.",
        ));
    }

    // Get old config state before updating
    let old_config = deployment.config().read().await.clone();

    // Carry over extra_fields from in-memory config — the frontend has no
    // knowledge of these fields, so they would be lost without this.
    new_config.extra_fields = old_config.extra_fields.clone();

    match save_config_to_file(&new_config, &config_path).await {
        Ok(_) => {
            let mut config = deployment.config().write().await;
            *config = new_config.clone();
            drop(config);

            // Track config events when fields transition from false → true and run side effects
            handle_config_events(&deployment, &old_config, &new_config).await;

            ResponseJson(ApiResponse::success(new_config))
        }
        Err(e) => ResponseJson(ApiResponse::error(&format!("Failed to save config: {}", e))),
    }
}
```

The key change is `Json(mut new_config)` and the `new_config.extra_fields = old_config.extra_fields.clone();` line.

- [ ] **Step 2: Verify the project compiles**

Run: `cargo check -p server`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/routes/config.rs
git commit -m "fix(config): preserve extra_fields when frontend saves config"
```

---

### Task 5: Generate TypeScript Types + Full Build Verification

**Files:**
- Modify: `shared/types.ts` (auto-generated)

- [ ] **Step 1: Run full workspace compilation**

Run: `cargo check --workspace`
Expected: No errors across all crates.

- [ ] **Step 2: Run all Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass, including the new config tests.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `pnpm run generate-types`
Expected: Completes successfully. `extra_fields` should NOT appear in `shared/types.ts` because it is `#[ts(skip)]`.

- [ ] **Step 4: Verify `extra_fields` is not in generated types**

Run: `grep extra_fields shared/types.ts`
Expected: No matches.

- [ ] **Step 5: Run frontend type check**

Run: `pnpm run check`
Expected: No TypeScript errors.

- [ ] **Step 6: Commit if types changed**

```bash
git add shared/types.ts
git diff --cached --quiet || git commit -m "chore: regenerate types after config hardening"
```

---

### Task 6: Integration Test — Full Round-Trip

**Files:**
- Modify: `crates/services/src/services/config/mod.rs` (add test)

- [ ] **Step 1: Write full round-trip integration test**

Add to the `#[cfg(test)]` module in `mod.rs`:

```rust
    #[tokio::test]
    async fn test_full_roundtrip_with_extra_fields() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");

        // Simulate a v11 config file with extra fields
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value.as_object_mut().unwrap().insert(
            "v11_new_feature".to_string(),
            serde_json::json!(true),
        );
        value.as_object_mut().unwrap().insert(
            "v11_complex".to_string(),
            serde_json::json!({"nested": [1, 2, 3]}),
        );
        std::fs::write(&path, serde_json::to_string_pretty(&value).unwrap()).unwrap();

        // Load (should preserve extra fields)
        let (config, outcome) = load_config_from_file(&path.to_path_buf()).await;
        assert!(matches!(outcome, LoadOutcome::Loaded));
        assert_eq!(config.extra_fields.get("v11_new_feature"), Some(&serde_json::json!(true)));

        // Modify a known field
        let mut modified = config.clone();
        modified.git_branch_prefix = "custom".to_string();

        // Save
        save_config_to_file(&modified, &path.to_path_buf()).await.unwrap();

        // Re-load and verify both known fields and extra_fields survive
        let (reloaded, _) = load_config_from_file(&path.to_path_buf()).await;
        assert_eq!(reloaded.git_branch_prefix, "custom");
        assert_eq!(reloaded.extra_fields.get("v11_new_feature"), Some(&serde_json::json!(true)));
        assert_eq!(
            reloaded.extra_fields.get("v11_complex"),
            Some(&serde_json::json!({"nested": [1, 2, 3]}))
        );
    }

    #[tokio::test]
    async fn test_migration_from_older_version_creates_backup() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");

        // Write a v9 config
        let v9_json = serde_json::json!({
            "config_version": "v9",
            "theme": "SYSTEM",
            "executor_profile": "CLAUDE_CODE",
            "disclaimer_acknowledged": true,
            "onboarding_acknowledged": true,
            "notifications": { "sound_enabled": false, "desktop_enabled": false },
            "editor": { "editor_type": "VSCODE", "custom_command": null, "remote_ssh_host": null, "remote_ssh_user": null },
            "github": { "pr_review_enabled": false },
            "analytics_enabled": true,
            "workspace_dir": "/my/workspace",
            "last_app_version": "1.0.0",
            "show_release_notes": false,
            "git_branch_prefix": "vk",
            "agent_order": [],
            "project_order": []
        });
        std::fs::write(&path, serde_json::to_string_pretty(&v9_json).unwrap()).unwrap();

        let (config, outcome) = load_config_from_file(&path.to_path_buf()).await;

        // Should be migrated
        assert!(matches!(outcome, LoadOutcome::Migrated { .. }));
        assert_eq!(config.config_version, "v10");
        // workspace_dir should be preserved
        assert_eq!(config.workspace_dir, Some("/my/workspace".to_string()));
        // git_branch_prefix should be preserved from v9 (not reset to "vb")
        assert_eq!(config.git_branch_prefix, "vk");
        // Backup file should exist
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().to_string_lossy().contains(".bak."))
            .collect();
        assert_eq!(backups.len(), 1);
    }
```

- [ ] **Step 2: Run all config tests**

Run: `cargo test -p services -- config --nocapture`
Expected: All tests pass.

- [ ] **Step 3: Run full workspace tests**

Run: `cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/config/mod.rs
git commit -m "test(config): add round-trip and migration integration tests"
```
