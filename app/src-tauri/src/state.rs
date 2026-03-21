use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub connection_type: String,
    pub url: String,
    pub gateway_url: Option<String>,
    pub master_secret: Option<String>,
    pub machine_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    pub theme: String,
    pub language: String,
    pub sidebar_collapsed: bool,
}

#[derive(Default)]
pub struct AppState {
    pub servers: Mutex<Vec<ServerConfig>>,
    pub config: Mutex<AppConfig>,
}
