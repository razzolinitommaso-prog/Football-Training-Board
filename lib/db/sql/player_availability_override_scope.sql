ALTER TABLE players ADD COLUMN IF NOT EXISTS availability_override_scope text NOT NULL DEFAULT 'training_and_matches';
