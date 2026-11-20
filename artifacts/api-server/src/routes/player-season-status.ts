import { archiveStatusForTransition } from "@workspace/api-zod";
import { isArchivedPlayer } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { db, playerSeasonStatusTable, playersTable, teamsTable, seasonsTable } from "@workspace/db";
import { WITHDRAWN_PLAYER_STATUS, playerStatusAfterWithdrawal } from "@workspace/api-zod";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";

const router: IRouter = Router();
const SEASON_TRANSITION_ROLES = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"];

function canManageSeasonTransition(role?: string | null): boolean {
  return SEASON_TRANSITION_ROLES.includes(normalizeSessionRole(role));
}

function canManageAllSections(role?: string | null): boolean {
  return ["admin", "presidente", "director", "sporting_director", "technical_director"].includes(normalizeSessionRole(role));
}

function canManagePlayerSection(role: string | null | undefined, sessionSection: string | null | undefined, playerSection: string | null | undefined): boolean {
  if (canManageAllSections(role)) return true;
  if (normalizeSessionRole(role) !== "secretary") return false;
  return Boolean(sessionSection && playerSection && sessionSection === playerSection);
}

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
  const seasonId = parseInt(String(req.params.id));
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

  const result = players.filter(p=>p.status!=="retired_definitive"&&!p.isTest).map(p => {
    const s = statusMap.get(p.id);
    return {
      playerId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      teamId: p.teamId,
      clubSection: p.clubSection,
      position: p.position,
      archived: isArchivedPlayer(p),
      dateOfBirth: p.dateOfBirth,
      statusId: s?.id ?? null,
      status: s?.status ?? (p.status==="not_renewed"?"not_confirmed":p.status==="transferred"?"transfer_free":isArchivedPlayer(p)?WITHDRAWN_PLAYER_STATUS:"pending"),
      transferAmount: s?.transferAmount ?? null,
      swapPlayerData: s?.swapPlayerData ?? null,
      notes: s?.notes ?? null,
    };
  });

  res.json(result);
});

router.post("/seasons/:id/player-status", requireAuth, async (req, res): Promise<void> => {
  if (!canManageSeasonTransition(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a gestire la transizione stagionale" });
    return;
  }

  const seasonId = parseInt(String(req.params.id));
  if (isNaN(seasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { playerId, status, transferAmount, swapPlayerData, notes } = req.body;
  if(!["pending","confirmed","withdrawn","retired_definitive","not_confirmed","transfer_free","transfer_paid","swap","swap_permanent","swap_loan"].includes(status)){res.status(400).json({error:"Stato non valido"});return;}
  if (!playerId || !status) { res.status(400).json({ error: "playerId and status required" }); return; }
  const clubId = req.session.clubId!;
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('season-roster'), ${clubId})`);
    const [season] = await tx.select().from(seasonsTable)
      .where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.id, seasonId)));
    if (!season) return { error: 404, message: "Stagione non trovata" };
    const [player] = await tx.select().from(playersTable)
      .where(and(eq(playersTable.id, Number(playerId)), eq(playersTable.clubId, clubId))).for("update");
    if (!player) return { error: 404 };
    if (!canManagePlayerSection(req.session.role, req.session.section, player.clubSection)) return { error: 403 };
    const [existing] = await tx.select().from(playerSeasonStatusTable).where(and(
      eq(playerSeasonStatusTable.playerId, player.id), eq(playerSeasonStatusTable.seasonId, seasonId), eq(playerSeasonStatusTable.clubId, clubId)));
    const values = { status, transferAmount: transferAmount ?? null, swapPlayerData: swapPlayerData ?? null, notes: notes ?? null };
    const [record] = existing
      ? await tx.update(playerSeasonStatusTable).set(values).where(eq(playerSeasonStatusTable.id, existing.id)).returning()
      : await tx.insert(playerSeasonStatusTable).values({ ...values, playerId: player.id, seasonId, clubId }).returning();
    if (season.isActive && (archiveStatusForTransition(status) || (status === "confirmed" && isArchivedPlayer(player)))) {
      await tx.update(playersTable).set({
        status: archiveStatusForTransition(status) || playerStatusAfterWithdrawal(player),
      }).where(and(eq(playersTable.id, player.id), eq(playersTable.clubId, clubId)));
    }
    if(season.isActive){
      await tx.execute(sql`UPDATE player_positions SET state=${archiveStatusForTransition(status)||'active'},revision=revision+1,notes=${String(notes??'')},updated_by=${req.session.userId!} WHERE player_id=${player.id} AND club_id=${clubId}`);
    }
    return { record, created: !existing };
  });
  if (result.error) {
    res.status(result.error).json({ error: result.message ?? (result.error === 404 ? "Giocatore non trovato" : "La Segreteria può modificare solo i giocatori della propria sezione") });
    return;
  }
  res.status(result.created ? 201 : 200).json(result.record);
});

router.post("/seasons/:id/promote", requireAuth, async (req, res): Promise<void> => {
  if (!canManageSeasonTransition(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a gestire la transizione stagionale" });
    return;
  }

  const fromSeasonId = parseInt(String(req.params.id));
  if (isNaN(fromSeasonId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { toSeasonId } = req.body;
  if (!toSeasonId) { res.status(400).json({ error: "toSeasonId required" }); return; }

  const clubId = req.session.clubId!;

  const fromTeamsAll = await db.select().from(teamsTable).where(
    and(eq(teamsTable.seasonId, fromSeasonId), eq(teamsTable.clubId, clubId))
  );
  const fromTeams = canManageAllSections(req.session.role)
    ? fromTeamsAll
    : fromTeamsAll.filter(team => req.session.section && team.clubSection === req.session.section);
  if (fromTeams.length === 0) {
    res.status(403).json({ error: "Nessuna squadra gestibile per la tua sezione" });
    return;
  }

  const confirmedStatuses = await db.select().from(playerSeasonStatusTable).where(
    and(
      eq(playerSeasonStatusTable.seasonId, fromSeasonId),
      eq(playerSeasonStatusTable.clubId, clubId),
    )
  );
  const confirmedPlayerIds = new Set(
    confirmedStatuses.filter(s => s.status === "confirmed").map(s => s.playerId)
  );
  const withdrawnAtSource = new Set(confirmedStatuses.filter(row => row.status === WITHDRAWN_PLAYER_STATUS).map(row => row.playerId));
  const [destination] = await db.select().from(seasonsTable).where(and(
    eq(seasonsTable.id, Number(toSeasonId)), eq(seasonsTable.clubId, clubId)));
  if (!destination) { res.status(404).json({ error: "Stagione di destinazione non trovata." }); return; }
  const destinationStatuses = await db.select().from(playerSeasonStatusTable).where(and(
    eq(playerSeasonStatusTable.seasonId, destination.id), eq(playerSeasonStatusTable.clubId, clubId)));
  const destinationStatus = new Map(destinationStatuses.map(row => [row.playerId, row.status]));

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
      if(player.status==="retired_definitive"||player.isTest)continue;
      const wasWithdrawn = isArchivedPlayer(player);
      const returns = destinationStatus.get(player.id) === "confirmed";
      const returning = returns && (wasWithdrawn || withdrawnAtSource.has(player.id));
      if (!archiveStatusForTransition(destinationStatus.get(player.id)??"") && (returning || (!wasWithdrawn && confirmedPlayerIds.has(player.id)))) {
        await db.update(playersTable).set({
          teamId: newTeam.id,
          clubSection: nextSeason as string,
          ...(wasWithdrawn && returns && destination.isActive ? { status: playerStatusAfterWithdrawal(player) } : {}),
        }).where(eq(playersTable.id, player.id));
        promoted++;
      }
    }

    results.push({ oldTeam: team.name, newTeam: newTeam.name, playersPromoted: promoted });
  }

  res.json({ promoted: results });
});

export default router;
