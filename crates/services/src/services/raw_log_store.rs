use std::path::{Path, PathBuf};

use tokio::io::AsyncWriteExt;
use utils::assets::asset_dir;
use uuid::Uuid;

/// Directory where raw execution logs are stored as JSONL files.
fn logs_dir() -> PathBuf {
    asset_dir().join("logs")
}

/// Path to the active (uncompressed) log file for an execution.
fn log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl", execution_id))
}

/// Path to the compressed log file for a finished execution.
fn compressed_log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl.zst", execution_id))
}

/// Ensure the logs directory exists.
pub async fn ensure_logs_dir() -> std::io::Result<()> {
    tokio::fs::create_dir_all(logs_dir()).await
}

/// Append a JSONL line to the raw log file for an execution.
pub async fn append_log_line(execution_id: Uuid, line: &str) -> std::io::Result<()> {
    let path = log_path(execution_id);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await?;
    file.write_all(line.as_bytes()).await?;
    Ok(())
}

/// Compress the raw log file with zstd after execution finishes.
/// Deletes the uncompressed file on success.
pub async fn compress_log_file(execution_id: Uuid) -> std::io::Result<()> {
    let src = log_path(execution_id);
    if !src.exists() {
        return Ok(());
    }
    let dst = compressed_log_path(execution_id);

    // Run blocking zstd compression on a dedicated thread
    let result = tokio::task::spawn_blocking(move || {
        let input = std::fs::File::open(&src)?;
        let output = std::fs::File::create(&dst)?;
        let mut encoder = zstd::Encoder::new(output, 3)?; // level 3 = good balance
        std::io::copy(&mut std::io::BufReader::new(input), &mut encoder)?;
        encoder.finish()?;
        std::fs::remove_file(&src)?;
        Ok::<_, std::io::Error>(())
    })
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    result
}

/// Read all JSONL lines from the log file (compressed or plain).
/// Returns None if no log file exists for this execution.
pub async fn read_log_lines(execution_id: Uuid) -> Option<Vec<String>> {
    let compressed = compressed_log_path(execution_id);
    let plain = log_path(execution_id);

    if compressed.exists() {
        read_compressed_lines(&compressed).await.ok()
    } else if plain.exists() {
        read_plain_lines(&plain).await.ok()
    } else {
        None
    }
}

async fn read_plain_lines(path: &Path) -> std::io::Result<Vec<String>> {
    let content = tokio::fs::read_to_string(path).await?;
    Ok(content
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect())
}

async fn read_compressed_lines(path: &Path) -> std::io::Result<Vec<String>> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        use std::io::BufRead;
        let file = std::fs::File::open(&path)?;
        let decoder = zstd::Decoder::new(file)?;
        let reader = std::io::BufReader::new(decoder);
        let lines: Vec<String> = reader
            .lines()
            .filter_map(|l| l.ok())
            .filter(|l| !l.is_empty())
            .collect();
        Ok(lines)
    })
    .await
    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
}

/// Delete log files (both compressed and plain) for a list of execution IDs.
pub async fn delete_log_files(execution_ids: &[Uuid]) {
    for id in execution_ids {
        let plain = log_path(*id);
        let compressed = compressed_log_path(*id);
        if plain.exists() {
            let _ = tokio::fs::remove_file(&plain).await;
        }
        if compressed.exists() {
            let _ = tokio::fs::remove_file(&compressed).await;
        }
    }
}
