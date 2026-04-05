# Fix: AskUserQuestion Validation Error Renders Broken Interactive UI

## Problem

When a Claude model calls `AskUserQuestion` with more than 4 options, Claude Code rejects the call with an `InputValidationError` (`is_error: true` tool_result). The model retries with a valid call (<=4 options). The user sees **two question banners** — the first from the failed call, the second from the retry — and **neither is clickable**.

### Root Cause

Two bugs combine:

**Bug A — Backend: tool_result error for AskUserQuestion is silently ignored**

In `claude.rs`, the `ClaudeJson::User` handler processes `ClaudeContentItem::ToolResult` entries by matching `tool_data` type against if/else-if branches (Bash, Task, Unknown/Oracle/Mermaid/CodebaseSearchAgent/NotebookEdit). `ClaudeToolData::AskUserQuestion` does not match any branch, so when the `is_error: true` tool_result arrives, the entry status is never updated from `Created` to `Failed`.

Location: `crates/executors/src/executors/claude.rs`, lines 1277-1404 (tool_result processing in `ClaudeJson::User` handler).

**Bug B — Frontend: AskUserQuestion banner renders regardless of entry status**

In `DisplayConversationEntry.tsx:906`, the rendering check only tests `toolEntry.action_type.action === 'ask_user_question'` — it does not verify that status is `pending_approval`. This means entries with status `Created` (or `Failed`, `TimedOut`, etc.) still render the interactive `AskUserQuestionBanner`. The banner receives `approvalId=null` (since status isn't `pending_approval`), making `handleSubmitAnswers` return early on click — visually interactive, functionally dead.

Location: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`, line 906.

### Observed Event Sequence (from stream log)

1. Model outputs `AskUserQuestion` tool_use with 6 options (`call_6128...`)
2. Claude Code validates input, returns `InputValidationError` as `tool_result` with `is_error: true`
3. Backend normalizer processes the `tool_result` — no branch matches `AskUserQuestion` — **status stays `Created`**
4. Model retries with `AskUserQuestion` containing 4 options (`call_59fc...`)
5. Valid call gets `approval_requested` → status becomes `PendingApproval`
6. Question times out → `question_response: timed_out` → status becomes `TimedOut`
7. Frontend renders **both** entries as `AskUserQuestionBanner` — first is stuck, second is timed out

## Solution

### Backend: Handle AskUserQuestion in tool_result processing

**File: `crates/executors/src/executors/claude.rs`**

Add an `else if` branch for `ClaudeToolData::AskUserQuestion` in the tool_result processing section (after the existing `Unknown/Oracle/Mermaid/CodebaseSearchAgent/NotebookEdit` branch, around line 1404):

```rust
} else if matches!(info.tool_data, ClaudeToolData::AskUserQuestion { .. }) {
    let status = if is_error.unwrap_or(false) {
        ToolStatus::Failed
    } else {
        ToolStatus::Success
    };
    self.replace_tool_entry_status(
        tool_use_id,
        status,
        worktree_path,
        &mut patches,
    );
}
```

This follows the exact pattern used by other tool types. No result data needs to be stored — AskUserQuestion's validation error content isn't meaningful to display.

### Frontend: Only render interactive banner when status is pending_approval

**File: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`**

Change line 906 from:
```tsx
if (toolEntry.action_type.action === 'ask_user_question') {
```

To:
```tsx
if (toolEntry.action_type.action === 'ask_user_question' && isPendingApproval) {
```

And simplify the `approvalId` prop since it's always available when `isPendingApproval` is true:
```tsx
approvalId={status.approval_id}
```

When status is not `pending_approval` (i.e., `Created`, `Failed`, `Success`, `TimedOut`, `Denied`), the entry falls through to the default `ToolCallCard` rendering — a collapsed card with status indicator, which is the correct UX for a non-interactive tool call.

The existing check at line 960 (skip `PendingApprovalEntry` wrapper for `ask_user_question`) remains correct and needs no change.

### After the Fix — What Users See

| Scenario | Before Fix | After Fix |
|---|---|---|
| Failed AskUserQuestion (validation error) | Interactive-looking banner, not clickable | Collapsed ToolCallCard with failed indicator |
| Pending AskUserQuestion | Interactive banner (correct) | Interactive banner (unchanged) |
| Timed-out AskUserQuestion | Collapsed ToolCallCard | Collapsed ToolCallCard (unchanged) |
| Answered AskUserQuestion | Banner renders but returns null (hidden) | Collapsed ToolCallCard with success indicator |

### Testing

**Backend unit test:** Add a test that processes a `ClaudeJson::User` message containing a `ToolResult` for an `AskUserQuestion` tool call with `is_error: true`, and verifies the entry status is updated to `ToolStatus::Failed`.

**Frontend:** Verify that `AskUserQuestionBanner` is not rendered when the entry status is `Created` or `Failed` — it should only appear for `pending_approval` status. The existing rendering for `pending_approval` and `timed_out` statuses should be unaffected.
