# Tauri Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing vibe-kanban web UI into a Tauri v2 desktop app that supports direct HTTP connection to a local backend and E2EE gateway connection to a remote backend.

**Architecture:** Tauri acts as a WebView container loading the existing React frontend. The Core Process registers shell and updater plugins, sets up a system tray, and provides capabilities for spawning `npx vibe-board`. The frontend gets minimal changes: a base URL layer for Tauri direct mode, configurable gateway URL, and a connection setup dialog.

**Tech Stack:** Tauri v2, tauri-plugin-shell, tauri-plugin-updater, React, TypeScript, @tauri-apps/plugin-shell, @ebay/nice-modal-react

**Spec:** `docs/superpowers/specs/2026-04-10-tauri-desktop-app-design.md`

---

### Task 1: Scaffold Tauri project structure

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Modify: `Cargo.toml:1-2` (add `exclude`)

- [ ] **Step 1: Add `src-tauri` to Cargo workspace exclude**

The root `Cargo.toml` workspace must exclude `src-tauri/` so it doesn't interfere with the existing workspace. Edit `Cargo.toml`:

```toml
[workspace]
resolver = "3"
exclude = ["src-tauri"]
members = [
    "crates/api-types",
    ...
```

- [ ] **Step 2: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "vibe-board-desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
tauri-plugin-updater = "2"
```

- [ ] **Step 3: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Create `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "Vibe Board",
  "version": "0.1.0",
  "identifier": "com.vibeboard.desktop",
  "build": {
    "beforeDevCommand": "pnpm run --filter frontend dev -- --port 1420",
    "beforeBuildCommand": "pnpm run --filter frontend build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../frontend/dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Vibe Board",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "targets": "all"
  }
}
```

- [ ] **Step 5: Create `src-tauri/capabilities/default.json`**

```json
{
  "identifier": "default",
  "description": "Default capabilities for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-stdin-write",
    "shell:default"
  ]
}
```

- [ ] **Step 6: Create `src-tauri/src/main.rs`**

```rust
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vibe_board_desktop::run()
}
```

- [ ] **Step 7: Create `src-tauri/src/lib.rs`**

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 8: Verify Tauri project compiles**

Run from the repo root:

```bash
cd src-tauri && cargo check
```

Expected: Compiles successfully (downloads Tauri crates on first run — may take a few minutes).

- [ ] **Step 9: Commit**

```bash
git add Cargo.toml src-tauri/
git commit -m "feat(tauri): scaffold Tauri v2 desktop app shell

Add src-tauri/ with Cargo.toml, tauri.conf.json, capabilities,
main.rs and lib.rs. Registers shell plugin and system tray.
Excluded from root Cargo workspace."
```

---

### Task 2: Generate app icons and add package.json scripts

**Files:**
- Create: `src-tauri/icons/` (generated by `tauri icon`)
- Modify: `package.json` (add `tauri:dev`, `tauri:build`)

- [ ] **Step 1: Install Tauri CLI**

```bash
pnpm add -Dw @tauri-apps/cli
```

- [ ] **Step 2: Generate default icons**

The Tauri CLI can generate icons from a source image. Use the existing app icon if available, or generate placeholder icons:

```bash
pnpm tauri icon assets/logo.png 2>/dev/null || pnpm tauri icon
```

If no source image is found, the CLI generates default Tauri icons in `src-tauri/icons/`. This is fine for development — custom icons can be added later.

Expected: `src-tauri/icons/` is populated with `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, etc.

- [ ] **Step 3: Add tauri scripts to root `package.json`**

Add these two scripts to the `"scripts"` section in the root `package.json`:

```json
"tauri:dev": "FRONTEND_PORT=1420 BACKEND_PORT=1421 concurrently \"pnpm run backend:dev:watch\" \"pnpm tauri dev\"",
"tauri:build": "pnpm tauri build"
```

The `tauri:dev` script:
- Sets fixed ports (1420 for frontend, 1421 for backend) so `tauri.conf.json`'s static `devUrl` works
- Runs backend and Tauri concurrently
- Tauri runs `beforeDevCommand` which starts Vite on port 1420
- Vite proxy forwards `/api/*` to backend on port 1421

- [ ] **Step 4: Install frontend Tauri API dependencies**

```bash
cd frontend && pnpm add @tauri-apps/api @tauri-apps/plugin-shell
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/icons/ package.json frontend/package.json frontend/pnpm-lock.yaml pnpm-lock.yaml
git commit -m "feat(tauri): add icons, CLI, and dev/build scripts

Generate default app icons, install @tauri-apps/cli,
add tauri:dev and tauri:build root scripts with fixed ports."
```

---

### Task 3: Add `__TAURI__` type declaration

**Files:**
- Create: `frontend/src/types/tauri.d.ts`

- [ ] **Step 1: Create `frontend/src/types/tauri.d.ts`**

```typescript
/**
 * Tauri injects `window.__TAURI__` when running inside a Tauri WebView.
 * This declaration makes it available for runtime environment detection.
 */
interface Window {
  __TAURI__?: Record<string, unknown>;
}
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd frontend && pnpm run check
```

Expected: No new type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/tauri.d.ts
git commit -m "feat(tauri): add Window.__TAURI__ type declaration"
```

---

### Task 4: Add base URL support to `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts:120-141`

The `makeRequest` function currently does `fetch(url, ...)` with relative paths like `/api/projects`. In Tauri production builds, the frontend loads from `tauri://localhost` so relative paths don't reach the backend. We need to prepend a configurable base URL.

- [ ] **Step 1: Add `getApiBaseUrl` helper and modify `makeRequest`**

In `frontend/src/lib/api.ts`, add the helper function just above `makeRequest` (before line 120):

```typescript
/**
 * Returns the base URL to prepend to API requests.
 * - Browser mode: empty string (relative paths, handled by same-origin or Vite proxy)
 * - Tauri mode: reads backend URL from localStorage (set by connection setup dialog)
 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return localStorage.getItem('vb-backend-url') || '';
  }
  return '';
}
```

Then modify the `fetch` call at the end of `makeRequest` (around line 137). Change:

```typescript
  return fetch(url, {
    ...options,
    headers,
  });
```

To:

```typescript
  const baseUrl = getApiBaseUrl();
  return fetch(baseUrl ? `${baseUrl}${url}` : url, {
    ...options,
    headers,
  });
```

- [ ] **Step 2: Verify frontend still compiles**

```bash
cd frontend && pnpm run check
```

Expected: No errors. Browser mode unaffected (base URL is empty string).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(tauri): add configurable API base URL for Tauri direct mode

In Tauri environment, reads vb-backend-url from localStorage
and prepends it to API fetch calls. Browser mode unchanged."
```

---

### Task 5: Make gateway URL configurable in `GatewayContext.tsx`

**Files:**
- Modify: `frontend/src/contexts/GatewayContext.tsx:192,370`

The `GatewayContext` uses `window.location.origin` as the gateway URL in two places. In Tauri, `window.location.origin` is `tauri://localhost` which isn't useful. We need to read from localStorage when in Tauri.

- [ ] **Step 1: Add gateway URL helper function**

At the top of `frontend/src/contexts/GatewayContext.tsx` (after the imports, before the type declarations around line 18), add:

```typescript
/** Resolve the gateway URL: from localStorage in Tauri, from origin in browser. */
function getGatewayUrl(): string {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return localStorage.getItem('vb-gateway-url') || '';
  }
  return window.location.origin;
}
```

- [ ] **Step 2: Replace `window.location.origin` usage on line 192**

In the `useEffect` for machine_select phase (around line 192), change:

```typescript
    const gatewayUrl = window.location.origin;
```

To:

```typescript
    const gatewayUrl = getGatewayUrl();
```

- [ ] **Step 3: Replace `window.location.origin` usage on line 370**

In the `connectToMachine` callback (around line 370), change:

```typescript
        const gatewayUrl = window.location.origin;
```

To:

```typescript
        const gatewayUrl = getGatewayUrl();
```

- [ ] **Step 4: Modify gateway detection for Tauri**

In the `useEffect` for Step 1 (detect gateway mode, around line 159), we need to handle Tauri mode. The current `detectGatewayMode()` tries to fetch `/api/gateway/info` which won't work in Tauri production. Wrap the detection:

Change:

```typescript
  // Step 1: Detect gateway mode
  useEffect(() => {
    detectGatewayMode().then((isGateway) => {
      if (!isGateway) {
        setPhase('local');
        return;
      }
```

To:

```typescript
  // Step 1: Detect gateway mode
  useEffect(() => {
    // In Tauri, determine mode from localStorage config instead of /api/gateway/info
    if (typeof window !== 'undefined' && window.__TAURI__) {
      const gwUrl = localStorage.getItem('vb-gateway-url');
      const backendUrl = localStorage.getItem('vb-backend-url');
      if (gwUrl) {
        // Gateway mode — proceed with login/machine selection
        const stored = loadSession();
        if (stored) {
          setSession(stored);
          const savedMachine = loadSelectedMachine();
          if (savedMachine && manager.isMachinePaired(savedMachine)) {
            pendingAutoConnectRef.current = savedMachine;
            setSelectedMachineId(savedMachine);
          }
          setPhase('machine_select');
        } else {
          setPhase('login');
        }
        fetch(`${gwUrl}/api/auth/registration-status`)
          .then((r) => r.json())
          .then((d) => setRegistrationOpen(d.open))
          .catch(() => setRegistrationOpen(false));
        return;
      }
      if (backendUrl) {
        setPhase('local');
        return;
      }
      // No config — will show connection setup dialog (phase stays 'detecting')
      // Set to 'local' so the app renders, the connection dialog handles the rest
      setPhase('local');
      return;
    }

    detectGatewayMode().then((isGateway) => {
      if (!isGateway) {
        setPhase('local');
        return;
      }
```

The closing of the original `.then` block and the `useEffect` remain unchanged.

- [ ] **Step 5: Verify frontend compiles**

```bash
cd frontend && pnpm run check
```

Expected: No errors. Browser mode flows unchanged (the `window.__TAURI__` check is false in browsers).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/GatewayContext.tsx
git commit -m "feat(tauri): make gateway URL configurable for Tauri environment

In Tauri, reads vb-gateway-url from localStorage instead of
window.location.origin. Determines mode from localStorage config
rather than /api/gateway/info detection."
```

---

### Task 6: Create Connection Setup Dialog

**Files:**
- Create: `frontend/src/components/dialogs/ConnectionSetupDialog.tsx`

This dialog lets users configure how the Tauri app connects to a backend. Shown on first launch (no config) or via settings.

- [ ] **Step 1: Create `frontend/src/components/dialogs/ConnectionSetupDialog.tsx`**

```typescript
import { useState, useCallback } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/lib/modals';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ConnectionMode = 'direct' | 'gateway';

const DialogImpl = NiceModal.create<NoProps>(() => {
  const modal = useModal();
  const [mode, setMode] = useState<ConnectionMode>(() => {
    if (localStorage.getItem('vb-gateway-url')) return 'gateway';
    return 'direct';
  });
  const [backendUrl, setBackendUrl] = useState(
    () => localStorage.getItem('vb-backend-url') || 'http://localhost:3001'
  );
  const [gatewayUrl, setGatewayUrl] = useState(
    () => localStorage.getItem('vb-gateway-url') || ''
  );
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testError, setTestError] = useState('');
  const [backendStatus, setBackendStatus] = useState<
    'idle' | 'starting' | 'running' | 'error'
  >('idle');
  const [backendError, setBackendError] = useState('');

  const testConnection = useCallback(async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const resp = await fetch(`${backendUrl}/api/config/info`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setTestError(`Server returned ${resp.status}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestError(
        e instanceof Error ? e.message : 'Could not reach backend'
      );
    }
  }, [backendUrl]);

  const startBackend = useCallback(async () => {
    if (!window.__TAURI__) return;
    setBackendStatus('starting');
    setBackendError('');
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('npx', ['vibe-board']);
      cmd.stderr.on('data', (line: string) => {
        // Detect when server is ready by checking for port output
        if (line.includes('listening') || line.includes('http://')) {
          setBackendStatus('running');
        }
      });
      cmd.on('error', (err: string) => {
        setBackendStatus('error');
        setBackendError(err);
      });
      cmd.on('close', (data: { code: number }) => {
        if (data.code !== 0 && backendStatus !== 'running') {
          setBackendStatus('error');
          setBackendError(`Process exited with code ${data.code}`);
        }
      });
      await cmd.spawn();
    } catch (e) {
      setBackendStatus('error');
      setBackendError(e instanceof Error ? e.message : 'Failed to start');
    }
  }, [backendStatus]);

  const handleSave = useCallback(() => {
    if (mode === 'direct') {
      localStorage.setItem('vb-backend-url', backendUrl);
      localStorage.removeItem('vb-gateway-url');
    } else {
      localStorage.setItem('vb-gateway-url', gatewayUrl);
      localStorage.removeItem('vb-backend-url');
    }
    // Reload to re-trigger gateway detection with new config
    window.location.reload();
  }, [mode, backendUrl, gatewayUrl]);

  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) modal.hide();
      }}
      className="sm:max-w-lg"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connection Setup</DialogTitle>
          <DialogDescription>
            Configure how Vibe Board connects to the backend server.
          </DialogDescription>
        </DialogHeader>

        {/* Mode selector */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'direct' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('direct')}
          >
            Direct (Local)
          </Button>
          <Button
            variant={mode === 'gateway' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('gateway')}
          >
            E2EE Gateway
          </Button>
        </div>

        {mode === 'direct' ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Backend URL
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                value={backendUrl}
                onChange={(e) => {
                  setBackendUrl(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder="http://localhost:3001"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={testStatus === 'testing' || !backendUrl}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              {window.__TAURI__ && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startBackend}
                  disabled={
                    backendStatus === 'starting' ||
                    backendStatus === 'running'
                  }
                >
                  {backendStatus === 'starting'
                    ? 'Starting...'
                    : backendStatus === 'running'
                      ? 'Running'
                      : 'Start Local Backend'}
                </Button>
              )}
            </div>

            {testStatus === 'success' && (
              <Alert variant="success">
                <AlertDescription>Connection successful</AlertDescription>
              </Alert>
            )}
            {testStatus === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{testError}</AlertDescription>
              </Alert>
            )}
            {backendStatus === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{backendError}</AlertDescription>
              </Alert>
            )}
            {backendStatus === 'running' && (
              <Alert variant="success">
                <AlertDescription>
                  Local backend is running
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                Gateway URL
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="https://gateway.example.com"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You will be prompted to log in after connecting to the gateway.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleSave}>Save &amp; Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ConnectionSetupDialog =
  defineModal<void, void>(DialogImpl);
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && pnpm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dialogs/ConnectionSetupDialog.tsx
git commit -m "feat(tauri): add connection setup dialog

Dialog for configuring backend URL (direct mode) or gateway URL
(E2EE mode). Supports testing connections and starting local
backend via shell plugin. Follows existing dialog patterns."
```

---

### Task 7: Wire up connection dialog in the app

**Files:**
- Modify: `frontend/src/components/gateway/GatewayGate.tsx`

The connection setup dialog should be shown when:
1. Running in Tauri AND no connection config exists in localStorage
2. The user explicitly triggers it (we add a settings trigger later if needed)

For now, we show it automatically during the `local` phase in Tauri when no backend URL is configured.

- [ ] **Step 1: Add connection setup check to `GatewayGate`**

In `frontend/src/components/gateway/GatewayGate.tsx`, add the import and a check in the `local` case. Modify the file:

Add import at the top:

```typescript
import { useEffect } from 'react';
import { ConnectionSetupDialog } from '@/components/dialogs/ConnectionSetupDialog';
```

Then replace the `case 'local'` block:

```typescript
    case 'local':
      // Not gateway mode — render the app directly.
      // In Tauri, show connection setup dialog if no backend URL is configured.
      return (
        <>
          <TauriConnectionCheck />
          {children}
        </>
      );
```

And add the helper component at the bottom of the file (before the `gatewayStyles` const):

```typescript
/**
 * In Tauri, checks if a backend URL is configured. If not, opens the
 * connection setup dialog so the user can configure the connection.
 */
function TauriConnectionCheck() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.__TAURI__ &&
      !localStorage.getItem('vb-backend-url') &&
      !localStorage.getItem('vb-gateway-url')
    ) {
      ConnectionSetupDialog.show();
    }
  }, []);
  return null;
}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && pnpm run check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/gateway/GatewayGate.tsx
git commit -m "feat(tauri): auto-show connection dialog on first Tauri launch

When running in Tauri with no backend/gateway URL configured,
the connection setup dialog opens automatically."
```

---

### Task 8: Verify Tauri dev mode runs end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run Tauri dev mode**

```bash
pnpm run tauri:dev
```

Expected behavior:
1. Backend starts on port 1421
2. Tauri starts Vite on port 1420 (via `beforeDevCommand`)
3. Tauri window opens with the frontend loaded
4. The Vite proxy forwards `/api/*` to backend on port 1421
5. System tray icon appears
6. App functions normally (projects, tasks, etc.)

If the frontend can't reach the backend, check:
- Is the backend actually running on port 1421? Check terminal output.
- Does the Vite config pick up `BACKEND_PORT`? The proxy target uses `process.env.BACKEND_PORT || '3001'`.

- [ ] **Step 2: Verify system tray works**

- Click the tray icon → window should come to focus
- Right-click tray icon → menu with "Show Window" and "Quit"
- Click "Quit" → app exits

- [ ] **Step 3: Verify connection setup dialog (Tauri production simulation)**

In dev mode, the Vite proxy handles API routing so the base URL isn't needed. To test the connection dialog logic, temporarily open browser DevTools in the Tauri window and run:

```javascript
localStorage.removeItem('vb-backend-url');
localStorage.removeItem('vb-gateway-url');
window.__TAURI__ = {};
location.reload();
```

The connection setup dialog should appear.

- [ ] **Step 4: Commit any fixes if needed**

If any fixes were needed during testing, commit them:

```bash
git add -A
git commit -m "fix(tauri): address issues found during dev mode testing"
```

---

### Task 9: Test production build

**Files:** None (verification only)

- [ ] **Step 1: Build the Tauri app**

```bash
pnpm run tauri:build
```

Expected: Produces platform-specific bundles in `src-tauri/target/release/bundle/`.

On Linux, expect `.deb` and `.AppImage` files.

- [ ] **Step 2: Run the built app**

Run the AppImage (Linux) or the built binary directly:

```bash
# Linux:
chmod +x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

Expected:
1. App opens with the connection setup dialog (first launch, no localStorage config)
2. Enter `http://localhost:3001` and click "Test Connection"
3. Start a backend manually: `npx vibe-board --port 3001`
4. Test connection should succeed
5. Click "Save & Connect" → app reloads and connects to backend

- [ ] **Step 3: Test "Start Local Backend" button**

1. Kill any running backend
2. Open the connection setup dialog
3. Click "Start Local Backend"
4. Wait for the status to show "Running"
5. Click "Save & Connect"

Expected: Backend starts via `npx vibe-board`, app connects.

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix(tauri): address issues found during production build testing"
```
