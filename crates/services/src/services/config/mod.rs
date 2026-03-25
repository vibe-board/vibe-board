use std::path::{Path, PathBuf};

use thiserror::Error;

pub mod editor;
mod versions;

pub use editor::EditorOpenError;

pub const DEFAULT_PR_DESCRIPTION_PROMPT: &str = r#"Update the PR that was just created with a better title and description.
The PR number is #{pr_number} and the URL is {pr_url}.

Analyze the changes in this branch and write:
1. A concise, descriptive title that summarizes the changes, postfixed with "(Vibe Board)"
2. A detailed description that explains:
   - What changes were made
   - Why they were made (based on the task context)
   - Any important implementation details
   - At the end, include a note: "This PR was written using [Vibe Board](https://vibeboard.cloud)"

Use the appropriate CLI tool to update the PR (gh pr edit for GitHub, az repos pr update for Azure DevOps)."#;

pub const DEFAULT_COMMIT_REMINDER_PROMPT: &str = "There are uncommitted changes. Please stage and commit them now with a descriptive commit message.";

pub const DEFAULT_COMMIT_MESSAGE_PROMPT: &str = r#"The current branch is "{current_branch}", the target branch is "{target_branch}".
Generate a conventional commit message for the changes that would be merged from the current branch into the target.
You may run git diff or other commands to inspect the changes.

Conventional Commits rules (use as-is, do not search):
- Subject line format: type(scope): description — one line. Type (required): feat, fix, docs, style, refactor, perf, test, chore, build, ci. Scope (optional): short noun in parentheses. Description: imperative mood, lowercase after colon, no period, under ~72 chars.
- For SIMPLE or small changes (e.g. one file, trivial fix): put ONLY the subject line in the block below. No body.
- For COMPLEX or larger changes (multiple files, non-trivial logic): put the subject line, then a blank line, then an optional body (bullet points or short paragraphs). No product or tool names.

You may include reasoning or explanation before or after the block. The commit message will be taken ONLY from the following block.

Output the commit message in a markdown code block that starts with a line containing exactly "```commit" and ends with a line containing exactly "```". Example:
```commit
feat(merge): improve commit message prompt and parsing
```
Or for a complex change:
```commit
feat(auth): add login flow

- Email/password flow
- Session cookie handling
```"#;

/// Prompt used to auto-queue a follow-up when the workspace is dirty after a CodingAgent run
/// (e.g. commit failed due to linter). The agent is asked to fix linter issues and re-commit.
pub const DEFAULT_LINTER_FIX_FOLLOW_UP_PROMPT: &str =
    "Check the code modified by the linter, fix linter complaints, and re-commit the code.";

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Validation error: {0}")]
    ValidationError(String),
}

pub type Config = versions::v10::Config;
pub type NotificationConfig = versions::v10::NotificationConfig;
pub type EditorConfig = versions::v10::EditorConfig;
pub type ThemeMode = versions::v10::ThemeMode;
pub type SoundFile = versions::v10::SoundFile;
pub type EditorType = versions::v10::EditorType;
pub type GitHubConfig = versions::v10::GitHubConfig;
pub type UiLanguage = versions::v10::UiLanguage;
pub type ShowcaseState = versions::v10::ShowcaseState;
pub type SendMessageShortcut = versions::v10::SendMessageShortcut;

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
            let backup_path = backup_config_file(config_path.as_path()).unwrap_or_else(|e| {
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
                let backup_path = backup_config_file(config_path.as_path()).unwrap_or_else(|e| {
                    tracing::error!("Failed to backup config: {}", e);
                    config_path.with_extension("json.bak.failed")
                });
                (Config::default(), LoadOutcome::ParseFailed { backup_path })
            }
        }
    } else {
        // Older version or missing version: backup then migrate
        let backup_path = backup_config_file(config_path.as_path()).unwrap_or_else(|e| {
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
    "config_version",
    "theme",
    "executor_profile",
    "disclaimer_acknowledged",
    "onboarding_acknowledged",
    "notifications",
    "editor",
    "github",
    "analytics_enabled",
    "workspace_dir",
    "language",
    "git_branch_prefix",
    "showcases",
    "pr_auto_description_enabled",
    "pr_auto_description_prompt",
    "beta_workspaces",
    "beta_workspaces_invitation_sent",
    "commit_reminder_enabled",
    "commit_reminder_prompt",
    "send_message_shortcut",
    "agent_order",
    "project_order",
    "agent_enabled",
    "commit_message_executor_profile",
    "commit_message_enabled",
    "commit_message_prompt",
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
        .filter(|p| p.to_string_lossy().contains(".json.bak."))
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

#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use super::*;

    #[tokio::test]
    async fn test_atomic_write_creates_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let config = Config::default();
        save_config_to_file(&config, &path.to_path_buf())
            .await
            .unwrap();
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
        save_config_to_file(&config, &path.to_path_buf())
            .await
            .unwrap();
        let raw = std::fs::read_to_string(&path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["future_v11_field"], "preserved");
    }

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
        let config = Config::default();
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

    #[tokio::test]
    async fn test_full_roundtrip_with_extra_fields() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");

        // Simulate a v11 config file with extra fields
        let mut value = serde_json::to_value(Config::default()).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .insert("v11_new_feature".to_string(), serde_json::json!(true));
        value.as_object_mut().unwrap().insert(
            "v11_complex".to_string(),
            serde_json::json!({"nested": [1, 2, 3]}),
        );
        std::fs::write(&path, serde_json::to_string_pretty(&value).unwrap()).unwrap();

        // Load (should preserve extra fields)
        let (config, outcome) = load_config_from_file(&path.to_path_buf()).await;
        assert!(matches!(outcome, LoadOutcome::Loaded));
        assert_eq!(
            config.extra_fields.get("v11_new_feature"),
            Some(&serde_json::json!(true))
        );

        // Modify a known field
        let mut modified = config.clone();
        modified.git_branch_prefix = "custom".to_string();

        // Save
        save_config_to_file(&modified, &path.to_path_buf())
            .await
            .unwrap();

        // Re-load and verify both known fields and extra_fields survive
        let (reloaded, _) = load_config_from_file(&path.to_path_buf()).await;
        assert_eq!(reloaded.git_branch_prefix, "custom");
        assert_eq!(
            reloaded.extra_fields.get("v11_new_feature"),
            Some(&serde_json::json!(true))
        );
        assert_eq!(
            reloaded.extra_fields.get("v11_complex"),
            Some(&serde_json::json!({"nested": [1, 2, 3]}))
        );
    }

    #[tokio::test]
    async fn test_migration_from_older_version_creates_backup() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");

        // Build a valid v9 config by serializing the v9 default and tweaking fields
        let mut v9_config = versions::v9::Config::default();
        v9_config.workspace_dir = Some("/my/workspace".to_string());
        v9_config.git_branch_prefix = "vk".to_string();
        let v9_json = serde_json::to_string_pretty(&v9_config).unwrap();
        std::fs::write(&path, &v9_json).unwrap();

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
}
