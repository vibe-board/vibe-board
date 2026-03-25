pub mod auth_routes;
pub mod frontend;
pub mod health;
pub mod machine_routes;

/// GET /api/gateway/info — mode detection endpoint for the frontend
pub async fn gateway_info() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "mode": "gateway",
        "version": concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH")),
    }))
}
