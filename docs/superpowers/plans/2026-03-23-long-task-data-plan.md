# Long Task Data: REST + Message-Level Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix long task data loading failures by replacing WebSocket-based history loading with REST cursor-based pagination and adding a live-only WebSocket endpoint for running processes.

**Architecture:** REST endpoint serves paginated normalized entries from DB (tail-first, cursor-based). A new live-only WebSocket endpoint streams only new entries without replaying history. Frontend loads via REST, connects live WS for running processes.

**Tech Stack:** Rust (axum, sqlx, tokio, futures), TypeScript/React (Vite, Tailwind)

**Spec:** `docs/superpowers/specs/2026-03-23-long-task-data-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `crates/db/src/models/normalized_entries.rs` | Cursor-based paginated query |
| `crates/utils/src/msg_store.rs` | Live-only stream (no history replay) |
| `crates/services/src/services/container.rs` | Live normalized logs service method |
| `crates/server/src/routes/execution_processes.rs` | REST + live WS route handlers |
| `frontend/src/lib/api.ts` | Cursor-based API client |
| `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | REST loading, live WS, tail-first pagination |
| `frontend/src/hooks/useConversationHistory/types.ts` | Updated ExecutionProcessState type |

---

### Task 1: Cursor-based DB query

**Files:**
- Modify: `crates/db/src/models/normalized_entries.rs`

- [ ] **Step 1: Add `find_by_execution_id_cursor` method**

Add new method after `find_by_execution_id_paginated` (keep old one for now, remove later):

```rust
/// Find entries for an execution process using cursor-based pagination.
/// `before`: if Some(n), returns entries with entry_index < n (DESC, reversed to ASC).
/// If None, returns the last `limit` entries.
pub async fn find_by_execution_id_cursor(
    pool: &SqlitePool,
    execution_id: Uuid,
    before: Option<i64>,
    limit: i64,
) -> Result<PaginatedEntries, sqlx::Error> {
    let total_count = Self::count_by_execution_id(pool, execution_id).await?;

    // Fetch limit+1 to detect whether more entries exist
    let fetch_limit = limit + 1;

    let mut entries = if let Some(before_index) = before {
        sqlx::query_as!(
            NormalizedEntry,
            r#"SELECT
                execution_id as "execution_id!: Uuid",
                entry_index,
                entry_json,
                inserted_at as "inserted_at!: DateTime<Utc>"
               FROM normalized_entries
               WHERE execution_id = $1 AND entry_index < $2
               ORDER BY entry_index DESC
               LIMIT $3"#,
            execution_id,
            before_index,
            fetch_limit
        )
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as!(
            NormalizedEntry,
            r#"SELECT
                execution_id as "execution_id!: Uuid",
                entry_index,
                entry_json,
                inserted_at as "inserted_at!: DateTime<Utc>"
               FROM normalized_entries
               WHERE execution_id = $1
               ORDER BY entry_index DESC
               LIMIT $2"#,
            execution_id,
            fetch_limit
        )
        .fetch_all(pool)
        .await?
    };

    let has_more = entries.len() > limit as usize;
    entries.truncate(limit as usize);

    // Reverse to ASC order for client consumption
    entries.reverse();

    Ok(PaginatedEntries {
        entries,
        total_count,
        has_more,
    })
}
```

- [ ] **Step 2: Prepare SQLx offline data**

Run: `cargo sqlx prepare --workspace`
Expected: `.sqlx/` files updated

- [ ] **Step 3: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/models/normalized_entries.rs crates/db/.sqlx/
git commit -m "feat(db): add cursor-based pagination for normalized entries"
```

---

### Task 2: MsgStore live_stream method

**Files:**
- Modify: `crates/utils/src/msg_store.rs`

- [ ] **Step 1: Add `live_stream` method**

Add after `history_plus_stream` (line ~115):

```rust
/// Returns a stream of only new messages (no history replay).
/// Unlike `history_plus_stream`, this does NOT replay buffered messages.
pub fn live_stream(&self) -> futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>> {
    use tokio_stream::wrappers::BroadcastStreamRecvError;

    let rx = self.get_receiver();
    BroadcastStream::new(rx)
        .filter_map(|res| async move {
            match res {
                Ok(msg) => Some(Ok(msg)),
                Err(BroadcastStreamRecvError::Lagged(n)) => {
                    tracing::warn!("Live stream lagged by {} messages, client should re-fetch via REST", n);
                    None  // Drop lagged messages; client detects gaps and re-fetches via REST
                }
            }
        })
        .boxed()
}
```

Note: `BroadcastStreamRecvError` is NOT imported in the current file (existing code uses `res.ok()` which doesn't need it). The `use` statement is scoped inside the function to avoid polluting the module imports. On Lagged: we silently drop with a warning log. The frontend will detect the gap (missing entry indices) and re-fetch via REST. A future enhancement could send an explicit reconnect signal via a special WS message.

- [ ] **Step 2: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add crates/utils/src/msg_store.rs
git commit -m "feat(utils): add live_stream method to MsgStore (no history replay)"
```

---

### Task 3: Container service — live normalized logs

**Files:**
- Modify: `crates/services/src/services/container.rs`

- [ ] **Step 1: Add `stream_live_normalized_logs` method**

Add after `stream_normalized_logs` (around line 1028):

```rust
async fn stream_live_normalized_logs(
    &self,
    id: &Uuid,
    after_index: i64,
) -> Option<futures::stream::BoxStream<'static, Result<LogMsg, std::io::Error>>> {
    let store = self.get_msg_store_by_id(id).await?;

    let stream = store
        .live_stream()
        .filter(move |msg| {
            future::ready(match msg {
                Ok(LogMsg::JsonPatch(patch)) => {
                    // Reuse extract_normalized_entry_from_patch — already imported
                    // It returns Option<(usize, NormalizedEntry)>, we only need the index
                    if let Some((index, _)) = extract_normalized_entry_from_patch(patch) {
                        (index as i64) > after_index
                    } else {
                        false
                    }
                }
                Ok(LogMsg::Finished) => true,
                _ => false,
            })
        })
        .chain(futures::stream::once(async {
            Ok::<_, std::io::Error>(LogMsg::Finished)
        }))
        .boxed();

    Some(stream)
}
```

Note: `extract_normalized_entry_from_patch` is already imported in container.rs (line 42). No new helper function needed — we just destructure and ignore the entry.

- [ ] **Step 2: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 3: Run tests**

Run: `cargo test --workspace`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add crates/services/src/services/container.rs
git commit -m "feat(service): add stream_live_normalized_logs with after_index filter"
```

---

### Task 4: Server routes — REST entries endpoint

**Files:**
- Modify: `crates/server/src/routes/execution_processes.rs`

- [ ] **Step 1: Add query struct and handler**

```rust
#[derive(Debug, Deserialize)]
pub struct EntriesQuery {
    pub before: Option<i64>,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    50
}

pub async fn get_normalized_entries(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<EntriesQuery>,
) -> Result<ResponseJson<ApiResponse<db::models::normalized_entries::PaginatedEntries>>, ApiError> {
    let limit = query.limit.clamp(1, 200);
    let pool = &deployment.db().pool;

    let result = db::models::normalized_entries::NormalizedEntry::find_by_execution_id_cursor(
        pool,
        execution_process.id,
        query.before,
        limit,
    )
    .await?;  // sqlx::Error auto-converts via #[from] in ApiError

    Ok(ResponseJson(ApiResponse::success(result)))
}
```

- [ ] **Step 2: Register route**

In the `router` function, add to `workspace_id_router` (around line 251):

```rust
.route("/entries", get(get_normalized_entries))
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/execution_processes.rs
git commit -m "feat(server): add REST /entries endpoint for paginated normalized entries"
```

---

### Task 5: Server routes — live-only WebSocket endpoint

**Files:**
- Modify: `crates/server/src/routes/execution_processes.rs`

- [ ] **Step 1: Add query struct and handler**

```rust
#[derive(Debug, Deserialize)]
pub struct LiveLogsQuery {
    pub after: Option<i64>,
}

pub async fn stream_normalized_logs_live_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
    Query(query): Query<LiveLogsQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let after_index = query.after.unwrap_or(0);

    let stream = deployment
        .container()
        .stream_live_normalized_logs(&exec_id, after_index)
        .await
        .ok_or_else(|| {
            ApiError::ExecutionProcess(ExecutionProcessError::ExecutionProcessNotFound)
        })?;

    let stream = stream.err_into::<anyhow::Error>().into_stream();

    Ok(ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_normalized_logs_ws(socket, stream).await {
            tracing::warn!("live normalized logs WS closed: {}", e);
        }
    }))
}
```

Note: Reuse the existing `handle_normalized_logs_ws` function from line 146.

- [ ] **Step 2: Register route**

In `workspace_id_router`:

```rust
.route("/normalized-logs-live/ws", get(stream_normalized_logs_live_ws))
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cargo check --workspace`
Expected: SUCCESS

- [ ] **Step 4: Run tests**

Run: `cargo test --workspace`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add crates/server/src/routes/execution_processes.rs
git commit -m "feat(server): add live-only WebSocket endpoint /normalized-logs-live/ws"
```

---

### Task 6: Frontend API — cursor-based getEntries

**Files:**
- Modify: `frontend/src/lib/api.ts:900-909`

- [ ] **Step 1: Change `getEntries` to cursor-based**

Replace existing `getEntries`:

```typescript
getEntries: async (
  processId: string,
  before?: number,
  limit: number = 50
): Promise<PaginatedNormalizedEntries> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before !== undefined) {
    params.set('before', String(before));
  }
  const response = await makeRequest(
    `/api/execution-processes/${processId}/entries?${params}`
  );
  return handleApiResponse<PaginatedNormalizedEntries>(response);
},
```

- [ ] **Step 2: Verify frontend type checks**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): change getEntries to cursor-based pagination (before param)"
```

---

### Task 7: Frontend hook — REST for historic process loading

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Add `entry_json` parsing helper**

At the top of the file or as a utility function:

```typescript
function parseEntryJson(entryJson: string): PatchType | null {
  try {
    return JSON.parse(entryJson) as PatchType;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Replace `loadEntriesForHistoricExecutionProcess` body**

Replace lines 111-167. Instead of WebSocket, call REST:

```typescript
const loadEntriesForHistoricExecutionProcess = useCallback(
  async (executionProcess: ExecutionProcess): Promise<PatchTypeWithKey[]> => {
    const attemptId = attempt.id;
    const processId = executionProcess.id;

    // Try IndexedDB cache first
    const cached = await getCachedProcessEntries(attemptId, processId);
    if (cached && !isCacheStale(cached.cachedAt)) {
      return cached.entries;
    }

    // Fetch via REST (tail-first: last 50 entries)
    const result = await executionProcessesApi.getEntries(processId, undefined, 50);

    const entriesWithKey: PatchTypeWithKey[] = [];
    for (const record of result.entries) {
      const parsed = parseEntryJson(record.entry_json);
      if (parsed) {
        entriesWithKey.push(patchWithKey(parsed, processId, record.entry_index));
      }
    }

    // Write to IndexedDB cache (fire-and-forget), only for completed processes
    if (
      entriesWithKey.length > 0 &&
      executionProcess.status !== ExecutionProcessStatus.running
    ) {
      setCachedProcessEntries(attemptId, processId, entriesWithKey, result.total_count);
    }

    return entriesWithKey;
    // Note: caller should set totalCount, hasMoreEntries, minEntryIndex on ExecutionProcessState
    // from result.total_count, result.has_more, and min(entry_index) of loaded entries
  },
  [attempt.id]
);
```

- [ ] **Step 3: Verify frontend type checks**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "feat(hook): replace WebSocket with REST for historic process loading"
```

---

### Task 8: Frontend hook — live WS for running processes

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Replace `loadRunningAndEmit` with REST + Live WS**

Replace lines 602-637. Use a plain async function (not `new Promise(async ...)` anti-pattern):

```typescript
const loadRunningAndEmit = useCallback(
  async (executionProcess: ExecutionProcess): Promise<void> => {
    // Step 1: REST load current snapshot (last 50 entries)
    const result = await executionProcessesApi.getEntries(
      executionProcess.id,
      undefined,
      50
    );

    const entriesWithKey: PatchTypeWithKey[] = [];
    for (const record of result.entries) {
      const parsed = parseEntryJson(record.entry_json);
      if (parsed) {
        entriesWithKey.push(
          patchWithKey(parsed, executionProcess.id, record.entry_index)
        );
      }
    }

    // Track max entry index for live WS cursor (highest entry_index from REST)
    const maxEntryIndex = result.entries.length > 0
      ? Math.max(...result.entries.map(e => e.entry_index))
      : -1;

    // Display initial snapshot immediately
    mergeIntoDisplayed((state) => {
      state[executionProcess.id] = {
        executionProcess,
        entries: entriesWithKey,
      };
    });
    emitState(displayedExecutionProcesses.current, 'running');

    // Step 2: Connect live WS for deltas only
    // Pass entriesWithKey as initial state so streamJsonPatchEntries
    // can apply patches starting from /entries/{maxEntryIndex+1}
    const liveUrl = `/api/execution-processes/${executionProcess.id}/normalized-logs-live/ws?after=${maxEntryIndex}`;
    let prevEntryCount = entriesWithKey.length;
    const controller = streamJsonPatchEntries<PatchType>(liveUrl, {
      initial: { entries: entriesWithKey.map(e => e) },
      onEntries(allEntries) {
        // Only process newly added entries (after prevEntryCount)
        if (allEntries.length <= prevEntryCount) return;
        const newEntries = allEntries.slice(prevEntryCount);
        const patchesWithKey = newEntries.map((entry, i) =>
          patchWithKey(entry, executionProcess.id, prevEntryCount + i)
        );
        prevEntryCount = allEntries.length;
        mergeIntoDisplayed((state) => {
          if (state[executionProcess.id]) {
            state[executionProcess.id].entries.push(...patchesWithKey);
          }
        });
        emitState(displayedExecutionProcesses.current, 'running');
      },
      onFinished: () => {
        emitState(displayedExecutionProcesses.current, 'running');
        controller.close();
      },
      onError: () => {
        controller.close();
      },
    });
  },
  [emitState]
);
```

Key changes from original:
- **No `new Promise(async ...)` anti-pattern** — plain `async` function
- **`initial` passed to `streamJsonPatchEntries`** — snapshot starts with REST entries so patches can apply correctly
- **`prevEntryCount` tracking** — only processes entries added by live patches, avoids re-processing REST entries
- **Entry index from array position** — `prevEntryCount + i` is the correct array index for the new entry (patch path `/entries/{index}`)

**Limitation — scroll-up during live streaming:** `streamJsonPatchEntries` applies patches by array index (`/entries/{N}`). If the user scrolls up and prepends entries, existing entries shift to higher indices, and live patches will apply to wrong positions. For now, disable scroll-up (loadMore) while a process has an active live WS connection. The process must be completed (live WS disconnected) before scroll-up pagination works. This matches the existing behavior where scroll-up is not available during streaming.

- [ ] **Step 2: Verify frontend type checks**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "feat(hook): use REST + live WS for running process loading (no history replay)"
```

---

### Task 9: Frontend hook — message-level pagination in loadMore

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`

- [ ] **Step 1: Add `hasMoreEntries` and `minEntryIndex` tracking to `ExecutionProcessState`**

In `frontend/src/hooks/useConversationHistory/types.ts`, add to `ExecutionProcessState`:

```typescript
export interface ExecutionProcessState {
  executionProcess: ExecutionProcess;
  entries: PatchTypeWithKey[];
  totalCount?: number;
  hasMoreEntries?: boolean;
  minEntryIndex?: number;
}
```

Fields are optional because Tasks 7 (historic) and 8 (running initial load) don't set them — they're populated when `loadMore` is called. Task 7 sets them from the REST response if available.

- [ ] **Step 2: Update `loadEntriesForHistoricExecutionProcess` to track pagination state**

Ensure the returned entries and state include `totalCount`, `hasMoreEntries`, `minEntryIndex`. When creating the `ExecutionProcessState` in `loadInitialEntries` and `loadMore`:

```typescript
localDisplayedExecutionProcesses[executionProcess.id] = {
  executionProcess,
  entries: entriesWithKey,
  totalCount: result.total_count,
  hasMoreEntries: result.has_more,
  minEntryIndex: entriesWithKey.length > 0
    ? Math.min(...result.entries.map(e => e.entry_index))
    : 0,
};
```

Note: `minEntryIndex` uses `result.entries` (not `entriesWithKey`) because `entry_index` comes from the REST response record, not from the parsed patch. We track it during the parsing loop:

- [ ] **Step 3: Add message-level pagination to `loadMore`**

In the `loadMore` loop, before process-level pagination, check if any displayed process has `hasMoreEntries`:

```typescript
// First: check for message-level pagination within existing processes
// Skip processes with active live WS (scroll-up during live streaming shifts indices)
const processWithMore = Object.values(displayedExecutionProcesses.current)
  .filter(p =>
    p.hasMoreEntries &&
    p.minEntryIndex !== undefined &&
    p.executionProcess.status !== ExecutionProcessStatus.running
  )
  .sort((a, b) =>
    new Date(b.executionProcess.created_at).getTime() -
    new Date(a.executionProcess.created_at).getTime()
  )[0];

if (processWithMore) {
  const result = await executionProcessesApi.getEntries(
    processWithMore.executionProcess.id,
    processWithMore.minEntryIndex,
    50
  );

  let newMinIndex = processWithMore.minEntryIndex;
  const newEntries: PatchTypeWithKey[] = [];
  for (const record of result.entries) {
    const parsed = parseEntryJson(record.entry_json);
    if (parsed) {
      newEntries.push(
        patchWithKey(parsed, processWithMore.executionProcess.id, record.entry_index)
      );
      if (record.entry_index < newMinIndex) {
        newMinIndex = record.entry_index;
      }
    }
  }

  // Prepend older entries (REST returns ASC order, oldest first)
  processWithMore.entries = [...newEntries, ...processWithMore.entries];
  processWithMore.hasMoreEntries = result.has_more;
  processWithMore.minEntryIndex = newMinIndex;

  emitStateRef.current(displayedExecutionProcesses.current, 'historic');
} else {
  // Existing process-level pagination logic (load next older process)...
}
```

- [ ] **Step 4: Verify frontend type checks**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/types.ts frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "feat(hook): add message-level pagination (tail-first, cursor-based) to loadMore"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Full backend check**

Run: `cargo check --workspace && cargo test --workspace`
Expected: PASS

- [ ] **Step 2: Full frontend check**

Run: `pnpm run check && pnpm run lint`
Expected: PASS

- [ ] **Step 3: Generate types (if needed)**

Run: `pnpm run generate-types`
Expected: PASS (no new types needed, but verify)

- [ ] **Step 4: Manual testing**

- Open a completed task with many entries → should load last 50 via REST immediately
- Scroll up → should load more entries via REST cursor
- Open a running task → should load last 50 immediately, then receive live deltas
- No scroll-from-top-to-bottom animation on running task

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
