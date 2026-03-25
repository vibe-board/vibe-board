/// The current application version from Cargo.toml
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// The current application version with git commit SHA (e.g. "0.1.9-main.5+abc1234")
pub const APP_VERSION_WITH_SHA: &str =
    concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH"));
