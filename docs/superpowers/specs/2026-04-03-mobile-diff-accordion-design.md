# Mobile Diff Accordion — Design Spec

## Problem

When a Git diff contains thousands of changed lines across many files, rendering all `DiffView` components simultaneously on mobile causes the page to freeze due to memory and DOM overload. Mobile screens cannot display multiple file diffs at once anyway.

## Solution

Mobile-only accordion behavior: when a user expands one file's diff, all other expanded diffs automatically collapse and release memory. Desktop behavior remains unchanged.

## Scope

- **Mobile only** (`max-width: 768px`)
- **Single file change**: `frontend/src/components/panels/DiffsPanel.tsx`

## Changes

### 1. DiffsPanel — Accordion toggle on mobile

Add `useMediaQuery('(max-width: 768px)')` to detect mobile. Modify the `toggle()` callback so that on mobile, expanding a file collapses all others:

```tsx
const isMobile = useMediaQuery('(max-width: 768px)');

const toggle = useCallback((id: string) => {
  setCollapsedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id); // collapse current
    } else {
      if (isMobile) {
        next.clear(); // accordion: collapse all others
      }
      next.delete(id); // expand current
    }
    return next;
  });
}, [isMobile]);
```

### 2. DiffsPanelContent — Hide collapse-all/expand-all on mobile

On mobile with accordion behavior, the collapse-all/expand-all buttons are unnecessary and misleading ("expand all" contradicts accordion). Hide them when `isMobile` is true.

### 3. DiffCard — No changes needed

`DiffCard` already conditionally renders `<DiffView>` only when `expanded === true` (line 305). When collapsed, React unmounts the `DiffView` component, which releases the `generateDiffFile` data + DOM from memory. The `useMemo` for `diffFile` returns `null` when collapsed, further aiding garbage collection.

## Behavior Matrix

| Scenario | Desktop (unchanged) | Mobile (new) |
|----------|---------------------|--------------|
| Multiple files expanded | All DiffViews rendered | Only 1 DiffView rendered |
| User taps collapsed file | File expands (others stay) | File expands, others collapse |
| Collapse-all/expand-all | Visible | Hidden |
| Memory on large diff | All files in memory | Only active file in memory |

## Verification

1. Open DiffsPanel on a mobile viewport (or Chrome DevTools mobile emulation)
2. Expand a file — verify it opens and others stay collapsed
3. Expand a different file — verify the previous one collapses automatically
4. Verify collapse-all/expand-all buttons are hidden on mobile
5. Switch to desktop viewport — verify all files can expand simultaneously as before
6. On mobile with a large diff (50+ files, thousands of lines) — verify the page remains responsive
