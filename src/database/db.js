const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('../config');

const DB_PATH = config.dbPath || path.join(__dirname, '..', '..', 'data', 'founderclock.sqlite');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  language TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  hourly_rate REAL NOT NULL DEFAULT 25,
  currency TEXT NOT NULL DEFAULT 'EUR'
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  duration_seconds INTEGER,
  description TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_guild_user ON sessions (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_guild_date ON sessions (guild_id, work_date);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL,
  category TEXT,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_guild_user ON expenses (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_guild_date ON expenses (guild_id, expense_date);

CREATE TABLE IF NOT EXISTS equity_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  hourly_rate REAL NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_equity_rounds_guild ON equity_rounds (guild_id, year, quarter);

CREATE TABLE IF NOT EXISTS equity_entries (
  round_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  hours REAL NOT NULL,
  expenses REAL NOT NULL,
  equity_value REAL NOT NULL,
  share_percent REAL NOT NULL,
  confirmed_at TEXT,
  PRIMARY KEY (round_id, user_id)
);
`;

function initDatabase() {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

function getDb() {
  if (!db) return initDatabase();
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDb, closeDatabase, DB_PATH };
