# Direct Mode: Replace Diff Panel with Paginated Commits List

## Problem

In direct mode, opening the diff panel fails with:

```
ApiError: get_base_commit failed: Branch not found: vb/d339-test
```

Direct mode works on an existing branch without creating a new one and without a target branch. The diff panel relies on `get_base_commit()` which requires both a workspace branch and a target branch to compute a merge base — this is undefined in direct mode.

Additionally, direct mode allows users to select a branch during task creation, but this is an undefined behavior since direct mode should always use the main worktree's current branch.

## Requirements

1. **Hide diff panel in direct mode** — no diff button, no diff panel, no failing API calls.
2. **Commits panel shows all branch commits** — in direct mode, list all commits on the current branch (not just "new since target"), with paginated loading (50 per page).
3. **Disable branch selection in direct mode** — auto-use the main worktree's current branch; hide the branch selector UI.

## Design

### 1. Backend: Paginated Commit History Without Target Branch

**Endpoint:** `GET /api/task-attempts/{id}/commits?repo_id={repoId}&limit=50&skip=0`

**New query param:** `skip` (default 0) — number of commits to skip before returning results.

**Response type change:**

```rust
#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CommitHistoryResponse {
    pub commits: Vec<CommitInfo>,
    pub has_more: bool,
}
```

**Behavior by mode:**

- **Worktree mode (target branch exists):** Current behavior — walk commits from branch HEAD, stop at merge base with target branch. `has_more` is always `false` since the list is naturally bounded. `skip` param is supported but rarely needed.
- **Direct mode (`workspace.mode == Direct`):** Skip `get_base_commit()` entirely. Walk all commits on the branch using libgit2 revwalk with `skip` + `limit`. Set `has_more = true` if there are more commits beyond `skip + limit`.

**Detection logic:** The endpoint loads the `Workspace` from DB and checks `workspace.mode`. No heuristic needed — direct mode is explicit in the data model.

**Git operation:** Use libgit2 `Revwalk` with `set_sorting(Sort::TIME)`, push branch HEAD, then skip N commits and take up to `limit` commits. For each commit, compute stats by diffing against parent tree (same as current `get_commit_history` does).

### 2. Frontend: Hide Diff Panel in Direct Mode

**Files affected:**
- `frontend/src/components/panels/AttemptHeaderActions.tsx`
- `frontend/src/pages/ProjectTasks.tsx`

**AttemptHeaderActions.tsx:**
- Accept a prop like `isDirect: boolean` (or `workspaceMode`)
- When `isDirect`, don't render the "Diffs" toggle button

**ProjectTasks.tsx:**
- When selected attempt is direct mode and URL has `?view=diffs`, redirect to `?view=commits`
- Don't pass `mode='diffs'` to TasksLayout for direct workspaces

### 3. Frontend: Paginated Commits Panel

**Files affected:**
- `frontend/src/hooks/useCommitHistory.ts`
- `frontend/src/components/panels/CommitHistoryPanel.tsx`
- `frontend/src/lib/api.ts`
- `shared/types.ts` (generated from Rust)

**api.ts:**
- Update `getCommitHistory` to accept `skip` param and return `CommitHistoryResponse` (with `commits` and `has_more`).

**useCommitHistory.ts:**
- Replace `useQuery` with `useInfiniteQuery`:
  - `initialPageParam: 0` (skip=0)
  - `queryFn` passes `skip` (pageParam) to API
  - `getNextPageParam`: if `has_more`, return `previousSkip + 50`, else `undefined`
  - Flatten pages: `data.pages.flatMap(p => p.commits)`

**CommitHistoryPanel.tsx:**
- Add "Load More" button at the bottom of the list
- Visible when `hasNextPage` is true
- Shows loading spinner when `isFetchingNextPage` is true
- Header shows total loaded commit count

### 4. Frontend: Disable Branch Selection in Direct Mode

**Files affected:**
- `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`

**Changes:**
- When `workspaceMode === 'direct'`, hide the `RepoBranchSelector` component
- Show a read-only label indicating the current branch (e.g., "Branch: main (current)")
- The existing default logic in `useRepoBranchSelection` already picks the current branch when no override is set, so no hook changes needed

## Non-Goals

- Changing anything about worktree mode behavior
- Adding diff functionality to direct mode
- Changing the CommitInfo data structure
- Modifying the commit diff view (viewing a specific commit's diff still works in both modes)
