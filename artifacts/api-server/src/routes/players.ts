import { Router, type IRouter } from "express";
import { db, playersTable, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  ListPlayersResponse,
  ListPlayersQueryParams,
  CreatePlayerBody,
  GetPlayerResponse,
  GetPlayerParams,
  UpdatePlayerParams,
  UpdatePlayerBody,
  UpdatePlayerResponse,
  DeletePlayerParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

const STAFF_ONLY_ROLES = ["coach", "fitness_coach", "technical_director", "athletic_director"];

const router: IRouter = Router();

async function enrichPlayer(player: typeof playersTable.$inferSelect) {
  let teamName: string | null = null;
  if (player.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, player.teamId));
    if (team) teamName = team.name;
  }
  return {
    ...player,
    teamId: player.teamId ?? null,
    teamName,
    dateOfBirth: player.dateOfBirth ?? null,
    nationality: player.nationality ?? null,
    position: player.position ?? null,
    jerseyNumber: player.jerseyNumber ?? null,
    height: player.height ?? null,
    weight: player.weight ?? null,
    notes: player.notes ?? null,
    registered: player.registered ?? null,
    registrationNumber: player.registrationNumber ?? null,
    available: player.available ?? true,
    unavailabilityReason: player.unavailabilityReason ?? null,
    expectedReturn: player.expectedReturn ?? null,
  };
}

router.get("/players", requireAuth, async (req, res): Promise<void> => {
  const queryParams = ListPlayersQueryParams.safeParse(req.query);
  const section = typeof req.query.section === "string" ? req.query.section : req.session.section;

  let conditions = [eq(playersTable.clubId, req.session.clubId!)];
  if (section) conditions.push(eq(playersTable.clubSection, section));

  if (STAFF_ONLY_ROLES.includes(req.session.role)) {
    const assignments = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(and(
        eq(teamStaffAssignmentsTable.userId, req.session.userId!),
        eq(teamStaffAssignmentsTable.clubId, req.session.clubId!),
      ));

    if (assignments.length === 0) {
      res.json(ListPlayersResponse.parse([]));
      return;
    }

    const assignedTeamIds = assignments.map(a => a.teamId);
    if (queryParams.success && queryParams.data.teamId) {
      if (!assignedTeamIds.includes(queryParams.data.teamId)) {
        res.json(ListPlayersResponse.parse([]));
        return;
      }
      conditions.push(eq(playersTable.teamId, queryParams.data.teamId));
    } else {
      conditions.push(inArray(playersTable.teamId, assignedTeamIds));
    }
  } else {
    if (queryParams.success && queryParams.data.teamId) {
      conditions.push(eq(playersTable.teamId, queryParams.data.teamId));
    }
  }

  const players = await db.select().from(playersTable).where(and(...conditions));
  const enriched = await Promise.all(players.map(enrichPlayer));
  res.json(ListPlayersResponse.parse(enriched));
});

const NO_CREATE_ROLES = ["coach", "fitness_coach", "athletic_director"];

router.post("/players", requireAuth, async (req, res): Promise<void> => {
  if (NO_CREATE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non sei autorizzato ad aggiungere giocatori" });
    return;
  }
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const playerData = { ...parsed.data };
  if (playerData.registered === false) {
    playerData.available = false;
  }

  const [player] = await db
    .insert(playersTable)
    .values({ ...playerData, clubId: req.session.clubId! })
    .returning();

  const enriched = await enrichPlayer(player);
  res.status(201).json(GetPlayerResponse.parse(enriched));
});

router.get("/players/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [player] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const enriched = await enrichPlayer(player);
  res.json(GetPlayerResponse.parse(enriched));
});

router.patch("/players/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData = { ...parsed.data };
  if (updateData.registered === false) {
    updateData.available = false;
  }

  const [player] = await db
    .update(playersTable)
    .set(updateData)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)))
    .returning();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const enriched = await enrichPlayer(player);
  res.json(UpdatePlayerResponse.parse(enriched));
});

router.delete("/players/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [player] = await db
    .delete(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)))
    .returning();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
