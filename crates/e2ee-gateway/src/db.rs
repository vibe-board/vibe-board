use sqlx::{sqlite::SqliteConnectOptions, FromRow, SqlitePool};
use std::str::FromStr;
use tracing::info;

/// Initialize the SQLite database and run migrations
pub async fn init_db(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::from_str(database_url)?.create_if_missing(true);
    let pool = SqlitePool::connect_with(options).await?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| sqlx::Error::Migrate(Box::new(e)))?;

    info!("Database initialized");
    Ok(pool)
}

// --- User queries ---

pub async fn get_user_count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

pub async fn create_user(
    pool: &SqlitePool,
    id: &str,
    email: &str,
    password_hash: &str,
    name: Option<&str>,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)")
        .bind(id)
        .bind(email)
        .bind(password_hash)
        .bind(name)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub name: Option<String>,
    pub role: String,
}

pub async fn get_user_by_email(
    pool: &SqlitePool,
    email: &str,
) -> Result<Option<UserRow>, sqlx::Error> {
    let row: Option<UserRow> = sqlx::query_as(
        "SELECT id, email, password_hash, name, role FROM users WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

// --- Session queries (DB-backed, replaces in-memory SessionStore) ---

pub async fn create_session(
    pool: &SqlitePool,
    token: &str,
    user_id: &str,
    ttl_hours: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', ? || ' hours'))",
    )
    .bind(token)
    .bind(user_id)
    .bind(format!("+{ttl_hours}"))
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_session_user_id(
    pool: &SqlitePool,
    token: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime('now')",
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.0))
}

#[allow(dead_code)]
pub async fn delete_session(pool: &SqlitePool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM sessions WHERE token = ?")
        .bind(token)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn cleanup_expired_sessions(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

// --- Device key queries ---

pub async fn register_device_key(
    pool: &SqlitePool,
    id: &str,
    user_id: &str,
    public_key: &str,
    device_name: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO device_keys (id, user_id, public_key, device_name) VALUES (?, ?, ?, ?)",
    )
    .bind(id)
    .bind(user_id)
    .bind(public_key)
    .bind(device_name)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone, FromRow)]
#[allow(dead_code)]
pub struct DeviceKeyRow {
    pub id: String,
    pub user_id: String,
    pub public_key: String,
    pub device_name: Option<String>,
}

pub async fn get_user_by_device_pubkey(
    pool: &SqlitePool,
    public_key: &str,
) -> Result<Option<DeviceKeyRow>, sqlx::Error> {
    let row: Option<DeviceKeyRow> = sqlx::query_as(
        "SELECT id, user_id, public_key, device_name FROM device_keys WHERE public_key = ?",
    )
    .bind(public_key)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

#[allow(dead_code)]
pub async fn get_device_keys_for_user(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Vec<DeviceKeyRow>, sqlx::Error> {
    let rows: Vec<DeviceKeyRow> = sqlx::query_as(
        "SELECT id, user_id, public_key, device_name FROM device_keys WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

// --- Machine queries ---

pub async fn upsert_machine(
    pool: &SqlitePool,
    id: &str,
    user_id: &str,
    hostname: Option<&str>,
    platform: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO machines (id, user_id, hostname, platform, last_seen_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           hostname = excluded.hostname,
           platform = excluded.platform,
           last_seen_at = datetime('now')",
    )
    .bind(id)
    .bind(user_id)
    .bind(hostname)
    .bind(platform)
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, Clone, FromRow, serde::Serialize)]
pub struct MachineRow {
    pub id: String,
    pub user_id: String,
    pub hostname: Option<String>,
    pub platform: Option<String>,
    pub last_seen_at: Option<String>,
}

pub async fn get_machines_for_user(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Vec<MachineRow>, sqlx::Error> {
    let rows: Vec<MachineRow> = sqlx::query_as(
        "SELECT id, user_id, hostname, platform, last_seen_at FROM machines WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
