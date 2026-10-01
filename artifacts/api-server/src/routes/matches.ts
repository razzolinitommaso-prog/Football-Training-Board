import { Router, type IRouter } from "express";
import {
  db,
  matchesTable,
  callUpsTable,
  clubsTable,
  playersTable,
  teamsTable,
  teamStaffAssignmentsTable,
  parentPlayerRelationsTable,
  parentNotificationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql, notInArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const MATCH_CALENDAR_MANAGE_ROLES = [
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
];
const SCHEDULE_ROLES = MATCH_CALENDAR_MANAGE_ROLES;
const MATCH_CREATE_DELETE_ROLES = MATCH_CALENDAR_MANAGE_ROLES;
const POST_NOTES_ROLES = [
  "secretary",
  "sporting_director",
  "coach",
  "fitness_coach",
  "athletic_director",
  "technical_director",
];
const MATCH_PLAN_EDIT_ROLES = ["coach", "fitness_coach", "athletic_director"];
const MATCH_PLAN_VIEW_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const MATCH_PLAN_MARKER = "[FTB_MATCH_PLAN]";
const MATCH_SECTION_VALUES = new Set(["scuola_calcio", "settore_giovanile", "prima_squadra"]);
const DISCIPLINE_CARD_TYPES = new Set(["giallo", "doppio_giallo", "rosso"]);

type CallupPdfMatch = {
  clubName: string;
  teamName?: string | null;
  opponent?: string | null;
  homeAway?: string | null;
  date?: Date | string | null;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
  preMatchNotes?: string | null;
  convocationAt?: string | null;
  convocationPlace?: string | null;
};

type CallupPdfPlayer = {
  firstName?: string | null;
  lastName?: string | null;
  playerName?: string | null;
};

function pdfEscape(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\s+/g, " ")
    .trim();
}

function fileSafe(value: string): string {
  return pdfEscape(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "convocazione";
}

function formatPdfDateTime(value?: Date | string | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function callupPdfPlayerLabel(player: CallupPdfPlayer): string {
  return player.playerName?.trim() || `${player.lastName ?? ""} ${player.firstName ?? ""}`.trim() || "Giocatore";
}

function wrapPdfText(text: string, maxChars: number): string[] {
  const words = pdfEscape(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

type PdfLine = { text: string; size?: number; bold?: boolean; x?: number; y?: number };
type PdfPage = PdfLine[];

function addPdfFlowLine(state: { pages: PdfPage[]; page: PdfPage; y: number }, line: Omit<PdfLine, "x" | "y"> & { gap?: number }) {
  const gap = line.gap ?? 16;
  const nextY = state.y - gap;
  if (state.page.length > 0 && nextY < 58) {
    state.pages.push(state.page);
    state.page = [];
    state.y = 790;
  }
  state.y -= gap;
  state.page.push({ text: line.text, size: line.size, bold: line.bold, x: 50, y: state.y });
}

function buildCallupPdfBuffer(match: CallupPdfMatch, playersInput: CallupPdfPlayer[]): Buffer {
  const players = [...playersInput].sort((a, b) => callupPdfPlayerLabel(a).localeCompare(callupPdfPlayerLabel(b), "it"));
  const state = { pages: [] as PdfPage[], page: [] as PdfPage, y: 790 };
  const homeLabel = match.homeAway === "away" ? match.opponent || "Avversario" : match.clubName;
  const awayLabel = match.homeAway === "away" ? match.clubName : match.opponent || "Avversario";

  addPdfFlowLine(state, { text: "CONVOCAZIONE", size: 20, bold: true, gap: 0 });
  addPdfFlowLine(state, { text: match.clubName, size: 14, bold: true, gap: 24 });
  addPdfFlowLine(state, { text: `Squadra: ${match.teamName || "-"}`, bold: true, gap: 28 });
  addPdfFlowLine(state, { text: `Partita: ${homeLabel} vs ${awayLabel}` });
  addPdfFlowLine(state, { text: `Competizione: ${match.competition || "-"}` });
  addPdfFlowLine(state, { text: `Data e ora gara: ${formatPdfDateTime(match.date) || "-"}` });
  addPdfFlowLine(state, { text: `Luogo gara: ${match.location || "-"}` });
  addPdfFlowLine(state, { text: `Orario convocazione: ${formatPdfDateTime(match.convocationAt) || "-"}` });
  addPdfFlowLine(state, { text: `Luogo convocazione: ${match.convocationPlace || "-"}` });

  const notes = [match.preMatchNotes, match.notes].map((v) => v?.trim()).filter(Boolean).join(" - ");
  if (notes) {
    addPdfFlowLine(state, { text: "Note", bold: true, gap: 26 });
    wrapPdfText(notes, 86).slice(0, 5).forEach((text) => addPdfFlowLine(state, { text, size: 10, gap: 14 }));
  }

  addPdfFlowLine(state, { text: `Convocati (${players.length})`, size: 13, bold: true, gap: 30 });
  if (players.length === 0) {
    addPdfFlowLine(state, { text: "Nessun convocato", size: 10, gap: 18 });
  } else {
    players.forEach((player, index) => {
      wrapPdfText(`${index + 1}. ${callupPdfPlayerLabel(player)}`, 88).forEach((text, lineIndex) => {
        addPdfFlowLine(state, { text, size: 10, gap: lineIndex === 0 ? 18 : 12 });
      });
    });
  }

  state.page.push({ text: "Documento generato da Football Training Board", size: 9, x: 50, y: 34 });
  state.pages.push(state.page);

  const buildContentStream = (lines: PdfLine[]) => {
    const out = ["BT"];
    for (const line of lines) {
      out.push(`/${line.bold ? "F2" : "F1"} ${line.size ?? 11} Tf`);
      out.push(`1 0 0 1 ${line.x ?? 50} ${line.y ?? 790} Tm (${pdfEscape(line.text)}) Tj`);
    }
    out.push("ET");
    return out.join("\n");
  };

  const pageObjectNumbers = state.pages.map((_, index) => 3 + index);
  const font1Object = 3 + state.pages.length;
  const font2Object = 4 + state.pages.length;
  const contentStartObject = 5 + state.pages.length;
  const pageObjects = state.pages.map((page, index) => {
    const contentObject = contentStartObject + index;
    return `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font1Object} 0 R /F2 ${font2Object} 0 R >> >> /Contents ${contentObject} 0 R >>`;
  });
  const contentObjects = state.pages.map((page) => {
    const content = buildContentStream(page);
    return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${state.pages.length} >>`,
    ...pageObjects,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ...contentObjects,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function normalizeMatchSection(value: unknown): string | undefined {
  const section = String(value ?? "").trim();
  return MATCH_SECTION_VALUES.has(section) ? section : undefined;
}

function parseRouteIdParam(value: string | string[] | undefined): number {
  if (Array.isArray(value)) return Number.parseInt(value[0] ?? "", 10);
  return Number.parseInt(value ?? "", 10);
}

function splitPublicNotesAndPlan(raw?: string | null): { publicNotes: string | null; plan: unknown | null } {
  const text = (raw ?? "").trim();
  if (!text) return { publicNotes: null, plan: null };
  const idx = text.lastIndexOf(MATCH_PLAN_MARKER);
  if (idx < 0) return { publicNotes: text, plan: null };
  const before = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + MATCH_PLAN_MARKER.length).trim();
  let parsed: unknown = null;
  try {
    parsed = jsonPart ? JSON.parse(jsonPart) : null;
  } catch {
    parsed = null;
  }
  return { publicNotes: before || null, plan: parsed };
}

function composeNotesWithPlan(publicNotes: string | null, plan: unknown | null): string | null {
  const cleanNotes = (publicNotes ?? "").trim();
  if (plan == null) return cleanNotes || null;
  const encoded = `${MATCH_PLAN_MARKER}${JSON.stringify(plan)}`;
  return cleanNotes ? `${cleanNotes}\n\n${encoded}` : encoded;
}

function normalizeMatchPlan(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function uniqueNumericIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0),
  )];
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

async function suspendedPlayerIdsForMatch(clubId: number, match: typeof matchesTable.$inferSelect, playerIds: number[]): Promise<Set<number>> {
  const cleanPlayerIds = [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!match.teamId || cleanPlayerIds.length === 0) return new Set();

  const targetCompetition = normalizeCompetition(match.competition);
  const rows = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.clubId, clubId), eq(matchesTable.teamId, match.teamId)))
    .orderBy(sql`${matchesTable.date} asc`, sql`${matchesTable.id} asc`);

  const yellowCounts = new Map<number, number>();
  const suspensionQueues = new Map<number, number>();
  const targetTime = new Date(match.date).getTime();

  for (const row of rows) {
    const rowTime = new Date(row.date).getTime();
    if (row.id === match.id || rowTime >= targetTime) break;
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

type CallupConflict = {
  playerId: number;
  requestedMatchId: number;
  requestedByTeamName: string | null;
};

function rowsFromDbExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []) as T[];
}

async function sameDayCallupConflicts(clubId: number, match: typeof matchesTable.$inferSelect, playerIds: number[]) {
  const cleanPlayerIds = [...new Set(playerIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (cleanPlayerIds.length === 0) return [];

  const result = await db.execute(sql`
    SELECT
      cu.player_id AS "playerId",
      m.id AS "requestedMatchId",
      t.name AS "requestedByTeamName"
    FROM call_ups cu
    INNER JOIN matches m ON m.id = cu.match_id
    LEFT JOIN teams t ON t.id = m.team_id
    WHERE m.club_id = ${clubId}
      AND cu.player_id IN ${sql.raw(`(${cleanPlayerIds.join(",")})`)}
      AND m.id <> ${match.id}
      AND COALESCE(m.team_id, 0) <> COALESCE(${match.teamId ?? 0}, 0)
      AND (cu.status IS NULL OR lower(cu.status) NOT IN ('declined', 'unavailable', 'absent', 'not_called'))
      AND (m.date AT TIME ZONE 'Europe/Rome')::date = (${match.date}::timestamptz AT TIME ZONE 'Europe/Rome')::date
    ORDER BY m.date ASC, m.id ASC
  `);

  return rowsFromDbExecute<CallupConflict>(result);
}

async function userCanManageAssignedTeamMatch(userId: number, clubId: number, role: string, teamId: number | null): Promise<boolean> {
  if (!teamId) return false;
  if (!MATCH_PLAN_EDIT_ROLES.includes(role)) return false;
  const [assignment] = await db
    .select({ id: teamStaffAssignmentsTable.id })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
      eq(teamStaffAssignmentsTable.teamId, teamId),
    ))
    .limit(1);
  return !!assignment;
}

async function userCanViewMatchPlan(userId: number, clubId: number, role: string, teamId: number | null): Promise<boolean> {
  if (["admin", "presidente", "director", "secretary", "sporting_director"].includes(role)) return true;
  if (role === "technical_director") return true;
  if (!MATCH_PLAN_VIEW_ROLES.includes(role)) return false;
  return userCanManageAssignedTeamMatch(userId, clubId, role, teamId);
}

async function enrichMatch(match: typeof matchesTable.$inferSelect) {
  let teamName: string | null = null;
  if (match.teamId) {
    const [team] = await db.select().from(teamsTable).where(and(eq(teamsTable.id, match.teamId), eq(teamsTable.clubId, match.clubId)));
    if (team) teamName = team.name;
  }
  const split = splitPublicNotesAndPlan(match.notes ?? null);
  const matchPlan = normalizeMatchPlan(match.matchPlan) ?? normalizeMatchPlan(split.plan);
  return {
    ...match,
    teamName,
    competition: match.competition ?? null,
    location: match.location ?? null,
    result: match.result ?? null,
    notes: split.publicNotes,
    matchPlan,
    preMatchNotes: match.preMatchNotes ?? null,
    postMatchNotes: match.postMatchNotes ?? null,
  };
}

router.get("/matches", requireAuth, async (req, res): Promise<void> => {
  const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : null;
  const conditions: ReturnType<typeof eq>[] = [eq(matchesTable.clubId, req.session.clubId!) as any];
  if (teamId && !isNaN(teamId)) conditions.push(eq(matchesTable.teamId, teamId) as any);
  const sectionFilter = normalizeMatchSection(req.query.section) ?? (!teamId ? normalizeMatchSection(req.session.section) : undefined);
  if (sectionFilter) {
    const sectionTeams = await db.select({ id: teamsTable.id }).from(teamsTable)
      .where(and(eq(teamsTable.clubId, req.session.clubId!), eq(teamsTable.clubSection, sectionFilter)));
    const ids = sectionTeams.map(t => t.id);
    conditions.push((ids.length > 0 ? inArray(matchesTable.teamId, ids) : sql`false`) as any);
  }
  const matches = await db.select().from(matchesTable).where(and(...conditions)).orderBy(desc(matchesTable.date));
  const enriched = await Promise.all(matches.map(enrichMatch));
  res.json(enriched);
});

router.post("/matches", requireAuth, async (req, res): Promise<void> => {
  if (!MATCH_CREATE_DELETE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a creare partite" });
    return;
  }
  const { opponent, date, teamId, seasonId, competition, location, homeAway, notes } = req.body;
  if (!opponent || !date) { res.status(400).json({ error: "opponent and date required" }); return; }
  if (teamId) {
    const nextTeamId = Number(teamId);
    if (!Number.isFinite(nextTeamId)) { res.status(400).json({ error: "Squadra non valida per questa societa" }); return; }
    const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).where(and(eq(teamsTable.id, nextTeamId), eq(teamsTable.clubId, req.session.clubId!)));
    if (!team) { res.status(400).json({ error: "Squadra non valida per questa societa" }); return; }
  }
  const [match] = await db.insert(matchesTable).values({
    clubId: req.session.clubId!, opponent, date: new Date(date),
    teamId: teamId ?? null, seasonId: seasonId ?? null, competition: competition ?? null,
    location: location ?? null, homeAway: homeAway ?? "home", notes: notes ?? null,
  }).returning();
  const enriched = await enrichMatch(match);
  res.status(201).json(enriched);
});

router.patch("/matches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;
  const { opponent, date, teamId, competition, location, homeAway, result, notes, preMatchNotes, postMatchNotes, matchPlan } = req.body;
  const updates: Record<string, unknown> = {};

  const [existing] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId)));
  if (!existing) { res.status(404).json({ error: "Match not found" }); return; }

  const scheduleFields = [date, req.body.isPostponed, req.body.rescheduleDate, req.body.rescheduleTbd, preMatchNotes];
  const postNotesFields = [postMatchNotes, result];
  const matchPlanFields = [matchPlan];
  const wantsScheduleEdit = scheduleFields.some(f => f !== undefined);
  const wantsPostNotesEdit = postNotesFields.some(f => f !== undefined);
  const wantsMatchPlanEdit = matchPlanFields.some(f => f !== undefined);

  if (wantsScheduleEdit && !SCHEDULE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare data, orario o note pre-partita" }); return;
  }
  if (wantsPostNotesEdit && !POST_NOTES_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare le note post-partita" }); return;
  }
  if (wantsMatchPlanEdit) {
    const canManage = await userCanManageAssignedTeamMatch(userId, clubId, role, existing.teamId ?? null);
    if (!canManage) {
      res.status(403).json({ error: "Non autorizzato a modificare convocazioni/schieramenti di questa squadra" }); return;
    }
  }

  if (opponent !== undefined && SCHEDULE_ROLES.includes(role)) updates.opponent = opponent;
  if (date !== undefined) updates.date = new Date(date);
  if (teamId !== undefined) {
    if (!SCHEDULE_ROLES.includes(role)) {
      res.status(403).json({ error: "Non autorizzato a modificare la squadra della partita" }); return;
    }
    if (teamId !== null) {
      const nextTeamId = Number(teamId);
      if (!Number.isFinite(nextTeamId)) { res.status(400).json({ error: "Squadra non valida per questa societa" }); return; }
      const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).where(and(eq(teamsTable.id, nextTeamId), eq(teamsTable.clubId, clubId)));
      if (!team) { res.status(400).json({ error: "Squadra non valida per questa societa" }); return; }
    }
    updates.teamId = teamId;
  }
  if (competition !== undefined && SCHEDULE_ROLES.includes(role)) updates.competition = competition;
  if (location !== undefined && SCHEDULE_ROLES.includes(role)) updates.location = location;
  if (homeAway !== undefined && SCHEDULE_ROLES.includes(role)) updates.homeAway = homeAway;
  if (result !== undefined) updates.result = result;
  if (notes !== undefined) {
    const parsed = splitPublicNotesAndPlan(existing.notes ?? null);
    updates.notes = composeNotesWithPlan(typeof notes === "string" ? notes : null, parsed.plan);
  }
  if (preMatchNotes !== undefined) updates.preMatchNotes = preMatchNotes;
  if (postMatchNotes !== undefined) updates.postMatchNotes = postMatchNotes;
  if (matchPlan !== undefined) {
    const parsed = splitPublicNotesAndPlan(existing.notes ?? null);
    updates.notes = parsed.publicNotes;
    updates.matchPlan = normalizeMatchPlan(matchPlan);
  }
  if (req.body.isPostponed !== undefined) updates.isPostponed = req.body.isPostponed;
  if (req.body.rescheduleDate !== undefined) updates.rescheduleDate = req.body.rescheduleDate ? new Date(req.body.rescheduleDate) : null;
  if (req.body.rescheduleTbd !== undefined) updates.rescheduleTbd = req.body.rescheduleTbd;

  if (Object.keys(updates).length === 0) {
    const enrichedCurrent = await enrichMatch(existing);
    res.json(enrichedCurrent);
    return;
  }

  const [match] = await db.update(matchesTable).set(updates)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const enriched = await enrichMatch(match);
  res.json(enriched);
});

router.delete("/matches/:id", requireAuth, async (req, res): Promise<void> => {
  if (!MATCH_CREATE_DELETE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a eliminare partite" });
    return;
  }
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.delete(matchesTable)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, req.session.clubId!))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  res.sendStatus(204);
});

router.get("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canView = await userCanViewMatchPlan(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canView) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const enriched = await Promise.all(callups.map(async (cu) => {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, cu.playerId), eq(playersTable.clubId, req.session.clubId!)));
    return { ...cu, playerName: player ? `${player.firstName} ${player.lastName}` : null };
  }));
  res.json(enriched);
});

router.get("/matches/:id/callups/pdf", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const clubId = req.session.clubId!;
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canView = await userCanViewMatchPlan(req.session.userId!, clubId, req.session.role ?? "", match.teamId ?? null);
  if (!canView) { res.status(403).json({ error: "Non autorizzato" }); return; }

  const [club] = await db.select({ name: clubsTable.name }).from(clubsTable).where(eq(clubsTable.id, clubId));
  const [team] = match.teamId
    ? await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, match.teamId), eq(teamsTable.clubId, clubId)))
    : [null];
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const playerIds = [...new Set(callups.map((callup) => callup.playerId).filter((id): id is number => Number(id) > 0))];
  const players = playerIds.length > 0
    ? await db
      .select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName })
      .from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, playerIds)))
    : [];
  const playerById = new Map(players.map((player) => [player.id, player]));
  const parsedNotes = splitPublicNotesAndPlan(match.notes);
  const matchPlan = normalizeMatchPlan(match.matchPlan) ?? normalizeMatchPlan(parsedNotes.plan);
  const buffer = buildCallupPdfBuffer(
    {
      clubName: club?.name ?? "Societa",
      teamName: team?.name ?? null,
      opponent: match.opponent,
      homeAway: match.homeAway,
      date: match.date,
      competition: match.competition,
      location: match.location,
      notes: parsedNotes.publicNotes,
      preMatchNotes: match.preMatchNotes,
      convocationAt: typeof matchPlan?.convocationAt === "string" ? matchPlan.convocationAt : null,
      convocationPlace: typeof matchPlan?.convocationPlace === "string" ? matchPlan.convocationPlace : null,
    },
    callups.map((callup) => {
      const player = playerById.get(callup.playerId);
      return player
        ? { firstName: player.firstName, lastName: player.lastName }
        : { playerName: `Giocatore ${callup.playerId}` };
    }),
  );
  const datePart = match.date instanceof Date && !Number.isNaN(match.date.getTime())
    ? match.date.toISOString().slice(0, 10)
    : "data";
  const filename = `${fileSafe(team?.name ?? "squadra")}-${datePart}-convocazione.pdf`;
  const disposition = String(req.query.disposition ?? "inline") === "attachment" ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
});

router.post("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { playerId, status } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(and(eq(playersTable.id, Number(playerId)), eq(playersTable.clubId, req.session.clubId!)));
  if (!player) { res.status(400).json({ error: "Giocatore non valido per questa societa" }); return; }
  const suspendedPlayers = await suspendedPlayerIdsForMatch(req.session.clubId!, match, [Number(playerId)]);
  if (suspendedPlayers.has(Number(playerId))) {
    res.status(409).json({ error: "Giocatore squalificato per questa partita" });
    return;
  }
  const conflicts = await sameDayCallupConflicts(req.session.clubId!, match, [Number(playerId)]);
  if (conflicts.length > 0) {
    const conflict = conflicts[0];
    res.status(409).json({ error: `Giocatore gia richiesto da ${conflict.requestedByTeamName ?? "un'altra squadra"} nello stesso giorno` });
    return;
  }
  const [existing] = await db.select({ id: callUpsTable.id }).from(callUpsTable).where(and(eq(callUpsTable.matchId, matchId), eq(callUpsTable.playerId, Number(playerId))));
  if (existing) {
    res.status(200).json({ id: existing.id, matchId, playerId: Number(playerId), status: status ?? "pending" });
    return;
  }
  const [cu] = await db.insert(callUpsTable).values({ matchId, playerId: Number(playerId), status: status ?? "pending" }).returning();
  res.status(201).json(cu);
});

router.patch("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status } = req.body;
  const [existing] = await db.select().from(callUpsTable).where(eq(callUpsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Call-up not found" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, existing.matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [cu] = await db.update(callUpsTable).set({ status }).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.json(cu);
});

router.delete("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(callUpsTable).where(eq(callUpsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Call-up not found" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, existing.matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [cu] = await db.delete(callUpsTable).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.sendStatus(204);
});

router.put("/matches/:id/plan", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;
  const desiredPlayerIds = uniqueNumericIds(req.body?.playerIds);
  const matchPlan = normalizeMatchPlan(req.body?.matchPlan);

  if (!matchPlan) {
    res.status(400).json({ error: "matchPlan obbligatorio" });
    return;
  }

  const [existingMatch] = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));
  if (!existingMatch) { res.status(404).json({ error: "Match not found" }); return; }

  const canManage = await userCanManageAssignedTeamMatch(userId, clubId, role, existingMatch.teamId ?? null);
  if (!canManage) {
    res.status(403).json({ error: "Non autorizzato a modificare convocazioni/schieramenti di questa squadra" });
    return;
  }

  if (desiredPlayerIds.length > 0) {
    const validPlayers = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, desiredPlayerIds)));
    if (validPlayers.length !== desiredPlayerIds.length) {
      res.status(400).json({ error: "Uno o piu giocatori non appartengono a questa societa" });
      return;
    }
    const conflicts = await sameDayCallupConflicts(clubId, existingMatch, desiredPlayerIds);
    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      res.status(409).json({ error: `Uno o piu giocatori sono gia richiesti da ${conflict.requestedByTeamName ?? "un'altra squadra"} nello stesso giorno` });
      return;
    }
    const suspendedPlayers = await suspendedPlayerIdsForMatch(clubId, existingMatch, desiredPlayerIds);
    if (suspendedPlayers.size > 0) {
      res.status(409).json({ error: "Uno o piu giocatori sono squalificati per questa partita" });
      return;
    }
  }

  await db.transaction(async (tx) => {
    const parsed = splitPublicNotesAndPlan(existingMatch.notes ?? null);
    await tx
      .update(matchesTable)
      .set({
        notes: parsed.publicNotes,
        matchPlan,
      })
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));

    if (desiredPlayerIds.length === 0) {
      await tx.delete(callUpsTable).where(eq(callUpsTable.matchId, matchId));
      return;
    }

    await tx
      .delete(callUpsTable)
      .where(and(eq(callUpsTable.matchId, matchId), notInArray(callUpsTable.playerId, desiredPlayerIds)));

    const existingCallups = await tx
      .select({ playerId: callUpsTable.playerId })
      .from(callUpsTable)
      .where(eq(callUpsTable.matchId, matchId));
    const existingPlayerIds = new Set(existingCallups.map((callup) => callup.playerId));
    const toInsert = desiredPlayerIds
      .filter((playerId) => !existingPlayerIds.has(playerId))
      .map((playerId) => ({ matchId, playerId, status: "called" }));

    if (toInsert.length > 0) {
      await tx.insert(callUpsTable).values(toInsert);
    }
  });

  const [updatedMatch] = await db
    .select()
    .from(matchesTable)
    .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)));
  if (!updatedMatch) { res.status(404).json({ error: "Match not found" }); return; }
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  res.json({
    match: await enrichMatch(updatedMatch),
    callups,
  });
});

router.post("/matches/:id/callups/publish", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a pubblicare convocazioni" }); return; }

  const convocationAtRaw = typeof req.body?.convocationAt === "string" ? req.body.convocationAt : "";
  const convocationPlace = typeof req.body?.convocationPlace === "string" ? req.body.convocationPlace.trim() : "";
  if (!convocationAtRaw || !convocationPlace) {
    res.status(400).json({ error: "Orario e luogo convocazione obbligatori" }); return;
  }
  const convocationDate = new Date(convocationAtRaw);
  if (Number.isNaN(convocationDate.getTime())) {
    res.status(400).json({ error: "Orario convocazione non valido" }); return;
  }

  const [team] = match.teamId ? await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, match.teamId), eq(teamsTable.clubId, req.session.clubId!))) : [null];
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const playerIds = [...new Set(callups.map((c) => c.playerId))];
  if (playerIds.length === 0) { res.status(400).json({ error: "Nessun convocato selezionato" }); return; }
  const relations = await db
    .select({ parentUserId: parentPlayerRelationsTable.parentUserId, playerId: parentPlayerRelationsTable.playerId })
    .from(parentPlayerRelationsTable)
    .where(inArray(parentPlayerRelationsTable.playerId, playerIds));

  const players = await db
    .select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName })
    .from(playersTable)
    .where(and(eq(playersTable.clubId, req.session.clubId!), inArray(playersTable.id, playerIds)));
  const playerNameMap = new Map(players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));

  const title = `Convocazione partita ${team?.name ?? ""}`.trim();
  let notifications = 0;
  for (const rel of relations) {
    const childName = playerNameMap.get(rel.playerId) ?? "tuo figlio/a";
    const message =
      `Convocazione ${childName}: ${convocationDate.toLocaleString("it-IT")} presso ${convocationPlace}. ` +
      `Partita vs ${match.opponent}${team?.name ? ` (${team.name})` : ""}.`;
    await db.insert(parentNotificationsTable).values({
      parentUserId: rel.parentUserId,
      clubId: req.session.clubId!,
      type: "match_callup",
      title,
      message,
      isRead: false,
    });
    notifications++;
  }

  const clipboardText = [
    `CONVOCAZIONE PARTITA - ${team?.name ?? "Squadra"}`,
    `Avversario: ${match.opponent}`,
    `Data partita: ${new Date(match.date).toLocaleString("it-IT")}`,
    `Convocazione: ${convocationDate.toLocaleString("it-IT")}`,
    `Luogo convocazione: ${convocationPlace}`,
    "",
    "Convocati:",
    ...playerIds.map((id, i) => `${i + 1}. ${playerNameMap.get(id) ?? `Giocatore #${id}`}`),
  ].join("\n");

  res.json({ notifications, clipboardText, parentsImpacted: new Set(relations.map((r) => r.parentUserId)).size });
});

export default router;
