# Submodule Support — Design Spec

Date: 2026-06-16
Status: Proposed

## [S1] Problem

vibe-kanban creates each task workspace as a **git worktree** that shares the
parent repo's object store (not a clone). `git worktree add` does **not**
populate submodule working trees, so when a project repo contains git
submodules, the submodule directories appear empty in the task workspace.

The user's framing: **a repo with submodules is effectively a mono-repo** —
the parent repo and the submodule are both code the user wants to modify in the
same task ("同时改两个仓库"). So submodule support is not merely "check out the
submodule files for building" — it must give the submodule the same
first-class treatment a normal repo gets: an isolated branch, an independent
diff, and a merge that flows back correctly.

Crucially, a submodule differs from a plain parallel repo by one thing: the
parent repo references the submodule at a specific commit via a **gitlink**
(plus `.gitmodules`). When the submodule changes, the parent's gitlink becomes
stale and must be updated, or the parent repo does not actually record the
change.

## [S2] Scope

In scope:
- Discover **direct** (one-level) submodules of a project repo when a task
  workspace is created.
- Give each submodule its own worktree (nested at its real path inside the
  parent worktree), its own task branch, independent diff, and independent
  merge — reusing the existing multi-repo workspace mechanism.
- On merge, update the parent repo's gitlink: merge the submodule first, then
  `git add <submodule-path>` + commit the new submodule SHA in the parent.

Explicitly out of scope:
- **Nested submodules** (a submodule that itself contains submodules). Only
  direct, one-level submodules are handled. Nested ones remain
  uninitialized/empty, same as today.
- Submodule URL/auth fetching beyond what the parent repo's local
  `.git/modules` cache already provides (worktrees share the parent object
  store and `.git/modules`, so already-initialized submodules need no network).
- Configurable opt-in/out. Default behavior is correct-by-default; a setting
  can be added later if there's a real performance complaint.

## [S3] Current architecture (the parts we reuse)

vibe-kanban already has a fully generalized **multi-repo workspace** model.
This design rides on it rather than inventing a submodule-specific path.

- `Repo` (`crates/db/src/models/repo.rs:19`) — global registry; `path` is
  `UNIQUE`. `Repo::find_or_create` upserts on path.
- `WorkspaceRepo` (`crates/db/src/models/workspace_repo.rs:11`) — junction
  with a per-repo `target_branch`.
- Workspace create flow: `container.rs:1517` `create()` →
  `WorkspaceManager::create_workspace` (`workspace_manager.rs:59`,
  worktree mode, `create_branch = true`). Each repo gets a worktree at
  `workspace_dir/{repo.name}` and a shared `workspace.branch` cut from its
  own `target_branch`.
- Worktree creation: `WorktreeManager::create_worktree`
  (`worktree_manager.rs:63`) → `GitCli::worktree_add` (`cli.rs:85`),
  `git -C <repo> worktree add [-b <branch>] <path> <base>`.
- Merge: per-repo, single `repo_id` per HTTP request —
  `merge_task_attempt` (`task_attempts.rs:678`) → `merge_changes`
  (`git/lib.rs:841`). **No cross-repo ordering exists today.**
- Diff: per-repo — `get_workspace_diffs` (`task_attempts.rs:362`),
  `DiffQuery { repo_id }`. Branch status loops all repos
  (`task_attempts.rs:1043`).

Gaps (nothing exists yet): no `.gitmodules` parsing, no parent↔submodule
relationship in the schema, flat worktree layout keyed on `repo.name`
(collides with nested paths), no gitlink update, no cross-repo merge ordering.

## [S4] Data model

A submodule's on-disk path is **task-specific** (it lives inside the task's
parent worktree, e.g. `workspace_dir/parent/libs/foo`), and it differs per
task. Therefore submodules must NOT be inserted into the global, path-`UNIQUE`
`Repo` table the way user-configured repos are.

Add submodule relationship metadata at the **workspace_repo** level so each
workspace can express "this repo entry is a submodule of that parent entry,
mounted at this relative path":

New columns on `workspace_repos` (new migration):
- `parent_workspace_repo_id UUID NULL` — points at the parent repo's
  `workspace_repos` row; `NULL` for top-level repos.
- `submodule_path TEXT NULL` — submodule path relative to the parent worktree
  root (e.g. `libs/foo`); `NULL` for top-level repos.

This keeps the global `Repo` registry clean (only user-declared repos), while
the parent↔submodule edge + mount path live on the per-workspace junction
where they actually belong. Ordering for merge is derivable: submodules
(non-NULL parent) merge before their parent.

> Open implementation question for the plan: whether the submodule still needs
> a `Repo` row at all (for `repo_id` FK reuse) or whether `workspace_repos`
> can carry a submodule without a global `Repo`. Resolve during planning by
> reading the FK constraints; prefer the minimal change.

## [S5] Discovery & workspace creation

Discovery happens at **workspace creation time**, after the parent worktree
exists (because `.gitmodules` is read from the worktree).

Flow extension in `create_workspace` (`workspace_manager.rs:59`):
1. Create the parent repo's worktree as today (`workspace_dir/{repo.name}`,
   new branch from target).
2. Parse `<parent_worktree>/.gitmodules` (if present) to enumerate direct
   submodules: their `path` and `url`.
3. For each direct submodule:
   - worktree path = `<parent_worktree>/<submodule_path>` (**nested layout**),
     not the flat `workspace_dir/{name}`.
   - Initialize the submodule's git data (reusing the parent's `.git/modules`
     cache; only fetch if uncached) and create a task branch in the submodule
     cut from the gitlink-referenced commit (the submodule's current base).
   - Register a `workspace_repos` entry with `parent_workspace_repo_id` and
     `submodule_path` set.
4. Rollback semantics: extend the existing rollback in `create_workspace`
   (`workspace_manager.rs:104`) to also clean up submodule worktrees.

Layout consequence: the existing `workspace_dir/{repo.name}` assumption is for
top-level repos only. Submodule worktree paths are derived from the parent
worktree + `submodule_path`. The path-derivation helpers
(`repo_worktree_path` in `task_attempts.rs:126` and `container.rs:83`) must
account for submodule entries.

Failure layering: since the user's intent is **完整支持** (full support) and a
submodule is "another repo to modify", a submodule init/checkout failure during
workspace creation is treated like any other repo's worktree failure — it
**rolls back** via the existing `create_workspace` rollback
(`workspace_manager.rs:104`) and the workspace creation fails loudly. We do NOT
silently produce a half-populated workspace, because a stale/empty submodule
would corrupt both the build and the later gitlink update.

## [S6] Diff (reused, mostly free)

Each submodule is a `workspace_repos` entry with its own worktree and branch,
so `get_workspace_diffs` (`task_attempts.rs:362`) and the per-repo diff UI work
unchanged — the submodule shows up as another selectable repo. Branch status
(`task_attempts.rs:1043`) already loops repos and will include submodules.

No diff-layer changes expected beyond ensuring submodule entries resolve their
nested worktree path correctly.

## [S7] Merge & gitlink update

This is the one genuinely new orchestration. Today merge is a single per-repo
HTTP action with no ordering. For a parent+submodule workspace, the merge of
the parent must:

1. Merge the submodule branch into its base first (existing `merge_changes`,
   `git/lib.rs:841`), obtaining the submodule's new merged commit SHA.
2. In the parent worktree, the gitlink at `<submodule_path>` is now at that new
   SHA (the submodule worktree HEAD advanced). Stage it: `git add
   <submodule_path>` so the parent's tree records the new gitlink.
3. Merge/commit the parent branch as today, now including the updated gitlink.

Design decisions for the plan to settle:
- **Trigger shape:** keep per-repo merge endpoints, but when merging a parent
  that has submodule children, the backend orchestrates the ordered sequence
  (submodule → gitlink stage → parent). Merging a submodule alone is still a
  valid standalone action.
- **`merges` table:** one `Merge` row per repo as today; the parent's merge row
  represents the gitlink-updating commit.
- One level only — no topological recursion (S2).

## [S8] Type generation

Any new fields exposed to the frontend (e.g. `parent_workspace_repo_id`,
`submodule_path`, or a derived `is_submodule` flag on `RepoWithTargetBranch`)
must be added to the Rust types and regenerated via `pnpm run generate-types`
(edit `crates/server/src/bin/generate_types.rs`, never `shared/types.ts`
directly).

## [S9] Testing

- Rust unit tests for `.gitmodules` parsing (present / absent / multiple
  submodules / submodule with non-leaf nested path).
- Integration test: create a workspace from a repo with one submodule; assert
  the submodule worktree exists at the nested path on its own branch, and that
  a diff is reported independently.
- Integration test: modify submodule + parent, run the ordered merge, assert
  the parent's gitlink advanced to the merged submodule SHA.
- `cargo test --workspace`, `pnpm run check`, `pnpm run backend:check` pass.

## [S10] Risks & notes

- **Nested-path worktree breaks the flat-layout assumption.** The most likely
  source of bugs. Audit every consumer of `repo_worktree_path` /
  `workspace_dir/{repo.name}`.
- **Worktree-inside-worktree.** Putting a submodule worktree inside the parent
  worktree means git sees a nested working tree at the gitlink path; verify
  `git worktree add` + submodule init interact cleanly (this is exactly why
  flat+symlink was rejected — nested is the real git semantics).
- **Name collisions** are avoided because submodule worktrees key on
  `submodule_path` (nested) rather than `repo.name`.
- Worktrees share `.git/modules`, so already-initialized submodules need no
  network on workspace creation.
