# Tab Notification Indicator

## Problem

When a notification fires in a project tab (task completes → `inreview`, or a new approval request arrives), the user gets a browser push and/or sound — but if they're looking at a different tab, there's no visual signal that something happened elsewhere. Users miss notifications because they don't notice the push or sound, especially when focused on another tab.

## Goal

Show a notification dot on tabs that have pending notifications, so users can see at a glance which tabs need attention — even when they're on a different tab.

## Design

### 1. State — `tabNotificationStore`

**New file**: `frontend/src/stores/tab-notification-store.ts`

A minimal Zustand store (~30 lines):

```typescript
import { create } from 'zustand';

interface TabNotificationState {
  notifications: Record<string, boolean>; // tabId → hasNotification
  markNotification(tabId: string): void;
  clearNotification(tabId: string): void;
  clearAll(): void;
}

export const useTabNotificationStore = create<TabNotificationState>((set) => ({
  notifications: {},
  markNotification(tabId) {
    set((s) => ({ notifications: { ...s.notifications, [tabId]: true } }));
  },
  clearNotification(tabId) {
    set((s) => {
      const { [tabId]: _, ...rest } = s.notifications;
      return { notifications: rest };
    });
  },
  clearAll() {
    set({ notifications: {} });
  },
}));
```

- No persistence — notifications are session-scoped (clear on page reload).
- `clearAll()` available for logout/connection removal cleanup.

### 2. Hook integration — `useTaskNotifications`

**Modify**: `frontend/src/hooks/useTaskNotifications.ts`

Add an optional `tabId` parameter:

```typescript
export function useTaskNotifications(
  tasksById: Record<string, Task>,
  pendingApprovals: ApprovalInfo[],
  config: Config | null,
  tabId?: string  // NEW
)
```

When a notification fires (task → `inreview` or new approval), also call:

```typescript
if (tabId) {
  useTabNotificationStore.getState().markNotification(tabId);
}
```

Using `getState()` avoids re-render coupling — the hook doesn't need to subscribe to the notification store.

### 3. Tab ID propagation — `TabIdContext`

**New file**: `frontend/src/contexts/TabIdContext.tsx`

A minimal context to pass the tab ID from `ProjectTab` down to `ProjectTasks` (which is inside `<App>`):

```typescript
import { createContext, useContext } from 'react';

const TabIdContext = createContext<string | undefined>(undefined);

export const TabIdProvider = TabIdContext.Provider;
export function useTabId(): string | undefined {
  return useContext(TabIdContext);
}
```

### 4. Component integration — `ProjectTab`

**Modify**: `frontend/src/components/tabs/ProjectTab.tsx`

Wrap the `<App>` in `<TabIdProvider value={tab.id}>`:

```tsx
<TabIdProvider value={tab.id}>
  <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
</TabIdProvider>
```

### 5. Component integration — `ProjectTasks`

**Modify**: `frontend/src/pages/ProjectTasks.tsx`

Read the tab ID and pass it to the hook:

```typescript
const tabId = useTabId();
useTaskNotifications(tasksById, pendingApprovals, config, tabId);
```

### 6. Store integration — `setActiveTab` auto-clear

**Modify**: `frontend/src/stores/connection-store.ts`

In the `setActiveTab` action, also clear the notification:

```typescript
setActiveTab(tabId) {
  saveActiveTab(tabId);
  set({ activeTabId: tabId });
  useTabNotificationStore.getState().clearNotification(tabId);
},
```

### 7. Visual — `TabBar` dot indicator

**Modify**: `frontend/src/components/tabs/TabBar.tsx`

Subscribe to the notification store:

```typescript
const notifications = useTabNotificationStore((s) => s.notifications);
```

For each tab, if `notifications[tab.id]` is true and the tab is NOT active, render a dot:

```tsx
<div className="relative ...">
  {/* existing tab content */}
  {notifications[tab.id] && activeTabId !== tab.id && (
    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand" />
  )}
</div>
```

The dot uses `bg-brand` (the orange accent color from the design system). It's 8px (w-2 h-2), positioned at the top-right of the tab. Hidden on the active tab since the indicator auto-clears.

## Files changed

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/stores/tab-notification-store.ts` | **New** | Zustand store for tab notification state |
| `frontend/src/contexts/TabIdContext.tsx` | **New** | Context to pass tab ID down the tree |
| `frontend/src/hooks/useTaskNotifications.ts` | Modify | Accept `tabId`, call `markNotification` on notify |
| `frontend/src/components/tabs/ProjectTab.tsx` | Modify | Wrap `<App>` in `<TabIdProvider>` |
| `frontend/src/pages/ProjectTasks.tsx` | Modify | Read `useTabId()`, pass to `useTaskNotifications` |
| `frontend/src/stores/connection-store.ts` | Modify | `setActiveTab` clears notification; `removeConnection`/`logoutConnection` clear all |
| `frontend/src/components/tabs/TabBar.tsx` | Modify | Subscribe to store, render dot indicator |

### 8. Cleanup — connection removal / logout

**Modify**: `frontend/src/stores/connection-store.ts`

In `removeConnection` and `logoutConnection`, also clear all tab notifications since the associated tabs are being closed:

```typescript
useTabNotificationStore.getState().clearAll();
```

This is safe because `removeConnection` already closes all tabs for that connection, and `logoutConnection` does the same.

## What this does NOT cover

- **Notification count** — just a dot (boolean), not a count badge. Can be added later if needed.
- **Persistence** — notifications clear on page reload. This is intentional; a stale indicator after reload would be confusing.
- **Machine-projects tabs** — only `project` tabs get indicators (they have tasks). `machine-projects` and `home` tabs are unaffected.
