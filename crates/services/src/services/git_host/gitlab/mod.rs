//! GitLab hosting service implementation.

mod cli;

use std::{path::Path, time::Duration};

use async_trait::async_trait;
use backon::{ExponentialBuilder, Retryable};
pub use cli::GlabCli;
use cli::{GitLabRepoInfo, GlabCliError};
use db::models::merge::PullRequestInfo;
use tokio::task;
use tracing::info;

use super::{
    GitHostProvider,
    types::{CreatePrRequest, GitHostError, OpenPrInfo, ProviderKind, UnifiedPrComment},
};

#[derive(Debug, Clone)]
pub struct GitLabProvider {
    glab_cli: GlabCli,
}

impl GitLabProvider {
    pub fn new() -> Result<Self, GitHostError> {
        Ok(Self {
            glab_cli: GlabCli::new(),
        })
    }

    async fn get_repo_info(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<GitLabRepoInfo, GitHostError> {
        let cli = self.glab_cli.clone();
        let path = repo_path.to_path_buf();
        let url = remote_url.to_string();
        task::spawn_blocking(move || cli.get_repo_info(&url, &path))
            .await
            .map_err(|err| GitHostError::Repository(format!("Failed to get repo info: {err}")))?
            .map_err(Into::into)
    }
}

impl From<GlabCliError> for GitHostError {
    fn from(error: GlabCliError) -> Self {
        match &error {
            GlabCliError::AuthFailed(msg) => GitHostError::AuthFailed(msg.clone()),
            GlabCliError::NotAvailable => GitHostError::CliNotInstalled {
                provider: ProviderKind::GitLab,
            },
            GlabCliError::CommandFailed(msg) => {
                let lower = msg.to_ascii_lowercase();
                if lower.contains("403") || lower.contains("forbidden") {
                    GitHostError::InsufficientPermissions(msg.clone())
                } else if lower.contains("404") || lower.contains("not found") {
                    GitHostError::RepoNotFoundOrNoAccess(msg.clone())
                } else {
                    GitHostError::PullRequest(msg.clone())
                }
            }
            GlabCliError::UnexpectedOutput(msg) => GitHostError::UnexpectedOutput(msg.clone()),
        }
    }
}

fn retry_builder() -> ExponentialBuilder {
    ExponentialBuilder::default()
        .with_min_delay(Duration::from_secs(1))
        .with_max_delay(Duration::from_secs(30))
        .with_max_times(3)
        .with_jitter()
}

#[async_trait]
impl GitHostProvider for GitLabProvider {
    async fn create_pr(
        &self,
        repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError> {
        let repo_info = self.get_repo_info(repo_path, remote_url).await?;
        let cli = self.glab_cli.clone();
        let request = request.clone();
        let path = repo_path.to_path_buf();
        (|| async {
            let cli = cli.clone();
            let request = request.clone();
            let path = path.clone();
            let repo_info = repo_info.clone();
            task::spawn_blocking(move || cli.create_pr(&request, &repo_info, &path))
                .await
                .map_err(|err| GitHostError::PullRequest(format!("Join error: {err}")))?
                .map_err(Into::into)
        })
        .retry(&retry_builder())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err, dur| {
            info!("glab create_pr retry in {:.2}s: {}", dur.as_secs_f64(), err);
        })
        .await
    }

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError> {
        let cli = self.glab_cli.clone();
        let url = pr_url.to_string();
        (|| async {
            let cli = cli.clone();
            let url = url.clone();
            task::spawn_blocking(move || cli.view_pr(&url))
                .await
                .map_err(|err| GitHostError::PullRequest(format!("Join error: {err}")))?
                .map_err(Into::into)
        })
        .retry(&retry_builder())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err, dur| {
            info!("glab view_pr retry in {:.2}s: {}", dur.as_secs_f64(), err);
        })
        .await
    }

    async fn list_prs_for_branch(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError> {
        let repo_info = self.get_repo_info(repo_path, remote_url).await?;
        let cli = self.glab_cli.clone();
        let branch = branch_name.to_string();
        (|| async {
            let cli = cli.clone();
            let branch = branch.clone();
            let repo_info = repo_info.clone();
            task::spawn_blocking(move || cli.list_prs_for_branch(&repo_info, &branch))
                .await
                .map_err(|err| GitHostError::PullRequest(format!("Join error: {err}")))?
                .map_err(Into::into)
        })
        .retry(&retry_builder())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err, dur| {
            info!("glab list retry in {:.2}s: {}", dur.as_secs_f64(), err);
        })
        .await
    }

    async fn get_pr_comments(
        &self,
        repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError> {
        let repo_info = self.get_repo_info(repo_path, remote_url).await?;
        let cli = self.glab_cli.clone();
        task::spawn_blocking(move || cli.get_pr_comments(&repo_info, pr_number))
            .await
            .map_err(|err| GitHostError::PullRequest(format!("Join error: {err}")))?
            .map_err(Into::into)
    }

    async fn list_open_prs(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError> {
        let repo_info = self.get_repo_info(repo_path, remote_url).await?;
        let cli = self.glab_cli.clone();
        (|| async {
            let cli = cli.clone();
            let repo_info = repo_info.clone();
            task::spawn_blocking(move || cli.list_open_prs(&repo_info))
                .await
                .map_err(|err| GitHostError::PullRequest(format!("Join error: {err}")))?
                .map_err(Into::into)
        })
        .retry(&retry_builder())
        .when(|e: &GitHostError| e.should_retry())
        .notify(|err, dur| {
            info!(
                "glab list_open_prs retry in {:.2}s: {}",
                dur.as_secs_f64(),
                err
            );
        })
        .await
    }

    fn provider_kind(&self) -> ProviderKind {
        ProviderKind::GitLab
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_kind_is_gitlab() {
        let p = GitLabProvider::new().unwrap();
        assert_eq!(p.provider_kind(), ProviderKind::GitLab);
    }
}
