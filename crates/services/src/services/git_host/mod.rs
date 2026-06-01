pub mod detection;
mod probe;
mod types;

pub mod azure;
pub mod github;
pub mod gitlab;

use std::path::Path;

use async_trait::async_trait;
use db::models::merge::PullRequestInfo;
use detection::detect_provider_from_url;
use enum_dispatch::enum_dispatch;
pub use types::{
    CreatePrRequest, GitHostError, OpenPrInfo, PrComment, PrCommentAuthor, PrReviewComment,
    ProviderKind, ReviewCommentUser, UnifiedPrComment,
};

use self::{azure::AzureDevOpsProvider, github::GitHubProvider, gitlab::GitLabProvider};

#[async_trait]
#[enum_dispatch(GitHostService)]
pub trait GitHostProvider: Send + Sync {
    async fn create_pr(
        &self,
        repo_path: &Path,
        remote_url: &str,
        request: &CreatePrRequest,
    ) -> Result<PullRequestInfo, GitHostError>;

    async fn get_pr_status(&self, pr_url: &str) -> Result<PullRequestInfo, GitHostError>;

    async fn list_prs_for_branch(
        &self,
        repo_path: &Path,
        remote_url: &str,
        branch_name: &str,
    ) -> Result<Vec<PullRequestInfo>, GitHostError>;

    async fn get_pr_comments(
        &self,
        repo_path: &Path,
        remote_url: &str,
        pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GitHostError>;

    async fn list_open_prs(
        &self,
        repo_path: &Path,
        remote_url: &str,
    ) -> Result<Vec<OpenPrInfo>, GitHostError>;

    fn provider_kind(&self) -> ProviderKind;
}

#[enum_dispatch]
pub enum GitHostService {
    GitHub(GitHubProvider),
    AzureDevOps(AzureDevOpsProvider),
    GitLab(GitLabProvider),
}

impl GitHostService {
    pub fn from_url(url: &str) -> Result<Self, GitHostError> {
        match detect_provider_from_url(url) {
            ProviderKind::GitHub => Ok(Self::GitHub(GitHubProvider::new()?)),
            ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(AzureDevOpsProvider::new()?)),
            ProviderKind::GitLab => Ok(Self::GitLab(GitLabProvider::new()?)),
            ProviderKind::Unknown => Err(GitHostError::UnsupportedProvider),
        }
    }

    /// Like `from_url`, but if the URL heuristic yields `Unknown`, try a
    /// `glab repo view` probe. Use only on the create-MR/PR path —
    /// avoid in hot loops like pr_monitor.
    pub fn from_url_with_probe(url: &str, repo_path: &Path) -> Result<Self, GitHostError> {
        match Self::from_url(url) {
            Ok(svc) => return Ok(svc),
            Err(GitHostError::UnsupportedProvider) => {
                // fall through to probe — heuristic failed but URL might still be GitLab
            }
            Err(e) => return Err(e),
        }
        if probe::probe_provider(url, repo_path) == ProviderKind::GitLab {
            return Ok(Self::GitLab(GitLabProvider::new()?));
        }
        Err(GitHostError::UnsupportedProvider)
    }
}

#[cfg(test)]
mod factory_tests {
    use super::*;

    #[test]
    fn from_url_recognizes_gitlab_com() {
        let svc = GitHostService::from_url("https://gitlab.com/group/repo").unwrap();
        assert_eq!(svc.provider_kind(), ProviderKind::GitLab);
    }

    #[test]
    fn from_url_recognizes_self_hosted_gitlab() {
        let svc = GitHostService::from_url("https://gitlab.company.com/group/repo").unwrap();
        assert_eq!(svc.provider_kind(), ProviderKind::GitLab);
    }

    #[test]
    fn from_url_with_probe_falls_back_to_unsupported() {
        // unknown domain → heuristic returns Unknown → from_url returns Err(UnsupportedProvider).
        // probe also returns Unknown (glab either missing in CI OR the unresolvable hostname
        // makes `glab repo view` fail). Final result: Err(UnsupportedProvider).
        let tmp = std::env::temp_dir();
        let result = GitHostService::from_url_with_probe("https://code.unknown.example/x/y", &tmp);
        let err_kind = match &result {
            Ok(svc) => format!("Ok({:?})", svc.provider_kind()),
            Err(e) => format!("Err({e:?})"),
        };
        assert!(
            matches!(result, Err(GitHostError::UnsupportedProvider)),
            "expected UnsupportedProvider, got {err_kind}"
        );
    }
}
