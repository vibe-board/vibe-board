use std::{path::PathBuf, sync::OnceLock};

use directories::ProjectDirs;
use rust_embed::RustEmbed;

const PROJECT_ROOT: &str = env!("CARGO_MANIFEST_DIR");

pub(crate) static DATA_DIR_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();

/// Set a custom data directory. Must be called before any `asset_dir()` usage.
/// This is intended to be called once at startup from main().
pub fn set_data_dir(path: PathBuf) {
    let _ = DATA_DIR_OVERRIDE.set(path);
}

pub fn asset_dir() -> std::path::PathBuf {
    if let Some(dir) = DATA_DIR_OVERRIDE.get() {
        if !dir.exists() {
            std::fs::create_dir_all(dir).expect("Failed to create data directory");
        }
        return dir.clone();
    }

    let path = if cfg!(debug_assertions) {
        std::path::PathBuf::from(PROJECT_ROOT).join("../../dev_assets")
    } else {
        dirs::home_dir()
            .expect("Failed to determine home directory")
            .join(".vibe-board")
    };

    // Ensure the directory exists
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("Failed to create asset directory");
    }

    path
}

pub fn config_path() -> std::path::PathBuf {
    asset_dir().join("config.json")
}

pub fn profiles_path() -> std::path::PathBuf {
    asset_dir().join("profiles.json")
}

pub fn credentials_path() -> std::path::PathBuf {
    asset_dir().join("credentials.json")
}

pub fn oauth_credentials_path() -> std::path::PathBuf {
    asset_dir().join("oauth_credentials.json")
}

#[derive(RustEmbed)]
#[folder = "../../assets/sounds"]
pub struct SoundAssets;

#[derive(RustEmbed)]
#[folder = "../../assets/scripts"]
pub struct ScriptAssets;

/// Recursively copy a directory and its contents.
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Migrate data from legacy platform-specific directory to ~/.vibe-board.
/// Called once at startup before any `asset_dir()` usage.
///
/// Old paths (from `directories::ProjectDirs`):
///   - Linux:   ~/.local/share/vibe-board/
///   - macOS:   ~/Library/Application Support/ai.bloop.vibe-board/
///   - Windows: C:\Users\<User>\AppData\Roaming\bloop\vibe-board\data\
///
/// Migration only runs when old path exists AND new path does not.
pub fn migrate_from_legacy_dir() {
    if cfg!(debug_assertions) {
        return;
    }
    if DATA_DIR_OVERRIDE.get().is_some() {
        return;
    }

    let Some(home) = dirs::home_dir() else {
        return;
    };
    let new_dir = home.join(".vibe-board");

    let old_dir = ProjectDirs::from("ai", "bloop", "vibe-board")
        .map(|p| p.data_dir().to_path_buf());
    let Some(old_dir) = old_dir else {
        return;
    };

    if old_dir == new_dir {
        return;
    }

    if !old_dir.exists() || new_dir.exists() {
        return;
    }

    tracing::info!(
        "Migrating data directory: {} -> {}",
        old_dir.display(),
        new_dir.display()
    );

    match std::fs::rename(&old_dir, &new_dir) {
        Ok(()) => {
            tracing::info!("Migration complete (rename)");
        }
        Err(e) => {
            tracing::warn!(
                "rename failed ({}), falling back to recursive copy",
                e
            );
            // Copy to a staging directory first, then rename atomically.
            // This avoids leaving a partial ~/.vibe-board on copy failure.
            let staging_dir = home.join(".vibe-board.migrating");
            let _ = std::fs::remove_dir_all(&staging_dir); // clean up any previous attempt
            match copy_dir_recursive(&old_dir, &staging_dir) {
                Ok(()) => match std::fs::rename(&staging_dir, &new_dir) {
                    Ok(()) => {
                        tracing::info!("Migration complete (copy + rename)");
                    }
                    Err(rename_err) => {
                        tracing::error!(
                            "Failed to rename staging directory: {}. Will use new empty directory.",
                            rename_err
                        );
                        let _ = std::fs::remove_dir_all(&staging_dir);
                    }
                },
                Err(copy_err) => {
                    tracing::error!(
                        "Failed to copy data directory: {}. Will use new empty directory.",
                        copy_err
                    );
                    let _ = std::fs::remove_dir_all(&staging_dir);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_dir_returns_default_when_no_override() {
        // Reset is not possible with OnceLock, so test shape only
        let dir = asset_dir();
        assert!(dir.is_absolute());
    }
}
