# Version Code with Commit SHA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [`) syntax for tracking.

**Goal:** Embed commit SHA into version strings at compile time for both frontend and backend.

**Architecture:** Each build pipeline (Cargo for Rust, Vite for frontend) independently calls `git rev-parse --short=7 HEAD` at build time and injects the SHA into version constants. A new `APP_VERSION_WITH_SHA` constant is added alongside the existing `APP_VERSION` in Rust. Frontend's `__APP_VERSION__` is extended to include SHA. All existing consumers of `APP_VERSION` remain unchanged.

**Tech Stack:** Rust build.rs, cargo:rustc-env, Vite define, TypeScript

---

### Task 1: Rust build.rs — inject GIT_COMMIT_HASH

**Files:**
- Modify: `crates/server/build.rs`
- Create: `crates/e2ee-gateway/build.rs`

`crates/e2ee-gateway` currently has no `build.rs`. Both crates need the same git SHA injection logic.

- [ ] **Step 1: Add git SHA injection to server build.rs**

In `crates/server/build.rs`, add the following block after line 4 (after `dotenv::dotenv().ok();`):

```rust
// Inject git commit hash for version display
let git_hash = std::process::Command::new("git")
    .args(["rev-parse", "--short=7", "HEAD"])
    .output()
    .ok()
    .filter(|o| o.status.success())
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .unwrap_or_else(|| "unknown".to_string());
println!("cargo:rustc-env=GIT_COMMIT_HASH={git_hash}");
```

- [ ] **Step 2: Create e2ee-gateway build.rs**

Create `crates/e2ee-gateway/build.rs` with the same git SHA injection logic:

```rust
fn main() {
    let git_hash = std::process::Command::new("git")
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=GIT_COMMIT_HASH={git_hash}");
}
```

- [ ] **Step 3: Verify build.rs compiles**

Run: `cargo check -p server -p e2ee-gateway`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add crates/server/build.rs crates/e2ee-gateway/build.rs
git commit -m "feat(build): inject GIT_COMMIT_HASH via build.rs"
```

---

### Task 2: Rust utils — add APP_VERSION_WITH_SHA

**Files:**
- Modify: `crates/utils/src/version.rs`

- [ ] **Step 1: Add APP_VERSION_WITH_SHA constant**

Append to `crates/utils/src/version.rs`:

```rust
/// The current application version with git commit SHA (e.g. "0.1.9-main.5+abc1234")
pub const APP_VERSION_WITH_SHA: &str =
    concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH"));
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p utils`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add crates/utils/src/version.rs
git commit -m "feat(utils): add APP_VERSION_WITH_SHA constant"
```

---

### Task 3: Rust — update consumer endpoints and logs

**Files:**
- Modify: `crates/server/src/routes/health.rs`
- Modify: `crates/server/src/bin/mcp_task_server.rs:30-31`
- Modify: `crates/e2ee-gateway/src/routes/health.rs:14`
- Modify: `crates/e2ee-gateway/src/routes/mod.rs:10`

- [ ] **Step 1: Update server health endpoint**

In `crates/server/src/routes/health.rs`, change the response to include version:

```rust
use axum::response::Json;
use utils::response::ApiResponse;
use utils::version::APP_VERSION_WITH_SHA;

pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(APP_VERSION_WITH_SHA.to_string()))
}
```

- [ ] **Step 2: Update MCP server startup log**

In `crates/server/src/bin/mcp_task_server.rs`, change line 30 from:
```rust
let version = env!("CARGO_PKG_VERSION");
```
to:
```rust
let version = utils::version::APP_VERSION_WITH_SHA;
```

- [ ] **Step 3: Update e2ee-gateway health endpoint**

In `crates/e2ee-gateway/src/routes/health.rs`, change line 14 from:
```rust
version: env!("CARGO_PKG_VERSION").to_string(),
```
to:
```rust
version: concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH")).to_string(),
```

Note: e2ee-gateway does not depend on the `utils` crate, so we use `concat!` directly instead of importing `APP_VERSION_WITH_SHA`. This keeps the dependency graph unchanged.

- [ ] **Step 4: Update e2ee-gateway gateway_info**

In `crates/e2ee-gateway/src/routes/mod.rs`, change line 10 from:
```rust
"version": env!("CARGO_PKG_VERSION"),
```
to:
```rust
"version": concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH")),
```

- [ ] **Step 5: Verify everything compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 6: Run tests**

Run: `cargo test --workspace`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add crates/server/src/routes/health.rs crates/server/src/bin/mcp_task_server.rs \
        crates/e2ee-gateway/src/routes/health.rs crates/e2ee-gateway/src/routes/mod.rs
git commit -m "feat: expose version with SHA in health endpoints and startup logs"
```

---

### Task 4: Frontend — inject SHA in vite.config.ts

**Files:**
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Add git SHA to __APP_VERSION__**

In `frontend/vite.config.ts`, add the `execSync` import and update the `define` block.

Add at the top of the file (after existing imports):
```ts
import { execSync } from 'child_process';
```

Replace line 83:
```ts
__APP_VERSION__: JSON.stringify(pkg.version),
```
with:
```ts
__APP_VERSION__: JSON.stringify(
  `${pkg.version}+${
    execSync('git rev-parse --short=7 HEAD', { encoding: 'utf-8' }).trim() || 'unknown'
  }`,
),
```

- [ ] **Step 2: Verify frontend type-checks**

Run: `pnpm run check`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "feat(frontend): inject commit SHA into __APP_VERSION__"
```

---

### Task 5: Frontend — About card in GeneralSettings

**Files:**
- Modify: `frontend/src/pages/settings/GeneralSettings.tsx:980-981`

- [ ] **Step 1: Add About card**

Insert after the Safety Card's closing `</Card>` (after line 980) and before the sticky save button (`{/* Sticky Save Button */}` on line 982):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.about.title', 'About')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vibe Kanban {__APP_VERSION__}
          </p>
        </CardContent>
      </Card>
```

Note: `Card`, `CardHeader`, `CardTitle`, `CardContent` are already imported in this file. `__APP_VERSION__` is a global from Vite's `define`.

- [ ] **Step 2: Verify frontend type-checks**

Run: `pnpm run check`
Expected: SUCCESS

- [ ] **Step 3: Verify lint passes**

Run: `pnpm run lint`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/GeneralSettings.tsx
git commit -m "feat(frontend): add About card showing version in settings"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full type-check**

Run: `pnpm run check && cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 2: Full test suite**

Run: `cargo test --workspace`
Expected: PASS

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: SUCCESS
