# Fix SQLite "database is locked" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate SQLite "database is locked" errors by switching to WAL mode, moving raw log writes from SQLite to the filesystem, and adding zstd compression for finished logs.

**Architecture:** Three independent changes: (1) SQLite config fix (WAL + busy_timeout + pool limit), (2) replace `execution_process_logs` table with filesystem JSONL files for raw logs and direct `normalized_entries` reads for the normalized fallback, (3) zstd compression of finished log files.

**Tech Stack:** Rust (sqlx, tokio, zstd), SQLite WAL mode

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `crates/db/src/lib.rs` | Modify | WAL mode, busy_timeout, max_connections |
| `crates/db/src/models/mod.rs` | Modify | Remove `execution_process_logs` module |
| `crates/db/src/models/execution_process_logs.rs` | Delete | No longer needed |
| `crates/db/migrations/20260330000000_drop_execution_process_logs.sql` | Create | Drop table migration |
| `crates/services/Cargo.toml` | Modify | Add `zstd` dependency |
| `crates/services/src/services/raw_log_store.rs` | Create | File-based raw log read/write/compress |
| `crates/services/src/services/mod.rs` | Modify | Add `raw_log_store` module |
| `crates/services/src/services/container.rs` | Modify | Replace DB log writes with file writes, rewrite fallbacks |
| `crates/local-deployment/src/container.rs` | Modify | Add log file cleanup on execution finish, compress after finish |
| `crates/server/src/routes/tasks.rs` | Modify | Add log file cleanup on task deletion |

---

### Task 1: SQLite Configuration — WAL mode, busy_timeout, max_connections

**Files:**
- Modify: `crates/db/src/lib.rs:76-87` (the `new()` method)
- Modify: `crates/db/src/lib.rs:103-138` (the `create_pool()` method)

- [ ] **Step 1: Update `new()` to use WAL mode and busy_timeout**

In `crates/db/src/lib.rs`, change the `new()` method (lines 76-87):

```rust
pub async fn new() -> Result<DBService, Error> {
    let database_url = format!(
        "sqlite://{}",
        asset_dir().join("db.sqlite").to_string_lossy()
    );
    let options = SqliteConnectOptions::from_str(&database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    run_migrations(&pool).await?;
    Ok(DBService { pool })
}
```

Changes from original:
- `SqliteJournalMode::Delete` → `SqliteJournalMode::Wal`
- Added `.busy_timeout(std::time::Duration::from_secs(5))`
- `SqlitePool::connect_with(options)` → `SqlitePoolOptions::new().max_connections(4).connect_with(options)`

- [ ] **Step 2: Update `create_pool()` to use WAL mode, busy_timeout, and max_connections**

In the same file, change `create_pool()` (lines 113-134):

```rust
async fn create_pool<F>(after_connect: Option<Arc<F>>) -> Result<Pool<Sqlite>, Error>
where
    F: for<'a> Fn(
            &'a mut SqliteConnection,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<(), Error>> + Send + 'a>,
        > + Send
        + Sync
        + 'static,
{
    let database_url = format!(
        "sqlite://{}",
        asset_dir().join("db.sqlite").to_string_lossy()
    );
    let options = SqliteConnectOptions::from_str(&database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let mut pool_options = SqlitePoolOptions::new().max_connections(4);

    if let Some(hook) = after_connect {
        pool_options = pool_options.after_connect(move |conn, _meta| {
            let hook = hook.clone();
            Box::pin(async move {
                hook(conn).await?;
                Ok(())
            })
        });
    }

    let pool = pool_options.connect_with(options).await?;
    run_migrations(&pool).await?;
    Ok(pool)
}
```

Changes: same WAL + busy_timeout + max_connections. Also refactored to avoid the if/else duplication — both branches now go through the same `pool_options`.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p db`
Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/lib.rs
git commit -m "fix(db): switch SQLite to WAL mode with busy_timeout and connection limit"
```

---

### Task 2: Create `raw_log_store` module for file-based raw log I/O

**Files:**
- Create: `crates/services/src/services/raw_log_store.rs`
- Modify: `crates/services/src/services/mod.rs`
- Modify: `crates/services/Cargo.toml`

- [ ] **Step 1: Add `zstd` dependency to services crate**

In `crates/services/Cargo.toml`, add to `[dependencies]`:

```toml
zstd = "0.13"
```

- [ ] **Step 2: Add module declaration**

In `crates/services/src/services/mod.rs`, add:

```rust
pub mod raw_log_store;
```

- [ ] **Step 3: Create `raw_log_store.rs`**

Create `crates/services/src/services/raw_log_store.rs`:

```rust
use std::path::{Path, PathBuf};

use tokio::io::AsyncWriteExt;
use utils::assets::asset_dir;
use uuid::Uuid;

/// Directory where raw execution logs are stored as JSONL files.
fn logs_dir() -> PathBuf {
    asset_dir().join("logs")
}

/// Path to the active (uncompressed) log file for an execution.
fn log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl", execution_id))
}

/// Path to the compressed log file for a finished execution.
fn compressed_log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl.zst", execution_id))
}

/// Ensure the logs directory exists.
pub async fn ensure_logs_dir() -> std::io::Result<()> {
    tokio::fs::create_dir_all(logs_dir()).await
}

/// Append a JSONL line to the raw log file for an execution.
pub async fn append_log_line(execution_id: Uuid, line: &str) -> std::io::Result<()> {
    let path = log_path(execution_id);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await?;
    file.write_all(line.as_bytes()).await?;
    Ok(())
}

/// Compress the raw log file with zstd after execution finishes.
/// Deletes the uncompressed file on success.
pub async fn compress_log_file(execution_id: Uuid) -> std::io::Result<()> {
    let src = log_path(execution_id);
    if !src.exists() {
        return Ok(());
    }
    let dst = compressed_log_path(execution_id);

    // Run blocking zstd compression on a dedicated thread
    let result = tokio::task::spawn_blocking(move || {
        let input = std::fs::File::open(&src)?;
        let output = std::fs::File::create(&dst)?;
        let mut encoder = zstd::Encoder::new(output, 3)?; // level 3 = good balance
        std::io::copy(&mut std::io::BufReader::new(input), &mut encoder)?;
        encoder.finish()?;
        std::fs::remove_file(&src)?;
        Ok::<_, std::io::Error>(())
    })
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    result
}

/// Read all JSONL lines from the log file (compressed or plain).
/// Returns None if no log file exists for this execution.
pub async fn read_log_lines(execution_id: Uuid) -> Option<Vec<String>> {
    let compressed = compressed_log_path(execution_id);
    let plain = log_path(execution_id);

    if compressed.exists() {
        read_compressed_lines(&compressed).await.ok()
    } else if plain.exists() {
        read_plain_lines(&plain).await.ok()
    } else {
        None
    }
}

async fn read_plain_lines(path: &Path) -> std::io::Result<Vec<String>> {
    let content = tokio::fs::read_to_string(path).await?;
    Ok(content.lines().filter(|l| !l.is_empty()).map(String::from).collect())
}

async fn read_compressed_lines(path: &Path) -> std::io::Result<Vec<String>> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        use std::io::BufRead;
        let file = std::fs::File::open(&path)?;
        let decoder = zstd::Decoder::new(file)?;
        let reader = std::io::BufReader::new(decoder);
        let lines: Vec<String> = reader
            .lines()
            .filter_map(|l| l.ok())
            .filter(|l| !l.is_empty())
            .collect();
        Ok(lines)
    })
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
}

/// Delete log files (both compressed and plain) for a list of execution IDs.
pub async fn delete_log_files(execution_ids: &[Uuid]) {
    for id in execution_ids {
        let plain = log_path(*id);
        let compressed = compressed_log_path(*id);
        if plain.exists() {
            let _ = tokio::fs::remove_file(&plain).await;
        }
        if compressed.exists() {
            let _ = tokio::fs::remove_file(&compressed).await;
        }
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add crates/services/Cargo.toml crates/services/src/services/raw_log_store.rs crates/services/src/services/mod.rs
git commit -m "feat(services): add raw_log_store module for file-based log I/O with zstd"
```

---

### Task 3: Replace `spawn_stream_raw_logs_to_db` with file-based writes

**Files:**
- Modify: `crates/services/src/services/container.rs:1-57` (imports)
- Modify: `crates/services/src/services/container.rs:1066-1197` (`spawn_stream_raw_logs_to_db`)

- [ ] **Step 1: Update imports in container.rs**

In `crates/services/src/services/container.rs`, remove the `execution_process_logs` import (line 17):

```rust
// REMOVE this line:
execution_process_logs::ExecutionProcessLogs,
```

Add import for the new module (near the other `crate::services` imports around line 59):

```rust
use crate::services::raw_log_store;
```

- [ ] **Step 2: Rename `spawn_stream_raw_logs_to_db` to `spawn_stream_raw_logs_to_file` and rewrite**

Replace the method body at lines 1066-1197. The structure stays the same but raw log writes go to file instead of DB:

```rust
fn spawn_stream_raw_logs_to_file(&self, execution_id: &Uuid) -> JoinHandle<()> {
    let execution_id = *execution_id;
    let msg_stores = self.msg_stores().clone();
    let db = self.db().clone();

    tokio::spawn(async move {
        if let Err(e) = raw_log_store::ensure_logs_dir().await {
            tracing::error!("Failed to create logs directory: {}", e);
            return;
        }

        // Get the message store for this execution
        let store = {
            let map = msg_stores.read().await;
            map.get(&execution_id).cloned()
        };

        if let Some(store) = store {
            let mut stream = store.history_plus_stream();
            let mut pending_entries: HashMap<i64, String> = HashMap::new();
            const FLUSH_THRESHOLD: usize = 10;

            while let Some(Ok(msg)) = stream.next().await {
                match &msg {
                    LogMsg::Stdout(_) | LogMsg::Stderr(_) => {
                        match serde_json::to_string(&msg) {
                            Ok(jsonl_line) => {
                                let jsonl_line_with_newline = format!("{jsonl_line}\n");
                                if let Err(e) = raw_log_store::append_log_line(
                                    execution_id,
                                    &jsonl_line_with_newline,
                                )
                                .await
                                {
                                    tracing::error!(
                                        "Failed to append log line for execution {}: {}",
                                        execution_id,
                                        e
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::error!(
                                    "Failed to serialize log message for execution {}: {}",
                                    execution_id,
                                    e
                                );
                            }
                        }
                    }
                    LogMsg::JsonPatch(patch) => {
                        if let Some((index, entry)) = extract_normalized_entry_from_patch(patch)
                            && let Ok(json) = serde_json::to_string(&entry)
                        {
                            pending_entries.insert(index as i64, json);
                        }
                        if pending_entries.len() >= FLUSH_THRESHOLD {
                            let batch: Vec<(i64, String)> = pending_entries.drain().collect();
                            if let Err(e) =
                                DbNormalizedEntry::insert_batch(&db.pool, execution_id, &batch)
                                    .await
                            {
                                tracing::error!(
                                    "Failed to persist normalized entries for execution {}: {}",
                                    execution_id,
                                    e
                                );
                            }
                        }
                    }
                    LogMsg::SessionId(agent_session_id) => {
                        if let Err(e) = CodingAgentTurn::update_agent_session_id(
                            &db.pool,
                            execution_id,
                            agent_session_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update agent_session_id {} for execution process {}: {}",
                                agent_session_id,
                                execution_id,
                                e
                            );
                        }
                    }
                    LogMsg::MessageId(agent_message_id) => {
                        if let Err(e) = CodingAgentTurn::update_agent_message_id(
                            &db.pool,
                            execution_id,
                            agent_message_id,
                        )
                        .await
                        {
                            tracing::error!(
                                "Failed to update agent_message_id {} for execution process {}: {}",
                                agent_message_id,
                                execution_id,
                                e
                            );
                        }
                    }
                    LogMsg::Finished => {
                        break;
                    }
                    LogMsg::Ready => continue,
                }
            }

            // Flush any remaining normalized entries
            if !pending_entries.is_empty() {
                let batch: Vec<(i64, String)> = pending_entries.drain().collect();
                if let Err(e) =
                    DbNormalizedEntry::insert_batch(&db.pool, execution_id, &batch).await
                {
                    tracing::error!(
                        "Failed to flush remaining normalized entries for execution {}: {}",
                        execution_id,
                        e
                    );
                }
            }

            // Compress the log file now that execution is finished
            if let Err(e) = raw_log_store::compress_log_file(execution_id).await {
                tracing::error!(
                    "Failed to compress log file for execution {}: {}",
                    execution_id,
                    e
                );
            }
        }
    })
}
```

Key changes from original:
- `ExecutionProcessLogs::append_log_line(&db.pool, ...)` → `raw_log_store::append_log_line(execution_id, ...)`
- Added `raw_log_store::ensure_logs_dir()` at the top
- Added `raw_log_store::compress_log_file(execution_id)` after the streaming loop ends
- Removed the `db` dependency for raw log writes (still used for normalized entries and agent turn updates)

- [ ] **Step 3: Update the call site**

At line 1532, change:

```rust
// Before:
let db_stream_handle = self.spawn_stream_raw_logs_to_db(&execution_process.id);
// After:
let db_stream_handle = self.spawn_stream_raw_logs_to_file(&execution_process.id);
```

- [ ] **Step 4: Update startup error log writes (lines 1455-1488)**

Replace the two `ExecutionProcessLogs::append_log_line` calls at lines 1458 and 1481 with file-based writes. These happen when execution fails to start and need to record the error.

At line 1455-1464, change:

```rust
// Emit stderr error message to log file
let log_message = LogMsg::Stderr(format!("Failed to start execution: {start_error}"));
if let Ok(json_line) = serde_json::to_string(&log_message) {
    let _ = raw_log_store::append_log_line(
        execution_process.id,
        &format!("{json_line}\n"),
    )
    .await;
}
```

At line 1480-1487, change:

```rust
let patch = ConversationPatch::add_normalized_entry(2, error_message);
if let Ok(json_line) = serde_json::to_string::<LogMsg>(&LogMsg::JsonPatch(patch)) {
    let _ = raw_log_store::append_log_line(
        execution_process.id,
        &format!("{json_line}\n"),
    )
    .await;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles. There will be an unused import warning for `ExecutionProcessLogs` which we'll clean up in the next task once we confirm these are the only usages.

- [ ] **Step 6: Commit**

```bash
git add crates/services/src/services/container.rs
git commit -m "feat(services): replace DB log writes with file-based raw_log_store"
```

---

### Task 4: Rewrite `stream_raw_logs()` fallback to read from file

**Files:**
- Modify: `crates/services/src/services/container.rs:794-842` (`stream_raw_logs`)

- [ ] **Step 1: Rewrite `stream_raw_logs()` fallback**

Replace lines 811-842 (the `else` branch) with file-based reading:

```rust
async fn stream_raw_logs(
    &self,
    id: &Uuid,
) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
    if let Some(store) = self.get_msg_store_by_id(id).await {
        // First try in-memory store
        return Some(
            store
                .history_plus_stream()
                .filter(|msg| {
                    future::ready(matches!(
                        msg,
                        Ok(LogMsg::Stdout(..) | LogMsg::Stderr(..) | LogMsg::Finished)
                    ))
                })
                .boxed(),
        );
    }

    // Fallback: load from log file
    let lines = raw_log_store::read_log_lines(*id).await?;

    let messages: Vec<LogMsg> = lines
        .iter()
        .filter_map(|line| serde_json::from_str::<LogMsg>(line).ok())
        .filter(|m| matches!(m, LogMsg::Stdout(_) | LogMsg::Stderr(_)))
        .collect();

    let stream = futures::stream::iter(
        messages
            .into_iter()
            .chain(std::iter::once(LogMsg::Finished))
            .map(Ok::<_, std::io::Error>),
    )
    .boxed();

    Some(stream)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/services/src/services/container.rs
git commit -m "feat(services): rewrite stream_raw_logs fallback to read from log files"
```

---

### Task 5: Rewrite `stream_normalized_logs()` fallback to use `normalized_entries` table

**Files:**
- Modify: `crates/services/src/services/container.rs:845-1029` (`stream_normalized_logs`)

- [ ] **Step 1: Rewrite `stream_normalized_logs()` fallback**

The current fallback (lines 860-1028) loads raw logs from `execution_process_logs`, re-creates a temp MsgStore, and re-runs the normalization pipeline. Replace the entire `else` branch with a direct read from `normalized_entries`:

```rust
async fn stream_normalized_logs(
    &self,
    id: &Uuid,
) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
    // First try in-memory store (existing behavior)
    if let Some(store) = self.get_msg_store_by_id(id).await {
        return Some(
            store
                .history_plus_stream()
                .filter(|msg| future::ready(matches!(msg, Ok(LogMsg::JsonPatch(..)))))
                .chain(futures::stream::once(async {
                    Ok::<_, std::io::Error>(LogMsg::Finished)
                }))
                .boxed(),
        );
    }

    // Fallback: load from normalized_entries table directly
    let pool = self.db().pool.clone();
    let execution_id = *id;

    // Check if entries exist
    let exists = DbNormalizedEntry::exists_for_execution_id(&pool, execution_id)
        .await
        .ok()?;
    if !exists {
        return None;
    }

    // Load all entries and convert to JsonPatch messages
    let total = DbNormalizedEntry::count_by_execution_id(&pool, execution_id)
        .await
        .ok()?;

    let paginated = DbNormalizedEntry::find_by_execution_id_paginated(
        &pool,
        execution_id,
        0,
        total,
    )
    .await
    .ok()?;

    let patches: Vec<LogMsg> = paginated
        .entries
        .into_iter()
        .filter_map(|entry| {
            let normalized: NormalizedEntry =
                serde_json::from_str(&entry.entry_json).ok()?;
            let patch = ConversationPatch::add_normalized_entry(
                entry.entry_index as usize,
                normalized,
            );
            Some(LogMsg::JsonPatch(patch))
        })
        .collect();

    let stream = futures::stream::iter(
        patches
            .into_iter()
            .chain(std::iter::once(LogMsg::Finished))
            .map(Ok::<_, std::io::Error>),
    )
    .boxed();

    Some(stream)
}
```

This eliminates the complex temp-MsgStore + re-normalization path. The normalized entries are already in the DB, so we just read them and wrap in patches.

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p services`
Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/services/src/services/container.rs
git commit -m "feat(services): rewrite stream_normalized_logs fallback to read from normalized_entries"
```

---

### Task 6: Remove `execution_process_logs` table and model

**Files:**
- Create: `crates/db/migrations/20260330000000_drop_execution_process_logs.sql`
- Delete: `crates/db/src/models/execution_process_logs.rs`
- Modify: `crates/db/src/models/mod.rs`
- Modify: `crates/services/src/services/container.rs` (clean up remaining import)

- [ ] **Step 1: Create the drop table migration**

Create `crates/db/migrations/20260330000000_drop_execution_process_logs.sql`:

```sql
DROP TABLE IF EXISTS execution_process_logs;
```

- [ ] **Step 2: Remove the model module declaration**

In `crates/db/src/models/mod.rs`, remove line 3:

```rust
// REMOVE this line:
pub mod execution_process_logs;
```

- [ ] **Step 3: Delete the model file**

Delete `crates/db/src/models/execution_process_logs.rs`.

- [ ] **Step 4: Clean up any remaining imports in container.rs**

Verify there are no remaining references to `ExecutionProcessLogs` in `crates/services/src/services/container.rs`. The import was removed in Task 3 Step 1 and the usages were replaced in Task 3 Steps 2-4.

Run: `grep -rn "ExecutionProcessLogs\|execution_process_logs" crates/`
Expected: only hits in migration files and `.sqlx/` cache files, no Rust source references.

- [ ] **Step 5: Remove stale sqlx cache entries**

The `.sqlx/` directory contains cached query metadata. Remove the stale entries for the dropped table:

```bash
rm -f crates/db/.sqlx/query-9747ebaebd562d65f0c333b0f5efc74fa63ab9fcb35a43f75f57da3fcb9a2588.json
rm -f crates/db/.sqlx/query-a1574f21db387b0e4a2c3f5723de6df4ee42d98145d16e9d135345dd60128429.json
```

- [ ] **Step 6: Verify it compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors.

- [ ] **Step 7: Regenerate sqlx offline data**

Run: `pnpm run prepare-db`
Expected: offline sqlx metadata is regenerated without the dropped table queries.

- [ ] **Step 8: Commit**

```bash
git add -A crates/db/
git commit -m "refactor(db): drop execution_process_logs table and model"
```

---

### Task 7: Add log file cleanup on task deletion and workspace cleanup

**Files:**
- Modify: `crates/server/src/routes/tasks.rs:322-411` (`delete_task`)
- Modify: `crates/local-deployment/src/container.rs:184-224` (`cleanup_workspace`)

- [ ] **Step 1: Add log file cleanup to `delete_task`**

In `crates/server/src/routes/tasks.rs`, the `delete_task` function already gathers workspace data and spawns a background cleanup task. Before the DB transaction (which will CASCADE-delete execution_processes), we need to collect execution IDs. After the transaction commits, delete the log files.

Add an import at the top of the file:

```rust
use services::services::raw_log_store;
```

Before line 354 (`let mut tx = pool.begin().await?`), add:

```rust
// Collect execution process IDs for log file cleanup
let mut execution_ids: Vec<Uuid> = Vec::new();
for workspace in &attempts {
    if let Ok(sessions) = Session::find_by_workspace_id(pool, workspace.id).await {
        for session in &sessions {
            if let Ok(processes) =
                ExecutionProcess::find_by_session_id(pool, session.id).await
            {
                execution_ids.extend(processes.iter().map(|p| p.id));
            }
        }
    }
}
```

Inside the existing background cleanup `tokio::spawn` block (after line 397, inside the spawn), add log file cleanup:

```rust
// Clean up raw log files
raw_log_store::delete_log_files(&execution_ids).await;
```

Note: Check the existing imports in the file — `Session` and `ExecutionProcess` may already be imported. If not, add them.

- [ ] **Step 2: Add log file cleanup to local-deployment workspace cleanup**

In `crates/local-deployment/src/container.rs`, the `cleanup_workspace` function (lines 184-224) handles workspace cleanup. This path is used by `cleanup_expired_workspaces`.

Add an import:

```rust
use services::services::raw_log_store;
```

Before clearing `container_ref` at line 223, add log file cleanup. We need execution IDs from the workspace's sessions:

```rust
// Clean up raw log files for all execution processes in this workspace
if let Ok(sessions) = Session::find_by_workspace_id(&db.pool, workspace.id).await {
    let mut execution_ids: Vec<Uuid> = Vec::new();
    for session in &sessions {
        if let Ok(processes) =
            ExecutionProcess::find_by_session_id(&db.pool, session.id).await
        {
            execution_ids.extend(processes.iter().map(|p| p.id));
        }
    }
    raw_log_store::delete_log_files(&execution_ids).await;
}
```

Note: Verify that `Session` and `ExecutionProcess` are imported. Check existing imports and add if needed.

- [ ] **Step 3: Verify it compiles**

Run: `cargo check --workspace`
Expected: compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/tasks.rs crates/local-deployment/src/container.rs
git commit -m "feat: clean up raw log files on task deletion and workspace cleanup"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full workspace build check**

Run: `cargo check --workspace`
Expected: no errors.

- [ ] **Step 2: Run tests**

Run: `cargo test --workspace`
Expected: all existing tests pass.

- [ ] **Step 3: Grep for any remaining references to ExecutionProcessLogs**

Run: `grep -rn "ExecutionProcessLogs\|execution_process_logs" crates/ --include="*.rs"`
Expected: no hits in Rust source files.

- [ ] **Step 4: Grep for any remaining references to spawn_stream_raw_logs_to_db**

Run: `grep -rn "spawn_stream_raw_logs_to_db" crates/ --include="*.rs"`
Expected: no hits.

- [ ] **Step 5: Verify frontend type generation still works**

Run: `pnpm run generate-types:check`
Expected: passes (no type changes since this is backend-only).
