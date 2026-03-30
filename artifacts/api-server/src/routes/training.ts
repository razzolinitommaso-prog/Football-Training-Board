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

const STAFF_ONLY_ROLES = ["coach", "fitness_coach", "technical_director", "athletic_director"];
const CAN_CREATE_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const VIEW_ALL_ROLES = ["admin", "presidente", "director", "technical_director"];

const router: IRouter = Router();

async function enrichSession(session: typeof trainingSessionsTable.$inferSelect) {
  let teamName: string | null = null;
  if (session.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, session.teamId));
    if (team) teamName = team.name;
  }
  let creatorName: string | null = null;
  if (session.createdByUserId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.createdByUserId));
    if (user) creatorName = `${user.firstName} ${user.lastName}`;
  }
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
  };
}

// GET all training sessions (role-filtered)
router.get("/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role;
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  if (role === "secretary") {
    res.status(403).json({ error: "Accesso non consentito" });
    return;
  }

  const queryParams = ListTrainingSessionsQueryParams.safeParse(req.query);
  let sessions: (typeof trainingSessionsTable.$inferSelect)[] = [];

  if (VIEW_ALL_ROLES.includes(role)) {
    let conditions: ReturnType<typeof eq>[] = [eq(trainingSessionsTable.clubId, clubId) as any];
    if (queryParams.success && queryParams.data.teamId) {
      conditions.push(eq(trainingSessionsTable.teamId, queryParams.data.teamId) as any);
    }
    if (req.session.section) {
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
    // coach, fitness_coach, athletic_director: own sessions + tipo sessions addressed to them
    sessions = await db
      .select()
      .from(trainingSessionsTable)
      .where(
        and(
          eq(trainingSessionsTable.clubId, clubId),
          or(
            eq(trainingSessionsTable.createdByUserId, userId),
            and(
              eq(trainingSessionsTable.sessionKind, "tipo"),
              sql`${trainingSessionsTable.sentToUserIds}::jsonb @> ${JSON.stringify([userId])}::jsonb`
            )
          )
        )
      )
      .orderBy(desc(trainingSessionsTable.scheduledAt));
  }

  const enriched = await Promise.all(sessions.map(enrichSession));
  res.json(enriched);
});

// POST new training session
router.post("/training-sessions", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role;
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
    [key: string]: unknown;
  };

  const [session] = await db
    .insert(trainingSessionsTable)
    .values({
      ...parsed.data,
      clubId: req.session.clubId!,
      createdByUserId: userId,
      sessionKind: body.sessionKind ?? "regular",
      sentToUserIds: body.sentToUserIds ?? null,
    })
    .returning();

  const enriched = await enrichSession(session);
  res.status(201).json(enriched);
});

// GET single training session
router.get("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role;
  if (role === "secretary") { res.status(403).json({ error: "Accesso non consentito" }); return; }

  const params = GetTrainingSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [session] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, req.session.clubId!)));

  if (!session) { res.status(404).json({ error: "Training session not found" }); return; }

  const enriched = await enrichSession(session);
  res.json(enriched);
});

// PATCH training session
router.patch("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role;
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  if (role === "secretary" || role === "admin" || role === "presidente" || role === "director") {
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

  if (role === "technical_director") {
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
    // Others can only edit their own sessions
    if (existing.createdByUserId !== userId) {
      res.status(403).json({ error: "Puoi modificare solo le tue sessioni" });
      return;
    }
    const parsed = UpdateTrainingSessionBody.safeParse(body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    updateData = { ...parsed.data };
  }

  if (Object.keys(updateData).length === 0) {
    const enriched = await enrichSession(existing);
    res.json(enriched);
    return;
  }

  const [session] = await db
    .update(trainingSessionsTable)
    .set(updateData)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, clubId)))
    .returning();

  const enriched = await enrichSession(session);
  res.json(enriched);
});

// DELETE training session
router.delete("/training-sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const role = req.session.role;
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;

  const params = DeleteTrainingSessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, params.data.id), eq(trainingSessionsTable.clubId, clubId)));

  if (!existing) { res.status(404).json({ error: "Training session not found" }); return; }

  // Only creator or admin/presidente can delete
  if (!["admin", "presidente"].includes(role ?? "") && existing.createdByUserId !== userId) {
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
  const role = req.session.role;
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

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID non valido" }); return; }

  await db
    .delete(trainingDirectivesTable)
    .where(and(eq(trainingDirectivesTable.id, id), eq(trainingDirectivesTable.clubId, req.session.clubId!)));

  res.sendStatus(204);
});

// ── Dashboard Stats ────────────────────────────────────────────────────────

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const userId = req.session.userId!;
  const role = req.session.role;
  const sectionFilter = req.session.section;
  const now = new Date();

  let assignedTeamIds: number[] | undefined;
  if (STAFF_ONLY_ROLES.includes(role)) {
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

  const enrichedSessions = await Promise.all(recentSessions.map(enrichSession));

  res.json(GetDashboardStatsResponse.parse({
    totalTeams: teamsCount?.count ?? 0,
    totalPlayers: playersCount?.count ?? 0,
    totalMembers: membersCount?.count ?? 0,
    upcomingTrainingSessions: upcomingCount?.count ?? 0,
    recentTrainingSessions: enrichedSessions,
  }));
});

export default router;
