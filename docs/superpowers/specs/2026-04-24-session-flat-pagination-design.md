# Session-Level Flat Conversation Pagination

## Problem

The anchored-mode pagination in the conversation TOC feature is a mess:

- Per-process pagination forces the frontend to track multiple state sets (`processesRef`, `exhaustedAfterRef`, `exhaustedBeforeRef`, `processesWithUserMsgRef`, loading locks per direction)
- Each process boundary requires a "probe" request to detect exhaustion, then another request to load the next process
- Jumps need the frontend to know the full process list and pass it down through `jumpTo`
- Bugs surface repeatedly: stale ref reads, runaway loading, scroll handler thrashing

The root cause is that cross-process pagination is implemented in the frontend. The correct architecture has the server do the JOIN and return a flat, chronologically-ordered entries stream.

## Current Architecture

- `GET /api/execution-processes/{id}/entries?before=|after=|around=` — per-process, cursor by `entry_index`
- `GET /api/execution-processes/user-messages?session_id=` — returns ordered process summaries
- Frontend `useConversationWindow` stitches multiple per-process calls into a flat `anchoredEntries` array

The per-process `around`/`after` query params and DB methods exist but produce the wrong abstraction for the anchored use case.

## Design

### 1. Backend: new session-level endpoint

```
GET /api/sessions/{session_id}/conversation-entries
  ?before={cursor}&limit={n}
  ?after={cursor}&limit={n}
```

Only two directions. The `around` case is handled by the frontend: it passes the target process's `anchor_cursor` (provided by the TOC endpoint) as the `after` cursor. No `around` direction on the server.

#### Response shape

```json
{
  "entries": [
    {
      "execution_process_id": "uuid",
      "entry_index": 0,
      "entry_json": "serialised NormalizedEntry"
    }
  ],
  "first_cursor": "opaque_string|null",
  "last_cursor": "opaque_string|null",
  "has_more_before": bool,
  "has_more_after": bool
}
```

Empty `entries` array returns `null` cursors and `false` for both `has_more_*`.

#### Cursor encoding

Internal structure:

```rust
#[derive(Serialize, Deserialize)]
struct ConversationCursor {
    process_created_at: DateTime<Utc>,
    entry_index: i64,
}
```

Encoding: `serde_json::to_vec` → base64 URL-safe, no padding. Frontend treats it as opaque.

#### SQL

Single query, no CTE:

```sql
-- after
SELECT
    ne.execution_id,
    ne.entry_index,
    ne.entry_json,
    ep.created_at as process_created_at
FROM normalized_entries ne
JOIN execution_processes ep ON ne.execution_id = ep.id
WHERE ep.session_id = $1
  AND (ep.dropped = FALSE)
  AND (
    ep.created_at > $2
    OR (ep.created_at = $2 AND ne.entry_index > $3)
  )
ORDER BY ep.created_at ASC, ne.entry_index ASC
LIMIT $4
```

`before` is symmetric: `<` instead of `>`, `ORDER BY ... DESC`, then reverse to ASC before returning. Fetch `limit + 1` to detect `has_more`.

Required index: `execution_processes(session_id, created_at)`. The primary key on `normalized_entries(execution_id, entry_index)` covers the join and ordering within each process.

#### Error handling

- Invalid cursor → `400 Bad Request`
- Unknown session_id → returns empty `entries` (do not leak session existence)
- DB errors → `500` with logged error, empty response

### 2. TOC endpoint: add `anchor_cursor`

Extend `UserMessageSummary`:

```rust
#[derive(Serialize)]
pub struct UserMessageSummary {
    pub execution_process_id: Uuid,
    pub entry_index: i64,
    pub summary: String,
    pub created_at: DateTime<Utc>,
    pub anchor_cursor: String, // NEW
}
```

`anchor_cursor` is `encode_cursor(ConversationCursor { process_created_at: created_at, entry_index: -1 })`. This cursor matches "everything from the start of this process onward" when used with `?after=`.

The frontend never encodes cursors itself.

### 3. Frontend: API client

```typescript
export type SessionConversationEntryRecord = {
  execution_process_id: string;
  entry_index: number;
  entry_json: string;
};

export type SessionConversationEntries = {
  entries: SessionConversationEntryRecord[];
  first_cursor: string | null;
  last_cursor: string | null;
  has_more_before: boolean;
  has_more_after: boolean;
};

// In executionProcessesApi (or a new sessionsApi namespace):
getSessionEntries: async (
  sessionId: string,
  options: { before?: string; after?: string; limit?: number }
): Promise<SessionConversationEntries>
```

`UserMessageSummary` gains the `anchor_cursor` field.

### 4. Frontend: `useConversationWindow` simplification

#### Deleted state

- `processesRef`
- `processesWithUserMsgRef`
- `exhaustedAfterRef`
- `exhaustedBeforeRef`
- `findNextProcess`, `findPrevProcess` callbacks

#### Retained state

- `anchoredEntries` + `anchoredEntriesRef` (via `updateEntries` helper that syncs ref inside setState)
- `firstCursorRef`, `lastCursorRef` — track the window's endpoints
- `hasMoreBeforeRef`, `hasMoreAfterRef` — from response
- `isLoadingBeforeRef`, `isLoadingAfterRef`
- `renderedUserMsgSet: Set<processId>` — tracks which processes already have a synthetic user message in the entries array
- `processSummariesMap: Map<processId, summary>` — populated from TOC drawer when it loads, used to synthesise user messages

#### Operations

```typescript
jumpTo(anchorCursor: string, processId: string, processSummaries: Map<processId, summary>) {
  setIsJumping(true);
  processSummariesMapRef.current = processSummaries;
  renderedUserMsgSet.current = new Set();
  try {
    const result = await api.getSessionEntries(sessionId, {
      after: anchorCursor,
      limit: 200,
    });
    const parsed = parseWithUserMessages(result.entries);
    updateEntries(parsed);
    firstCursorRef.current = result.first_cursor;
    lastCursorRef.current = result.last_cursor;
    hasMoreBeforeRef.current = result.has_more_before;
    hasMoreAfterRef.current = result.has_more_after;
    setWindowMode({
      mode: 'anchored',
      anchorProcessId: processId,
      anchorEntryIndex: 0,
      hasMoreBefore: result.has_more_before,
      hasMoreAfter: result.has_more_after,
    });
    setScrollState('anchored');
  } finally { setIsJumping(false); }
}

loadAfter() {
  if (!hasMoreAfterRef.current || isLoadingAfterRef.current || !lastCursorRef.current) return;
  isLoadingAfterRef.current = true;
  try {
    const result = await api.getSessionEntries(sessionId, {
      after: lastCursorRef.current,
      limit: 200,
    });
    const parsed = parseWithUserMessages(result.entries);
    updateEntries(prev => [...prev, ...parsed]);
    lastCursorRef.current = result.last_cursor ?? lastCursorRef.current;
    hasMoreAfterRef.current = result.has_more_after;
  } finally { isLoadingAfterRef.current = false; }
}

loadBefore() { /* symmetric: before cursor, prepend, update firstCursorRef */ }
```

#### `parseWithUserMessages`

Rule: **Inject a synthetic user message for a process only when the batch contains `entry_index == 0` for that process.** This guarantees the user message appears exactly at the start of the process's entries in the flat list, regardless of which direction the batch arrived from.

```typescript
function parseWithUserMessages(
  rawEntries: SessionConversationEntryRecord[]
): PatchTypeWithKey[] {
  const out: PatchTypeWithKey[] = [];
  for (const r of rawEntries) {
    const processId = r.execution_process_id;
    const parsed = parseEntryJson(r.entry_json, processId, r.entry_index);
    if (!parsed) continue;
    // Skip DB user_message entries (replaced by synthetic)
    if (
      parsed.type === 'NORMALIZED_ENTRY' &&
      parsed.content.entry_type.type === 'user_message'
    ) continue;
    // Inject synthetic user message when we reach entry_index 0 of a new process
    if (r.entry_index === 0 && !renderedUserMsgSet.current.has(processId)) {
      const summary = processSummariesMapRef.current.get(processId);
      if (summary) out.push(makeSyntheticUserMessage(processId, summary));
      renderedUserMsgSet.current.add(processId);
    }
    out.push(parsed);
  }
  return out;
}
```

Because the session endpoint always orders `(process_created_at, entry_index) ASC` (with `before` internally doing `DESC LIMIT` then reversing to `ASC`), a batch either contains `entry_index == 0` for a given process or it doesn't. If it doesn't, a later batch will; either way, the user message lands immediately before `entry_index == 0` of its process, which is the correct position.

### 5. TOCDrawer

Already knows each process's `anchor_cursor` from the extended `UserMessageSummary`. On click:

```tsx
onJumpTo(msg.anchor_cursor, msg.execution_process_id, messages);
// messages is Array<UserMessageSummary> — needed to build processSummariesMap
```

Internally `useConversationWindow.jumpTo` builds `Map<processId, summary>` from the passed list.

### 6. Deletions

Remove from backend:
- `EntriesQuery::around` and `EntriesQuery::after` parameters
- `NormalizedEntry::find_by_execution_id_around`
- `NormalizedEntry::find_by_execution_id_after`
- Related match arms in `get_normalized_entries` handler

Keep:
- `find_by_execution_id_cursor` with `before` parameter (used by tail-mode hook)

Remove from frontend:
- `around` and `after` options from `getEntries`
- All per-process tracking refs in `useConversationWindow`

### 7. Not in scope

- Tail mode (`useConversationHistoryOld`) — unchanged
- WS streaming — unchanged (still per-process)
- Memory eviction of old entries — deferred
- Pushing live WS updates into anchored window — deferred
