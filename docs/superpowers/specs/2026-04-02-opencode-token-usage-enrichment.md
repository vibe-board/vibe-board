# Opencode Token Usage Enrichment

## Problem

The opencode executor already receives detailed per-message token breakdowns from the opencode SDK (`input`, `output`, `reasoning`, `cache.read`, `cache.write`, `model_id`, `provider_id`), but currently only extracts `total_tokens` and `model_context_window`. All other `TokenUsageInfo` fields are `None`, so the UI only shows "28K tokens" instead of the detailed breakdown that ClaudeCode provides.

## Changes

### 1. Add `reasoning_tokens` to `TokenUsageInfo` (shared struct)

**File:** `crates/executors/src/logs/mod.rs`

Add a new optional field:

```rust
pub reasoning_tokens: Option<u64>,
```

This is separate from `output_tokens` per user requirement — reasoning tokens should not be lumped into output.

### 2. Parse `reasoning` and `cache.write` in `MessageTokens`

**File:** `crates/executors/src/executors/opencode/types.rs`

The opencode SDK sends:
```json
"tokens": {"input": 28820, "output": 159, "reasoning": 147, "cache": {"read": 0, "write": 0}}
```

Currently `MessageTokens` parses `input`, `output`, `cache.read`. Add:
- `reasoning: u32` field to `MessageTokens`
- `write: u32` field to `MessageTokensCache`

### 3. Enrich `OpencodeExecutorEvent::TokenUsage`

**File:** `crates/executors/src/executors/opencode/types.rs`

Expand the `TokenUsage` variant with:
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
}
```

### 4. Update `maybe_emit_token_usage` to populate all fields

**File:** `crates/executors/src/executors/opencode/models.rs`

- Include `reasoning` in `total_tokens` calculation: `input + output + reasoning + cache_read`
- Pass `model_id` as `model_name`
- Pass individual token counts as `Option<u64>`

### 5. Update `normalize_logs` to map enriched event to `TokenUsageInfo`

**File:** `crates/executors/src/executors/opencode/normalize_logs.rs`

Map the new `TokenUsage` fields directly to `TokenUsageInfo` fields including:
- `model_name` from the event
- `input_tokens`, `output_tokens`, `reasoning_tokens`
- `cache_read_input_tokens`, `cache_creation_input_tokens`

### 6. Regenerate TypeScript types

Run `pnpm run generate-types` to pick up the new `reasoning_tokens` field.

### 7. Frontend: display reasoning tokens

**File:** `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`

In the detailed token usage view, after the `out:` display, add a `reasoning:` display when `reasoning_tokens` is present and > 0.

## Non-goals

- ACP token usage support (separate effort, different protocol)
- Cost calculation (opencode SDK reports `cost: 0` currently)
- Changes to ClaudeCode or Codex token parsing
