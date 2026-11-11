import { activationContact, activationScope, activations, deliverActivation, ensureAccountActivations, issueActivation } from "../lib/account-activation";
import { TRAINING_TRIAL_STATUS } from "../lib/training-trials";
import { sessionTeamScope } from "../lib/session-team-scope";
import { supplementalTrainingTeam } from "../lib/training-roster-policy";
import { playerMatchAttendance } from "../lib/player-match-attendance";
import { Router, type IRouter } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { ensureParentDelegateSecurityColumns, ensureParentFamilyLinks } from "../lib/parent-delegate-access";
import {
  db,
  seasonsTable,
  playersTable,
  teamsTable,
  teamStaffAssignmentsTable,
  clubMembershipsTable,
  clubNotificationsTable,
  playerParentDelegatesTable,
  parentPlayerRelationsTable,
  parentNotificationsTable,
  trainingSessionsTable,
  trainingAttendancesTable,
  matchesTable,
  callUpsTable,
  playerFitnessDataTable,
  type PlayerProfileEntry,
  type PlayerAssignmentChange,
} from "@workspace/db";
import { eq, and, or, asc, desc, inArray, sql } from "drizzle-orm";
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
import { isClubWideListRole, normalizeSessionRole, resolveAllowedClubSections, getAssignedTeamIds, getPlayerMeasurementTeamScope, canAccessPlayerMeasurements } from "../lib/club-scope";
import { requireClubAndUserIds } from "../lib/session-context";
import { assertCanCreateWithinPlan } from "../lib/plan-limits";
import { sendParentNotificationEmail } from "../lib/parent-email";

/** Il direttore tecnico elenca tutti i giocatori del club; coach/preparatori solo le proprie squadre. */
const PLAYER_ASSIGNMENT_FILTER_ROLES_NORM = new Set(["coach", "fitness_coach", "athletic_director"]);

let ensuredClubNotificationTargetColumns = false;

async function ensureClubNotificationTargetColumns() {
  if (ensuredClubNotificationTargetColumns) return;
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'all'`);
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_roles JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  ensuredClubNotificationTargetColumns = true;
}

function uniquePositiveIds(values: unknown[]): number[] {
  return Array.from(new Set(values.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)));
}

async function resolvePlayerNoteRecipients(clubId: number, player: typeof playersTable.$inferSelect, recipient: string) {
  if (recipient === "coach_staff") {
    const teamId = Number(player.teamId ?? 0);
    if (!teamId) return [];
    const assignmentRows = await db
      .select({ userId: teamStaffAssignmentsTable.userId })
      .from(teamStaffAssignmentsTable)
      .where(and(eq(teamStaffAssignmentsTable.clubId, clubId), eq(teamStaffAssignmentsTable.teamId, teamId)));
    const [team] = await db
      .select({ coachId: teamsTable.coachId })
      .from(teamsTable)
      .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, teamId)))
      .limit(1);
    return uniquePositiveIds([...assignmentRows.map((row) => row.userId), team?.coachId]);
  }

  const targetRoles =
    recipient === "technical_director"
      ? ["technical_director"]
      : recipient === "secretary"
        ? ["secretary"]
        : [];
  if (targetRoles.length === 0) return [];

  const rows = await db
    .select({ userId: clubMembershipsTable.userId })
    .from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId, clubId), inArray(clubMembershipsTable.role, targetRoles)));
  return uniquePositiveIds(rows.map((row) => row.userId));
}
const PLAYER_MANAGE_ROLES = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"];
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
const PARENT_ACCESS_RESET_ROLES = ["secretary", "admin", "presidente"];
const PARENT_DELEGATE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DISCIPLINE_CARD_TYPES = new Set(["giallo", "doppio_giallo", "rosso"]);

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

function generateParentDelegateCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += PARENT_DELEGATE_CODE_ALPHABET[randomInt(PARENT_DELEGATE_CODE_ALPHABET.length)];
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

type DelegateWithActivation = typeof playerParentDelegatesTable.$inferSelect & { activationStatus?: string | null };

async function listParentDelegates(clubId: number, playerId: number): Promise<DelegateWithActivation[]> {
  await ensureParentDelegateSecurityColumns();
  await ensureAccountActivations();
  const rows = await db.select({ delegate: playerParentDelegatesTable, status: activations.status, usedAt: activations.usedAt })
    .from(playerParentDelegatesTable)
    .leftJoin(activations, and(eq(activations.kind, "parent"), eq(activations.clubId, clubId),
      eq(activations.subjectId, playerParentDelegatesTable.id)))
    .where(and(eq(playerParentDelegatesTable.clubId, clubId), eq(playerParentDelegatesTable.playerId, playerId)))
    .orderBy(asc(playerParentDelegatesTable.id));
  return rows.map(({ delegate, status, usedAt }) => ({ ...delegate, activationStatus: usedAt ? "active" : status }));
}

function parentDelegateView(delegate: DelegateWithActivation, includeAccessCode = true) {
  return {
    id: delegate.id,
    firstName: delegate.firstName,
    lastName: delegate.lastName,
    relation: delegate.relation,
    phone: delegate.phone,
    email: delegate.email,
    ...(includeAccessCode && !delegate.activationStatus ? { accessCode: delegate.accessCode } : {}),
    activationStatus: delegate.activationStatus ?? null,
    isActive: delegate.isActive,
    deliveryChannel: delegate.deliveryChannel,
    deliveryStatus: delegate.deliveryStatus,
  };
}

async function replaceParentDelegates(clubId: number, playerId: number, incoming: ParentDelegateInput[]) {
  await ensureParentDelegateSecurityColumns();
  await ensureAccountActivations();
  const invites: NonNullable<Awaited<ReturnType<typeof issueActivation>>>[] = [];
  const saved = await db.transaction(async tx => {
    const [player] = await tx.select({ id: playersTable.id }).from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, playerId))).for("update");
    if (!player) return [];
    const scope = and(eq(playerParentDelegatesTable.clubId, clubId), eq(playerParentDelegatesTable.playerId, playerId));
    const existing = await tx.select({ id: playerParentDelegatesTable.id }).from(playerParentDelegatesTable).where(scope);
    const existingIds = new Set(existing.map(delegate => delegate.id));
    const savedIds = new Set<number>();
    const delegates = [];
    for (const delegate of sanitizeParentDelegates(incoming)) {
      const fields = {
        firstName: cleanText(delegate.firstName) || "Delegato",
        lastName: cleanText(delegate.lastName) || "Genitore",
        relation: cleanText(delegate.relation) || "Genitore/Tutore",
        phone: cleanText(delegate.phone) || null,
        email: cleanText(delegate.email).toLowerCase() || null,
        deliveryChannel: cleanText(delegate.phone) ? "sms_ready" : cleanText(delegate.email) ? "email_ready" : "manual",
        deliveryStatus: "ready",
        isActive: delegate.isActive !== false,
      };
      const id = delegate.id;
      if (id !== undefined && existingIds.has(id)) {
        if (savedIds.has(id)) continue;
        const [saved] = await tx.update(playerParentDelegatesTable).set(fields)
          .where(and(scope, eq(playerParentDelegatesTable.id, id))).returning();
        savedIds.add(id);
        delegates.push(saved);
      } else {
        const [saved] = await tx.insert(playerParentDelegatesTable)
          .values({ ...fields, clubId, playerId, accessCode: generateParentDelegateCode() }).returning();
        delegates.push(saved);
        const contact = activationContact(saved.email, saved.phone);
        if (saved.isActive && contact) {
          const invite = await issueActivation(tx, { kind: "parent", clubId, subjectId: saved.id }, contact);
          if (invite) invites.push(invite);
        }
      }
    }
    const removed = existing.filter(delegate => !savedIds.has(delegate.id)).map(delegate => delegate.id);
    if (removed.length) {
      await tx.delete(activations).where(and(eq(activations.kind, "parent"), eq(activations.clubId, clubId), inArray(activations.subjectId, removed)));
      await tx.delete(playerParentDelegatesTable).where(and(scope, inArray(playerParentDelegatesTable.id, removed)));
    }
    return delegates;
  });
  if (invites.length) await Promise.all(invites.map(deliverActivation));
  return saved.length ? listParentDelegates(clubId, playerId) : [];
}

type PlayerMeta = {
  squad?: string | null;
  supplementalSquad?: string | null;
  imageUrl?: string | null;
  supplementalTeamId?: number | null;
  primarySpecificRole?: string | null;
  primaryLineupStatus?: string | null;
  supplementalSpecificRole?: string | null;
  supplementalLineupStatus?: string | null;
};

function extractPlayerMeta(notes?: string | null): PlayerMeta {
  const full = String(notes ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return {};
  const metaStart = PLAYER_META_MARKER.length;
  const nextNewLineIdx = full.indexOf("\n");
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(metaStart, nextNewLineIdx).trim()
    : full.slice(metaStart).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as PlayerMeta;
    const n = Number(parsed?.supplementalTeamId);
    return {
      squad: cleanText(parsed?.squad) || null,
      supplementalSquad: cleanText(parsed?.supplementalSquad) || null,
      imageUrl: cleanText(parsed?.imageUrl) || null,
      supplementalTeamId: Number.isFinite(n) ? n : null,
      primarySpecificRole: cleanText(parsed?.primarySpecificRole) || null,
      primaryLineupStatus: cleanText(parsed?.primaryLineupStatus) || null,
      supplementalSpecificRole: cleanText(parsed?.supplementalSpecificRole) || null,
      supplementalLineupStatus: cleanText(parsed?.supplementalLineupStatus) || null,
    };
  } catch {
    return {};
  }
}

function extractSupplementalTeamId(notes?: string | null): number | null {
  return extractPlayerMeta(notes).supplementalTeamId ?? null;
}

type PlayerRequestConflict = {
  playerId: number;
  requestedByTeamId: number | null;
  requestedByTeamName: string | null;
  requestedMatchId: number;
  requestedMatchDate: string | null;
};

function rowsFromDbExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

async function playerRequestConflictsForMatch(clubId: number, matchId: number, playerIds: number[]) {
  const cleanPlayerIds = [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (cleanPlayerIds.length === 0) return new Map<number, PlayerRequestConflict>();

  const [currentMatch] = await db
    .select({ id: matchesTable.id, date: matchesTable.date, teamId: matchesTable.teamId })
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)))
    .limit(1);
  if (!currentMatch) return new Map<number, PlayerRequestConflict>();

  const result = await db.execute(sql`
    SELECT
      cu.player_id AS "playerId",
      m.id AS "requestedMatchId",
      m.team_id AS "requestedByTeamId",
      m.date AS "requestedMatchDate",
      t.name AS "requestedByTeamName"
    FROM call_ups cu
    INNER JOIN matches m ON m.id = cu.match_id
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.club_id = ${clubId}
      AND cu.player_id IN ${sql.raw(`(${cleanPlayerIds.join(",")})`)}
      AND m.id <> ${currentMatch.id}
      AND COALESCE(m.team_id, 0) <> COALESCE(${currentMatch.teamId ?? 0}, 0)
      AND (cu.status IS NULL OR lower(cu.status) NOT IN ('declined', 'unavailable', 'absent', 'not_called'))
      AND (m.date AT TIME ZONE 'Europe/Rome')::date = (${currentMatch.date}::timestamptz AT TIME ZONE 'Europe/Rome')::date
    ORDER BY m.date ASC, m.id ASC
  `);

  const rows = rowsFromDbExecute<PlayerRequestConflict>(result);
  const conflicts = new Map<number, PlayerRequestConflict>();
  for (const row of rows) {
    const playerId = Number(row.playerId);
    if (!Number.isInteger(playerId) || conflicts.has(playerId)) continue;
    conflicts.set(playerId, {
      playerId,
      requestedByTeamId: row.requestedByTeamId == null ? null : Number(row.requestedByTeamId),
      requestedByTeamName: row.requestedByTeamName ?? null,
      requestedMatchId: Number(row.requestedMatchId),
      requestedMatchDate: row.requestedMatchDate ? new Date(row.requestedMatchDate).toISOString() : null,
    });
  }
  return conflicts;
}

function staffRoleForSection(raw: string | null | undefined, section: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { bySection?: Record<string, string> };
    if (parsed?.bySection && typeof parsed.bySection === "object") {
      if (section && parsed.bySection[section]) return parsed.bySection[section];
      return Object.values(parsed.bySection)[0] ?? null;
    }
  } catch {
    return raw;
  }
  return raw;
}

async function userIsPrimaryCoachForPlayer(player: typeof playersTable.$inferSelect, userId: number, clubId: number): Promise<boolean> {
  if (!player.teamId) return false;
  const [team] = await db
    .select({ id: teamsTable.id, coachId: teamsTable.coachId, clubSection: teamsTable.clubSection })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, clubId)))
    .limit(1);
  if (!team) return false;
  if (team.coachId === userId) return true;
  const [assignment] = await db
    .select({ role: teamStaffAssignmentsTable.role, staffRole: clubMembershipsTable.staffRole })
    .from(teamStaffAssignmentsTable)
    .leftJoin(
      clubMembershipsTable,
      and(
        eq(clubMembershipsTable.userId, teamStaffAssignmentsTable.userId),
        eq(clubMembershipsTable.clubId, teamStaffAssignmentsTable.clubId),
      ),
    )
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
      eq(teamStaffAssignmentsTable.teamId, team.id),
    ))
    .limit(1);
  return assignment?.role === "coach" && staffRoleForSection(assignment.staffRole, team.clubSection) === "primo_allenatore";
}

function stripMetaFromNotes(raw?: string | null): string {
  const full = String(raw ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return full;
  const nextNewLineIdx = full.indexOf("\n");
  return nextNewLineIdx >= 0 ? full.slice(nextNewLineIdx + 1).trim() : "";
}

function composePlayerMeta(notesRaw: string, meta: PlayerMeta): string {
  const cleanNotes = String(notesRaw ?? "").trim();
  const hasAnyMeta = Boolean(
    meta.squad ||
    meta.supplementalSquad ||
    meta.imageUrl ||
    meta.supplementalTeamId ||
    meta.primarySpecificRole ||
    meta.primaryLineupStatus ||
    meta.supplementalSpecificRole ||
    meta.supplementalLineupStatus,
  );
  if (!hasAnyMeta) return cleanNotes;
  const encoded = `${PLAYER_META_MARKER}${JSON.stringify({
    squad: meta.squad ?? null,
    supplementalSquad: meta.supplementalSquad ?? null,
    imageUrl: meta.imageUrl ?? null,
    supplementalTeamId: meta.supplementalTeamId ?? null,
    primarySpecificRole: meta.primarySpecificRole ?? null,
    primaryLineupStatus: meta.primaryLineupStatus ?? null,
    supplementalSpecificRole: meta.supplementalSpecificRole ?? null,
    supplementalLineupStatus: meta.supplementalLineupStatus ?? null,
  })}`;
  return cleanNotes ? `${encoded}\n${cleanNotes}` : encoded;
}

function numberOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textOrNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return cleanText(value) || null;
}

function mergeIncomingPlayerMeta(existingRaw: string | null | undefined, incomingRaw: string | null | undefined, source: Record<string, unknown>): string {
  const baseMeta = extractPlayerMeta(existingRaw);
  const incomingMeta = extractPlayerMeta(incomingRaw);
  const merged: PlayerMeta = {
    ...baseMeta,
    ...incomingMeta,
  };
  const supplementalTeamId = numberOrNull(source.supplementalTeamId);
  const squad = textOrNull(source.squad);
  const supplementalSquad = textOrNull(source.supplementalSquad);
  const imageUrl = textOrNull(source.imageUrl);
  const primarySpecificRole = textOrNull(source.primarySpecificRole);
  const primaryLineupStatus = textOrNull(source.primaryLineupStatus);
  const supplementalSpecificRole = textOrNull(source.supplementalSpecificRole);
  const supplementalLineupStatus = textOrNull(source.supplementalLineupStatus);
  if (supplementalTeamId !== undefined) merged.supplementalTeamId = supplementalTeamId;
  if (squad !== undefined) merged.squad = squad;
  if (supplementalSquad !== undefined) merged.supplementalSquad = supplementalSquad;
  if (imageUrl !== undefined) merged.imageUrl = imageUrl;
  if (primarySpecificRole !== undefined) merged.primarySpecificRole = primarySpecificRole;
  if (primaryLineupStatus !== undefined) merged.primaryLineupStatus = primaryLineupStatus;
  if (supplementalSpecificRole !== undefined) merged.supplementalSpecificRole = supplementalSpecificRole;
  if (supplementalLineupStatus !== undefined) merged.supplementalLineupStatus = supplementalLineupStatus;
  return composePlayerMeta(stripMetaFromNotes(incomingRaw), merged);
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

function normalizeDisciplineCards(matchPlan: unknown): Array<{ playerId: number; cardType: string; reason: string; notes?: string | null; suspensionGames?: number | null }> {
  const source = matchPlan && typeof matchPlan === "object" ? (matchPlan as { disciplineCards?: unknown }) : null;
  if (!Array.isArray(source?.disciplineCards)) return [];
  return source.disciplineCards
    .map((item) => {
      const card = item as { playerId?: unknown; cardType?: unknown; reason?: unknown; notes?: unknown; suspensionGames?: unknown };
      const cardType = String(card.cardType ?? "giallo");
      return {
        playerId: Number(card.playerId),
        cardType: DISCIPLINE_CARD_TYPES.has(cardType) ? cardType : "giallo",
        reason: String(card.reason ?? "altro"),
        notes: card.notes == null ? null : String(card.notes),
        suspensionGames: card.suspensionGames == null ? null : Number(card.suspensionGames),
      };
    })
    .filter((card) => Number.isFinite(card.playerId) && card.playerId > 0);
}

function normalizeCompetition(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function disciplinarySuspensionGamesForCard(card: { cardType: string; suspensionGames?: number | null }): number {
  if (card.suspensionGames != null && Number.isFinite(Number(card.suspensionGames))) {
    return Math.max(0, Math.floor(Number(card.suspensionGames)));
  }
  if (card.cardType === "rosso" || card.cardType === "doppio_giallo") return 1;
  return 0;
}

async function suspendedPlayerIdsForMatch(clubId: number, matchId: number, playerIds: number[]): Promise<Set<number>> {
  const cleanPlayerIds = [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (cleanPlayerIds.length === 0) return new Set();
  const [targetMatch] = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));
  if (!targetMatch?.teamId) return new Set();

  const targetCompetition = normalizeCompetition(targetMatch.competition);
  const rows = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, targetMatch.teamId)))
    .orderBy(sql`${matchesTable.date} asc`, sql`${matchesTable.id} asc`);

  const yellowCounts = new Map<number, number>();
  const suspensionQueues = new Map<number, number>();
  const targetTime = new Date(targetMatch.date).getTime();

  for (const row of rows) {
    const rowTime = new Date(row.date).getTime();
    if (row.id === targetMatch.id || rowTime >= targetTime) break;
    if (targetCompetition && normalizeCompetition(row.competition) !== targetCompetition) continue;

    for (const [playerId, games] of Array.from(suspensionQueues.entries())) {
      if (games <= 0) continue;
      suspensionQueues.set(playerId, games - 1);
    }

    for (const card of normalizeDisciplineCards(row.matchPlan)) {
      if (!cleanPlayerIds.includes(card.playerId)) continue;
      if (card.cardType === "giallo") {
        const nextCount = (yellowCounts.get(card.playerId) ?? 0) + 1;
        if (nextCount >= 4) {
          yellowCounts.set(card.playerId, 0);
          suspensionQueues.set(card.playerId, (suspensionQueues.get(card.playerId) ?? 0) + 1);
        } else {
          yellowCounts.set(card.playerId, nextCount);
        }
        continue;
      }
      const games = disciplinarySuspensionGamesForCard(card);
      if (games > 0) {
        suspensionQueues.set(card.playerId, (suspensionQueues.get(card.playerId) ?? 0) + games);
      }
    }
  }

  return new Set(cleanPlayerIds.filter((playerId) => (suspensionQueues.get(playerId) ?? 0) > 0));
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
  const incomingStatus = typeof data.status === "string" ? data.status : existing?.status;
  const incomingReason = typeof data.unavailabilityReason === "string"
    ? data.unavailabilityReason
    : existing?.unavailabilityReason;
  const overrideSource = {
    availabilityOverrideActive: "availabilityOverrideActive" in data ? data.availabilityOverrideActive : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideActive,
    availabilityOverrideFrom: "availabilityOverrideFrom" in data ? data.availabilityOverrideFrom : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideFrom,
    availabilityOverrideUntil: "availabilityOverrideUntil" in data ? data.availabilityOverrideUntil : (existing as PlayerWithAvailabilityOverride | undefined)?.availabilityOverrideUntil,
  };
  if (incomingStatus === "injured") {
    data.status = "injured";
    data.available = false;
    if (!data.unavailabilityReason) data.unavailabilityReason = "injury";
    data.expectedReturn = null;
    return;
  }
  if (incomingStatus === "suspended") {
    data.status = "suspended";
    data.available = false;
    data.unavailabilityReason = "suspended";
    data.expectedReturn = null;
    return;
  }
  if (incomingStatus === "pending_transfer") {
    data.status = "pending_transfer";
    data.available = false;
    data.unavailabilityReason = "pending_transfer";
    data.expectedReturn = null;
    return;
  }
  const hasRequirements = registered && hasValidMedicalCertificate(certificate);
  if (hasRequirements) {
    if (incomingStatus === "inactive" && incomingReason !== "regular") {
      data.status = "inactive";
      data.available = false;
      if (!data.unavailabilityReason) data.unavailabilityReason = incomingReason || "other";
      data.expectedReturn = null;
      return;
    }
    data.status = "active";
    data.available = true;
    data.unavailabilityReason = null;
    data.expectedReturn = null;
    return;
  }

  if (incomingStatus === "inactive") {
    data.status = "inactive";
    data.available = false;
    if (!data.unavailabilityReason) data.unavailabilityReason = "other";
    data.expectedReturn = null;
    return;
  }

  data.status = "inactive";
  if (!isAvailabilityOverrideActive(overrideSource)) {
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
    await sendParentNotificationEmail({
      parentUserId: relation.parentUserId,
      playerId: player.id,
      clubId,
      title: `Disponibilita temporanea ${fullName}`,
      message: `La societa ha autorizzato temporaneamente la disponibilita del giocatore fino al ${String(until || "periodo indicato")}.`,
    });
  }
}

async function enrichPlayer(player: typeof playersTable.$inferSelect, role: unknown) {
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
  let supplementalTeamName: string | null = null;
  if (player.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, player.clubId)));
    if (team) teamName = team.name;
  }
  const meta = extractPlayerMeta(player.notes);
  if (meta.supplementalTeamId) {
    const [supplementalTeam] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, meta.supplementalTeamId), eq(teamsTable.clubId, player.clubId)));
    if (supplementalTeam) supplementalTeamName = supplementalTeam.name;
  }
  const parentDelegates = (await listParentDelegates(player.clubId, player.id))
    .map(delegate => parentDelegateView(delegate, PLAYER_MANAGE_ROLES.includes(normalizeSessionRole(role))));
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
    squad: meta.squad ?? null,
    supplementalSquad: meta.supplementalSquad ?? null,
    imageUrl: meta.imageUrl ?? null,
    supplementalTeamId: meta.supplementalTeamId ?? null,
    supplementalTeamName,
    primarySpecificRole: meta.primarySpecificRole ?? null,
    primaryLineupStatus: meta.primaryLineupStatus ?? null,
    supplementalSpecificRole: meta.supplementalSpecificRole ?? null,
    supplementalLineupStatus: meta.supplementalLineupStatus ?? null,
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
    shuttleRoute: (player as typeof player & { shuttleRoute?: string | null }).shuttleRoute ?? null,
    shuttleDirection: (player as typeof player & { shuttleDirection?: string | null }).shuttleDirection ?? null,
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
  const matchIdRaw = Number(req.query.matchId);
  const requestedMatchId = Number.isInteger(matchIdRaw) && matchIdRaw > 0 ? matchIdRaw : undefined;
  const role = req.session.role ?? "";
  const requestedSection = typeof req.query.section === "string" ? req.query.section : undefined;
  const sections = await resolveAllowedClubSections(req, requestedSection);

  let conditions = [eq(playersTable.clubId, clubId), sql`${playersTable.status} IS DISTINCT FROM ${TRAINING_TRIAL_STATUS}`];
  if (sections) {
    if (sections.length === 0) {
      res.json(ListPlayersResponse.parse([]));
      return;
    }
    conditions.push(inArray(playersTable.clubSection, sections));
  }

  const sectionTeamIds = sections
    ? (await db
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), inArray(teamsTable.clubSection, sections))))
        .map((team) => team.id)
    : [];
  const sectionTeamIdSet = new Set(sectionTeamIds);

  let assignedTeamIds: number[] = [];
  const needsAssignmentFiltering = !isClubWideListRole(role) && PLAYER_ASSIGNMENT_FILTER_ROLES_NORM.has(normalizeSessionRole(role));
  if (needsAssignmentFiltering) {
    const allAssignedTeamIds = await getAssignedTeamIds(userId, clubId);
    assignedTeamIds = sections
      ? allAssignedTeamIds.filter((teamId) => sectionTeamIdSet.has(teamId))
      : allAssignedTeamIds;
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

  const playerWhere = requestedTeamId || needsAssignmentFiltering
    ? eq(playersTable.clubId, clubId)
    : sections
      ? eq(playersTable.clubId, clubId)
      : and(...conditions);
  const players = await db.select().from(playersTable).where(playerWhere);
  const filtered = players.filter((player) => {
    const supplementalTeamId = extractSupplementalTeamId(player.notes);
    if (requestedTeamId) {
      return player.teamId === requestedTeamId || supplementalTeamId === requestedTeamId;
    }
    if (needsAssignmentFiltering) {
      if (player.teamId != null) return assignedTeamIds.includes(player.teamId);
      return supplementalTeamId != null && assignedTeamIds.includes(supplementalTeamId);
    }
    if (sections) {
      if (player.teamId != null) return sectionTeamIdSet.has(player.teamId);
      if (supplementalTeamId != null) return sectionTeamIdSet.has(supplementalTeamId);
      return sections.includes(player.clubSection);
    }
    return true;
  });
  const requestConflicts = requestedMatchId
    ? await playerRequestConflictsForMatch(clubId, requestedMatchId, filtered.map((player) => player.id))
    : new Map<number, PlayerRequestConflict>();
  const disciplinarySuspensions = requestedMatchId
    ? await suspendedPlayerIdsForMatch(clubId, requestedMatchId, filtered.map((player) => player.id))
    : new Set<number>();
  const enriched = await Promise.all(filtered.map(async (player) => {
    const row = await enrichPlayer(player, req.session.role);
    const conflict = requestConflicts.get(player.id);
    if (disciplinarySuspensions.has(player.id)) {
      return {
        ...row,
        available: false,
        unavailabilityReason: "suspended",
      };
    }
    if (!conflict) return row;
    return {
      ...row,
      available: false,
      unavailabilityReason: "requested_by_other_team",
      requestedByTeamId: conflict.requestedByTeamId,
      requestedByTeamName: conflict.requestedByTeamName,
      requestedMatchId: conflict.requestedMatchId,
      requestedMatchDate: conflict.requestedMatchDate,
    };
  }));
  res.json(ListPlayersResponse.parse(enriched));
});

const entryMeasurementFields = ["height", "weight"] as const;

function entryMeasurement(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;
}

function playerProfileEntry(
  player: Partial<Pick<typeof playersTable.$inferSelect, "position" | "jerseyNumber" | "height" | "weight">>,
  date: string | null = null,
): PlayerProfileEntry {
  return {
    source: date ? "entry" : "legacy",
    date,
    position: player.position ?? null,
    jerseyNumber: player.jerseyNumber ?? null,
    height: entryMeasurement(player.height),
    weight: entryMeasurement(player.weight),
  };
}

function profileEntryForPlayer(player: typeof playersTable.$inferSelect): PlayerProfileEntry {
  const entry = player.profileHistory?.entry ?? playerProfileEntry(player);
  return {
    ...entry,
    height: entryMeasurement(entry.height) ?? entryMeasurement(player.height),
    weight: entryMeasurement(entry.weight) ?? entryMeasurement(player.weight),
  };
}

function hasInvalidEntryMeasurement(values: { height?: unknown; weight?: unknown }) {
  return entryMeasurementFields.some(field => {
    const value = values[field];
    return value != null && value !== 0 && entryMeasurement(value) == null;
  });
}

function profileDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

const PARENT_FAMILY_ROLES = ["secretary", "admin"];
type FamilyReader = Pick<typeof db, "select" | "execute">;

async function activeFamilyAccounts(reader: FamilyReader, clubId: number, lookup: { id: number } | { contact: string }) {
  const delegate = playerParentDelegatesTable;
  const criteria = "id" in lookup ? eq(delegate.id, lookup.id) : or(
    eq(activations.destination, lookup.contact),
    sql`lower(trim(${delegate.email})) = ${lookup.contact}`,
    sql`regexp_replace(regexp_replace(${delegate.phone}, '[[:space:]().-]', '', 'g'), '^00', '+') = ${lookup.contact}`,
  );
  return reader.select({
    id: delegate.id, firstName: delegate.firstName, lastName: delegate.lastName,
    email: delegate.email, phone: delegate.phone, destination: activations.destination, playerId: delegate.playerId,
    childFirstName: playersTable.firstName, childLastName: playersTable.lastName,
  }).from(delegate)
    .innerJoin(playersTable, and(eq(playersTable.id, delegate.playerId), eq(playersTable.clubId, delegate.clubId)))
    .leftJoin(activations, and(eq(activations.kind, "parent"), eq(activations.clubId, delegate.clubId), eq(activations.subjectId, delegate.id)))
    .where(and(eq(delegate.clubId, clubId), eq(delegate.isActive, true), criteria,
      sql`(${activations.loginHash} IS NOT NULL OR (${delegate.personalAccessCodeHash} IS NOT NULL AND ${delegate.resetRequestedAt} IS NULL))`))
    .limit(20);
}

async function ensureFamilyAccountStorage() {
  await Promise.all([ensureAccountActivations(), ensureParentDelegateSecurityColumns(), ensureParentFamilyLinks()]);
}

function linkFamilyChild(reader: FamilyReader, delegateId: number, playerId: number) {
  return reader.execute(sql`
    INSERT INTO parent_delegate_children (delegate_id, player_id) VALUES (${delegateId}, ${playerId})
    ON CONFLICT (delegate_id, player_id) DO NOTHING
  `);
}

router.post("/parent-family-accounts/search", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PARENT_FAMILY_ROLES.includes(normalizeSessionRole(role))) { res.sendStatus(403); return; }
  const raw = req.body?.contact;
  const contact = typeof raw === "string" && raw.length <= 254 ? activationContact(raw, raw) : null;
  if (!contact) { res.status(400).json({ error: "Inserisci l’email o il numero internazionale dell’account." }); return; }
  await ensureFamilyAccountStorage();
  const accounts = await activeFamilyAccounts(db, clubId, { contact: contact.destination });
  res.json(accounts.map(({ id, firstName, lastName, playerId, childFirstName, childLastName }) =>
    ({ id, firstName, lastName, playerId, childFirstName, childLastName })));
});

router.get("/players/:id/parent-family-links", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PARENT_FAMILY_ROLES.includes(normalizeSessionRole(role))) { res.sendStatus(403); return; }
  const playerId = Number(req.params.id);
  if (!Number.isSafeInteger(playerId) || playerId <= 0) { res.sendStatus(400); return; }
  await ensureParentFamilyLinks();
  const result = await db.execute(sql`
    SELECT d.id, d.first_name AS "firstName", d.last_name AS "lastName"
    FROM parent_delegate_children l
    JOIN player_parent_delegates d ON d.id = l.delegate_id AND d.club_id = ${clubId}
    JOIN players p ON p.id = l.player_id AND p.club_id = d.club_id
    WHERE l.player_id = ${playerId}
    ORDER BY d.last_name, d.first_name, d.id
  `);
  res.json(result.rows);
});

router.put("/players/:id/parent-family-links/:delegateId", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PARENT_FAMILY_ROLES.includes(normalizeSessionRole(role))) { res.sendStatus(403); return; }
  const playerId = Number(req.params.id), delegateId = Number(req.params.delegateId);
  if (![playerId, delegateId].every(id => Number.isSafeInteger(id) && id > 0)) { res.sendStatus(400); return; }
  await ensureFamilyAccountStorage();
  const [player] = await db.select({ id: playersTable.id }).from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)));
  const [account] = await activeFamilyAccounts(db, clubId, { id: delegateId });
  if (!player || !account || account.playerId === playerId) {
    res.status(404).json({ error: "Account o atleta non disponibile per il collegamento." });
    return;
  }
  await linkFamilyChild(db, delegateId, playerId);
  res.sendStatus(204);
});

router.delete("/players/:id/parent-family-links/:delegateId", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PARENT_FAMILY_ROLES.includes(normalizeSessionRole(role))) { res.sendStatus(403); return; }
  const playerId = Number(req.params.id), delegateId = Number(req.params.delegateId);
  if (![playerId, delegateId].every(id => Number.isSafeInteger(id) && id > 0)) { res.sendStatus(400); return; }
  await ensureParentFamilyLinks();
  await db.execute(sql`
    DELETE FROM parent_delegate_children l
    USING players p, player_parent_delegates d
    WHERE l.player_id = p.id AND l.delegate_id = d.id AND p.id = ${playerId} AND d.id = ${delegateId}
      AND p.club_id = ${clubId} AND d.club_id = ${clubId}
  `);
  res.sendStatus(204);
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
  const familyId = req.body?.parentFamilyDelegateId;
  if (familyId !== undefined && (!PARENT_FAMILY_ROLES.includes(role) || !Number.isSafeInteger(familyId) || familyId <= 0)) {
    res.status(400).json({ error: "Collegamento account Genitore non valido." });
    return;
  }
  if (hasInvalidEntryMeasurement(playerData)) {
    res.status(400).json({ error: "Altezza e peso iniziali devono essere numeri interi positivi." });
    return;
  }
  let clubSection = typeof req.session.section === "string" && req.session.section
    ? req.session.section
    : "scuola_calcio";
  if (playerData.teamId) {
    const [team] = await db
      .select({ clubSection: teamsTable.clubSection })
      .from(teamsTable)
      .where(and(eq(teamsTable.id, playerData.teamId), eq(teamsTable.clubId, req.session.clubId!)));
    if (familyId !== undefined && !team) {
      res.status(400).json({ error: "La squadra selezionata non appartiene alla società." });
      return;
    }
    if (team?.clubSection) clubSection = team.clubSection;
  }
  const values = {
    ...playerData,
    clubId: req.session.clubId!,
    clubSection,
  };
  normalizeNullablePlayerDates(values);
  enforcePlayerAvailabilityRules(values);

  if (familyId !== undefined) await ensureFamilyAccountStorage();
  const created = await db.transaction(async tx => {
    const [account] = familyId === undefined ? [] : await activeFamilyAccounts(tx, values.clubId, { id: familyId });
    if (familyId !== undefined && !account) return null;
    const [player] = await tx.insert(playersTable)
      .values({ ...values, profileHistory: { entry: playerProfileEntry(values, profileDate()), changes: [] } })
      .returning();
    if (account) await linkFamilyChild(tx, account.id, player.id);
    return { player, account };
  });
  if (!created) { res.status(409).json({ error: "L’account Genitore selezionato non è più disponibile." }); return; }
  const { player, account } = created;

  if (incomingParentDelegates) {
    const accountContacts = new Set(account ? [
      account.destination, activationContact(account.email)?.destination, activationContact(null, account.phone)?.destination,
    ].filter(Boolean) : []);
    const delegates = incomingParentDelegates.filter(delegate =>
      !accountContacts.has(activationContact(delegate.email)?.destination) &&
      !accountContacts.has(activationContact(null, delegate.phone)?.destination));
    await replaceParentDelegates(req.session.clubId!, player.id, delegates);
  }

  const enriched = await enrichPlayer(player, req.session.role);
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

  const enriched = await enrichPlayer(player, req.session.role);
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
  const clubTeams = await db.select().from(teamsTable).where(eq(teamsTable.clubId, clubId));
  const team = clubTeams.find(item => item.id === player.teamId);
  const teamIds = [player.teamId, supplementalTrainingTeam(player.notes)]
    .filter((id): id is number => id !== null && clubTeams.some(item => item.id === id));
  const [season] = team?.seasonId
    ? await db.select().from(seasonsTable).where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.id, team.seasonId)))
    : await db.select().from(seasonsTable).where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.isActive, true))).limit(1);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  const start = season?.startDate ?? team?.seasonTrainingStartDate ?? `${year}-07-01`;
  const end = season?.endDate ?? `${year + 1}-06-30`;
  const through = today < end ? today : end;
  const playerRecords = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.clubId, clubId), eq(trainingAttendancesTable.playerId, player.id)));
  const recordedSessionIds = playerRecords.map(record => record.trainingSessionId);
  const trainingSessions = teamIds.length || recordedSessionIds.length
    ? (await db
        .select()
        .from(trainingSessionsTable)
        .where(and(eq(trainingSessionsTable.clubId, clubId),
          or(...teamIds.map(id => sessionTeamScope(id)), recordedSessionIds.length ? inArray(trainingSessionsTable.id, recordedSessionIds) : undefined),
          sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date BETWEEN ${start}::date AND ${through}::date`,
          sql`${trainingSessionsTable.notes} IS DISTINCT FROM '[FTB_AUTO_TRAINING] GROUPED'`))
        .orderBy(desc(trainingSessionsTable.scheduledAt)))
        .filter((session) => new Date(session.scheduledAt).getTime() <= now.getTime() && !["cancelled", "canceled"].includes(session.status))
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

  const allPlayerCallups = await db.select({ matchId: callUpsTable.matchId, playerId: callUpsTable.playerId, status: callUpsTable.status })
    .from(callUpsTable).innerJoin(matchesTable, eq(matchesTable.id, callUpsTable.matchId))
    .where(and(eq(matchesTable.clubId, clubId), eq(callUpsTable.playerId, player.id)));
  const historicalMatchIds = allPlayerCallups.map(row => row.matchId);
  const matches = teamIds.length || historicalMatchIds.length
    ? (await db
        .select()
        .from(matchesTable)
        .where(and(eq(matchesTable.clubId, clubId),
          or(teamIds.length ? inArray(matchesTable.teamId, teamIds) : undefined, historicalMatchIds.length ? inArray(matchesTable.id, historicalMatchIds) : undefined),
          sql`(COALESCE(${matchesTable.rescheduleDate}, ${matchesTable.date}) AT TIME ZONE 'Europe/Rome')::date BETWEEN ${start}::date AND ${through}::date`))
        .orderBy(desc(matchesTable.date)))
        .filter((match) => (!match.isPostponed || !match.rescheduleTbd && match.rescheduleDate) && new Date(match.rescheduleDate ?? match.date).getTime() <= now.getTime())
    : [];
  const matchAttendance = playerMatchAttendance(matches, allPlayerCallups, player.id);
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
    .orderBy(desc(playerFitnessDataTable.date), desc(playerFitnessDataTable.id));

  const measurementScope = await getPlayerMeasurementTeamScope(req);
  const showProfile = canAccessPlayerMeasurements(measurementScope, player.teamId ?? supplementalTrainingTeam(player.notes));
  const lastHeight = fitnessData.find(entry => entry.heightCm != null);
  const lastWeight = fitnessData.find(entry => entry.weightKg != null);
  const lastObservedRole = fitnessData.find(entry => entry.observedRole != null);
  res.json({
    period: { start, through },
    profile: showProfile ? {
      entry: profileEntryForPlayer(player),
      changes: player.profileHistory?.changes ?? [],
      height: lastHeight ? { value: lastHeight.heightCm, date: lastHeight.date } : null,
      weight: lastWeight ? { value: lastWeight.weightKg, date: lastWeight.date } : null,
      observedRole: lastObservedRole ? { value: lastObservedRole.observedRole, date: lastObservedRole.date } : null,
    } : undefined,
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
    matchAttendance,
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
  const rawUpdateData = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const explicitlyMarkedAvailable = rawUpdateData.available === true;
  normalizeNullablePlayerDates(updateData);
  const [existingPlayer] = await db
    .select()
    .from(playersTable)
    .where(and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, req.session.clubId!)));

  if (!existingPlayer) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const incomingMetaKeys = [
    "squad",
    "supplementalSquad",
    "imageUrl",
    "supplementalTeamId",
    "primarySpecificRole",
    "primaryLineupStatus",
    "supplementalSpecificRole",
    "supplementalLineupStatus",
  ];
  const hasIncomingMeta = incomingMetaKeys.some((key) => Object.prototype.hasOwnProperty.call(rawUpdateData, key));
  const primaryCoachRoleKeys = new Set(["position", "primarySpecificRole", "primaryLineupStatus"]);
  const isPrimaryCoachRoleUpdate =
    role === "coach" &&
    Object.keys(rawUpdateData).some((key) => primaryCoachRoleKeys.has(key)) &&
    Object.keys(rawUpdateData).every((key) => primaryCoachRoleKeys.has(key));
  const canPrimaryCoachEditRole = isPrimaryCoachRoleUpdate && await userIsPrimaryCoachForPlayer(existingPlayer, req.session.userId!, req.session.clubId!);
  if (hasIncomingMeta && (PLAYER_MANAGE_ROLES.includes(role) || canPrimaryCoachEditRole)) {
    updateData.notes = mergeIncomingPlayerMeta(
      existingPlayer.notes,
      typeof updateData.notes === "string" || updateData.notes === null ? updateData.notes as string | null : existingPlayer.notes,
      rawUpdateData,
    );
  }
  for (const key of incomingMetaKeys) {
    delete updateData[key];
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

  const isPrimaryCoachRoleOnlyUpdate =
    canPrimaryCoachEditRole &&
    Object.keys(updateData).every((key) => primaryCoachRoleKeys.has(key) || key === "notes");

  if (!PLAYER_MANAGE_ROLES.includes(role) && !isAvailabilityOverrideOnlyUpdate && !isSportAvailabilityUpdate && !isPrimaryCoachRoleOnlyUpdate) {
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

  if (isPrimaryCoachRoleOnlyUpdate) {
    const allowed = new Set(["position", "notes"]);
    for (const k of Object.keys(updateData)) {
      if (!allowed.has(k)) delete updateData[k];
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
  if (updateData.status === "suspended") {
    updateData.available = false;
    updateData.unavailabilityReason = "suspended";
  }
  if (updateData.status === "pending_transfer") {
    updateData.available = false;
    updateData.unavailabilityReason = "pending_transfer";
  }
  if (explicitlyMarkedAvailable || updateData.available === true) {
    updateData.available = true;
    updateData.status = "active";
    updateData.unavailabilityReason = null;
    updateData.expectedReturn = null;
  }

  if (Object.keys(updateData).length === 0) {
    const enrichedNoop = await enrichPlayer(existingPlayer, req.session.role);
    res.json(UpdatePlayerResponse.parse(enrichedNoop));
    return;
  }

  const previousThread = parsePlayerNotesThread(stripMetaFromNotes(existingPlayer.notes));
  const updatedThread =
    typeof updateData.notes === "string"
      ? parsePlayerNotesThread(stripMetaFromNotes(String(updateData.notes)))
      : previousThread;
  const previousIds = new Set(previousThread.map((n) => n.id));
  const newlyAddedThreadItems = updatedThread.filter((n) => n?.id && !previousIds.has(n.id));

  if (hasInvalidEntryMeasurement(updateData)) {
    res.status(400).json({ error: "Altezza e peso iniziali devono essere numeri interi positivi." });
    return;
  }
  const clubId = req.session.clubId!;
  const playerScope = and(eq(playersTable.id, params.data.id), eq(playersTable.clubId, clubId));
  const affectsProfile = ["height", "weight", "position", "jerseyNumber"].some(field => Object.hasOwn(updateData, field));
  const [player] = affectsProfile ? await db.transaction(async (tx) => {
    const [current] = await tx.select().from(playersTable).where(playerScope).for("update");
    if (!current) return [];
    const entry = profileEntryForPlayer(current);
    const profile = {
      entry: {
        ...entry,
        height: entry.height ?? entryMeasurement(updateData.height),
        weight: entry.weight ?? entryMeasurement(updateData.weight),
      },
      changes: current.profileHistory?.changes ?? [],
    };
    const nextRole = updateData.position === undefined ? current.position : updateData.position as string | null;
    const nextJersey = updateData.jerseyNumber === undefined ? current.jerseyNumber : updateData.jerseyNumber as number | null;
    if (nextRole !== current.position || nextJersey !== current.jerseyNumber) {
      const teamId = updateData.teamId === undefined ? current.teamId : updateData.teamId as number | null;
      const [team] = teamId == null ? [] : await tx.select({ name: teamsTable.name, season: seasonsTable.name })
        .from(teamsTable)
        .leftJoin(seasonsTable, and(eq(seasonsTable.id, teamsTable.seasonId), eq(seasonsTable.clubId, clubId)))
        .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId))).limit(1);
      const [activeSeason] = team?.season ? [] : await tx.select({ name: seasonsTable.name }).from(seasonsTable)
        .where(and(eq(seasonsTable.clubId, clubId), eq(seasonsTable.isActive, true))).limit(1);
      const change: PlayerAssignmentChange = { date: profileDate(), team: team?.name ?? null, season: team?.season ?? activeSeason?.name ?? null };
      if (nextRole !== current.position) change.role = { from: current.position, to: nextRole };
      if (nextJersey !== current.jerseyNumber) change.jersey = { from: current.jerseyNumber, to: nextJersey };
      profile.changes = [...profile.changes, change];
    }
    return tx.update(playersTable).set({ ...updateData, profileHistory: profile }).where(playerScope).returning();
  }) : await db.update(playersTable).set(updateData).where(playerScope).returning();

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
      await ensureClubNotificationTargetColumns();
      const fullName = `${player.firstName} ${player.lastName}`.trim();
      await db.insert(clubNotificationsTable).values({
        clubId: req.session.clubId,
        title: `Forza disponibilita: ${fullName}`,
        message: `Disponibilita forzata fino al ${(player as PlayerWithAvailabilityOverride).availabilityOverrideUntil ?? "periodo indicato"}. Motivo: ${(player as PlayerWithAvailabilityOverride).availabilityOverrideReason ?? "non indicato"}.`,
        type: "warning",
        targetAudience: "staff",
        targetRoles: ["secretary", "sporting_director", "technical_director", "director"],
        createdByUserId: req.session.userId,
      } as any);
      await notifyParentAvailabilityOverride(req.session.clubId, player, (player as PlayerWithAvailabilityOverride).availabilityOverrideUntil);
    } catch (error) {
      console.error("[players] availability override notification failed", error);
    }
  }

  if (newlyAddedThreadItems.length > 0 && req.session.clubId) {
    await ensureClubNotificationTargetColumns();
    const fullName = `${player.firstName} ${player.lastName}`.trim();
    for (const note of newlyAddedThreadItems) {
      const targetUserIds = await resolvePlayerNoteRecipients(req.session.clubId, player, String(note.recipient ?? ""));
      if (targetUserIds.length === 0) continue;
      const noteText = String(note.body ?? "").trim();
      const compactNote = noteText.length > 140 ? `${noteText.slice(0, 137)}...` : noteText;
      const directionLabel =
        note.recipient === "secretary"
          ? "alla segreteria"
          : note.recipient === "technical_director"
            ? "al direttore tecnico"
            : "allo staff";
      await db.insert(clubNotificationsTable).values({
        clubId: req.session.clubId,
        title: `Nota giocatore ${directionLabel}: ${fullName}`,
        message: compactNote
          ? `${compactNote}${note.requiresResponse ? " (richiesta risposta)" : ""}`
          : `Nuova nota giocatore ${directionLabel}${note.requiresResponse ? " con richiesta risposta" : ""}.`,
        type: note.requiresResponse ? "warning" : "info",
        targetAudience: "staff",
        targetUserIds,
        createdByUserId: req.session.userId ?? null,
      } as any);
    }
  }

  const enriched = await enrichPlayer(player, req.session.role);
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

  const includeAccessCode = PLAYER_MANAGE_ROLES.includes(normalizeSessionRole(req.session.role));
  const delegates = await listParentDelegates(req.session.clubId!, params.data.id);
  res.json(delegates.map(delegate => parentDelegateView(delegate, includeAccessCode)));
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
  res.json(delegates.map(delegate => parentDelegateView(delegate)));
});

router.post("/players/:id/parent-delegates/:delegateId/resend-activation", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PLAYER_MANAGE_ROLES.includes(normalizeSessionRole(role))) { res.sendStatus(403); return; }
  const playerId = Number(req.params.id);
  const subjectId = Number(req.params.delegateId);
  if (![playerId, subjectId].every(id => Number.isSafeInteger(id) && id > 0)) { res.sendStatus(400); return; }
  await ensureAccountActivations();
  await ensureParentDelegateSecurityColumns();
  const scope = { kind: "parent", clubId, subjectId } as const;
  const [delegate] = await db.select().from(playerParentDelegatesTable).where(and(
    eq(playerParentDelegatesTable.id, subjectId), eq(playerParentDelegatesTable.playerId, playerId),
    eq(playerParentDelegatesTable.clubId, clubId), eq(playerParentDelegatesTable.isActive, true),
  ));
  if (!delegate) { res.sendStatus(404); return; }
  const contact = activationContact(delegate.email, delegate.phone, req.body?.channel === "sms");
  if (!contact || (req.body?.channel === "sms" && contact.channel !== "sms")) {
    res.status(400).json({ error: "Salva un recapito valido. Per SMS serve il prefisso internazionale." }); return;
  }
  const [previous] = await db.select({ existingAccount: activations.existingAccount }).from(activations).where(activationScope(scope));
  const invite = await db.transaction(tx => issueActivation(tx, scope, contact, previous?.existingAccount ?? true));
  if (!invite) { res.status(409).json({ error: "Invito già attivato oppure inviato da meno di un minuto." }); return; }
  res.json({ activationStatus: await deliverActivation(invite) });
});

router.post("/players/:id/parent-delegates/:delegateId/reset-access", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !PARENT_ACCESS_RESET_ROLES.includes(normalizeSessionRole(role))) {
    res.status(403).json({ error: "Non sei autorizzato a resettare gli accessi dei genitori." });
    return;
  }

  const playerId = Number(req.params.id);
  const delegateId = Number(req.params.delegateId);
  if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Number.isSafeInteger(delegateId) || delegateId <= 0) {
    res.status(400).json({ error: "Giocatore o delegato non valido." });
    return;
  }

  await ensureParentDelegateSecurityColumns();
  const scope = and(
    eq(playerParentDelegatesTable.clubId, clubId),
    eq(playerParentDelegatesTable.playerId, playerId),
    eq(playerParentDelegatesTable.id, delegateId),
    eq(playerParentDelegatesTable.isActive, true),
  );
  const accessCode = generateParentDelegateCode(12);
  await ensureAccountActivations();
  const [updated] = await db.transaction(async tx => {
    await tx.select({ id: activations.subjectId }).from(activations).where(
      activationScope({ kind: "parent", clubId, subjectId: delegateId }),
    ).for("update");
    const rows = await tx.update(playerParentDelegatesTable)
    .set({
      accessCode,
      accessVersion: randomUUID(),
      personalAccessCodeHash: null,
      personalAccessCodeSetAt: null,
      resetRequestedAt: null,
      deliveryStatus: "ready",
    })
    .where(and(scope, sql`NOT EXISTS (
      SELECT 1 FROM player_parent_delegates AS existing
      WHERE existing.club_id = ${clubId} AND existing.access_code = ${accessCode}
    )`))
    .returning();
    if (rows.length) await tx.delete(activations).where(activationScope({ kind: "parent", clubId, subjectId: delegateId }));
    return rows;
  });

  if (!updated) {
    const [delegate] = await db.select({ id: playerParentDelegatesTable.id }).from(playerParentDelegatesTable).where(scope);
    if (!delegate) {
      res.status(404).json({ error: "Delegato attivo non trovato per questo giocatore." });
      return;
    }
    res.status(409).json({ error: "Impossibile generare un nuovo codice. Riprova." });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json(parentDelegateView(updated));
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
