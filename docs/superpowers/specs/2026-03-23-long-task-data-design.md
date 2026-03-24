# Long Task Data: REST + Message-Level Pagination

## Problem

Task execution logs (conversation history) fail to load or lose data when they become very long.

**Root cause**: When loading a historic (completed) execution process, the current code uses WebSocket (`/normalized-logs/ws`). The server's fallback path loads ALL raw logs from DB, creates a temp MsgStore, re-normalizes everything, and streams it in one shot. For long tasks with thousands of entries, this is slow, memory-heavy, and prone to failure.

**Additional issues**:
- Running process WebSocket replays all history from the beginning (`history_plus_stream()` → `hist.chain(live)`), causing scroll-from-top-to-bottom UX
- Pagination is process-level only — if a single process has 5000 entries, they all load at once
- `BroadcastStreamRecvError::Lagged` is silently ignored in some streams (data loss)

## Solution

**REST for history, WebSocket for live delta only.**

- Add REST endpoint for paginated normalized entries (cursor-based, tail-first)
- Add live-only WebSocket endpoint (no history replay)
- Frontend loads via REST, connects live WS for running processes

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│                                                  │
│  useConversationHistory                          │
│  ├─ loadInitialEntries() → REST /entries?limit=50│
│  ├─ loadMore()          → REST /entries?before=N │
│  └─ connectLive()       → WS /live?after=M       │
│                                                  │
│  IndexedDB cache (optional, completed only)      │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│                   Server                         │
│                                                  │
│  GET  /execution-processes/{id}/entries          (new)
│  WS   /execution-processes/{id}/normalized-logs-live/ws  (new)
│  WS   /execution-processes/{id}/normalized-logs/ws       (keep)
│  WS   /execution-processes/{id}/raw-logs/ws              (keep)
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│               Database                           │
│                                                  │
│  normalized_entries (existing, already has data) │
│  PK: (execution_id, entry_index)                 │
│  ← cursor-based query: WHERE entry_index < N     │
└─────────────────────────────────────────────────┘
```

## Data Flow

### Opening a completed process
1. REST `GET /entries?limit=50` → last 50 entries, display immediately (no scrolling)
2. Done

### Opening a running process
1. REST `GET /entries?limit=50` → last 50 entries, display immediately
2. WS `/normalized-logs-live/ws?after=50` → receive deltas only (no history replay)
3. On scroll up: REST `GET /entries?limit=50&before=minEntryIndex` → prepend older entries

### Process lifecycle
```
1. Process created → spawn_stream_raw_logs_to_db writes to normalized_entries in real-time
2. User opens     → REST /entries?limit=50 (last 50) → immediate display
                  → WS /live?after=50 → receive deltas
3. User scrolls up → REST /entries?limit=50&before=1 → prepend older 50
4. Process completes → live WS receives Finished → disconnect
5. User reopens    → pure REST /entries?limit=50
```

## Caching Strategy

**Completed processes**:
- Primary: REST reads directly from `normalized_entries` — SQLite is fast
- IndexedDB cache: optional optimization layer
- Cache key: `(attemptId, processId)`, validity: `cached.totalCount === server.total_count`
- Invalidation: when process status changes `running → completed/failed/killed`

**Running processes**:
- No caching (data still changing)
- On completion: clear live state, next load uses REST

## API Design

### REST: Get Paginated Entries

`GET /api/execution-processes/{id}/entries?limit=50&before=123`

Query params:
- `before`: entry_index cursor, returns entries with `entry_index < before` (DESC order, reversed to ASC in response). If omitted, returns last N entries.
- `limit`: default 50, max 200

Response:
```json
{
  "entries": [...],         // ASC order, can be directly prepended
  "total_count": 5000,
  "has_more": true          // older entries available
}
```

### WS: Live-Only Normalized Logs

`WS /api/execution-processes/{id}/normalized-logs-live/ws?after=N`

Query params:
- `after`: entry_index, server skips entries with `entry_index <= N`

Behavior:
- Subscribes to MsgStore's BroadcastStream only (no history replay)
- Filters: only JsonPatch messages with `entry_index > after`
- On Lagged: send a reconnect signal to client

## Database Changes

### `crates/db/src/models/normalized_entries.rs`

Replace `find_by_execution_id_paginated(offset, limit)` with cursor-based:

```rust
pub async fn find_by_execution_id_cursor(
    pool: &SqlitePool,
    execution_id: Uuid,
    before: Option<i64>,  // None = tail (last N)
    limit: i64,
) -> Result<PaginatedEntries, sqlx::Error>
```

Query (tail):
```sql
SELECT * FROM normalized_entries
WHERE execution_id = $1
ORDER BY entry_index DESC
LIMIT $2
```

Query (cursor):
```sql
SELECT * FROM normalized_entries
WHERE execution_id = $1 AND entry_index < $2
ORDER BY entry_index DESC
LIMIT $3
```

Return entries reversed to ASC order.

## Server Changes

### `crates/utils/src/msg_store.rs`

New method — live stream only, no history replay:
```rust
pub fn live_stream(&self) -> BoxStream<'static, Result<LogMsg, io::Error>> {
    let rx = self.get_receiver();
    BroadcastStream::new(rx)
        .filter_map(|res| async move { res.ok().map(Ok) })
        .boxed()
}
```

### `crates/services/src/services/container.rs`

New method:
```rust
async fn stream_live_normalized_logs(
    &self,
    id: &Uuid,
    after_index: i64,
) -> Option<BoxStream<'static, Result<LogMsg, io::Error>>>
```

Gets MsgStore → `live_stream()` → filter JsonPatch where `entry_index > after_index`.

### `crates/server/src/routes/execution_processes.rs`

New handlers:
- `get_normalized_entries`: REST endpoint, cursor-based pagination
- `stream_normalized_logs_live_ws`: WS endpoint, live-only

New routes:
```rust
.route("/entries", get(get_normalized_entries))
.route("/normalized-logs-live/ws", get(stream_normalized_logs_live_ws))
```

## Frontend Changes

### `frontend/src/lib/api.ts`

Change `getEntries` from offset-based to cursor-based:
```typescript
getEntries: async (
  processId: string,
  before?: number,   // undefined = tail
  limit: number = 50
): Promise<PaginatedNormalizedEntries>
```

### `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

#### ExecutionProcessState expansion
```typescript
interface ExecutionProcessState {
  executionProcess: ExecutionProcess;
  entries: PatchTypeWithKey[];
  totalCount: number;
  hasMoreEntries: boolean;    // older entries available
  minEntryIndex: number;      // cursor for scroll-up loading
}
```

#### loadEntriesForHistoricExecutionProcess
Replace WebSocket with REST:
- Call `executionProcessesApi.getEntries(processId, undefined, 50)`
- Parse `entry_json` → `PatchType`
- Set `totalCount`, `hasMoreEntries`, `minEntryIndex`

#### loadRunningAndEmit
Replace pure WebSocket with REST + Live WS:
1. REST `/entries?limit=50` → immediate display (no scroll animation)
2. WS `/normalized-logs-live/ws?after=maxEntryIndex` → receive deltas
3. On WS entries: append to process.entries, update maxEntryIndex

#### loadMore
Two-level pagination:
1. Find newest process with `hasMoreEntries`
2. REST `/entries?limit=50&before=minEntryIndex` → prepend
3. If no process has more → load next process (process-level pagination, same tail-first pattern)

#### flattenEntriesForEmit
Unchanged — same logic for synthesizing user_message, next_action, etc.

### `frontend/src/utils/conversationCache.ts`

Optional adjustment:
- Cache per-process tail data (entries + totalCount)
- Validity: `cached.totalCount === server.total_count`

## Edge Cases

### Running → Completed transition
1. Detect status change via `executionProcesses` context
2. Stop live WS connection
3. Optional: REST fetch to verify totalCount consistency
4. Future loads use pure REST

### Live WS disconnection
- Exponential backoff reconnect (reuse `loadRunningAndEmitWithBackoff`)
- Reconnect with current `maxEntryIndex` → server sends only missed deltas

### REST failure
- First load: show error state + retry button
- loadMore: toast, don't break existing data

### No normalized entries yet (race condition)
- Process just started, `spawn_stream_raw_logs_to_db` hasn't written entries
- REST returns empty → frontend connects live WS directly (same as current WebSocket-only behavior)

### MsgStore evicted for running process (rare)
- Live WS connection fails → fallback to REST polling (every 3s)

### BroadcastStreamRecvError::Lagged
- Server sends reconnect signal to client
- Client re-fetches via REST, reconnects WS with new `maxEntryIndex`

## File Changes Summary

| File | Change |
|------|--------|
| `crates/db/src/models/normalized_entries.rs` | Cursor-based query (before param) |
| `crates/services/src/services/container.rs` | New `stream_live_normalized_logs(id, after)` |
| `crates/utils/src/msg_store.rs` | New `live_stream()` method |
| `crates/server/src/routes/execution_processes.rs` | New handlers + routes for `/entries` and `/normalized-logs-live/ws` |
| `frontend/src/lib/api.ts` | `getEntries` → cursor-based (before param) |
| `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | REST for history, live WS for delta, tail-first pagination |
| `frontend/src/utils/conversationCache.ts` | Optional: adjust cache strategy |
