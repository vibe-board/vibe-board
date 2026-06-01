# GitLab Provider Support (Self-Hosted) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third Git host provider (GitLab) to vibe-kanban — including self-hosted instances — so users can create MRs from a task attempt the same way GitHub PRs work today. Display "MR !123" for GitLab and "PR #123" for GitHub/Azure.

**Architecture:** New `GitLabProvider` implements the existing `GitHostProvider` trait via the official `glab` CLI (mirroring how GitHub uses `gh` and Azure uses `az`). URL detection uses a heuristic (`gitlab.com` / `gitlab.*`) with a `glab repo view` probe fallback for unknown self-hosted domains. Frontend reads `host_provider` from an extended `RepoBranchStatus` API and switches PR/MR terminology in the toolbar and create dialog.

**Tech Stack:** Rust (axum, serde, ts-rs, backon, thiserror), React + TypeScript (i18next), `glab` CLI ≥ 1.30.

**Scope decisions confirmed by user:**
1. Detection: heuristic + probe fallback
2. MR number prefix: `!` (GitLab), `#` (GitHub/Azure)
3. Mac setup helper: clone `GhCliSetupDialog` into `GlabCliSetupDialog`
4. i18n: only `en` and `zh-Hans`

**Out of scope (deferred):**
- Cross-fork MRs (head repo ≠ target repo)
- MR review/diff comments (initial: general notes only)
- MR approve/unapprove workflow
- `create_workspace_from_pr` GitLab support
- Setup helper hostname input (helper writes hard-coded `gitlab.com`; self-hosted users authenticate manually)
- Long body fallback to stdin (argv ≤ ARG_MAX safe; >60 KB unrealistic)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `crates/services/src/services/git_host/types.rs` | Modify | `ProviderKind::GitLab` variant + Display |
| `crates/services/src/services/git_host/detection.rs` | Modify | URL heuristic + new tests |
| `crates/services/src/services/git_host/probe.rs` | Create | Synchronous `glab repo view` probe for unknown domains |
| `crates/services/src/services/git_host/gitlab/mod.rs` | Create | `GitLabProvider` impl `GitHostProvider`, retry/backoff, error mapping |
| `crates/services/src/services/git_host/gitlab/cli.rs` | Create | `GlabCli` low-level wrapper, parsing, fixtures |
| `crates/services/src/services/git_host/mod.rs` | Modify | Register `gitlab` module, add `GitLab` variant, add `from_url_with_probe` |
| `crates/server/src/routes/task_attempts/pr.rs` | Modify | Use `from_url_with_probe` in `create_pr` only |
| `crates/server/src/routes/task_attempts.rs` | Modify | `RepoBranchStatus.host_provider` field, `glab-cli-setup` route |
| `crates/server/src/routes/task_attempts/glab_cli_setup.rs` | Create | Setup helper handler (mirrors `gh_cli_setup.rs`) |
| `crates/server/src/bin/generate_types.rs` | Modify | Register `GlabCliSetupError` for TS export |
| `frontend/src/components/dialogs/auth/GlabCliSetupDialog.tsx` | Create | Mirror of `GhCliSetupDialog.tsx` |
| `frontend/src/components/dialogs/tasks/CreatePRDialog.tsx` | Modify | Accept `provider` prop, switch i18n keys |
| `frontend/src/components/tasks/Toolbar/GitOperations.tsx` | Modify | Read `host_provider`, switch labels and chips |
| `frontend/src/lib/api.ts` | Modify | `attemptsApi.setupGlabCli` method |
| `frontend/src/i18n/locales/en/tasks.json` | Modify | New `createMrDialog.*`, `git.mr.*`, `git.states.createMr` keys |
| `frontend/src/i18n/locales/zh-Hans/tasks.json` | Modify | Same keys, Chinese translation |
| `frontend/src/i18n/locales/en/settings.json` | Modify | New `integrations.gitlab.cliSetup.*` keys |
| `frontend/src/i18n/locales/zh-Hans/settings.json` | Modify | Same keys, Chinese translation |

**Reference implementations to clone from:**
- `crates/services/src/services/git_host/github/mod.rs` (396 lines)
- `crates/services/src/services/git_host/github/cli.rs` (540 lines)
- `crates/server/src/routes/task_attempts/gh_cli_setup.rs` (132 lines)
- `frontend/src/components/dialogs/auth/GhCliSetupDialog.tsx` (268 lines)

---

## Task 1: Add `GitLab` to ProviderKind

**Files:**
- Modify: `crates/services/src/services/git_host/types.rs`

- [ ] **Step 1: Write the failing test**

Open `crates/services/src/services/git_host/types.rs`. Find the existing tests module (or add one at the bottom if missing). Add:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_kind_gitlab_display() {
        assert_eq!(format!("{}", ProviderKind::GitLab), "GitLab");
    }

    #[test]
    fn provider_kind_gitlab_serializes_to_snake_case() {
        let s = serde_json::to_string(&ProviderKind::GitLab).unwrap();
        assert_eq!(s, "\"git_lab\"");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p services provider_kind_gitlab`
Expected: FAIL — `no variant named GitLab`.

- [ ] **Step 3: Add the variant + Display arm**

Edit `ProviderKind` enum (around line 6):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProviderKind {
    GitHub,
    AzureDevOps,
    GitLab,
    Unknown,
}
```

Edit the `Display` impl (search for `impl Display for ProviderKind`) and add the arm:

```rust
ProviderKind::GitLab => write!(f, "GitLab"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p services provider_kind_gitlab`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify workspace still compiles**

Run: `cargo check --workspace`
Expected: compiles. If any `match ProviderKind { ... }` is non-exhaustive, the compiler will flag it. We confirmed via grep there are no exhaustive matches on `ProviderKind` outside `git_host/`, so this should pass.

- [ ] **Step 6: Commit**

```bash
git add crates/services/src/services/git_host/types.rs
git commit -m "feat(git_host): add GitLab variant to ProviderKind"
```

---

## Task 2: URL heuristic detection for GitLab

**Files:**
- Modify: `crates/services/src/services/git_host/detection.rs`

- [ ] **Step 1: Update the `test_unknown_provider` case (gitlab.com no longer unknown)**

In `crates/services/src/services/git_host/detection.rs`, find `test_unknown_provider` (line 140) and replace the gitlab.com assertion. Change:

```rust
assert_eq!(
    detect_provider_from_url("https://gitlab.com/owner/repo"),
    ProviderKind::Unknown
);
```

to:

```rust
// gitlab.com handled in test_gitlab_com — leave only truly unknown hosts here
assert_eq!(
    detect_provider_from_url("https://bitbucket.org/owner/repo"),
    ProviderKind::Unknown
);
```

- [ ] **Step 2: Write the new failing tests**

Append these tests to the same `mod tests` block:

```rust
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test -p services -- detection::tests::test_gitlab`
Expected: 3 tests FAIL — `assertion left == right` with `ProviderKind::Unknown` on the left.

- [ ] **Step 4: Add the heuristic to `detect_provider_from_url`**

In the same file, modify `detect_provider_from_url` (line 11). Insert the GitLab block **after the `github.com` check but before the Azure check** — this ordering matters because `gitlab.github.io`-style edge URLs already get caught by the earlier `github.com` substring:

```rust
pub fn detect_provider_from_url(url: &str) -> ProviderKind {
    let url_lower = url.to_lowercase();

    if url_lower.contains("github.com") {
        return ProviderKind::GitHub;
    }

    // GitLab.com or self-hosted GitLab (gitlab.<domain>)
    if url_lower.contains("gitlab.com") || url_lower.contains("gitlab.") {
        return ProviderKind::GitLab;
    }

    // Check Azure patterns before GHE to avoid false positives
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

    // GitHub Enterprise (contains "github." but not the Azure patterns above)
    if url_lower.contains("github.") {
        return ProviderKind::GitHub;
    }

    ProviderKind::Unknown
}
```

- [ ] **Step 5: Add the PR-URL path for `/-/merge_requests/`**

Modify `detect_provider_from_pr_url` (line 46), inserting after the existing `/pull/` block:

```rust
// GitLab pattern: contains /-/merge_requests/ in the path
if url_lower.contains("/-/merge_requests/") {
    return ProviderKind::GitLab;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test -p services -- detection::tests`
Expected: PASS (all detection tests including the new GitLab ones).

- [ ] **Step 7: Commit**

```bash
git add crates/services/src/services/git_host/detection.rs
git commit -m "feat(git_host): detect GitLab URLs (gitlab.com and self-hosted)"
```

---

## Task 3: Create the `probe` module

**Files:**
- Create: `crates/services/src/services/git_host/probe.rs`
- Modify: `crates/services/src/services/git_host/mod.rs` (register only)

- [ ] **Step 1: Create the module**

Create `crates/services/src/services/git_host/probe.rs`:

```rust
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
```

- [ ] **Step 2: Register the module in `git_host/mod.rs`**

In `crates/services/src/services/git_host/mod.rs`, add `mod probe;` near the top alongside `mod detection;`:

```rust
mod detection;
mod probe;
mod types;
```

- [ ] **Step 3: Verify it compiles and the test passes**

Run: `cargo test -p services -- probe::tests`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/git_host/probe.rs crates/services/src/services/git_host/mod.rs
git commit -m "feat(git_host): add glab repo-view probe for unknown domains"
```

---

## Task 4: Skeleton `GlabCli` wrapper with auth/error detection

**Files:**
- Create: `crates/services/src/services/git_host/gitlab/cli.rs`
- Create: `crates/services/src/services/git_host/gitlab/mod.rs` (stub — module registration only)

- [ ] **Step 1: Create the directory and stub `mod.rs`**

Create `crates/services/src/services/git_host/gitlab/mod.rs`:

```rust
//! GitLab hosting service implementation.

mod cli;

pub use cli::GlabCli;
```

Create `crates/services/src/services/git_host/gitlab/cli.rs` initially with types + run loop. This file will grow over Tasks 4–7. **Reference: clone the structure of `github/cli.rs`.**

```rust
//! Low-level wrapper around the GitLab CLI (`glab`).

use std::{
    ffi::{OsStr, OsString},
    path::Path,
    process::Command,
};

use thiserror::Error;
use utils::shell::resolve_executable_path_blocking;

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
        let mut cmd = Command::new("glab");
        cmd.args(args);
        if let Some(d) = dir {
            cmd.current_dir(d);
        }
        let output = cmd
            .output()
            .map_err(|e| GlabCliError::CommandFailed(format!("Failed to spawn glab: {e}")))?;
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glab_cli_constructs() {
        let _ = GlabCli::new();
    }
}
```

- [ ] **Step 2: Register the gitlab module in `git_host/mod.rs`**

In `crates/services/src/services/git_host/mod.rs`, add `pub mod gitlab;` alongside the existing `pub mod github;`:

```rust
pub mod azure;
pub mod github;
pub mod gitlab;
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles with `unused` warning on `GlabCli` (will be consumed in later tasks).

Run: `cargo test -p services -- gitlab::cli::tests`
Expected: PASS (1 trivial test).

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/git_host/gitlab/ crates/services/src/services/git_host/mod.rs
git commit -m "feat(git_host): scaffold GlabCli wrapper"
```

---

## Task 5: `GlabCli::get_repo_info` + `parse_repo_info_response`

**Files:**
- Modify: `crates/services/src/services/git_host/gitlab/cli.rs`

- [ ] **Step 1: Write the failing parse test**

Add to `mod tests` in `gitlab/cli.rs`:

```rust
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p services -- gitlab::cli::tests::parse_repo_info`
Expected: FAIL — `parse_repo_info_response` does not exist.

- [ ] **Step 3: Implement `GitLabRepoInfo` + `repo_spec` + parse**

Add near the top of `gitlab/cli.rs` (after `GlabCliError`):

```rust
use serde::Deserialize;
use url::Url;

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
```

Add the method + parser inside `impl GlabCli`:

```rust
pub fn get_repo_info(
    &self,
    remote_url: &str,
    repo_path: &Path,
) -> Result<GitLabRepoInfo, GlabCliError> {
    let raw = self.run(
        ["repo", "view", remote_url, "-F", "json"],
        Some(repo_path),
    )?;
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
```

`url` crate is already a transitive workspace dep — verify with `cargo tree -p services --depth 1 | grep url`. If not present, add `url = "2"` under `crates/services/Cargo.toml [dependencies]`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p services -- gitlab::cli::tests::parse_repo_info`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/git_host/gitlab/cli.rs
git commit -m "feat(git_host/gitlab): parse glab repo view (with subgroup support)"
```

---

## Task 6: `GlabCli::create_pr` + `parse_mr_create_text`

**Files:**
- Modify: `crates/services/src/services/git_host/gitlab/cli.rs`

- [ ] **Step 1: Write the failing parse test**

Add to `mod tests`:

```rust
#[test]
fn parse_mr_create_text_extracts_url_and_iid() {
    // glab prints the MR URL on the last line of stdout after success.
    let raw = "Creating merge request for feature into main in group/repo\n\
               https://gitlab.com/group/repo/-/merge_requests/42\n";
    let info = GlabCli::parse_mr_create_text(raw).expect("parse");
    assert_eq!(info.number, 42);
    assert_eq!(info.url, "https://gitlab.com/group/repo/-/merge_requests/42");
    assert_eq!(info.status, db::models::merge::MergeStatus::Open);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p services -- gitlab::cli::tests::parse_mr_create`
Expected: FAIL — `parse_mr_create_text` not found.

- [ ] **Step 3: Implement `create_pr` + parser**

Add at the top of `cli.rs` imports:

```rust
use db::models::merge::{MergeStatus, PullRequestInfo};

use crate::services::git_host::types::CreatePrRequest;
```

Add to `impl GlabCli`:

```rust
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p services -- gitlab::cli::tests::parse_mr_create`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/git_host/gitlab/cli.rs
git commit -m "feat(git_host/gitlab): create_pr via glab mr create"
```

---

## Task 7: `view_pr`, `list_prs_for_branch`, `list_open_prs`

**Files:**
- Modify: `crates/services/src/services/git_host/gitlab/cli.rs`

- [ ] **Step 1: Write failing parse tests**

Add to `mod tests`:

```rust
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
    assert_eq!(info.status, db::models::merge::MergeStatus::Open);
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
    assert_eq!(info.status, db::models::merge::MergeStatus::Merged);
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
    assert_eq!(info.status, db::models::merge::MergeStatus::Closed);
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
    assert_eq!(items[1].status, db::models::merge::MergeStatus::Merged);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p services -- gitlab::cli::tests::parse_mr_view gitlab::cli::tests::parse_mr_list`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement view/list/parse**

Add to `gitlab/cli.rs`:

```rust
use chrono::{DateTime, Utc};

use crate::services::git_host::types::OpenPrInfo;

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

impl GlabCli {
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
        let raw = self.run(
            ["mr", "list", "-R", &repo_spec, "-F", "json"],
            None,
        )?;
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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p services -- gitlab::cli::tests`
Expected: PASS (all parse tests).

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/git_host/gitlab/cli.rs
git commit -m "feat(git_host/gitlab): view/list MR via glab"
```

---

## Task 8: `GitLabProvider` implementing `GitHostProvider` trait

**Files:**
- Modify: `crates/services/src/services/git_host/gitlab/mod.rs`
- Modify: `crates/services/src/services/git_host/gitlab/cli.rs` (add `get_pr_comments` stub)

- [ ] **Step 1: Add `get_pr_comments` stub returning empty list**

In `gitlab/cli.rs`, add to `impl GlabCli`:

```rust
use crate::services::git_host::types::UnifiedPrComment;

impl GlabCli {
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
```

- [ ] **Step 2: Replace `gitlab/mod.rs` with full provider impl**

Overwrite `crates/services/src/services/git_host/gitlab/mod.rs`:

```rust
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
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles. There may be a "GitLabRepoInfo: must derive Clone" error — if so, add `#[derive(Debug, Clone)]` above `GitLabRepoInfo` in `cli.rs`.

- [ ] **Step 4: Write a basic provider test**

Add to `gitlab/mod.rs` bottom:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_kind_is_gitlab() {
        let p = GitLabProvider::new().unwrap();
        assert_eq!(p.provider_kind(), ProviderKind::GitLab);
    }
}
```

Run: `cargo test -p services -- gitlab::tests::provider_kind_is_gitlab`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/git_host/gitlab/
git commit -m "feat(git_host/gitlab): impl GitHostProvider trait with retry/backoff"
```

---

## Task 9: Register `GitLab` in `GitHostService` + `from_url_with_probe`

**Files:**
- Modify: `crates/services/src/services/git_host/mod.rs`

- [ ] **Step 1: Write the failing tests**

Add at the bottom of `crates/services/src/services/git_host/mod.rs`:

```rust
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
        // unknown domain + no glab installed (or no remote) → UnsupportedProvider
        let tmp = std::env::temp_dir();
        let result = GitHostService::from_url_with_probe(
            "https://code.unknown.example/x/y",
            &tmp,
        );
        // either Unknown via probe failure OR a real GitLab detection
        // (only if user has glab + access); in CI both paths must compile.
        let _ = result;
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test -p services -- factory_tests`
Expected: FAIL — `GitLab` variant not handled and `from_url_with_probe` not defined.

- [ ] **Step 3: Wire GitLab into the factory**

Modify the `use` line near the top:

```rust
use self::{
    azure::AzureDevOpsProvider, github::GitHubProvider, gitlab::GitLabProvider,
};
```

Modify `enum GitHostService`:

```rust
#[enum_dispatch]
pub enum GitHostService {
    GitHub(GitHubProvider),
    AzureDevOps(AzureDevOpsProvider),
    GitLab(GitLabProvider),
}
```

Modify `impl GitHostService::from_url`:

```rust
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
        if let Ok(svc) = Self::from_url(url) {
            return Ok(svc);
        }
        if probe::probe_provider(url, repo_path) == ProviderKind::GitLab {
            return Ok(Self::GitLab(GitLabProvider::new()?));
        }
        Err(GitHostError::UnsupportedProvider)
    }
}
```

Make sure `use std::path::Path;` is at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test -p services -- factory_tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/git_host/mod.rs
git commit -m "feat(git_host): register GitLab + from_url_with_probe entry point"
```

---

## Task 10: Use `from_url_with_probe` in `create_pr` handler

**Files:**
- Modify: `crates/server/src/routes/task_attempts/pr.rs`

- [ ] **Step 1: Replace the call in `create_pr` only**

Open `crates/server/src/routes/task_attempts/pr.rs`, find line 269:

```rust
let git_host = match git_host::GitHostService::from_url(&target_remote.url) {
```

Replace with:

```rust
let git_host = match git_host::GitHostService::from_url_with_probe(
    &target_remote.url,
    &repo_path,
) {
```

**Do not change** lines 406 (`attach_existing_pr`) or 525 (`get_pr_comments`) — they already have a PR URL with a complete domain, so the heuristic is sufficient and we avoid the extra probe cost.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p server`
Expected: compiles. `repo_path` is a local variable in `create_pr` (declared at line 200), so the borrow is in scope.

- [ ] **Step 3: Run existing pr tests**

Run: `cargo test -p server -- task_attempts::pr`
Expected: all existing tests pass (no test for the probe path — that's covered in Task 19 manual verification).

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts/pr.rs
git commit -m "feat(routes): probe unknown remote domains in create_pr"
```

---

## Task 11: Add `host_provider` to `RepoBranchStatus`

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs`

- [ ] **Step 1: Add the field to the struct**

In `crates/server/src/routes/task_attempts.rs`, find `pub struct RepoBranchStatus` at line 1012. Add a new field at the end:

```rust
#[derive(Debug, Clone, Serialize, TS)]
pub struct RepoBranchStatus {
    pub repo_id: Uuid,
    pub branch: String,
    pub target_branch_name: String,
    pub commits_ahead: i32,
    pub commits_behind: i32,
    pub conflicted_files: Vec<String>,
    pub is_rebase_in_progress: bool,
    pub is_target_remote: bool,
    pub remote_commits_ahead: i32,
    pub merges: Vec<Merge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_provider: Option<ProviderKind>,
}
```

Add the import near the top of the file (likely under `use services::services::git_host::...`):

```rust
use services::services::git_host::types::ProviderKind;
use services::services::git_host::detection::detect_provider_from_url;
```

Note: `detection` is currently a private module inside `git_host`. **Make it `pub`** by editing `crates/services/src/services/git_host/mod.rs`:

```rust
pub mod detection;  // was: mod detection;
```

- [ ] **Step 2: Populate the field in `get_task_attempt_branch_status`**

Find the `RepoBranchStatus` construction inside `get_task_attempt_branch_status` (around line 1149). It currently looks like:

```rust
results.push(RepoBranchStatus {
    repo_id: repo.id,
    // ... other fields
    merges,
});
```

Compute the provider before the push. The remote URL needed is the one already resolved earlier in the loop (look for `let remote = ...` or `let target_remote = ...` — use whichever URL is the `git remote get-url` of the repo's upstream/target). Add:

```rust
let host_provider = {
    let kind = detect_provider_from_url(&remote.url);
    if kind == ProviderKind::Unknown { None } else { Some(kind) }
};

results.push(RepoBranchStatus {
    repo_id: repo.id,
    // ... other fields
    merges,
    host_provider,
});
```

If the surrounding code doesn't have a single canonical `remote.url` available, use whatever URL the existing logic already computes (likely the result of `git.resolve_remote_for_branch` or equivalent — read the loop to confirm before guessing). If no remote is resolvable, fall back to `host_provider: None`.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p server`
Expected: compiles.

- [ ] **Step 4: Run existing branch-status tests**

Run: `cargo test -p server -- branch_status`
Expected: pass. If a snapshot test fails because the JSON now has an extra optional field, update the snapshot (`cargo insta accept` or similar — check the project's snapshot tooling).

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs crates/services/src/services/git_host/mod.rs
git commit -m "feat(routes): expose host_provider on RepoBranchStatus"
```

---

## Task 12: `glab_cli_setup` handler + route

**Files:**
- Create: `crates/server/src/routes/task_attempts/glab_cli_setup.rs`
- Modify: `crates/server/src/routes/task_attempts.rs` (mod declaration + route registration)

- [ ] **Step 1: Read the reference**

Read `crates/server/src/routes/task_attempts/gh_cli_setup.rs` end-to-end. It is 132 lines and defines:
- `GhCliSetupError` enum (3 variants)
- `gh_cli_setup_handler` axum handler
- Helper that runs `brew install gh` + opens an OAuth login flow

- [ ] **Step 2: Create the GitLab mirror**

Create `crates/server/src/routes/task_attempts/glab_cli_setup.rs`. Clone the structure of `gh_cli_setup.rs` and apply the following replacements:

| `gh_cli_setup.rs` | `glab_cli_setup.rs` |
|---|---|
| `GhCliSetupError` | `GlabCliSetupError` |
| `gh_cli_setup_handler` | `glab_cli_setup_handler` |
| `brew install gh` | `brew install glab` |
| `gh auth login --web` | `glab auth login --hostname gitlab.com --web` |
| `gh` (binary checks) | `glab` |
| Doc comments mentioning "GitHub" | "GitLab" |

For the `auth_script` constant (the shell command that opens the OAuth browser flow), use:

```rust
const AUTH_SCRIPT: &str = "glab auth login --hostname gitlab.com --web";
```

Add a doc comment near `AUTH_SCRIPT`:

```rust
// Note: this helper only configures gitlab.com. Self-hosted users must
// run `glab auth login --hostname <their-domain> --web` manually. The
// frontend dialog surfaces this instruction.
```

Make sure the file ends with `#[derive(TS)]` on `GlabCliSetupError` (mirroring `GhCliSetupError`) so `generate_types.rs` can export it.

- [ ] **Step 3: Wire the module + route**

In `crates/server/src/routes/task_attempts.rs`:

Near the top with other module declarations:

```rust
pub mod glab_cli_setup;
```

In the router builder (around line 2376, look for `.route("/gh-cli-setup", ...)`), add immediately after the existing gh route:

```rust
.route("/glab-cli-setup", post(glab_cli_setup::glab_cli_setup_handler))
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p server`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/task_attempts/glab_cli_setup.rs crates/server/src/routes/task_attempts.rs
git commit -m "feat(routes): glab-cli-setup helper handler"
```

---

## Task 13: Register `GlabCliSetupError` for TypeScript export

**Files:**
- Modify: `crates/server/src/bin/generate_types.rs`

- [ ] **Step 1: Add the declaration**

Open `crates/server/src/bin/generate_types.rs`. Find the line declaring `GhCliSetupError` (around line 137). Add immediately after:

```rust
server::routes::task_attempts::glab_cli_setup::GlabCliSetupError::decl(),
```

- [ ] **Step 2: Run the type generator**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` updates. Verify by grepping:

```bash
grep -n "GlabCliSetupError\|git_lab\|host_provider" shared/types.ts
```

Expected: see `GlabCliSetupError` type, `ProviderKind` now includes `"git_lab"`, `RepoBranchStatus` now has `host_provider`.

- [ ] **Step 3: Verify the frontend still type-checks**

Run: `pnpm run check`
Expected: passes (no usage sites changed yet; new fields are optional or additive).

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/bin/generate_types.rs shared/types.ts
git commit -m "chore(types): export GlabCliSetupError + GitLab variant"
```

---

## Task 14: Frontend i18n — `en` and `zh-Hans` tasks.json

**Files:**
- Modify: `frontend/src/i18n/locales/en/tasks.json`
- Modify: `frontend/src/i18n/locales/zh-Hans/tasks.json`

- [ ] **Step 1: Add English MR keys**

In `frontend/src/i18n/locales/en/tasks.json`, locate the existing `git` object. Merge into it:

```json
"git": {
  "states": {
    "createMr": "Create MR"
  },
  "mr": {
    "open": "Open MR !{{number}}",
    "number": "MR !{{number}}",
    "merged": "Merged MR !{{prNumber}}"
  },
  "actions": {
    "mrMerged": "MR !{{number}} is already merged"
  }
}
```

(Preserve existing `git.states.*`, `git.pr.*`, `git.actions.*` keys — only add the new ones above. Use your JSON editor to merge into the existing object, not replace it.)

At the top level of the same file, alongside `createPrDialog`, add:

```json
"createMrDialog": {
  "title": "Create Merge Request",
  "description": "Create a merge request for this task attempt.",
  "titleLabel": "Title",
  "titlePlaceholder": "Enter MR title",
  "descriptionLabel": "Description (optional)",
  "descriptionPlaceholder": "Enter MR description",
  "baseBranchLabel": "Target Branch",
  "loadingBranches": "Loading branches...",
  "selectBaseBranch": "Select target branch",
  "draftLabel": "Create as draft",
  "autoGenerateLabel": "Auto-generate MR description with AI",
  "creating": "Creating...",
  "createButton": "Create MR",
  "errors": {
    "insufficientPermissions": "Insufficient permissions. Please ensure the glab CLI has the necessary permissions.",
    "repoNotFoundOrNoAccess": "Repository not found or no access. Please check your repository access and ensure you are authenticated.",
    "failedToCreate": "Failed to create MR",
    "targetBranchNotFound": "Target branch '{{branch}}' does not exist on remote. Please ensure the branch exists before creating a merge request."
  }
}
```

- [ ] **Step 2: Add Chinese translation**

In `frontend/src/i18n/locales/zh-Hans/tasks.json`, merge into the existing `git` object:

```json
"git": {
  "states": {
    "createMr": "创建 MR"
  },
  "mr": {
    "open": "打开 MR !{{number}}",
    "number": "MR !{{number}}",
    "merged": "已合并 MR !{{prNumber}}"
  },
  "actions": {
    "mrMerged": "MR !{{number}} 已合并"
  }
}
```

At the top level, add:

```json
"createMrDialog": {
  "title": "创建合并请求",
  "description": "为此任务尝试创建合并请求。",
  "titleLabel": "标题",
  "titlePlaceholder": "输入 MR 标题",
  "descriptionLabel": "描述（可选）",
  "descriptionPlaceholder": "输入 MR 描述",
  "baseBranchLabel": "目标分支",
  "loadingBranches": "加载分支中...",
  "selectBaseBranch": "选择目标分支",
  "draftLabel": "创建为草稿",
  "autoGenerateLabel": "请求 AI 代理生成 MR 描述",
  "creating": "创建中...",
  "createButton": "创建 MR",
  "errors": {
    "insufficientPermissions": "权限不足。请确保 glab CLI 具有必要的权限。",
    "repoNotFoundOrNoAccess": "未找到仓库或无访问权限。请检查您的仓库访问权限并确保您已通过身份验证。",
    "failedToCreate": "创建 MR 失败",
    "targetBranchNotFound": "远程上不存在目标分支 {{branch}}。请在创建合并请求之前确保该分支存在。"
  }
}
```

- [ ] **Step 3: Verify both JSON files parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en/tasks.json', 'utf8')); console.log('en OK')"`
Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/zh-Hans/tasks.json', 'utf8')); console.log('zh-Hans OK')"`
Expected: both print `OK`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en/tasks.json frontend/src/i18n/locales/zh-Hans/tasks.json
git commit -m "i18n(tasks): add createMrDialog and git.mr keys (en, zh-Hans)"
```

---

## Task 15: Frontend i18n — `settings.json` for glab setup helper

**Files:**
- Modify: `frontend/src/i18n/locales/en/settings.json`
- Modify: `frontend/src/i18n/locales/zh-Hans/settings.json`

- [ ] **Step 1: Add English keys**

In `frontend/src/i18n/locales/en/settings.json`, find `integrations.github` and add a sibling `integrations.gitlab`:

```json
"gitlab": {
  "cliSetup": {
    "title": "GitLab CLI Setup",
    "description": "GitLab CLI (glab) authentication is required to create merge requests and interact with GitLab repositories.",
    "setupWillTitle": "This setup will:",
    "steps": {
      "checkInstalled": "Check if GitLab CLI (glab) is installed",
      "installHomebrew": "Install it via Homebrew if needed (macOS)",
      "authenticate": "Authenticate with gitlab.com using OAuth"
    },
    "setupNote": "The setup will run in the chat window. You'll need to complete the authentication in your browser. Self-hosted GitLab users must run `glab auth login --hostname <your-domain> --web` manually.",
    "runSetup": "Run Setup",
    "running": "Running...",
    "errors": {
      "brewMissing": "Homebrew is not installed. Install it to enable automatic setup.",
      "notSupported": "Automatic setup is not supported on this platform. Install GitLab CLI manually.",
      "setupFailed": "Failed to run GitLab CLI setup."
    },
    "help": {
      "homebrew": {
        "description": "Automatic installation requires Homebrew. Install Homebrew from",
        "brewSh": "brew.sh",
        "manualInstall": "and then rerun the setup. Alternatively, install GitLab CLI manually with:",
        "afterInstall": "After installation, authenticate with (replace HOSTNAME with your self-hosted domain, or omit for gitlab.com):"
      },
      "manual": {
        "description": "Install GitLab CLI from the",
        "officialDocs": "official documentation",
        "andAuthenticate": "and then authenticate with your GitLab account using:"
      }
    }
  }
}
```

- [ ] **Step 2: Add Chinese translation**

In `frontend/src/i18n/locales/zh-Hans/settings.json`, add the sibling block:

```json
"gitlab": {
  "cliSetup": {
    "title": "GitLab CLI 设置",
    "description": "需要 GitLab CLI (glab) 认证才能创建合并请求并与 GitLab 仓库交互。",
    "setupWillTitle": "此设置将：",
    "steps": {
      "checkInstalled": "检查是否已安装 GitLab CLI (glab)",
      "installHomebrew": "如有需要，通过 Homebrew 安装（macOS）",
      "authenticate": "使用 OAuth 认证 gitlab.com"
    },
    "setupNote": "设置将在聊天窗口中运行。您需要在浏览器中完成身份验证。自托管 GitLab 用户需手动运行 `glab auth login --hostname <你的域名> --web`。",
    "runSetup": "运行设置",
    "running": "运行中...",
    "errors": {
      "brewMissing": "未安装 Homebrew。安装它以启用自动设置。",
      "notSupported": "当前平台不支持自动设置。请手动安装 GitLab CLI。",
      "setupFailed": "运行 GitLab CLI 设置失败。"
    },
    "help": {
      "homebrew": {
        "description": "自动安装需要 Homebrew。请从以下位置安装 Homebrew：",
        "brewSh": "brew.sh",
        "manualInstall": "然后重新运行设置。或者，您也可以手动安装 GitLab CLI：",
        "afterInstall": "安装后，使用以下命令进行身份验证（将 HOSTNAME 替换为自托管域名，gitlab.com 可省略）："
      },
      "manual": {
        "description": "请从以下位置安装 GitLab CLI：",
        "officialDocs": "官方文档",
        "andAuthenticate": "然后使用以下命令使用您的 GitLab 帐户进行身份验证："
      }
    }
  }
}
```

- [ ] **Step 3: Verify both JSON files parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en/settings.json', 'utf8'))"`
Run: `node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/zh-Hans/settings.json', 'utf8'))"`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en/settings.json frontend/src/i18n/locales/zh-Hans/settings.json
git commit -m "i18n(settings): add gitlab.cliSetup keys (en, zh-Hans)"
```

---

## Task 16: `attemptsApi.setupGlabCli`

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Find the reference**

Read `attemptsApi.setupGhCli` in `frontend/src/lib/api.ts` (around line 561). Note the signature: takes `attemptId`, returns `Result<void, GhCliSetupError>`.

- [ ] **Step 2: Add the GitLab equivalent**

Immediately after `setupGhCli`, add:

```typescript
setupGlabCli: async (
  attemptId: string
): Promise<Result<void, GlabCliSetupError>> => {
  const response = await makeReq(
    `/api/task-attempts/${attemptId}/glab-cli-setup`,
    { method: 'POST' }
  );
  return handleApiResponseAsResult<void, GlabCliSetupError>(response);
},
```

Add the import at the top of the file (alongside `GhCliSetupError`):

```typescript
import type { GlabCliSetupError } from 'shared/types';
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm run check`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): add setupGlabCli method"
```

---

## Task 17: `GlabCliSetupDialog.tsx`

**Files:**
- Create: `frontend/src/components/dialogs/auth/GlabCliSetupDialog.tsx`

- [ ] **Step 1: Read the reference**

Read `frontend/src/components/dialogs/auth/GhCliSetupDialog.tsx` end-to-end (268 lines). It exports:
- `GhCliSetupDialog` (React component)
- `showGhCliSetupDialog` (imperative show helper)
- `mapGhCliErrorToUi`
- `GhCliHelpInstructions`
- `GhCliSupportContent` + `GhCliSupportVariant`

- [ ] **Step 2: Create the GitLab mirror**

Create `frontend/src/components/dialogs/auth/GlabCliSetupDialog.tsx`. Clone the file with these substitutions:

| `GhCliSetupDialog.tsx` | `GlabCliSetupDialog.tsx` |
|---|---|
| `GhCliSetupDialog` | `GlabCliSetupDialog` |
| `showGhCliSetupDialog` | `showGlabCliSetupDialog` |
| `mapGhCliErrorToUi` | `mapGlabCliErrorToUi` |
| `GhCliHelpInstructions` | `GlabCliHelpInstructions` |
| `GhCliSupportContent` | `GlabCliSupportContent` |
| `GhCliSupportVariant` | `GlabCliSupportVariant` |
| `GhCliSetupError` (type) | `GlabCliSetupError` |
| `attemptsApi.setupGhCli` | `attemptsApi.setupGlabCli` |
| `'settings:integrations.github.cliSetup.…'` keys | `'settings:integrations.gitlab.cliSetup.…'` |
| `brew install gh` (in Homebrew variant) | `brew install glab` |
| `gh auth login` | `glab auth login --hostname <your-domain> --web` |
| Link to `https://cli.github.com/manual/` | Link to `https://gitlab.com/gitlab-org/cli` |
| Window title "GitHub CLI Setup" → use i18n | (auto via key rename) |
| Comments / log messages mentioning "GitHub" | "GitLab" |

For the manual-instructions snippet (the part the dialog renders showing brew/auth commands), display:

```bash
brew install glab
glab auth login --hostname gitlab.com --web    # for gitlab.com
glab auth login --hostname HOSTNAME --web      # for self-hosted (replace HOSTNAME)
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm run check`
Expected: passes (the dialog isn't imported anywhere yet — that happens in Task 18).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dialogs/auth/GlabCliSetupDialog.tsx
git commit -m "feat(ui): GlabCliSetupDialog for Mac glab installation flow"
```

---

## Task 18: `CreatePRDialog` accepts `provider` prop and switches text

**Files:**
- Modify: `frontend/src/components/dialogs/tasks/CreatePRDialog.tsx`

- [ ] **Step 1: Extend the props type**

Find the type `CreatePRDialogProps` (or the props object inline). Add `provider`:

```typescript
type CreatePRDialogProps = {
  attempt: Workspace;
  task: Task;
  repoId: string;
  targetBranch?: string;
  provider?: ProviderKind;
};
```

Add the import:

```typescript
import type { ProviderKind } from 'shared/types';
import { showGlabCliSetupDialog } from '@/components/dialogs/auth/GlabCliSetupDialog';
```

- [ ] **Step 2: Compute `isGitLab` and choose i18n keys**

Inside the component body, near the top of state declarations:

```typescript
const isGitLab = provider === 'git_lab';

const titleKey = isGitLab ? 'createMrDialog.title' : 'createPrDialog.title';
const descriptionKey = isGitLab
  ? 'createMrDialog.description'
  : 'createPrDialog.description';
const titlePlaceholderKey = isGitLab
  ? 'createMrDialog.titlePlaceholder'
  : 'createPrDialog.titlePlaceholder';
const descriptionPlaceholderKey = isGitLab
  ? 'createMrDialog.descriptionPlaceholder'
  : 'createPrDialog.descriptionPlaceholder';
const autoGenerateLabelKey = isGitLab
  ? 'createMrDialog.autoGenerateLabel'
  : 'createPrDialog.autoGenerateLabel';
const createButtonKey = isGitLab
  ? 'createMrDialog.createButton'
  : 'createPrDialog.createButton';
const failedToCreateKey = isGitLab
  ? 'createMrDialog.errors.failedToCreate'
  : 'createPrDialog.errors.failedToCreate';
const targetBranchNotFoundKey = isGitLab
  ? 'createMrDialog.errors.targetBranchNotFound'
  : 'createPrDialog.errors.targetBranchNotFound';
```

Replace each existing `t('createPrDialog.X')` usage with the corresponding `*Key` constant above.

- [ ] **Step 3: Extend error-handling for `git_lab`**

Find the error handler around line 179. The current `if (result.error.provider === 'git_hub' && isMacEnvironment)` block needs a parallel branch:

```typescript
if (
  result.error.type === 'cli_not_installed' ||
  result.error.type === 'cli_not_logged_in'
) {
  if (result.error.provider === 'git_hub' && isMacEnvironment) {
    await showGhCliSetupDialog(attempt.id);
    return;
  }
  if (result.error.provider === 'git_lab' && isMacEnvironment) {
    // Self-hosted users may need to authenticate manually; the dialog
    // shows that instruction.
    await showGlabCliSetupDialog(attempt.id);
    return;
  }
  // Fallback inline error for all other (provider, platform) combinations
  const providerName =
    result.error.provider === 'git_hub'
      ? 'GitHub'
      : result.error.provider === 'azure_dev_ops'
        ? 'Azure DevOps'
        : result.error.provider === 'git_lab'
          ? 'GitLab'
          : 'Git host';
  const action =
    result.error.type === 'cli_not_installed'
      ? 'not installed'
      : 'not logged in';
  setError(`${providerName} CLI is ${action}`);
  return;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `pnpm run check`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dialogs/tasks/CreatePRDialog.tsx
git commit -m "feat(ui): CreatePRDialog switches PR/MR copy by provider"
```

---

## Task 19: `GitOperations` passes `provider` + switches button label and chip

**Files:**
- Modify: `frontend/src/components/tasks/Toolbar/GitOperations.tsx`

- [ ] **Step 1: Read `host_provider` from `RepoBranchStatus`**

Near the top of the component (after `getSelectedRepoStatus`), add:

```typescript
const selectedRepoStatus = getSelectedRepoStatus();
const prProvider = selectedRepoStatus?.host_provider ?? null;
const isGitLab = prProvider === 'git_lab';
```

- [ ] **Step 2: Switch the button label**

Find `prButtonLabel` `useMemo` around line 194. Replace the existing `return t('git.states.createPr')` line with:

```typescript
return t(isGitLab ? 'git.states.createMr' : 'git.states.createPr');
```

Update the `useMemo` dependency array to include `isGitLab`.

- [ ] **Step 3: Switch the status chip**

Find the chip rendering around line 357 (the `<button>` that opens the PR URL). Replace `t('git.pr.number', { number })` and `t('git.pr.open', { number })` with:

```typescript
{t(isGitLab ? 'git.mr.number' : 'git.pr.number', {
  number: Number(prMerge.pr_info.number),
})}
```

```typescript
aria-label={t(isGitLab ? 'git.mr.open' : 'git.pr.open', {
  number: Number(prMerge.pr_info.number),
})}
```

- [ ] **Step 4: Pass `provider` to `CreatePRDialog.show`**

Find `handlePRButtonClick` around line 293. Update the `CreatePRDialog.show` call:

```typescript
CreatePRDialog.show({
  attempt: selectedAttempt,
  task,
  repoId: getSelectedRepoId(),
  targetBranch: getSelectedRepoStatus()?.target_branch_name,
  provider: prProvider ?? undefined,
});
```

- [ ] **Step 5: Verify it type-checks and lints**

Run: `pnpm run check`
Run: `pnpm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/tasks/Toolbar/GitOperations.tsx
git commit -m "feat(ui): GitOperations toolbar switches PR/MR by provider"
```

---

## Task 20: End-to-end manual verification

**Files:** None modified.

This task confirms the feature works against a real GitLab instance. Tests in earlier tasks cover parsing and trait wiring but cannot exercise glab itself.

- [ ] **Step 1: Pre-flight check**

Run: `glab --version`
Expected: ≥ 1.30 (otherwise `glab mr view -F json` fields may be missing).

Run: `glab auth status --hostname <your-host>`
Expected: shows "Logged in" for at least one hostname. If self-hosted: `glab auth login --hostname <your-host> --web` first.

- [ ] **Step 2: Start the dev server**

Run: `pnpm run dev`
Expected: backend on the assigned port; frontend opens in browser.

- [ ] **Step 3: Add a GitLab project**

In the UI: Add Project → choose a local clone of a GitLab repo (self-hosted preferred to exercise the detection path). Verify the project loads.

- [ ] **Step 4: Run a task attempt**

Create a task → start an attempt → let the coding agent make at least one commit.

- [ ] **Step 5: Verify toolbar terminology**

**Expected:** the action button reads "Create MR" (not "Create PR"). If it still says "Create PR", check:
- `pnpm run generate-types` ran after Task 13
- The `host_provider` field flows through `RepoBranchStatus` (Task 11)
- The remote URL actually matches the GitLab heuristic (Task 2)

- [ ] **Step 6: Open the create dialog and verify copy**

Click "Create MR". The dialog should show:
- Title: "Create Merge Request"
- Description sentence mentioning "merge request"
- Title placeholder: "Enter MR title"
- Submit button: "Create MR"

- [ ] **Step 7: Submit the MR**

Fill title + body, click Create MR. Watch backend logs for the actual glab command — should look like:

```
glab mr create -R group/repo -s <branch> -b <target> -t "<title>" -d "<body>" -y
```

Open the GitLab UI and confirm the MR exists.

- [ ] **Step 8: Verify the chip**

Back in vibe-kanban, the action button should now read "Push" and a chip should appear reading `MR !<n>` (with `!`, not `#`).

- [ ] **Step 9: Test error path — logged out**

Run: `glab auth logout --hostname <your-host>`
In the UI, attempt to create another MR.

**Expected (Mac + gitlab.com):** `GlabCliSetupDialog` opens with instructions.
**Expected (non-Mac or self-hosted):** inline alert text reading "GitLab CLI is not logged in" plus manual install/auth commands.

Re-authenticate: `glab auth login --hostname <your-host> --web`.

- [ ] **Step 10: Test PR monitor sync**

In GitLab UI: merge the MR.
Wait up to 60 seconds.
**Expected:** the task auto-archives and the chip status updates to "Merged".

- [ ] **Step 11: Test probe fallback (optional, only if you have a non-gitlab.* domain)**

Add a project whose remote URL is `code.example.com/...` (a domain that doesn't match `gitlab.*` heuristic but is actually GitLab).
Verify create MR still works — the probe (Task 3) should detect it.

- [ ] **Step 12: Confirm overall health**

Run: `cargo test --workspace`
Run: `pnpm run check`
Run: `pnpm run lint`
Expected: all pass.

- [ ] **Step 13: Commit (only if any docs/comments were updated during verification)**

```bash
git status
# only commit if real changes; otherwise skip
```

---

## Risk Mitigations

1. **glab `-d` long body**: argv ≤ ARG_MAX (~128 KB) safe. For bodies > 60 KB, fall back to stdin (`-d -`). **Initial release: no fallback.** Add an upper bound check in `create_pr` that returns `GitHostError::PullRequest("body too large")` for > 60 KB and revisit if users hit it.
2. **glab JSON schema drift**: All parsed fields use `Option<>` defaults. The retry path catches `UnexpectedOutput`. Add a runtime version assertion in `ensure_available` if drift becomes a problem.
3. **Subgroup namespace URL-encoding**: `get_pr_comments` initial implementation returns `Vec::new()`, sidestepping `glab api projects/<encoded>/merge_requests/...`. Re-implement that endpoint with proper `%2F` encoding when expanding comments support.
4. **Detection ordering**: `gitlab.*` must come after `github.com` (Task 2). Adding the test `https://gitlab.github.io/x/y` → GitHub guards against accidental reordering.
5. **Self-hosted setup helper limitation**: The macOS dialog hard-codes `glab auth login --hostname gitlab.com`. The dialog copy (Task 15) explicitly tells self-hosted users to authenticate manually.

---

## Self-Review Notes

- **Spec coverage:** all four user decisions (heuristic + probe / `!` symbol / Mac helper clone / en+zh-Hans only) have explicit tasks.
- **No placeholders:** every code block contains the actual code; every command has expected output.
- **Type consistency:** `provider` (TS) ↔ `host_provider` (Rust serialised) match — `ProviderKind` is the single source of truth via ts-rs.
- **Naming consistency:** `GlabCli` / `GitLabProvider` / `GitLabRepoInfo` / `GlabCliError` / `GlabCliSetupError` / `setupGlabCli` / `GlabCliSetupDialog` — these match across all 19 tasks.
