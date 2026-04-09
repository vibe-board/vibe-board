# Direct Mode Commits Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken diff panel with a paginated commits list in direct mode, and lock branch selection to the current branch.

**Architecture:** Four independent changes: (1) Add a new `CommitHistoryResponse` Rust type and a `get_commit_history_paginated` method that lists all commits with skip/limit when there's no target branch, (2) hide the diffs toggle button and panel when workspace mode is direct, (3) convert `useCommitHistory` to `useInfiniteQuery` with a "Load More" button, (4) hide the branch selector in the task form when direct mode is selected.

**Tech Stack:** Rust (git2, serde, ts-rs, axum), React (TypeScript, @tanstack/react-query), Tailwind CSS

---

### Task 1: Add `CommitHistoryResponse` type and paginated git method

**Files:**
- Modify: `crates/git/src/lib.rs:89-102` (add new struct after `CommitInfo`)
- Modify: `crates/git/src/lib.rs:1982-2065` (add new method alongside `get_commit_history`)
- Modify: `crates/server/src/bin/generate_types.rs:182` (register new type)

- [ ] **Step 1: Add `CommitHistoryResponse` struct to `crates/git/src/lib.rs`**

Add this struct right after the `CommitInfo` struct (after line 102):

```rust
/// Paginated response for commit history
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct CommitHistoryResponse {
    pub commits: Vec<CommitInfo>,
    pub has_more: bool,
}
```

- [ ] **Step 2: Add `get_commit_history_all` method to `GitService` in `crates/git/src/lib.rs`**

Add this method right after the existing `get_commit_history` method (after line 2065):

```rust
/// Get paginated commit history for a branch without a base branch.
/// Used in direct mode where there is no target branch to compare against.
/// Returns commits in reverse chronological order (newest first).
pub fn get_commit_history_all(
    &self,
    repo_path: &Path,
    branch_name: &str,
    skip: usize,
    limit: usize,
) -> Result<CommitHistoryResponse, GitServiceError> {
    let repo = self.open_repo(repo_path)?;

    let branch_oid = Self::find_branch(&repo, branch_name)?
        .get()
        .peel_to_commit()?
        .id();

    let mut revwalk = repo.revwalk()?;
    revwalk.push(branch_oid)?;
    revwalk.set_sorting(Sort::TIME)?;

    let mut commits = Vec::new();
    let mut skipped = 0;
    let mut has_more = false;

    for oid_result in revwalk {
        let oid = oid_result?;

        if skipped < skip {
            skipped += 1;
            continue;
        }

        if commits.len() >= limit {
            has_more = true;
            break;
        }

        let commit = repo.find_commit(oid)?;

        let full_message = commit.message().unwrap_or("");
        let message = full_message.lines().next().unwrap_or("").to_string();
        let body = {
            let rest: String = full_message
                .lines()
                .skip(1)
                .collect::<Vec<_>>()
                .join("\n")
                .trim()
                .to_string();
            if rest.is_empty() { None } else { Some(rest) }
        };

        let author = commit.author().name().unwrap_or("Unknown").to_string();

        let timestamp = {
            let time = commit.time();
            DateTime::from_timestamp(time.seconds(), 0).unwrap_or_else(Utc::now)
        };

        let commit_tree = commit.tree()?;
        let parent_tree = if commit.parent_count() == 0 {
            None
        } else {
            Some(commit.parent(0)?.tree()?)
        };

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)?;
        let stats = diff.stats()?;

        commits.push(CommitInfo {
            sha: oid.to_string(),
            message,
            body,
            author,
            timestamp,
            additions: stats.insertions() as u32,
            deletions: stats.deletions() as u32,
            files_changed: stats.files_changed() as u32,
        });
    }

    Ok(CommitHistoryResponse { commits, has_more })
}
```

- [ ] **Step 3: Register `CommitHistoryResponse` in `generate_types.rs`**

In `crates/server/src/bin/generate_types.rs`, add after line 182 (`git::CommitInfo::decl(),`):

```rust
        git::CommitHistoryResponse::decl(),
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check --workspace`
Expected: Compiles successfully with no errors.

- [ ] **Step 5: Commit**

```bash
git add crates/git/src/lib.rs crates/server/src/bin/generate_types.rs
git commit -m "feat(git): add CommitHistoryResponse type and get_commit_history_all method"
```

---

### Task 2: Update backend endpoint to support direct mode pagination

**Files:**
- Modify: `crates/server/src/routes/task_attempts.rs:1155-1199` (update `CommitHistoryQuery` and `get_commit_history` handler)

- [ ] **Step 1: Add `skip` to `CommitHistoryQuery` and update return type**

In `crates/server/src/routes/task_attempts.rs`, replace the `CommitHistoryQuery` struct and `get_commit_history` handler (lines 1155-1199):

```rust
#[derive(Debug, Deserialize)]
pub struct CommitHistoryQuery {
    pub repo_id: Uuid,
    #[serde(default = "default_commit_limit")]
    pub limit: usize,
    #[serde(default)]
    pub skip: usize,
}

fn default_commit_limit() -> usize {
    50
}

/// Get commit history for a task attempt's branch
pub async fn get_commit_history(
    Extension(workspace): Extension<Workspace>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<CommitHistoryQuery>,
) -> Result<ResponseJson<ApiResponse<git::CommitHistoryResponse>>, ApiError> {
    let pool = &deployment.db().pool;
    let workspace_repo =
        WorkspaceRepo::find_by_workspace_and_repo_id(pool, workspace.id, query.repo_id)
            .await?
            .ok_or(RepoError::NotFound)?;
    let repo = Repo::find_by_id(pool, workspace_repo.repo_id)
        .await?
        .ok_or(RepoError::NotFound)?;

    let container_ref = deployment
        .container()
        .ensure_container_exists(&workspace)
        .await?;
    let workspace_path = Path::new(&container_ref);
    let worktree_path = repo_worktree_path(workspace_path, &workspace, &repo);

    let git_service = GitService::new();

    let response = if workspace.mode == WorkspaceMode::Direct {
        git_service.get_commit_history_all(
            &worktree_path,
            &workspace.branch,
            query.skip,
            query.limit,
        )?
    } else {
        let commits = git_service.get_commit_history(
            &worktree_path,
            &workspace.branch,
            &workspace_repo.target_branch,
            query.limit,
        )?;
        git::CommitHistoryResponse {
            commits,
            has_more: false,
        }
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}
```

- [ ] **Step 2: Add missing import for `WorkspaceMode`**

Check if `WorkspaceMode` is already imported in `task_attempts.rs`. If not, add it to the imports at the top of the file:

```rust
use db::models::workspace::WorkspaceMode;
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --workspace`
Expected: Compiles successfully.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/task_attempts.rs
git commit -m "feat(api): support direct mode pagination in commit history endpoint"
```

---

### Task 3: Generate TypeScript types

**Files:**
- Modify: `shared/types.ts` (auto-generated)

- [ ] **Step 1: Regenerate TypeScript types**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` is updated with the new `CommitHistoryResponse` type containing `{ commits: CommitInfo[], has_more: boolean }`.

- [ ] **Step 2: Verify the generated type exists**

Open `shared/types.ts` and confirm `CommitHistoryResponse` is exported.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate TypeScript types for CommitHistoryResponse"
```

---

### Task 4: Update frontend API client

**Files:**
- Modify: `frontend/src/lib/api.ts:836-846` (update `getCommitHistory`)

- [ ] **Step 1: Update `getCommitHistory` to accept `skip` and return `CommitHistoryResponse`**

In `frontend/src/lib/api.ts`, replace the `getCommitHistory` method (around line 836):

```typescript
  /** Get commit history for a task attempt's branch */
  getCommitHistory: async (
    attemptId: string,
    repoId: string,
    limit: number = 50,
    skip: number = 0
  ): Promise<CommitHistoryResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/commits?repo_id=${repoId}&limit=${limit}&skip=${skip}`
    );
    return handleApiResponse<CommitHistoryResponse>(response);
  },
```

- [ ] **Step 2: Add `CommitHistoryResponse` to the import from `shared/types`**

Find the import line for shared types at the top of `api.ts` and add `CommitHistoryResponse` to the imported types.

- [ ] **Step 3: Verify frontend compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): update getCommitHistory to support skip param and CommitHistoryResponse"
```

---

### Task 5: Convert `useCommitHistory` to `useInfiniteQuery`

**Files:**
- Modify: `frontend/src/hooks/useCommitHistory.ts`

- [ ] **Step 1: Rewrite `useCommitHistory` to use `useInfiniteQuery`**

Replace the entire content of `frontend/src/hooks/useCommitHistory.ts`:

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { CommitInfo } from 'shared/types';

const PAGE_SIZE = 50;

export function useCommitHistory(
  attemptId: string | null,
  repoId: string | null
) {
  const query = useInfiniteQuery({
    queryKey: ['commitHistory', attemptId, repoId],
    queryFn: ({ pageParam = 0 }) =>
      attemptsApi.getCommitHistory(attemptId!, repoId!, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
    enabled: !!attemptId && !!repoId,
    staleTime: 30_000,
  });

  const commits: CommitInfo[] =
    query.data?.pages.flatMap((page) => page.commits) ?? [];

  return {
    commits,
    isLoading: query.isLoading,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `pnpm run check`
Expected: No type errors (CommitHistoryPanel will need updating in the next task, but the hook itself should compile).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCommitHistory.ts
git commit -m "feat(hooks): convert useCommitHistory to useInfiniteQuery with pagination"
```

---

### Task 6: Update `CommitHistoryPanel` for pagination

**Files:**
- Modify: `frontend/src/components/panels/CommitHistoryPanel.tsx:185-243`

- [ ] **Step 1: Update `CommitHistoryPanel` to use the new hook return shape and add Load More**

Replace the `CommitHistoryPanel` export (lines 185-243) with:

```typescript
export function CommitHistoryPanel({
  selectedAttempt,
  repoId,
  onViewDiff,
}: CommitHistoryPanelProps) {
  const { t } = useTranslation('tasks');
  const {
    commits,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCommitHistory(selectedAttempt?.id ?? null, repoId);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">
          {t('commit.errorLoadingHistory', { error: String(error) })}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {commits.length > 0 && (
        <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
          <div className="flex items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('commit.count', { count: commits.length })}
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : commits.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('commit.noCommits')}
          </div>
        ) : (
          <div>
            {commits.map((commit) => (
              <CommitItem
                key={commit.sha}
                commit={commit}
                attemptId={selectedAttempt!.id}
                repoId={repoId!}
                onViewDiff={onViewDiff}
              />
            ))}
            {hasNextPage && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <Loader className="h-4 w-4 mr-2" />
                  ) : null}
                  {isFetchingNextPage
                    ? t('commit.loadingMore', 'Loading...')
                    : t('commit.loadMore', 'Load More')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/panels/CommitHistoryPanel.tsx
git commit -m "feat(ui): add Load More button to CommitHistoryPanel for pagination"
```

---

### Task 7: Hide diff panel in direct mode

**Files:**
- Modify: `frontend/src/components/panels/AttemptHeaderActions.tsx`
- Modify: `frontend/src/pages/ProjectTasks.tsx`

- [ ] **Step 1: Add `isDirect` prop to `AttemptHeaderActions` and hide diffs toggle**

In `frontend/src/components/panels/AttemptHeaderActions.tsx`, update the props interface (line 23) to add `isDirect`:

```typescript
interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: Task;
  attempt?: WorkspaceWithSession | null;
  isDirect?: boolean;
}
```

Update the destructured props (line 31):

```typescript
export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
  isDirect,
}: AttemptHeaderActionsProps) => {
```

Then wrap the "Diffs" `ToggleGroupItem` (lines 106-119) in a conditional:

```typescript
            {!isDirect && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value="diffs"
                    aria-label="Diffs"
                    active={mode === 'diffs'}
                  >
                    <FileDiff className="h-4 w-4" />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.diffs')}
                </TooltipContent>
              </Tooltip>
            )}
```

- [ ] **Step 2: Pass `isDirect` prop in `ProjectTasks.tsx`**

In `frontend/src/pages/ProjectTasks.tsx`, find where `AttemptHeaderActions` is rendered (around line 894) and add the `isDirect` prop:

```typescript
          <AttemptHeaderActions
            mode={mode}
            onModeChange={setMode}
            task={selectedTask}
            attempt={attempt ?? null}
            isDirect={attempt?.mode === 'direct'}
            onClose={() =>
              navigate(`/local-projects/${projectId}/tasks`, { replace: true })
            }
          />
```

- [ ] **Step 3: Redirect `?view=diffs` to `?view=commits` in direct mode**

In `frontend/src/pages/ProjectTasks.tsx`, add a `useEffect` after the existing `view=logs` redirect (after line 392):

```typescript
  // Redirect diffs view to commits in direct mode (diffs are not available)
  useEffect(() => {
    if (!attempt || attempt.mode !== 'direct') return;
    const view = searchParams.get('view');
    if (view === 'diffs') {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'commits');
      params.delete('commit');
      setSearchParams(params, { replace: true });
    }
  }, [attempt, searchParams, setSearchParams]);
```

- [ ] **Step 4: Verify frontend compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/panels/AttemptHeaderActions.tsx frontend/src/pages/ProjectTasks.tsx
git commit -m "feat(ui): hide diff panel and button in direct mode"
```

---

### Task 8: Disable branch selection in direct mode task creation

**Files:**
- Modify: `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`

- [ ] **Step 1: Hide branch selector when direct mode is selected**

In `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx`, the branch selector section starts around line 508 with `<form.Field name="autoStart" mode="array">`. The inner content renders both a single-repo `BranchSelector` (line 539) and a multi-repo `RepoBranchSelector` (line 575).

We need to read the current `workspaceMode` value and conditionally hide the branch selectors. Replace the branch rendering section.

Find the block that renders `isSingleRepo && (` (around line 539) and wrap it:

Replace this (lines 539-573):
```typescript
                      {isSingleRepo && (
                        <form.Field name="repoBranches">
```

With a conditional that also reads `workspaceMode`:

```typescript
                      {isSingleRepo && (
                        <form.Field name="workspaceMode">
                          {(wmField) => {
                            if (wmField.state.value === 'direct') {
                              const config = repoBranchConfigs[0];
                              const currentBranch = config.branches.find(
                                (b) => b.is_current
                              );
                              return currentBranch ? (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground px-1">
                                  <span>{currentBranch.name}</span>
                                </div>
                              ) : null;
                            }
                            return (
                              <form.Field name="repoBranches">
```

And close the new wrappers after the existing closing `</form.Field>` for `repoBranches` (around line 572):

```typescript
                              </form.Field>
                            );
                          }}
                        </form.Field>
                      )}
```

Similarly, wrap the multi-repo `RepoBranchSelector` block (lines 575-608). Find:

```typescript
                    {!isSingleRepo && (
                      <form.Field name="repoBranches">
```

And wrap with workspace mode check:

```typescript
                    {!isSingleRepo && (
                      <form.Field name="workspaceMode">
                        {(wmField) => {
                          if (wmField.state.value === 'direct') {
                            return (
                              <div className="text-sm text-muted-foreground px-1">
                                {repoBranchConfigs.map((config) => {
                                  const currentBranch = config.branches.find(
                                    (b) => b.is_current
                                  );
                                  return currentBranch ? (
                                    <div key={config.repoId} className="flex items-center gap-1">
                                      <span className="font-medium">{config.repoDisplayName}:</span>
                                      <span>{currentBranch.name}</span>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            );
                          }
                          return (
                            <form.Field name="repoBranches">
```

And close the new wrappers after the existing closing `</form.Field>` for multi-repo `repoBranches`:

```typescript
                            </form.Field>
                          );
                        }}
                      </form.Field>
                    )}
```

- [ ] **Step 2: Verify frontend compiles**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dialogs/tasks/TaskFormDialog.tsx
git commit -m "feat(ui): hide branch selector in direct mode, show current branch as read-only"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 2: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: No errors.

- [ ] **Step 3: Verify type generation is up to date**

Run: `pnpm run generate-types:check`
Expected: Types are up to date.

- [ ] **Step 4: Commit any remaining changes**

If there are any fixups needed from the verification steps, commit them.
