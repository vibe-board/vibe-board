use std::path::PathBuf;

use tokio::fs;

pub async fn write_port_file(port: u16) -> std::io::Result<PathBuf> {
    let dir = crate::assets::asset_dir();
    let path = dir.join("vibe-board.port");
    tracing::debug!("Writing port {} to {:?}", port, path);
    fs::create_dir_all(&dir).await?;
    fs::write(&path, port.to_string()).await?;
    Ok(path)
}

pub async fn read_port_file(app_name: &str) -> std::io::Result<u16> {
    // Check if a custom data dir is set — read from there
    if let Some(data_dir) = crate::assets::DATA_DIR_OVERRIDE.get() {
        let path = data_dir.join("vibe-board.port");
        tracing::debug!("Reading port from {:?}", path);
        let content = fs::read_to_string(&path).await?;
        let port: u16 = content
            .trim()
            .parse()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        return Ok(port);
    }

    // Fallback: legacy /tmp path
    let dir = std::env::temp_dir().join(app_name);
    let path = dir.join(format!("{app_name}.port"));
    tracing::debug!("Reading port from {:?}", path);
    let content = fs::read_to_string(&path).await?;
    let port: u16 = content
        .trim()
        .parse()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(port)
}
