use axum::response::Json;
use utils::{response::ApiResponse, version::APP_VERSION_WITH_SHA};

pub async fn health_check() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(APP_VERSION_WITH_SHA.to_string()))
}
