import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
let ready: Promise<void> | undefined;
export function ensureSocietyStorage() {
  return (ready ??= db
    .transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ftb-societies-lifecycle-v1'))`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS society_groups (id serial PRIMARY KEY,name text NOT NULL,created_by integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS society_group_clubs (club_id integer PRIMARY KEY REFERENCES clubs(id),group_id integer NOT NULL REFERENCES society_groups(id))`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS society_group_managers (group_id integer NOT NULL REFERENCES society_groups(id),user_id integer NOT NULL REFERENCES users(id),PRIMARY KEY(group_id,user_id))`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS member_dismissals (club_id integer NOT NULL REFERENCES clubs(id),user_id integer NOT NULL REFERENCES users(id),role text NOT NULL,effective_date date NOT NULL,notes text NOT NULL,revision integer NOT NULL DEFAULT 1,updated_by integer NOT NULL,PRIMARY KEY(club_id,user_id,role))`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS society_audit (id serial PRIMARY KEY,club_id integer NOT NULL,actor_id integer NOT NULL,area text NOT NULL,subject_id integer,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
      );
      await tx.execute(
        sql`CREATE TABLE IF NOT EXISTS player_positions (club_id integer NOT NULL REFERENCES clubs(id),player_id integer PRIMARY KEY REFERENCES players(id),revision integer NOT NULL DEFAULT 1,state text NOT NULL,effective_date date NOT NULL,notes text NOT NULL,updated_by integer NOT NULL)`,
      );
      await tx.execute(
        sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false`,
      );
      await tx.execute(
        sql`ALTER TABLE players ALTER COLUMN is_test SET DEFAULT false`,
      );
      await tx.execute(
        sql`UPDATE players SET is_test=false WHERE is_test IS NULL`,
      );
      await tx.execute(
        sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'football11'`,
      );
      await tx.execute(
        sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'male'`,
      );
      await tx.execute(
        sql`UPDATE players p SET status=CASE s.status WHEN 'not_confirmed' THEN 'not_renewed' WHEN 'withdrawn' THEN 'withdrawn' WHEN 'retired_definitive' THEN 'retired_definitive' ELSE 'transferred' END FROM (SELECT DISTINCT ON (ps.player_id) ps.player_id,ps.status FROM player_season_status ps JOIN seasons se ON se.id=ps.season_id AND se.club_id=ps.club_id WHERE se.is_active AND ps.status IN ('not_confirmed','withdrawn','retired_definitive','transfer_free','transfer_paid','swap','swap_loan') ORDER BY ps.player_id,ps.updated_at DESC,ps.id DESC) s WHERE p.id=s.player_id AND p.status NOT IN ('withdrawn','not_renewed','transferred','retired_definitive') AND NOT EXISTS(SELECT 1 FROM player_positions pos WHERE pos.player_id=p.id)`,
      );
    })
    .catch((error) => {
      ready = undefined;
      throw error;
    }));
}
