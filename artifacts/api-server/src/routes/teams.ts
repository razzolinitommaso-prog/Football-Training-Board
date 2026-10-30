import { TrainingProgramBody } from "@workspace/api-zod";
import { lockTrainingPrograms, setTrainingProgram, reconcileProgramSessions, TrainingProgramError } from "../lib/joint-training-program";
import { ensureSessionPlans } from "../lib/training-session-planning";
import { syncTrainingDrafts } from "../lib/automatic-training-drafts";
import { Router, type IRouter, type Request } from "express";
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
import { isClubWideListRole, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { assertCanCreateWithinPlan } from "../lib/plan-limits";
import { requireClubAndUserIds } from "../lib/session-context";

/** Solo questi ruoli vedono le squadre limitate alle assegnazioni. Il direttore tecnico ha panoramica su tutto il club. */
const TEAM_ASSIGNMENT_FILTER_ROLES_NORM = new Set(["coach", "fitness_coach", "athletic_director"]);
const TEAM_MANAGE_ROLES_NORM = new Set(["admin", "presidente", "director", "secretary", "sporting_director"]);
const TEAM_SCHEDULE_ROLES_NORM = new Set(["admin", "director", "secretary", "coach"]);

const router: IRouter = Router();

function canManageTeams(req: Request) {
  return TEAM_MANAGE_ROLES_NORM.has(normalizeSessionRole(req.session.role ?? ""));
}

function canEditTeamSchedule(req: Request) {
  return TEAM_SCHEDULE_ROLES_NORM.has(normalizeSessionRole(req.session.role ?? ""));
}

function isScheduleOnlyUpdate(payload: Record<string, unknown>) {
  const keys = Object.keys(payload);
  return keys.length === 1 && keys[0] === "trainingSchedule";
}

function teamPayloadForSession<T extends object>(payload: T, req: Request): T & { clubSection?: string } {
  const role = normalizeSessionRole(req.session.role ?? "");
  const sessionSection = typeof req.session.section === "string" ? req.session.section : "";
  const hasExplicitSection =
    Object.prototype.hasOwnProperty.call(payload, "clubSection") &&
    typeof (payload as { clubSection?: unknown }).clubSection === "string" &&
    (payload as { clubSection?: string }).clubSection!.trim().length > 0;
  if (!hasExplicitSection && sessionSection && role !== "admin" && role !== "presidente") {
    return { ...payload, clubSection: sessionSection };
  }
  return payload;
}

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
  const staffRows = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
    ));

  const coachedRows = await db
    .select({ teamId: teamsTable.id })
    .from(teamsTable)
    .where(and(
      eq(teamsTable.coachId, userId),
      eq(teamsTable.clubId, clubId),
    ));

  return Array.from(new Set([
    ...staffRows.map(r => r.teamId),
    ...coachedRows.map(r => r.teamId),
  ]));
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
    const [t] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, staffRow[0].teamId), eq(teamsTable.clubId, clubId)));
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

async function getTeamsWithCounts(clubId: number, filterTeamIds?: number[], sections?: string[]) {
  let whereClause: SQL = eq(teamsTable.clubId, clubId);
  if (sections) {
    if (sections.length === 0) return [];
    whereClause = and(eq(teamsTable.clubId, clubId), inArray(teamsTable.clubSection, sections))!;
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
  const sections = await resolveAllowedClubSections(req, typeof req.query.section === "string" ? req.query.section : undefined);
  let filterTeamIds: number[] | undefined;
  if (!isClubWideListRole(role) && TEAM_ASSIGNMENT_FILTER_ROLES_NORM.has(normalizeSessionRole(role))) {
    filterTeamIds = await getAssignedTeamIds(userId, clubId);
  }
  const teams = await getTeamsWithCounts(clubId, filterTeamIds, sections);
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
  if (!canManageTeams(req)) {
    res.status(403).json({ error: "Non autorizzato a creare squadre" });
    return;
  }

  const limitCheck = await assertCanCreateWithinPlan(req.session.clubId!, "teams");
  if (!limitCheck.ok) {
    res.status(limitCheck.status).json(limitCheck.body);
    return;
  }

  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const teamData = teamPayloadForSession(parsed.data, req);

  if((teamData.trainingSchedule as any[])?.some(slot=>slot.validFrom||slot.validUntil||slot.jointTeamId)){res.status(400).json({error:"I programmi congiunti si configurano dopo la creazione della squadra"});return;}
  const [team] = await db.transaction(async tx=>{
    await lockTrainingPrograms(tx,req.session.clubId!);
    const rows=await tx.insert(teamsTable).values({...teamData,clubId:req.session.clubId!}).returning();
    if(rows[0]?.trainingSchedule?.length)await syncTrainingDrafts(tx,rows[0],req.session.userId!);
    return rows;
  });

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

const programBody = TrainingProgramBody;
router.put("/teams/:id/training-program",requireAuth,async(req,res):Promise<void>=>{
 const id=Number(req.params.id),body=programBody.safeParse(req.body),clubId=req.session.clubId!,userId=req.session.userId!;
 if(!Number.isInteger(id)||id<=0||!body.success){res.status(400).json({error:"Programma non valido"});return;}
 if(!canManageTeams(req)&&!canEditTeamSchedule(req)){res.status(403).json({error:"Non autorizzato a gestire i programmi"});return;}
 const sections=await resolveAllowedClubSections(req,undefined);
 try {
  await ensureSessionPlans();
  await db.transaction(async tx=>{
   const teams=await lockTrainingPrograms(tx,clubId),team=teams.find(team=>team.id===id);
   const targets=teams.filter(team=>team.id===id||team.id===body.data.referenceTeamId);
   if(!team||targets.some(team=>sections&&!sections.includes(team.clubSection)))throw new TrainingProgramError("Squadra non accessibile",403);
   if(!canManageTeams(req))for(const target of targets){
    const [assignment]=await tx.select({id:teamStaffAssignmentsTable.id}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.teamId,target.id),eq(teamStaffAssignmentsTable.userId,userId)));
    if(target.coachId!==userId&&!assignment)throw new TrainingProgramError("Puoi collegare solo squadre assegnate. Per altre squadre interviene la segreteria.",403);
   }
   if(new Date(body.data.expectedUpdatedAt).getTime()!==new Date(team.updatedAt).getTime())throw new TrainingProgramError("Il programma è cambiato. Riapri la scheda squadra prima di salvare.");
   const reference=teams.find(item=>item.id===body.data.referenceTeamId);
   if(reference&&(!body.data.expectedReferenceUpdatedAt||new Date(body.data.expectedReferenceUpdatedAt).getTime()!==new Date(reference.updatedAt).getTime()))throw new TrainingProgramError("Il programma della squadra di riferimento è cambiato. Riapri la scheda prima di collegarla.");
   const before=new Map(teams.map(team=>[team.id,JSON.stringify(team.trainingSchedule)]));
   const next=await setTrainingProgram(tx,teams,team,body.data.referenceTeamId,body.data.effectiveFrom,body.data.trainingSchedule);
   // Reconcile first to reject prepared-source conflicts before creating any new drafts.
   await reconcileProgramSessions(tx,next,clubId);
   const affected=new Set([id,...next.filter(team=>before.get(team.id)!==JSON.stringify(team.trainingSchedule)).map(team=>team.id),...next.filter(team=>team.trainingSchedule?.some(slot=>slot.jointTeamId===id)).map(team=>team.id),...(body.data.referenceTeamId?[body.data.referenceTeamId]:[])]);
   for(const current of next.filter(team=>affected.has(team.id))){const result=await syncTrainingDrafts(tx,current,userId);if(result.reason)throw new TrainingProgramError("Imposta prima le date degli allenamenti o una stagione attiva per "+current.name+". "+result.reason,400);}
   await reconcileProgramSessions(tx,next,clubId);
  });
  res.json({ok:true});
 }catch(error){if(error instanceof TrainingProgramError){res.status(error.status).json({error:error.message});return;}throw error;}
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

  if (process.env.NODE_ENV !== "production") {
    console.log("[PATCH /teams/:id] id=%d parsed.data=%j", params.data.id, parsed.data);
  }

  const teamData = teamPayloadForSession(parsed.data, req);
  if (!canManageTeams(req) && !(canEditTeamSchedule(req) && isScheduleOnlyUpdate(teamData))) {
    res.status(403).json({ error: "Non autorizzato a modificare squadre" });
    return;
  }

  if(!canManageTeams(req)){
    const [target]=await db.select({coachId:teamsTable.coachId}).from(teamsTable).where(and(eq(teamsTable.id,params.data.id),eq(teamsTable.clubId,req.session.clubId!))).limit(1);
    const [assignment]=await db.select({id:teamStaffAssignmentsTable.id}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,req.session.clubId!),eq(teamStaffAssignmentsTable.teamId,params.data.id),eq(teamStaffAssignmentsTable.userId,req.session.userId!))).limit(1);
    if(!target||(!assignment&&target.coachId!==req.session.userId)){res.status(403).json({error:"Puoi modificare gli orari solo delle squadre assegnate"});return;}
  }

  if(Object.prototype.hasOwnProperty.call(teamData,"trainingSchedule")){
    const teams=await db.select().from(teamsTable).where(eq(teamsTable.clubId,req.session.clubId!));
    if(teams.some(team=>team.id===params.data.id?team.trainingSchedule?.some(slot=>slot.validFrom||slot.validUntil||slot.jointTeamId):team.trainingSchedule?.some(slot=>slot.jointTeamId===params.data.id))){res.status(409).json({error:"Questo programma ha uno storico o squadre congiunte: modifica da Giorni e orari di allenamento, indicando la data di decorrenza."});return;}
    if((teamData.trainingSchedule as any[])?.some(slot=>slot.validFrom||slot.validUntil||slot.jointTeamId)){res.status(400).json({error:"I collegamenti si configurano da Programma allenamenti"});return;}
  }

  let programConflict=false;
  const [team] = await db.transaction(async tx=>{
    const currentTeams=await lockTrainingPrograms(tx,req.session.clubId!);
    if(Object.prototype.hasOwnProperty.call(teamData,"trainingSchedule")&&currentTeams.some(team=>team.id===params.data.id?team.trainingSchedule?.some(slot=>slot.validFrom||slot.validUntil||slot.jointTeamId):team.trainingSchedule?.some(slot=>slot.jointTeamId===params.data.id))){programConflict=true;return [];}
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-team|${req.session.clubId}|${params.data.id}`}))`);
    const rows=await tx.update(teamsTable).set(teamData).where(and(eq(teamsTable.id,params.data.id),eq(teamsTable.clubId,req.session.clubId!))).returning();
    if(rows[0]&&["trainingSchedule","seasonTrainingStartDate","officialTrainingEndDate","seasonId"].some(key=>Object.prototype.hasOwnProperty.call(teamData,key)))await syncTrainingDrafts(tx,rows[0],req.session.userId!);
    return rows;
  });

  if(programConflict){res.status(409).json({error:"Il programma è cambiato: riapri Giorni e orari dalla scheda squadra."});return;}
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }

  if (team.clubSection) {
    await db
      .update(playersTable)
      .set({ clubSection: team.clubSection })
      .where(and(eq(playersTable.clubId, req.session.clubId!), eq(playersTable.teamId, team.id)));
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

function extractSupplementalTeamId(notes?: string | null): number | null {
  const full = String(notes ?? "").trim();
  const marker = "[FTB_PLAYER_META]";
  const markerIdx = full.indexOf(marker);
  if (markerIdx < 0) return null;
  const metaStart = markerIdx + marker.length;
  const nextNewLineIdx = full.indexOf("\n", metaStart);
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(metaStart, nextNewLineIdx).trim()
    : full.slice(metaStart).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as { supplementalTeamId?: unknown };
    const n = Number(parsed?.supplementalTeamId);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function extractSupplementalSpecificRole(notes?: string | null): string | null {
  const full = String(notes ?? "").trim();
  const marker = "[FTB_PLAYER_META]";
  const markerIdx = full.indexOf(marker);
  if (markerIdx < 0) return null;
  const metaStart = markerIdx + marker.length;
  const nextNewLineIdx = full.indexOf("\n", metaStart);
  const encodedMeta = nextNewLineIdx >= 0 ? full.slice(metaStart, nextNewLineIdx).trim() : full.slice(metaStart).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as { supplementalSpecificRole?: unknown };
    const role = String(parsed?.supplementalSpecificRole ?? "").trim();
    return role || null;
  } catch {
    return null;
  }
}

// GET /teams/:id/members — returns primary and supplemental players for a team.
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
      teamId: playersTable.teamId,
      notes: playersTable.notes,
      available: playersTable.available,
    })
    .from(playersTable)
    .where(eq(playersTable.clubId, req.session.clubId!));

  const teamPlayers = players
    .map((p) => ({ ...p, isSupplemental: p.teamId !== teamId && extractSupplementalTeamId(p.notes) === teamId }))
    .filter((p) => p.teamId === teamId || p.isSupplemental);

  res.json(teamPlayers.map(p => ({
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    role: p.isSupplemental ? extractSupplementalSpecificRole(p.notes) ?? p.position ?? null : p.position ?? null,
    jerseyNumber: p.jerseyNumber ?? null,
    teamId: p.teamId ?? null,
    available: p.available ?? true,
    isSupplemental: p.isSupplemental,
  })));
});

router.delete("/teams/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canManageTeams(req)) {
    res.status(403).json({ error: "Non autorizzato a eliminare squadre" });
    return;
  }

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
