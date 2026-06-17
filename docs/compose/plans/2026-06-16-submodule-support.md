# Submodule Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a task workspace is created from a repo with git submodules, give each direct submodule its own nested worktree, branch, diff, and a merge that updates the parent repo's gitlink.

**Architecture:** Reuse vibe-kanban's existing multi-repo workspace mechanism. After the parent repo's worktree is created, parse `.gitmodules`, create each direct submodule as a `WorkspaceRepo` entry whose worktree is nested at the real submodule path inside the parent worktree (and whose branch is cut from the gitlink commit). On merge, submodules merge first; the parent then stages the advanced gitlink and commits it.

**Tech Stack:** Rust (sqlx/SQLite, git2, git CLI), React/TypeScript, ts-rs.

**Spec:** `docs/compose/specs/2026-06-16-submodule-support-design.md`

---

## File Structure

- `crates/db/migrations/<ts>_add_submodule_fields_to_workspace_repos.sql` — new columns.
- `crates/db/src/models/workspace_repo.rs` — new fields on `WorkspaceRepo`, new queries.
- `crates/git/src/submodule.rs` (new) — `.gitmodules` parsing + submodule git ops (init, branch-from-gitlink, stage gitlink).
- `crates/git/src/lib.rs` — public `GitService` wrappers for submodule ops.
- `crates/services/src/services/workspace_manager.rs` — extend `RepoWorkspaceInput` with submodule metadata; discover & create submodule worktrees in `create_workspace`.
- `crates/local-deployment/src/container.rs` — build submodule inputs; path derivation.
- `crates/server/src/routes/task_attempts.rs` — submodule-aware `repo_worktree_path`; ordered merge orchestration.
- `crates/server/src/bin/generate_types.rs` + `shared/types.ts` — regenerated types.

---

## Task 1: Add submodule fields to `workspace_repos`

**Covers:** [S4]

**Files:**
- Create: `crates/db/migrations/20260616000000_add_submodule_fields_to_workspace_repos.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Submodule support: a workspace_repo row may represent a git submodule of
-- another workspace_repo (the parent). Top-level repos leave both NULL.
ALTER TABLE workspace_repos
    ADD COLUMN parent_workspace_repo_id BLOB
        REFERENCES workspace_repos (id) ON DELETE CASCADE;

ALTER TABLE workspace_repos
    ADD COLUMN submodule_path TEXT;
```

- [ ] **Step 2: Apply migration & regenerate sqlx cache**

Run: `pnpm run prepare-db`
Expected: completes without error; `.sqlx/` updated.

- [ ] **Step 3: Verify backend still compiles**

Run: `pnpm run backend:check`
Expected: PASS (existing queries unaffected; new columns nullable).

- [ ] **Step 4: Commit**

```bash
git add crates/db/migrations/20260616000000_add_submodule_fields_to_workspace_repos.sql .sqlx
git commit -m "feat(db): add submodule fields to workspace_repos"
```

---

## Task 2: Extend `WorkspaceRepo` model with submodule fields

**Covers:** [S4]

**Files:**
- Modify: `crates/db/src/models/workspace_repo.rs`

- [ ] **Step 1: Add fields to the struct**

In `WorkspaceRepo` (after `target_branch`):

```rust
pub struct WorkspaceRepo {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub repo_id: Uuid,
    pub target_branch: String,
    pub parent_workspace_repo_id: Option<Uuid>,
    pub submodule_path: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}
```

- [ ] **Step 2: Update every `query_as!(WorkspaceRepo, ...)` SELECT/RETURNING**

For each of `create_many`, `find_by_workspace_id`, `find_by_workspace_and_repo_id`, add the two columns to the projection:

```sql
parent_workspace_repo_id as "parent_workspace_repo_id?: Uuid",
submodule_path
```

In `create_many` INSERT, keep inserting only `(id, workspace_id, repo_id, target_branch)` — submodule rows are inserted by a new method (Step 3), so existing callers are unaffected; the two new columns default to NULL.

- [ ] **Step 3: Add a method to insert a submodule workspace_repo**

```rust
pub async fn create_submodule(
    pool: &SqlitePool,
    workspace_id: Uuid,
    repo_id: Uuid,
    target_branch: &str,
    parent_workspace_repo_id: Uuid,
    submodule_path: &str,
) -> Result<Self, sqlx::Error> {
    let id = Uuid::new_v4();
    sqlx::query_as!(
        WorkspaceRepo,
        r#"INSERT INTO workspace_repos
               (id, workspace_id, repo_id, target_branch,
                parent_workspace_repo_id, submodule_path)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id as "id!: Uuid",
                     workspace_id as "workspace_id!: Uuid",
                     repo_id as "repo_id!: Uuid",
                     target_branch,
                     parent_workspace_repo_id as "parent_workspace_repo_id?: Uuid",
                     submodule_path,
                     created_at as "created_at!: DateTime<Utc>",
                     updated_at as "updated_at!: DateTime<Utc>""#,
        id, workspace_id, repo_id, target_branch,
        parent_workspace_repo_id, submodule_path,
    )
    .fetch_one(pool)
    .await
}
```

- [ ] **Step 4: Add a query for submodule children of a workspace**

```rust
pub async fn find_submodules_for_workspace(
    pool: &SqlitePool,
    workspace_id: Uuid,
) -> Result<Vec<Self>, sqlx::Error> {
    sqlx::query_as!(
        WorkspaceRepo,
        r#"SELECT id as "id!: Uuid",
                  workspace_id as "workspace_id!: Uuid",
                  repo_id as "repo_id!: Uuid",
                  target_branch,
                  parent_workspace_repo_id as "parent_workspace_repo_id?: Uuid",
                  submodule_path,
                  created_at as "created_at!: DateTime<Utc>",
                  updated_at as "updated_at!: DateTime<Utc>"
           FROM workspace_repos
           WHERE workspace_id = $1 AND parent_workspace_repo_id IS NOT NULL"#,
        workspace_id
    )
    .fetch_all(pool)
    .await
}
```

- [ ] **Step 5: Verify & commit**

Run: `pnpm run prepare-db && pnpm run backend:check`
Expected: PASS.

```bash
git add crates/db/src/models/workspace_repo.rs .sqlx
git commit -m "feat(db): WorkspaceRepo submodule fields and queries"
```

---

## Task 3: `.gitmodules` parser

**Covers:** [S5]

**Files:**
- Create: `crates/git/src/submodule.rs`
- Modify: `crates/git/src/lib.rs` (add `pub mod submodule;`)
- Test: in `crates/git/src/submodule.rs` (`#[cfg(test)]`)

- [ ] **Step 1: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_submodules() {
        let contents = r#"
[submodule "libs/foo"]
    path = libs/foo
    url = https://example.com/foo.git
[submodule "vendor/bar"]
    path = vendor/bar
    url = git@example.com:bar.git
"#;
        let subs = parse_gitmodules(contents);
        assert_eq!(subs.len(), 2);
        assert_eq!(subs[0].path, "libs/foo");
        assert_eq!(subs[0].url, "https://example.com/foo.git");
        assert_eq!(subs[1].path, "vendor/bar");
    }

    #[test]
    fn empty_when_absent() {
        assert!(parse_gitmodules("").is_empty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test -p git submodule::tests`
Expected: FAIL — `parse_gitmodules` not found.

- [ ] **Step 3: Implement the parser**

```rust
//! Parsing of `.gitmodules` and submodule helpers.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubmoduleEntry {
    pub path: String,
    pub url: String,
}

/// Parse the contents of a `.gitmodules` file. Returns direct submodules in
/// declaration order. Tolerant of blank lines and indentation.
pub fn parse_gitmodules(contents: &str) -> Vec<SubmoduleEntry> {
    let mut entries: Vec<SubmoduleEntry> = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_url: Option<String> = None;

    let flush = |entries: &mut Vec<SubmoduleEntry>,
                 path: &mut Option<String>,
                 url: &mut Option<String>| {
        if let (Some(p), Some(u)) = (path.take(), url.take()) {
            entries.push(SubmoduleEntry { path: p, url: u });
        } else {
            *path = None;
            *url = None;
        }
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with("[submodule") {
            flush(&mut entries, &mut cur_path, &mut cur_url);
        } else if let Some(rest) = line.strip_prefix("path") {
            if let Some(v) = rest.split('=').nth(1) {
                cur_path = Some(v.trim().to_string());
            }
        } else if let Some(rest) = line.strip_prefix("url") {
            if let Some(v) = rest.split('=').nth(1) {
                cur_url = Some(v.trim().to_string());
            }
        }
    }
    flush(&mut entries, &mut cur_path, &mut cur_url);
    entries
}

/// Read and parse `<repo_root>/.gitmodules`. Returns empty if the file is absent.
pub fn read_submodules(repo_root: &std::path::Path) -> Vec<SubmoduleEntry> {
    match std::fs::read_to_string(repo_root.join(".gitmodules")) {
        Ok(contents) => parse_gitmodules(&contents),
        Err(_) => Vec::new(),
    }
}
```

In `crates/git/src/lib.rs`, add near the other module declarations:

```rust
pub mod submodule;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test -p git submodule::tests`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add crates/git/src/submodule.rs crates/git/src/lib.rs
git commit -m "feat(git): parse .gitmodules"
```

---

## Task 4: Submodule git operations (init + branch + stage gitlink)

**Covers:** [S5, S7]

**Files:**
- Modify: `crates/git/src/cli.rs` (add `submodule_update` + `add_path`)
- Modify: `crates/git/src/lib.rs` (public `GitService` wrappers)

- [ ] **Step 1: Add CLI helpers in `cli.rs`**

```rust
/// Run `git -C <worktree> submodule update --init -- <path>` (one level, no --recursive).
pub fn submodule_update_init(
    &self,
    worktree_path: &Path,
    submodule_path: &str,
) -> Result<(), GitCliError> {
    self.ensure_available()?;
    self.git(
        worktree_path,
        [
            "submodule".into(),
            "update".into(),
            "--init".into(),
            "--".into(),
            OsString::from(submodule_path),
        ],
    )?;
    Ok(())
}

/// Stage a single path in the worktree: `git -C <worktree> add -- <path>`.
pub fn add_path(&self, worktree_path: &Path, path: &str) -> Result<(), GitCliError> {
    self.ensure_available()?;
    self.git(
        worktree_path,
        ["add".into(), "--".into(), OsString::from(path)],
    )?;
    Ok(())
}
```

- [ ] **Step 2: Add `GitService` wrappers in `lib.rs`**

```rust
/// Initialize a submodule's working tree inside a worktree (one level).
pub fn submodule_init(
    &self,
    worktree_path: &Path,
    submodule_path: &str,
) -> Result<(), GitServiceError> {
    GitCli::new()
        .submodule_update_init(worktree_path, submodule_path)
        .map_err(|e| {
            GitServiceError::InvalidRepository(format!("submodule update failed: {e}"))
        })
}

/// Stage the (advanced) gitlink for a submodule in the parent worktree.
pub fn stage_submodule_gitlink(
    &self,
    parent_worktree_path: &Path,
    submodule_path: &str,
) -> Result<(), GitServiceError> {
    GitCli::new()
        .add_path(parent_worktree_path, submodule_path)
        .map_err(|e| {
            GitServiceError::InvalidRepository(format!("git add gitlink failed: {e}"))
        })
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm run backend:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/git/src/cli.rs crates/git/src/lib.rs
git commit -m "feat(git): submodule init and gitlink staging helpers"
```

---

## Task 5: Discover & create submodule worktrees during workspace creation

**Covers:** [S5]

**Files:**
- Modify: `crates/services/src/services/workspace_manager.rs`
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Extend `RepoWorkspaceInput` with submodule metadata**

In `workspace_manager.rs`, replace the struct + `new`:

```rust
#[derive(Debug, Clone)]
pub struct RepoWorkspaceInput {
    pub repo: Repo,
    pub target_branch: String,
    /// When Some, this repo is a submodule mounted at this path relative to
    /// the parent repo's worktree root.
    pub submodule_of: Option<String>,
}

impl RepoWorkspaceInput {
    pub fn new(repo: Repo, target_branch: String) -> Self {
        Self { repo, target_branch, submodule_of: None }
    }
}
```

- [ ] **Step 2: After creating each top-level worktree in `create_workspace`, discover submodules**

Inside the `for input in repos` loop of `create_workspace`, in the `Ok(())` arm after `created_worktrees.push(...)`, add (only for non-submodule inputs):

```rust
if input.submodule_of.is_none() {
    // Discover direct submodules of this freshly-created worktree.
    for sub in git::submodule::read_submodules(&worktree_path) {
        let sub_worktree = worktree_path.join(&sub.path);
        // Init the submodule's git data (reuses parent .git/modules cache).
        let git = GitService::new();
        if let Err(e) = git.submodule_init(&worktree_path, &sub.path) {
            error!(
                "Failed to init submodule '{}' in repo '{}': {}. Rolling back...",
                sub.path, input.repo.name, e
            );
            Self::cleanup_created_worktrees(&created_worktrees).await;
            let _ = tokio::fs::remove_dir(workspace_dir).await;
            return Err(WorkspaceError::PartialCreation(format!(
                "Failed to init submodule '{}': {}", sub.path, e
            )));
        }
        created_worktrees.push(RepoWorktree {
            repo_id: input.repo.id, // placeholder; real submodule repo_id set by caller layer
            repo_name: sub.path.clone(),
            source_repo_path: sub_worktree.clone(),
            worktree_path: sub_worktree,
        });
    }
}
```

> Note: `create_workspace` operates only on filesystem worktrees; it does NOT
> write `workspace_repos` rows (that is the container/route layer's job). This
> step makes the submodule **present and initialized** on disk under the parent
> worktree. The DB registration of the submodule as a `WorkspaceRepo` happens in
> Step 3. The branch for the submodule is created by `git submodule update`
> leaving it at the gitlink commit (detached); Step 3 names a task branch off
> that commit.

- [ ] **Step 3: Register submodules as workspace_repos in `container.rs`**

In `create()` (`crates/local-deployment/src/container.rs`), after the workspace is created and before `copy_files_and_images`, iterate the created worktrees, and for each discovered submodule create a `Repo` (via `Repo::find_or_create` with the nested worktree path) and a submodule `WorkspaceRepo`:

```rust
// Register direct submodules discovered during worktree creation as
// workspace_repos (one level only).
for repo in &repositories {
    let parent_worktree = created_workspace.workspace_dir.join(&repo.name);
    let parent_wr = workspace_repos
        .iter()
        .find(|wr| wr.repo_id == repo.id)
        .expect("parent workspace_repo must exist");
    for sub in git::submodule::read_submodules(&parent_worktree) {
        let sub_path = parent_worktree.join(&sub.path);
        let sub_repo = Repo::find_or_create(
            &self.db.pool,
            &sub_path,
            &format!("{} / {}", repo.display_name, sub.path),
        )
        .await?;
        // The submodule's task branch is the shared workspace branch, cut from
        // the gitlink commit; for direct one-level support the submodule sits
        // on the workspace branch checked out by submodule update.
        WorkspaceRepo::create_submodule(
            &self.db.pool,
            workspace.id,
            sub_repo.id,
            &workspace.branch,
            parent_wr.id,
            &sub.path,
        )
        .await?;
    }
}
```

> Implementation note for executor: confirm whether `workspace.branch` already
> exists in the submodule after `git submodule update` (it is detached at the
> gitlink commit). If a named task branch is desired in the submodule, create it
> via `GitService::add_worktree`-style branch creation or
> `git -C <sub> checkout -b <workspace.branch>` before registering. Keep it
> minimal: only create a branch if diffs/merge require a named ref. The
> `target_branch` recorded here should be the submodule's original branch
> (the gitlink commit's branch); resolve the exact value during execution by
> reading the submodule's current branch.

- [ ] **Step 4: Verify backend compiles**

Run: `pnpm run backend:check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/services/src/services/workspace_manager.rs crates/local-deployment/src/container.rs
git commit -m "feat(workspace): discover and register direct submodules"
```

---

## Task 6: Submodule-aware worktree path derivation

**Covers:** [S5, S6]

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs` (`repo_worktree_path`)
- Modify: `crates/local-deployment/src/container.rs` (`repo_worktree_path`)

- [ ] **Step 1: Make `task_attempts.rs::repo_worktree_path` submodule-aware**

The function currently takes `(workspace_root, workspace, repo)`. A submodule's worktree is `<parent_worktree>/<submodule_path>`. Change callers that have the `WorkspaceRepo` to pass submodule metadata. Minimal change: add an optional submodule mount that, when present, joins onto the parent repo's worktree path.

```rust
fn repo_worktree_path(
    workspace_root: &Path,
    workspace: &Workspace,
    repo: &Repo,
    submodule_path: Option<&str>,
) -> PathBuf {
    let base = if workspace.mode == WorkspaceMode::Direct {
        workspace_root.to_path_buf()
    } else {
        workspace_root.join(&repo.name)
    };
    match submodule_path {
        // For a submodule entry, `repo.name` is unreliable; the nested path is
        // relative to the parent worktree. The caller resolves the parent
        // worktree root and passes it as `workspace_root` join parent name.
        Some(_p) => base, // submodules already register repo.path == nested worktree path
        None => base,
    }
}
```

> Decision recorded during planning: submodule `Repo.path` is set in Task 5 to
> the **absolute nested worktree path** (`<parent_worktree>/<sub.path>`). That
> means for submodule diffs the worktree path is simply `repo.path` — no join
> needed. Therefore the diff/merge handlers should, for a submodule
> `WorkspaceRepo` (i.e. `submodule_path.is_some()`), use `repo.path` directly as
> the worktree path rather than `repo_worktree_path`. Update `get_workspace_diffs`
> (Step 2) accordingly.

- [ ] **Step 2: In `get_workspace_diffs`, resolve worktree path for submodules**

Replace the `worktree_path` derivation:

```rust
let worktree_path = if workspace_repo.submodule_path.is_some() {
    repo.path.clone()
} else {
    repo_worktree_path(workspace_path, &workspace, &repo, None)
};
```

Update the call sites of the old 3-arg `repo_worktree_path` to pass `None`.

- [ ] **Step 3: Verify compile**

Run: `pnpm run backend:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs crates/local-deployment/src/container.rs
git commit -m "feat(diff): resolve submodule worktree paths"
```

---

## Task 7: Ordered merge with gitlink update

**Covers:** [S7]

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs` (`merge_task_attempt`)

- [ ] **Step 1: Before merging the parent, merge its submodules and stage gitlinks**

In `merge_task_attempt`, immediately after resolving `repo` and `workspace_repo` and confirming this is the parent (i.e. `workspace_repo.submodule_path.is_none()`), but before computing the parent commit message / calling `merge_changes`, add:

```rust
// Submodule-aware merge: merge any direct submodules of this repo first,
// then stage their advanced gitlinks in the parent worktree so the parent's
// merge commit records the new submodule SHAs.
let submodules = WorkspaceRepo::find_submodules_for_workspace(pool, workspace.id).await?;
let parent_worktree = repo_worktree_path(workspace_path, &workspace, &repo, None);
for sub in &submodules {
    if sub.parent_workspace_repo_id != Some(workspace_repo.id) {
        continue;
    }
    let sub_repo = Repo::find_by_id(pool, sub.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;
    // Merge the submodule branch into its target (squash), advancing the
    // submodule worktree HEAD; sub_repo.path is the nested worktree path.
    let sub_merge_sha = deployment.git().merge_changes(
        &sub_repo.path,
        &sub_repo.path,
        &workspace.branch,
        &sub.target_branch,
        &commit_message,
    )?;
    Merge::create_direct(
        pool, workspace.id, sub.repo_id, &sub.target_branch,
        &sub_merge_sha, task.id, None,
    )
    .await?;
    // Stage the advanced gitlink in the parent worktree.
    let sub_path = sub.submodule_path.as_deref().unwrap_or_default();
    deployment
        .git()
        .stage_submodule_gitlink(&parent_worktree, sub_path)?;
}
```

> Ordering note: `commit_message` is computed later in the existing function.
> Move the submodule-merge block to AFTER `commit_message` is determined (it is
> reused for submodule merges), but BEFORE the parent `merge_changes` call. The
> executor must place this block right above the existing
> `let merge_commit_id = deployment.git().merge_changes(...)` line. The staged
> gitlink is then included in the parent's squash merge.

- [ ] **Step 2: Confirm the parent merge picks up the staged gitlink**

`merge_changes` squash-merges the workspace branch into the target. Because the gitlink was staged in the parent worktree (on the workspace branch), it must be committed onto the workspace branch before the squash. Add, right after staging all gitlinks and before the parent `merge_changes`:

```rust
if !submodules.is_empty() {
    // Commit the staged gitlink updates onto the workspace branch so the
    // subsequent squash merge into the target includes them.
    deployment.git().commit(&parent_worktree, &commit_message)?;
}
```

> `GitService::commit` (`crates/git/src/lib.rs:327`) does add-all + commit and
> returns `Ok(false)` when there is nothing to commit, so this is safe when a
> submodule did not actually advance.

- [ ] **Step 3: Verify compile**

Run: `pnpm run backend:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs
git commit -m "feat(merge): merge submodules first and update parent gitlink"
```

---

## Task 8: Integration test — submodule worktree creation

**Covers:** [S5, S9]

**Files:**
- Test: `crates/services/tests/submodule_workspace.rs` (new)

- [ ] **Step 1: Write the failing test with full fixture**

```rust
use std::process::Command;
use tempfile::tempdir;

fn git(dir: &std::path::Path, args: &[&str]) {
    let ok = Command::new("git")
        .args(args)
        .current_dir(dir)
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {:?} failed in {}", args, dir.display());
}

#[tokio::test]
async fn submodule_worktree_is_created_nested() {
    let tmp = tempdir().unwrap();
    let root = tmp.path();

    // 1. Build the submodule source repo with one committed file.
    let sub_src = root.join("sub_src");
    std::fs::create_dir_all(&sub_src).unwrap();
    git(&sub_src, &["init", "-b", "main"]);
    git(&sub_src, &["config", "user.email", "t@t.t"]);
    git(&sub_src, &["config", "user.name", "t"]);
    std::fs::write(sub_src.join("hello.txt"), "hi").unwrap();
    git(&sub_src, &["add", "-A"]);
    git(&sub_src, &["commit", "-m", "init sub"]);

    // 2. Build the parent repo and add the submodule at libs/foo.
    let parent = root.join("parent");
    std::fs::create_dir_all(&parent).unwrap();
    git(&parent, &["init", "-b", "main"]);
    git(&parent, &["config", "user.email", "t@t.t"]);
    git(&parent, &["config", "user.name", "t"]);
    git(&parent, &["-c", "protocol.file.allow=always", "submodule", "add",
        sub_src.to_str().unwrap(), "libs/foo"]);
    git(&parent, &["commit", "-m", "add submodule"]);

    // 3. Create the workspace from the parent repo.
    let workspace_dir = root.join("ws");
    let repo = test_repo(&parent); // helper building a db::Repo with path=parent
    let input = RepoWorkspaceInput::new(repo, "main".to_string());
    WorkspaceManager::create_workspace(&workspace_dir, &[input], "vb/test")
        .await
        .unwrap();

    // 4. Assert the submodule was checked out at the nested path.
    let nested = workspace_dir.join("parent").join("libs/foo").join("hello.txt");
    assert!(nested.exists(), "expected submodule file at {}", nested.display());
}
```

Add a small `test_repo(path: &Path) -> Repo` helper in the test module that
constructs a `Repo` with the given `path`, `name = "parent"`, and default
fields (use `Repo::find_or_create` against an in-memory pool if the test harness
provides one, otherwise build the struct literal directly).

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test -p services submodule_workspace`
Expected: FAIL — submodule file is absent (current code does not init submodules).

- [ ] **Step 3: Confirm Task 5 makes it pass**

This test exercises the discovery added in Task 5. If Task 5 is already merged,
this step is a green-bar confirmation. Run the test again after Task 5.

- [ ] **Step 4: Run to verify it passes**

Run: `cargo test -p services submodule_workspace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/services/tests/submodule_workspace.rs
git commit -m "test(workspace): submodule worktree created at nested path"
```

---

## Task 9: Expose submodule flag to frontend + regenerate types

**Covers:** [S8]

**Files:**
- Modify: `crates/db/src/models/workspace_repo.rs` (`RepoWithTargetBranch`)
- Modify: `crates/server/src/bin/generate_types.rs` (if needed)
- Regenerate: `shared/types.ts`

- [ ] **Step 1: Add `is_submodule` to `RepoWithTargetBranch`**

```rust
pub struct RepoWithTargetBranch {
    #[serde(flatten)]
    pub repo: Repo,
    pub target_branch: String,
    pub is_submodule: bool,
}
```

Set it in `find_repos_with_target_branch_for_workspace` by selecting
`wr.submodule_path IS NOT NULL as "is_submodule!: bool"` and mapping it.

- [ ] **Step 2: Regenerate types**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` updated with `is_submodule`.

- [ ] **Step 3: Verify frontend typecheck**

Run: `pnpm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/models/workspace_repo.rs shared/types.ts crates/server/src/bin/generate_types.rs
git commit -m "feat(types): expose is_submodule on workspace repos"
```

---

## Task 10: Final verification

**Covers:** [S9]

- [ ] **Step 1: Full workspace checks**

Run: `cargo test --workspace`
Expected: PASS.

- [ ] **Step 2: Type + lint**

Run: `pnpm run backend:check && pnpm run check && pnpm run lint`
Expected: PASS.

- [ ] **Step 3: Commit any formatting fixes**

```bash
git add -A && git commit -m "chore: fmt and lint for submodule support" || true
```
