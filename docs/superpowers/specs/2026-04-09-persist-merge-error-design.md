# Persist Merge Error Across Task Navigation

## Problem

When a user clicks the merge button, the UI shows "merging" state. The user often closes the task panel and switches to other tasks. If the merge fails 1-2 minutes later, the error is stored in `GitOperationsContext` via `useState`. When the user returns to the task, the `useEffect` in `GitOperationsProvider` clears the error on `attemptId` change, so the user never sees the failure message.

## Solution

Persist merge errors in `localStorage` keyed by `attemptId`, so they survive both task switching and page refresh.

## Changes

### 1. `frontend/src/contexts/GitOperationsContext.tsx`

Add a `localStorage`-backed merge error store:

- `getMergeError(attemptId: string): string | null` — read from `localStorage` key `merge-error:{attemptId}`.
- `setMergeError(attemptId: string, error: string | null)` — write or remove the `localStorage` entry.
- On provider mount / `attemptId` change: restore from `localStorage` instead of resetting to `null`.
- Expose a new `setMergeError` in context alongside existing `setError`, or rename/restructure so merge errors are distinct from ephemeral git operation errors.

Context shape becomes:

```ts
type GitOperationsContextType = {
  error: string | null;        // ephemeral (push, rebase, etc.)
  mergeError: string | null;   // persistent (merge only)
  setError: (error: string | null) => void;
  setMergeError: (error: string | null) => void;
};
```

Provider logic:

```ts
const [error, setError] = useState<string | null>(null);
const [mergeError, setMergeErrorState] = useState<string | null>(() =>
  attemptId ? getMergeError(attemptId) : null
);

// Restore merge error when attemptId changes
useEffect(() => {
  setError(null);
  setMergeErrorState(attemptId ? getMergeError(attemptId) : null);
}, [attemptId]);

const setMergeError = (msg: string | null) => {
  setMergeErrorState(msg);
  if (attemptId) persistMergeError(attemptId, msg);
};
```

localStorage helpers (same file, module-level):

```ts
const MERGE_ERROR_PREFIX = 'merge-error:';

function getMergeError(attemptId: string): string | null {
  return localStorage.getItem(`${MERGE_ERROR_PREFIX}${attemptId}`);
}

function persistMergeError(attemptId: string, error: string | null) {
  const key = `${MERGE_ERROR_PREFIX}${attemptId}`;
  if (error) {
    localStorage.setItem(key, error);
  } else {
    localStorage.removeItem(key);
  }
}
```

### 2. `frontend/src/hooks/useGitOperations.ts`

Change merge callbacks to use `setMergeError` instead of `setError`:

```ts
const merge = useMerge(
  attemptId,
  () => setMergeError(null),   // success: clear persistent error
  (err: unknown) => {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'Failed to merge';
    setMergeError(message);    // failure: persist error
  }
);
```

### 3. `frontend/src/components/tasks/Toolbar/GitOperations.tsx` — `performMerge`

Add explicit `catch` to prevent unhandled rejection:

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
    await git.actions.merge({ ... });
    setMergeSuccess(true);
    setTimeout(() => setMergeSuccess(false), 2000);
  } catch {
    // Error already handled by useMerge onError → setMergeError
  } finally {
    setMerging(false);
  }
};
```

### 4. Error display — `GitErrorBanner` and `GitActionsDialog`

Both already read from context and display errors. Update them to show `mergeError` in addition to `error`:

```tsx
function GitErrorBanner() {
  const { error, mergeError, setMergeError } = useGitOperationsError();
  const displayError = mergeError || error;
  if (!displayError) return null;

  return (
    <div className="mx-4 mt-4 p-3 border border-destructive rounded flex items-center justify-between">
      <div className="text-destructive text-sm">{displayError}</div>
      {mergeError && (
        <button onClick={() => setMergeError(null)} className="text-destructive/60 hover:text-destructive ml-2">
          ✕
        </button>
      )}
    </div>
  );
}
```

Same pattern for `GitActionsDialog`'s error display (line 80-83).

## Cleanup

Merge errors accumulate in `localStorage`. Since they're keyed by `attemptId` (UUID), stale entries won't collide. Optional: on app init, scan for entries older than 24h and remove them. Not required for v1.

## Scope

- 4 files modified, all frontend
- No backend changes
- No database migration
- No new dependencies
