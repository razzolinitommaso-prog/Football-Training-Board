ALTER TABLE players
  ADD COLUMN IF NOT EXISTS shuttle_service boolean DEFAULT false;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS shuttle_route text,
  ADD COLUMN IF NOT EXISTS shuttle_direction text;
