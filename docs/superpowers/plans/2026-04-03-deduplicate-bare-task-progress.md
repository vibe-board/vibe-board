# Deduplicate Task Progress Entries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- []`) syntax for tracking.

**Goal:** Stop consecutive identical `task_progress` system messages from flooding the UI by merging them into a single entry with a dice icon indicator.

**Architecture:** Backend tracks consecutive task_progress entries via fingerprint comparison and merges identical ones using `ConversationPatch::replace`. Frontend detects the merged entry pattern and renders a cycling dice icon for the active (last) entry, hiding stale ones.

**Tech Stack:** Rust (SQLx, serde, json_patch), TypeScript/React, lucide-react (Dice1-6 icons)

---

## File map

| File | Purpose |
|------|---------|
| `crates/executors/src/executors/claude.rs` | Backend: add state fields to `ClaudeLogProcessor`, handle `task_progress` subtype with merge logic, reset on other events |
| `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Frontend: detect task_progress pattern, render dice icon, hide stale entries |

---

### Task 1: Backend — Add task_progress tracking state to ClaudeLogProcessor

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`

- [ ] **Step 1: Find the ClaudeLogProcessor struct**

Read the struct definition around line 530 of `crates/executors/src/executors/claude.rs`. It should look like:

```rust
pub struct ClaudeLogProcessor {
    model_name: Option<String>,
    tool_map: HashMap<String, ClaudeToolCallInfo>,
    strategy: HistoryStrategy,
    streaming_messages: HashMap<String, StreamingMessageState>,
    streaming_message_id: Option<String>,
    last_assistant_message: Option<String>,
    pending_tool_statuses: HashMap<String, Vec<(ToolStatus, String)>>,
}
```

- [ ] **Step 2: Add three new fields**

Add after the last field:

```rust
    // Track consecutive task_progress entries for deduplication
    task_progress_index: Option<usize>,
    task_progress_count: u32,
    task_progress_fingerprint: Option<String>,
```

- [ ] **Step 3: Update the constructor / Default impl**

Find the `new()` or `Default` impl for `ClaudeLogProcessor` and add the new fields with default values:

```rust
task_progress_index: None,
task_progress_count: 0,
task_progress_fingerprint: None,
```

- [ ] **Step 4: Verify compilation**

Run: `cargo check -p executors`
Expected: Compiles successfully

---

### Task 2: Backend — Handle task_progress subtype with merge logic

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`

- [ ] **Step 1: Find the task_progress handling area**

Look for the match arm at approximately line 1005:

```rust
Some("compact_boundary") | Some("task_started") => {}
Some(subtype) => {
    let entry = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::SystemMessage,
        content: format!("System: {subtype}"),
        metadata: Some(
            serde_json::to_value(claude_json)
                .unwrap_or(serde_json::Value::Null),
        ),
    };
    let idx = entry_index_provider.next();
    patches.push(ConversationPatch::add_normalized_entry(idx, entry));
}
```

- [ ] **Step 2: Add a dedicated `task_progress` arm before the generic fallback**

Replace the generic `Some(subtype)` arm with a specific `Some("task_progress")` arm:

```rust
Some("task_progress") => {
    let fingerprint = serde_json::to_value(claude_json)
        .map(|v| v.to_string())
        .unwrap_or_default();

    if let Some(idx) = self.task_progress_index
        && self.task_progress_fingerprint.as_deref() == Some(fingerprint.as_str())
    {
        // Same content as previous → merge by replacing
        self.task_progress_count += 1;
        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::SystemMessage,
            content: format!("task_progress:{}", self.task_progress_count),
            metadata: None,
        };
        patches.push(ConversationPatch::replace(idx, entry));
    } else {
        // First or different → new entry
        self.task_progress_index = Some(entry_index_provider.next());
        self.task_progress_count = 1;
        self.task_progress_fingerprint = Some(fingerprint);
        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::SystemMessage,
            content: "task_progress:1".to_string(),
            metadata: None,
        };
        let idx = self.task_progress_index.unwrap();
        patches.push(ConversationPatch::add_normalized_entry(idx, entry));
    }
}
Some(subtype) => {
    // Reset task_progress chain since a different system message appeared
    self.task_progress_index = None;
    self.task_progress_count = 0;
    self.task_progress_fingerprint = None;

    let entry = NormalizedEntry {
        timestamp: None,
        entry_type: NormalizedEntryType::SystemMessage,
        content: format!("System: {subtype}"),
        metadata: Some(
            serde_json::to_value(claude_json)
                .unwrap_or(serde_json::Value::Null),
        ),
    };
    let idx = entry_index_provider.next();
    patches.push(ConversationPatch::add_normalized_entry(idx, entry));
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p executors`
Expected: Compiles successfully

---

### Task 3: Backend — Reset task_progress state on non-task_progress events

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`

- [ ] **Step 1: Add a helper method for resetting**

Add a method to `ClaudeLogProcessor`:

```rust
fn reset_task_progress(&mut self) {
    self.task_progress_index = None;
    self.task_progress_count = 0;
    self.task_progress_fingerprint = None;
}
```

- [ ] **Step 2: Add reset calls in the following match arms**

In `normalize_entries`, find each of these match arms and add `self.reset_task_progress();` at the start of their body (before any patch generation):

1. `ClaudeJson::Assistant { message, .. }` — around line 1034, add at the very start:
   ```rust
   self.reset_task_progress();
   ```

2. `ClaudeJson::User { message, is_synthetic, is_replay, .. }` — around line 1120, add after the `is_replay` early return:
   ```rust
   if *is_replay {
       return patches;
   }
   self.reset_task_progress();
   ```

3. `ClaudeJson::ToolResult { .. }` — around line 1375:
   ```rust
   self.reset_task_progress();
   ```

4. `ClaudeJson::Result { .. }` — find this arm and add reset there too.

Do NOT add reset to `ClaudeJson::System { subtype, .. }` — the task_progress arm handles its own reset logic.

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p executors`
Expected: Compiles successfully

---

### Task 4: Backend — Unit tests for task_progress merging

**Files:**
- Modify: `crates/executors/src/executors/claude.rs` (test module)

- [ ] **Step 1: Find existing tests**

Search for `#[cfg(test)]` in `claude.rs`. There should be a test module at the bottom of the file.

- [ ] **Step 2: Add test for consecutive merge**

```rust
#[test]
fn test_task_progress_consecutive_merge() {
    use crate::logs::utils::patch::extract_normalized_entry_from_patch;

    let mut processor = ClaudeLogProcessor::new(HistoryStrategy::Standard);
    let entry_index = EntryIndexProvider::new();

    // First task_progress → creates new entry
    let system1 = ClaudeJson::System {
        subtype: Some("task_progress".to_string()),
        api_key_source: None,
        model: None,
        status: None,
        slash_commands: vec![],
        plugins: vec![],
        agents: vec![],
    };
    let patches1 = processor.normalize_entries(&system1, "/tmp", &entry_index);
    assert_eq!(patches1.len(), 1);
    // Extract the entry to check content
    let (idx1, entry1) = extract_normalized_entry_from_patch(&patches1[0]).unwrap();
    assert_eq!(entry1.content, "task_progress:1");

    // Second task_progress (identical) → should REPLACE, not ADD
    let system2 = ClaudeJson::System {
        subtype: Some("task_progress".to_string()),
        api_key_source: None,
        model: None,
        status: None,
        slash_commands: vec![],
        plugins: vec![],
        agents: vec![],
    };
    let patches2 = processor.normalize_entries(&system2, "/tmp", &entry_index);
    assert_eq!(patches2.len(), 1);
    // Should be a replace at the same index
    let (idx2, entry2) = extract_normalized_entry_from_patch(&patches2[0]).unwrap();
    assert_eq!(idx2, idx1);
    assert_eq!(entry2.content, "task_progress:2");
}
```

- [ ] **Step 3: Add test for reset on different message**

```rust
#[test]
fn test_task_progress_resets_on_other_message() {
    use crate::logs::utils::patch::extract_normalized_entry_from_patch;

    let mut processor = ClaudeLogProcessor::new(HistoryStrategy::Standard);
    let entry_index = EntryIndexProvider::new();

    // task_progress
    let system1 = ClaudeJson::System {
        subtype: Some("task_progress".to_string()),
        api_key_source: None,
        model: None,
        status: None,
        slash_commands: vec![],
        plugins: vec![],
        agents: vec![],
    };
    let patches1 = processor.normalize_entries(&system1, "/tmp", &entry_index);
    let (idx1, _) = extract_normalized_entry_from_patch(&patches1[0]).unwrap();

    // Different system message → resets
    let system_other = ClaudeJson::System {
        subtype: Some("status".to_string()),
        api_key_source: None,
        model: None,
        status: Some("working".to_string()),
        slash_commands: vec![],
        plugins: vec![],
        agents: vec![],
    };
    processor.normalize_entries(&system_other, "/tmp", &entry_index);

    // Another task_progress → should be a NEW entry (different index)
    let system2 = ClaudeJson::System {
        subtype: Some("task_progress".to_string()),
        api_key_source: None,
        model: None,
        status: None,
        slash_commands: vec![],
        plugins: vec![],
        agents: vec![],
    };
    let patches2 = processor.normalize_entries(&system2, "/tmp", &entry_index);
    let (idx2, entry2) = extract_normalized_entry_from_patch(&patches2[0]).unwrap();
    assert_ne!(idx2, idx1); // New index
    assert_eq!(entry2.content, "task_progress:1"); // Reset to 1
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --workspace`
Expected: All tests pass

---

### Task 5: Frontend — Render dice icon for active task_progress, hide stale

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`

- [ ] **Step 1: Add dice imports**

At the top of the file, add to the lucide-react import:

```tsx
import {
  AlertCircle,
  Bot,
  Brain,
  CheckSquare,
  ChevronDown,
  Clock,
  Dice1,
  Dice2,
  Dice3,
  Dice4,
  Dice5,
  Dice6,
  Gauge,
  Hammer,
  Edit,
  Eye,
  Globe,
  Plus,
  Search,
  Settings,
  Terminal,
  User,
  Wrench,
} from 'lucide-react';
```

- [ ] **Step 2: Add a task_progress detection helper**

Add near the top of the component (after the existing helpers):

```tsx
const DICE_ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

const isTaskProgressEntry = (entry: NormalizedEntry | ProcessStartPayload): boolean => {
  if (!('entry_type' in entry)) return false;
  return entry.entry_type.type === 'system_message' &&
    /^task_progress:\d+$/.test(entry.content);
};

const getTaskProgressCount = (content: string): number => {
  const match = content.match(/^task_progress:(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};
```

- [ ] **Step 3: Update the Props type to include isLastEntry**

Modify the `Props` type:

```tsx
type Props = {
  entry: NormalizedEntry | ProcessStartPayload;
  expansionKey: string;
  diffDeletable?: boolean;
  executionProcessId?: string;
  taskAttempt?: WorkspaceWithSession;
  task?: Task;
  isLastEntry?: boolean;
};
```

- [ ] **Step 4: Add task_progress rendering logic**

In the component body, after the `const isLoading = entryType.type === 'loading';` line, add:

```tsx
// Task progress dice indicator
if (isTaskProgressEntry(entry) && isNormalizedEntry(entry)) {
  if (!isLastEntry) {
    return null; // Hide stale task_progress entries
  }
  const count = getTaskProgressCount(entry.content);
  const DiceIcon = DICE_ICONS[(count - 1) % 6];
  return (
    <div className="px-4 py-2 flex items-center gap-2 text-muted-foreground">
      <DiceIcon className="h-4 w-4" />
    </div>
  );
}
```

- [ ] **Step 5: Pass isLastEntry from VirtualizedList**

In `frontend/src/components/logs/VirtualizedList.tsx`, update the `renderItem` function and the call to `DisplayConversationEntry`:

```tsx
const renderItem = useCallback(
  (
    data: PatchTypeWithKey,
    ctx: { attempt: WorkspaceWithSession; task?: Task },
    isLast: boolean
  ) => {
    if (!data) return null;
    if (data.type === 'STDOUT') return <p>{data.content}</p>;
    if (data.type === 'STDERR') return <p>{data.content}</p>;
    if (data.type === 'NORMALIZED_ENTRY' && ctx.attempt) {
      return (
        <DisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={ctx.attempt}
          task={ctx.task}
          isLastEntry={isLast}
        />
      );
    }
    return null;
  },
  []
);
```

And update the map call to pass the `isLast` flag:

```tsx
{virtualItems.map((virtualRow) => {
  const entry = entries[virtualRow.index];
  const isLast = virtualRow.index === entries.length - 1;
  return (
    <div
      key={virtualRow.key}
      data-index={virtualRow.index}
      ref={virtualizer.measureElement}
    >
      {renderItem(entry, context, isLast)}
    </div>
  );
})}
```

- [ ] **Step 6: Verify TypeScript**

Run: `pnpm run check`
Expected: No type errors

---

### Task 6: Verify everything

- [ ] **Step 1: Run Rust checks**

Run: `cargo check --workspace`
Expected: Compiles

- [ ] **Step 2: Run Rust tests**

Run: `cargo test --workspace`
Expected: All pass

- [ ] **Step 3: Run frontend checks**

Run: `pnpm run check`
Expected: No errors

- [ ] **Step 4: Run lint**

Run: `pnpm run lint`
Expected: No errors

- [ ] **Step 5: Generate types (if needed)**

Run: `pnpm run generate-types`
Expected: No changes (we didn't modify any shared types)
