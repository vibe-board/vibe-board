use std::sync::Arc;

use axum::{
    Router,
    extract::Extension,
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, put},
};
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{
    DeploymentImpl,
    e2ee_config::{self, Credentials},
    e2ee_manager::BridgeManager,
};

#[derive(Deserialize)]
pub struct PutCredentialsRequest {
    pub master_secret: String,
    pub gateway_url: String,
    pub session_token: String,
    pub user_id: String,
}

#[derive(Serialize)]
pub struct E2EEStatusResponse {
    pub configured: bool,
    pub bridge_running: bool,
    pub gateway_url: Option<String>,
    pub user_id: Option<String>,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/e2ee/credentials", put(put_credentials))
        .route("/e2ee/credentials", delete(delete_credentials))
        .route("/e2ee/status", get(get_status))
}

async fn put_credentials(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
    axum::extract::Json(req): axum::extract::Json<PutCredentialsRequest>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    let creds = Credentials {
        master_secret: req.master_secret,
        gateway_url: req.gateway_url,
        session_token: req.session_token,
        user_id: req.user_id,
    };

    e2ee_config::save_credentials(&creds).map_err(|e| {
        let msg = format!("Failed to save credentials: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    bridge_manager.start(&creds).await;

    Ok(ResponseJson(ApiResponse::success(
        "Credentials saved and bridge started".to_string(),
    )))
}

async fn delete_credentials(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> Result<ResponseJson<ApiResponse<String>>, (StatusCode, ResponseJson<ApiResponse<String>>)> {
    bridge_manager.stop().await;

    e2ee_config::delete_credentials().map_err(|e| {
        let msg = format!("Failed to delete credentials: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            ResponseJson(ApiResponse::error(&msg)),
        )
    })?;

    Ok(ResponseJson(ApiResponse::success(
        "Credentials deleted and bridge stopped".to_string(),
    )))
}

async fn get_status(
    Extension(bridge_manager): Extension<Arc<BridgeManager>>,
) -> ResponseJson<ApiResponse<E2EEStatusResponse>> {
    let (configured, gateway_url, user_id) = match e2ee_config::load_credentials() {
        Ok(creds) => (true, Some(creds.gateway_url), Some(creds.user_id)),
        Err(_) => (false, None, None),
    };

    let bridge_running = bridge_manager.is_running().await;

    ResponseJson(ApiResponse::success(E2EEStatusResponse {
        configured,
        bridge_running,
        gateway_url,
        user_id,
    }))
}
