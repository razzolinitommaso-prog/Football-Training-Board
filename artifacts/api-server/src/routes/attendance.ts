import { Router, type IRouter } from "express";
import { db, trainingAttendancesTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : null;
  if (!sessionId || isNaN(sessionId)) { res.status(400).json({ error: "sessionId required" }); return; }
  const records = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.trainingSessionId, sessionId), eq(trainingAttendancesTable.clubId, req.session.clubId!)));
  const enriched = await Promise.all(records.map(async (r) => {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, r.playerId));
    return { ...r, playerName: player ? `${player.firstName} ${player.lastName}` : null, notes: r.notes ?? null };
  }));
  res.json(enriched);
});

router.post("/attendance", requireAuth, async (req, res): Promise<void> => {
  const { trainingSessionId, playerId, status, notes } = req.body;
  if (!trainingSessionId || !playerId) { res.status(400).json({ error: "trainingSessionId and playerId required" }); return; }
  const existing = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.trainingSessionId, Number(trainingSessionId)), eq(trainingAttendancesTable.playerId, Number(playerId))));
  if (existing.length > 0) {
    const [updated] = await db.update(trainingAttendancesTable).set({ status: status ?? "present", notes: notes ?? null })
      .where(eq(trainingAttendancesTable.id, existing[0].id)).returning();
    res.json(updated);
    return;
  }
  const [record] = await db.insert(trainingAttendancesTable).values({
    trainingSessionId: Number(trainingSessionId), playerId: Number(playerId),
    clubId: req.session.clubId!, status: status ?? "present", notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, notes } = req.body;
  const [record] = await db.update(trainingAttendancesTable).set({ status, notes })
    .where(and(eq(trainingAttendancesTable.id, id), eq(trainingAttendancesTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

export default router;
