# Unify Config Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app's data directory from platform-specific paths to `~/.vibe-board` on all platforms, with automatic one-time migration from the old location.

**Architecture:** Replace `directories::ProjectDirs::data_dir()` in `asset_dir()` with `dirs::home_dir().join(".vibe-board")`. Add a `migrate_from_legacy_dir()` function that renames the old directory to the new location if applicable. Call it at startup before any `asset_dir()` usage.

**Tech Stack:** Rust, `dirs` crate (already a dependency), `directories` crate (kept for computing legacy path during migration)

---

### Task 1: Change `asset_dir()` to use `~/.vibe-board`

**Files:**
- Modify: `crates/utils/src/assets.rs:16-42`

- [ ] **Step 1: Update `asset_dir()` release-mode path**

In `crates/utils/src/assets.rs`, replace the `ProjectDirs` block with `dirs::home_dir()`:

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
        dirs::home_dir()
            .expect("Failed to determine home directory")
            .join(".vibe-board")
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test --workspace`
Expected: All existing tests pass. The `asset_dir_returns_default_when_no_override` test still passes because it only checks `is_absolute()`.

- [ ] **Step 3: Commit**

```bash
git add crates/utils/src/assets.rs
git commit -m "feat(config): change asset_dir to use ~/.vibe-board on all platforms"
```

### Task 2: Add migration function and call at startup

**Files:**
- Modify: `crates/utils/src/assets.rs` (add `migrate_from_legacy_dir` + `copy_dir_recursive`)
- Modify: `crates/server/src/main.rs:87-93`
- Modify: `crates/server/src/bin/mcp_task_server.rs:34-37`

- [ ] **Step 1: Add `copy_dir_recursive` helper in `assets.rs`**

Add at the bottom of `crates/utils/src/assets.rs` (before `#[cfg(test)]`):

```rust
/// Recursively copy a directory and its contents.
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
```

- [ ] **Step 2: Add `migrate_from_legacy_dir` in `assets.rs`**

Add right after `copy_dir_recursive`:

```rust
/// Migrate data from legacy platform-specific directory to ~/.vibe-board.
/// Called once at startup before any `asset_dir()` usage.
///
/// Old paths (from `directories::ProjectDirs`):
///   - Linux:   ~/.local/share/vibe-board/
///   - macOS:   ~/Library/Application Support/ai.bloop.vibe-board/
///   - Windows: C:\Users\<User>\AppData\Roaming\bloop\vibe-board\data\
///
/// Migration only runs when old path exists AND new path does not.
pub fn migrate_from_legacy_dir() {
    if cfg!(debug_assertions) {
        return;
    }
    if DATA_DIR_OVERRIDE.get().is_some() {
        return;
    }

    let Some(home) = dirs::home_dir() else {
        return;
    };
    let new_dir = home.join(".vibe-board");

    let old_dir = ProjectDirs::from("ai", "bloop", "vibe-board")
        .map(|p| p.data_dir().to_path_buf());
    let Some(old_dir) = old_dir else {
        return;
    };

    if old_dir == new_dir {
        return;
    }

    if !old_dir.exists() || new_dir.exists() {
        return;
    }

    tracing::info!(
        "Migrating data directory: {} -> {}",
        old_dir.display(),
        new_dir.display()
    );

    match std::fs::rename(&old_dir, &new_dir) {
        Ok(()) => {
            tracing::info!("Migration complete (rename)");
        }
        Err(e) => {
            tracing::warn!(
                "rename failed ({}), falling back to recursive copy",
                e
            );
            match copy_dir_recursive(&old_dir, &new_dir) {
                Ok(()) => {
                    tracing::info!("Migration complete (copy)");
                }
                Err(copy_err) => {
                    tracing::error!(
                        "Failed to copy data directory: {}. Will use new empty directory.",
                        copy_err
                    );
                }
            }
        }
    }
}
```

- [ ] **Step 3: Call `migrate_from_legacy_dir()` in `main.rs`**

In `crates/server/src/main.rs`, add the call right after the `set_data_dir` block (line 93) and before the `match cli.command` (line 95):

```rust
    if let Some(ref data_dir) = cli.data_dir {
        let data_dir = std::fs::canonicalize(data_dir).unwrap_or_else(|_| data_dir.clone());
        utils::assets::set_data_dir(data_dir);
    }

    utils::assets::migrate_from_legacy_dir();

    match cli.command {
```

- [ ] **Step 4: Call `migrate_from_legacy_dir()` in `mcp_task_server.rs`**

In `crates/server/src/bin/mcp_task_server.rs`, add after the `set_data_dir` block (line 37):

```rust
            // Initialize data dir from env if set
            if let Ok(data_dir) = std::env::var("VIBE_BOARD_DATA_DIR") {
                let path = std::path::PathBuf::from(data_dir);
                utils::assets::set_data_dir(path);
            }

            utils::assets::migrate_from_legacy_dir();
```

- [ ] **Step 5: Run tests and type check**

Run: `cargo test --workspace`
Expected: All tests pass.

Run: `cargo check --workspace`
Expected: No compile errors.

- [ ] **Step 6: Commit**

```bash
git add crates/utils/src/assets.rs crates/server/src/main.rs crates/server/src/bin/mcp_task_server.rs
git commit -m "feat(config): add legacy data directory migration to ~/.vibe-board"
```
