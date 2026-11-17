import { trainingLocalDate } from "@workspace/api-zod";
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

export async function motorTestHistory(clubId: number, playerId: number, teamIds: number[] = []): Promise<MotorTestHistory[]> {
  await ensureMotorTestStorage();
  const key = String(playerId);
  return motorRows<MotorTestHistory>(await db.execute(sql`
    SELECT id, test_date::text AS date, data->>'cycle' AS cycle, coalesce(data->'results'->${key}::text, '{"height":null,"weight":null,"tests":{}}'::jsonb) AS result,
      data->'tests' AS tests, (data->>'trainingSessionId')::integer AS "trainingSessionId"
    FROM motor_test_sessions WHERE club_id=${clubId} AND (
      (data->'results') ? ${key} OR (${teamIds.length ? sql`team_id IN (${sql.join(teamIds.map(id => sql`${id}`), sql`,`)})` : sql`false`} AND test_date <= ${trainingLocalDate()}::date
        AND test_date >= ${String(Number(trainingLocalDate().slice(0,4)) - (Number(trainingLocalDate().slice(5,7)) < 7 ? 1 : 0)) + "-07-01"}::date))
    ORDER BY test_date DESC, id DESC
  `));
}
