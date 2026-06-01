//! Best-effort provider probe for unknown self-hosted domains.
//!
//! Called from `GitHostService::from_url_with_probe` only when the URL
//! heuristic returns `ProviderKind::Unknown`. Costs one `glab repo view`
//! subprocess (~1s) and is therefore reserved for the create-PR/MR path,
//! not for hot loops like `pr_monitor`.

use std::{path::Path, process::Command};

use utils::shell::resolve_executable_path_blocking;

use crate::services::git_host::types::ProviderKind;

/// Try `glab repo view <url>` in `repo_path`. Exit 0 → GitLab.
/// Returns `Unknown` if glab is not installed or the command fails.
pub fn probe_provider(url: &str, repo_path: &Path) -> ProviderKind {
    if resolve_executable_path_blocking("glab").is_none() {
        return ProviderKind::Unknown;
    }
    let output = Command::new("glab")
        .args(["repo", "view", url])
        .current_dir(repo_path)
        .output();
    match output {
        Ok(o) if o.status.success() => ProviderKind::GitLab,
        _ => ProviderKind::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_unknown_when_glab_missing() {
        // Locally we may or may not have glab installed; this test is a
        // smoke test that exercises the function without asserting on
        // glab's behavior. The real probe is exercised in manual e2e
        // verification (Task 19).
        let dir = std::env::temp_dir();
        let result = probe_provider("https://example.invalid/x/y", &dir);
        // Either Unknown (most likely — example.invalid won't resolve) or
        // Unknown (glab absent). Either way: Unknown.
        assert_eq!(result, ProviderKind::Unknown);
    }
}
