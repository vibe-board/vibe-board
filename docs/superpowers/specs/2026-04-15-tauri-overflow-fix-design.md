# Tauri Overflow Fix: Height + Responsive Action Bar

## Problem

After the multi-tab feature introduced `TabShell` with a 42px `TabBar`, the `NormalLayout` component still uses `h-screen` (100vh). Since NormalLayout is now nested inside TabShell's content area (which is `100vh - 42px`), it overflows its container by 42px. This causes all right-side panels (terminal, follow-up input, diff viewer, etc.) to be clipped at the bottom.

Additionally, the follow-up action bar has no responsive behavior. At narrow widths (e.g., Tauri minimum window 800px with kanban sidebar open), the action bar buttons overflow horizontally and get clipped by `overflow-hidden` on the parent container.

## Scope

1. Fix the height overflow caused by TabBar
2. Make the follow-up action bar responsive with an overflow menu for secondary buttons

Out of scope: responsive fixes for other right-side panels (terminal, diff, etc.) — the height fix alone should resolve their clipping.

## Design

### Part 1: Height Overflow Fix

**File:** `frontend/src/components/layout/NormalLayout.tsx` line 40

**Change:** `h-screen` to `h-full`

```diff
- <div className="flex flex-col h-screen">
+ <div className="flex flex-col h-full">
```

NormalLayout is rendered inside TabShell's flex-1 content area, which already has a well-defined height. Changing to `h-full` makes it inherit the actual available height instead of claiming the full viewport.

**Verification needed:** Confirm that NormalLayout's parent containers provide explicit height in both:
- TabShell context (Tauri desktop / multi-tab) — TabShell uses `h-screen` at root, content area is `flex-1`
- Direct browser context (single-tab) — check that the parent chain has height defined

### Part 2: Follow-up Action Bar Responsive Overflow Menu

**File:** `frontend/src/components/tasks/TaskFollowUpSection.tsx`

**Strategy:** Use `ResizeObserver` to detect action bar container width. When below threshold, collapse secondary buttons into a dropdown menu.

#### Button Priority

Always visible (core):
- `AgentSelector` (w-32 = 128px) — only shown when not running
- `VariantSelector` (~150px) — only shown when not running
- Send / Stop / Queue button group — right side

Collapsible (secondary):
- Attach image button (Paperclip icon)
- PR Comments button (MessageSquare icon)
- Scripts dropdown (Terminal icon) — when available

#### Compact Mode Detection

```typescript
const actionBarRef = useRef<HTMLDivElement>(null);
const [isCompact, setIsCompact] = useState(false);

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

Attach the ref to the action bar's outer `div`.

#### Threshold: 480px

Rationale:
- AgentSelector (128px) + VariantSelector (~150px) + Send button (~100px) + gaps = ~410px minimum for core buttons
- 70px margin for padding and the overflow menu trigger button itself

#### Overflow Menu

When `isCompact` is true, replace the three secondary buttons with a single `DropdownMenu`:

```tsx
{isCompact ? (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="outline" aria-label="More actions">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={handleAttachClick} disabled={!isEditable}>
        <Paperclip className="h-4 w-4 mr-2" />
        Attach image
      </DropdownMenuItem>
      <DropdownMenuItem onClick={handlePrCommentClick} disabled={!isEditable}>
        <MessageSquare className="h-4 w-4 mr-2" />
        Insert PR comment
      </DropdownMenuItem>
      {hasAnyScript && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleRunSetupScript} disabled={isAttemptRunning}>
            Run setup script
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRunCleanupScript} disabled={isAttemptRunning}>
            Run cleanup script
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
) : (
  // existing Attach, PR Comments, Scripts buttons unchanged
)}
```

#### Dependencies

All components already exist in the project:
- `DropdownMenu` family from `@/components/ui/dropdown-menu`
- `MoreHorizontal` from `lucide-react` (already used in `actions-dropdown.tsx`)
- `ResizeObserver` — native browser API, supported in all Tauri WebView targets

No new dependencies needed.

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/layout/NormalLayout.tsx` | `h-screen` to `h-full` |
| `frontend/src/components/tasks/TaskFollowUpSection.tsx` | Add `ResizeObserver` hook, conditional compact mode rendering with overflow `DropdownMenu` |

## Testing

- Resize Tauri window to minimum (800x600): action bar buttons should not be clipped; secondary actions available in overflow menu
- Resize to normal width (1280x800+): all buttons visible inline as before
- Verify terminal, follow-up, and other right panels are not clipped vertically after the height fix
- Verify direct browser access (non-TabShell) still works correctly with `h-full`
