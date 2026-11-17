import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { MotorTestHistory } from "@workspace/api-zod";

let ready: Promise<void> | undefined;
export function ensureMotorTestStorage() {
  ready ??= db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ftb-motor-tests-schema'))`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS motor_test_sessions (
      id uuid PRIMARY KEY,
      club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      test_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      data jsonb NOT NULL
    )`);
    await tx.execute(sql`CREATE INDEX IF NOT EXISTS motor_test_sessions_club_date ON motor_test_sessions(club_id, test_date DESC)`);
  }).catch(error => { ready = undefined; throw error; });
  return ready;
}

export function motorRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export async function motorTestHistory(clubId: number, playerId: number): Promise<MotorTestHistory[]> {
  await ensureMotorTestStorage();
  const key = String(playerId);
  return motorRows<MotorTestHistory>(await db.execute(sql`
    SELECT id, test_date::text AS date, data->>'cycle' AS cycle, data->'results'->${key}::text AS result
    FROM motor_test_sessions WHERE club_id=${clubId} AND (data->'results') ? ${key}
    ORDER BY test_date DESC, id DESC
  `));
}
