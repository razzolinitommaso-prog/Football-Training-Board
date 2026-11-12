import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let schema: Promise<unknown> | undefined;

export function ensureExtraTimeStorage() {
  schema ??= db.execute(sql`
    CREATE TABLE IF NOT EXISTS extra_time_packages (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      formula text NOT NULL, agreement text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    )
  `).then(() => db.execute(sql`
    CREATE TABLE IF NOT EXISTS extra_time_participants (
      id serial PRIMARY KEY, package_id integer NOT NULL REFERENCES extra_time_packages(id) ON DELETE CASCADE,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE, share_cents integer NOT NULL CHECK (share_cents > 0),
      UNIQUE (package_id, player_id)
    )
  `)).then(() => db.execute(sql`
    CREATE TABLE IF NOT EXISTS extra_time_receipts (
      participant_id integer NOT NULL REFERENCES extra_time_participants(id) ON DELETE CASCADE,
      payment_id integer PRIMARY KEY REFERENCES player_payments(id) ON DELETE CASCADE
    )
  `)).catch(error => { schema = undefined; throw error; });
  return schema;
}
