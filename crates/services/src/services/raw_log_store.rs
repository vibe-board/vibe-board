use std::{path::PathBuf, sync::Arc};

use tokio::sync::Mutex;
use utils::assets::asset_dir;
use uuid::Uuid;

/// Directory where raw execution logs are stored.
fn logs_dir() -> PathBuf {
    asset_dir().join("logs")
}

/// Path to the compressed log file for an execution.
fn compressed_log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl.zst", execution_id))
}

/// Path to the legacy uncompressed log file for an execution.
fn plain_log_path(execution_id: Uuid) -> PathBuf {
    logs_dir().join(format!("{}.jsonl", execution_id))
}

/// Ensure the logs directory exists.
pub async fn ensure_logs_dir() -> std::io::Result<()> {
    tokio::fs::create_dir_all(logs_dir()).await
}

/// A zstd-compressed JSONL writer that flushes each line immediately.
/// The encoder writes through a BufWriter to reduce syscalls.
pub struct ZstLogWriter {
    execution_id: Uuid,
    /// Inner writer guarded by a mutex so callers can use &self.
    inner: Arc<Mutex<Option<zstd::Encoder<'static, std::io::BufWriter<std::fs::File>>>>>,
}

impl ZstLogWriter {
    /// Create a new writer that streams zstd-compressed JSONL directly to disk.
    pub async fn new(execution_id: Uuid) -> std::io::Result<Self> {
        ensure_logs_dir().await?;
        let path = compressed_log_path(execution_id);
        // spawn_blocking because zstd::Encoder::new is blocking I/O
        let encoder = tokio::task::spawn_blocking(move || -> std::io::Result<_> {
            let file = std::fs::File::create(&path)?;
            let buf = std::io::BufWriter::with_capacity(64 * 1024, file);
            let mut encoder = zstd::Encoder::new(buf, 3)?;
            // Don't write the content size header — we stream and don't know the final size.
            encoder.include_contentsize(false)?;
            Ok(encoder)
        })
        .await
        .map_err(std::io::Error::other)??;

        Ok(Self {
            execution_id,
            inner: Arc::new(Mutex::new(Some(encoder))),
        })
    }

    /// Append a JSONL line (must include trailing newline).
    pub async fn append_line(&self, line: &str) -> std::io::Result<()> {
        let line = line.to_owned();
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let mut guard = inner.blocking_lock();
            if let Some(ref mut encoder) = *guard {
                use std::io::Write;
                encoder.write_all(line.as_bytes())?;
                encoder.flush()?;
            }
            Ok(())
        })
        .await
        .map_err(std::io::Error::other)?
    }

    /// Finalize the zstd frame and close the file.
    /// After this, append_line is a no-op.
    pub async fn finish(&self) -> std::io::Result<()> {
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            let encoder = inner.blocking_lock().take();
            if let Some(encoder) = encoder {
                encoder.finish()?;
            }
            Ok(())
        })
        .await
        .map_err(std::io::Error::other)?
    }

    pub fn execution_id(&self) -> Uuid {
        self.execution_id
    }
}

/// Read all JSONL lines from a log file (zst preferred, plain fallback).
/// Returns None if no log file exists for this execution.
pub async fn read_log_lines(execution_id: Uuid) -> Option<Vec<String>> {
    let zst = compressed_log_path(execution_id);
    let plain = plain_log_path(execution_id);

    if zst.exists() {
        read_compressed_lines(&zst).await.ok()
    } else if plain.exists() {
        read_plain_lines(&plain).await.ok()
    } else {
        None
    }
}

async fn read_compressed_lines(path: &std::path::Path) -> std::io::Result<Vec<String>> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        use std::io::BufRead;
        let file = std::fs::File::open(&path)?;
        let decoder = zstd::Decoder::new(file)?;
        let reader = std::io::BufReader::new(decoder);
        let lines: Vec<String> = reader
            .lines()
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|l| !l.is_empty())
            .collect();
        Ok(lines)
    })
    .await
    .map_err(std::io::Error::other)?
}

async fn read_plain_lines(path: &std::path::Path) -> std::io::Result<Vec<String>> {
    let content = tokio::fs::read_to_string(path).await?;
    Ok(content
        .lines()
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect())
}

/// Delete log files (both zst and plain) for a list of execution IDs.
pub async fn delete_log_files(execution_ids: &[Uuid]) {
    for id in execution_ids {
        let plain = plain_log_path(*id);
        let compressed = compressed_log_path(*id);
        if plain.exists() {
            let _ = tokio::fs::remove_file(&plain).await;
        }
        if compressed.exists() {
            let _ = tokio::fs::remove_file(&compressed).await;
        }
    }
}
