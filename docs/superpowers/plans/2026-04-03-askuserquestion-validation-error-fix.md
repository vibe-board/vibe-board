# AskUserQuestion Validation Error Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs that cause broken, non-interactive question UIs when `AskUserQuestion` gets an `InputValidationError` from Claude Code.

**Architecture:** Backend adds an `else if` branch in the tool_result processing to update `AskUserQuestion` entries to `Failed` on validation errors. Frontend guards the interactive banner behind `pending_approval` status so non-interactive entries fall through to the default `ToolCallCard`.

**Tech Stack:** Rust (backend normalizer), TypeScript/React (frontend rendering)

**Spec:** `docs/superpowers/specs/2026-04-03-askuserquestion-validation-error-fix.md`

---

## File Map

- **Modify:** `crates/executors/src/executors/claude.rs:1404` — Add `else if` branch for `AskUserQuestion` in tool_result processing
- **Modify:** `crates/executors/src/executors/claude.rs` (test module, ~line 3089) — Add unit test
- **Modify:** `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx:906-914` — Guard banner render on `isPendingApproval`

---

### Task 1: Backend — Handle AskUserQuestion tool_result errors

**Files:**
- Modify: `crates/executors/src/executors/claude.rs:1404`

- [ ] **Step 1: Write the failing test**

Add this test at the end of the `mod tests` block in `crates/executors/src/executors/claude.rs` (after the `test_approval_requested_before_tool_use_is_buffered` test around line 3089):

```rust
#[test]
fn test_ask_user_question_validation_error_sets_failed_status() {
    let mut processor = ClaudeLogProcessor::new();
    let provider = EntryIndexProvider::test_new();

    // Step 1: Assistant message with AskUserQuestion tool_use
    let assistant_json: ClaudeJson = serde_json::from_str(
        r#"{
            "type":"assistant",
            "message":{
                "role":"assistant",
                "content":[
                    {
                        "type":"tool_use",
                        "id":"call_abc123",
                        "name":"AskUserQuestion",
                        "input":{
                            "questions":[{
                                "question":"Which option?",
                                "header":"Pick",
                                "options":[
                                    {"label":"A","description":"Option A"},
                                    {"label":"B","description":"Option B"}
                                ],
                                "multiSelect":false
                            }]
                        }
                    }
                ]
            }
        }"#,
    )
    .unwrap();
    processor.normalize_entries(&assistant_json, "/tmp/work", &provider);

    // Step 2: User message with tool_result error (validation failure)
    let user_json: ClaudeJson = serde_json::from_str(
        r#"{
            "type":"user",
            "message":{
                "role":"user",
                "content":[
                    {
                        "type":"tool_result",
                        "tool_use_id":"call_abc123",
                        "content":"InputValidationError: Too big: expected array to have <=4 items",
                        "is_error":true
                    }
                ]
            }
        }"#,
    )
    .unwrap();
    let patches = processor.normalize_entries(&user_json, "/tmp/work", &provider);

    // Step 3: Verify the entry status was updated to Failed
    let entries = patches_to_entries(&patches);
    let tool_entry = entries
        .iter()
        .find(|e| matches!(e.entry_type, NormalizedEntryType::ToolUse { .. }));
    assert!(tool_entry.is_some(), "Expected a ToolUse entry in patches");
    match &tool_entry.unwrap().entry_type {
        NormalizedEntryType::ToolUse { status, .. } => {
            assert!(
                matches!(status, ToolStatus::Failed),
                "Expected Failed status, got {:?}",
                status
            );
        }
        _ => unreachable!(),
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cargo test -p executors test_ask_user_question_validation_error_sets_failed_status -- --nocapture
```

Expected: FAIL — the test will find no `ToolUse` entry in the patches because the current code doesn't handle `AskUserQuestion` in the tool_result branch, so no replacement patch is emitted.

- [ ] **Step 3: Add the AskUserQuestion branch in tool_result processing**

In `crates/executors/src/executors/claude.rs`, find line 1404 which currently reads:

```rust
                        }
                        // Note: With control protocol, denials are handled via protocol messages
```

Insert a new `else if` branch **before** the closing `}` and comment. Change line 1404 from:

```rust
                        }
                        // Note: With control protocol, denials are handled via protocol messages
```

To:

```rust
                        } else if matches!(
                            info.tool_data,
                            ClaudeToolData::AskUserQuestion { .. }
                        ) {
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
                        // Note: With control protocol, denials are handled via protocol messages
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cargo test -p executors test_ask_user_question_validation_error_sets_failed_status -- --nocapture
```

Expected: PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

Run:
```bash
cargo test --workspace
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "fix(normalizer): update AskUserQuestion entry status on tool_result error

The tool_result processing in ClaudeJson::User handler had no branch
for AskUserQuestion, so validation errors (is_error: true) left the
entry stuck at Created status instead of updating to Failed."
```

---

### Task 2: Frontend — Guard AskUserQuestion banner on pending_approval status

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx:906-914`

- [ ] **Step 1: Update the rendering condition**

In `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`, find lines 906-914:

```tsx
      // AskUserQuestion - render interactive question banner
      if (toolEntry.action_type.action === 'ask_user_question') {
        return (
          <AskUserQuestionContent
            questions={toolEntry.action_type.questions}
            approvalId={isPendingApproval ? status.approval_id : null}
            executionProcessId={executionProcessId}
          />
        );
      }
```

Replace with:

```tsx
      // AskUserQuestion - render interactive question banner only when pending approval
      if (toolEntry.action_type.action === 'ask_user_question' && isPendingApproval) {
        return (
          <AskUserQuestionContent
            questions={toolEntry.action_type.questions}
            approvalId={status.approval_id}
            executionProcessId={executionProcessId}
          />
        );
      }
```

Two changes:
1. Added `&& isPendingApproval` to the condition — non-pending entries fall through to the default `ToolCallCard`.
2. Simplified `approvalId` prop — `status.approval_id` is always available when `isPendingApproval` is true (TypeScript type narrowing from the `status.status === 'pending_approval'` check at line 870).

- [ ] **Step 2: Run type checks**

Run:
```bash
pnpm run check
```

Expected: No type errors. The `status.approval_id` access is safe because `isPendingApproval` narrows the union type.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "fix(frontend): only render AskUserQuestion banner when pending_approval

Previously the banner rendered for any ask_user_question entry
regardless of status, producing a visually interactive but
functionally dead component when status was Created or Failed."
```
