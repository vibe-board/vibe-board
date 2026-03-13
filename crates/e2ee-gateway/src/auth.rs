use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2, PasswordHash, PasswordVerifier,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use e2ee_core::verify_signed_token;
use sqlx::SqlitePool;

use crate::db;

/// Hash a password using Argon2id
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

/// Verify a password against an Argon2id hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

/// Verify a SignedAuthToken and return the user_id if the public key is registered.
///
/// Steps:
/// 1. Verify Ed25519 signature + timestamp freshness
/// 2. Look up public key in device_keys table
/// 3. Return the associated user_id
pub async fn verify_daemon_token(
    pool: &SqlitePool,
    token: &e2ee_core::SignedAuthToken,
) -> Result<String, String> {
    // Verify crypto (signature + timestamp)
    let pub_key_bytes = verify_signed_token(token).map_err(|e| format!("Token verification failed: {e}"))?;

    let pub_key_b64 = BASE64.encode(pub_key_bytes);

    // Look up device key in DB
    let device_key = db::get_user_by_device_pubkey(pool, &pub_key_b64)
        .await
        .map_err(|e| format!("DB error: {e}"))?
        .ok_or_else(|| "Unknown device public key".to_string())?;

    Ok(device_key.user_id)
}

/// Simple session token: base64-encoded random bytes
/// In production, consider JWT or server-side sessions with Redis/DB
pub fn generate_session_token() -> String {
    let mut bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    BASE64.encode(bytes)
}
