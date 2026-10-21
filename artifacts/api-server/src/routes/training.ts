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
      conditions.push(eq(trainingSessionsTable.teamId, queryParams.data.teamId) as any);
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

  const [teamRows,creatorRows,primaryIds,assignedIds]=await Promise.all([
    db.select({id:teamsTable.id,name:teamsTable.name}).from(teamsTable).where(and(eq(teamsTable.clubId,clubId),inArray(teamsTable.id,[...new Set(sessions.flatMap(session=>session.teamId?[session.teamId]:[]))]))),
    db.select({id:usersTable.id,firstName:usersTable.firstName,lastName:usersTable.lastName}).from(usersTable).where(inArray(usersTable.id,[...new Set(sessions.flatMap(session=>session.createdByUserId?[session.createdByUserId]:[]))])),
    STAFF_RESTRICTED_ROLES.includes(role)?getPrimaryCoachTeamIds(clubId,userId):Promise.resolve([] as number[]),
    STAFF_RESTRICTED_ROLES.includes(role)?getAssignedTeamIds(clubId,userId):Promise.resolve([] as number[]),
  ]);
  const lookup={teams:new Map(teamRows.map(team=>[team.id,team.name])),creators:new Map(creatorRows.map(user=>[user.id,`${user.firstName} ${user.lastName}`])),canEdit:(session:typeof trainingSessionsTable.$inferSelect)=>["secretary","technical_director"].includes(role)||session.createdByUserId===userId||Boolean(STAFF_RESTRICTED_ROLES.includes(role)&&session.teamId&&(primaryIds.includes(session.teamId)||(session.notes?.startsWith(AUTO_TRAINING_MARKER)&&assignedIds.includes(session.teamId))))};
  const enriched = await Promise.all(sessions.map((session) => enrichSession(session, { clubId, userId, role },lookup)));
  res.json(enriched);
});

// POST new training session
router.post("/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const userId = req.session.userId!;

  if (!CAN_CREATE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non hai i permessi per creare sessioni di allenamento" });
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
      res.status(403).json({ error: "Puoi creare sessioni solo sulle annate assegnate" });
      return;
    }
  }

  const [session] = await db.transaction(async tx=>{
    const values={...parsed.data,clubId:req.session.clubId!,createdByUserId:userId,sessionKind:body.sessionKind??"regular",sentToUserIds:body.sentToUserIds??null};
    if(body.teamId&&values.sessionKind==="regular"){
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${req.session.clubId}|${body.teamId}`}))`);
      const [draft]=await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,req.session.clubId!),eq(trainingSessionsTable.teamId,body.teamId),eq(trainingSessionsTable.scheduledAt,parsed.data.scheduledAt),eq(trainingSessionsTable.notes,AUTO_TRAINING_MARKER),eq(trainingSessionsTable.title,"Allenamento da preparare"),eq(trainingSessionsTable.status,"scheduled"),sql`${trainingSessionsTable.objectives} IS NULL`,sql`NOT EXISTS(SELECT 1 FROM training_session_exercises e WHERE e.training_session_id=${trainingSessionsTable.id})`,sql`NOT EXISTS(SELECT 1 FROM training_attendances a WHERE a.training_session_id=${trainingSessionsTable.id})`)).limit(1);
      if(draft)return tx.update(trainingSessionsTable).set({...values,notes:parsed.data.notes??draft.notes}).where(eq(trainingSessionsTable.id,draft.id)).returning();
      const [occupied]=await tx.select({id:trainingSessionsTable.id}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,req.session.clubId!),eq(trainingSessionsTable.teamId,body.teamId),eq(trainingSessionsTable.scheduledAt,parsed.data.scheduledAt),eq(trainingSessionsTable.sessionKind,"regular"))).limit(1);
      if(occupied)return [];
    }
    return tx.insert(trainingSessionsTable).values(values).returning();
  });

  if(!session){res.status(409).json({error:"Esiste già una sessione per questa squadra, data e orario. Aprila per modificarla."});return;}
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
      res.status(403).json({ error: "La sessione non è assegnata al tuo profilo" });
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
    res.status(403).json({ error: "Non hai i permessi per modificare sessioni" });
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
      res.status(403).json({ error: "Puoi modificare solo le tue sessioni" });
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

  if(existing.notes===AUTO_TRAINING_MARKER&&STAFF_RESTRICTED_ROLES.includes(role))updateData.createdByUserId=userId;
  const [session] = await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${clubId}|${existing.teamId}`}))`);
    const [current]=await tx.select({notes:trainingSessionsTable.notes}).from(trainingSessionsTable).where(and(eq(trainingSessionsTable.id,params.data.id),eq(trainingSessionsTable.clubId,clubId))).limit(1);
    if(!current||(existing.notes===AUTO_TRAINING_MARKER&&current.notes===AUTO_TRAINING_MARKER+" REMOVED"))return [];
    return tx.update(trainingSessionsTable).set(updateData).where(and(eq(trainingSessionsTable.id,params.data.id),eq(trainingSessionsTable.clubId,clubId))).returning();
  });
  if(!session){res.status(409).json({error:"La programmazione è cambiata. Riapri la sessione prima di modificarla."});return;}

  const enriched = await enrichSession(session, { clubId, userId, role });
  res.json(enriched);
});

// DELETE training session
router.delete("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  const params = DeleteTrainingSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, clubId)));

  if (!existing) { res.status(404).json({ error: "Training session not found" }); return; }

  // Only creator or admin/presidente/secretary can delete
  const canManage = ["admin", "presidente"].includes(role ?? "") || await canManageSession(existing, clubId, userId, role);
  if (!canManage) {
    res.status(403).json({ error: "Puoi eliminare solo le tue sessioni" });
    return;
  }

  await db
    .delete(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, clubId)));

  res.sendStatus(204);
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
