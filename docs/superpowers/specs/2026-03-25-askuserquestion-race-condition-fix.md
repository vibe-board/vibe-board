# Fix: AskUserQuestion Race Condition — PendingApproval Status Dropped

## Problem

The `AskUserQuestion` tool sometimes doesn't show up in the UI. The user must click "Stop" to force a re-render, which then makes the question appear.

### Root Cause

A race condition in the `ClaudeLogProcessor` normalizer (`crates/executors/src/executors/claude.rs`).

**Normal flow:**
1. Claude outputs an assistant message containing `ToolUse` content → normalizer adds entry to `tool_map`
2. Protocol peer receives `ControlRequest` → `on_can_use_tool()` → writes `ApprovalRequested` to log_writer
3. Normalizer processes `ApprovalRequested` → `replace_tool_entry_status` looks up `tool_map`, finds entry, patches status to `PendingApproval`
4. Frontend renders `AskUserQuestionBanner`

**Bug flow:**
1. Protocol peer receives `ControlRequest` first → `on_can_use_tool()` → writes `ApprovalRequested` to log_writer
2. Normalizer processes `ApprovalRequested` → `replace_tool_entry_status` looks up `tool_map` → entry not found → silently dropped
3. Claude outputs assistant message with `ToolUse` → normalizer adds entry with `ToolStatus::Created` (never updated)
4. Frontend renders `ToolEntry` (not the question banner) since status is `Created`, not `PendingApproval`

This race condition affects all three callers of `replace_tool_entry_status`:
- **`ApprovalRequested`** (line 1480): Sets `PendingApproval` — the primary bug path for AskUserQuestion
- **`ApprovalResponse`** (line 1495): Sets `Approved`/`Denied`/`TimedOut` after user responds
- **`QuestionResponse`** (line 1538): Sets `Answered`/`TimedOut`

All three can arrive before the corresponding `ToolUse` is added to `tool_map`. The fix (buffering in `replace_tool_entry_status`) covers all three callers uniformly.

The `replace_tool_entry_status` method at line 739 has no fallback when `tool_map` doesn't contain the `tool_call_id`:

```rust
fn replace_tool_entry_status(&mut self, tool_call_id: &str, status: ToolStatus, ...) {
    if let Some(info) = self.tool_map.get(tool_call_id).cloned() {
        // ... update entry
    }
    // NO ELSE — silently drops the status update
}
```

## Solution

Buffer pending status updates in the normalizer when `tool_map` doesn't yet have the entry. When the `ToolUse` entry is later added to `tool_map`, apply any buffered status.

### Changes

**File: `crates/executors/src/executors/claude.rs`**

1. **Add a `pending_tool_statuses` field** to `ClaudeLogProcessor`:
   ```rust
   // tool_call_id -> Vec<(ToolStatus, worktree_path)>
   // Usually 0-1 items per tool_call_id, but handles edge cases
   pending_tool_statuses: HashMap<String, Vec<(ToolStatus, String)>>,
   ```

2. **In `replace_tool_entry_status`** (line 739): Add else branch to buffer the status:
   ```rust
   fn replace_tool_entry_status(...) {
       if let Some(info) = self.tool_map.get(tool_call_id).cloned() {
           // existing logic — patch the entry
       } else {
           // Buffer for later when ToolUse entry is added to tool_map
           self.pending_tool_statuses
               .entry(tool_call_id.to_string())
               .or_default()
               .push((status, worktree_path.to_string()));
       }
   }
   ```

3. **When adding ToolUse to `tool_map`** (two locations): After each `tool_map.insert`, check for buffered statuses and apply them.

   **Site 1** — line 1063 (ToolUse in assistant message content):
   ```rust
   self.tool_map.insert(id.clone(), ClaudeToolCallInfo { ... });
   // Apply any buffered statuses that arrived before this ToolUse
   if let Some(buffered) = self.pending_tool_statuses.remove(id) {
       for (status, buffered_worktree) in buffered {
           self.replace_tool_entry_status(id, status, &buffered_worktree, &mut patches);
       }
   }
   ```

   **Site 2** — line 1336 (standalone `ClaudeJson::ToolUse` variant), same pattern after the insert:
   ```rust
   self.tool_map.insert(id.clone(), ClaudeToolCallInfo { ... });
   if let Some(buffered) = self.pending_tool_statuses.remove(id) {
       for (status, buffered_worktree) in buffered {
           self.replace_tool_entry_status(id, status, &buffered_worktree, &mut patches);
       }
   }
   ```

   Note: `worktree_path` is the executor's working directory and does not change across log lines within a single session, so the buffered worktree_path will always match the one used when the `ToolUse` entry is created.

4. **Update constructors** (`new`, `new_with_strategy`): Initialize `pending_tool_statuses: HashMap::new()`.

### Why This Approach

- **Self-contained**: Only touches `ClaudeLogProcessor`, no cross-component changes
- **Backward-compatible**: Existing fast-path (tool_map has the entry) is unchanged
- **Bounded**: `pending_tool_statuses` entries are removed as soon as applied; maximum memory is O(number of in-flight approval requests)
- **Simple**: ~10 lines of new code, easy to reason about
- **Stale entries**: If a `ToolUse` never arrives for a buffered `tool_call_id` (malformed stream), the buffer entry remains indefinitely. This is benign — each entry is O(1) and the scenario is extremely unlikely in practice.

### Testing

- Add unit test that simulates `ApprovalRequested` arriving before `ToolUse`:
  1. Process `ApprovalRequested` log line (no ToolUse in tool_map yet)
  2. Process assistant message with `ToolUse` content
  3. Verify the resulting entry has `ToolStatus::PendingApproval` status
- Existing tests should continue to pass (no behavior change for normal flow)
