# Scroll Prepend Ordering Bug Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix entry-level pagination in `loadMore` so older entries are inserted after their process's synthetic user message, not blindly prepended to position 0.

**Architecture:** Single function change in `useConversationHistoryOld.ts`. The `setEntries` callback inside the entry-level pagination branch currently does `[...unique, ...prev]`. We replace this with a targeted splice that finds the correct insertion index within the owning process's slice of the entries array.

**Tech Stack:** React, TypeScript

---

### Task 1: Fix entry-level pagination insertion ordering

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts:1047-1057`

- [ ] **Step 1: Replace blind prepend with targeted insert**

In `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts`, find the `setEntries` callback inside the entry-level pagination branch (around line 1047). Replace the entire callback:

Current code (lines 1047-1057):
```ts
            setEntries((prev) => {
              const existingKeys = new Set(prev.map((e) => e.patchKey));
              const unique = toPrepend.filter(
                (e) => !existingKeys.has(e.patchKey)
              );
              if (unique.length === 0) return prev;
              lastPrependCountRef.current = unique.length;
              const next = [...unique, ...prev];
              entriesLengthRef.current = next.length;
              return next;
            });
```

Replace with:
```ts
            setEntries((prev) => {
              const existingKeys = new Set(prev.map((e) => e.patchKey));
              const unique = toPrepend.filter(
                (e) => !existingKeys.has(e.patchKey)
              );
              if (unique.length === 0) return prev;

              // Find the correct insertion point: the first non-user
              // entry belonging to this process. New entries go right
              // before it (i.e. after the synthetic user message).
              const pid = processWithMore.executionProcess.id;
              let insertIdx = -1;
              let userMsgIdx = -1;
              for (let i = 0; i < prev.length; i++) {
                if (prev[i].executionProcessId !== pid) continue;
                if (prev[i].patchKey.endsWith(':user')) {
                  userMsgIdx = i;
                } else {
                  insertIdx = i;
                  break;
                }
              }
              // Fallback: after user message, or position 0 if neither found
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

- [ ] **Step 2: Run type check**

Run: `cd frontend && pnpm run check`

Expected: No TypeScript errors. The types used (`executionProcessId`, `patchKey`) are existing properties on `PatchTypeWithKey` — no new types introduced.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts
git commit -m "fix(scroll): insert paginated entries after user message, not at position 0

Entry-level pagination in loadMore blindly prepended fetched entries
to the entire entries array. When the paginated process was the
earliest displayed, this placed entries before its synthetic user
message. Now we find the correct insertion index within the process's
slice of the array."
```
