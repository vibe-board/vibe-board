# Multi-Instance Support: `--data-dir` Flag

## Problem

Running multiple vibe-board instances on the same machine causes data corruption. All instances share:
- SQLite database (`asset_dir()/db.sqlite`)
- Config and credentials (`asset_dir()/config.json`, `credentials.json`)
- Port file (`/tmp/vibe-board/vibe-board.port`)
- Worktree base directory (`~/.vibe-board/worktrees/`)

There is no lock to prevent concurrent instances from writing to the same data.

## Goal

Allow a single user to run multiple isolated vibe-board instances, each with its own data directory (DB, config, gateway, worktrees). Provide a file lock to prevent accidental concurrent access to the same data directory.

## Interface

### CLI flag

```
vibe-board --data-dir /path/to/instance1
vibe-board --data-dir /path/to/instance2
```

### Environment variable (fallback)

```
VIBE_BOARD_DATA_DIR=/path/to/instance1 vibe-board
```

CLI flag takes precedence over environment variable. When neither is specified, behavior is unchanged (OS default data directory).

### Lock

If another process is already using the same data directory, startup fails immediately with an error message. The lock is automatically released when the process exits (fd close).

## Design

### 1. Global data dir override (`crates/utils/src/assets.rs`)

Add a `OnceLock<PathBuf>` to store the override. Provide a setter called once at startup. `asset_dir()` checks the lock first, then falls back to the existing OS-specific logic.

```rust
static DATA_DIR_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();

pub fn set_data_dir(path: PathBuf) {
    let _ = DATA_DIR_OVERRIDE.set(path);
}

pub fn asset_dir() -> PathBuf {
    if let Some(dir) = DATA_DIR_OVERRIDE.get() {
        if !dir.exists() {
            std::fs::create_dir_all(dir).expect("Failed to create data directory");
        }
        return dir.clone();
    }
    // existing logic unchanged
}
```

All existing call sites (`config_path()`, `credentials_path()`, `DBService::new()`, etc.) continue to call `asset_dir()` with no signature changes.

### 2. Worktree base dir (`crates/utils/src/path.rs`)

`get_vibe_board_temp_dir()` changes to use `asset_dir().join("worktrees")` when a data dir override is set, falling back to `~/.vibe-board` otherwise. The `WorktreeManager::WORKSPACE_DIR_OVERRIDE` mechanism stays as-is (config-level override still works).

### 3. Port file (`crates/utils/src/port_file.rs`)

`write_port_file` writes to `asset_dir().join("vibe-board.port")` instead of `/tmp/vibe-board/vibe-board.port`. `read_port_file` signature changes to accept a data dir path (or `None` for default).

MCP server (`mcp_task_server.rs`) needs to know which data dir to read the port file from. Options:
- Accept `--data-dir` flag on the MCP binary too
- Or check `VIBE_BOARD_DATA_DIR` env var

### 4. CLI argument (`crates/server/src/main.rs`)

Add to the `Cli` struct:

```rust
#[arg(long, env = "VIBE_BOARD_DATA_DIR", global = true)]
data_dir: Option<PathBuf>,
```

In `cmd_server()` and other subcommands, call `set_data_dir()` before any other initialization if `data_dir` is provided.

### 5. File lock (`crates/server/src/main.rs`)

After `asset_dir()` is resolved, acquire an exclusive lock on `asset_dir().join(".lock")` using `fs2::FileExt::try_lock_exclusive()`. If locking fails, bail with a clear error. The lock file handle is held for the lifetime of the process (dropped on exit).

Dependency: add `fs2` to `crates/server/Cargo.toml`.

## Files to modify

| File | Change |
|---|---|
| `crates/utils/src/assets.rs` | Add `OnceLock`, `set_data_dir()`, update `asset_dir()` |
| `crates/utils/src/path.rs` | Update `get_vibe_board_temp_dir()` to respect data dir |
| `crates/utils/src/port_file.rs` | Write/read port file under data dir |
| `crates/server/src/main.rs` | Add `--data-dir` flag, call `set_data_dir()`, acquire lock |
| `crates/server/src/bin/mcp_task_server.rs` | Update port file reading to respect data dir |
| `crates/server/Cargo.toml` | Add `fs2` dependency |

## Backward compatibility

- No signature changes to `asset_dir()`, `config_path()`, `credentials_path()`, etc.
- Without `--data-dir` or `VIBE_BOARD_DATA_DIR`, all paths are identical to current behavior.
- Existing `workspace_dir` config field for worktree override continues to work (takes precedence over data dir's worktrees subdirectory).

## Not in scope

- Instance management commands (list, create, delete instances)
- UI for switching instances
- Shared worktree directory across instances
