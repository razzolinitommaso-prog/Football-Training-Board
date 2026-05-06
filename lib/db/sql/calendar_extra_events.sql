CREATE TABLE IF NOT EXISTS calendar_extra_events (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  section TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'everyday',
  weekdays JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_mode TEXT NOT NULL DEFAULT 'all',
  team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_extra_events_club_section
  ON calendar_extra_events(club_id, section, created_at DESC);
