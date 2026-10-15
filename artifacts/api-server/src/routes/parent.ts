import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import {
  db, clubsTable, playersTable, teamsTable,
  trainingSessionsTable, matchesTable, callUpsTable,
  trainingAttendancesTable, equipmentAssignmentsTable,
  playerPaymentsTable, playerDocumentsTable,
  platformAnnouncementsTable, parentNotificationsTable,
  calendarExtraEventsTable,
  playerFitnessDataTable,
  playerParentDelegatesTable,
} from "@workspace/db";
import { eq, and, gte, lte, asc, desc, or, inArray, sql } from "drizzle-orm";
import { parentPlayedMinutes, parentTrainingOccurrence, parentTrainingType, type ParentActivity, type ParentTrainingActivity } from "@workspace/api-zod";

const router: IRouter = Router();

function requireParentSession(req: any, res: any, next: any) {
  if (req.session.role !== "parent" || !req.session.clubId) {
    res.status(403).json({ error: "Parent session required" });
    return;
  }
  next();
}

function requireAdminSession(req: any, res: any, next: any) {
  if (!req.session.userId || !req.session.clubId || !["admin", "presidente"].includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Admin required" });
    return;
  }
  next();
}

function getParentPlayerId(req: any): number | null {
  const id = Number(req.session.parentPlayerId ?? 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function getParentDelegateId(req: any): number | null {
  const id = Number(req.session.parentDelegateId ?? 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function ensureParentDelegateSecurityColumns() {
  await db.execute(sql`ALTER TABLE player_parent_delegates ADD COLUMN IF NOT EXISTS personal_access_code_hash TEXT`);
  await db.execute(sql`ALTER TABLE player_parent_delegates ADD COLUMN IF NOT EXISTS personal_access_code_set_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE player_parent_delegates ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMPTZ`);
}

function normalizeAccessCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function validatePersonalAccessCode(value: string): string | null {
  if (value.length < 6 || value.length > 16) return "La chiave personale deve avere da 6 a 16 caratteri.";
  if (!/^[A-Z0-9]+$/.test(value)) return "Usa solo lettere e numeri.";
  return null;
}

let ensuredParentAvailabilityColumns = false;
let ensuredParentTrainingAvailabilityTable = false;

async function ensureParentAvailabilityColumns() {
  if (ensuredParentAvailabilityColumns) return;
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_status TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_reason TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_notes TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_updated_at TIMESTAMPTZ`);
  ensuredParentAvailabilityColumns = true;
}

async function ensureParentTrainingAvailabilityTable() {
  if (ensuredParentTrainingAvailabilityTable) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS parent_training_availabilities (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      occurrence_id TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (club_id, team_id, player_id, occurrence_id)
    )
  `);
  ensuredParentTrainingAvailabilityTable = true;
}

const PARENT_AVAILABILITY_REASONS = new Set(["illness", "catechism", "family", "other"]);

type ParentAvailabilityMeta = {
  status: string;
  parent_availability_status: string | null;
  parent_availability_reason: string | null;
  parent_availability_notes: string | null;
  parent_availability_updated_at: Date | string | null;
};

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function parentAvailabilityReasonLabel(reason?: string | null) {
  if (reason === "illness") return "malattia";
  if (reason === "catechism") return "catechismo";
  if (reason === "family") return "motivi familiari";
  if (reason === "other") return "altro";
  return null;
}

function parentAvailabilityDeadline(matchDate: Date) {
  const deadline = new Date(matchDate);
  deadline.setHours(23, 59, 59, 999);
  const daysSinceWednesday = (deadline.getDay() - 3 + 7) % 7 || 7;
  deadline.setDate(deadline.getDate() - daysSinceWednesday);
  return deadline;
}

function parentTrainingAvailabilityDeadline(scheduledAt: Date) {
  return scheduledAt;
}

function isParentTrainingAvailabilityRecord(record?: { status?: string | null; notes?: string | null } | null) {
  if (!record) return true;
  const status = String(record.status ?? "").toLowerCase();
  const notes = String(record.notes ?? "");
  return ["requested", "absent"].includes(status) && notes.startsWith("Genitore:");
}

function isCoachCallupStatus(status?: string | null) {
  const value = String(status ?? "").toLowerCase();
  return !["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(value);
}

const TRAINING_DAY_INDEX: Record<string, number> = {
  lunedi: 1,
  lunedì: 1,
  martedi: 2,
  martedì: 2,
  mercoledi: 3,
  mercoledì: 3,
  giovedi: 4,
  giovedì: 4,
  venerdi: 5,
  venerdì: 5,
  sabato: 6,
  domenica: 0,
};

function normalizeTrainingDay(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateParentTrainingCalendar(team: typeof teamsTable.$inferSelect, fromDate: Date, days = 45) {
  const schedule = Array.isArray(team.trainingSchedule) ? team.trainingSchedule : [];
  const startLimit = team.seasonTrainingStartDate ? new Date(`${team.seasonTrainingStartDate}T00:00:00`) : null;
  const endLimit = team.officialTrainingEndDate ? new Date(`${team.officialTrainingEndDate}T23:59:59`) : null;
  const rows: Array<Record<string, unknown>> = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(fromDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(fromDate.getDate() + offset);
    if (startLimit && date < startLimit) continue;
    if (endLimit && date > endLimit) continue;

    for (const slot of schedule) {
      const dayIndex = TRAINING_DAY_INDEX[normalizeTrainingDay(slot.day)];
      if (dayIndex === undefined || date.getDay() !== dayIndex) continue;
      const startTime = String(slot.startTime ?? "").trim() || "00:00";
      const endTime = String(slot.endTime ?? "").trim() || null;
      const dateKey = localDateKey(date);
      rows.push({
        id: `${team.id}-${dateKey}-${startTime}`,
        source: "team_training_schedule",
        title: "Allenamento",
        teamId: team.id,
        teamName: team.name,
        day: slot.day,
        date: dateKey,
        startTime,
        endTime,
        scheduledAt: `${dateKey}T${startTime}:00`,
        campo: slot.campo ?? null,
        lockerRoom: (slot as { lockerRoom?: string | null }).lockerRoom ?? null,
      });
    }
  }

  return rows.sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt))).slice(0, 30);
}

function parentRosterPlayer(player: typeof playersTable.$inferSelect, parentPlayerId: number | null) {
  const isOwnChild = parentPlayerId === player.id;
  return {
    id: player.id,
    teamId: player.teamId,
    firstName: player.firstName,
    lastName: player.lastName,
    position: player.position,
    jerseyNumber: player.jerseyNumber,
    available: player.available,
    isOwnChild,
    ...(isOwnChild
      ? {
        dateOfBirth: player.dateOfBirth,
        status: player.status,
        unavailabilityReason: player.unavailabilityReason,
        expectedReturn: player.expectedReturn,
        medicalCertificateExpiry: player.medicalCertificateExpiry,
        registrationStatus: player.registrationStatus,
        registered: player.registered,
        shuttleService: player.shuttleService,
        shuttleRoute: player.shuttleRoute,
        shuttleDirection: player.shuttleDirection,
      }
      : {}),
  };
}

const PLAYER_META_MARKER = "[FTB_PLAYER_META]";
const ATTENDANCE_META_PREFIX = "[FTB_ATTENDANCE_META]";

router.get("/parent/access-code", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentDelegateId = getParentDelegateId(req);
  if (!parentDelegateId) {
    res.status(403).json({ error: "Delegato genitore non collegato" });
    return;
  }
  await ensureParentDelegateSecurityColumns();
  const [delegate] = await db
    .select()
    .from(playerParentDelegatesTable)
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.id, parentDelegateId),
      eq(playerParentDelegatesTable.isActive, true),
    ));
  if (!delegate) {
    res.status(404).json({ error: "Delegato non trovato" });
    return;
  }
  res.json({
    hasPersonalAccessCode: Boolean(delegate.personalAccessCodeHash),
    personalAccessCodeSetAt: delegate.personalAccessCodeSetAt ?? null,
    resetRequestedAt: delegate.resetRequestedAt ?? null,
    firstName: delegate.firstName,
    lastName: delegate.lastName,
    relation: delegate.relation,
  });
});

router.post("/parent/access-code", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentDelegateId = getParentDelegateId(req);
  if (!parentDelegateId) {
    res.status(403).json({ error: "Delegato genitore non collegato" });
    return;
  }
  const currentCode = normalizeAccessCode(req.body?.currentCode);
  const newCode = normalizeAccessCode(req.body?.newCode);
  const validationError = validatePersonalAccessCode(newCode);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  if (currentCode && currentCode === newCode) {
    res.status(400).json({ error: "La nuova chiave deve essere diversa dalla chiave attuale." });
    return;
  }
  await ensureParentDelegateSecurityColumns();
  const [delegate] = await db
    .select()
    .from(playerParentDelegatesTable)
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.id, parentDelegateId),
      eq(playerParentDelegatesTable.isActive, true),
    ));
  if (!delegate) {
    res.status(404).json({ error: "Delegato non trovato" });
    return;
  }
  if (newCode === delegate.accessCode) {
    res.status(400).json({ error: "La chiave personale deve essere diversa dal codice iniziale/reset." });
    return;
  }

  const hasPersonalCode = Boolean(delegate.personalAccessCodeHash);
  if (hasPersonalCode) {
    if (!currentCode) {
      res.status(400).json({ error: "Inserisci la chiave attuale." });
      return;
    }
    const currentMatchesPersonal = await bcrypt.compare(currentCode, delegate.personalAccessCodeHash!);
    const currentMatchesEmergencyReset = Boolean(delegate.resetRequestedAt) && currentCode === delegate.accessCode;
    if (!currentMatchesPersonal && !currentMatchesEmergencyReset) {
      res.status(401).json({ error: "Chiave attuale non valida." });
      return;
    }
  } else if (currentCode && currentCode !== delegate.accessCode) {
    res.status(401).json({ error: "Codice iniziale non valido." });
    return;
  }
  const clubDelegates = await db
    .select()
    .from(playerParentDelegatesTable)
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.isActive, true),
    ));
  for (const clubDelegate of clubDelegates) {
    if (clubDelegate.id !== delegate.id && clubDelegate.accessCode === newCode) {
      res.status(400).json({ error: "Questa chiave non e disponibile." });
      return;
    }
    if (clubDelegate.id !== delegate.id && clubDelegate.personalAccessCodeHash) {
      const duplicatePersonalCode = await bcrypt.compare(newCode, clubDelegate.personalAccessCodeHash);
      if (duplicatePersonalCode) {
        res.status(400).json({ error: "Questa chiave non e disponibile." });
        return;
      }
    }
  }

  const personalAccessCodeHash = await bcrypt.hash(newCode, 10);
  const [updated] = await db
    .update(playerParentDelegatesTable)
    .set({
      personalAccessCodeHash,
      personalAccessCodeSetAt: new Date(),
      resetRequestedAt: null,
    })
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.id, parentDelegateId),
    ))
    .returning();

  res.json({
    hasPersonalAccessCode: true,
    personalAccessCodeSetAt: updated.personalAccessCodeSetAt ?? null,
    resetRequestedAt: null,
  });
});

router.post("/parent/access-code/reset-request", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentDelegateId = getParentDelegateId(req);
  if (!parentDelegateId) {
    res.status(403).json({ error: "Delegato genitore non collegato" });
    return;
  }
  await ensureParentDelegateSecurityColumns();
  const [updated] = await db
    .update(playerParentDelegatesTable)
    .set({ resetRequestedAt: new Date() })
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.id, parentDelegateId),
      eq(playerParentDelegatesTable.isActive, true),
    ))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Delegato non trovato" });
    return;
  }
  res.json({ resetRequestedAt: updated.resetRequestedAt });
});

function stripMetaFromNotes(raw?: string | null): string {
  const full = String(raw ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return full;
  const nextNewLineIdx = full.indexOf("\n");
  return nextNewLineIdx >= 0 ? full.slice(nextNewLineIdx + 1).trim() : "";
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

router.get("/parent/children", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  const now = new Date();

  if (parentPlayerId) {
    const [player] = await db.select().from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)));
    if (!player) {
      res.json([]);
      return;
    }
    const [team] = player.teamId
      ? await db.select().from(teamsTable).where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, player.teamId)))
      : [null];
    if (!team) {
      res.json([{ id: 0, name: "Senza squadra", players: [parentRosterPlayer(player, parentPlayerId)], nextTraining: null, nextMatch: null }]);
      return;
    }
    const teamPlayers = await db.select().from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.teamId, team.id)))
      .orderBy(asc(playersTable.lastName), asc(playersTable.firstName));
    const nextTraining = generateParentTrainingCalendar(team, now).slice(0, 1);
    const nextMatch = await db.select().from(matchesTable)
      .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, team.id), gte(matchesTable.date, now)))
      .orderBy(asc(matchesTable.date)).limit(1);
    res.json([{ ...team, players: teamPlayers.map((item) => parentRosterPlayer(item, parentPlayerId)), nextTraining: nextTraining[0] ?? null, nextMatch: nextMatch[0] ?? null }]);
    return;
  }

  const teams = await db.select().from(teamsTable).where(eq(teamsTable.clubId, clubId)).orderBy(asc(teamsTable.name));

  const enriched = await Promise.all(teams.map(async (team) => {
    const players = await db.select().from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.teamId, team.id)))
      .orderBy(asc(playersTable.lastName));

    const nextTraining = generateParentTrainingCalendar(team, now).slice(0, 1);

    const nextMatch = await db.select().from(matchesTable)
      .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, team.id), gte(matchesTable.date, now)))
      .orderBy(asc(matchesTable.date)).limit(1);

    return { ...team, players: players.map((item) => parentRosterPlayer(item, parentPlayerId)), nextTraining: nextTraining[0] ?? null, nextMatch: nextMatch[0] ?? null };
  }));

  res.json(enriched);
});

router.get("/parent/training", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  const now = new Date();
  if (!parentPlayerId) {
    res.json([]);
    return;
  }
  const [player] = await db.select({ teamId: playersTable.teamId }).from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)));
  if (!player?.teamId) {
    res.json([]);
    return;
  }
  const [team] = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, player.teamId)));
  if (!team) {
    res.json([]);
    return;
  }

  const trainingRows = generateParentTrainingCalendar(team, now);
  await ensureParentTrainingAvailabilityTable();
  const availabilityRows = trainingRows.length > 0
    ? sqlRows<{
      occurrenceId: string;
      status: string;
      reason: string | null;
      notes: string | null;
      updatedAt: Date | string | null;
    }>(await db.execute(sql`
      SELECT occurrence_id AS "occurrenceId", status, reason, notes, updated_at AS "updatedAt"
      FROM parent_training_availabilities
      WHERE club_id = ${clubId}
        AND team_id = ${team.id}
        AND player_id = ${parentPlayerId}
    `))
    : [];
  const availabilityByOccurrence = new Map(availabilityRows.map((row) => [row.occurrenceId, row]));

  res.json(trainingRows.map((row) => {
    const scheduledAt = new Date(String(row.scheduledAt));
    const deadline = parentTrainingAvailabilityDeadline(scheduledAt);
    const availability = availabilityByOccurrence.get(String(row.id));
    return {
      ...row,
      parentPlayerId,
      parentAvailability: availability
        ? {
          status: availability.status,
          reason: availability.reason ?? null,
          reasonLabel: parentAvailabilityReasonLabel(availability.reason),
          notes: availability.notes ?? null,
          updatedAt: availability.updatedAt ?? null,
        }
        : null,
      parentAvailabilityDeadline: deadline.toISOString(),
      parentAvailabilityLocked: now > deadline,
    };
  }));
});

router.patch("/parent/training-availability/:sessionId/:playerId", requireParentSession, async (req, res): Promise<void> => {
  const occurrenceId = String(req.params.sessionId ?? "").trim();
  const playerId = parseInt(String(req.params.playerId));
  const { status } = req.body as { status: string };
  const reason = String(req.body?.reason ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim();
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);

  if (!["available", "unavailable", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  if (!parentPlayerId || parentPlayerId !== playerId) {
    res.status(403).json({ error: "Puoi modificare solo la disponibilita del figlio collegato" }); return;
  }
  if (status === "unavailable" && !PARENT_AVAILABILITY_REASONS.has(reason)) {
    res.status(400).json({ error: "Motivo indisponibilita richiesto" }); return;
  }
  if (status === "unavailable" && reason === "other" && notes.length === 0) {
    res.status(400).json({ error: "Inserisci la motivazione in Altro" }); return;
  }

  const [player] = await db.select({ teamId: playersTable.teamId }).from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)));
  if (!player?.teamId) { res.status(403).json({ error: "Giocatore non collegato a una squadra" }); return; }

  const [team] = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, clubId)));
  if (!team) { res.status(403).json({ error: "Squadra non trovata" }); return; }

  const trainingRows = generateParentTrainingCalendar(team, new Date());
  const occurrence = trainingRows.find((row) => String(row.id) === occurrenceId);
  if (!occurrence) {
    res.status(404).json({ error: "Allenamento non trovato nel calendario generale" }); return;
  }

  const scheduledAt = new Date(String(occurrence.scheduledAt));
  if (new Date() > parentTrainingAvailabilityDeadline(scheduledAt)) {
    res.status(409).json({ error: "La disponibilita puo essere modificata fino all'orario dell'allenamento" }); return;
  }

  await ensureParentTrainingAvailabilityTable();
  const availabilityReason = status === "unavailable" ? reason : null;
  const availabilityNotes = status === "unavailable" ? (notes || null) : null;
  const updatedAt = new Date();
  const rows = sqlRows<{
    id: number;
    occurrenceId: string;
    playerId: number;
    status: string;
    reason: string | null;
    notes: string | null;
    updatedAt: Date | string | null;
  }>(await db.execute(sql`
    INSERT INTO parent_training_availabilities (
      club_id, team_id, player_id, occurrence_id, scheduled_at, status, reason, notes, updated_at
    )
    VALUES (
      ${clubId}, ${team.id}, ${playerId}, ${occurrenceId}, ${scheduledAt}, ${status},
      ${availabilityReason}, ${availabilityNotes}, ${updatedAt}
    )
    ON CONFLICT (club_id, team_id, player_id, occurrence_id)
    DO UPDATE SET
      scheduled_at = EXCLUDED.scheduled_at,
      status = EXCLUDED.status,
      reason = EXCLUDED.reason,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at
    RETURNING id, occurrence_id AS "occurrenceId", player_id AS "playerId", status, reason, notes, updated_at AS "updatedAt"
  `));
  const row = rows[0];
  res.json({ ...row, reasonLabel: parentAvailabilityReasonLabel(row?.reason) });
});

router.get("/parent/activity", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const playerId = getParentPlayerId(req);
  const empty: ParentActivity = { playerName: null, trainings: [], matches: [] };
  if (!playerId) { res.json(empty); return; }
  const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName }).from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, playerId)));
  if (!player) { res.json(empty); return; }
  const now = new Date();
  await ensureParentTrainingAvailabilityTable();
  const [attendance, availabilities, playedMatches] = await Promise.all([
    db.select({ id: trainingAttendancesTable.id, status: trainingAttendancesTable.status, notes: trainingAttendancesTable.notes,
      teamId: trainingSessionsTable.teamId, scheduledAt: trainingSessionsTable.scheduledAt,
      objectives: trainingSessionsTable.objectives, teamName: teamsTable.name })
      .from(trainingAttendancesTable)
      .innerJoin(trainingSessionsTable, and(eq(trainingSessionsTable.id, trainingAttendancesTable.trainingSessionId), eq(trainingSessionsTable.clubId, clubId)))
      .leftJoin(teamsTable, and(eq(teamsTable.id, trainingSessionsTable.teamId), eq(teamsTable.clubId, clubId)))
      .where(and(eq(trainingAttendancesTable.clubId, clubId), eq(trainingAttendancesTable.playerId, playerId),
        lte(trainingSessionsTable.scheduledAt, now), sql`${trainingSessionsTable.status} <> 'cancelled'`, sql`${trainingSessionsTable.sessionKind} <> 'tipo'`))
      .orderBy(desc(trainingAttendancesTable.createdAt)),
    db.execute(sql`SELECT a.occurrence_id AS "occurrenceId", a.scheduled_at AS "scheduledAt", a.status, a.reason, t.name AS "teamName"
      FROM parent_training_availabilities a JOIN teams t ON t.id = a.team_id AND t.club_id = ${clubId}
      WHERE a.club_id = ${clubId} AND a.player_id = ${playerId} AND a.scheduled_at <= ${now.toISOString()}`),
    db.select({ id: matchesTable.id, date: matchesTable.date, opponent: matchesTable.opponent, plan: matchesTable.matchPlan })
      .from(callUpsTable).innerJoin(matchesTable, and(eq(matchesTable.id, callUpsTable.matchId), eq(matchesTable.clubId, clubId)))
      .where(and(eq(callUpsTable.playerId, playerId), lte(matchesTable.date, now),
        sql`lower(${callUpsTable.status}) NOT IN ('available','unavailable','availability','absent','declined','not_called')`))
      .orderBy(desc(matchesTable.date)),
  ]);
  const history = new Map<string, ParentTrainingActivity>();
  for (const row of sqlRows<{ occurrenceId: string; scheduledAt: Date | string; status: string; reason: string | null; teamName: string }>(availabilities)) {
    history.set(row.occurrenceId, { id: row.occurrenceId, scheduledAt: new Date(row.scheduledAt).toISOString(), teamName: row.teamName,
      trainingType: null, attendance: null, conduct: null, availability: row.status, availabilityReason: parentAvailabilityReasonLabel(row.reason) });
  }
  const seen = new Set<string>();
  for (const row of attendance) {
    const key = row.teamId ? parentTrainingOccurrence(row.teamId, row.scheduledAt) : `attendance-${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const availability = history.get(key);
    history.set(key, { id: key, scheduledAt: row.scheduledAt.toISOString(), teamName: row.teamName ?? "Squadra",
      trainingType: parentTrainingType(row.objectives), attendance: row.status, conduct: parseAttendanceConduct(row.notes),
      availability: availability?.availability ?? null, availabilityReason: availability?.availabilityReason ?? null });
  }
  const uniqueMatches = [...new Map(playedMatches.map(match => [match.id, match])).values()];
  const response: ParentActivity = {
    playerName: `${player.firstName} ${player.lastName}`,
    trainings: [...history.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    matches: uniqueMatches.map(match => ({ id: match.id, date: match.date.toISOString(), opponent: match.opponent,
      minutes: parentPlayedMinutes(match.plan, playerId) })),
  };
  res.json(response);
});

router.get("/parent/attendance", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  if (!parentPlayerId) {
    res.json([]);
    return;
  }

  const rows = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.clubId, clubId), eq(trainingAttendancesTable.playerId, parentPlayerId)))
    .orderBy(desc(trainingAttendancesTable.createdAt));

  const enriched = await Promise.all(rows.map(async (row) => {
    const [session] = await db.select().from(trainingSessionsTable)
      .where(and(eq(trainingSessionsTable.clubId, clubId), eq(trainingSessionsTable.id, row.trainingSessionId)));
    let teamName = null;
    if (session?.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, session.teamId)));
      teamName = team?.name ?? null;
    }
    if (!session || session.status === "cancelled" || session.sessionKind === "tipo") return null;
    // Legacy endpoint remains compatible, but never sends internal attendance
    // notes, technical session titles or session identifiers to parents.
    return { id: row.id, playerId: row.playerId, status: row.status, notes: null,
      sessionTitle: parentTrainingType(session.objectives) ?? "Allenamento", conduct: parseAttendanceConduct(row.notes),
      scheduledAt: session.scheduledAt, teamName };
  }));

  res.json(enriched.filter(Boolean));
});

router.get("/parent/matches", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  let parentTeamId: number | null = null;
  if (parentPlayerId) {
    const [player] = await db.select({ teamId: playersTable.teamId }).from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)));
    parentTeamId = player?.teamId ?? null;
    if (!parentTeamId) {
      res.json([]);
      return;
    }
  }

  const matchConditions = [eq(matchesTable.clubId, clubId)];
  if (parentPlayerId && parentTeamId) matchConditions.push(eq(matchesTable.teamId, parentTeamId));
  const matches = await db.select().from(matchesTable)
    .where(and(...matchConditions))
    .orderBy(asc(matchesTable.date)).limit(50);

  await ensureParentAvailabilityColumns();
  const enriched = await Promise.all(matches.map(async (match) => {
    let teamName = null;
    if (match.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, match.teamId), eq(teamsTable.clubId, clubId)));
      teamName = team?.name ?? null;
    }
    const callUps = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, match.id));
    const callUpsWithNames = await Promise.all(callUps.map(async (cu) => {
      const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName })
        .from(playersTable).where(and(eq(playersTable.id, cu.playerId), eq(playersTable.clubId, clubId)));
      return { ...cu, playerName: player ? `${player.firstName} ${player.lastName}` : `#${cu.playerId}` };
    }));
    const ownCallUpRows = parentPlayerId
      ? sqlRows<ParentAvailabilityMeta>(await db.execute(sql`
          SELECT status, parent_availability_status, parent_availability_reason, parent_availability_notes, parent_availability_updated_at
          FROM call_ups
          WHERE match_id = ${match.id} AND player_id = ${parentPlayerId}
          ORDER BY
            CASE WHEN lower(status) NOT IN ('available', 'unavailable', 'availability', 'absent', 'declined', 'not_called') THEN 0 ELSE 1 END,
            id DESC
          LIMIT 1
        `))
      : [];
    const ownCallUp = ownCallUpRows[0] ?? null;
    const deadline = parentAvailabilityDeadline(match.date);
    return {
      ...match,
      teamName,
      callUps: callUpsWithNames,
      parentPlayerId,
      parentAvailability: ownCallUp
        ? {
          status: ownCallUp.parent_availability_status ?? (["available", "unavailable"].includes(String(ownCallUp.status).toLowerCase()) ? ownCallUp.status : null),
          reason: ownCallUp.parent_availability_reason ?? null,
          reasonLabel: parentAvailabilityReasonLabel(ownCallUp.parent_availability_reason),
          notes: ownCallUp.parent_availability_notes ?? null,
          updatedAt: ownCallUp.parent_availability_updated_at ?? null,
        }
        : null,
      parentAvailabilityDeadline: deadline.toISOString(),
      parentAvailabilityLocked: new Date() > deadline,
    };
  }));

  res.json(enriched);
});

router.get("/parent/calendar-extra-events", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  let parentTeamId: number | null = null;

  if (parentPlayerId) {
    const [player] = await db.select({ teamId: playersTable.teamId }).from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)));
    parentTeamId = player?.teamId ?? null;
    if (!parentTeamId) {
      res.json([]);
      return;
    }
  }

  const rows = await db
    .select()
    .from(calendarExtraEventsTable)
    .where(and(
      eq(calendarExtraEventsTable.clubId, clubId),
      or(
        eq(calendarExtraEventsTable.targetAudience, "all"),
        eq(calendarExtraEventsTable.targetAudience, "parents"),
        eq(calendarExtraEventsTable.notifyParents, 1),
      ) as any,
    ))
    .orderBy(asc(calendarExtraEventsTable.dateFrom));

  if (!parentPlayerId || !parentTeamId) {
    res.json(rows);
    return;
  }

  res.json(rows.filter((event) => {
    if (event.targetMode === "all") return true;
    const teamIds = Array.isArray(event.teamIds) ? event.teamIds.map(Number) : [];
    const playerIds = Array.isArray(event.playerIds) ? event.playerIds.map(Number) : [];
    return teamIds.includes(parentTeamId!) || playerIds.includes(parentPlayerId);
  }));
});

router.get("/parent/callups", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  if (!parentPlayerId) {
    res.json([]);
    return;
  }

  const callUps = await db.select().from(callUpsTable)
    .where(eq(callUpsTable.playerId, parentPlayerId))
    .orderBy(desc(callUpsTable.createdAt));

  const enriched = await Promise.all(callUps.filter((callUp) => isCoachCallupStatus(callUp.status)).map(async (callUp) => {
    const [match] = await db.select().from(matchesTable)
      .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.id, callUp.matchId)));
    if (!match) return null;
    let teamName = null;
    if (match.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, match.teamId)));
      teamName = team?.name ?? null;
    }
    return { ...callUp, match, teamName };
  }));

  res.json(enriched.filter(Boolean));
});

router.patch("/parent/availability/:matchId/:playerId", requireParentSession, async (req, res): Promise<void> => {
  const matchId = parseInt(String(req.params.matchId));
  const playerId = parseInt(String(req.params.playerId));
  const { status } = req.body as { status: string };
  const reason = String(req.body?.reason ?? "").trim();
  const notes = String(req.body?.notes ?? "").trim();
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);

  if (!["available", "unavailable", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  if (!parentPlayerId || parentPlayerId !== playerId) {
    res.status(403).json({ error: "Puoi modificare solo la disponibilita del figlio collegato" }); return;
  }
  if (status === "unavailable" && !PARENT_AVAILABILITY_REASONS.has(reason)) {
    res.status(400).json({ error: "Motivo indisponibilita richiesto" }); return;
  }
  if (status === "unavailable" && reason === "other" && notes.length === 0) {
    res.status(400).json({ error: "Inserisci la motivazione in Altro" }); return;
  }

  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)));
  if (!player) { res.status(403).json({ error: "Player not in your club" }); return; }

  const [match] = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));
  if (!match) { res.status(403).json({ error: "Match not in your club" }); return; }
  if (player.teamId && match.teamId && player.teamId !== match.teamId) {
    res.status(403).json({ error: "Partita non collegata alla squadra del figlio" }); return;
  }
  const deadline = parentAvailabilityDeadline(match.date);
  if (new Date() > deadline) {
    res.status(409).json({ error: "La disponibilita puo essere modificata fino al mercoledi precedente la partita" }); return;
  }

  await ensureParentAvailabilityColumns();
  const availabilityReason = status === "unavailable" ? reason : null;
  const availabilityNotes = status === "unavailable" ? (notes || null) : null;
  const updatedAt = new Date();
  const [existing] = await db.select().from(callUpsTable)
    .where(and(eq(callUpsTable.matchId, matchId), eq(callUpsTable.playerId, playerId)));

  if (existing) {
    const rows = sqlRows(await db.execute(sql`
      UPDATE call_ups
      SET parent_availability_status = ${status},
          parent_availability_reason = ${availabilityReason},
          parent_availability_notes = ${availabilityNotes},
          parent_availability_updated_at = ${updatedAt}
      WHERE match_id = ${matchId} AND player_id = ${playerId}
      RETURNING id, match_id AS "matchId", player_id AS "playerId", status,
        parent_availability_status AS "parentAvailabilityStatus",
        parent_availability_reason AS "parentAvailabilityReason",
        parent_availability_notes AS "parentAvailabilityNotes",
        parent_availability_updated_at AS "parentAvailabilityUpdatedAt",
        created_at AS "createdAt"
    `));
    res.json(rows[0]);
  } else {
    const rows = sqlRows(await db.execute(sql`
      INSERT INTO call_ups (match_id, player_id, status, parent_availability_status, parent_availability_reason, parent_availability_notes, parent_availability_updated_at)
      VALUES (${matchId}, ${playerId}, 'availability', ${status}, ${availabilityReason}, ${availabilityNotes}, ${updatedAt})
      RETURNING id, match_id AS "matchId", player_id AS "playerId", status,
        parent_availability_status AS "parentAvailabilityStatus",
        parent_availability_reason AS "parentAvailabilityReason",
        parent_availability_notes AS "parentAvailabilityNotes",
        parent_availability_updated_at AS "parentAvailabilityUpdatedAt",
        created_at AS "createdAt"
    `));
    res.json(rows[0]);
  }
});

router.get("/parent/payments", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);

  const payments = await db.select().from(playerPaymentsTable)
    .where(and(
      eq(playerPaymentsTable.clubId, clubId),
      ...(parentPlayerId ? [eq(playerPaymentsTable.playerId, parentPlayerId)] : []),
    ))
    .orderBy(desc(playerPaymentsTable.createdAt));

  const enriched = await Promise.all(payments.map(async (p) => {
    const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId })
      .from(playersTable).where(and(eq(playersTable.id, p.playerId), eq(playersTable.clubId, clubId)));
    let teamName = null;
    if (player?.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, clubId)));
      teamName = team?.name ?? null;
    }
    return { ...p, playerName: player ? `${player.firstName} ${player.lastName}` : `#${p.playerId}`, teamName };
  }));

  res.json(enriched);
});

router.get("/parent/kit", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  if (!parentPlayerId) {
    res.json([]);
    return;
  }

  const rows = await db.select().from(equipmentAssignmentsTable)
    .where(and(eq(equipmentAssignmentsTable.clubId, clubId), eq(equipmentAssignmentsTable.playerId, parentPlayerId)));

  const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId })
    .from(playersTable).where(and(eq(playersTable.id, parentPlayerId), eq(playersTable.clubId, clubId)));
  let teamName = null;
  if (player?.teamId) {
    const [team] = await db.select({ name: teamsTable.name }).from(teamsTable)
      .where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, clubId)));
    teamName = team?.name ?? null;
  }

  res.json(rows.map((row) => ({
    ...row,
    playerName: player ? `${player.firstName} ${player.lastName}` : `#${parentPlayerId}`,
    teamName,
  })));
});

router.get("/parent/player-card", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);
  if (!parentPlayerId) {
    res.json(null);
    return;
  }

  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), eq(playersTable.id, parentPlayerId)));
  if (!player) {
    res.json(null);
    return;
  }

  const [team] = player.teamId
    ? await db.select({ name: teamsTable.name, category: teamsTable.category, ageGroup: teamsTable.ageGroup, clubSection: teamsTable.clubSection }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.id, player.teamId)))
    : [null];

  const now = new Date();
  const trainingSessions = player.teamId
    ? (await db
        .select()
        .from(trainingSessionsTable)
        .where(and(eq(trainingSessionsTable.clubId, clubId), eq(trainingSessionsTable.teamId, player.teamId)))
        .orderBy(desc(trainingSessionsTable.scheduledAt)))
        .filter((session) => new Date(session.scheduledAt).getTime() <= now.getTime() && session.status !== "cancelled" && session.sessionKind !== "tipo")
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
  const calledMatchIds = new Set(callups.filter(callup => !["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(String(callup.status ?? "").toLowerCase())).map(callup => callup.matchId));
  const recordedMinutes = matches.filter(match => calledMatchIds.has(match.id))
    .map(match => parentPlayedMinutes(match.matchPlan, player.id)).filter((minutes): minutes is number => minutes !== null);
  const matchAppearances = recordedMinutes.filter(minutes => minutes > 0).length;
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
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    dateOfBirth: player.dateOfBirth,
    nationality: player.nationality,
    position: player.position,
    jerseyNumber: player.jerseyNumber,
    height: player.height,
    weight: player.weight,
    available: player.available,
    status: player.status,
    unavailabilityReason: player.unavailabilityReason,
    registered: player.registered,
    medicalCertificateExpiry: player.medicalCertificateExpiry,
    shuttleService: player.shuttleService,
    team,
    activitySummary: {
      conduct: {
        status: conductCounts.insufficiente > 0 ? "Da monitorare" : Object.values(conductCounts).some(count => count > 0) ? "Regolare" : "Non registrata",
        reason: null,
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
        callups: calledMatchIds.size,
        recorded: recordedMinutes.length,
        unrecorded: calledMatchIds.size - recordedMinutes.length,
        appearances: matchAppearances,
        percentage: recordedMinutes.length > 0 ? Math.round((matchAppearances / recordedMinutes.length) * 100) : null,
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
    },
  });
});

router.get("/parent/documents", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const parentPlayerId = getParentPlayerId(req);

  const docs = await db.select().from(playerDocumentsTable)
    .where(and(
      eq(playerDocumentsTable.clubId, clubId),
      ...(parentPlayerId ? [eq(playerDocumentsTable.playerId, parentPlayerId)] : []),
    ));

  const enriched = await Promise.all(docs.map(async (d) => {
    const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId })
      .from(playersTable).where(and(eq(playersTable.id, d.playerId), eq(playersTable.clubId, clubId)));
    let teamName = null;
    if (player?.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, player.teamId), eq(teamsTable.clubId, clubId)));
      teamName = team?.name ?? null;
    }
    return { ...d, playerName: player ? `${player.firstName} ${player.lastName}` : `#${d.playerId}`, teamName };
  }));

  res.json(enriched);
});

router.get("/parent/communications", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;

  const [clubAnnouncements, globalAnnouncements] = await Promise.all([
    db.select().from(platformAnnouncementsTable).where(eq(platformAnnouncementsTable.targetClubId, clubId)).orderBy(desc(platformAnnouncementsTable.sentAt)).limit(20),
    db.select().from(platformAnnouncementsTable).where(eq(platformAnnouncementsTable.targetClubId, null as any)).orderBy(desc(platformAnnouncementsTable.sentAt)).limit(10),
  ]);

  const combined = [...clubAnnouncements, ...globalAnnouncements].sort((a, b) => new Date(b.sentAt ?? 0).getTime() - new Date(a.sentAt ?? 0).getTime()).slice(0, 30);

  res.json(combined);
});

router.get("/parent/notifications", requireParentSession, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(parentNotificationsTable)
    .where(and(eq(parentNotificationsTable.parentUserId, req.session.userId!), eq(parentNotificationsTable.clubId, req.session.clubId!)))
    .orderBy(desc(parentNotificationsTable.createdAt));
  res.json(rows);
});

router.patch("/parent/notifications/:id/read", requireParentSession, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .update(parentNotificationsTable)
    .set({ isRead: true })
    .where(and(eq(parentNotificationsTable.id, id), eq(parentNotificationsTable.parentUserId, req.session.userId!), eq(parentNotificationsTable.clubId, req.session.clubId!)))
    .returning();
  if (!row) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json(row);
});

router.patch("/parent/notifications/read-all", requireParentSession, async (_req, res): Promise<void> => {
  await db
    .update(parentNotificationsTable)
    .set({ isRead: true })
    .where(and(eq(parentNotificationsTable.parentUserId, _req.session.userId!), eq(parentNotificationsTable.clubId, _req.session.clubId!)));
  res.sendStatus(204);
});

router.get("/parent/team/:teamId", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const teamId = parseInt(String(req.params.teamId));

  const [team] = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  const players = await db.select().from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.clubId, clubId)))
    .orderBy(asc(playersTable.lastName));

  const upcomingTraining = generateParentTrainingCalendar(team, new Date()).slice(0, 5);

  const upcomingMatches = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, teamId), gte(matchesTable.date, new Date())))
    .orderBy(asc(matchesTable.date)).limit(5);

  res.json({ ...team, players, upcomingTraining, upcomingMatches });
});

router.get("/admin/parent-code", requireAdminSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const [club] = await db.select({ accessCode: clubsTable.accessCode, parentCode: clubsTable.parentCode, name: clubsTable.name })
    .from(clubsTable).where(eq(clubsTable.id, clubId));
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  res.json(club);
});

router.post("/admin/parent-code/regenerate", requireAdminSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const newCode = Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [updated] = await db.update(clubsTable).set({ parentCode: newCode }).where(eq(clubsTable.id, clubId)).returning({ parentCode: clubsTable.parentCode });
  res.json(updated);
});

export default router;
