use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Opaque cursor used by the session-flat conversation entries endpoint.
/// Clients treat this as an opaque string; the server encodes/decodes it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConversationCursor {
    pub process_created_at: DateTime<Utc>,
    pub entry_index: i64,
}

impl ConversationCursor {
    /// Encode as base64 URL-safe JSON string (no padding).
    pub fn encode(&self) -> String {
        let json = serde_json::to_vec(self).expect("cursor serialization cannot fail");
        URL_SAFE_NO_PAD.encode(json)
    }

    /// Decode from base64 URL-safe JSON. Returns None on any parse error.
    pub fn decode(s: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(s).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    #[test]
    fn encode_decode_roundtrip() {
        let cursor = ConversationCursor {
            process_created_at: Utc.with_ymd_and_hms(2026, 1, 15, 10, 30, 45).unwrap(),
            entry_index: 42,
        };
        let encoded = cursor.encode();
        let decoded = ConversationCursor::decode(&encoded).unwrap();
        assert_eq!(cursor, decoded);
    }

    #[test]
    fn encode_produces_url_safe_string() {
        let cursor = ConversationCursor {
            process_created_at: Utc.with_ymd_and_hms(2026, 1, 15, 10, 30, 45).unwrap(),
            entry_index: 0,
        };
        let encoded = cursor.encode();
        assert!(
            encoded
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
    }

    #[test]
    fn decode_invalid_returns_none() {
        assert_eq!(ConversationCursor::decode("not-base64-!!!"), None);
        assert_eq!(ConversationCursor::decode(""), None);
        assert_eq!(ConversationCursor::decode("YWJjZA"), None);
    }

    #[test]
    fn decode_negative_entry_index() {
        let cursor = ConversationCursor {
            process_created_at: Utc.with_ymd_and_hms(2026, 1, 15, 10, 30, 45).unwrap(),
            entry_index: -1,
        };
        let encoded = cursor.encode();
        let decoded = ConversationCursor::decode(&encoded).unwrap();
        assert_eq!(cursor, decoded);
    }
}
