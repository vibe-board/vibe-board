use blake2::{Blake2b512, Digest};
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret as X25519StaticSecret};

use crate::error::Result;

/// Ed25519 keypair for authentication (signing tokens)
#[derive(Clone)]
pub struct AuthKeyPair {
    pub public_key: [u8; 32],
    pub secret_key: [u8; 64], // Ed25519 secret key is 64 bytes (32 seed + 32 public)
}

/// X25519 keypair for content encryption (DEK wrapping)
#[derive(Clone)]
pub struct ContentKeyPair {
    pub public_key: [u8; 32],
    pub secret_key: [u8; 32],
}

/// Generate a new 32-byte master secret
pub fn generate_master_secret() -> [u8; 32] {
    let mut secret = [0u8; 32];
    rand::RngCore::fill_bytes(&mut OsRng, &mut secret);
    secret
}

/// Derive Ed25519 auth keypair from master secret using BLAKE2b KDF
/// Context: "vkauth__" (8 bytes, padded with underscores)
/// Subkey ID: 1
pub fn derive_auth_keypair(master_secret: &[u8; 32]) -> Result<AuthKeyPair> {
    // BLAKE2b-512 KDF: hash(master_secret || subkey_id || context)
    let mut hasher = Blake2b512::new();
    hasher.update(master_secret);
    hasher.update(&[1u8]); // subkey_id = 1
    hasher.update(b"vkauth__"); // 8-byte context
    let seed_bytes = hasher.finalize();

    // Take first 32 bytes as Ed25519 seed
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&seed_bytes[..32]);

    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();

    Ok(AuthKeyPair {
        public_key: verifying_key.to_bytes(),
        secret_key: signing_key.to_keypair_bytes(),
    })
}

/// Derive X25519 content keypair from master secret using BLAKE2b KDF
/// Context: "vkcont__" (8 bytes, padded with underscores)
/// Subkey ID: 2
pub fn derive_content_keypair(master_secret: &[u8; 32]) -> Result<ContentKeyPair> {
    // BLAKE2b-512 KDF: hash(master_secret || subkey_id || context)
    let mut hasher = Blake2b512::new();
    hasher.update(master_secret);
    hasher.update(&[2u8]); // subkey_id = 2
    hasher.update(b"vkcont__"); // 8-byte context
    let key_bytes = hasher.finalize();

    // Take first 32 bytes as X25519 secret key
    let mut secret = [0u8; 32];
    secret.copy_from_slice(&key_bytes[..32]);

    let secret_key = X25519StaticSecret::from(secret);
    let public_key = X25519PublicKey::from(&secret_key);

    Ok(ContentKeyPair {
        public_key: public_key.to_bytes(),
        secret_key: secret_key.to_bytes(),
    })
}

/// Generate a random 32-byte DEK (Data Encryption Key)
pub fn generate_dek() -> [u8; 32] {
    let mut dek = [0u8; 32];
    rand::RngCore::fill_bytes(&mut OsRng, &mut dek);
    dek
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_master_secret() {
        let secret1 = generate_master_secret();
        let secret2 = generate_master_secret();
        assert_eq!(secret1.len(), 32);
        assert_eq!(secret2.len(), 32);
        assert_ne!(secret1, secret2); // Should be random
    }

    #[test]
    fn test_derive_auth_keypair() {
        let master = [42u8; 32];
        let keypair1 = derive_auth_keypair(&master).unwrap();
        let keypair2 = derive_auth_keypair(&master).unwrap();

        // Deterministic derivation
        assert_eq!(keypair1.public_key, keypair2.public_key);
        assert_eq!(keypair1.secret_key, keypair2.secret_key);

        // Different master → different keys
        let master2 = [43u8; 32];
        let keypair3 = derive_auth_keypair(&master2).unwrap();
        assert_ne!(keypair1.public_key, keypair3.public_key);
    }

    #[test]
    fn test_derive_content_keypair() {
        let master = [42u8; 32];
        let keypair1 = derive_content_keypair(&master).unwrap();
        let keypair2 = derive_content_keypair(&master).unwrap();

        // Deterministic derivation
        assert_eq!(keypair1.public_key, keypair2.public_key);
        assert_eq!(keypair1.secret_key, keypair2.secret_key);

        // Different master → different keys
        let master2 = [43u8; 32];
        let keypair3 = derive_content_keypair(&master2).unwrap();
        assert_ne!(keypair1.public_key, keypair3.public_key);
    }

    #[test]
    fn test_auth_and_content_keys_different() {
        let master = [42u8; 32];
        let auth = derive_auth_keypair(&master).unwrap();
        let content = derive_content_keypair(&master).unwrap();

        // Auth and content public keys should be different
        assert_ne!(auth.public_key, content.public_key);
    }

    #[test]
    fn test_generate_dek() {
        let dek1 = generate_dek();
        let dek2 = generate_dek();
        assert_eq!(dek1.len(), 32);
        assert_eq!(dek2.len(), 32);
        assert_ne!(dek1, dek2); // Should be random
    }
}
