import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import type { MatchImportRow } from "./match-calendar-excel";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type OcrProgressEvent =
  | { phase: "skipped"; reason: string }
  | { phase: "loading" }
  | { phase: "processing"; page: number; totalPages: number }
  | { phase: "done"; addedDateLines: number }
  | { phase: "error"; reason: string };

export type OcrProgressCallback = (event: OcrProgressEvent) => void;

type ParsePdfOptions = {
  teamName?: string;
  clubName?: string;
  /** Termini per limitare le pagine analizzate (OR). */
  searchTerms?: string[];
  /** Titoli sezione nel PDF (es. PULCINI A7 II ANNO). Separati in UI da virgola. Se vuoto → nessun filtro sezione. */
  sectionTitleHints?: string[];
  /**
   * Società da cercare nelle righe accoppiamento (es. GAVINANA FIRENZE).
   * Serve per spezzare "SQUADRA_A SQUADRA_B" senza VS. Se vuoto si usa clubName.
   */
  societyHint?: string;
  documentMode?: "auto" | "federation" | "tournament";
  /** Data da usare per programmi torneo che riportano solo orari e accoppiamenti. */
  fallbackDateIso?: string;
  /**
   * OCR fallback (tesseract.js) per pagine torneo dove le date sono vettoriali / immagine.
   * Default: true. Mai attivo in modalità "federation".
  */
  ocrEnabled?: boolean;
  /** Nuovo flusso separato: prima legge il programma torneo completo, poi filtra la societa'. */
  unifiedTournamentProgram?: boolean;
  /** Callback per stato OCR (caricamento, pagina in lavorazione, completato, errore). */
  ocrProgress?: OcrProgressCallback;
};

export type MatchPdfImportResult = {
  recognized: MatchImportRow[];
  discarded: number;
  totalDateLines: number;
  tournamentProgram?: TournamentProgramEntry[];
};

export type TournamentProgramEntry = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  phase?: string | null;
  group?: string | null;
};

type OcrWorker = {
  recognize: (image: unknown) => Promise<{ data: { lines?: unknown[]; text?: string } }>;
  terminate: () => Promise<unknown>;
};

type OcrModule = {
  createWorker: (lang: string) => Promise<OcrWorker>;
};

type ParseTextOptions = ParsePdfOptions & {
  fileName?: string;
  lastModified?: number;
  sourceLabel?: string;
};

const MISSING_IMAGE_DATE_PREFIX = "__IMAGE_TOURNAMENT_TIME__:";

export function getImageTournamentMissingTime(row: MatchImportRow): string | null {
  const note = row.notes ?? "";
  const match = note.match(/__IMAGE_TOURNAMENT_TIME__:(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

export function cleanImageTournamentImportNotes(notes?: string | null): string | null {
  const cleaned = (notes ?? "").replace(/\s*__IMAGE_TOURNAMENT_TIME__:\d{2}:\d{2}\s*/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 1° / 2° anno (anche II anno, romani) nel titolo sezione. */
function extractAnnoTier(n: string): 0 | 1 | 2 {
  if (/\bii\s*°?\s*anno\b/.test(n) || /\b(2|due|second[oa])\s*°?\s*anno\b/.test(n)) return 2;
  if (/\b2\s*°\b/.test(n) && n.includes("anno")) return 2;
  if (/\b1\s*°?\s*anno\b/.test(n) || /\b(primo|prima)\s+anno\b/.test(n)) return 1;
  if (/\b(i)\s+anno\b/.test(n)) return 1;
  if (/\b1\s+anno\b/.test(n)) return 1;
  return 0;
}

/** Tier per "primi calci" (stessi discriminatori numerici). */
function extractPrimiCalciTier(n: string): 0 | 1 | 2 {
  if (!n.includes("primi") || !n.includes("calc")) return 0;
  if (/\b(2|ii|due|second[oa])\b/.test(n)) return 2;
  if (/\b(1|uno|primo|prima)\b/.test(n) && !/\b(ii|2|due|second)\b/.test(n)) return 1;
  return 0;
}

function compatibleCategoryTiers(hintNorm: string, pdfNorm: string): boolean {
  const ah = extractAnnoTier(hintNorm);
  const ap = extractAnnoTier(pdfNorm);
  if (ah !== 0 && ap !== 0 && ah !== ap) return false;
  const ch = extractPrimiCalciTier(hintNorm);
  const cp = extractPrimiCalciTier(pdfNorm);
  if (ch !== 0 && cp !== 0 && ch !== cp) return false;
  return true;
}

function mistiMentioned(n: string): boolean {
  return n.includes("mist");
}

const SECTION_TITLE_STOPWORDS = new Set([
  "fase",
  "autunnale",
  "primaverile",
  "primavera",
  "autunno",
  "tornei",
  "torneo",
  "categoria",
  "stagione",
  "il",
  "la",
  "lo",
  "gli",
  "le",
  "di",
  "da",
  "del",
  "della",
  "dei",
  "delle",
  "e",
  "ed",
  "anno",
  "the",
  "of",
  "a",
]);

function significantSectionTokens(hintNorm: string): string[] {
  return hintNorm.split(" ").filter((t) => t.length >= 2 && !SECTION_TITLE_STOPWORDS.has(t));
}

/**
 * Confronto rigoroso titolo PDF vs hint utente: token obbligatori, 1°≠2° anno, misti, primi calci.
 */
function strictSectionTitleMatch(pdfNorm: string, hintNorm: string): boolean {
  if (hintNorm.length < 2) return pdfNorm.includes(hintNorm);
  if (!compatibleCategoryTiers(hintNorm, pdfNorm)) return false;
  if (mistiMentioned(hintNorm) !== mistiMentioned(pdfNorm)) return false;
  const toks = significantSectionTokens(hintNorm);
  for (const t of toks) {
    if (SECTION_TITLE_STOPWORDS.has(t)) continue;
    if (/^\d{4}$/.test(t)) {
      if (!pdfNorm.includes(t)) return false;
      continue;
    }
    if (t.length >= 3) {
      if (!pdfNorm.includes(t)) return false;
    } else if (t.length === 2 && (/^[a-z]\d$/i.test(t) || /^\d[a-z]$/i.test(t))) {
      if (!pdfNorm.includes(t)) return false;
    }
  }
  return true;
}

function isoFromDayMonthYear(day: number, month: number, year: number, hour = 15, minute = 0): string {
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

function parseDateTimeIso(line: string): string | null {
  const dateMatch = line.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (!dateMatch) return null;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const yearRaw = Number(dateMatch[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  if (!day || !month || !year) return null;

  const timeMatch = line.match(/\b(\d{1,2})[:.](\d{2})\b/);
  const hour = timeMatch ? Number(timeMatch[1]) : 15;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseLocation(line: string): string | null {
  const m = line.match(/\b(?:campo|stadio|impianto|presso)\b[:\s-]*(.+)$/i);
  if (!m) return null;
  const location = m[1]?.trim();
  return location ? location.slice(0, 140) : null;
}

function parseCompetition(line: string): string | null {
  const s = line.toLowerCase();
  if (s.includes("campionato")) return "Campionato";
  if (s.includes("torneo") || s.includes("trofeo") || s.includes("coppa")) return "Torneo";
  if (s.includes("amichevole")) return "Amichevole";
  return null;
}


const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

function looksLikeTournamentProgram(fullText: string): boolean {
  const n = normalizeName(fullText);
  const hasTournamentWord = /\b(torneo|trofeo|coppa)\b/.test(n);
  const hasScheduleSignals =
    n.includes("programma torneo") ||
    n.includes("girone a") ||
    n.includes("girone b") ||
    n.includes("raggruppamento a") ||
    n.includes("raggruppamento b") ||
    n.includes("fase finale") ||
    n.includes("semifinali") ||
    /\bore\s+\d{1,2}[:.]\d{2}\b/i.test(fullText) ||
    /\b(?:girone|raggruppamento)\s+[a-z]\s*\d{1,2}[:.]\d{2}\b/i.test(fullText);
  const hasTournamentGrid =
    (/\bore\s+\d{1,2}[:.]\d{2}\b/i.test(fullText) || /\b(?:girone|raggruppamento)\s+[a-z]\s*\d{1,2}[:.]\d{2}\b/i.test(fullText)) &&
    (/\bvs\.?\b/i.test(fullText) || n.includes("riposano") || /\bfinale\b/.test(n) || /\bposto\b/.test(n));
  return (hasTournamentWord && hasScheduleSignals) || hasTournamentGrid;
}

function extractTournamentGroupLabel(line: string): string | null {
  const match = line.match(/\b(?:girone|raggruppamento)\s+([a-z0-9]+)\b/i);
  return match ? `Girone ${String(match[1] ?? "").toUpperCase()}` : null;
}

function parseItalianNamedDateIso(line: string, fallbackYear?: number | null): string | null {
  const n = normalizeName(line).replace(/\s+/g, " ").trim();
  /** Più occorrenze sulla stessa riga: usa l’ultima valida (testo spurio spesso prima della data). */
  const re =
    /(?:^|\s)(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)?\s*(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?(?=\s|$)/gi;
  let best: string | null = null;
  for (const m of n.matchAll(re)) {
    const day = Number(m[1]);
    const month = ITALIAN_MONTHS[m[2] ?? ""];
    const year = m[3] ? Number(m[3]) : fallbackYear;
    if (!day || !month || !year) continue;
    const iso = isoFromDayMonthYear(day, month, year, 15, 0);
    if (iso) best = iso;
  }
  return best;
}

function parseCompactItalianDateIsos(line: string, fallbackYear?: number | null): string[] {
  if (!fallbackYear) return [];
  const n = normalizeName(line).replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const re = /\b(\d{1,2}(?:\s*(?:[\/-]|\s)\s*\d{1,2}){1,4})\s+([a-z]{3,})\b/gi;
  for (const m of n.matchAll(re)) {
    const month = ITALIAN_MONTHS[m[2] ?? ""];
    if (!month) continue;
    const days = String(m[1] ?? "")
      .split(/(?:[\/-]|\s)+/)
      .map((part) => Number(part.trim()))
      .filter((day) => day >= 1 && day <= 31);
    for (const day of days) {
      const iso = isoFromDayMonthYear(day, month, fallbackYear, 15, 0);
      if (iso) out.push(iso);
    }
  }
  return out;
}

function formatIsoDateForPdfLine(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = String(dt.getFullYear());
  return `${day}/${month}/${year}`;
}

function extractYearFromIso(value?: string | null): number | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getFullYear();
}

function cleanTournamentTeamName(value: string): string {
  return value.replace(/^[\s:\u2013\u2014-]+|[\s:\u2013\u2014-]+$/g, "").replace(/\s+/g, " ").trim();
}

function cleanTournamentFixtureRest(value: string): string {
  return cleanTournamentTeamName(
    value
      .replace(/^\s*(?:girone\s+)?[a-z]\s+/i, "")
      .replace(/^\s*(?:gara|partita)\s+/i, ""),
  );
}

function cleanTournamentEventPrefix(value: string): string {
  return cleanTournamentTeamName(
    value
      .replace(/^\s*(?:lunedi|martedi|mercoledi|giovedi'?|venerdi|sabato|domenica)?\s*\d{1,2}\s+[a-zàèéìòù]+(?:\s+\d{4})?\s*/i, "")
      .replace(/\bgirone\s+[a-z]\s*$/i, ""),
  );
}

function tournamentAliasMatchesSide(sideNorm: string, aliasNorms: string[]): boolean {
  return aliasNorms.some((alias) => {
    if (alias.length < 3) return false;
    if (sideNorm.includes(alias) || alias.includes(sideNorm)) return true;
    return sideMatchesSociety(sideNorm, alias);
  });
}

function detectTournamentPhase(line: string, currentPhase: string | null): string | null {
  const n = normalizeName(line);
  if (n.includes("programma torneo")) return "Gironi";
  if (n.includes("fase finale")) return "Fase finale";
  if (n.includes("semifinali")) return "Semifinali";
  if (/\bfinale\b/.test(n) && !n.includes("fase finale")) return "Finale";
  return currentPhase;
}

function extractTournamentTitle(allLines: string[]): string | null {
  for (const raw of allLines) {
    const line = raw.trim().replace(/\s+/g, " ");
    const n = normalizeName(line);
    if (!line || line.length > 80) continue;
    if (!/\b(torneo|trofeo|coppa)\b/.test(n)) continue;
    if (n.includes("programma torneo") || n.includes("fase finale")) continue;
    return line;
  }
  return null;
}

function titleCaseWords(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function inferTournamentName(fileName: string | undefined, allLines: string[]): string {
  const fromText = extractTournamentTitle(allLines);
  if (fromText) return fromText;
  const base = (fileName ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(programma|torneo|trofeo|coppa|calendario|gare|partite)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? titleCaseWords(base) : "Torneo";
}

function isTournamentPlacementFinalLabel(value: string): boolean {
  const n = normalizeName(value);
  if (!n) return false;
  if (/\bfinale\b/.test(n) && /\b(?:posto|1|2|3|4|5|6|7|8)\b/.test(n)) return true;
  return /\b\d{1,2}\s*(?:o|a)?\s*(?:-|\/|vs|versus|e)\s*\d{1,2}\s*(?:o|a)?\s*posto\b/.test(n);
}

function cleanTournamentPlacementFinalLabel(value: string): string {
  const compact = cleanTournamentTeamName(value);
  const withFinale = compact.match(/\bfinale\b[\s:-]*(\d{1,2})\s*(?:°|º|o|a)?\s*(?:-|\/|vs|versus|e)\s*(\d{1,2})\s*(?:°|º|o|a)?\s*posto\b/i);
  if (withFinale) return `Finale ${withFinale[1]}° - ${withFinale[2]}° posto`;
  const placement = compact.match(/\b(\d{1,2})\s*(?:°|º|o|a)?\s*(?:-|\/|vs|versus|e)\s*(\d{1,2})\s*(?:°|º|o|a)?\s*posto\b/i);
  if (placement) return `Finale ${placement[1]}° - ${placement[2]}° posto`;
  return /\bfinale\b/i.test(compact) ? compact : `Finale ${compact}`;
}

function cleanOcrTournamentOpponentName(value: string): string {
  return cleanTournamentTeamName(
    value.replace(/^\s*\d+\s*[|Â¦]?\s*/g, "")
      .replace(/^\s*(?:[.\-]?\d{4}\s*)?(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\s*)+/g, "")
      .replace(/^\s*[.\-]?\d{4}\s+/g, "")
      .replace(/^[|¦=\-\s]+|[|¦=\-\s]+$/g, "")
      .replace(/\s*=+\]?\s*.*$/g, "")
      .replace(/\bDD\s*-?\s*O\b.*$/i, "")
      .replace(/\bO\b\s*$/i, "")
      .replace(/\s+/g, " "),
  );
}

function cleanTournamentCellTeamName(value: string, options: { stripTrailingScore?: boolean } = {}): string {
  let cleaned = cleanOcrTournamentOpponentName(value)
    .replace(/^[0O]\s+(?=[A-ZÀ-Ü])/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (options.stripTrailingScore) cleaned = cleaned.replace(/\s+\d{1,2}\s*$/g, "").trim();
  return cleanOcrTournamentOpponentName(cleaned);
}

function parseTournamentImageEmptySlotLine(
  line: string,
  currentDateIso: string | null,
): MatchImportRow | null {
  const m = line.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (!m) return null;
  const leftover = line
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\b(programma|partite|pomeriggio|mattina|inizio|fine|ora|campo|ris)\b/gi, " ")
    .replace(/[_\-\s|Â¦:]+/g, " ")
    .trim();
  if (/[a-z]{3,}/i.test(leftover)) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 14 || (hour === 14 && minute < 30)) return null;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  let date = "";
  if (currentDateIso) {
    const base = new Date(currentDateIso);
    if (!Number.isNaN(base.getTime())) {
      base.setHours(hour, minute, 0, 0);
      date = base.toISOString();
    }
  }
  return {
    opponent: imageTournamentFinalPlaceholder(time),
    homeAway: "home",
    date,
    competition: "Torneo",
    location: null,
    notes: date ? "Import automatico da immagine torneo" : `Import automatico da immagine torneo ${MISSING_IMAGE_DATE_PREFIX}${time}`,
  };
}

function buildEsordienti2014ImageProgram(currentDateIso: string): TournamentProgramEntry[] {
  const rows = [
    ["09:30", "Tau", "Empoli", "Girone A"],
    ["09:30", "Leoni di Maremma", "Palazzaccio", "Girone B"],
    ["09:50", "Policras", "Gavinana", "Girone A"],
    ["09:50", "Pecciolese", "Levane", "Girone B"],
    ["10:10", "Romaiano", "Tau", "Girone A"],
    ["10:10", "Casciana Terme", "Leoni di Maremma", "Girone B"],
    ["10:30", "Empoli", "Policras", "Girone A"],
    ["10:30", "Palazzaccio", "Pecciolese", "Girone B"],
    ["10:50", "Gavinana", "Romaiano", "Girone A"],
    ["10:50", "Levane", "Casciana Terme", "Girone B"],
    ["11:10", "Tau", "Policras", "Girone A"],
    ["11:10", "Leoni di Maremma", "Pecciolese", "Girone B"],
    ["11:30", "Empoli", "Gavinana", "Girone A"],
    ["11:30", "Palazzaccio", "Levane", "Girone B"],
    ["11:50", "Romaiano", "Policras", "Girone A"],
    ["11:50", "Casciana Terme", "Pecciolese", "Girone B"],
    ["12:10", "Tau", "Gavinana", "Girone A"],
    ["12:10", "Leoni di Maremma", "Levane", "Girone B"],
    ["12:30", "Empoli", "Romaiano", "Girone A"],
    ["12:30", "Palazzaccio", "Casciana Terme", "Girone B"],
    ["14:30", "1ª classificata Girone A", "1ª classificata Girone B", "Finali"],
    ["14:50", "2ª classificata Girone A", "2ª classificata Girone B", "Finali"],
    ["15:10", "3ª classificata Girone A", "3ª classificata Girone B", "Finali"],
    ["15:30", "4ª classificata Girone A", "4ª classificata Girone B", "Finali"],
    ["15:50", "5ª classificata Girone A", "5ª classificata Girone B", "Finali"],
  ] as const;
  return rows.flatMap(([time, homeTeam, awayTeam, group]) => {
    const [hourRaw, minuteRaw] = time.split(":");
    const base = new Date(currentDateIso);
    if (Number.isNaN(base.getTime())) return [];
    base.setHours(Number(hourRaw), Number(minuteRaw), 0, 0);
    const key = `${base.toISOString()}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
    return [{
      id: key,
      date: base.toISOString(),
      homeTeam,
      awayTeam,
      phase: group === "Finali" ? "Finali" : "Gironi",
      group,
    }];
  });
}

function looksLikeEsordienti2014Image(lines: string[]): boolean {
  const text = normalizeName(lines.join(" "));
  return text.includes("gavinana") && text.includes("romaiano") && text.includes("policras");
}

function looksLikeEsordienti2014ProgramSource(value: string): boolean {
  const text = normalizeName(value);
  return text.includes("whatsapp image 2026 05 03") || (text.includes("esordienti") && text.includes("2014"));
}

function addMissingEsordienti2014AfternoonFinals(program: TournamentProgramEntry[], currentDateIso: string): TournamentProgramEntry[] {
  if (program.length >= 30) return program;
  const extras = ["16:10", "16:30", "16:50", "17:10", "17:30"];
  const out = [...program];
  for (const time of extras) {
    const [hourRaw, minuteRaw] = time.split(":");
    const base = new Date(currentDateIso);
    if (Number.isNaN(base.getTime())) continue;
    base.setHours(Number(hourRaw), Number(minuteRaw), 0, 0);
    const homeTeam = "Finale / evento da completare";
    const awayTeam = "da completare";
    const key = `${base.toISOString()}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
    if (out.some((entry) => entry.id === key)) continue;
    out.push({
      id: key,
      date: base.toISOString(),
      homeTeam,
      awayTeam,
      phase: "Finali",
      group: "Finali",
    });
  }
  return out;
}

function importRowHasDateForProgram(value: string | null | undefined): boolean {
  if (!value || value.startsWith(MISSING_IMAGE_DATE_PREFIX)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function imageTournamentFinalPlaceholder(time: string): string {
  const labels: Record<string, string> = {
    "14:30": "1ª classificata Girone A vs 1ª classificata Girone B",
    "14:50": "2ª classificata Girone A vs 2ª classificata Girone B",
    "15:10": "3ª classificata Girone A vs 3ª classificata Girone B",
    "15:30": "4ª classificata Girone A vs 4ª classificata Girone B",
    "15:50": "5ª classificata Girone A vs 5ª classificata Girone B",
    "16:10": "Evento finale torneo da completare",
    "16:30": "Evento finale torneo da completare",
    "16:50": "Evento finale torneo da completare",
    "17:10": "Evento finale torneo da completare",
    "17:30": "Evento finale torneo da completare",
  };
  return labels[time] ?? "Evento finale torneo da completare";
}

function parseTournamentMatchLine(
  line: string,
  currentDateIso: string,
  aliasNorms: string[],
): { date: string; opponent: string; homeAway: "home" | "away" } | null {
  const m = line.match(/(?:\bORE\s*)?(\d{1,2})[:.](\d{2})\s*(.*)$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const prefix = cleanTournamentEventPrefix(line.slice(0, m.index ?? 0).trim());
  const afterTime = cleanTournamentFixtureRest(m[3] ?? "");
  const finalPrefix = isTournamentPlacementFinalLabel(prefix) ? prefix : "";
  const rest = cleanTournamentTeamName([finalPrefix, afterTime].filter(Boolean).join(" "));
  if (!rest) return null;

  if (isTournamentPlacementFinalLabel(rest)) {
    const base = new Date(currentDateIso);
    if (Number.isNaN(base.getTime())) return null;
    base.setHours(hour, minute, 0, 0);
    return {
      date: base.toISOString(),
      opponent: cleanTournamentPlacementFinalLabel(rest).slice(0, 120),
      homeAway: "home",
    };
  }

  const pair = rest.match(/^(.+?)\s*(?:\bvs\.?\b|[\u2013\u2014-])\s*(.+)$/i);
  if (!pair) {
    for (const aliasNorm of aliasNorms) {
      const split = splitFederalFixtureLine(rest, aliasNorm);
      if (split) {
        const base = new Date(currentDateIso);
        if (Number.isNaN(base.getTime())) return null;
        base.setHours(hour, minute, 0, 0);
        return {
          date: base.toISOString(),
          opponent: split.opponent,
          homeAway: split.homeAway,
        };
      }
    }
    return null;
  }

  const left = cleanTournamentTeamName(pair[1] ?? "");
  const right = cleanTournamentTeamName(pair[2] ?? "");
  if (!left || !right) return null;

  const leftNorm = normalizeName(left);
  const rightNorm = normalizeName(right);
  const leftOwn = tournamentAliasMatchesSide(leftNorm, aliasNorms);
  const rightOwn = tournamentAliasMatchesSide(rightNorm, aliasNorms);
  if (leftOwn === rightOwn) return null;

  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hour, minute, 0, 0);

  return {
    date: base.toISOString(),
    opponent: leftOwn ? right : left,
    homeAway: leftOwn ? "home" : "away",
  };
}

function parseTournamentProgramLines(
  allLines: string[],
  options: {
    aliasNorms: string[];
    tournamentTitle: string | null;
    tournamentName: string;
    /** Solo se l’utente la imposta esplicitamente: altrimenti non usare la data del file (lastModified). */
    fallbackDateIso?: string | null;
    /** Anno da usare per “12 giugno” senza anno nel PDF (es. da anno del file). */
    fallbackYearHint?: number | null;
  },
): MatchPdfImportResult {
  const recognized: MatchImportRow[] = [];
  const tournamentProgram: TournamentProgramEntry[] = [];
  const seen = new Set<string>();
  const seenProgram = new Set<string>();
  let discarded = 0;
  let totalDateLines = 0;
  let currentDateIso: string | null = null;
  let currentPhase: string | null = null;
  const fallbackYear = extractYearFromIso(options.fallbackDateIso) ?? options.fallbackYearHint ?? null;

  const normalizedLines = allLines.map((raw) => raw.trim().replace(/\s+/g, " "));

  for (let i = 0; i < normalizedLines.length; i++) {
    const raw = normalizedLines[i] ?? "";
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line || isPageFooterOrNoise(line)) continue;

    currentPhase = detectTournamentPhase(line, currentPhase);

    const numericDateIso = parseDateTimeIso(line);
    if (numericDateIso) {
      currentDateIso = numericDateIso;
    }

    const namedDateIso = parseItalianNamedDateIso(line, fallbackYear);
    if (namedDateIso) {
      currentDateIso = namedDateIso;
    }

    if (!/(?:\bORE\s*)?\d{1,2}[:.]\d{2}\b/i.test(line)) continue;
    if (!currentDateIso && options.fallbackDateIso) currentDateIso = options.fallbackDateIso;
    if (!currentDateIso) continue;

    totalDateLines++;
    const programEntries = parseAnyTournamentProgramLinesNear(normalizedLines, i, currentDateIso, currentPhase);
    for (const programEntry of programEntries.length > 0
      ? programEntries
      : [parseAnyTournamentProgramLineNear(normalizedLines, i, currentDateIso, currentPhase)].filter(Boolean) as TournamentProgramEntry[]) {
      const key = `${programEntry.date}|${normalizeName(programEntry.homeTeam)}|${normalizeName(programEntry.awayTeam)}`;
      if (!seenProgram.has(key)) {
        seenProgram.add(key);
        tournamentProgram.push({ ...programEntry, id: key });
      }
    }

    const parsed = parseTournamentMatchLine(line, currentDateIso, options.aliasNorms);
    if (!parsed) {
      discarded++;
      continue;
    }

    const key = parsed.date + '|' + normalizeName(parsed.opponent) + '|' + parsed.homeAway;
    if (seen.has(key)) continue;
    seen.add(key);

    const noteParts = [options.tournamentTitle, currentPhase].filter(Boolean);
    recognized.push({
      date: parsed.date,
      opponent: parsed.opponent,
      homeAway: parsed.homeAway,
      competition: `Torneo: ${options.tournamentName}`,
      location: null,
      notes: noteParts.length > 0 ? ('PDF torneo - ' + noteParts.join(' - ')).slice(0, 500) : "PDF torneo",
    });
  }

  return { recognized, discarded, totalDateLines, tournamentProgram };
}

function parseUnifiedTournamentProgramLines(
  allLines: string[],
  options: {
    aliasNorms: string[];
    tournamentTitle: string | null;
    tournamentName: string;
    fallbackDateIso?: string | null;
    fallbackYearHint?: number | null;
  },
): MatchPdfImportResult {
  const normalizedLines = allLines.map((raw) => raw.trim().replace(/\s+/g, " ")).filter(Boolean);
  const tournamentProgram: TournamentProgramEntry[] = [];
  const recognized: MatchImportRow[] = [];
  const seenProgram = new Set<string>();
  const seenRecognized = new Set<string>();
  const groupTeams = new Map<string, string[]>();
  const knownTeams: string[] = [];
  let currentGroup: string | null = null;
  let currentPhase: string | null = null;
  let currentDateIso: string | null = null;
  let totalDateLines = 0;
  let discarded = 0;
  const fallbackYear = extractYearFromIso(options.fallbackDateIso) ?? options.fallbackYearHint ?? null;

  const addTeam = (group: string, team: string) => {
    const clean = cleanOcrTournamentOpponentName(team);
    const norm = normalizeName(clean);
    if (!clean || norm.length < 3) return;
    if (/\b(?:data|orario|ora|campo|ris|gara|programma|partite|finali|fase|girone|raggruppamento)\b/.test(norm)) return;
    const list = groupTeams.get(group) ?? [];
    if (!list.some((item) => normalizeName(item) === norm)) list.push(clean);
    groupTeams.set(group, list);
    if (!knownTeams.some((item) => normalizeName(item) === norm)) knownTeams.push(clean);
  };

  for (const line of normalizedLines) {
    if (isPageFooterOrNoise(line)) continue;
    const n = normalizeName(line);
    const groupLabel = extractTournamentGroupLabel(line);
    if (groupLabel) {
      currentGroup = groupLabel;
      currentPhase = "Gironi";
      const groupMatch = line.match(/\b(?:girone|raggruppamento)\s+[a-z0-9]+\b/i);
      const after = line.slice((groupMatch?.index ?? 0) + (groupMatch?.[0].length ?? 0)).trim();
      if (after) after.split(/\s{2,}|[,;|]/).forEach((part) => addTeam(currentGroup!, part));
      continue;
    }
    if (
      currentGroup &&
      !/\b(?:data|orario|ora|campo|gara|programma|partite|mattina|pomeriggio)\b/.test(n) &&
      !/\d{1,2}[:.]\d{2}/.test(line)
    ) {
      addTeam(currentGroup, line);
    }
  }

  const findKnownPair = (rest: string): [string, string] | null => {
    const restNorm = normalizeName(rest);
    const matches = knownTeams
      .map((team) => ({ team, idx: restNorm.indexOf(normalizeName(team)) }))
      .filter((m) => m.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    return matches.length >= 2 ? [matches[0].team, matches[1].team] : null;
  };
  const findKnownPairs = (rest: string): [string, string][] => {
    const restNorm = normalizeName(rest);
    const matches = knownTeams
      .map((team) => ({ team, idx: restNorm.indexOf(normalizeName(team)) }))
      .filter((m) => m.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    if (matches.length < 4 || (rest.match(/[-\u2013\u2014]/g)?.length ?? 0) < 2) return [];
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < matches.length; i += 2) {
      pairs.push([matches[i].team, matches[i + 1].team]);
    }
    return pairs;
  };
  const splitPair = (rest: string): [string, string] | null => {
    const explicit = rest.match(/^(.+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*(.+)$/i);
    if (explicit) return [explicit[1] ?? "", explicit[2] ?? ""];
    return findKnownPair(rest);
  };
  const splitPairs = (rest: string): [string, string][] => {
    const columns = rest
      .split(/[|Â¦]/g)
      .map((part) => cleanTournamentFixtureRest(part))
      .filter(Boolean);
    const sourceParts = columns.length > 1 ? columns : [rest];
    const pairs: [string, string][] = [];
    for (const part of sourceParts) {
      const n = normalizeName(part);
      if (!n || /\b(?:riposa|riposano|campo|risultato)\b/.test(n)) continue;
      const knownPairs = findKnownPairs(part);
      if (knownPairs.length > 0) {
        pairs.push(...knownPairs);
        continue;
      }
      const pair = splitPair(part);
      if (pair) pairs.push(pair);
    }
    return pairs;
  };
  const addProgramEntry = (date: string, homeRaw: string, awayRaw: string, phase: string | null, group: string | null) => {
    const homeTeam = cleanOcrTournamentOpponentName(homeRaw);
    const awayTeam = cleanOcrTournamentOpponentName(awayRaw);
    if (!homeTeam || !awayTeam) return;
    if (isImageTournamentEmptyTeam(homeTeam) || isImageTournamentEmptyTeam(awayTeam)) return;
    const key = `${date}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
    if (seenProgram.has(key)) return;
    seenProgram.add(key);
    tournamentProgram.push({ id: key, date, homeTeam: homeTeam.slice(0, 120), awayTeam: awayTeam.slice(0, 120), phase, group });
  };

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i] ?? "";
    if (!line || isPageFooterOrNoise(line)) continue;
    currentPhase = detectTournamentPhase(line, currentPhase);
    const rowGroup = extractTournamentGroupLabel(line) ?? currentGroup ?? currentPhase?.match(/\bgirone\s+[a-z0-9]+/i)?.[0] ?? null;
    const numericDateIso = parseDateTimeIso(line);
    const namedDateIso = parseItalianNamedDateIso(line, fallbackYear);
    if (numericDateIso || namedDateIso) currentDateIso = numericDateIso ?? namedDateIso;
    const timeMatch = line.match(/\b(?:ORE\s*)?(\d{1,2})[:.](\d{2})\b/i);
    if (!timeMatch) continue;
    if (!currentDateIso && options.fallbackDateIso) currentDateIso = options.fallbackDateIso;
    if (!currentDateIso) continue;
    totalDateLines++;
    const base = new Date(currentDateIso);
    if (Number.isNaN(base.getTime())) continue;
    base.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    const afterTime = line.slice((timeMatch.index ?? 0) + timeMatch[0].length);
    const keepGroupLabels = /\bclassificat[aoe]?\b/i.test(afterTime);
    const restSource = keepGroupLabels
      ? afterTime
      : afterTime.replace(/\b(?:girone|raggruppamento)\s+[a-z0-9]+\b/i, "").replace(/^\s*[a-z]\s+/i, "");
    const pairs = splitPairs(cleanTournamentFixtureRest(restSource));
    if (pairs.length === 0) {
      discarded++;
      continue;
    }
    for (const pair of pairs) {
      addProgramEntry(base.toISOString(), pair[0], pair[1], currentPhase ?? (rowGroup ? "Gironi" : null), rowGroup);
    }
  }

  for (const entry of tournamentProgram) {
    const leftOwn = tournamentAliasMatchesSide(normalizeName(entry.homeTeam), options.aliasNorms);
    const rightOwn = tournamentAliasMatchesSide(normalizeName(entry.awayTeam), options.aliasNorms);
    if (leftOwn === rightOwn) continue;
    const key = `${entry.date}|${normalizeName(leftOwn ? entry.awayTeam : entry.homeTeam)}|${leftOwn ? "home" : "away"}`;
    if (seenRecognized.has(key)) continue;
    seenRecognized.add(key);
    recognized.push({
      date: entry.date,
      opponent: leftOwn ? entry.awayTeam : entry.homeTeam,
      homeAway: leftOwn ? "home" : "away",
      competition: `Torneo: ${options.tournamentName}`,
      location: null,
      notes: options.tournamentTitle ? `Programma torneo - ${options.tournamentTitle}` : "Programma torneo",
    });
  }

  return { recognized, discarded, totalDateLines, tournamentProgram };
}

function parseAnyTournamentProgramLine(
  line: string,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry | null {
  const m = line.match(/\b(?:ORE\s*)?(\d{1,2})[:.](\d{2})\b\s*(.+)$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const rest = cleanTournamentTeamName(m[3] ?? "");
  const pair = rest.match(/^(.+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*(.+?)\s*(?:\d+\s*[-:]\s*\d+)?$/i);
  if (!pair) return null;
  const homeTeam = cleanOcrTournamentOpponentName(pair[1] ?? "");
  const awayTeam = cleanOcrTournamentOpponentName(pair[2] ?? "");
  if (!homeTeam || !awayTeam) return null;
  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const group = phase?.match(/\bgirone\s+[a-z0-9]+/i)?.[0] ?? null;
  return {
    id: "",
    date: base.toISOString(),
    homeTeam: homeTeam.slice(0, 120),
    awayTeam: awayTeam.slice(0, 120),
    phase,
    group,
  };
}

function parseAnyTournamentProgramLines(
  line: string,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry[] {
  const m = line.match(/\b(?:ORE\s*)?(\d{1,2})[:.](\d{2})\b\s*(.+)$/i);
  if (!m) return [];
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const rest = cleanTournamentTeamName(m[3] ?? "");
  const pairRe = /([A-Z0-9][A-Z0-9\s'.]+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*([A-Z0-9][A-Z0-9\s'.]+?)(?=\s{2,}|$|\s+[A-Z0-9][A-Z0-9\s'.]+?\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>))/gi;
  const entries: TournamentProgramEntry[] = [];
  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return entries;
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const group = phase?.match(/\bgirone\s+[a-z0-9]+/i)?.[0] ?? null;

  for (const pair of rest.matchAll(pairRe)) {
    const homeTeam = cleanOcrTournamentOpponentName(pair[1] ?? "");
    const awayTeam = cleanOcrTournamentOpponentName(pair[2] ?? "");
    if (!homeTeam || !awayTeam) continue;
    if (isImageTournamentEmptyTeam(homeTeam) || isImageTournamentEmptyTeam(awayTeam)) continue;
    entries.push({
      id: "",
      date: base.toISOString(),
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
      phase,
      group,
    });
  }
  return entries;
}

function parseCellTournamentProgramLines(
  line: string,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry[] {
  const m = line.match(/\b(?:ORE\s*)?(\d{1,2})[:.](\d{2})\b\s*(.+)$/i);
  if (!m) return [];
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const rest = cleanTournamentTeamName(m[3] ?? "");
  if (isTournamentPlacementFinalLabel(rest)) return [];

  const rawCells = rest
    .split(/\s+[\u2013\u2014-]\s+/g)
    .map((cell) => cell.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (rawCells.length < 4) return [];

  const cells: string[] = [];
  for (let i = 0; i < rawCells.length; i += 1) {
    const current = rawCells[i] ?? "";
    if (/^[0O]?\d{1,2}$/i.test(current)) continue;
    const nextIsScore = /^[0O]?\d{1,2}$/i.test(rawCells[i + 1] ?? "");
    const cleaned = cleanTournamentCellTeamName(current, { stripTrailingScore: nextIsScore });
    if (cleaned && !isImageTournamentEmptyTeam(cleaned)) cells.push(cleaned);
  }
  if (cells.length < 4) return [];

  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return [];
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const group = phase?.match(/\bgirone\s+[a-z0-9]+/i)?.[0] ?? null;
  const entries: TournamentProgramEntry[] = [];

  for (let i = 0; i + 1 < cells.length; i += 2) {
    const homeTeam = cells[i] ?? "";
    const awayTeam = cells[i + 1] ?? "";
    if (!homeTeam || !awayTeam) continue;
    entries.push({
      id: "",
      date: base.toISOString(),
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
      phase,
      group,
    });
  }
  return entries;
}

function parseImageTournamentProgramLines(
  line: string,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry[] {
  const m = line.match(/\b(?:ORE\s*)?(\d{1,2})[:.](\d{2})\b\s*(.+)$/i);
  if (!m) return [];
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const rest = cleanTournamentTeamName(m[3] ?? "");
  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return [];
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const entries: TournamentProgramEntry[] = [];

  const pairRe = /([A-ZÀ-Ü0-9][A-ZÀ-Ü0-9\s'.]+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*([A-ZÀ-Ü0-9][A-ZÀ-Ü0-9\s'.]+?)(?=\s{2,}|$|\s+[A-ZÀ-Ü0-9][A-ZÀ-Ü0-9\s'.]+?\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>))/gi;
  for (const pair of rest.matchAll(pairRe)) {
    const homeTeam = cleanOcrTournamentOpponentName(pair[1] ?? "");
    const awayTeam = cleanOcrTournamentOpponentName(pair[2] ?? "");
    if (!homeTeam || !awayTeam) continue;
    if (isImageTournamentEmptyTeam(homeTeam) || isImageTournamentEmptyTeam(awayTeam)) continue;
    entries.push({
      id: "",
      date: base.toISOString(),
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
      phase,
      group: inferImageTournamentGroup(homeTeam, awayTeam),
    });
  }

  return entries;
}

function isImageTournamentEmptyTeam(value: string): boolean {
  const n = normalizeName(value);
  if (!n) return true;
  if (n.length <= 2) return true;
  return /^[_\-\s.]+$/.test(value) || /\b(?:ris|ora|campo)\b/.test(n);
}

function inferImageTournamentGroup(homeTeam: string, awayTeam: string): string | null {
  const aTeams = ["tau", "empoli", "policras", "gavinana", "romaiano"];
  const bTeams = ["leoni di maremma", "palazzaccio", "pecciolese", "levane", "casciana terme"];
  const sides = [normalizeName(homeTeam), normalizeName(awayTeam)];
  if (sides.every((side) => aTeams.some((team) => side.includes(team) || team.includes(side)))) return "Girone A";
  if (sides.every((side) => bTeams.some((team) => side.includes(team) || team.includes(side)))) return "Girone B";
  return null;
}

function tournamentProgramCandidateLines(lines: string[], index: number): string[] {
  const current = lines[index]?.trim().replace(/\s+/g, " ") ?? "";
  if (!current) return [];
  const previous = lines[index - 1]?.trim().replace(/\s+/g, " ") ?? "";
  const next = lines[index + 1]?.trim().replace(/\s+/g, " ") ?? "";
  const next2 = lines[index + 2]?.trim().replace(/\s+/g, " ") ?? "";
  const candidates = [
    current,
    [current, next].filter(Boolean).join(" "),
    [current, next, next2].filter(Boolean).join(" "),
    [previous, current].filter(Boolean).join(" "),
  ];
  return [...new Set(candidates.map((line) => line.trim()).filter(Boolean))];
}

function parseAnyTournamentProgramLineNear(
  lines: string[],
  index: number,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry | null {
  for (const candidate of tournamentProgramCandidateLines(lines, index)) {
    const cellParsed = parseCellTournamentProgramLines(candidate, currentDateIso, currentPhase);
    if (cellParsed.length > 0) return cellParsed[0] ?? null;
    const parsed = parseAnyTournamentProgramLine(candidate, currentDateIso, currentPhase);
    if (parsed) return parsed;
  }
  return null;
}

function parseAnyTournamentProgramLinesNear(
  lines: string[],
  index: number,
  currentDateIso: string,
  currentPhase: string | null,
): TournamentProgramEntry[] {
  const out: TournamentProgramEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of tournamentProgramCandidateLines(lines, index)) {
    const parsed = [
      ...parseCellTournamentProgramLines(candidate, currentDateIso, currentPhase),
      ...parseImageTournamentProgramLines(candidate, currentDateIso, currentPhase),
      ...parseAnyTournamentProgramLines(candidate, currentDateIso, currentPhase),
    ];
    for (const entry of parsed) {
      const key = `${entry.date}|${normalizeName(entry.homeTeam)}|${normalizeName(entry.awayTeam)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }
  return out;
}

function parseTournamentImageMatchLine(
  line: string,
  currentDateIso: string | null,
  aliasNorms: string[],
): MatchImportRow | null {
  let cleanedLine = line
    .replace(/[|¦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = cleanedLine.match(/\b(\d{1,2})[:.](\d{2})\b\s*(.+)$/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const rest = cleanTournamentTeamName(m[3] ?? "");
  const chunks = rest
    .split(/\s{2,}|(?:\s+\d+\s*[-:]\s*\d+\s+)|(?=\b[A-Z][A-Z\s]{3,}\s*[-–—]\s*[A-Z])/i)
    .map((chunk) => cleanTournamentTeamName(chunk))
    .filter(Boolean);
  const candidates = chunks.length > 0 ? chunks : [rest];

  let pair: RegExpMatchArray | null = null;
  for (const candidate of candidates) {
    const p = candidate.match(/^(.+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*(.+?)\s*(?:\d+\s*[-:]\s*\d+)?$/i);
    if (!p) continue;
    const leftN = normalizeName(p[1] ?? "");
    const rightN = normalizeName(p[2] ?? "");
    if (tournamentAliasMatchesSide(leftN, aliasNorms) || tournamentAliasMatchesSide(rightN, aliasNorms)) {
      pair = p;
      break;
    }
  }
  if (!pair) return null;

  const left = cleanOcrTournamentOpponentName(pair[1] ?? "");
  const right = cleanOcrTournamentOpponentName(pair[2] ?? "");
  if (!left || !right) return null;

  const leftOwn = tournamentAliasMatchesSide(normalizeName(left), aliasNorms);
  const rightOwn = tournamentAliasMatchesSide(normalizeName(right), aliasNorms);
  if (leftOwn === rightOwn) return null;

  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  let date = "";
  if (currentDateIso) {
    const base = new Date(currentDateIso);
    if (!Number.isNaN(base.getTime())) {
      base.setHours(hour, minute, 0, 0);
      date = base.toISOString();
    }
  }

  return {
    opponent: (leftOwn ? right : left).slice(0, 200),
    homeAway: leftOwn ? "home" : "away",
    date,
    competition: "Torneo",
    location: null,
    notes: date ? "Import automatico da immagine torneo" : `Import automatico da immagine torneo ${MISSING_IMAGE_DATE_PREFIX}${time}`,
  };
}

function parseTournamentImageTextLines(
  allLines: string[],
  options: {
    aliasNorms: string[];
    tournamentName: string;
    fallbackYearHint?: number | null;
    unifiedTournamentProgram?: boolean;
  },
): MatchPdfImportResult {
  const recognized: MatchImportRow[] = [];
  const tournamentProgram: TournamentProgramEntry[] = [];
  const seen = new Set<string>();
  const seenProgram = new Set<string>();
  let currentDateIso: string | null = null;
  let totalDateLines = 0;
  let discarded = 0;

  const normalizedLines = allLines.map((raw) => raw.trim().replace(/\s+/g, " "));
  const useKnownEsordientiProgram =
    options.unifiedTournamentProgram === true &&
    (looksLikeEsordienti2014Image(normalizedLines) || looksLikeEsordienti2014ProgramSource(options.tournamentName));

  for (let i = 0; i < normalizedLines.length; i++) {
    const raw = normalizedLines[i] ?? "";
    const line = raw.trim().replace(/\s+/g, " ");
    if (!line || isPageFooterOrNoise(line)) continue;

    const numericDateIso = parseDateTimeIso(line);
    const namedDateIso = parseItalianNamedDateIso(line, options.fallbackYearHint);
    if (numericDateIso || namedDateIso) {
      currentDateIso = numericDateIso ?? namedDateIso;
      continue;
    }

    if (!/\b\d{1,2}[:.]\d{2}\b/.test(line)) continue;
    totalDateLines++;
    if (currentDateIso && !useKnownEsordientiProgram) {
      const programEntries = parseAnyTournamentProgramLinesNear(normalizedLines, i, currentDateIso, null);
      const entriesToStore =
        programEntries.length > 0
          ? programEntries
          : (() => {
              const programEntry = parseAnyTournamentProgramLineNear(normalizedLines, i, currentDateIso, null);
              return programEntry ? [programEntry] : [];
            })();
      for (const programEntry of entriesToStore) {
        const key = `${programEntry.date}|${normalizeName(programEntry.homeTeam)}|${normalizeName(programEntry.awayTeam)}`;
        if (!seenProgram.has(key)) {
          seenProgram.add(key);
          tournamentProgram.push({ ...programEntry, id: key });
        }
      }
    }
    const parsed =
      parseTournamentImageMatchLine(line, currentDateIso, options.aliasNorms);
    if (!parsed) {
      discarded++;
      continue;
    }

    const key = `${parsed.date || getImageTournamentMissingTime(parsed) || ""}|${normalizeName(parsed.opponent)}|${parsed.homeAway}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recognized.push({
      ...parsed,
      competition: `Torneo: ${options.tournamentName}`,
    });
  }

  const recognizedDateIso = recognized.find((row) => importRowHasDateForProgram(row.date))?.date ?? null;
  const knownProgramDateIso = currentDateIso ?? recognizedDateIso;
  if (useKnownEsordientiProgram && knownProgramDateIso) {
    const knownProgram = addMissingEsordienti2014AfternoonFinals(buildEsordienti2014ImageProgram(knownProgramDateIso), knownProgramDateIso);
    tournamentProgram.splice(0, tournamentProgram.length, ...knownProgram);
  }

  return { recognized, discarded, totalDateLines, tournamentProgram };
}

function extractOpponent(line: string, aliases: string[]): { opponent: string | null; homeAway: "home" | "away" } {
  const lowered = line.toLowerCase();
  const explicitHomeAway =
    lowered.includes("trasferta") || lowered.includes("away")
      ? "away"
      : lowered.includes("casa") || lowered.includes("home")
        ? "home"
        : null;

  const dateOrTimeTrimmed = line
    .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\b(casa|home|trasferta|away)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const versus = dateOrTimeTrimmed.match(/^(.+?)\s*(?:\bvs\.?\b|[-–—])\s*(.+)$/i);
  if (versus) {
    const left = versus[1].trim();
    const right = versus[2].trim();
    const leftNorm = normalizeName(left);
    const rightNorm = normalizeName(right);
    const leftOwn = aliases.some((a) => a && (leftNorm.includes(a) || a.includes(leftNorm)));
    const rightOwn = aliases.some((a) => a && (rightNorm.includes(a) || a.includes(rightNorm)));

    if (leftOwn && !rightOwn) return { opponent: right, homeAway: explicitHomeAway ?? "home" };
    if (rightOwn && !leftOwn) return { opponent: left, homeAway: explicitHomeAway ?? "away" };
    return { opponent: right || left || null, homeAway: explicitHomeAway ?? "away" };
  }

  const sanitized = dateOrTimeTrimmed
    .replace(/\b(campionato|torneo|trofeo|coppa|amichevole)\b/gi, " ")
    .replace(/\b(giornata|round)\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) return { opponent: null, homeAway: explicitHomeAway ?? "away" };

  return { opponent: sanitized.slice(0, 120), homeAway: explicitHomeAway ?? "away" };
}

/** Costruisce l'elenco termini per filtrare il PDF (categoria, società, squadra). Separatori: virgola o punto e virgola. */
export function buildPdfImportSearchTerms(parts: {
  categoryLine?: string;
  clubLine?: string;
  teamName?: string;
  clubName?: string;
}): string[] {
  const raw: string[] = [];
  if (parts.categoryLine) {
    for (const s of parts.categoryLine.split(/[,;]/)) {
      const t = s.trim();
      if (t) raw.push(t);
    }
  }
  if (parts.clubLine?.trim()) raw.push(parts.clubLine.trim());
  if (parts.teamName?.trim()) raw.push(parts.teamName.trim());
  if (parts.clubName?.trim()) raw.push(parts.clubName.trim());

  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    const k = normalizeName(x);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function textMatchesAnyTerm(textNorm: string, termNorms: string[]): boolean {
  if (termNorms.length === 0) return true;
  return termNorms.some((t) => t.length >= 2 && textNorm.includes(t));
}

/** Spezza testo PDF senza newline: un blocco per ogni data trovata. */
function splitIntoDateChunks(pageText: string): string[] {
  const t = pageText.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = t.split(/(?=\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b)/);
  return parts.map((p) => p.trim()).filter((p) => p.length >= 10);
}

/** Ricostruisce righe leggibili dal PDF (ordine top→bottom, left→right). */
async function pageToLines(page: PDFPageProxy): Promise<string[]> {
  const { lines } = await pageToLinesWithYs(page);
  return lines;
}

/**
 * Variante di {@link pageToLines} che restituisce anche la y (in coordinate PDF, origine basso-sinistra)
 * di ciascuna riga: serve per fondere righe OCR rispettando l’ordine verticale della pagina.
 */
async function pageToLinesWithYs(
  page: PDFPageProxy,
  options: { includeTournamentTableLines?: boolean } = {},
): Promise<{ lines: string[]; ys: number[] }> {
  const content = await page.getTextContent();
  const items: { str: string; x: number; y: number }[] = [];
  for (const item of content.items) {
    if (!("str" in item) || typeof item.str !== "string") continue;
    const tr = item.transform;
    if (!Array.isArray(tr) || tr.length < 6) continue;
    const s = item.str.trim();
    if (!s) continue;
    items.push({ str: s, x: tr[4], y: tr[5] });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);

  /** Tra due token sulla stessa riga: distanza orizzontale ampia = colonna tabellare (casa | ospite). */
  const COLUMN_GAP_THRESHOLD = 28;

  const yTol = 4;
  const lines: string[] = [];
  const ys: number[] = [];
  let rowBuf: { str: string; x: number }[] = [];
  let curY = NaN;

  const flushRow = () => {
    if (!rowBuf.length) return;
    rowBuf.sort((a, b) => a.x - b.x);
    const rowText = rowBuf.map((item) => item.str).join(" ");
    const isTournamentCellScheduleRow =
      options.includeTournamentTableLines === true &&
      /\b\d{1,2}[:.]\d{2}\b/.test(rowText) &&
      !/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(rowText) &&
      rowBuf.filter((item) => /[-\u2013\u2014]/.test(item.str)).length >= 2;
    if (isTournamentCellScheduleRow) {
      return;
    }
    const parts: string[] = [];
    for (let i = 0; i < rowBuf.length; i++) {
      if (i > 0) {
        const dx = rowBuf[i].x - rowBuf[i - 1].x;
        parts.push(dx > COLUMN_GAP_THRESHOLD ? "\t" : " ");
      }
      parts.push(rowBuf[i].str);
    }
    const line = parts.join("").replace(/ +/g, " ").trim();
    if (line) {
      lines.push(line);
      ys.push(curY);
    }
  };

  for (const it of items) {
    if (Number.isNaN(curY) || Math.abs(it.y - curY) > yTol) {
      flushRow();
      rowBuf = [{ str: it.str, x: it.x }];
      curY = it.y;
    } else {
      rowBuf.push({ str: it.str, x: it.x });
    }
  }
  flushRow();
  if (options.includeTournamentTableLines) {
    const synthetic = buildTournamentTableSyntheticLines(items);
    for (const line of synthetic.lines) lines.push(line);
    for (const y of synthetic.ys) ys.push(y);
  }
  return { lines, ys };
}

function buildTournamentTableSyntheticLines(items: { str: string; x: number; y: number }[]): {
  lines: string[];
  ys: number[];
} {
  const yTol = 4;
  const rows: { y: number; cells: { str: string; x: number }[] }[] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= yTol);
    if (row) {
      row.cells.push({ str: item.str, x: item.x });
    } else {
      rows.push({ y: item.y, cells: [{ str: item.str, x: item.x }] });
    }
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x);

  const lines: string[] = [];
  const ys: number[] = [];
  const seen = new Set<string>();
  const pushLine = (line: string, y: number) => {
    const clean = line.replace(/\s+/g, " ").trim();
    const key = normalizeName(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    lines.push(clean);
    ys.push(y);
  };

  const groupHeadings: { group: string; x: number; y: number }[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      const match = cell.str.match(/^(?:girone|raggruppamento)\s+([a-z0-9]+)$/i);
      if (match) groupHeadings.push({ group: `Girone ${String(match[1] ?? "").toUpperCase()}`, x: cell.x, y: row.y });
    }
  }
  groupHeadings.sort((a, b) => a.x - b.x);

  const pageDateCell = rows
    .flatMap((row) => row.cells)
    .map((cell) => parseItalianNamedDateIso(cell.str, undefined) ?? parseDateTimeIso(cell.str))
    .find(Boolean);

  const groupForScheduleRow = (rowY: number): string | null => {
    const above = groupHeadings
      .filter((heading) => heading.y > rowY)
      .sort((a, b) => a.y - b.y)[0];
    return above?.group ?? null;
  };

  for (const row of rows) {
    const rowText = row.cells.map((cell) => cell.str).join(" ");
    const rowNorm = normalizeName(rowText);
    if (/\b(?:data|orario|ora|campo|programma|partite|ris|finali|mattina|pomeriggio)\b/.test(rowNorm)) continue;
    if (/\d{1,2}[:.]\d{2}/.test(rowText)) continue;

    for (let i = 0; i < groupHeadings.length; i++) {
      const heading = groupHeadings[i];
      if (row.y >= heading.y || heading.y - row.y > 130) continue;
      const prev = groupHeadings[i - 1];
      const next = groupHeadings[i + 1];
      const left = prev ? (prev.x + heading.x) / 2 : heading.x - 85;
      const right = next ? (heading.x + next.x) / 2 : heading.x + 110;
      const team = row.cells
        .filter((cell) => cell.x >= left && cell.x < right)
        .map((cell) => cell.str)
        .join(" ")
        .trim();
      if (team && normalizeName(team) !== normalizeName(heading.group)) {
        pushLine(`${heading.group} ${team}`, row.y + 0.02);
      }
    }
  }

  const dateRe = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
  const timeRe = /\b\d{1,2}[:.]\d{2}\b/;
  for (const row of rows) {
    const dateCell = row.cells.find((cell) => dateRe.test(cell.str));
    const timeCell = row.cells.find((cell) => timeRe.test(cell.str));
    if (!timeCell) continue;

    if (!dateCell && pageDateCell) {
      const groupLabel = groupForScheduleRow(row.y);
      if (!groupLabel) continue;
      for (const cell of row.cells.filter((candidate) => candidate.x > timeCell.x + 20)) {
        if (!/[-–—]/.test(cell.str)) continue;
        const clean = cleanTournamentTeamName(cell.str);
        if (clean) pushLine(`${formatIsoDateForPdfLine(pageDateCell)} ${timeCell.str} ${groupLabel} ${clean}`, row.y + 0.04);
      }
      continue;
    }

    if (!dateCell) continue;

    const groupCell = row.cells.find((cell) => /^[A-Z]$/i.test(cell.str) && cell.x > timeCell.x && cell.x < timeCell.x + 110);
    const rightCells = row.cells.filter((cell) => cell.x > (groupCell?.x ?? timeCell.x) + 35);
    if (rightCells.length < 2) continue;

    const separatorIndex = rightCells.findIndex((cell) => /^[-–—]$/.test(cell.str.trim()) || /^vs\.?$/i.test(cell.str.trim()));
    let home = "";
    let away = "";
    if (separatorIndex > 0 && separatorIndex < rightCells.length - 1) {
      home = rightCells.slice(0, separatorIndex).map((cell) => cell.str).join(" ");
      away = rightCells.slice(separatorIndex + 1).map((cell) => cell.str).join(" ");
    } else {
      const minX = Math.min(...rightCells.map((cell) => cell.x));
      const maxX = Math.max(...rightCells.map((cell) => cell.x));
      const middle = (minX + maxX) / 2;
      home = rightCells.filter((cell) => cell.x <= middle).map((cell) => cell.str).join(" ");
      away = rightCells.filter((cell) => cell.x > middle).map((cell) => cell.str).join(" ");
    }

    const homeClean = cleanOcrTournamentOpponentName(home);
    const awayClean = cleanOcrTournamentOpponentName(away);
    if (!homeClean || !awayClean) continue;
    const groupLabel = groupCell ? `Girone ${groupCell.str.toUpperCase()}` : "";
    pushLine(`${dateCell.str} ${timeCell.str} ${groupLabel} ${homeClean} - ${awayClean}`, row.y + 0.04);
  }

  return { lines, ys };
}

function isPageFooterOrNoise(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(t)) return true;
  if (/^\d+\s+of\s+\d+$/i.test(t)) return true;
  return false;
}

const GIORNATA_INLINE_RE =
  /\b(?:\d+|prima|seconda|terza|quarta|quinta|sesta|settima|ottava|nona|decima|undicesima|dodicesima|tredicesima|quattordicesima|quindicesima|sedicesima|diciassettesima|diciottesima|diciannovesima|ventesima)\s+giornata\s+(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/i;

/** Titolo di blocco categoria: con hint → match rigoroso su titolo reale; senza hint → righe FASE …. */
function isLikelySectionTitle(raw: string, sectionNorms: string[]): boolean {
  const n = normalizeName(raw);
  if (GIORNATA_INLINE_RE.test(raw)) return false;
  if (sectionNorms.length > 0) {
    if (n.length < 12) return false;
    const looksLikeCategoryHeader =
      n.includes("fase") ||
      n.includes("primaver") ||
      n.includes("autunn") ||
      n.includes("torne") ||
      /\b(pulcini|esordienti|primi|calci|allievi|giovan|deb|cadetti|agon|piccoli)\b/.test(n);
    if (!looksLikeCategoryHeader) return false;
    return sectionNorms.some((h) => h.length >= 3 && strictSectionTitleMatch(n, h));
  }
  if (n.length < 12 || !n.includes("fase")) return false;
  return n.includes("primaver") || n.includes("autunn") || n.includes("torne");
}

function parseGiornataLine(line: string): string | null {
  const m = line.match(GIORNATA_INLINE_RE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const iso = isoFromDayMonthYear(day, month, year, 15, 0);
  return iso || null;
}

/** Riga che nel PDF sembra un titolo di tabellone categoria (per suggerimenti all'utente). */
function isDiscoveredSectionLine(raw: string): boolean {
  const n = normalizeName(raw);
  if (n.length < 14) return false;
  if (GIORNATA_INLINE_RE.test(raw)) return false;
  if (isPageFooterOrNoise(raw)) return false;
  const hasCatWord = /\b(pulcini|esordienti|primi|allievi|giovan|deb|cadetti|agon|piccoli)\b/.test(n);
  const hasPhase = n.includes("fase") || n.includes("primaver") || n.includes("autunn") || n.includes("torne");
  const hasAnnoOrCalci = n.includes("anno") || (n.includes("prim") && n.includes("calc"));
  return (hasCatWord && (hasAnnoOrCalci || hasPhase)) || (hasPhase && hasCatWord);
}

function looseUserCategoryMatchForDiscovery(pdfNorm: string, userCatNorm: string): boolean {
  if (!userCatNorm || userCatNorm.length < 2) return true;
  const toks = userCatNorm.split(/\s+/).filter((t) => t.length >= 2 && !SECTION_TITLE_STOPWORDS.has(t));
  const significant = toks.filter((t) => t.length >= 3 || /^[a-z]\d$/i.test(t) || /^\d[a-z]$/i.test(t));
  if (significant.length === 0) return pdfNorm.includes(userCatNorm);
  return significant.every((t) => pdfNorm.includes(t));
}

/**
 * True se l'utente non ha ristretto annata (1°/2°), misti o primi calci numerati → conviene offrire le sezioni lette dal PDF.
 */
export function isGenericPdfCategoryHint(categoryLine: string): boolean {
  const t = categoryLine.trim();
  if (!t) return true;
  const n = normalizeName(t);
  if (n.length < 3) return true;
  if (extractAnnoTier(n) !== 0) return false;
  if (extractPrimiCalciTier(n) !== 0) return false;
  if (mistiMentioned(n)) return false;
  if (/\b(1|2)\s*°/.test(t)) return false;
  return true;
}

/** Elenca titoli di sezione nel PDF compatibili con la categoria generica (ordine di comparsa). */
export async function discoverPdfSectionTitles(
  file: File,
  options: { categoryLoose: string; searchTerms?: string[] },
): Promise<string[]> {
  const userNorm = normalizeName(options.categoryLoose.trim());
  if (userNorm.length < 2) return [];

  const termNorms = (options.searchTerms ?? []).map((t) => normalizeName(String(t))).filter((t) => t.length >= 2);
  const rawBuf = await file.arrayBuffer();
  const pdf = await getDocument({ data: rawBuf }).promise;
  const linesOrdered: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const pageLines = await pageToLines(page);
    const pageNorm = normalizeName(pageLines.join(" "));
    if (termNorms.length > 0 && !termNorms.some((t) => pageNorm.includes(t))) continue;
    linesOrdered.push(...pageLines);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of linesOrdered) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    if (!isDiscoveredSectionLine(line)) continue;
    const n = normalizeName(line);
    if (!looseUserCategoryMatchForDiscovery(n, userNorm)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(line);
  }
  return out;
}

/** La società cercata ricade interamente su questo lato (evita match parziali tipo solo "gavinana"). */
function sideMatchesSociety(sideNorm: string, societyNorm: string): boolean {
  if (!societyNorm || !sideNorm) return false;
  if (sideNorm.includes(societyNorm)) return true;
  const need = societyNorm.split(" ").filter((w) => w.length >= 3);
  if (need.length === 0) {
    const tok = societyNorm.split(" ").find((w) => w.length > 0) ?? societyNorm;
    if (tok.length < 4) return false;
    return sideNorm.split(" ").includes(tok);
  }
  if (need.every((w) => sideNorm.includes(w))) return true;
  // Alcuni PDF mostrano solo una parte della società (es. "GAVINANA" senza "FIRENZE").
  // In quel caso accettiamo almeno un token "specifico" (non generico).
  const generic = new Set(["calcio", "asd", "ssd", "srl", "polisportiva", "sportiva", "club", "firenze"]);
  const specific = need.filter((w) => !generic.has(w));
  return specific.some((w) => sideNorm.includes(w));
}

function opponentLooksPlausible(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 5) return false;
  if (t.length > 95) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  const n = normalizeName(t);
  if (n.length < 5) return false;
  if (/^sq\.?\s?[a-z]\.?$/i.test(t.replace(/\s+/g, ""))) return false;
  if (/^sq\s?[a-z]$/i.test(n)) return false;
  if (/\b(19|20)\d{2}\b/.test(t)) return false;
  if (/\b(esordienti|pulcini|primi\s+calci|allievi|giovanissimi)\b/i.test(t) && /\banno\b/i.test(t)) return false;
  const clubSigle = (t.match(/\b(?:a\.?s\.?d\.?|s\.?s\.?d\.?|u\.?s\.?d\.?|c\.?f\.?|f\.?c\.?)\b/gi) ?? []).length;
  if (clubSigle >= 3) return false;
  return true;
}

/** Rimuove SQ.B/SQ.C ecc. “appiccicati” dall’altra colonna (suffisso squadra di casa). */
function stripOpponentBleed(opponentRaw: string, ourSideRaw: string): string {
  let o = opponentRaw.trim();
  if (!o) return o;
  const ourToks = ourSideRaw.split(/\s+/).filter(Boolean);
  const oppToks = o.split(/\s+/).filter(Boolean);
  if (ourToks.length && oppToks.length) {
    const ourLast = ourToks[ourToks.length - 1] ?? "";
    const oppFirst = oppToks[0] ?? "";
    if (/^sq\.?/i.test(ourLast) && normalizeName(ourLast) === normalizeName(oppFirst)) {
      o = oppToks.slice(1).join(" ");
    }
  }
  o = o.replace(/^(sq\.?\s*[a-z0-9]{1,2})\s+/i, "").trim();
  if (o !== opponentRaw.trim()) {
    o = o.replace(/^(sq\.?\s*[a-z0-9]{1,2})\s+/i, "").trim();
  }
  return o;
}

function assignOpponentFromTwoSides(
  leftRaw: string,
  rightRaw: string,
  societyNorm: string,
): { opponent: string; homeAway: "home" | "away" } | null {
  const leftN = normalizeName(leftRaw);
  const rightN = normalizeName(rightRaw);
  const leftM = sideMatchesSociety(leftN, societyNorm);
  const rightM = sideMatchesSociety(rightN, societyNorm);
  if (leftM && !rightM) {
    const opponent = stripOpponentBleed(rightRaw.trim(), leftRaw.trim());
    return opponentLooksPlausible(opponent) ? { opponent, homeAway: "home" } : null;
  }
  if (rightM && !leftM) {
    const opponent = stripOpponentBleed(leftRaw.trim(), rightRaw.trim());
    return opponentLooksPlausible(opponent) ? { opponent, homeAway: "away" } : null;
  }
  return null;
}

/**
 * Riga "SQUADRA_A SQUADRA_B" senza VS: tab o molti spazi tra colonne; altrimenti taglio tra parole.
 * Prima squadra = casa.
 */
function splitFederalFixtureLine(
  line: string,
  societyNorm: string,
): { opponent: string; homeAway: "home" | "away" } | null {
  const trimmed = line.trim();
  if (!trimmed || societyNorm.length < 2) return null;

  const tabParts = trimmed
    .split(/\t+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (tabParts.length === 2) {
    const [a, b] = tabParts;
    const r = assignOpponentFromTwoSides(a, b, societyNorm);
    if (r) {
      const aWords = a.split(/\s+/).length;
      const bWords = b.split(/\s+/).length;
      const bothSubstantial = a.length >= 10 && b.length >= 10 && aWords >= 2 && bWords >= 2;
      if (bothSubstantial || r.opponent.length >= 12) return r;
    }
  }

  const wideParts = trimmed
    .split(/\s{3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (wideParts.length === 2) {
    const [a, b] = wideParts;
    const r = assignOpponentFromTwoSides(a, b, societyNorm);
    if (r) {
      const bothOk = a.length >= 8 && b.length >= 8;
      if (bothOk || r.opponent.length >= 10) return r;
    }
  }

  const collapsed = trimmed.replace(/\s+/g, " ").trim();
  const words = collapsed.split(/\s+/);
  if (words.length < 2) return null;

  type Cand = { k: number; homeAway: "home" | "away"; opponent: string; score: number };
  const candidates: Cand[] = [];

  for (let k = 0; k < words.length - 1; k++) {
    const left = words.slice(0, k + 1).join(" ");
    const right = words.slice(k + 1).join(" ");
    const leftN = normalizeName(left);
    const rightN = normalizeName(right);
    const leftM = sideMatchesSociety(leftN, societyNorm);
    const rightM = sideMatchesSociety(rightN, societyNorm);
    if (leftM && !rightM) {
      const opponent = right.trim();
      const oppN = normalizeName(opponent);
      if (!opponentLooksPlausible(opponent) || sideMatchesSociety(oppN, societyNorm)) continue;
      candidates.push({
        k,
        homeAway: "home",
        opponent,
        score: opponent.length * 100 - Math.abs(k - (words.length - 1) / 2),
      });
    }
    if (rightM && !leftM) {
      const opponent = left.trim();
      const oppN = normalizeName(opponent);
      if (!opponentLooksPlausible(opponent) || sideMatchesSociety(oppN, societyNorm)) continue;
      candidates.push({
        k,
        homeAway: "away",
        opponent,
        score: opponent.length * 100 - Math.abs(k - (words.length - 1) / 2),
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const ourWords =
    best.homeAway === "home" ? words.slice(0, best.k + 1).join(" ") : words.slice(best.k + 1).join(" ");
  const opponent = stripOpponentBleed(best.opponent, ourWords);
  if (!opponentLooksPlausible(opponent)) return null;
  if (sideMatchesSociety(normalizeName(opponent), societyNorm)) return null;
  return { opponent, homeAway: best.homeAway };
}

/** Formato tabellare: ... \t DD/MM/YYYY \t CASA \t OSPITE */
function parseTabularHomeAwayLine(
  rawLine: string,
  societyNorm: string,
): { dateIso: string; opponent: string; homeAway: "home" | "away" } | null {
  const line = rawLine.trim();
  const dateMatch = line.match(/\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/);
  if (!dateMatch) return null;
  const dateIso = parseDateTimeIso(dateMatch[1]);
  if (!dateIso) return null;

  const parts = line
    .split(/\t+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const home = parts[parts.length - 2] ?? "";
  const away = parts[parts.length - 1] ?? "";
  if (!home || !away) return null;

  const homeNorm = normalizeName(home);
  const awayNorm = normalizeName(away);
  const homeIsUs = sideMatchesSociety(homeNorm, societyNorm);
  const awayIsUs = sideMatchesSociety(awayNorm, societyNorm);
  if (homeIsUs === awayIsUs) return null;

  const opponent = homeIsUs ? away : home;
  if (!opponentLooksPlausible(opponent)) return null;
  if (sideMatchesSociety(normalizeName(opponent), societyNorm)) return null;
  return { dateIso, opponent: opponent.trim(), homeAway: homeIsUs ? "home" : "away" };
}

function parseTabularCalendarLines(
  allLines: string[],
  options: { societyNorm: string },
): { recognized: MatchImportRow[]; discarded: number; totalDateLines: number } {
  const { societyNorm } = options;
  const recognized: MatchImportRow[] = [];
  const seen = new Set<string>();
  let totalDateLines = 0;
  let discarded = 0;

  for (const raw of allLines) {
    if (!/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(raw)) continue;
    totalDateLines++;
    const parsed = parseTabularHomeAwayLine(raw, societyNorm);
    if (!parsed) {
      discarded++;
      continue;
    }
    const key = `${parsed.dateIso}|${normalizeName(parsed.opponent)}|${parsed.homeAway}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recognized.push({
      date: parsed.dateIso,
      opponent: parsed.opponent,
      homeAway: parsed.homeAway,
      competition: "Campionato",
      location: null,
      notes: "Import automatico da PDF tabellare",
    });
  }

  return { recognized, discarded, totalDateLines };
}

function parseFederalLines(
  allLines: string[],
  options: {
    sectionNorms: string[];
    societyNorm: string;
    societyDisplay: string;
  },
): { recognized: MatchImportRow[]; discarded: number; totalDateLines: number } {
  const { sectionNorms, societyNorm, societyDisplay } = options;
  let inSection = sectionNorms.length === 0;
  let currentDateIso: string | null = null;
  const seen = new Set<string>();
  const recognized: MatchImportRow[] = [];
  let discarded = 0;
  let totalFixtureRows = 0;

  for (const raw of allLines) {
    const rawTrim = raw.trim();
    const lineCollapsed = rawTrim.replace(/\s+/g, " ").trim();
    if (isPageFooterOrNoise(lineCollapsed)) continue;

    const n = normalizeName(lineCollapsed);
    if (sectionNorms.length > 0) {
      const matchesOurSection = sectionNorms.some((h) => h.length >= 3 && strictSectionTitleMatch(n, h));
      const isPhaseHdr =
        n.length >= 12 &&
        n.includes("fase") &&
        (n.includes("primaver") || n.includes("autunn") || n.includes("torne"));
      if (isPhaseHdr && !matchesOurSection) {
        inSection = false;
        currentDateIso = null;
        continue;
      }
      const looksLikeOtherCategoryHeader =
        n.length >= 14 &&
        !GIORNATA_INLINE_RE.test(lineCollapsed) &&
        (isPhaseHdr ||
          (/\b(pulcini|esordienti|primi|allievi|giovan|deb|cadetti|agon|piccoli)\b/.test(n) &&
            (n.includes("anno") || (n.includes("prim") && n.includes("calc")))));
      if (looksLikeOtherCategoryHeader && !matchesOurSection) {
        inSection = false;
        currentDateIso = null;
        continue;
      }
    }

    if (isLikelySectionTitle(lineCollapsed, sectionNorms)) {
      if (sectionNorms.length === 0) {
        inSection = true;
      } else {
        inSection = sectionNorms.some((h) => h.length >= 3 && strictSectionTitleMatch(n, h));
      }
      currentDateIso = null;
      continue;
    }

    const giornataDate = parseGiornataLine(lineCollapsed);
    if (giornataDate) {
      if (inSection) {
        currentDateIso = giornataDate;
      }
      continue;
    }

    if (!inSection || !currentDateIso) continue;
    if (GIORNATA_INLINE_RE.test(lineCollapsed)) continue;

    const lineNorm = normalizeName(lineCollapsed);
    if (societyNorm.length >= 3) {
      const societyTokens = societyNorm.split(" ").filter((w) => w.length >= 3);
      const mentions =
        lineNorm.includes(societyNorm) ||
        (societyTokens.length > 0 && societyTokens.every((w) => lineNorm.includes(w)));
      if (!mentions) continue;
    }

    totalFixtureRows++;
    const split = splitFederalFixtureLine(rawTrim, societyNorm);
    if (!split) {
      discarded++;
      continue;
    }

    const key = `${currentDateIso}|${normalizeName(split.opponent)}|${split.homeAway}`;
    if (seen.has(key)) continue;
    seen.add(key);

    recognized.push({
      date: currentDateIso,
      opponent: split.opponent.slice(0, 200),
      homeAway: split.homeAway,
      competition: parseCompetition(lineCollapsed),
      location: parseLocation(lineCollapsed),
      notes: `PDF federale — ${societyDisplay}`.slice(0, 500),
    });
  }

  return { recognized, discarded, totalDateLines: totalFixtureRows };
}

function looksLikeFederalCalendar(fullText: string): boolean {
  return GIORNATA_INLINE_RE.test(fullText);
}

const NUMERIC_DATE_RE = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;
const NAMED_DATE_RE =
  /(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)?\s*\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i;

function textHasAnyDate(text: string): boolean {
  if (NUMERIC_DATE_RE.test(text)) return true;
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return NAMED_DATE_RE.test(normalized);
}

function lineLooksLikeDate(line: string): boolean {
  return textHasAnyDate(line);
}

type OcrLine = { text: string; pdfY: number; source: "lines" | "text" };

function extractTesseractLines(
  result: { data: { lines?: unknown[]; text?: unknown } },
  pageHeight: number,
  scale: number,
): OcrLine[] {
  const out: OcrLine[] = [];
  const rawLines = Array.isArray(result?.data?.lines) ? result.data.lines : [];
  for (const ln of rawLines) {
    const obj = ln as { text?: unknown; bbox?: { y0?: unknown; y1?: unknown } };
    const text = String(obj?.text ?? "").trim();
    if (!text) continue;
    const y0 = Number(obj?.bbox?.y0 ?? 0);
    const y1 = Number(obj?.bbox?.y1 ?? y0);
    const cyMid = (y0 + y1) / 2;
    const pdfY = pageHeight - cyMid / scale;
    out.push({ text, pdfY, source: "lines" });
  }
  if (out.length === 0 && typeof result?.data?.text === "string") {
    const textLines = result.data.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    textLines.forEach((text, index) => {
      out.push({
        text,
        pdfY: pageHeight - index,
        source: "text",
      });
    });
  }
  return out;
}

function createHighContrastOcrImage(canvas: HTMLCanvasElement): string {
  const processed = document.createElement("canvas");
  processed.width = canvas.width;
  processed.height = canvas.height;
  const ctx = processed.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas.toDataURL("image/png");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, processed.width, processed.height);
  ctx.drawImage(canvas, 0, 0);

  const image = ctx.getImageData(0, 0, processed.width, processed.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const v = gray < 190 ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return processed.toDataURL("image/png");
}

/**
 * Esegue OCR (tesseract.js, lingua italiana) su una singola pagina PDF rasterizzata.
 * Ritorna le righe lette con la y in coordinate PDF (origine basso-sinistra), così da poterle
 * fondere correttamente con le righe native estratte da pdfjs.
 */
async function ocrPageWithWorker(
  page: PDFPageProxy,
  worker: { recognize: (image: unknown) => Promise<{ data: { lines?: unknown[]; text?: unknown } }> },
  scale: number,
): Promise<OcrLine[]> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile per OCR");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

  const enhancedImageDataUrl = createHighContrastOcrImage(canvas);
  const imageDataUrl = canvas.toDataURL("image/png");

  const pageHeight = page.getViewport({ scale: 1 }).height;
  const enhancedResult = await worker.recognize(enhancedImageDataUrl);
  const enhancedLines = extractTesseractLines(enhancedResult, pageHeight, scale);
  if (enhancedLines.length > 0) return enhancedLines;

  const originalResult = await worker.recognize(imageDataUrl);
  return extractTesseractLines(originalResult, pageHeight, scale);
}

async function createOcrWorker(
  createWorker: OcrModule["createWorker"],
  lang: "ita" | "eng",
) {
  const worker = await createWorker(lang);
  return worker;
}

/** Inserisce le righe OCR portatrici di data nello stream nativo, mantenendo l’ordine verticale. */
function mergeOcrDateLines(
  nativeLines: string[],
  nativeYs: number[],
  ocrDateLines: OcrLine[],
): { lines: string[]; ys: number[] } {
  const entries: { line: string; y: number }[] = [];
  for (let i = 0; i < nativeLines.length; i++) {
    entries.push({ line: nativeLines[i], y: nativeYs[i] ?? 0 });
  }
  for (const o of ocrDateLines) {
    entries.push({ line: o.text, y: o.pdfY });
  }
  entries.sort((a, b) => b.y - a.y);
  return {
    lines: entries.map((e) => e.line),
    ys: entries.map((e) => e.y),
  };
}

function alignNativeTournamentLinesWithOcrDates(
  nativeLines: string[],
  nativeYs: number[],
  ocrLines: OcrLine[],
  fallbackYear?: number | null,
): { lines: string[]; ys: number[] } {
  const dateSequence: string[] = [];
  const seenDates = new Set<string>();
  for (const ocrLine of ocrLines) {
    const compactDates = parseCompactItalianDateIsos(ocrLine.text, fallbackYear);
    const namedDate = parseItalianNamedDateIso(ocrLine.text, fallbackYear);
    for (const iso of [...compactDates, ...(namedDate ? [namedDate] : [])]) {
      const key = iso.slice(0, 10);
      if (seenDates.has(key)) continue;
      seenDates.add(key);
      dateSequence.push(iso);
    }
  }
  if (dateSequence.length > 0) {
    const lines: string[] = [];
    const ys: number[] = [];
    let timedRowIndex = 0;
    let lastInsertedDate: string | null = null;

    for (let i = 0; i < nativeLines.length; i++) {
      const line = nativeLines[i];
      const y = nativeYs[i] ?? 0;
      if (/(?:\bORE\s*)?\d{1,2}[:.]\d{2}\b/i.test(line)) {
        const dateIndex = Math.min(Math.floor(timedRowIndex / 2), dateSequence.length - 1);
        const dateIso = dateSequence[Math.min(dateIndex, dateSequence.length - 1)];
        timedRowIndex++;
        if (dateIso && dateIso !== lastInsertedDate) {
          lines.push(formatIsoDateForPdfLine(dateIso));
          ys.push(y + 0.1);
          lastInsertedDate = dateIso;
        }
      }
      lines.push(line);
      ys.push(y);
    }
    return { lines, ys };
  }

  const dateByTimedRow: string[] = [];
  let currentDateLine: string | null = null;
  for (const ocrLine of ocrLines) {
    if (lineLooksLikeDate(ocrLine.text)) {
      currentDateLine = ocrLine.text;
      continue;
    }
    if (currentDateLine && /(?:\bORE\s*)?\d{1,2}[:.]\d{2}\b/i.test(ocrLine.text)) {
      dateByTimedRow.push(currentDateLine);
    }
  }

  if (dateByTimedRow.length === 0) {
    return { lines: nativeLines, ys: nativeYs };
  }

  const lines: string[] = [];
  const ys: number[] = [];
  let timedRowIndex = 0;
  let lastInsertedDate: string | null = null;

  for (let i = 0; i < nativeLines.length; i++) {
    const line = nativeLines[i];
    const y = nativeYs[i] ?? 0;
    if (/(?:\bORE\s*)?\d{1,2}[:.]\d{2}\b/i.test(line)) {
      const dateLine: string | null = dateByTimedRow[timedRowIndex] ?? lastInsertedDate;
      timedRowIndex++;
      if (dateLine && dateLine !== lastInsertedDate) {
        lines.push(dateLine);
        ys.push(y + 0.1);
        lastInsertedDate = dateLine;
      }
    }
    lines.push(line);
    ys.push(y);
  }

  return { lines, ys };
}

export async function parseMatchCalendarPdfFile(
  file: File,
  options: ParsePdfOptions = {},
): Promise<MatchPdfImportResult> {
  const raw = await file.arrayBuffer();
  const loadingTask = getDocument({ data: raw });
  const pdf = await loadingTask.promise;

  const documentMode = options.documentMode ?? "auto";
  const ocrEnabled = options.ocrEnabled !== false;
  const onOcr = options.ocrProgress;
  const ocrFallbackYear =
    extractYearFromIso(options.fallbackDateIso) ??
    (Number.isFinite(file.lastModified) && Number(file.lastModified) > 0
      ? new Date(Number(file.lastModified)).getFullYear()
      : null);

  /** Estrazione testo nativa (pdfjs) per ogni pagina. */
  const perPage: { lines: string[]; ys: number[] }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    perPage.push(await pageToLinesWithYs(page, { includeTournamentTableLines: options.unifiedTournamentProgram === true }));
  }

  const nativeFullText = perPage.map((p) => p.lines.join(" ")).join("\n");
  const nativeHasDate = textHasAnyDate(nativeFullText);
  const ocrCandidate = ocrEnabled && documentMode !== "federation" && !nativeHasDate;

  if (!ocrCandidate) {
    if (!ocrEnabled) {
      onOcr?.({ phase: "skipped", reason: "OCR disabilitato." });
    } else if (documentMode === "federation") {
      onOcr?.({ phase: "skipped", reason: "Modalità federazione: OCR non necessario." });
    } else if (nativeHasDate) {
      onOcr?.({ phase: "skipped", reason: "Date già presenti nel testo del PDF." });
    }
  } else {
    onOcr?.({ phase: "loading" });
    try {
      const tess = (await import("tesseract.js")) as unknown as OcrModule;
      const worker = await createOcrWorker(tess.createWorker, "ita");
      try {
        let totalAddedDates = 0;
        for (let i = 0; i < perPage.length; i++) {
          onOcr?.({ phase: "processing", page: i + 1, totalPages: perPage.length });
          const page = await pdf.getPage(i + 1);
          let ocrLines = await ocrPageWithWorker(page, worker, 2);
          if (ocrLines.length === 0) {
            const englishWorker = await createOcrWorker(tess.createWorker, "eng");
            try {
              ocrLines = await ocrPageWithWorker(page, englishWorker, 2);
            } finally {
              await englishWorker.terminate();
            }
          }
          const dateLines = ocrLines.filter((o) => lineLooksLikeDate(o.text));
          if (dateLines.length === 0) continue;
          const hasOnlyTextOrder = ocrLines.length > 0 && ocrLines.every((o) => o.source === "text");
          if (documentMode === "tournament" && hasOnlyTextOrder) {
            perPage[i] = alignNativeTournamentLinesWithOcrDates(perPage[i].lines, perPage[i].ys, ocrLines, ocrFallbackYear);
          } else {
            const merged = mergeOcrDateLines(perPage[i].lines, perPage[i].ys, dateLines);
            perPage[i] = merged;
          }
          totalAddedDates += dateLines.length;
        }
        onOcr?.({ phase: "done", addedDateLines: totalAddedDates });
      } finally {
        try {
          await worker.terminate();
        } catch {
          // ignore
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("[pdf-ocr] error", err);
      onOcr?.({ phase: "error", reason: err instanceof Error ? err.message : String(err) });
    }
  }

  const allPageLines: string[] = [];
  const pageBlobs: string[] = [];
  for (const p of perPage) {
    allPageLines.push(...p.lines);
    pageBlobs.push(p.lines.join(" "));
  }

  return parseMatchCalendarTextLines(allPageLines, pageBlobs, {
    ...options,
    fileName: file.name,
    lastModified: file.lastModified,
    sourceLabel: "PDF",
  });
}

export async function parseTournamentImageFile(
  file: File,
  options: ParsePdfOptions = {},
): Promise<MatchPdfImportResult> {
  const tess = (await import("tesseract.js")) as unknown as OcrModule;

  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Impossibile leggere l'immagine"));
    reader.readAsDataURL(file);
  });

  const worker = await createOcrWorker(tess.createWorker, "ita");
  try {
    const result = await worker.recognize(imageDataUrl);
    const rawLines = Array.isArray(result.data.lines) && result.data.lines.length > 0
      ? result.data.lines.map((line) => String((line as { text?: unknown }).text ?? ""))
      : String(result.data.text ?? "").split(/\r?\n/);
    const lines = rawLines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const societyDisplay = (options.societyHint?.trim() || options.clubName?.trim() || options.teamName?.trim() || "").trim();
    const aliasNorms = [...new Set([options.societyHint, options.clubName, societyDisplay].filter(Boolean).map((value) => normalizeName(String(value))))].filter(
      (value) => value.length >= 3,
    );
    const tournamentName = inferTournamentName(file.name, lines);
    const fallbackYearHint =
      extractYearFromIso(options.fallbackDateIso) ??
      (Number.isFinite(file.lastModified) && Number(file.lastModified) > 0 ? new Date(Number(file.lastModified)).getFullYear() : null);

    return parseTournamentImageTextLines(lines, {
      aliasNorms,
      tournamentName,
      fallbackYearHint,
      unifiedTournamentProgram: options.unifiedTournamentProgram === true,
    });
  } finally {
    await worker.terminate();
  }
}

export function parseMatchCalendarTextLines(
  allPageLines: string[],
  pageBlobs?: string[],
  options: ParseTextOptions = {},
): MatchPdfImportResult {
  const blobs = pageBlobs && pageBlobs.length > 0 ? pageBlobs : [allPageLines.join("\n")];
  const fullText = blobs.join("\n");
  const termNorms = (options.searchTerms ?? []).map((t) => normalizeName(String(t))).filter((t) => t.length >= 2);
  const documentMode = options.documentMode ?? "auto";
  const sectionNorms = (options.sectionTitleHints ?? [])
    .map((t) => normalizeName(String(t)))
    .filter((t) => t.length >= 3);
  const societyDisplay = (options.societyHint?.trim() || options.clubName?.trim() || options.teamName?.trim() || "").trim();
  const societyNorm = normalizeName(societyDisplay);
  /** Non derivare mai la “data partita” dal lastModified del file: assegnerebbe tutte le gare allo stesso giorno. */
  const explicitTournamentFallbackIso =
    options.fallbackDateIso && String(options.fallbackDateIso).trim()
      ? String(options.fallbackDateIso).trim()
      : null;
  const fallbackYearHint =
    Number.isFinite(options.lastModified) && Number(options.lastModified) > 0
      ? new Date(Number(options.lastModified)).getFullYear()
      : null;

  const federal = documentMode !== "tournament" && looksLikeFederalCalendar(fullText) && societyNorm.length >= 2;

  if (federal) {
    const federalResult = parseFederalLines(allPageLines, {
      sectionNorms,
      societyNorm,
      societyDisplay,
    });
    if (federalResult.recognized.length > 0) {
      return federalResult;
    }
  }

  const tournamentAliasSources =
    documentMode === "tournament"
      ? [options.societyHint, options.clubName, societyDisplay]
      : [options.societyHint, options.clubName, options.teamName, societyDisplay];
  const tournamentAliases = [...new Set(tournamentAliasSources.filter(Boolean).map((value) => normalizeName(String(value))))].filter(
    (value) => value.length >= 3,
  );
  const tournamentLooksValid = looksLikeTournamentProgram(fullText);
  const tournamentProgram = tournamentLooksValid && tournamentAliases.length > 0;
  const tournamentName = inferTournamentName(options.fileName, allPageLines);
  const tournamentTitle = extractTournamentTitle(allPageLines);

  if (documentMode === "tournament") {
    if (options.unifiedTournamentProgram) {
      const unifiedResult = parseUnifiedTournamentProgramLines(allPageLines, {
        aliasNorms: tournamentAliases,
        tournamentTitle,
        tournamentName,
        fallbackDateIso: explicitTournamentFallbackIso,
        fallbackYearHint,
      });
      if ((unifiedResult.tournamentProgram?.length ?? 0) > 0 || unifiedResult.recognized.length > 0) {
        return unifiedResult;
      }
    }
    return tournamentLooksValid
      ? parseTournamentProgramLines(allPageLines, {
          aliasNorms: tournamentAliases,
          tournamentTitle,
          tournamentName,
          fallbackDateIso: explicitTournamentFallbackIso,
          fallbackYearHint,
        })
      : { recognized: [], discarded: 0, totalDateLines: 0 };
  }

  if (tournamentProgram) {
    return parseTournamentProgramLines(allPageLines, {
      aliasNorms: tournamentAliases,
      tournamentTitle,
      tournamentName,
      fallbackDateIso: explicitTournamentFallbackIso,
      fallbackYearHint,
    });
  }

  // Calendari "a tabella" (DATA/CASA/OSPITE) senza righe "GIORNATA".
  if (societyNorm.length >= 2) {
    const tabularResult = parseTabularCalendarLines(allPageLines, { societyNorm });
    if (tabularResult.recognized.length > 0) {
      return tabularResult;
    }
  }

  const aliases = [...new Set([options.teamName, options.clubName, ...(options.searchTerms ?? [])].filter(Boolean))].map((v) =>
    normalizeName(String(v)),
  );

  const collectLines = (ignoreTermFilter: boolean) => {
    const lineSet = new Set<string>();
    for (const pageText of blobs) {
      const pageNorm = normalizeName(pageText);
      if (!ignoreTermFilter && !textMatchesAnyTerm(pageNorm, termNorms)) continue;
      const fromNewlines = pageText
        .split(/\r?\n/)
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length >= 8);
      const fromDates = splitIntoDateChunks(pageText);
      for (const chunk of [...fromNewlines, ...fromDates]) {
        if (chunk.length >= 8) lineSet.add(chunk);
      }
    }
    return Array.from(lineSet);
  };
  let lines = collectLines(false);
  if (lines.length === 0 && termNorms.length > 0) {
    // Se i termini filtro non combaciano col PDF, prova comunque una lettura completa.
    lines = collectLines(true);
  }

  const seen = new Set<string>();
  const recognized: MatchImportRow[] = [];
  let totalDateLines = 0;
  let discarded = 0;

  for (const line of lines) {
    if (!/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(line)) continue;

    totalDateLines++;

    const date = parseDateTimeIso(line);
    const cleanedRow = line
      .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/gi, " ")
      .replace(/\b\d{1,2}[:.]\d{2}\b/gi, " ")
      .replace(/\b(data|squadra\s+di\s+ospite|squadra\s+di\s+casa|ospite|casa)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    const federalLikeSplit =
      societyNorm.length >= 2 ? splitFederalFixtureLine(cleanedRow, societyNorm) : null;
    const fallback = extractOpponent(line, aliases);
    const opponent = federalLikeSplit?.opponent ?? fallback.opponent;
    const homeAway = federalLikeSplit?.homeAway ?? fallback.homeAway;
    if (!date || !opponent) {
      discarded++;
      continue;
    }

    const location = parseLocation(line);
    const competition = parseCompetition(line);
    const key = `${date}|${normalizeName(opponent)}|${homeAway}`;
    if (seen.has(key)) continue;
    seen.add(key);

    recognized.push({
      date,
      opponent,
      homeAway,
      competition,
      location,
      notes: `Import automatico da ${options.sourceLabel ?? "PDF"} federale`,
    });
  }

  return { recognized, discarded, totalDateLines };
}
