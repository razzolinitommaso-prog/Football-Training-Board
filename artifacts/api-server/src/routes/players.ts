import { Router, type IRouter } from "express";
import { db, playersTable, teamsTable, teamStaffAssignmentsTable, clubNotificationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
import { isClubWideListRole, normalizeSessionRole, resolveClubSectionFilter } from "../lib/club-scope";
import { requireClubAndUserIds } from "../lib/session-context";
import { assertCanCreateWithinPlan } from "../lib/plan-limits";

/** Il direttore tecnico elenca tutti i giocatori del club; coach/preparatori solo le proprie squadre. */
const PLAYER_ASSIGNMENT_FILTER_ROLES_NORM = new Set(["coach", "fitness_coach", "athletic_director"]);
const PLAYER_MANAGE_ROLES = ["secretary", "sporting_director"];
const PLAYER_NOTE_ONLY_ROLES = [
  "admin",
  "presidente",
  "director",
  "sporting_director",
  "technical_director",
  "coach",
  "fitness_coach",
  "athletic_director",
];
const PLAYER_META_MARKER = "[FTB_PLAYER_META]";
const PLAYER_NOTES_MARKER = "[FTB_PLAYER_NOTES]";

type PlayerNoteRecipient = "secretary" | "technical_director" | "coach_staff";
type PlayerNoteThreadItem = {
  id: string;
  authorRole?: string;
  authorName?: string;
  recipient?: PlayerNoteRecipient;
  body?: string;
  createdAt?: string;
  requiresResponse?: boolean;
  replyToId?: string;
  repliedAt?: string;
};

function extractSupplementalTeamId(notes?: string | null): number | null {
  const full = String(notes ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return null;
  const nextNewLineIdx = full.indexOf("\n");
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(PLAYER_META_MARKER.length, nextNewLineIdx).trim()
    : full.slice(PLAYER_META_MARKER.length).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as { supplementalTeamId?: unknown };
    const n = Number(parsed?.supplementalTeamId);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function getAssignedTeamIds(userId: number, clubId: number): Promise<number[]> {
  const staffRows = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
    ));

  const coachedRows = await db
    .select({ teamId: teamsTable.id })
    .from(teamsTable)
    .where(and(
      eq(teamsTable.coachId, userId),
      eq(teamsTable.clubId, clubId),
    ));

  return Array.from(new Set([
    ...staffRows.map((row) => row.teamId),
    ...coachedRows.map((row) => row.teamId),
  ]));
}

function stripMetaFromNotes(raw?: string | null): string {
  const full = String(raw ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return full;
  const nextNewLineIdx = full.indexOf("\n");
  return nextNewLineIdx >= 0 ? full.slice(nextNewLineIdx + 1).trim() : "";
}

function preserveExistingMetaInNotes(existingRaw?: string | null, incomingRaw?: string | null): string {
  const cleanIncoming = stripMetaFromNotes(incomingRaw);
  const existing = String(existingRaw ?? "").trim();
  if (!existing.startsWith(PLAYER_META_MARKER)) return cleanIncoming;
  const nextNewLineIdx = existing.indexOf("\n");
  const existingMeta = nextNewLineIdx >= 0 ? existing.slice(0, nextNewLineIdx).trim() : existing;
  return cleanIncoming ? `${existingMeta}\n${cleanIncoming}` : existingMeta;
}

function parsePlayerNotesThread(raw?: string | null): PlayerNoteThreadItem[] {
  const full = String(raw ?? "").trim();
  if (!full) return [];
  const idx = full.lastIndexOf(PLAYER_NOTES_MARKER);
  if (idx < 0) return [];
  const jsonPart = full.slice(idx + PLAYER_NOTES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    return Array.isArray(parsed) ? (parsed as PlayerNoteThreadItem[]) : [];
  } catch {
    return [];
  }
}

const router: IRouter = Router();

async function enrichPlayer(player: typeof playersTable.$inferSelect) {
  let teamName: string | null = null;
  if (player.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, player.clubId)));
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
  const ids = requireClubAndUserIds(req);
  if (!ids) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  const { clubId, userId } = ids;
  const queryParams = ListPlayersQueryParams.safeParse(req.query);
  const requestedTeamId = queryParams.success ? queryParams.data.teamId : undefined;
  const role = req.session.role ?? "";
  const section = resolveClubSectionFilter(
    role,
    typeof req.query.section === "string" ? req.query.section : undefined,
    req.session.section,
  );

  let conditions = [eq(playersTable.clubId, clubId)];
  if (section) conditions.push(eq(playersTable.clubSection, section));

  let assignedTeamIds: number[] = [];
  const needsAssignmentFiltering = !isClubWideListRole(role) && PLAYER_ASSIGNMENT_FILTER_ROLES_NORM.has(normalizeSessionRole(role));
  if (needsAssignmentFiltering) {
    assignedTeamIds = await getAssignedTeamIds(userId, clubId);
    if (assignedTeamIds.length === 0) {
      res.json(ListPlayersResponse.parse([]));
      return;
    }

    if (requestedTeamId) {
      if (!assignedTeamIds.includes(requestedTeamId)) {
        res.json(ListPlayersResponse.parse([]));
        return;
      }
    }
  }

  const players = await db.select().from(playersTable).where(and(...conditions));
  const filtered = players.filter((player) => {
    const supplementalTeamId = extractSupplementalTeamId(player.notes);
    if (requestedTeamId) {
      return player.teamId === requestedTeamId || supplementalTeamId === requestedTeamId;
    }
    if (needsAssignmentFiltering) {
      return (
        (player.teamId != null && assignedTeamIds.includes(player.teamId)) ||
        (supplementalTeamId != null && assignedTeamIds.includes(supplementalTeamId))
      );
    }
    return true;
  });
  const enriched = await Promise.all(filtered.map(enrichPlayer));
  res.json(ListPlayersResponse.parse(enriched));
});

router.post("/players", requireAuth, async (req, res): Promise<void> => {
  const role = normalizeSessionRole(req.session.role);
  if (!PLAYER_MANAGE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non sei autorizzato ad aggiungere giocatori" });
    return;
  }
  const limitCheck = await assertCanCreateWithinPlan(req.session.clubId!, "players");
  if (!limitCheck.ok) {
    res.status(limitCheck.status).json(limitCheck.body);
    return;
  }
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const playerData = { ...parsed.data };
  let clubSection = typeof req.session.section === "string" && req.session.section
    ? req.session.section
    : "scuola_calcio";
  if (playerData.teamId) {
    const [team] = await db
      .select({ clubSection: teamsTable.clubSection })
      .from(teamsTable)
      .where(and(eq(teamsTable.id, playerData.teamId), eq(teamsTable.clubId, req.session.clubId!)));
    if (team?.clubSection) clubSection = team.clubSection;
  }
  const values = {
    ...playerData,
    clubId: req.session.clubId!,
    clubSection,
    ...(playerData.registered === false ? { available: false } : {}),
  };

  const [player] = await db
    .insert(playersTable)
    .values(values)
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

  const role = normalizeSessionRole(req.session.role);
  const updateData = { ...parsed.data } as Record<string, unknown>;
  const [existingPlayer] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));

  if (!existingPlayer) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (!PLAYER_MANAGE_ROLES.includes(role)) {
    if (!PLAYER_NOTE_ONLY_ROLES.includes(role)) {
      res.status(403).json({ error: "Non autorizzato a modificare questo giocatore" });
      return;
    }

    const allowed = new Set(["notes"]);
    for (const k of Object.keys(updateData)) {
      if (!allowed.has(k)) delete updateData[k];
    }
    if (typeof updateData.notes === "string") {
      updateData.notes = preserveExistingMetaInNotes(existingPlayer.notes, String(updateData.notes));
    }
  }

  if (updateData.registered === false) {
    updateData.available = false;
  }
  if (updateData.status === "injured") {
    updateData.available = false;
    if (!updateData.unavailabilityReason) updateData.unavailabilityReason = "injury";
  }
  if (updateData.available === true) {
    updateData.unavailabilityReason = null;
    updateData.expectedReturn = null;
  }

  if (Object.keys(updateData).length === 0) {
    const enrichedNoop = await enrichPlayer(existingPlayer);
    res.json(UpdatePlayerResponse.parse(enrichedNoop));
    return;
  }

  const normalizedRole = normalizeSessionRole(role);
  const previousThread = parsePlayerNotesThread(stripMetaFromNotes(existingPlayer.notes));
  const updatedThread =
    typeof updateData.notes === "string"
      ? parsePlayerNotesThread(stripMetaFromNotes(String(updateData.notes)))
      : previousThread;
  const previousIds = new Set(previousThread.map((n) => n.id));
  const newlyAddedThreadItems = updatedThread.filter((n) => n?.id && !previousIds.has(n.id));

  const [player] = await db
    .update(playersTable)
    .set(updateData)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)))
    .returning();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (newlyAddedThreadItems.length > 0 && req.session.clubId) {
    const fullName = `${player.firstName} ${player.lastName}`.trim();
    for (const note of newlyAddedThreadItems) {
      const fromSecretary = normalizedRole === "secretary";
      const toSecretary = note.recipient === "secretary";
      const secretaryInvolved = fromSecretary || toSecretary;
      if (!secretaryInvolved) continue;
      const noteText = String(note.body ?? "").trim();
      const compactNote = noteText.length > 140 ? `${noteText.slice(0, 137)}...` : noteText;
      const directionLabel = fromSecretary ? "da segreteria" : "alla segreteria";
      await db.insert(clubNotificationsTable).values({
        clubId: req.session.clubId,
        title: `Nota giocatore ${directionLabel}: ${fullName}`,
        message: compactNote
          ? `${compactNote}${note.requiresResponse ? " (richiesta risposta)" : ""}`
          : `Nuova nota giocatore ${directionLabel}${note.requiresResponse ? " con richiesta risposta" : ""}.`,
        type: note.requiresResponse ? "warning" : "info",
      });
    }
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

  const role = normalizeSessionRole(req.session.role);
  if (!PLAYER_MANAGE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a eliminare giocatori" });
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
