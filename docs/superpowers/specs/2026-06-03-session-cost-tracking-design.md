# Session Cost Tracking

## Problem

Each conversation session has multiple turns (execution processes), and each turn emits `TokenUsageInfo` entries with `cost_usd` and token counts. However, there is no way to see the cumulative cost of an entire session — users can only see per-turn cost inline in the conversation view. The goal is to aggregate cost data across all turns and display it in the conversation header.

## Current State

- `cost_usd` is only populated by the Claude Code executor (from `ClaudeJson::Result` messages). OpenCode, MiMoCode, and Codex executors do not provide cost data.
- Token usage data exists only in the log stream as `NormalizedEntryType::TokenUsageInfo` entries — it is not persisted in any database table.
- The frontend shows the latest `TokenUsageInfo` per execution process inline in the conversation, with no cross-turn aggregation.
- `coding_agent_turns` table has no cost or token fields.

## Design Decisions

- **Storage:** Per-turn cost records on `coding_agent_turns`, session-level aggregation via SQL at query time. No redundant session-level fields.
- **Scope:** Only aggregate turns that have `cost_usd` (i.e., Claude Code executor). Turns from other executors are excluded from cost display.
- **Trigger:** Aggregate at turn completion, inside `update_completion_and_push` flow. Covers both normal exit and manual stop.
- **Display:** Conversation header (in `AttemptHeaderActions`), showing total cost + total tokens with a popover for per-model breakdown.

## Changes

### 1. DB Migration — Add cost fields to `coding_agent_turns`

**New file:** `crates/db/migrations/20260603000000_add_cost_to_coding_agent_turns.sql`

```sql
ALTER TABLE coding_agent_turns ADD COLUMN cost_usd REAL;
ALTER TABLE coding_agent_turns ADD COLUMN input_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN output_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN model_name TEXT;
ALTER TABLE coding_agent_turns ADD COLUMN model_breakdown TEXT;  -- JSON: per-model detail
```

All columns are nullable — turns from non-Claude executors will have `NULL` values.

`model_breakdown` stores per-model detail as JSON for turns with multiple models:
```json
{
  "claude-sonnet-4-20250514": { "cost_usd": 0.1, "input_tokens": 50000, "output_tokens": 10000 },
  "claude-haiku-4-5-20251001": { "cost_usd": 0.005, "input_tokens": 20000, "output_tokens": 5000 }
}
```

`model_name` stores the primary model (highest cost in that turn) for simple queries/display.

### 2. Update `CodingAgentTurn` Rust model

**File:** `crates/db/src/models/coding_agent_turn.rs`

Add to the `CodingAgentTurn` struct:

```rust
pub cost_usd: Option<f64>,
pub input_tokens: Option<i64>,
pub output_tokens: Option<i64>,
pub model_name: Option<String>,
pub model_breakdown: Option<String>,  // JSON string
```

Add a new method `update_cost`:

```rust
pub async fn update_cost(
    pool: &SqlitePool,
    execution_process_id: Uuid,
    cost_usd: f64,
    input_tokens: i64,
    output_tokens: i64,
    model_name: &str,
) -> Result<(), sqlx::Error> { ... }
```

This method updates the `coding_agent_turns` row matching the given `execution_process_id`. If there are multiple `TokenUsageInfo` entries for different models within the same turn, they should be aggregated into a single row (sum cost and tokens, use the primary model name).

### 3. Add `aggregate_turn_cost` function

**File:** `crates/db/src/models/coding_agent_turn.rs` (or a new service file in `crates/services/`)

```rust
pub async fn aggregate_turn_cost(
    pool: &SqlitePool,
    execution_process_id: Uuid,
) -> Result<(), sqlx::Error> { ... }
```

Logic:
1. Query `normalized_entries` where `execution_process_id` matches and `entry_type` contains `token_usage_info`
2. Deserialize each `entry_json` and extract `TokenUsageInfo` entries where `model_name IS NOT NULL` (these are the final result entries with `cost_usd`)
3. Aggregate: sum `cost_usd`, `input_tokens`, `output_tokens` across all model entries
4. Pick the model name from the entry with the highest `cost_usd` as the primary `model_name`
5. Build `model_breakdown` JSON: group by model_name, sum per-model cost and tokens
6. Call `CodingAgentTurn::update_cost` with aggregated values and model_breakdown JSON

### 4. Hook into execution process completion

**File:** `crates/local-deployment/src/container.rs`

After `update_completion_and_push()` (line 573) and the `stop_execution` path (line 1595), call:

```rust
let _ = CodingAgentTurn::aggregate_turn_cost(&self.pool, exec_id).await;
```

Error handling: log and continue on failure — cost aggregation should not block the execution lifecycle.

### 5. New response type `SessionWithCost`

**File:** `crates/db/src/models/session.rs`

```rust
#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct SessionWithCost {
    pub session: Session,
    pub total_cost_usd: Option<f64>,
    pub total_input_tokens: Option<i64>,
    pub total_output_tokens: Option<i64>,
    pub model_breakdown: Vec<ModelCostBreakdown>,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct ModelCostBreakdown {
    pub model_name: String,
    pub cost_usd: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}
```

### 6. Add `Session::get_with_cost` query

**File:** `crates/db/src/models/session.rs`

```rust
pub async fn get_with_cost(
    pool: &SqlitePool,
    session_id: Uuid,
) -> Result<SessionWithCost, sqlx::Error> { ... }
```

SQL:
```sql
SELECT
    SUM(t.cost_usd) as total_cost_usd,
    SUM(t.input_tokens) as total_input_tokens,
    SUM(t.output_tokens) as total_output_tokens
FROM coding_agent_turns t
WHERE t.agent_session_id = ? AND t.cost_usd IS NOT NULL
```

For model breakdown, aggregate in Rust by parsing each turn's `model_breakdown` JSON and merging:
1. Query all turns with `cost_usd IS NOT NULL` for the session
2. Parse each turn's `model_breakdown` JSON
3. Merge per-model entries: sum cost and tokens for each model across turns
4. Return as `Vec<ModelCostBreakdown>`

### 7. Update `get_session` API endpoint

**File:** `crates/server/src/routes/sessions/mod.rs`

Change `get_session` to return `SessionWithCost`:

```rust
pub async fn get_session(
    Extension(session): Extension<Session>,
    Extension(pool): Extension<SqlitePool>,
) -> Result<ResponseJson<ApiResponse<SessionWithCost>>, ApiError> {
    let session_with_cost = Session::get_with_cost(&pool, session.id).await?;
    Ok(ResponseJson(ApiResponse::success(session_with_cost)))
}
```

### 8. Frontend — Display cost in `AttemptHeaderActions`

**File:** `frontend/src/components/panels/AttemptHeaderActions.tsx`

Add a `SessionCost` component that:
- Reads `session.total_cost_usd` and `session.total_input_tokens` / `session.total_output_tokens` from the session data
- Only renders when `total_cost_usd > 0`
- Displays: `$X.XXXX | XXK tokens` with a clickable popover
- The popover shows per-model breakdown from `session.model_breakdown`

Uses existing `formatCost` from `DisplayConversationEntry.tsx` (extract to shared utility).

The component is placed in the `AttemptHeaderActions` toolbar, between the mode selector and action buttons.

### 9. Regenerate shared types

Run `pnpm run generate-types` to update `shared/types.ts` with the new `SessionWithCost` and `ModelCostBreakdown` types.

## Out of Scope

- Real-time cost updates during turn execution (cost_usd only available at turn end)
- Cost estimation for non-Claude executors
- Per-turn cost display in the conversation view (already exists inline)
- Cost in session export HTML
