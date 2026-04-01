# Fix Usage Display Bug — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dual-usage-entry bug where streaming emits a usage bar with a wrong 200K default context window, by splitting usage into two modes: streaming shows token count only, final Result shows per-model usage with correct context windows.

**Architecture:** Make `TokenUsageInfo.model_context_window` optional and add an optional `model_name`. During streaming (`MessageDelta`), emit a token-only entry (no context window, no model name). On `Result`, iterate `modelUsage` and emit one entry per model with full data. Frontend renders token-only entries as plain text and full entries as the progress bar.

**Tech Stack:** Rust (serde, ts-rs), TypeScript/React, Tailwind CSS

---

### Task 1: Update `TokenUsageInfo` Rust type

**Files:**
- Modify: `crates/executors/src/logs/mod.rs:116-120`

- [ ] **Step 1: Make `model_context_window` optional, add `model_name`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TokenUsageInfo {
    pub total_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_context_window: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
}
```

- [ ] **Step 2: Run `cargo check --workspace` to find all compilation errors**

Run: `cargo check --workspace 2>&1 | head -40`
Expected: Errors in `claude.rs` where `TokenUsageInfo` is constructed with the old fields. These will be fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/logs/mod.rs
git commit -m "refactor(types): make TokenUsageInfo.model_context_window optional, add model_name"
```

---

### Task 2: Extend `ClaudeModelUsage` to parse token fields

**Files:**
- Modify: `crates/executors/src/executors/claude.rs:2169-2175`

The `ClaudeModelUsage` struct currently only parses `context_window`. The Result message's `modelUsage` map contains per-model token counts (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`) which we need to compute `total_tokens` per model.

- [ ] **Step 1: Add token fields to `ClaudeModelUsage`**

```rust
/// Per-model usage statistics from result message
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeModelUsage {
    #[serde(default)]
    pub context_window: Option<u32>,
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    #[serde(default)]
    pub cache_read_input_tokens: Option<u64>,
    #[serde(default)]
    pub cache_creation_input_tokens: Option<u64>,
}
```

- [ ] **Step 2: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "feat(types): extend ClaudeModelUsage with token count fields"
```

---

### Task 3: Rewrite usage emission in `ClaudeLogProcessor`

**Files:**
- Modify: `crates/executors/src/executors/claude.rs`
  - Struct fields: lines 467-502 (remove `main_model_name`, `main_model_context_window`, `context_tokens_used`)
  - `System::init` handler: lines 1004-1010 (remove `main_model_name` assignment)
  - `MessageDelta` handler: lines 1434-1448 (emit token-only entry)
  - `Result` handler: lines 1458-1477 (emit per-model entries from `modelUsage`)
  - `add_token_usage_entry`: lines 1725-1743 (replace with new helper)
  - Constant: line 464 (remove `DEFAULT_CLAUDE_CONTEXT_WINDOW`)

- [ ] **Step 1: Remove obsolete fields from `ClaudeLogProcessor` struct**

Remove `main_model_name`, `main_model_context_window`, `context_tokens_used` fields and the `DEFAULT_CLAUDE_CONTEXT_WINDOW` constant. Keep `model_name` (used elsewhere for display).

The struct becomes:

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

Update `new_with_strategy` to remove the deleted fields from initialization. Remove the `DEFAULT_CLAUDE_CONTEXT_WINDOW` constant.

- [ ] **Step 2: Remove `main_model_name` assignment from `System::init` handler**

In `normalize_entries`, the `Some("init")` branch (around lines 1004-1010) sets `self.main_model_name`. Remove that block entirely. Keep the comment about skipping system init messages.

Before:
```rust
Some("init") => {
    if self.main_model_name.is_none() {
        if let Some(model) = model {
            self.main_model_name = Some(model.clone());
        }
    }
    // Skip system init messages ...
}
```

After:
```rust
Some("init") => {
    // Skip system init messages because it doesn't contain the actual model
    // that will be used in assistant messages in case of claude-code-router.
    // We'll send system initialized message with first assistant message
    // that has a model field.
}
```

- [ ] **Step 3: Update `MessageDelta` handler to emit token-only usage entry**

Replace the current `MessageDelta` handler. Instead of just recording `self.context_tokens_used`, compute total tokens and emit an entry with `model_context_window: None` and `model_name: None`.

```rust
ClaudeStreamEvent::MessageDelta { usage, .. } => {
    // Emit token-only usage (no context window — that comes in Result)
    if parent_tool_use_id.is_none()
        && let Some(usage) = usage
    {
        let input_tokens = usage.input_tokens.unwrap_or(0)
            + usage.cache_creation_input_tokens.unwrap_or(0)
            + usage.cache_read_input_tokens.unwrap_or(0);
        let output_tokens = usage.output_tokens.unwrap_or(0);
        let total_tokens = (input_tokens + output_tokens) as u32;

        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::TokenUsageInfo(
                crate::logs::TokenUsageInfo {
                    total_tokens,
                    model_context_window: None,
                    model_name: None,
                },
            ),
            content: format!("Tokens used: {}", total_tokens),
            metadata: None,
        };
        let idx = entry_index_provider.next();
        patches.push(ConversationPatch::add_normalized_entry(idx, entry));
    }
}
```

- [ ] **Step 4: Update `Result` handler to emit per-model usage entries**

Replace the existing context-window lookup + single-entry emission (lines 1465-1477) with iteration over all models in `model_usage`:

```rust
// Emit one usage entry per model with full context window info
if let Some(model_usage) = model_usage.as_ref() {
    for (name, usage) in model_usage {
        let input_tokens = usage.input_tokens.unwrap_or(0)
            + usage.cache_read_input_tokens.unwrap_or(0)
            + usage.cache_creation_input_tokens.unwrap_or(0);
        let output_tokens = usage.output_tokens.unwrap_or(0);
        let total_tokens = (input_tokens + output_tokens) as u32;

        let entry = NormalizedEntry {
            timestamp: None,
            entry_type: NormalizedEntryType::TokenUsageInfo(
                crate::logs::TokenUsageInfo {
                    total_tokens,
                    model_context_window: usage.context_window,
                    model_name: Some(name.clone()),
                },
            ),
            content: format!(
                "Model: {} — Tokens used: {}{}",
                name,
                total_tokens,
                usage
                    .context_window
                    .map(|cw| format!(" / Context window: {}", cw))
                    .unwrap_or_default()
            ),
            metadata: None,
        };
        let idx = entry_index_provider.next();
        patches.push(ConversationPatch::add_normalized_entry(idx, entry));
    }
}
```

- [ ] **Step 5: Remove the old `add_token_usage_entry` method**

Delete the entire `add_token_usage_entry` method (lines 1725-1743). It is no longer used — both emission sites now inline their entry construction.

- [ ] **Step 6: Verify compilation**

Run: `cargo check --workspace 2>&1 | head -40`
Expected: Clean compilation (0 errors).

- [ ] **Step 7: Run tests**

Run: `cargo test --workspace 2>&1 | tail -20`
Expected: All tests pass. The `test_result_message_emits_final_text_if_not_seen` test (line 2479) should still pass since its Result JSON has no `modelUsage` field.

- [ ] **Step 8: Commit**

```bash
git add crates/executors/src/executors/claude.rs
git commit -m "fix(usage): emit single token usage entry with correct context window

During streaming, emit token-only usage (no context window).
On Result, emit one entry per model from modelUsage with correct
context window. Removes main_model_name/main_model_context_window
tracking and DEFAULT_CLAUDE_CONTEXT_WINDOW constant."
```

---

### Task 4: Regenerate TypeScript types

**Files:**
- Regenerate: `shared/types.ts`

- [ ] **Step 1: Run type generation**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` is updated. The `TokenUsageInfo` type should now be:
```typescript
export type TokenUsageInfo = { total_tokens: number, model_context_window: number | null, model_name: string | null, };
```

- [ ] **Step 2: Verify the generated type**

Run: `grep 'TokenUsageInfo' shared/types.ts`
Expected: Shows the updated type with optional fields.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate TypeScript types for TokenUsageInfo"
```

---

### Task 5: Update frontend to handle both display modes

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx:983-1024`

The component currently always shows the full bar. After this change:
- When `model_context_window` is `null`: show token count only (plain text, no bar)
- When `model_context_window` is present: show full bar with percentage + model name

- [ ] **Step 1: Rewrite the `token_usage_info` rendering block**

Replace lines 983-1024 with:

```tsx
  if (entry.entry_type.type === 'token_usage_info') {
    const { total_tokens, model_context_window, model_name } = entry.entry_type;

    const formatTokens = (n: number) => {
      if (n >= 1_000_000) {
        const m = n / 1_000_000;
        return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
      }
      if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
      return n.toString();
    };

    // Streaming mode: only token count known, no context window yet
    if (model_context_window == null) {
      return (
        <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
          <Gauge className="h-3 w-3" />
          <span className="font-medium">{formatTokens(total_tokens)} tokens</span>
        </div>
      );
    }

    // Final mode: full bar with percentage and model name
    if (model_context_window === 0) return null;

    const percentage = Math.min(
      100,
      (total_tokens / model_context_window) * 100
    );

    const barColor =
      percentage >= 90
        ? 'bg-red-500'
        : percentage >= 75
          ? 'bg-amber-500'
          : percentage >= 50
            ? 'bg-blue-500'
            : 'bg-green-500';

    return (
      <div className="px-4 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
        <Gauge className="h-3 w-3" />
        {model_name && (
          <span className="opacity-70">{model_name}</span>
        )}
        <span className="font-medium">
          {formatTokens(total_tokens)} / {formatTokens(model_context_window)}
        </span>
        <div className="flex-1 max-w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="opacity-70">{Math.round(percentage)}%</span>
      </div>
    );
  }
```

- [ ] **Step 2: Run frontend type check**

Run: `pnpm run check`
Expected: No type errors. The destructured `model_context_window` is now `number | null` and `model_name` is `string | null`.

- [ ] **Step 3: Run frontend lint**

Run: `pnpm run lint`
Expected: No lint errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "fix(ui): show token-only usage during streaming, full bar on result

When model_context_window is null (streaming), display plain token count.
When present (final Result), display bar with percentage and model name."
```

---

### Task 6: Update `useConversationHistoryOld.ts` for new type shape

**Files:**
- Modify: `frontend/src/hooks/useConversationHistory/useConversationHistoryOld.ts:326-334`

The `latestTokenUsageInfo` extraction casts `entry_type as TokenUsageInfo`. This cast still works because the `type` discriminant field is stripped by the spread — but verify the downstream usage in `EntriesContext` is compatible with the new optional fields.

- [ ] **Step 1: Verify no changes needed**

Read `frontend/src/contexts/EntriesContext.tsx` — it stores `TokenUsageInfo | null` and the type is imported from `shared/types`. Since the fields are now optional, existing code that reads `tokenUsageInfo.model_context_window` will get `number | null` which may cause type errors if not handled.

Check if `tokenUsageInfo` from context is consumed anywhere beyond the test mock. If it is only used in `DisplayConversationEntry.tsx` (which we already updated), no changes are needed.

Run: `grep -rn 'tokenUsageInfo\.' frontend/src/ --include='*.ts' --include='*.tsx' | grep -v test | grep -v node_modules`

If no consumers read `.model_context_window` directly from context, this task is a no-op.

- [ ] **Step 2: Run full frontend check**

Run: `pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit (if changes were made)**

```bash
git add frontend/src/
git commit -m "fix(hooks): update token usage consumers for optional fields"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 2: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: Clean.

- [ ] **Step 3: Verify generated types are in sync**

Run: `pnpm run generate-types:check`
Expected: Types are up to date.
