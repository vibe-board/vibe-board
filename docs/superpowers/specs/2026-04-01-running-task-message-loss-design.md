# Fix: Running task messages lost on task switch

## Problem

When a running task is streaming messages, switching to another task and back shows only the last ~50 entries. Earlier entries are lost.

**Root cause**: `loadRunningAndEmit` fetches the last 50 normalized entries via REST (from DB), then connects a live WS (`live_stream()`, no history replay). Two problems:

1. REST reads from DB, but `spawn_stream_raw_logs_to_file` batch-flushes every 10 entries — unflushed entries are missed.
2. `live_stream()` only returns future messages — entries already in memory but not yet flushed create a gap.
3. Only 50 entries loaded, and running processes are excluded from `loadMore` pagination.

**Introduced by**: The frontend REST+live WS hybrid approach for running tasks, combined with commit `0fc0bc294` which changed DB storage to file-based logs.

## Design

### Core idea

Running tasks should serve normalized entries from a dedicated in-memory store, not from DB. After process exit + persistence, the store is cleaned up and clients fall back to REST from DB.

### Data flow

```
executor stdout/stderr
    │
    ├──→ MsgStore (raw logs, unchanged)
    │       │
    │       └──→ normalizer ──→ JsonPatch ──→ MsgStore
    │
    └──→ disk (JSONL file, unchanged)

spawn_stream_raw_logs_to_file consumes MsgStore:
    ├── Stdout/Stderr → disk (unchanged)
    └── JsonPatch → extract_normalized_entry
                        │
                        ├──→ NormalizedEntryStore.push/replace  [NEW]
                        └──→ batch flush → DB normalized_entries (unchanged)

Frontend consumption:
    ├── Running task:  WS → NormalizedEntryStore (full replay + live)
    ├── Running task scroll-up:  REST → DB (pagination for older flushed entries)
    └── Completed task:  REST → DB (unchanged)
```

### New: `NormalizedEntryStore`

Per-process in-memory store for normalized entries, independent of `MsgStore`.

Location: `crates/utils/src/normalized_entry_store.rs`

```rust
pub struct NormalizedEntryStore {
    entries: RwLock<Vec<(usize, NormalizedEntry)>>,  // (index, entry)
    sender: broadcast::Sender<(usize, NormalizedEntry)>,
}
```

Key properties:
- **No eviction** — normalized entries are small; keep all entries for the running process lifetime.
- **push(index, entry)** — append new entry to Vec + broadcast.
- **replace(index, entry)** — update existing entry at index in Vec + broadcast (for streaming text updates).
- **history_plus_live()** — replay full Vec then continue with broadcast (for WS consumers).
- **snapshot()** — return current Vec clone (for determining `hasMoreEntries`).

### Lifecycle

1. **Created**: alongside `MsgStore` when execution starts, stored in a parallel `HashMap<Uuid, Arc<NormalizedEntryStore>>` on `ContainerService`.
2. **Populated**: by `spawn_stream_raw_logs_to_file` — when it extracts a normalized entry from a JsonPatch, it calls `push`/`replace` on the store in addition to the existing DB batch flush.
3. **Consumed**: by `stream_normalized_logs` and `stream_live_normalized_logs` — for running tasks (store exists), read from `NormalizedEntryStore` instead of `MsgStore` or DB.
4. **Cleaned up**: after process exits AND `spawn_stream_raw_logs_to_file` completes its final DB flush. Remove from the map. After cleanup, WS endpoints return `None` and frontend falls back to REST.

### Backend changes

1. **`crates/utils/src/normalized_entry_store.rs`** — new module with `NormalizedEntryStore`.
2. **`ContainerService` trait** — add `normalized_entry_stores: Arc<RwLock<HashMap<Uuid, Arc<NormalizedEntryStore>>>>` parallel to `msg_stores`.
3. **`spawn_stream_raw_logs_to_file`** — after `extract_normalized_entry_from_patch`, push/replace into `NormalizedEntryStore` (in addition to existing `pending_entries` HashMap for DB flush).
4. **`stream_normalized_logs`** — for running tasks, check `NormalizedEntryStore` first. Convert entries to `LogMsg::JsonPatch(ConversationPatch::add_normalized_entry(...))` stream + live updates. Fall through to DB path if store doesn't exist.
5. **`stream_live_normalized_logs`** — same: use `NormalizedEntryStore` for running tasks.
6. **Cleanup** — after `spawn_stream_raw_logs_to_file` finishes (process exited, final flush done), remove the `NormalizedEntryStore` from the map.

### Frontend changes (`useConversationHistoryOld.ts`)

#### `loadRunningAndEmit` (line 656-780)

For coding agent running processes:

1. **Initial load**: connect to `normalized-logs/ws` directly (no REST call). The backend replays all normalized entries from `NormalizedEntryStore` via `history_plus_live()`.
2. **Track pagination metadata**: compute `minEntryIndex` from the smallest entry index received via WS. Determine `hasMoreEntries`: if the WS stream started at entry index > 0, there may be older entries in DB that were flushed before the `NormalizedEntryStore` was created (edge case: process restarted). In practice, the store is created at process start, so `minEntryIndex == 0` means no older entries. If `minEntryIndex > 0`, set `hasMoreEntries = true`.
3. **Merge into displayed state** with `hasMoreEntries` and `minEntryIndex` set.

#### `loadMore` (line 980-1188)

- Remove the running process skip filter at line 994-996 (`live?.status !== ExecutionProcessStatus.running`).
- Running processes can now participate in entry-level pagination via REST from DB for older entries.

### What stays unchanged

- `MsgStore` raw log handling.
- Raw logs → disk (JSONL + zstd compression).
- DB `normalized_entries` batch flush logic (still needed for persistence and scroll-up pagination).
- Completed process REST loading.
- `ScriptRequest` processes (still use `raw-logs/ws`).
