# Fix SQLite "database is locked" Errors

## Problem

The application frequently triggers SQLite `(code: 5) database is locked` errors, especially after deleting a task. Root causes:

1. **DELETE journal mode** (`crates/db/src/lib.rs:83,119`) — locks the entire database file during writes, blocking all other connections including readers.
2. **No `busy_timeout`** — defaults to 0ms; any lock contention returns an error immediately instead of retrying.
3. **High-frequency unbatched INSERTs** — `execution_process_logs` inserts one row per stdout/stderr line in a hot loop (`container.rs:1087-1108`), producing dozens to hundreds of write transactions per second per active execution.
4. **Task deletion amplifies contention** — `delete_task` holds a transaction while FK CASCADE deletes across multiple tables, triggering preupdate/update hooks that spawn async queries competing for the same locked database.
5. **Unconstrained connection pool** — `SqlitePoolOptions::new()` with no `max_connections`, letting too many connections queue up behind the single SQLite writer.

## Design

Three independent changes that together eliminate the problem.

### 1. SQLite Configuration Fix

**File:** `crates/db/src/lib.rs` (both `new()` and `create_pool()`)

Changes:
- `journal_mode`: `Delete` → `Wal` — WAL mode allows concurrent readers alongside a single writer. Readers never block writers and writers never block readers.
- Add `.busy_timeout(Duration::from_secs(5))` — instead of failing immediately on SQLITE_BUSY, wait up to 5 seconds for the lock to clear.
- Add `.max_connections(4)` to `SqlitePoolOptions` — SQLite is fundamentally single-writer; limiting connections reduces queue depth and prevents the pool from amplifying contention.

### 2. Remove `execution_process_logs` from the Database

The `execution_process_logs` table is the single largest source of write contention. It stores raw stdout/stderr as JSONL, inserted one line at a time in a streaming hot loop. All its read paths are fallbacks for when the in-memory `MsgStore` is unavailable (i.e., after process restart).

**Two independent data paths replace it:**

#### 2a. Normalized entries (DB, unchanged)

- The existing `normalized_entries` batch insert pipeline is unchanged.
- `stream_normalized_logs()` fallback: rewrite to load from the `normalized_entries` table via `NormalizedEntry::find_by_execution_id_cursor`. Each row's `entry_json` is a serialized `NormalizedEntry` struct; wrap it in a `ConversationPatch::replace` at the row's `entry_index` and emit as `LogMsg::JsonPatch`. This eliminates the current pattern of loading raw logs from `execution_process_logs` and re-running the normalization pipeline.

#### 2b. Raw logs (filesystem)

- `spawn_stream_raw_logs_to_db()` → rename to `spawn_stream_raw_logs_to_file()`.
- Write to `{asset_dir}/logs/{execution_id}.jsonl`, append-only. File I/O does not contend with SQLite.
- `stream_raw_logs()` fallback: when `MsgStore` is not in memory, read from the `.jsonl` (or `.jsonl.zst` if compressed) file.
- The hot-path (in-memory `MsgStore` → WebSocket) is unchanged.

#### 2c. Cleanup

- Drop the `execution_process_logs` table via a new SQLx migration.
- Delete the `ExecutionProcessLogs` model (`crates/db/src/models/execution_process_logs.rs`) and all imports.
- Move startup error log writes (`container.rs:1458,1481`) to write as `NormalizedEntry` inserts instead. These code paths already create normalized patches in the same block.

#### Data flow after changes

```
Executor stdout/stderr
    |
    +---> MsgStore (in-memory, hot path) ---> WebSocket real-time push
    |
    +---> {asset_dir}/logs/{id}.jsonl (file, append-only)
    |       \---> stream_raw_logs() fallback (cold path, read from file)
    |
    \---> Normalize pipeline ---> NormalizedEntry batch INSERT (DB)
            \---> stream_normalized_logs() fallback (cold path, read from DB)
```

### 3. Log File Compression & Archive

#### Compression

- **When:** After execution finishes (on `LogMsg::Finished`), compress the `.jsonl` file to `.jsonl.zst` using zstd.
- **Why zstd:** High compression ratio, fast streaming decompression, mature Rust crate (`zstd`).
- Active executions write plain `.jsonl` (no compression overhead during streaming writes).

#### Reading compressed files

- `stream_raw_logs()` fallback detects the file extension:
  - `.jsonl` → read directly
  - `.jsonl.zst` → stream-decompress via `zstd::Decoder`, then read lines
- No need to load the entire file into memory.

#### Archive/Cleanup

- When a workspace is archived or deleted, delete corresponding log files from `{asset_dir}/logs/`.
- Integrate into the existing `cleanup_orphan_workspaces` and workspace deletion paths.

#### File structure

```
{asset_dir}/
  logs/
    {execution_id}.jsonl       # active execution, append-only
    {execution_id}.jsonl.zst   # finished execution, compressed
```

#### New dependency

- `zstd` crate added to `crates/services/Cargo.toml`.

## Consumers Affected

| Consumer | Current source | After change |
|----------|---------------|--------------|
| `stream_raw_logs()` hot path | MsgStore (in-memory) | MsgStore (unchanged) |
| `stream_raw_logs()` fallback | `execution_process_logs` table | `.jsonl` / `.jsonl.zst` file |
| `stream_normalized_logs()` hot path | MsgStore (in-memory) | MsgStore (unchanged) |
| `stream_normalized_logs()` fallback | `execution_process_logs` → re-normalize | `normalized_entries` table (direct) |
| `useLogStream` (frontend) | `/raw-logs/ws` endpoint | No change (backend-only) |
| `useConversationHistory` (frontend) | `/normalized-logs/ws` endpoint | No change (backend-only) |
| Startup error logging | `ExecutionProcessLogs::append_log_line` | `NormalizedEntry::insert_batch` |

## Files Changed

- `crates/db/src/lib.rs` — WAL mode, busy_timeout, max_connections
- `crates/db/src/models/execution_process_logs.rs` — Delete entirely
- `crates/db/src/models/mod.rs` — Remove execution_process_logs module
- `crates/db/migrations/YYYYMMDD_drop_execution_process_logs.sql` — New migration
- `crates/services/src/services/container.rs` — Rewrite log streaming, raw log file I/O, compression, cleanup
- `crates/services/Cargo.toml` — Add `zstd` dependency
- `crates/local-deployment/src/container.rs` — Add log file cleanup to workspace archive/delete paths

## Testing

- Verify WAL mode is active after migration (`PRAGMA journal_mode` returns `wal`).
- Run concurrent execution + task deletion to confirm no `database is locked` errors.
- Verify raw log files are created during execution and compressed after finish.
- Verify `stream_raw_logs()` fallback reads from `.jsonl.zst` correctly after restart.
- Verify `stream_normalized_logs()` fallback loads from `normalized_entries` table.
- Verify workspace deletion cleans up log files.
