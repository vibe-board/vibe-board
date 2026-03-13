use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::error::{E2EEError, Result};

/// Maximum age of a signed token before it's considered expired (5 minutes)
const TOKEN_MAX_AGE_SECS: u64 = 300;

/// The payload that gets signed by the daemon's Ed25519 key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedPayload {
    /// Base64-encoded Ed25519 public key (identifies the device)
    pub public_key: String,
    /// ISO-8601 timestamp of when the token was created
    pub timestamp: String,
}

/// A signed authentication token: payload + Ed25519 signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedAuthToken {
    pub payload: SignedPayload,
    /// Base64-encoded Ed25519 signature over the JSON-serialized payload
    pub signature: String,
}

/// Create a signed authentication token using an Ed25519 secret key.
///
/// The token contains the public key and current timestamp, signed by the secret key.
/// Gateway verifies: valid signature + timestamp < 5 min old + public_key in device_keys table.
pub fn create_signed_token(secret_key: &[u8; 64]) -> Result<SignedAuthToken> {
    // Reconstruct signing key from the 64-byte keypair bytes
    let seed: [u8; 32] = secret_key[..32]
        .try_into()
        .map_err(|_| E2EEError::InvalidSignatureLength {
            expected: 32,
            actual: 0,
        })?;
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();

    let payload = SignedPayload {
        public_key: BASE64.encode(verifying_key.to_bytes()),
        timestamp: Utc::now().to_rfc3339(),
    };

    // Sign the JSON-serialized payload
    let payload_json = serde_json::to_string(&payload)?;
    let signature = signing_key.sign(payload_json.as_bytes());

    Ok(SignedAuthToken {
        payload,
        signature: BASE64.encode(signature.to_bytes()),
    })
}

/// Verify a signed authentication token.
///
/// Checks:
/// 1. Base64 decoding of public key and signature
/// 2. Ed25519 signature validity
/// 3. Timestamp not older than TOKEN_MAX_AGE_SECS
///
/// Returns the public key bytes on success (for looking up in device_keys table).
pub fn verify_signed_token(token: &SignedAuthToken) -> Result<[u8; 32]> {
    // Decode public key
    let pub_key_bytes = BASE64.decode(&token.payload.public_key)?;
    if pub_key_bytes.len() != 32 {
        return Err(E2EEError::InvalidPublicKeyLength {
            expected: 32,
            actual: pub_key_bytes.len(),
        });
    }
    let mut pk_array = [0u8; 32];
    pk_array.copy_from_slice(&pub_key_bytes);

    let verifying_key = VerifyingKey::from_bytes(&pk_array)
        .map_err(|_| E2EEError::SignatureVerificationFailed)?;

    // Decode signature
    let sig_bytes = BASE64.decode(&token.signature)?;
    if sig_bytes.len() != 64 {
        return Err(E2EEError::InvalidSignatureLength {
            expected: 64,
            actual: sig_bytes.len(),
        });
    }
    let mut sig_array = [0u8; 64];
    sig_array.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_array);

    // Verify signature over the JSON-serialized payload
    let payload_json = serde_json::to_string(&token.payload)?;
    verifying_key
        .verify(payload_json.as_bytes(), &signature)
        .map_err(|_| E2EEError::SignatureVerificationFailed)?;

    // Check timestamp freshness
    let timestamp = chrono::DateTime::parse_from_rfc3339(&token.payload.timestamp)
        .map_err(|e| E2EEError::InvalidTimestamp(e.to_string()))?;
    let age = Utc::now().signed_duration_since(timestamp);
    if age.num_seconds() > TOKEN_MAX_AGE_SECS as i64 {
        return Err(E2EEError::TokenExpired(TOKEN_MAX_AGE_SECS));
    }
    // Also reject tokens from the future (more than 30 seconds)
    if age.num_seconds() < -30 {
        return Err(E2EEError::InvalidTimestamp(
            "token timestamp is in the future".to_string(),
        ));
    }

    Ok(pk_array)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::{derive_auth_keypair, generate_master_secret};

    #[test]
    fn test_create_and_verify_token() {
        let master = generate_master_secret();
        let auth_kp = derive_auth_keypair(&master).unwrap();

        let token = create_signed_token(&auth_kp.secret_key).unwrap();

        // Verify returns the public key
        let pub_key = verify_signed_token(&token).unwrap();
        assert_eq!(pub_key, auth_kp.public_key);
    }

    #[test]
    fn test_token_serialization() {
        let master = generate_master_secret();
        let auth_kp = derive_auth_keypair(&master).unwrap();

        let token = create_signed_token(&auth_kp.secret_key).unwrap();
        let json = serde_json::to_string(&token).unwrap();
        let parsed: SignedAuthToken = serde_json::from_str(&json).unwrap();

        let pub_key = verify_signed_token(&parsed).unwrap();
        assert_eq!(pub_key, auth_kp.public_key);
    }

    #[test]
    fn test_tampered_payload_fails() {
        let master = generate_master_secret();
        let auth_kp = derive_auth_keypair(&master).unwrap();

        let mut token = create_signed_token(&auth_kp.secret_key).unwrap();
        // Tamper with the timestamp
        token.payload.timestamp = "2020-01-01T00:00:00Z".to_string();

        let result = verify_signed_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_key_fails() {
        let master1 = generate_master_secret();
        let master2 = generate_master_secret();
        let auth_kp1 = derive_auth_keypair(&master1).unwrap();
        let auth_kp2 = derive_auth_keypair(&master2).unwrap();

        let mut token = create_signed_token(&auth_kp1.secret_key).unwrap();
        // Replace public key with a different one (signature won't match)
        token.payload.public_key = BASE64.encode(auth_kp2.public_key);

        let result = verify_signed_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_signature_bytes_fails() {
        let master = generate_master_secret();
        let auth_kp = derive_auth_keypair(&master).unwrap();

        let mut token = create_signed_token(&auth_kp.secret_key).unwrap();
        token.signature = BASE64.encode([0u8; 64]); // Invalid signature

        let result = verify_signed_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_deterministic_public_key_in_token() {
        let master = [99u8; 32];
        let auth_kp = derive_auth_keypair(&master).unwrap();

        let token = create_signed_token(&auth_kp.secret_key).unwrap();

        let decoded_pk = BASE64.decode(&token.payload.public_key).unwrap();
        assert_eq!(decoded_pk.as_slice(), &auth_kp.public_key);
    }
}
