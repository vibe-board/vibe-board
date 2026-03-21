use api_types::StatusResponse;
use axum::{
    Router,
    extract::State,
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, post},
};
use deployment::Deployment;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/logout", post(logout))
        .route("/auth/status", get(status))
}

async fn logout(State(deployment): State<DeploymentImpl>) -> Result<StatusCode, ApiError> {
    let auth_context = deployment.auth_context();

    auth_context.clear_credentials().await.map_err(|e| {
        tracing::error!(?e, "failed to clear credentials");
        ApiError::Io(e)
    })?;

    auth_context.clear_profile().await;

    Ok(StatusCode::NO_CONTENT)
}

async fn status(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<StatusResponse>>, ApiError> {
    use api_types::LoginStatus;

    match deployment.get_login_status().await {
        LoginStatus::LoggedOut => Ok(ResponseJson(ApiResponse::success(StatusResponse {
            logged_in: false,
            profile: None,
            degraded: None,
        }))),
        LoginStatus::LoggedIn { profile } => {
            Ok(ResponseJson(ApiResponse::success(StatusResponse {
                logged_in: true,
                profile: Some(profile),
                degraded: None,
            })))
        }
    }
}
