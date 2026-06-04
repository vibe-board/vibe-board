# Quick Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "OK" and "Continue" quick-send buttons above the WYSIWYG editor in the follow-up section.

**Architecture:** Add a row of small outline buttons above the editor in `TaskFollowUpSection`. Each button calls `sessionsApi.followUp()` directly with the button text as prompt, using the current executor profile. No new files, hooks, or components needed — just a few lines in one existing file.

**Tech Stack:** React, TypeScript, shadcn/ui Button, i18next

---

### Task 1: Add quick buttons to TaskFollowUpSection

**Files:**
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx:950-966`

- [ ] **Step 1: Add quick button handler**

In `TaskFollowUpSection.tsx`, after the existing `useCallback` hooks (around line 400, before the `useFollowUpSend` call), add a handler for quick button clicks:

```typescript
const handleQuickButton = useCallback(
  async (text: string) => {
    if (!sessionId || !selectedExecutor) return;
    try {
      await sessionsApi.followUp(sessionId, {
        prompt: text,
        executor_profile_id: {
          executor: selectedExecutor,
          variant: selectedVariant ?? null,
        },
        retry_process_id: null,
        force_when_dirty: null,
        perform_git_reset: null,
        allow_executor_change: null,
      });
    } catch (error) {
      console.error('Failed to send quick button message:', error);
    }
  },
  [sessionId, selectedExecutor, selectedVariant, sessionsApi]
);
```

- [ ] **Step 2: Add quick button UI above the editor**

In `TaskFollowUpSection.tsx`, at line 950, right before the `<WYSIWYGEditor>` (inside the `<div className="flex flex-col gap-2">`), add the quick button row:

```tsx
<div className="flex gap-2">
  <Button
    variant="outline"
    size="sm"
    onClick={() => handleQuickButton('ok')}
    disabled={!isEditable}
  >
    OK
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() => handleQuickButton('continue')}
    disabled={!isEditable}
  >
    Continue
  </Button>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm run check`
Expected: No errors

- [ ] **Step 4: Verify lint passes**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tasks/TaskFollowUpSection.tsx
git commit -m "feat: add quick send buttons (OK, Continue) above follow-up editor"
```
