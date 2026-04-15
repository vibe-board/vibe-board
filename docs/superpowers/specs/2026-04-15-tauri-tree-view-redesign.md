# Tauri Tree View Redesign

## Problem

The Tauri desktop app's HomeTab tree view has three issues:
1. Font sizes and UI elements are too small for a desktop application
2. Machine/project lists have no scroll constraints — long lists push everything off-screen
3. No project creation functionality from the tree view

## Design

### 1. UI Global Size Increase

Scale up all text, icons, and spacing in the Tauri tab shell and HomeTab to desktop-appropriate sizes.

| Element | Current | New |
|---------|---------|-----|
| Page title "Connections" | text-lg (18px) | text-xl (20px) |
| Connection header (name) | text-sm (14px) | text-base (16px) |
| Connection type label | text-xs (12px) | text-sm (14px) |
| Machine name | text-xs (12px) | text-sm (14px) |
| Project name | text-xs / text-sm | text-sm (14px) |
| Icons (chevron, status) | 12-14px | 16px uniform |
| Button text | text-xs (12px) | text-sm (14px) |
| Inner padding | px-2/px-3, py-1/py-2 | px-3/px-4, py-2/py-2.5 |

TabBar tab labels also scale up proportionally.

### 2. Home Tab Simplification

Home tab no longer expands project lists inline. Each connection/machine entry is a clickable row that opens a MachineProjectsTab.

**Simplified structure:**
```
[Connections]                         [+ Add]
├── ▸ My Local Server (Direct)        ← click opens ProjectsTab
├── ▾ Gateway (E2EE)
│   ├── 🟢 desktop-pc                 ← click opens ProjectsTab
│   ├── 🟢 laptop                     ← click opens ProjectsTab
│   └── ⚪ server-1 (Not paired)      ← click expands pairing UI
```

**Key decisions:**
- Unpaired machines still expand pairing UI inline (one-time operation, no dedicated tab needed)
- Gateway login/signup forms remain inline in HomeTab
- Clicking a paired machine or direct connection opens/focuses the corresponding MachineProjectsTab

### 3. Scroll Support

- The overall connections list in HomeTab: `overflow-y: auto` with the full available height
- Machine list within a gateway node: `max-h-[400px]` with `overflow-y-auto` to prevent a single gateway with many machines from dominating the view

### 4. New Tab Type: MachineProjectsTab

A new tab type that serves as the project browser for a specific connection/machine.

**Tab store change:**
```typescript
type TabEntry =
  | { type: 'project'; connectionId: string; machineId?: string; projectId: string; label: string }
  | { type: 'machine-projects'; connectionId: string; machineId?: string; label: string };
```

**Two internal views (navigated within the tab, no new tabs created):**

#### View A: Project List
- Reuses the existing `ProjectList` card grid layout
- Fetches projects via `UnifiedConnection.listProjects()`
- Each project card has a dropdown menu with **"Pin to tab bar"** option
- Clicking a project card navigates to View B within the same tab
- Includes **"Create Project"** button (reuses `ProjectFormDialog`)
- Top bar shows machine/connection name

#### View B: Project Detail (in-tab navigation)
- Renders the project workspace inside MachineProjectsTab
- Wraps the project with `ConnectionContext` (same as `ProjectTab` does) so all API calls route through the correct connection
- Uses the same `App` component that `ProjectTab` uses, with the selected `projectId`
- Top bar has breadcrumb/back button to return to project list (View A)
- Content is identical to a pinned ProjectTab, just hosted in a different container with navigation chrome

### 5. "Pin to Tab Bar" Behavior

- Available in project card dropdown menu (View A) and potentially in project detail view (View B)
- Creates an independent `type: 'project'` TabEntry (same as current `openProjectTab`)
- The new tab appears in TabBar, closable independently
- The MachineProjectsTab remains open and can be used to browse other projects

## Scope

**In scope:**
- UI size increase across HomeTab, TabBar, and new MachineProjectsTab
- HomeTab simplification (remove inline project expansion)
- Scroll constraints for connection and machine lists
- New MachineProjectsTab with project list + detail views
- "Pin to tab bar" feature
- "Create Project" in MachineProjectsTab

**Out of scope:**
- Web UI (non-Tauri) multi-tab support
- Changes to existing pinned ProjectTab behavior
- Gateway login/logout flow changes
- E2EE pairing flow changes (stays inline in HomeTab)

## Files Affected

- `frontend/src/components/tabs/HomeTab.tsx` — simplify, remove project expansion, increase sizes
- `frontend/src/components/tabs/TabBar.tsx` — increase sizes, handle new tab type
- `frontend/src/components/tabs/TabShell.tsx` — render new MachineProjectsTab type
- `frontend/src/components/tabs/MachineProjectsTab.tsx` — new file, project browser tab
- `frontend/src/stores/connection-store.ts` — add `machine-projects` tab type, add `openMachineProjectsTab` method
- `frontend/src/components/projects/ProjectList.tsx` — may need adaptation for connection-based data fetching (currently uses `useProjects` WebSocket hook)
- `frontend/src/components/projects/ProjectCard.tsx` — add "Pin to tab bar" dropdown option
