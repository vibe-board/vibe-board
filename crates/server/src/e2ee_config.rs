use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Stored credentials for the bridge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    /// Base64-encoded 32-byte master secret
    pub master_secret: String,
    /// Gateway URL
    pub gateway_url: String,
    /// Session token from login
    pub session_token: String,
    /// User ID
    pub user_id: String,
}

/// Get the credentials directory path (~/.vibe-kanban/)
pub fn credentials_dir() -> PathBuf {
    dirs_or_default().join(".vibe-kanban")
}

/// Get the credentials file path (~/.vibe-kanban/credentials.json)
pub fn credentials_path() -> PathBuf {
    credentials_dir().join("credentials.json")
}

fn dirs_or_default() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Load stored credentials from disk
pub fn load_credentials() -> Result<Credentials> {
    let path = credentials_path();
    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read credentials from {}", path.display()))?;
    let creds: Credentials =
        serde_json::from_str(&data).context("Failed to parse credentials")?;
    Ok(creds)
}

/// Save credentials to disk with restricted permissions
pub fn save_credentials(creds: &Credentials) -> Result<()> {
    let dir = credentials_dir();
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("Failed to create directory {}", dir.display()))?;

    let path = credentials_path();
    let data = serde_json::to_string_pretty(creds)?;
    std::fs::write(&path, &data)
        .with_context(|| format!("Failed to write credentials to {}", path.display()))?;

    // Set file permissions to 0600 (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

/// Delete stored credentials
pub fn delete_credentials() -> Result<()> {
    let path = credentials_path();
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}
