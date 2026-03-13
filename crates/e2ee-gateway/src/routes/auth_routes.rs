use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::{generate_session_token, hash_password, verify_password};
use crate::db;
use crate::AppState;

#[derive(Deserialize)]
pub struct SignupRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: String,
}

/// POST /api/auth/signup
/// First user becomes admin; subsequent signups are rejected.
pub async fn signup(
    State(state): State<AppState>,
    Json(req): Json<SignupRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let user_count = db::get_user_count(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if user_count > 0 {
        return Err((
            StatusCode::FORBIDDEN,
            "Registration is closed".to_string(),
        ));
    }

    // Check if email already exists (defensive)
    if db::get_user_by_email(&state.db, &req.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .is_some()
    {
        return Err((StatusCode::CONFLICT, "Email already registered".to_string()));
    }

    let user_id = Uuid::new_v4().to_string();
    let password_hash =
        hash_password(&req.password).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // First user is admin
    db::create_user(
        &state.db,
        &user_id,
        &req.email,
        &password_hash,
        req.name.as_deref(),
        "admin",
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let token = generate_session_token();
    db::create_session(&state.db, &token, &user_id, state.session_ttl_hours)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse {
        token,
        user_id,
    }))
}

/// GET /api/auth/registration-status
/// Returns whether signup is available (no users exist yet).
pub async fn registration_status(
    State(state): State<AppState>,
) -> Result<Json<RegistrationStatusResponse>, (StatusCode, String)> {
    let user_count = db::get_user_count(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(RegistrationStatusResponse {
        open: user_count == 0,
    }))
}

#[derive(Serialize)]
pub struct RegistrationStatusResponse {
    pub open: bool,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// POST /api/auth/login
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let user = db::get_user_by_email(&state.db, &req.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()))?;

    let valid = verify_password(&req.password, &user.password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !valid {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    let token = generate_session_token();
    db::create_session(&state.db, &token, &user.id, state.session_ttl_hours)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse {
        token,
        user_id: user.id,
    }))
}

#[derive(Deserialize)]
pub struct RegisterDeviceRequest {
    pub public_key: String,
    pub device_name: Option<String>,
}

#[derive(Serialize)]
pub struct RegisterDeviceResponse {
    pub device_id: String,
}

/// POST /api/auth/device/register
/// Requires Bearer token authentication
pub async fn register_device(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<RegisterDeviceRequest>,
) -> Result<Json<RegisterDeviceResponse>, (StatusCode, String)> {
    let user_id = extract_user_id(&state, &headers).await?;

    let device_id = Uuid::new_v4().to_string();

    db::register_device_key(
        &state.db,
        &device_id,
        &user_id,
        &req.public_key,
        req.device_name.as_deref(),
    )
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            (StatusCode::CONFLICT, "Device key already registered".to_string())
        } else {
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        }
    })?;

    Ok(Json(RegisterDeviceResponse { device_id }))
}

/// Extract user_id from Bearer token in Authorization header (DB-backed)
pub async fn extract_user_id(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> Result<String, (StatusCode, String)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Missing Authorization header".to_string()))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Invalid Authorization format".to_string()))?;

    db::get_session_user_id(&state.db, token)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, "Invalid or expired session".to_string()))
}
