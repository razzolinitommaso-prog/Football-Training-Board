import { Router, type IRouter } from "express";
import {
  db,
  exercisesTable,
  trainingSessionExercisesTable,
  trainingGuidelinesTable,
  teamsTable,
  teamStaffAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, isNull, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const STAFF_RESTRICTED_ROLES = ["coach", "fitness_coach", "athletic_director"];
const EXERCISE_ELEVATED_ROLES = ["admin", "presidente", "director", "technical_director"];

/**
 * Risolve lo stato della lavagna applicando la priorità:
 * 1. statoLavagnaJson  (primario)
 * 2. drawingElementsJson (legacy, deprecated)
 * 3. drawingData (legacy, deprecated)
 */
function resolveStatoLavagna(ex: typeof exercisesTable.$inferSelect): string | null {
  return ex.statoLavagnaJson ?? ex.drawingElementsJson ?? ex.drawingData ?? null;
}

/**
 * Arricchisce un exercise con il campo virtuale _statoLavagnaRisolto
 * (fallback trasparente, i campi originali restano inalterati)
 */
function withResolvedBoard<T extends typeof exercisesTable.$inferSelect>(ex: T) {
  return { ...ex, _statoLavagnaRisolto: resolveStatoLavagna(ex) };
}

async function getAssignedTeamIds(clubId: number, userId: number) {
  const assigned = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(eq(teamStaffAssignmentsTable.userId, userId), eq(teamStaffAssignmentsTable.clubId, clubId)));
  const coached = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)));
  return [...new Set([...assigned.map((a) => a.teamId), ...coached.map((t) => t.id)])];
}

async function canAccessTeamForRestrictedRole(clubId: number, userId: number, teamId: number | null): Promise<boolean> {
  if (!teamId) return true;
  const ids = await getAssignedTeamIds(clubId, userId);
  return ids.includes(teamId);
}

async function enrichExercise(ex: typeof exercisesTable.$inferSelect) {
  let creatorName: string | null = null;
  if (ex.createdByUserId) {
    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, ex.createdByUserId));
    if (creator) creatorName = `${creator.firstName} ${creator.lastName}`;
  }
  let originalCreatedByName: string | null = null;
  if (ex.sourceExerciseId) {
    const [source] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, ex.sourceExerciseId));
    if (source?.createdByUserId) {
      const [sourceCreator] = await db.select().from(usersTable).where(eq(usersTable.id, source.createdByUserId));
      if (sourceCreator) originalCreatedByName = `${sourceCreator.firstName} ${sourceCreator.lastName}`;
    }
  }
  return { ...withResolvedBoard(ex), creatorName, originalCreatedByName };
}

router.get("/exercises", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const conditions = [eq(exercisesTable.clubId, clubId)];
  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    const assignedTeamIds = await getAssignedTeamIds(clubId, userId);
    const teamScope =
      assignedTeamIds.length > 0
        ? or(inArray(exercisesTable.teamId, assignedTeamIds), isNull(exercisesTable.teamId))
        : isNull(exercisesTable.teamId);
    conditions.push(or(eq(exercisesTable.createdByUserId, userId), isNull(exercisesTable.createdByUserId)) as any);
    conditions.push(teamScope as any);
  }
  const exercises = await db
    .select()
    .from(exercisesTable)
    .where(and(...conditions))
    .orderBy(desc(exercisesTable.createdAt));
  const enriched = await Promise.all(exercises.map((ex) => enrichExercise(ex)));
  res.json(enriched);
});

router.get("/exercises/drafts", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const conditions = [eq(exercisesTable.clubId, clubId), eq(exercisesTable.isDraft, true)];
  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    const assignedTeamIds = await getAssignedTeamIds(clubId, userId);
    const teamScope =
      assignedTeamIds.length > 0
        ? or(inArray(exercisesTable.teamId, assignedTeamIds), isNull(exercisesTable.teamId))
        : isNull(exercisesTable.teamId);
    // Drafts must be strictly owned by the current user (no legacy fallback),
    // otherwise staff may see other people's unfinished work.
    conditions.push(eq(exercisesTable.createdByUserId, userId));
    conditions.push(teamScope as any);
  }
  const drafts = await db
    .select({
      id: exercisesTable.id,
      title: exercisesTable.title,
      trainingDay: exercisesTable.trainingDay,
      createdByUserId: exercisesTable.createdByUserId,
    })
    .from(exercisesTable)
    .where(and(...conditions))
    .orderBy(desc(exercisesTable.createdAt));
  res.json(drafts);
});

// Teams available to the current user for exercise tagging
// IMPORTANT: must be defined BEFORE /exercises/:id to avoid route capture
router.get("/exercises/my-teams", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const adminRoles = ["admin", "presidente", "director", "technical_director"];

  if (adminRoles.includes(role)) {
    const teams = await db.select({ id: teamsTable.id, name: teamsTable.name, clubSection: teamsTable.clubSection })
      .from(teamsTable).where(eq(teamsTable.clubId, clubId)).orderBy(asc(teamsTable.name));
    res.json(teams); return;
  }

  // Staff assignments
  const assigned = await db.select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(eq(teamStaffAssignmentsTable.userId, userId), eq(teamStaffAssignmentsTable.clubId, clubId)));
  // Direct coach teams
  const coached = await db.select({ id: teamsTable.id })
    .from(teamsTable).where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)));

  const ids = [...new Set([...assigned.map(a => a.teamId), ...coached.map(t => t.id)])];
  if (ids.length === 0) { res.json([]); return; }

  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name, clubSection: teamsTable.clubSection })
    .from(teamsTable).where(and(eq(teamsTable.clubId, clubId), inArray(teamsTable.id, ids))).orderBy(asc(teamsTable.name));
  res.json(teams);
});

// GET single exercise — defined AFTER named sub-paths (drafts, my-teams) to avoid capture
router.get("/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [exercise] = await db.select().from(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, clubId)));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    if (exercise.createdByUserId !== null && exercise.createdByUserId !== userId) {
      res.status(403).json({ error: "Puoi accedere solo alle tue esercitazioni" });
      return;
    }
    const hasTeamAccess = await canAccessTeamForRestrictedRole(clubId, userId, exercise.teamId ?? null);
    if (!hasTeamAccess) {
      res.status(403).json({ error: "La squadra di questa esercitazione non è assegnata al tuo profilo" });
      return;
    }
  }
  res.json(await enrichExercise(exercise));
});

router.post("/exercises", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const {
    title, category, description, durationMinutes, playersRequired, equipment,
    // Legacy fields (deprecated) — mantenuti per retrocompatibilità, NON usati come fonte primaria
    drawingData, drawingElementsJson,
    // Fonte primaria lavagna
    statoLavagnaJson,
    // Anteprima immagine — predisposizione campo
    immagineAnteprima,
    voiceNoteData, videoNoteData, caricaRosaIntera, scegliGiocatori, selectedPlayerIdsJson, isDraft, teamId, trainingDay, trainingSession, principio, trainingPhase,
    sourceExerciseId,
  } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    const hasTeamAccess = await canAccessTeamForRestrictedRole(clubId, userId, teamId ?? null);
    if (!hasTeamAccess) {
      res.status(403).json({ error: "Puoi creare esercitazioni solo sulle annate assegnate" });
      return;
    }
  }
  let normalizedSourceExerciseId: number | null = null;
  if (sourceExerciseId !== undefined && sourceExerciseId !== null) {
    const sourceId = Number(sourceExerciseId);
    if (!Number.isFinite(sourceId)) {
      res.status(400).json({ error: "sourceExerciseId non valido" });
      return;
    }
    const [source] = await db
      .select()
      .from(exercisesTable)
      .where(and(eq(exercisesTable.id, sourceId), eq(exercisesTable.clubId, clubId)));
    if (!source) {
      res.status(404).json({ error: "Esercitazione origine non trovata" });
      return;
    }
    normalizedSourceExerciseId = source.sourceExerciseId ?? source.id;
  }
  const [exercise] = await db.insert(exercisesTable).values({
    clubId, title, category: category ?? null, description: description ?? null,
    durationMinutes: durationMinutes ?? null, playersRequired: playersRequired ?? null, equipment: equipment ?? null,
    // Legacy (deprecated) — scritti solo se presenti nel body per retrocompatibilità client precedenti
    drawingData: drawingData ?? null,
    drawingElementsJson: drawingElementsJson ?? null,
    // Fonte primaria
    statoLavagnaJson: statoLavagnaJson ?? null,
    immagineAnteprima: immagineAnteprima ?? null,
    voiceNoteData: voiceNoteData ?? null,
    videoNoteData: videoNoteData ?? null,
    caricaRosaIntera: caricaRosaIntera ?? false,
    scegliGiocatori: scegliGiocatori ?? false,
    selectedPlayerIdsJson: selectedPlayerIdsJson ?? null,
    isDraft: isDraft ?? false,
    teamId: teamId ?? null,
    trainingDay: trainingDay ?? null,
    trainingSession: trainingSession ?? null,
    principio: principio ?? null,
    trainingPhase: trainingPhase ?? null,
    createdByUserId: userId,
    sourceExerciseId: normalizedSourceExerciseId,
  }).returning();
  res.status(201).json(await enrichExercise(exercise));
});

router.patch("/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const {
    title, category, description, durationMinutes, playersRequired, equipment,
    // Legacy (deprecated)
    drawingData, drawingElementsJson,
    // Fonte primaria
    statoLavagnaJson,
    immagineAnteprima,
    voiceNoteData, videoNoteData, caricaRosaIntera, scegliGiocatori, selectedPlayerIdsJson, isDraft, teamId, trainingDay, trainingSession, principio, trainingPhase, sourceExerciseId,
  } = req.body;
  const [existing] = await db
    .select()
    .from(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, clubId)));
  if (!existing) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (!EXERCISE_ELEVATED_ROLES.includes(role) && existing.createdByUserId !== null && existing.createdByUserId !== userId) {
    res.status(403).json({ error: "Puoi modificare solo le tue esercitazioni" });
    return;
  }
  if (STAFF_RESTRICTED_ROLES.includes(role)) {
    const requestedTeamId = teamId !== undefined ? (teamId ?? null) : (existing.teamId ?? null);
    const hasTeamAccess = await canAccessTeamForRestrictedRole(clubId, userId, requestedTeamId);
    if (!hasTeamAccess) {
      res.status(403).json({ error: "Puoi modificare solo esercitazioni delle annate assegnate" });
      return;
    }
  }
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (category !== undefined) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (durationMinutes !== undefined) updates.durationMinutes = durationMinutes;
  if (playersRequired !== undefined) updates.playersRequired = playersRequired;
  if (equipment !== undefined) updates.equipment = equipment;
  // Legacy (deprecated) — aggiornati solo se presenti per retrocompatibilità
  if (drawingData !== undefined) updates.drawingData = drawingData;
  if (drawingElementsJson !== undefined) updates.drawingElementsJson = drawingElementsJson;
  // Fonte primaria
  if (statoLavagnaJson !== undefined) updates.statoLavagnaJson = statoLavagnaJson;
  if (immagineAnteprima !== undefined) updates.immagineAnteprima = immagineAnteprima;
  if (voiceNoteData !== undefined) updates.voiceNoteData = voiceNoteData;
  if (videoNoteData !== undefined) updates.videoNoteData = videoNoteData;
  if (caricaRosaIntera !== undefined) updates.caricaRosaIntera = caricaRosaIntera;
  if (scegliGiocatori !== undefined) updates.scegliGiocatori = scegliGiocatori;
  if (selectedPlayerIdsJson !== undefined) updates.selectedPlayerIdsJson = selectedPlayerIdsJson;
  if (isDraft !== undefined) updates.isDraft = isDraft;
  if (teamId !== undefined) updates.teamId = teamId;
  if (trainingDay !== undefined) updates.trainingDay = trainingDay;
  if (trainingSession !== undefined) updates.trainingSession = trainingSession;
  if (principio !== undefined) updates.principio = principio;
  if (trainingPhase !== undefined) updates.trainingPhase = trainingPhase;
  if (sourceExerciseId !== undefined) updates.sourceExerciseId = sourceExerciseId;
  const [exercise] = await db.update(exercisesTable).set(updates)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, clubId))).returning();
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  res.json(await enrichExercise(exercise));
});

router.delete("/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db
    .select()
    .from(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, clubId)));
  if (!existing) { res.status(404).json({ error: "Exercise not found" }); return; }
  if (!EXERCISE_ELEVATED_ROLES.includes(role) && existing.createdByUserId !== null && existing.createdByUserId !== userId) {
    res.status(403).json({ error: "Puoi eliminare solo le tue esercitazioni" });
    return;
  }
  const [exercise] = await db.delete(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, clubId))).returning();
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  res.sendStatus(204);
});

// ── Training Guidelines Board ─────────────────────────────────────────────

router.get("/training-guidelines", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(trainingGuidelinesTable)
    .where(eq(trainingGuidelinesTable.clubId, req.session.clubId!))
    .orderBy(asc(trainingGuidelinesTable.sortOrder), asc(trainingGuidelinesTable.createdAt));
  // For each guideline, optionally attach the linked exercise title
  const enriched = await Promise.all(rows.map(async (g) => {
    if (!g.linkedExerciseId) return { ...g, linkedExercise: null };
    const [ex] = await db.select({ id: exercisesTable.id, title: exercisesTable.title })
      .from(exercisesTable).where(eq(exercisesTable.id, g.linkedExerciseId));
    return { ...g, linkedExercise: ex ?? null };
  }));
  res.json(enriched);
});

router.post("/training-guidelines", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "technical_director") {
    res.status(403).json({ error: "Solo il Direttore Tecnico può gestire le linee guida" }); return;
  }
  const { title, content, category, linkedExerciseId, sortOrder } = req.body;
  if (!title || !content) { res.status(400).json({ error: "title e content obbligatori" }); return; }
  const [row] = await db.insert(trainingGuidelinesTable).values({
    clubId: req.session.clubId!, title, content,
    category: category ?? "general",
    linkedExerciseId: linkedExerciseId ? Number(linkedExerciseId) : null,
    sortOrder: sortOrder ?? 0,
    createdByUserId: req.session.userId,
  }).returning();
  res.status(201).json(row);
});

router.patch("/training-guidelines/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "technical_director") {
    res.status(403).json({ error: "Solo il Direttore Tecnico può gestire le linee guida" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "id non valido" }); return; }
  const { title, content, category, linkedExerciseId, sortOrder } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (category !== undefined) updates.category = category;
  if (linkedExerciseId !== undefined) updates.linkedExerciseId = linkedExerciseId ? Number(linkedExerciseId) : null;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  const [row] = await db.update(trainingGuidelinesTable).set(updates)
    .where(and(eq(trainingGuidelinesTable.id, id), eq(trainingGuidelinesTable.clubId, req.session.clubId!)))
    .returning();
  if (!row) { res.status(404).json({ error: "Non trovato" }); return; }
  res.json(row);
});

router.delete("/training-guidelines/:id", requireAuth, async (req, res): Promise<void> => {
  if (req.session.role !== "technical_director") {
    res.status(403).json({ error: "Solo il Direttore Tecnico può gestire le linee guida" }); return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "id non valido" }); return; }
  await db.delete(trainingGuidelinesTable)
    .where(and(eq(trainingGuidelinesTable.id, id), eq(trainingGuidelinesTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/training-sessions/:id/exercises", requireAuth, async (req, res): Promise<void> => {
  const sessionId = parseInt(String(req.params.id));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const links = await db.select().from(trainingSessionExercisesTable)
    .where(eq(trainingSessionExercisesTable.trainingSessionId, sessionId));
  const enriched = await Promise.all(links.map(async (l) => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, l.exerciseId));
    return { ...l, exercise: ex ? await enrichExercise(ex) : null };
  }));
  res.json(enriched);
});

router.post("/training-sessions/:id/exercises", requireAuth, async (req, res): Promise<void> => {
  const sessionId = parseInt(String(req.params.id));
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { exerciseId, order, notes } = req.body;
  if (!exerciseId) { res.status(400).json({ error: "exerciseId required" }); return; }
  const [link] = await db.insert(trainingSessionExercisesTable).values({
    trainingSessionId: sessionId, exerciseId: Number(exerciseId), order: order ?? 0, notes: notes ?? null,
  }).returning();
  res.status(201).json(link);
});

router.delete("/training-sessions/:sessionId/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(trainingSessionExercisesTable).where(eq(trainingSessionExercisesTable.id, id));
  res.sendStatus(204);
});

export default router;
