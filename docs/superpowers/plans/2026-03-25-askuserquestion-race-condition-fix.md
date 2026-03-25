# Implementation Plan: AskUserQuestion Race Condition Fix

## File to modify

`crates/executors/src/executors/claude.rs`

## Step 1: Add `pending_tool_statuses` field to `ClaudeLogProcessor`

**Location**: Struct definition at line 467.

```rust
pub struct ClaudeLogProcessor {
    // ... existing fields ...
    // Buffer for status updates that arrive before the ToolUse entry is in tool_map
    pending_tool_statuses: HashMap<String, Vec<(ToolStatus, String)>>,
}
```

**Location**: `new_with_strategy` at line 488. Add initialization:
```rust
pending_tool_statuses: HashMap::new(),
```

## Step 2: Add else branch in `replace_tool_entry_status`

**Location**: Line 739-756. Add else branch to buffer the status:

```rust
fn replace_tool_entry_status(
    &mut self,
    tool_call_id: &str,
    status: ToolStatus,
    worktree_path: &str,
    patches: &mut Vec<json_patch::Patch>,
) {
    if let Some(info) = self.tool_map.get(tool_call_id).cloned() {
        let action_type = Self::extract_action_type(&info.tool_data, worktree_path);
        let entry = Self::tool_use_entry(
            info.tool_name.clone(),
            action_type,
            status,
            info.content.clone(),
        );
        patches.push(ConversationPatch::replace(info.entry_index, entry));
    } else {
        self.pending_tool_statuses
            .entry(tool_call_id.to_string())
            .or_default()
            .push((status, worktree_path.to_string()));
    }
}
```

## Step 3: Replay buffered statuses after tool_map.insert (Site 1)

**Location**: After line 1071 (after `tool_map.insert` in ToolUse content processing):

```rust
self.tool_map.insert(
    id.clone(),
    ClaudeToolCallInfo { ... },
);
// Apply any buffered statuses that arrived before this ToolUse
if let Some(buffered) = self.pending_tool_statuses.remove(id) {
    for (status, buffered_worktree) in buffered {
        self.replace_tool_entry_status(id, status, &buffered_worktree, &mut patches);
    }
}
```

## Step 4: Replay buffered statuses after tool_map.insert (Site 2)

**Location**: After line 1344 (after `tool_map.insert` in `ClaudeJson::ToolUse` variant). Same pattern as Step 3.

## Step 5: Add unit test

**Location**: In the `#[cfg(test)] mod tests` block at end of file (~line 2373).

Test: `test_approval_requested_before_tool_use_is_buffered`
1. Create processor with `ClaudeLogProcessor::new()`
2. Create an `ApprovalRequested` JSON line with a tool_call_id
3. Call `normalize_entries` → should produce no patches (entry not in tool_map yet)
4. Create an assistant message with a `ToolUse` content item using the same tool_call_id
5. Call `normalize_entries` → should produce an add patch with `ToolStatus::PendingApproval` status
6. Verify the entry has `pending_approval` status

## Verification

```bash
cargo test --workspace -p vibe-executors
pnpm run backend:check
```
