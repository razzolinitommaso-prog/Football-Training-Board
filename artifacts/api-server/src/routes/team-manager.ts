import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, clubMembershipsTable, teamStaffAssignmentsTable, teamsTable, playersTable, matchesTable, callUpsTable, trainingSessionsTable, clubsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();
// The shared layout needs club identity, never access codes or billing data.
router.get("/clubs/me", requireAuth, async (req,res,next): Promise<void> => {
  if (req.session.role !== "team_manager") { next(); return; }
  if (!req.session.clubId || !req.session.userId) { res.status(403).json({error:"Accesso dirigenti richiesto"}); return; }
  const [club] = await db.select({id:clubsTable.id,name:clubsTable.name,logoUrl:clubsTable.logoUrl,city:clubsTable.city})
    .from(clubsTable).innerJoin(clubMembershipsTable,and(eq(clubMembershipsTable.clubId,clubsTable.id),eq(clubMembershipsTable.userId,req.session.userId),eq(clubMembershipsTable.role,"team_manager")))
    .where(eq(clubsTable.id,req.session.clubId)).limit(1);
  if (!club) { res.status(403).json({error:"Membro non autorizzato"}); return; }
  res.json(club);
});
router.get("/dirigenti/overview", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session;
  if (role !== "team_manager" || !clubId || !userId) { res.status(403).json({ error: "Accesso dirigenti richiesto" }); return; }
  const [membership] = await db.select({ sections: clubMembershipsTable.clubSection }).from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId,clubId),eq(clubMembershipsTable.userId,userId),eq(clubMembershipsTable.role,"team_manager"))).limit(1);
  if (!membership) { res.status(403).json({ error: "Membro non autorizzato" }); return; }
  const assigned = await db.select({ id:teamsTable.id, name:teamsTable.name, category:teamsTable.category, clubSection:teamsTable.clubSection })
    .from(teamsTable).innerJoin(teamStaffAssignmentsTable,and(eq(teamStaffAssignmentsTable.teamId,teamsTable.id),eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.userId,userId)))
    .where(eq(teamsTable.clubId,clubId)).orderBy(asc(teamsTable.name));
  const sections = new Set(membership.sections.map(section => section.replace(/-/g,"_")));
  const teams = assigned.filter((team,index,list) => sections.has(team.clubSection) && (!req.session.section || team.clubSection === req.session.section.replace(/-/g,"_")) && list.findIndex(item=>item.id===team.id)===index);
  const rawTeamId = req.query.teamId;
  const selectedTeamId = rawTeamId === undefined ? teams[0]?.id ?? null : Number(rawTeamId);
  if (rawTeamId !== undefined && (!Number.isInteger(selectedTeamId) || !teams.some(team=>team.id===selectedTeamId))) { res.status(403).json({ error: "Squadra non assegnata" }); return; }
  if (!selectedTeamId) { res.json({ teams, selectedTeamId:null, players:[], training:[], matches:[] }); return; }
  const [players, training, matchRows] = await Promise.all([
    db.select({ id:playersTable.id, firstName:playersTable.firstName, lastName:playersTable.lastName, jerseyNumber:playersTable.jerseyNumber, position:playersTable.position }).from(playersTable).where(and(eq(playersTable.clubId,clubId),eq(playersTable.teamId,selectedTeamId))).orderBy(asc(playersTable.lastName)),
    db.select({ id:trainingSessionsTable.id, title:trainingSessionsTable.title, scheduledAt:trainingSessionsTable.scheduledAt, location:trainingSessionsTable.location, durationMinutes:trainingSessionsTable.durationMinutes, status:trainingSessionsTable.status }).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),eq(trainingSessionsTable.teamId,selectedTeamId))).orderBy(asc(trainingSessionsTable.scheduledAt)),
    db.select({ id:matchesTable.id, opponent:matchesTable.opponent, date:matchesTable.date, competition:matchesTable.competition, location:matchesTable.location, homeAway:matchesTable.homeAway, result:matchesTable.result, isPostponed:matchesTable.isPostponed, rescheduleDate:matchesTable.rescheduleDate, rescheduleTbd:matchesTable.rescheduleTbd, matchPlan:matchesTable.matchPlan }).from(matchesTable).where(and(eq(matchesTable.clubId,clubId),eq(matchesTable.teamId,selectedTeamId))).orderBy(asc(matchesTable.date)),
  ]);
  const callups = matchRows.length ? await db.select({ matchId:callUpsTable.matchId, id:playersTable.id, firstName:playersTable.firstName, lastName:playersTable.lastName }).from(callUpsTable).innerJoin(playersTable,and(eq(playersTable.id,callUpsTable.playerId),eq(playersTable.clubId,clubId))).where(inArray(callUpsTable.matchId,matchRows.map(match=>match.id))).orderBy(asc(playersTable.lastName)) : [];
  const matches = matchRows.map(({matchPlan,...match})=>({...match, convocationAt:typeof matchPlan?.convocationAt === "string" ? matchPlan.convocationAt : null, convocationPlace:typeof matchPlan?.convocationPlace === "string" ? matchPlan.convocationPlace : null, callups:callups.filter(callup=>callup.matchId===match.id)}));
  res.json({ teams, selectedTeamId, players, training, matches });
});
export default router;
