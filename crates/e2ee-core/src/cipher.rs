use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305,
};
use rand::rngs::OsRng;

use crate::error::{E2EEError, Result};

/// Encrypt a payload using XChaCha20-Poly1305 with a random 24-byte nonce.
/// Returns: nonce (24 bytes) || ciphertext
pub fn encrypt_payload(plaintext: &[u8], dek: &[u8; 32]) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(dek.into());

    let mut nonce_bytes = [0u8; 24];
    rand::RngCore::fill_bytes(&mut OsRng, &mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce_bytes.into(), plaintext)
        .map_err(|e| E2EEError::EncryptionFailed(e.to_string()))?;

    let mut result = Vec::with_capacity(24 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Decrypt a payload encrypted with XChaCha20-Poly1305.
/// Input format: nonce (24 bytes) || ciphertext
pub fn decrypt_payload(data: &[u8], dek: &[u8; 32]) -> Result<Vec<u8>> {
    if data.len() < 24 {
        return Err(E2EEError::InvalidNonceLength(data.len()));
    }

    let nonce_bytes: [u8; 24] = data[..24]
        .try_into()
        .map_err(|_| E2EEError::InvalidNonceLength(data.len()))?;
    let ciphertext = &data[24..];
    let cipher = XChaCha20Poly1305::new(dek.into());

    cipher
        .decrypt(&nonce_bytes.into(), ciphertext)
        .map_err(|e| E2EEError::DecryptionFailed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_dek;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let dek = generate_dek();
        let plaintext = b"Hello, E2EE world!";

        let encrypted = encrypt_payload(plaintext, &dek).unwrap();
        assert!(encrypted.len() > 24 + plaintext.len()); // nonce + ciphertext + tag

        let decrypted = decrypt_payload(&encrypted, &dek).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_nonces() {
        let dek = generate_dek();
        let plaintext = b"Same message twice";

        let enc1 = encrypt_payload(plaintext, &dek).unwrap();
        let enc2 = encrypt_payload(plaintext, &dek).unwrap();

        // Different nonces → different ciphertexts
        assert_ne!(enc1, enc2);

        // Both decrypt to same plaintext
        assert_eq!(decrypt_payload(&enc1, &dek).unwrap(), plaintext);
        assert_eq!(decrypt_payload(&enc2, &dek).unwrap(), plaintext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let dek1 = generate_dek();
        let dek2 = generate_dek();
        let plaintext = b"Secret data";

        let encrypted = encrypt_payload(plaintext, &dek1).unwrap();
        let result = decrypt_payload(&encrypted, &dek2);
        assert!(result.is_err());
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        let dek = generate_dek();
        let plaintext = b"Integrity protected";

        let mut encrypted = encrypt_payload(plaintext, &dek).unwrap();
        // Tamper with ciphertext (after nonce)
        if encrypted.len() > 25 {
            encrypted[25] ^= 0xff;
        }

        let result = decrypt_payload(&encrypted, &dek);
        assert!(result.is_err());
    }

    #[test]
    fn test_too_short_data_fails() {
        let dek = generate_dek();
        let result = decrypt_payload(&[0u8; 10], &dek);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_plaintext() {
        let dek = generate_dek();
        let encrypted = encrypt_payload(b"", &dek).unwrap();
        let decrypted = decrypt_payload(&encrypted, &dek).unwrap();
        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_large_payload() {
        let dek = generate_dek();
        let plaintext = vec![0xABu8; 1_000_000]; // 1MB

        let encrypted = encrypt_payload(&plaintext, &dek).unwrap();
        let decrypted = decrypt_payload(&encrypted, &dek).unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
