use crate::state::{AppState, ServerConfig};
use tauri::State;

#[tauri::command]
pub async fn save_server_configs(
    state: State<'_, AppState>,
    configs: Vec<ServerConfig>,
) -> Result<(), String> {
    let mut servers = state.servers.lock().map_err(|e| e.to_string())?;
    *servers = configs;
    Ok(())
}

#[tauri::command]
pub async fn load_server_configs(
    state: State<'_, AppState>,
) -> Result<Vec<ServerConfig>, String> {
    let servers = state.servers.lock().map_err(|e| e.to_string())?;
    Ok(servers.clone())
}

#[tauri::command]
pub async fn test_server_health(url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(format!("{}/api/health", url)).send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}
