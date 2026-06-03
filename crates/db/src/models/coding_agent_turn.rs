use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct CodingAgentTurn {
    pub id: Uuid,
    pub execution_process_id: Uuid,
    pub agent_session_id: Option<String>,
    pub agent_message_id: Option<String>,
    pub prompt: Option<String>,  // The prompt sent to the executor
    pub summary: Option<String>, // Final assistant message/summary
    pub seen: bool,              // Whether user has viewed this turn
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub cost_usd: Option<f64>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub model_name: Option<String>,
    pub model_breakdown: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateCodingAgentTurn {
    pub execution_process_id: Uuid,
    pub prompt: Option<String>,
}

/// Session info from a coding agent turn, used for follow-up requests
#[derive(Debug)]
pub struct CodingAgentResumeInfo {
    pub session_id: String,
    pub message_id: Option<String>,
}

/// Internal struct used by context summary functions.
#[derive(FromRow)]
struct TurnForContext {
    prompt: Option<String>,
    summary: Option<String>,
    executor: Option<String>,
}

impl CodingAgentTurn {
    /// Find session info from the latest coding agent turn for a session.
    /// Only returns turns that have an agent_session_id set.
    pub async fn find_latest_session_info(
        pool: &SqlitePool,
        session_id: Uuid,
    ) -> Result<Option<CodingAgentResumeInfo>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentResumeInfo,
            r#"SELECT
                cat.agent_session_id as "session_id!",
                cat.agent_message_id as "message_id"
               FROM execution_processes ep
               JOIN coding_agent_turns cat ON ep.id = cat.execution_process_id
               WHERE ep.session_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND ep.dropped = FALSE
                 AND cat.agent_session_id IS NOT NULL
               ORDER BY ep.created_at DESC
               LIMIT 1"#,
            session_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find coding agent turn by execution process ID
    pub async fn find_by_execution_process_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentTurn,
            r#"SELECT
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                cost_usd,
                input_tokens,
                output_tokens,
                model_name,
                model_breakdown
               FROM coding_agent_turns
               WHERE execution_process_id = $1"#,
            execution_process_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_agent_session_id(
        pool: &SqlitePool,
        agent_session_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            CodingAgentTurn,
            r#"SELECT
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                cost_usd,
                input_tokens,
                output_tokens,
                model_name,
                model_breakdown
               FROM coding_agent_turns
               WHERE agent_session_id = ?
               ORDER BY updated_at DESC
               LIMIT 1"#,
            agent_session_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new coding agent turn
    pub async fn create(
        pool: &SqlitePool,
        data: &CreateCodingAgentTurn,
        id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let now = Utc::now();

        tracing::debug!(
            "Creating coding agent turn: id={}, execution_process_id={}, agent_session_id=None (will be set later)",
            id,
            data.execution_process_id
        );

        sqlx::query_as!(
            CodingAgentTurn,
            r#"INSERT INTO coding_agent_turns (
                id, execution_process_id, agent_session_id, agent_message_id, prompt, summary, seen,
                created_at, updated_at, cost_usd, input_tokens, output_tokens, model_name, model_breakdown
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
               RETURNING
                id as "id!: Uuid",
                execution_process_id as "execution_process_id!: Uuid",
                agent_session_id,
                agent_message_id,
                prompt,
                summary,
                seen as "seen!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                cost_usd,
                input_tokens,
                output_tokens,
                model_name,
                model_breakdown"#,
            id,
            data.execution_process_id,
            None::<String>, // agent_session_id initially None until parsed from output
            None::<String>, // agent_message_id initially None until parsed from output
            data.prompt,
            None::<String>, // summary initially None
            false,          // seen - defaults to unseen
            now,            // created_at
            now,            // updated_at
            None::<f64>,    // cost_usd
            None::<i64>,    // input_tokens
            None::<i64>,    // output_tokens
            None::<String>, // model_name
            None::<String>  // model_breakdown
        )
        .fetch_one(pool)
        .await
    }

    /// Update coding agent turn with agent session ID
    pub async fn update_agent_session_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        agent_session_id: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET agent_session_id = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            agent_session_id,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update coding agent turn with agent message ID (for --resume-session-at)
    pub async fn update_agent_message_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        agent_message_id: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET agent_message_id = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            agent_message_id,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update coding agent turn summary
    pub async fn update_summary(
        pool: &SqlitePool,
        execution_process_id: Uuid,
        summary: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET summary = $1, updated_at = $2
               WHERE execution_process_id = $3"#,
            summary,
            now,
            execution_process_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

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
        let mut per_model: std::collections::HashMap<String, (f64, i64, i64)> =
            std::collections::HashMap::new();

        for row in &entries {
            if let Ok(entry) = serde_json::from_str::<NormalizedEntry>(&row.entry_json)
                && let executors::logs::NormalizedEntryType::TokenUsageInfo(info) = entry.entry_type
            {
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

        if per_model.is_empty() {
            return Ok(());
        }

        // Pick primary model (highest cost)
        let primary_model = per_model
            .iter()
            .max_by(|a, b| {
                a.1.0
                    .partial_cmp(&b.1.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(name, _)| name.clone())
            .unwrap();

        // Build model_breakdown JSON
        let breakdown: std::collections::HashMap<String, serde_json::Value> = per_model
            .iter()
            .map(|(name, (cost, input, output))| {
                (
                    name.clone(),
                    serde_json::json!({
                        "cost_usd": cost,
                        "input_tokens": input,
                        "output_tokens": output,
                    }),
                )
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
        )
        .await?;

        Ok(())
    }

    /// Mark all coding agent turns for a workspace as seen
    pub async fn mark_seen_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();
        sqlx::query!(
            r#"UPDATE coding_agent_turns
               SET seen = 1, updated_at = $1
               WHERE execution_process_id IN (
                   SELECT ep.id FROM execution_processes ep
                   JOIN sessions s ON ep.session_id = s.id
                   WHERE s.workspace_id = $2
               ) AND seen = 0"#,
            now,
            workspace_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Check if a workspace has any unseen coding agent turns
    pub async fn has_unseen_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM coding_agent_turns cat
                JOIN execution_processes ep ON cat.execution_process_id = ep.id
                JOIN sessions s ON ep.session_id = s.id
                WHERE s.workspace_id = $1 AND cat.seen = 0
            ) as "has_unseen!: bool""#,
            workspace_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Find all workspaces that have unseen coding agent turns, filtered by archived status
    pub async fn find_workspaces_with_unseen(
        pool: &SqlitePool,
        archived: bool,
    ) -> Result<std::collections::HashSet<Uuid>, sqlx::Error> {
        let result: Vec<Uuid> = sqlx::query_scalar!(
            r#"SELECT DISTINCT s.workspace_id as "workspace_id!: Uuid"
               FROM coding_agent_turns cat
               JOIN execution_processes ep ON cat.execution_process_id = ep.id
               JOIN sessions s ON ep.session_id = s.id
               JOIN workspaces w ON s.workspace_id = w.id
               WHERE cat.seen = 0 AND w.archived = $1"#,
            archived
        )
        .fetch_all(pool)
        .await?;

        Ok(result.into_iter().collect())
    }

    /// Build a context summary from all coding agent turns for a session.
    /// Used when switching executors to preserve conversation history.
    /// Returns None if there are no turns with content.
    pub async fn build_context_summary(
        pool: &SqlitePool,
        session_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let turns = Self::fetch_turns_for_session(pool, session_id).await?;
        Ok(Self::format_turns(turns))
    }

    /// Build a context summary from all coding agent turns across ALL workspaces/sessions for a task.
    /// Used when retrying to a new task to preserve complete conversation history.
    pub async fn build_task_context_summary(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Option<String>, sqlx::Error> {
        let turns = Self::fetch_turns_for_task(pool, task_id).await?;
        Ok(Self::format_turns(turns))
    }

    // Shared turn formatting logic for context summaries.
    fn format_turns(turns: Vec<TurnForContext>) -> Option<String> {
        if turns.is_empty() {
            return None;
        }
        let parts: Vec<String> = turns
            .iter()
            .enumerate()
            .map(|(i, turn)| {
                let user = turn.prompt.as_deref().unwrap_or("(no message)");
                let assistant = turn.summary.as_deref().unwrap_or("(no response)");
                let executor_label = turn
                    .executor
                    .as_deref()
                    .map(|e| format!(" ({})", e))
                    .unwrap_or_default();
                format!(
                    "Turn {}{}:\nUser: {}\nAssistant: {}",
                    i + 1,
                    executor_label,
                    user,
                    assistant
                )
            })
            .collect();
        if parts.is_empty() {
            None
        } else {
            Some(parts.join("\n\n"))
        }
    }

    async fn fetch_turns_for_session(
        pool: &SqlitePool,
        session_id: Uuid,
    ) -> Result<Vec<TurnForContext>, sqlx::Error> {
        sqlx::query_as!(
            TurnForContext,
            r#"SELECT
                cat.prompt,
                cat.summary,
                s.executor
               FROM execution_processes ep
               JOIN coding_agent_turns cat ON ep.id = cat.execution_process_id
               JOIN sessions s ON ep.session_id = s.id
               WHERE ep.session_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND ep.dropped = FALSE
                 AND (cat.prompt IS NOT NULL OR cat.summary IS NOT NULL)
               ORDER BY ep.created_at ASC"#,
            session_id
        )
        .fetch_all(pool)
        .await
    }

    async fn fetch_turns_for_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<TurnForContext>, sqlx::Error> {
        sqlx::query_as!(
            TurnForContext,
            r#"SELECT
                cat.prompt,
                cat.summary,
                s.executor
               FROM execution_processes ep
               JOIN coding_agent_turns cat ON ep.id = cat.execution_process_id
               JOIN sessions s ON ep.session_id = s.id
               JOIN workspaces w ON s.workspace_id = w.id
               WHERE w.task_id = $1
                 AND ep.run_reason = 'codingagent'
                 AND ep.dropped = FALSE
                 AND (cat.prompt IS NOT NULL OR cat.summary IS NOT NULL)
               ORDER BY ep.created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }
}
