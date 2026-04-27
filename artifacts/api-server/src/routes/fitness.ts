import { Router, type IRouter } from "express";
import { db, fitnessProgramsTable, playerFitnessDataTable, playersTable, teamsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function enrichProgram(program: typeof fitnessProgramsTable.$inferSelect) {
  let teamName: string | null = null;
  if (program.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, program.teamId));
    if (team) teamName = team.name;
  }
  return {
    ...program,
    teamId: program.teamId ?? null,
    teamName,
    description: program.description ?? null,
    durationWeeks: program.durationWeeks ?? null,
    createdBy: program.createdBy ?? null,
  };
}

async function enrichFitnessData(data: typeof playerFitnessDataTable.$inferSelect) {
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, data.playerId));
  return {
    ...data,
    playerName: player ? `${player.firstName} ${player.lastName}` : null,
    endurance: data.endurance ?? null,
    strength: data.strength ?? null,
    speed: data.speed ?? null,
    notes: data.notes ?? null,
    recordedBy: data.recordedBy ?? null,
  };
}

router.get("/fitness-programs", requireAuth, async (req, res): Promise<void> => {
  const programs = await db
    .select()
    .from(fitnessProgramsTable)
    .where(eq(fitnessProgramsTable.clubId, req.session.clubId!))
    .orderBy(desc(fitnessProgramsTable.createdAt));

  const enriched = await Promise.all(programs.map(enrichProgram));
  res.json(enriched);
});

router.post("/fitness-programs", requireAuth, async (req, res): Promise<void> => {
  const { title, teamId, description, durationWeeks, intensityLevel } = req.body;
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
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
    })
    .returning();

  const enriched = await enrichProgram(program);
  res.status(201).json(enriched);
});

router.get("/fitness-programs/:id", requireAuth, async (req, res): Promise<void> => {
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
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { title, teamId, description, durationWeeks, intensityLevel } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (teamId !== undefined) updates.teamId = teamId;
  if (description !== undefined) updates.description = description;
  if (durationWeeks !== undefined) updates.durationWeeks = durationWeeks;
  if (intensityLevel !== undefined) updates.intensityLevel = intensityLevel;

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
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [program] = await db
    .delete(fitnessProgramsTable)
    .where(and(eq(fitnessProgramsTable.id, id), eq(fitnessProgramsTable.clubId, req.session.clubId!)))
    .returning();

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }
  res.sendStatus(204);
});

router.get("/player-fitness-data", requireAuth, async (req, res): Promise<void> => {
  const playerId = req.query.playerId ? parseInt(req.query.playerId as string) : null;

  const conditions = [eq(playerFitnessDataTable.clubId, req.session.clubId!)];
  if (playerId && !isNaN(playerId)) conditions.push(eq(playerFitnessDataTable.playerId, playerId));

  const data = await db
    .select()
    .from(playerFitnessDataTable)
    .where(and(...conditions))
    .orderBy(desc(playerFitnessDataTable.date));

  const enriched = await Promise.all(data.map(enrichFitnessData));
  res.json(enriched);
});

router.post("/player-fitness-data", requireAuth, async (req, res): Promise<void> => {
  const { playerId, date, endurance, strength, speed, notes } = req.body;
  if (!playerId || !date) {
    res.status(400).json({ error: "playerId and date are required" });
    return;
  }

  const [entry] = await db
    .insert(playerFitnessDataTable)
    .values({
      playerId: Number(playerId),
      date,
      clubId: req.session.clubId!,
      recordedBy: req.session.userId!,
      endurance: endurance != null ? Number(endurance) : null,
      strength: strength != null ? Number(strength) : null,
      speed: speed != null ? Number(speed) : null,
      notes: notes ?? null,
    })
    .returning();

  const enriched = await enrichFitnessData(entry);
  res.status(201).json(enriched);
});

router.patch("/player-fitness-data/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { date, endurance, strength, speed, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (date !== undefined) updates.date = date;
  if (endurance !== undefined) updates.endurance = endurance != null ? Number(endurance) : null;
  if (strength !== undefined) updates.strength = strength != null ? Number(strength) : null;
  if (speed !== undefined) updates.speed = speed != null ? Number(speed) : null;
  if (notes !== undefined) updates.notes = notes;

  const [entry] = await db
    .update(playerFitnessDataTable)
    .set(updates)
    .where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!)))
    .returning();

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  const enriched = await enrichFitnessData(entry);
  res.json(enriched);
});

router.delete("/player-fitness-data/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [entry] = await db
    .delete(playerFitnessDataTable)
    .where(and(eq(playerFitnessDataTable.id, id), eq(playerFitnessDataTable.clubId, req.session.clubId!)))
    .returning();

  if (!entry) { res.status(404).json({ error: "Entry not found" }); return; }
  res.sendStatus(204);
});

export default router;
