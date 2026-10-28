import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function ensureTrainingSuppressions(tx:Tx) {
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS training_session_suppressions (
    club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    scheduled_at timestamptz NOT NULL, PRIMARY KEY(club_id,team_id,scheduled_at)
  )`);
}
export function sameTrainingMinute(column:unknown,date:Date) {
  return sql`date_trunc('minute',${column})=date_trunc('minute',${date.toISOString()}::timestamptz)`;
}
export async function trainingDeletionSummary(tx:Tx,clubId:number,id:number) {
  const result=await tx.execute(sql`SELECT s.title,s.scheduled_at AS "scheduledAt",t.name AS "teamName",
    (SELECT count(*)::int FROM training_session_exercises e WHERE e.training_session_id=s.id) AS "exerciseCount",
    (SELECT count(*)::int FROM training_attendances a WHERE a.training_session_id=s.id AND a.club_id=${clubId}) AS "attendanceCount",
    s.updated_at::text AS version
    FROM training_sessions s LEFT JOIN teams t ON t.id=s.team_id AND t.club_id=s.club_id
    WHERE s.id=${id} AND s.club_id=${clubId}`);
  return (Array.isArray(result)?result:(result as {rows:unknown[]}).rows)[0] as {title:string;scheduledAt:string;teamName:string|null;exerciseCount:number;attendanceCount:number;version:string}|undefined;
}
