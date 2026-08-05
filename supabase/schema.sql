-- Laki-Game v2 schema. No auth, no RLS policies (deny-all) — every table
-- is accessed exclusively through API routes using the service-role key.

CREATE TABLE IF NOT EXISTS wheel_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  slot_count INTEGER NOT NULL DEFAULT 6 CHECK (slot_count IN (6, 8, 10, 12)),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO wheel_settings (id, slot_count) VALUES (1, 6) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wheel_prizes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  prize_type VARCHAR(20) NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability NUMERIC(6,3),
  inventory INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS color_combo_prizes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL UNIQUE CHECK (symbol IN ('win', 'laki', 'clover')),
  name VARCHAR(100) NOT NULL,
  prize_type VARCHAR(20) NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability NUMERIC(7,4) NOT NULL DEFAULT 0,
  inventory INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO color_combo_prizes (symbol, name, prize_type, probability, inventory, active) VALUES
  ('win', 'WIN Combo', 'bonus', 0.05, NULL, true),
  ('laki', 'LAKI Combo', 'bonus', 0.05, NULL, true),
  ('clover', 'Clover Combo', 'bonus', 0.05, NULL, true)
ON CONFLICT (symbol) DO NOTHING;

CREATE TABLE IF NOT EXISTS color_merch_prizes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  prize_type VARCHAR(20) NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability NUMERIC(6,3),
  inventory INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS duck_race_prizes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  prize_type VARCHAR(20) NOT NULL CHECK (prize_type IN ('merchandise', 'bonus', 'cash', 'voucher', 'consolation', 'custom')),
  probability NUMERIC(6,3),
  inventory INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wheel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_combo_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_merch_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE duck_race_prizes ENABLE ROW LEVEL SECURITY;
-- No policies created — deny-all. All access goes through supabaseAdmin (service-role key) in API routes.
