import { motorTestsRouter } from "./motor-tests";
import { Router, type IRouter } from "express";
import { db, fitnessProgramsTable, playerFitnessDataTable, playersTable, teamsTable, clubMembershipsTable } from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { FITNESS_DASHBOARD_ROLES, FITNESS_RESULTS_ROLES, FITNESS_RESULTS_WRITE_ROLES } from "@workspace/api-zod";
import { getPlayerMeasurementTeamScope, canAccessPlayerMeasurements, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { supplementalTrainingTeam } from "../lib/training-roster-policy";
import { ensurePlayerMeasurementStorage, refreshPlayerMeasurements } from "../lib/player-measurements";
import { ensureMotorTestStorage } from "../lib/motor-test-storage";
import type { Request } from "express";

const observedRoles = ["GK", "DEF", "MID", "FWD"];

function readMeasurements(body: Record<string, unknown>) {
  const { heightCm, weightKg, observedRole } = body;
  const validMeasurement = (value: unknown) => value == null ||
    (typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!validMeasurement(heightCm) || !validMeasurement(weightKg) ||
    (observedRole != null && (typeof observedRole !== "string" || !observedRoles.includes(observedRole)))) return null;
  return { heightCm: heightCm as number | null | undefined, weightKg: weightKg as number | null | undefined,
    observedRole: observedRole as string | null | undefined };
}

const router: IRouter = Router();
const FITNESS_VIEW_ROLES = ["admin", "presidente", "director", "technical_director", "secretary", "coach", "fitness_coach", "athletic_director"];
const FITNESS_MANAGE_ROLES = ["admin", "presidente", "director", "technical_director", "fitness_coach", "athletic_director"];

function canViewFitness(role?: string | null): boolean {
  return FITNESS_VIEW_ROLES.includes(role ?? "");
}

function canManageFitness(role?: string | null): boolean {
  return FITNESS_MANAGE_ROLES.includes(role ?? "");
}

let fitnessSchemaReady: Promise<void> | null = null;
function ensureFitnessSchema() {
  if (!fitnessSchemaReady) {
    fitnessSchemaReady = Promise.all([
      ensurePlayerMeasurementStorage(), ensureMotorTestStorage(),
      db.execute(sql`ALTER TABLE fitness_programs ADD COLUMN IF NOT EXISTS plan_json TEXT`),
      db.execute(sql`ALTER TABLE fitness_programs ADD COLUMN IF NOT EXISTS materials TEXT`),
      db.execute(sql`ALTER TABLE fitness_programs ADD COLUMN IF NOT EXISTS board_notes TEXT`),
      db.execute(sql`ALTER TABLE player_fitness_data ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'test_atletico'`),
      db.execute(sql`ALTER TABLE player_fitness_data ADD COLUMN IF NOT EXISTS training_session_id INTEGER`),
      db.execute(sql`ALTER TABLE player_fitness_data ADD COLUMN IF NOT EXISTS parent_note TEXT`),
    ]).then(() => undefined);
  }
  return fitnessSchemaReady;
}

async function teamBelongsToClub(teamId: unknown, clubId: number): Promise<boolean> {
  if (teamId == null || teamId === "") return true;
  const id = Number(teamId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).where(and(eq(teamsTable.id, id), eq(teamsTable.clubId, clubId))).limit(1);
  return !!team;
}

async function playerBelongsToClub(playerId: unknown, clubId: number): Promise<boolean> {
  const id = Number(playerId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.id, id), eq(playersTable.clubId, clubId))).limit(1);
  return !!player;
}

async function playersBelongToClub(playerIds: unknown, clubId: number): Promise<number[]> {
  const ids = Array.isArray(playerIds)
    ? playerIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];
  const rows = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, uniqueIds)));
  return rows.map((row) => row.id);
}

async function enrichProgram(program: typeof fitnessProgramsTable.$inferSelect) {
  const row = program as typeof fitnessProgramsTable.$inferSelect & {
    planJson?: string | null;
    materials?: string | null;
    boardNotes?: string | null;
  };
  let teamName: string | null = null;
  if (program.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, program.teamId), eq(teamsTable.clubId, program.clubId)));
    if (team) teamName = team.name;
  }
  return {
    ...program,
    teamId: program.teamId ?? null,
    teamName,
    description: program.description ?? null,
    durationWeeks: program.durationWeeks ?? null,
    planJson: row.planJson ?? null,
    materials: row.materials ?? null,
    boardNotes: row.boardNotes ?? null,
    createdBy: program.createdBy ?? null,
  };
}

async function canWriteMeasurements(req: Request, playerId: number) {
  const scope = await getPlayerMeasurementTeamScope(req);
  if (scope === null) return true;
  const [player] = await db.select({ teamId: playersTable.teamId, notes: playersTable.notes }).from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, req.session.clubId!))).limit(1);
  return player != null && canAccessPlayerMeasurements(scope, player.teamId ?? supplementalTrainingTeam(player.notes));
}

async function enrichFitnessData(data: typeof playerFitnessDataTable.$inferSelect, scope: Set<number> | null = null) {
  const row = data as typeof playerFitnessDataTable.$inferSelect & {
    activityType?: string | null;
    trainingSessionId?: number | null;
    parentNote?: string | null;
  };
  const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, data.playerId), eq(playersTable.clubId, data.clubId)));
  const [team] = player?.teamId
    ? await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, data.clubId))).limit(1)
    : [null];
  const canRead = canAccessPlayerMeasurements(scope, player?.teamId ?? supplementalTrainingTeam(player?.notes ?? null));
  return {
    ...data,
    heightCm: canRead ? data.heightCm : null,
    weightKg: canRead ? data.weightKg : null,
    observedRole: canRead ? data.observedRole : null,
    playerName: player ? `${player.firstName} ${player.lastName}` : null,
    teamId: player?.teamId ?? null,
    teamName: team?.name ?? null,
    endurance: data.endurance ?? null,
    strength: data.strength ?? null,
    speed: data.speed ?? null,
    activityType: row.activityType ?? "test_atletico",
    trainingSessionId: row.trainingSessionId ?? null,
    parentNote: row.parentNote ?? null,
    notes: data.notes ?? null,
    recordedBy: data.recordedBy ?? null,
  };
}

router.get("/fitness-programs", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!canViewFitness(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a visualizzare programmi atletici" });
    return;
  }
  const programs = await db
    .select()
    .from(fitnessProgramsTable)
    .where(eq(fitnessProgramsTable.clubId, req.session.clubId!))
    .orderBy(desc(fitnessProgramsTable.createdAt));

  const enriched = await Promise.all(programs.map(enrichProgram));
  res.json(enriched);
});

router.post("/fitness-programs", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!canManageFitness(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a gestire programmi atletici" });
    return;
  }
  const { title, teamId, description, durationWeeks, intensityLevel, planJson, materials, boardNotes } = req.body;
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!(await teamBelongsToClub(teamId, req.session.clubId!))) {
    res.status(400).json({ error: "Squadra non valida" });
    return;
  }

  const [program] = await db
    .insert(fitnessProgramsTable)
    .values({
      title,
      clubId: req.session.clubId!,
      createdBy: req.session.userId!,
      teamId: teamId ?? null,
      description: description ?? null,
      durationWeeks: durationWeeks ?? null,
      intensityLevel: intensityLevel ?? "medium",
      planJson: planJson ?? null,
      materials: materials ?? null,
      boardNotes: boardNotes ?? null,
    })
    .returning();

  const enriched = await enrichProgram(program);
  res.status(201).json(enriched);
});

router.get("/fitness-programs/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!canViewFitness(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a visualizzare programmi atletici" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [program] = await db
    .select()
    .from(fitnessProgramsTable)
    .where(and(eq(fitnessProgramsTable.id, id), eq(fitnessProgramsTable.clubId, req.session.clubId!)));

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  const enriched = await enrichProgram(program);
  res.json(enriched);
});

router.patch("/fitness-programs/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!canManageFitness(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a gestire programmi atletici" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { title, teamId, description, durationWeeks, intensityLevel, planJson, materials, boardNotes } = req.body;
  if (teamId !== undefined && !(await teamBelongsToClub(teamId, req.session.clubId!))) {
    res.status(400).json({ error: "Squadra non valida" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (teamId !== undefined) updates.teamId = teamId;
  if (description !== undefined) updates.description = description;
  if (durationWeeks !== undefined) updates.durationWeeks = durationWeeks;
  if (intensityLevel !== undefined) updates.intensityLevel = intensityLevel;
  if (planJson !== undefined) updates.planJson = planJson;
  if (materials !== undefined) updates.materials = materials;
  if (boardNotes !== undefined) updates.boardNotes = boardNotes;

  const [program] = await db
    .update(fitnessProgramsTable)
    .set(updates)
    .where(and(eq(fitnessProgramsTable.id, id), eq(fitnessProgramsTable.clubId, req.session.clubId!)))
    .returning();

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  const enriched = await enrichProgram(program);
  res.json(enriched);
});

router.delete("/fitness-programs/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!canManageFitness(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a gestire programmi atletici" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [program] = await db
    .delete(fitnessProgramsTable)
    .where(and(eq(fitnessProgramsTable.id, id), eq(fitnessProgramsTable.clubId, req.session.clubId!)))
    .returning();

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }
  res.sendStatus(204);
});

async function canManageFitnessResults(req: Request) {
  const role = normalizeSessionRole(req.session.role);
  if (!FITNESS_RESULTS_WRITE_ROLES.includes(role) || !req.session.clubId || !req.session.userId) return false;
  const memberships = await db.select({ staffRole: clubMembershipsTable.staffRole, role: clubMembershipsTable.role })
    .from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId, req.session.clubId), eq(clubMembershipsTable.userId, req.session.userId)));
  return !memberships.some(member => normalizeSessionRole(member.role) === role &&
    ["collaboratore", "stagista"].includes(normalizeSessionRole(member.staffRole)));
}

router.get("/player-fitness-data/capabilities", requireAuth, async (req, res): Promise<void> => {
  res.json({ canEdit: await canManageFitnessResults(req) });
});

router.get("/player-fitness-data", requireAuth, async (req, res): Promise<void> => {
  const role = normalizeSessionRole(req.session.role);
  const overview = req.query.view === "dashboard";
  if (!req.session.clubId || (!FITNESS_RESULTS_ROLES.includes(role) && !canViewFitness(role)) ||
      (overview && !FITNESS_DASHBOARD_ROLES.includes(role))) {
    res.status(403).json({ error: "Non autorizzato a visualizzare i test atletici." }); return;
  }
  await ensureFitnessSchema();
  const clubId = req.session.clubId;
  const section = typeof req.query.section === "string" ? req.query.section : undefined;
  const [sections, scope] = await Promise.all([resolveAllowedClubSections(req, section), getPlayerMeasurementTeamScope(req)]);
  const playerId = req.query.playerId === undefined ? undefined : Number(req.query.playerId);
  const teamId = req.query.teamId === undefined ? undefined : Number(req.query.teamId);
  if ((playerId !== undefined && (!Number.isSafeInteger(playerId) || playerId <= 0)) ||
      (teamId !== undefined && (!Number.isSafeInteger(teamId) || teamId <= 0))) {
    res.status(400).json({ error: "Squadra o giocatore non validi." }); return;
  }
  const players = await db.select({
    id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName,
    dateOfBirth: playersTable.dateOfBirth, teamId: playersTable.teamId, notes: playersTable.notes,
  }).from(playersTable).where(and(
    eq(playersTable.clubId, clubId),
    playerId === undefined ? undefined : eq(playersTable.id, playerId),
    sections ? (sections.length ? inArray(playersTable.clubSection, sections) : sql`false`) : undefined,
  ));
  const allowed = new Map(players.filter(player => {
    const assigned = [player.teamId, supplementalTrainingTeam(player.notes)].filter(id => id != null);
    return teamId === undefined
      ? scope === null || assigned.some(id => canAccessPlayerMeasurements(scope, id))
      : assigned.includes(teamId) && canAccessPlayerMeasurements(scope, teamId);
  }).map(player => [player.id, player]));
  if (!allowed.size) { res.json(overview ? { total: 0, entries: [] } : []); return; }
  const publicResults = overview || req.query.view === "tests" || !canViewFitness(role);
  const conditions = and(eq(playerFitnessDataTable.clubId, clubId), inArray(playerFitnessDataTable.playerId, [...allowed.keys()]),
    publicResults ? sql`COALESCE(${playerFitnessDataTable.activityType}, 'test_atletico') = 'test_atletico'` : undefined);
  const ordering = [desc(playerFitnessDataTable.date), desc(playerFitnessDataTable.id)] as const;
  if (publicResults) {
    const query = db.select({
      id: playerFitnessDataTable.id, playerId: playerFitnessDataTable.playerId, date: playerFitnessDataTable.date,
      endurance: playerFitnessDataTable.endurance, strength: playerFitnessDataTable.strength, speed: playerFitnessDataTable.speed,
    }).from(playerFitnessDataTable).where(conditions).orderBy(...ordering);
    const [rows, total] = await Promise.all([
      overview ? query.limit(3) : query,
      overview ? db.$count(playerFitnessDataTable, conditions) : Promise.resolve(0),
    ]);
    const entries = rows.map(row => {
      const player = allowed.get(row.playerId)!;
      return { ...row, playerName: [player.firstName, player.lastName].join(" "), teamId: player.teamId ?? supplementalTrainingTeam(player.notes),
        birthYear: /^\d{4}/.exec(player.dateOfBirth ?? "")?.[0], activityType: "test_atletico", notes: null };
    });
    res.json(overview ? { total, entries } : entries);
    return;
  }
  const rows = await db.select().from(playerFitnessDataTable).where(conditions).orderBy(...ordering);
  res.json(await Promise.all(rows.map(row => enrichFitnessData(row, scope))));
});

router.post("/player-fitness-data", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!await canManageFitnessResults(req)) {
    res.status(403).json({ error: "Non autorizzato a gestire dati atletici" });
    return;
  }
  const { playerId, playerIds, date, endurance, strength, speed, notes, activityType, trainingSessionId, parentNote } = req.body;
  const measurements = readMeasurements(req.body);
  if (!measurements || (Array.isArray(playerIds) && [measurements.heightCm, measurements.weightKg, measurements.observedRole].some(value => value != null))) {
    res.status(400).json({ error: "Altezza, peso e ruolo osservato vanno registrati per un singolo giocatore." });
    return;
  }
  if (Array.isArray(playerIds) && playerIds.length === 0) { res.status(400).json({ error: "Seleziona almeno un giocatore." }); return; }
  const targetPlayerIds = Array.isArray(playerIds) ? await playersBelongToClub(playerIds, req.session.clubId!) : [];
  if ((!playerId && targetPlayerIds.length === 0) || !date) {
    res.status(400).json({ error: "playerId/playerIds and date are required" });
    return;
  }
  if (targetPlayerIds.length === 0 && !(await playerBelongsToClub(playerId, req.session.clubId!))) {
    res.status(400).json({ error: "Giocatore non valido" });
    return;
  }

  const requestedIds = Array.isArray(playerIds) ? [...new Set(playerIds.map(Number))] : [Number(playerId)];
  if ((Array.isArray(playerIds) && requestedIds.length !== targetPlayerIds.length) ||
      !(await Promise.all(requestedIds.map(id => canWriteMeasurements(req, id)))).every(Boolean)) {
    res.status(403).json({ error: "Giocatore fuori dalle squadre assegnate." }); return;
  }

  const insertRows = (targetPlayerIds.length > 0 ? targetPlayerIds : [Number(playerId)]).map((targetPlayerId) => ({
    playerId: targetPlayerId,
    date,
    clubId: req.session.clubId!,
    recordedBy: req.session.userId!,
    ...measurements,
    endurance: endurance != null ? Number(endurance) : null,
    strength: strength != null ? Number(strength) : null,
    speed: speed != null ? Number(speed) : null,
    activityType: activityType ?? "test_atletico",
    trainingSessionId: trainingSessionId != null ? Number(trainingSessionId) : null,
    parentNote: parentNote ?? null,
    notes: notes ?? null,
  }));
  const clubId = req.session.clubId!;
  const entries = await db.transaction(async tx => {
    await tx.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, insertRows.map(row => row.playerId)))).orderBy(playersTable.id).for("update");
    const saved = await tx.insert(playerFitnessDataTable).values(insertRows).returning();
    await refreshPlayerMeasurements(tx, clubId, insertRows.map(row => row.playerId));
    return saved;
  });

  const enriched = await Promise.all(entries.map(entry => enrichFitnessData(entry)));
  res.status(201).json(enriched.length === 1 ? enriched[0] : enriched);
});

router.patch("/player-fitness-data/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!await canManageFitnessResults(req)) {
    res.status(403).json({ error: "Non autorizzato a gestire dati atletici" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { date, endurance, strength, speed, notes, activityType, trainingSessionId, parentNote } = req.body;
  const measurements = readMeasurements(req.body);
  if (!measurements) {
    res.status(400).json({ error: "Misure o ruolo osservato non validi." });
    return;
  }
  const updates: Record<string, unknown> = Object.fromEntries(Object.entries(measurements).filter(([, value]) => value !== undefined));
  if (date !== undefined) updates.date = date;
  if (endurance !== undefined) updates.endurance = endurance != null ? Number(endurance) : null;
  if (strength !== undefined) updates.strength = strength != null ? Number(strength) : null;
  if (speed !== undefined) updates.speed = speed != null ? Number(speed) : null;
  if (activityType !== undefined) updates.activityType = activityType ?? "test_atletico";
  if (trainingSessionId !== undefined) updates.trainingSessionId = trainingSessionId != null ? Number(trainingSessionId) : null;
  if (parentNote !== undefined) updates.parentNote = parentNote;
  if (notes !== undefined) updates.notes = notes;

  const [existing] = await db.select({ playerId: playerFitnessDataTable.playerId }).from(playerFitnessDataTable)
    .where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!))).limit(1);
  if (existing && !(await canWriteMeasurements(req, existing.playerId))) {
    res.status(403).json({ error: "Giocatore fuori dalle squadre assegnate." }); return;
  }

  const [entry] = await db.transaction(async tx => {
    if (existing) await tx.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.id, existing.playerId), eq(playersTable.clubId, req.session.clubId!))).for("update");
    const saved = await tx.update(playerFitnessDataTable).set(updates).where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!))).returning();
    if (existing) await refreshPlayerMeasurements(tx, req.session.clubId!, [existing.playerId]);
    return saved;
  });

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  const enriched = await enrichFitnessData(entry, await getPlayerMeasurementTeamScope(req));
  res.json(enriched);
});

router.delete("/player-fitness-data/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureFitnessSchema();
  if (!await canManageFitnessResults(req)) {
    res.status(403).json({ error: "Non autorizzato a gestire dati atletici" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(playerFitnessDataTable)
    .where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!))).limit(1);
  if (existing && !(await canWriteMeasurements(req, existing.playerId))) {
    res.status(403).json({ error: "Giocatore fuori dalle squadre assegnate." });
    return;
  }
  const [entry] = await db.transaction(async tx => {
    if (existing) await tx.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.id, existing.playerId), eq(playersTable.clubId, req.session.clubId!))).for("update");
    const removed = await tx.delete(playerFitnessDataTable).where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!))).returning();
    if (existing) await refreshPlayerMeasurements(tx, req.session.clubId!, [existing.playerId]);
    return removed;
  });

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  res.sendStatus(204);
});

router.use(motorTestsRouter(canManageFitnessResults));
export default router;
