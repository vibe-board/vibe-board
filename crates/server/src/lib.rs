pub mod e2ee_bridge;
pub mod e2ee_config;
pub mod e2ee_crypto;
pub mod e2ee_manager;
pub mod error;
pub mod mcp;
pub mod middleware;
pub mod routes;

// #[cfg(not(feature = "cloud"))]
pub type DeploymentImpl = local_deployment::LocalDeployment;
