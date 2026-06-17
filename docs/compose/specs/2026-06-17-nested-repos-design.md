# Nested Repos via Path Containment — Design Spec

Date: 2026-06-17
Status: Proposed
Supersedes the discovery + gitlink mechanism of: `2026-06-16-submodule-support-design.md`

## [S1] Problem

The previously-implemented submodule support assumed git submodules: a parent
repo references a child at a specific commit via a **gitlink** + `.gitmodules`,
and on merge we update that gitlink in the parent.

That model is wrong for the user's actual layout:

- An **open-source** repo (parent `A`) physically contains a **closed-source**
  repo (child `B`) as a nested directory — `B` is an *independent clone*, NOT a
  git submodule.
- `A`'s `.gitignore` ignores `B`'s directory, so `A` has **no knowledge** of
  `B`: no gitlink, no `.gitmodules` entry, nothing in `A`'s history ever points
  at `B`.

The reason for ignoring `B` is **isolation**: changes in the closed-source
child must never be visible in — or recorded by — the open-source parent. A
real submodule's gitlink would leak "the closed repo advanced to commit X" into
the open repo's history; the user deliberately avoids that by using a plain
ignored nested clone instead of a submodule.

So: two independent git repos, one physically nested inside the other's working
tree, each with its own commits/diff/merge, with **zero** cross-references.

Disk layout (physical nesting is a given — confirmed):

```
/repos/open/            (repo A, open source)
├── .gitignore          contains "child/"
├── src/...
└── child/              (repo B, closed source — independent clone)
    ├── .git/
    └── src/...
```

## [S2] What carries over vs. what changes

vibe-kanban already has a generalized **multi-repo workspace**: N independent
repos, each with its own worktree, branch, diff, and merge. `A` and `B` are
exactly two independent workspace repos — and because there is no gitlink, none
of the submodule "update gitlink on merge" machinery applies (which is good: it
was the leakage risk).

The just-shipped submodule feature (`c27b08f23`) built reusable **nested**
infrastructure we keep, and discovery/gitlink machinery we drop:

| Concern | Submodule impl (shipped) | This design |
|---|---|---|
| Parent/child discovery | parse `.gitmodules` | **path containment at add-repo time** |
| Nested worktree layout | `submodule_path` + nested worktree | **reuse** (rename to `nested_path`) |
| Independent branch/diff | yes | **reuse** |
| Parent tracks child | gitlink (`git add <path>`) | **none** — parent `.gitignore`s the child |
| Merge updates gitlink | implemented | **remove** — would leak into parent |
| `git submodule update --init` | needed | **not needed** — child is its own clone |
| `.gitmodules` parsing | needed | **remove** |

## [S3] Containment computation (the one genuinely new piece)

When a repo is added to a project (`ProjectRepo::add_repo_to_project`,
`crates/db/src/models/project_repo.rs:120`, and the project-create path), the
new repo's on-disk path is compared against every repo already in the project:

- If path `X` is a **proper prefix** (directory ancestor) of path `Y`, then the
  repo at `Y` is **nested inside** the repo at `X` — `Y` is the child, `X` the
  parent, and the **relative mount path** = `Y` relative to `X` (e.g. `child`).
- If neither path contains the other, the repos are **siblings** (flat layout,
  unchanged from today).
- Comparison is on **canonicalized absolute paths**, component-wise (so
  `/repos/open` is an ancestor of `/repos/open/child` but NOT of
  `/repos/open-other`). Never do raw string-prefix matching — `/a/b` is not an
  ancestor of `/a/bc`.

Determinism / edge cases the implementation MUST handle:
- **Order independence:** adding `B` before `A`, or `A` before `B`, must
  produce the same parent→child edge. Recompute relationships across the full
  project repo set on each add (and re-evaluate on remove), rather than only
  comparing against the previous state.
- **Multiple candidate parents:** if both `/repos/open` and
  `/repos/open/mid` are ancestors of `/repos/open/mid/leaf`, the parent is the
  **nearest** ancestor (`/repos/open/mid`). (Whether deep nesting beyond one
  level is in scope is settled in [S6].)
- **No self-parenting**, no cycles (path ancestry is acyclic by construction).

## [S4] Data model

The parent/child relationship is fixed at project configuration time (not per
task), so it lives at the **project** layer and each workspace inherits it.

Reuse the shipped fields but relocate the source of truth:

- Add to `project_repos` (`crates/db/src/models/project_repo.rs`):
  - `parent_project_repo_id` (Option<Uuid>, self-FK, NULL for top-level)
  - `nested_path` (Option<String>, child path relative to parent worktree root;
    NULL for top-level)
- Keep `workspace_repos.parent_workspace_repo_id` / `nested_path` as a
  **per-workspace derived snapshot** (renamed from `submodule_path`). The
  project layer is the source of truth; at workspace-creation time we copy the
  parent/child edge + relative path into the workspace_repos rows. Downstream
  code (worktree layout in `workspace_manager`, diff resolution in
  `get_workspace_diffs`) continues to read from `workspace_repos` exactly as the
  shipped submodule code does — so keeping these columns means the
  worktree/diff layers need no change beyond the field rename.

> Migration note: the submodule columns shipped in `c27b08f23` are only days
> old and (per project memory) not yet relied upon by real data. Prefer a clean
> rename migration over carrying a misleading `submodule_path` name. Confirm no
> production rows depend on it during planning.

## [S5] Workspace creation

Worktree creation (`WorkspaceManager::create_workspace`,
`crates/services/src/services/workspace_manager.rs:59`) changes as follows:

1. Create the **parent** repo's worktree at `workspace_dir/{parent.name}` (as
   today, top-level repos stay flat).
2. For each repo whose project-level relationship marks it a **child**, create
   its worktree **nested** at `<parent_worktree>/<nested_path>` — operating on
   the **child repo's own git repository** (it is an independent clone), via the
   normal `create_worktree` path. There is **no** `git submodule update`,
   because there is no submodule.
3. The child worktree is a normal worktree of repo `B` with its own task branch
   cut from `B`'s target branch — identical to how any top-level repo's worktree
   is made, just rooted at a nested path.
4. Rollback: a child worktree failure rolls back the workspace (reuse existing
   rollback), consistent with the shipped behavior.

Critical consequence vs. submodules: because `B` is independent and `A` ignores
`B`'s directory, `A`'s worktree naturally sees `child/` as an ignored directory.
`A`'s status/diff never reflect `B`. No gitlink, nothing to stage.

## [S6] Merge — no cross-repo coupling

Remove the submodule merge orchestration entirely (the ordered
submodule→stage-gitlink→commit→parent block added to `merge_task_attempt`,
`crates/server/src/routes/task_attempts.rs`). Each repo — parent and child —
merges **independently** via the existing per-repo merge path. The parent never
stages or commits anything about the child; the parent's `.gitignore` keeps the
child's directory out of the parent's index entirely.

This restores the original isolation guarantee: nothing about `B` is ever
recorded in `A`.

Scope — **one level** of nesting (a child directly inside a parent). Deeper
nesting (a child inside a child) is out of scope, mirroring the shipped
submodule scope. The containment computation in [S3] still picks the nearest
ancestor so a 3-level disk layout doesn't mis-attribute, but only the
parent↔direct-child edge is materialized.

## [S7] Diff

Reuse the shipped submodule diff path: a nested (child) workspace repo resolves
its worktree path to its own nested worktree, and surfaces as a normal,
independently-selectable per-repo diff (`get_workspace_diffs`,
`task_attempts.rs:362`). The closed-source child's changes appear ONLY in the
child's own diff — never in the parent's — which is precisely the isolation the
user wants. No diff-layer change beyond what already shipped (the
`nested_path.is_some() → use repo.path` resolution).

## [S8] Discovery mechanism removal

Remove `.gitmodules` parsing from the workspace-creation path
(`git::submodule::read_submodules` usage in `workspace_manager.rs` and
`container.rs`) and the submodule git ops that are no longer used
(`submodule_init` / `submodule_update_init`). Keep `create_branch_in_worktree`
/ `create_base_branch_in_worktree` only if still needed for child worktree
branch setup; otherwise remove. The `.gitmodules` parser module
(`crates/git/src/submodule.rs`) can be deleted if nothing else references it.

> Planning must audit each shipped helper and remove dead code rather than
> leaving orphaned submodule functions.

## [S9] Types

Regenerate TypeScript types after the rename (`submodule_path` → `nested_path`,
and any new `parent_project_repo_id` exposure). The shipped `is_submodule` flag
on `RepoWithTargetBranch` becomes `is_nested` (or similar). Use
`pnpm run generate-types`; never hand-edit `shared/types.ts`.

## [S10] Testing

- Unit: containment computation — ancestor/sibling/nearest-parent/order-
  independence/`/a/b` vs `/a/bc` non-match.
- Integration: create a project with `A` at `/tmp/open` and `B` at
  `/tmp/open/child`; assert the project records `B` as child of `A` with
  `nested_path = "child"`. Create a workspace; assert `B`'s worktree exists at
  `<ws>/A/child` on its own task branch, `A`'s worktree sees `child/` as
  ignored, and `A`'s diff does NOT include `B`'s changes.
- Integration: modify and merge both `A` and `B` independently; assert `A`'s
  history contains NO reference to `B` (no gitlink, no `child/` entry).
- `cargo test --workspace`, `pnpm run check`, `cargo clippy --workspace
  --tests` clean.

## [S11] Risks

- **Path canonicalization** is the subtle correctness core: symlinks, trailing
  slashes, case-insensitive filesystems, and `/a/b` vs `/a/bc`. Component-wise
  comparison on canonicalized paths is mandatory.
- **Rename churn:** `submodule_path`/`is_submodule` are referenced across db,
  services, server, and generated types. The rename must be complete or
  compilation breaks; lean on the compiler.
- **Removing shipped code:** must not leave the merge path half-converted —
  removing the gitlink block while leaving the discovery wiring would create an
  inconsistent state. Plan the removal as one coherent change.
- **The parent worktree must respect the child's ignore:** verify the parent
  repo's `.gitignore` actually covers the nested path so the child worktree
  living inside it does not show up as untracked in the parent. If the user's
  `.gitignore` is missing/incorrect, that's their config — but tests should use
  a correct `.gitignore` and we should not auto-modify it.
