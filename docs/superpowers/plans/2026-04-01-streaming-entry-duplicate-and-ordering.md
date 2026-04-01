# Streaming Entry Duplicate and Ordering Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix duplicated text entries and misordered thinking/text blocks when Claude Code assistant messages arrive in multiple parts.

**Architecture:** Three targeted changes in `ClaudeLogProcessor::normalize_entries()` and `StreamingMessageState` — switch `.remove()` to `.get()`, match by content type instead of enumerate position, and move cleanup to `MessageStop`.

**Tech Stack:** Rust (crates/executors)

---

## File Structure

- **Modify:** `crates/executors/src/executors/claude.rs` — all three changes plus tests

---

### Task 1: Write the failing test for partial assistant messages with thinking + text

**Files:**
- Modify: `crates/executors/src/executors/claude.rs` (test module at bottom, ~line 2407)

- [ ] **Step 1: Write the failing test**

Add this test to the `mod tests` block. It simulates the exact event sequence from the bug report: streaming thinking at index=0 and text at index=1, then two partial assistant messages arriving separately.

```rust
#[test]
fn test_partial_assistant_messages_no_duplicate_or_reorder() {
    // Simulate the bug scenario:
    // 1. stream_event: message_start
    // 2. stream_event: content_block_start index=0 (thinking)
    // 3. stream_event: content_block_delta index=0 (thinking text)
    // 4. stream_event: content_block_start index=1 (text)
    // 5. stream_event: content_block_delta index=1 (text)
    // 6. assistant message with only [{text: "Hi!..."}]
    // 7. assistant message with only [{thinking: "..."}]
    // 8. stream_event: message_stop

    let mut processor = ClaudeLogProcessor::new();
    let provider = EntryIndexProvider::test_new();
    let worktree = "/tmp/test";
    let msg_id = "gen-test-123";

    // 1. message_start
    let message_start = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::MessageStart {
            message: ClaudeMessage {
                id: Some(msg_id.to_string()),
                role: "assistant".to_string(),
                model: Some("claude-test".to_string()),
                content: ClaudeContent::Items(vec![]),
                stop_reason: None,
                usage: None,
            },
        },
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    processor.normalize_entries(&message_start, worktree, &provider);

    // 2. content_block_start index=0 (thinking)
    let thinking_block_start = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::ContentBlockStart {
            index: 0,
            content_block: ClaudeContentItem::Thinking {
                thinking: String::new(),
            },
        },
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    processor.normalize_entries(&thinking_block_start, worktree, &provider);

    // 3. content_block_delta index=0 (thinking)
    let thinking_delta = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::ContentBlockDelta {
            index: 0,
            delta: ClaudeContentBlockDelta::ThinkingDelta {
                thinking: "Let me think...".to_string(),
            },
        },
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    let thinking_patches = processor.normalize_entries(&thinking_delta, worktree, &provider);
    // Should create entry at index 0
    assert_eq!(thinking_patches.len(), 1);
    let thinking_entries = patches_to_entries(&thinking_patches);
    assert_eq!(thinking_entries.len(), 1);
    assert!(matches!(thinking_entries[0].entry_type, NormalizedEntryType::Thinking));

    // 4. content_block_start index=1 (text)
    let text_block_start = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::ContentBlockStart {
            index: 1,
            content_block: ClaudeContentItem::Text {
                text: String::new(),
            },
        },
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    processor.normalize_entries(&text_block_start, worktree, &provider);

    // 5. content_block_delta index=1 (text)
    let text_delta = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::ContentBlockDelta {
            index: 1,
            delta: ClaudeContentBlockDelta::TextDelta {
                text: "Hi! How can I help you today?".to_string(),
            },
        },
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    let text_patches = processor.normalize_entries(&text_delta, worktree, &provider);
    assert_eq!(text_patches.len(), 1);
    let text_entries = patches_to_entries(&text_patches);
    assert_eq!(text_entries.len(), 1);
    assert!(matches!(text_entries[0].entry_type, NormalizedEntryType::AssistantMessage));

    // At this point: entry 0 = thinking, entry 1 = text (from streaming)
    // provider.current() == 2 (model name entry was index 0, so thinking=1, text=2? No —
    // message_start may emit model name. Let's just track what matters: the final state.)

    // 6. First partial assistant message: only text
    let assistant_text_only = ClaudeJson::Assistant {
        message: ClaudeMessage {
            id: Some(msg_id.to_string()),
            role: "assistant".to_string(),
            model: None,
            content: ClaudeContent::Items(vec![ClaudeContentItem::Text {
                text: "Hi! How can I help you today?".to_string(),
            }]),
            stop_reason: None,
            usage: None,
        },
        session_id: None,
        uuid: None,
    };
    let patches_1 = processor.normalize_entries(&assistant_text_only, worktree, &provider);
    let entries_1: Vec<_> = patches_1
        .iter()
        .filter_map(|p| extract_normalized_entry_from_patch(p))
        .collect();

    // Should produce a Replace for the existing text entry, NOT a new Add
    for (idx, entry) in &entries_1 {
        if matches!(entry.entry_type, NormalizedEntryType::AssistantMessage) {
            // Must be a replace of the streaming text entry, not a new one
            assert!(
                patches_1.iter().any(|p| {
                    let v = serde_json::to_value(p).unwrap();
                    let ops = v.as_array().unwrap();
                    ops.iter().any(|op| {
                        op.get("op").and_then(|o| o.as_str()) == Some("replace")
                            && op.get("path").and_then(|p| p.as_str())
                                == Some(&format!("/entries/{idx}"))
                    })
                }),
                "Text entry should be a Replace, not Add"
            );
        }
    }

    // 7. Second partial assistant message: only thinking
    let assistant_thinking_only = ClaudeJson::Assistant {
        message: ClaudeMessage {
            id: Some(msg_id.to_string()),
            role: "assistant".to_string(),
            model: None,
            content: ClaudeContent::Items(vec![ClaudeContentItem::Thinking {
                thinking: "Let me think...".to_string(),
            }]),
            stop_reason: None,
            usage: None,
        },
        session_id: None,
        uuid: None,
    };
    let patches_2 = processor.normalize_entries(&assistant_thinking_only, worktree, &provider);
    let entries_2: Vec<_> = patches_2
        .iter()
        .filter_map(|p| extract_normalized_entry_from_patch(p))
        .collect();

    // Should produce a Replace for the existing thinking entry, NOT a new Add
    for (idx, entry) in &entries_2 {
        if matches!(entry.entry_type, NormalizedEntryType::Thinking) {
            assert!(
                patches_2.iter().any(|p| {
                    let v = serde_json::to_value(p).unwrap();
                    let ops = v.as_array().unwrap();
                    ops.iter().any(|op| {
                        op.get("op").and_then(|o| o.as_str()) == Some("replace")
                            && op.get("path").and_then(|p| p.as_str())
                                == Some(&format!("/entries/{idx}"))
                    })
                }),
                "Thinking entry should be a Replace, not Add"
            );
        }
    }

    // 8. message_stop
    let message_stop = ClaudeJson::StreamEvent {
        event: ClaudeStreamEvent::MessageStop,
        session_id: None,
        parent_tool_use_id: None,
        uuid: None,
    };
    processor.normalize_entries(&message_stop, worktree, &provider);

    // Verify: no duplicate entries, correct order
    // Collect all NormalizedEntry patches with their indices across all steps
    let all_patches: Vec<json_patch::Patch> = [
        &thinking_patches[..],
        &text_patches[..],
        &patches_1[..],
        &patches_2[..],
    ]
    .concat();

    // Build final state: apply adds then replaces
    let mut final_entries: std::collections::HashMap<usize, NormalizedEntry> =
        std::collections::HashMap::new();
    for patch in &all_patches {
        if let Some((idx, entry)) = extract_normalized_entry_from_patch(patch) {
            final_entries.insert(idx, entry);
        }
    }

    // Should have exactly 2 entries (thinking + text), not 3
    let mut entry_count = 0;
    let mut has_thinking = false;
    let mut has_text = false;
    let mut thinking_idx = usize::MAX;
    let mut text_idx = usize::MAX;

    for (idx, entry) in &final_entries {
        match entry.entry_type {
            NormalizedEntryType::Thinking => {
                has_thinking = true;
                thinking_idx = *idx;
                entry_count += 1;
            }
            NormalizedEntryType::AssistantMessage => {
                has_text = true;
                text_idx = *idx;
                entry_count += 1;
            }
            _ => {}
        }
    }

    assert!(has_thinking, "Should have a thinking entry");
    assert!(has_text, "Should have a text entry");
    assert_eq!(entry_count, 2, "Should have exactly 2 content entries (no duplicates)");
    assert!(
        thinking_idx < text_idx,
        "Thinking (index {thinking_idx}) should come before text (index {text_idx})"
    );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cargo test -p executors test_partial_assistant_messages_no_duplicate_or_reorder -- --nocapture
```

Expected: FAIL — the test should fail because of duplicate text entries and/or thinking appearing after text due to the current bugs.

- [ ] **Step 3: Commit the failing test**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "test: add failing test for streaming entry duplicate and ordering bug"
```

---

### Task 2: Add `content_entry_index_by_type` to `StreamingMessageState`

**Files:**
- Modify: `crates/executors/src/executors/claude.rs:1779-1836` (`StreamingMessageState` impl block)

- [ ] **Step 1: Add the new method**

Add this method to the `impl StreamingMessageState` block (after `content_entry_index` at line ~1835):

```rust
fn content_entry_index_by_type(&self, item: &ClaudeContentItem) -> Option<usize> {
    let target_kind = match item {
        ClaudeContentItem::Text { .. } => StreamingContentKind::Text,
        ClaudeContentItem::Thinking { .. } => StreamingContentKind::Thinking,
        _ => return None,
    };
    self.contents
        .values()
        .find(|s| s.kind == target_kind && s.entry_index.is_some())
        .and_then(|s| s.entry_index)
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cargo check -p executors
```

Expected: compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "feat: add content_entry_index_by_type to StreamingMessageState"
```

---

### Task 3: Fix the Assistant message handler — don't remove streaming state, match by type

**Files:**
- Modify: `crates/executors/src/executors/claude.rs:1048-1120` (`ClaudeJson::Assistant` handler)

- [ ] **Step 1: Change `.remove()` to `.get()` (line 1053-1056)**

Replace:

```rust
                let mut streaming_message_state = message
                    .id
                    .as_ref()
                    .and_then(|id| self.streaming_messages.remove(id));
```

With:

```rust
                let streaming_message_state = message
                    .id
                    .as_ref()
                    .and_then(|id| self.streaming_messages.get(id));
```

- [ ] **Step 2: Change the content loop to match by type (line 1058-1061)**

Replace:

```rust
                for (content_index, item) in message.content.items().enumerate() {
                    let entry_index = streaming_message_state
                        .as_mut()
                        .and_then(|state| state.content_entry_index(content_index));
```

With:

```rust
                for item in message.content.items() {
                    let entry_index = streaming_message_state
                        .and_then(|state| state.content_entry_index_by_type(item));
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
cargo check -p executors
```

Expected: compiles with no errors. The rest of the match block uses `entry_index` the same way — `is_new = entry_index.is_none()` etc — so no further changes needed.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "fix: don't remove streaming state on assistant message, match by content type"
```

---

### Task 4: Move streaming state cleanup to MessageStop

**Files:**
- Modify: `crates/executors/src/executors/claude.rs:1449-1455` (`MessageStop` handler)

- [ ] **Step 1: Update MessageStop to remove streaming state**

Replace:

```rust
                ClaudeStreamEvent::MessageStop => {
                    // Only clear the current message_id reference, NOT the
                    // streaming_messages entry. The Assistant message handler
                    // (line ~1047) will remove it when it processes the final
                    // message and converts streaming Add patches to Replace.
                    self.streaming_message_id.take();
                }
```

With:

```rust
                ClaudeStreamEvent::MessageStop => {
                    if let Some(id) = self.streaming_message_id.take() {
                        self.streaming_messages.remove(&id);
                    }
                }
```

- [ ] **Step 2: Run the failing test to verify it now passes**

Run:
```bash
cargo test -p executors test_partial_assistant_messages_no_duplicate_or_reorder -- --nocapture
```

Expected: PASS

- [ ] **Step 3: Run the full test suite to verify no regressions**

Run:
```bash
cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "fix: move streaming state cleanup to MessageStop handler"
```

---

### Task 5: Run type checks and verify

**Files:** None (verification only)

- [ ] **Step 1: Run Rust type checks**

Run:
```bash
cargo check --workspace
```

Expected: no errors.

- [ ] **Step 2: Run full workspace tests**

Run:
```bash
cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 3: Final commit (if any cleanup needed)**

Only commit if there were adjustments needed from the verification step.
