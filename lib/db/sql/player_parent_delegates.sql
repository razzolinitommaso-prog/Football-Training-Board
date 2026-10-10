CREATE TABLE IF NOT EXISTS player_parent_delegates (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  relation TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  access_code TEXT NOT NULL,
  personal_access_code_hash TEXT,
  personal_access_code_set_at TIMESTAMPTZ,
  reset_requested_at TIMESTAMPTZ,
  delivery_channel TEXT NOT NULL DEFAULT 'manual',
  delivery_status TEXT NOT NULL DEFAULT 'ready',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_parent_delegates_club_player
  ON player_parent_delegates (club_id, player_id);

CREATE INDEX IF NOT EXISTS idx_player_parent_delegates_access_code
  ON player_parent_delegates (access_code);

ALTER TABLE player_parent_delegates
  ADD COLUMN IF NOT EXISTS personal_access_code_hash TEXT,
  ADD COLUMN IF NOT EXISTS personal_access_code_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMPTZ;
