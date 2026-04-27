use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct SessionConversationEntry {
    pub execution_id: Uuid,
    pub entry_index: i64,
    pub entry_json: String,
    pub process_created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct NormalizedEntry {
    pub execution_id: Uuid,
    pub entry_index: i64,
    pub entry_json: String,
    pub inserted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedEntries {
    pub entries: Vec<NormalizedEntry>,
    pub total_count: i64,
    pub has_more_before: bool,
    pub has_more_after: bool,
}

impl NormalizedEntry {
    /// Insert a batch of normalized entries for an execution process.
    /// `session_id` and `process_created_at` are looked up from
    /// `execution_processes` so callers don't have to pass them. The subquery
    /// assumes the execution process row exists (which it must: `insert_batch`
    /// is only called for a started process).
    pub async fn insert_batch(
        pool: &SqlitePool,
        execution_id: Uuid,
        entries: &[(i64, String)], // (entry_index, entry_json)
    ) -> Result<(), sqlx::Error> {
        if entries.is_empty() {
            return Ok(());
        }

        // Use a transaction for batch insert
        let mut tx = pool.begin().await?;

        for (entry_index, entry_json) in entries {
            sqlx::query!(
                r#"INSERT INTO normalized_entries
                       (execution_id, entry_index, entry_json, session_id, process_created_at)
                   SELECT $1, $2, $3, ep.session_id, ep.created_at
                   FROM execution_processes ep
                   WHERE ep.id = $1
                   ON CONFLICT(execution_id, entry_index) DO UPDATE SET
                       entry_json = excluded.entry_json"#,
                execution_id,
                entry_index,
                entry_json
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    /// Find entries for an execution process with pagination
    /// offset: number of entries to skip
    /// limit: maximum number of entries to return
    pub async fn find_by_execution_id_paginated(
        pool: &SqlitePool,
        execution_id: Uuid,
        offset: i64,
        limit: i64,
    ) -> Result<PaginatedEntries, sqlx::Error> {
        // Get total count
        let total_count = Self::count_by_execution_id(pool, execution_id).await?;

        // Get paginated entries
        let entries = sqlx::query_as!(
            NormalizedEntry,
            r#"SELECT
                execution_id as "execution_id!: Uuid",
                entry_index,
                entry_json,
                inserted_at as "inserted_at!: DateTime<Utc>"
               FROM normalized_entries
               WHERE execution_id = $1
               ORDER BY entry_index ASC
               LIMIT $2 OFFSET $3"#,
            execution_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        let has_more_after = (offset + limit) < total_count;

        Ok(PaginatedEntries {
            entries,
            total_count,
            has_more_before: offset > 0,
            has_more_after,
        })
    }

    /// Find entries for an execution process using cursor-based pagination.
    /// `before`: if Some(n), returns entries with entry_index < n (DESC, reversed to ASC).
    /// If None, returns the last `limit` entries.
    pub async fn find_by_execution_id_cursor(
        pool: &SqlitePool,
        execution_id: Uuid,
        before: Option<i64>,
        limit: i64,
    ) -> Result<PaginatedEntries, sqlx::Error> {
        let total_count = Self::count_by_execution_id(pool, execution_id).await?;

        // Fetch limit+1 to detect whether more entries exist
        let fetch_limit = limit + 1;

        let mut entries: Vec<NormalizedEntry> = if let Some(before_index) = before {
            sqlx::query_as!(
                NormalizedEntry,
                r#"SELECT
                    execution_id as "execution_id!: Uuid",
                    entry_index,
                    entry_json,
                    inserted_at as "inserted_at!: DateTime<Utc>"
                   FROM normalized_entries
                   WHERE execution_id = $1 AND entry_index < $2
                   ORDER BY entry_index DESC
                   LIMIT $3"#,
                execution_id,
                before_index,
                fetch_limit
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as!(
                NormalizedEntry,
                r#"SELECT
                    execution_id as "execution_id!: Uuid",
                    entry_index,
                    entry_json,
                    inserted_at as "inserted_at!: DateTime<Utc>"
                   FROM normalized_entries
                   WHERE execution_id = $1
                   ORDER BY entry_index DESC
                   LIMIT $2"#,
                execution_id,
                fetch_limit
            )
            .fetch_all(pool)
            .await?
        };

        let has_more_before = entries.len() > limit as usize;
        entries.truncate(limit as usize);
        entries.reverse();

        // If before was None, we loaded from the very end — nothing after.
        // If before was Some, we loaded a page before the cursor — entries after exist.
        let has_more_after = before.is_some();

        Ok(PaginatedEntries {
            entries,
            total_count,
            has_more_before,
            has_more_after,
        })
    }

    /// Count total entries for an execution process
    pub async fn count_by_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query!(
            r#"SELECT COUNT(*) as "count: i64"
               FROM normalized_entries
               WHERE execution_id = $1"#,
            execution_id
        )
        .fetch_one(pool)
        .await?;

        Ok(row.count)
    }

    /// Check if normalized entries exist for an execution process
    pub async fn exists_for_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let count = Self::count_by_execution_id(pool, execution_id).await?;
        Ok(count > 0)
    }

    /// Delete all entries for an execution process
    pub async fn delete_by_execution_id(
        pool: &SqlitePool,
        execution_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM normalized_entries WHERE execution_id = $1",
            execution_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected())
    }

    /// Load entries across all processes in a session, ordered chronologically.
    /// `before = true` loads entries strictly before the cursor (DESC, reversed
    /// to ASC). `before = false` loads entries strictly after the cursor (ASC).
    /// When `cursor` is `None`, `before = true` returns the tail and
    /// `before = false` returns the head of the session.
    ///
    /// Fetches `limit + 1` to detect has_more. Filtering uses the denormalized
    /// `session_id` and `process_created_at` columns plus the
    /// `idx_normalized_entries_session` composite index, so no JOIN is needed.
    /// Dropped processes have already had their rows deleted by
    /// `ExecutionProcess::drop_at_and_after`.
    pub async fn find_by_session_flat(
        pool: &SqlitePool,
        session_id: Uuid,
        cursor: Option<(DateTime<Utc>, i64)>,
        before: bool,
        limit: i64,
    ) -> Result<(Vec<SessionConversationEntry>, bool), sqlx::Error> {
        let fetch_limit = limit + 1;
        let (cursor_at, cursor_idx) = match cursor {
            Some((at, idx)) => (Some(at), Some(idx)),
            None => (None, None),
        };

        let rows = if before {
            sqlx::query_as!(
                SessionConversationEntry,
                r#"SELECT
                    execution_id as "execution_id!: Uuid",
                    entry_index,
                    entry_json,
                    process_created_at as "process_created_at!: DateTime<Utc>"
                   FROM normalized_entries
                   WHERE session_id = $1
                     AND (
                       $2 IS NULL
                       OR process_created_at < $2
                       OR (process_created_at = $2 AND entry_index < $3)
                     )
                   ORDER BY process_created_at DESC, entry_index DESC
                   LIMIT $4"#,
                session_id,
                cursor_at,
                cursor_idx,
                fetch_limit
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as!(
                SessionConversationEntry,
                r#"SELECT
                    execution_id as "execution_id!: Uuid",
                    entry_index,
                    entry_json,
                    process_created_at as "process_created_at!: DateTime<Utc>"
                   FROM normalized_entries
                   WHERE session_id = $1
                     AND (
                       $2 IS NULL
                       OR process_created_at > $2
                       OR (process_created_at = $2 AND entry_index > $3)
                     )
                   ORDER BY process_created_at ASC, entry_index ASC
                   LIMIT $4"#,
                session_id,
                cursor_at,
                cursor_idx,
                fetch_limit
            )
            .fetch_all(pool)
            .await?
        };

        let has_more = rows.len() > limit as usize;
        let mut rows: Vec<SessionConversationEntry> =
            rows.into_iter().take(limit as usize).collect();

        // `before` fetched DESC; reverse to ASC for client consumption.
        if before {
            rows.reverse();
        }

        Ok((rows, has_more))
    }
}
