use thiserror::Error;

#[derive(Debug, Error)]
pub enum E2EEError {
    #[error("Invalid master secret length: expected 32 bytes, got {0}")]
    InvalidMasterSecretLength(usize),

    #[error("Invalid public key length: expected {expected} bytes, got {actual}")]
    InvalidPublicKeyLength { expected: usize, actual: usize },

    #[error("Invalid signature length: expected {expected} bytes, got {actual}")]
    InvalidSignatureLength { expected: usize, actual: usize },

    #[error("Signature verification failed")]
    SignatureVerificationFailed,

    #[error("Invalid timestamp: {0}")]
    InvalidTimestamp(String),

    #[error("Token expired: timestamp is older than {0} seconds")]
    TokenExpired(u64),

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Invalid base64 encoding: {0}")]
    InvalidBase64(#[from] base64::DecodeError),

    #[error("Invalid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),

    #[error("Invalid encrypted payload format")]
    InvalidEncryptedPayload,

    #[error("Sealed box open failed")]
    SealedBoxOpenFailed,

    #[error("Invalid nonce length: expected 24 bytes, got {0}")]
    InvalidNonceLength(usize),

    #[error("Invalid DEK length: expected 32 bytes, got {0}")]
    InvalidDekLength(usize),
}

pub type Result<T> = std::result::Result<T, E2EEError>;
