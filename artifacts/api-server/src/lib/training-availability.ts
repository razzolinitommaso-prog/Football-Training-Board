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
export async function trainingAvailability(clubId:number,teamId:number,date:string,start:string,allowedTeamIds?:number[],requestedTeamIds?:number[]) {
  await ensureParentTrainingAvailabilityTable();
  const players=await db.select({id:playersTable.id,teamId:playersTable.teamId,notes:playersTable.notes}).from(playersTable).where(eq(playersTable.clubId,clubId));
  const requested=[...new Set([teamId,...(requestedTeamIds??[])])];
  const teamIds=allowedTeamIds?requested.filter(id=>allowedTeamIds.includes(id)):requested;
  const roster=rosterMembers(players,teamIds);
  // Replies belong to the child's original team occurrence, including children
  // training with a supplemental/shared team. Only overlapping scheduled slots
  // are eligible; another training on the same date must not supply a reply.
  const teams=await db.select().from(teamsTable).where(eq(teamsTable.clubId,clubId));
  const target=teams.find(team=>team.id===teamId);
  const weekdays=['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
  const weekday=weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const sameDay=(day:string)=>day.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===weekday;
  const targetSlot=target?.trainingSchedule?.find(slot=>sameDay(slot.day)&&slot.startTime===start);
  const targetEnd=targetSlot?.endTime??start;
  const relatedOccurrences=roster.flatMap(player=>{
    const owner=teams.find(team=>team.id===player.teamId);
    return (owner?.trainingSchedule??[]).filter(slot=>sameDay(slot.day)&&(slot.startTime===start||(targetEnd>start&&slot.startTime<targetEnd&&slot.endTime>start)))
      .map(slot=>`${owner!.id}-${date}-${slot.startTime}`);
  });
  // Retain replies attached to the original occurrence when that occurrence
  // was explicitly moved/joined. Never match a different slot by date alone.
  const origins=resultRows<{originalDate:string;originalStartTime:string}>(await db.execute(sql`
    SELECT original_date::text AS "originalDate", original_start_time AS "originalStartTime"
    FROM training_calendar_overrides WHERE club_id=${clubId} AND team_id=${teamId}
      AND status IN ('moved','joined') AND new_date=${date}::date AND new_start_time=${start}`));
  const occurrences=[`${teamId}-${date}-${start}`,...roster.filter(player=>player.teamId).map(player=>`${player.teamId}-${date}-${start}`),...relatedOccurrences,...origins.map(row=>`${teamId}-${row.originalDate}-${row.originalStartTime}`)];
  const rows=resultRows<{playerId:number;status:string;occurrenceId:string}>(await db.execute(sql`
    SELECT player_id AS "playerId",status,occurrence_id AS "occurrenceId" FROM parent_training_availabilities
    WHERE club_id=${clubId} AND occurrence_id IN (${sql.join(occurrences.map(value=>sql`${value}`),sql`,`)})`));
  const records=roster.map(player=>{const matches=rows.filter(row=>row.playerId===player.id);const exact=matches.find(row=>row.occurrenceId===occurrences[0]);const statuses=new Set(matches.map(row=>row.status));const own=matches.filter(row=>row.occurrenceId.startsWith(`${player.teamId}-${date}-`));const ownExact=own.find(row=>row.occurrenceId===`${player.teamId}-${date}-${start}`);const ownStatuses=new Set(own.map(row=>row.status));const status=ownExact?.status??(own.length?(ownStatuses.size===1?own[0].status:"pending"):exact?.status??(statuses.size===1?matches[0]?.status:null));return {playerId:player.id,status:status==='available'||status==='unavailable'?status:'pending'};});
  return {records,available:records.filter(row=>row.status==='available').length,unavailable:records.filter(row=>row.status==='unavailable').length,pending:records.filter(row=>row.status==='pending').length,total:records.length};
}
