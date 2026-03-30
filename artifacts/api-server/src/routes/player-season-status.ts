import { Router, type IRouter } from "express";
import { db, playerSeasonStatusTable, playersTable, teamsTable, seasonsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const AGE_GROUP_NEXT: Record<string, string> = {
  "U5": "U6",   "U6": "U7",   "U7": "U8",   "U8": "U9",
  "U9": "U10",  "U10": "U11", "U11": "U12", "U12": "U13",
  "U13": "U14", "U14": "U15", "U15": "U16", "U16": "U17",
  "U17": "U18", "U18": "U19", "U19": "Prima Squadra",
};

const AGE_GROUP_CATEGORY: Record<string, string> = {
  "U5": "Piccoli Amici", "U6": "Piccoli Amici",
  "U7": "Pulcini", "U8": "Pulcini",
  "U9": "Pulcini", "U10": "Pulcini",
  "U11": "Esordienti", "U12": "Esordienti",
  "U13": "Giovanissimi", "U14": "Giovanissimi",
  "U15": "Allievi", "U16": "Allievi",
  "U17": "Juniores", "U18": "Juniores",
  "U19": "Prima Squadra", "Prima Squadra": "Prima Squadra",
};

router.get("/seasons/:id/player-status", requireAuth, async (req, res): Promise<void> => {
  const seasonId = parseInt(req.params.id);
  if (isNaN(seasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const statuses = await db
    .select()
    .from(playerSeasonStatusTable)
    .where(and(
      eq(playerSeasonStatusTable.seasonId, seasonId),
      eq(playerSeasonStatusTable.clubId, req.session.clubId!),
    ));

  const players = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.clubId, req.session.clubId!));

  const statusMap = new Map(statuses.map(s => [s.playerId, s]));

  const result = players.map(p => {
    const s = statusMap.get(p.id);
    return {
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      teamId: p.teamId,
      clubSection: p.clubSection,
      position: p.position,
      dateOfBirth: p.dateOfBirth,
      statusId: s?.id ?? null,
      status: s?.status ?? "pending",
      transferAmount: s?.transferAmount ?? null,
      swapPlayerData: s?.swapPlayerData ?? null,
      notes: s?.notes ?? null,
    };
  });

  res.json(result);
});

router.post("/seasons/:id/player-status", requireAuth, async (req, res): Promise<void> => {
  const seasonId = parseInt(req.params.id);
  if (isNaN(seasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { playerId, status, transferAmount, swapPlayerData, notes } = req.body;
  if (!playerId || !status) { res.status(400).json({ error: "playerId and status required" }); return; }

  const existing = await db.select().from(playerSeasonStatusTable).where(
    and(
      eq(playerSeasonStatusTable.playerId, playerId),
      eq(playerSeasonStatusTable.seasonId, seasonId),
      eq(playerSeasonStatusTable.clubId, req.session.clubId!),
    )
  );

  if (existing.length > 0) {
    const [updated] = await db.update(playerSeasonStatusTable).set({
      status, transferAmount: transferAmount ?? null,
      swapPlayerData: swapPlayerData ?? null, notes: notes ?? null,
    }).where(eq(playerSeasonStatusTable.id, existing[0].id)).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(playerSeasonStatusTable).values({
      clubId: req.session.clubId!, playerId, seasonId, status,
      transferAmount: transferAmount ?? null,
      swapPlayerData: swapPlayerData ?? null, notes: notes ?? null,
    }).returning();
    res.status(201).json(created);
  }
});

router.post("/seasons/:id/promote", requireAuth, async (req, res): Promise<void> => {
  const fromSeasonId = parseInt(req.params.id);
  if (isNaN(fromSeasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { toSeasonId } = req.body;
  if (!toSeasonId) { res.status(400).json({ error: "toSeasonId required" }); return; }

  const clubId = req.session.clubId!;

  const fromTeams = await db.select().from(teamsTable).where(
    and(eq(teamsTable.seasonId, fromSeasonId), eq(teamsTable.clubId, clubId))
  );

  const confirmedStatuses = await db.select().from(playerSeasonStatusTable).where(
    and(
      eq(playerSeasonStatusTable.seasonId, fromSeasonId),
      eq(playerSeasonStatusTable.clubId, clubId),
    )
  );
  const confirmedPlayerIds = new Set(
    confirmedStatuses.filter(s => s.status === "confirmed").map(s => s.playerId)
  );

  const results: { oldTeam: string; newTeam: string; playersPromoted: number }[] = [];

  for (const team of fromTeams) {
    const currentAgeGroup = team.ageGroup ?? "";
    const nextAgeGroup = AGE_GROUP_NEXT[currentAgeGroup] ?? currentAgeGroup;
    const nextCategory = AGE_GROUP_CATEGORY[nextAgeGroup] ?? nextAgeGroup;

    let nextSeason = nextAgeGroup === "Prima Squadra" ? "prima_squadra" : team.clubSection;

    const [newTeam] = await db.insert(teamsTable).values({
      clubId,
      seasonId: toSeasonId,
      name: `${team.name.replace(/\d{4}\/\d{4}/, "").trim()} ${toSeasonId}`.trim(),
      ageGroup: nextAgeGroup,
      category: nextCategory,
      clubSection: nextSeason,
      trainingSchedule: team.trainingSchedule as any,
      coachId: team.coachId,
    }).returning();

    const oldPlayers = await db.select().from(playersTable).where(
      and(eq(playersTable.teamId, team.id), eq(playersTable.clubId, clubId))
    );

    let promoted = 0;
    for (const player of oldPlayers) {
      if (confirmedPlayerIds.has(player.id)) {
        await db.update(playersTable).set({
          teamId: newTeam.id,
          clubSection: nextSeason as string,
        }).where(eq(playersTable.id, player.id));
        promoted++;
      }
    }

    results.push({ oldTeam: team.name, newTeam: newTeam.name, playersPromoted: promoted });
  }

  res.json({ promoted: results });
});

export default router;
