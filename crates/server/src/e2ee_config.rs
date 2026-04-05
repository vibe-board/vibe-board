use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use utils::assets;

/// Single gateway credential.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GatewayCredential {
    pub gateway_url: String,
    pub master_secret: String,
    pub session_token: String,
    pub user_id: String,
}

impl GatewayCredential {
    /// Hash of the mutable content fields (everything except gateway_url).
    /// Used for change detection in the file watcher — not cryptographic.
    pub fn content_hash(&self) -> u64 {
        use std::{
            collections::hash_map::DefaultHasher,
            hash::{Hash, Hasher},
        };
        let mut h = DefaultHasher::new();
        self.master_secret.hash(&mut h);
        self.session_token.hash(&mut h);
        self.user_id.hash(&mut h);
        h.finish()
    }
}

/// Backward-compatible type alias so `e2ee_bridge.rs` compiles without changes.
pub type Credentials = GatewayCredential;

/// Top-level credentials file structure.
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

/// Get the credentials directory path (uses asset_dir which is environment-aware)
pub fn credentials_dir() -> PathBuf {
    assets::asset_dir()
}

/// Get the credentials file path
pub fn credentials_path() -> PathBuf {
    assets::credentials_path()
}

/// Load stored credentials from disk
pub fn load_credentials() -> Result<Credentials> {
    let path = credentials_path();
    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("Failed to read credentials from {}", path.display()))?;
    let creds: Credentials = serde_json::from_str(&data).context("Failed to parse credentials")?;
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

#[cfg(test)]
mod tests {
    use std::io::Write;

    use tempfile::NamedTempFile;

    use super::*;

    fn make_credential(url: &str) -> GatewayCredential {
        GatewayCredential {
            gateway_url: url.to_string(),
            master_secret: "secret".to_string(),
            session_token: "token".to_string(),
            user_id: "user".to_string(),
        }
    }

    #[test]
    fn test_load_new_format() {
        let mut f = NamedTempFile::new().unwrap();
        let creds_file = CredentialsFile {
            gateways: vec![make_credential("https://gw1.example.com")],
        };
        write!(f, "{}", serde_json::to_string_pretty(&creds_file).unwrap()).unwrap();

        let loaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(loaded.gateways.len(), 1);
        assert_eq!(loaded.gateways[0].gateway_url, "https://gw1.example.com");
    }

    #[test]
    fn test_load_old_format_migrates() {
        let mut f = NamedTempFile::new().unwrap();
        let old = GatewayCredential {
            gateway_url: "https://old.example.com".to_string(),
            master_secret: "s".to_string(),
            session_token: "t".to_string(),
            user_id: "u".to_string(),
        };
        write!(f, "{}", serde_json::to_string_pretty(&old).unwrap()).unwrap();

        let loaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(loaded.gateways.len(), 1);
        assert_eq!(loaded.gateways[0].gateway_url, "https://old.example.com");

        // File should now be in new format
        let reloaded = load_credentials_from_path(f.path()).unwrap();
        assert_eq!(reloaded.gateways.len(), 1);
    }

    #[test]
    fn test_credential_content_hash() {
        let c1 = make_credential("https://gw1.example.com");
        let mut c2 = make_credential("https://gw1.example.com");
        assert_eq!(c1.content_hash(), c2.content_hash());

        c2.session_token = "different".to_string();
        assert_ne!(c1.content_hash(), c2.content_hash());
    }
}
