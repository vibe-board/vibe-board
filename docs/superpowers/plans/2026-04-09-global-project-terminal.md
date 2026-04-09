# Global Terminal & Project Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to open terminal sessions from any page — a global terminal (home dir) or a project terminal (repo dir) — without creating a task first.

**Architecture:** New `/api/terminal/direct-ws` WebSocket endpoint accepts a `cwd` path directly (no workspace lookup). New `/api/system/home-dir` REST endpoint returns the server's home directory. Frontend adds a Navbar button that toggles a right-side resizable drawer containing the existing `TerminalPanel`, using virtual workspace IDs and a new `TerminalDrawerContext` for drawer state.

**Tech Stack:** Rust/axum (backend), React/TypeScript (frontend), xterm.js (reused via existing components)

---

### Task 1: Backend — Direct Terminal WebSocket Endpoint

**Files:**
- Modify: `crates/server/src/routes/terminal.rs:21-31` (add new query struct), `crates/server/src/routes/terminal.rs:308-310` (register new route)

- [ ] **Step 1: Add `DirectTerminalQuery` struct and `direct_terminal_ws` handler**

In `crates/server/src/routes/terminal.rs`, add the new struct and handler below the existing `terminal_ws` function (after line 114):

```rust
#[derive(Debug, Deserialize)]
pub struct DirectTerminalQuery {
    pub cwd: String,
    pub session_id: Option<Uuid>,
    #[serde(default = "default_cols")]
    pub cols: u16,
    #[serde(default = "default_rows")]
    pub rows: u16,
}

pub async fn direct_terminal_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DirectTerminalQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let working_dir = PathBuf::from(&query.cwd);

    // Validate: must be absolute
    if !working_dir.is_absolute() {
        return Err(ApiError::BadRequest(
            "cwd must be an absolute path".to_string(),
        ));
    }

    // Validate: no .. segments
    for component in working_dir.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(ApiError::BadRequest(
                "cwd must not contain '..' segments".to_string(),
            ));
        }
    }

    // Validate: exists and is a directory
    if !working_dir.is_dir() {
        return Err(ApiError::BadRequest(
            "cwd does not exist or is not a directory".to_string(),
        ));
    }

    Ok(ws.on_upgrade(move |socket| {
        handle_terminal_ws(
            socket,
            deployment,
            working_dir,
            query.cols,
            query.rows,
            query.session_id,
        )
    }))
}
```

- [ ] **Step 2: Register the new route**

In the same file, update the `router()` function at the bottom:

```rust
pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/terminal/ws", get(terminal_ws))
        .route("/terminal/direct-ws", get(direct_terminal_ws))
}
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): add direct-ws endpoint for task-independent terminals"
```

---

### Task 2: Backend — Home Directory REST Endpoint

**Files:**
- Modify: `crates/server/src/routes/terminal.rs` (add home-dir handler and route)

- [ ] **Step 1: Add home-dir handler**

At the top of `crates/server/src/routes/terminal.rs`, ensure `Json` is imported from axum:

```rust
use axum::{
    Json,
    Router,
    extract::{
        Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
```

Then add the handler after the `direct_terminal_ws` function:

```rust
#[derive(Debug, Serialize)]
pub struct HomeDirResponse {
    pub home_dir: String,
}

pub async fn get_home_dir() -> Result<Json<HomeDirResponse>, ApiError> {
    let home = dirs::home_dir()
        .ok_or_else(|| ApiError::BadRequest("Could not determine home directory".to_string()))?;

    Ok(Json(HomeDirResponse {
        home_dir: home.to_string_lossy().to_string(),
    }))
}
```

- [ ] **Step 2: Register the route**

Update the `router()` function:

```rust
pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/terminal/ws", get(terminal_ws))
        .route("/terminal/direct-ws", get(direct_terminal_ws))
        .route("/terminal/home-dir", get(get_home_dir))
}
```

- [ ] **Step 3: Add `dirs` crate to server and verify**

The `dirs` crate is not in the server crate's dependencies. Add it to `crates/server/Cargo.toml` under `[dependencies]`:

```toml
dirs = "5.0"
```

(Version 5.0 matches other workspace crates like `crates/utils/Cargo.toml`, `crates/services/Cargo.toml`, etc.)

Run: `cargo check -p server`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add crates/server/Cargo.toml crates/server/src/routes/terminal.rs
git commit -m "feat(terminal): add home-dir endpoint"
```

---

### Task 3: Frontend — Add `systemApi.getHomeDir()` and `useHomeDir` Hook

**Files:**
- Modify: `frontend/src/lib/api.ts` (add systemApi)
- Create: `frontend/src/hooks/useHomeDir.ts`

- [ ] **Step 1: Add `systemApi` to api.ts**

At the bottom of `frontend/src/lib/api.ts`, before the last export or at the end of the file, add:

```typescript
export const systemApi = {
  getHomeDir: async (): Promise<{ home_dir: string }> => {
    const response = await makeRequest('/api/terminal/home-dir');
    const data = await response.json();
    return data;
  },
};
```

Note: This endpoint returns raw JSON (not wrapped in `ApiResponse`), so we parse it directly rather than using `handleApiResponse`.

- [ ] **Step 2: Create `useHomeDir` hook**

Create `frontend/src/hooks/useHomeDir.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { systemApi } from '@/lib/api';

export function useHomeDir() {
  return useQuery({
    queryKey: ['system', 'homeDir'],
    queryFn: () => systemApi.getHomeDir(),
    staleTime: Infinity,
  });
}
```

- [ ] **Step 3: Verify types**

Run: `pnpm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useHomeDir.ts
git commit -m "feat(api): add systemApi.getHomeDir and useHomeDir hook"
```

---

### Task 4: Frontend — Refactor XTermInstance to Accept `endpointUrl` Prop

**Files:**
- Modify: `frontend/src/components/panels/XTermInstance.tsx`
- Modify: `frontend/src/components/panels/TerminalPanel.tsx`

- [ ] **Step 1: Change XTermInstance props**

In `frontend/src/components/panels/XTermInstance.tsx`, replace the `workspaceId` prop with `endpointUrl`:

Replace the interface (lines 12-19):

```typescript
interface XTermInstanceProps {
  endpointUrl: string;
  isActive: boolean;
  onClose?: () => void;
  /** Backend PTY session ID for reconnection */
  sessionId: string | null;
  /** Called when backend sends a new session_id, or null to clear */
  onSessionId: (sessionId: string | null) => void;
}
```

Update the component signature (line 83):

```typescript
export function XTermInstance({
  endpointUrl,
  isActive,
  onClose,
  sessionId,
  onSessionId,
}: XTermInstanceProps) {
```

Replace the `endpoint` useMemo (lines 97-105) with one that uses `endpointUrl`:

```typescript
  const endpoint = useMemo(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    let url = `${protocol}//${host}${endpointUrl}&cols=${initialSizeRef.current.cols}&rows=${initialSizeRef.current.rows}`;
    if (sessionId) {
      url += `&session_id=${sessionId}`;
    }
    return url;
  }, [endpointUrl, sessionId]);
```

Note: `endpointUrl` is expected to include the path and the first query parameter (e.g., `/api/terminal/ws?workspace_id=xxx` or `/api/terminal/direct-ws?cwd=xxx`), so we append with `&`.

- [ ] **Step 2: Update TerminalPanel to build the URL and pass it**

In `frontend/src/components/panels/TerminalPanel.tsx`, the component currently passes `workspaceId` to `XTermInstance`. Change it to build the endpoint URL.

Add a new prop `endpointUrlBuilder` to `TerminalPanelProps` that, given a tab's cwd, returns the endpoint base URL:

Replace the interface and component:

```typescript
interface TerminalPanelProps {
  workspaceId: string;
  taskId: string;
  cwd: string | null;
  /** Build the base endpoint URL for a terminal tab.
   *  If not provided, defaults to workspace-based endpoint.
   */
  buildEndpointUrl?: (cwd: string) => string;
}

export function TerminalPanel({
  workspaceId,
  taskId,
  cwd,
  buildEndpointUrl,
}: TerminalPanelProps) {
```

Then in the JSX where `XTermInstance` is rendered (around line 74), replace `workspaceId={workspaceId}` with `endpointUrl`:

```typescript
      <div className="flex-1 min-h-0 overflow-hidden">
        {tabs.map((tab) => {
          const endpointUrl = buildEndpointUrl
            ? buildEndpointUrl(tab.cwd)
            : `/api/terminal/ws?workspace_id=${workspaceId}`;
          return (
            <XTermInstance
              key={tab.id}
              endpointUrl={endpointUrl}
              isActive={tab.id === activeTab?.id}
              onClose={() => closeTab(workspaceId, tab.id)}
              sessionId={tab.sessionId}
              onSessionId={(sid) => setSessionId(workspaceId, tab.id, sid)}
            />
          );
        })}
      </div>
```

- [ ] **Step 3: Verify no type errors**

Run: `pnpm run check`
Expected: no type errors. All existing callers of `TerminalPanel` (in `ProjectTasks.tsx`) don't pass `buildEndpointUrl`, so they use the workspace-based default.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/panels/XTermInstance.tsx frontend/src/components/panels/TerminalPanel.tsx
git commit -m "refactor(terminal): XTermInstance accepts endpointUrl instead of workspaceId"
```

---

### Task 5: Frontend — Create TerminalDrawerContext

**Files:**
- Create: `frontend/src/contexts/TerminalDrawerContext.tsx`

- [ ] **Step 1: Create the context**

Create `frontend/src/contexts/TerminalDrawerContext.tsx`:

```typescript
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';

const STORAGE_KEY = 'vibe-board:terminal-drawer';

interface DrawerState {
  isOpen: boolean;
  cwd: string | null;
  workspaceId: string;
}

function loadDrawerState(): DrawerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        isOpen: parsed.isOpen ?? false,
        cwd: parsed.cwd ?? null,
        workspaceId: parsed.workspaceId ?? 'global-terminal',
      };
    }
  } catch {
    // ignore
  }
  return { isOpen: false, cwd: null, workspaceId: 'global-terminal' };
}

function saveDrawerState(state: DrawerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface TerminalDrawerContextType {
  isDrawerOpen: boolean;
  drawerCwd: string | null;
  drawerWorkspaceId: string;
  openDrawer: (cwd: string, workspaceId: string) => void;
  closeDrawer: () => void;
  toggleDrawer: (cwd: string, workspaceId: string) => void;
}

const TerminalDrawerContext =
  createContext<TerminalDrawerContextType | null>(null);

export function TerminalDrawerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<DrawerState>(loadDrawerState);

  const openDrawer = useCallback((cwd: string, workspaceId: string) => {
    setState((prev) => {
      const next = { isOpen: true, cwd, workspaceId };
      saveDrawerState(next);
      return next;
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setState((prev) => {
      const next = { ...prev, isOpen: false };
      saveDrawerState(next);
      return next;
    });
  }, []);

  const toggleDrawer = useCallback(
    (cwd: string, workspaceId: string) => {
      setState((prev) => {
        // If open and same workspaceId, close. Otherwise open with new params.
        const shouldClose =
          prev.isOpen && prev.workspaceId === workspaceId;
        const next = shouldClose
          ? { ...prev, isOpen: false }
          : { isOpen: true, cwd, workspaceId };
        saveDrawerState(next);
        return next;
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      isDrawerOpen: state.isOpen,
      drawerCwd: state.cwd,
      drawerWorkspaceId: state.workspaceId,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [state, openDrawer, closeDrawer, toggleDrawer]
  );

  return (
    <TerminalDrawerContext.Provider value={value}>
      {children}
    </TerminalDrawerContext.Provider>
  );
}

export function useTerminalDrawer() {
  const context = useContext(TerminalDrawerContext);
  if (!context) {
    throw new Error(
      'useTerminalDrawer must be used within TerminalDrawerProvider'
    );
  }
  return context;
}
```

- [ ] **Step 2: Verify types**

Run: `pnpm run check`
Expected: no errors (file is standalone, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/TerminalDrawerContext.tsx
git commit -m "feat(terminal): add TerminalDrawerContext for drawer state"
```

---

### Task 6: Frontend — Add Terminal Drawer to NormalLayout

**Files:**
- Modify: `frontend/src/components/layout/NormalLayout.tsx`
- Modify: `frontend/src/App.tsx` (add TerminalDrawerProvider)

- [ ] **Step 1: Add TerminalDrawerProvider to App.tsx**

In `frontend/src/App.tsx`, import the provider:

```typescript
import { TerminalDrawerProvider } from '@/contexts/TerminalDrawerContext';
```

Wrap `TerminalProvider` with `TerminalDrawerProvider` (or nest inside it). In the `AppContent` return, around lines 104-106:

```typescript
        <SearchProvider>
          <TerminalProvider>
            <TerminalDrawerProvider>
              <SentryRoutes>
```

And close it before `</TerminalProvider>`:

```typescript
              </SentryRoutes>
            </TerminalDrawerProvider>
          </TerminalProvider>
        </SearchProvider>
```

- [ ] **Step 2: Add the drawer to NormalLayout**

Replace the contents of `frontend/src/components/layout/NormalLayout.tsx`:

```typescript
import { useRef } from 'react';
import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { useTerminalDrawer } from '@/contexts/TerminalDrawerContext';
import { TerminalPanel } from '@/components/panels/TerminalPanel';

function DirectTerminalPanel({
  workspaceId,
  cwd,
}: {
  workspaceId: string;
  cwd: string;
}) {
  return (
    <TerminalPanel
      workspaceId={workspaceId}
      taskId={workspaceId}
      cwd={cwd}
      buildEndpointUrl={(c) =>
        `/api/terminal/direct-ws?cwd=${encodeURIComponent(c)}`
      }
    />
  );
}

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const { isDrawerOpen, drawerCwd, drawerWorkspaceId } =
    useTerminalDrawer();

  const hasEverOpened = useRef(false);
  if (isDrawerOpen && drawerCwd) {
    hasEverOpened.current = true;
  }

  return (
    <>
      <div className="flex flex-col h-screen">
        <DevBanner />
        {!shouldHideNavbar && <Navbar />}
        <div className="flex-1 min-h-0 flex flex-row">
          <div className="flex-1 min-w-0 overflow-auto">
            <Outlet />
          </div>
          {/* Terminal drawer - always mounted once opened, hidden via CSS to preserve xterm state */}
          {hasEverOpened.current && drawerCwd && (
            <>
              <div
                className="shrink-0 bg-border"
                style={{ width: isDrawerOpen ? 1 : 0 }}
              />
              <div
                className="min-h-0 overflow-hidden"
                style={{
                  width: isDrawerOpen ? 'min(50vw, 640px)' : 0,
                  display: isDrawerOpen ? 'block' : 'none',
                }}
              >
                <DirectTerminalPanel
                  workspaceId={drawerWorkspaceId}
                  cwd={drawerCwd}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

Note: We use a fixed-width approach (`min(50vw, 640px)`) with CSS `display:none` to hide the terminal without unmounting it. This preserves xterm.js state and WebSocket connections across toggle cycles. A future enhancement could add react-resizable-panels for drag-to-resize, but the fixed width is simpler and avoids the complexity of react-resizable-panels' stable child requirement.

- [ ] **Step 3: Verify types**

Run: `pnpm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/NormalLayout.tsx
git commit -m "feat(terminal): add resizable terminal drawer to NormalLayout"
```

---

### Task 7: Frontend — Add Terminal Button to Navbar

**Files:**
- Modify: `frontend/src/components/layout/Navbar.tsx`

- [ ] **Step 1: Add imports and terminal button logic**

In `frontend/src/components/layout/Navbar.tsx`, add the following imports:

```typescript
import { SquareTerminal } from 'lucide-react';
import { useTerminalDrawer } from '@/contexts/TerminalDrawerContext';
import { useHomeDir } from '@/hooks/useHomeDir';
```

Inside the `Navbar` component function (around line 84), add these hooks:

```typescript
  const { isDrawerOpen, toggleDrawer } = useTerminalDrawer();
  const { data: homeDirData } = useHomeDir();
```

Add the terminal button click handler:

```typescript
  const handleToggleTerminal = useCallback(() => {
    if (projectId && repos?.length) {
      const repoPath = String(repos[0].path);
      toggleDrawer(repoPath, `project-terminal:${projectId}`);
    } else if (homeDirData?.home_dir) {
      toggleDrawer(homeDirData.home_dir, 'global-terminal');
    }
  }, [projectId, repos, homeDirData, toggleDrawer]);
```

- [ ] **Step 2: Add the button to the JSX**

In the Navbar JSX, find the `<div className="flex items-center gap-1">` block that contains the Settings button and hamburger menu (around line 296). Insert the terminal button just before the Settings button:

```typescript
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9',
                  isDrawerOpen && 'bg-accent'
                )}
                onClick={handleToggleTerminal}
                disabled={!homeDirData?.home_dir && !repos?.length}
                aria-label="Toggle terminal"
              >
                <SquareTerminal className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                asChild
                aria-label="Settings"
              >
```

Also add the `cn` import if not already present. Check current imports — `cn` is not imported in Navbar. Add:

```typescript
import { cn } from '@/lib/utils';
```

- [ ] **Step 3: Verify types**

Run: `pnpm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Navbar.tsx
git commit -m "feat(terminal): add terminal toggle button to Navbar"
```

---

### Task 8: Manual Integration Test

**Files:** none (testing only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm run dev`

- [ ] **Step 2: Test global terminal**

1. Navigate to the project list page (`/local-projects`)
2. Click the terminal button (SquareTerminal icon) in the Navbar
3. Verify: a right-side panel appears with a terminal
4. Verify: the terminal opens in the user's home directory (run `pwd`)
5. Verify: the panel is resizable by dragging the separator
6. Click the terminal button again
7. Verify: the panel closes
8. Click the terminal button once more
9. Verify: the same terminal session reconnects (no new shell)

- [ ] **Step 3: Test project terminal**

1. Navigate to a project's tasks page (`/local-projects/{projectId}/tasks`)
2. Click the terminal button in the Navbar
3. Verify: the right-side panel opens with a terminal
4. Verify: the terminal opens in the project's repo directory (run `pwd`)
5. Verify: the existing task kanban board is still visible (pushed left)

- [ ] **Step 4: Test task terminal coexistence**

1. On the tasks page, select a task with an attempt
2. Click the "Terminal" aux view toggle (existing functionality)
3. Verify: the task terminal opens in the aux panel (existing behavior unchanged)
4. Click the Navbar terminal button
5. Verify: the drawer terminal opens alongside — it's independent from the task terminal

- [ ] **Step 5: Test terminal tab creation**

1. With the drawer open, click the "+" button in the terminal tab bar
2. Verify: a new terminal tab opens in the same directory
3. Close all tabs
4. Verify: the drawer remains open but shows empty tab bar

- [ ] **Step 6: Commit verification results**

If everything works, no additional commit needed. If issues found, fix and commit.
