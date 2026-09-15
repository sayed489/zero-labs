-- Forge relay schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  name              TEXT,
  platform          TEXT,
  device_token_hash TEXT NOT NULL,
  daemon_ok         INTEGER NOT NULL DEFAULT 0,
  last_seen_at      INTEGER,
  created_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  id                TEXT PRIMARY KEY,
  device_code_hash  TEXT NOT NULL UNIQUE,
  user_code         TEXT NOT NULL UNIQUE,
  device_name       TEXT,
  platform          TEXT,
  device_token_hash TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  user_id           TEXT,
  device_id         TEXT,
  expires_at        INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_pairing_user_code ON pairing_codes (user_code);
CREATE INDEX IF NOT EXISTS idx_pairing_device_code ON pairing_codes (device_code_hash);
