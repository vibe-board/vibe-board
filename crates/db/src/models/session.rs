use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum SessionError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Session not found")]
    NotFound,
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Executor mismatch: session uses {expected} but request specified {actual}")]
    ExecutorMismatch { expected: String, actual: String },
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Session {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub executor: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

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

#[derive(Debug, Deserialize, TS)]
pub struct CreateSession {
    pub executor: Option<String>,
}

impl Session {
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT id AS "id!: Uuid",
                      workspace_id AS "workspace_id!: Uuid",
                      executor,
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM sessions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all sessions for a workspace, ordered by most recently used.
    /// "Most recently used" is defined as the most recent non-dev server execution process.
    /// Sessions with no executions fall back to created_at for ordering.
    pub async fn find_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT s.id AS "id!: Uuid",
                      s.workspace_id AS "workspace_id!: Uuid",
                      s.executor,
                      s.created_at AS "created_at!: DateTime<Utc>",
                      s.updated_at AS "updated_at!: DateTime<Utc>"
               FROM sessions s
               LEFT JOIN (
                   SELECT ep.session_id, MAX(ep.created_at) as last_used
                   FROM execution_processes ep
                   WHERE ep.run_reason NOT IN ('devserver', 'commitmessage') AND ep.dropped = FALSE
                   GROUP BY ep.session_id
               ) latest_ep ON s.id = latest_ep.session_id
               WHERE s.workspace_id = $1
               ORDER BY latest_ep.last_used IS NULL ASC,
                        COALESCE(latest_ep.last_used, s.created_at) DESC"#,
            workspace_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find the most recently used session for a workspace.
    /// "Most recently used" is defined as the most recent non-dev server execution process.
    /// Sessions with no executions fall back to created_at for ordering.
    pub async fn find_latest_by_workspace_id(
        pool: &SqlitePool,
        workspace_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Session,
            r#"SELECT s.id AS "id!: Uuid",
                      s.workspace_id AS "workspace_id!: Uuid",
                      s.executor,
                      s.created_at AS "created_at!: DateTime<Utc>",
                      s.updated_at AS "updated_at!: DateTime<Utc>"
               FROM sessions s
               LEFT JOIN (
                   SELECT ep.session_id, MAX(ep.created_at) as last_used
                   FROM execution_processes ep
                   WHERE ep.run_reason NOT IN ('devserver', 'commitmessage') AND ep.dropped = FALSE
                   GROUP BY ep.session_id
               ) latest_ep ON s.id = latest_ep.session_id
               WHERE s.workspace_id = $1
               ORDER BY latest_ep.last_used IS NULL ASC,
                        COALESCE(latest_ep.last_used, s.created_at) DESC
               LIMIT 1"#,
            workspace_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateSession,
        id: Uuid,
        workspace_id: Uuid,
    ) -> Result<Self, SessionError> {
        Ok(sqlx::query_as!(
            Session,
            r#"INSERT INTO sessions (id, workspace_id, executor)
               VALUES ($1, $2, $3)
               RETURNING id AS "id!: Uuid",
                         workspace_id AS "workspace_id!: Uuid",
                         executor,
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>""#,
            id,
            workspace_id,
            data.executor
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn update_executor(
        pool: &SqlitePool,
        id: Uuid,
        executor: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE sessions SET executor = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2"#,
            executor,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

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
        let mut merged: std::collections::HashMap<String, (f64, i64, i64)> =
            std::collections::HashMap::new();
        for row in &rows {
            if let Some(ref json) = row.model_breakdown
                && let Ok(map) = serde_json::from_str::<
                    std::collections::HashMap<String, serde_json::Value>,
                >(json)
            {
                for (model, vals) in map {
                    let cost = vals.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let input = vals
                        .get("input_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    let output = vals
                        .get("output_tokens")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0);
                    let entry = merged.entry(model).or_insert((0.0, 0, 0));
                    entry.0 += cost;
                    entry.1 += input;
                    entry.2 += output;
                }
            }
        }

        let model_breakdown: Vec<ModelCostBreakdown> = merged
            .into_iter()
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
}
