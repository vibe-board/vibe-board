# Gateway Projects Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate gateway Projects page with the full Projects experience while preserving multiple project tabs per machine.

**Architecture:** Add a narrow Projects navigation override context used by `ProjectList` and `Navbar`. `MachineProjectsTab` renders the full app at `/local-projects` with a project-open override that opens project tabs, while `ProjectTab` renders the task app with a logo override that returns to the machine Projects tab.

**Tech Stack:** React 18, TypeScript, React Router v6, Zustand, TanStack Query, Vitest, Testing Library.

---

## File Structure

- Create `frontend/src/contexts/ProjectsNavigationContext.tsx`
  - Provides optional overrides for opening a project and navigating back to Projects.
  - Keeps gateway tab-store logic out of `Navbar`, `ProjectList`, and `ProjectCard`.
- Modify `frontend/src/components/projects/ProjectCard.tsx`
  - Accepts `onOpen?: (project: Project) => void`.
  - Uses that callback for primary card click and "View Project".
- Modify `frontend/src/components/projects/ProjectList.tsx`
  - Reads the optional open-project override from context.
  - Defaults to existing `/local-projects/:projectId/tasks` navigation.
- Modify `frontend/src/components/layout/Navbar.tsx`
  - Reads the optional navigate-to-projects override from context.
  - Defaults to existing `<Link to="/local-projects">`.
- Modify `frontend/src/components/tabs/MachineProjectsTab.tsx`
  - Replaces `ProjectListView` with `<App initialPath="/local-projects" />`.
  - Provides an open-project override that calls `openProjectTab`.
- Modify `frontend/src/components/tabs/ProjectTab.tsx`
  - Provides a navigate-to-projects override that calls `openMachineProjectsTab`.
- Test `frontend/src/contexts/__tests__/ProjectsNavigationContext.test.tsx`
  - Verifies default context values are absent and provider values are exposed.
- Test `frontend/src/stores/__tests__/connection-store-gateway.test.ts`
  - Add coverage for `openProjectTab` reusing an existing tab.

## Task 1: Add Projects Navigation Context

**Files:**
- Create: `frontend/src/contexts/ProjectsNavigationContext.tsx`
- Create: `frontend/src/contexts/__tests__/ProjectsNavigationContext.test.tsx`

- [ ] **Step 1: Write the context test**

Create `frontend/src/contexts/__tests__/ProjectsNavigationContext.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project } from 'shared/types';
import {
  ProjectsNavigationProvider,
  useProjectsNavigation,
} from '../ProjectsNavigationContext';

const project = {
  id: 'project-1',
  name: 'Project One',
} as Project;

function Probe({
  onValue,
}: {
  onValue: (value: ReturnType<typeof useProjectsNavigation>) => void;
}) {
  const value = useProjectsNavigation();
  onValue(value);
  return null;
}

describe('ProjectsNavigationContext', () => {
  it('returns no overrides by default', () => {
    const onValue = vi.fn();

    render(<Probe onValue={onValue} />);

    expect(onValue).toHaveBeenCalledWith({});
  });

  it('exposes provider overrides', () => {
    const openProject = vi.fn();
    const navigateToProjects = vi.fn();
    const onValue = vi.fn();

    render(
      <ProjectsNavigationProvider
        value={{ openProject, navigateToProjects }}
      >
        <Probe onValue={onValue} />
      </ProjectsNavigationProvider>
    );

    const value = onValue.mock.calls[0][0];
    value.openProject(project);
    value.navigateToProjects();

    expect(openProject).toHaveBeenCalledWith(project);
    expect(navigateToProjects).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir frontend test -- src/contexts/__tests__/ProjectsNavigationContext.test.tsx`

Expected: FAIL because `../ProjectsNavigationContext` does not exist.

- [ ] **Step 3: Implement the context**

Create `frontend/src/contexts/ProjectsNavigationContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { Project } from 'shared/types';

export interface ProjectsNavigationOverrides {
  openProject?: (project: Project) => void;
  navigateToProjects?: () => void;
}

const ProjectsNavigationContext = createContext<ProjectsNavigationOverrides>(
  {}
);

export function ProjectsNavigationProvider({
  value,
  children,
}: {
  value: ProjectsNavigationOverrides;
  children: ReactNode;
}) {
  return (
    <ProjectsNavigationContext.Provider value={value}>
      {children}
    </ProjectsNavigationContext.Provider>
  );
}

export function useProjectsNavigation(): ProjectsNavigationOverrides {
  return useContext(ProjectsNavigationContext);
}
```

- [ ] **Step 4: Run the context test**

Run: `pnpm --dir frontend test -- src/contexts/__tests__/ProjectsNavigationContext.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/ProjectsNavigationContext.tsx frontend/src/contexts/__tests__/ProjectsNavigationContext.test.tsx
git commit -m "feat: add projects navigation context"
```

## Task 2: Make Project Cards Use an Open Callback

**Files:**
- Modify: `frontend/src/components/projects/ProjectCard.tsx`
- Modify: `frontend/src/components/projects/ProjectList.tsx`

- [ ] **Step 1: Update `ProjectCard` props and open behavior**

In `frontend/src/components/projects/ProjectCard.tsx`, change the `Props` type and component signature:

```tsx
interface Props {
  project: Project;
  isFocused?: boolean;
  setError: (error: string) => void;
  onEdit: (project: Project) => void;
  onOpen?: (project: Project) => void;
}

function ProjectCard({ project, isFocused, setError, onEdit, onOpen }: Props) {
```

Add a helper near the other handlers:

```tsx
  const handleOpen = () => {
    if (onOpen) {
      onOpen(project);
      return;
    }
    navigate(`/local-projects/${project.id}/tasks`);
  };
```

Replace the card root click:

```tsx
      onClick={handleOpen}
```

Replace the "View Project" click handler:

```tsx
                  handleOpen();
```

- [ ] **Step 2: Wire `ProjectList` to the context**

In `frontend/src/components/projects/ProjectList.tsx`, add:

```tsx
import { useProjectsNavigation } from '@/contexts/ProjectsNavigationContext';
```

Inside `ProjectList`, after `useNavigate()`:

```tsx
  const { openProject } = useProjectsNavigation();
```

Add a default open handler near the other handlers:

```tsx
  const handleOpenProject = (project: Project) => {
    if (openProject) {
      openProject(project);
      return;
    }
    navigate(`/local-projects/${project.id}/tasks`);
  };
```

Pass it to `ProjectCard`:

```tsx
              onOpen={handleOpenProject}
```

- [ ] **Step 3: Run type check**

Run: `pnpm --dir frontend check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/projects/ProjectCard.tsx frontend/src/components/projects/ProjectList.tsx
git commit -m "feat: allow projects list open override"
```

## Task 3: Let Navbar Logo Use the Projects Navigation Override

**Files:**
- Modify: `frontend/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Import the context hook**

In `frontend/src/components/layout/Navbar.tsx`, add:

```tsx
import { useProjectsNavigation } from '@/contexts/ProjectsNavigationContext';
```

- [ ] **Step 2: Read the override**

Inside `Navbar`, after existing hooks:

```tsx
  const { navigateToProjects } = useProjectsNavigation();
```

- [ ] **Step 3: Replace the logo link with conditional behavior**

Replace:

```tsx
            <Link to="/local-projects">
              <Logo />
            </Link>
```

with:

```tsx
            {navigateToProjects ? (
              <button
                type="button"
                onClick={navigateToProjects}
                className="inline-flex"
                aria-label="Projects"
              >
                <Logo />
              </button>
            ) : (
              <Link to="/local-projects" aria-label="Projects">
                <Logo />
              </Link>
            )}
```

- [ ] **Step 4: Run type check**

Run: `pnpm --dir frontend check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Navbar.tsx
git commit -m "feat: allow navbar projects navigation override"
```

## Task 4: Render Full Projects Page in MachineProjectsTab

**Files:**
- Modify: `frontend/src/components/tabs/MachineProjectsTab.tsx`

- [ ] **Step 1: Replace the lightweight list imports**

In `frontend/src/components/tabs/MachineProjectsTab.tsx`, remove:

```tsx
import type { TabPersisted } from '@/lib/connections/types';
import { ProjectListView } from './ProjectListView';
```

Add:

```tsx
import type { Project } from 'shared/types';
import type { TabPersisted } from '@/lib/connections/types';
import { ProjectsNavigationProvider } from '@/contexts/ProjectsNavigationContext';
import App from '@/App';
```

- [ ] **Step 2: Create the open-project override**

Inside `MachineProjectsTab`, before `return`, add:

```tsx
  const openProject = (project: Project) => {
    if (!tab.connectionId || !tab.machineId) return;
    openProjectTab(tab.connectionId, tab.machineId, project.id, project.name);
  };
```

- [ ] **Step 3: Render the full app**

Replace the existing connected return body:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectListView
          subtitle={tab.label}
          onOpenProject={(project) => {
            if (!tab.connectionId) return;
            openProjectTab(
              tab.connectionId,
              tab.machineId,
              project.id,
              project.name
            );
          }}
        />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

with:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectsNavigationProvider value={{ openProject }}>
          <App initialPath="/local-projects" />
        </ProjectsNavigationProvider>
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

- [ ] **Step 4: Run type check**

Run: `pnpm --dir frontend check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tabs/MachineProjectsTab.tsx
git commit -m "feat: render full projects page for gateway machines"
```

## Task 5: Return Project Tabs to the Machine Projects Tab

**Files:**
- Modify: `frontend/src/components/tabs/ProjectTab.tsx`
- Modify: `frontend/src/stores/__tests__/connection-store-gateway.test.ts`

- [ ] **Step 1: Add store reuse test**

Append this test to `frontend/src/stores/__tests__/connection-store-gateway.test.ts`:

```ts
  it('reuses an existing project tab for the same machine and project', () => {
    const { useConnectionStore } = requireStore();

    useConnectionStore.setState({
      nodes: [
        {
          entry: {
            id: 'gateway-self',
            type: 'gateway',
            url: 'http://gateway.test',
            label: 'Gateway',
          },
          gatewayUrl: 'http://gateway.test',
          gatewayState: {
            session: { sessionToken: 'token', userId: 'user-1' },
            machines: [
              {
                machine_id: 'machine-1',
                hostname: 'devbox',
                platform: 'linux',
                port: 3000,
                paired: true,
              },
            ],
            registrationOpen: true,
            authError: null,
            authLoading: false,
          },
        },
      ],
      tabs: [],
      activeTabId: 'home',
      initialized: true,
      machineSecrets: {},
    });

    useConnectionStore
      .getState()
      .openProjectTab('gateway-self', 'machine-1', 'project-1', 'Project One');
    const firstTabId = useConnectionStore.getState().activeTabId;

    useConnectionStore
      .getState()
      .openProjectTab('gateway-self', 'machine-1', 'project-1', 'Project One');

    expect(useConnectionStore.getState().tabs).toHaveLength(1);
    expect(useConnectionStore.getState().activeTabId).toBe(firstTabId);
  });
```

- [ ] **Step 2: Run the store test**

Run: `pnpm --dir frontend test -- src/stores/__tests__/connection-store-gateway.test.ts`

Expected: PASS. This verifies the existing store already focuses duplicate project tabs.

- [ ] **Step 3: Import the provider in `ProjectTab`**

In `frontend/src/components/tabs/ProjectTab.tsx`, add:

```tsx
import { ProjectsNavigationProvider } from '@/contexts/ProjectsNavigationContext';
```

- [ ] **Step 4: Read `openMachineProjectsTab`**

Replace:

```tsx
  const getConnection = useConnectionStore((s) => s.getConnection);
```

with:

```tsx
  const getConnection = useConnectionStore((s) => s.getConnection);
  const { openMachineProjectsTab } = useConnectionStore();
```

- [ ] **Step 5: Add the navigate override**

Inside `ProjectTab`, before the connected return:

```tsx
  const navigateToProjects = () => {
    if (!tab.connectionId || !tab.machineId) return;
    openMachineProjectsTab(tab.connectionId, tab.machineId, conn.label);
  };
```

- [ ] **Step 6: Wrap the app**

Replace:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

with:

```tsx
  return (
    <ConnectionProvider connection={conn}>
      <QueryClientProvider client={conn.queryClient}>
        <ProjectsNavigationProvider value={{ navigateToProjects }}>
          <App initialPath={`/local-projects/${tab.projectId}/tasks`} />
        </ProjectsNavigationProvider>
      </QueryClientProvider>
    </ConnectionProvider>
  );
```

- [ ] **Step 7: Run type check and store test**

Run: `pnpm --dir frontend check`

Expected: PASS.

Run: `pnpm --dir frontend test -- src/stores/__tests__/connection-store-gateway.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/tabs/ProjectTab.tsx frontend/src/stores/__tests__/connection-store-gateway.test.ts
git commit -m "feat: return project tabs to machine projects"
```

## Task 6: Final Verification

**Files:**
- Verify all files changed in previous tasks.

- [ ] **Step 1: Run frontend tests**

Run: `pnpm --dir frontend test`

Expected: PASS.

- [ ] **Step 2: Run frontend type check**

Run: `pnpm --dir frontend check`

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run: `pnpm --dir frontend lint`

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run: `git status --short`

Expected: no unstaged implementation changes. The plan file may remain
uncommitted if execution has not committed it yet.

## Self-Review

- Spec coverage: The plan covers the authoritative Projects page, multiple
  project tabs, project-tab logo return behavior, local/default navigation, and
  test coverage.
- Placeholder scan: No TBD/TODO/fill-in placeholders remain.
- Type consistency: The override context uses `Project` from `shared/types`,
  matching `ProjectList` and `ProjectCard`. Gateway store calls use existing
  `openProjectTab` and `openMachineProjectsTab` signatures.
