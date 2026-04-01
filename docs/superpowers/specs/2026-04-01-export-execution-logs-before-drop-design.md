# Export execution_process_logs to JSONL Before Dropping Table

## Problem

The SQL migration `20260330000000_drop_execution_process_logs.sql` does `DROP TABLE IF EXISTS execution_process_logs` without exporting existing data. This causes all historical process logs to become inaccessible after upgrade. Production databases may have gigabytes of log data in this table.

## Goal

Export all `execution_process_logs` rows to per-execution JSONL files (with zstd compression) before dropping the table, preserving historical log access through the already-implemented file-based `raw_log_store` fallback paths.

## Design

### Overview

Add a Rust data migration in the `db` crate that runs after SQL migrations during `DBService::new()`. It streams data from `execution_process_logs` into compressed JSONL files, then drops the table only after all exports succeed.

### Data Flow

```
DBService::new()
  → run_migrations()          // SQL migrations (20260330 is now a no-op SELECT 1)
  → data_migrations::run()    // Rust data migrations
      → check if execution_process_logs table exists
      → if yes:
          → SELECT DISTINCT execution_id
          → for each execution_id:
              → skip if .jsonl or .jsonl.zst already exists (idempotent)
              → SELECT logs ORDER BY inserted_at
              → concatenate logs → zstd compress → write .jsonl.zst
          → if all succeeded: DROP TABLE execution_process_logs
          → if any failed: keep table, retry on next startup
```

### File Output

Files written to `asset_dir()/logs/` matching the existing `raw_log_store` conventions:

- Active path: `{asset_dir}/logs/{execution_id}.jsonl` (not used — we write compressed directly)
- Compressed path: `{asset_dir}/logs/{execution_id}.jsonl.zst` (final output)

Each `.jsonl.zst` file contains the concatenated `logs` column values from all rows for that `execution_id`, ordered by `inserted_at`. The `logs` column already contains JSONL-formatted text with newlines.

### Idempotency

- **Table doesn't exist** → skip entirely (already migrated or fresh DB)
- **File already exists for an execution_id** → skip that execution (already exported)
- **Partial run (some exported, some not)** → only exports missing ones, drops table only when all done

### Error Handling

- **Single execution export failure** (e.g., I/O error): log warning, skip it, increment `failed_count`
- **`failed_count > 0` at end**: do NOT drop table, return `Ok(())` — service starts normally
- **Next startup**: table still exists → retry. Already-exported files are skipped.
- **No data loss path**: table is only dropped after 100% successful export

### Service Availability

The data migration runs inside `DBService::new()`, before the HTTP server starts. The service is **unavailable** during migration. For large databases (6GB+) this could take minutes, so clear progress logging is critical to avoid the appearance of a hung process.

### Progress Logging

Log to stdout/stderr via `tracing` so the user sees progress in the terminal:

```
INFO  [data_migration] execution_process_logs: found 1523 executions to export
INFO  [data_migration] execution_process_logs: [127/1523] exported {short_uuid} (42 rows, 1.2 MB compressed)
INFO  [data_migration] execution_process_logs: [128/1523] skipped {short_uuid} (file already exists)
WARN  [data_migration] execution_process_logs: [129/1523] failed {short_uuid}: disk full
INFO  [data_migration] execution_process_logs: exported 1522/1523, 1 failed — table retained for retry
INFO  [data_migration] execution_process_logs: complete — dropped table, freed ~5.8 GB
```

- Print a summary every 50 executions (or every execution if <50 total) to avoid log spam on large DBs
- Include compressed file size in the per-execution message
- Include total freed space estimate (sum of `byte_size` column) in the final message

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `crates/db/src/data_migrations.rs` | Create | Rust data migration: export + drop |
| `crates/db/src/lib.rs` | Modify | Add `mod data_migrations;` and call after `run_migrations()` |
| `crates/db/migrations/20260330000000_drop_execution_process_logs.sql` | Modify | Change to no-op `SELECT 1;` |
| `crates/db/Cargo.toml` | Modify | Add `zstd = "0.13"`, `tokio` with `fs` feature |

## Key Implementation Details

### Schema (current, after 20251101 migration)

```sql
CREATE TABLE execution_process_logs (
    execution_id  BLOB NOT NULL,           -- UUID, multiple rows per execution
    logs          TEXT NOT NULL,            -- JSONL format, one LogMsg per line
    byte_size     INTEGER NOT NULL,
    inserted_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (execution_id) REFERENCES execution_processes(id) ON DELETE CASCADE
);
CREATE INDEX idx_execution_process_logs_execution_id_inserted_at
    ON execution_process_logs (execution_id, inserted_at);
```

### Streaming per-execution query

```rust
let rows: Vec<(String,)> = sqlx::query_as(
    "SELECT logs FROM execution_process_logs WHERE execution_id = ? ORDER BY inserted_at"
).bind(raw_id).fetch_all(pool).await?;
```

Each `logs` value already ends with `\n` (from `append_log_line`). Concatenate and compress.

### Compression

Use `zstd::Encoder` at level 3 on a `spawn_blocking` thread, same as `raw_log_store::compress_log_file`.

### Dependencies to add to `crates/db/Cargo.toml`

```toml
zstd = "0.13"
tokio = { workspace = true, features = ["fs", "rt"] }
```

## Verification

1. `cargo check --workspace` — compiles
2. Copy production DB via `sqlite3 prod.sqlite ".backup dev_assets/db.sqlite"`
3. `pnpm dev` — observe export logs
4. Check `dev_assets/logs/*.jsonl.zst` files exist and are readable
5. Verify table gone: `sqlite3 dev_assets/db.sqlite "SELECT name FROM sqlite_master WHERE name='execution_process_logs';"` → empty
6. Restart again — idempotent, no export logged
7. `cargo test --workspace` — passes
