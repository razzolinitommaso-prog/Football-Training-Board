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
  target_audience TEXT NOT NULL DEFAULT 'all',
  notify_staff INTEGER NOT NULL DEFAULT 1,
  notify_parents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  attachment_name TEXT,
  attachment_mime_type TEXT,
  attachment_data TEXT,
  team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'all';
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notify_staff INTEGER NOT NULL DEFAULT 1;
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notify_parents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT;
ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_data TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_extra_events_club_section
  ON calendar_extra_events(club_id, section, created_at DESC);
