import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, parentNotificationsTable, parentPlayerRelationsTable, playersTable, teamStaffAssignmentsTable, teamsTable, clubNotificationsTable } from "@workspace/db";
import { calendarExtraEventsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";

const router: IRouter = Router();

const CALENDAR_VIEW_ROLES = ["admin", "presidente", "director", "technical_director", "secretary", "coach", "fitness_coach", "athletic_director"];
const CALENDAR_MANAGE_ROLES = ["admin", "presidente", "director", "technical_director", "secretary"];
const VALID_AUDIENCES = ["all", "staff", "parents", "teams"] as const;

let ensuredCalendarExtraEventColumns = false;

async function ensureCalendarExtraEventColumns() {
  if (ensuredCalendarExtraEventColumns) return;
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'all'`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notify_staff INTEGER NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notify_parents INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS notes TEXT`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT`);
  await db.execute(sql`ALTER TABLE calendar_extra_events ADD COLUMN IF NOT EXISTS attachment_data TEXT`);
  ensuredCalendarExtraEventColumns = true;
}

function normalizeSection(value: unknown): "scuola_calcio" | "settore_giovanile" | "prima_squadra" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "scuola_calcio" || v === "settore_giovanile" || v === "prima_squadra") return v;
  return null;
}

router.get("/calendar-extra-events", requireAuth, async (req, res): Promise<void> => {
  await ensureCalendarExtraEventColumns();
  const role = normalizeSessionRole(req.session.role);
  if (!CALENDAR_VIEW_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const section = normalizeSection(req.query.section);
  if (!section) {
    res.status(400).json({ error: "section non valida" });
    return;
  }

  const rows = await db
    .select()
    .from(calendarExtraEventsTable)
    .where(and(eq(calendarExtraEventsTable.clubId, req.session.clubId!), eq(calendarExtraEventsTable.section, section)));

  if (["coach", "fitness_coach", "athletic_director"].includes(role)) {
    const assignments = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(and(eq(teamStaffAssignmentsTable.clubId, req.session.clubId!), eq(teamStaffAssignmentsTable.userId, req.session.userId!)));
    const assignedTeamIds = new Set(assignments.map((a) => a.teamId));
    const filtered = rows.filter((evt) => {
      if (evt.targetAudience === "parents") return false;
      if (evt.targetMode === "all") return true;
      const teamIds = Array.isArray(evt.teamIds) ? evt.teamIds : [];
      return teamIds.some((id: number) => assignedTeamIds.has(Number(id)));
    });
    res.json(filtered);
    return;
  }

  res.json(rows);
});

router.post("/calendar-extra-events", requireAuth, async (req, res): Promise<void> => {
  await ensureCalendarExtraEventColumns();
  const role = normalizeSessionRole(req.session.role);
  if (!CALENDAR_MANAGE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const section = normalizeSection(req.body?.section);
  const category = String(req.body?.category ?? "").trim();
  const title = String(req.body?.title ?? "").trim();
  const dateFrom = String(req.body?.dateFrom ?? "").trim();
  const dateTo = String(req.body?.dateTo ?? "").trim();
  const startTime = String(req.body?.startTime ?? "").trim();
  const endTime = String(req.body?.endTime ?? "").trim();
  const frequency = String(req.body?.frequency ?? "everyday").trim();
  const targetMode = String(req.body?.targetMode ?? "all").trim();
  const targetAudience = String(req.body?.targetAudience ?? "all").trim();
  const notifyStaff = req.body?.notifyStaff !== false;
  const notifyParents = req.body?.notifyParents === true || targetAudience === "all" || targetAudience === "parents";
  const notes = String(req.body?.notes ?? "").trim();
  const attachment = typeof req.body?.attachment === "object" && req.body.attachment !== null ? req.body.attachment : null;
  const attachmentName = String(attachment?.name ?? "").trim();
  const attachmentMimeType = String(attachment?.mimeType ?? "").trim();
  const attachmentData = String(attachment?.data ?? "").trim();
  const weekdaysRaw = Array.isArray(req.body?.weekdays) ? req.body.weekdays : [];
  const teamIdsRaw = Array.isArray(req.body?.teamIds) ? req.body.teamIds : [];
  const playerIdsRaw = Array.isArray(req.body?.playerIds) ? req.body.playerIds : [];

  if (!section || !category || !title || !dateFrom || !dateTo || !startTime || !endTime) {
    res.status(400).json({ error: "Campi obbligatori mancanti" });
    return;
  }
  if (!["everyday", "selected_days"].includes(frequency)) {
    res.status(400).json({ error: "frequency non valida" });
    return;
  }
  if (!["all", "selected"].includes(targetMode)) {
    res.status(400).json({ error: "targetMode non valido" });
    return;
  }
  if (!VALID_AUDIENCES.includes(targetAudience as typeof VALID_AUDIENCES[number])) {
    res.status(400).json({ error: "Destinatari non validi" });
    return;
  }
  const weekdays = weekdaysRaw.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6);
  const teamIds = teamIdsRaw.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0);
  const playerIds = playerIdsRaw.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0);
  if (frequency === "selected_days" && weekdays.length === 0) {
    res.status(400).json({ error: "Seleziona almeno un giorno della settimana" });
    return;
  }
  if (targetMode === "selected" && teamIds.length === 0) {
    res.status(400).json({ error: "Seleziona almeno un'annata" });
    return;
  }
  if (attachmentData && (!attachmentName || !attachmentMimeType)) {
    res.status(400).json({ error: "Allegato non valido" });
    return;
  }
  if (attachmentData && attachmentData.length > 7_000_000) {
    res.status(400).json({ error: "Allegato troppo grande. Usa un file entro 5 MB." });
    return;
  }

  if (teamIds.length > 0) {
    const teams = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(and(eq(teamsTable.clubId, req.session.clubId!), eq(teamsTable.clubSection, section), inArray(teamsTable.id, teamIds)));
    if (teams.length !== teamIds.length) {
      res.status(400).json({ error: "Alcune annate selezionate non sono valide per la sezione" });
      return;
    }
  }

  const [created] = await db
    .insert(calendarExtraEventsTable)
    .values({
      clubId: req.session.clubId!,
      createdByUserId: req.session.userId ?? null,
      section,
      category,
      title,
      dateFrom,
      dateTo,
      startTime,
      endTime,
      frequency,
      weekdays,
      targetMode,
      targetAudience,
      notifyStaff: notifyStaff ? 1 : 0,
      notifyParents: notifyParents ? 1 : 0,
      notes: notes || null,
      attachmentName: attachmentData ? attachmentName : null,
      attachmentMimeType: attachmentData ? attachmentMimeType : null,
      attachmentData: attachmentData || null,
      teamIds,
      playerIds,
    } as any)
    .returning();

  const when = dateFrom === dateTo ? `${dateFrom} ${startTime}-${endTime}` : `${dateFrom} - ${dateTo} ${startTime}-${endTime}`;
  const message = [`${title}`, when, notes, attachmentData ? `Allegato: ${attachmentName}` : ""].filter(Boolean).join("\n");

  if (notifyStaff && targetAudience !== "parents") {
    await db.insert(clubNotificationsTable).values({
      clubId: req.session.clubId!,
      title: `Calendario: ${title}`,
      message,
      type: targetAudience === "staff" ? "staff_calendar" : "calendar",
      createdByUserId: req.session.userId ?? null,
    });
  }

  if (notifyParents) {
    const playerConditions = [eq(playersTable.clubId, req.session.clubId!)];
    if (playerIds.length > 0) {
      playerConditions.push(inArray(playersTable.id, playerIds) as any);
    } else if (teamIds.length > 0) {
      playerConditions.push(inArray(playersTable.teamId, teamIds) as any);
    } else {
      const teams = await db
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(and(eq(teamsTable.clubId, req.session.clubId!), eq(teamsTable.clubSection, section)));
      const sectionTeamIds = teams.map((team) => team.id);
      if (sectionTeamIds.length > 0) playerConditions.push(inArray(playersTable.teamId, sectionTeamIds) as any);
    }

    const parentRows = await db
      .select({ parentUserId: parentPlayerRelationsTable.parentUserId })
      .from(parentPlayerRelationsTable)
      .innerJoin(playersTable, eq(parentPlayerRelationsTable.playerId, playersTable.id))
      .where(and(...playerConditions));

    const uniqueParentIds = Array.from(new Set(parentRows.map((row) => row.parentUserId).filter((id) => Number(id) > 0)));
    if (uniqueParentIds.length > 0) {
      await db.insert(parentNotificationsTable).values(
        uniqueParentIds.map((parentUserId) => ({
          parentUserId,
          clubId: req.session.clubId!,
          type: "calendar",
          title: `Calendario: ${title}`,
          message,
        })),
      );
    }
  }

  res.status(201).json(created);
});

export default router;
