use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// GET /api/health
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH")).to_string(),
    })
}
