ALTER TABLE players
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone_owner_type text DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS parent_first_name text,
  ADD COLUMN IF NOT EXISTS parent_last_name text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS parent_relation text,
  ADD COLUMN IF NOT EXISTS secondary_contact_first_name text,
  ADD COLUMN IF NOT EXISTS secondary_contact_last_name text,
  ADD COLUMN IF NOT EXISTS secondary_contact_phone text,
  ADD COLUMN IF NOT EXISTS secondary_contact_email text,
  ADD COLUMN IF NOT EXISTS secondary_contact_relation text;
