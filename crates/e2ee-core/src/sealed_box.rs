use blake2::{Blake2b512, Digest};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305,
};
use rand::rngs::OsRng;
use x25519_dalek::{EphemeralSecret, PublicKey as X25519PublicKey, StaticSecret};

use crate::error::{E2EEError, Result};

/// Wrap (encrypt) a DEK using the recipient's X25519 public key.
///
/// Implements a sealed-box-like construction:
/// 1. Generate ephemeral X25519 keypair
/// 2. Perform ECDH: shared_secret = ephemeral_secret * recipient_public
/// 3. Derive symmetric key from shared_secret using BLAKE2b
/// 4. Encrypt DEK with XChaCha20-Poly1305
/// 5. Return: ephemeral_public (32) || nonce (24) || ciphertext
pub fn wrap_dek(dek: &[u8; 32], recipient_public: &[u8; 32]) -> Result<Vec<u8>> {
    let recipient_pk = X25519PublicKey::from(*recipient_public);

    // Generate ephemeral keypair for this wrapping operation
    let ephemeral_secret = EphemeralSecret::random_from_rng(OsRng);
    let ephemeral_public = X25519PublicKey::from(&ephemeral_secret);

    // ECDH shared secret
    let shared_secret = ephemeral_secret.diffie_hellman(&recipient_pk);

    // Derive symmetric key from shared secret using BLAKE2b
    let mut hasher = Blake2b512::new();
    hasher.update(shared_secret.as_bytes());
    hasher.update(ephemeral_public.as_bytes());
    hasher.update(recipient_public);
    let derived = hasher.finalize();

    let mut sym_key = [0u8; 32];
    sym_key.copy_from_slice(&derived[..32]);

    // Random nonce for XChaCha20-Poly1305
    let mut nonce_bytes = [0u8; 24];
    rand::RngCore::fill_bytes(&mut OsRng, &mut nonce_bytes);
    let cipher = XChaCha20Poly1305::new(&sym_key.into());
    let ciphertext = cipher
        .encrypt(&nonce_bytes.into(), dek.as_ref())
        .map_err(|e| E2EEError::EncryptionFailed(e.to_string()))?;

    // Pack: ephemeral_public (32) || nonce (24) || ciphertext (32 + 16 tag)
    let mut result = Vec::with_capacity(32 + 24 + ciphertext.len());
    result.extend_from_slice(ephemeral_public.as_bytes());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Unwrap (decrypt) a DEK using the recipient's X25519 secret key.
///
/// Input format: ephemeral_public (32) || nonce (24) || ciphertext
pub fn unwrap_dek(wrapped: &[u8], recipient_secret: &[u8; 32], recipient_public: &[u8; 32]) -> Result<[u8; 32]> {
    // Minimum size: 32 (ephemeral pub) + 24 (nonce) + 32 (dek) + 16 (tag)
    if wrapped.len() < 32 + 24 + 48 {
        return Err(E2EEError::SealedBoxOpenFailed);
    }

    let ephemeral_public_bytes: [u8; 32] = wrapped[..32]
        .try_into()
        .map_err(|_| E2EEError::SealedBoxOpenFailed)?;
    let ephemeral_pk = X25519PublicKey::from(ephemeral_public_bytes);

    let nonce_bytes: [u8; 24] = wrapped[32..56]
        .try_into()
        .map_err(|_| E2EEError::SealedBoxOpenFailed)?;

    let ciphertext = &wrapped[56..];

    // Reconstruct shared secret
    let recipient_sk = StaticSecret::from(*recipient_secret);
    let shared_secret = recipient_sk.diffie_hellman(&ephemeral_pk);

    // Derive same symmetric key
    let mut hasher = Blake2b512::new();
    hasher.update(shared_secret.as_bytes());
    hasher.update(&ephemeral_public_bytes);
    hasher.update(recipient_public);
    let derived = hasher.finalize();

    let mut sym_key = [0u8; 32];
    sym_key.copy_from_slice(&derived[..32]);

    let cipher = XChaCha20Poly1305::new(&sym_key.into());
    let plaintext = cipher
        .decrypt(&nonce_bytes.into(), ciphertext)
        .map_err(|_| E2EEError::SealedBoxOpenFailed)?;

    if plaintext.len() != 32 {
        return Err(E2EEError::InvalidDekLength(plaintext.len()));
    }

    let mut dek = [0u8; 32];
    dek.copy_from_slice(&plaintext);
    Ok(dek)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::{derive_content_keypair, generate_dek, generate_master_secret};

    #[test]
    fn test_wrap_unwrap_roundtrip() {
        let master = generate_master_secret();
        let content_kp = derive_content_keypair(&master).unwrap();
        let dek = generate_dek();

        let wrapped = wrap_dek(&dek, &content_kp.public_key).unwrap();
        let unwrapped = unwrap_dek(&wrapped, &content_kp.secret_key, &content_kp.public_key).unwrap();

        assert_eq!(dek, unwrapped);
    }

    #[test]
    fn test_different_wrappings_different_ciphertext() {
        let master = generate_master_secret();
        let content_kp = derive_content_keypair(&master).unwrap();
        let dek = generate_dek();

        let wrapped1 = wrap_dek(&dek, &content_kp.public_key).unwrap();
        let wrapped2 = wrap_dek(&dek, &content_kp.public_key).unwrap();

        // Ephemeral keys differ each time
        assert_ne!(wrapped1, wrapped2);

        // Both unwrap to same DEK
        let dek1 = unwrap_dek(&wrapped1, &content_kp.secret_key, &content_kp.public_key).unwrap();
        let dek2 = unwrap_dek(&wrapped2, &content_kp.secret_key, &content_kp.public_key).unwrap();
        assert_eq!(dek1, dek);
        assert_eq!(dek2, dek);
    }

    #[test]
    fn test_wrong_secret_key_fails() {
        let master1 = generate_master_secret();
        let master2 = generate_master_secret();
        let kp1 = derive_content_keypair(&master1).unwrap();
        let kp2 = derive_content_keypair(&master2).unwrap();
        let dek = generate_dek();

        let wrapped = wrap_dek(&dek, &kp1.public_key).unwrap();
        let result = unwrap_dek(&wrapped, &kp2.secret_key, &kp2.public_key);
        assert!(result.is_err());
    }

    #[test]
    fn test_truncated_data_fails() {
        let master = generate_master_secret();
        let kp = derive_content_keypair(&master).unwrap();
        let dek = generate_dek();

        let wrapped = wrap_dek(&dek, &kp.public_key).unwrap();
        let result = unwrap_dek(&wrapped[..50], &kp.secret_key, &kp.public_key);
        assert!(result.is_err());
    }

    #[test]
    fn test_tampered_wrapped_fails() {
        let master = generate_master_secret();
        let kp = derive_content_keypair(&master).unwrap();
        let dek = generate_dek();

        let mut wrapped = wrap_dek(&dek, &kp.public_key).unwrap();
        // Tamper with ciphertext portion
        let last = wrapped.len() - 1;
        wrapped[last] ^= 0xff;

        let result = unwrap_dek(&wrapped, &kp.secret_key, &kp.public_key);
        assert!(result.is_err());
    }
}
