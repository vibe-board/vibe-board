-- Add role column to users table (first user will be 'admin', rest rejected)
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- DB-backed sessions (replaces in-memory DashMap)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
