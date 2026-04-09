# Persist Merge Error Across Task Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist merge errors in `localStorage` so users see failure messages after switching tasks or refreshing the page.

**Architecture:** Add `mergeError` / `setMergeError` to `GitOperationsContext`, backed by `localStorage` keyed by `attemptId`. Merge callbacks in `useGitOperations` write to the persistent store. Error banners read and display the persisted error with a dismiss button.

**Tech Stack:** React, TypeScript, localStorage

---

### Task 1: Add localStorage-backed merge error to GitOperationsContext

**Files:**
- Modify: `frontend/src/contexts/GitOperationsContext.tsx`

- [ ] **Step 1: Add localStorage helpers and expand context type**

Replace the entire file content with:

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const MERGE_ERROR_PREFIX = 'merge-error:';

function loadMergeError(attemptId: string): string | null {
  try {
    return localStorage.getItem(`${MERGE_ERROR_PREFIX}${attemptId}`);
  } catch {
    return null;
  }
}

function saveMergeError(attemptId: string, error: string | null) {
  try {
    const key = `${MERGE_ERROR_PREFIX}${attemptId}`;
    if (error) {
      localStorage.setItem(key, error);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable — silently degrade
  }
}

type GitOperationsContextType = {
  error: string | null;
  mergeError: string | null;
  setError: (error: string | null) => void;
  setMergeError: (error: string | null) => void;
};

const GitOperationsContext = createContext<GitOperationsContextType | null>(
  null
);

export const GitOperationsProvider: React.FC<{
  attemptId: string | undefined;
  children: React.ReactNode;
}> = ({ attemptId, children }) => {
  const [error, setError] = useState<string | null>(null);
  const [mergeError, setMergeErrorState] = useState<string | null>(() =>
    attemptId ? loadMergeError(attemptId) : null
  );

  useEffect(() => {
    setError(null);
    setMergeErrorState(attemptId ? loadMergeError(attemptId) : null);
  }, [attemptId]);

  const setMergeError = (msg: string | null) => {
    setMergeErrorState(msg);
    if (attemptId) saveMergeError(attemptId, msg);
  };

  return (
    <GitOperationsContext.Provider
      value={{ error, mergeError, setError, setMergeError }}
    >
      {children}
    </GitOperationsContext.Provider>
  );
};

export const useGitOperationsError = () => {
  const ctx = useContext(GitOperationsContext);
  if (!ctx) {
    throw new Error(
      'useGitOperationsError must be used within GitOperationsProvider'
    );
  }
  return ctx;
};
```

- [ ] **Step 2: Verify frontend type-checks pass**

Run: `cd frontend && pnpm run check`
Expected: No type errors related to `GitOperationsContext`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/GitOperationsContext.tsx
git commit -m "feat(git-ops): add localStorage-backed mergeError to GitOperationsContext"
```

---

### Task 2: Wire merge callbacks to setMergeError in useGitOperations

**Files:**
- Modify: `frontend/src/hooks/useGitOperations.ts`

- [ ] **Step 1: Update merge callbacks to use setMergeError**

In `frontend/src/hooks/useGitOperations.ts`, change line 15 from:

```ts
  const { setError } = useGitOperationsError();
```

to:

```ts
  const { setError, setMergeError } = useGitOperationsError();
```

Then change lines 34-44 from:

```ts
  const merge = useMerge(
    attemptId,
    () => setError(null),
    (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to merge';
      setError(message);
    }
  );
```

to:

```ts
  const merge = useMerge(
    attemptId,
    () => setMergeError(null),
    (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String(err.message)
          : 'Failed to merge';
      setMergeError(message);
    }
  );
```

- [ ] **Step 2: Verify frontend type-checks pass**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useGitOperations.ts
git commit -m "feat(git-ops): wire merge callbacks to persistent setMergeError"
```

---

### Task 3: Add catch block to performMerge in GitOperations.tsx

**Files:**
- Modify: `frontend/src/components/tasks/Toolbar/GitOperations.tsx`

- [ ] **Step 1: Add catch block to performMerge**

In `frontend/src/components/tasks/Toolbar/GitOperations.tsx`, change lines 223-247 from:

```ts
  const performMerge = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    if (!mergeSessionId || !mergeExecutorProfileId) {
      setError(t('git.errors.sessionRequired'));
      return;
    }
    try {
      setMerging(true);
      await git.actions.merge({
        repoId,
        sessionId: mergeSessionId,
        executorProfileId: mergeExecutorProfileId,
        commitMessageExecutorProfileId:
          config?.commit_message_executor_profile ?? null,
        commitMessageEnabled: config?.commit_message_enabled ?? true,
        commitMessageSingleCommit:
          config?.commit_message_single_commit ?? false,
      });
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } finally {
      setMerging(false);
    }
  };
```

to:

```ts
  const performMerge = async () => {
    const repoId = getSelectedRepoId();
    if (!repoId) return;
    if (!mergeSessionId || !mergeExecutorProfileId) {
      setError(t('git.errors.sessionRequired'));
      return;
    }
    try {
      setMerging(true);
      await git.actions.merge({
        repoId,
        sessionId: mergeSessionId,
        executorProfileId: mergeExecutorProfileId,
        commitMessageExecutorProfileId:
          config?.commit_message_executor_profile ?? null,
        commitMessageEnabled: config?.commit_message_enabled ?? true,
        commitMessageSingleCommit:
          config?.commit_message_single_commit ?? false,
      });
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
    } catch {
      // Error already handled by useMerge onError → setMergeError
    } finally {
      setMerging(false);
    }
  };
```

The only change is adding `catch {}` between the `try` and `finally` blocks.

- [ ] **Step 2: Verify frontend type-checks pass**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tasks/Toolbar/GitOperations.tsx
git commit -m "fix(git-ops): catch unhandled rejection in performMerge"
```

---

### Task 4: Update GitErrorBanner and GitActionsDialog to show persistent merge errors

**Files:**
- Modify: `frontend/src/pages/ProjectTasks.tsx` (GitErrorBanner)
- Modify: `frontend/src/components/dialogs/tasks/GitActionsDialog.tsx`

- [ ] **Step 1: Update GitErrorBanner in ProjectTasks.tsx**

In `frontend/src/pages/ProjectTasks.tsx`, add `X` to the existing lucide-react import (find the line that imports from `lucide-react` and add `X` to it).

Then change lines 104-114 from:

```tsx
function GitErrorBanner() {
  const { error: gitError } = useGitOperationsError();

  if (!gitError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded">
      <div className="text-destructive text-sm">{gitError}</div>
    </div>
  );
}
```

to:

```tsx
function GitErrorBanner() {
  const { error, mergeError, setMergeError } = useGitOperationsError();
  const displayError = mergeError || error;

  if (!displayError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded flex items-center justify-between gap-2">
      <div className="text-destructive text-sm">{displayError}</div>
      {mergeError && (
        <button
          onClick={() => setMergeError(null)}
          className="shrink-0 text-destructive/60 hover:text-destructive"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update GitActionsDialog error display**

In `frontend/src/components/dialogs/tasks/GitActionsDialog.tsx`, change line 43 from:

```tsx
  const { error: gitError } = useGitOperationsError();
```

to:

```tsx
  const { error, mergeError, setMergeError } = useGitOperationsError();
  const gitError = mergeError || error;
```

Then change lines 80-84 from:

```tsx
      {gitError && (
        <div className="p-3 border border-destructive rounded text-destructive text-sm">
          {gitError}
        </div>
      )}
```

to:

```tsx
      {gitError && (
        <div className="p-3 border border-destructive rounded text-destructive text-sm flex items-center justify-between gap-2">
          <span>{gitError}</span>
          {mergeError && (
            <button
              onClick={() => setMergeError(null)}
              className="shrink-0 text-destructive/60 hover:text-destructive"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
```

Add `X` to the existing lucide-react import at the top of the file (line 2):

```tsx
import { ExternalLink, GitPullRequest, X } from 'lucide-react';
```

- [ ] **Step 3: Verify frontend type-checks pass**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectTasks.tsx frontend/src/components/dialogs/tasks/GitActionsDialog.tsx
git commit -m "feat(git-ops): display persistent merge errors with dismiss button"
```
