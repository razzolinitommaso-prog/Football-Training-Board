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
