# Multi-Instance `--data-dir` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow running multiple vibe-board instances with isolated data directories via `--data-dir` CLI flag and `VIBE_BOARD_DATA_DIR` env var, with a file lock to prevent concurrent access.

**Architecture:** A `OnceLock<PathBuf>` global override in `utils::assets` is set once at startup. All existing `asset_dir()` call sites pick it up automatically with no signature changes. Port file moves from `/tmp/` into the data dir. A file lock on `{data_dir}/.lock` prevents double-starts.

**Tech Stack:** Rust, clap (derive), fs2 (file locking), OnceLock (std)

---

### Task 1: Add `fs2` dependency

**Files:**
- Modify: `crates/server/Cargo.toml:59` (after `dirs = "5.0"`)
- Modify: `crates/utils/Cargo.toml:36` (after `command-group`)

- [ ] **Step 1: Add `fs2` to server Cargo.toml**

```toml
fs2 = "0.4"
```

Add this line after the `dirs = "5.0"` line at the end of `[dependencies]` in `crates/server/Cargo.toml`.

- [ ] **Step 2: Verify the dependency resolves**

Run: `cargo check -p server`
Expected: PASS (no errors about missing `fs2`)

- [ ] **Step 3: Commit**

```bash
git add crates/server/Cargo.toml Cargo.lock
git commit -m "build: add fs2 dependency for file locking"
```

### Task 2: Add `set_data_dir()` to `crates/utils/src/assets.rs`

**Files:**
- Modify: `crates/utils/src/assets.rs`

- [ ] **Step 1: Add `OnceLock` and `set_data_dir` function**

At the top of `crates/utils/src/assets.rs`, add after the `const PROJECT_ROOT` line (line 4):

```rust
use std::sync::OnceLock;

static DATA_DIR_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();

/// Set a custom data directory. Must be called before any `asset_dir()` usage.
/// This is intended to be called once at startup from main().
pub fn set_data_dir(path: PathBuf) {
    let _ = DATA_DIR_OVERRIDE.set(path);
}
```

Also add `use std::path::PathBuf;` at the top if not already imported.

- [ ] **Step 2: Update `asset_dir()` to check the override**

Replace the existing `asset_dir()` function (lines 6-25) with:

```rust
pub fn asset_dir() -> std::path::PathBuf {
    if let Some(dir) = DATA_DIR_OVERRIDE.get() {
        if !dir.exists() {
            std::fs::create_dir_all(dir).expect("Failed to create data directory");
        }
        return dir.clone();
    }

    let path = if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        ProjectDirs::from("ai", "bloop", "vibe-board")
            .expect("OS didn't give us a home directory")
            .data_dir()
            .to_path_buf()
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
}
```

- [ ] **Step 3: Write a test for the override behavior**

Add at the bottom of `crates/utils/src/assets.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_dir_returns_default_when_no_override() {
        // Reset is not possible with OnceLock, so test shape only
        let dir = asset_dir();
        assert!(dir.is_absolute());
    }
}
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p utils`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/utils/src/assets.rs
git commit -m "feat(utils): add set_data_dir() with OnceLock override for asset_dir()"
```

### Task 3: Update `get_vibe_board_temp_dir()` in `crates/utils/src/path.rs`

**Files:**
- Modify: `crates/utils/src/path.rs:108-119`

- [ ] **Step 1: Update `get_vibe_board_temp_dir()` to use asset_dir when override is set**

Replace lines 108-119 with:

```rust
pub fn get_vibe_board_temp_dir() -> std::path::PathBuf {
    // If a custom data dir is set, use its worktrees subdirectory
    if crate::assets::DATA_DIR_OVERRIDE.get().is_some() {
        return crate::assets::asset_dir().join("worktrees");
    }

    let dir_name = if cfg!(debug_assertions) {
        "vibe-board-dev"
    } else {
        "vibe-board"
    };

    // All platforms: use home directory for persistent storage
    dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(format!(".{dir_name}"))
}
```

Note: We reference `crate::assets::DATA_DIR_OVERRIDE` which is `pub(crate)` visibility. We need to make it visible. See Step 2.

- [ ] **Step 2: Make `DATA_DIR_OVERRIDE` pub(crate) in assets.rs**

In `crates/utils/src/assets.rs`, change the visibility:

```rust
pub(crate) static DATA_DIR_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p utils`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/utils/src/path.rs crates/utils/src/assets.rs
git commit -m "feat(utils): use asset_dir/worktrees when data dir override is set"
```

### Task 4: Update port file to use data dir

**Files:**
- Modify: `crates/utils/src/port_file.rs`

- [ ] **Step 1: Rewrite `write_port_file` to use asset_dir**

Replace the full content of `crates/utils/src/port_file.rs`:

```rust
use std::path::PathBuf;

use tokio::fs;

pub async fn write_port_file(port: u16) -> std::io::Result<PathBuf> {
    let dir = crate::assets::asset_dir();
    let path = dir.join("vibe-board.port");
    tracing::debug!("Writing port {} to {:?}", port, path);
    fs::create_dir_all(&dir).await?;
    fs::write(&path, port.to_string()).await?;
    Ok(path)
}

pub async fn read_port_file(app_name: &str) -> std::io::Result<u16> {
    // Check if a custom data dir is set — read from there
    if let Some(data_dir) = crate::assets::DATA_DIR_OVERRIDE.get() {
        let path = data_dir.join("vibe-board.port");
        tracing::debug!("Reading port from {:?}", path);
        let content = fs::read_to_string(&path).await?;
        let port: u16 = content
            .trim()
            .parse()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        return Ok(port);
    }

    // Fallback: legacy /tmp path
    let dir = std::env::temp_dir().join(app_name);
    let path = dir.join(format!("{app_name}.port"));
    tracing::debug!("Reading port from {:?}", path);
    let content = fs::read_to_string(&path).await?;
    let port: u16 = content
        .trim()
        .parse()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(port)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p utils`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add crates/utils/src/port_file.rs
git commit -m "feat(utils): write port file to data dir, keep legacy fallback for read"
```

### Task 5: Add `--data-dir` flag and file lock to server main

**Files:**
- Modify: `crates/server/src/main.rs`

- [ ] **Step 1: Add `data_dir` field to `Cli` struct**

In `crates/server/src/main.rs`, add to the `Cli` struct (after line 24):

```rust
    /// Custom data directory path (or set VIBE_BOARD_DATA_DIR env var).
    /// Isolates DB, config, worktrees, and port file.
    #[arg(long, env = "VIBE_BOARD_DATA_DIR", global = true)]
    data_dir: Option<PathBuf>,
```

Add `use std::path::PathBuf;` to imports if needed.

- [ ] **Step 2: Add file lock helper**

Add a new function after the imports section:

```rust
use fs2::FileExt;

/// Acquire an exclusive file lock on the data directory.
/// Returns the file handle (holds lock until dropped).
fn acquire_instance_lock(data_dir: &std::path::Path) -> Result<std::fs::File, VibeBoardError> {
    let lock_path = data_dir.join(".lock");
    let file = std::fs::File::create(&lock_path)
        .map_err(|e| anyhow::anyhow!("Failed to create lock file {}: {}", lock_path.display(), e))?;
    file.try_lock_exclusive()
        .map_err(|_| anyhow::anyhow!(
            "Another vibe-board instance is already using data directory: {}\n\
             If you are sure no other instance is running, delete {}",
            data_dir.display(),
            lock_path.display()
        ))?;
    Ok(file)
}
```

- [ ] **Step 3: Wire up in `main()` and `cmd_server()`**

In the `main()` function, after `let cli = Cli::parse();` (line 64), add:

```rust
    if let Some(ref data_dir) = cli.data_dir {
        let data_dir = std::fs::canonicalize(data_dir)
            .unwrap_or_else(|_| data_dir.clone());
        utils::assets::set_data_dir(data_dir);
    }
```

In `cmd_server()`, after `if !asset_dir().exists()` block (line 111), add:

```rust
    let _lock_file = acquire_instance_lock(&asset_dir())?;
```

The `_lock_file` binding keeps the lock alive for the process lifetime.

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p server`
Expected: PASS

- [ ] **Step 5: Test manually**

Run: `cargo run -p server -- --data-dir /tmp/vibe-test-1`
Expected: Server starts, creates `/tmp/vibe-test-1/` with `db.sqlite`, `config.json`, `vibe-board.port`, `.lock`

In another terminal, run the same command:
Run: `cargo run -p server -- --data-dir /tmp/vibe-test-1`
Expected: Fails with "Another vibe-board instance is already using data directory"

- [ ] **Step 6: Commit**

```bash
git add crates/server/src/main.rs
git commit -m "feat(server): add --data-dir flag with file lock for multi-instance"
```

### Task 6: Update MCP server to respect data dir

**Files:**
- Modify: `crates/server/src/bin/mcp_task_server.rs`

- [ ] **Step 1: Add data dir init before port file read**

In `mcp_task_server.rs`, after line 30 (`tracing::debug!("[MCP] Starting MCP task server...")`), add:

```rust
                // Initialize data dir from env if set
                if let Ok(data_dir) = std::env::var("VIBE_BOARD_DATA_DIR") {
                    let path = std::path::PathBuf::from(data_dir);
                    utils::assets::set_data_dir(path);
                }
```

The existing `read_port_file("vibe-board")` call at line 54 will automatically pick up the data dir since we updated `port_file.rs` in Task 4.

- [ ] **Step 2: Verify compilation**

Run: `cargo check -p server`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add crates/server/src/bin/mcp_task_server.rs
git commit -m "feat(mcp): respect VIBE_BOARD_DATA_DIR for port file discovery"
```

### Task 7: Run full workspace checks

- [ ] **Step 1: Run cargo check on the workspace**

Run: `cargo check --workspace`
Expected: PASS

- [ ] **Step 2: Run existing tests**

Run: `cargo test --workspace`
Expected: PASS (all existing tests should still pass since defaults are unchanged)

- [ ] **Step 3: Clean up test directories**

Run: `rm -rf /tmp/vibe-test-1`
