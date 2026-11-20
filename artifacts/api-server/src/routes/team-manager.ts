import { WITHDRAWN_PLAYER_STATUS } from "@workspace/api-zod";
import {buildMatchRotationSummary,defaultRotationCapacity,matchPreparationStatus,matchReportPlayerIds,matchReportSchema,trainingLocalDate} from "@workspace/api-zod";
import { activeTrainingGroup } from "../lib/joint-training-program";
import { sessionTeamScope } from "../lib/session-team-scope";
import { Router } from "express";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db, clubMembershipsTable, teamStaffAssignmentsTable, teamsTable, playersTable, matchesTable, callUpsTable, trainingSessionsTable, clubsTable, trainingCalendarOverridesTable } from "@workspace/db";
import { managerMatchComparison } from "../lib/team-manager-comparison";
import { splitPublicNotesAndPlan } from "../lib/match-plan-notes";
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
  if (!selectedTeamId) { res.json({ teams, selectedTeamId:null, players:[], training:[], matches:[], trainingCalendar:null }); return; }
  const programTeams = await db.select({ id: teamsTable.id, name: teamsTable.name, clubSection: teamsTable.clubSection,
    seasonId: teamsTable.seasonId, trainingSchedule: teamsTable.trainingSchedule,
    seasonTrainingStartDate: teamsTable.seasonTrainingStartDate, officialTrainingEndDate: teamsTable.officialTrainingEndDate,
  }).from(teamsTable).where(eq(teamsTable.clubId, clubId));
  const selectedProgram = programTeams.find(team => team.id === selectedTeamId);
  const rosterTeamIds = selectedProgram ? activeTrainingGroup(programTeams, selectedProgram, trainingLocalDate()) : [selectedTeamId];
  const rosterTeams = programTeams.filter(team => rosterTeamIds.includes(team.id)).map(({ id, name }) => ({ id, name }));
  const [playerRows, training, matchRows, changes] = await Promise.all([
    db.select({ id:playersTable.id, firstName:playersTable.firstName, lastName:playersTable.lastName, teamId:playersTable.teamId, jerseyNumber:playersTable.jerseyNumber, position:playersTable.position, registered:playersTable.registered, registrationNumber:playersTable.registrationNumber, medicalCertificateExpiry:playersTable.medicalCertificateExpiry }).from(playersTable).where(and(eq(playersTable.clubId,clubId),inArray(playersTable.teamId,rosterTeamIds),sql`${playersTable.status} NOT IN ('withdrawn','not_renewed','transferred','retired_definitive') AND NOT ${playersTable.isTest}`)).orderBy(asc(playersTable.lastName)),
    db.select({ id:trainingSessionsTable.id, title:trainingSessionsTable.title, scheduledAt:trainingSessionsTable.scheduledAt, location:trainingSessionsTable.location, durationMinutes:trainingSessionsTable.durationMinutes, shared:sql<boolean>`${trainingSessionsTable.notes} LIKE '%[FTB_SESSION_TEAMS]%'`, status:trainingSessionsTable.status }).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),sessionTeamScope(selectedTeamId),sql`${trainingSessionsTable.notes} IS DISTINCT FROM '[FTB_AUTO_TRAINING] GROUPED'`)).orderBy(asc(trainingSessionsTable.scheduledAt)),
    db.select({ id:matchesTable.id, opponent:matchesTable.opponent, date:matchesTable.date, competition:matchesTable.competition, location:matchesTable.location, homeAway:matchesTable.homeAway, result:matchesTable.result, isPostponed:matchesTable.isPostponed, rescheduleDate:matchesTable.rescheduleDate, rescheduleTbd:matchesTable.rescheduleTbd, matchPlan:matchesTable.matchPlan, notes:matchesTable.notes }).from(matchesTable).where(and(eq(matchesTable.clubId,clubId),eq(matchesTable.teamId,selectedTeamId))).orderBy(asc(matchesTable.date)),
    db.select({id:trainingCalendarOverridesTable.id, teamId:trainingCalendarOverridesTable.teamId, originalDate:trainingCalendarOverridesTable.originalDate, originalStartTime:trainingCalendarOverridesTable.originalStartTime, originalEndTime:trainingCalendarOverridesTable.originalEndTime, status:trainingCalendarOverridesTable.status, newDate:trainingCalendarOverridesTable.newDate, newStartTime:trainingCalendarOverridesTable.newStartTime, newEndTime:trainingCalendarOverridesTable.newEndTime, targetDate:trainingCalendarOverridesTable.targetDate, targetStartTime:trainingCalendarOverridesTable.targetStartTime, targetEndTime:trainingCalendarOverridesTable.targetEndTime, location:trainingCalendarOverridesTable.location})
      .from(trainingCalendarOverridesTable).innerJoin(teamsTable,and(eq(teamsTable.id,trainingCalendarOverridesTable.teamId),eq(teamsTable.clubId,clubId)))
      .where(and(eq(trainingCalendarOverridesTable.clubId,clubId),or(eq(trainingCalendarOverridesTable.teamId,selectedTeamId),and(eq(trainingCalendarOverridesTable.status,"joined"),eq(trainingCalendarOverridesTable.targetTeamId,selectedTeamId))))),
  ]);
  const players = playerRows.map(({ teamId, ...player }) => ({ ...player, teamName: rosterTeams.find(team => team.id === teamId)?.name }));
  const trainingCalendar = {
    start:selectedProgram?.seasonTrainingStartDate ?? null, end:selectedProgram?.officialTrainingEndDate ?? null,
    slots:(selectedProgram?.trainingSchedule ?? []).map(slot=>({day:slot.day,startTime:slot.startTime,endTime:slot.endTime,campo:slot.campo ?? null})),
    changes:changes.map(change=>({id:change.id,status:change.status,location:change.location,
      originalDate:change.teamId === selectedTeamId ? change.originalDate : null,
      originalStartTime:change.teamId === selectedTeamId ? change.originalStartTime : null,
      originalEndTime:change.teamId === selectedTeamId ? change.originalEndTime : null,
      newDate:change.teamId === selectedTeamId ? change.newDate : change.targetDate,
      newStartTime:change.teamId === selectedTeamId ? change.newStartTime : change.targetStartTime,
      newEndTime:change.teamId === selectedTeamId ? change.newEndTime : change.targetEndTime,
    })),
  };
  const callups = matchRows.length ? await db.select({ matchId:callUpsTable.matchId, id:playersTable.id, firstName:playersTable.firstName, lastName:playersTable.lastName, jerseyNumber:playersTable.jerseyNumber, position:playersTable.position, status:callUpsTable.status }).from(callUpsTable).innerJoin(playersTable,and(eq(playersTable.id,callUpsTable.playerId),eq(playersTable.clubId,clubId))).where(inArray(callUpsTable.matchId,matchRows.map(match=>match.id))).orderBy(asc(playersTable.lastName)) : [];
  const coachCallups = callups.filter(callup=>!["available","unavailable","availability","absent","declined","not_called"].includes(callup.status.toLowerCase()));
  const uniqueCallups = [...new Map(coachCallups.map(row => [`${row.matchId}:${row.id}`, row])).values()];
  const comparisonId = req.query.comparisonMatchId;
  let comparison;
  if (comparisonId !== undefined) {
    const match = matchRows.find(item=>item.id===Number(comparisonId));
    if (!match || !Number.isInteger(Number(comparisonId))) { res.status(403).json({error:"Partita non disponibile per questa squadra"}); return; }
    const date = match.isPostponed ? match.rescheduleTbd ? null : match.rescheduleDate : match.date;
    comparison = await managerMatchComparison(clubId,selectedTeamId,date,uniqueCallups.filter(callup=>callup.matchId===match.id).map(callup=>callup.id));
  }
  const selectedTeam = teams.find(team => team.id === selectedTeamId);
  const capacity = defaultRotationCapacity(selectedTeam?.name, selectedTeam?.category, selectedTeam?.clubSection);
  const reports = matchRows.map(({ matchPlan: savedPlan, notes, ...match }) => {
    const legacy = splitPublicNotesAndPlan(notes).plan;
    const matchPlan = savedPlan ?? (legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy as Record<string, unknown> : null);
    const report = matchReportSchema.safeParse(matchPlan?.postMatchReport);
    const matchCallups = uniqueCallups.filter(callup => callup.matchId === match.id);
    const confirmation = matchPlan?.postMatchConfirmation as { confirmedAt?: unknown; report?: unknown; notes?: unknown } | undefined;
    const managerReport = matchReportSchema.safeParse(confirmation?.report);
    const calledIds = new Set(matchCallups.map(player => player.id));
    const historicalIds = [...new Set([...matchReportPlayerIds(report.data), ...matchReportPlayerIds(managerReport.data)])]
      .filter(id => !calledIds.has(id));
    return { match, matchPlan, report, matchCallups, confirmation, managerReport, historicalIds };
  });
  const historicalIds = [...new Set(reports.flatMap(item => item.historicalIds))];
  const historicalPlayers = historicalIds.length ? await db.select({
    id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName,
    jerseyNumber: playersTable.jerseyNumber, position: playersTable.position,
  }).from(playersTable).where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, historicalIds))) : [];
  const historicalById = new Map(historicalPlayers.map(player => [player.id, player]));
  const matches = reports.map(({ match, matchPlan, report, matchCallups, confirmation, managerReport, historicalIds }) => {
    const reportRoster = [...matchCallups, ...historicalIds.map(id => historicalById.get(id) ??
      { id, firstName: "", lastName: "Giocatore #" + id })];
    return {
      ...(historicalIds.length ? {
        reportPlayers: reportRoster.map(({ id, firstName, lastName }) => ({ id, firstName, lastName })),
        reportRotation: buildMatchRotationSummary(matchPlan, reportRoster, capacity, true, true),
      } : {}),
      ...match,
      ...(report.success ? { report: report.data } : {}),
      ...(typeof confirmation?.confirmedAt === "string" ? {
        review: { confirmedAt: confirmation.confirmedAt, ...(managerReport.success ? { report: managerReport.data } : {}),
          ...(typeof confirmation.notes === "string" ? { notes: confirmation.notes } : {}) },
      } : {}),
      preparationStatus: matchPreparationStatus(matchPlan, capacity),
      rotation: buildMatchRotationSummary(matchPlan, matchCallups, capacity, true, true),
      convocationAt: typeof matchPlan?.convocationAt === "string" ? matchPlan.convocationAt : null,
      convocationPlace: typeof matchPlan?.convocationPlace === "string" ? matchPlan.convocationPlace : null,
      callups: matchCallups.map(({ id, firstName, lastName }) => ({ id, firstName, lastName })),
    };
  });
  res.json({ teams, selectedTeamId, players, rosterTeams, training, matches, trainingCalendar, ...(comparison ? {comparison} : {}) });
});
export default router;
