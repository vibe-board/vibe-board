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

    /// Construct a provider directly from a known kind, bypassing URL
    /// detection. Used when the user has set a `host_provider_override` on the
    /// repo. Returns `UnsupportedProvider` for `ProviderKind::Unknown` to
    /// keep the contract symmetric with `from_url`.
    pub fn from_provider_kind(kind: ProviderKind) -> Result<Self, GitHostError> {
        match kind {
            ProviderKind::GitHub => Ok(Self::GitHub(GitHubProvider::new()?)),
            ProviderKind::AzureDevOps => Ok(Self::AzureDevOps(AzureDevOpsProvider::new()?)),
            ProviderKind::GitLab => Ok(Self::GitLab(GitLabProvider::new()?)),
            ProviderKind::Unknown => Err(GitHostError::UnsupportedProvider),
        }
    }

    /// Resolve the right provider for a repo:
    /// override → URL heuristic → glab probe → UnsupportedProvider.
    ///
    /// Use this everywhere code needs to choose a provider for a one-shot
    /// operation on a known repo (create_pr, list_open_prs, attach_pr,
    /// get_pr_comments). Hot/polling paths (e.g. branch-status display)
    /// should keep their own override + heuristic-only fast path because
    /// the probe spawns a `glab` subprocess.
    pub fn from_repo_or_url(
        override_kind: Option<&str>,
        url: &str,
        repo_path: &Path,
    ) -> Result<Self, GitHostError> {
        if let Some(kind) = override_kind
            .and_then(ProviderKind::from_snake_case)
            .filter(|k| !matches!(k, ProviderKind::Unknown))
        {
            return Self::from_provider_kind(kind);
        }
        Self::from_url_with_probe(url, repo_path)
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

    #[test]
    fn from_provider_kind_unknown_is_unsupported() {
        assert!(matches!(
            GitHostService::from_provider_kind(ProviderKind::Unknown),
            Err(GitHostError::UnsupportedProvider)
        ));
    }

    #[test]
    fn from_provider_kind_constructs_known_providers() {
        // If a provider CLI is genuinely missing, this returns CliNotInstalled.
        // Either way the variant we get back must match the requested kind
        // (or be a CliNotInstalled with the right `provider` field).
        for kind in [
            ProviderKind::GitHub,
            ProviderKind::AzureDevOps,
            ProviderKind::GitLab,
        ] {
            match GitHostService::from_provider_kind(kind) {
                Ok(svc) => assert_eq!(svc.provider_kind(), kind),
                Err(GitHostError::CliNotInstalled { provider }) => {
                    assert_eq!(provider, kind);
                }
                Err(e) => panic!("unexpected error for {kind:?}: {e:?}"),
            }
        }
    }

    #[test]
    fn from_repo_or_url_prefers_override() {
        // Override "git_lab" beats a github.com URL.
        let tmp = std::env::temp_dir();
        let result = GitHostService::from_repo_or_url(
            Some("git_lab"),
            "https://github.com/owner/repo",
            &tmp,
        );
        // Either Ok(GitLab) or Err(CliNotInstalled { provider: GitLab }) in CI.
        match result {
            Ok(svc) => assert_eq!(svc.provider_kind(), ProviderKind::GitLab),
            Err(GitHostError::CliNotInstalled { provider }) => {
                assert_eq!(provider, ProviderKind::GitLab);
            }
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }

    #[test]
    fn from_repo_or_url_falls_back_to_url_detection_when_no_override() {
        // No override → URL heuristic → returns GitHub for github.com URL.
        let tmp = std::env::temp_dir();
        let result = GitHostService::from_repo_or_url(None, "https://github.com/owner/repo", &tmp);
        match result {
            Ok(svc) => assert_eq!(svc.provider_kind(), ProviderKind::GitHub),
            Err(GitHostError::CliNotInstalled { provider }) => {
                assert_eq!(provider, ProviderKind::GitHub);
            }
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }

    #[test]
    fn from_repo_or_url_ignores_unknown_override_string() {
        // An unrecognized override snake-case string falls back to URL detection.
        let tmp = std::env::temp_dir();
        let result = GitHostService::from_repo_or_url(
            Some("bogus_value"),
            "https://github.com/owner/repo",
            &tmp,
        );
        match result {
            Ok(svc) => assert_eq!(svc.provider_kind(), ProviderKind::GitHub),
            Err(GitHostError::CliNotInstalled { provider }) => {
                assert_eq!(provider, ProviderKind::GitHub);
            }
            Err(e) => panic!("unexpected error: {e:?}"),
        }
    }
}
