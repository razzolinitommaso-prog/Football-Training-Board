import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, teamStaffAssignmentsTable, teamsTable } from "@workspace/db";
import { calendarExtraEventsTable } from "@workspace/db/schema";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";

const router: IRouter = Router();

const CALENDAR_VIEW_ROLES = ["admin", "presidente", "director", "technical_director", "secretary", "coach", "fitness_coach", "athletic_director"];
const CALENDAR_MANAGE_ROLES = ["admin", "presidente", "director", "technical_director", "secretary"];

function normalizeSection(value: unknown): "scuola_calcio" | "settore_giovanile" | "prima_squadra" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "scuola_calcio" || v === "settore_giovanile" || v === "prima_squadra") return v;
  return null;
}

router.get("/calendar-extra-events", requireAuth, async (req, res): Promise<void> => {
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
      teamIds,
      playerIds,
    })
    .returning();

  res.status(201).json(created);
});

export default router;

