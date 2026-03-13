use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;

use crate::routes::auth_routes::extract_user_id;
use crate::AppState;

#[derive(Serialize)]
pub struct MachineInfo {
    pub machine_id: String,
    pub hostname: String,
    pub platform: String,
    pub online: bool,
}

#[derive(Serialize)]
pub struct MachinesResponse {
    pub machines: Vec<MachineInfo>,
}

/// GET /api/machines
/// Returns all machines for the authenticated user, with online status
pub async fn list_machines(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<MachinesResponse>, (StatusCode, String)> {
    let user_id = extract_user_id(&state, &headers).await?;

    // Get online daemons from registry
    let online_daemons = state.cli_registry.get_all_for_user(&user_id);
    let online_ids: std::collections::HashSet<String> = online_daemons
        .iter()
        .map(|d| d.machine_id.clone())
        .collect();

    // Get all known machines from DB
    let db_machines = crate::db::get_machines_for_user(&state.db, &user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut machines: Vec<MachineInfo> = db_machines
        .into_iter()
        .map(|m| MachineInfo {
            machine_id: m.id.clone(),
            hostname: m.hostname.unwrap_or_default(),
            platform: m.platform.unwrap_or_default(),
            online: online_ids.contains(&m.id),
        })
        .collect();

    // Add any online daemons that aren't in DB yet (shouldn't happen normally)
    for daemon in &online_daemons {
        if !machines.iter().any(|m| m.machine_id == daemon.machine_id) {
            machines.push(MachineInfo {
                machine_id: daemon.machine_id.clone(),
                hostname: daemon.hostname.clone(),
                platform: daemon.platform.clone(),
                online: true,
            });
        }
    }

    Ok(Json(MachinesResponse { machines }))
}
