# Fix: Streaming Normalized Entry Duplicate and Ordering Bug

## Problem

When Claude Code streams a response with both thinking and text content blocks, the normalized entries can be **duplicated** and **out of order**.

**Observed behavior** (from process log):

Normalized entries produced:
1. "Hi! How can I help you today?" (text)
2. "Hi! How can I help you today?" (text - duplicate)
3. Thinking content (should be before text)

**Expected behavior:**
1. Thinking content (index=0 in stream)
2. "Hi! How can I help you today?" (index=1 in stream)

## Root Cause

The Claude Code process log delivers events in this order for this case:

1. `stream_event: message_start` (id=`gen-XXX`)
2. `stream_event: content_block_start` index=0 (thinking)
3. `stream_event: content_block_delta` index=0 (thinking deltas)
4. `stream_event: content_block_start` index=1 (text)
5. `stream_event: content_block_delta` index=1 (text: "Hi! How can I help you today?")
6. `assistant` message: content=[{text: "Hi!..."}] (partial - text only)
7. `assistant` message: content=[{thinking: "..."}] (partial - thinking only)
8. `stream_event: message_stop`

Two bugs in `ClaudeLogProcessor::normalize_entries()` (`crates/executors/src/executors/claude.rs`):

### Bug 1: `streaming_messages.remove()` on first partial assistant message

At line 1053-1056, the `Assistant` handler does `self.streaming_messages.remove(id)`. When the first partial assistant message (containing only text) arrives, the entire `StreamingMessageState` is consumed. The second partial assistant message (containing only thinking) finds no streaming state, so it allocates a brand-new entry index, placing thinking after text.

### Bug 2: `enumerate()` position mismatch

At line 1058, content items are matched to streaming state by `enumerate()` position:

```rust
for (content_index, item) in message.content.items().enumerate() {
    let entry_index = streaming_message_state
        .as_mut()
        .and_then(|state| state.content_entry_index(content_index));
```

The first partial assistant message has `[{text}]` at enumerate position 0. But in the streaming state, `content_index=0` is **thinking** (not text). So the text entry gets mapped to the thinking block's `entry_index`, replacing the thinking entry with text content. Now both entry 0 (replaced) and entry 1 (from streaming) contain "Hi! How can I help you today?".

## Design

Core principle: **each content block index has its own independent streaming state; entry order is determined by the content block index, not by event arrival order.**

### Change 1: Don't remove streaming state on assistant message

Replace `.remove()` with `.get()` in the `Assistant` handler. Each content block index's streaming state persists independently until `MessageStop`.

```rust
// Before (line 1053-1056):
let mut streaming_message_state = message
    .id.as_ref()
    .and_then(|id| self.streaming_messages.remove(id));

// After:
let streaming_message_state = message
    .id.as_ref()
    .and_then(|id| self.streaming_messages.get(id));
```

### Change 2: Match by content type, not enumerate position

Add `content_entry_index_by_type(&ClaudeContentItem) -> Option<usize>` to `StreamingMessageState`. This method searches `self.contents: HashMap<usize, StreamingContentState>` for the first entry whose `kind` matches the content item's type (Text->Text, Thinking->Thinking) and returns its `entry_index`.

```rust
// Before:
for (content_index, item) in message.content.items().enumerate() {
    let entry_index = streaming_message_state
        .as_mut()
        .and_then(|state| state.content_entry_index(content_index));

// After:
for item in message.content.items() {
    let entry_index = streaming_message_state
        .as_ref()
        .and_then(|state| state.content_entry_index_by_type(&item));
```

### Change 3: Clean up streaming state in MessageStop

Move the cleanup from the `Assistant` handler to `MessageStop`:

```rust
// Before (line 1449-1454):
ClaudeStreamEvent::MessageStop => {
    self.streaming_message_id.take();
}

// After:
ClaudeStreamEvent::MessageStop => {
    if let Some(id) = self.streaming_message_id.take() {
        self.streaming_messages.remove(&id);
    }
}
```

### Edge case: Multiple blocks of same type

If multiple text blocks exist in the same message, `content_entry_index_by_type` returns the first matching streaming entry that has an `entry_index`. To avoid matching the same streaming entry twice within one assistant message, mark matched entries (e.g., track matched indices in a local set during the loop).

## Affected Files

- `crates/executors/src/executors/claude.rs`: `ClaudeLogProcessor::normalize_entries()`, `StreamingMessageState`

## Verification

Replay the process log from the bug report through the normalizer and confirm:
- Entry 0 = thinking content
- Entry 1 = text content ("Hi! How can I help you today?")
- No duplicate entries
