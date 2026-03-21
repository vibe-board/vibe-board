mod commands;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::connection::save_server_configs,
            commands::connection::load_server_configs,
            commands::connection::test_server_health,
            commands::config::get_app_config,
            commands::config::set_app_config,
            commands::platform::get_platform_info,
            commands::platform::is_mobile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
