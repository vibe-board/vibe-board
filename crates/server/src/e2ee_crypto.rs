use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use e2ee_core::{derive_auth_keypair, derive_content_keypair, AuthKeyPair, ContentKeyPair};

use anyhow::{Context, Result};

/// Crypto service for the bridge.
/// Manages key derivation from master secret.
pub struct BridgeCryptoService {
    pub auth_keypair: AuthKeyPair,
    pub content_keypair: ContentKeyPair,
}

impl BridgeCryptoService {
    /// Create a new crypto service from a base64-encoded master secret
    pub fn from_master_secret_b64(master_secret_b64: &str) -> Result<Self> {
        let master_bytes = BASE64
            .decode(master_secret_b64)
            .context("Invalid base64 master secret")?;

        if master_bytes.len() != 32 {
            anyhow::bail!(
                "Master secret must be 32 bytes, got {}",
                master_bytes.len()
            );
        }

        let mut master = [0u8; 32];
        master.copy_from_slice(&master_bytes);

        let auth_keypair = derive_auth_keypair(&master).context("Failed to derive auth keypair")?;
        let content_keypair =
            derive_content_keypair(&master).context("Failed to derive content keypair")?;

        Ok(Self {
            auth_keypair,
            content_keypair,
        })
    }

    /// Create a signed auth token for gateway authentication
    pub fn create_auth_token(&self) -> Result<e2ee_core::SignedAuthToken> {
        e2ee_core::create_signed_token(&self.auth_keypair.secret_key)
            .map_err(|e| anyhow::anyhow!("Failed to create auth token: {e}"))
    }

    /// Get the base64-encoded Ed25519 public key (for device registration)
    pub fn auth_public_key_b64(&self) -> String {
        BASE64.encode(self.auth_keypair.public_key)
    }
}
