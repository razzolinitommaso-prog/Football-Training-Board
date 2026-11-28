import { isArchivedPlayer, matchReportScore, matchReportScoreError } from "@workspace/api-zod";
import { createHash } from "node:crypto";
import { syncMatchTournamentReply } from "../lib/parent-tournament-availability";
import { activeMatchEligibility, callupRuleFailure, matchKickoff } from "../lib/callup-rules";
import { ensureCallupRulesStorage, notifyChild } from "../lib/callup-rule-storage";
import { trainingLocalDate, trainingOnlyAvailabilityOverride, WITHDRAWN_PLAYER_STATUS } from "@workspace/api-zod";
import { isDeepStrictEqual } from "node:util";
import { Router, type IRouter } from "express";
import {
  db,
  matchesTable,
  callUpsTable,
  clubsTable,
  clubMembershipsTable,
  playersTable,
  teamsTable,
  teamStaffAssignmentsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, sql, notInArray } from "drizzle-orm";
import { normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { composeNotesWithPlan, publicMatchNotesInput, splitPublicNotesAndPlan } from "../lib/match-plan-notes";
import { requireAuth } from "../lib/auth";
import { sendParentNotificationEmail } from "../lib/parent-email";
import { analyseMatchReport, defaultRotationCapacity, matchReportPlayerIds, matchReportSchema, rotationSummaryCapacity } from "@workspace/api-zod";

const router: IRouter = Router();

async function trainingOnlyCallupFailure(match: typeof matchesTable.$inferSelect, ids: number[]) {
  const kickoff = matchKickoff(match);
  if (!kickoff || !ids.length) return null;
  const players = await db.select().from(playersTable).where(and(eq(playersTable.clubId, match.clubId), inArray(playersTable.id, ids)));
  const blocked = players.find(player => trainingOnlyAvailabilityOverride(player, trainingLocalDate(kickoff)));
  return blocked ? `${blocked.lastName} ${blocked.firstName}: disponibilità forzata solo per allenamenti. Non convocabile per questa partita.` : null;
}

// Parent replies and historical duplicate rows must not inflate a saved callup.
function uniqueCoachCallups<T extends { playerId: number; status?: string | null }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter(row => {
    if (["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(String(row.status ?? "").toLowerCase()) || seen.has(row.playerId)) return false;
    seen.add(row.playerId);
    return true;
  });
}


let ensuredParentAvailabilityColumns = false;

async function ensureParentAvailabilityColumns() {
  if (ensuredParentAvailabilityColumns) return;
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_status TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_reason TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_notes TEXT`);
  await db.execute(sql`ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_updated_at TIMESTAMPTZ`);
  ensuredParentAvailabilityColumns = true;
}

async function parentUnavailableForMatch(matchId: number, playerIds: number[]): Promise<boolean> {
  if (!playerIds.length) return false;
  await ensureParentAvailabilityColumns();
  const replies = sqlRows<{ playerId: number; availability: string | null }>(await db.execute(sql`
    SELECT DISTINCT ON (player_id) player_id AS "playerId",
      coalesce(parent_availability_status, CASE WHEN lower(status) IN ('available', 'unavailable') THEN lower(status) END) AS availability
    FROM call_ups
    WHERE match_id = ${matchId}
      AND player_id IN (${sql.join(playerIds.map(id => sql`${id}`), sql`, `)})
      AND (parent_availability_status IS NOT NULL OR lower(status) IN ('available', 'unavailable'))
    ORDER BY player_id, parent_availability_updated_at DESC NULLS LAST, id DESC
  `));
  return replies.some(reply => reply.availability === "unavailable");
}

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

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
  "sporting_director",
  "coach",
  "fitness_coach",
  "athletic_director",
  "technical_director",
];
const MATCH_PLAN_EDIT_ROLES = ["coach"];
const MATCH_PLAN_VIEW_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const MATCH_SECTION_VALUES = new Set(["scuola_calcio", "settore_giovanile", "prima_squadra"]);
const DISCIPLINE_CARD_TYPES = new Set(["giallo", "doppio_giallo", "rosso"]);
const APP_TIME_ZONE = "Europe/Rome";

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
    timeZone: APP_TIME_ZONE,
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

function normalizeMatchPlan(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function preserveMatchReport(next: Record<string, unknown> | null, previous: unknown, confirmation?: unknown, savingLineups = false) {
  const old = normalizeMatchPlan(previous);
  // A lineup save may carry a cached report. Only the report editor can replace it
  // unless the number of periods changed (for example, adding a fourth period).
  const currentReport = savingLineups ? matchReportSchema.safeParse(old?.postMatchReport) : null;
  const keepRecordedReport = currentReport?.success && Array.isArray(next?.periods) &&
    next.periods.length === currentReport.data.periods.length;
  if (next && (next.postMatchReport === undefined || keepRecordedReport) && old?.postMatchReport !== undefined) {
    next.postMatchReport = old.postMatchReport;
  }
  if (next) {
    delete next.postMatchConfirmation;
    const before = matchReportSchema.safeParse(old?.postMatchReport);
    const after = matchReportSchema.safeParse(next.postMatchReport);
    if (confirmation && before.success && after.success &&
        isDeepStrictEqual(before.data, after.data)) {
      next.postMatchConfirmation = confirmation;
    }
  }
  if (next && next.matchGoalkeeperId === undefined && old?.matchGoalkeeperId !== undefined) {
    next.matchGoalkeeperId = old.matchGoalkeeperId;
  }
  if(next&&next.fourthPeriodDraft===undefined&&old?.fourthPeriodDraft!==undefined)next.fourthPeriodDraft=old.fourthPeriodDraft;
  // Older clients do not know about alternatives: omission must not erase them.
  if (next && Array.isArray(next.periods) && Array.isArray(old?.periods)) {
    const previousPeriods = new Map(old.periods.filter((period): period is Record<string, unknown> => Boolean(period) && typeof period === "object").map(period => [period.key, period]));
    for (const period of next.periods) {
      if (!period || typeof period !== "object" || Array.isArray(period)) continue;
      const previousPeriod = previousPeriods.get(period.key);
      for(const field of ["secondPart","thirdPartMinutes","firstPartMinutes","splitAtHalf","fractionCount","additionalParts"]){if(!Object.prototype.hasOwnProperty.call(period,field)&&previousPeriod?.[field]!==undefined)period[field]=previousPeriod[field];}
      const preserveLineupChoices = (current: Record<string, unknown>, previous: Record<string, unknown> | null | undefined) => {
        if (!previous || JSON.stringify(current.lineupPlayerIds) !== JSON.stringify(previous.lineupPlayerIds)) return;
        for (const field of ["lineupGoalkeeperId", "lineupManual"]) {
          if (current[field] === undefined && previous[field] !== undefined) current[field] = previous[field];
        }
      };
      preserveLineupChoices(period, previousPeriod);
      const second = normalizeMatchPlan(period.secondPart);
      if (second) preserveLineupChoices(second, normalizeMatchPlan(previousPeriod?.secondPart));
      const oldParts = Array.isArray(previousPeriod?.additionalParts) ? previousPeriod.additionalParts : [];
      if (Array.isArray(period.additionalParts)) {
        period.additionalParts.forEach((part: unknown, index: number) => {
          const current = normalizeMatchPlan(part);
          if (current) preserveLineupChoices(current, normalizeMatchPlan(oldParts[index]));
        });
      }
      // Keep an explicit bench boundary when an older client resaves the same lineup.
      if (period.lineupStarterCount === undefined && typeof previousPeriod?.lineupStarterCount === "number"
        && JSON.stringify(period.lineupPlayerIds) === JSON.stringify(previousPeriod.lineupPlayerIds)) {
        period.lineupStarterCount = previousPeriod.lineupStarterCount;
      }
      if (!Object.prototype.hasOwnProperty.call(period, "lineupAlternatives") && Array.isArray(previousPeriod?.lineupAlternatives)) {
        period.lineupAlternatives = previousPeriod.lineupAlternatives;
      }
    }
  }
  if(next&&old?.lineupSolutions&&next.lineupSolutions===undefined){
    next.lineupSolutions=JSON.parse(JSON.stringify(old.lineupSolutions));
    next.activeSolutionId=next.activeSolutionId??old.activeSolutionId;
    if(Array.isArray(next.periods)&&Array.isArray(old.periods)&&next.periods.length!==old.periods.length)
      next.activeSolutionId=next.periods.length===4?"four":"three";
  }
  // The selected root is also updated by existing board/report clients.
  if(next&&next.lineupSolutions&&typeof next.lineupSolutions==="object"&&!Array.isArray(next.lineupSolutions)&&typeof next.activeSolutionId==="string"){
    (next.lineupSolutions as Record<string,unknown>)[next.activeSolutionId]={periods:next.periods,fourthTime:!!next.fourthTime,fourthPeriodDraft:next.fourthPeriodDraft,matchGoalkeeperId:next.matchGoalkeeperId??null};
  }
  return next;
}

function validateMatchSolutions(plan:Record<string,unknown>|null):string|null{
  if(plan?.lineupSolutions===undefined&&plan?.activeSolutionId===undefined)return null;
  const error="Soluzioni della partita non valide: controlla la soluzione scelta e i suoi tempi.";
  const slots=normalizeMatchPlan(plan?.lineupSolutions),ids=["three","four","three-alt","four-alt"];
  if(!slots||typeof plan?.activeSolutionId!=="string"||!ids.includes(plan.activeSolutionId)||!slots[plan.activeSolutionId])return error;
  if(Object.keys(slots).some(id=>!ids.includes(id)))return error;
  for(const [id,value] of Object.entries(slots)){
    const snapshot=normalizeMatchPlan(value),four=id==="four"||id==="four-alt";
    if(!snapshot||!Array.isArray(snapshot.periods)||snapshot.periods.length!==(four?4:3)||!!snapshot.fourthTime!==four)return error;
    const keys=snapshot.periods.map(p=>normalizeMatchPlan(p)?.key);
    if(new Set(keys).size!==keys.length||!["t1","t2","t3",...(four?["t4"]:[])].every(key=>keys.includes(key)))return error;
    if(Object.keys(snapshot).some(key=>!["periods","fourthTime","fourthPeriodDraft","matchGoalkeeperId"].includes(key)))return error;
  }
  const active=slots[plan.activeSolutionId] as Record<string,unknown>;
  if(JSON.stringify(active.periods)!==JSON.stringify(plan.periods))return error;
  return null;
}

function validateMatchReport(plan: Record<string, unknown> | null, called: number[]): string | null {
  const solutionError=validateMatchSolutions(plan);
  if(solutionError)return solutionError;
  if (plan?.postMatchReport === undefined) return null;
  const parsed = matchReportSchema.safeParse(plan.postMatchReport);
  if (!parsed.success) return "Resoconto post-partita non valido: controlla giocatori, tempi e minuti.";
  const periods = Array.isArray(plan.periods) ? plan.periods : [];
  if (parsed.data.periods.length !== periods.length) return "I tempi del resoconto devono coincidere con quelli della partita.";
  return analyseMatchReport(parsed.data, called).errors[0] ?? matchReportScoreError(parsed.data);
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
  return userIsAssignedToMatchTeam(userId, clubId, teamId);
}

async function userIsAssignedToMatchTeam(userId: number, clubId: number, teamId: number | null): Promise<boolean> {
  if (!teamId) return false;
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
  if (["admin", "presidente", "director", "sporting_director"].includes(role)) return true;
  if (role === "technical_director") return true;
  if (!MATCH_PLAN_VIEW_ROLES.includes(role)) return false;
  return userIsAssignedToMatchTeam(userId, clubId, teamId);
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

router.get("/match-callup-summary", requireAuth, async (req, res): Promise<void> => {
  if(req.session.role==="secretary"){res.status(403).json({error:"Usa Supporto gare per la gestione organizzativa"});return;}
  const clubId = req.session.clubId;
  const userId = req.session.userId;
  const role = normalizeSessionRole(req.session.role);
  const clubWide = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"].includes(role);
  if (!clubId || !userId || (!clubWide && !MATCH_PLAN_VIEW_ROLES.includes(role))) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const requestedSection = req.query.section;
  if (requestedSection !== undefined && (typeof requestedSection !== "string" || !MATCH_SECTION_VALUES.has(requestedSection))) {
    res.status(400).json({ error: "Sezione non valida" });
    return;
  }
  const section = typeof requestedSection === "string" ? requestedSection : normalizeMatchSection(req.session.section);
  const sections = await resolveAllowedClubSections(req, section);
  if (sections?.length === 0) { res.json([]); return; }
  const conditions = [
    eq(matchesTable.clubId, clubId),
    sql`lower(coalesce(${callUpsTable.status}, '')) NOT IN ('available', 'unavailable', 'availability', 'absent', 'declined', 'not_called')`,
  ];
  if (sections) conditions.push(inArray(teamsTable.clubSection, sections));
  if (!clubWide) conditions.push(sql`EXISTS (
    SELECT 1 FROM ${teamStaffAssignmentsTable}
    WHERE ${teamStaffAssignmentsTable.teamId} = ${matchesTable.teamId}
      AND ${teamStaffAssignmentsTable.clubId} = ${clubId}
      AND ${teamStaffAssignmentsTable.userId} = ${userId}
  )`);
  const records = await db.select({
    match: matchesTable,
    teamName: teamsTable.name,
    callupId: callUpsTable.id,
    playerId: callUpsTable.playerId,
    status: callUpsTable.status,
    firstName: playersTable.firstName,
    lastName: playersTable.lastName,
  }).from(matchesTable)
    .innerJoin(teamsTable, and(eq(teamsTable.id, matchesTable.teamId), eq(teamsTable.clubId, clubId)))
    .innerJoin(callUpsTable, eq(callUpsTable.matchId, matchesTable.id))
    .leftJoin(playersTable, and(eq(playersTable.id, callUpsTable.playerId), eq(playersTable.clubId, clubId)))
    .where(and(...conditions))
    .orderBy(asc(matchesTable.date), asc(matchesTable.id), asc(callUpsTable.id));
  const grouped = new Map<number, { match: Record<string, unknown>; callups: Array<{ id: number; playerId: number; status: string | null; playerName: string | null }> }>();
  for (const record of records) {
    let row = grouped.get(record.match.id);
    if (!row) {
      const split = splitPublicNotesAndPlan(record.match.notes ?? null);
      const plan = normalizeMatchPlan(record.match.matchPlan) ?? normalizeMatchPlan(split.plan);
      row = {
        match: {
          id: record.match.id, teamId: record.match.teamId, teamName: record.teamName,
          opponent: record.match.opponent, date: record.match.date,
          competition: record.match.competition, location: record.match.location, homeAway: record.match.homeAway,
          matchPlan: plan ? { convocationAt: plan.convocationAt ?? null, convocationPlace: plan.convocationPlace ?? null } : null,
        },
        callups: [],
      };
      grouped.set(record.match.id, row);
    }
    if (row.callups.some(callup => callup.playerId === record.playerId)) continue;
    row.callups.push({ id: record.callupId, playerId: record.playerId, status: record.status,
      playerName: record.firstName != null ? `${record.firstName} ${record.lastName ?? ""}`.trim() : null });
  }
  res.json([...grouped.values()]);
});

router.get("/matches", requireAuth, async (req, res): Promise<void> => {
  if(["parent","team_manager"].includes(req.session.role??"")){res.status(403).json({error:"Usa la consultazione dedicata al tuo profilo"});return;}
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
  res.json(req.session.role === "secretary" ? enriched.map(({matchPlan, preMatchNotes, postMatchNotes, result, ...schedule})=>schedule) : enriched);
});

// Parser output stays unchanged. Applying a reviewed import is atomic and retry-safe.
router.post("/match-schedule-import",requireAuth,async(req,res)=>{
  const clubId=req.session.clubId!,role=req.session.role??"",{id,teamId,rows}=req.body;
  if(!MATCH_CREATE_DELETE_ROLES.includes(role)){res.status(403).json({error:"Non autorizzato a importare gare"});return;}
  if(typeof id!=="string"||!/^[-0-9a-f]{36}$/i.test(id)||!Number.isSafeInteger(teamId)||!Array.isArray(rows)||!rows.length||rows.length>500||rows.some(r=>!r||typeof r.opponent!=="string"||!r.opponent.trim()||typeof r.date!=="string"||!Number.isFinite(Date.parse(r.date))||!["home","away"].includes(r.homeAway)||r.updateId!==undefined&&!Number.isSafeInteger(r.updateId))){res.status(400).json({error:"Controlla righe, avversari, date e squadra dell’importazione"});return;}
  const targets=rows.filter(r=>r.updateId).map(r=>r.updateId);
  if(new Set(targets).size!==targets.length){res.status(400).json({error:"Due righe aggiornano la stessa gara"});return;}
  const signature=createHash("sha256").update(JSON.stringify({teamId,rows})).digest("hex");
  await db.execute(sql`CREATE TABLE IF NOT EXISTS match_schedule_imports(id uuid PRIMARY KEY,club_id integer NOT NULL REFERENCES clubs(id),signature text NOT NULL,match_ids jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
  try{
    const ids=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'match-import:'+clubId+':'+teamId}))`);
      const prior=(await tx.execute(sql`SELECT * FROM match_schedule_imports WHERE id=${id}::uuid`)).rows[0];
      if(prior){if(prior.club_id!==clubId||prior.signature!==signature)throw Error("Identificativo import già utilizzato: ricarica l’anteprima");return prior.match_ids as number[];}
      const [team]=await tx.select().from(teamsTable).where(and(eq(teamsTable.id,teamId),eq(teamsTable.clubId,clubId)));
      if(!team)throw Error("Squadra non valida per questa società");
      const ids:number[]=[];
      for(const row of rows){
        const values={opponent:row.opponent.trim(),date:new Date(row.date),homeAway:row.homeAway,competition:row.competition??null,location:row.location??null};
        if(row.updateId){
          const [old]=await tx.select().from(matchesTable).where(and(eq(matchesTable.id,row.updateId),eq(matchesTable.clubId,clubId),eq(matchesTable.teamId,teamId)));
          if(!old)throw Error("Gara da aggiornare non trovata nella squadra selezionata");
          if(row.expectedDate&&old.date.toISOString()!==new Date(row.expectedDate).toISOString())throw Error("Una gara è cambiata: ricarica l’anteprima prima di aggiornarla");
          await tx.update(matchesTable).set(values).where(eq(matchesTable.id,old.id));ids.push(old.id);
        }else{
          const [duplicate]=await tx.select({id:matchesTable.id}).from(matchesTable).where(and(eq(matchesTable.clubId,clubId),eq(matchesTable.teamId,teamId),eq(matchesTable.date,values.date),eq(matchesTable.opponent,values.opponent),eq(matchesTable.homeAway,values.homeAway)));
          if(duplicate){ids.push(duplicate.id);continue;}
          const [created]=await tx.insert(matchesTable).values({...values,clubId,teamId,seasonId:team.seasonId,notes:publicMatchNotesInput(row.notes)}).returning({id:matchesTable.id});ids.push(created.id);
        }
      }
      await tx.execute(sql`INSERT INTO match_schedule_imports(id,club_id,signature,match_ids) VALUES(${id}::uuid,${clubId},${signature},${JSON.stringify(ids)}::jsonb)`);return ids;
    });
    const imported=ids.length?await db.select({id:matchesTable.id,competition:matchesTable.competition}).from(matchesTable).where(and(eq(matchesTable.clubId,clubId),inArray(matchesTable.id,ids))):[];
    for(const match of imported)if(/^torneo\b/i.test(match.competition??""))await syncMatchTournamentReply(match.id);
    res.json({count:ids.length});
  }catch(e){res.status(409).json({error:e instanceof Error&&!("cause" in e)?e.message:"Importazione non completata. Riprova dalla stessa anteprima."});}
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
    location: location ?? null, homeAway: homeAway ?? "home", notes: publicMatchNotesInput(notes),
  }).returning();
  if (/^torneo\b/i.test(match.competition ?? "")) await syncMatchTournamentReply(match.id);
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
  if(role==="secretary" && [matchPlan,preMatchNotes,postMatchNotes,result].some(value=>value!==undefined)){res.status(403).json({error:"La Segreteria gestisce il programma gare, non il resoconto tecnico"});return;}

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
    updates.notes = composeNotesWithPlan(publicMatchNotesInput(notes), parsed.plan);
  }
  if (preMatchNotes !== undefined) updates.preMatchNotes = preMatchNotes;
  if (postMatchNotes !== undefined) updates.postMatchNotes = postMatchNotes;
  if (matchPlan !== undefined) {
    const parsed = splitPublicNotesAndPlan(existing.notes ?? null);
    const nextPlan = preserveMatchReport(normalizeMatchPlan(matchPlan), existing.matchPlan ?? parsed.plan, existing.matchPlan?.postMatchConfirmation);
    const solutionError=validateMatchSolutions(nextPlan);
    if(solutionError){res.status(400).json({error:solutionError});return;}
    if (!nextPlan && normalizeMatchPlan(existing.matchPlan ?? parsed.plan)?.postMatchReport !== undefined) {
      res.status(400).json({ error: "Non puoi cancellare un piano con un resoconto post-partita." }); return;
    }
    if (nextPlan?.postMatchReport !== undefined) {
      const called = (await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, id)))
        .filter(row => !["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(String(row.status).toLowerCase()));
      const previous = matchReportSchema.safeParse(normalizeMatchPlan(existing.matchPlan ?? parsed.plan)?.postMatchReport);
      const error = validateMatchReport(nextPlan, [...called.map(row => row.playerId), ...matchReportPlayerIds(previous.data)]);
      if (error) { res.status(400).json({ error }); return; }
      const report = matchReportSchema.parse(nextPlan.postMatchReport);
      const total = matchReportScore(report);
      if (total) updates.result = (homeAway ?? existing.homeAway) === "home" ? `${total.goalsFor}-${total.goalsAgainst}` : `${total.goalsAgainst}-${total.goalsFor}`;
      const scores = String(updates.result !== undefined ? updates.result ?? "" : existing.result ?? "").match(/^(\d+)\s*[-:]\s*(\d+)$/);
      const own = (homeAway ?? existing.homeAway) === "home" ? 1 : 2;
      if (scores && report.goals.length > Number(scores[own])) {
        res.status(400).json({ error: "I marcatori superano i gol della squadra nel risultato." }); return;
      }
    }
    updates.notes = parsed.publicNotes;
    updates.matchPlan = nextPlan;
  }
  if (result !== undefined && matchPlan === undefined) {
    const saved = matchReportSchema.safeParse(normalizeMatchPlan(existing.matchPlan ?? splitPublicNotesAndPlan(existing.notes).plan)?.postMatchReport);
    const total = saved.success ? matchReportScore(saved.data) : null;
    if (total) {
      const expected = (homeAway ?? existing.homeAway) === "home" ? [total.goalsFor,total.goalsAgainst] : [total.goalsAgainst,total.goalsFor];
      const supplied = String(result ?? "").match(/^(\d+)\s*[-:]\s*(\d+)$/);
      if (!supplied || expected[0] !== Number(supplied[1]) || expected[1] !== Number(supplied[2])) {
        res.status(400).json({error:"Il risultato deriva dai singoli tempi: correggi i punteggi nel resoconto."}); return;
      }
    }
  }
  if (req.body.isPostponed !== undefined) updates.isPostponed = req.body.isPostponed;
  if (req.body.rescheduleDate !== undefined) updates.rescheduleDate = req.body.rescheduleDate ? new Date(req.body.rescheduleDate) : null;
  if (req.body.rescheduleTbd !== undefined) updates.rescheduleTbd = req.body.rescheduleTbd;

  if (Object.keys(updates).length === 0) {
    const enrichedCurrent = await enrichMatch(existing);
    res.json(role === "secretary" ? (({matchPlan,preMatchNotes,postMatchNotes,result,...schedule})=>schedule)(enrichedCurrent) : enrichedCurrent);
    return;
  }

  const [match] = await db.update(matchesTable).set(updates)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId),
      ...(matchPlan === undefined ? [] : [sql`${matchesTable.matchPlan} IS NOT DISTINCT FROM ${existing.matchPlan ? JSON.stringify(existing.matchPlan) : null}::jsonb`]))).returning();
  if (!match && matchPlan !== undefined) { res.status(409).json({ error: "Il piano è cambiato. Ricarica la partita prima di salvare." }); return; }
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if ((competition !== undefined || teamId !== undefined || date !== undefined) && /^torneo\b/i.test(match.competition ?? "")) await syncMatchTournamentReply(match.id);
  const enriched = await enrichMatch(match);
  res.json(role === "secretary" ? (({matchPlan,preMatchNotes,postMatchNotes,result,...schedule})=>schedule)(enriched) : enriched);
});

router.post("/matches/:id/report-confirmation", requireAuth, async (req, res): Promise<void> => {
  const { role, userId, clubId, section } = req.session;
  const id = parseRouteIdParam(req.params.id);
  if (role !== "team_manager" || !userId || !clubId) {
    res.status(403).json({ error: "Solo il dirigente assegnato può confermare il resoconto." });
    return;
  }
  if (!id) { res.status(400).json({ error: "Partita non valida." }); return; }
  const outcome = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('match-callups'), ${id})`);
    const [entry] = await tx.select({ match: matchesTable, team: teamsTable, sections: clubMembershipsTable.clubSection })
      .from(matchesTable)
      .innerJoin(teamsTable, and(eq(teamsTable.id, matchesTable.teamId), eq(teamsTable.clubId, clubId)))
      .innerJoin(teamStaffAssignmentsTable, and(eq(teamStaffAssignmentsTable.teamId, teamsTable.id),
        eq(teamStaffAssignmentsTable.clubId, clubId), eq(teamStaffAssignmentsTable.userId, userId)))
      .innerJoin(clubMembershipsTable, and(eq(clubMembershipsTable.clubId, clubId),
        eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.role, "team_manager")))
      .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId))).limit(1);
    if (!entry || (section && section.replace(/-/g, "_") !== entry.team.clubSection) ||
        !entry.sections.some(allowed => allowed.replace(/-/g, "_") === entry.team.clubSection)) {
      return { status: 403, error: "Squadra non assegnata." };
    }
    const { match, team } = entry;
    const date = match.isPostponed ? (match.rescheduleTbd ? null : match.rescheduleDate) : match.date;
    if (!date || date.getTime() >= Date.now()) {
      return { status: 400, error: "Il resoconto si conferma a partita conclusa." };
    }
    const plan = normalizeMatchPlan(match.matchPlan ?? splitPublicNotesAndPlan(match.notes ?? null).plan);
    if (!plan?.postMatchReport) return { status: 400, error: "Salva prima il resoconto con schieramenti e cambi effettivi." };
    const called = uniqueCoachCallups(await tx.select().from(callUpsTable).where(eq(callUpsTable.matchId, id)));
    const report = matchReportSchema.safeParse(plan.postMatchReport);
    const approved = matchReportSchema.safeParse(normalizeMatchPlan(plan.postMatchConfirmation)?.report);
    const reportRoster = [...new Set([...called.map(row => row.playerId), ...matchReportPlayerIds(report.data), ...matchReportPlayerIds(approved.data)])];
    const error = validateMatchReport(plan, reportRoster);
    if (error) return { status: 400, error };
    const savedReport = matchReportSchema.parse(plan.postMatchReport);
    const endsAt = date.getTime() + savedReport.periods.reduce((sum, period) => sum + period.minutes, 0) * 60_000;
    if (endsAt > Date.now()) return { status: 400, error: "Il resoconto si conferma a partita conclusa." };
    const expected = matchReportSchema.safeParse(req.body?.report);
    if (!expected.success || !isDeepStrictEqual(expected.data, savedReport)) {
      return { status: 409, error: "Il resoconto è cambiato. Ricarica la gara e verifica i nuovi dati." };
    }
    const periods = (plan.periods as Record<string, unknown>[]);
    const fallback = defaultRotationCapacity(team.name, team.category, team.clubSection);
    const analysis = analyseMatchReport(savedReport, reportRoster,
      periods.map(period => rotationSummaryCapacity(period, fallback)));
    if (analysis.errors.length || savedReport.periods.some(period => !period.starters.length)) {
      return { status: 400, error: analysis.errors[0] ?? "Indica lo schieramento effettivo di ogni tempo." };
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : "";
    if (notes.length > 2000) return { status: 400, error: "La nota del dirigente può contenere al massimo 2000 caratteri." };
    let managerReport: typeof savedReport | undefined;
    if (req.body?.managerReport !== undefined) {
      const review = matchReportSchema.safeParse(req.body.managerReport);
      if (!review.success || review.data.periods.length !== savedReport.periods.length ||
          !isDeepStrictEqual(review.data.goals, savedReport.goals)) {
        return { status: 400, error: "Controlla i tempi della verifica. I marcatori restano quelli del mister." };
      }
      const reviewAnalysis = analyseMatchReport({ ...review.data, goals: [] }, reportRoster,
        periods.map(period => rotationSummaryCapacity(period, fallback)));
      if (reviewAnalysis.errors.length || review.data.periods.some(period => !period.starters.length)) {
        return { status: 400, error: reviewAnalysis.errors[0] ?? "Indica lo schieramento effettivo di ogni tempo." };
      }
      const reviewedEndsAt = date.getTime() + review.data.periods.reduce((sum, period) => sum + period.minutes, 0) * 60_000;
      if (reviewedEndsAt > Date.now()) return { status: 400, error: "Il resoconto si conferma a partita conclusa." };
      if (!isDeepStrictEqual(review.data, savedReport)) managerReport = review.data;
    }
    const existingConfirmation = normalizeMatchPlan(plan.postMatchConfirmation);
    if (existingConfirmation?.confirmedAt) {
      return isDeepStrictEqual(existingConfirmation.report, managerReport) &&
        (existingConfirmation.notes ?? "") === notes ? { status: 200 }
        : { status: 409, error: "Il resoconto è già stato avallato. Ricarica la gara per vedere la verifica registrata." };
    }
    const [updated] = await tx.update(matchesTable)
      .set({ matchPlan: { ...plan, postMatchConfirmation: { confirmedAt: new Date().toISOString(), confirmedBy: userId, ...(managerReport ? { report: managerReport } : {}), ...(notes ? { notes } : {}) } } })
      .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId),
        sql`${matchesTable.matchPlan} IS NOT DISTINCT FROM ${match.matchPlan ? JSON.stringify(match.matchPlan) : null}::jsonb`))
      .returning({ id: matchesTable.id });
    return updated ? { status: 200 } : { status: 409, error: "Il resoconto è cambiato. Ricarica la gara e verifica i nuovi dati." };
  });
  res.status(outcome.status).json(outcome.error ? { error: outcome.error } : { confirmed: true });
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

router.get("/matches/:id/callup-eligibility", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  const { clubId, userId, role } = req.session;
  if (!id || !clubId || !userId) { res.sendStatus(400); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId)));
  if (!match || !await userCanViewMatchPlan(userId, clubId, role ?? "", match.teamId)) { res.sendStatus(403); return; }
  res.json(await activeMatchEligibility(match));
});

router.get("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canView = await userCanViewMatchPlan(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canView) { res.status(403).json({ error: "Non autorizzato" }); return; }
  await ensureParentAvailabilityColumns();
  const rows = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const callups = uniqueCoachCallups(rows);
  const metaRows = sqlRows<{
    id: number;
    playerId: number;
    parentAvailabilityStatus: string | null;
    parentAvailabilityReason: string | null;
    parentAvailabilityNotes: string | null;
    parentAvailabilityUpdatedAt: Date | string | null;
  }>(await db.execute(sql`
    SELECT id, player_id AS "playerId",
      parent_availability_status AS "parentAvailabilityStatus",
      parent_availability_reason AS "parentAvailabilityReason",
      parent_availability_notes AS "parentAvailabilityNotes",
      parent_availability_updated_at AS "parentAvailabilityUpdatedAt"
    FROM call_ups
    WHERE match_id = ${matchId}
    ORDER BY parent_availability_updated_at DESC NULLS LAST, id DESC
  `));
  // Historical duplicates may hold the latest parent reply on a different row.
  const metaByPlayer = new Map<number, typeof metaRows[number]>();
  for (const row of metaRows) {
    if (row.parentAvailabilityStatus && !metaByPlayer.has(row.playerId)) metaByPlayer.set(row.playerId, row);
  }
  // Opt in only for preparation: PDF, counts and existing consumers stay callups-only.
  const visibleRows = [...callups];
  if (req.query.includeParentAvailability === "1") {
    const seen = new Set(visibleRows.map(row => row.playerId));
    for (const row of rows) {
      if (seen.has(row.playerId)) continue;
      if (!metaByPlayer.has(row.playerId) && !["available", "unavailable", "availability"].includes(String(row.status).toLowerCase())) continue;
      visibleRows.push({ ...row, status: "availability" });
      seen.add(row.playerId);
    }
  }
  const enriched = await Promise.all(visibleRows.map(async (cu) => {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, cu.playerId), eq(playersTable.clubId, req.session.clubId!)));
    const meta = metaByPlayer.get(cu.playerId);
    const legacyStatus = String(rows.find(row => row.playerId === cu.playerId && ["available", "unavailable"].includes(String(row.status).toLowerCase()))?.status ?? "").toLowerCase();
    return { ...cu,
      parentAvailabilityStatus: meta?.parentAvailabilityStatus ?? (legacyStatus || null),
      parentAvailabilityReason: meta?.parentAvailabilityReason ?? null,
      parentAvailabilityNotes: meta?.parentAvailabilityNotes ?? null,
      parentAvailabilityUpdatedAt: meta?.parentAvailabilityUpdatedAt ?? null,
      playerName: player ? `${player.firstName} ${player.lastName}` : null };
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
  const callups = uniqueCoachCallups(await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId)));
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
  const [player] = await db.select({ id: playersTable.id, status: playersTable.status,isTest:playersTable.isTest }).from(playersTable).where(and(eq(playersTable.id, Number(playerId)), eq(playersTable.clubId, req.session.clubId!)));
  if (!player) { res.status(400).json({ error: "Giocatore non valido per questa societa" }); return; }
  if (isArchivedPlayer(player)||player.isTest) { res.status(409).json({ error: "Il giocatore è ritirato." }); return; }
  const scopeFailure = await trainingOnlyCallupFailure(match, [Number(playerId)]);
  if (scopeFailure) { res.status(409).json({ error: scopeFailure }); return; }
  const ruleFailure = callupRuleFailure(await activeMatchEligibility(match), [Number(playerId)]);
  if (ruleFailure) { res.status(409).json({ error: ruleFailure }); return; }
  if (await parentUnavailableForMatch(matchId, [Number(playerId)])) {
    res.status(409).json({ error: "Il genitore ha indicato il giocatore come non disponibile per questa partita" });
    return;
  }
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
  if (!["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(String(status ?? "").toLowerCase())) {
    const failure = await trainingOnlyCallupFailure(match, [existing.playerId]);
    if (failure) { res.status(409).json({ error: failure }); return; }
  }
  if (!["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(String(status ?? "").toLowerCase()) && await parentUnavailableForMatch(existing.matchId, [existing.playerId])) {
    res.status(409).json({ error: "Il genitore ha indicato il giocatore come non disponibile per questa partita" });
    return;
  }
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

router.patch("/matches/:id/meeting", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  const { clubId, userId, role } = req.session;
  if (!id) { res.status(400).json({ error: "Partita non valida." }); return; }
  if (!clubId || !userId) { res.sendStatus(403); return; }
  const [match] = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId)));
  if (!match) { res.status(404).json({ error: "Partita non trovata." }); return; }
  if (!await userCanManageAssignedTeamMatch(userId, clubId, role ?? "", match.teamId)) {
    res.status(403).json({ error: "Non autorizzato a modificare il ritrovo di questa squadra." }); return;
  }

  const { convocationAt, convocationPlace: place } = req.body ?? {};
  const convocationPlace = typeof place === "string" ? place.trim() : "";
  if (typeof convocationAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(convocationAt) || !Number.isFinite(Date.parse(convocationAt))) {
    res.status(400).json({ error: "Controlla la data e l’orario del ritrovo. L’anno deve avere quattro cifre." }); return;
  }
  if (!convocationPlace) { res.status(400).json({ error: "Indica il luogo del ritrovo." }); return; }

  const legacy = splitPublicNotesAndPlan(match.notes);
  const plan = normalizeMatchPlan(match.matchPlan) ?? normalizeMatchPlan(legacy.plan);
  const [updated] = await db.update(matchesTable).set({
    matchPlan: { ...plan, convocationAt: new Date(convocationAt).toISOString(), convocationPlace },
    ...(legacy.plan && !match.matchPlan ? { notes: legacy.publicNotes } : {}),
  }).where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId),
    sql`${matchesTable.teamId} IS NOT DISTINCT FROM ${match.teamId}`,
    sql`${matchesTable.matchPlan} IS NOT DISTINCT FROM ${match.matchPlan ? JSON.stringify(match.matchPlan) : null}::jsonb`,
    sql`${matchesTable.notes} IS NOT DISTINCT FROM ${match.notes}`))
    .returning({ id: matchesTable.id });
  if (!updated) {
    res.status(409).json({ error: "La scheda partita è cambiata. Riprova a salvare il ritrovo." }); return;
  }
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

  preserveMatchReport(matchPlan, existingMatch.matchPlan ?? splitPublicNotesAndPlan(existingMatch.notes ?? null).plan, existingMatch.matchPlan?.postMatchConfirmation, true);
  const historical = matchReportSchema.safeParse(normalizeMatchPlan(existingMatch.matchPlan ?? splitPublicNotesAndPlan(existingMatch.notes).plan)?.postMatchReport);
  const reportError = validateMatchReport(matchPlan, [...desiredPlayerIds, ...matchReportPlayerIds(historical.data)]);
  if (reportError) { res.status(400).json({ error: reportError }); return; }

  const scopeFailure = await trainingOnlyCallupFailure(existingMatch, desiredPlayerIds);
  if (scopeFailure) { res.status(409).json({ error: scopeFailure }); return; }
  const ruleFailure = callupRuleFailure(await activeMatchEligibility(existingMatch), desiredPlayerIds);
  if (ruleFailure) { res.status(409).json({ error: ruleFailure }); return; }
  if (await parentUnavailableForMatch(matchId, desiredPlayerIds)) {
    res.status(409).json({ error: "Uno o piu giocatori risultano non disponibili per questa partita secondo la risposta del genitore. Aggiorna la convocazione." });
    return;
  }

  if (desiredPlayerIds.length > 0) {
    const validPlayers = await db
      .select({ id: playersTable.id, status: playersTable.status,isTest:playersTable.isTest })
      .from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, desiredPlayerIds)));
    if (validPlayers.length !== desiredPlayerIds.length) {
      res.status(400).json({ error: "Uno o piu giocatori non appartengono a questa societa" });
      return;
    }
    if (validPlayers.some(player => isArchivedPlayer(player)||player.isTest)) {
      res.status(409).json({ error: "Rimuovi dalla convocazione i giocatori ritirati." }); return;
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

  await ensureParentAvailabilityColumns();
  const saved = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('match-callups'), ${matchId})`);
    const parsed = splitPublicNotesAndPlan(existingMatch.notes ?? null);
    const report = matchReportSchema.safeParse(matchPlan.postMatchReport);
    const total = report.success ? matchReportScore(report.data) : null;
    const [updated] = await tx.update(matchesTable).set({ notes: parsed.publicNotes, matchPlan,
      ...(total ? {result: existingMatch.homeAway === "home" ? `${total.goalsFor}-${total.goalsAgainst}` : `${total.goalsAgainst}-${total.goalsFor}`} : {}) })
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId),
        sql`${matchesTable.matchPlan} IS NOT DISTINCT FROM ${existingMatch.matchPlan ? JSON.stringify(existingMatch.matchPlan) : null}::jsonb`))
      .returning({ id: matchesTable.id });
    if (!updated) return false;
    // Deselecting a called player must retain the parent's separate reply.
    await tx.execute(sql`
      UPDATE call_ups SET status = 'availability'
      WHERE match_id = ${matchId} AND parent_availability_status IS NOT NULL
        ${desiredPlayerIds.length ? sql`AND player_id NOT IN (${sql.join(desiredPlayerIds.map(id => sql`${id}`), sql`, `)})` : sql``}
    `);
    if (desiredPlayerIds.length === 0) {
      await tx
        .delete(callUpsTable)
        .where(and(
          eq(callUpsTable.matchId, matchId),
          sql`lower(${callUpsTable.status}) NOT IN ('unavailable', 'availability')`,
        ));
      return true;
    }

    await tx
      .delete(callUpsTable)
      .where(and(
        eq(callUpsTable.matchId, matchId),
        notInArray(callUpsTable.playerId, desiredPlayerIds),
        sql`lower(${callUpsTable.status}) NOT IN ('unavailable', 'availability')`,
      ));

    const existingCallups = await tx
      .select({ id: callUpsTable.id, playerId: callUpsTable.playerId, status: callUpsTable.status })
      .from(callUpsTable)
      .where(eq(callUpsTable.matchId, matchId));
    const availabilityOnlyRows = existingCallups.filter((callup) =>
      desiredPlayerIds.includes(callup.playerId) &&
      ["available", "unavailable", "availability"].includes(String(callup.status ?? "").toLowerCase()),
    );
    for (const row of availabilityOnlyRows) {
      await tx.update(callUpsTable).set({ status: "called" }).where(eq(callUpsTable.id, row.id));
    }
    // Availability rows above have just been promoted: they already represent a callup.
    const existingPlayerIds = new Set(existingCallups.map((callup) => callup.playerId));
    const toInsert = desiredPlayerIds
      .filter((playerId) => !existingPlayerIds.has(playerId))
      .map((playerId) => ({ matchId, playerId, status: "called" }));

    if (toInsert.length > 0) {
      await tx.insert(callUpsTable).values(toInsert);
    }
    return true;
  });
  if (!saved) { res.status(409).json({ error: "Il piano è cambiato. Ricarica la partita prima di salvare." }); return; }

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
  const callups = uniqueCoachCallups(await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId)));
  const playerIds = callups.map(row => row.playerId);
  if (!playerIds.length) {
    res.status(400).json({ error: "Nessun convocato selezionato" }); return;
  }
  const scopeFailure = await trainingOnlyCallupFailure(match, playerIds);
  if (scopeFailure) { res.status(409).json({ error: scopeFailure }); return; }
  const eligibility = await activeMatchEligibility(match);
  const failure = callupRuleFailure(eligibility, playerIds);
  if (failure) { res.status(409).json({ error: failure }); return; }
  await ensureCallupRulesStorage();
  const clubId = req.session.clubId!;
  const title = `Convocazione partita ${team?.name ?? ""}`.trim();
  const opponent = `Partita vs ${match.opponent}${team?.name ? ` (${team.name})` : ""}.`;
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('match-callups'), ${matchId})`);
    const current = uniqueCoachCallups(await tx.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId)));
    if (current.length !== playerIds.length || current.some(row => !playerIds.includes(row.playerId))) return null;
    const past = sqlRows<{ snapshot: Record<string, { type: string; title: string; message: string }> }>(await tx.execute(sql`
      SELECT snapshot FROM match_callup_publications WHERE match_id = ${matchId}`))[0]?.snapshot ?? {};
    const blocked = eligibility?.rows.filter(row => row.state === "blocked") ?? [];
    const ids = [...new Set([...Object.keys(past).map(Number), ...playerIds, ...blocked.map(row => row.id)])];
    const players = await tx.select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName, status: playersTable.status,isTest:playersTable.isTest })
      .from(playersTable).where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, ids)));
    if (players.some(player => playerIds.includes(player.id) && (isArchivedPlayer(player)||player.isTest))) return null;
    const snapshot: typeof past = {};
    const deliveries: { parentUserId: number; playerId: number; title: string; message: string }[] = [];
    for (const player of players) {
      const playerId = player.id;
      const name = player.firstName + " " + player.lastName;
      const ineligible = blocked.find(row => row.id === playerId);
      const selected = playerIds.includes(playerId);
      const decision = selected
        ? { type: "match_callup", title, message: `Convocazione ${name}: ${convocationDate.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} presso ${convocationPlace}. ${opponent}` }
        : ineligible ? { type: "match_callup_status", title: "Esito convocazione", message: `${name}: non convocabile. ${opponent} Motivo: ${ineligible.reasons[0]}.` }
        : past[playerId] ? { type: "match_callup_status", title: "Aggiornamento convocazione", message: `${name}: non convocato. ${opponent}` }
        : null;
      if (!decision) continue;
      snapshot[playerId] = decision;
      if (isDeepStrictEqual(past[playerId], decision)) continue;
      const parents = await notifyChild(tx, { clubId, playerId, ...decision });
      deliveries.push(...parents.map(parentUserId => ({ parentUserId, playerId, title: decision.title, message: decision.message })));
    }
    await tx.execute(sql`INSERT INTO match_callup_publications (match_id, snapshot)
      VALUES (${matchId}, ${JSON.stringify(snapshot)}::jsonb)
      ON CONFLICT (match_id) DO UPDATE SET snapshot = EXCLUDED.snapshot`);
    return { deliveries, names: new Map(players.map(player => [player.id, player.firstName + " " + player.lastName])) };
  });
  if (!result) { res.status(409).json({ error: "La lista dei convocati è cambiata. Verifica e ripubblica." }); return; }
  const deliveredPlayers = new Set<number>();
  await Promise.allSettled(result.deliveries.filter(item => {
    if (deliveredPlayers.has(item.playerId)) return false;
    deliveredPlayers.add(item.playerId);
    return true;
  }).map(item => sendParentNotificationEmail({ ...item, clubId })));
  const playerNameMap = result.names;
  const notifications = result.deliveries.length;

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

  res.json({ notifications, clipboardText, parentsImpacted: new Set(result.deliveries.map(item => item.parentUserId)).size });
});

export default router;
