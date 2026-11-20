import { db, parentNotificationsTable, parentPlayerRelationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

let ready: Promise<void> | undefined;

export function ensureCallupRulesStorage() {
  ready ??= db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ftb-callup-rules-schema'))`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS match_callup_rules (
      club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id integer PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
      sessions integer NOT NULL CHECK (sessions BETWEEN 1 AND 5),
      minimum integer NOT NULL CHECK (minimum BETWEEN 1 AND sessions),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await tx.execute(sql`ALTER TABLE match_callup_rules ADD COLUMN IF NOT EXISTS allow_unrated_conduct boolean NOT NULL DEFAULT false`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS training_conduct_reviews (
      club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      session_id integer NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      conduct text NOT NULL CHECK (conduct IN ('ottima','buona','insufficiente')),
      note text NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, player_id)
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS scoped_parent_notifications (
      notification_id integer PRIMARY KEY REFERENCES parent_notifications(id) ON DELETE CASCADE,
      player_id integer NOT NULL
    )`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS match_callup_publications (
      match_id integer PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
      snapshot jsonb NOT NULL
    )`);
  }).catch(error => { ready = undefined; throw error; });
  return ready;
}

export const sqlRows = <T>(result: unknown): T[] => (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
export const childNotificationScope = (id: number | null | undefined) => sql`NOT EXISTS (
  SELECT 1 FROM scoped_parent_notifications scoped WHERE scoped.notification_id = ${parentNotificationsTable.id}
    AND scoped.player_id IS DISTINCT FROM ${id ?? null}
)`;

export async function notifyChild(
  tx: Pick<typeof db, "selectDistinct" | "insert" | "execute">,
  input: { playerId: number; clubId: number; type: string; title: string; message: string },
) {
  const parents = await tx.selectDistinct({ id: parentPlayerRelationsTable.parentUserId })
    .from(parentPlayerRelationsTable).where(eq(parentPlayerRelationsTable.playerId, input.playerId));
  for (const parent of parents) {
    const [row] = await tx.insert(parentNotificationsTable).values({
      parentUserId: parent.id, clubId: input.clubId, type: input.type, title: input.title, message: input.message,
    }).returning({ id: parentNotificationsTable.id });
    await tx.execute(sql`INSERT INTO scoped_parent_notifications (notification_id, player_id) VALUES (${row.id}, ${input.playerId})`);
  }
  return parents.map(parent => parent.id);
}
