# Session Cost Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate per-turn cost_usd and token counts across all turns in a conversation session, persist in DB, and display cumulative cost in the conversation header.

**Architecture:** Per-turn cost data is stored on `coding_agent_turns` rows. Aggregation happens at turn completion (in the `update_completion_and_push` flow). Session-level totals are computed via SQL at query time. The `get_session` API returns a `SessionWithCost` wrapper. The frontend displays cost in `AttemptHeaderActions`.

**Tech Stack:** Rust, SQLite (sqlx), React, TypeScript, Tailwind CSS, shadcn/ui

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `crates/db/migrations/20260603000000_add_cost_to_coding_agent_turns.sql` | Create | DB migration adding 5 cost columns |
| `crates/db/src/models/coding_agent_turn.rs` | Modify | Add cost fields + `update_cost` + `aggregate_turn_cost` |
| `crates/db/src/models/session.rs` | Modify | Add `SessionWithCost`, `ModelCostBreakdown`, `get_with_cost` |
| `crates/local-deployment/src/container.rs` | Modify | Hook `aggregate_turn_cost` after completion |
| `crates/server/src/routes/sessions/mod.rs` | Modify | Change `get_session` to return `SessionWithCost` |
| `frontend/src/components/panels/AttemptHeaderActions.tsx` | Modify | Add `SessionCost` display with popover |
| `frontend/src/lib/api.ts` | Modify | Update `getById` return type to `SessionWithCost` |
| `shared/types.ts` | Auto-gen | Regenerated via `pnpm run generate-types` |

---

### Task 1: DB Migration

**Files:**
- Create: `crates/db/migrations/20260603000000_add_cost_to_coding_agent_turns.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Per-turn cost tracking for coding agent turns.
-- Populated at turn completion for executors that provide cost_usd (currently Claude Code only).
-- model_breakdown stores per-model detail as JSON: {"model_name": {"cost_usd": N, "input_tokens": N, "output_tokens": N}}
ALTER TABLE coding_agent_turns ADD COLUMN cost_usd REAL;
ALTER TABLE coding_agent_turns ADD COLUMN input_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN output_tokens INTEGER;
ALTER TABLE coding_agent_turns ADD COLUMN model_name TEXT;
ALTER TABLE coding_agent_turns ADD COLUMN model_breakdown TEXT;
```

- [ ] **Step 2: Verify migration applies**

Run: `pnpm run prepare-db`
Expected: Migration runs without error, schema includes new columns.

- [ ] **Step 3: Commit**

```bash
git add crates/db/migrations/20260603000000_add_cost_to_coding_agent_turns.sql
git commit -m "feat(db): add cost columns to coding_agent_turns"
```

---

### Task 2: Update CodingAgentTurn Model + Add Aggregation

**Files:**
- Modify: `crates/db/src/models/coding_agent_turn.rs`

- [ ] **Step 1: Add cost fields to struct**

Add these fields to the `CodingAgentTurn` struct after `updated_at`:

```rust
pub cost_usd: Option<f64>,
pub input_tokens: Option<i64>,
pub output_tokens: Option<i64>,
pub model_name: Option<String>,
pub model_breakdown: Option<String>,
```

- [ ] **Step 2: Update all SELECT queries to include new columns**

Every `sqlx::query_as!` that returns `CodingAgentTurn` must add the new columns. There are 4 queries: `find_by_execution_process_id`, `find_by_agent_session_id`, `create`, and the RETURNING clause in `create`.

For the existing SELECT queries, add to the column list:
```rust
cost_usd,
input_tokens,
output_tokens,
model_name,
model_breakdown,
```

For the `create` INSERT, add the columns with `None` defaults:
```rust
r#"INSERT INTO coding_agent_turns (
    id, execution_process_id, agent_session_id, agent_message_id, prompt, summary, seen,
    created_at, updated_at, cost_usd, input_tokens, output_tokens, model_name, model_breakdown
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
   ..."#,
// existing params...
None::<f64>,     // cost_usd
None::<i64>,     // input_tokens
None::<i64>,     // output_tokens
None::<String>,  // model_name
None::<String>,  // model_breakdown
```

- [ ] **Step 3: Add `update_cost` method**

Add to `impl CodingAgentTurn`:

```rust
/// Update cost and token info for a coding agent turn.
pub async fn update_cost(
    pool: &SqlitePool,
    execution_process_id: Uuid,
    cost_usd: f64,
    input_tokens: i64,
    output_tokens: i64,
    model_name: &str,
    model_breakdown: &str,
) -> Result<(), sqlx::Error> {
    let now = Utc::now();
    sqlx::query!(
        r#"UPDATE coding_agent_turns
           SET cost_usd = $1, input_tokens = $2, output_tokens = $3,
               model_name = $4, model_breakdown = $5, updated_at = $6
           WHERE execution_process_id = $7"#,
        cost_usd,
        input_tokens,
        output_tokens,
        model_name,
        model_breakdown,
        now,
        execution_process_id
    )
    .execute(pool)
    .await?;
    Ok(())
}
```

- [ ] **Step 4: Add `aggregate_turn_cost` method**

Add to `impl CodingAgentTurn`:

```rust
/// Aggregate token usage from normalized entries for a completed turn
/// and persist cost data to the coding_agent_turns row.
pub async fn aggregate_turn_cost(
    pool: &SqlitePool,
    execution_process_id: Uuid,
) -> Result<(), sqlx::Error> {
    // Only proceed if a coding agent turn exists for this execution process
    let turn = Self::find_by_execution_process_id(pool, execution_process_id).await?;
    if turn.is_none() {
        return Ok(());
    }

    // Fetch all normalized entries for this execution process
    let entries = sqlx::query!(
        r#"SELECT entry_json FROM normalized_entries WHERE execution_id = $1"#,
        execution_process_id
    )
    .fetch_all(pool)
    .await?;

    // Extract TokenUsageInfo entries with model_name (final result entries with cost_usd)
    use executors::logs::NormalizedEntry;
    let mut total_cost: f64 = 0.0;
    let mut total_input: i64 = 0;
    let mut total_output: i64 = 0;
    let mut per_model: std::collections::HashMap<String, (f64, i64, i64)> = std::collections::HashMap::new();

    for row in &entries {
        if let Ok(entry) = serde_json::from_str::<NormalizedEntry>(&row.entry_json) {
            if let executors::logs::NormalizedEntryType::TokenUsageInfo(info) = entry.entry_type {
                // Only count entries with model_name (final results with cost_usd)
                let model = match &info.model_name {
                    Some(m) => m.clone(),
                    None => continue,
                };
                let cost = info.cost_usd.unwrap_or(0.0);
                let input = info.input_tokens.unwrap_or(0) as i64;
                let output = info.output_tokens.unwrap_or(0) as i64;

                total_cost += cost;
                total_input += input;
                total_output += output;

                let entry = per_model.entry(model).or_insert((0.0, 0, 0));
                entry.0 += cost;
                entry.1 += input;
                entry.2 += output;
            }
        }
    }

    if per_model.is_empty() {
        return Ok(());
    }

    // Pick primary model (highest cost)
    let primary_model = per_model.iter()
        .max_by(|a, b| a.1 .0.partial_cmp(&b.1 .0).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(name, _)| name.clone())
        .unwrap();

    // Build model_breakdown JSON
    let breakdown: std::collections::HashMap<String, serde_json::Value> = per_model.iter()
        .map(|(name, (cost, input, output))| {
            (name.clone(), serde_json::json!({
                "cost_usd": cost,
                "input_tokens": input,
                "output_tokens": output,
            }))
        })
        .collect();
    let breakdown_json = serde_json::to_string(&breakdown).unwrap_or_default();

    Self::update_cost(
        pool,
        execution_process_id,
        total_cost,
        total_input,
        total_output,
        &primary_model,
        &breakdown_json,
    ).await?;

    Ok(())
}
```

- [ ] **Step 5: Verify compilation**

Run: `cargo check -p db`
Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add crates/db/src/models/coding_agent_turn.rs
git commit -m "feat(db): add cost fields and aggregate_turn_cost to CodingAgentTurn"
```

---

### Task 3: Hook Aggregation into Execution Process Completion

**Files:**
- Modify: `crates/local-deployment/src/container.rs`

- [ ] **Step 1: Add aggregate call after update_completion_and_push in spawn_exit_monitor**

In `spawn_exit_monitor()`, after the `update_completion_and_push` call (around line 573), add:

```rust
// Aggregate cost data for coding agent turns
if let Err(e) = CodingAgentTurn::aggregate_turn_cost(&self.db.pool, exec_id).await {
    tracing::warn!("Failed to aggregate turn cost for {}: {}", exec_id, e);
}
```

- [ ] **Step 2: Add aggregate call after update_completion_and_push in stop_execution**

In `stop_execution()`, after the `update_completion_and_push` call (around line 1595), add:

```rust
// Aggregate cost data for coding agent turns
if let Err(e) = CodingAgentTurn::aggregate_turn_cost(&self.db.pool, execution_process.id).await {
    tracing::warn!("Failed to aggregate turn cost for {}: {}", execution_process.id, e);
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p local-deployment`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/local-deployment/src/container.rs
git commit -m "feat: hook turn cost aggregation into execution completion"
```

---

### Task 4: Add SessionWithCost Response Type and Query

**Files:**
- Modify: `crates/db/src/models/session.rs`

- [ ] **Step 1: Add new types**

Add after the `Session` struct:

```rust
/// Session with aggregated cost data across all turns.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct SessionWithCost {
    #[serde(flatten)]
    pub session: Session,
    pub total_cost_usd: Option<f64>,
    pub total_input_tokens: Option<i64>,
    pub total_output_tokens: Option<i64>,
    pub model_breakdown: Vec<ModelCostBreakdown>,
}

/// Per-model cost breakdown aggregated across turns.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ModelCostBreakdown {
    pub model_name: String,
    pub cost_usd: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
}
```

- [ ] **Step 2: Add `get_with_cost` method**

Add to `impl Session`:

```rust
/// Load session with aggregated cost data from all coding agent turns.
pub async fn get_with_cost(
    pool: &SqlitePool,
    session_id: Uuid,
) -> Result<Option<SessionWithCost>, sqlx::Error> {
    let session = match Self::find_by_id(pool, session_id).await? {
        Some(s) => s,
        None => return Ok(None),
    };

    // Aggregate totals
    let totals = sqlx::query!(
        r#"SELECT
            SUM(cost_usd) as "total_cost: f64",
            SUM(input_tokens) as "total_input: i64",
            SUM(output_tokens) as "total_output: i64"
           FROM coding_agent_turns cat
           JOIN execution_processes ep ON cat.execution_process_id = ep.id
           WHERE ep.session_id = $1 AND cat.cost_usd IS NOT NULL"#,
        session_id
    )
    .fetch_one(pool)
    .await?;

    // Fetch per-turn model_breakdown JSON to merge
    let rows = sqlx::query!(
        r#"SELECT cat.model_breakdown
           FROM coding_agent_turns cat
           JOIN execution_processes ep ON cat.execution_process_id = ep.id
           WHERE ep.session_id = $1 AND cat.model_breakdown IS NOT NULL"#,
        session_id
    )
    .fetch_all(pool)
    .await?;

    // Merge model breakdowns across turns
    let mut merged: std::collections::HashMap<String, (f64, i64, i64)> = std::collections::HashMap::new();
    for row in &rows {
        if let Some(ref json) = row.model_breakdown {
            if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(json) {
                for (model, vals) in map {
                    let cost = vals.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let input = vals.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    let output = vals.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                    let entry = merged.entry(model).or_insert((0.0, 0, 0));
                    entry.0 += cost;
                    entry.1 += input;
                    entry.2 += output;
                }
            }
        }
    }

    let model_breakdown: Vec<ModelCostBreakdown> = merged.into_iter()
        .map(|(name, (cost, input, output))| ModelCostBreakdown {
            model_name: name,
            cost_usd: cost,
            input_tokens: input,
            output_tokens: output,
        })
        .collect();

    Ok(Some(SessionWithCost {
        session,
        total_cost_usd: totals.total_cost,
        total_input_tokens: totals.total_input,
        total_output_tokens: totals.total_output,
        model_breakdown,
    }))
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p db`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/db/src/models/session.rs
git commit -m "feat(db): add SessionWithCost type and get_with_cost query"
```

---

### Task 5: Update get_session API Endpoint

**Files:**
- Modify: `crates/server/src/routes/sessions/mod.rs`

- [ ] **Step 1: Update get_session handler**

Replace the existing `get_session` function:

```rust
pub async fn get_session(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<SessionWithCost>>, ApiError> {
    let pool = &deployment.db().pool;
    let session_with_cost = Session::get_with_cost(pool, session.id)
        .await?
        .ok_or(ApiError::Session(db::models::session::SessionError::NotFound))?;
    Ok(ResponseJson(ApiResponse::success(session_with_cost)))
}
```

- [ ] **Step 2: Add import for SessionWithCost**

Add to the imports at the top of the file:

```rust
use db::models::session::SessionWithCost;
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check -p server`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/sessions/mod.rs
git commit -m "feat(api): return SessionWithCost from get_session endpoint"
```

---

### Task 6: Regenerate Shared Types

**Files:**
- Auto-modified: `shared/types.ts`

- [ ] **Step 1: Generate types**

Run: `pnpm run generate-types`
Expected: `shared/types.ts` now includes `SessionWithCost` and `ModelCostBreakdown` types.

- [ ] **Step 2: Verify types exist**

Run: `grep -n 'SessionWithCost\|ModelCostBreakdown' shared/types.ts`
Expected: Both types appear in the file.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "chore: regenerate shared types for SessionWithCost"
```

---

### Task 7: Frontend — Display Session Cost in Header

**Files:**
- Modify: `frontend/src/components/panels/AttemptHeaderActions.tsx`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update API return type**

In `frontend/src/lib/api.ts`, change `getById` return type:

```typescript
getById: async (sessionId: string): Promise<SessionWithCost> => {
    const response = await makeReq(`/api/sessions/${sessionId}`);
    return handleApiResponse<SessionWithCost>(response);
},
```

Add import at top of file (from `shared/types`):
```typescript
import type { SessionWithCost } from 'shared/types';
```

- [ ] **Step 2: Add SessionCost component to AttemptHeaderActions**

In `frontend/src/components/panels/AttemptHeaderActions.tsx`, add the component and wire it in.

Add imports:
```typescript
import { DollarSign, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { SessionWithCost } from 'shared/types';
```

Add helper functions (before the component):
```typescript
const formatCost = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;

const formatTokens = (n: number) => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toString();
};
```

Add `SessionCost` component:
```typescript
const SessionCost = ({ session }: { session: SessionWithCost }) => {
  if (!session.total_cost_usd || session.total_cost_usd <= 0) return null;

  const totalTokens =
    (session.total_input_tokens ?? 0) + (session.total_output_tokens ?? 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted">
          <DollarSign className="h-3 w-3" />
          <span className="font-medium">{formatCost(session.total_cost_usd)}</span>
          <span className="opacity-50">|</span>
          <span>{formatTokens(totalTokens)} tokens</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cost by Model
          </div>
          {session.model_breakdown.map((m) => (
            <div key={m.model_name} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium truncate">{m.model_name}</span>
                <span className="text-muted-foreground">{formatCost(m.cost_usd)}</span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground pl-0">
                <span>in: {formatTokens(m.input_tokens)}</span>
                <span>out: {formatTokens(m.output_tokens)}</span>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
```

- [ ] **Step 3: Wire SessionCost into AttemptHeaderActions**

In the `AttemptHeaderActions` component, the `attempt?.session` currently has type `Session`. We need to check if the session has cost data. Since the `get_session` API now returns `SessionWithCost`, the `session` in `WorkspaceWithSession` will need to be typed as `SessionWithCost`.

Update `frontend/src/types/attempt.ts`:
```typescript
import type { Workspace, SessionWithCost } from 'shared/types';

export type WorkspaceWithSession = Workspace & {
  session: SessionWithSession | undefined;
};
```

Wait — the `WorkspaceWithSession` type is used in many places. Let me check the impact. Actually, since `SessionWithCost` uses `#[serde(flatten)]` on the `session` field, the JSON response will include all `Session` fields plus the cost fields. So the existing `Session` type won't have the cost fields.

The cleanest approach: update `WorkspaceWithSession` to use `SessionWithCost` instead of `Session`:

In `frontend/src/types/attempt.ts`:
```typescript
import type { Workspace, SessionWithCost } from 'shared/types';

export type WorkspaceWithSession = Workspace & {
  session: SessionWithCost | undefined;
};
```

Then in `AttemptHeaderActions`, add the `SessionCost` display before the `ActionsDropdown`:

```tsx
{attempt?.session && <SessionCost session={attempt.session} />}
```

- [ ] **Step 4: Verify frontend compiles**

Run: `pnpm run check`
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/panels/AttemptHeaderActions.tsx frontend/src/lib/api.ts frontend/src/types/attempt.ts
git commit -m "feat(ui): display session cost in conversation header"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Run Rust tests**

Run: `cargo test --workspace`
Expected: All tests pass.

- [ ] **Step 2: Run frontend checks**

Run: `pnpm run check && pnpm run lint`
Expected: No errors.

- [ ] **Step 3: Run full type generation**

Run: `pnpm run generate-types:check`
Expected: Generated types match.
