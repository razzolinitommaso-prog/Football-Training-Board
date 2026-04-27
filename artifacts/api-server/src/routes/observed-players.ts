import { Router, type IRouter } from "express";
import { db, observedPlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/seasons/:id/observed-players", requireAuth, async (req, res): Promise<void> => {
  const seasonId = parseInt(String(req.params.id));
  if (isNaN(seasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const players = await db
    .select()
    .from(observedPlayersTable)
    .where(and(
      eq(observedPlayersTable.seasonId, seasonId),
      eq(observedPlayersTable.clubId, req.session.clubId!),
    ));

  res.json(players);
});

router.post("/seasons/:id/observed-players", requireAuth, async (req, res): Promise<void> => {
  const seasonId = parseInt(String(req.params.id));
  if (isNaN(seasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    firstName, lastName, dateOfBirth, position, height, weight,
    clubOrigin, notes, acquisitionStatus, transferAmount, departingPlayerData,
  } = req.body;

  if (!firstName || !lastName) { res.status(400).json({ error: "firstName and lastName required" }); return; }

  const [created] = await db.insert(observedPlayersTable).values({
    clubId: req.session.clubId!, seasonId,
    firstName, lastName, dateOfBirth: dateOfBirth ?? null,
    position: position ?? null, height: height ?? null, weight: weight ?? null,
    clubOrigin: clubOrigin ?? null, notes: notes ?? null,
    acquisitionStatus: acquisitionStatus ?? "pending",
    transferAmount: transferAmount ?? null,
    departingPlayerData: departingPlayerData ?? null,
  }).returning();

  res.status(201).json(created);
});

router.patch("/seasons/:id/observed-players/:pid", requireAuth, async (req, res): Promise<void> => {
  const seasonId = parseInt(String(req.params.id));
  const pid = parseInt(String(req.params.pid));
  if (isNaN(seasonId) || isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    firstName, lastName, dateOfBirth, position, height, weight,
    clubOrigin, notes, acquisitionStatus, transferAmount, departingPlayerData,
  } = req.body;

  const [updated] = await db
    .update(observedPlayersTable)
    .set({
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      dateOfBirth: dateOfBirth ?? null,
      position: position ?? null,
      height: height ?? null,
      weight: weight ?? null,
      clubOrigin: clubOrigin ?? null,
      notes: notes ?? null,
      acquisitionStatus: acquisitionStatus ?? "pending",
      transferAmount: transferAmount ?? null,
      departingPlayerData: departingPlayerData ?? null,
    })
    .where(and(
      eq(observedPlayersTable.id, pid),
      eq(observedPlayersTable.clubId, req.session.clubId!),
    ))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/seasons/:id/observed-players/:pid", requireAuth, async (req, res): Promise<void> => {
  const pid = parseInt(String(req.params.pid));
  if (isNaN(pid)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(observedPlayersTable).where(and(
    eq(observedPlayersTable.id, pid),
    eq(observedPlayersTable.clubId, req.session.clubId!),
  ));

  res.status(204).send();
});

export default router;
