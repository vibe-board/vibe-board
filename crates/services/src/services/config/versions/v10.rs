use anyhow::Error;
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use serde::{Deserialize, Serialize, de::Deserializer};
use ts_rs::TS;
pub use v9::{
    EditorConfig, EditorType, GitHubConfig, NotificationConfig, SendMessageShortcut, ShowcaseState,
    SoundFile, ThemeMode, UiLanguage,
};

use crate::services::config::versions::v9;

/// Deserialize a Vec of enum values, silently skipping any unknown variants.
/// Logs a warning for each unknown variant encountered.
fn deserialize_vec_skip_unknown<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: serde::de::DeserializeOwned + std::fmt::Debug,
{
    let values: Vec<serde_json::Value> = Vec::deserialize(deserializer)?;
    let mut result = Vec::with_capacity(values.len());
    for v in values {
        match serde_json::from_value::<T>(v.clone()) {
            Ok(item) => result.push(item),
            Err(_) => {
                tracing::warn!("Skipping unknown enum variant in config: {}", v);
            }
        }
    }
    Ok(result)
}

fn default_git_branch_prefix() -> String {
    "vb".to_string()
}

fn default_pr_auto_description_enabled() -> bool {
    true
}

fn default_commit_reminder_enabled() -> bool {
    true
}

fn default_commit_message_enabled() -> bool {
    true
}

/// Default enabled agents: the original 9 reliable agents
fn default_agent_enabled() -> Vec<BaseCodingAgent> {
    vec![
        BaseCodingAgent::ClaudeCode,
        BaseCodingAgent::Amp,
        BaseCodingAgent::Gemini,
        BaseCodingAgent::Codex,
        BaseCodingAgent::Opencode,
        BaseCodingAgent::CursorAgent,
        BaseCodingAgent::QwenCode,
        BaseCodingAgent::Copilot,
        BaseCodingAgent::Droid,
    ]
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
pub struct Config {
    pub config_version: String,
    pub theme: ThemeMode,
    pub executor_profile: ExecutorProfileId,
    pub disclaimer_acknowledged: bool,
    pub onboarding_acknowledged: bool,
    pub notifications: NotificationConfig,
    pub editor: EditorConfig,
    pub github: GitHubConfig,
    pub analytics_enabled: bool,
    pub workspace_dir: Option<String>,
    #[serde(default)]
    pub language: UiLanguage,
    #[serde(default = "default_git_branch_prefix")]
    pub git_branch_prefix: String,
    #[serde(default)]
    pub showcases: ShowcaseState,
    #[serde(default = "default_pr_auto_description_enabled")]
    pub pr_auto_description_enabled: bool,
    #[serde(default)]
    pub pr_auto_description_prompt: Option<String>,
    #[serde(default)]
    pub beta_workspaces: bool,
    #[serde(default)]
    pub beta_workspaces_invitation_sent: bool,
    #[serde(default = "default_commit_reminder_enabled")]
    pub commit_reminder_enabled: bool,
    #[serde(default)]
    pub commit_reminder_prompt: Option<String>,
    #[serde(default)]
    pub send_message_shortcut: SendMessageShortcut,
    #[serde(default, deserialize_with = "deserialize_vec_skip_unknown")]
    pub agent_order: Vec<BaseCodingAgent>,
    #[serde(default)]
    pub project_order: Vec<uuid::Uuid>,
    #[serde(
        default = "default_agent_enabled",
        deserialize_with = "deserialize_vec_skip_unknown"
    )]
    pub agent_enabled: Vec<BaseCodingAgent>,
    #[serde(default)]
    pub commit_message_executor_profile: Option<ExecutorProfileId>,
    #[serde(default = "default_commit_message_enabled")]
    pub commit_message_enabled: bool,
    #[serde(default)]
    pub commit_message_prompt: Option<String>,
    #[serde(default)]
    pub commit_message_single_commit: bool,
    /// Unknown fields from newer config versions, preserved through round-trips.
    /// Populated manually during two-phase parse; not part of serde or ts-rs.
    #[serde(skip)]
    #[ts(skip)]
    pub extra_fields: serde_json::Map<String, serde_json::Value>,
}

impl Config {
    fn from_v9_config(old_config: v9::Config) -> Self {
        Self {
            config_version: "v10".to_string(),
            theme: old_config.theme,
            executor_profile: old_config.executor_profile,
            disclaimer_acknowledged: old_config.disclaimer_acknowledged,
            onboarding_acknowledged: old_config.onboarding_acknowledged,
            notifications: old_config.notifications,
            editor: old_config.editor,
            github: old_config.github,
            analytics_enabled: old_config.analytics_enabled,
            workspace_dir: old_config.workspace_dir,
            language: old_config.language,
            git_branch_prefix: old_config.git_branch_prefix,
            showcases: old_config.showcases,
            pr_auto_description_enabled: old_config.pr_auto_description_enabled,
            pr_auto_description_prompt: old_config.pr_auto_description_prompt,
            beta_workspaces: old_config.beta_workspaces,
            beta_workspaces_invitation_sent: old_config.beta_workspaces_invitation_sent,
            commit_reminder_enabled: old_config.commit_reminder_enabled,
            commit_reminder_prompt: old_config.commit_reminder_prompt,
            send_message_shortcut: old_config.send_message_shortcut,
            agent_order: old_config.agent_order,
            project_order: old_config.project_order,
            agent_enabled: default_agent_enabled(),
            commit_message_executor_profile: None,
            commit_message_enabled: default_commit_message_enabled(),
            commit_message_prompt: None,
            commit_message_single_commit: false,
            extra_fields: serde_json::Map::new(),
        }
    }

    pub fn from_previous_version(raw_config: &str) -> Result<Self, Error> {
        let old_config = v9::Config::from(raw_config.to_string());
        Ok(Self::from_v9_config(old_config))
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: "v10".to_string(),
            theme: ThemeMode::System,
            executor_profile: ExecutorProfileId::new(BaseCodingAgent::ClaudeCode),
            disclaimer_acknowledged: false,
            onboarding_acknowledged: false,
            notifications: NotificationConfig::default(),
            editor: EditorConfig::default(),
            github: GitHubConfig::default(),
            analytics_enabled: true,
            workspace_dir: None,
            language: UiLanguage::default(),
            git_branch_prefix: default_git_branch_prefix(),
            showcases: ShowcaseState::default(),
            pr_auto_description_enabled: true,
            pr_auto_description_prompt: None,
            beta_workspaces: false,
            beta_workspaces_invitation_sent: false,
            commit_reminder_enabled: true,
            commit_reminder_prompt: None,
            send_message_shortcut: SendMessageShortcut::default(),
            agent_order: Vec::new(),
            project_order: Vec::new(),
            agent_enabled: default_agent_enabled(),
            commit_message_executor_profile: None,
            commit_message_enabled: default_commit_message_enabled(),
            commit_message_prompt: None,
            commit_message_single_commit: false,
            extra_fields: serde_json::Map::new(),
        }
    }
}

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
        // Start from a valid default config, then inject unknown agent variants
        let config = Config::default();
        let mut json: serde_json::Value = serde_json::to_value(&config).unwrap();
        let obj = json.as_object_mut().unwrap();
        obj.insert(
            "agent_enabled".to_string(),
            serde_json::json!(["CLAUDE_CODE", "TOTALLY_UNKNOWN_AGENT", "AMP"]),
        );
        obj.insert(
            "agent_order".to_string(),
            serde_json::json!(["TOTALLY_UNKNOWN_AGENT", "CLAUDE_CODE"]),
        );

        let parsed: Config = serde_json::from_value(json).unwrap();
        // Unknown variant should be skipped, known ones kept
        assert!(parsed.agent_enabled.contains(&BaseCodingAgent::ClaudeCode));
        assert!(parsed.agent_enabled.contains(&BaseCodingAgent::Amp));
        assert_eq!(parsed.agent_enabled.len(), 2); // TOTALLY_UNKNOWN_AGENT filtered out
        assert_eq!(parsed.agent_order.len(), 1); // Only CLAUDE_CODE
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
