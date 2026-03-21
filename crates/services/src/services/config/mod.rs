use std::path::PathBuf;

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

/// Will always return config, trying old schemas or eventually returning default
pub async fn load_config_from_file(config_path: &PathBuf) -> Config {
    match std::fs::read_to_string(config_path) {
        Ok(raw_config) => Config::from(raw_config),
        Err(_) => {
            tracing::info!("No config file found, creating one");
            Config::default()
        }
    }
}

/// Saves the config to the given path
pub async fn save_config_to_file(
    config: &Config,
    config_path: &PathBuf,
) -> Result<(), ConfigError> {
    let raw_config = serde_json::to_string_pretty(config)?;
    std::fs::write(config_path, raw_config)?;
    Ok(())
}
