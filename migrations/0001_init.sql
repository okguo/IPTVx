-- IPTVx D1 schema (Requirements 4.9)

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  region TEXT,
  group_title TEXT,
  logo TEXT,
  tags TEXT,
  enabled INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  latency INTEGER,
  status TEXT DEFAULT 'unknown',
  success_rate REAL DEFAULT 1,
  priority INTEGER DEFAULT 0,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY,
  favorite_categories TEXT,
  preferred_region TEXT,
  preferred_quality TEXT,
  blocked_channels TEXT,
  preferred_isp TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  day TEXT PRIMARY KEY,
  visits INTEGER DEFAULT 0,
  stream_requests INTEGER DEFAULT 0,
  m3u_requests INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  avg_latency_ms REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cron_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT,
  channels_count INTEGER,
  healthy INTEGER,
  dead INTEGER,
  duration_ms INTEGER,
  message TEXT,
  started_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_streams_channel ON streams(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_normalized ON channels(normalized_name);
