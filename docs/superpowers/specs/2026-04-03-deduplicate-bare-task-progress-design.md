# Deduplicate Bare Task Progress Entries

## Problem

When Claude Code uses subagents (Agent tool), it emits frequent `system` messages with `subtype: "task_progress"`. These are currently handled by the generic fallback in `claude.rs`:

```rust
// crates/executors/src/executors/claude.rs:1006-1017
Some(subtype) => {
    let entry = NormalizedEntry {
        entry_type: NormalizedEntryType::SystemMessage,
        content: format!("System: {subtype}"),
        ...
    };
    // Each one creates a NEW entry → floods the UI
}
```

Result: dozens of identical "System: Task Progress" cards in the conversation list. They consume storage, clutter the UI, and carry zero information.

## Design

### Scope

Applies to consecutive `task_progress` system messages from Claude Code. When consecutive task_progress polls carry identical information (same content/metadata), they are merged into a single NormalizedEntry.

### Consecutive merging rule

- **Consecutive** `task_progress` entries with identical content are merged into a single NormalizedEntry, updated in-place via `ConversationPatch::replace`.
- **Break in sequence** — any of these between two task_progress entries resets the chain:
  - Any `Assistant` message (even if it's the subagent doing work — tool calls, text, etc.)
  - Any `User` message
  - Any system message with subtype OTHER than `task_progress`
  - Any `Error` message
  - Any tool result

### Backend (`crates/executors/src/executors/claude.rs`)

1. Add state to `ClaudeLogProcessor`:
   - `task_progress_index: Option<usize>` — the entry index of the active task_progress entry, or `None` if no active one.
   - `task_progress_count: u32` — how many consecutive identical task_progress entries have been merged.

2. When handling `subtype: "task_progress"` (currently at line 1005):
   - Serialize the full `ClaudeJson::System` to a fingerprint string for comparison.
   - If `task_progress_index.is_some()` AND fingerprint matches previous → `ConversationPatch::replace(index, entry)` with `content` = `"task_progress:{count+1}"`. Increment count.
   - Otherwise → start a new entry: `ConversationPatch::add_normalized_entry(index, entry)` with `content` = `"task_progress:1"`. Store index and fingerprint.

3. Reset logic — when any of these is emitted, set `task_progress_index = None`:
   - `ClaudeJson::Assistant { .. }`
   - `ClaudeJson::User { .. }` (non-replay)
   - `ClaudeJson::ToolResult { .. }`
   - `ClaudeJson::Error` from ACP
   - Any system message with subtype OTHER than `task_progress`

### Frontend (`frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`)

1. Detect task_progress entries: `entry.entry_type.type === 'system_message'` AND `entry.content` starts with `"task_progress:"`.

2. Extract the count from the content string (e.g., `"task_progress:3"` → count=3).

3. Check if this entry is the **last** entry in the conversation list.

4. If it IS the last entry:
   - Render a dice icon: `Dice1 → Dice2 → Dice3 → Dice4 → Dice5 → Dice6`
   - Icon selection: `(count - 1) % 6` maps to Dice1-Dice6
   - Show no text, just the icon

5. If it is NOT the last entry:
   - **Hide completely** — return `null` from the component

### Entry type

No new `NormalizedEntryType` variant needed. Reuses `SystemMessage` with a `"task_progress:{N}"` content string.

## Files to change

| File | Change |
|------|--------|
| `crates/executors/src/executors/claude.rs` | Add `task_progress_index`/`task_progress_count`/`task_progress_fingerprint` fields; handle `task_progress` subtype with merge logic; reset on other events |
| `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Import Dice1-6; detect task_progress content pattern; render dice icon when last entry; hide otherwise |

## Verification

1. `cargo test --workspace` — all existing tests pass
2. `pnpm run check` — TypeScript checks pass
3. `pnpm run lint` — lint passes
4. Manual test: start a task that spawns subagents, verify:
   - Only one dice entry appears during long task_progress sequences
   - Dice face changes periodically as count increments
   - When subagent produces tool calls / new messages, task_progress chain resets
   - New task_progress after a break starts a fresh dice entry with count=1
