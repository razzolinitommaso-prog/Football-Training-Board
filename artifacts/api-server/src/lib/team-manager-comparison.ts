import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, playersTable, trainingSessionsTable, trainingAttendancesTable } from "@workspace/db";
import { rosterMembers } from "./training-roster-policy";

// Called only after the overview route has checked membership, section,
// assigned team and ownership of the selected match.
export async function managerMatchComparison(clubId: number, teamId: number, matchDate: Date | null, calledIds: number[]) {
  const clubPlayers = await db.select({id:playersTable.id,firstName:playersTable.firstName,lastName:playersTable.lastName,teamId:playersTable.teamId,notes:playersTable.notes})
    .from(playersTable).where(eq(playersTable.clubId,clubId)).orderBy(asc(playersTable.lastName),asc(playersTable.firstName));
  const roster = new Set(rosterMembers(clubPlayers,[teamId]).map(player=>player.id));
  const called = new Set(calledIds);
  const players = clubPlayers.filter(player=>roster.has(player.id)||called.has(player.id)).map(player=>({id:player.id,firstName:player.firstName,lastName:player.lastName,called:called.has(player.id)}));
  if (!matchDate || !Number.isFinite(matchDate.getTime())) return {players,sessions:[],records:[]};
  // Fetch a bounded superset; the client applies local calendar-day boundaries
  // for the selected week/four weeks. No session after kickoff is returned.
  const from = new Date(matchDate.getTime()-36*24*60*60*1000);
  const sessions = await db.select({id:trainingSessionsTable.id,title:trainingSessionsTable.title,scheduledAt:trainingSessionsTable.scheduledAt,status:trainingSessionsTable.status})
    .from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),eq(trainingSessionsTable.teamId,teamId),gte(trainingSessionsTable.scheduledAt,from),lt(trainingSessionsTable.scheduledAt,matchDate))).orderBy(asc(trainingSessionsTable.scheduledAt));
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
  return {players,sessions:valid.map(({status,...session})=>session),records:[...records.values()]};
}
