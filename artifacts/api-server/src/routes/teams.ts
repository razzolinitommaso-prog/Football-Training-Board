import { Router, type IRouter } from "express";
import { db, teamsTable, playersTable, usersTable, teamStaffAssignmentsTable, seasonsTable, clubMembershipsTable } from "@workspace/db";
import { eq, and, sql, inArray, SQL, asc } from "drizzle-orm";
import {
  ListTeamsResponse,
  CreateTeamBody,
  GetTeamResponse,
  UpdateTeamBody,
  UpdateTeamResponse,
  GetTeamParams,
  UpdateTeamParams,
  DeleteTeamParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { isClubWideListRole, normalizeSessionRole, resolveClubSectionFilter } from "../lib/club-scope";
import { requireClubAndUserIds } from "../lib/session-context";

/** Solo questi ruoli vedono le squadre limitate alle assegnazioni. Il direttore tecnico ha panoramica su tutto il club. */
const TEAM_ASSIGNMENT_FILTER_ROLES_NORM = new Set(["coach", "fitness_coach", "athletic_director"]);

const router: IRouter = Router();

async function getTeamStaff(teamId: number) {
  const staffRows = await db
    .select({
      userId: teamStaffAssignmentsTable.userId,
      role: teamStaffAssignmentsTable.role,
      clubId: teamStaffAssignmentsTable.clubId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      staffRole: clubMembershipsTable.staffRole,
      licenseType: clubMembershipsTable.licenseType,
      specialization: clubMembershipsTable.specialization,
      degreeScienzeMoto: clubMembershipsTable.degreeScienzeMoto,
      degreeScienzeMotoType: clubMembershipsTable.degreeScienzeMotoType,
      registered: clubMembershipsTable.registered,
      registrationNumber: clubMembershipsTable.registrationNumber,
    })
    .from(teamStaffAssignmentsTable)
    .innerJoin(usersTable, eq(teamStaffAssignmentsTable.userId, usersTable.id))
    .leftJoin(
      clubMembershipsTable,
      and(
        eq(clubMembershipsTable.userId, teamStaffAssignmentsTable.userId),
        eq(clubMembershipsTable.clubId, teamStaffAssignmentsTable.clubId),
      ),
    )
    .where(eq(teamStaffAssignmentsTable.teamId, teamId));

  return staffRows.map(s => ({
    userId: s.userId,
    name: `${s.firstName} ${s.lastName}`,
    role: s.role,
    staffRole: s.staffRole ?? null,
    licenseType: s.licenseType ?? null,
    specialization: s.specialization ?? null,
    degreeScienzeMoto: s.degreeScienzeMoto ?? false,
    degreeScienzeMotoType: s.degreeScienzeMotoType ?? null,
    registered: s.registered ?? false,
    registrationNumber: s.registrationNumber ?? null,
  }));
}

async function getAssignedTeamIds(userId: number, clubId: number): Promise<number[]> {
  const rows = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
    ));
  return rows.map(r => r.teamId);
}

/** Risolve la squadra “corrente” per l’utente: coach_id → assegnazione staff → prima squadra del club (opz. filtro sezione sessione). */
async function resolveMyTeamForUser(
  userId: number,
  clubId: number,
  section: string | undefined,
): Promise<typeof teamsTable.$inferSelect | null> {
  const baseClub = eq(teamsTable.clubId, clubId);
  const sectionEq = section ? eq(teamsTable.clubSection, section) : null;

  const asCoachWhere = sectionEq
    ? and(baseClub, eq(teamsTable.coachId, userId), sectionEq)
    : and(baseClub, eq(teamsTable.coachId, userId));
  const asCoach = await db
    .select()
    .from(teamsTable)
    .where(asCoachWhere)
    .orderBy(asc(teamsTable.id))
    .limit(1);
  if (asCoach[0]) return asCoach[0];

  const staffWhere = sectionEq
    ? and(
        eq(teamStaffAssignmentsTable.userId, userId),
        eq(teamStaffAssignmentsTable.clubId, clubId),
        sectionEq,
      )
    : and(eq(teamStaffAssignmentsTable.userId, userId), eq(teamStaffAssignmentsTable.clubId, clubId));

  const staffRow = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .innerJoin(teamsTable, eq(teamStaffAssignmentsTable.teamId, teamsTable.id))
    .where(staffWhere)
    .orderBy(asc(teamsTable.id))
    .limit(1);

  if (staffRow[0]) {
    const [t] = await db.select().from(teamsTable).where(eq(teamsTable.id, staffRow[0].teamId));
    if (t) return t;
  }

  const fallbackWhere = sectionEq ? and(baseClub, sectionEq) : baseClub;
  const fallback = await db
    .select()
    .from(teamsTable)
    .where(fallbackWhere)
    .orderBy(asc(teamsTable.id))
    .limit(1);

  return fallback[0] ?? null;
}

async function getTeamsWithCounts(clubId: number, filterTeamIds?: number[], section?: string) {
  let whereClause: SQL = eq(teamsTable.clubId, clubId);
  if (section) {
    whereClause = and(eq(teamsTable.clubId, clubId), eq(teamsTable.clubSection, section))!;
  }
  const allTeams = await db.select().from(teamsTable).where(whereClause);
  const teams = filterTeamIds ? allTeams.filter(t => filterTeamIds.includes(t.id)) : allTeams;

  const seasonIds = [...new Set(teams.map(t => t.seasonId).filter(Boolean))] as number[];
  const seasons = seasonIds.length > 0
    ? await db.select({ id: seasonsTable.id, name: seasonsTable.name }).from(seasonsTable).where(
        eq(seasonsTable.clubId, clubId)
      )
    : [];
  const seasonMap = new Map(seasons.map(s => [s.id, s.name]));

  const teamsWithCounts = await Promise.all(
    teams.map(async (team) => {
      const playerCountResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(playersTable)
        .where(eq(playersTable.teamId, team.id));

      let coachName: string | null = null;
      if (team.coachId) {
        const [coach] = await db.select().from(usersTable).where(eq(usersTable.id, team.coachId));
        if (coach) coachName = `${coach.firstName} ${coach.lastName}`;
      }

      const assignedStaff = await getTeamStaff(team.id);

      return {
        ...team,
        ageGroup: team.ageGroup ?? null,
        category: team.category ?? null,
        coachId: team.coachId ?? null,
        coachName,
        seasonId: team.seasonId ?? null,
        seasonName: team.seasonId ? (seasonMap.get(team.seasonId) ?? null) : null,
        playerCount: playerCountResult[0]?.count ?? 0,
        assignedStaff,
      };
    })
  );

  return teamsWithCounts;
}

router.get("/teams", requireAuth, async (req, res): Promise<void> => {
  const ids = requireClubAndUserIds(req);
  if (!ids) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  const { clubId, userId } = ids;
  const role = req.session.role ?? "";
  const section = resolveClubSectionFilter(
    role,
    typeof req.query.section === "string" ? req.query.section : undefined,
    req.session.section,
  );
  let filterTeamIds: number[] | undefined;
  if (!isClubWideListRole(role) && TEAM_ASSIGNMENT_FILTER_ROLES_NORM.has(normalizeSessionRole(role))) {
    filterTeamIds = await getAssignedTeamIds(userId, clubId);
  }
  const teams = await getTeamsWithCounts(clubId, filterTeamIds, section);
  res.json(ListTeamsResponse.parse(teams));
});

// Must be registered before GET /teams/:id so "my-team" is not parsed as id.
router.get("/teams/my-team", requireAuth, async (req, res): Promise<void> => {
  if (req.session.isSuperAdmin || req.session.clubId == null) {
    res.status(400).json({ error: "Club context required" });
    return;
  }

  const userId = req.session.userId!;
  const clubId = req.session.clubId;
  const section = req.session.section;

  const team = await resolveMyTeamForUser(userId, clubId, section);
  if (!team) {
    res.status(404).json({ error: "No team found for this club" });
    return;
  }

  const players = await db
    .select({
      id: playersTable.id,
      firstName: playersTable.firstName,
      lastName: playersTable.lastName,
      position: playersTable.position,
      jerseyNumber: playersTable.jerseyNumber,
    })
    .from(playersTable)
    .where(and(eq(playersTable.teamId, team.id), eq(playersTable.clubId, clubId)))
    .orderBy(asc(playersTable.lastName), asc(playersTable.firstName));

  res.json({ team, players });
});

router.post("/teams", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [team] = await db
    .insert(teamsTable)
    .values({ ...parsed.data, clubId: req.session.clubId! })
    .returning();

  let coachName: string | null = null;
  if (team.coachId) {
    const [coach] = await db.select().from(usersTable).where(eq(usersTable.id, team.coachId));
    if (coach) coachName = `${coach.firstName} ${coach.lastName}`;
  }

  res.status(201).json(GetTeamResponse.parse({
    ...team,
    ageGroup: team.ageGroup ?? null,
    category: team.category ?? null,
    coachId: team.coachId ?? null,
    coachName,
    playerCount: 0,
    assignedStaff: [],
  }));
});

router.get("/teams/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [team] = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.id, params.data.id), eq(teamsTable.clubId, req.session.clubId!)));

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const playerCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playersTable)
    .where(eq(playersTable.teamId, team.id));

  let coachName: string | null = null;
  if (team.coachId) {
    const [coach] = await db.select().from(usersTable).where(eq(usersTable.id, team.coachId));
    if (coach) coachName = `${coach.firstName} ${coach.lastName}`;
  }

  const assignedStaff = await getTeamStaff(team.id);

  res.json(GetTeamResponse.parse({
    ...team,
    ageGroup: team.ageGroup ?? null,
    category: team.category ?? null,
    coachId: team.coachId ?? null,
    coachName,
    playerCount: playerCountResult[0]?.count ?? 0,
    assignedStaff,
  }));
});

router.patch("/teams/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    console.error("[PATCH /teams/:id] Validation error:", parsed.error.message);
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  console.log("[PATCH /teams/:id] id=%d parsed.data=%j", params.data.id, parsed.data);

  const [team] = await db
    .update(teamsTable)
    .set(parsed.data)
    .where(and(eq(teamsTable.id, params.data.id), eq(teamsTable.clubId, req.session.clubId!)))
    .returning();

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  const playerCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playersTable)
    .where(eq(playersTable.teamId, team.id));

  let coachName: string | null = null;
  if (team.coachId) {
    const [coach] = await db.select().from(usersTable).where(eq(usersTable.id, team.coachId));
    if (coach) coachName = `${coach.firstName} ${coach.lastName}`;
  }

  const assignedStaff = await getTeamStaff(team.id);

  res.json(UpdateTeamResponse.parse({
    ...team,
    ageGroup: team.ageGroup ?? null,
    category: team.category ?? null,
    coachId: team.coachId ?? null,
    coachName,
    playerCount: playerCountResult[0]?.count ?? 0,
    assignedStaff,
  }));
});

// GET /teams/:id/members — returns players for a team (for tactical board roster loading)
router.get("/teams/:id/members", requireAuth, async (req, res): Promise<void> => {
  const teamId = parseInt(String(req.params.id), 10);
  if (isNaN(teamId)) { res.status(400).json({ error: "Invalid team id" }); return; }

  const players = await db
    .select({
      id: playersTable.id,
      firstName: playersTable.firstName,
      lastName: playersTable.lastName,
      position: playersTable.position,
      jerseyNumber: playersTable.jerseyNumber,
    })
    .from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.clubId, req.session.clubId!)));

  res.json(players.map(p => ({
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    role: p.position ?? null,
    jerseyNumber: p.jerseyNumber ?? null,
  })));
});

router.delete("/teams/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [team] = await db
    .delete(teamsTable)
    .where(and(eq(teamsTable.id, params.data.id), eq(teamsTable.clubId, req.session.clubId!)))
    .returning();

  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
