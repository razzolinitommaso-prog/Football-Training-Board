import { Router, type IRouter } from "express";
import {
  db,
  playersTable,
  teamsTable,
  teamStaffAssignmentsTable,
  clubNotificationsTable,
  playerParentDelegatesTable,
  parentPlayerRelationsTable,
  parentNotificationsTable,
  trainingSessionsTable,
  trainingAttendancesTable,
  matchesTable,
  callUpsTable,
  playerFitnessDataTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
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
const PLAYER_SPORT_AVAILABILITY_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const PLAYER_AVAILABILITY_OVERRIDE_ROLES = ["admin", "presidente", "director", "secretary"];
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
const ATTENDANCE_META_PREFIX = "[FTB_ATTENDANCE_META]";
const PARENT_DELEGATE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
type ParentDelegateInput = {
  id?: number;
  firstName?: string | null;
  lastName?: string | null;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive?: boolean | null;
};
type PlayerAvailabilityOverrideFields = {
  availabilityOverrideActive?: boolean | null;
  availabilityOverrideFrom?: string | null;
  availabilityOverrideUntil?: string | null;
  availabilityOverrideReason?: string | null;
};
type PlayerWithAvailabilityOverride = typeof playersTable.$inferSelect & PlayerAvailabilityOverrideFields;

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function generateParentDelegateCode(): string {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += PARENT_DELEGATE_CODE_ALPHABET[Math.floor(Math.random() * PARENT_DELEGATE_CODE_ALPHABET.length)];
  }
  return code;
}

function sanitizeParentDelegates(raw: unknown): ParentDelegateInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 3)
    .map((delegate) => {
      const item = delegate as ParentDelegateInput;
      return {
        id: Number.isFinite(Number(item.id)) ? Number(item.id) : undefined,
        firstName: cleanText(item.firstName),
        lastName: cleanText(item.lastName),
        relation: cleanText(item.relation),
        phone: cleanText(item.phone),
        email: cleanText(item.email).toLowerCase(),
        isActive: item.isActive !== false,
      };
    })
    .filter((delegate) => Boolean(delegate.firstName || delegate.lastName || delegate.phone || delegate.email));
}

async function listParentDelegates(clubId: number, playerId: number) {
  return db
    .select()
    .from(playerParentDelegatesTable)
    .where(and(eq(playerParentDelegatesTable.clubId, clubId), eq(playerParentDelegatesTable.playerId, playerId)))
    .orderBy(asc(playerParentDelegatesTable.id));
}

async function replaceParentDelegates(clubId: number, playerId: number, incoming: ParentDelegateInput[]) {
  const existing = await listParentDelegates(clubId, playerId);
  const existingCodesById = new Map(existing.map((delegate) => [delegate.id, delegate.accessCode]));

  await db
    .delete(playerParentDelegatesTable)
    .where(and(eq(playerParentDelegatesTable.clubId, clubId), eq(playerParentDelegatesTable.playerId, playerId)));

  const values = sanitizeParentDelegates(incoming).map((delegate) => ({
    clubId,
    playerId,
    firstName: cleanText(delegate.firstName) || "Delegato",
    lastName: cleanText(delegate.lastName) || "Genitore",
    relation: cleanText(delegate.relation) || "Genitore/Tutore",
    phone: cleanText(delegate.phone) || null,
    email: cleanText(delegate.email).toLowerCase() || null,
    accessCode: delegate.id ? existingCodesById.get(delegate.id) ?? generateParentDelegateCode() : generateParentDelegateCode(),
    deliveryChannel: cleanText(delegate.phone) ? "sms_ready" : cleanText(delegate.email) ? "email_ready" : "manual",
    deliveryStatus: "ready",
    isActive: delegate.isActive !== false,
  }));

  if (values.length === 0) return [];
  return db.insert(playerParentDelegatesTable).values(values).returning();
}

function extractSupplementalTeamId(notes?: string | null): number | null {
  const full = String(notes ?? "").trim();
  const markerIdx = full.indexOf(PLAYER_META_MARKER);
  if (markerIdx < 0) return null;
  const metaStart = markerIdx + PLAYER_META_MARKER.length;
  const nextNewLineIdx = full.indexOf("\n", metaStart);
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(metaStart, nextNewLineIdx).trim()
    : full.slice(metaStart).trim();
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

function parseAttendanceConduct(raw?: string | null): "ottima" | "buona" | "insufficiente" | null {
  const line = String(raw ?? "").split(/\r?\n/).find((item) => item.startsWith(ATTENDANCE_META_PREFIX));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.slice(ATTENDANCE_META_PREFIX.length).trim()) as { conduct?: unknown };
    const conduct = parsed?.conduct;
    return conduct === "ottima" || conduct === "buona" || conduct === "insufficiente" ? conduct : null;
  } catch {
    return null;
  }
}

function normalizeDisciplineCards(matchPlan: unknown): Array<{ playerId: number; cardType: string; reason: string; notes?: string | null }> {
  const source = matchPlan && typeof matchPlan === "object" ? (matchPlan as { disciplineCards?: unknown }) : null;
  if (!Array.isArray(source?.disciplineCards)) return [];
  return source.disciplineCards
    .map((item) => {
      const card = item as { playerId?: unknown; cardType?: unknown; reason?: unknown; notes?: unknown };
      return {
        playerId: Number(card.playerId),
        cardType: String(card.cardType ?? "giallo"),
        reason: String(card.reason ?? "altro"),
        notes: card.notes == null ? null : String(card.notes),
      };
    })
    .filter((card) => Number.isFinite(card.playerId) && card.playerId > 0);
}

const router: IRouter = Router();

function hasValidMedicalCertificate(value?: string | null): boolean {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry >= today;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function isAvailabilityOverrideActive(source: (Record<string, unknown> | PlayerAvailabilityOverrideFields) | undefined): boolean {
  if (!source) return false;
  const active = "availabilityOverrideActive" in source ? source.availabilityOverrideActive === true : false;
  if (!active) return false;
  const today = todayDateOnly();
  const from = String(source.availabilityOverrideFrom ?? "");
  const until = String(source.availabilityOverrideUntil ?? "");
  if (from && from > today) return false;
  if (until && until < today) return false;
  return Boolean(until);
}

function enforcePlayerAvailabilityRules(data: Record<string, unknown>, existing?: typeof playersTable.$inferSelect) {
  const registered = "registered" in data ? data.registered === true : existing?.registered === true;
  const certificate = "medicalCertificateExpiry" in data
    ? (data.medicalCertificateExpiry as string | null | undefined)
    : existing?.medicalCertificateExpiry;
  const overrideSource = {
    availabilityOverrideActive: "availabilityOverrideActive" in data ? data.availabilityOverrideActive : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideActive,
    availabilityOverrideFrom: "availabilityOverrideFrom" in data ? data.availabilityOverrideFrom : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideFrom,
    availabilityOverrideUntil: "availabilityOverrideUntil" in data ? data.availabilityOverrideUntil : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideUntil,
  };
  if ((!registered || !hasValidMedicalCertificate(certificate)) && !isAvailabilityOverrideActive(overrideSource)) {
    data.available = false;
    data.unavailabilityReason = "other";
    data.expectedReturn = null;
  }
}

function normalizeNullablePlayerDates(data: Record<string, unknown>) {
  for (const key of [
    "dateOfBirth",
    "medicalCertificateExpiry",
    "expectedReturn",
    "availabilityOverrideFrom",
    "availabilityOverrideUntil",
  ]) {
    if (data[key] === "") data[key] = null;
  }
}

async function notifyParentAvailabilityOverride(clubId: number, player: typeof playersTable.$inferSelect, until?: unknown) {
  const relations = await db
    .select({ parentUserId: parentPlayerRelationsTable.parentUserId })
    .from(parentPlayerRelationsTable)
    .where(eq(parentPlayerRelationsTable.playerId, player.id));
  if (relations.length === 0) return;
  const fullName = `${player.firstName} ${player.lastName}`.trim();
  for (const relation of relations) {
    await db.insert(parentNotificationsTable).values({
      parentUserId: relation.parentUserId,
      clubId,
      type: "availability_override",
      title: `Disponibilita temporanea ${fullName}`,
      message: `La societa ha autorizzato temporaneamente la disponibilita del giocatore fino al ${String(until || "periodo indicato")}.`,
    });
  }
}

async function enrichPlayer(player: typeof playersTable.$inferSelect) {
  const availabilityOverride = player as PlayerWithAvailabilityOverride;
  const playerContact = player as typeof player & {
    phone?: string | null;
    email?: string | null;
    phoneOwnerType?: string | null;
    parentFirstName?: string | null;
    parentLastName?: string | null;
    parentPhone?: string | null;
    parentEmail?: string | null;
    parentRelation?: string | null;
    secondaryContactFirstName?: string | null;
    secondaryContactLastName?: string | null;
    secondaryContactPhone?: string | null;
    secondaryContactEmail?: string | null;
    secondaryContactRelation?: string | null;
  };
  let teamName: string | null = null;
  if (player.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, player.clubId)));
    if (team) teamName = team.name;
  }
  const parentDelegates = await listParentDelegates(player.clubId, player.id);
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
    phone: playerContact.phone ?? null,
    email: playerContact.email ?? null,
    phoneOwnerType: playerContact.phoneOwnerType ?? "player",
    parentFirstName: playerContact.parentFirstName ?? null,
    parentLastName: playerContact.parentLastName ?? null,
    parentPhone: playerContact.parentPhone ?? null,
    parentEmail: playerContact.parentEmail ?? null,
    parentRelation: playerContact.parentRelation ?? null,
    secondaryContactFirstName: playerContact.secondaryContactFirstName ?? null,
    secondaryContactLastName: playerContact.secondaryContactLastName ?? null,
    secondaryContactPhone: playerContact.secondaryContactPhone ?? null,
    secondaryContactEmail: playerContact.secondaryContactEmail ?? null,
    secondaryContactRelation: playerContact.secondaryContactRelation ?? null,
    registered: player.registered ?? null,
    registrationNumber: player.registrationNumber ?? null,
    medicalCertificateExpiry: player.medicalCertificateExpiry ?? null,
    shuttleService: player.shuttleService ?? false,
    available: player.available ?? true,
    unavailabilityReason: player.unavailabilityReason ?? null,
    expectedReturn: player.expectedReturn ?? null,
    availabilityOverrideActive: availabilityOverride.availabilityOverrideActive ?? false,
    availabilityOverrideFrom: availabilityOverride.availabilityOverrideFrom ?? null,
    availabilityOverrideUntil: availabilityOverride.availabilityOverrideUntil ?? null,
    availabilityOverrideReason: availabilityOverride.availabilityOverrideReason ?? null,
    parentDelegates,
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

  const players = await db.select().from(playersTable).where(
    requestedTeamId ? eq(playersTable.clubId, clubId) : and(...conditions),
  );
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

  const { parentDelegates: incomingParentDelegates, ...playerData } = parsed.data as typeof parsed.data & { parentDelegates?: ParentDelegateInput[] };
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
  };
  normalizeNullablePlayerDates(values);
  enforcePlayerAvailabilityRules(values);

  const [player] = await db
    .insert(playersTable)
    .values(values)
    .returning();

  if (incomingParentDelegates) {
    await replaceParentDelegates(req.session.clubId!, player.id, incomingParentDelegates);
  }

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

router.get("/players/:id/activity-summary", requireAuth, async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const clubId = req.session.clubId!;
  const [player] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, clubId)));

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const now = new Date();
  const trainingSessions = player.teamId
    ? (await db
        .select()
        .from(trainingSessionsTable)
        .where(and(eq(trainingSessionsTable.clubId, clubId), eq(trainingSessionsTable.teamId, player.teamId)))
        .orderBy(desc(trainingSessionsTable.scheduledAt)))
        .filter((session) => new Date(session.scheduledAt).getTime() <= now.getTime() && session.status !== "cancelled")
    : [];
  const trainingSessionIds = trainingSessions.map((session) => session.id);
  const trainingAttendanceRows = trainingSessionIds.length > 0
    ? await db
        .select()
        .from(trainingAttendancesTable)
        .where(and(
          eq(trainingAttendancesTable.clubId, clubId),
          eq(trainingAttendancesTable.playerId, player.id),
          inArray(trainingAttendancesTable.trainingSessionId, trainingSessionIds),
        ))
    : [];
  const presentTraining = trainingAttendanceRows.filter((row) => row.status === "present").length;
  const absentTraining = trainingAttendanceRows.filter((row) => row.status === "absent").length;
  const conductCounts = trainingAttendanceRows.reduce<Record<string, number>>((acc, row) => {
    const conduct = parseAttendanceConduct(row.notes);
    if (conduct) acc[conduct] = (acc[conduct] ?? 0) + 1;
    return acc;
  }, {});
  const trainingTotal = trainingSessions.length;
  const trainingRecorded = trainingAttendanceRows.length;

  const matches = player.teamId
    ? (await db
        .select()
        .from(matchesTable)
        .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, player.teamId)))
        .orderBy(desc(matchesTable.date)))
        .filter((match) => new Date(match.date).getTime() <= now.getTime())
    : [];
  const matchIds = matches.map((match) => match.id);
  const callups = matchIds.length > 0
    ? await db
        .select()
        .from(callUpsTable)
        .where(and(eq(callUpsTable.playerId, player.id), inArray(callUpsTable.matchId, matchIds)))
    : [];
  const matchAppearances = callups.filter((callup) => !["absent", "unavailable", "not_called"].includes(String(callup.status ?? "").toLowerCase())).length;
  const disciplineCards = matches.flatMap((match) =>
    normalizeDisciplineCards(match.matchPlan)
      .filter((card) => card.playerId === player.id)
      .map((card) => ({
        matchId: match.id,
        date: match.date,
        opponent: match.opponent,
        type: card.cardType,
        reason: card.reason,
        notes: card.notes ?? null,
      })),
  );

  const fitnessData = await db
    .select()
    .from(playerFitnessDataTable)
    .where(and(eq(playerFitnessDataTable.clubId, clubId), eq(playerFitnessDataTable.playerId, player.id)))
    .orderBy(desc(playerFitnessDataTable.date));

  res.json({
    conduct: {
      status: conductCounts.insufficiente > 0 ? "Da monitorare" : player.available === false ? "Da monitorare" : "Regolare",
      reason: player.available === false ? player.unavailabilityReason ?? "non_disponibile" : null,
      training: conductCounts,
      notes: stripMetaFromNotes(player.notes),
    },
    trainingAttendance: {
      totalPastSessions: trainingTotal,
      recorded: trainingRecorded,
      present: presentTraining,
      absent: absentTraining,
      unrecorded: Math.max(trainingTotal - trainingRecorded, 0),
      percentage: trainingTotal > 0 ? Math.round((presentTraining / trainingTotal) * 100) : null,
    },
    matchAttendance: {
      totalPastMatches: matches.length,
      callups: callups.length,
      appearances: matchAppearances,
      percentage: matches.length > 0 ? Math.round((matchAppearances / matches.length) * 100) : null,
    },
    fitnessTests: fitnessData.slice(0, 5).map((entry) => ({
      id: entry.id,
      date: entry.date,
      endurance: entry.endurance ?? null,
      strength: entry.strength ?? null,
      speed: entry.speed ?? null,
      notes: entry.notes ?? null,
    })),
    discipline: {
      cards: disciplineCards,
      supportedReasons: ["proteste", "fallo_di_gioco", "altro"],
      source: "Scheda partita",
    },
  });
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
  const { parentDelegates: incomingParentDelegates, ...parsedUpdateData } = parsed.data as typeof parsed.data & { parentDelegates?: ParentDelegateInput[] };
  const updateData = { ...parsedUpdateData } as Record<string, unknown>;
  normalizeNullablePlayerDates(updateData);
  const [existingPlayer] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));

  if (!existingPlayer) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const isAvailabilityOverrideOnlyUpdate =
    PLAYER_AVAILABILITY_OVERRIDE_ROLES.includes(role) &&
    Object.keys(updateData).every((key) => [
      "availabilityOverrideActive",
      "availabilityOverrideFrom",
      "availabilityOverrideUntil",
      "availabilityOverrideReason",
    ].includes(key));
  const isSportAvailabilityUpdate =
    PLAYER_SPORT_AVAILABILITY_ROLES.includes(role) &&
    Object.keys(updateData).every((key) => [
      "notes",
      "status",
      "available",
      "unavailabilityReason",
      "expectedReturn",
    ].includes(key));

  if (!PLAYER_MANAGE_ROLES.includes(role) && !isAvailabilityOverrideOnlyUpdate && !isSportAvailabilityUpdate) {
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

  if (isSportAvailabilityUpdate) {
    const allowed = new Set(["notes", "status", "available", "unavailabilityReason", "expectedReturn"]);
    for (const k of Object.keys(updateData)) {
      if (!allowed.has(k)) delete updateData[k];
    }
    if (typeof updateData.notes === "string") {
      updateData.notes = preserveExistingMetaInNotes(existingPlayer.notes, String(updateData.notes));
    }
  }

  if (PLAYER_MANAGE_ROLES.includes(role)) {
    enforcePlayerAvailabilityRules(updateData, existingPlayer);
  }
  if (!PLAYER_AVAILABILITY_OVERRIDE_ROLES.includes(role)) {
    delete updateData.availabilityOverrideActive;
    delete updateData.availabilityOverrideFrom;
    delete updateData.availabilityOverrideUntil;
    delete updateData.availabilityOverrideReason;
  } else if (updateData.availabilityOverrideActive === true) {
    updateData.available = true;
    updateData.unavailabilityReason = null;
    updateData.expectedReturn = null;
  }
  if (existingPlayer.unavailabilityReason === "payment" && !PLAYER_AVAILABILITY_OVERRIDE_ROLES.includes(role)) {
    if (updateData.available === true) {
      delete updateData.available;
      delete updateData.unavailabilityReason;
      delete updateData.expectedReturn;
    }
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

  if (PLAYER_MANAGE_ROLES.includes(role) && incomingParentDelegates) {
    await replaceParentDelegates(req.session.clubId!, player.id, incomingParentDelegates);
  }

  const overrideActivated =
    updateData.availabilityOverrideActive === true &&
    (existingPlayer as PlayerWithAvailabilityOverride).availabilityOverrideActive !== true &&
    isAvailabilityOverrideActive(player);
  if (overrideActivated && req.session.clubId) {
    try {
      const fullName = `${player.firstName} ${player.lastName}`.trim();
      await db.insert(clubNotificationsTable).values({
        clubId: req.session.clubId,
        title: `Forza disponibilita: ${fullName}`,
        message: `Disponibilita forzata fino al ${(player as PlayerWithAvailabilityOverride).availabilityOverrideUntil ?? "periodo indicato"}. Motivo: ${(player as PlayerWithAvailabilityOverride).availabilityOverrideReason ?? "non indicato"}.`,
        type: "warning",
        createdByUserId: req.session.userId,
      });
      await notifyParentAvailabilityOverride(req.session.clubId, player, (player as PlayerWithAvailabilityOverride).availabilityOverrideUntil);
    } catch (error) {
      console.error("[players] availability override notification failed", error);
    }
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

router.get("/players/:id/parent-delegates", requireAuth, async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [player] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(await listParentDelegates(req.session.clubId!, params.data.id));
});

router.put("/players/:id/parent-delegates", requireAuth, async (req, res): Promise<void> => {
  const role = normalizeSessionRole(req.session.role);
  if (!PLAYER_MANAGE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non sei autorizzato a gestire l'app genitori" });
    return;
  }
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [player] = await db
    .select({ id: playersTable.id })
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const delegates = await replaceParentDelegates(req.session.clubId!, params.data.id, sanitizeParentDelegates(req.body?.delegates));
  res.json(delegates);
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
