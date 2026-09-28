-- Laki-Game schema (Cloudflare D1 / SQLite). Ported from the original
-- Supabase Postgres schema. Booleans are stored as 0/1; UUIDs are
-- generated in the API routes with crypto.randomUUID().

CREATE TABLE wheel_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slot_count INTEGER NOT NULL DEFAULT 6 CHECK (slot_count IN (6, 8, 10, 12))
);

CREATE TABLE wheel_prizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL,
  inventory INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE color_combo_prizes (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE CHECK (symbol IN ('win', 'laki', 'clover')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL NOT NULL DEFAULT 0,
  inventory INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE color_merch_prizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL,
  inventory INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE duck_race_prizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL,
  inventory INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
