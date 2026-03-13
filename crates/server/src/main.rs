mod e2ee_bridge;
mod e2ee_config;
mod e2ee_crypto;

use anyhow::{self, Error as AnyhowError};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use clap::{Parser, Subcommand};
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, routes};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
    browser::open_browser,
    port_file::write_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

#[derive(Parser)]
#[command(name = "vibe-kanban", about = "Vibe Kanban — local-first Kanban board")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the server (default if no subcommand given)
    Server,

    /// Authenticate with a remote gateway and generate master secret
    Login {
        /// Gateway URL (e.g., https://gateway.example.com)
        #[arg(long)]
        gateway: String,
    },

    /// Delete stored gateway credentials
    Logout,

    /// Show gateway connection status
    Status,
}

#[derive(Debug, Error)]
pub enum VibeKanbanError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[tokio::main]
async fn main() -> Result<(), VibeKanbanError> {
    let cli = Cli::parse();

    match cli.command {
        None | Some(Commands::Server) => cmd_server().await,
        Some(Commands::Login { gateway }) => {
            init_tracing_simple();
            cmd_login(&gateway).await.map_err(VibeKanbanError::Other)
        }
        Some(Commands::Logout) => {
            cmd_logout().map_err(VibeKanbanError::Other)
        }
        Some(Commands::Status) => {
            cmd_status().map_err(VibeKanbanError::Other)
        }
    }
}

/// Initialize simple tracing for CLI subcommands
fn init_tracing_simple() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();
}

/// The original server main logic
async fn cmd_server() -> Result<(), VibeKanbanError> {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_utils::init_once(SentrySource::Backend);

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level}",
        level = log_level
    );
    let env_filter = EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(env_filter))
        .with(sentry_layer())
        .init();

    // Create asset directory if it doesn't exist
    if !asset_dir().exists() {
        std::fs::create_dir_all(asset_dir())?;
    }

    let deployment = DeploymentImpl::new().await?;
    deployment.update_sentry_scope().await?;
    deployment
        .container()
        .cleanup_orphan_executions()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_before_head_commits()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_repo_names()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;
    // Pre-warm file search cache for most active projects
    let deployment_for_cache = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_cache
            .file_search_cache()
            .warm_most_active(&deployment_for_cache.db().pool, 3)
            .await
        {
            tracing::warn!("Failed to warm file search cache: {}", e);
        }
    });

    let app_router = routes::router(deployment.clone());

    let port = std::env::var("BACKEND_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| {
            // remove any ANSI codes, then turn into String
            let cleaned =
                String::from_utf8(strip(s.as_bytes())).expect("UTF-8 after stripping ANSI");
            cleaned.trim().parse::<u16>().ok()
        })
        .unwrap_or_else(|| {
            tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
            0
        }); // Use 0 to find free port if no specific port provided

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    let actual_port = listener.local_addr()?.port();

    tracing::info!("Server running on http://{host}:{actual_port}");

    // If VK_GATEWAY_URL is set and we have credentials, spawn bridge as background task
    if let Ok(gateway_url) = std::env::var("VK_GATEWAY_URL") {
        match e2ee_config::load_credentials() {
            Ok(creds) if creds.gateway_url == gateway_url => {
                let local_port = actual_port;
                tokio::spawn(async move {
                    tracing::info!("Starting E2EE bridge to gateway: {gateway_url}");
                    if let Err(e) = e2ee_bridge::run_bridge(&creds, local_port).await {
                        tracing::error!("E2EE bridge error: {e}");
                    }
                });
            }
            Ok(_) => {
                tracing::warn!(
                    "VK_GATEWAY_URL is set but credentials are for a different gateway. Run `vibe-kanban login --gateway {gateway_url}` first."
                );
            }
            Err(_) => {
                tracing::warn!(
                    "VK_GATEWAY_URL is set but no credentials found. Run `vibe-kanban login --gateway {gateway_url}` first."
                );
            }
        }
    }

    // Production only: write port file for extension discovery and open browser
    if !cfg!(debug_assertions) {
        if let Err(e) = write_port_file(actual_port).await {
            tracing::warn!("Failed to write port file: {}", e);
        }
        tracing::info!("Opening browser...");
        tokio::spawn(async move {
            if let Err(e) = open_browser(&format!("http://127.0.0.1:{actual_port}")).await {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    actual_port
                );
            }
        });
    }

    axum::serve(listener, app_router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    perform_cleanup_actions(&deployment).await;

    Ok(())
}

async fn cmd_login(gateway_url: &str) -> anyhow::Result<()> {
    println!("Logging in to gateway: {gateway_url}");

    // Prompt for email and password
    print!("Email: ");
    use std::io::Write;
    std::io::stdout().flush()?;
    let mut email = String::new();
    std::io::stdin().read_line(&mut email)?;
    let email = email.trim().to_string();

    print!("Password: ");
    std::io::stdout().flush()?;
    let mut password = String::new();
    std::io::stdin().read_line(&mut password)?;
    let password = password.trim().to_string();

    // Install rustls crypto provider for reqwest
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let client = reqwest::Client::new();

    // Login to get session token
    let login_resp = client
        .post(format!("{gateway_url}/api/auth/login"))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
        }))
        .send()
        .await?;

    if !login_resp.status().is_success() {
        let status = login_resp.status();
        let body = login_resp.text().await?;
        anyhow::bail!("Login failed ({status}): {body}");
    }

    #[derive(serde::Deserialize)]
    struct AuthResponse {
        token: String,
        user_id: String,
    }

    let auth: AuthResponse = login_resp.json().await?;
    tracing::info!("Logged in as user_id={}", auth.user_id);

    // Generate master secret
    let master_secret = e2ee_core::generate_master_secret();
    let master_secret_b64 = BASE64.encode(master_secret);

    // Derive auth keypair and register device key
    let crypto = e2ee_crypto::BridgeCryptoService::from_master_secret_b64(&master_secret_b64)?;
    let pub_key_b64 = crypto.auth_public_key_b64();

    let register_resp = client
        .post(format!("{gateway_url}/api/auth/device/register"))
        .header("Authorization", format!("Bearer {}", auth.token))
        .json(&serde_json::json!({
            "public_key": pub_key_b64,
            "device_name": hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "unknown".to_string()),
        }))
        .send()
        .await?;

    if !register_resp.status().is_success() {
        let status = register_resp.status();
        let body = register_resp.text().await?;
        anyhow::bail!("Device registration failed ({status}): {body}");
    }

    tracing::info!("Device key registered");

    // Save credentials
    let creds = e2ee_config::Credentials {
        master_secret: master_secret_b64.clone(),
        gateway_url: gateway_url.to_string(),
        session_token: auth.token,
        user_id: auth.user_id,
    };
    e2ee_config::save_credentials(&creds)?;
    tracing::info!("Credentials saved to {}", e2ee_config::credentials_path().display());

    println!();
    println!("Login successful!");
    println!();
    println!("Your master secret (for pairing WebUI):");
    println!("  {master_secret_b64}");
    println!();
    println!("Enter this in WebUI Settings > E2EE > Pair Device");

    Ok(())
}

fn cmd_status() -> anyhow::Result<()> {
    match e2ee_config::load_credentials() {
        Ok(creds) => {
            println!("Status: Configured");
            println!("  Gateway: {}", creds.gateway_url);
            println!("  User ID: {}", creds.user_id);
            println!("  Credentials: {}", e2ee_config::credentials_path().display());
        }
        Err(_) => {
            println!("Status: Not configured");
            println!("  Run `vibe-kanban login --gateway <url>` to set up");
        }
    }
    Ok(())
}

fn cmd_logout() -> anyhow::Result<()> {
    e2ee_config::delete_credentials()?;
    println!("Logged out. Credentials deleted.");
    Ok(())
}

pub async fn shutdown_signal() {
    // Always wait for Ctrl+C
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("Failed to install Ctrl+C handler: {e}");
        }
    };

    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        // Try to install SIGTERM handler, but don't panic if it fails
        let terminate = async {
            if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
                sigterm.recv().await;
            } else {
                tracing::error!("Failed to install SIGTERM handler");
                // Fallback: never resolves
                std::future::pending::<()>().await;
            }
        };

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }
    }

    #[cfg(not(unix))]
    {
        // Only ctrl_c is available, so just await it
        ctrl_c.await;
    }
}

pub async fn perform_cleanup_actions(deployment: &DeploymentImpl) {
    deployment
        .container()
        .kill_all_running_processes()
        .await
        .expect("Failed to cleanly kill running execution processes");
}
