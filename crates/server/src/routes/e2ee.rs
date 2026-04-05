use std::sync::Arc;

use axum::{
    Router,
    extract::{Extension, Query},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, put},
};
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{
    DeploymentImpl,
    e2ee_config::{self, GatewayCredential},
    e2ee_manager::BridgeManager,
};

#[derive(Deserialize)]
pub struct PutGatewayRequest {
    pub master_secret: String,
    pub gateway_url: String,
    pub session_token: String,
    pub user_id: String,
}

#[derive(Deserialize)]
pub struct DeleteGatewayQuery {
    pub url: Option<String>,
}

#[derive(Serialize)]
pub struct GatewayStatusEntry {
    pub gateway_url: String,
    pub user_id: String,
    pub bridge_running: bool,
}

#[derive(Serialize)]
pub struct E2EEStatusResponse {
    pub gateways: Vec<GatewayStatusEntry>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // New multi-gateway routes
        .route("/e2ee/gateways", put(put_gateway))
        .route("/e2ee/gateways", delete(delete_gateway))
        // Backward-compatible aliases
        .route("/e2ee/credentials", put(put_gateway))
        .route("/e2ee/credentials", delete(delete_all_credentials))
        // Status
        .route("/e2ee/status", get(get_status))
}

/// Add or update a single gateway credential.
async fn put_gateway(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
    axum::extract::Json(req): axum::extract::Json<PutGatewayRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    let cred = GatewayCredential {
        master_secret: req.master_secret,
        gateway_url: req.gateway_url,
        session_token: req.session_token,
        user_id: req.user_id,
    };

    e2ee_config::add_or_update_gateway(&cred).map_err(|e| {
        let msg = format!("Failed to save gateway credential: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    bridge_manager.start_gateway(&cred).await;

    Ok(ResponseJson(ApiResponse::success(
        "Gateway credential saved and bridge started".to_string(),
    )))
}

/// Delete a specific gateway by URL query param.
async fn delete_gateway(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
    Query(query): Query<DeleteGatewayQuery>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    let url = query.url.ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            ResponseJson(ApiResponse::error("Missing 'url' query parameter")),
        )
    })?;

    bridge_manager.stop_gateway(&url).await;

    e2ee_config::remove_gateway(&url).map_err(|e| {
        let msg = format!("Failed to remove gateway: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    Ok(ResponseJson(ApiResponse::success(format!(
        "Gateway removed: {url}"
    ))))
}

/// Backward-compat: DELETE /e2ee/credentials removes all gateways.
async fn delete_all_credentials(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    bridge_manager.stop_all().await;

    e2ee_config::delete_credentials().map_err(|e| {
        let msg = format!("Failed to delete credentials: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    Ok(ResponseJson(ApiResponse::success(
        "All credentials deleted and bridges stopped".to_string(),
    )))
}

/// Return status for all gateways.
async fn get_status(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> ResponseJson<ApiResponse<E2EEStatusResponse>> {
    let file = e2ee_config::load_credentials().unwrap_or(e2ee_config::CredentialsFile {
        gateways: Vec::new(),
    });

    let mut gateways = Vec::new();
    for cred in &file.gateways {
        let running = bridge_manager.is_gateway_running(&cred.gateway_url).await;
        gateways.push(GatewayStatusEntry {
            gateway_url: cred.gateway_url.clone(),
            user_id: cred.user_id.clone(),
            bridge_running: running,
        });
    }

    ResponseJson(ApiResponse::success(E2EEStatusResponse { gateways }))
}
