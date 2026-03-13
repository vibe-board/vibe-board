use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

use crate::cipher;
use crate::error::{E2EEError, Result};

/// Encrypted payload envelope format.
/// JSON: { "t": "encrypted", "c": "<base64(nonce || ciphertext)>" }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedPayload {
    /// Type marker — always "encrypted"
    pub t: String,
    /// Base64-encoded nonce (24 bytes) || ciphertext
    pub c: String,
}

/// Check if a JSON value is an encrypted payload (has `t: "encrypted"`)
pub fn is_encrypted_payload(value: &serde_json::Value) -> bool {
    value
        .get("t")
        .and_then(|v| v.as_str())
        .is_some_and(|t| t == "encrypted")
}

/// Encrypt arbitrary bytes into an EncryptedPayload envelope
pub fn encrypt_to_envelope(plaintext: &[u8], dek: &[u8; 32]) -> Result<EncryptedPayload> {
    let encrypted_bytes = cipher::encrypt_payload(plaintext, dek)?;
    Ok(EncryptedPayload {
        t: "encrypted".to_string(),
        c: BASE64.encode(encrypted_bytes),
    })
}

/// Decrypt an EncryptedPayload envelope back to bytes
pub fn decrypt_from_envelope(payload: &EncryptedPayload, dek: &[u8; 32]) -> Result<Vec<u8>> {
    if payload.t != "encrypted" {
        return Err(E2EEError::InvalidEncryptedPayload);
    }
    let encrypted_bytes = BASE64.decode(&payload.c)?;
    cipher::decrypt_payload(&encrypted_bytes, dek)
}

/// Encrypt a JSON-serializable value into an EncryptedPayload
pub fn encrypt_json<T: Serialize>(value: &T, dek: &[u8; 32]) -> Result<EncryptedPayload> {
    let json_bytes = serde_json::to_vec(value)?;
    encrypt_to_envelope(&json_bytes, dek)
}

/// Decrypt an EncryptedPayload back to a JSON-deserializable value
pub fn decrypt_json<T: for<'de> Deserialize<'de>>(
    payload: &EncryptedPayload,
    dek: &[u8; 32],
) -> Result<T> {
    let plaintext = decrypt_from_envelope(payload, dek)?;
    Ok(serde_json::from_slice(&plaintext)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_dek;

    #[test]
    fn test_envelope_roundtrip() {
        let dek = generate_dek();
        let plaintext = b"Hello, encrypted world!";

        let envelope = encrypt_to_envelope(plaintext, &dek).unwrap();
        assert_eq!(envelope.t, "encrypted");
        assert!(!envelope.c.is_empty());

        let decrypted = decrypt_from_envelope(&envelope, &dek).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_json_roundtrip() {
        let dek = generate_dek();

        #[derive(Debug, Serialize, Deserialize, PartialEq)]
        struct TestData {
            name: String,
            value: u32,
        }

        let data = TestData {
            name: "test".to_string(),
            value: 42,
        };

        let envelope = encrypt_json(&data, &dek).unwrap();
        let decrypted: TestData = decrypt_json(&envelope, &dek).unwrap();
        assert_eq!(decrypted, data);
    }

    #[test]
    fn test_is_encrypted_payload() {
        let encrypted = serde_json::json!({ "t": "encrypted", "c": "abc123" });
        assert!(is_encrypted_payload(&encrypted));

        let not_encrypted = serde_json::json!({ "t": "plaintext", "data": "hello" });
        assert!(!is_encrypted_payload(&not_encrypted));

        let no_type = serde_json::json!({ "data": "hello" });
        assert!(!is_encrypted_payload(&no_type));
    }

    #[test]
    fn test_serialize_deserialize_envelope() {
        let dek = generate_dek();
        let envelope = encrypt_to_envelope(b"test", &dek).unwrap();

        let json_str = serde_json::to_string(&envelope).unwrap();
        let parsed: EncryptedPayload = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed.t, "encrypted");
        let decrypted = decrypt_from_envelope(&parsed, &dek).unwrap();
        assert_eq!(decrypted, b"test");
    }

    #[test]
    fn test_wrong_type_marker_fails() {
        let payload = EncryptedPayload {
            t: "plaintext".to_string(),
            c: "abc".to_string(),
        };
        let dek = generate_dek();
        let result = decrypt_from_envelope(&payload, &dek);
        assert!(result.is_err());
    }
}
