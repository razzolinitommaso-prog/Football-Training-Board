-- Additive migration. No existing tournament or fixture is changed.
BEGIN;
CREATE TABLE IF NOT EXISTS shared_tournaments (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id integer REFERENCES seasons(id) ON DELETE RESTRICT, club_section text NOT NULL,
      name text NOT NULL, location text, start_date date NOT NULL, end_date date,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE shared_tournaments ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS shared_tournament_teams (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE CASCADE,
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      CONSTRAINT shared_tournament_team_unique UNIQUE(tournament_id,team_id)
    );
    CREATE TABLE IF NOT EXISTS shared_tournament_matches (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE RESTRICT,
      match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE, entry_id text,
      CONSTRAINT shared_tournament_match_unique UNIQUE(match_id)
    );
    ALTER TABLE shared_tournament_matches ADD COLUMN IF NOT EXISTS entry_id text;
    CREATE TABLE IF NOT EXISTS shared_tournament_documents (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE CASCADE,
      file_name text NOT NULL, data_url text NOT NULL
    );
COMMIT;
