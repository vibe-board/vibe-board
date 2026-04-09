use std::collections::HashMap;

use axum::{
    Router,
    response::Json as ResponseJson,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use utils::{
    assets::{config_path, credentials_path, profiles_path},
    response::ApiResponse,
    version::APP_VERSION_WITH_SHA,
};

use crate::{DeploymentImpl, error::ApiError};

#[derive(Serialize)]
struct ExportEnvelope {
    export_version: u32,
    exported_at: String,
    source_app_version: String,
    sections: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct ImportEnvelope {
    sections: HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
struct ImportResult {
    results: HashMap<String, ImportSectionResult>,
}

#[derive(Serialize)]
#[serde(tag = "status")]
enum ImportSectionResult {
    #[serde(rename = "ok")]
    Ok,
    #[serde(rename = "error")]
    Error { message: String },
}

async fn export_config() -> Result<ResponseJson<ApiResponse<ExportEnvelope>>, ApiError> {
    let mut sections = HashMap::new();

    // config.json
    let config_content = std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = config_content {
        sections.insert("config".to_string(), v);
    }

    // profiles.json
    let profiles_content = std::fs::read_to_string(profiles_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = profiles_content {
        sections.insert("profiles".to_string(), v);
    }

    // credentials.json (gateway)
    let credentials_content = std::fs::read_to_string(credentials_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = credentials_content {
        sections.insert("gateway_credentials".to_string(), v);
    }

    let envelope = ExportEnvelope {
        export_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        source_app_version: APP_VERSION_WITH_SHA.to_string(),
        sections,
    };

    Ok(ResponseJson(ApiResponse::success(envelope)))
}

async fn import_config(
    axum::extract::Json(envelope): axum::extract::Json<ImportEnvelope>,
) -> Result<ResponseJson<ApiResponse<ImportResult>>, ApiError> {
    let mut results = HashMap::new();

    // config
    if let Some(config_value) = envelope.sections.get("config") {
        let result = match serde_json::to_string_pretty(config_value) {
            Ok(content) => {
                // Atomic write: tmp + rename
                let path = config_path();
                let tmp_path = path.with_extension("json.tmp");
                match std::fs::write(&tmp_path, &content).and_then(|_| {
                    let file = std::fs::File::open(&tmp_path)?;
                    file.sync_all()?;
                    drop(file);
                    std::fs::rename(&tmp_path, &path)
                }) {
                    Ok(_) => ImportSectionResult::Ok,
                    Err(e) => ImportSectionResult::Error {
                        message: format!("Failed to write config: {e}"),
                    },
                }
            }
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize config: {e}"),
            },
        };
        results.insert("config".to_string(), result);
    }

    // profiles
    if let Some(profiles_value) = envelope.sections.get("profiles") {
        let result = match serde_json::to_string_pretty(profiles_value) {
            Ok(content) => match std::fs::write(profiles_path(), &content) {
                Ok(_) => {
                    executors::profile::ExecutorConfigs::reload();
                    ImportSectionResult::Ok
                }
                Err(e) => ImportSectionResult::Error {
                    message: format!("Failed to write profiles: {e}"),
                },
            },
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize profiles: {e}"),
            },
        };
        results.insert("profiles".to_string(), result);
    }

    // gateway_credentials
    if let Some(creds_value) = envelope.sections.get("gateway_credentials") {
        let result = match serde_json::to_string_pretty(creds_value) {
            Ok(content) => match std::fs::write(credentials_path(), &content) {
                // BridgeManager file watcher auto-detects and reconnects
                Ok(_) => ImportSectionResult::Ok,
                Err(e) => ImportSectionResult::Error {
                    message: format!("Failed to write credentials: {e}"),
                },
            },
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize credentials: {e}"),
            },
        };
        results.insert("gateway_credentials".to_string(), result);
    }

    Ok(ResponseJson(ApiResponse::success(ImportResult { results })))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/config/export", get(export_config))
        .route("/config/import", post(import_config))
}
