ALTER TABLE warehouse_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'inventory',
  ADD COLUMN IF NOT EXISTS price real,
  ADD COLUMN IF NOT EXISTS is_active integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS warehouse_items_club_item_type_idx ON warehouse_items (club_id, item_type);
