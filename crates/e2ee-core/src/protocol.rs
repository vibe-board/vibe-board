use serde::{Deserialize, Serialize};

/// Bridge request: sent from WebUI → daemon (through gateway).
/// These are encrypted inside an EncryptedPayload before transmission.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeRequest {
    /// Proxy an HTTP request to the local server
    #[serde(rename = "http_request")]
    HttpRequest {
        id: u32,
        method: String,
        path: String,
        headers: Vec<(String, String)>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        body: Option<String>, // base64-encoded body
    },

    /// Subscribe to an SSE stream from the local server
    #[serde(rename = "sse_subscribe")]
    SseSubscribe { id: u32, path: String },

    /// Unsubscribe from an SSE stream
    #[serde(rename = "sse_unsubscribe")]
    SseUnsubscribe { id: u32 },

    /// Open a WebSocket sub-connection to the local server
    #[serde(rename = "ws_open")]
    WsOpen {
        id: u32,
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        query: Option<String>,
    },

    /// Send data over a WebSocket sub-connection
    #[serde(rename = "ws_data")]
    WsData {
        id: u32,
        data: String, // base64-encoded
    },

    /// Close a WebSocket sub-connection
    #[serde(rename = "ws_close")]
    WsClose { id: u32 },

    /// Ping (keepalive)
    #[serde(rename = "ping")]
    Ping { id: u32 },
}

/// Bridge response: sent from daemon → WebUI (through gateway).
/// These are encrypted inside an EncryptedPayload before transmission.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeResponse {
    /// HTTP response from the local server
    #[serde(rename = "http_response")]
    HttpResponse {
        id: u32,
        status: u16,
        headers: Vec<(String, String)>,
        body: String, // base64-encoded body
    },

    /// SSE event from the local server
    #[serde(rename = "sse_event")]
    SseEvent {
        id: u32,
        event: String,
        data: String,
    },

    /// SSE stream ended
    #[serde(rename = "sse_end")]
    SseEnd { id: u32 },

    /// WebSocket sub-connection opened
    #[serde(rename = "ws_opened")]
    WsOpened { id: u32 },

    /// Data from WebSocket sub-connection
    #[serde(rename = "ws_data")]
    WsData {
        id: u32,
        data: String, // base64-encoded
    },

    /// WebSocket sub-connection closed
    #[serde(rename = "ws_closed")]
    WsClosed { id: u32 },

    /// Pong (keepalive response)
    #[serde(rename = "pong")]
    Pong { id: u32 },

    /// Error response
    #[serde(rename = "error")]
    Error { id: u32, message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bridge_request_serialization() {
        let req = BridgeRequest::HttpRequest {
            id: 1,
            method: "GET".to_string(),
            path: "/api/projects".to_string(),
            headers: vec![("accept".to_string(), "application/json".to_string())],
            body: None,
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"type\":\"http_request\""));
        assert!(json.contains("\"method\":\"GET\""));

        let parsed: BridgeRequest = serde_json::from_str(&json).unwrap();
        if let BridgeRequest::HttpRequest { id, method, path, .. } = parsed {
            assert_eq!(id, 1);
            assert_eq!(method, "GET");
            assert_eq!(path, "/api/projects");
        } else {
            panic!("Wrong variant");
        }
    }

    #[test]
    fn test_bridge_response_serialization() {
        let resp = BridgeResponse::HttpResponse {
            id: 1,
            status: 200,
            headers: vec![("content-type".to_string(), "application/json".to_string())],
            body: "eyJvayI6dHJ1ZX0=".to_string(), // base64 of {"ok":true}
        };

        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"type\":\"http_response\""));
        assert!(json.contains("\"status\":200"));

        let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
        if let BridgeResponse::HttpResponse { id, status, .. } = parsed {
            assert_eq!(id, 1);
            assert_eq!(status, 200);
        } else {
            panic!("Wrong variant");
        }
    }

    #[test]
    fn test_sse_variants() {
        let sub = BridgeRequest::SseSubscribe {
            id: 2,
            path: "/api/events".to_string(),
        };
        let json = serde_json::to_string(&sub).unwrap();
        let parsed: BridgeRequest = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, BridgeRequest::SseSubscribe { id: 2, .. }));

        let event = BridgeResponse::SseEvent {
            id: 2,
            event: "update".to_string(),
            data: "{\"changed\":true}".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, BridgeResponse::SseEvent { id: 2, .. }));
    }

    #[test]
    fn test_ws_variants() {
        let open = BridgeRequest::WsOpen {
            id: 3,
            path: "/ws/terminal".to_string(),
            query: Some("cols=80&rows=24".to_string()),
        };
        let json = serde_json::to_string(&open).unwrap();
        assert!(json.contains("\"type\":\"ws_open\""));

        let data = BridgeResponse::WsData {
            id: 3,
            data: "SGVsbG8=".to_string(),
        };
        let json = serde_json::to_string(&data).unwrap();
        let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, BridgeResponse::WsData { id: 3, .. }));
    }

    #[test]
    fn test_ping_pong() {
        let ping = BridgeRequest::Ping { id: 99 };
        let json = serde_json::to_string(&ping).unwrap();
        let parsed: BridgeRequest = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, BridgeRequest::Ping { id: 99 }));

        let pong = BridgeResponse::Pong { id: 99 };
        let json = serde_json::to_string(&pong).unwrap();
        let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, BridgeResponse::Pong { id: 99 }));
    }

    #[test]
    fn test_error_response() {
        let err = BridgeResponse::Error {
            id: 5,
            message: "Connection refused".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        let parsed: BridgeResponse = serde_json::from_str(&json).unwrap();
        if let BridgeResponse::Error { id, message } = parsed {
            assert_eq!(id, 5);
            assert_eq!(message, "Connection refused");
        } else {
            panic!("Wrong variant");
        }
    }
}
