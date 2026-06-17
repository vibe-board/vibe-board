# Nested Repos via Path Containment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `.gitmodules`-based submodule support with path-containment-based nested repos: when a repo added to a project lives physically inside another project repo's directory, treat it as a nested child (own branch/diff/merge) mounted at the same relative path in the task workspace, with NO gitlink coupling.

**Architecture:** Compute parent/child from canonicalized path containment at add-repo time, store the edge + relative path on `project_repos`. At workspace creation, derive per-workspace nesting into `workspace_repos` and lay child worktrees nested inside the parent worktree (operating on each child's own independent git repo — no submodule init). Merges are fully per-repo; the parent `.gitignore`s the child so nothing about the child enters the parent.

**Tech Stack:** Rust (sqlx/SQLite, git2, git CLI), React/TypeScript, ts-rs.

**Spec:** `docs/compose/specs/2026-06-17-nested-repos-design.md`

**Context — this CONVERTS shipped submodule code (commit `c27b08f23` and predecessors).** The shipped pieces and their fate:
- `crates/git/src/submodule.rs` (`parse_gitmodules`, `read_submodules`) → DELETE.
- `GitService::submodule_init`, `GitCli::submodule_update_init` → DELETE (no submodules).
- `GitService::create_base_branch_in_worktree` / `GitCli::create_branch_at_head` → DELETE (no separate base branch needed; child has its own real branches).
- `GitService::create_branch_in_worktree` / `GitCli::checkout_new_branch` → KEEP only if needed; the normal `create_worktree` path already creates the task branch, so likely DELETE.
- `SUBMODULE_BASE_BRANCH` const → DELETE.
- `workspace_repos.submodule_path` → RENAME to `nested_path`; `parent_workspace_repo_id` → KEEP.
- `RepoWithTargetBranch.is_submodule` → RENAME to `is_nested`.
- Submodule discovery block in `workspace_manager.rs:110-152` → REPLACE with project-derived nesting.
- Submodule registration loop in `container.rs` → REPLACE with project-relationship derivation.
- Ordered submodule+gitlink merge block in `task_attempts.rs` → DELETE.
- `crates/services/tests/submodule_workspace.rs` → REPLACE with nested-repo test.

---

## File Structure

- `crates/db/migrations/<ts>_nested_repos.sql` — add `project_repos.parent_project_repo_id` + `nested_path`; rename `workspace_repos.submodule_path` → `nested_path`.
- `crates/utils/src/path.rs` (or a new `crates/utils/src/containment.rs`) — pure path-containment helper.
- `crates/db/src/models/project_repo.rs` — new columns, relationship queries, containment recompute on add/remove.
- `crates/db/src/models/workspace_repo.rs` — rename field; `is_nested`.
- `crates/services/src/services/workspace_manager.rs` — nested worktree layout from project relationships; remove submodule block.
- `crates/local-deployment/src/container.rs` — derive workspace nesting from project relationships; remove submodule registration.
- `crates/server/src/routes/task_attempts.rs` — remove submodule merge block; nested diff path already correct (field rename only).
- `crates/git/` — delete dead submodule ops + module.
- `crates/services/tests/nested_repos_workspace.rs` — integration test.

---

## Task 1: Path-containment helper

**Covers:** [S3]

**Files:**
- Create: `crates/utils/src/containment.rs`
- Modify: `crates/utils/src/lib.rs` (add `pub mod containment;`)
- Test: in `crates/utils/src/containment.rs`

- [ ] **Step 1: Write the failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn ancestor_yields_relative_path() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open/child")),
            Some("child".to_string())
        );
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open/a/b")),
            Some("a/b".to_string())
        );
    }

    #[test]
    fn siblings_are_not_nested() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/other")),
            None
        );
    }

    #[test]
    fn string_prefix_is_not_ancestor() {
        // /repos/open is NOT an ancestor of /repos/open-other
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open-other")),
            None
        );
    }

    #[test]
    fn equal_paths_are_not_nested() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open")),
            None
        );
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test --workspace containment::tests`
Expected: FAIL — `relative_if_nested` not found.

- [ ] **Step 3: Implement**

```rust
//! Path containment: determine whether one repo path is nested inside another.

use std::path::{Component, Path};

/// If `child` is a strict descendant of `parent` (component-wise, not string
/// prefix), return the child's path relative to the parent as a forward-slash
/// string (e.g. "child" or "a/b"). Returns None for siblings, equal paths, or
/// string-prefix-but-not-ancestor cases like /a/b vs /a/bc.
///
/// Both inputs should be canonicalized by the caller when they refer to real
/// on-disk paths; this function compares components as given.
pub fn relative_if_nested(parent: &Path, child: &Path) -> Option<String> {
    let parent_components: Vec<Component> = parent.components().collect();
    let child_components: Vec<Component> = child.components().collect();

    // child must be strictly longer and share parent's components as a prefix.
    if child_components.len() <= parent_components.len() {
        return None;
    }
    for (p, c) in parent_components.iter().zip(child_components.iter()) {
        if p != c {
            return None;
        }
    }
    let rel: std::path::PathBuf = child_components[parent_components.len()..]
        .iter()
        .collect();
    Some(rel.to_string_lossy().replace('\\', "/"))
}
```

In `crates/utils/src/lib.rs`, add `pub mod containment;` near the other module declarations (read the file to match style).

- [ ] **Step 4: Run to verify it passes**

Run: `cargo test --workspace containment::tests`
Expected: PASS (4 tests).

NOTE: Use `cargo test --workspace`, never `cargo test -p utils` / `-p git` — those fail to compile in isolation due to a pre-existing sentry/reqwest feature-unification issue. Verify type-checks with `pnpm run backend:check`.

- [ ] **Step 5: Commit**

```bash
git add crates/utils/src/containment.rs crates/utils/src/lib.rs
git commit -m "feat(utils): path-containment helper for nested repos"
```

---

## Task 2: Migration — project_repos nesting columns + workspace_repos rename

**Covers:** [S4]

**Files:**
- Create: `crates/db/migrations/20260617000000_nested_repos.sql`

- [ ] **Step 1: Inspect existing UUID column convention**

Read `crates/db/migrations/20260616000000_add_submodule_fields_to_workspace_repos.sql` (the shipped submodule migration) and confirm UUID self-FK columns use `BLOB` (they do — all IDs in this DB are 16-byte BLOBs).

- [ ] **Step 2: Write the migration**

SQLite cannot rename a column with a constraint cleanly in old versions, but modern SQLite (bundled with sqlx) supports `ALTER TABLE ... RENAME COLUMN`. Use it.

```sql
-- Nested repos via path containment (replaces .gitmodules submodule model).

-- 1. Project-level parent/child relationship (source of truth).
ALTER TABLE project_repos
    ADD COLUMN parent_project_repo_id BLOB
        REFERENCES project_repos (id) ON DELETE SET NULL;
ALTER TABLE project_repos
    ADD COLUMN nested_path TEXT;

-- 2. Rename the shipped submodule field on workspace_repos to the
--    relationship-neutral name. parent_workspace_repo_id stays as-is.
ALTER TABLE workspace_repos RENAME COLUMN submodule_path TO nested_path;
```

Rationale for `ON DELETE SET NULL` on the project edge (vs CASCADE): removing a parent repo from a project should not silently delete the child repo's project membership — it should just detach the relationship (child becomes top-level). The recompute logic (Task 3) re-evaluates on the next add/remove.

- [ ] **Step 3: Apply + regenerate cache**

Run: `pnpm run prepare-db`
Expected: migration applies; `.sqlx` regenerated. (The rename will require updating queries in Task 4; prepare-db may report query mismatches until then — if so, proceed to Task 4 and re-run prepare-db there. To keep this task green, run `pnpm run prepare-db` only after confirming the migration SQL applies; if query compilation fails because Rust still says `submodule_path`, that is expected and fixed in Task 4. Commit the migration file alone in this task and the cache in Task 4.)

- [ ] **Step 4: Commit (migration only)**

```bash
git add crates/db/migrations/20260617000000_nested_repos.sql
git commit -m "feat(db): nested-repo columns and workspace_repos field rename"
```

---

## Task 3: Containment computation in ProjectRepo

**Covers:** [S3, S4]

**Files:**
- Modify: `crates/db/src/models/project_repo.rs`

- [ ] **Step 1: Add fields to the ProjectRepo struct**

```rust
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub parent_project_repo_id: Option<Uuid>,
    pub nested_path: Option<String>,
}
```

Update every `query_as!(ProjectRepo, ...)` projection (`find_by_project_id`, `find_by_repo_id`, any others — read the whole file) to add:
```sql
parent_project_repo_id as "parent_project_repo_id?: Uuid",
nested_path
```

- [ ] **Step 2: Add a recompute function**

After all repos for a project are known, recompute parent/child edges from canonical paths. Add:

```rust
/// Recompute parent/child nesting for every repo in the project based on
/// on-disk path containment. Each repo's parent is the NEAREST project repo
/// whose canonical path is an ancestor of this repo's canonical path; siblings
/// get NULL. One level of materialized edge (nearest ancestor) per spec.
pub async fn recompute_nesting(
    pool: &SqlitePool,
    project_id: Uuid,
) -> Result<(), sqlx::Error> {
    // (repo_id, project_repo_id, canonical_path)
    let rows = sqlx::query!(
        r#"SELECT pr.id as "pr_id!: Uuid", r.path
           FROM project_repos pr
           JOIN repos r ON r.id = pr.repo_id
           WHERE pr.project_id = $1"#,
        project_id
    )
    .fetch_all(pool)
    .await?;

    // Canonicalize; fall back to the raw path if canonicalize fails (e.g. path
    // not present on this machine) so we never panic.
    let entries: Vec<(Uuid, std::path::PathBuf)> = rows
        .into_iter()
        .map(|row| {
            let raw = std::path::PathBuf::from(&row.path);
            let canon = std::fs::canonicalize(&raw).unwrap_or(raw);
            (row.pr_id, canon)
        })
        .collect();

    for (pr_id, path) in &entries {
        // Find the nearest ancestor among the other repos.
        let mut best: Option<(Uuid, String, usize)> = None; // (parent_pr_id, rel, depth)
        for (other_id, other_path) in &entries {
            if other_id == pr_id {
                continue;
            }
            if let Some(rel) =
                utils::containment::relative_if_nested(other_path, path)
            {
                let depth = other_path.components().count();
                if best.as_ref().map(|(_, _, d)| depth > *d).unwrap_or(true) {
                    best = Some((*other_id, rel, depth));
                }
            }
        }
        match best {
            Some((parent_id, rel, _)) => {
                sqlx::query!(
                    r#"UPDATE project_repos
                       SET parent_project_repo_id = $1, nested_path = $2
                       WHERE id = $3"#,
                    parent_id,
                    rel,
                    pr_id
                )
                .execute(pool)
                .await?;
            }
            None => {
                sqlx::query!(
                    r#"UPDATE project_repos
                       SET parent_project_repo_id = NULL, nested_path = NULL
                       WHERE id = $1"#,
                    pr_id
                )
                .execute(pool)
                .await?;
            }
        }
    }
    Ok(())
}
```

Confirm `utils` is a dependency of `crates/db` (read `crates/db/Cargo.toml`); if not, add it, OR move `relative_if_nested` to a crate `db` already depends on. Prefer adding the `utils` dep if missing and it doesn't create a cycle — check that `utils` does not depend on `db`.

- [ ] **Step 3: Call recompute after add and remove**

In `add_repo_to_project` (currently ends by inserting the junction row and returning `repo`), call `Self::recompute_nesting(pool, project_id).await?;` before returning. In `remove_repo_from_project`, call it after the delete (before the `rows_affected` check returns Ok). Also call it at project creation after all repos are inserted — find the project-create path (`crates/server/src/routes/projects.rs:83` create_project → wherever repos are inserted) and add a `recompute_nesting` call once all project_repos exist.

- [ ] **Step 4: Verify + commit**

Run: `pnpm run prepare-db && pnpm run backend:check`
Expected: PASS (queries now match the renamed/added columns).

```bash
git add crates/db/src/models/project_repo.rs crates/db/.sqlx crates/db/Cargo.toml
git commit -m "feat(db): compute project repo nesting from path containment"
```

---

## Task 4: Rename submodule_path → nested_path in WorkspaceRepo + is_nested

**Covers:** [S4, S9]

**Files:**
- Modify: `crates/db/src/models/workspace_repo.rs`

- [ ] **Step 1: Rename the struct field**

In `WorkspaceRepo`, rename `pub submodule_path: Option<String>` → `pub nested_path: Option<String>`. Update every `query_as!(WorkspaceRepo, ...)` projection (`create_many`, `find_by_workspace_id`, `find_by_workspace_and_repo_id`, `create_submodule`, `find_submodules_for_workspace`) — change `submodule_path` to `nested_path` in both SELECT/RETURNING and the column reference.

- [ ] **Step 2: Rename the methods for clarity**

Rename `create_submodule` → `create_nested` and `find_submodules_for_workspace` → `find_nested_for_workspace`. Keep signatures otherwise identical (the `parent_workspace_repo_id` + path params still apply). Update the WHERE clause comment.

Also add a `set_nesting` UPDATE helper (used by Task 5 — workspace_repos rows are created earlier in `tasks.rs`, so nesting is applied as an update, not an insert):

```rust
/// Set (or clear) the per-workspace nesting for one repo's workspace_repo row.
pub async fn set_nesting(
    pool: &SqlitePool,
    workspace_id: Uuid,
    repo_id: Uuid,
    parent_workspace_repo_id: Option<Uuid>,
    nested_path: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspace_repos
           SET parent_workspace_repo_id = $1, nested_path = $2
           WHERE workspace_id = $3 AND repo_id = $4"#,
        parent_workspace_repo_id,
        nested_path,
        workspace_id,
        repo_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

- [ ] **Step 3: Rename is_submodule → is_nested on RepoWithTargetBranch**

```rust
pub struct RepoWithTargetBranch {
    #[serde(flatten)]
    pub repo: Repo,
    pub target_branch: String,
    pub is_nested: bool,
}
```
In `find_repos_with_target_branch_for_workspace`, change the projection alias to `wr.nested_path IS NOT NULL as "is_nested!: bool"` and the mapping to `is_nested: row.is_nested`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm run prepare-db && pnpm run backend:check`
Expected: backend may still fail to compile because callers in container.rs / task_attempts.rs / workspace_manager.rs still reference old names — that is expected and fixed in Tasks 5-7. To keep THIS task's commit green, only proceed if `db` crate itself compiles. Check with: `pnpm run prepare-db` succeeds (db queries valid). Defer full backend:check to Task 7.

```bash
git add crates/db/src/models/workspace_repo.rs crates/db/.sqlx
git commit -m "refactor(db): rename submodule_path to nested_path, is_nested"
```

---

## Task 5: Workspace creation — nested layout from project relationships

**Covers:** [S5]

**Files:**
- Modify: `crates/services/src/services/workspace_manager.rs`
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Extend RepoWorkspaceInput with nesting**

Replace the struct + `new` in `workspace_manager.rs`:

```rust
#[derive(Debug, Clone)]
pub struct RepoWorkspaceInput {
    pub repo: Repo,
    pub target_branch: String,
    /// When Some, this repo is nested at this path relative to its parent
    /// repo's worktree root (e.g. "child"). The parent appears earlier in the
    /// input list.
    pub nested_under: Option<NestedMount>,
}

#[derive(Debug, Clone)]
pub struct NestedMount {
    /// repo.name of the parent repo (its worktree dir under workspace_dir).
    pub parent_repo_name: String,
    /// path relative to the parent worktree root.
    pub rel_path: String,
}

impl RepoWorkspaceInput {
    pub fn new(repo: Repo, target_branch: String) -> Self {
        Self { repo, target_branch, nested_under: None }
    }
    pub fn nested(repo: Repo, target_branch: String, mount: NestedMount) -> Self {
        Self { repo, target_branch, nested_under: Some(mount) }
    }
}
```

- [ ] **Step 2: Compute worktree path from nesting; remove submodule block**

In `create_workspace`, replace the flat `let worktree_path = workspace_dir.join(&input.repo.name);` (line ~85) with nesting-aware derivation, and DELETE the entire submodule discovery block (lines ~110-152, the `for sub in git::submodule::read_submodules(...)` loop including its rollback):

```rust
let worktree_path = match &input.nested_under {
    Some(mount) => workspace_dir
        .join(&mount.parent_repo_name)
        .join(&mount.rel_path),
    None => workspace_dir.join(&input.repo.name),
};
```

The `create_worktree` call below it operates on `&input.repo.path` (the child's OWN repo) and `worktree_path` — unchanged, no submodule logic. Keep the existing `RepoWorktree` push (use `worktree_path.clone()`), keep the existing `Err(e)` rollback arm. The result: a child repo's worktree is created nested inside the parent worktree dir, exactly like any other worktree but at a nested path.

Also DELETE the now-unused `SUBMODULE_BASE_BRANCH` const (lines 12-15) and the `use git::GitService;` if it becomes unused (check — `GitService::new()` may still be referenced elsewhere in the file; only remove if unused).

- [ ] **Step 3: Apply the same nesting path in create_workspace_direct**

`create_workspace_direct` (the direct-mode variant) also does `workspace_dir.join(&input.repo.name)`. Apply the same `nested_under` match there so direct multi-repo also nests correctly.

- [ ] **Step 4: Build nested inputs in container.rs**

In `crates/local-deployment/src/container.rs` `create()`, the workspace_inputs are built from `repositories` + `target_branches` (around line 1554-1565). Replace the submodule registration loop (the post-`create_workspace` loop that called `read_submodules` + `create_submodule`) and instead build nesting INTO the inputs BEFORE calling create_workspace, derived from the PROJECT relationships:

```rust
// Load project-level nesting for these repos.
let project_id = task.project_id; // confirm how to get project_id from task/workspace
let project_repos = ProjectRepo::find_by_project_id(&self.db.pool, project_id).await?;
// Map repo_id -> (parent repo_id, rel_path) using project_repos relationships.
// project_repos rows carry parent_project_repo_id + nested_path; resolve the
// parent project_repo's repo_id and then that repo's name.
let pr_by_id: std::collections::HashMap<Uuid, &ProjectRepo> =
    project_repos.iter().map(|pr| (pr.id, pr)).collect();
let repo_name_by_id: std::collections::HashMap<Uuid, String> =
    repositories.iter().map(|r| (r.id, r.name.clone())).collect();

let workspace_inputs: Vec<RepoWorkspaceInput> = repositories
    .iter()
    .map(|repo| {
        let target_branch = target_branches.get(&repo.id).cloned().unwrap_or_default();
        // Find this repo's project_repo row.
        let pr = project_repos.iter().find(|pr| pr.repo_id == repo.id);
        let mount = pr.and_then(|pr| {
            let parent_pr_id = pr.parent_project_repo_id?;
            let rel = pr.nested_path.clone()?;
            let parent_pr = pr_by_id.get(&parent_pr_id)?;
            let parent_repo_name = repo_name_by_id.get(&parent_pr.repo_id)?.clone();
            Some(NestedMount { parent_repo_name, rel_path: rel })
        });
        match mount {
            Some(m) => RepoWorkspaceInput::nested(repo.clone(), target_branch, m),
            None => RepoWorkspaceInput::new(repo.clone(), target_branch),
        }
    })
    .collect();
```

IMPORTANT ordering: a child's worktree must be created AFTER its parent's (the parent dir must exist). `find_repos_for_workspace` orders by `display_name`, which is NOT dependency order. Sort `workspace_inputs` so that inputs with `nested_under == None` come first, then nested ones (one level → two-tier sort suffices). Add a stable sort:
```rust
let mut workspace_inputs = workspace_inputs;
workspace_inputs.sort_by_key(|i| i.nested_under.is_some());
```

Then ALSO persist the per-workspace nesting into `workspace_repos` so diff/merge can read it. The `workspace_repos` rows are created earlier (in `tasks.rs` via `create_many`), so apply nesting as an UPDATE: after `create_workspace`, for each nested input call `WorkspaceRepo::set_nesting(...)` (added in Task 4), resolving `parent_workspace_repo_id` from the parent repo's `workspace_repos` row (look it up via `WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, parent_repo_id)`):

```rust
let workspace_repo_rows =
    WorkspaceRepo::find_by_workspace_id(&self.db.pool, workspace.id).await?;
let wr_id_by_repo: std::collections::HashMap<Uuid, Uuid> = workspace_repo_rows
    .iter()
    .map(|wr| (wr.repo_id, wr.id))
    .collect();
for input in &workspace_inputs {
    if let Some(mount) = &input.nested_under {
        // Resolve the parent repo_id from its repo.name.
        let parent_repo_id = repositories
            .iter()
            .find(|r| r.name == mount.parent_repo_name)
            .map(|r| r.id);
        let parent_wr_id = parent_repo_id.and_then(|rid| wr_id_by_repo.get(&rid).copied());
        WorkspaceRepo::set_nesting(
            &self.db.pool,
            workspace.id,
            input.repo.id,
            parent_wr_id,
            Some(&mount.rel_path),
        )
        .await?;
    }
}
```

> NOTE TO IMPLEMENTER: verify against `crates/server/src/routes/tasks.rs` that workspace_repos rows are created before `container.create()` runs (they are, via `WorkspaceRepo::create_many`). If — and only if — that turns out false, fall back to inserting nesting at row-creation time in tasks.rs. Report which path you used.

- [ ] **Step 5: Verify + commit**

Run: `pnpm run backend:check`
Expected: PASS once Tasks 4+5 are consistent (field renames resolved).

```bash
git add crates/services/src/services/workspace_manager.rs crates/local-deployment/src/container.rs crates/db/src/models/workspace_repo.rs crates/db/.sqlx
git commit -m "feat(workspace): nest child repo worktrees from project containment"
```

---

## Task 6: Remove submodule merge orchestration

**Covers:** [S6]

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs`

- [ ] **Step 1: Delete the ordered submodule merge block**

In `merge_task_attempt`, DELETE the block added for submodules (the `let submodules = WorkspaceRepo::find_submodules_for_workspace(...)` loop that merged each submodule, staged the gitlink, and committed it — everything between `commit_message` computation and the parent `merge_changes` call that relates to submodules, including the `staged_any_gitlink` commit). The parent `merge_changes` + `Merge::create_direct` + status/archive remain exactly as before submodules existed.

- [ ] **Step 2: Confirm diff path still correct after rename**

`get_workspace_diffs` used `workspace_repo.submodule_path.is_some()`. Update to `workspace_repo.nested_path.is_some()` (field rename). The logic (use `repo.path` for nested, else `repo_worktree_path`) is unchanged and correct.

- [ ] **Step 3: Verify + commit**

Run: `pnpm run backend:check`
Expected: PASS.

```bash
git add crates/server/src/routes/task_attempts.rs
git commit -m "feat(merge): remove gitlink coupling; per-repo merge for nested repos"
```

---

## Task 7: Delete dead submodule git code

**Covers:** [S8]

**Files:**
- Delete: `crates/git/src/submodule.rs`
- Modify: `crates/git/src/lib.rs`, `crates/git/src/cli.rs`

- [ ] **Step 1: Remove module + dead ops**

- In `crates/git/src/lib.rs`: remove `pub mod submodule;`; delete `GitService::submodule_init`, `GitService::create_base_branch_in_worktree`. Delete `GitService::create_branch_in_worktree` only if no longer referenced (grep first). Keep `stage_submodule_gitlink`/`add_path`/`commit_staged` only if still referenced — grep; if the merge block removal (Task 6) made `stage_submodule_gitlink` unused, delete it and its `GitCli::add_path` too (unless `add_path` is used elsewhere).
- In `crates/git/src/cli.rs`: delete `submodule_update_init`, `create_branch_at_head`, `checkout_new_branch`, and `add_path` IFF each is now unused (grep each across `crates/`).
- Delete `crates/git/src/submodule.rs`.

- [ ] **Step 2: Grep to confirm nothing references removed symbols**

Run: `rg "submodule_init|read_submodules|parse_gitmodules|create_base_branch_in_worktree|SUBMODULE_BASE_BRANCH|stage_submodule_gitlink|submodule_update_init|create_branch_at_head" crates/`
Expected: no matches (except possibly in docs/specs, which is fine).

- [ ] **Step 3: Verify compile + clippy**

Run: `pnpm run backend:check && cargo clippy --workspace --tests`
Expected: PASS, no warnings.

- [ ] **Step 4: Commit**

```bash
git add crates/git/
git commit -m "chore(git): remove unused submodule operations"
```

---

## Task 8: Regenerate types

**Covers:** [S9]

**Files:**
- Modify: `shared/types.ts` (generated)

- [ ] **Step 1: Regenerate**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` now has `is_nested` (not `is_submodule`) on `RepoWithTargetBranch`, and `ProjectRepo` carries `parent_project_repo_id` + `nested_path` if those types are exported.

- [ ] **Step 2: Frontend typecheck**

Run: `pnpm run check`
Expected: PASS. If a frontend file referenced `is_submodule`, rename to `is_nested` (grep `frontend/src` for `is_submodule`).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts frontend/
git commit -m "feat(types): regenerate types for nested repos"
```

---

## Task 9: Integration test — nested repo workspace + isolation

**Covers:** [S5, S6, S7, S10]

**Files:**
- Delete: `crates/services/tests/submodule_workspace.rs`
- Create: `crates/services/tests/nested_repos_workspace.rs`

- [ ] **Step 1: Delete the submodule test**

```bash
git rm crates/services/tests/submodule_workspace.rs
```

- [ ] **Step 2: Write the failing nested-repo test**

```rust
#[cfg(test)]
mod nested_repos_tests {
    use std::{path::Path, process::Command};
    use db::models::repo::Repo;
    use services::services::workspace_manager::{
        NestedMount, RepoWorkspaceInput, WorkspaceManager,
    };
    use tempfile::TempDir;
    use uuid::Uuid;
    use chrono::Utc;

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git").args(args).current_dir(dir).status().unwrap().success();
        assert!(ok, "git {:?} failed in {}", args, dir.display());
    }
    fn git_out(dir: &Path, args: &[&str]) -> String {
        let o = Command::new("git").args(args).current_dir(dir).output().unwrap();
        assert!(o.status.success(), "git {:?} failed", args);
        String::from_utf8(o.stdout).unwrap().trim().to_string()
    }
    fn test_repo(path: &Path, name: &str) -> Repo {
        // Match db::models::repo::Repo fields exactly (read repo.rs).
        Repo {
            id: Uuid::new_v4(),
            path: path.to_path_buf(),
            name: name.to_string(),
            display_name: name.to_string(),
            setup_script: None, cleanup_script: None, archive_script: None,
            copy_files: None, parallel_setup_script: false, dev_server_script: None,
            default_target_branch: None, default_working_dir: None,
            host_provider_override: None,
            created_at: Utc::now(), updated_at: Utc::now(),
        }
    }

    #[tokio::test]
    async fn nested_child_worktree_is_isolated_from_parent() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        // Parent repo A at root/open, ignoring child/.
        let parent = root.join("open");
        std::fs::create_dir_all(&parent).unwrap();
        git(&parent, &["init", "-b", "main"]);
        git(&parent, &["config", "user.email", "t@t.t"]);
        git(&parent, &["config", "user.name", "t"]);
        std::fs::write(parent.join(".gitignore"), "child/\n").unwrap();
        std::fs::write(parent.join("a.txt"), "open").unwrap();
        git(&parent, &["add", "-A"]);
        git(&parent, &["commit", "-m", "init open"]);

        // Child repo B independently cloned/inited at root/open/child.
        let child = parent.join("child");
        std::fs::create_dir_all(&child).unwrap();
        git(&child, &["init", "-b", "main"]);
        git(&child, &["config", "user.email", "t@t.t"]);
        git(&child, &["config", "user.name", "t"]);
        std::fs::write(child.join("b.txt"), "closed").unwrap();
        git(&child, &["add", "-A"]);
        git(&child, &["commit", "-m", "init child"]);

        // Build workspace inputs: parent flat, child nested under "child".
        let parent_input = RepoWorkspaceInput::new(test_repo(&parent, "open"), "main".into());
        let child_input = RepoWorkspaceInput::nested(
            test_repo(&child, "child"),
            "main".into(),
            NestedMount { parent_repo_name: "open".into(), rel_path: "child".into() },
        );

        let ws = root.join("ws");
        let branch = "vb/test";
        WorkspaceManager::create_workspace(&ws, &[parent_input, child_input], branch)
            .await
            .expect("create_workspace should succeed");

        let parent_wt = ws.join("open");
        let child_wt = parent_wt.join("child");
        // child materialized nested, on its own task branch
        assert!(child_wt.join("b.txt").exists(), "child file missing");
        assert_eq!(git_out(&child_wt, &["rev-parse", "--abbrev-ref", "HEAD"]), branch);
        assert_eq!(git_out(&parent_wt, &["rev-parse", "--abbrev-ref", "HEAD"]), branch);
        // ISOLATION: parent status must NOT show child/ (it is gitignored)
        let status = git_out(&parent_wt, &["status", "--porcelain"]);
        assert!(!status.contains("child"), "parent must not see child: {status}");
    }
}
```

- [ ] **Step 3: Run to verify it fails, then passes after Task 5**

Run: `cargo test --workspace nested_repos`
Expected: PASS (Task 5 already implemented the nesting). If FAIL, capture the assertion.

- [ ] **Step 4: Commit**

```bash
git add crates/services/tests/nested_repos_workspace.rs
git commit -m "test(workspace): nested repo materialized and isolated from parent"
```

---

## Task 10: Final verification

**Covers:** [S10]

- [ ] **Step 1: Full suite**

Run: `cargo test --workspace`
Expected: nested_repos + containment tests pass; no NEW failures. (The pre-existing `subagent_event_filter_drops_subagent_message_parts` failure and 4 frontend lint errors are unrelated — confirm they are unchanged, not newly introduced.)

- [ ] **Step 2: Lint + types + clippy**

Run: `cargo clippy --workspace --tests && pnpm run check && pnpm run backend:check`
Expected: clippy clean; tsc passes.

- [ ] **Step 3: Confirm no submodule remnants**

Run: `rg -i "submodule" crates/ shared/ frontend/src | rg -v "docs/"`
Expected: no functional references remain (only spec/plan docs may mention it).

- [ ] **Step 4: Commit any fmt fixes**

```bash
git add -A && git commit -m "chore: fmt for nested repos" || true
```
