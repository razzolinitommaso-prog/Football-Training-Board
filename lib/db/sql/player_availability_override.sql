ALTER TABLE players ADD COLUMN IF NOT EXISTS availability_override_active boolean NOT NULL DEFAULT false;
ALTER TABLE players ADD COLUMN IF NOT EXISTS availability_override_from date;
ALTER TABLE players ADD COLUMN IF NOT EXISTS availability_override_until date;
ALTER TABLE players ADD COLUMN IF NOT EXISTS availability_override_reason text;
