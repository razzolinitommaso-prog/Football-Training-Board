-- File condivisi segreteria (pianificazione / calendari), per club.
-- Esegui su PostgreSQL se non usi `pnpm --filter @workspace/db push` (es. produzione senza prompt interattivo).

CREATE TABLE IF NOT EXISTS club_secretary_shared_files (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  uploaded_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  content_base64 text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_secretary_shared_files_club_id_idx
  ON club_secretary_shared_files (club_id);
