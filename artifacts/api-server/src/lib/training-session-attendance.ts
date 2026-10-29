import { db } from "@workspace/db";
import { trainingAvailability } from "./training-availability";
import { trainingLocalSlot, sessionTeamIds } from "@workspace/api-zod";
import { sql } from "drizzle-orm";
import { excludeTrainingPlayers, sessionAttendanceState, type SessionAttendanceRow, type TrainingRotations } from "@workspace/api-zod";

type Reader={execute:(query:ReturnType<typeof sql>)=>Promise<unknown>};
const rows=<T>(result:unknown):T[]=>(Array.isArray(result)?result:(result as {rows?:T[]})?.rows??[]) as T[];
export async function readSessionAttendance(clubId:number,sessionId:number,reader:Reader=db){
 return sessionAttendanceState(rows<SessionAttendanceRow>(await reader.execute(sql`SELECT id,player_id AS "playerId",status,notes FROM training_attendances WHERE club_id=${clubId} AND training_session_id=${sessionId} ORDER BY id`)));
}
/** Caller holds the session row lock, shared with planning writes and deletion. */
export async function removeAbsentFromSessionPlan(reader:Reader,clubId:number,sessionId:number,playerId:number){
 const [exists]=rows<{name:string|null}>(await reader.execute(sql`SELECT to_regclass('training_session_plans')::text AS name`));
 if(!exists?.name)return;
 const [stored]=rows<{plan:{rotations?:TrainingRotations}}>(await reader.execute(sql`SELECT plan FROM training_session_plans WHERE session_id=${sessionId} AND club_id=${clubId}`));
 if(!stored?.plan.rotations)return;
 const next={...stored.plan,rotations:excludeTrainingPlayers(stored.plan.rotations,[playerId])};
 if(JSON.stringify(next)!==JSON.stringify(stored.plan))await reader.execute(sql`UPDATE training_session_plans SET plan=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE session_id=${sessionId} AND club_id=${clubId}`);
}

/** Explicit staff attendance wins; before appello, use the parent's known reply. */
export async function readSessionEligibility(clubId:number,session:{id:number;teamId:number|null;notes:string|null;scheduledAt:Date;durationMinutes:number|null;sessionKind?:string|null},reader:Pick<typeof db,"select"|"execute">=db){
 const state=await readSessionAttendance(clubId,session.id,reader);
 if(!session.teamId||session.sessionKind==="tipo")return state;
 const {date,start}=trainingLocalSlot(session.scheduledAt),ids=sessionTeamIds(session.teamId,session.notes);
 const replies=await trainingAvailability(clubId,session.teamId,date,start,undefined,ids,session.durationMinutes??90,reader);
 const recorded=new Set(state.recordedPlayerIds);
 const parentBlocked=replies.records.filter(row=>row.status==="unavailable"&&!recorded.has(row.playerId)).map(row=>row.playerId);
 return {...state,blockedPlayerIds:[...new Set([...state.blockedPlayerIds,...parentBlocked])].sort((a,b)=>a-b)};
}
