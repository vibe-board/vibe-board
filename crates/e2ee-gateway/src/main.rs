mod auth;
mod config;
mod db;
mod routes;
mod services;
mod socket;

use axum::{routing::get, routing::post, Router};
use sqlx::SqlitePool;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::EnvFilter;

use crate::config::GatewayConfig;
use crate::services::CliRegistry;
use crate::socket::WebUIRegistry;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub cli_registry: CliRegistry,
    pub webui_registry: WebUIRegistry,
    pub session_ttl_hours: i64,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,e2ee_gateway=debug")),
        )
        .init();

    let config = GatewayConfig::from_env();
    info!("Starting E2EE Gateway on {}", config.listen_addr);

    // Initialize database
    let db = db::init_db(&config.database_url)
        .await
        .expect("Failed to initialize database");

    let state = AppState {
        db: db.clone(),
        cli_registry: CliRegistry::new(),
        webui_registry: WebUIRegistry::new(),
        session_ttl_hours: config.session_ttl_hours,
    };

    // Spawn periodic session cleanup task (every hour)
    let cleanup_db = db;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            match db::cleanup_expired_sessions(&cleanup_db).await {
                Ok(count) if count > 0 => info!("Cleaned up {count} expired sessions"),
                Err(e) => tracing::warn!("Session cleanup error: {e}"),
                _ => {}
            }
        }
    });

    // Build CORS layer
    let cors = if let Some(ref origins) = config.allowed_origins {
        let origins: Vec<_> = origins
            .split(',')
            .filter_map(|o| o.trim().parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::permissive()
    };

    // Build router
    let app = Router::new()
        // Health
        .route("/api/health", get(routes::health::health))
        // Auth
        .route("/api/auth/signup", post(routes::auth_routes::signup))
        .route("/api/auth/login", post(routes::auth_routes::login))
        .route(
            "/api/auth/registration-status",
            get(routes::auth_routes::registration_status),
        )
        .route(
            "/api/auth/device/register",
            post(routes::auth_routes::register_device),
        )
        // Machines
        .route("/api/machines", get(routes::machine_routes::list_machines))
        // WebSocket endpoints
        .route("/ws/daemon", get(socket::cli_handler::daemon_ws_handler))
        .route("/ws/webui", get(socket::webui_handler::webui_ws_handler))
        .layer(cors)
        .with_state(state);

    // Start server
    let listener = tokio::net::TcpListener::bind(config.listen_addr)
        .await
        .expect("Failed to bind");

    info!("Gateway listening on {}", config.listen_addr);

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
