CREATE TABLE IF NOT EXISTS warehouse_items (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'apparel',
  code text NOT NULL,
  name text NOT NULL,
  category text,
  size text,
  quantity_available integer NOT NULL DEFAULT 0,
  quantity_reserved integer NOT NULL DEFAULT 0,
  reorder_threshold integer NOT NULL DEFAULT 0,
  supplier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warehouse_items_club_section_idx ON warehouse_items (club_id, section);
CREATE INDEX IF NOT EXISTS warehouse_items_club_code_size_idx ON warehouse_items (club_id, code, size);
