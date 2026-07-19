ALTER TABLE players
  ADD COLUMN IF NOT EXISTS shuttle_service boolean DEFAULT false;
