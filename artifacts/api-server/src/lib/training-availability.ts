import { and, eq, sql } from "drizzle-orm";
import { db, playersTable, teamsTable } from "@workspace/db";
import { rosterMembers } from "./training-roster-policy";
let ready = false;
export async function ensureParentTrainingAvailabilityTable() {
  if (ready) return;
  await db.execute(sql`CREATE TABLE IF NOT EXISTS parent_training_availabilities (
    id SERIAL PRIMARY KEY, club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    occurrence_id TEXT NOT NULL, scheduled_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL, reason TEXT, notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(club_id,team_id,player_id,occurrence_id))`);
  ready = true;
}
export function resultRows<T>(result:unknown):T[] { return (Array.isArray(result)?result:(result as {rows?:T[]})?.rows??[]) as T[]; }
export async function trainingAvailability(clubId:number,teamId:number,date:string,start:string,allowedTeamIds?:number[],requestedTeamIds?:number[],durationMinutes?:number,reader:Pick<typeof db,"select"|"execute">=db) {
  await ensureParentTrainingAvailabilityTable();
  const players=await reader.select({id:playersTable.id,teamId:playersTable.teamId,notes:playersTable.notes}).from(playersTable).where(eq(playersTable.clubId,clubId));
  const requested=[...new Set([teamId,...(requestedTeamIds??[])])];
  const teamIds=allowedTeamIds?requested.filter(id=>allowedTeamIds.includes(id)):requested;
  const roster=rosterMembers(players,teamIds);
  // Replies belong to the child's original team occurrence, including children
  // training with a supplemental/shared team. Only overlapping scheduled slots
  // are eligible; another training on the same date must not supply a reply.
  const teams=await reader.select().from(teamsTable).where(eq(teamsTable.clubId,clubId));
  const target=teams.find(team=>team.id===teamId);
  const weekdays=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
  const weekday=weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const sameDay=(day:string)=>day.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===weekday;
  const targetSlot=target?.trainingSchedule?.find(slot=>sameDay(slot.day)&&slot.startTime===start);
  // The prepared session may start before/after its recurring calendar slot.
  // Use its explicit duration to recover replies from the overlapping occurrence.
  const startMinute=Number(start.slice(0,2))*60+Number(start.slice(3));
  const endMinute=durationMinutes!==undefined?startMinute+durationMinutes:targetSlot?Number(targetSlot.endTime.slice(0,2))*60+Number(targetSlot.endTime.slice(3)):startMinute;
  const overlaps=(slot:{startTime:string;endTime:string})=>{const a=Number(slot.startTime.slice(0,2))*60+Number(slot.startTime.slice(3)),b=Number(slot.endTime.slice(0,2))*60+Number(slot.endTime.slice(3));return a===startMinute||(a<endMinute&&b>startMinute);};
  const relatedOccurrences=roster.flatMap(player=>{
    const owner=teams.find(team=>team.id===player.teamId);
    return (owner?.trainingSchedule??[]).filter(slot=>sameDay(slot.day)&&overlaps(slot))
      .map(slot=>`${owner!.id}-${date}-${slot.startTime}`);
  });
  // Retain replies attached to the original occurrence when that occurrence
  // was explicitly moved/joined. Never match a different slot by date alone.
  const origins=resultRows<{originalDate:string;originalStartTime:string}>(await reader.execute(sql`
    SELECT original_date::text AS "originalDate", original_start_time AS "originalStartTime"
    FROM training_calendar_overrides WHERE club_id=${clubId} AND team_id=${teamId}
      AND status IN ('moved','joined') AND new_date=${date}::date AND new_start_time=${start}`));
  const occurrences=[`${teamId}-${date}-${start}`,...roster.filter(player=>player.teamId).map(player=>`${player.teamId}-${date}-${start}`),...relatedOccurrences,...origins.map(row=>`${teamId}-${row.originalDate}-${row.originalStartTime}`)];
  const rows=resultRows<{playerId:number;status:string;occurrenceId:string;updatedAt:Date|string}>(await reader.execute(sql`
    SELECT player_id AS "playerId",status,occurrence_id AS "occurrenceId",updated_at AS "updatedAt" FROM parent_training_availabilities
    WHERE club_id=${clubId} AND occurrence_id IN (${sql.join(occurrences.map(value=>sql`${value}`),sql`,`)})`));
  const records=roster.map(player=>{
    const matches=rows.filter(row=>row.playerId===player.id);
    // A shifted/shared appointment may retain both its original and new keys.
    // Prefer the child's own-team replies, then the most recent explicit answer.
    // Conflicting answers with the same timestamp remain unknown, never available.
    const own=matches.filter(row=>row.occurrenceId.startsWith(`${player.teamId}-`));
    const candidates=own.length?own:matches;
    const timestamp=(row:typeof rows[number])=>new Date(row.updatedAt).getTime()||0;
    const latest=Math.max(0,...candidates.map(timestamp));
    const current=candidates.filter(row=>timestamp(row)===latest);
    const statuses=new Set(current.map(row=>row.status));
    const status=statuses.size===1?current[0]?.status:'pending';
    return {playerId:player.id,status:status==='available'||status==='unavailable'?status:'pending'};
  });
  return {records,available:records.filter(row=>row.status==='available').length,unavailable:records.filter(row=>row.status==='unavailable').length,pending:records.filter(row=>row.status==='pending').length,total:records.length};
}
