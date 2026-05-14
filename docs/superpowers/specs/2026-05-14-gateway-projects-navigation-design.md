# Gateway Projects Navigation Design

## Problem

Gateway web currently exposes two Projects pages for the same machine:

1. Clicking a machine opens a lightweight gateway Projects page.
2. Opening a project, then clicking the Vibe Kanban logo inside the project
   app, opens the full `/local-projects` Projects page.

The lightweight page is less capable, while the full page supports ordering,
deletion, creation, editing, and the established project management workflow.
This creates duplicated navigation and an unclear source of truth.

## Goal

Use one authoritative Projects management page per machine while preserving the
gateway workflow where a single machine can have multiple project tabs open at
the same time.

## Navigation Model

- Clicking a machine in gateway home opens or focuses that machine's single
  Projects home tab.
- The machine Projects home tab renders the full Projects experience.
- Clicking a project from that Projects home tab opens or focuses a dedicated
  project tab for that project.
- Multiple project tabs can be open for the same machine.
- Clicking the Vibe Kanban logo inside a project tab returns to the machine's
  Projects home tab instead of showing a second Projects page inside the
  project tab.

## Component Responsibilities

### Gateway Shell

`GatewayShell` remains responsible for rendering the gateway tab bar and
choosing between home, machine Projects tabs, and project tabs.

### MachineProjectsTab

`MachineProjectsTab` remains responsible for the machine connection lifecycle:

- Looking up the `UnifiedConnection`.
- Auto-connecting when needed.
- Managing gateway machine connection references.
- Providing `ConnectionProvider`.
- Providing the machine connection's `QueryClientProvider`.

Its content should use the full Projects page behavior rather than the current
lightweight `ProjectListView`.

### Projects List

`components/projects/ProjectList` is the authoritative Projects list UI. It
should support an optional project-open override:

- Default behavior: navigate to `/local-projects/:projectId/tasks`.
- Gateway machine Projects behavior: call
  `openProjectTab(connectionId, machineId, project.id, project.name)`.

The card component should stay presentation-focused. It should receive an
`onOpen` callback or equivalent prop instead of importing gateway tab store
logic.

### Navbar Logo

The Navbar logo currently links to `/local-projects`. That remains correct for
local/direct app usage.

When rendered inside a gateway project tab, the logo should instead focus or
open the parent machine's Projects home tab by calling
`openMachineProjectsTab(connectionId, machineId, machineLabel)`.

This override should be supplied through a narrow context or prop so `Navbar`
does not need to know detailed gateway tab-store behavior.

## Data Flow

1. Gateway home calls `openMachineProjectsTab(connectionId, machineId, label)`.
2. `MachineProjectsTab` resolves the machine connection and renders the full
   Projects list in that connection context.
3. The Projects list fetches projects through the active `UnifiedConnection`.
4. Selecting a project in `MachineProjectsTab` calls `openProjectTab`.
5. The project tab renders `<App initialPath="/local-projects/:projectId/tasks" />`
   inside the same machine connection context.
6. The project tab provides a Projects navigation override so the Navbar logo
   returns to the machine Projects home tab.

## Error Handling

Existing machine connection states should be preserved:

- Missing connection: show the existing "Connection not found" message.
- Connecting or reconnecting: show the existing loading state.
- Error: show the existing retry state.
- Not connected: show the existing "Not connected" message.

Project list loading and API errors should use the existing full Projects page
behavior.

## Non-Goals

- Do not remove support for multiple project tabs per machine.
- Do not duplicate sorting, deletion, creation, or editing behavior in
  `ProjectListView`.
- Do not change local/direct mode navigation semantics.
- Do not replace the gateway tab bar with React Router routes.

## Testing

Manual and automated checks should cover:

- Gateway web: clicking a machine opens the full Projects page.
- Gateway web: clicking two different projects opens two project tabs.
- Gateway web: clicking the same project again focuses the existing tab.
- Gateway web: clicking the logo from a project tab focuses the machine
  Projects home tab.
- Local/direct mode: project cards still navigate to project tasks.
- Local/direct mode: the logo still navigates to `/local-projects`.
