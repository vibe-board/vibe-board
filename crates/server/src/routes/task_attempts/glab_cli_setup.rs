use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessRunReason},
    session::{CreateSession, Session},
    workspace::Workspace,
};
use deployment::Deployment;
use executors::actions::ExecutorAction;
#[cfg(unix)]
use executors::{
    actions::{
        ExecutorActionType,
        script::{ScriptContext, ScriptRequest, ScriptRequestLanguage},
    },
    executors::ExecutorError,
};
use serde::{Deserialize, Serialize};
use services::services::container::ContainerService;
use ts_rs::TS;
use uuid::Uuid;

use crate::error::ApiError;

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GlabCliSetupError {
    BrewMissing,
    SetupHelperNotSupported,
    Other { message: String },
}

pub async fn run_glab_cli_setup(
    deployment: &crate::DeploymentImpl,
    workspace: &Workspace,
) -> Result<ExecutionProcess, ApiError> {
    let executor_action = get_glab_cli_setup_helper_action().await?;

    deployment
        .container()
        .ensure_container_exists(workspace)
        .await?;

    // Get or create a session for setup scripts
    let session =
        match Session::find_latest_by_workspace_id(&deployment.db().pool, workspace.id).await? {
            Some(s) => s,
            None => {
                Session::create(
                    &deployment.db().pool,
                    &CreateSession {
                        executor: Some("glab-cli".to_string()),
                    },
                    Uuid::new_v4(),
                    workspace.id,
                )
                .await?
            }
        };

    let execution_process = deployment
        .container()
        .start_execution(
            workspace,
            &session,
            &executor_action,
            &ExecutionProcessRunReason::SetupScript,
        )
        .await?;
    Ok(execution_process)
}

async fn get_glab_cli_setup_helper_action() -> Result<ExecutorAction, ApiError> {
    #[cfg(unix)]
    {
        use utils::shell::resolve_executable_path;

        if resolve_executable_path("brew").await.is_none() {
            return Err(ApiError::Executor(ExecutorError::ExecutableNotFound {
                program: "brew".to_string(),
            }));
        }

        // Install script
        let install_script = r#"#!/bin/bash
set -e
if ! command -v glab &> /dev/null; then
    echo "Installing GitLab CLI..."
    brew install glab
    echo "Installation complete!"
else
    echo "GitLab CLI already installed"
fi"#
        .to_string();

        let install_request = ScriptRequest {
            script: install_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
            working_dir: None,
        };

        // Auth script
        // Note: this helper only configures gitlab.com. Self-hosted users must
        // run `glab auth login --hostname <their-domain> --web` manually. The
        // frontend dialog surfaces this instruction.
        const AUTH_SCRIPT: &str =
            "glab auth login --hostname gitlab.com --web --git-protocol https";

        let auth_script = format!(
            r#"#!/bin/bash
set -e
{AUTH_SCRIPT}
"#
        );

        let auth_request = ScriptRequest {
            script: auth_script,
            language: ScriptRequestLanguage::Bash,
            context: ScriptContext::ToolInstallScript,
            working_dir: None,
        };

        // Chain them: install → auth
        Ok(ExecutorAction::new(
            ExecutorActionType::ScriptRequest(install_request),
            Some(Box::new(ExecutorAction::new(
                ExecutorActionType::ScriptRequest(auth_request),
                None,
            ))),
        ))
    }

    #[cfg(not(unix))]
    {
        use executors::executors::ExecutorError::SetupHelperNotSupported;
        Err(ApiError::Executor(SetupHelperNotSupported))
    }
}
