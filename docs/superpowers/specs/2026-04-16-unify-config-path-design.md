# Unify Config/Data Path to ~/.vibe-board

## Problem

The app uses `directories::ProjectDirs::from("ai", "bloop", "vibe-board").data_dir()` which produces different paths per platform:

- Linux: `~/.local/share/vibe-board/`
- macOS: `~/Library/Application Support/ai.bloop.vibe-board/`
- Windows: `C:\Users\<User>\AppData\Roaming\bloop\vibe-board\data\`

This makes it hard for users to find their data and complicates documentation/support.

## Goal

All platforms use `~/.vibe-board/` as the data directory. Existing users get a one-time automatic migration from the old path.

## Design

### 1. Change `asset_dir()` (crates/utils/src/assets.rs)

Replace `ProjectDirs` with `dirs::home_dir().join(".vibe-board")` in release mode.

Unchanged:
- Debug mode: still uses `dev_assets/`
- `DATA_DIR_OVERRIDE` (`--data-dir` CLI flag): still takes priority
- `cache_dir()` in `lib.rs`: stays on `ProjectDirs::cache_dir()`

### 2. Add `migrate_from_legacy_dir()` (crates/utils/src/assets.rs)

Called once at startup, before any `asset_dir()` usage.

Logic:
1. Skip if debug mode or `DATA_DIR_OVERRIDE` is set
2. Compute old path via `ProjectDirs::from("ai", "bloop", "vibe-board").data_dir()`
3. Compute new path: `~/.vibe-board`
4. If old exists AND new does not exist: `fs::rename(old, new)`
   - If rename fails (cross-filesystem): fallback to recursive copy, then log warning
5. Otherwise: no-op, log only

### 3. Call migration at startup

- `crates/server/src/main.rs`: call after `set_data_dir()`, before `cmd_server()`
- `crates/server/src/bin/mcp_task_server.rs`: call after `set_data_dir()` block

## Files to Modify

1. `crates/utils/src/assets.rs` — change `asset_dir()`, add `migrate_from_legacy_dir()` + `copy_dir_recursive()`
2. `crates/server/src/main.rs` — call `migrate_from_legacy_dir()` at startup
3. `crates/server/src/bin/mcp_task_server.rs` — call `migrate_from_legacy_dir()` at startup

## Out of Scope

- `cache_dir()` in `crates/utils/src/lib.rs` (stays on `ProjectDirs::cache_dir()`)
- `get_vibe_board_temp_dir()` in `crates/utils/src/path.rs` (already uses `~/.vibe-board`)
- Debug mode paths

## Verification

1. `cargo test --workspace` passes
2. `pnpm run backend:check` passes
3. Manual: release build places data in `~/.vibe-board/`
4. Manual: with old-path data present and no `~/.vibe-board/`, startup migrates automatically
