use std::net::SocketAddr;

/// Gateway server configuration
#[derive(Debug, Clone)]
pub struct GatewayConfig {
    /// Address to bind the HTTP server
    pub listen_addr: SocketAddr,
    /// SQLite database URL
    pub database_url: String,
    /// Allowed CORS origins (comma-separated)
    pub allowed_origins: Option<String>,
    /// Session TTL in hours
    pub session_ttl_hours: i64,
}

impl GatewayConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Self {
        let host = std::env::var("GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port: u16 = std::env::var("GATEWAY_PORT")
            .unwrap_or_else(|_| "9090".to_string())
            .parse()
            .expect("GATEWAY_PORT must be a valid port number");

        let database_url = std::env::var("GATEWAY_DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:gateway.db?mode=rwc".to_string());

        let allowed_origins = std::env::var("GATEWAY_ALLOWED_ORIGINS").ok();

        let session_ttl_hours: i64 = std::env::var("GATEWAY_SESSION_TTL_HOURS")
            .unwrap_or_else(|_| "168".to_string()) // 7 days
            .parse()
            .expect("GATEWAY_SESSION_TTL_HOURS must be a valid number");

        Self {
            listen_addr: SocketAddr::new(host.parse().expect("Invalid GATEWAY_HOST"), port),
            database_url,
            allowed_origins,
            session_ttl_hours,
        }
    }
}
