import { validateTrainingRotations, type TrainingRotations } from "@workspace/api-zod";
import { rosterMembers } from "../lib/training-roster-policy";
import { recalculateRotationPlan, planningVersion, rotationTimings } from "../lib/training-session-planning";
import { sessionTeamScope, sessionTeamIds, consolidateSharedDrafts } from "../lib/session-team-scope";
import { ensureTrainingSuppressions, sameTrainingMinute, trainingDeletionSummary } from "../lib/training-session-integrity";
import { readSessionPlan, ensureSessionPlans, resultRows, recalculatePlan, timingSignature, type PlanningExercise } from "../lib/training-session-planning";
import { AUTO_TRAINING_MARKER } from "../lib/automatic-training-drafts";
import { Router, type IRouter } from "express";
import { db, trainingSessionsTable, trainingDirectivesTable, teamsTable, teamStaffAssignmentsTable, playersTable, usersTable, clubMembershipsTable } from "@workspace/db";
import { eq, and, gte, desc, inArray, sql, or } from "drizzle-orm";
import {
  ListTrainingSessionsResponse,
  ListTrainingSessionsQueryParams,
  CreateTrainingSessionBody,
  GetTrainingSessionResponse,
  GetTrainingSessionParams,
  UpdateTrainingSessionParams,
  UpdateTrainingSessionBody,
  UpdateTrainingSessionResponse,
  DeleteTrainingSessionParams,
  GetDashboardStatsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { canViewAllClubTrainingSessions, isClubWideListRole, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { requireClubAndUserIds } from "../lib/session-context";

/** Per le statistiche dashboard: solo chi è vincolato alle squadre assegnate (non il direttore tecnico). */
const DASHBOARD_ASSIGNMENT_SCOPED_NORM = new Set(["coach", "fitness_coach", "athletic_director"]);
const CAN_CREATE_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director", "secretary"];
const STAFF_RESTRICTED_ROLES = ["coach", "fitness_coach", "athletic_director"];
const router: IRouter = Router();

function staffRoleForSection(raw: string | null | undefined, section: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { bySection?: Record<string, string> };
    if (parsed?.bySection && typeof parsed.bySection === "object") {
      if (section && parsed.bySection[section]) return parsed.bySection[section];
      return Object.values(parsed.bySection)[0] ?? null;
    }
  } catch {
    return raw;
  }
  return raw;
}

async function getAssignedTeamIds(clubId: number, userId: number): Promise<number[]> {
  const assignedRows = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(eq(teamStaffAssignmentsTable.userId, userId), eq(teamStaffAssignmentsTable.clubId, clubId)));
  const coachedRows = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)));
  return [...new Set([...assignedRows.map((r) => r.teamId), ...coachedRows.map((r) => r.id)])];
}

async function getPrimaryCoachTeamIds(clubId: number, userId: number): Promise<number[]> {
  const coachedRows = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)));

  const [membership] = await db
    .select({ role: clubMembershipsTable.role, staffRole: clubMembershipsTable.staffRole })
    .from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId, clubId), eq(clubMembershipsTable.userId, userId)));

  if (membership?.role !== "coach") return coachedRows.map((team) => team.id);

  const assignedTeamIds = await getAssignedTeamIds(clubId, userId);
  if (assignedTeamIds.length === 0) return coachedRows.map((team) => team.id);

  const assignedTeams = await db
    .select({ id: teamsTable.id, clubSection: teamsTable.clubSection })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), inArray(teamsTable.id, assignedTeamIds)));

  const primaryByRole = assignedTeams
    .filter((team) => staffRoleForSection(membership.staffRole, team.clubSection) === "primo_allenatore")
    .map((team) => team.id);

  return [...new Set([...coachedRows.map((team) => team.id), ...primaryByRole])];
}

async function canAccessTeamForRestrictedRole(clubId: number, userId: number, teamId: number | null): Promise<boolean> {
  if (!teamId) return true;
  const assignedTeamIds = await getAssignedTeamIds(clubId, userId);
  return assignedTeamIds.includes(teamId);
}

async function canManageSession(
  session: typeof trainingSessionsTable.$inferSelect,
  clubId: number,
  userId: number,
  role: string,
): Promise<boolean> {
  if (["secretary", "technical_director"].includes(role)) return true;
  if (session.createdByUserId === userId) return true;
  if (!STAFF_RESTRICTED_ROLES.includes(role) || !session.teamId) return false;
  if(session.notes?.startsWith(AUTO_TRAINING_MARKER)&&await canAccessTeamForRestrictedRole(clubId,userId,session.teamId))return true;
  const primaryCoachTeamIds = await getPrimaryCoachTeamIds(clubId, userId);
  return primaryCoachTeamIds.includes(session.teamId);
}

async function validSessionTeams(req: import("express").Request,teamId:number|null,notes:string|null|undefined,previous?:string|null) {
 const ids=sessionTeamIds(teamId,notes);if(ids.length<2)return true;
 const clubId=req.session.clubId!,role=normalizeSessionRole(req.session.role);
 const teams=await db.select().from(teamsTable).where(and(eq(teamsTable.clubId,clubId),inArray(teamsTable.id,ids)));
 const sections=await resolveAllowedClubSections(req,undefined);
 if(teams.length!==ids.length||teams.some(t=>sections&&!sections.includes(t.clubSection))||new Set(teams.map(t=>t.clubSection)).size!==1||new Set(teams.map(t=>t.seasonId)).size!==1)return false;
 if(STAFF_RESTRICTED_ROLES.includes(role)){const assigned=await getAssignedTeamIds(clubId,req.session.userId!);if(ids.some(id=>!assigned.includes(id)))return false;}
 if(previous&&JSON.stringify(sessionTeamIds(teamId,previous).sort())===JSON.stringify([...ids].sort()))return true;
 const exists=resultRows<{present:boolean}>(await db.execute(sql`SELECT to_regclass('training_roster_groups') IS NOT NULL AND to_regclass('training_roster_group_teams') IS NOT NULL AS present`))[0]?.present;
 if(!exists)return false;
 const groups=resultRows<{ids:number[]}>(await db.execute(sql`SELECT array_agg(l.team_id ORDER BY l.team_id) AS ids FROM training_roster_groups g JOIN training_roster_group_teams l ON l.group_id=g.id WHERE g.club_id=${clubId} AND g.kind='shared' AND NOT g.archived GROUP BY g.id`));
 return groups.some(g=>g.ids.length===ids.length&&g.ids.every(id=>ids.includes(id)));
}

async function enrichSession(
  session: typeof trainingSessionsTable.$inferSelect,
  viewer?: { clubId: number; userId: number; role: string },
  lookup?: {teams:Map<number,string>;creators:Map<number,string>;canEdit:(session:typeof trainingSessionsTable.$inferSelect)=>boolean},
) {
  let teamName: string | null = lookup?.teams.get(session.teamId??0)??null;
  if (!lookup && session.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, session.teamId), eq(teamsTable.clubId, session.clubId)));
    if (team) teamName = team.name;
  }
  let creatorName: string | null = lookup?.creators.get(session.createdByUserId??0)??null;
  if (!lookup && session.createdByUserId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.createdByUserId));
    if (user) creatorName = `${user.firstName} ${user.lastName}`;
  }
  const canEdit = lookup?lookup.canEdit(session):viewer ? await canManageSession(session, viewer.clubId, viewer.userId, viewer.role) : undefined;
  return {
    ...session,
    teamId: session.teamId ?? null,
    teamName,
    creatorName,
    description: session.description ?? null,
    durationMinutes: session.durationMinutes ?? null,
    location: session.location ?? null,
    objectives: session.objectives ?? null,
    notes: session.notes ?? null,
    sentToUserIds: (session.sentToUserIds as number[] | null) ?? null,
    tdComment: session.tdComment ?? null,
    tdGuidelines: session.tdGuidelines ?? null,
    canEdit,
  };
}

// GET all training sessions (role-filtered)
function preparationSummaries(rows: { sessionId: number; phase: string | null; title: string | null }[]) {
  const summaries = new Map<number, { exerciseCount: number; phases: string[]; complete: boolean }>();
  for (const row of rows) {
    const value = summaries.get(row.sessionId) ?? { exerciseCount: 0, phases: [], complete: false };
    value.exerciseCount++;
    const phase = String(row.phase ?? "").trim().toLowerCase();
    if (row.title?.trim() && ["iniziale", "centrale", "finale"].includes(phase) && !value.phases.includes(phase)) value.phases.push(phase);
    value.complete = ["iniziale", "centrale", "finale"].every(phase => value.phases.includes(phase));
    summaries.set(row.sessionId, value);
  }
  return summaries;
}

router.get("/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const ids = requireClubAndUserIds(req);
  if (!ids) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  const { clubId, userId } = ids;
  const role = req.session.role ?? "";

  const requestedSection = req.query.section;
  if (requestedSection !== undefined && (typeof requestedSection !== "string" || !["scuola_calcio", "settore_giovanile", "prima_squadra"].includes(requestedSection))) {
    res.status(400).json({ error: "Settore non valido" });
    return;
  }
  // Explicit section narrows existing permissions; unscoped consumers keep their current behavior.
  const allowedSections = requestedSection ? await resolveAllowedClubSections(req, requestedSection) : undefined;
  const sectionTeams = allowedSections?.length
    ? await db.select({ id: teamsTable.id }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), inArray(teamsTable.clubSection, allowedSections)))
    : [];
  const sectionScope = requestedSection
    ? sectionTeams.length ? inArray(trainingSessionsTable.teamId, sectionTeams.map(team => team.id)) : sql`false`
    : undefined;

  const queryParams = ListTrainingSessionsQueryParams.safeParse(req.query);
  let sessions: (typeof trainingSessionsTable.$inferSelect)[] = [];

  if (canViewAllClubTrainingSessions(role)) {
    let conditions: ReturnType<typeof eq>[] = [eq(trainingSessionsTable.clubId, clubId) as any];
    if (queryParams.success && queryParams.data.teamId) {
      conditions.push(sessionTeamScope(queryParams.data.teamId) as any);
    }
    if (sectionScope) conditions.push(sectionScope as any);
    if (!requestedSection && req.session.section && !isClubWideListRole(role)) {
      const sTeams = await db.select({ id: teamsTable.id }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.clubSection, req.session.section)));
      const ids = sTeams.map(t => t.id);
      conditions.push((ids.length > 0 ? inArray(trainingSessionsTable.teamId, ids) : sql`false`) as any);
    }
    sessions = await db
      .select()
      .from(trainingSessionsTable)
      .where(and(...conditions))
      .orderBy(desc(trainingSessionsTable.scheduledAt));
  } else {
    // coach, fitness_coach, athletic_director: sessions for assigned teams/annate
    // (plus own sessions and tipo sessions addressed to them)
    const assignedTeamIds = await getAssignedTeamIds(clubId, userId);
    const teamScope =
      assignedTeamIds.length > 0
        ? or(inArray(trainingSessionsTable.teamId, assignedTeamIds), sql`${trainingSessionsTable.teamId} is null`)
        : sql`${trainingSessionsTable.teamId} is null`;
    const primaryCoachTeamIds = await getPrimaryCoachTeamIds(clubId, userId);
    const collaboratorScope =
      primaryCoachTeamIds.length > 0
        ? inArray(trainingSessionsTable.teamId, primaryCoachTeamIds)
        : sql`false`;
    const assignedSessionsScope =
      assignedTeamIds.length > 0
        ? inArray(trainingSessionsTable.teamId, assignedTeamIds)
        : sql`false`;
    sessions = await db
      .select()
      .from(trainingSessionsTable)
      .where(
        and(
          eq(trainingSessionsTable.clubId, clubId),
          sectionScope,
          teamScope as any,
          or(
            assignedSessionsScope as any,
            eq(trainingSessionsTable.createdByUserId, userId),
            collaboratorScope as any,
            and(
              eq(trainingSessionsTable.sessionKind, "tipo"),
              sql`${trainingSessionsTable.sentToUserIds}::jsonb @> ${JSON.stringify([userId])}::jsonb`
            )
          )
        )
      )
      .orderBy(desc(trainingSessionsTable.scheduledAt));
  }

  sessions=sessions.filter(session=>session.notes!==AUTO_TRAINING_MARKER+" GROUPED");
  const [teamRows,creatorRows,primaryIds,assignedIds]=await Promise.all([
    db.select({id:teamsTable.id,name:teamsTable.name}).from(teamsTable).where(and(eq(teamsTable.clubId,clubId),inArray(teamsTable.id,[...new Set(sessions.flatMap(session=>session.teamId?[session.teamId]:[]))]))),
    db.select({id:usersTable.id,firstName:usersTable.firstName,lastName:usersTable.lastName}).from(usersTable).where(inArray(usersTable.id,[...new Set(sessions.flatMap(session=>session.createdByUserId?[session.createdByUserId]:[]))])),
    STAFF_RESTRICTED_ROLES.includes(role)?getPrimaryCoachTeamIds(clubId,userId):Promise.resolve([] as number[]),
    STAFF_RESTRICTED_ROLES.includes(role)?getAssignedTeamIds(clubId,userId):Promise.resolve([] as number[]),
  ]);
  const lookup={teams:new Map(teamRows.map(team=>[team.id,team.name])),creators:new Map(creatorRows.map(user=>[user.id,`${user.firstName} ${user.lastName}`])),canEdit:(session:typeof trainingSessionsTable.$inferSelect)=>["secretary","technical_director"].includes(role)||session.createdByUserId===userId||Boolean(STAFF_RESTRICTED_ROLES.includes(role)&&session.teamId&&(primaryIds.includes(session.teamId)||(session.notes?.startsWith(AUTO_TRAINING_MARKER)&&assignedIds.includes(session.teamId))))};
  const enriched = await Promise.all(sessions.map((session) => enrichSession(session, { clubId, userId, role },lookup)));
  if (req.query.includePreparation === "1" && sessions.length > 0) {
    const result = await db.execute(sql`
      SELECT link.training_session_id AS "sessionId", exercise.training_phase AS phase, exercise.title
      FROM training_session_exercises link
      LEFT JOIN exercises exercise ON exercise.id = link.exercise_id AND exercise.club_id = ${clubId}
      WHERE link.training_session_id IN (${sql.join(sessions.map(session => sql`${session.id}`), sql`, `)})
    `);
    const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []) as { sessionId: number; phase: string | null; title: string | null }[];
    const summaries = preparationSummaries(rows);
    res.json(enriched.map(session => ({ ...session, preparation: summaries.get(session.id) ?? { exerciseCount: 0, phases: [], complete: false } })));
    return;
  }
  res.json(enriched);
});

// POST new training session
router.post("/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const userId = req.session.userId!;

  if (!CAN_CREATE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non hai i permessi per creare sedute di allenamento" });
    return;
  }

  const parsed = CreateTrainingSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = req.body as {
    sessionKind?: string;
    sentToUserIds?: number[];
    teamId?: number | null;
    [key: string]: unknown;
  };

  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    const hasTeamAccess = await canAccessTeamForRestrictedRole(req.session.clubId!, userId, body.teamId ?? null);
    if (!hasTeamAccess) {
      res.status(403).json({ error: "Puoi creare sedute solo sulle annate assegnate" });
      return;
    }
  }

  if(!await validSessionTeams(req,body.teamId??null,parsed.data.notes)){res.status(403).json({error:"Unione di annate non autorizzata o non configurata"});return;}
  const [session] = await db.transaction(async tx=>{
    const values={...parsed.data,clubId:req.session.clubId!,createdByUserId:userId,sessionKind:body.sessionKind??"regular",sentToUserIds:body.sentToUserIds??null};
    if(values.sessionKind==="regular"&&!await consolidateSharedDrafts(tx,req.session.clubId!,null,sessionTeamIds(body.teamId,values.notes),parsed.data.scheduledAt,parsed.data.durationMinutes??90))return [];
    if(body.teamId&&values.sessionKind==="regular"){
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${req.session.clubId}|${body.teamId}`}))`);
      const slotRows=await tx.select({id:trainingSessionsTable.id}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,req.session.clubId!),eq(trainingSessionsTable.teamId,body.teamId),sameTrainingMinute(trainingSessionsTable.scheduledAt,parsed.data.scheduledAt),sql`${trainingSessionsTable.status} NOT IN ('cancelled','canceled')`,eq(trainingSessionsTable.sessionKind,"regular")));
      if(slotRows.length>1)return [];
      const [draft]=await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,req.session.clubId!),eq(trainingSessionsTable.teamId,body.teamId),sameTrainingMinute(trainingSessionsTable.scheduledAt,parsed.data.scheduledAt),eq(trainingSessionsTable.notes,AUTO_TRAINING_MARKER),eq(trainingSessionsTable.title,"Allenamento da preparare"),eq(trainingSessionsTable.status,"scheduled"),sql`${trainingSessionsTable.objectives} IS NULL`,sql`NOT EXISTS(SELECT 1 FROM training_session_exercises e WHERE e.training_session_id=${trainingSessionsTable.id})`,sql`NOT EXISTS(SELECT 1 FROM training_attendances a WHERE a.training_session_id=${trainingSessionsTable.id})`)).limit(1);
      if(draft)return tx.update(trainingSessionsTable).set({...values,notes:parsed.data.notes??draft.notes}).where(eq(trainingSessionsTable.id,draft.id)).returning();
      const [occupied]=await tx.select({id:trainingSessionsTable.id}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,req.session.clubId!),eq(trainingSessionsTable.teamId,body.teamId),sameTrainingMinute(trainingSessionsTable.scheduledAt,parsed.data.scheduledAt),sql`${trainingSessionsTable.status} NOT IN ('cancelled','canceled')`,eq(trainingSessionsTable.sessionKind,"regular"))).limit(1);
      if(occupied)return [];
    }
    return tx.insert(trainingSessionsTable).values(values).returning();
  });

  if(!session){res.status(409).json({error:"Esiste già una seduta per questa squadra, data e orario. Aprila per modificarla."});return;}
  const enriched = await enrichSession(session, { clubId: req.session.clubId!, userId, role });
  res.status(201).json(enriched);
});

// GET single training session
router.get("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const params = GetTrainingSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [session] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, req.session.clubId!)));

  if (!session) { res.status(404).json({ error: "Training session not found" }); return; }

  if (!canViewAllClubTrainingSessions(role)) {
    const hasTeamAccess = await canAccessTeamForRestrictedRole(req.session.clubId!, req.session.userId!, session.teamId ?? null);
    const sentToCurrentUser = Array.isArray(session.sentToUserIds) && session.sentToUserIds.includes(req.session.userId!);
    const canSeeSession =
      hasTeamAccess &&
      (session.createdByUserId === req.session.userId! ||
        await canManageSession(session, req.session.clubId!, req.session.userId!, role) ||
        (session.sessionKind === "tipo" && sentToCurrentUser));
    if (!canSeeSession) {
      res.status(403).json({ error: "La seduta non è assegnata al tuo profilo" });
      return;
    }
  }

  const enriched = await enrichSession(session, { clubId: req.session.clubId!, userId: req.session.userId!, role });
  res.json(enriched);
});

// PATCH training session
router.patch("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  if (role === "admin" || role === "presidente" || role === "director") {
    res.status(403).json({ error: "Non hai i permessi per modificare sedute" });
    return;
  }

  const params = UpdateTrainingSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, clubId)));

  if (!existing) { res.status(404).json({ error: "Training session not found" }); return; }

  const body = req.body as Record<string, unknown>;

  let updateData: Record<string, unknown> = {};

  if (role === "secretary") {
    const parsed = UpdateTrainingSessionBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    updateData = { ...parsed.data };
  } else if (role === "technical_director") {
    // TD can update comment/guidelines on any session, or edit their own sessions
    if (existing.createdByUserId === userId) {
      const parsed = UpdateTrainingSessionBody.safeParse(body);
      if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
      updateData = { ...parsed.data };
    }
    // TD can always add/update comment and guidelines
    if ("tdComment" in body) updateData.tdComment = body.tdComment;
    if ("tdGuidelines" in body) updateData.tdGuidelines = body.tdGuidelines;
  } else {
    const canManage = await canManageSession(existing, clubId, userId, role);
    if (!canManage) {
      res.status(403).json({ error: "Puoi modificare solo le tue sedute" });
      return;
    }
    const parsed = UpdateTrainingSessionBody.safeParse(body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    updateData = { ...parsed.data };
  }

  if (Object.keys(updateData).length === 0) {
    const enriched = await enrichSession(existing, { clubId, userId, role });
    res.json(enriched);
    return;
  }

  const targetTeam=(updateData.teamId===undefined?existing.teamId:updateData.teamId) as number|null;
  if(targetTeam!==existing.teamId&&targetTeam){
    const [team]=await db.select().from(teamsTable).where(and(eq(teamsTable.id,targetTeam),eq(teamsTable.clubId,clubId)));
    const sections=await resolveAllowedClubSections(req,undefined);
    if(!team||(sections&&!sections.includes(team.clubSection))||(STAFF_RESTRICTED_ROLES.includes(role)&&!await canAccessTeamForRestrictedRole(clubId,userId,targetTeam))){res.status(403).json({error:"Squadra non accessibile"});return;}
  }
  if(!await validSessionTeams(req,targetTeam,(updateData.notes===undefined?existing.notes:updateData.notes) as string|null,existing.notes)){res.status(403).json({error:"Unione di annate non autorizzata o non configurata"});return;}
  if(existing.notes===AUTO_TRAINING_MARKER&&STAFF_RESTRICTED_ROLES.includes(role))updateData.createdByUserId=userId;
  let moveIssue:string|null=null;
  const [session] = await db.transaction(async tx=>{
    for(const teamId of [...new Set([...sessionTeamIds(existing.teamId,existing.notes),...sessionTeamIds(targetTeam,(updateData.notes===undefined?existing.notes:updateData.notes) as string|null)])].sort((a,b)=>(a??0)-(b??0)))await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${clubId}|${teamId}`}))`);
    const [current]=await tx.select({notes:trainingSessionsTable.notes}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.id,params.data.id),eq(trainingSessionsTable.clubId,clubId))).limit(1);
    if(!current||(existing.notes===AUTO_TRAINING_MARKER&&current.notes===AUTO_TRAINING_MARKER+" REMOVED"))return [];
    const targetAt=updateData.scheduledAt instanceof Date?updateData.scheduledAt:existing.scheduledAt;
    const targetKind=String(updateData.sessionKind??existing.sessionKind);
    const nextTeamIds=sessionTeamIds(targetTeam,(updateData.notes===undefined?existing.notes:updateData.notes) as string|null);
    if(targetTeam&&sessionTeamIds(existing.teamId,existing.notes).some(id=>!nextTeamIds.includes(id))){
      const players=await tx.select({id:playersTable.id,teamId:playersTable.teamId,notes:playersTable.notes}).from(playersTable).where(eq(playersTable.clubId,clubId));
      const allowed=new Set(rosterMembers(players,nextTeamIds).map(player=>player.id));
      const recorded=resultRows<{playerId:number}>(await tx.execute(sql`SELECT player_id AS "playerId" FROM training_attendances WHERE club_id=${clubId} AND training_session_id=${existing.id}`));
      const plansExist=resultRows<{present:boolean}>(await tx.execute(sql`SELECT to_regclass('training_session_plans') IS NOT NULL AS present`))[0]?.present;
      const plan=plansExist?resultRows<{plan:Awaited<ReturnType<typeof readSessionPlan>>}>(await tx.execute(sql`SELECT plan FROM training_session_plans WHERE session_id=${existing.id} AND club_id=${clubId}`))[0]?.plan:{rotations:undefined};
      const planned=Object.values(plan?.rotations??{}).flatMap(turns=>turns.flatMap(turn=>turn.stations.flatMap(station=>station.playerIds)));
      if([...recorded.map(row=>row.playerId),...planned].some(id=>!allowed.has(id))){moveIssue="La seduta contiene presenze o gruppi di giocatori delle annate che stai togliendo. Mantieni l'unione o verifica prima questi dati: nessuna modifica è stata salvata.";return [];}
    }
    if(targetKind==="regular"&&!await consolidateSharedDrafts(tx,clubId,existing.id,sessionTeamIds(targetTeam,(updateData.notes===undefined?existing.notes:updateData.notes) as string|null),targetAt,(updateData.durationMinutes??existing.durationMinutes??90) as number))return [];
    const moved=targetTeam!==existing.teamId||Math.floor(targetAt.getTime()/60000)!==Math.floor(existing.scheduledAt.getTime()/60000)||targetKind!==existing.sessionKind;
    if(moved&&targetTeam&&targetKind==="regular"){
      const occupied=await tx.select({id:trainingSessionsTable.id}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),eq(trainingSessionsTable.teamId,targetTeam),sameTrainingMinute(trainingSessionsTable.scheduledAt,targetAt),eq(trainingSessionsTable.sessionKind,"regular"),sql`${trainingSessionsTable.status} NOT IN ('cancelled','canceled')`,sql`${trainingSessionsTable.id}<>${existing.id}`)).limit(1);
      if(occupied.length)return [];
    }
    // A moved session must not be automatically regenerated in its old slot.
    if(moved&&existing.teamId&&existing.sessionKind==="regular") {
      await ensureTrainingSuppressions(tx);
      await tx.execute(sql`INSERT INTO training_session_suppressions(club_id,team_id,scheduled_at) VALUES(${clubId},${existing.teamId},date_trunc('minute',${existing.scheduledAt.toISOString()}::timestamptz)) ON CONFLICT DO NOTHING`);
    }
    return tx.update(trainingSessionsTable).set(updateData).where(and(eq(trainingSessionsTable.id,params.data.id),eq(trainingSessionsTable.clubId,clubId))).returning();
  });
  if(!session){res.status(409).json({error:moveIssue??"La squadra di destinazione ha già una seduta in questo orario, oppure la programmazione è cambiata. Nessuna modifica è stata salvata: apri la seduta già presente nel calendario."});return;}

  const enriched = await enrichSession(session, { clubId, userId, role });
  res.json(enriched);
});

// Session-local planning never changes library exercises or other sessions.
async function planningAccess(req: Parameters<typeof resolveAllowedClubSections>[0], id: number, write: boolean) {
  const clubId=req.session.clubId, userId=req.session.userId, role=normalizeSessionRole(req.session.role);
  if(!clubId||!userId) return null;
  const [session]=await db.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.id,id),eq(trainingSessionsTable.clubId,clubId)));
  if(!session) return null;
  if(session.teamId) {
    const [team]=await db.select().from(teamsTable).where(and(eq(teamsTable.id,session.teamId),eq(teamsTable.clubId,clubId)));
    const sections=await resolveAllowedClubSections(req, undefined);
    if(!team||(sections&&!sections.includes(team.clubSection))) return null;
  }
  if(write) {
    if(!CAN_CREATE_ROLES.includes(role)||!(await canManageSession(session,clubId,userId,role))) return null;
  } else if(!canViewAllClubTrainingSessions(role)) {
    const assigned=await canAccessTeamForRestrictedRole(clubId,userId,session.teamId);
    const visible=session.createdByUserId===userId||await canManageSession(session,clubId,userId,role)||(session.sessionKind==="tipo"&&session.sentToUserIds?.includes(userId));
    if(!assigned||!visible) return null;
  }
  return session;
}
async function planningExercises(sessionId:number,clubId:number) {
  return resultRows<PlanningExercise>(await db.execute(sql`SELECT link.id, exercise.duration_minutes AS duration, exercise.description, exercise.title, exercise.training_phase AS phase
    FROM training_session_exercises link LEFT JOIN exercises exercise ON exercise.id=link.exercise_id AND exercise.club_id=${clubId}
    WHERE link.training_session_id=${sessionId} ORDER BY link."order",link.id`));
}
router.get("/training-sessions/:id/planning",requireAuth,async(req,res):Promise<void>=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Seduta non valida"});return;}
  const session=await planningAccess(req,id,false);
  if(!session){res.status(403).json({error:"Seduta non accessibile"});return;}
  const plan=await readSessionPlan(id,session.clubId);
  const exercises=await planningExercises(id,session.clubId);
  res.json({...plan,version:planningVersion(plan),timings:Object.fromEntries(exercises.filter(ex=>plan.timings[String(ex.id)]?.signature===timingSignature(ex)).map(ex=>[String(ex.id),plan.timings[String(ex.id)]]))});
});
router.put("/training-sessions/:id/planning",requireAuth,async(req,res):Promise<void>=>{
  const id=Number(req.params.id), recoveries=req.body?.recoveries;
  if(!Number.isInteger(id)||id<=0||!Array.isArray(recoveries)||recoveries.length!==2||recoveries.some(value=>typeof value!=="number"||!Number.isFinite(value)||value<0||value>300)||typeof req.body.recalculate!=="boolean") {res.status(400).json({error:"Recuperi non validi"});return;}
  const session=await planningAccess(req,id,true);
  if(!session){res.status(403).json({error:"Non puoi preparare questa seduta"});return;}
  await ensureSessionPlans();
  try {
    const plan=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM training_sessions WHERE id=${id} AND club_id=${session.clubId} FOR UPDATE`);
      const [current]=await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.id,id),eq(trainingSessionsTable.clubId,session.clubId)));
      if(!current) throw new Error("Seduta non disponibile");
      const [stored]=resultRows<{plan:Awaited<ReturnType<typeof readSessionPlan>>}>(await tx.execute(sql`SELECT plan FROM training_session_plans WHERE session_id=${id} AND club_id=${session.clubId}`));
      const old:Awaited<ReturnType<typeof readSessionPlan>>=stored?.plan??{recoveries:[0,0],timings:{}};
      const exercises=resultRows<PlanningExercise>(await tx.execute(sql`SELECT link.id, exercise.duration_minutes AS duration, exercise.description, exercise.title, exercise.training_phase AS phase FROM training_session_exercises link LEFT JOIN exercises exercise ON exercise.id=link.exercise_id AND exercise.club_id=${session.clubId} WHERE link.training_session_id=${id} ORDER BY link."order",link.id`));
      if(req.body.version!==undefined&&req.body.version!==planningVersion(old))throw Error("CONFLICT:La pianificazione è cambiata. Riapri la seduta prima di salvare i turni.");
      const rotations=req.body.rotations===undefined?old.rotations:req.body.rotations;
      if(rotations!==undefined){
        const players=await tx.select({id:playersTable.id,teamId:playersTable.teamId,notes:playersTable.notes}).from(playersTable).where(eq(playersTable.clubId,session.clubId));
        const allowed=rosterMembers(players,sessionTeamIds(current.teamId,current.notes)).map(player=>player.id);
        const issue=validateTrainingRotations(rotations,exercises.map(ex=>({id:ex.id,phase:ex.phase??null})),allowed);
        if(issue)throw Error(issue);
      }
      const next=req.body.recalculate?(rotations!==undefined?recalculateRotationPlan(current.durationMinutes??0,recoveries as [number,number],exercises,rotations as TrainingRotations):recalculatePlan(current.durationMinutes??0,recoveries as [number,number],exercises)):{...old,recoveries:recoveries as [number,number],...(rotations!==undefined?{rotations,timings:rotationTimings(exercises,rotations as TrainingRotations)}:{})};
      await tx.execute(sql`INSERT INTO training_session_plans(session_id,club_id,plan) VALUES(${id},${session.clubId},${JSON.stringify(next)}::jsonb) ON CONFLICT(session_id) DO UPDATE SET plan=EXCLUDED.plan,updated_at=now() WHERE training_session_plans.club_id=${session.clubId}`);
      return next;
    });
    res.json({...plan,version:planningVersion(plan)});
  } catch(error) {const message=error instanceof Error?error.message:"Pianificazione non valida";res.status(message.startsWith("CONFLICT:")?409:400).json({error:message.replace(/^CONFLICT:/,"")});}
});

// Confirmation snapshot is checked again under the same lock as deletion.
router.get("/training-sessions/:id/deletion-summary",requireAuth,async(req,res):Promise<void>=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Seduta non valida"});return;}
  const session=await planningAccess(req,id,!["admin","presidente"].includes(normalizeSessionRole(req.session.role)));
  if(!session){res.status(403).json({error:"Seduta non eliminabile dal tuo profilo"});return;}
  const summary=await db.transaction(tx=>trainingDeletionSummary(tx,session.clubId,id));
  if(!summary){res.status(404).json({error:"Seduta non trovata"});return;}res.json(summary);
});
router.delete("/training-sessions/:id",requireAuth,async(req,res):Promise<void>=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0){res.status(400).json({error:"Seduta non valida"});return;}
  const session=await planningAccess(req,id,!["admin","presidente"].includes(normalizeSessionRole(req.session.role)));
  if(!session){res.status(403).json({error:"Seduta non eliminabile dal tuo profilo"});return;}
  const confirmation=req.body?.confirmation;
  if(!confirmation||typeof confirmation.version!=="string"||!Number.isInteger(confirmation.exerciseCount)||!Number.isInteger(confirmation.attendanceCount)){res.status(409).json({error:"Verifica i dati della seduta e conferma prima di eliminarla"});return;}
  const removed=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${session.clubId}|${session.teamId}`}))`);
    await tx.execute(sql`SELECT id FROM training_sessions WHERE id=${id} AND club_id=${session.clubId} FOR UPDATE`);
    const summary=await trainingDeletionSummary(tx,session.clubId,id);
    if(!summary||summary.version!==confirmation.version||summary.exerciseCount!==confirmation.exerciseCount||summary.attendanceCount!==confirmation.attendanceCount)return false;
    if(session.teamId&&session.sessionKind==="regular"){
      await ensureTrainingSuppressions(tx);
      await tx.execute(sql`INSERT INTO training_session_suppressions(club_id,team_id,scheduled_at) VALUES(${session.clubId},${session.teamId},date_trunc('minute',${session.scheduledAt.toISOString()}::timestamptz)) ON CONFLICT DO NOTHING`);
    }
    await tx.delete(trainingSessionsTable).where(and(eq(trainingSessionsTable.id,id),eq(trainingSessionsTable.clubId,session.clubId)));
    return true;
  });
  if(!removed){res.status(409).json({error:"La seduta è cambiata: rileggi i dati e conferma nuovamente"});return;}res.sendStatus(204);
});

// ── Training Directives ──────────────────────────────────────────────────────

// GET directives (TD gets all they created; others get those sent to them)
router.get("/training-directives", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  if (role === "secretary" || role === "admin" || role === "presidente" || role === "director") {
    res.json([]);
    return;
  }

  let directives;
  if (role === "technical_director") {
    directives = await db
      .select()
      .from(trainingDirectivesTable)
      .where(eq(trainingDirectivesTable.clubId, clubId))
      .orderBy(desc(trainingDirectivesTable.createdAt));
  } else {
    directives = await db
      .select()
      .from(trainingDirectivesTable)
      .where(
        and(
          eq(trainingDirectivesTable.clubId, clubId),
          sql`${trainingDirectivesTable.sentToUserIds}::jsonb @> ${JSON.stringify([userId])}::jsonb`
        )
      )
      .orderBy(desc(trainingDirectivesTable.createdAt));
  }

  res.json(directives);
});

// POST new directive (TD only)
router.post("/training-directives", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "technical_director") {
    res.status(403).json({ error: "Solo il direttore tecnico può inviare direttive" });
    return;
  }

  const body = req.body as {
    title: string;
    message: string;
    type?: string;
    sentToUserIds: number[];
    scheduledFor?: string;
  };

  if (!body.title || !body.message || !Array.isArray(body.sentToUserIds)) {
    res.status(400).json({ error: "title, message e sentToUserIds sono obbligatori" });
    return;
  }

  const [directive] = await db
    .insert(trainingDirectivesTable)
    .values({
      clubId: req.session.clubId!,
      createdByUserId: req.session.userId!,
      title: body.title,
      message: body.message,
      type: body.type ?? "general",
      sentToUserIds: body.sentToUserIds,
      scheduledFor: body.scheduledFor ?? null,
    })
    .returning();

  res.status(201).json(directive);
});

// DELETE directive (TD only)
router.delete("/training-directives/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "technical_director") {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "ID non valido" }); return; }

  await db
    .delete(trainingDirectivesTable)
    .where(and(eq(trainingDirectivesTable.id, id), eq(trainingDirectivesTable.clubId, req.session.clubId!)));

  res.sendStatus(204);
});

// ── Dashboard Stats ────────────────────────────────────────────────────────

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const clubId = Number(req.session.clubId);
  const userId = Number(req.session.userId);
  const role = String(req.session.role ?? "");
  if (!Number.isFinite(clubId) || clubId <= 0 || !Number.isFinite(userId)) {
    res.status(400).json({ error: "Sessione club non valida" });
    return;
  }
  const sectionFilter = isClubWideListRole(role) ? undefined : req.session.section;
  const now = new Date();

  let assignedTeamIds: number[] | undefined;
  if (!isClubWideListRole(role) && DASHBOARD_ASSIGNMENT_SCOPED_NORM.has(normalizeSessionRole(role))) {
    const rows = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(and(
        eq(teamStaffAssignmentsTable.userId, userId),
        eq(teamStaffAssignmentsTable.clubId, clubId),
      ));
    assignedTeamIds = rows.map(r => r.teamId);
  }

  let sectionTeamIds: number[] | undefined;
  if (sectionFilter) {
    const rows = await db.select({ id: teamsTable.id }).from(teamsTable)
      .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.clubSection, sectionFilter)));
    sectionTeamIds = rows.map(r => r.id);
  }

  let effectiveTeamIds: number[] | undefined;
  if (assignedTeamIds !== undefined && sectionTeamIds !== undefined) {
    effectiveTeamIds = assignedTeamIds.filter(id => sectionTeamIds!.includes(id));
  } else if (assignedTeamIds !== undefined) {
    effectiveTeamIds = assignedTeamIds;
  } else if (sectionTeamIds !== undefined) {
    effectiveTeamIds = sectionTeamIds;
  }

  // DT / DG: se la sezione in sessione non ha squadre, senza questo restano 0 squadre ma N membri (query membri senza filtro sezione).
  if (isClubWideListRole(role) && effectiveTeamIds !== undefined && effectiveTeamIds.length === 0) {
    effectiveTeamIds = undefined;
  }

  const teamIdWhere = effectiveTeamIds !== undefined
    ? effectiveTeamIds.length > 0
      ? and(eq(teamsTable.clubId, clubId), inArray(teamsTable.id, effectiveTeamIds))
      : and(eq(teamsTable.clubId, clubId), sql`false`)
    : eq(teamsTable.clubId, clubId);

  const playerIdWhere = effectiveTeamIds !== undefined
    ? effectiveTeamIds.length > 0
      ? and(eq(playersTable.clubId, clubId), inArray(playersTable.teamId, effectiveTeamIds))
      : and(eq(playersTable.clubId, clubId), sql`false`)
    : eq(playersTable.clubId, clubId);

  const [teamsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(teamsTable).where(teamIdWhere);
  const [playersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(playersTable).where(playerIdWhere);

  const [membersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clubMembershipsTable)
    .where(eq(clubMembershipsTable.clubId, clubId));

  const trainingBase = effectiveTeamIds !== undefined
    ? effectiveTeamIds.length > 0
      ? and(eq(trainingSessionsTable.clubId, clubId), inArray(trainingSessionsTable.teamId, effectiveTeamIds))
      : and(eq(trainingSessionsTable.clubId, clubId), sql`false`)
    : eq(trainingSessionsTable.clubId, clubId);

  const [upcomingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trainingSessionsTable)
    .where(and(trainingBase as any, gte(trainingSessionsTable.scheduledAt, now), eq(trainingSessionsTable.status, "scheduled")));

  const recentSessions = await db
    .select()
    .from(trainingSessionsTable)
    .where(trainingBase)
    .orderBy(desc(trainingSessionsTable.scheduledAt))
    .limit(5);

  const enrichedSessions = await Promise.all(recentSessions.map((session) => enrichSession(session, { clubId, userId, role })));

  res.json(GetDashboardStatsResponse.parse({
    totalTeams: teamsCount?.count ?? 0,
    totalPlayers: playersCount?.count ?? 0,
    totalMembers: membersCount?.count ?? 0,
    upcomingTrainingSessions: upcomingCount?.count ?? 0,
    recentTrainingSessions: enrichedSessions,
  }));
});

export default router;
