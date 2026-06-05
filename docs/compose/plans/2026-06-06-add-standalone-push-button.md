# Add Standalone Push Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Push button to the Git Operations toolbar, making push accessible without requiring an existing PR.

**Architecture:** Add a new Push button in the GitOperations component alongside existing Merge, PR, and Rebase buttons. Reuse existing `handlePushClick` function and `usePush` hook. Button follows same styling patterns as other action buttons.

**Tech Stack:** React, TypeScript, Tailwind CSS, i18n translations

---

### Task 1: Add Standalone Push Button to GitOperations

**Covers:** UI enhancement for git push accessibility

**Files:**
- Modify: `frontend/src/components/tasks/Toolbar/GitOperations.tsx:530-592`

- [ ] **Step 1: Add Push button before PR button**

In `GitOperations.tsx`, add a new Push button in the actions section. Insert it after the Merge button and before the PR button (around line 554).

```tsx
<Button
  onClick={handlePushClick}
  disabled={
    mergeInfo.hasMergedPR ||
    pushing ||
    isAttemptRunning ||
    hasConflictsCalculated ||
    ((selectedRepoStatus?.commits_ahead ?? 0) === 0 &&
      !pushSuccess)
  }
  variant="outline"
  size="xs"
  className="border-primary text-primary hover:bg-primary/10 gap-1 shrink-0"
  aria-label={pushButtonLabel}
>
  <Upload className="h-3.5 w-3.5" />
  <span className="truncate max-w-[10ch]">{pushButtonLabel}</span>
</Button>
```

- [ ] **Step 2: Add Upload icon import**

Add `Upload` to the lucide-react imports at the top of the file (line 1-10).

```tsx
import {
  ArrowRight,
  GitBranch as GitBranchIcon,
  GitPullRequest,
  RefreshCw,
  Settings,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Upload,
} from 'lucide-react';
```

- [ ] **Step 3: Add pushButtonLabel memo**

Add a memoized label for the push button alongside existing memos (after line 195).

```tsx
const pushButtonLabel = useMemo(() => {
  if (pushSuccess) return t('git.states.pushed');
  if (pushing) return t('git.states.pushing');
  return t('git.states.push');
}, [pushSuccess, pushing, t]);
```

- [ ] **Step 4: Verify button layout**

The final button order in the actions section should be:
1. Merge button
2. Push button (new)
3. PR button
4. Rebase button

- [ ] **Step 5: Run type check**

Run: `pnpm run check`
Expected: No type errors

- [ ] **Step 6: Run lint**

Run: `pnpm run lint`
Expected: No lint errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tasks/Toolbar/GitOperations.tsx
git commit -m "feat: add standalone push button to git operations toolbar"
```
