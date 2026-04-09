# Fix: Entry-Level Pagination Prepends Entries Before Earliest User Message

## Problem

When scrolling up on the task detail page, there is a low-probability bug where
some entries appear above the earliest user message. This should never happen —
a process's entries must always appear after its synthetic user message.

## Root Cause

In `useConversationHistoryOld.ts`, the `loadMore` function handles two kinds of
pagination:

1. **Entry-level pagination** (lines 974-1074): fetches older entries within an
   already-displayed process that has `hasMoreEntries = true`.
2. **Process-level pagination** (lines 1076-1144): loads an entirely new historic
   process.

The entry-level pagination path blindly prepends fetched entries to the **entire**
`entries` array:

```ts
setEntries((prev) => {
  const existingKeys = new Set(prev.map((e) => e.patchKey));
  const unique = toPrepend.filter((e) => !existingKeys.has(e.patchKey));
  if (unique.length === 0) return prev;
  lastPrependCountRef.current = unique.length;
  return [...unique, ...prev];  // <-- always prepends to position 0
});
```

When the paginated process is the **earliest** displayed process, this places its
older entries before its own synthetic user message (which has
`patchKey = processId:user`).

### Why It Is Low Probability

Entry-level pagination only triggers when a process has more than 50 entries (the
initial/pagination page size). Most processes have fewer entries, so the bug only
manifests for long-running conversation turns.

### Why Process-Level Pagination Is Unaffected

Process-level pagination prepends an **entire** process (synthetic user message +
entries) to the front of the list. Since the new process is chronologically older
than everything already displayed, prepending to position 0 is correct.

## Fix

Replace the blind prepend in the entry-level `setEntries` callback with a
**targeted insert** that places new entries at the correct position within their
owning process's slice of the array.

### Algorithm

Inside the `setEntries` functional updater for entry-level pagination:

1. Deduplicate `toPrepend` against `prev` (existing logic, unchanged).
2. Find the **insertion index** in `prev`:
   - Scan `prev` for the first entry whose `executionProcessId` matches the
     paginated process AND whose `patchKey` does not end with `:user` (i.e., skip
     the synthetic user message).
   - This is where the process's non-user entries begin.
3. Splice `unique` into `prev` at the insertion index.
4. If no matching entry is found (defensive), fall back to the current prepend
   behavior (prepend to position 0).

### Pseudocode

```ts
setEntries((prev) => {
  const existingKeys = new Set(prev.map((e) => e.patchKey));
  const unique = toPrepend.filter((e) => !existingKeys.has(e.patchKey));
  if (unique.length === 0) return prev;

  // Find insertion point: first non-user entry of this process.
  // If only the synthetic user message exists (no non-user entries yet),
  // insert right after it.
  const processId = processWithMore.executionProcess.id;
  let insertIdx = -1;
  let userMsgIdx = -1;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].executionProcessId !== processId) continue;
    if (prev[i].patchKey.endsWith(':user')) {
      userMsgIdx = i;
    } else {
      insertIdx = i;
      break;
    }
  }
  // Fallback: insert after user message, or prepend if neither found
  if (insertIdx === -1) {
    insertIdx = userMsgIdx !== -1 ? userMsgIdx + 1 : 0;
  }

  lastPrependCountRef.current = unique.length;
  const next = [
    ...prev.slice(0, insertIdx),
    ...unique,
    ...prev.slice(insertIdx),
  ];
  entriesLengthRef.current = next.length;
  return next;
});
```

## Files Changed

| File | Change |
|---|---|
| `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts` | Replace blind prepend with targeted insert in entry-level pagination `setEntries` callback (lines ~1047-1057) |

## Scroll Compensation

The `VirtualizedList` scroll compensation (`useLayoutEffect` on line 67-80) reads
`lastPrependCountRef.current` and shifts `scrollTop` by the height delta. This
mechanism does not depend on *where* items were inserted — it compares total
virtualizer size before and after. A mid-list insert will still produce a correct
delta because items above the viewport shift down by the inserted height, and the
compensation adjusts `scrollTop` accordingly.

However, there is one subtlety: if the insertion point is **below** the current
viewport, scroll compensation should **not** shift `scrollTop` (the user's view
is unaffected). In practice this cannot happen for entry-level pagination because
the user must be scrolled near the top to trigger `loadMore`, and the insertion
point is within the earliest process (which is at or near the top). No change to
scroll compensation is needed.

## Testing

- Manual: find or create a task with a conversation turn containing >50 entries.
  Scroll up repeatedly until entry-level pagination triggers. Verify entries
  appear after the user message, not before it.
- Verify that process-level pagination (loading an entirely new older process)
  still works correctly (entries prepended before all existing entries, with that
  process's user message first).
