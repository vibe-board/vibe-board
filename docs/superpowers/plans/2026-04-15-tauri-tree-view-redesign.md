# Tauri Tree View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Tauri desktop tree view with larger UI, simplified Home tab, scroll support, and a new MachineProjectsTab for browsing/pinning projects.

**Architecture:** Add a `machine-projects` tab type to the connection store. Home tab becomes a clickable entry list (no inline project expansion). Clicking a connection/machine opens a MachineProjectsTab that reuses existing `App` component via `ConnectionProvider` for project detail, and `UnifiedConnection.listProjects()` for the project list view.

**Tech Stack:** React, TypeScript, Zustand, Tailwind CSS, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-15-tauri-tree-view-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/connections/types.ts` | Modify | Add `machine-projects` to `TabPersisted` type union |
| `frontend/src/stores/connection-store.ts` | Modify | Add `openMachineProjectsTab` action, update `closeTab` for new type |
| `frontend/src/components/tabs/TabBar.tsx` | Modify | Scale up sizes, render `machine-projects` tabs with distinct icon |
| `frontend/src/components/tabs/TabShell.tsx` | Modify | Render `MachineProjectsTab` for `machine-projects` type |
| `frontend/src/components/tabs/MachineProjectsTab.tsx` | Create | New tab component with project list + project detail views |
| `frontend/src/components/tabs/HomeTab.tsx` | Modify | Remove inline project expansion, simplify to clickable entries, scale up sizes |
| `frontend/src/components/tabs/AddConnectionForm.tsx` | Modify | Scale up sizes |

---

## Task 1: Add `machine-projects` tab type to store

**Files:**
- Modify: `frontend/src/lib/connections/types.ts:67-74`
- Modify: `frontend/src/stores/connection-store.ts:58-105`

- [ ] **Step 1: Update `TabPersisted` type**

In `frontend/src/lib/connections/types.ts`, change the `type` field to include `'machine-projects'`:

```typescript
export interface TabPersisted {
  id: string;
  type: 'home' | 'project' | 'machine-projects';
  connectionId?: string;
  machineId?: string;
  projectId?: string;
  label: string;
}
```

- [ ] **Step 2: Add `openMachineProjectsTab` to store interface**

In `frontend/src/stores/connection-store.ts`, add to `ConnectionStoreActions`:

```typescript
openMachineProjectsTab(
  connectionId: string,
  machineId: string | undefined,
  label: string
): void;
```

- [ ] **Step 3: Implement `openMachineProjectsTab` in the store**

Add the implementation after `openProjectTab` in the store creator:

```typescript
openMachineProjectsTab(connectionId, machineId, label) {
  set((s) => {
    // Reuse existing tab if one matches
    const existing = s.tabs.find(
      (t) =>
        t.type === 'machine-projects' &&
        t.connectionId === connectionId &&
        t.machineId === machineId
    );
    if (existing) {
      saveActiveTab(existing.id);
      return { activeTabId: existing.id };
    }

    const tab: TabPersisted = {
      id: crypto.randomUUID(),
      type: 'machine-projects',
      connectionId,
      machineId,
      label,
    };
    const tabs = [...s.tabs, tab];
    saveTabs(tabs);
    saveActiveTab(tab.id);

    // For gateway machines, add ref to keep connection alive
    const node = s.nodes.find((n) => n.entry.id === connectionId);
    if (node?.gatewayNode && machineId) {
      const conn = node.gatewayNode.getMachineConnection(machineId);
      if (conn) {
        conn.addRef();
        if (conn.status === 'disconnected') {
          conn.connect().catch(() => {});
        }
      }
    }

    return { tabs, activeTabId: tab.id };
  });
},
```

- [ ] **Step 4: Update `closeTab` to handle `machine-projects` ref counting**

In `closeTab`, the existing code checks `tab.connectionId && tab.machineId` for ref counting — this already works for `machine-projects` tabs since they also have those fields. No change needed here.

- [ ] **Step 5: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/connections/types.ts frontend/src/stores/connection-store.ts
git commit -m "feat(tabs): add machine-projects tab type to connection store"
```

---

## Task 2: Scale up TabBar sizes

**Files:**
- Modify: `frontend/src/components/tabs/TabBar.tsx`

- [ ] **Step 1: Update TabBar component**

Replace the full content of `frontend/src/components/tabs/TabBar.tsx`:

```typescript
// frontend/src/components/tabs/TabBar.tsx
import { useCallback } from 'react';
import { X, Home, Plus, Monitor } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection-store';

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useConnectionStore();

  const handleAddClick = useCallback(() => {
    setActiveTab('home');
  }, [setActiveTab]);

  return (
    <div
      className="flex items-center border-b border-border bg-muted/50 overflow-x-auto"
      style={{ minHeight: '42px' }}
    >
      {/* Home tab — always first, not closable */}
      <button
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-r border-border whitespace-nowrap shrink-0 transition-colors ${
          activeTabId === 'home'
            ? 'bg-background text-foreground'
            : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
        }`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={16} />
        Home
      </button>

      {/* Tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex items-center gap-1.5 px-4 py-2 text-sm border-r border-border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            activeTabId === tab.id
              ? 'bg-background text-foreground font-medium'
              : 'text-foreground/60 hover:text-foreground hover:bg-background/50'
          }`}
          onClick={() => setActiveTab(tab.id)}
          title={tab.label}
        >
          {tab.type === 'machine-projects' && (
            <Monitor size={14} className="shrink-0 text-foreground/50" />
          )}
          <span className="max-w-[180px] truncate">{tab.label}</span>
          <button
            className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-foreground/10 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {/* Add button — switches to Home tab */}
      <button
        className="flex items-center justify-center px-3 py-2 text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
        onClick={handleAddClick}
        title="New tab (go to Home)"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
```

Key changes from original:
- `minHeight`: `36px` → `42px`
- Home button: `gap-1.5 px-3 py-1.5 text-xs` → `gap-2 px-4 py-2 text-sm`
- Home icon: `size={13}` → `size={16}`
- Tab items: `gap-1 px-3 py-1.5 text-xs` → `gap-1.5 px-4 py-2 text-sm`
- Close icon: `size={12}` → `size={14}`
- Plus icon: `size={14}` → `size={16}`
- Added `Monitor` icon for `machine-projects` tabs
- Truncate width: `160px` → `180px`

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/tabs/TabBar.tsx
git commit -m "feat(tabs): scale up TabBar sizes for desktop"
```

---

Continued in `2026-04-15-tauri-tree-view-redesign-part2.md`.
