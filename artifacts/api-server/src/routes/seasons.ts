import { Router, type IRouter } from "express";
import { db, seasonsTable, teamsTable, playersTable, matchesTable, playerSeasonStatusTable, observedPlayersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/seasons", requireAuth, async (req, res): Promise<void> => {
  const seasons = await db.select().from(seasonsTable)
    .where(eq(seasonsTable.clubId, req.session.clubId!));
  res.json(seasons);
});

router.post("/seasons", requireAuth, async (req, res): Promise<void> => {
  const { name, startDate, endDate, isActive } = req.body;
  if (!name || !startDate || !endDate) { res.status(400).json({ error: "name, startDate, endDate required" }); return; }

  if (isActive) {
    await db.update(seasonsTable).set({ isActive: false }).where(eq(seasonsTable.clubId, req.session.clubId!));
  }

  const [season] = await db.insert(seasonsTable).values({
    clubId: req.session.clubId!, name, startDate, endDate, isActive: isActive ?? false,
  }).returning();
  res.status(201).json(season);
});

router.patch("/seasons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, startDate, endDate, isActive, isArchived } = req.body;

  if (isActive) {
    await db.update(seasonsTable).set({ isActive: false }).where(eq(seasonsTable.clubId, req.session.clubId!));
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (startDate !== undefined) updates.startDate = startDate;
  if (endDate !== undefined) updates.endDate = endDate;
  if (isActive !== undefined) updates.isActive = isActive;
  if (isArchived !== undefined) updates.isArchived = isArchived;

  const [season] = await db.update(seasonsTable).set(updates)
    .where(and(eq(seasonsTable.id, id), eq(seasonsTable.clubId, req.session.clubId!))).returning();
  if (!season) { res.status(404).json({ error: "Season not found" }); return; }
  res.json(season);
});

router.delete("/seasons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [season] = await db.delete(seasonsTable)
    .where(and(eq(seasonsTable.id, id), eq(seasonsTable.clubId, req.session.clubId!))).returning();
  if (!season) { res.status(404).json({ error: "Season not found" }); return; }
  res.sendStatus(204);
});

router.get("/seasons/:id/export", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const clubId = req.session.clubId!;

  const [season] = await db.select().from(seasonsTable)
    .where(and(eq(seasonsTable.id, id), eq(seasonsTable.clubId, clubId)));
  if (!season) { res.status(404).json({ error: "Season not found" }); return; }

  const teams = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.seasonId, id), eq(teamsTable.clubId, clubId)));

  const players = await db.select().from(playersTable)
    .where(eq(playersTable.clubId, clubId));

  const matches = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.seasonId, id), eq(matchesTable.clubId, clubId)));

  const playerStatuses = await db.select().from(playerSeasonStatusTable)
    .where(and(eq(playerSeasonStatusTable.seasonId, id), eq(playerSeasonStatusTable.clubId, clubId)));

  const observedPlayers = await db.select().from(observedPlayersTable)
    .where(and(eq(observedPlayersTable.seasonId, id), eq(observedPlayersTable.clubId, clubId)));

  const archive = {
    exportedAt: new Date().toISOString(),
    season,
    teams,
    players: players.filter(p => teams.some(t => t.id === p.teamId)),
    matches,
    playerStatuses,
    observedPlayers,
  };

  const safeName = season.name.replace(/[^a-zA-Z0-9]/g, "-");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="stagione-${safeName}.json"`);
  res.json(archive);
});

export default router;
