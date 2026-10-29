import { sessionTeamScope } from "./session-team-scope";
import { trainingReplyMatches, trainingLocalSlot } from "@workspace/api-zod";
import { ensureParentTrainingAvailabilityTable, resultRows } from "./training-availability";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, playersTable, trainingSessionsTable, trainingAttendancesTable, teamsTable } from "@workspace/db";
import { rosterMembers } from "./training-roster-policy";

// Called only after the overview route has checked membership, section,
// assigned team and ownership of the selected match.
export async function managerMatchComparison(clubId: number, teamId: number, matchDate: Date | null, calledIds: number[]) {
  const clubPlayers = await db.select({id:playersTable.id,firstName:playersTable.firstName,lastName:playersTable.lastName,teamId:playersTable.teamId,notes:playersTable.notes})
    .from(playersTable).where(eq(playersTable.clubId,clubId)).orderBy(asc(playersTable.lastName),asc(playersTable.firstName));
  const roster = new Set(rosterMembers(clubPlayers,[teamId]).map(player=>player.id));
  const called = new Set(calledIds);
  const players = clubPlayers.filter(player=>roster.has(player.id)||called.has(player.id)).map(player=>({id:player.id,firstName:player.firstName,lastName:player.lastName,called:called.has(player.id)}));
  if (!matchDate || !Number.isFinite(matchDate.getTime())) return {players,sessions:[],records:[],replies:[]};
  // Fetch a bounded superset; the client applies local calendar-day boundaries
  // for the selected week/four weeks. No session after kickoff is returned.
  const from = new Date(matchDate.getTime()-36*24*60*60*1000);
  const sessions = await db.select({id:trainingSessionsTable.id,title:trainingSessionsTable.title,scheduledAt:trainingSessionsTable.scheduledAt,status:trainingSessionsTable.status,notes:trainingSessionsTable.notes,teamId:trainingSessionsTable.teamId,durationMinutes:trainingSessionsTable.durationMinutes})
    .from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),sessionTeamScope(teamId),sql`${trainingSessionsTable.notes} IS DISTINCT FROM '[FTB_AUTO_TRAINING] GROUPED'`,gte(trainingSessionsTable.scheduledAt,from),lt(trainingSessionsTable.scheduledAt,matchDate))).orderBy(asc(trainingSessionsTable.scheduledAt));
  const valid = sessions.filter(session=>!["cancelled","canceled"].includes(session.status));
  const rows = valid.length && players.length ? await db.select({id:trainingAttendancesTable.id,sessionId:trainingAttendancesTable.trainingSessionId,playerId:trainingAttendancesTable.playerId,status:trainingAttendancesTable.status,notes:trainingAttendancesTable.notes})
    .from(trainingAttendancesTable).where(and(eq(trainingAttendancesTable.clubId,clubId),inArray(trainingAttendancesTable.trainingSessionId,valid.map(session=>session.id)),inArray(trainingAttendancesTable.playerId,players.map(player=>player.id)))).orderBy(asc(trainingAttendancesTable.id)) : [];
  const records = new Map<string,{sessionId:number;playerId:number;attendance:"present"|"absent"|"unavailable"|null;availability:"available"|"unavailable"|null}>();
  for (const row of rows) {
    const status = row.status.toLowerCase();
    const parent = ["requested","absent"].includes(status) && (row.notes??"").startsWith("Genitore:");
    records.set(`${row.sessionId}|${row.playerId}`,{sessionId:row.sessionId,playerId:row.playerId,
      attendance:parent ? null : status === "present" || status === "absent" ? status : status === "injured" ? "unavailable" : null,
      availability:parent ? status === "requested" ? "available" : "unavailable" : null,
    });
  }
  await ensureParentTrainingAvailabilityTable();
  const allowedIds=new Set(players.map(player=>player.id));
  const replies=resultRows<{playerId:number;occurrenceId:string;status:string}>(await db.execute(sql`
    SELECT player_id AS "playerId",occurrence_id AS "occurrenceId",status FROM parent_training_availabilities
    WHERE club_id=${clubId} AND ${allowedIds.size?sql`player_id IN (${sql.join([...allowedIds].map(id=>sql`${id}`),sql`,`)})`:sql`false`} AND scheduled_at>=${from.toISOString()}::timestamptz AND scheduled_at<${matchDate.toISOString()}::timestamptz`)).filter(row=>allowedIds.has(row.playerId)).map(row=>({...row,status:["available","unavailable"].includes(row.status)?row.status:"pending"}));
  const schedules=valid.some(session=>session.notes?.includes('[FTB_SESSION_TEAMS]'))?await db.select({id:teamsTable.id,schedule:teamsTable.trainingSchedule}).from(teamsTable).where(eq(teamsTable.clubId,clubId)):[];
  for(const session of valid.filter(session=>session.notes?.includes('[FTB_SESSION_TEAMS]'))){
    const {date,start}=trainingLocalSlot(session.scheduledAt);
    for(const player of players){
      const candidates=replies.filter(reply=>reply.playerId===player.id&&trainingReplyMatches(reply.occurrenceId,session,schedules.find(team=>team.id===Number(reply.occurrenceId.split('-')[0]))?.schedule??[]));
      if(candidates.length){const statuses=new Set(candidates.map(reply=>reply.status));replies.push({playerId:player.id,occurrenceId:`${teamId}-${date}-${start}`,status:statuses.size===1?candidates[0].status:'pending'});}
    }
  }
  return {players,replies,sessions:valid.map(({status,notes,teamId,durationMinutes,...session})=>session),records:[...records.values()]};
}
