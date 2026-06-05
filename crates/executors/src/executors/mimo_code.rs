use std::{path::Path, sync::Arc, time::Duration};

use async_trait::async_trait;
use command_group::{AsyncCommandGroup, AsyncGroupChild};
use derivative::Derivative;
use futures::StreamExt;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::{io::AsyncBufReadExt, process::Command};
use ts_rs::TS;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, apply_overrides},
    env::{ExecutionEnv, remove_vibe_board_port_env},
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, ExecutorExitResult, SpawnedChild,
        StandardCodingAgentExecutor, mimo_code::types::MiMoCodeExecutorEvent,
    },
    logs::utils::{ConversationSink, patch},
    stdout_dup::create_stdout_pipe_writer,
};

use self::sdk::TaskApiClient;

mod models;
mod normalize_logs;
mod sdk;
mod slash_commands;
mod types;

use sdk::{LogWriter, RunConfig, generate_server_password, run_session, run_slash_command};
use slash_commands::{MiMoCodeSlashCommand, hardcoded_slash_commands};

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
pub struct MiMoCode {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mode")]
    pub agent: Option<String>,
    /// Auto-approve agent actions
    #[serde(default = "default_to_true")]
    pub auto_approve: bool,
    /// Enable auto-compaction when the context length approaches the model's context window limit
    #[serde(default = "default_to_true")]
    pub auto_compact: bool,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    pub approvals: Option<Arc<dyn ExecutorApprovalService>>,
    /// Shared cell for the TaskApiClient. The spawned task writes it once the
    /// MiMoCode server is ready; normalize_logs reads from it when handling
    /// task.updated events.
    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    task_api: Arc<tokio::sync::OnceCell<TaskApiClient>>,
}

/// Represents a spawned MiMoCode server with its base URL
struct MiMoCodeServer {
    #[allow(unused)]
    child: Option<AsyncGroupChild>,
    base_url: String,
    server_password: ServerPassword,
}

impl Drop for MiMoCodeServer {
    fn drop(&mut self) {
        // kill the process properly using the kill helper as the native kill_on_drop doesn't work reliably causing orphaned processes and memory leaks
        if let Some(mut child) = self.child.take() {
            tokio::spawn(async move {
                let _ = workspace_utils::process::kill_process_group(&mut child).await;
            });
        }
    }
}

type ServerPassword = String;

const DEFAULT_MIMOCODE_BASE: &str = "mimo";

impl MiMoCode {
    fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let builder = CommandBuilder::new(DEFAULT_MIMOCODE_BASE)
            // Pass hostname/port as separate args so MiMoCode treats them as explicitly set
            // (it checks `process.argv.includes("--port")` / `"--hostname"`).
            .extend_params(["serve", "--hostname", "127.0.0.1", "--port", "0"]);
        apply_overrides(builder, &self.cmd)
    }

    pub fn build_interactive_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(DEFAULT_MIMOCODE_BASE);
        if let Some(model) = &self.model {
            builder = builder.extend_params(["--model", model]);
        }
        apply_overrides(builder, &self.cmd)
    }

    /// Compute a cache key for model context windows based on configuration that can affect the list of available models.
    fn compute_models_cache_key(&self) -> String {
        serde_json::to_string(&self.cmd).unwrap_or_default()
    }

    /// Common boilerplate for spawning a MiMoCode server process.
    async fn spawn_server_process(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<(AsyncGroupChild, ServerPassword), ExecutorError> {
        let command_parts = self.build_command_builder()?.build_initial()?;
        let (program_path, args) = command_parts.into_resolved().await?;

        let server_password = generate_server_password();

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .current_dir(current_dir)
            .env("NPM_CONFIG_LOGLEVEL", "error")
            .env("NODE_NO_WARNINGS", "1")
            .env("NO_COLOR", "1")
            .env("MIMOCODE_SERVER_USERNAME", "mimocode")
            .env("MIMOCODE_SERVER_PASSWORD", &server_password)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);
        remove_vibe_board_port_env(&mut command);

        let child = command.group_spawn()?;

        Ok((child, server_password))
    }

    /// Handles process spawning, waiting for the server URL
    async fn spawn_server(
        &self,
        current_dir: &Path,
        env: &ExecutionEnv,
    ) -> Result<MiMoCodeServer, ExecutorError> {
        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("MiMoCode server missing stdout"))
        })?;

        let base_url = wait_for_server_url(server_stdout, None).await?;

        Ok(MiMoCodeServer {
            child: Some(child),
            base_url,
            server_password,
        })
    }

    async fn spawn_inner(
        &self,
        current_dir: &Path,
        prompt: &str,
        resume_session: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let slash_command = MiMoCodeSlashCommand::parse(prompt);
        let combined_prompt = if slash_command.is_some() {
            prompt.to_string()
        } else {
            self.append_prompt.combine_prompt(prompt)
        };

        let (mut child, server_password) = self.spawn_server_process(current_dir, env).await?;
        let server_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("MiMoCode server missing stdout"))
        })?;

        let stdout = create_stdout_pipe_writer(&mut child)?;
        let log_writer = LogWriter::new(stdout);

        let (exit_signal_tx, exit_signal_rx) = tokio::sync::oneshot::channel();
        let cancel = tokio_util::sync::CancellationToken::new();

        // Prepare config values that will be moved into the spawned task
        let directory = current_dir.to_string_lossy().to_string();
        let approvals = self.approvals.clone();
        let model = self.model.clone();
        let model_variant = self.variant.clone();
        let agent = self.agent.clone();
        let auto_approve = self.auto_approve;
        let resume_session_id = resume_session.map(|s| s.to_string());
        let models_cache_key = self.compute_models_cache_key();
        let cancel_for_task = cancel.clone();
        let commit_reminder = env.commit_reminder;
        let commit_reminder_prompt = env.commit_reminder_prompt.clone();
        let repo_context = env.repo_context.clone();
        let task_api = self.task_api.clone();
        let task_password = server_password.clone();

        tokio::spawn(async move {
            // Wait for server to print listening URL
            let base_url = match wait_for_server_url(server_stdout, Some(log_writer.clone())).await
            {
                Ok(url) => url,
                Err(err) => {
                    let _ = log_writer
                        .log_error(format!("MiMoCode startup error: {err}"))
                        .await;
                    let _ = exit_signal_tx.send(ExecutorExitResult::Failure);
                    return;
                }
            };

            // Store the TaskApiClient so normalize_logs can fetch task data.
            if let Ok(client) = sdk::build_mimocode_client(&directory, &task_password) {
                let _ = task_api.set(TaskApiClient::new(client, base_url.clone()));
            }

            let config = RunConfig {
                base_url,
                directory,
                prompt: combined_prompt,
                resume_session_id,
                model,
                model_variant,
                agent,
                approvals,
                auto_approve,
                server_password,
                models_cache_key,
                commit_reminder,
                commit_reminder_prompt,
                repo_context,
            };

            let result = match slash_command {
                Some(command) => {
                    run_slash_command(config, log_writer.clone(), command, cancel_for_task).await
                }
                None => run_session(config, log_writer.clone(), cancel_for_task).await,
            };
            let exit_result = match result {
                Ok(()) => ExecutorExitResult::Success,
                Err(err) => {
                    let _ = log_writer
                        .log_error(format!("MiMoCode executor error: {err}"))
                        .await;
                    ExecutorExitResult::Failure
                }
            };
            let _ = exit_signal_tx.send(exit_result);
        });

        Ok(SpawnedChild {
            child,
            exit_signal: Some(exit_signal_rx),
            cancel: Some(cancel),
            protocol_peer_rx: None,
        })
    }
}

fn format_tail(captured: Vec<String>) -> String {
    captured
        .into_iter()
        .rev()
        .take(12)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n")
}

async fn wait_for_server_url(
    stdout: tokio::process::ChildStdout,
    log_writer: Option<LogWriter>,
) -> Result<String, ExecutorError> {
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(180);
    let mut captured: Vec<String> = Vec::new();

    loop {
        if tokio::time::Instant::now() > deadline {
            return Err(ExecutorError::Io(std::io::Error::other(format!(
                "Timed out waiting for MiMoCode server to print listening URL.\nServer output tail:\n{}",
                format_tail(captured)
            ))));
        }

        let line = match tokio::time::timeout_at(deadline, lines.next_line()).await {
            Ok(Ok(Some(line))) => line,
            Ok(Ok(None)) => {
                return Err(ExecutorError::Io(std::io::Error::other(format!(
                    "MiMoCode server exited before printing listening URL.\nServer output tail:\n{}",
                    format_tail(captured)
                ))));
            }
            Ok(Err(err)) => return Err(ExecutorError::Io(err)),
            Err(_) => continue,
        };

        if let Some(log_writer) = &log_writer {
            log_writer
                .log_event(&MiMoCodeExecutorEvent::StartupLog {
                    message: line.clone(),
                })
                .await?;
        }
        if captured.len() < 64 {
            captured.push(line.clone());
        }

        if let Some(url) = line.trim().strip_prefix("mimocode server listening on ") {
            // Keep draining stdout to avoid backpressure on the server, but don't block startup.
            tokio::spawn(async move {
                let mut lines = tokio::io::BufReader::new(lines.into_inner()).lines();
                while let Ok(Some(_)) = lines.next_line().await {}
            });
            return Ok(url.trim().to_string());
        }
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for MiMoCode {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals = Some(approvals);
    }

    async fn available_slash_commands(
        &self,
        current_dir: &Path,
    ) -> Result<futures::stream::BoxStream<'static, json_patch::Patch>, ExecutorError> {
        let defaults = hardcoded_slash_commands();
        let this = self.clone();
        let current_dir = current_dir.to_path_buf();

        let initial = patch::slash_commands(defaults.clone(), true, None);

        let discovery_stream = futures::stream::once(async move {
            match this.discover_slash_commands(&current_dir).await {
                Ok(commands) => patch::slash_commands(commands, false, None),
                Err(e) => {
                    tracing::warn!("Failed to discover MiMoCode slash commands: {}", e);
                    patch::slash_commands(defaults, false, Some(e.to_string()))
                }
            }
        });

        Ok(Box::pin(
            futures::stream::once(async move { initial }).chain(discovery_stream),
        ))
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        let env = setup_compaction_env(self.auto_compact, &env);
        self.spawn_inner(current_dir, prompt, None, &env).await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        _reset_to_message_id: Option<&str>,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let env = setup_permissions_env(self.auto_approve, env);
        let env = setup_compaction_env(self.auto_compact, &env);
        self.spawn_inner(current_dir, prompt, Some(session_id), &env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<dyn ConversationSink>, worktree_path: &Path) {
        normalize_logs::normalize_logs_with_api(
            msg_store,
            worktree_path,
            self.task_api.clone(),
        );
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        #[cfg(not(windows))]
        {
            let base_dirs = xdg::BaseDirectories::with_prefix("mimocode");
            // First try mimocode.json, then mimocode.jsonc
            base_dirs
                .get_config_file("mimocode.json")
                .filter(|p| p.exists())
                .or_else(|| base_dirs.get_config_file("mimocode.jsonc"))
        }
        #[cfg(windows)]
        {
            let config_dir = std::env::var("XDG_CONFIG_HOME")
                .map(std::path::PathBuf::from)
                .ok()
                .or_else(|| dirs::home_dir().map(|p| p.join(".config")))
                .map(|p| p.join("mimocode"))?;

            let path = Some(config_dir.join("mimocode.json"))
                .filter(|p| p.exists())
                .unwrap_or_else(|| config_dir.join("mimocode.jsonc"));
            Some(path)
        }
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        let mcp_config_found = self
            .default_mcp_config_path()
            .map(|p| p.exists())
            .unwrap_or(false);

        // Check multiple installation indicator paths:
        // 1. XDG config dir: $XDG_CONFIG_HOME/mimocode
        // 2. XDG data dir: $XDG_DATA_HOME/mimocode
        // 3. XDG state dir: $XDG_STATE_HOME/mimocode
        // 4. MiMoCode CLI home: ~/.mimocode
        #[cfg(not(windows))]
        let installation_indicator_found = {
            let base_dirs = xdg::BaseDirectories::with_prefix("mimocode");

            let config_dir_exists = base_dirs
                .get_config_home()
                .map(|config| config.exists())
                .unwrap_or(false);

            let data_dir_exists = base_dirs
                .get_data_home()
                .map(|data| data.exists())
                .unwrap_or(false);

            let state_dir_exists = base_dirs
                .get_state_home()
                .map(|state| state.exists())
                .unwrap_or(false);

            config_dir_exists || data_dir_exists || state_dir_exists
        };

        #[cfg(windows)]
        let installation_indicator_found = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(std::path::PathBuf::from)
            .and_then(|p| p.join("mimocode").exists().then_some(()))
            .or_else(|| {
                dirs::home_dir()
                    .and_then(|p| p.join(".config").join("mimocode").exists().then_some(()))
            })
            .is_some();

        let home_mimocode_exists = dirs::home_dir()
            .map(|home| home.join(".mimocode").exists())
            .unwrap_or(false);

        if mcp_config_found || installation_indicator_found || home_mimocode_exists {
            AvailabilityInfo::InstallationFound
        } else {
            AvailabilityInfo::NotFound
        }
    }
}

impl Default for MiMoCode {
    fn default() -> Self {
        Self {
            append_prompt: Default::default(),
            model: None,
            variant: None,
            agent: None,
            auto_approve: true,
            auto_compact: true,
            cmd: Default::default(),
            approvals: None,
            task_api: Arc::new(tokio::sync::OnceCell::new()),
        }
    }
}

fn default_to_true() -> bool {
    true
}

fn setup_permissions_env(auto_approve: bool, env: &ExecutionEnv) -> ExecutionEnv {
    let mut env = env.clone();

    let permissions = match env.get("MIMOCODE_PERMISSION") {
        Some(existing) => Some(existing.to_string()),
        None => build_default_permissions(auto_approve),
    };

    if let Some(permissions) = permissions {
        env.insert("MIMOCODE_PERMISSION", &permissions);
    }
    env
}

fn build_default_permissions(auto_approve: bool) -> Option<String> {
    if auto_approve {
        None
    } else {
        Some(r#"{"edit":"ask","bash":"ask","webfetch":"ask","doom_loop":"ask","external_directory":"ask","question":"allow"}"#.to_string())
    }
}

fn setup_compaction_env(auto_compact: bool, env: &ExecutionEnv) -> ExecutionEnv {
    if !auto_compact {
        return env.clone();
    }

    let mut env = env.clone();
    let merged = merge_compaction_config(env.get("MIMOCODE_CONFIG_CONTENT").map(String::as_str));
    env.insert("MIMOCODE_CONFIG_CONTENT", merged);
    env
}

fn merge_compaction_config(existing_json: Option<&str>) -> String {
    let mut config: Map<String, Value> = existing_json
        .and_then(|value| serde_json::from_str(value.trim()).ok())
        .unwrap_or_default();

    let mut compaction = config
        .remove("compaction")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    compaction.insert("auto".to_string(), Value::Bool(true));
    config.insert("compaction".to_string(), Value::Object(compaction));

    serde_json::to_string(&config).unwrap_or_else(|_| r#"{"compaction":{"auto":true}}"#.to_string())
}
