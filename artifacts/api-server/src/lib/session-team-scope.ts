import { ensureTrainingSuppressions } from "./training-session-integrity";
import { sql } from "drizzle-orm";
import { db, trainingSessionsTable } from "@workspace/db";
import { sessionTeamIds, SESSION_TEAMS_MARKER } from "@workspace/api-zod";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export function sessionTeamScope(teamId:number) {
 return sql`(${trainingSessionsTable.teamId}=${teamId} OR ${String(teamId)}=ANY(string_to_array(split_part(split_part(coalesce(${trainingSessionsTable.notes},''),${SESSION_TEAMS_MARKER},2),E'\\n',1),',')))`;
}
export async function consolidateSharedDrafts(tx:Tx,clubId:number,sourceId:number|null,teamIds:number[],at:Date,duration:number) {
 if(teamIds.length<2)return true;
 for(const teamId of [...teamIds].sort((a,b)=>a-b))await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${clubId}|${teamId}`}))`);
 const result=await tx.execute(sql`SELECT s.id,s.team_id AS "teamId",s.scheduled_at AS at,s.title,s.notes,s.status,
 (s.updated_at=s.created_at AND s.objectives IS NULL AND s.description IS NULL AND NOT EXISTS(SELECT 1 FROM training_session_exercises e WHERE e.training_session_id=s.id) AND NOT EXISTS(SELECT 1 FROM training_attendances a WHERE a.training_session_id=s.id)) AS empty
 FROM training_sessions s WHERE s.club_id=${clubId} AND s.team_id IN (${sql.join(teamIds.map(id=>sql`${id}`),sql`,`)}) AND s.session_kind='regular'
 AND s.id<>${sourceId??0} AND s.status NOT IN ('cancelled','canceled')
 AND s.scheduled_at<${new Date(at.getTime()+duration*60000).toISOString()}::timestamptz
 AND s.scheduled_at+coalesce(s.duration_minutes,90)*interval '1 minute'>${at.toISOString()}::timestamptz FOR UPDATE`);
 const rows=(Array.isArray(result)?result:(result as {rows:unknown[]}).rows) as {id:number;teamId:number;at:Date|string;title:string;notes:string|null;empty:boolean}[];
 if(rows.some(row=>!row.empty||row.title!=="Allenamento da preparare"||row.notes!=="[FTB_AUTO_TRAINING]"))return false;
 await ensureTrainingSuppressions(tx);
 for(const row of rows)await tx.execute(sql`UPDATE training_sessions SET status='cancelled',notes='[FTB_AUTO_TRAINING] GROUPED',updated_at=now() WHERE id=${row.id} AND club_id=${clubId}`);
 for(const row of rows)await tx.execute(sql`INSERT INTO training_session_suppressions(club_id,team_id,scheduled_at) VALUES(${clubId},${row.teamId},date_trunc('minute',${new Date(row.at).toISOString()}::timestamptz)) ON CONFLICT DO NOTHING`);
 return true;
}
export {sessionTeamIds};
