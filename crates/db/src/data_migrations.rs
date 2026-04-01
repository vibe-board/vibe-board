use std::path::PathBuf;

use sqlx::{Pool, Row, Sqlite};
use utils::assets::asset_dir;
use uuid::Uuid;

/// Run all Rust data migrations that require filesystem access.
/// Called after SQL migrations complete during DBService::new().
pub async fn run(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    export_execution_process_logs(pool).await?;
    Ok(())
}

/// Export execution_process_logs rows to per-execution zstd-compressed JSONL files,
/// then drop the table. Idempotent: skips executions that already have files,
/// retains the table if any export fails.
async fn export_execution_process_logs(pool: &Pool<Sqlite>) -> Result<(), sqlx::Error> {
    // Check if the table still exists
    let table_exists: bool = sqlx::query_scalar(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='execution_process_logs'",
    )
    .fetch_one(pool)
    .await?;

    if !table_exists {
        return Ok(());
    }

    // Get distinct execution IDs
    let rows = sqlx::query("SELECT DISTINCT execution_id FROM execution_process_logs")
        .fetch_all(pool)
        .await?;

    if rows.is_empty() {
        // Table exists but is empty — just drop it and reclaim space
        tracing::info!(
            "[data_migration] execution_process_logs: table empty, dropping and vacuuming"
        );
        sqlx::query("DROP TABLE IF EXISTS execution_process_logs")
            .execute(pool)
            .await?;
        sqlx::query("VACUUM").execute(pool).await?;
        return Ok(());
    }

    let total = rows.len();
    tracing::info!(
        "[data_migration] execution_process_logs: found {} executions to export",
        total
    );

    let logs_dir = asset_dir().join("logs");
    tokio::fs::create_dir_all(&logs_dir)
        .await
        .map_err(sqlx::Error::Io)?;

    let mut exported_count: usize = 0;
    let mut skipped_count: usize = 0;
    let mut failed_count: usize = 0;
    let mut total_bytes: i64 = 0;

    for (i, row) in rows.iter().enumerate() {
        let raw_id: Vec<u8> = row.get("execution_id");
        let id = match Uuid::from_slice(&raw_id) {
            Ok(id) => id,
            Err(e) => {
                tracing::warn!(
                    "[data_migration] execution_process_logs: [{}/{}] invalid UUID: {}",
                    i + 1,
                    total,
                    e
                );
                failed_count += 1;
                continue;
            }
        };

        let short_id = &id.to_string()[..8];
        let zst_path = logs_dir.join(format!("{}.jsonl.zst", id));
        let jsonl_path = logs_dir.join(format!("{}.jsonl", id));

        // Idempotent: skip if already exported
        if zst_path.exists() || jsonl_path.exists() {
            skipped_count += 1;
            if should_log_progress(i + 1, total) {
                tracing::info!(
                    "[data_migration] execution_process_logs: [{}/{}] skipped {} (file exists)",
                    i + 1,
                    total,
                    short_id
                );
            }
            continue;
        }

        match export_single_execution(pool, &raw_id, id, &zst_path).await {
            Ok((row_count, compressed_size, byte_size)) => {
                exported_count += 1;
                total_bytes += byte_size;
                if should_log_progress(i + 1, total) {
                    tracing::info!(
                        "[data_migration] execution_process_logs: [{}/{}] exported {} ({} rows, {:.1} KB compressed)",
                        i + 1,
                        total,
                        short_id,
                        row_count,
                        compressed_size as f64 / 1024.0
                    );
                }
            }
            Err(e) => {
                failed_count += 1;
                tracing::warn!(
                    "[data_migration] execution_process_logs: [{}/{}] failed {}: {}",
                    i + 1,
                    total,
                    short_id,
                    e
                );
            }
        }
    }

    if failed_count > 0 {
        tracing::info!(
            "[data_migration] execution_process_logs: exported {}/{}, skipped {}, {} failed — table retained for retry",
            exported_count,
            total,
            skipped_count,
            failed_count
        );
    } else {
        // All succeeded — drop the table and reclaim disk space
        sqlx::query("DROP TABLE IF EXISTS execution_process_logs")
            .execute(pool)
            .await?;
        tracing::info!(
            "[data_migration] execution_process_logs: dropped table, running VACUUM to reclaim disk space..."
        );
        sqlx::query("VACUUM").execute(pool).await?;
        tracing::info!(
            "[data_migration] execution_process_logs: complete — exported {}, skipped {}, freed ~{:.1} MB",
            exported_count,
            skipped_count,
            total_bytes as f64 / (1024.0 * 1024.0)
        );
    }

    Ok(())
}

/// Export a single execution's logs to a zstd-compressed JSONL file.
/// Returns (row_count, compressed_file_size, original_byte_size).
async fn export_single_execution(
    pool: &Pool<Sqlite>,
    raw_id: &[u8],
    id: Uuid,
    zst_path: &PathBuf,
) -> Result<(usize, u64, i64), Box<dyn std::error::Error + Send + Sync>> {
    // Fetch all log rows for this execution, ordered by insertion time
    let log_rows = sqlx::query(
        "SELECT logs, byte_size FROM execution_process_logs WHERE execution_id = ? ORDER BY inserted_at",
    )
    .bind(raw_id)
    .fetch_all(pool)
    .await?;

    let row_count = log_rows.len();
    let mut content = String::new();
    let mut byte_size: i64 = 0;
    for log_row in &log_rows {
        let logs: String = log_row.get("logs");
        byte_size += log_row.get::<i64, _>("byte_size");
        content.push_str(&logs);
    }

    if content.is_empty() {
        return Ok((0, 0, 0));
    }

    // Compress and write to file on a blocking thread
    let content_bytes = content.into_bytes();
    let zst = zst_path.clone();
    let compressed_size = tokio::task::spawn_blocking(move || -> Result<u64, std::io::Error> {
        let output = std::fs::File::create(&zst)?;
        let mut encoder = zstd::Encoder::new(output, 3)?;
        std::io::Write::write_all(&mut encoder, &content_bytes)?;
        encoder.finish()?;
        let metadata = std::fs::metadata(&zst)?;
        Ok(metadata.len())
    })
    .await??;

    Ok((row_count, compressed_size, byte_size))
}

/// Decide whether to log progress for this index.
/// Logs every execution if total < 50, otherwise every 50th.
fn should_log_progress(current: usize, total: usize) -> bool {
    if total <= 50 {
        return true;
    }
    current % 50 == 0 || current == total || current == 1
}
