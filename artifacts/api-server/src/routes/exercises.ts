import { Router, type IRouter } from "express";
import { db, exercisesTable, trainingSessionExercisesTable, trainingGuidelinesTable, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

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

router.get("/exercises", requireAuth, async (req, res): Promise<void> => {
  const exercises = await db.select().from(exercisesTable)
    .where(eq(exercisesTable.clubId, req.session.clubId!))
    .orderBy(desc(exercisesTable.createdAt));
  res.json(exercises.map(withResolvedBoard));
});

router.get("/exercises/drafts", requireAuth, async (req, res): Promise<void> => {
  const drafts = await db.select({ id: exercisesTable.id, title: exercisesTable.title, trainingDay: exercisesTable.trainingDay })
    .from(exercisesTable)
    .where(and(eq(exercisesTable.clubId, req.session.clubId!), eq(exercisesTable.isDraft, true)))
    .orderBy(desc(exercisesTable.createdAt));
  res.json(drafts);
});

// Teams available to the current user for exercise tagging
// IMPORTANT: must be defined BEFORE /exercises/:id to avoid route capture
router.get("/exercises/my-teams", requireAuth, async (req, res): Promise<void> => {
  const { clubId, userId, role } = req.session as { clubId: number; userId: number; role: string };
  const adminRoles = ["admin", "presidente", "technical_director", "athletic_director"];

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
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [exercise] = await db.select().from(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, req.session.clubId!)));
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  res.json(withResolvedBoard(exercise));
});

router.post("/exercises", requireAuth, async (req, res): Promise<void> => {
  const {
    title, category, description, durationMinutes, playersRequired, equipment,
    // Legacy fields (deprecated) — mantenuti per retrocompatibilità, NON usati come fonte primaria
    drawingData, drawingElementsJson,
    // Fonte primaria lavagna
    statoLavagnaJson,
    // Anteprima immagine — predisposizione campo
    immagineAnteprima,
    voiceNoteData, isDraft, teamId, trainingDay, principio, trainingPhase,
  } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const [exercise] = await db.insert(exercisesTable).values({
    clubId: req.session.clubId!, title, category: category ?? null, description: description ?? null,
    durationMinutes: durationMinutes ?? null, playersRequired: playersRequired ?? null, equipment: equipment ?? null,
    // Legacy (deprecated) — scritti solo se presenti nel body per retrocompatibilità client precedenti
    drawingData: drawingData ?? null,
    drawingElementsJson: drawingElementsJson ?? null,
    // Fonte primaria
    statoLavagnaJson: statoLavagnaJson ?? null,
    immagineAnteprima: immagineAnteprima ?? null,
    voiceNoteData: voiceNoteData ?? null,
    isDraft: isDraft ?? false,
    teamId: teamId ?? null,
    trainingDay: trainingDay ?? null,
    principio: principio ?? null,
    trainingPhase: trainingPhase ?? null,
  }).returning();
  res.status(201).json(withResolvedBoard(exercise));
});

router.patch("/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const {
    title, category, description, durationMinutes, playersRequired, equipment,
    // Legacy (deprecated)
    drawingData, drawingElementsJson,
    // Fonte primaria
    statoLavagnaJson,
    immagineAnteprima,
    voiceNoteData, isDraft, teamId, trainingDay, principio, trainingPhase,
  } = req.body;
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
  if (isDraft !== undefined) updates.isDraft = isDraft;
  if (teamId !== undefined) updates.teamId = teamId;
  if (trainingDay !== undefined) updates.trainingDay = trainingDay;
  if (principio !== undefined) updates.principio = principio;
  if (trainingPhase !== undefined) updates.trainingPhase = trainingPhase;
  const [exercise] = await db.update(exercisesTable).set(updates)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, req.session.clubId!))).returning();
  if (!exercise) { res.status(404).json({ error: "Exercise not found" }); return; }
  res.json(withResolvedBoard(exercise));
});

router.delete("/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [exercise] = await db.delete(exercisesTable)
    .where(and(eq(exercisesTable.id, id), eq(exercisesTable.clubId, req.session.clubId!))).returning();
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
  const id = parseInt(req.params.id);
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
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "id non valido" }); return; }
  await db.delete(trainingGuidelinesTable)
    .where(and(eq(trainingGuidelinesTable.id, id), eq(trainingGuidelinesTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

// ─────────────────────────────────────────────────────────────────────────────

router.get("/training-sessions/:id/exercises", requireAuth, async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.id);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const links = await db.select().from(trainingSessionExercisesTable)
    .where(eq(trainingSessionExercisesTable.trainingSessionId, sessionId));
  const enriched = await Promise.all(links.map(async (l) => {
    const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, l.exerciseId));
    return { ...l, exercise: ex ? withResolvedBoard(ex) : null };
  }));
  res.json(enriched);
});

router.post("/training-sessions/:id/exercises", requireAuth, async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params.id);
  if (isNaN(sessionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { exerciseId, order, notes } = req.body;
  if (!exerciseId) { res.status(400).json({ error: "exerciseId required" }); return; }
  const [link] = await db.insert(trainingSessionExercisesTable).values({
    trainingSessionId: sessionId, exerciseId: Number(exerciseId), order: order ?? 0, notes: notes ?? null,
  }).returning();
  res.status(201).json(link);
});

router.delete("/training-sessions/:sessionId/exercises/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(trainingSessionExercisesTable).where(eq(trainingSessionExercisesTable.id, id));
  res.sendStatus(204);
});

export default router;
