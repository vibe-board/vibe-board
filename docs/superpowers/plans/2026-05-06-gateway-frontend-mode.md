# e2ee-gateway frontend-mode fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm run build:npx` ship a working `e2ee-gateway` binary by (A) building a dedicated gateway-mode frontend bundle before compiling the gateway binary and (B) making the gateway return `404` instead of SPA-fallback for `api/`/`ws/` paths and unmatched asset paths.

**Architecture:** Two surgical changes. (1) `local-build.sh` gains a second frontend build pass with `VITE_APP_MODE=gateway` that happens **after** the local-direct pass and **before** the `cargo build --release --bin e2ee-gateway` step — ordering matters because `rust-embed` snapshots `frontend/dist` at Rust compile time. (2) `crates/e2ee-gateway/src/routes/frontend.rs` gains a small pure classifier `should_404_when_missing(path: &str) -> bool` that decides whether an unmatched path should 404 or fall back to `index.html`. The existing hot paths (real files via `GatewayAssets::get`) are unchanged.

**Tech Stack:** Bash (`local-build.sh`), Rust + axum (`e2ee-gateway` routes), playwright + `ws` for manual verification.

**Spec:** `docs/superpowers/specs/2026-05-06-gateway-frontend-mode-design.md`

---

## File Structure

- `crates/e2ee-gateway/src/routes/frontend.rs`: Modify `serve_file` to call a new pure classifier before falling back to `index.html`. Add `#[cfg(test)] mod tests` with unit tests for the classifier (mirroring the `cli_registry.rs` pattern).
- `local-build.sh`: Insert a second `VITE_APP_MODE=gateway` frontend build + `cargo build --release --bin e2ee-gateway` pass.

No new files. No changes to `crates/e2ee-gateway/src/main.rs` (the router already sends `/{*path}` to `serve_frontend`).

---

## Task 1: Add failing tests for path classifier

**Files:**
- Modify: `crates/e2ee-gateway/src/routes/frontend.rs` (append `#[cfg(test)] mod tests`)

- [ ] **Step 1: Write the failing test module**

Append this block to the end of `crates/e2ee-gateway/src/routes/frontend.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_paths_should_404_when_missing() {
        assert!(should_404_when_missing("api/config/info"));
        assert!(should_404_when_missing("api/"));
        assert!(should_404_when_missing("api/projects/stream/ws"));
    }

    #[test]
    fn ws_paths_should_404_when_missing() {
        assert!(should_404_when_missing("ws/webui"));
        assert!(should_404_when_missing("ws/daemon"));
    }

    #[test]
    fn asset_looking_paths_should_404_when_missing() {
        // Any path with a file extension — these are asset requests,
        // not SPA routes. Returning index.html with text/html would
        // break script/image/stylesheet loading.
        assert!(should_404_when_missing("assets/index-abc.js"));
        assert!(should_404_when_missing("favicon.svg"));
        assert!(should_404_when_missing("site.webmanifest"));
    }

    #[test]
    fn spa_routes_should_fall_back() {
        // Client-side React Router paths. No extension, not api/ws.
        assert!(!should_404_when_missing(""));
        assert!(!should_404_when_missing("local-projects/abc/tasks"));
        assert!(!should_404_when_missing("settings/general"));
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail with "function not defined"**

Run: `cargo test -p e2ee-gateway --lib routes::frontend::tests -- --nocapture`

Expected: compile error — `cannot find function 'should_404_when_missing' in this scope`.

---

## Task 2: Implement `should_404_when_missing` classifier

**Files:**
- Modify: `crates/e2ee-gateway/src/routes/frontend.rs`

- [ ] **Step 1: Add the classifier function above `serve_file`**

Insert this function between the `GatewayAssets` struct definition and `serve_frontend` in `crates/e2ee-gateway/src/routes/frontend.rs`:

```rust
/// Decide whether an unmatched path should return 404 or fall back to
/// `index.html`. Returns `true` (→ 404) when the path is clearly not a
/// SPA client-side route: API/WebSocket namespaces, or anything that
/// looks like a static asset (has a file extension). Returns `false`
/// (→ serve index.html) for genuine React Router paths.
///
/// The expected input is the stripped path (no leading `/`), matching
/// what `serve_frontend` passes to `serve_file`.
fn should_404_when_missing(path: &str) -> bool {
    path.starts_with("api/") || path.starts_with("ws/") || path.contains('.')
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cargo test -p e2ee-gateway --lib routes::frontend::tests -- --nocapture`

Expected: `4 passed; 0 failed`.

- [ ] **Step 3: Commit**

```bash
git add crates/e2ee-gateway/src/routes/frontend.rs
git commit -m "test(e2ee-gateway): add classifier for SPA fallback vs 404"
```

---

## Task 3: Use classifier in `serve_file`

**Files:**
- Modify: `crates/e2ee-gateway/src/routes/frontend.rs` (`serve_file` function body)

- [ ] **Step 1: Replace the `None` branch of `serve_file`**

In `crates/e2ee-gateway/src/routes/frontend.rs`, find this block (currently lines ~37–51):

```rust
        None => {
            // For SPA routing, serve index.html for unknown routes
            if let Some(index) = GatewayAssets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .body(Body::from(index.data.into_owned()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap()
            }
        }
```

Replace with:

```rust
        None => {
            // For API/WS namespaces and asset-looking paths, 404 instead of
            // SPA fallback. Otherwise fall back to index.html for React Router.
            if should_404_when_missing(path) {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap();
            }

            if let Some(index) = GatewayAssets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .body(Body::from(index.data.into_owned()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap()
            }
        }
```

- [ ] **Step 2: Rebuild and confirm it compiles**

Run: `cargo build -p e2ee-gateway --release --bin e2ee-gateway`

Expected: `Finished release profile`.

- [ ] **Step 3: Re-run unit tests**

Run: `cargo test -p e2ee-gateway --lib routes::frontend -- --nocapture`

Expected: still 4 passed.

- [ ] **Step 4: Smoke-test the live behavior**

Kill any leftover gateway, start a fresh one, probe it, then clean up.

```bash
pkill -9 -f e2ee-gateway 2>/dev/null || true
rm -f gateway.db*
GATEWAY_DATABASE_URL="sqlite:gateway.db?mode=rwc" ./target/release/e2ee-gateway > /tmp/gw.log 2>&1 &
sleep 3

echo "=== api/config/info (should be 404) ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9090/api/config/info

echo "=== favicon.svg that doesn't exist (should be 404) ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9090/does-not-exist.png

echo "=== /local-projects/abc (SPA route — should serve text/html 200) ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9090/local-projects/abc

echo "=== / (root — still works) ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9090/

pkill -9 -f e2ee-gateway 2>/dev/null || true
rm -f gateway.db*
```

Expected output:
```
=== api/config/info (should be 404) ===
http=404 ct=
=== favicon.svg that doesn't exist (should be 404) ===
http=404 ct=
=== /local-projects/abc (SPA route — should serve text/html 200) ===
http=200 ct=text/html
=== / (root — still works) ===
http=200 ct=text/html
```

- [ ] **Step 5: Commit**

```bash
git add crates/e2ee-gateway/src/routes/frontend.rs
git commit -m "fix(e2ee-gateway): 404 on api/ws paths instead of SPA fallback

Unknown paths that look like API calls (api/*), WebSocket upgrades
(ws/*), or static assets (anything with a file extension) now return
404 instead of index.html. This prevents a broken LocalConnection in a
mis-packaged bundle from seeing 200 OK + HTML on /api/config/info and
thinking the server is reachable."
```

---

## Task 4: Fix `local-build.sh` to build gateway with its own frontend bundle

**Files:**
- Modify: `local-build.sh:49-55`

- [ ] **Step 1: Replace the single frontend build + single cargo sweep with a two-stage sequence**

In `local-build.sh`, find this block (currently lines 49–55):

```bash
echo "🔨 Building frontend..."
(cd frontend && VITE_APP_MODE=local-direct npm run build)

echo "🔨 Building Rust binaries..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml
cargo build --release --bin e2ee-gateway --manifest-path Cargo.toml
```

Replace with:

```bash
echo "🔨 Building frontend (local-direct mode, for server/mcp binaries)..."
(cd frontend && VITE_APP_MODE=local-direct npm run build)

echo "🔨 Building Rust binaries that embed the local-direct frontend..."
cargo build --release --manifest-path Cargo.toml
cargo build --release --bin mcp_task_server --manifest-path Cargo.toml

echo "🔨 Rebuilding frontend (gateway mode, for e2ee-gateway binary)..."
(cd frontend && VITE_APP_MODE=gateway npm run build)

echo "🔨 Building e2ee-gateway with the gateway-mode frontend..."
cargo build --release --bin e2ee-gateway --manifest-path Cargo.toml
```

- [ ] **Step 2: Run the full build end-to-end**

Run: `bash ./local-build.sh`

Expected: finishes without error, prints `✅ Build complete!`, and creates the four zip files under `npx-cli/dist/<PLATFORM>/`.

- [ ] **Step 3: Verify the gateway binary embeds gateway-mode frontend**

Extract the frontend `index.html` from the gateway zip and inspect the bundled JS to confirm it does **not** contain `LocalDirectShell`-only markers.

```bash
PLATFORM_DIR=$(ls npx-cli/dist/ | head -1)
unzip -p "npx-cli/dist/$PLATFORM_DIR/vibe-board-gateway.zip" vibe-board-gateway > /tmp/vbg
chmod +x /tmp/vbg

# Start it against a throwaway DB on a spare port
pkill -9 -f vbg 2>/dev/null || true
rm -f /tmp/gw-verify.db
GATEWAY_PORT=9091 GATEWAY_DATABASE_URL="sqlite:/tmp/gw-verify.db?mode=rwc" /tmp/vbg > /tmp/gw-verify.log 2>&1 &
sleep 3

echo "=== / returns HTML ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9091/

echo "=== bundle JS contains no 'Local Server' label (local-direct marker) ==="
BUNDLE=$(curl -s http://localhost:9091/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle: $BUNDLE"
curl -s "http://localhost:9091$BUNDLE" | grep -c "Local Server" || echo "0 (expected)"

echo "=== bundle JS contains 'E2EE Gateway' label (gateway marker) ==="
curl -s "http://localhost:9091$BUNDLE" | grep -c "E2EE Gateway" || echo "expected at least 1"

pkill -9 -f vbg 2>/dev/null || true
rm -f /tmp/gw-verify.db /tmp/vbg
```

Expected:
```
=== / returns HTML ===
http=200 ct=text/html
=== bundle JS contains no 'Local Server' label (local-direct marker) ===
bundle: /assets/index-XXXX.js
0 (expected)
=== bundle JS contains 'E2EE Gateway' label (gateway marker) ===
1
```

- [ ] **Step 4: Commit**

```bash
git add local-build.sh
git commit -m "build: compile e2ee-gateway with gateway-mode frontend

local-build.sh previously built the frontend once with
VITE_APP_MODE=local-direct and embedded the same dist into every Rust
binary. That shipped a local-direct frontend inside the e2ee-gateway
binary, which auto-tried /api/config/info on the gateway and then
broke with 'Unexpected response code: 200' on later WS handshakes.

Now: build local-direct dist, compile server + mcp_task_server;
rebuild dist with VITE_APP_MODE=gateway; compile e2ee-gateway."
```

---

## Task 5: End-to-end verification via npx-cli entry point

**Files:** none modified, verification only.

- [ ] **Step 1: Run the packaged gateway via the npx-cli path users actually hit**

```bash
pkill -9 -f e2ee-gateway 2>/dev/null || true
pkill -9 -f vibe-board-gateway 2>/dev/null || true
rm -f ~/.cache/vibe-board/*gateway* 2>/dev/null
rm -f gateway.db*

cd npx-cli
GATEWAY_PORT=9092 GATEWAY_DATABASE_URL="sqlite:/tmp/gw-e2e.db?mode=rwc" node bin/cli.js gateway > /tmp/gw-e2e.log 2>&1 &
sleep 5
cd ..
```

- [ ] **Step 2: Probe the live gateway**

```bash
echo "=== /: should be 200 text/html ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9092/

echo "=== /api/config/info: should be 404 (not HTML fallback) ==="
curl -s -o /dev/null -w "http=%{http_code}\n" http://localhost:9092/api/config/info

echo "=== /api/auth/registration-status: should be 200 JSON ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9092/api/auth/registration-status
```

Expected:
```
=== /: should be 200 text/html ===
http=200 ct=text/html
=== /api/config/info: should be 404 (not HTML fallback) ===
http=404
=== /api/auth/registration-status: should be 200 JSON ===
http=200 ct=application/json
```

- [ ] **Step 3: Browser-level verification with playwright**

Reuse the playwright harness already set up at `/tmp/wsproject`. If it isn't there, skip — manual browser check is fine — otherwise run:

```bash
cd /tmp/wsproject && \
sed -i 's|http://localhost:9090|http://localhost:9092|g' browser_test.mjs && \
sed -i 's|ws-test@test.com|e2e@test.com|g' browser_test.mjs && \
node browser_test.mjs 2>&1 | head -60
```

Expected (among the output):
```
--- BODY TEXT (first 500) ---
Home
Connections
+ Add

No connections configured. Click "+ Add" to get started.

...

--- FINAL WS EVENTS ---
WS OPEN: ws://localhost:9092/ws/webui?token=...
WS RECV: {"type":"auth_ok","user_id":"..."}
WS RECV: {"type":"machines","machines":[]}
```

- [ ] **Step 4: Cleanup**

```bash
pkill -9 -f vibe-board-gateway 2>/dev/null || true
pkill -9 -f e2ee-gateway 2>/dev/null || true
rm -f /tmp/gw-e2e.db /tmp/gw-e2e.log
```

- [ ] **Step 5: Verify the default local-server path still works (regression check)**

```bash
pkill -9 -f "vibe-board" 2>/dev/null || true
cd npx-cli
# Run vibe-board (no args) — this is the local server path
FRONTEND_PORT=9093 BACKEND_PORT=9094 node bin/cli.js > /tmp/vb-e2e.log 2>&1 &
sleep 6
cd ..

echo "=== /api/config/info should return JSON (server has this route) ==="
curl -s -o /dev/null -w "http=%{http_code} ct=%{content_type}\n" http://localhost:9094/api/config/info

pkill -9 -f "vibe-board" 2>/dev/null || true
rm -f /tmp/vb-e2e.log
```

Expected:
```
=== /api/config/info should return JSON (server has this route) ===
http=200 ct=application/json
```

No code change in this task — it is purely a regression guard. If this fails, something in Task 4 broke the local-direct packaging.

---

## Rollback

If any step in Task 4 breaks release packaging, revert just that commit: `git revert HEAD`. The Rust-side changes from Tasks 1–3 are safe on their own (unknown `/api/*` returning 404 instead of HTML is strictly better).
