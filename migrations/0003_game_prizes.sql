-- Shared prize table for games on the generic platform (lib/games.ts,
-- platform 'shared'), one row per prize scoped by game slug. The legacy
-- per-game tables are untouched.
CREATE TABLE game_prizes (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  prize_type TEXT NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability REAL CHECK (probability IS NULL OR probability BETWEEN 0 AND 100),
  inventory INTEGER CHECK (inventory IS NULL OR inventory >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX game_prizes_by_game ON game_prizes (game, display_order);

-- Pachinko starts with the Wheel's merch so it's playable right away.
INSERT INTO game_prizes (id, game, name, prize_type, display_order) VALUES
  ('6f0c3d52-8a41-4c7e-9b2d-1e5a7c9f0a11', 'pachinko', 'Totebag', 'merchandise', 0),
  ('a83e1b27-4d6f-4f19-8c05-3b7d2e6a4c22', 'pachinko', 'Coin Purse', 'merchandise', 1),
  ('c2d94f86-1b3a-4e58-a7f0-5c8e9d1b2e33', 'pachinko', 'Round Fan', 'merchandise', 2);
