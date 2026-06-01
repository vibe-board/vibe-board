//! Low-level wrapper around the GitLab CLI (`glab`).

use std::{
    ffi::{OsStr, OsString},
    path::Path,
    process::Command,
};

use chrono::{DateTime, Utc};
use db::models::merge::{MergeStatus, PullRequestInfo};
use serde::Deserialize;
use thiserror::Error;
use url::Url;
use utils::shell::resolve_executable_path_blocking;

use crate::services::git_host::types::{CreatePrRequest, OpenPrInfo, UnifiedPrComment};

#[derive(Debug, Error)]
pub enum GlabCliError {
    #[error("glab CLI is not installed or not available in PATH")]
    NotAvailable,
    #[error("glab CLI command failed: {0}")]
    CommandFailed(String),
    #[error("glab CLI authentication failed: {0}")]
    AuthFailed(String),
    #[error("glab CLI returned unexpected output: {0}")]
    UnexpectedOutput(String),
}

#[derive(Debug, Clone)]
pub struct GitLabRepoInfo {
    /// Full namespace path (may contain `/` for subgroups, e.g. `group/sub`).
    pub owner: String,
    pub repo_name: String,
    pub hostname: Option<String>,
}

impl GitLabRepoInfo {
    /// Used as glab's `-R` argument.
    pub fn repo_spec(&self) -> String {
        format!("{}/{}", self.owner, self.repo_name)
    }
}

#[derive(Deserialize)]
struct GlabRepoViewResponse {
    full_path: String,
    name: String,
    web_url: String,
}

#[derive(Deserialize)]
struct GlabMrResponse {
    iid: i64,
    web_url: String,
    state: String,
    merged_at: Option<DateTime<Utc>>,
    merge_commit_sha: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    source_branch: Option<String>,
    #[serde(default)]
    target_branch: Option<String>,
}

fn map_state(state: &str) -> MergeStatus {
    match state {
        "opened" | "open" => MergeStatus::Open,
        "merged" => MergeStatus::Merged,
        "closed" => MergeStatus::Closed,
        _ => MergeStatus::Open,
    }
}

#[derive(Debug, Clone, Default)]
pub struct GlabCli;

impl GlabCli {
    pub fn new() -> Self {
        Self
    }

    fn ensure_available(&self) -> Result<(), GlabCliError> {
        resolve_executable_path_blocking("glab").ok_or(GlabCliError::NotAvailable)?;
        Ok(())
    }

    /// Run `glab <args>` in `dir` (or CWD). Returns stdout on success;
    /// detects auth failures from exit code and stderr keywords.
    fn run<I, S>(&self, args: I, dir: Option<&Path>) -> Result<String, GlabCliError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ensure_available()?;
        let glab = resolve_executable_path_blocking("glab").ok_or(GlabCliError::NotAvailable)?;
        let mut cmd = Command::new(&glab);
        cmd.args(args);
        if let Some(d) = dir {
            cmd.current_dir(d);
        }
        let output = cmd
            .output()
            .map_err(|e| GlabCliError::CommandFailed(format!("Failed to spawn glab: {e}")))?;
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            let lower = stderr.to_ascii_lowercase();
            if lower.contains("401")
                || lower.contains("unauthorized")
                || lower.contains("glab auth login")
                || lower.contains("not authenticated")
            {
                return Err(GlabCliError::AuthFailed(stderr));
            }
            return Err(GlabCliError::CommandFailed(stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn get_repo_info(
        &self,
        remote_url: &str,
        repo_path: &Path,
    ) -> Result<GitLabRepoInfo, GlabCliError> {
        let raw = self.run(["repo", "view", remote_url, "-F", "json"], Some(repo_path))?;
        Self::parse_repo_info_response(&raw)
    }

    fn parse_repo_info_response(raw: &str) -> Result<GitLabRepoInfo, GlabCliError> {
        let resp: GlabRepoViewResponse = serde_json::from_str(raw).map_err(|e| {
            GlabCliError::UnexpectedOutput(format!("Failed to parse glab repo view: {e}"))
        })?;
        // full_path looks like "group/sub/project" or "owner/repo"; the last
        // segment is repo_name, the rest is owner (subgroup-aware).
        let (owner, _repo_from_path) = match resp.full_path.rsplit_once('/') {
            Some((o, r)) => (o.to_string(), r.to_string()),
            None => {
                return Err(GlabCliError::UnexpectedOutput(format!(
                    "full_path missing namespace: {}",
                    resp.full_path
                )));
            }
        };
        let hostname = Url::parse(&resp.web_url)
            .ok()
            .and_then(|u| u.host_str().map(String::from));
        Ok(GitLabRepoInfo {
            owner,
            repo_name: resp.name,
            hostname,
        })
    }

    pub fn create_pr(
        &self,
        request: &CreatePrRequest,
        repo_info: &GitLabRepoInfo,
        repo_path: &Path,
    ) -> Result<PullRequestInfo, GlabCliError> {
        let body = request.body.as_deref().unwrap_or("");
        let repo_spec = repo_info.repo_spec();

        let mut args: Vec<OsString> = Vec::with_capacity(14);
        args.push("mr".into());
        args.push("create".into());
        args.push("-R".into());
        args.push(OsString::from(&repo_spec));
        args.push("-s".into());
        args.push(OsString::from(&request.head_branch));
        args.push("-b".into());
        args.push(OsString::from(&request.base_branch));
        args.push("-t".into());
        args.push(OsString::from(&request.title));
        args.push("-d".into());
        args.push(OsString::from(body));
        args.push("-y".into()); // non-interactive

        if request.draft.unwrap_or(false) {
            args.push("--draft".into());
        }

        let raw = self.run(args, Some(repo_path))?;
        Self::parse_mr_create_text(&raw)
    }

    fn parse_mr_create_text(raw: &str) -> Result<PullRequestInfo, GlabCliError> {
        let mr_url = raw
            .lines()
            .rev()
            .flat_map(|line| line.split_whitespace())
            .find(|token| token.starts_with("http") && token.contains("/-/merge_requests/"))
            .ok_or_else(|| {
                GlabCliError::UnexpectedOutput(format!("No MR URL found in glab output: {raw}"))
            })?
            .trim_end_matches(['.', ',', ';'])
            .to_string();

        let number = mr_url
            .rsplit('/')
            .next()
            .and_then(|s| {
                let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
                digits.parse::<i64>().ok()
            })
            .ok_or_else(|| {
                GlabCliError::UnexpectedOutput(format!("Cannot parse MR number from {mr_url}"))
            })?;

        Ok(PullRequestInfo {
            number,
            url: mr_url,
            status: MergeStatus::Open,
            merged_at: None,
            merge_commit_sha: None,
        })
    }

    pub fn view_pr(&self, pr_url: &str) -> Result<PullRequestInfo, GlabCliError> {
        let raw = self.run(["mr", "view", pr_url, "-F", "json"], None)?;
        Self::parse_mr_view(&raw)
    }

    fn parse_mr_view(raw: &str) -> Result<PullRequestInfo, GlabCliError> {
        let r: GlabMrResponse = serde_json::from_str(raw).map_err(|e| {
            GlabCliError::UnexpectedOutput(format!("Failed to parse glab mr view: {e}"))
        })?;
        Ok(PullRequestInfo {
            number: r.iid,
            url: r.web_url,
            status: map_state(&r.state),
            merged_at: r.merged_at,
            merge_commit_sha: r.merge_commit_sha,
        })
    }

    pub fn list_prs_for_branch(
        &self,
        repo_info: &GitLabRepoInfo,
        branch: &str,
    ) -> Result<Vec<PullRequestInfo>, GlabCliError> {
        let repo_spec = repo_info.repo_spec();
        let raw = self.run(
            [
                "mr", "list", "-R", &repo_spec, "-s", branch, "-A", "all", "-F", "json",
            ],
            None,
        )?;
        Self::parse_mr_list(&raw)
    }

    pub fn list_open_prs(
        &self,
        repo_info: &GitLabRepoInfo,
    ) -> Result<Vec<OpenPrInfo>, GlabCliError> {
        let repo_spec = repo_info.repo_spec();
        let raw = self.run(["mr", "list", "-R", &repo_spec, "-F", "json"], None)?;
        Self::parse_open_mr_list(&raw)
    }

    fn parse_mr_list(raw: &str) -> Result<Vec<PullRequestInfo>, GlabCliError> {
        let arr: Vec<GlabMrResponse> = serde_json::from_str(raw).map_err(|e| {
            GlabCliError::UnexpectedOutput(format!("Failed to parse glab mr list: {e}"))
        })?;
        Ok(arr
            .into_iter()
            .map(|r| PullRequestInfo {
                number: r.iid,
                url: r.web_url,
                status: map_state(&r.state),
                merged_at: r.merged_at,
                merge_commit_sha: r.merge_commit_sha,
            })
            .collect())
    }

    fn parse_open_mr_list(raw: &str) -> Result<Vec<OpenPrInfo>, GlabCliError> {
        let arr: Vec<GlabMrResponse> = serde_json::from_str(raw).map_err(|e| {
            GlabCliError::UnexpectedOutput(format!("Failed to parse glab mr list: {e}"))
        })?;
        Ok(arr
            .into_iter()
            .filter(|r| matches!(map_state(&r.state), MergeStatus::Open))
            .map(|r| OpenPrInfo {
                number: r.iid,
                url: r.web_url,
                title: r.title.unwrap_or_default(),
                head_branch: r.source_branch.unwrap_or_default(),
                base_branch: r.target_branch.unwrap_or_default(),
            })
            .collect())
    }

    /// Initial version returns empty list. Full notes/discussions support
    /// deferred (see plan section "Out of scope").
    pub fn get_pr_comments(
        &self,
        _repo_info: &GitLabRepoInfo,
        _pr_number: i64,
    ) -> Result<Vec<UnifiedPrComment>, GlabCliError> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glab_cli_constructs() {
        let _ = GlabCli::new();
    }

    #[test]
    fn parse_repo_info_handles_subgroup() {
        let raw = r#"{
            "full_path": "team/sub/project",
            "name": "project",
            "web_url": "https://gitlab.company.com/team/sub/project"
        }"#;
        let info = GlabCli::parse_repo_info_response(raw).expect("parse");
        assert_eq!(info.owner, "team/sub");
        assert_eq!(info.repo_name, "project");
        assert_eq!(info.hostname.as_deref(), Some("gitlab.company.com"));
    }

    #[test]
    fn parse_repo_info_handles_top_level() {
        let raw = r#"{
            "full_path": "owner/repo",
            "name": "repo",
            "web_url": "https://gitlab.com/owner/repo"
        }"#;
        let info = GlabCli::parse_repo_info_response(raw).expect("parse");
        assert_eq!(info.owner, "owner");
        assert_eq!(info.repo_name, "repo");
        assert_eq!(info.hostname.as_deref(), Some("gitlab.com"));
    }

    #[test]
    fn parse_mr_create_text_extracts_url_and_iid() {
        // glab prints the MR URL on the last line of stdout after success.
        let raw = "Creating merge request for feature into main in group/repo\n\
                   https://gitlab.com/group/repo/-/merge_requests/42\n";
        let info = GlabCli::parse_mr_create_text(raw).expect("parse");
        assert_eq!(info.number, 42);
        assert_eq!(
            info.url,
            "https://gitlab.com/group/repo/-/merge_requests/42"
        );
        assert!(matches!(info.status, db::models::merge::MergeStatus::Open));
    }

    #[test]
    fn parse_mr_create_text_handles_self_hosted_subgroup() {
        let raw = "https://gitlab.company.com/team/sub/project/-/merge_requests/7\n";
        let info = GlabCli::parse_mr_create_text(raw).expect("parse");
        assert_eq!(info.number, 7);
        assert_eq!(
            info.url,
            "https://gitlab.company.com/team/sub/project/-/merge_requests/7"
        );
    }

    #[test]
    fn parse_mr_view_open() {
        let raw = r#"{
            "iid": 99,
            "web_url": "https://gitlab.com/g/r/-/merge_requests/99",
            "state": "opened",
            "merged_at": null,
            "merge_commit_sha": null
        }"#;
        let info = GlabCli::parse_mr_view(raw).expect("parse");
        assert_eq!(info.number, 99);
        assert!(matches!(info.status, db::models::merge::MergeStatus::Open));
        assert!(info.merged_at.is_none());
    }

    #[test]
    fn parse_mr_view_merged() {
        let raw = r#"{
            "iid": 100,
            "web_url": "https://gitlab.com/g/r/-/merge_requests/100",
            "state": "merged",
            "merged_at": "2026-05-01T10:00:00Z",
            "merge_commit_sha": "abc123"
        }"#;
        let info = GlabCli::parse_mr_view(raw).expect("parse");
        assert!(matches!(
            info.status,
            db::models::merge::MergeStatus::Merged
        ));
        assert_eq!(info.merge_commit_sha.as_deref(), Some("abc123"));
    }

    #[test]
    fn parse_mr_view_closed() {
        let raw = r#"{
            "iid": 101,
            "web_url": "https://gitlab.com/g/r/-/merge_requests/101",
            "state": "closed",
            "merged_at": null,
            "merge_commit_sha": null
        }"#;
        let info = GlabCli::parse_mr_view(raw).expect("parse");
        assert!(matches!(
            info.status,
            db::models::merge::MergeStatus::Closed
        ));
    }

    #[test]
    fn parse_mr_list_filters_by_state() {
        let raw = r#"[
            {"iid": 1, "web_url": "https://gitlab.com/g/r/-/merge_requests/1", "state": "opened", "merged_at": null, "merge_commit_sha": null},
            {"iid": 2, "web_url": "https://gitlab.com/g/r/-/merge_requests/2", "state": "merged", "merged_at": "2026-05-01T10:00:00Z", "merge_commit_sha": "deadbeef"}
        ]"#;
        let items = GlabCli::parse_mr_list(raw).expect("parse");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].number, 1);
        assert!(matches!(
            items[1].status,
            db::models::merge::MergeStatus::Merged
        ));
    }

    #[test]
    fn parse_open_mr_list_filters_and_maps_to_open_pr_info() {
        let raw = r#"[
            {
                "iid": 5,
                "web_url": "https://gitlab.com/g/r/-/merge_requests/5",
                "state": "opened",
                "merged_at": null,
                "merge_commit_sha": null,
                "title": "Add feature X",
                "source_branch": "feat/x",
                "target_branch": "main"
            },
            {
                "iid": 6,
                "web_url": "https://gitlab.com/g/r/-/merge_requests/6",
                "state": "merged",
                "merged_at": "2026-05-01T10:00:00Z",
                "merge_commit_sha": "abc",
                "title": "Already merged",
                "source_branch": "feat/old",
                "target_branch": "main"
            },
            {
                "iid": 7,
                "web_url": "https://gitlab.com/g/r/-/merge_requests/7",
                "state": "closed",
                "merged_at": null,
                "merge_commit_sha": null,
                "title": "Abandoned",
                "source_branch": "feat/dead",
                "target_branch": "main"
            }
        ]"#;
        let items = GlabCli::parse_open_mr_list(raw).expect("parse");
        // Only the "opened" MR should pass through; merged + closed are filtered.
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].number, 5);
        assert_eq!(items[0].url, "https://gitlab.com/g/r/-/merge_requests/5");
        assert_eq!(items[0].title, "Add feature X");
        assert_eq!(items[0].head_branch, "feat/x");
        assert_eq!(items[0].base_branch, "main");
    }

    #[test]
    fn parse_open_mr_list_handles_missing_optional_fields() {
        // Defensive: glab might return MRs without title/source_branch/target_branch
        // in some configurations. unwrap_or_default() must produce empty strings.
        let raw = r#"[
            {
                "iid": 8,
                "web_url": "https://gitlab.com/g/r/-/merge_requests/8",
                "state": "opened",
                "merged_at": null,
                "merge_commit_sha": null
            }
        ]"#;
        let items = GlabCli::parse_open_mr_list(raw).expect("parse");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].number, 8);
        assert_eq!(items[0].title, "");
        assert_eq!(items[0].head_branch, "");
        assert_eq!(items[0].base_branch, "");
    }
}
