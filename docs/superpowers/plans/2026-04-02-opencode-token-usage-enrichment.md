# Opencode Token Usage Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse detailed token breakdown (input, output, reasoning, cache read/write, model name) from opencode SDK events and display them in the UI.

**Architecture:** Add `reasoning_tokens` field to the shared `TokenUsageInfo` struct. Enrich the opencode `MessageTokens` parser to capture `reasoning` and `cache.write`. Expand `OpencodeExecutorEvent::TokenUsage` to carry all token fields. Update the frontend to render reasoning tokens.

**Tech Stack:** Rust (serde, ts-rs), TypeScript/React, pnpm

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `crates/executors/src/logs/mod.rs` | Modify | Add `reasoning_tokens` field to `TokenUsageInfo` |
| `crates/executors/src/executors/opencode/types.rs` | Modify | Add `reasoning` to `MessageTokens`, `write` to `MessageTokensCache`, expand `TokenUsage` variant |
| `crates/executors/src/executors/opencode/models.rs` | Modify | Populate all token fields in `maybe_emit_token_usage` |
| `crates/executors/src/executors/opencode/normalize_logs.rs` | Modify | Map enriched `TokenUsage` event to `TokenUsageInfo` |
| `shared/types.ts` | Regenerate | Pick up `reasoning_tokens` from ts-rs |
| `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` | Modify | Display reasoning tokens in the detailed view |

---

### Task 1: Add `reasoning_tokens` to `TokenUsageInfo`

**Files:**
- Modify: `crates/executors/src/logs/mod.rs:116-137`

- [ ] **Step 1: Add reasoning_tokens field**

In `crates/executors/src/logs/mod.rs`, add `reasoning_tokens` after the `output_tokens` field (line 124):

```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<u64>,
```

- [ ] **Step 2: Fix all struct literal construction sites**

After adding the field, there will be compilation errors wherever `TokenUsageInfo` is constructed without it. Run:

```bash
cargo check --workspace 2>&1 | head -40
```

There are exactly two construction sites:
1. `crates/executors/src/executors/opencode/normalize_logs.rs:84-96` — add `reasoning_tokens: None,` after `output_tokens: None,`
2. `crates/executors/src/executors/claude.rs` — find all `TokenUsageInfo { ... }` blocks and add `reasoning_tokens: None,`

For each, add `reasoning_tokens: None,` in the appropriate position after `output_tokens`.

- [ ] **Step 3: Verify compilation**

```bash
cargo check --workspace
```

Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/logs/mod.rs crates/executors/src/executors/opencode/normalize_logs.rs crates/executors/src/executors/claude.rs
git commit -m "feat(types): add reasoning_tokens field to TokenUsageInfo"
```

---

### Task 2: Enrich `MessageTokens` to parse `reasoning` and `cache.write`

**Files:**
- Modify: `crates/executors/src/executors/opencode/types.rs:162-175`

The opencode SDK sends:
```json
"tokens": {"input": 28820, "output": 159, "reasoning": 147, "cache": {"read": 0, "write": 0}}
```

Currently `MessageTokens` parses `input`, `output`, `cache.read` but not `reasoning` or `cache.write`.

- [ ] **Step 1: Add `reasoning` field to `MessageTokens`**

In `crates/executors/src/executors/opencode/types.rs`, modify the `MessageTokens` struct (lines 163-169):

```rust
#[derive(Debug, Deserialize)]
pub(super) struct MessageTokens {
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) input: u32,
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) output: u32,
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) reasoning: u32,
    pub(super) cache: Option<MessageTokensCache>,
}
```

- [ ] **Step 2: Add `write` field to `MessageTokensCache`**

Modify `MessageTokensCache` (lines 171-175):

```rust
#[derive(Debug, Deserialize)]
pub(super) struct MessageTokensCache {
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) read: u32,
    #[serde(default, deserialize_with = "deserialize_f64_as_u32")]
    pub(super) write: u32,
}
```

- [ ] **Step 3: Verify compilation**

```bash
cargo check --workspace
```

Expected: compiles cleanly (the new fields use `#[serde(default)]` so existing deserialization is backwards-compatible).

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/opencode/types.rs
git commit -m "feat(opencode): parse reasoning and cache.write from SDK token events"
```

---

### Task 3: Expand `OpencodeExecutorEvent::TokenUsage` variant

**Files:**
- Modify: `crates/executors/src/executors/opencode/types.rs:21-24`

- [ ] **Step 1: Expand the TokenUsage variant**

Replace the current `TokenUsage` variant (lines 21-24):

```rust
    TokenUsage {
        total_tokens: u32,
        model_context_window: u32,
        model_name: Option<String>,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        reasoning_tokens: Option<u64>,
        cache_read_input_tokens: Option<u64>,
        cache_creation_input_tokens: Option<u64>,
    },
```

- [ ] **Step 2: Fix compilation errors**

Run `cargo check --workspace 2>&1 | head -60` to find the construction and destructuring sites. There are two:

1. **Construction** in `models.rs:149-155` — will be updated in Task 4.
2. **Destructuring** in `normalize_logs.rs:75-78` — will be updated in Task 5.

For now, temporarily update both to compile:

In `models.rs` (line 149-155), update the construction:
```rust
    let _ = context
        .log_writer
        .log_event(&OpencodeExecutorEvent::TokenUsage {
            total_tokens,
            model_context_window,
            model_name: None,
            input_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            cache_read_input_tokens: None,
            cache_creation_input_tokens: None,
        })
        .await;
```

In `normalize_logs.rs` (lines 75-78), update the destructuring:
```rust
                OpencodeExecutorEvent::TokenUsage {
                    total_tokens,
                    model_context_window,
                    model_name,
                    input_tokens,
                    output_tokens,
                    reasoning_tokens,
                    cache_read_input_tokens,
                    cache_creation_input_tokens,
                } => {
```

And update the `TokenUsageInfo` construction in the same match arm (lines 84-96):
```rust
                    add_normalized_entry(
                        &msg_store,
                        &entry_index,
                        NormalizedEntry {
                            timestamp: None,
                            entry_type: NormalizedEntryType::TokenUsageInfo(TokenUsageInfo {
                                total_tokens,
                                model_name,
                                input_tokens,
                                output_tokens,
                                reasoning_tokens,
                                cache_read_input_tokens,
                                cache_creation_input_tokens,
                                cost_usd: None,
                                context_window: None,
                                model_context_window: Some(model_context_window),
                                max_output_tokens: None,
                            }),
                            content: format!(
                                "Tokens used: {} / Context window: {}",
                                total_tokens, model_context_window
                            ),
                            metadata: None,
                        },
                    );
```

- [ ] **Step 3: Verify compilation**

```bash
cargo check --workspace
```

Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add crates/executors/src/executors/opencode/types.rs crates/executors/src/executors/opencode/models.rs crates/executors/src/executors/opencode/normalize_logs.rs
git commit -m "feat(opencode): expand TokenUsage event to carry full token breakdown"
```

---

### Task 4: Populate all fields in `maybe_emit_token_usage`

**Files:**
- Modify: `crates/executors/src/executors/opencode/models.rs:106-156`

- [ ] **Step 1: Update `maybe_emit_token_usage` to extract all fields**

Replace the function body (lines 106-156) with:

```rust
pub(super) async fn maybe_emit_token_usage(context: &EventStreamContext<'_>, event: &Value) {
    let Some(SdkEvent::MessageUpdated(event)) = SdkEvent::parse(event) else {
        return;
    };
    let message = event.info;

    if message.role != MessageRole::Assistant {
        return;
    }

    let Some(ref tokens) = message.tokens else {
        return;
    };

    let cache_read = tokens.cache.as_ref().map(|c| c.read).unwrap_or(0);
    let cache_write = tokens.cache.as_ref().map(|c| c.write).unwrap_or(0);
    let total_tokens = tokens.input + tokens.output + tokens.reasoning + cache_read;

    if total_tokens == 0 {
        return;
    }

    let provider_id = message.provider_id();
    let model_id = message.model_id();

    let model_context_window = match (provider_id, model_id) {
        (Some(provider), Some(model)) => {
            get_model_context_window(
                context.client,
                context.base_url,
                context.directory,
                context.models_cache_key,
                provider,
                model,
            )
            .await
        }
        _ => 0,
    };

    if model_context_window == 0 {
        return;
    }

    let model_name = model_id.map(|s| s.to_string());

    let _ = context
        .log_writer
        .log_event(&OpencodeExecutorEvent::TokenUsage {
            total_tokens,
            model_context_window,
            model_name,
            input_tokens: Some(tokens.input as u64),
            output_tokens: Some(tokens.output as u64),
            reasoning_tokens: if tokens.reasoning > 0 {
                Some(tokens.reasoning as u64)
            } else {
                None
            },
            cache_read_input_tokens: if cache_read > 0 {
                Some(cache_read as u64)
            } else {
                None
            },
            cache_creation_input_tokens: if cache_write > 0 {
                Some(cache_write as u64)
            } else {
                None
            },
        })
        .await;
}
```

Key changes from the original:
- `total_tokens` now includes `reasoning`: `input + output + reasoning + cache_read`
- `model_name` extracted from `model_id`
- Individual token counts passed as `Option<u64>`, with zero values mapped to `None`
- `cache_write` mapped to `cache_creation_input_tokens`

- [ ] **Step 2: Verify compilation**

```bash
cargo check --workspace
```

Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add crates/executors/src/executors/opencode/models.rs
git commit -m "feat(opencode): populate full token breakdown in maybe_emit_token_usage"
```

---

### Task 5: Regenerate TypeScript types

**Files:**
- Regenerate: `shared/types.ts`

- [ ] **Step 1: Run type generation**

```bash
cd /home/wangqiying/projects/.vibe-board-workspaces/d945-opencode-usage/vibe-kanban && pnpm run generate-types
```

Expected: `shared/types.ts` is updated. The `TokenUsageInfo` type should now include `reasoning_tokens: bigint | null`.

- [ ] **Step 2: Verify the generated type**

```bash
grep 'reasoning_tokens' shared/types.ts
```

Expected: `reasoning_tokens: bigint | null` appears in the `TokenUsageInfo` type definition.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate shared types with reasoning_tokens"
```

---

### Task 6: Display reasoning tokens in the frontend

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx:1030-1051`

- [ ] **Step 1: Add reasoning tokens display**

In the detailed token usage view (around line 1035), after the `out:` span and before the `cache read:` span, add:

```tsx
          {usage.reasoning_tokens != null &&
            usage.reasoning_tokens > 0 && (
              <span>
                reasoning: {formatTokens(Number(usage.reasoning_tokens))}
              </span>
            )}
```

The full block (lines 1030-1051) should become:

```tsx
        <div className="pl-5 flex flex-wrap gap-x-3 opacity-70">
          {usage.input_tokens != null && (
            <span>in: {formatTokens(Number(usage.input_tokens))}</span>
          )}
          {usage.output_tokens != null && (
            <span>out: {formatTokens(Number(usage.output_tokens))}</span>
          )}
          {usage.reasoning_tokens != null &&
            usage.reasoning_tokens > 0 && (
              <span>
                reasoning: {formatTokens(Number(usage.reasoning_tokens))}
              </span>
            )}
          {usage.cache_read_input_tokens != null &&
            usage.cache_read_input_tokens > 0 && (
              <span>
                cache read:{' '}
                {formatTokens(Number(usage.cache_read_input_tokens))}
              </span>
            )}
          {usage.cache_creation_input_tokens != null &&
            usage.cache_creation_input_tokens > 0 && (
              <span>
                cache write:{' '}
                {formatTokens(Number(usage.cache_creation_input_tokens))}
              </span>
            )}
        </div>
```

- [ ] **Step 2: Run frontend type check**

```bash
cd /home/wangqiying/projects/.vibe-board-workspaces/d945-opencode-usage/vibe-kanban && pnpm run check
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "feat(ui): display reasoning tokens in token usage breakdown"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full workspace compilation**

```bash
cargo check --workspace
```

Expected: clean.

- [ ] **Step 2: Run Rust tests**

```bash
cargo test --workspace
```

Expected: all tests pass.

- [ ] **Step 3: Frontend lint and check**

```bash
cd /home/wangqiying/projects/.vibe-board-workspaces/d945-opencode-usage/vibe-kanban && pnpm run check && pnpm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify generate-types is consistent**

```bash
pnpm run generate-types:check
```

Expected: types are up-to-date.
