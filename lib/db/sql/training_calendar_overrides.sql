CREATE TABLE IF NOT EXISTS training_calendar_overrides (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  original_date DATE NOT NULL,
  original_start_time TEXT NOT NULL,
  original_end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'moved',
  new_date DATE,
  new_start_time TEXT,
  new_end_time TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_calendar_overrides_club_team_date
  ON training_calendar_overrides(club_id, team_id, original_date);
