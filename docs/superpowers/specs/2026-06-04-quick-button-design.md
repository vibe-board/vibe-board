# Quick Button Design

## Problem

Users frequently type high-frequency words like "OK" and "Continue" when interacting with the agent. The current "Continue" button in `NextActionCard` only appears when a task fails, but users want a faster way to send common responses without typing.

## Solution

Add a row of small quick-send buttons ("OK", "Continue") always visible above the WYSIWYG editor in `TaskFollowUpSection`. Clicking one sends that text as a follow-up message immediately.

## Layout

```
┌─────────────────────────────────────────────┐
│ [OK] [Continue]          ← quick buttons    │
│ ┌─────────────────────────────────────────┐ │
│ │ WYSIWYG Editor                          │ │
│ └─────────────────────────────────────────┘ │
│ [Attach] [PR] [Scripts] ... [Agent] [Send]  │
└─────────────────────────────────────────────┘
```

## Behavior

- **Click action**: Calls `sessionsApi.followUp()` with the button text as `prompt`, using the current executor profile.
- **Agent idle**: Starts new execution immediately.
- **Agent running**: Queues the message (same as Queue button).
- **Disabled state**: When `!isEditable` (no session, executor not selected, etc.).
- **Editor preserved**: Does NOT clear the editor — user may have typed something they want to keep.

## Implementation

### File changes

1. **`frontend/src/components/tasks/TaskFollowUpSection.tsx`**
   - Add a `flex gap-2` row above the `WYSIWYGEditor` (between banners and editor)
   - Render two `Button` components: "OK" and "Continue"
   - `variant="outline"`, `size="sm"`
   - `onClick` handler calls `sessionsApi.followUp()` with the button text
   - Uses same executor profile as the Send button
   - Disabled when `!isEditable`

2. **i18n**: Hardcoded English strings (consistent with `components/tabs/` pattern per project memory)

### What this replaces

The "Continue" button in `NextActionCard.tsx` becomes redundant since users can use the quick button. However, removing it is a separate change — not coupled to this feature.

## Files to modify

- `frontend/src/components/tasks/TaskFollowUpSection.tsx` — add quick button row
