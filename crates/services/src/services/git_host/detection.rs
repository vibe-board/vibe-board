//! Git hosting provider detection from repository URLs.

use super::types::ProviderKind;

/// Detect the git hosting provider from a remote URL.
///
/// Supports:
/// - GitHub.com: `https://github.com/owner/repo` or `git@github.com:owner/repo.git`
/// - GitHub Enterprise: URLs containing `github.` (e.g., `https://github.company.com/owner/repo`)
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo` or legacy `https://org.visualstudio.com/...`
pub fn detect_provider_from_url(url: &str) -> ProviderKind {
    let url_lower = url.to_lowercase();

    if url_lower.contains("github.com") {
        return ProviderKind::GitHub;
    }

    // Check Azure patterns first to avoid false positives with GHE
    if url_lower.contains("dev.azure.com")
        || url_lower.contains(".visualstudio.com")
        || url_lower.contains("ssh.dev.azure.com")
    {
        return ProviderKind::AzureDevOps;
    }

    // /_git/ is unique to Azure DevOps
    if url_lower.contains("/_git/") {
        return ProviderKind::AzureDevOps;
    }

    // GitHub Enterprise — must run before the GitLab heuristic so that
    // GitHub Pages URLs like gitlab.github.io route to GitHub.
    if url_lower.contains("github.") {
        return ProviderKind::GitHub;
    }

    // GitLab.com or self-hosted GitLab. Anchored to host boundaries to
    // avoid false positives on path components (gitlab.tar.gz) or
    // hostnames that merely embed "gitlab" (my-gitlab.tools).
    if url_lower.contains("//gitlab.")
        || url_lower.contains("@gitlab.")
        || url_lower.contains(".gitlab.")
    {
        return ProviderKind::GitLab;
    }

    ProviderKind::Unknown
}

/// Detect the git hosting provider from a PR URL.
///
/// Supports:
/// - GitHub: `https://github.com/owner/repo/pull/123`
/// - GitHub Enterprise: `https://github.company.com/owner/repo/pull/123`
/// - Azure DevOps: `https://dev.azure.com/org/project/_git/repo/pullrequest/123`
#[cfg(test)]
fn detect_provider_from_pr_url(pr_url: &str) -> ProviderKind {
    let url_lower = pr_url.to_lowercase();

    // GitHub pattern: contains /pull/ in the path
    if url_lower.contains("/pull/") {
        // Could be github.com or GHE
        if url_lower.contains("github.com") || url_lower.contains("github.") {
            return ProviderKind::GitHub;
        }
    }

    // GitLab pattern: contains /-/merge_requests/ in the path
    if url_lower.contains("/-/merge_requests/") {
        return ProviderKind::GitLab;
    }

    // Azure DevOps pattern: contains /pullrequest/ in the path
    if url_lower.contains("/pullrequest/") {
        return ProviderKind::AzureDevOps;
    }

    // Fall back to general URL detection
    detect_provider_from_url(pr_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_github_com_https() {
        assert_eq!(
            detect_provider_from_url("https://github.com/owner/repo"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.com/owner/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_github_com_ssh() {
        assert_eq!(
            detect_provider_from_url("git@github.com:owner/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_github_enterprise() {
        assert_eq!(
            detect_provider_from_url("https://github.company.com/owner/repo"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("https://github.acme.corp/team/project"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_url("git@github.internal.io:org/repo.git"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_azure_devops_https() {
        assert_eq!(
            detect_provider_from_url("https://dev.azure.com/org/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_ssh() {
        assert_eq!(
            detect_provider_from_url("git@ssh.dev.azure.com:v3/org/project/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_legacy_visualstudio() {
        assert_eq!(
            detect_provider_from_url("https://org.visualstudio.com/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_azure_devops_git_path() {
        // Any URL with /_git/ is Azure DevOps
        assert_eq!(
            detect_provider_from_url("https://custom.domain.com/org/project/_git/repo"),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_unknown_provider() {
        // gitlab.com handled in test_gitlab_com — leave only truly unknown hosts here
        assert_eq!(
            detect_provider_from_url("https://bitbucket.org/owner/repo"),
            ProviderKind::Unknown
        );
    }

    #[test]
    fn test_pr_url_github() {
        assert_eq!(
            detect_provider_from_pr_url("https://github.com/owner/repo/pull/123"),
            ProviderKind::GitHub
        );
        assert_eq!(
            detect_provider_from_pr_url("https://github.company.com/owner/repo/pull/456"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_pr_url_azure() {
        assert_eq!(
            detect_provider_from_pr_url(
                "https://dev.azure.com/org/project/_git/repo/pullrequest/123"
            ),
            ProviderKind::AzureDevOps
        );
        assert_eq!(
            detect_provider_from_pr_url(
                "https://org.visualstudio.com/project/_git/repo/pullrequest/456"
            ),
            ProviderKind::AzureDevOps
        );
    }

    #[test]
    fn test_gitlab_com() {
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/group/repo"),
            ProviderKind::GitLab
        );
        assert_eq!(
            detect_provider_from_url("https://gitlab.com/group/repo.git"),
            ProviderKind::GitLab
        );
        assert_eq!(
            detect_provider_from_url("git@gitlab.com:group/repo.git"),
            ProviderKind::GitLab
        );
    }

    #[test]
    fn test_gitlab_self_hosted() {
        assert_eq!(
            detect_provider_from_url("https://gitlab.company.com/group/repo"),
            ProviderKind::GitLab
        );
        assert_eq!(
            detect_provider_from_url("https://gitlab.internal.io/team/sub/project"),
            ProviderKind::GitLab
        );
        assert_eq!(
            detect_provider_from_url("git@gitlab.example.org:group/repo.git"),
            ProviderKind::GitLab
        );
    }

    #[test]
    fn test_pr_url_gitlab_mr() {
        assert_eq!(
            detect_provider_from_pr_url("https://gitlab.com/group/repo/-/merge_requests/123"),
            ProviderKind::GitLab
        );
        assert_eq!(
            detect_provider_from_pr_url(
                "https://gitlab.company.com/group/sub/repo/-/merge_requests/45"
            ),
            ProviderKind::GitLab
        );
    }

    #[test]
    fn test_gitlab_github_pages_routes_to_github() {
        // gitlab.github.io is a GitHub Pages host, not GitLab.
        // The GHE check must run before the GitLab heuristic to catch this.
        assert_eq!(
            detect_provider_from_url("https://gitlab.github.io/x/y"),
            ProviderKind::GitHub
        );
    }

    #[test]
    fn test_gitlab_heuristic_rejects_path_components() {
        assert_eq!(
            detect_provider_from_url("https://example.com/gitlab.tar.gz"),
            ProviderKind::Unknown
        );
        assert_eq!(
            detect_provider_from_url("https://example.com/path/with/gitlab.txt"),
            ProviderKind::Unknown
        );
    }

    #[test]
    fn test_gitlab_heuristic_rejects_substring_hostnames() {
        // "my-gitlab.tools" embeds "gitlab" but isn't GitLab.
        assert_eq!(
            detect_provider_from_url("https://my-gitlab.tools/owner/repo"),
            ProviderKind::Unknown
        );
    }
}
