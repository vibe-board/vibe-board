# Tauri Overflow Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 42px height overflow caused by TabBar and make the follow-up action bar responsive by collapsing secondary buttons into an overflow menu at narrow widths.

**Architecture:** Two independent changes: (1) a one-line CSS class fix in NormalLayout, (2) a ResizeObserver-based compact mode in TaskFollowUpSection that swaps three secondary buttons for a DropdownMenu when the action bar is narrower than 480px.

**Tech Stack:** React, Tailwind CSS, ResizeObserver API, existing DropdownMenu (Radix UI), lucide-react icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/layout/NormalLayout.tsx` | Modify line 40 | Fix `h-screen` → `h-full` |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | Modify lines 1-12, 957-1055 | Add compact mode detection + overflow menu |

---

### Task 1: Fix NormalLayout Height Overflow

**Files:**
- Modify: `frontend/src/components/layout/NormalLayout.tsx:40`

- [ ] **Step 1: Change `h-screen` to `h-full`**

In `frontend/src/components/layout/NormalLayout.tsx`, line 40, replace:

```tsx
<div className="flex flex-col h-screen">
```

with:

```tsx
<div className="flex flex-col h-full">
```

**Why this is safe:** `NormalLayout` is always rendered inside `TabShell` (see `main.tsx:89`). The height chain is:
- `TabShell` outer div: `h-screen` (100vh)
- `TabBar`: 42px
- TabShell content div: `flex-1 overflow-hidden` (fills remaining space)
- Per-tab wrapper: `h-full overflow-hidden`
- `ProjectTab` → `App` → `NormalLayout`

`h-full` makes NormalLayout inherit the actual available height from the tab content wrapper, instead of claiming the full viewport.

- [ ] **Step 2: Verify visually**

Run the dev server:
```bash
pnpm run dev
```

Open the app in a browser. Verify:
1. The terminal panel at the bottom is fully visible (not clipped by 42px)
2. The follow-up input area is fully visible
3. The tab bar at the top is visible and functional
4. Resizing the window does not cause layout overflow

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/NormalLayout.tsx
git commit -m "fix(layout): change NormalLayout h-screen to h-full for TabShell compatibility"
```

---

### Task 2: Add Compact Mode Detection to Action Bar

**Files:**
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx:28` (add `MoreHorizontal` import)
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx:20` (add `DropdownMenuSeparator` import)
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx:957-958` (add ref + compact state)

- [ ] **Step 1: Add `MoreHorizontal` to lucide-react imports**

In `frontend/src/components/tasks/TaskFollowUpSection.tsx`, line 1-12, the existing lucide import block is:

```tsx
import {
  CheckSquare,
  Loader2,
  Send,
  StopCircle,
  AlertCircle,
  Clock,
  X,
  Paperclip,
  Terminal,
  MessageSquare,
} from 'lucide-react';
```

Replace with:

```tsx
import {
  CheckSquare,
  Loader2,
  Send,
  StopCircle,
  AlertCircle,
  Clock,
  X,
  Paperclip,
  Terminal,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react';
```

- [ ] **Step 2: Add `DropdownMenuSeparator` to dropdown-menu imports**

In the same file, line 17-20, the existing dropdown-menu import is:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

Replace with:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

- [ ] **Step 3: Add ResizeObserver hook inside `TaskFollowUpSection` component**

Find the component body. Locate the existing `useRef` and `useState` calls near the top of the component function. Add these two lines alongside the existing state declarations (do NOT replace any existing code — add these as new declarations):

```tsx
const actionBarRef = useRef<HTMLDivElement>(null);
const [isCompact, setIsCompact] = useState(false);
```

Then add a `useEffect` for the ResizeObserver. Place it near the other `useEffect` calls in the component:

```tsx
useEffect(() => {
  const el = actionBarRef.current;
  if (!el) return;
  const observer = new ResizeObserver(([entry]) => {
    setIsCompact(entry.contentRect.width < 480);
  });
  observer.observe(el);
  return () => observer.disconnect();
}, []);
```

- [ ] **Step 4: Attach ref to action bar container**

In the JSX, at line 958, the action bar outer div is:

```tsx
<div className="p-4">
```

Change it to:

```tsx
<div className="p-4" ref={actionBarRef}>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tasks/TaskFollowUpSection.tsx
git commit -m "feat(follow-up): add compact mode detection with ResizeObserver"
```

---

### Task 3: Implement Overflow Menu for Secondary Buttons

**Files:**
- Modify: `frontend/src/components/tasks/TaskFollowUpSection.tsx:988-1055`

- [ ] **Step 1: Replace the three secondary buttons with conditional rendering**

In `frontend/src/components/tasks/TaskFollowUpSection.tsx`, the secondary buttons block spans from the hidden file input (line 988) through the end of the Scripts dropdown (line 1055). Replace the entire block from line 988 to line 1055 (inclusive) with this:

```tsx
          {/* Hidden file input for attachment - always present */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          {isCompact ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleAttachClick}
                  disabled={!isEditable}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  {t('followUp.attachImage', 'Attach image')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handlePrCommentClick}
                  disabled={!isEditable}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('followUp.insertPrComment', 'Insert PR comment')}
                </DropdownMenuItem>
                {hasAnyScript && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleRunSetupScript}
                      disabled={isAttemptRunning}
                    >
                      {t('followUp.runSetupScript')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleRunCleanupScript}
                      disabled={isAttemptRunning}
                    >
                      {t('followUp.runCleanupScript')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              {/* Attach button */}
              <Button
                onClick={handleAttachClick}
                disabled={!isEditable}
                size="sm"
                variant="outline"
                title="Attach image"
                aria-label="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* PR Comments button */}
              <Button
                onClick={handlePrCommentClick}
                disabled={!isEditable}
                size="sm"
                variant="outline"
                title="Insert PR comment"
                aria-label="Insert PR comment"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>

              {/* Scripts dropdown - only show if project has any scripts */}
              {hasAnyScript && (
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isAttemptRunning}
                            aria-label="Run scripts"
                          >
                            <Terminal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      {isAttemptRunning && (
                        <TooltipContent side="bottom">
                          {t('followUp.scriptsDisabledWhileRunning')}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleRunSetupScript}>
                      {t('followUp.runSetupScript')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleRunCleanupScript}>
                      {t('followUp.runCleanupScript')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
```

**Key details:**
- The hidden `<input>` stays outside the conditional — it must always be present for `fileInputRef` to work.
- In compact mode: all three secondary actions are in a single `DropdownMenu` with a `MoreHorizontal` trigger.
- In normal mode: the original three buttons are rendered exactly as before.
- The `t()` calls for "Attach image" and "Insert PR comment" use fallback strings since these translation keys may not exist yet.

- [ ] **Step 2: Verify visually**

Run the dev server:
```bash
pnpm run dev
```

Test the following scenarios:

1. **Normal width (panel > 480px):** Three separate icon buttons (Attach, PR Comments, Scripts) visible. Click each — they work as before.
2. **Narrow width (panel < 480px):** Three buttons replaced by single `...` menu. Click the menu — shows "Attach image", "Insert PR comment", and script items (if project has scripts). Click each menu item — they trigger the correct action.
3. **Resize back and forth:** Buttons toggle between inline and menu smoothly, no flicker.
4. **While attempt is running:** AgentSelector/VariantSelector hidden, more space available — verify the compact menu still appears when panel is narrow enough.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tasks/TaskFollowUpSection.tsx
git commit -m "feat(follow-up): collapse secondary buttons into overflow menu at narrow widths"
```

---

### Task 4: Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run type checks**

```bash
pnpm run check
```

Expected: No errors. If there are errors related to `MoreHorizontal` or `DropdownMenuSeparator`, verify the imports from Steps 1-2 of Task 2 are correct.

- [ ] **Step 2: Run lint**

```bash
pnpm run lint
```

Expected: No new warnings or errors.
