# Fix Streaming Text Duplicates in Task Running

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate two types of duplicate messages during task execution: (1) transient duplicate lines within a single streaming text block, and (2) persistent duplicate entries (two separate rows with identical content).

**Architecture:** The bugs share a common root cause in the Codex normalizer's state management. Three contributing factors: (1) empty deltas emit redundant replace patches, (2) cross-clearance between assistant/thinking states causes entry fragmentation, and (3) the frontend unconditionally fires `notify()` after every WS patch. Fix all layers for defense in depth.

**Tech Stack:** Rust (backend normalizers), TypeScript/React (frontend WebSocket streaming)

---

## Root Causes

### Bug 1: Transient duplicate lines within a single entry

During streaming, the backend normalizers emit `replace` patches to update accumulated text in-place. Two pathways produce redundant replace patches whose content is identical to what already exists:

1. **Codex empty delta**: `AgentMessageDelta { delta: "" }` causes `push_str("")` (no-op on content) but still emits a replace patch with identical content. The opencode normalizer already guards against this at `opencode/normalize_logs.rs:724` (`if text.is_empty() { return; }`), but the codex normalizer lacks this guard.

2. **Final Set event**: After streaming deltas accumulate text, a final `AgentMessage` (codex) or `MessagePartUpdated { delta: None }` (opencode) arrives with the full text using `UpdateMode::Set`. If the full text matches what was already accumulated via deltas, a redundant replace patch is emitted.

These redundant patches reach the frontend because ALL `replace` patches bypass the cursor filter in `container.rs` (`is_replace || (index as i64) > after_index`). The frontend then unconditionally calls `notify()` → `setEntries()` → React re-render → editor re-renders with same content → transient duplicate line visible.

### Bug 2: Persistent duplicate entries (two separate rows with identical content)

The codex normalizer's event handlers unconditionally clear the *other* streaming state:

- `AgentReasoningDelta` (line 495): `state.assistant = None` — destroys assistant streaming state
- `AgentMessageDelta` (line 490): `state.thinking = None` — destroys thinking streaming state
- `AgentReasoningSectionBreak` (lines 515-516): clears both

This cross-clearance causes entry fragmentation. Sequence:

1. `AgentMessageDelta("full text...")` accumulates at index N
2. `AgentReasoningDelta(...)` arrives → `state.assistant = None` (clears assistant state!)
3. `AgentMessage(full_text)` arrives with `UpdateMode::Set` → `state.assistant` is None → allocates **new** index N+1

Result: index N has the full accumulated text, index N+1 has the same full text from Set. Two separate rows, identical content.

The opencode normalizer avoids this by using `HashMap<String, StreamingText>` keyed by `message_id` — each message has independent streaming state with no cross-clearance.

## Files to Modify

- `crates/executors/src/executors/codex/normalize_logs.rs` — Remove cross-clearance + add empty-content guards
- `frontend/src/utils/streamJsonPatchEntries.ts` — Skip notify when patch is a no-op

---

### Task 1: Fix Codex normalizer — remove cross-clearance + guard empty deltas

**Files:**
- Modify: `crates/executors/src/executors/codex/normalize_logs.rs` (lines 489-517)

- [ ] **Step 1: Remove cross-clearance and guard empty delta in `AgentMessageDelta` handler**

Remove `state.thinking = None` (the final `AgentMessage` handler already clears thinking appropriately). Add empty delta guard:

```rust
EventMsg::AgentMessageDelta(AgentMessageDeltaEvent { delta }) => {
    if delta.is_empty() {
        return;
    }
    let (entry, index, is_new) = state.assistant_message_append(delta);
    upsert_normalized_entry(&msg_store, index, entry, is_new);
}
```

- [ ] **Step 2: Remove cross-clearance and guard empty delta in `AgentReasoningDelta` handler**

Remove `state.assistant = None` (the final `AgentReasoning` handler already clears assistant appropriately). Add empty delta guard:

```rust
EventMsg::AgentReasoningDelta(AgentReasoningDeltaEvent { delta }) => {
    if delta.is_empty() {
        return;
    }
    let (entry, index, is_new) = state.thinking_append(delta);
    upsert_normalized_entry(&msg_store, index, entry, is_new);
}
```

- [ ] **Step 3: Remove `state.assistant = None` from `AgentReasoningSectionBreak` handler**

Section breaks should not destroy the assistant streaming state. Keep only `state.thinking = None`:

```rust
EventMsg::AgentReasoningSectionBreak(AgentReasoningSectionBreakEvent {
    item_id: _,
    summary_index: _,
}) => {
    state.thinking = None;
}
```

- [ ] **Step 4: Run Rust tests to verify**

Run: `cargo test --workspace`
Expected: PASS (no functional change to non-empty paths)

- [ ] **Step 5: Commit**

```bash
git add crates/executors/src/executors/codex/normalize_logs.rs
git commit -m "fix(codex-normalizer): remove cross-clearance between assistant/thinking states and skip empty deltas"
```

---

### Task 2: Skip frontend notify when patch is a no-op

**Files:**
- Modify: `frontend/src/utils/streamJsonPatchEntries.ts:76-91`

- [ ] **Step 1: Add snapshot comparison before notify**

In `handleMessage`, after applying the patch to the cloned snapshot, compare it against the previous snapshot. Only call `notify()` if something actually changed:

```typescript
const handleMessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.JsonPatch) {
        const raw = msg.JsonPatch as Operation[];
        const ops = dedupeOps(raw);

        // Apply to a working copy (applyPatch mutates)
        const next = structuredClone(snapshot);
        applyUpsertPatch(next, ops);

        // Skip notify if the patch was a no-op (e.g., replace with identical content)
        if (JSON.stringify(next) === JSON.stringify(snapshot)) {
          return;
        }

        snapshot = next;
        notify();
      }

      if (msg.finished !== undefined) {
        opts.onFinished?.(snapshot.entries);
        ws.close();
      }
    } catch (err) {
      opts.onError?.(err);
    }
  };
```

Note: `JSON.stringify` comparison is acceptable here because:
- The snapshot is small (typically <50 entries)
- This only runs on WS messages (not a hot path)
- It prevents unnecessary React re-renders which are far more expensive

- [ ] **Step 2: Run frontend type check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/streamJsonPatchEntries.ts
git commit -m "fix(stream-ws): skip notify when JSON patch produces no actual change"
```

---

### Task 3: Verify end-to-end

- [ ] **Step 1: Run full workspace checks**

```bash
cargo test --workspace
pnpm run check
pnpm run lint
```

Expected: All PASS

- [ ] **Step 2: Manual verification**

Start the dev server and run a task that produces streaming text (Codex or OpenCode agent task). Verify:
- No duplicate lines appear in the markdown block during streaming
- Streaming text still updates correctly (progressive build-up works)
- Final text is correct after streaming completes

---

## Why Not More Aggressive Fixes?

**Content-comparison in backend normalizers before emitting replace:** The normalizers don't have easy access to the previously broadcast content. Adding this would require tracking last-emitted content per entry index, increasing state complexity. The empty-content guard fixes the most common pathway, and the frontend guard catches everything else.

**Dedup by patchKey in `flattenEntriesForEmit`:** The duplicates are within a single entry's content (same NormalizedEntry, same index), not duplicate entries. Dedup by patchKey wouldn't help.

**Dedup in `applyUpsertPatch`:** This function operates at the JSON patch level and doesn't understand domain semantics. Adding content comparison here would be the wrong abstraction layer.
