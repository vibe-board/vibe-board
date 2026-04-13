# Tauri Desktop App Design

## Goal

Wrap the existing vibe-kanban web UI into a Tauri v2 desktop application. The app is a frontend container that supports two connection modes:
- **Direct HTTP**: Connect to a locally running backend
- **E2EE Gateway**: Connect to a remote backend via encrypted gateway

The backend is never embedded. It runs independently (started manually or via `npx vibe-board`).

## Target Platforms

Linux, macOS, Windows.

## Approach

**Approach A: Tauri as WebView container** — Tauri loads the existing React/Vite frontend in a WebView. The frontend code is shared between browser and desktop. Tauri Core Process handles window management, system tray, optional `npx` process spawning, and auto-update. No IPC bridging of API calls; the frontend connects to the backend directly over HTTP/WebSocket as it does in the browser.

## Architecture

```
┌─────────────────────────────────────┐
│  Tauri Core Process (Rust)          │
│  - Window management                │
│  - System tray                      │
│  - Shell plugin (spawn npx)         │
│  - Auto-updater plugin              │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  WebView                      │  │
│  │  React Frontend (same code)   │  │
│  │                               │  │
│  │  Direct mode:                 │  │
│  │    fetch(baseUrl + '/api/..') │  │
│  │                               │  │
│  │  Gateway mode:                │  │
│  │    conn.remoteFetch('/api/..') │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
         │                    │
    Direct HTTP          E2EE WebSocket
         │                    │
         ▼                    ▼
  Local Backend         E2EE Gateway
  (npx vibe-board)      (remote)
```

## Project Structure

```
vibe-kanban/
├── src-tauri/                      # NEW - Tauri Core Process
│   ├── Cargo.toml                  # Tauri + plugin dependencies
│   ├── tauri.conf.json             # Tauri configuration
│   ├── build.rs                    # Tauri build script
│   ├── capabilities/
│   │   └── default.json            # Permissions: shell, updater
│   ├── icons/                      # App icons (all platforms)
│   └── src/
│       ├── main.rs                 # Entry point
│       └── lib.rs                  # Plugin registration, tray setup
├── frontend/                       # EXISTING - unchanged structure
├── crates/                         # EXISTING - unchanged
└── ...
```

`src-tauri/` is an **independent crate**, not added to the existing `crates/` Cargo workspace. Reasons:
- Tauri has its own build pipeline (`tauri-build`)
- Avoids impacting backend compilation and CI
- Separation of concerns: desktop shell vs backend logic

## Tauri Configuration

### tauri.conf.json

Key settings:
- `identifier`: `com.vibeboard.desktop`
- `productName`: `Vibe Board`
- `build.devUrl`: `http://localhost:3000` (Vite dev server port)
- `build.frontendDist`: `../frontend/dist`
- `build.beforeDevCommand`: `pnpm run --filter frontend dev` (starts Vite)
- `build.beforeBuildCommand`: `pnpm run --filter frontend build` (builds frontend)
- `app.windows[0]`: Main window, 1280x800, resizable, centered
- `bundle`: Platform-specific installer configs (deb, rpm, AppImage, dmg, msi/nsis)

### Capabilities (src-tauri/capabilities/default.json)

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-execute",
    "shell:allow-spawn",
    "shell:allow-kill",
    "updater:default"
  ]
}
```

### Shell Plugin Scope

The shell plugin needs a scoped permission to allow executing `npx`:

```json
{
  "identifier": "shell-scope",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "shell:allow-execute",
      "allow": [{ "name": "npx", "cmd": "npx", "args": true }]
    }
  ]
}
```

## Tauri Core Process

### src-tauri/src/lib.rs

Responsibilities:
1. **Plugin registration**: shell, updater
2. **System tray**: Icon + menu (Open Window, Quit)
3. **Window close behavior**: Hide to tray on close (configurable)

```rust
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // System tray
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
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

### src-tauri/src/main.rs

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    vibe_board_desktop::run();
}
```

## Frontend Changes

All changes are backward-compatible. Browser mode behavior is unaffected.

### 1. `frontend/src/lib/api.ts` — Add base URL support

Add a function to resolve the API base URL:

```typescript
function getApiBaseUrl(): string {
  if (window.__TAURI__) {
    return localStorage.getItem('vb-backend-url') || '';
  }
  return '';
}
```

In `makeRequest`, prepend the base URL to the fetch call (only in non-gateway/local mode):

```typescript
// Before gateway check, for local fetch:
return fetch(getApiBaseUrl() + url, { ...options, headers });
```

### 2. `frontend/src/lib/e2ee/connection.ts` — Configurable gateway URL

```typescript
// Current:
const gatewayUrl = window.location.origin;

// Changed to:
const gatewayUrl = window.__TAURI__
  ? localStorage.getItem('vb-gateway-url') || ''
  : window.location.origin;
```

### 3. `frontend/src/contexts/GatewayContext.tsx` — Tauri mode detection

In Tauri environment, skip the automatic `/api/gateway/info` detection. Instead:
- If `vb-gateway-url` is set in localStorage → enter gateway mode
- If `vb-backend-url` is set in localStorage → enter direct/local mode
- If neither is set → show connection setup dialog

### 4. New: Connection Setup Dialog

A new dialog component at `frontend/src/components/dialogs/ConnectionSetupDialog.tsx`.

**UI elements:**
- Mode selector: "Direct (Local)" vs "E2EE Gateway"
- Direct mode:
  - Backend URL input (default: `http://localhost:3001`)
  - "Test Connection" button (fetches `/api/config/info` to verify)
  - "Start Local Backend" button (calls `Command.create('npx', ['vibe-board'])` via shell plugin)
  - Status indicator showing if backend is running
- Gateway mode:
  - Gateway URL input
  - Proceeds to existing gateway login flow
- "Save & Connect" button → writes to localStorage, reloads app

**When shown:**
- On first launch (no config in localStorage)
- Via a settings button in the app header/sidebar

**Style:** Follows existing dialog patterns (`Dialog` + `DialogContent` from `@/components/ui/dialog`), legacy design system. `max-w-*` on `Dialog`, not `DialogContent`.

### 5. TypeScript types for Tauri

Add a `window.__TAURI__` type declaration:

```typescript
// frontend/src/types/tauri.d.ts
interface Window {
  __TAURI__?: Record<string, unknown>;
}
```

## Development Workflow

### Dev port alignment

The existing dev workflow uses `scripts/setup-dev-environment.js` to assign random ports, stored in `.dev-ports.json`. Tauri's `devUrl` in `tauri.conf.json` needs a fixed port.

**Solution:** For Tauri dev, use a fixed `FRONTEND_PORT` (e.g., `1420` — Tauri's conventional default) and `BACKEND_PORT` (`1421`). The `tauri:dev` script sets these env vars explicitly, bypassing dynamic port allocation:

```json
{
  "tauri:dev": "FRONTEND_PORT=1420 BACKEND_PORT=1421 concurrently \"pnpm run backend:dev:watch\" \"cd src-tauri && cargo tauri dev\""
}
```

This way `tauri.conf.json` can use a static `devUrl: "http://localhost:1420"`. The Vite dev server starts on that port via `beforeDevCommand`, and its proxy forwards `/api/*` to port 1421.

### Running in Tauri dev mode

```bash
# Single command (starts backend + Tauri + Vite):
pnpm run tauri:dev

# Or manually:
# Terminal 1: Start backend on port 1421
BACKEND_PORT=1421 pnpm run backend:dev:watch

# Terminal 2: Start Tauri (starts Vite on port 1420 via beforeDevCommand)
FRONTEND_PORT=1420 BACKEND_PORT=1421 cd src-tauri && cargo tauri dev
```

The Vite dev server handles `/api` proxying to the backend as before. In dev mode, the WebView loads from `devUrl` (Vite), so relative `/api/*` paths work via Vite proxy — no base URL needed.

### New package.json scripts

```json
{
  "tauri:dev": "FRONTEND_PORT=1420 BACKEND_PORT=1421 concurrently \"pnpm run backend:dev:watch\" \"cd src-tauri && cargo tauri dev\"",
  "tauri:build": "cd src-tauri && cargo tauri build"
}
```

## Production Build

```bash
pnpm run tauri:build
```

This:
1. Runs `beforeBuildCommand` → builds frontend to `frontend/dist/`
2. Compiles Tauri Rust code in release mode
3. Packages platform-specific installers

Output:
- Linux: `.deb`, `.rpm`, `.AppImage` in `src-tauri/target/release/bundle/`
- macOS: `.dmg` in `src-tauri/target/release/bundle/`
- Windows: `.msi`, `.exe` in `src-tauri/target/release/bundle/`

## Auto-Updater (Future Enhancement)

Configured via `tauri-plugin-updater` with GitHub Releases as the update source. Not implemented in the first iteration — requires code signing setup and a release workflow. Can be added later by:
1. Generating signing keys
2. Adding updater endpoints to `tauri.conf.json`
3. Setting up GitHub Actions with `tauri-apps/tauri-action`

## Change Summary

| Area | Files | Change |
|------|-------|--------|
| `src-tauri/` (new) | ~5 files | Tauri Core Process: config, main, lib, capabilities, build.rs |
| `frontend/src/lib/api.ts` | 1 file | Add `getApiBaseUrl()`, prepend to fetch calls (~10 lines) |
| `frontend/src/lib/e2ee/connection.ts` | 1 file | Configurable gateway URL (~5 lines) |
| `frontend/src/contexts/GatewayContext.tsx` | 1 file | Tauri-aware mode detection (~10 lines) |
| `frontend/src/components/dialogs/ConnectionSetupDialog.tsx` | 1 file (new) | Connection setup UI (~200 lines) |
| `frontend/src/types/tauri.d.ts` | 1 file (new) | `__TAURI__` type declaration (~5 lines) |
| `package.json` | 1 file | Add `tauri:dev`, `tauri:build` scripts (~3 lines) |

**Not changed:** Backend code, existing frontend components, browser mode behavior, existing build/CI pipeline.
