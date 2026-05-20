import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  clubNotificationsTable,
  db,
  teamStaffAssignmentsTable,
  teamsTable,
  trainingCalendarOverridesTable,
  trainingSessionsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";

const router: IRouter = Router();

const MANAGE_ROLES = ["admin", "presidente", "director", "technical_director", "secretary"];
const VIEW_ROLES = [...MANAGE_ROLES, "coach", "fitness_coach", "athletic_director"];
const SESSION_NOTE_MARKER = "[FTB_TRAINING_CALENDAR]";

async function ensureTrainingCalendarOverridesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS training_calendar_overrides (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      original_date DATE NOT NULL,
      original_start_time TEXT NOT NULL,
      original_end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'moved',
      new_date DATE,
      new_start_time TEXT,
      new_end_time TEXT,
      target_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      target_date DATE,
      target_start_time TEXT,
      target_end_time TEXT,
      location TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_training_calendar_overrides_club_team_date
    ON training_calendar_overrides(club_id, team_id, original_date)
  `);
  await db.execute(sql`ALTER TABLE training_calendar_overrides ADD COLUMN IF NOT EXISTS target_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE training_calendar_overrides ADD COLUMN IF NOT EXISTS target_date DATE`);
  await db.execute(sql`ALTER TABLE training_calendar_overrides ADD COLUMN IF NOT EXISTS target_start_time TEXT`);
  await db.execute(sql`ALTER TABLE training_calendar_overrides ADD COLUMN IF NOT EXISTS target_end_time TEXT`);
}

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function normalizeTime(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function localIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

function appendCalendarNote(existing: string | null | undefined, message: string): string {
  const clean = String(existing ?? "").replace(new RegExp(`${SESSION_NOTE_MARKER}[\\s\\S]*$`), "").trim();
  return `${clean}${clean ? "\n" : ""}${SESSION_NOTE_MARKER} ${message}`.trim();
}

async function notifyClub(clubId: number, title: string, message: string) {
  await db.insert(clubNotificationsTable).values({
    clubId,
    title,
    message,
    type: "calendar",
  });
}

async function syncPreparedSession(params: {
  clubId: number;
  teamId: number;
  originalDate: string;
  originalStartTime: string;
  status: "note" | "moved" | "cancelled" | "joined";
  newDate?: string | null;
  newStartTime?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const start = localIso(params.originalDate, params.originalStartTime);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const sessions = await db
    .select()
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.clubId, params.clubId),
        eq(trainingSessionsTable.teamId, params.teamId),
        gte(trainingSessionsTable.scheduledAt, start),
        lte(trainingSessionsTable.scheduledAt, end),
      ),
    );
  if (sessions.length === 0) return;

  for (const session of sessions) {
    if ((params.status === "moved" || params.status === "joined") && params.newDate && params.newStartTime) {
      const label = params.status === "joined" ? "Allenamento congiunto" : "Allenamento spostato";
      await db
        .update(trainingSessionsTable)
        .set({
          scheduledAt: localIso(params.newDate, params.newStartTime),
          location: params.location ?? session.location,
          notes: appendCalendarNote(
            session.notes,
            `${label} dalla segreteria dal ${params.originalDate} ${params.originalStartTime} al ${params.newDate} ${params.newStartTime}.${params.notes ? ` Note: ${params.notes}` : ""}`,
          ),
        })
        .where(eq(trainingSessionsTable.id, session.id));
      continue;
    }
    if (params.status === "note") {
      await db
        .update(trainingSessionsTable)
        .set({
          notes: appendCalendarNote(
            session.notes,
            `Nota segreteria calendario allenamento del ${params.originalDate} ${params.originalStartTime}.${params.notes ? ` Note: ${params.notes}` : ""}`,
          ),
        })
        .where(eq(trainingSessionsTable.id, session.id));
      continue;
    }
    await db
      .update(trainingSessionsTable)
      .set({
        notes: appendCalendarNote(
          session.notes,
          `Allenamento eliminato dal calendario dalla segreteria: sessione da riassegnare.${params.notes ? ` Note: ${params.notes}` : ""}`,
        ),
      })
      .where(eq(trainingSessionsTable.id, session.id));
  }
}

router.get("/training-calendar-overrides", requireAuth, async (req, res): Promise<void> => {
  await ensureTrainingCalendarOverridesTable();
  const role = normalizeSessionRole(req.session.role);
  if (!VIEW_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const from = normalizeDate(req.query.from);
  const to = normalizeDate(req.query.to);
  const section = String(req.query.section ?? "").trim();
  if (!from || !to) {
    res.status(400).json({ error: "Intervallo date non valido" });
    return;
  }

  const clubId = req.session.clubId!;
  const rows = await db
    .select()
    .from(trainingCalendarOverridesTable)
    .where(
      and(
        eq(trainingCalendarOverridesTable.clubId, clubId),
        gte(trainingCalendarOverridesTable.originalDate, from),
        lte(trainingCalendarOverridesTable.originalDate, to),
      ),
    );

  let filtered = rows;
  if (section) {
    const teams = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.clubSection, section)));
    const ids = new Set(teams.map((t) => t.id));
    filtered = filtered.filter((row) => ids.has(row.teamId));
  }

  if (["coach", "fitness_coach", "athletic_director"].includes(role)) {
    const assignments = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(and(eq(teamStaffAssignmentsTable.clubId, clubId), eq(teamStaffAssignmentsTable.userId, req.session.userId!)));
    const ids = new Set(assignments.map((a) => a.teamId));
    filtered = filtered.filter((row) => ids.has(row.teamId));
  }

  res.json(filtered);
});

router.post("/training-calendar-overrides", requireAuth, async (req, res): Promise<void> => {
  await ensureTrainingCalendarOverridesTable();
  const role = normalizeSessionRole(req.session.role);
  if (!MANAGE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const teamId = Number(req.body?.teamId);
  const originalDate = normalizeDate(req.body?.originalDate);
  const originalStartTime = normalizeTime(req.body?.originalStartTime);
  const originalEndTime = normalizeTime(req.body?.originalEndTime);
  const rawStatus = String(req.body?.status ?? "note");
  const status =
    rawStatus === "cancelled"
      ? "cancelled"
      : rawStatus === "moved"
        ? "moved"
        : rawStatus === "joined"
          ? "joined"
          : "note";
  const needsTarget = status === "moved" || status === "joined";
  const newDate = needsTarget ? normalizeDate(req.body?.newDate) : null;
  const newStartTime = needsTarget ? normalizeTime(req.body?.newStartTime) : null;
  const newEndTime = needsTarget ? normalizeTime(req.body?.newEndTime) : null;
  const targetTeamId = status === "joined" ? Number(req.body?.targetTeamId) : null;
  const targetDate = status === "joined" ? normalizeDate(req.body?.targetDate) : null;
  const targetStartTime = status === "joined" ? normalizeTime(req.body?.targetStartTime) : null;
  const targetEndTime = status === "joined" ? normalizeTime(req.body?.targetEndTime) : null;
  const location = String(req.body?.location ?? "").trim() || null;
  const notes = String(req.body?.notes ?? "").trim() || null;

  if (!Number.isInteger(teamId) || teamId <= 0 || !originalDate || !originalStartTime || !originalEndTime) {
    res.status(400).json({ error: "Dati allenamento non validi" });
    return;
  }
  if (needsTarget && (!newDate || !newStartTime || !newEndTime)) {
    res.status(400).json({ error: "Nuova data e orario sono obbligatori" });
    return;
  }
  if (status === "joined" && (!Number.isInteger(targetTeamId) || !targetDate || !targetStartTime || !targetEndTime)) {
    res.status(400).json({ error: "Allenamento da congiungere non valido" });
    return;
  }

  const clubId = req.session.clubId!;
  const [team] = await db
    .select({ id: teamsTable.id, name: teamsTable.name, clubId: teamsTable.clubId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  if (!team || team.clubId !== clubId) {
    res.status(404).json({ error: "Squadra non trovata" });
    return;
  }
  if (status === "joined" && targetTeamId) {
    const [targetTeam] = await db
      .select({ id: teamsTable.id, clubId: teamsTable.clubId })
      .from(teamsTable)
      .where(eq(teamsTable.id, targetTeamId));
    if (!targetTeam || targetTeam.clubId !== clubId) {
      res.status(404).json({ error: "Squadra di destinazione non trovata" });
      return;
    }
  }

  const [existing] = await db
    .select()
    .from(trainingCalendarOverridesTable)
    .where(
      and(
        eq(trainingCalendarOverridesTable.clubId, clubId),
        eq(trainingCalendarOverridesTable.teamId, teamId),
        eq(trainingCalendarOverridesTable.originalDate, originalDate),
        eq(trainingCalendarOverridesTable.originalStartTime, originalStartTime),
      ),
    );

  const values = {
    clubId,
    teamId,
    createdByUserId: req.session.userId ?? null,
    originalDate,
    originalStartTime,
    originalEndTime,
    status,
    newDate,
    newStartTime,
    newEndTime,
    targetTeamId,
    targetDate,
    targetStartTime,
    targetEndTime,
    location,
    notes,
  };

  const [row] = existing
    ? await db
        .update(trainingCalendarOverridesTable)
        .set(values)
        .where(eq(trainingCalendarOverridesTable.id, existing.id))
        .returning()
    : await db.insert(trainingCalendarOverridesTable).values(values).returning();

  await syncPreparedSession({
    clubId,
    teamId,
    originalDate,
    originalStartTime,
    status,
    newDate,
    newStartTime,
    location,
    notes,
  });

  const title =
    status === "moved"
      ? "Allenamento spostato"
      : status === "joined"
        ? "Allenamento congiunto"
        : status === "cancelled"
          ? "Allenamento annullato"
          : "Nota allenamento";
  const message =
    status === "moved"
      ? `${team.name}: allenamento del ${originalDate} ${originalStartTime} spostato al ${newDate} ${newStartTime}.${location ? ` Luogo: ${location}.` : ""}${notes ? ` Note: ${notes}` : ""}`
      : status === "joined"
        ? `${team.name}: allenamento del ${originalDate} ${originalStartTime} congiunto al ${newDate} ${newStartTime}.${location ? ` Luogo: ${location}.` : ""}${notes ? ` Note: ${notes}` : ""}`
        : status === "cancelled"
          ? `${team.name}: allenamento del ${originalDate} ${originalStartTime} annullato.${notes ? ` Note: ${notes}` : ""}`
          : `${team.name}: nota sull'allenamento del ${originalDate} ${originalStartTime}.${notes ? ` Note: ${notes}` : ""}`;
  await notifyClub(clubId, title, message);

  res.status(201).json(row);
});

export default router;
