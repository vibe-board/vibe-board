# e2ee-gateway frontend-mode fix

## Problem

Since commit `8adebaed4` introduced `VITE_APP_MODE` to split the frontend into
`local-direct` and `gateway` bundles, the e2ee-gateway binary distributed via
`pnpm pack` / `npx vibe-board gateway` has shipped the **wrong** frontend
bundle. Users see a broken UI with WebSocket handshake errors instead of the
gateway login screen.

## Root cause

`local-build.sh` (the packaging script used by `build:npx` / `prepack`) builds
the frontend **once** with `VITE_APP_MODE=local-direct`, then compiles every
Rust binary — including `e2ee-gateway` — against that same `frontend/dist`.

`e2ee-gateway` uses `rust-embed` with `#[folder = "../../frontend/dist"]` to
embed the frontend at compile time. So the gateway binary ends up with a
`local-direct`-mode bundle. When a user opens it:

1. `TabShell` sees `isLocalDirect === true` → renders `LocalDirectShell`.
2. `LocalConnection.connect()` calls `GET /api/config/info`.
3. The gateway has no such route; its SPA catch-all returns `200 OK` with
   `index.html`.
4. `resp.ok` is true, so `LocalConnection` sets `status = 'connected'`.
5. `<App />` mounts and opens a WebSocket to e.g.
   `ws://host/api/projects/stream/ws`. The same catch-all replies with `200 OK`
   HTML on the upgrade request. Browser raises:
   `Error during WebSocket handshake: Unexpected response code: 200`.

Reproduced locally with playwright against both `VITE_APP_MODE=gateway` (works)
and `VITE_APP_MODE=local-direct` (fails with the symptom above).

## Fix

Two changes, both needed. (A) fixes the root cause; (B) hardens the gateway so
this class of failure can't silently pass as "connected" again.

### A. Build gateway with its own frontend bundle

Update `local-build.sh` so the `e2ee-gateway` binary is compiled against a
frontend bundle built with `VITE_APP_MODE=gateway`, while `server` and
`mcp_task_server` continue to use the `local-direct` bundle.

Ordering matters because `rust-embed` snapshots `frontend/dist` at Rust
compile time:

```bash
# 1) Build local-direct frontend, then the local binaries that embed it
(cd frontend && VITE_APP_MODE=local-direct pnpm run build)
cargo build --release --bin server
cargo build --release --bin mcp_task_server

# 2) Rebuild the frontend in gateway mode, then the gateway binary
(cd frontend && VITE_APP_MODE=gateway pnpm run build)
cargo build --release --bin e2ee-gateway
```

Leave the rest of the script (zip/rename/dist layout) unchanged.

### B. Gateway must not serve SPA fallback on API/WS paths

Update `crates/e2ee-gateway/src/routes/frontend.rs` so `serve_frontend` only
falls back to `index.html` for genuine client-side SPA routes. Rules:

1. If `GatewayAssets::get(path)` returns a file, serve it (unchanged).
2. Otherwise, if the path starts with `api/` or `ws/`, return `404`.
3. Otherwise, if the path contains a `.` (file extension present), return
   `404`. This covers misspelled asset requests like `/assets/foo.js` that
   would otherwise serve HTML with the wrong Content-Type.
4. Otherwise, fall back to `index.html` (SPA client-side route).

This means:
- `GET /api/config/info` on the gateway binary → `404` (so any embedded
  local-direct frontend fails fast at `LocalConnection.connect()`).
- `GET /ws/anything` on the gateway binary → `404` (so misbehaving clients
  get a clear error instead of a `200 OK` HTML body during a WS handshake).
- Legitimate SPA routes like `/local-projects/abc/tasks` still return
  `index.html`.
- Real static files (`/assets/index-xxx.js`, `/favicon-vk-light.svg`, etc.)
  served unchanged from `GatewayAssets`.

## Out of scope

- The architectural concern that `NiceModal.Provider` is only mounted inside
  `<App />` (commits `8f9c73325` + `8d5ca9f9f`). In gateway mode, `HomeTab` and
  `MachineProjectsTab` render outside `<App />` and therefore outside
  `NiceModal.Provider`. Today they don't call `NiceModal.show(...)`, so this is
  latent, not active. Track separately if a later change needs a modal there.
- Renaming or deduplicating the two `VITE_APP_MODE` build entrypoints
  (`gateway:build` vs `local-build.sh`). Out of scope for this fix.

## Verification

1. `pnpm run build:npx` (runs `local-build.sh`).
2. `cd npx-cli && node bin/cli.js gateway` → opens gateway binary.
3. Browser at the gateway URL shows `HomeTab` with "Connections" heading, not
   `LocalDirectShell`'s "Connecting to local server..." spinner.
4. Add a gateway connection, sign up / log in. Browser devtools Network panel
   shows `ws://.../ws/webui?token=...` upgrading with `101 Switching
   Protocols` and receiving `auth_ok` + `machines` frames.
5. `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9090/api/config/info`
   on the running gateway returns `404`, not `200`.
6. `cd npx-cli && node bin/cli.js` (the default local-server mode) still works
   — server binary still boots, `/api/config/info` returns JSON, the
   `LocalDirectShell` UI loads.
