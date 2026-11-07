import { activeTrainingGroup } from "../lib/joint-training-program";
import { splitPublicNotesAndPlan } from "../lib/match-plan-notes";
import { listTrainingTrials, trainingTrialsForSession, trialIncludesDate, TRAINING_TRIAL_STATUS } from "../lib/training-trials";
import { resolveAllowedClubSections } from "../lib/club-scope";
import { rosterMembers } from "../lib/training-roster-policy";
import { assignedTrainingProgram } from "../lib/training-program-access";
import { sessionTeamScope } from "../lib/session-team-scope";
import { buildMatchRotationSummary, defaultRotationCapacity, parentPlayedMinutes, sessionTeamIds, trainingLocalDate } from "@workspace/api-zod";
import { saveAttendanceAndNotify } from "../lib/attendance-notifications";
import { trainingAvailability } from "../lib/training-availability";
import { Router, type IRouter } from "express";
import { db, seasonsTable, clubMembershipsTable, matchesTable, callUpsTable, trainingAttendancesTable, playersTable, teamStaffAssignmentsTable, teamsTable, trainingSessionsTable } from "@workspace/db";
import { eq, and, inArray, isNull, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const ATTENDANCE_MANAGE_ALL_ROLES = ["admin", "presidente", "director", "sporting_director", "technical_director"];
const ATTENDANCE_TEAM_ROLES = ["coach", "fitness_coach", "athletic_director"];
type RegisterGame = { called: boolean | null; minutes: number | null; plannedMinutes: number | null };
type PlayerAvailabilityOverrideFields = {
  availabilityOverrideActive?: boolean | null;
  availabilityOverrideFrom?: string | null;
  availabilityOverrideUntil?: string | null;
};
const PLAYER_META_MARKER = "[FTB_PLAYER_META]";

function extractSupplementalTeamId(notes?: string | null): number | null {
  const full = String(notes ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return null;
  const metaStart = PLAYER_META_MARKER.length;
  const nextNewLineIdx = full.indexOf("\n");
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(metaStart, nextNewLineIdx).trim()
    : full.slice(metaStart).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as { supplementalTeamId?: unknown };
    const id = Number(parsed?.supplementalTeamId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function getSessionForAttendance(sessionId: number, clubId: number) {
  const [session] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, sessionId), eq(trainingSessionsTable.clubId, clubId)))
    .limit(1);
  return session ?? null;
}

async function userCanManageAttendanceForSession(userId: number, clubId: number, role: string, sessionId: number): Promise<boolean> {
  if (ATTENDANCE_MANAGE_ALL_ROLES.includes(role)) return true;
  if (!ATTENDANCE_TEAM_ROLES.includes(role)) return false;
  const session = await getSessionForAttendance(sessionId, clubId);
  if (!session?.teamId) return false;
  if(await assignedTrainingProgram(clubId,userId,session))return true;

  const [assignment] = await db
    .select({ id: teamStaffAssignmentsTable.id })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.clubId, clubId),
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.teamId, session.teamId),
    ))
    .limit(1);
  if (assignment) return true;

  const [team] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, session.teamId), eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)))
    .limit(1);
  return !!team;
}

async function userCanReadAttendance(userId: number, clubId: number, role: string, sessionId: number) {
  if (role === "secretary") return Boolean(await getSessionForAttendance(sessionId, clubId));
  return userCanManageAttendanceForSession(userId, clubId, role, sessionId);
}

async function playerIsValidForSession(playerId: number, clubId: number, sessionId: number): Promise<boolean> {
  const session = await getSessionForAttendance(sessionId, clubId);
  if (!session) return false;
  const [player] = await db
    .select({ id: playersTable.id, teamId: playersTable.teamId, notes: playersTable.notes, status: playersTable.status })
    .from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)))
    .limit(1);
  if (!player) return false;
  if (player.status === TRAINING_TRIAL_STATUS) {
    return (await trainingTrialsForSession(session)).some(trial => trial.playerId === playerId);
  }
  if (!session.teamId) return true;
  const ids=sessionTeamIds(session.teamId,session.notes);
  return ids.includes(player.teamId??0) || ids.includes(extractSupplementalTeamId(player.notes)??0);
}

function playerHasActiveAvailabilityOverride(player: typeof playersTable.$inferSelect): boolean {
  const availabilityOverride = player as typeof player & PlayerAvailabilityOverrideFields;
  if (availabilityOverride.availabilityOverrideActive !== true) return false;
  const today = new Date().toISOString().slice(0, 10);
  const from = String(availabilityOverride.availabilityOverrideFrom ?? "");
  const until = String(availabilityOverride.availabilityOverrideUntil ?? "");
  if (!until) return false;
  if (from && from > today) return false;
  if (until < today) return false;
  return true;
}

async function playerCanAttend(playerId: number, clubId: number): Promise<{ ok: boolean; reason?: string | null }> {
  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)))
    .limit(1);
  if (!player) return { ok: false, reason: "Giocatore non trovato" };
  if (player.available !== false) return { ok: true };
  if (playerHasActiveAvailabilityOverride(player)) return { ok: true };
  return { ok: false, reason: player.unavailabilityReason ?? "non_disponibile" };
}

router.get("/training-availability", requireAuth, async (req,res):Promise<void>=>{
  const clubId=req.session.clubId!, teamId=Number(req.query.teamId);
  const date=String(req.query.date??""),start=String(req.query.start??"");
  const duration=req.query.duration===undefined?undefined:Number(req.query.duration);
  if(duration!==undefined&&(!Number.isInteger(duration)||duration<15||duration>300)){res.status(400).json({error:"Durata seduta non valida"});return;}
  if(!Number.isInteger(teamId)||teamId<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!Number.isFinite(Date.parse(date))){res.status(400).json({error:"Squadra, data e orario richiesti"});return;}
  const [team]=await db.select({id:teamsTable.id,coachId:teamsTable.coachId}).from(teamsTable).where(and(eq(teamsTable.clubId,clubId),eq(teamsTable.id,teamId))).limit(1);
  if(!team){res.status(403).json({error:"Squadra non autorizzata"});return;}
  const canReadAll = req.session.role === "secretary" || ATTENDANCE_MANAGE_ALL_ROLES.includes(req.session.role ?? "");
  let allowed = canReadAll;
  if(!allowed&&ATTENDANCE_TEAM_ROLES.includes(req.session.role??"")){
    const [assignment]=await db.select({id:teamStaffAssignmentsTable.id}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.teamId,teamId),eq(teamStaffAssignmentsTable.userId,req.session.userId!))).limit(1);
    allowed=Boolean(assignment)||team.coachId===req.session.userId;
  }
  const programSessions=await db.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),eq(trainingSessionsTable.teamId,teamId),sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date=${date}::date`,sql`to_char(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome','HH24:MI')=${start}`,sql`${trainingSessionsTable.status} NOT IN ('cancelled','canceled')`));
  const programIds:number[]=[];
  if(ATTENDANCE_TEAM_ROLES.includes(req.session.role??""))for(const session of programSessions)if(await assignedTrainingProgram(clubId,req.session.userId!,session)){allowed=true;programIds.push(...sessionTeamIds(session.teamId,session.notes));}
  if(!allowed){res.status(403).json({error:"Squadra non autorizzata"});return;}
  const clubTeams=await db.select({id:teamsTable.id,coachId:teamsTable.coachId}).from(teamsTable).where(eq(teamsTable.clubId,clubId));
  const assignments=await db.select({teamId:teamStaffAssignmentsTable.teamId}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.userId,req.session.userId!)));
  const allowedTeamIds=canReadAll?clubTeams.map(t=>t.id):clubTeams.filter(t=>t.coachId===req.session.userId||assignments.some(a=>a.teamId===t.id)).map(t=>t.id).concat(programIds);
  const requested=String(req.query.teamIds??teamId).split(",").map(Number);
  if(requested.length>20||requested.some(id=>!Number.isInteger(id)||!allowedTeamIds.includes(id))){res.status(403).json({error:"Annate non autorizzate"});return;}
  const { records, available, unavailable, pending, total, beforeAppello } = await trainingAvailability(clubId, teamId, date, start, allowedTeamIds, requested, duration);
  res.json({ records, available, unavailable, pending, total, beforeAppello });
});

router.get("/attendance-register", requireAuth, async (req, res) => {
  const { clubId, userId, role, parentPlayerId } = req.session;
  const clubReader = role === "secretary" || ATTENDANCE_MANAGE_ALL_ROLES.includes(role ?? "");
  const parent = role === "parent";
  if (!clubId || userId === undefined || (!clubReader && !parent && role !== "team_manager" && !ATTENDANCE_TEAM_ROLES.includes(role ?? ""))) {
    res.sendStatus(403);
    return;
  }
  const requestedSection = typeof req.query.section === "string" ? req.query.section : undefined;
  const section = String(req.session.section || requestedSection || "").replace(/-/g, "_");
  const allowedSections = parent || role === "team_manager" ? undefined : await resolveAllowedClubSections(req, requestedSection);
  const clubTeams = await db.select().from(teamsTable).where(eq(teamsTable.clubId, clubId));
  const assignments: { teamId: number }[] = parent || clubReader ? [] :
    await db.select({ teamId: teamStaffAssignmentsTable.teamId }).from(teamStaffAssignmentsTable)
      .where(and(eq(teamStaffAssignmentsTable.clubId, clubId), eq(teamStaffAssignmentsTable.userId, userId)));
  const rosterFields = {
    id: playersTable.id,
    teamId: playersTable.teamId,
    firstName: playersTable.firstName,
    lastName: playersTable.lastName,
    notes: playersTable.notes,
  };
  const own = parent && parentPlayerId
    ? await db.select(rosterFields).from(playersTable).where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)))
    : [];
  const ownTeamId: number | null | undefined = own.at(0)?.teamId;
  const membership = role === "team_manager" ? (await db.select().from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId, clubId), eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.role, role))))[0] : null;
  const teams = clubTeams.filter(team => {
    if (parent) return team.id === ownTeamId;
    if (role === "team_manager" && section && section !== team.clubSection) return false;
    if (allowedSections && !allowedSections.includes(team.clubSection)) return false;
    const assigned = assignments.some(item => item.teamId === team.id);
    if (role === "team_manager") return assigned && Boolean(membership?.clubSection.some(value => value.replace(/-/g, "_") === team.clubSection));
    return clubReader || assigned || team.coachId === userId;
  });
  const team = req.query.teamId === undefined ? teams[0] : teams.find(item => item.id === Number(req.query.teamId));
  if (!team && req.query.teamId !== undefined) {
    res.sendStatus(403);
    return;
  }
  const options = teams.map(({ id, name }) => ({ id, name }));
  if (!team) {
    res.json({ teams: options, teamId: null, sessions: [], matches: [], players: [] });
    return;
  }

  const today = trainingLocalDate();
  const [season] = team.seasonId ? await db.select().from(seasonsTable).where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.id, team.seasonId))) :
    await db.select().from(seasonsTable).where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.isActive, true))).limit(1);
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  const start = season?.startDate ?? team.seasonTrainingStartDate ?? `${year}-07-01`;
  const end = season?.endDate ?? `${year + 1}-06-30`;
  const through = today < end ? today : end;
  const sectionTeams = clubTeams.filter(candidate => candidate.clubSection === team.clubSection && candidate.seasonId === team.seasonId);
  const sectionTeamIds = sectionTeams.map(candidate => candidate.id);
  const activeRosterTeams = activeTrainingGroup(sectionTeams, team, through);
  const [sessionRows, roster] = await Promise.all([
    db.select({ id: trainingSessionsTable.id, teamId: trainingSessionsTable.teamId, scheduledAt: trainingSessionsTable.scheduledAt,
      title: trainingSessionsTable.title, notes: trainingSessionsTable.notes }).from(trainingSessionsTable).where(and(
      eq(trainingSessionsTable.clubId, clubId), or(isNull(trainingSessionsTable.teamId), inArray(trainingSessionsTable.teamId, sectionTeamIds)),
      sessionTeamScope(team.id),
      sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date BETWEEN ${start}::date AND ${end}::date`,
      sql`${trainingSessionsTable.status} NOT IN ('cancelled','canceled')`,
      sql`${trainingSessionsTable.notes} IS DISTINCT FROM '[FTB_AUTO_TRAINING] GROUPED'`)),
    parent ? Promise.resolve(own) : db.select(rosterFields).from(playersTable).where(eq(playersTable.clubId, clubId)),
  ]);
  const sessions = sessionRows.map(session => ({
    id: session.id, date: session.scheduledAt.toISOString(), title: session.title,
    teamIds: sessionTeamIds(session.teamId, session.notes).filter(id => sectionTeamIds.includes(id)),
  }));
  const rosterTeams = [...new Set([...activeRosterTeams, ...sessions.flatMap(session => session.teamIds)])];
  const rosterIds = new Set(rosterMembers(roster, rosterTeams).map(player => player.id));
  const [records, trials] = await Promise.all([
    sessions.length ? db.select({ sessionId: trainingAttendancesTable.trainingSessionId, playerId: trainingAttendancesTable.playerId,
      status: trainingAttendancesTable.status }).from(trainingAttendancesTable).where(and(eq(trainingAttendancesTable.clubId, clubId),
      inArray(trainingAttendancesTable.trainingSessionId, sessions.map(session => session.id)),
      parent ? eq(trainingAttendancesTable.playerId, own[0].id) : undefined)) : [],
    parent ? [] : listTrainingTrials(clubId, rosterTeams),
  ]);
  const recordMap = new Map(records.map(record => [`${record.sessionId}:${record.playerId}`, record.status]));
  const membersBySession = new Map(sessions.map(session => {
    const members = new Set(rosterMembers(roster, session.teamIds).map(player => player.id));
    const date = trainingLocalDate(new Date(session.date));
    for (const trial of trials) {
      if (session.teamIds.includes(trial.teamId) && trialIncludesDate(trial, date)) {
        members.add(trial.playerId);
        rosterIds.add(trial.playerId);
      }
    }
    return [session.id, members];
  }));
  const recordedIds = new Set(records.map(record => record.playerId));
  const scopedPlayers = roster.filter(player => rosterIds.has(player.id) || recordedIds.has(player.id));
  const scopedIds = new Set(scopedPlayers.map(player => player.id));
  const otherTeams = role === "team_manager" ? [] : (parent ? sectionTeams : teams)
    .filter(candidate => candidate.id !== team.id && sectionTeamIds.includes(candidate.id)).map(candidate => candidate.id);
  const confirmedCallup = sql`lower(${callUpsTable.status}) NOT IN ('available','unavailable','availability','absent','declined','not_called')`;
  // Joint training grants attendance access. Only an authorized match and a saved callup grant extra match visibility.
  const matchRows = await db.select({ id: matchesTable.id, teamId: matchesTable.teamId, opponent: matchesTable.opponent,
    date: matchesTable.date, rescheduleDate: matchesTable.rescheduleDate, matchPlan: matchesTable.matchPlan, notes: matchesTable.notes,
  }).from(matchesTable).where(and(eq(matchesTable.clubId, clubId),
    or(eq(matchesTable.teamId, team.id), otherTeams.length && scopedIds.size ? and(inArray(matchesTable.teamId, otherTeams),
      sql`EXISTS (SELECT 1 FROM ${callUpsTable} WHERE ${callUpsTable.matchId} = ${matchesTable.id}
        AND ${inArray(callUpsTable.playerId, [...scopedIds])} AND ${confirmedCallup})`) : undefined),
    sql`(${matchesTable.seasonId} IS NULL OR ${matchesTable.seasonId} = ${season?.id ?? team.seasonId})`,
    sql`(${matchesTable.isPostponed} IS NOT TRUE OR (${matchesTable.rescheduleTbd} IS NOT TRUE AND ${matchesTable.rescheduleDate} IS NOT NULL))`,
    sql`(COALESCE(${matchesTable.rescheduleDate}, ${matchesTable.date}) AT TIME ZONE 'Europe/Rome')::date BETWEEN ${start}::date AND ${end}::date`));
  const savedCallups = matchRows.length ? await db.select({ matchId: callUpsTable.matchId, id: playersTable.id,
    firstName: playersTable.firstName, lastName: playersTable.lastName }).from(callUpsTable)
    .innerJoin(playersTable, and(eq(playersTable.id, callUpsTable.playerId), eq(playersTable.clubId, clubId)))
    .where(and(inArray(callUpsTable.matchId, matchRows.map(match => match.id)), confirmedCallup)) : [];
  const callupsByMatch = new Map<number, Map<number, (typeof savedCallups)[number]>>();
  for (const callup of savedCallups) {
    const callups = callupsByMatch.get(callup.matchId) ?? new Map();
    callups.set(callup.id, callup);
    callupsByMatch.set(callup.matchId, callups);
  }
  const gamePlayers = new Set<number>();
  const matchStats = matchRows.map(match => {
    const other = match.teamId !== team.id;
    const matchTeam = sectionTeams.find(candidate => candidate.id === match.teamId);
    const saved = callupsByMatch.get(match.id);
    const called = [...(saved?.values() ?? [])].filter(player => parent ? player.id === own[0].id : !other || scopedIds.has(player.id));
    const plan = match.matchPlan ?? splitPublicNotesAndPlan(match.notes).plan;
    const rotation = buildMatchRotationSummary(plan, called, defaultRotationCapacity(matchTeam?.name, matchTeam?.category, matchTeam?.clubSection));
    const stats = new Map(rotation.rows.map(row => {
      gamePlayers.add(row.playerId);
      return [row.playerId, { called: true,
        plannedMinutes: row.cells.some(cell => cell.status !== "—") ? row.plannedMinutes : null,
        minutes: parentPlayedMinutes(plan, row.playerId),
      }];
    }));
    return { id: match.id, date: (match.rescheduleDate ?? match.date).toISOString(), title: match.opponent,
      team: matchTeam?.name, other, published: !!saved?.size, stats };
  });
  const eligible = roster.filter(player => scopedIds.has(player.id) || gamePlayers.has(player.id));
  res.json({
    teams: options, activeRosterTeams, teamId: team.id, start, through, today,
    canEdit: !parent && role !== "secretary" && role !== "team_manager" && role !== "technical_director",
    sessions: sessions.map(({ teamIds, ...session }) => ({ ...session, shared: teamIds.length > 1 })),
    matches: matchStats.map(({ id, date, title, team }) => ({ id, date, title, team })),
    players: eligible.map(player => ({
      id: player.id,
      name: `${player.lastName} ${player.firstName}`,
      teamId: player.teamId,
      team: clubTeams.find(item => item.id === player.teamId)?.name ?? team.name,
      attendance: Object.fromEntries(sessions.flatMap(session => {
        const status = recordMap.get(`${session.id}:${player.id}`);
        return status || membersBySession.get(session.id)?.has(player.id) ? [[session.id, status ?? null]] : [];
      })),
      games: Object.fromEntries(matchStats.flatMap<[number, RegisterGame]>(match => {
        const stats = match.stats.get(player.id);
        if (stats) return [[match.id, stats]];
        if (match.other || player.teamId !== team.id) return [];
        return [[match.id, { called: match.published ? false : null, minutes: null, plannedMinutes: null }]];
      })),
    })).sort((a, b) => a.name.localeCompare(b.name, "it")),
  });
});

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : null;
  if (!sessionId || isNaN(sessionId)) { res.status(400).json({ error: "sessionId required" }); return; }
  if (!(await userCanReadAttendance(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
    res.status(403).json({ error: "Non autorizzato a visualizzare presenze di questa seduta" });
    return;
  }
  const records = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.trainingSessionId, sessionId), eq(trainingAttendancesTable.clubId, req.session.clubId!)));
  const enriched = await Promise.all(records.map(async (r) => {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, r.playerId), eq(playersTable.clubId, req.session.clubId!)));
    return { ...r, playerName: player ? `${player.firstName} ${player.lastName}` : null, notes: r.notes ?? null };
  }));
  res.json(enriched);
});

router.get("/attendance-roster/:id/guests", requireAuth, async (req, res): Promise<void> => {
  const { userId, clubId, role } = req.session;
  const id = Number(req.params.id);
  if (!clubId || !userId || !Number.isSafeInteger(id) || id <= 0 ||
      !await userCanReadAttendance(userId, clubId, role ?? "", id)) {
    res.sendStatus(403);
    return;
  }
  const session = await getSessionForAttendance(id, clubId);
  const guests = session ? await trainingTrialsForSession(session) : [];
  res.json(guests.map(({ playerId, firstName, lastName, teamId }) => ({
    id: playerId, firstName, lastName, teamId,
    status: TRAINING_TRIAL_STATUS, teamName: "Ospite in prova", available: true,
  })));
});

router.get("/attendance-summary", requireAuth, async (req, res): Promise<void> => {
  const rawIds = String(req.query.sessionIds ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const sessionIds = Array.from(new Set(rawIds)).slice(0, 80);
  if (sessionIds.length === 0) {
    res.json({});
    return;
  }

  const summaries: Record<number, { present: number; absent: number; requested: number; injured: number; total: number; recorded: number; percentage: number }> = {};
  for (const sessionId of sessionIds) {
    if (!(await userCanReadAttendance(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
      continue;
    }
    const session = await getSessionForAttendance(sessionId, req.session.clubId!);
    if (!session) continue;

    const players = await db
      .select({ id: playersTable.id, teamId: playersTable.teamId, notes: playersTable.notes, status: playersTable.status })
      .from(playersTable)
      .where(eq(playersTable.clubId, req.session.clubId!));
    const total = session.teamId
      ? players.filter((player) => sessionTeamIds(session.teamId,session.notes).includes(player.teamId??0) || sessionTeamIds(session.teamId,session.notes).includes(extractSupplementalTeamId(player.notes)??0)).length
      + (await trainingTrialsForSession(session)).length
      : players.filter(player => player.status !== TRAINING_TRIAL_STATUS).length;

    const records = await db
      .select({ status: trainingAttendancesTable.status })
      .from(trainingAttendancesTable)
      .where(and(eq(trainingAttendancesTable.trainingSessionId, sessionId), eq(trainingAttendancesTable.clubId, req.session.clubId!)));
    const present = records.filter((record) => record.status === "present").length;
    const absent = records.filter((record) => record.status === "absent").length;
    const requested = records.filter((record) => record.status === "requested").length;
    const injured = records.filter((record) => record.status === "injured").length;
    const recorded = present + absent + requested + injured;
    const denominator = total || recorded;
    const percentage = denominator > 0 ? Math.round((present / denominator) * 100) : 0;
    summaries[sessionId] = { present, absent, requested, injured, total, recorded, percentage };
  }

  res.json(summaries);
});

router.post("/attendance", requireAuth, async (req, res): Promise<void> => {
  const { trainingSessionId, playerId, status, notes } = req.body;
  if (!trainingSessionId || !playerId) { res.status(400).json({ error: "trainingSessionId and playerId required" }); return; }
  const sessionId = Number(trainingSessionId);
  const playerNumericId = Number(playerId);
  if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
    res.status(403).json({ error: "Non autorizzato a modificare presenze di questa seduta" });
    return;
  }
  if (!(await playerIsValidForSession(playerNumericId, req.session.clubId!, sessionId))) {
    res.status(400).json({ error: "Giocatore non valido per questa seduta" });
    return;
  }
  const nextStatus = status ?? "present";
  if(!["present","absent","requested","injured"].includes(nextStatus)){res.status(400).json({error:"Stato appello non valido"});return;}
  if (nextStatus !== "absent") {
    const availability = await playerCanAttend(playerNumericId, req.session.clubId!);
    if (!availability.ok) {
      res.status(400).json({ error: "Giocatore non disponibile per questa seduta", reason: availability.reason });
      return;
    }
  }
  const saved=await saveAttendanceAndNotify({clubId:req.session.clubId!,sessionId,playerId:playerNumericId,status:nextStatus,notes:notes??null});
  res.status(saved?.created?201:200).json(saved?.record);

});

router.patch("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, notes } = req.body;
  if(status!==undefined&&!["present","absent","requested","injured"].includes(status)){res.status(400).json({error:"Stato appello non valido"});return;}
  const [existing] = await db
    .select()
    .from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.id, id), eq(trainingAttendancesTable.clubId, req.session.clubId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", existing.trainingSessionId))) {
    res.status(403).json({ error: "Non autorizzato a modificare presenze di questa seduta" });
    return;
  }
  const saved=await saveAttendanceAndNotify({id,clubId:req.session.clubId!,sessionId:existing.trainingSessionId,playerId:existing.playerId,status,notes});
  if(!saved){res.status(404).json({error:"Not found"});return;}
  res.json(saved.record);
});

export default router;
