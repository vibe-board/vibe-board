pub mod auth;
pub mod cipher;
pub mod envelope;
pub mod error;
pub mod keys;
pub mod protocol;
pub mod sealed_box;

pub use auth::{create_signed_token, verify_signed_token, SignedAuthToken};
pub use cipher::{decrypt_payload, encrypt_payload};
pub use envelope::{
    decrypt_from_envelope, decrypt_json, encrypt_json, encrypt_to_envelope, is_encrypted_payload,
    EncryptedPayload,
};
pub use error::E2EEError;
pub use keys::{
    derive_auth_keypair, derive_content_keypair, generate_dek, generate_master_secret, AuthKeyPair,
    ContentKeyPair,
};
pub use protocol::{BridgeRequest, BridgeResponse};
pub use sealed_box::{unwrap_dek, wrap_dek};
