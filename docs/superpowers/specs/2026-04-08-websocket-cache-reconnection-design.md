# WebSocket Cache for Running Process Reconnection

## Problem

When viewing a running coding agent task, every WebSocket reconnection (network blip, tab switch causing WS timeout) triggers a full replay from the server via `/normalized-logs/ws`. The frontend clears its entries array and rebuilds from scratch, causing:

1. **Wasted bandwidth**: The server re-sends the entire entry history on each reconnection.
2. **Slow loading**: Large conversations take noticeable time to re-stream.
3. **Poor scroll UX**: The UI re-renders all entries from the top and scrolls down to the bottom, instead of staying at the latest position instantly.

## Solution

Leverage the **existing but unused** `/normalized-logs-live/ws?after={index}` backend endpoint to implement resume-on-reconnect.

- **First connection**: Use `/normalized-logs/ws` as today (full history + live stream).
- **Track max entry index**: As entries arrive via JSON patches (`/entries/{N}`), track the highest `N` seen.
- **On reconnect**: Switch to `/normalized-logs-live/ws?after={maxIndex}` so the server only sends entries with index > maxIndex (plus any replace operations for existing entries).
- **Preserve in-memory state**: Don't clear the entries array on reconnect. The existing entries stay rendered, new entries append seamlessly.
- **Scroll behavior**: UI stays at the bottom; new entries appear instantly since the cached entries are already rendered.

## Architecture

### Data Flow

```
First connect:   /normalized-logs/ws
                 -> receives entries 0..N, tracks maxIndex=N
                 -> UI renders, scrolls to bottom

WS drops:        entries stay in memory (no reset)

Reconnect:       /normalized-logs-live/ws?after=N
                 -> server sends only entries N+1.. and replace ops
                 -> frontend appends new entries, updates replaced ones
                 -> UI stays at bottom, new entries appear seamlessly
```

### Backend (no changes needed)

The `/normalized-logs-live/ws?after={index}` endpoint already exists in `crates/server/src/routes/execution_processes.rs`:

- Handler: `stream_normalized_logs_live_ws`
- Query parameter: `LiveLogsQuery { after: Option<i64> }`
- Implementation in `container.rs` `stream_live_normalized_logs()`:
  - Reads from `NormalizedEntryStore.history_plus_live()`
  - Filters: sends entries where `index > after_index` OR the operation is a `replace`
  - Sends `Finished` when the process completes

This correctly handles:
- New entries added after the client's last seen index
- Replace operations (e.g., tool status updates from `pending` to `success`)
- Process completion during the reconnection gap

### Frontend Changes

#### 1. `streamJsonPatchEntries.ts` - Add reconnect-with-resume

Currently `streamJsonPatchEntries` creates a single WebSocket connection with no reconnect logic. Changes:

- Add `maxEntryIndex` tracking: extract index from patch paths (`/entries/{N}`) and maintain the highest seen.
- Add reconnection config: `reconnect?: { maxRetries: number; getReconnectUrl: (maxIndex: number) => string }`.
- On non-clean WS close (and not `finished`), schedule reconnect using exponential backoff: 500ms, 1s, 2s, 4s, 8s (capped at 8s), up to `maxRetries` attempts.
- On reconnect, call `getReconnectUrl(maxEntryIndex)` to get the live endpoint URL.
- Do NOT reset `snapshot` on reconnect — keep accumulated entries intact.
- Apply incoming patches (from live endpoint) on top of existing snapshot.
- Expose `isReconnecting` state for callers that want to show a subtle indicator.

#### 2. `useConversationHistoryOld.ts` - `loadRunningAndEmit` callback

Currently calls `streamJsonPatchEntries(url, opts)` with `url = /api/execution-processes/{id}/normalized-logs/ws`. Changes:

- Pass reconnection config:
  ```typescript
  streamJsonPatchEntries(url, {
    ...opts,
    reconnect: {
      maxRetries: 10,
      getReconnectUrl: (maxIndex) =>
        `/api/execution-processes/${executionProcess.id}/normalized-logs-live/ws?after=${maxIndex}`,
    },
  });
  ```
- The `onEntries` callback already handles full snapshot replacement, so it works for both initial and incremental updates without changes.

#### 3. Remove entry-clearing on reconnect

In the current `loadRunningAndEmit`, the `onEntries` callback fully replaces entries each time. Since `streamJsonPatchEntries` maintains a cumulative `snapshot.entries` and calls `onEntries` with the full array after each patch, this naturally works: on reconnect, the live endpoint sends only new/changed patches, the snapshot grows, and `onEntries` is called with the full (cached + new) array.

No explicit "stop clearing" change needed — the key is that `streamJsonPatchEntries` preserves its `snapshot` across reconnections instead of creating a new WebSocket (and new snapshot) from scratch.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Replace operations (tool status updates) | Live endpoint forwards all replaces regardless of index. Patches apply correctly to existing snapshot entries. |
| Process finishes during disconnect | Live endpoint sends all entries with index > N plus `Finished`. Gap fully covered. |
| Component unmount/remount | Falls back to full replay via `/normalized-logs/ws` (same as today). This optimization only covers reconnects within a single mount cycle. |
| Long disconnection | Still works. `NormalizedEntryStore` (running) or DB (completed) has full history. The live endpoint filters correctly. |
| maxIndex=0 (no entries received yet) | Live endpoint with `after=0` effectively sends all entries — equivalent to full replay. Graceful degradation. |
| Concurrent replace + add | `dedupeOps` in `streamJsonPatchEntries` already handles multiple ops on the same path — last write wins. |

## Scope

### Changed
- `frontend/src/utils/streamJsonPatchEntries.ts` — add reconnection with resume
- `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` — pass reconnect config to `streamJsonPatchEntries`

### Unchanged
- Backend (all endpoints already exist)
- `useLogStream.ts` (raw-logs for scripts — not in scope)
- `useJsonPatchWsStream.ts` (used by execution process list, not conversation entries)
- `conversationCache.ts` (IndexedDB cache for completed processes)
- Scroll behavior logic
- `VirtualizedList.tsx` and other display components

## Success Criteria

1. When a WebSocket connection drops during a running task, the UI does NOT clear and re-render entries from scratch.
2. On reconnection, only new entries are fetched from the server (verifiable via network inspector — the live endpoint URL should appear with `?after=N`).
3. The scroll position stays at the bottom and new entries append seamlessly.
4. Replace operations (tool status changes) still update correctly after reconnection.
5. If the process completes during a disconnect, the full remaining entries appear and `Finished` is received.
