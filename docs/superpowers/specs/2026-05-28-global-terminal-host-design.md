# Global Terminal Host

## Goal

Direct connections should have the same terminal experience as project and task
pages. The app should use one unified terminal panel across connection home,
machine/project lists, project pages, and task pages.

This replaces the current layout-scoped terminal drawer with a shell-level
terminal host while keeping the existing terminal implementation:
`TerminalContext`, `TerminalPanel`, `TerminalTabBar`, and `XTermInstance`.

## Current State

The current terminal drawer is rendered by `NormalLayout`. This works for pages
inside `App`, such as local project and task pages. It does not cover the
multi-connection shell home page or direct connection project-list tabs because
those live above or beside `NormalLayout`.

The backend terminal support already works for direct terminal sessions through
`/api/terminal/direct-ws?cwd=...`. The gap is frontend composition and target
selection, not backend capability.

## Architecture

Add a single `TerminalHost` at the shell level. It owns the bottom resizable
drawer and renders the existing terminal panel.

High-level tree:

```text
TabShell
  TerminalProvider
    TerminalTargetProvider
      Shell content
      TerminalHost
        TerminalPanel
          XTermInstance
```

`TerminalProvider` moves out of `App` so terminal state is shared across all
shell modes:

- `LocalDirectShell`
- `MultiConnectionShell`
- `GatewayShell`

`NormalLayout` no longer renders `TerminalBottomDrawer` directly. It registers
page-specific terminal targets and leaves rendering to `TerminalHost`.

## Terminal Targets

Introduce a terminal target model that describes what can be opened from the
current UI context.

Target types:

- `home`: a shell in the active connection home directory.
- `project`: a shell in the current project repository.
- `task`: a shell attached to a task attempt workspace.

Each target includes:

- `label`
- `type`
- `connectionId`
- `machineId`
- `cwd`
- `workspaceId` for task terminals
- `disabled` with an optional reason

The app should use a lightweight `TerminalTargetProvider` or registry so pages
can publish currently available targets:

- `HomeTab` direct connection cards: connection home target.
- `MachineProjectsTab`: machine home target.
- `ProjectTab` / project pages: project repo target.
- Task attempt pages: task workspace target plus project target.

The best default target when opening the drawer is:

1. task
2. project
3. connection or home

## Terminal Tabs

Extend persisted terminal tabs so an open terminal has enough information to
reconnect independently of the current React subtree.

`TerminalTabContext` should include connection identity:

```ts
type TerminalTabContext =
  | {
      type: 'task';
      connectionId?: string;
      machineId?: string;
      workspaceId: string;
      attemptId: string;
      taskId: string;
    }
  | {
      type: 'project';
      connectionId?: string;
      machineId?: string;
      projectId: string;
    }
  | {
      type: 'home';
      connectionId?: string;
      machineId?: string;
    };
```

The tab also stores `cwd`, as it does today. Task tabs use
`/api/terminal/ws?workspace_id=...`; project and home tabs use
`/api/terminal/direct-ws?cwd=...`.

Existing localStorage tabs without connection identity should be treated as
local-direct/current-origin tabs when possible. Tabs missing a valid `context`
continue to be sanitized out, matching the current behavior.

## Connection Binding

`XTermInstance` currently calls `useConnection()`. A shell-level drawer cannot
rely on the currently rendered page connection because the active terminal tab
may belong to another direct or gateway machine connection.

`TerminalHost` resolves each terminal tab's `connectionId` and `machineId` into
a `UnifiedConnection`. Each `XTermInstance` is wrapped in:

```text
ConnectionProvider
  QueryClientProvider
    XTermInstance
```

If the tab has no stored connection identity, use the local direct connection in
local-direct mode or the currently active connection as a compatibility
fallback.

## Entry Points

Keep the existing `Navbar` terminal button, but make it call the shell-level
terminal actions.

Add a terminal icon to the multi-connection top `TabBar` so the connection home
and project-list tabs can open the global terminal drawer.

The terminal panel `+` dropdown uses current registered targets:

- `Task Terminal`
- `Project Terminal`
- `Connection Terminal` or `Home Directory`

Disabled targets remain visible with disabled state where useful, especially
when project repos or home directory are still loading.

## Drawer Behavior

When the terminal button is clicked:

- If the drawer is open, collapse it.
- If closed and tabs exist, expand it and focus the active terminal tab.
- If closed and no tabs exist, create a tab from the best available target and
  expand the drawer.

Closing the drawer does not kill terminal sessions. Closing a terminal tab keeps
the existing intentional-close behavior and sends the close command before
removing the tab.

## Error Handling

If a terminal tab's connection is missing:

- Keep the terminal tab.
- Render a clear "Connection removed" state in the terminal content.
- Let the user close the tab.

If a connection is disconnected:

- Keep the tab.
- Render connection status and a reconnect action when available.

If `cwd` is unavailable:

- Disable that target in the dropdown.
- Do not create a terminal tab until the target has a valid cwd.

If a task workspace has been cleaned up:

- Disable the task target.
- Existing task tabs may show the backend error if reconnect is attempted.

## UI Constraints

Use the legacy design system only. Do not introduce `.new-design` styles.

The "new terminal panel" means the unified `TerminalPanel`/`XTermInstance`
experience, not the Workspaces visual design. The drawer remains a bottom,
resizable panel using `react-resizable-panels`.

## Testing

Add focused frontend tests for:

- Shell-level `TerminalHost` expands and collapses the drawer.
- Direct connection home/project-list context can create a home terminal target.
- Project pages prefer project terminal targets.
- Removed or missing connections render a recoverable terminal-tab error state.
- Existing `NormalLayout` no longer owns the terminal drawer.

Run:

```bash
pnpm run frontend:check
cd frontend && pnpm exec vitest run <focused terminal tests>
```

## Out Of Scope

- Backend terminal protocol changes.
- Replacing xterm.js.
- Redesigning the terminal using `.new-design`.
- Changing PTY session lifetime semantics beyond the existing tab close
  behavior.
