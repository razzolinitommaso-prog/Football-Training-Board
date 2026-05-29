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
  /** Variante parser usata dal clone: non altera il flusso standard. */
  parserVariant?: "default" | "clone";
};

type ParserDebugInfo = {
  variant: "default" | "clone";
  engineScores?: Record<string, number>;
  perRowConfidence?: Record<string, number>;
  canonicalRecords?: CloneCanonicalRecord[];
  ownClubAliasProfile?: {
    clubNameUsed?: string;
    aliases: string[];
    distinctiveTokens?: string[];
    tournamentTeamTokens?: string[];
    matchedTournamentTeams?: string[];
    decisions: Array<{
      text: string;
      alias?: string;
      matched: boolean;
      confidence: number;
      evidence: string;
      decision: CloneOwnClubDecisionOutcome;
      sourceEngine: "standard" | "unified" | "merged";
    }>;
  };
  notes?: string[];
};

type CloneCanonicalRecordType =
  | "group_header"
  | "match_fixture"
  | "composition_slot"
  | "phase_transition"
  | "result_line"
  | "ranking_hint";

type CloneCanonicalRecord = {
  id: string;
  type: CloneCanonicalRecordType;
  date?: string;
  group?: string | null;
  phase?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  sourceEngine: "standard" | "unified" | "merged" | "preprocessed";
  confidence: number;
  evidence: string;
};

type CloneOwnClubDecisionOutcome = "accepted" | "rejected_low_confidence" | "rejected_generic_alias";

const CLONE_OWN_CLUB_MIN_CONFIDENCE = 68;

export type MatchPdfImportResult = {
  recognized: MatchImportRow[];
  discarded: number;
  totalDateLines: number;
  tournamentProgram?: TournamentProgramEntry[];
  tournamentScores?: Record<string, { homeScore: number | null; awayScore: number | null }>;
  parserDebug?: ParserDebugInfo;
};

export type TournamentProgramEntry = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  phase?: string | null;
  group?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  kind?: "match" | "composition";
};

type OcrWorker = {
  recognize: (image: unknown) => Promise<{ data: { lines?: unknown[]; text?: string } }>;
  terminate: () => Promise<unknown>;
};

type OcrModule = {
  createWorker: (lang: string) => Promise<OcrWorker>;
};

type ClonePdfLayoutLineRecord = {
  page: number | null;
  y: number | null;
  lineIndex: number;
  source: "allPageLines" | "workingLines" | "synthetic";
  rawText: string;
  normalizedText: string;
  hasTab: boolean;
  hasMultipleSpaces: boolean;
  containsDash: boolean;
};

type ClonePdfLayoutMeta = {
  allPageRecords: ClonePdfLayoutLineRecord[];
  syntheticRecords: ClonePdfLayoutLineRecord[];
};

type CloneFutureMatchPlaceholder = {
  homeRef: string;
  awayRef: string;
  rawLine: string;
  page: number;
  y: number;
  groupName: string | null;
};

type CloneFutureGroupStructure = {
  name: string;
  compositionSlots: string[];
  futureMatches: CloneFutureMatchPlaceholder[];
};

type CloneFuturePhaseStructure = {
  phase: string;
  order: number;
  groups: CloneFutureGroupStructure[];
};

type CloneFutureLayoutHeader = {
  page: number;
  y: number;
  groupName: string;
  phase: string;
  rawText: string;
  cellText: string;
  isPhaseTitle: boolean;
  lineIndex: number;
  hasTab: boolean;
};

type CloneFutureLayoutInterval = {
  groupName: string;
  phase: string;
  page: number;
  yHeader: number;
  yMinExclusive: number | null;
  yMaxExclusive: number;
  rawHeaderText: string;
};

type CloneFutureStructureDraft = {
  headers: CloneFutureLayoutHeader[];
  intervals: CloneFutureLayoutInterval[];
  phases: CloneFuturePhaseStructure[];
};

type ParseTextOptions = ParsePdfOptions & {
  fileName?: string;
  lastModified?: number;
  sourceLabel?: string;
  /** TEMP clone diagnostics: page/y metadata from PDF extraction. */
  clonePdfLayoutMeta?: ClonePdfLayoutMeta;
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
    n.includes("raggruppamenti a") ||
    n.includes("raggruppamenti b") ||
    n.includes("triangolare") ||
    n.includes("quadrangolare") ||
    n.includes("qualificazioni") ||
    n.includes("fase finale") ||
    n.includes("semifinali") ||
    /\bore\s+\d{1,2}[:.]\d{2}\b/i.test(fullText) ||
    /\b(?:girone|raggruppament[oi])\s+[a-z]\s*\d{1,2}[:.]\d{2}\b/i.test(fullText);
  const hasTournamentGrid =
    (/\bore\s+\d{1,2}[:.]\d{2}\b/i.test(fullText) || /\b(?:girone|raggruppament[oi])\s+[a-z]\s*\d{1,2}[:.]\d{2}\b/i.test(fullText)) &&
    (/\bvs\.?\b/i.test(fullText) || n.includes("riposano") || /\bfinale\b/.test(n) || /\bposto\b/.test(n));
  return (hasTournamentWord && hasScheduleSignals) || hasTournamentGrid;
}

const TOURNAMENT_GROUP_TIER_WORDS = [
  "oro",
  "argento",
  "bronzo",
  "platino",
  "elite",
  "eccellenza",
  "qualificazione",
  "qualificazioni",
  "consolazione",
  "finale",
  "finali",
  "semifinale",
  "semifinali",
  "gold",
  "silver",
  "bronze",
  "platinum",
];

const isTournamentGroupTierWord = (value: string | undefined): boolean =>
  !!value && TOURNAMENT_GROUP_TIER_WORDS.includes(normalizeName(value));

function extractTournamentGroupLabel(line: string): string | null {
  const group = line.match(/\b(girone|raggruppament[oi]|triangolare|quadrangolare)\s+([a-z0-9]+)\b(?:\s+([a-z0-9]+))?/i);
  if (group) {
    const beforeGroup = line.slice(0, group.index ?? 0);
    if (/\b\d+\s*(?:\^|°|ª|a|o)?\s*(?:classificat[aoe]?|class\.?)\b/i.test(beforeGroup)) return null;
    const kind = normalizeName(group[1] ?? "");
    const first = group[2] ?? "";
    const secondCandidate = group[3] ?? "";
    const firstIsTier = isTournamentGroupTierWord(first);
    const secondIsTier = isTournamentGroupTierWord(secondCandidate);
    const secondIsShortCode = /^[a-z0-9]{1,2}$/i.test(secondCandidate);
    const second = firstIsTier && secondIsShortCode ? secondCandidate : (!firstIsTier && secondIsTier ? secondCandidate : "");
    const label = [first, second]
      .filter(Boolean)
      .join(" ")
      .replace(/\b(?:data|ora|ore|campo|gara|classificata|classificato)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!label) return null;
    if (kind === "triangolare") return `Triangolare ${label}`;
    if (kind === "quadrangolare") return `Quadrangolare ${label}`;
    return `Girone ${label}`;
  }
  return null;
}

function expectedTournamentGroupSize(groupLabel: string | null): number | null {
  const n = normalizeName(groupLabel ?? "");
  if (n.startsWith("triangolare")) return 3;
  if (n.startsWith("quadrangolare")) return 4;
  return null;
}

function normalizeTournamentPlacementText(value: string): string {
  return value
    .replace(/\b(\d+)\s*(?:\^|Â°|°|Âª|ª|a|A|o|O)\b/g, "$1^")
    .replace(/\bprima\s+classificat[ao]\b/gi, "1^ classificata")
    .replace(/\bseconda\s+classificat[ao]\b/gi, "2^ classificata")
    .replace(/\bterza\s+classificat[ao]\b/gi, "3^ classificata")
    .replace(/\bquarta\s+classificat[ao]\b/gi, "4^ classificata")
    .replace(/\bquinta\s+classificat[ao]\b/gi, "5^ classificata")
    .replace(/\bsesta\s+classificat[ao]\b/gi, "6^ classificata");
}

function normalizeTournamentSourceGroup(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  const label = extractTournamentGroupLabel(clean);
  if (label) return label;
  const short = clean.match(/^(?:girone|raggruppament[oi]|triangolare|quadrangolare)?\s*([a-z0-9]{1,3})$/i);
  return short ? `Girone ${String(short[1]).toUpperCase()}` : clean;
}

function parseTournamentCompositionRefs(value: string): string[] {
  const normalized = normalizeTournamentPlacementText(value.replace(/[=:+]/g, " + "));
  const refs: string[] = [];
  const re = /\b(\d+)\s*\^?\s*(?:classificat[aoe]?|class\.?)?\s*(?:del\s+|della\s+|di\s+)?(?:girone|raggruppament[oi]|triangolare|quadrangolare)?\s+([a-z0-9]{1,3}(?:\s+(?:oro|argento|bronzo|platino|gold|silver|bronze|platinum))?)\b/gi;
  for (const match of normalized.matchAll(re)) {
    const position = Number(match[1]);
    const group = normalizeTournamentSourceGroup(match[2] ?? "");
    if (!Number.isFinite(position) || position <= 0 || !group) continue;
    refs.push(`${position}^ classificata ${group}`);
  }
  return [...new Set(refs)];
}

function parseTournamentCompositionLine(
  line: string,
  currentPhase: string | null,
  fallbackDateIso: string | null,
): TournamentProgramEntry[] {
  const clean = normalizeTournamentPlacementText(line.replace(/\s+/g, " ").trim());
  const n = normalizeName(clean);
  if (!/\b(?:compost[ao]|formato|formata|accede|accedono|qualificat[aeio]|classificat[aeio])\b/.test(n)) return [];
  const groupLabel = extractTournamentGroupLabel(clean);
  if (!groupLabel) return [];
  const refs = parseTournamentCompositionRefs(clean);
  if (refs.length === 0) return [];
  const expected = expectedTournamentGroupSize(groupLabel);
  const limitedRefs = expected ? refs.slice(0, expected) : refs;
  const date = fallbackDateIso ?? new Date(new Date().getFullYear(), 0, 1, 10, 0, 0, 0).toISOString();
  return limitedRefs.map((ref, index) => ({
    id: `composition|${normalizeName(groupLabel)}|${index}|${normalizeName(ref)}`,
    date,
    homeTeam: ref,
    awayTeam: "da completare",
    phase: currentPhase ?? "Qualificazioni",
    group: groupLabel,
    kind: "composition",
  }));
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

function isTournamentReferenceCodeLine(value: string): boolean {
  const text = value.trim();
  const n = normalizeName(text);
  if (!n) return true;
  if (/^(?:[a-z]\d+|\d+\s*(?:a|o)?\s+[a-z]|[a-z]\s*\d+)\s*(?:[-\u2013\u2014/]|vs)\s*(?:[a-z]\d+|\d+\s*(?:a|o)?\s+[a-z]|[a-z]\s*\d+)$/i.test(text)) return true;
  if (/^\d+\s*(?:\^|°|º|a|o)?\s+classificat[aoe]?\s+girone\s+[a-z0-9]+$/i.test(text)) return true;
  if (/^\d+\s*(?:\^|°|º|a|o)?\s+girone\s+[a-z0-9]+$/i.test(text)) return true;
  return false;
}

function looksLikeStandaloneTournamentTeamLine(value: string): boolean {
  const clean = cleanOcrTournamentOpponentName(value);
  const n = normalizeName(clean);
  if (!clean || n.length < 3) return false;
  if (clean.length > 55) return false;
  if (isTournamentReferenceCodeLine(clean)) return false;
  if (/[-\u2013\u2014|]/.test(clean)) return false;
  if (/\b\d{1,2}[:.]\d{2}\b/.test(clean)) return false;
  if (/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/.test(clean)) return false;
  if (/\b(?:data|orario|ora|ore|campo|ris|gara|programma|partite|finali|fase|giornata|riposa|riposano|premiazioni|servizio|bar|tempo|tempi|minuto|minuti)\b/.test(n)) return false;
  if (/\b(?:classificat|posto|triangolare|quadrangolare)\b/.test(n)) return false;
  return /[a-z]/i.test(clean);
}

function parseTournamentTrailingScore(value: string): { text: string; homeScore: number | null; awayScore: number | null } {
  const match = value.trim().match(/\b([0O]|\d{1,2})\s*[-:]\s*([0O]|\d{1,2})\s*$/i);
  if (!match) return { text: value, homeScore: null, awayScore: null };
  return {
    text: value.slice(0, match.index).trim(),
    homeScore: Number(String(match[1]).replace(/O/i, "0")),
    awayScore: Number(String(match[2]).replace(/O/i, "0")),
  };
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
  const numberedQualifying = n.match(/\b(\d+)\s*(?:\^|a|o)?\s*fase\s+qualificazioni?\b/);
  if (numberedQualifying) return `${numberedQualifying[1]}^ fase qualificazioni`;
  if (n.includes("programma torneo")) return "Gironi";
  const tier = TOURNAMENT_GROUP_TIER_WORDS.find((word) => new RegExp(`\\b${word}\\b`, "i").test(n));
  if (/\bfase finale\b/.test(n) && tier) return `Fase finale - ${titleCaseWords(tier)}`;
  if (n.includes("fase finale")) return "Fase finale";
  if (/\bsesti di finale\b/.test(n)) return "Sesti di finale";
  if (/\btriangolari di semifinale\b/.test(n)) return "Triangolari di semifinale";
  if (/\bqualificazioni?\b/.test(n)) return "Qualificazioni";
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
  value = value
    .replace(/^\s*\d{1,2}[:.]\d{2}(?:[.\s-]*\d{4})?\s+/g, "")
    .replace(/\b\d{1,2}[:.]\d{2}(?:[.\s-]*\d{4})?\b/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, " ")
    .replace(/^\s*(?:[A-Z]|\^|x)\s+(?=\p{L}{3,})/u, "")
      .replace(new RegExp(`^\\s*(?:\\^\\s*)?(?:${TOURNAMENT_GROUP_TIER_WORDS.join("|")})\\s+[A-Z]\\s*$`, "i"), "");
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

function parseTournamentCellScores(homeRaw: string, awayRaw: string): { homeScore: number | null; awayScore: number | null } {
  const homeMatch = homeRaw.trim().match(/\s+(\d{1,2})\s*$/);
  const awayMatch = awayRaw.trim().match(/^\s*([0O]|\d{1,2})\s+(?=[A-ZÀ-Ü])/i);
  return {
    homeScore: homeMatch ? Number(homeMatch[1]) : null,
    awayScore: awayMatch ? Number(String(awayMatch[1]).replace(/O/i, "0")) : null,
  };
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

function scoresFromParsedTournamentProgram(program: TournamentProgramEntry[]): Record<string, { homeScore: number | null; awayScore: number | null }> {
  const scores: Record<string, { homeScore: number | null; awayScore: number | null }> = {};
  for (const entry of program) {
    if (!entry.id || entry.homeScore == null || entry.awayScore == null) continue;
    scores[entry.id] = { homeScore: entry.homeScore, awayScore: entry.awayScore };
  }
  return scores;
}

function isSuspiciousTournamentProgramSide(value: string): boolean {
  const clean = cleanTournamentTeamName(value);
  const n = normalizeName(clean);
  if (!clean || n.length < 2) return true;
  if (/^(?:x|[a-z])$/.test(n)) return true;
  if (new RegExp(`^(?:${TOURNAMENT_GROUP_TIER_WORDS.join("|")})\\s+[a-z]$`, "i").test(n)) return true;
  if (n === "snc" || n === "srl" || n === "asd") return true;
  if (/^(?:a|e|di|del|della)\s+\w+$/.test(n) && n.split(/\s+/).length <= 2) return true;
  if (clean.length > 70) return true;
  if (/\b\d{1,2}[:.]\d{2}\b/.test(clean)) return true;
  if (/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/.test(clean)) return true;
  if (/\s[-\u2013\u2014]\s/.test(clean)) return true;
  if (/\b\d{1,2}\s*[-:]\s*\d{1,2}\b/.test(clean)) return true;
  if (/\b(?:classifica|classificata|classificato|finali|generate|programma|partite|campo|risultato|riposa|riposano|premiazioni|tempo|tempi|minuto|minuti)\b/.test(n)) return true;
  return false;
}

function sanitizeTournamentProgramEntries(program: TournamentProgramEntry[]): TournamentProgramEntry[] {
  const clean: TournamentProgramEntry[] = [];
  const seen = new Set<string>();
  const candidateTeamByNorm = new Map<string, string>();
  for (const team of program.flatMap((entry) => [entry.homeTeam, entry.awayTeam])) {
    const cleanTeam = cleanOcrTournamentOpponentName(team);
    if (isSuspiciousTournamentProgramSide(cleanTeam) || !looksLikeStandaloneTournamentTeamLine(cleanTeam)) continue;
    const norm = normalizeName(cleanTeam);
    if (!candidateTeamByNorm.has(norm)) candidateTeamByNorm.set(norm, cleanTeam);
  }
  const candidateTeamNorms = [...candidateTeamByNorm.keys()];
  const expandKnownTeamFragment = (team: string): string => {
    const cleanTeam = cleanOcrTournamentOpponentName(team);
    const n = normalizeName(cleanTeam);
    const parts = n.split(/\s+/).filter(Boolean);
    if (!n || parts.length > 3) return cleanTeam;
    const expandedNorm = candidateTeamNorms
      .filter((known) => known !== n)
      .filter((known) => {
        const knownParts = known.split(/\s+/).filter(Boolean);
        return knownParts.length > parts.length && known.endsWith(` ${n}`);
      })
      .sort((a, b) => b.length - a.length)[0];
    return expandedNorm ? (candidateTeamByNorm.get(expandedNorm) ?? cleanTeam) : cleanTeam;
  };
  const isFragmentOfKnownTeam = (team: string) => {
    const n = normalizeName(team);
    const parts = n.split(/\s+/).filter(Boolean);
    if (!n || parts.length > 3) return false;
    return candidateTeamNorms.some((known) => {
      if (known === n) return false;
      const knownParts = known.split(/\s+/).filter(Boolean);
      if (knownParts.length <= parts.length) return false;
      if (known.endsWith(` ${n}`)) return true;
      return known.endsWith(` e ${n}`) || known.endsWith(` a ${n}`) || (n.startsWith("a ") && known.endsWith(` ${n}`));
    });
  };
  const containsMultipleKnownTeams = (team: string) => {
    const n = normalizeName(team);
    if (!n) return false;
    const matches = candidateTeamNorms.filter((known) => {
      if (known === n) return false;
      if (known.length < 5) return false;
      return new RegExp(`(?:^|\\s)${known.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(n);
    });
    return matches.length >= 2;
  };
  for (const entry of program) {
    if (entry.kind === "composition") {
      const homeTeam = normalizeTournamentPlacementText(String(entry.homeTeam ?? "").trim());
      const awayTeam = String(entry.awayTeam ?? "da completare").trim() || "da completare";
      const group = String(entry.group ?? "").trim();
      if (!homeTeam || !group) continue;
      const key = entry.id || `composition|${normalizeName(group)}|${normalizeName(homeTeam)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({
        ...entry,
        id: key,
        homeTeam: homeTeam.slice(0, 120),
        awayTeam: awayTeam.slice(0, 120),
        kind: "composition",
      });
      continue;
    }
    const homeTeam = expandKnownTeamFragment(entry.homeTeam);
    const awayTeam = expandKnownTeamFragment(entry.awayTeam);
    if (isSuspiciousTournamentProgramSide(homeTeam) || isSuspiciousTournamentProgramSide(awayTeam)) continue;
    if (isFragmentOfKnownTeam(homeTeam) || isFragmentOfKnownTeam(awayTeam)) continue;
    if (containsMultipleKnownTeams(homeTeam) || containsMultipleKnownTeams(awayTeam)) continue;
    if (!looksLikeStandaloneTournamentTeamLine(homeTeam) || !looksLikeStandaloneTournamentTeamLine(awayTeam)) continue;
    const dt = new Date(entry.date);
    if (Number.isNaN(dt.getTime())) continue;
    const year = dt.getFullYear();
    if (year < 2020 || year > 2035) continue;
    const key = `${entry.date}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      ...entry,
      id: key,
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
    });
  }
  return clean;
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

  const cleanTournamentProgram = sanitizeTournamentProgramEntries(tournamentProgram);
  return {
    recognized,
    discarded,
    totalDateLines,
    tournamentProgram: cleanTournamentProgram,
    tournamentScores: scoresFromParsedTournamentProgram(cleanTournamentProgram),
  };
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
    if (!looksLikeStandaloneTournamentTeamLine(clean)) return;
    if (/\b(?:data|orario|ora|campo|ris|gara|programma|partite|finali|fase|girone|raggruppament[oi])\b/.test(norm)) return;
    const list = groupTeams.get(group) ?? [];
    const expectedSize = expectedTournamentGroupSize(group);
    if (expectedSize != null && list.length >= expectedSize) return;
    if (!list.some((item) => normalizeName(item) === norm)) list.push(clean);
    groupTeams.set(group, list);
    if (!knownTeams.some((item) => normalizeName(item) === norm)) knownTeams.push(clean);
  };

  for (let lineIndex = 0; lineIndex < normalizedLines.length; lineIndex += 1) {
    const line = normalizedLines[lineIndex] ?? "";
    if (isPageFooterOrNoise(line)) continue;
    const n = normalizeName(line);
    const groupLabel = extractTournamentGroupLabel(line);
    if (groupLabel) {
      currentGroup = groupLabel;
      currentPhase = "Gironi";
      const groupMatch = line.match(/\b(?:girone|raggruppament[oi])\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}\b/i);
      const after = line.slice((groupMatch?.index ?? 0) + (groupMatch?.[0].length ?? 0)).trim();
      if (after) after.split(/\s{2,}|[,;|]/).forEach((part) => addTeam(currentGroup!, part));
      continue;
    }
    if (/^raggruppament[oi]$/.test(n)) {
      const next = normalizedLines[lineIndex + 1]?.trim() ?? "";
      if (/^[a-z0-9]{1,3}$/i.test(next)) {
        currentGroup = `Girone ${next.toUpperCase()}`;
        currentPhase = "Gironi";
        continue;
      }
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
  const splitScoredMultiFixtureLine = (rest: string): [string, string][] => {
    const fixtureRe = /([\p{L}][\p{L}0-9.' ]{2,}?)\s*[-\u2013\u2014]\s*([\p{L}][\p{L}0-9.' ]{2,}?)(?:\s+(\d{1,2}\s*[-:]\s*\d{1,2})|$)/giu;
    const pairs: [string, string][] = [];
    for (const match of rest.matchAll(fixtureRe)) {
      const home = cleanOcrTournamentOpponentName(match[1] ?? "");
      const away = cleanOcrTournamentOpponentName(match[2] ?? "");
      const score = match[3]?.trim();
      if (looksLikeStandaloneTournamentTeamLine(home) && looksLikeStandaloneTournamentTeamLine(away)) {
        pairs.push([home, score ? `${away} ${score}` : away]);
      }
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
      const scoredPairs = splitScoredMultiFixtureLine(part);
      if (scoredPairs.length > 0) {
        pairs.push(...scoredPairs);
        continue;
      }
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

  currentGroup = null;
  currentPhase = null;
  currentDateIso = null;

  const addProgramEntry = (date: string, homeRaw: string, awayRaw: string, phase: string | null, group: string | null) => {
    const score = parseTournamentTrailingScore(`${homeRaw} - ${awayRaw}`);
    let homeSource = homeRaw;
    let awaySource = awayRaw;
    if (score.homeScore != null && score.awayScore != null) {
      const scoreless = score.text.match(/^(.+?)\s*(?:[\u2013\u2014-]|vs\.?)\s*(.+)$/i);
      if (scoreless) {
        homeSource = scoreless[1] ?? homeRaw;
        awaySource = scoreless[2] ?? awayRaw;
      } else {
        awaySource = awayRaw.replace(/\b([0O]|\d{1,2})\s*[-:]\s*([0O]|\d{1,2})\s*$/i, "").trim();
      }
    }
    const homeTeam = cleanOcrTournamentOpponentName(homeSource);
    const awayTeam = cleanOcrTournamentOpponentName(awaySource);
    if (!homeTeam || !awayTeam) return;
    if (!looksLikeStandaloneTournamentTeamLine(homeTeam) || !looksLikeStandaloneTournamentTeamLine(awayTeam)) return;
    if (isImageTournamentEmptyTeam(homeTeam) || isImageTournamentEmptyTeam(awayTeam)) return;
    if (isTournamentReferenceCodeLine(homeTeam) || isTournamentReferenceCodeLine(awayTeam)) return;
    const key = `${date}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
    if (seenProgram.has(key)) return;
    seenProgram.add(key);
    tournamentProgram.push({
      id: key,
      date,
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
      phase,
      group,
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      kind: "match",
    });
  };

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i] ?? "";
    if (!line || isPageFooterOrNoise(line)) continue;
    currentPhase = detectTournamentPhase(line, currentPhase);
    const detectedGroupLabel = extractTournamentGroupLabel(line);
    if (detectedGroupLabel) {
      currentGroup = detectedGroupLabel;
      currentPhase = "Gironi";
    }
    const compositionEntries = parseTournamentCompositionLine(line, currentPhase, currentDateIso ?? options.fallbackDateIso ?? null);
    if (compositionEntries.length > 0) {
      for (const entry of compositionEntries) {
        const key = entry.id;
        if (seenProgram.has(key)) continue;
        seenProgram.add(key);
        tournamentProgram.push(entry);
      }
      continue;
    }
    const rowGroup = detectedGroupLabel ?? currentGroup ?? currentPhase?.match(/\b(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}/i)?.[0] ?? null;
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
      : afterTime.replace(/\b(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}\b/i, "").replace(/^\s*[a-z]\s+/i, "");
    const finalLabel = cleanTournamentFixtureRest(restSource);
    if (isTournamentPlacementFinalLabel(finalLabel)) {
      const finalName = cleanTournamentPlacementFinalLabel(finalLabel);
      const key = `${base.toISOString()}|${normalizeName(finalName)}|da completare`;
      if (!seenProgram.has(key)) {
        seenProgram.add(key);
        tournamentProgram.push({
          id: key,
          date: base.toISOString(),
          homeTeam: finalName.slice(0, 120),
          awayTeam: "da completare",
          phase: currentPhase ?? "Finale",
          group: "Finali",
          kind: "match",
        });
      }
      continue;
    }
    const pairs = splitPairs(cleanTournamentFixtureRest(restSource));
    if (pairs.length === 0) {
      discarded++;
      continue;
    }
    for (const pair of pairs) {
      addProgramEntry(base.toISOString(), pair[0], pair[1], currentPhase ?? (rowGroup ? "Gironi" : null), rowGroup);
    }
  }

  const cleanTournamentProgram = sanitizeTournamentProgramEntries(tournamentProgram);

  for (const entry of cleanTournamentProgram) {
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

  return {
    recognized,
    discarded,
    totalDateLines,
    tournamentProgram: cleanTournamentProgram,
    tournamentScores: scoresFromParsedTournamentProgram(cleanTournamentProgram),
  };
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
  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return null;
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const group = phase?.match(/\b(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[a-z0-9]+/i)?.[0] ?? (/final/i.test(phase ?? "") ? "Finali" : null);
  if (isTournamentPlacementFinalLabel(rest)) {
    return {
      id: "",
      date: base.toISOString(),
      homeTeam: cleanTournamentPlacementFinalLabel(rest).slice(0, 120),
      awayTeam: "da completare",
      phase: phase ?? "Finale",
      group: group ?? "Finali",
      kind: "match",
    };
  }
  const pair = rest.match(/^(.+?)\s*(?:\bvs\.?\b|[\u2013\u2014-]|=+>)\s*(.+?)\s*(?:\d+\s*[-:]\s*\d+)?$/i);
  if (!pair) return null;
  const score = (() => {
    const scoreMatch = rest.match(/\b(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/);
    return scoreMatch ? { homeScore: Number(scoreMatch[1]), awayScore: Number(scoreMatch[2]) } : { homeScore: null, awayScore: null };
  })();
  const homeTeam = cleanOcrTournamentOpponentName(pair[1] ?? "");
  const awayTeam = cleanOcrTournamentOpponentName(pair[2] ?? "");
  if (!homeTeam || !awayTeam) return null;
  return {
    id: "",
    date: base.toISOString(),
    homeTeam: homeTeam.slice(0, 120),
    awayTeam: awayTeam.slice(0, 120),
    phase,
    group,
    homeScore: score.homeScore,
    awayScore: score.awayScore,
    kind: "match",
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
  const group = phase?.match(/\b(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[a-z0-9]+/i)?.[0] ?? (/final/i.test(phase ?? "") ? "Finali" : null);

  if (isTournamentPlacementFinalLabel(rest)) {
    entries.push({
      id: "",
      date: base.toISOString(),
      homeTeam: cleanTournamentPlacementFinalLabel(rest).slice(0, 120),
      awayTeam: "da completare",
      phase: phase ?? "Finale",
      group: group ?? "Finali",
      kind: "match",
    });
    return entries;
  }

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
      kind: "match",
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
  const rawTeamCells: string[] = [];
  for (let i = 0; i < rawCells.length; i += 1) {
    const current = rawCells[i] ?? "";
    if (/^[0O]?\d{1,2}$/i.test(current)) continue;
    const nextIsScore = /^[0O]?\d{1,2}$/i.test(rawCells[i + 1] ?? "");
    const cleaned = cleanTournamentCellTeamName(current, { stripTrailingScore: nextIsScore });
    if (cleaned && !isImageTournamentEmptyTeam(cleaned)) {
      rawTeamCells.push(current);
      cells.push(cleaned);
    }
  }
  if (cells.length < 4) return [];

  const base = new Date(currentDateIso);
  if (Number.isNaN(base.getTime())) return [];
  base.setHours(hour, minute, 0, 0);
  const phase = currentPhase?.trim() || null;
  const group = phase?.match(/\b(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[a-z0-9]+/i)?.[0] ?? null;
  const entries: TournamentProgramEntry[] = [];

  for (let i = 0; i + 1 < cells.length; i += 2) {
    const homeTeam = cells[i] ?? "";
    const awayTeam = cells[i + 1] ?? "";
    if (!homeTeam || !awayTeam) continue;
    const score = parseTournamentCellScores(rawTeamCells[i] ?? "", rawTeamCells[i + 1] ?? "");
    entries.push({
      id: "",
      date: base.toISOString(),
      homeTeam: homeTeam.slice(0, 120),
      awayTeam: awayTeam.slice(0, 120),
      phase,
      group,
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      kind: "match",
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
      kind: "match",
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
    clubNameUsed?: string;
    fallbackYearHint?: number | null;
    unifiedTournamentProgram?: boolean;
    parserVariant?: "default" | "clone";
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

  let cleanTournamentProgram = sanitizeTournamentProgramEntries(tournamentProgram);
  if (options.parserVariant === "clone") {
    const rosterFallbackIso =
      knownProgramDateIso ??
      recognized.find((row) => importRowHasDateForProgram(row.date))?.date ??
      null;
    cleanTournamentProgram = cloneAttachGroupRosterCompositions(allLines, cleanTournamentProgram, {
      fallbackDateIso: rosterFallbackIso,
    });
  }
  const imageDistinctiveTokens = buildCloneDistinctiveClubTokens(options.aliasNorms);
  const imageAliasEnrichment =
    options.parserVariant === "clone"
      ? enrichCloneAliasesFromTournamentTeams(options.aliasNorms, imageDistinctiveTokens, cleanTournamentProgram)
      : { aliases: options.aliasNorms, tournamentTeams: [], matchedTournamentTeams: [], tournamentTeamTokens: [] };
  const imageOwnClubAliases = imageAliasEnrichment.aliases;
  const recognizedFromProgram =
    options.parserVariant === "clone"
      ? cloneRecognizedRowsFromTournamentProgram(cleanTournamentProgram, imageOwnClubAliases, options.tournamentName, null)
      : [];
  const recognizedForClone =
    options.parserVariant === "clone"
      ? [...recognized, ...recognizedFromProgram].filter((row, idx, arr) => {
          const key = `${row.date}|${normalizeName(row.opponent)}|${row.homeAway}`;
          return arr.findIndex((x) => `${x.date}|${normalizeName(x.opponent)}|${x.homeAway}` === key) === idx;
        })
      : recognized;
  const imageConfidence = Object.fromEntries(
    cleanTournamentProgram.map((entry) => [tournamentEntryMergeKey(entry), tournamentCloneEntryConfidence(entry)]),
  );
  const imageCanonicalRecords =
    options.parserVariant === "clone"
      ? buildCloneCanonicalRecords(
          {
            recognized: recognizedForClone,
            discarded,
            totalDateLines,
            tournamentProgram: cleanTournamentProgram,
            tournamentScores: scoresFromParsedTournamentProgram(cleanTournamentProgram),
          },
          "merged",
          imageConfidence,
        )
      : [];
  const imageContextTokens =
    options.parserVariant === "clone"
      ? buildCloneOwnClubContextTokens({
          recognized: recognizedForClone,
          tournamentProgram: cleanTournamentProgram,
        })
      : new Set<string>();
  const imageOwnClubFilter =
    options.parserVariant === "clone"
      ? cloneFilterRecognizedRowsForOwnClub({
          rows: recognizedForClone,
          program: cleanTournamentProgram,
          matchedTournamentTeams: imageAliasEnrichment.matchedTournamentTeams,
          aliases: imageOwnClubAliases,
          contextTokens: imageContextTokens,
        })
      : { kept: recognizedForClone, audits: [] as CloneRecognizedRowOwnClubFilterAudit[] };
  const imageOwnClubDecisions =
    options.parserVariant === "clone"
      ? imageOwnClubFilter.audits.slice(0, 160).map((audit) => ({
          text: audit.opponent,
          matched: audit.decision === "accepted",
          confidence: audit.containsMatchedTournamentTeam ? 100 : audit.decision === "accepted" ? 68 : 0,
          evidence: audit.reason,
          decision: audit.decision,
          sourceEngine: "merged" as const,
        }))
      : [];
  const filteredRecognized =
    options.parserVariant === "clone" ? imageOwnClubFilter.kept : recognizedForClone;
  if (options.parserVariant === "clone") {
    console.log("[CLONE-RUNTIME-CHECK] clubNameUsed", options.clubNameUsed);
    console.log("[CLONE-RUNTIME-CHECK] aliases", imageOwnClubAliases);
    console.log("[CLONE-RUNTIME-CHECK] aliases JSON", JSON.stringify(imageOwnClubAliases, null, 2));
    console.log("[CLONE-RUNTIME-CHECK] distinctiveTokens JSON", JSON.stringify(imageDistinctiveTokens, null, 2));
    console.log("[CLONE-RUNTIME-CHECK] tournamentTeamTokens JSON", JSON.stringify(imageAliasEnrichment.tournamentTeamTokens, null, 2));
    console.log("[CLONE-RUNTIME-CHECK] tournament teams JSON", JSON.stringify(imageAliasEnrichment.tournamentTeams, null, 2));
    console.log("[CLONE-RUNTIME-CHECK] matchedTournamentTeams", imageAliasEnrichment.matchedTournamentTeams);
    console.log(
      "[CLONE-RUNTIME-CHECK] matchedTournamentTeams JSON",
      JSON.stringify(imageAliasEnrichment.matchedTournamentTeams, null, 2),
    );
    console.log("[CLONE-RUNTIME-CHECK] tournament fixtures count", cleanTournamentProgram.length);
    console.log(
      "[CLONE-RUNTIME-CHECK] tournamentProgram summary JSON",
      JSON.stringify(cloneProgramSummary(cleanTournamentProgram), null, 2),
    );
    console.log(
      "[CLONE-RUNTIME-CHECK] canonicalRecords JSON",
      JSON.stringify(imageCanonicalRecords.slice(0, 250), null, 2),
    );
    console.log(
      "[CLONE-RUNTIME-CHECK] keyword lines JSON",
      JSON.stringify(cloneKeywordLines(allLines), null, 2),
    );
    console.log("[CLONE-RUNTIME-CHECK] recognized before own filter", recognizedForClone.length);
    console.log("[CLONE-RUNTIME-CHECK] recognized after own filter", filteredRecognized.length);
  }
  return {
    recognized: filteredRecognized,
    discarded,
    totalDateLines,
    tournamentProgram: cleanTournamentProgram,
    tournamentScores: scoresFromParsedTournamentProgram(cleanTournamentProgram),
    parserDebug:
      options.parserVariant === "clone"
        ? {
            variant: "clone",
            perRowConfidence: imageConfidence,
            canonicalRecords: imageCanonicalRecords,
            ownClubAliasProfile: {
              clubNameUsed: options.clubNameUsed,
              aliases: imageOwnClubAliases,
              distinctiveTokens: imageDistinctiveTokens,
              tournamentTeamTokens: imageAliasEnrichment.tournamentTeamTokens,
              matchedTournamentTeams: imageAliasEnrichment.matchedTournamentTeams,
              decisions: imageOwnClubDecisions,
            },
            notes: [
              "clone parser immagine: modello canonico base + confidence per record",
              `clone alias resolver: soglia own-club ${CLONE_OWN_CLUB_MIN_CONFIDENCE} con righe scartate tracciate nel debug`,
            ],
          }
        : undefined,
  };
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
  options: {
    includeTournamentTableLines?: boolean;
    tournamentFallbackDateIso?: string | null;
    capturePreCollapseRaw?: boolean;
  } = {},
): Promise<{ lines: string[]; ys: number[]; preCollapseLines?: string[]; syntheticLines?: string[] }> {
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
  const preCollapseLines: string[] = [];
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
    const preCollapse = parts.join("").trim();
    const line = preCollapse.replace(/ +/g, " ").trim();
    if (line) {
      lines.push(line);
      ys.push(curY);
      if (options.capturePreCollapseRaw) preCollapseLines.push(preCollapse);
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
  let syntheticLines: string[] = [];
  if (options.includeTournamentTableLines) {
    const synthetic = buildTournamentTableSyntheticLines(items, options.tournamentFallbackDateIso);
    syntheticLines = synthetic.syntheticOnly;
    for (const line of synthetic.lines) lines.push(line);
    for (const y of synthetic.ys) ys.push(y);
  }
  return {
    lines,
    ys,
    ...(options.capturePreCollapseRaw ? { preCollapseLines } : {}),
    ...(syntheticLines.length > 0 ? { syntheticLines } : {}),
  };
}

function buildTournamentTableSyntheticLines(items: { str: string; x: number; y: number }[], fallbackDateIso?: string | null): {
  lines: string[];
  ys: number[];
  syntheticOnly: string[];
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
  const syntheticOnly: string[] = [];
  const seen = new Set<string>();
  const pushLine = (line: string, y: number) => {
    const clean = line.replace(/\s+/g, " ").trim();
    const key = normalizeName(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    lines.push(clean);
    ys.push(y);
    syntheticOnly.push(line.trim());
  };

  const groupHeadings: { group: string; x: number; y: number }[] = [];
  for (const row of rows) {
    for (let index = 0; index < row.cells.length; index += 1) {
      const cell = row.cells[index];
      const label = extractTournamentGroupLabel(cell.str);
      if (label) groupHeadings.push({ group: label, x: cell.x, y: row.y });
      const n = normalizeName(cell.str);
      if (/^raggruppament[oi]$/.test(n)) {
        const next = row.cells
          .slice(index + 1)
          .find((candidate) => candidate.x > cell.x && candidate.x - cell.x < 180 && /^[a-z0-9]{1,3}$/i.test(candidate.str.trim()));
        if (next) groupHeadings.push({ group: `Girone ${next.str.trim().toUpperCase()}`, x: cell.x, y: row.y });
      }
    }
  }
  groupHeadings.sort((a, b) => b.y - a.y || a.x - b.x);

  const pageDateCell = rows
    .flatMap((row) => row.cells)
    .map((cell) => parseItalianNamedDateIso(cell.str, undefined) ?? parseDateTimeIso(cell.str))
    .find(Boolean);
  const fallbackDateCell = fallbackDateIso ? formatIsoDateForPdfLine(fallbackDateIso) : "";

  const groupForScheduleRow = (rowY: number, rowX?: number): string | null => {
    const above = groupHeadings
      .filter((heading) => heading.y > rowY)
      .filter((heading) => heading.y - rowY < 210)
      .sort((a, b) => {
        const vertical = (a.y - rowY) - (b.y - rowY);
        if (Math.abs(vertical) > 6) return vertical;
        if (rowX == null) return a.x - b.x;
        return Math.abs(a.x - rowX) - Math.abs(b.x - rowX);
      })[0];
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
      const peerHeadings = groupHeadings
        .filter((candidate) => Math.abs(candidate.y - heading.y) <= 8)
        .sort((a, b) => a.x - b.x);
      const peerIndex = peerHeadings.findIndex((candidate) =>
        candidate.group === heading.group && candidate.x === heading.x && candidate.y === heading.y
      );
      const prev = peerIndex > 0 ? peerHeadings[peerIndex - 1] : null;
      const next = peerIndex >= 0 && peerIndex < peerHeadings.length - 1 ? peerHeadings[peerIndex + 1] : null;
      const left = prev ? (prev.x + heading.x) / 2 : heading.x - 110;
      const right = next ? (heading.x + next.x) / 2 : heading.x + 160;
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

  const dateRe = /\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/;
  const timeRe = /\b\d{1,2}[:.]\d{2}\b/;
  let currentTableDate = pageDateCell ? formatIsoDateForPdfLine(pageDateCell) : fallbackDateCell;
  let pendingTimeCells: { x: number; time: string; date: string }[] = [];

  const isUsefulTournamentFixtureCell = (value: string): boolean => {
    const clean = cleanTournamentTeamName(value);
    const n = normalizeName(clean);
    if (!clean || !/[-–—]/.test(clean)) return false;
    if (/^[a-z]\d+\s*[-–—]\s*[a-z]\d+$/i.test(clean)) return false;
    if (/\b(?:campo|data|ora|ore|gara|ris|giornata)\b/.test(n)) return false;
    return /[a-zàèéìòù]{2,}/i.test(clean);
  };

  const normalizeTournamentDateCell = (value: string): string => {
    const clean = value.trim();
    const withYear = clean.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (withYear) {
      const day = Number(withYear[1]);
      const month = Number(withYear[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) return "";
      return clean;
    }
    const short = clean.match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
    if (short) {
      const day = Number(short[1]);
      const month = Number(short[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) return "";
      const year = extractYearFromIso(pageDateCell ?? "") ?? new Date().getFullYear();
      return `${String(short[1]).padStart(2, "0")}/${String(short[2]).padStart(2, "0")}/${year}`;
    }
    return clean;
  };

  const pushTournamentFixtureCell = (dateValue: string, timeValue: string, groupLabel: string | null, fixture: string, y: number) => {
    const clean = cleanTournamentTeamName(fixture);
    if (!isUsefulTournamentFixtureCell(clean)) return;
    const normalizedDate = normalizeTournamentDateCell(dateValue);
    if (!normalizedDate) return;
    pushLine(`${normalizedDate} ${timeValue.replace(".", ":")} ${groupLabel ?? ""} ${clean}`, y);
  };

  const isTournamentScoreCell = (value: string): boolean => /^[0O]?\d{1,2}\s*(?:[-:]\s*[0O]?\d{1,2})?$/.test(value.trim());
  const isTournamentTeamCell = (value: string): boolean => {
    const clean = cleanOcrTournamentOpponentName(value);
    const n = normalizeName(clean);
    if (!clean || n.length < 2) return false;
    if (isTournamentScoreCell(clean) || isTournamentReferenceCodeLine(clean)) return false;
    if (/\b(?:data|orario|ora|ore|campo|ris|gara|giornata|riposa|premiazioni|tempo|tempi|minuto|minuti)\b/.test(n)) return false;
    return /[a-z]/i.test(clean);
  };
  const pushTournamentCellPair = (
    dateValue: string,
    timeValue: string,
    groupLabel: string | null,
    cells: { str: string; x: number }[],
    y: number,
  ) => {
    const useful = cells.filter((cell) => isTournamentTeamCell(cell.str));
    if (useful.length < 2) return;
    for (let i = 0; i + 1 < useful.length; i += 2) {
      const home = cleanOcrTournamentOpponentName(useful[i].str);
      const away = cleanOcrTournamentOpponentName(useful[i + 1].str);
      if (!home || !away) continue;
      const scoreCells = cells
        .filter((cell) => cell.x > useful[i + 1].x && cell.x < useful[i + 1].x + 85 && isTournamentScoreCell(cell.str))
        .map((cell) => cell.str.trim());
      const scoreSuffix = scoreCells.length >= 2
        ? ` ${scoreCells[0]} - ${scoreCells[1]}`
        : (scoreCells[0] && /\d+\s*[-:]\s*\d+/.test(scoreCells[0]) ? ` ${scoreCells[0]}` : "");
      const normalizedDate = normalizeTournamentDateCell(dateValue);
      if (!normalizedDate) continue;
      pushLine(`${normalizedDate} ${timeValue.replace(".", ":")} ${groupLabel ?? ""} ${home} - ${away}${scoreSuffix}`, y);
    }
  };

  for (const row of rows) {
    const dateCells = row.cells.filter((cell) => dateRe.test(cell.str) && normalizeTournamentDateCell(cell.str));
    if (dateCells.length > 0) currentTableDate = normalizeTournamentDateCell(dateCells[0].str);
    const timeCells = row.cells.filter((cell) => timeRe.test(cell.str));

    if (timeCells.length > 0) {
      pendingTimeCells = timeCells.map((timeCell) => {
        const dateCell = dateCells
          .filter((cell) => cell.x <= timeCell.x + 20)
          .sort((a, b) => Math.abs(a.x - timeCell.x) - Math.abs(b.x - timeCell.x))[0];
        return {
          x: timeCell.x,
          time: timeCell.str,
          date: dateCell ? normalizeTournamentDateCell(dateCell.str) : currentTableDate,
        };
      });

      for (const timeCell of pendingTimeCells) {
        const nextTimeX = pendingTimeCells
          .map((cell) => cell.x)
          .filter((x) => x > timeCell.x + 20)
          .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
        const groupLabel = groupForScheduleRow(row.y, timeCell.x);
        const fixtureCells = row.cells.filter((cell) =>
          cell.x > timeCell.x + 35 &&
          cell.x < nextTimeX - 20 &&
          isUsefulTournamentFixtureCell(cell.str)
        );
        for (const cell of fixtureCells) pushTournamentFixtureCell(timeCell.date, timeCell.time, groupLabel, cell.str, row.y + 0.04);
        if (fixtureCells.length === 0) {
          const candidateCells = row.cells.filter((cell) => cell.x > timeCell.x + 35 && cell.x < nextTimeX - 20);
          pushTournamentCellPair(timeCell.date, timeCell.time, groupLabel, candidateCells, row.y + 0.04);
        }
      }
    }

    if (timeCells.length === 0 && pendingTimeCells.length > 0) {
      const fixtureCells = row.cells.filter((cell) => isUsefulTournamentFixtureCell(cell.str));
      for (const cell of fixtureCells) {
        const timeCell = [...pendingTimeCells]
          .filter((candidate) => candidate.x <= cell.x + 20)
          .sort((a, b) => Math.abs(a.x - cell.x) - Math.abs(b.x - cell.x))[0] ?? pendingTimeCells[0];
        pushTournamentFixtureCell(timeCell.date, timeCell.time, groupForScheduleRow(row.y, cell.x), cell.str, row.y + 0.04);
      }
      if (fixtureCells.length === 0) {
        for (const timeCell of pendingTimeCells) {
          const nextTimeX = pendingTimeCells
            .map((cell) => cell.x)
            .filter((x) => x > timeCell.x + 20)
            .sort((a, b) => a - b)[0] ?? Number.POSITIVE_INFINITY;
          const candidateCells = row.cells.filter((cell) => cell.x > timeCell.x + 35 && cell.x < nextTimeX - 20);
          pushTournamentCellPair(timeCell.date, timeCell.time, groupForScheduleRow(row.y, timeCell.x), candidateCells, row.y + 0.04);
        }
      }
      continue;
    }

    const dateCell = row.cells.find((cell) => dateRe.test(cell.str));
    const timeCell = row.cells.find((cell) => timeRe.test(cell.str));
    if (!dateCell || !timeCell) continue;

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

  return { lines, ys, syntheticOnly };
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

  const captureCloneLayoutDiagnostics =
    options.parserVariant === "clone" && (options.documentMode ?? "auto") === "tournament";

  /** Estrazione testo nativa (pdfjs) per ogni pagina. */
  const perPage: {
    lines: string[];
    ys: number[];
    preCollapseLines?: string[];
    syntheticLines?: string[];
  }[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    perPage.push(
      await pageToLinesWithYs(page, {
        includeTournamentTableLines: options.unifiedTournamentProgram === true,
        tournamentFallbackDateIso: options.fallbackDateIso,
        capturePreCollapseRaw: captureCloneLayoutDiagnostics,
      }),
    );
  }

  const nativeFullText = perPage.map((p) => p.lines.join(" ")).join("\n");
  const nativeHasDate = textHasAnyDate(nativeFullText);
  const ocrCandidate = ocrEnabled && documentMode !== "federation" && !nativeHasDate;
  if (options.parserVariant === "clone") {
    console.log(
      "[CLONE-RUNTIME-CHECK] pdf extraction mode JSON",
      JSON.stringify(
        {
          fileName: file.name,
          documentMode,
          nativeHasDate,
          ocrEnabled,
          ocrCandidate,
          pages: perPage.length,
        },
        null,
        2,
      ),
    );
    console.log(
      "[CLONE-RUNTIME-CHECK] pdf keyword lines JSON",
      JSON.stringify(cloneKeywordLines(nativeFullText.split(/\r?\n/)), null, 2),
    );
  }

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

  let clonePdfLayoutMeta: ClonePdfLayoutMeta | undefined;
  if (captureCloneLayoutDiagnostics) {
    const allPageRecords: ClonePdfLayoutLineRecord[] = [];
    const syntheticRecords: ClonePdfLayoutLineRecord[] = [];
    let globalLineIndex = 0;
    for (let pageIndex = 0; pageIndex < perPage.length; pageIndex += 1) {
      const pageData = perPage[pageIndex];
      if (!pageData) continue;
      const pageNum = pageIndex + 1;
      for (let lineOffset = 0; lineOffset < pageData.lines.length; lineOffset += 1) {
        const normalizedText = pageData.lines[lineOffset] ?? "";
        const rawText = pageData.preCollapseLines?.[lineOffset] ?? normalizedText;
        allPageRecords.push(
          cloneBuildPdfLayoutLineRecord({
            page: pageNum,
            y: pageData.ys[lineOffset] ?? null,
            lineIndex: globalLineIndex,
            source: "allPageLines",
            rawText,
            normalizedText,
          }),
        );
        globalLineIndex += 1;
      }
      for (let synIndex = 0; synIndex < (pageData.syntheticLines?.length ?? 0); synIndex += 1) {
        const synRaw = pageData.syntheticLines?.[synIndex] ?? "";
        syntheticRecords.push(
          cloneBuildPdfLayoutLineRecord({
            page: pageNum,
            y: null,
            lineIndex: synIndex,
            source: "synthetic",
            rawText: synRaw,
          }),
        );
      }
    }
    clonePdfLayoutMeta = { allPageRecords, syntheticRecords };
  }

  return parseMatchCalendarTextLines(allPageLines, pageBlobs, {
    ...options,
    fileName: file.name,
    lastModified: file.lastModified,
    sourceLabel: "PDF",
    clonePdfLayoutMeta,
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
      clubNameUsed: societyDisplay,
      fallbackYearHint,
      unifiedTournamentProgram: options.unifiedTournamentProgram === true,
      parserVariant: options.parserVariant ?? "default",
    });
  } finally {
    await worker.terminate();
  }
}

function tournamentParseQuality(result: MatchPdfImportResult): number {
  const program = result.tournamentProgram ?? [];
  let score = result.recognized.length * 2;
  for (const entry of program) {
    if (entry.kind === "composition") {
      score -= 1;
      continue;
    }
    const home = String(entry.homeTeam ?? "");
    const away = String(entry.awayTeam ?? "");
    const homeNorm = normalizeName(home);
    const awayNorm = normalizeName(away);
    const isBad =
      isSuspiciousTournamentProgramSide(home) ||
      isSuspiciousTournamentProgramSide(away) ||
      isTournamentReferenceCodeLine(home) ||
      isTournamentReferenceCodeLine(away) ||
      /\bclassificat[aoe]?\b/.test(homeNorm) ||
      /\bclassificat[aoe]?\b/.test(awayNorm);
    score += isBad ? -5 : 3;
  }
  return score;
}

function tournamentCloneEntryConfidence(entry: TournamentProgramEntry): number {
  if (entry.kind === "composition") return 72;
  let score = 50;
  const dateOk = Boolean(entry.date && !Number.isNaN(new Date(entry.date).getTime()));
  const homeNorm = normalizeName(String(entry.homeTeam ?? ""));
  const awayNorm = normalizeName(String(entry.awayTeam ?? ""));
  if (dateOk) score += 22;
  if (String(entry.group ?? "").trim()) score += 8;
  if (String(entry.phase ?? "").trim()) score += 7;
  if (entry.homeScore != null || entry.awayScore != null) score += 6;
  const hasFinalsSignal = /\b(finale|semifinale|quarti|ottavi|spareggio)\b/.test(
    `${normalizeName(String(entry.phase ?? ""))} ${normalizeName(String(entry.group ?? ""))}`,
  );
  if (hasFinalsSignal) score += 5;
  if (isSuspiciousTournamentProgramSide(String(entry.homeTeam ?? ""))) score -= 25;
  if (isSuspiciousTournamentProgramSide(String(entry.awayTeam ?? ""))) score -= 25;
  if (isTournamentReferenceCodeLine(String(entry.homeTeam ?? ""))) score -= 25;
  if (isTournamentReferenceCodeLine(String(entry.awayTeam ?? ""))) score -= 25;
  if (!looksLikeStandaloneTournamentTeamLine(String(entry.homeTeam ?? ""))) score -= 15;
  if (!looksLikeStandaloneTournamentTeamLine(String(entry.awayTeam ?? ""))) score -= 15;
  if (homeNorm && awayNorm && homeNorm === awayNorm) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function tournamentCloneParseQuality(result: MatchPdfImportResult): {
  score: number;
  perRowConfidence: Record<string, number>;
} {
  const program = result.tournamentProgram ?? [];
  const perRowConfidence: Record<string, number> = {};
  let score = result.recognized.length * 3;
  let structureBonus = 0;
  for (const entry of program) {
    const key = tournamentEntryMergeKey(entry) || entry.id;
    const confidence = tournamentCloneEntryConfidence(entry);
    perRowConfidence[key] = Math.max(perRowConfidence[key] ?? 0, confidence);
    score += Math.round((confidence - 45) / 6);
    if (entry.kind === "composition") structureBonus += 2;
    if (String(entry.group ?? "").trim()) structureBonus += 1;
    if (String(entry.phase ?? "").trim()) structureBonus += 1;
  }
  score += Math.min(20, structureBonus);
  return { score, perRowConfidence };
}

function cloneSocietyNoiseToken(token: string): boolean {
  return new Set([
    "asd",
    "ssd",
    "usd",
    "ssdrl",
    "srl",
    "spa",
    "a",
    "s",
    "d",
    "ac",
    "fc",
    "sc",
    "calcio",
    "club",
    "scuola",
    "sport",
    "sporting",
    "sportiva",
    "societa",
    "polisportiva",
    "associazione",
    "dilettantistica",
    "firenze",
    "settore",
    "giovanile",
  ]).has(token);
}

function buildCloneSocietyAliases(sources: Array<string | undefined | null>): string[] {
  const raw = sources.map((value) => normalizeName(String(value ?? ""))).filter(Boolean);
  const aliases = new Set<string>();
  for (const source of raw) {
    aliases.add(source);
    const tokens = source.split(/\s+/).filter((token) => token.length >= 2 && !cloneSocietyNoiseToken(token));
    if (tokens.length === 0) continue;
    aliases.add(tokens.join(" "));
    if (tokens.length >= 2) aliases.add(tokens.slice(0, 2).join(" "));
    for (const token of tokens) {
      if (token.length >= 5 && !cloneSocietyNoiseToken(token)) aliases.add(token);
    }
  }
  return Array.from(aliases).filter((alias) => {
    if (alias.length < 3) return false;
    const aliasTokens = alias.split(/\s+/).filter(Boolean);
    if (aliasTokens.length === 0) return false;
    const specificTokens = aliasTokens.filter((token) => !cloneSocietyNoiseToken(token));
    return specificTokens.length > 0;
  });
}

function cloneDistinctiveTokensFromText(value: string): string[] {
  return normalizeName(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !cloneSocietyNoiseToken(token));
}

function cloneKeywordLines(lines: string[]): string[] {
  const keywords = ["gavinana", "firenze", "verona"];
  return lines
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .filter((line) => {
      const n = normalizeName(line);
      return keywords.some((k) => n.includes(k));
    })
    .slice(0, 120);
}

const CLONE_VERONA_LAYOUT_DIAG_KEYWORDS = [
  "girone m",
  "girone n",
  "girone p",
  "girone gold a",
  "girone gold b",
  "union brescia",
  "trento",
  "carpi",
  "renate",
  "como",
  "alcione",
  "sesti di finale",
  "triangolari di semifinale",
  "triangolare 1",
  "triangolare 2",
  "finali",
] as const;

function cloneLineTextDiagnostics(rawText: string, normalizedOverride?: string): {
  rawText: string;
  normalizedText: string;
  hasTab: boolean;
  hasMultipleSpaces: boolean;
  containsDash: boolean;
} {
  const raw = String(rawText ?? "");
  const normalizedText = normalizedOverride ?? raw.replace(/\s+/g, " ").trim();
  return {
    rawText: raw,
    normalizedText,
    hasTab: /\t/.test(raw),
    hasMultipleSpaces: /\s{2,}/.test(raw),
    containsDash: /[-\u2013\u2014]/.test(raw),
  };
}

function cloneMatchVeronaLayoutDiagKeyword(line: string): string | null {
  const n = normalizeName(line);
  for (const keyword of CLONE_VERONA_LAYOUT_DIAG_KEYWORDS) {
    if (n.includes(normalizeName(keyword))) return keyword;
  }
  return null;
}

function cloneBuildPdfLayoutLineRecord(input: {
  page: number | null;
  y: number | null;
  lineIndex: number;
  source: ClonePdfLayoutLineRecord["source"];
  rawText: string;
  normalizedText?: string;
}): ClonePdfLayoutLineRecord {
  const diag = cloneLineTextDiagnostics(input.rawText, input.normalizedText);
  return {
    page: input.page,
    y: input.y,
    lineIndex: input.lineIndex,
    source: input.source,
    ...diag,
  };
}

function cloneLogVeronaPdfLayoutDiagnostics(input: {
  allPageLines: string[];
  workingLines: string[];
  layoutMeta?: ClonePdfLayoutMeta | null;
}): void {
  console.log("[CLONE-RUNTIME-CHECK] layout diagnostics allPageLines count", input.allPageLines.length);
  console.log(
    "[CLONE-RUNTIME-CHECK] layout diagnostics allPageLines dump JSON",
    JSON.stringify(input.allPageLines, null, 2),
  );
  console.log("[CLONE-RUNTIME-CHECK] layout diagnostics workingLines count", input.workingLines.length);
  console.log(
    "[CLONE-RUNTIME-CHECK] layout diagnostics workingLines dump JSON",
    JSON.stringify(input.workingLines, null, 2),
  );

  const keywordHits: Array<ClonePdfLayoutLineRecord & { matchedKeyword: string }> = [];
  for (const record of input.layoutMeta?.allPageRecords ?? []) {
    const matchedKeyword =
      cloneMatchVeronaLayoutDiagKeyword(record.normalizedText) ?? cloneMatchVeronaLayoutDiagKeyword(record.rawText);
    if (matchedKeyword) keywordHits.push({ ...record, matchedKeyword });
  }
  for (let lineIndex = 0; lineIndex < input.workingLines.length; lineIndex += 1) {
    const line = input.workingLines[lineIndex] ?? "";
    const matchedKeyword = cloneMatchVeronaLayoutDiagKeyword(line);
    if (!matchedKeyword) continue;
    keywordHits.push({
      ...cloneBuildPdfLayoutLineRecord({
        page: null,
        y: null,
        lineIndex,
        source: "workingLines",
        rawText: line,
        normalizedText: line,
      }),
      matchedKeyword,
    });
  }
  for (const record of input.layoutMeta?.syntheticRecords ?? []) {
    const matchedKeyword =
      cloneMatchVeronaLayoutDiagKeyword(record.normalizedText) ?? cloneMatchVeronaLayoutDiagKeyword(record.rawText);
    if (matchedKeyword) keywordHits.push({ ...record, matchedKeyword });
  }
  console.log(
    "[CLONE-RUNTIME-CHECK] layout diagnostics keyword hits JSON",
    JSON.stringify(keywordHits, null, 2),
  );
  console.log(
    "[CLONE-RUNTIME-CHECK] layout diagnostics synthetic lines JSON",
    JSON.stringify(input.layoutMeta?.syntheticRecords ?? [], null, 2),
  );

  const summarizeBucket = (
    label: string,
    records: ClonePdfLayoutLineRecord[],
    workingSubset: string[],
  ) => {
    const withSeparators = records.filter((record) => record.hasTab || record.hasMultipleSpaces);
    console.log(
      `[CLONE-RUNTIME-CHECK] layout comparison ${label} JSON`,
      JSON.stringify(
        {
          allPageCount: records.length,
          allPageWithSeparators: withSeparators.length,
          allPageSample: records.slice(0, 60),
          workingCount: workingSubset.length,
          workingSample: workingSubset.slice(0, 60).map((line) => cloneLineTextDiagnostics(line)),
        },
        null,
        2,
      ),
    );
  };

  const allPageRecords = input.layoutMeta?.allPageRecords ?? [];
  summarizeBucket(
    "gold allPage vs working",
    allPageRecords.filter((record) => /\bgirone\s+gold\b/i.test(record.normalizedText)),
    input.workingLines.filter((line) => /\bgirone\s+gold\b/i.test(line)),
  );
  summarizeBucket(
    "m-v allPage vs working",
    allPageRecords.filter((record) => /\bgirone\s+[m-v]\b/i.test(record.normalizedText)),
    input.workingLines.filter((line) => /\bgirone\s+[m-v]\b/i.test(line)),
  );
}

function clonePhaseLabelForFutureGroup(groupName: string): string {
  const n = normalizeName(groupName);
  if (n.startsWith("girone gold")) return "Gold";
  if (n.startsWith("girone argento")) return "Argento";
  if (/^girone\s+[m-v]$/.test(n)) return "2ª fase qualificazioni";
  if (n.startsWith("triangolare") || n.startsWith("quadrangolare")) return "Triangolari di semifinale";
  if (n === "sesti di finale") return "Sesti di finale";
  if (n === "finali") return "Finali";
  return "Fase futura";
}

function cloneNormalizeFutureLayoutCell(cell: string): string {
  return String(cell ?? "").replace(/\s+/g, " ").trim();
}

function cloneCellHasFutureHeaderPayload(cell: string): boolean {
  const trimmed = cloneNormalizeFutureLayoutCell(cell);
  if (!trimmed) return true;
  const n = normalizeName(trimmed);
  if (/\bclassificat[aoe]?\b/.test(n)) return true;
  if (/\bvincente\s+gara\b/.test(n)) return true;
  if (/\b\d+\s*\^/.test(trimmed)) return true;
  if (/[-\u2013\u2014]/.test(trimmed)) return true;
  if (/\bgara\b/.test(n) && !/^girone\s+[m-v]$/i.test(trimmed)) return true;
  const gironeCount = (trimmed.match(/\bgirone\b/gi) ?? []).length;
  const triCount = (trimmed.match(/\btriangolare\b/gi) ?? []).length;
  const quadCount = (trimmed.match(/\bquadrangolare\b/gi) ?? []).length;
  if (gironeCount > 1 || triCount > 1 || quadCount > 1) return true;
  if ((gironeCount > 0 && triCount > 0) || (gironeCount > 0 && quadCount > 0)) return true;
  return false;
}

function cloneExtractFuturePhaseTitleFromCell(cell: string): string | null {
  const trimmed = cloneNormalizeFutureLayoutCell(cell);
  if (!trimmed || cloneCellHasFutureHeaderPayload(trimmed)) return null;
  if (/^triangolari\s+di\s+semifinale$/i.test(trimmed)) return "Triangolari di semifinale";
  if (/^sesti\s+di\s+finale$/i.test(trimmed)) return "Sesti di finale";
  if (/^finali$/i.test(trimmed)) return "Finali";
  return null;
}

function cloneExtractFutureHeaderGroupFromCell(cell: string): string | null {
  const trimmed = cloneNormalizeFutureLayoutCell(cell);
  if (!trimmed || cloneCellHasFutureHeaderPayload(trimmed)) return null;
  if (cloneExtractFuturePhaseTitleFromCell(trimmed)) return null;

  const triOnly = trimmed.match(/^(triangolare|quadrangolare)\s+(\d+)\s*$/i);
  if (triOnly) {
    return cloneRosterHeaderFromTriQuad(String(triOnly[1] ?? ""), String(triOnly[2] ?? "")).group;
  }

  const gironeGold = trimmed.match(/^girone\s+gold\s+([a-z])\s*$/i);
  if (gironeGold) return `Girone GOLD ${String(gironeGold[1] ?? "").toUpperCase()}`;

  const gironeArgento = trimmed.match(/^girone\s+argento\s+([a-z])\s*$/i);
  if (gironeArgento) return `Girone ARGENTO ${String(gironeArgento[1] ?? "").toUpperCase()}`;

  const gironeLetter = trimmed.match(/^girone\s+([m-v])\s*$/i);
  if (gironeLetter) return `Girone ${String(gironeLetter[1] ?? "").toUpperCase()}`;

  return null;
}

function cloneIsPureFutureLayoutHeaderCell(cell: string): boolean {
  return cloneExtractFuturePhaseTitleFromCell(cell) != null || cloneExtractFutureHeaderGroupFromCell(cell) != null;
}

function cloneSplitFutureLayoutCells(raw: string): string[] {
  const text = String(raw ?? "");
  if (/\t/.test(text)) return text.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  return [text.trim()].filter(Boolean);
}

function cloneIsFutureLayoutHeaderRecord(record: ClonePdfLayoutLineRecord): boolean {
  if (record.page == null || record.y == null) return false;
  const raw = String(record.rawText ?? "");
  const cells = cloneSplitFutureLayoutCells(raw);
  if (cells.length === 0) return false;
  if (!/\t/.test(raw)) {
    if (cells.length !== 1) return false;
    return cloneIsPureFutureLayoutHeaderCell(cells[0] ?? "");
  }
  return cells.every((cell) => cloneIsPureFutureLayoutHeaderCell(cell));
}

function cloneDetectFutureHeadersFromRecord(record: ClonePdfLayoutLineRecord): CloneFutureLayoutHeader[] {
  if (record.page == null || record.y == null) return [];
  if (!cloneIsFutureLayoutHeaderRecord(record)) return [];
  const raw = String(record.rawText ?? "");
  const cells = cloneSplitFutureLayoutCells(raw);
  const headers: CloneFutureLayoutHeader[] = [];
  for (const cell of cells) {
    const phaseTitle = cloneExtractFuturePhaseTitleFromCell(cell);
    if (phaseTitle) {
      headers.push({
        page: record.page,
        y: record.y,
        groupName: phaseTitle,
        phase: phaseTitle,
        rawText: raw,
        cellText: cell,
        isPhaseTitle: true,
        lineIndex: record.lineIndex,
        hasTab: record.hasTab,
      });
      continue;
    }
    const groupName = cloneExtractFutureHeaderGroupFromCell(cell);
    if (!groupName) continue;
    headers.push({
      page: record.page,
      y: record.y,
      groupName,
      phase: clonePhaseLabelForFutureGroup(groupName),
      rawText: raw,
      cellText: cell,
      isPhaseTitle: false,
      lineIndex: record.lineIndex,
      hasTab: record.hasTab,
    });
  }
  return headers;
}

function cloneBuildFutureLayoutIntervals(headers: CloneFutureLayoutHeader[]): CloneFutureLayoutInterval[] {
  const groupHeaders = headers.filter((header) => !header.isPhaseTitle);
  const sorted = [...groupHeaders].sort((a, b) => a.page - b.page || b.y - a.y || a.groupName.localeCompare(b.groupName));
  const headerRowYsByPage = new Map<number, number[]>();
  for (const header of sorted) {
    const rows = headerRowYsByPage.get(header.page) ?? [];
    if (!rows.some((y) => Math.abs(y - header.y) < 0.01)) rows.push(header.y);
    headerRowYsByPage.set(header.page, rows);
  }
  for (const [page, rows] of headerRowYsByPage.entries()) {
    rows.sort((a, b) => b - a);
    headerRowYsByPage.set(page, rows);
  }

  const intervals: CloneFutureLayoutInterval[] = [];
  for (const header of sorted) {
    const rowYs = headerRowYsByPage.get(header.page) ?? [];
    const rowIndex = rowYs.findIndex((y) => Math.abs(y - header.y) < 0.01);
    const nextRowY = rowIndex >= 0 && rowIndex < rowYs.length - 1 ? rowYs[rowIndex + 1] ?? null : null;
    intervals.push({
      groupName: header.groupName,
      phase: header.phase,
      page: header.page,
      yHeader: header.y,
      yMinExclusive: nextRowY,
      yMaxExclusive: header.y,
      rawHeaderText: header.rawText,
    });
  }
  return intervals;
}

function cloneBuildFutureStructurePhasesDraft(headers: CloneFutureLayoutHeader[]): CloneFuturePhaseStructure[] {
  const phases: CloneFuturePhaseStructure[] = [];
  const phaseIndex = new Map<string, CloneFuturePhaseStructure>();
  let orderCounter = 0;

  const ensurePhase = (phaseLabel: string): CloneFuturePhaseStructure => {
    const key = normalizeName(phaseLabel);
    let phase = phaseIndex.get(key);
    if (!phase) {
      orderCounter += 1;
      phase = { phase: phaseLabel, order: orderCounter, groups: [] };
      phaseIndex.set(key, phase);
      phases.push(phase);
    }
    return phase;
  };

  for (const header of headers) {
    const phase = ensurePhase(header.phase);
    if (header.isPhaseTitle) continue;
    if (phase.groups.some((group) => normalizeName(group.name) === normalizeName(header.groupName))) continue;
    phase.groups.push({
      name: header.groupName,
      compositionSlots: [],
      futureMatches: [],
    });
  }

  phases.sort((a, b) => a.order - b.order);
  return phases;
}

function cloneBuildFutureStructureFromLayoutMeta(layoutMeta: ClonePdfLayoutMeta): CloneFutureStructureDraft {
  const headers: CloneFutureLayoutHeader[] = [];
  for (const record of layoutMeta.allPageRecords) {
    if (!cloneIsFutureLayoutHeaderRecord(record)) continue;
    headers.push(...cloneDetectFutureHeadersFromRecord(record));
  }

  const dedupedHeaders: CloneFutureLayoutHeader[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const key = `${header.page}|${header.y}|${normalizeName(header.groupName)}|${header.isPhaseTitle ? "phase" : "group"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedHeaders.push(header);
  }

  dedupedHeaders.sort((a, b) => a.page - b.page || b.y - a.y || a.groupName.localeCompare(b.groupName));

  const intervals = cloneBuildFutureLayoutIntervals(dedupedHeaders);
  const phases = cloneBuildFutureStructurePhasesDraft(dedupedHeaders);

  const draft: CloneFutureStructureDraft = {
    headers: dedupedHeaders,
    intervals,
    phases,
  };

  console.log(
    "[CLONE-RUNTIME-CHECK] future layout headers detected",
    JSON.stringify(
      dedupedHeaders.map((header) => ({
        page: header.page,
        y: header.y,
        groupName: header.groupName,
        phase: header.phase,
        isPhaseTitle: header.isPhaseTitle,
        hasTab: header.hasTab,
        cellText: header.cellText,
        rawText: header.rawText,
      })),
      null,
      2,
    ),
  );
  console.log("[CLONE-RUNTIME-CHECK] future layout intervals", JSON.stringify(intervals, null, 2));
  console.log("[CLONE-RUNTIME-CHECK] future structure draft JSON", JSON.stringify(phases, null, 2));

  return draft;
}

function cloneProgramSummary(program: TournamentProgramEntry[]): {
  groups: string[];
  teamsByGroup: Record<string, string[]>;
  fixtures: Array<{
    date: string;
    homeTeam: string;
    awayTeam: string;
    group: string | null;
    phase: string | null;
  }>;
  normalizedFixtures: string[];
} {
  const groups = new Set<string>();
  const teamsByGroup: Record<string, Set<string>> = {};
  const fixtures = program.map((entry) => {
    const group = String(entry.group ?? "").trim() || null;
    const phase = String(entry.phase ?? "").trim() || null;
    if (group) groups.add(group);
    const groupKey = group ?? "Senza gruppo";
    if (!teamsByGroup[groupKey]) teamsByGroup[groupKey] = new Set<string>();
    if (String(entry.homeTeam ?? "").trim()) teamsByGroup[groupKey]!.add(String(entry.homeTeam).trim());
    if (String(entry.awayTeam ?? "").trim()) teamsByGroup[groupKey]!.add(String(entry.awayTeam).trim());
    return {
      date: entry.date,
      homeTeam: entry.homeTeam,
      awayTeam: entry.awayTeam,
      group,
      phase,
    };
  });
  const normalizedFixtures = program.map(
    (entry) =>
      `${entry.date}|${normalizeName(String(entry.homeTeam ?? ""))}|${normalizeName(String(entry.awayTeam ?? ""))}|${normalizeName(String(entry.group ?? entry.phase ?? ""))}`,
  );
  return {
    groups: Array.from(groups),
    teamsByGroup: Object.fromEntries(Object.entries(teamsByGroup).map(([k, v]) => [k, Array.from(v)])),
    fixtures,
    normalizedFixtures,
  };
}

function cloneSegmentTournamentLinesFromPdf(
  lines: string[],
): { segmentedLines: string[]; extractedFixtures: string[] } {
  const segmentedLines: string[] = [];
  const extractedFixtures: string[] = [];
  const fixtureWithDateRe = /(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+(\d{1,2}[:.]\d{2})\s+((?:(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[\p{L}0-9]+)\s+)?([\p{L}0-9.' ]{2,80})\s*[-\u2013\u2014]\s*([\p{L}0-9.' ]{2,80})(?=\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s+\d{1,2}[:.]\d{2}\b|$)/giu;
  const fixtureWithTimeRe = /(\d{1,2}[:.]\d{2})\s+((?:(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[\p{L}0-9]+)\s+)?([\p{L}0-9.' ]{2,80})\s*[-\u2013\u2014]\s*([\p{L}0-9.' ]{2,80})(?=\s+\d{1,2}[:.]\d{2}\b|$)/giu;

  for (const raw of lines) {
    const normalized = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    let added = false;
    const dateMatches = Array.from(normalized.matchAll(fixtureWithDateRe));
    if (dateMatches.length > 0) {
      for (const match of dateMatches) {
        const date = String(match[1] ?? "").trim();
        const time = String(match[2] ?? "").trim();
        const group = String(match[3] ?? "").trim();
        const home = cleanTournamentTeamName(String(match[4] ?? "").trim());
        const away = cleanTournamentTeamName(String(match[5] ?? "").trim());
        if (!home || !away) continue;
        const fixture = `${date} ${time} ${group ? `${group} ` : ""}${home} - ${away}`.replace(/\s+/g, " ").trim();
        segmentedLines.push(fixture);
        extractedFixtures.push(fixture);
      }
      added = true;
    }
    if (!added) {
      const timeMatches = Array.from(normalized.matchAll(fixtureWithTimeRe));
      if (timeMatches.length > 0) {
        for (const match of timeMatches) {
          const time = String(match[1] ?? "").trim();
          const group = String(match[2] ?? "").trim();
          const home = cleanTournamentTeamName(String(match[3] ?? "").trim());
          const away = cleanTournamentTeamName(String(match[4] ?? "").trim());
          if (!home || !away) continue;
          const fixture = `${time} ${group ? `${group} ` : ""}${home} - ${away}`.replace(/\s+/g, " ").trim();
          segmentedLines.push(fixture);
          extractedFixtures.push(fixture);
        }
        added = true;
      }
    }
    if (!added) segmentedLines.push(normalized);
  }

  return {
    segmentedLines: segmentedLines.length > 0 ? segmentedLines : lines,
    extractedFixtures,
  };
}

function cloneProgramEntryMergeKey(entry: TournamentProgramEntry): string {
  return [
    entry.date,
    normalizeName(String(entry.homeTeam ?? "")),
    normalizeName(String(entry.awayTeam ?? "")),
    normalizeName(String(entry.group ?? "")),
  ].join("|");
}

function cloneBuildProgramFromPreprocessedFixtures(lines: string[]): TournamentProgramEntry[] {
  const entries: TournamentProgramEntry[] = [];
  const fixtureWithDateRe = /^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+(\d{1,2}[:.]\d{2})\s+((?:(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[\p{L}0-9]+)\s+)?(.+?)\s*[-\u2013\u2014]\s*(.+)$/iu;
  const fixtureWithTimeRe = /^(\d{1,2}[:.]\d{2})\s+((?:(?:girone|raggruppament[oi]|triangolare|quadrangolare)\s+[\p{L}0-9]+)\s+)?(.+?)\s*[-\u2013\u2014]\s*(.+)$/iu;
  let currentDateIso: string | null = null;
  for (const raw of lines) {
    const line = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const withDate = line.match(fixtureWithDateRe);
    if (withDate) {
      const dateIso = parseDateTimeIso(`${withDate[1]} ${String(withDate[2]).replace(".", ":")}`);
      if (!dateIso) continue;
      currentDateIso = dateIso;
      const group = String(withDate[3] ?? "").trim() || "Gironi";
      const homeTeam = cleanTournamentTeamName(String(withDate[4] ?? ""));
      const awayTeam = cleanTournamentTeamName(String(withDate[5] ?? ""));
      if (!homeTeam || !awayTeam) continue;
      entries.push({
        id: `${dateIso}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}|${normalizeName(group)}`,
        date: dateIso,
        homeTeam,
        awayTeam,
        group,
        phase: "Gironi",
        kind: "match",
      });
      continue;
    }
    const withTime = line.match(fixtureWithTimeRe);
    if (withTime && currentDateIso) {
      const base = new Date(currentDateIso);
      if (Number.isNaN(base.getTime())) continue;
      const [hRaw, mRaw] = String(withTime[1]).replace(".", ":").split(":");
      base.setHours(Number(hRaw), Number(mRaw), 0, 0);
      const dateIso = base.toISOString();
      const group = String(withTime[2] ?? "").trim() || "Gironi";
      const homeTeam = cleanTournamentTeamName(String(withTime[3] ?? ""));
      const awayTeam = cleanTournamentTeamName(String(withTime[4] ?? ""));
      if (!homeTeam || !awayTeam) continue;
      entries.push({
        id: `${dateIso}|${normalizeName(homeTeam)}|${normalizeName(awayTeam)}|${normalizeName(group)}`,
        date: dateIso,
        homeTeam,
        awayTeam,
        group,
        phase: "Gironi",
        kind: "match",
      });
    }
  }
  const byKey = new Map<string, TournamentProgramEntry>();
  for (const entry of entries) byKey.set(cloneProgramEntryMergeKey(entry), entry);
  return Array.from(byKey.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function cloneProgramLooksSuspicious(program: TournamentProgramEntry[], extractedCount: number): boolean {
  if (extractedCount < 4) return false;
  if (program.length <= 1) return true;
  const sameTeamRows = program.filter((entry) => normalizeName(entry.homeTeam) === normalizeName(entry.awayTeam)).length;
  return sameTeamRows >= Math.ceil(program.length * 0.5);
}

function cloneMergeProgramWithPreprocessed(
  structured: TournamentProgramEntry[] | undefined,
  preprocessed: TournamentProgramEntry[],
): TournamentProgramEntry[] {
  const structuredSafe = structured ?? [];
  if (preprocessed.length === 0) return structuredSafe;
  if (cloneProgramLooksSuspicious(structuredSafe, preprocessed.length)) return preprocessed;
  const merged = new Map<string, TournamentProgramEntry>();
  for (const entry of structuredSafe) merged.set(cloneProgramEntryMergeKey(entry), entry);
  for (const entry of preprocessed) {
    const key = cloneProgramEntryMergeKey(entry);
    if (!merged.has(key)) merged.set(key, entry);
  }
  return Array.from(merged.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function cloneIsFuturePhaseGroupLabel(groupLabel: string): boolean {
  const n = normalizeName(groupLabel);
  if (/^girone\s+[m-v]$/.test(n)) return true;
  if (/^girone\s+argento\b/.test(n)) return true;
  if (/^girone\s+gold\b/.test(n)) return true;
  if (/^triangolare\s+\d+$/.test(n)) return true;
  if (/^quadrangolare\s+\d+$/.test(n)) return true;
  return false;
}

function cloneRosterHeaderFromTriQuad(kindRaw: string, numRaw: string): { group: string; phase: string } {
  const kind = kindRaw.toLowerCase();
  const num = String(numRaw ?? "").trim();
  return {
    group: kind === "triangolare" ? `Triangolare ${num}` : `Quadrangolare ${num}`,
    phase: kind === "triangolare" ? "Triangolari" : "Quadrangolari",
  };
}

function cloneExtractTriangolareHeader(line: string): { group: string; phase: string } | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (/\btriangolari\s+di\s+semifinale\b/i.test(normalizeName(trimmed))) return null;
  const match = trimmed.match(/\b(triangolare|quadrangolare)\s+(\d+)\b/i);
  if (!match) return null;
  return cloneRosterHeaderFromTriQuad(String(match[1] ?? ""), String(match[2] ?? ""));
}

function cloneExtractFutureGroupHeader(line: string): { group: string; phase: string } | null {
  if (cloneExtractTriangolareHeader(line)) return null;
  const trimmed = line.replace(/\s+/g, " ").trim();
  const groupLabel = extractTournamentGroupLabel(trimmed);
  if (!groupLabel || !cloneIsFuturePhaseGroupLabel(groupLabel)) return null;
  return { group: groupLabel, phase: detectTournamentPhase(trimmed, null) ?? "Fase futura" };
}

function cloneExtractRosterGroupHeader(line: string): { group: string; phase: string } | null {
  return cloneExtractTriangolareHeader(line) ?? cloneExtractFutureGroupHeader(line);
}

function cloneIsPhaseTitleLine(line: string): string | null {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const n = normalizeName(trimmed);
  if (cloneExtractTriangolareHeader(trimmed)) return null;
  if (cloneExtractFutureGroupHeader(trimmed)) return null;
  if (/\bvincente\s+gara\b/.test(n)) return null;
  if (/\bclassificat[aoe]?\b/.test(n)) return null;
  if (/[-\u2013\u2014]/.test(trimmed)) return null;
  if (/\btriangolari\s+di\s+semifinale\b/.test(n) && trimmed.length < 72) return "Triangolari di semifinale";
  if ((n === "sesti di finale" || (/\bsesti\s+di\s+finale\b/.test(n) && trimmed.length < 44)) && !/\bgirone\b/.test(n)) {
    return "Sesti di finale";
  }
  if ((n === "finali" || (/\bfinali\b/.test(n) && trimmed.length < 36)) && !/\bgirone\b/.test(n)) return "Finali";
  return null;
}

function cloneIsRosterSectionStopLine(line: string): boolean {
  const trimmed = line.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  const n = normalizeName(trimmed);
  if (/\bvincente\s+gara\b/.test(n)) return false;
  if (cloneIsRosterFixturePlaceholderLine(trimmed)) return false;
  if (cloneExtractTriangolareHeader(trimmed) || cloneExtractFutureGroupHeader(trimmed)) return false;
  if (n === "gara" || /^gara\s*\d{0,2}$/i.test(trimmed)) return true;
  if (/\bpartite\b/.test(n) && trimmed.length < 40) return true;
  if (/\bdata\s+ora\s+campo\b/.test(n)) return true;
  if (/\bdata\b/.test(n) && /\bora\b/.test(n) && trimmed.length < 64) return true;
  if (/\bcampo\b/.test(n) && (/\bdata\b/.test(n) || /\bora\b/.test(n)) && trimmed.length < 64) return true;
  if (/^(?:sq|pt|gf|gs|dr)\b/.test(n) || /\bsq\s+pt\b/.test(n)) return true;
  if (/\brisultat[oi]\b/.test(n) && trimmed.length < 32 && !/\bclassificat/.test(n)) return true;
  return false;
}

function cloneSideLooksLikePlacementOrWinner(side: string): boolean {
  const clean = normalizeTournamentPlacementText(side.replace(/\s+/g, " ").trim());
  if (!clean) return false;
  const n = normalizeName(clean);
  if (/\bvincente\s+gara\s+\d+\b/.test(n)) return true;
  if (parseTournamentCompositionRefs(clean).length > 0) return true;
  if (isTournamentReferenceCodeLine(clean)) return true;
  if (/\b\d+\s*(?:\^|°|º|a|o)?\s*(?:classificat[aoe]?)?\s*girone\s+[a-z0-9]+\b/i.test(clean)) return true;
  return false;
}

function cloneIsRosterFixturePlaceholderLine(line: string): boolean {
  const clean = line.replace(/\s+/g, " ").trim();
  if (!/[-\u2013\u2014]/.test(clean)) return false;
  if (isTournamentReferenceCodeLine(clean)) return true;
  const parts = clean.split(/\s*[-\u2013\u2014]\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  const left = parts[0] ?? "";
  const right = parts[parts.length - 1] ?? "";
  return cloneSideLooksLikePlacementOrWinner(left) && cloneSideLooksLikePlacementOrWinner(right);
}

function cloneHasReliableColumnSeparator(rawLine: string): boolean {
  const raw = String(rawLine ?? "");
  if (/\t/.test(raw)) return true;
  return /\s{2,}/.test(raw);
}

function cloneSplitSeedPartsFromRaw(rawLine: string): string[] {
  if (!cloneHasReliableColumnSeparator(rawLine)) return [];
  const parts = (/\t/.test(rawLine) ? rawLine.split(/\t+/) : rawLine.split(/\s{2,}/))
    .map((part) => cleanTournamentTeamName(part))
    .filter((part) => part.length >= 3 && looksLikeStandaloneTournamentTeamLine(part));
  return parts;
}

function cloneIsAmbiguousFusedSeedLine(rawLine: string, normalizedLine: string, currentGroup: string | null): boolean {
  if (cloneHasReliableColumnSeparator(rawLine)) return false;
  if (!cloneIsRosterSeedTeamLine(normalizedLine)) return false;
  const groupNorm = normalizeName(currentGroup ?? "");
  if (!/^girone\s+gold\s+[a-z]$/.test(groupNorm)) return false;
  const words = cleanTournamentTeamName(normalizedLine).split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

function cloneIsRosterSlotLine(line: string): boolean {
  if (cloneIsRosterFixturePlaceholderLine(line)) return false;
  const clean = normalizeTournamentPlacementText(line.replace(/\s+/g, " ").trim());
  if (!clean || isPageFooterOrNoise(clean)) return false;
  if (/[-\u2013\u2014]/.test(clean)) return false;
  const n = normalizeName(clean);
  if (/\b\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?\b/.test(clean)) return false;
  if (/\bvincente\s+gara\b/.test(n)) return true;
  if (isTournamentReferenceCodeLine(clean)) return true;
  if (/\bclassificat[aoe]?\b/.test(n)) return true;
  if (/\b\d+\s*\^?\s*(?:classificat[aoe]?|class\.?)?\s*(?:del\s+|della\s+|di\s+)?(?:girone\s+)?[a-z0-9]{1,3}(?:\s+(?:oro|argento|bronzo|platino|gold|silver|bronze|platinum))?\b/i.test(clean)) {
    return true;
  }
  return false;
}

function cloneNormalizeRosterSlotLabel(line: string): string {
  const clean = normalizeTournamentPlacementText(line.replace(/\s+/g, " ").trim());
  const refs = parseTournamentCompositionRefs(clean);
  if (refs.length > 0) return refs[0] ?? clean;
  const n = normalizeName(clean);
  const winner = n.match(/\bvincente\s+gara\s+(\d+)\b/);
  if (winner) return `Vincente gara ${winner[1]}`;
  if (isTournamentReferenceCodeLine(clean)) {
    const shortRefs = parseTournamentCompositionRefs(`1^ classificata ${clean}`);
    if (shortRefs.length > 0) return shortRefs[0] ?? clean;
  }
  return cleanTournamentTeamName(clean);
}

function cloneIsRosterSeedTeamLine(line: string): boolean {
  const clean = cleanTournamentTeamName(line.replace(/\s+/g, " ").trim());
  if (!clean || cloneIsRosterSlotLine(line)) return false;
  if (!looksLikeStandaloneTournamentTeamLine(clean)) return false;
  if (isSuspiciousTournamentProgramSide(clean)) return false;
  if (/\bclassificat[aoe]?\b/.test(normalizeName(clean))) return false;
  return clean.length >= 3 && clean.length <= 48;
}

function cloneCompositionSlotsByGroup(program: TournamentProgramEntry[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const entry of program) {
    if (entry.kind !== "composition") continue;
    const group = String(entry.group ?? "Senza gruppo").trim();
    if (!out[group]) out[group] = [];
    const slot = String(entry.homeTeam ?? "").trim();
    if (slot) out[group].push(slot);
  }
  return out;
}

function cloneFuturePhaseGroupsSummary(byGroup: Record<string, string[]>): Record<string, string[]> {
  const summary: Record<string, string[]> = {};
  for (const [group, slots] of Object.entries(byGroup)) {
    if (cloneIsFuturePhaseGroupLabel(group)) summary[group] = slots;
  }
  return summary;
}

type CloneRosterAttachLog = {
  rosterStops: Array<{ group: string; line: string }>;
  phaseTitles: Array<{ phase: string; previousGroup: string | null }>;
  fixtureSkipped: Array<{ group: string; line: string }>;
  compositionAdded: Array<{ group: string; slot: string }>;
  compositionSkipped: Array<{ group: string; reason: string }>;
  seedSplits: Array<{ group: string; parts: string[]; rawSnippet: string }>;
  seedAmbiguous: Array<{ group: string; line: string; reason: string }>;
  triangolareOpened: Array<{ group: string; line: string }>;
};

function cloneLogCompositionAttachDiagnostics(
  program: TournamentProgramEntry[],
  addedCount: number,
  attachLog: CloneRosterAttachLog,
): void {
  const byGroup = cloneCompositionSlotsByGroup(program);
  const compositionCount = program.filter((entry) => entry.kind === "composition").length;
  console.log("[CLONE-RUNTIME-CHECK] composition slots parsed count", compositionCount);
  console.log("[CLONE-RUNTIME-CHECK] composition slots added count", addedCount);
  console.log("[CLONE-RUNTIME-CHECK] roster section stop JSON", JSON.stringify(attachLog.rosterStops, null, 2));
  console.log("[CLONE-RUNTIME-CHECK] phase title detected JSON", JSON.stringify(attachLog.phaseTitles, null, 2));
  console.log(
    "[CLONE-RUNTIME-CHECK] future fixture placeholder skipped JSON",
    JSON.stringify(attachLog.fixtureSkipped, null, 2),
  );
  console.log("[CLONE-RUNTIME-CHECK] composition slot added JSON", JSON.stringify(attachLog.compositionAdded, null, 2));
  console.log(
    "[CLONE-RUNTIME-CHECK] composition slot skipped JSON",
    JSON.stringify(attachLog.compositionSkipped, null, 2),
  );
  console.log("[CLONE-RUNTIME-CHECK] seed split from raw JSON", JSON.stringify(attachLog.seedSplits, null, 2));
  console.log("[CLONE-RUNTIME-CHECK] seed ambiguous skipped JSON", JSON.stringify(attachLog.seedAmbiguous, null, 2));
  console.log("[CLONE-RUNTIME-CHECK] triangolare header opened JSON", JSON.stringify(attachLog.triangolareOpened, null, 2));
  console.log("[CLONE-RUNTIME-CHECK] final composition slots by group JSON", JSON.stringify(byGroup, null, 2));
  console.log(
    "[CLONE-RUNTIME-CHECK] future phase groups M-V ARGENTO GOLD summary JSON",
    JSON.stringify(cloneFuturePhaseGroupsSummary(byGroup), null, 2),
  );
}

function cloneAttachGroupRosterCompositions(
  lines: string[],
  program: TournamentProgramEntry[],
  options: { fallbackDateIso?: string | null } = {},
): TournamentProgramEntry[] {
  const linePairs = lines
    .map((raw) => {
      const rawLine = String(raw ?? "");
      return { rawLine, line: rawLine.replace(/\s+/g, " ").trim() };
    })
    .filter((pair) => pair.line);
  const existingCompositionKeys = new Set<string>();
  for (const entry of program) {
    if (entry.kind !== "composition") continue;
    const key = `${normalizeName(String(entry.group ?? ""))}|${normalizeName(String(entry.homeTeam ?? ""))}`;
    existingCompositionKeys.add(key);
  }
  const additions: TournamentProgramEntry[] = [];
  let currentGroup: string | null = null;
  let currentPhase: string | null = null;
  let inFutureRoster = false;
  const attachLog: CloneRosterAttachLog = {
    rosterStops: [],
    phaseTitles: [],
    fixtureSkipped: [],
    compositionAdded: [],
    compositionSkipped: [],
    seedSplits: [],
    seedAmbiguous: [],
    triangolareOpened: [],
  };
  const dateIso =
    options.fallbackDateIso && !Number.isNaN(new Date(options.fallbackDateIso).getTime())
      ? options.fallbackDateIso
      : new Date(new Date().getFullYear(), 0, 1, 10, 0, 0, 0).toISOString();

  const pushComposition = (group: string, phase: string | null, slotLabel: string): void => {
    const homeTeam = normalizeTournamentPlacementText(slotLabel).slice(0, 120);
    if (!homeTeam) {
      attachLog.compositionSkipped.push({ group, reason: "empty slot label" });
      return;
    }
    const key = `${normalizeName(group)}|${normalizeName(homeTeam)}`;
    if (existingCompositionKeys.has(key)) {
      attachLog.compositionSkipped.push({ group, reason: `duplicate:${homeTeam}` });
      return;
    }
    existingCompositionKeys.add(key);
    additions.push({
      id: `composition|${normalizeName(group)}|${normalizeName(homeTeam)}`,
      date: dateIso,
      homeTeam,
      awayTeam: "da completare",
      phase: phase ?? "Fase futura",
      group,
      kind: "composition",
    });
    attachLog.compositionAdded.push({ group, slot: homeTeam });
  };

  const closeRoster = () => {
    inFutureRoster = false;
  };

  const processRosterBodyLine = (line: string, rawLine: string): boolean => {
    if (!inFutureRoster || !currentGroup) return false;

    if (cloneIsRosterSectionStopLine(line)) {
      attachLog.rosterStops.push({ group: currentGroup, line: line.slice(0, 120) });
      closeRoster();
      return true;
    }

    if (cloneIsRosterFixturePlaceholderLine(line)) {
      attachLog.fixtureSkipped.push({ group: currentGroup, line: line.slice(0, 120) });
      return true;
    }

    if (/\b\d{1,2}[:.]\d{2}\b/.test(line) && !cloneIsRosterSlotLine(line)) return true;

    if (cloneIsRosterSlotLine(line)) {
      pushComposition(currentGroup, currentPhase, cloneNormalizeRosterSlotLabel(line));
      return true;
    }

    const seedParts = cloneSplitSeedPartsFromRaw(rawLine);
    if (seedParts.length >= 2) {
      attachLog.seedSplits.push({
        group: currentGroup,
        parts: seedParts,
        rawSnippet: rawLine.slice(0, 120),
      });
      pushComposition(currentGroup, currentPhase, seedParts[0]!);
      attachLog.seedAmbiguous.push({
        group: currentGroup,
        line: line.slice(0, 120),
        reason: `second seed not assigned:${seedParts.slice(1).join(" | ")}`,
      });
      return true;
    }

    if (seedParts.length === 1) {
      attachLog.seedSplits.push({
        group: currentGroup,
        parts: seedParts,
        rawSnippet: rawLine.slice(0, 120),
      });
      pushComposition(currentGroup, currentPhase, seedParts[0]!);
      return true;
    }

    if (cloneIsAmbiguousFusedSeedLine(rawLine, line, currentGroup)) {
      attachLog.seedAmbiguous.push({
        group: currentGroup,
        line: line.slice(0, 120),
        reason: "no column separator (fused gold seed)",
      });
      return true;
    }

    if (cloneIsRosterSeedTeamLine(line)) {
      pushComposition(currentGroup, currentPhase, cleanTournamentTeamName(line));
      return true;
    }

    return false;
  };

  for (const { rawLine, line } of linePairs) {
    if (isPageFooterOrNoise(line)) continue;

    const phaseTitle = cloneIsPhaseTitleLine(line);
    if (phaseTitle) {
      attachLog.phaseTitles.push({ phase: phaseTitle, previousGroup: currentGroup });
      currentPhase = phaseTitle;
      currentGroup = null;
      closeRoster();
      continue;
    }

    const earlyGroup = extractTournamentGroupLabel(line);
    if (earlyGroup && !cloneIsFuturePhaseGroupLabel(earlyGroup)) {
      currentGroup = null;
      currentPhase = null;
      closeRoster();
      continue;
    }

    const triHeader = cloneExtractTriangolareHeader(line);
    if (triHeader) {
      currentGroup = triHeader.group;
      currentPhase = triHeader.phase;
      inFutureRoster = true;
      attachLog.triangolareOpened.push({ group: triHeader.group, line: line.slice(0, 120) });
      processRosterBodyLine(line, rawLine);
      continue;
    }

    const futureHeader = cloneExtractFutureGroupHeader(line);
    if (futureHeader) {
      currentGroup = futureHeader.group;
      currentPhase = futureHeader.phase;
      inFutureRoster = true;
      processRosterBodyLine(line, rawLine);
      continue;
    }

    if (processRosterBodyLine(line, rawLine)) continue;
  }

  if (additions.length === 0) return program;
  const merged = [...program, ...additions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  cloneLogCompositionAttachDiagnostics(merged, additions.length, attachLog);
  return merged;
}

function cloneCanonicalRecordsFromPreprocessed(program: TournamentProgramEntry[]): CloneCanonicalRecord[] {
  return program.map((entry) => ({
    id: `preprocessed|${cloneProgramEntryMergeKey(entry)}`,
    type: "match_fixture",
    date: entry.date,
    group: entry.group ?? null,
    phase: entry.phase ?? null,
    homeTeam: entry.homeTeam,
    awayTeam: entry.awayTeam,
    sourceEngine: "preprocessed",
    confidence: 82,
    evidence: "fixture estratta da pattern esplicito data/ora/girone/team-team",
  }));
}

function buildCloneDistinctiveClubTokens(sources: Array<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const source of sources) {
    for (const token of cloneDistinctiveTokensFromText(String(source ?? ""))) out.add(token);
  }
  return Array.from(out);
}

function collectCloneTournamentTeams(program: TournamentProgramEntry[]): string[] {
  const out = new Set<string>();
  for (const entry of program) {
    const home = cleanTournamentTeamName(String(entry.homeTeam ?? "")).trim();
    const away = cleanTournamentTeamName(String(entry.awayTeam ?? "")).trim();
    if (home && !isImageTournamentEmptyTeam(home)) out.add(home);
    if (away && !isImageTournamentEmptyTeam(away)) out.add(away);
  }
  return Array.from(out);
}

function collectCloneTournamentTeamTokens(program: TournamentProgramEntry[]): string[] {
  const out = new Set<string>();
  for (const team of collectCloneTournamentTeams(program)) {
    for (const token of cloneDistinctiveTokensFromText(team)) out.add(token);
  }
  return Array.from(out);
}

function enrichCloneAliasesFromTournamentTeams(
  aliases: string[],
  distinctiveClubTokens: string[],
  program: TournamentProgramEntry[],
): { aliases: string[]; tournamentTeams: string[]; matchedTournamentTeams: string[]; tournamentTeamTokens: string[] } {
  const tournamentTeams = collectCloneTournamentTeams(program);
  const tournamentTeamTokens = collectCloneTournamentTeamTokens(program);
  const matchedTournamentTeams = new Set<string>();
  const enriched = new Set(aliases);
  for (const team of tournamentTeams) {
    const teamNorm = normalizeName(team);
    if (!teamNorm) continue;
    const teamTokens = cloneDistinctiveTokensFromText(teamNorm);
    const matchesDistinctive = teamTokens.some((teamToken) =>
      distinctiveClubTokens.some(
        (clubToken) =>
          clubToken === teamToken ||
          (teamToken.startsWith(clubToken) || clubToken.startsWith(teamToken)) && Math.abs(teamToken.length - clubToken.length) <= 2,
      ),
    );
    if (!matchesDistinctive) continue;
    matchedTournamentTeams.add(team);
    enriched.add(teamNorm);
    for (const token of teamTokens) {
      if (token.length >= 4 && !cloneSocietyNoiseToken(token)) enriched.add(token);
    }
  }
  return {
    aliases: Array.from(enriched),
    tournamentTeams,
    matchedTournamentTeams: Array.from(matchedTournamentTeams),
    tournamentTeamTokens,
  };
}

function cloneRecognizedRowsFromTournamentProgram(
  program: TournamentProgramEntry[],
  aliases: string[],
  tournamentName: string,
  tournamentTitle: string | null,
): MatchImportRow[] {
  const rows: MatchImportRow[] = [];
  const seen = new Set<string>();
  for (const entry of program) {
    const leftOwn = tournamentAliasMatchesSide(normalizeName(entry.homeTeam), aliases);
    const rightOwn = tournamentAliasMatchesSide(normalizeName(entry.awayTeam), aliases);
    if (leftOwn === rightOwn) continue;
    const opponent = leftOwn ? entry.awayTeam : entry.homeTeam;
    const homeAway = leftOwn ? "home" : "away";
    const key = `${entry.date}|${normalizeName(opponent)}|${homeAway}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      date: entry.date,
      opponent,
      homeAway,
      competition: `Torneo: ${tournamentName}`,
      location: null,
      notes: tournamentTitle ? `Programma torneo - ${tournamentTitle}` : "Programma torneo",
    });
  }
  return rows;
}

type CloneRecognizedRowOwnClubFilterAudit = {
  opponent: string;
  homeAway: "home" | "away";
  date: string;
  homeTeam: string;
  awayTeam: string;
  group: string | null;
  matchedTournamentTeams: string[];
  normalizedHome: string;
  normalizedAway: string;
  containsMatchedTournamentTeam: boolean;
  decision: CloneOwnClubDecisionOutcome;
  reason: string;
};

function cloneNormalizeFixtureSide(value: string): string {
  return normalizeName(cleanTournamentTeamName(String(value ?? "").trim()));
}

function cloneOpponentMatchesFixtureSide(opponent: string, side: string): boolean {
  const opponentNorm = cloneNormalizeFixtureSide(opponent);
  const sideNorm = cloneNormalizeFixtureSide(side);
  if (!opponentNorm || !sideNorm) return false;
  if (opponentNorm === sideNorm) return true;
  return opponentNorm.includes(sideNorm) || sideNorm.includes(opponentNorm);
}

function cloneResolveFixtureSidesForRecognizedRow(
  row: MatchImportRow,
  program: TournamentProgramEntry[],
): { homeTeam: string; awayTeam: string; group: string | null } | null {
  for (const entry of program) {
    if (entry.date !== row.date) continue;
    const homeSide = String(entry.homeTeam ?? "");
    const awaySide = String(entry.awayTeam ?? "");
    if (row.homeAway === "home") {
      if (cloneOpponentMatchesFixtureSide(row.opponent, awaySide)) {
        return { homeTeam: homeSide, awayTeam: awaySide, group: entry.group ?? null };
      }
    } else if (cloneOpponentMatchesFixtureSide(row.opponent, homeSide)) {
      return { homeTeam: homeSide, awayTeam: awaySide, group: entry.group ?? null };
    }
  }
  return null;
}

function cloneSideMatchesMatchedTournamentTeam(side: string, matchedTournamentTeams: string[]): boolean {
  const sideNorm = cloneNormalizeFixtureSide(side);
  if (!sideNorm || sideNorm.length < 3) return false;
  return matchedTournamentTeams.some((team) => {
    const teamNorm = cloneNormalizeFixtureSide(team);
    if (!teamNorm) return false;
    if (sideNorm === teamNorm) return true;
    if (sideNorm.length >= 5 && teamNorm.length >= 5 && (sideNorm.includes(teamNorm) || teamNorm.includes(sideNorm))) {
      return true;
    }
    return tournamentAliasMatchesSide(sideNorm, [teamNorm]);
  });
}

function cloneRecognizedRowContainsMatchedTournamentTeam(
  homeTeam: string,
  awayTeam: string,
  matchedTournamentTeams: string[],
): boolean {
  if (matchedTournamentTeams.length === 0) return false;
  return (
    cloneSideMatchesMatchedTournamentTeam(homeTeam, matchedTournamentTeams) ||
    cloneSideMatchesMatchedTournamentTeam(awayTeam, matchedTournamentTeams)
  );
}

function cloneFilterRecognizedRowsForOwnClub(input: {
  rows: MatchImportRow[];
  program: TournamentProgramEntry[];
  matchedTournamentTeams: string[];
  aliases: string[];
  contextTokens: Set<string>;
}): { kept: MatchImportRow[]; audits: CloneRecognizedRowOwnClubFilterAudit[] } {
  const kept: MatchImportRow[] = [];
  const audits: CloneRecognizedRowOwnClubFilterAudit[] = [];
  for (const row of input.rows) {
    const sides = cloneResolveFixtureSidesForRecognizedRow(row, input.program);
    const homeTeam = sides?.homeTeam ?? "";
    const awayTeam = sides?.awayTeam ?? "";
    const group = sides?.group ?? null;
    const normalizedHome = cloneNormalizeFixtureSide(homeTeam);
    const normalizedAway = cloneNormalizeFixtureSide(awayTeam);
    const containsMatchedTournamentTeam = cloneRecognizedRowContainsMatchedTournamentTeam(
      homeTeam,
      awayTeam,
      input.matchedTournamentTeams,
    );
    let decision: CloneOwnClubDecisionOutcome;
    let reason: string;
    let accept: boolean;
    if (containsMatchedTournamentTeam) {
      accept = true;
      decision = "accepted";
      reason = `fixture con matchedTournamentTeam (${homeTeam || "?"} - ${awayTeam || "?"})`;
    } else {
      const aliasDecision = cloneOwnClubDecision(row.opponent, input.aliases, input.contextTokens);
      accept = aliasDecision.matched;
      decision = cloneOwnClubFinalDecision({
        matched: aliasDecision.matched,
        genericAlias: aliasDecision.genericAlias,
      });
      reason = aliasDecision.evidence;
    }
    const audit: CloneRecognizedRowOwnClubFilterAudit = {
      opponent: row.opponent,
      homeAway: row.homeAway,
      date: row.date,
      homeTeam,
      awayTeam,
      group,
      matchedTournamentTeams: input.matchedTournamentTeams,
      normalizedHome,
      normalizedAway,
      containsMatchedTournamentTeam,
      decision,
      reason,
    };
    audits.push(audit);
    console.log("[CLONE-RUNTIME-CHECK] recognized row own-club filter", JSON.stringify(audit));
    if (accept) kept.push(row);
  }
  return { kept, audits };
}

function buildCloneOwnClubContextTokens(input: {
  recognized?: MatchImportRow[];
  tournamentProgram?: TournamentProgramEntry[];
}): Set<string> {
  const out = new Set<string>();
  for (const row of input.recognized ?? []) {
    for (const token of cloneDistinctiveTokensFromText(row.opponent)) out.add(token);
  }
  for (const entry of input.tournamentProgram ?? []) {
    for (const token of cloneDistinctiveTokensFromText(entry.homeTeam)) out.add(token);
    for (const token of cloneDistinctiveTokensFromText(entry.awayTeam)) out.add(token);
    for (const token of cloneDistinctiveTokensFromText(String(entry.group ?? ""))) out.add(token);
  }
  return out;
}

function cloneOwnClubDecision(
  text: string,
  aliases: string[],
  contextTokens: Set<string> = new Set<string>(),
): { matched: boolean; confidence: number; evidence: string; alias?: string; genericAlias: boolean } {
  const n = normalizeName(text);
  if (!n) return { matched: false, confidence: 0, evidence: "testo vuoto/non normalizzabile", genericAlias: false };
  let bestScore = 0;
  let bestEvidence = "nessun alias compatibile";
  let bestAlias: string | undefined;
  let bestAliasGeneric = false;
  for (const alias of aliases) {
    if (!alias) continue;
    const aliasTokens = alias.split(/\s+/).filter(Boolean);
    const specificAliasTokens = aliasTokens.filter((token) => !cloneSocietyNoiseToken(token));
    const genericOnlyAlias = specificAliasTokens.length === 0;
    const overlap = aliasTokens.filter((token) => n.includes(token)).length;
    const overlapRatio = aliasTokens.length > 0 ? overlap / aliasTokens.length : 0;
    const exact = n === alias;
    const contains = n.includes(alias) || alias.includes(n);
    const specificOverlap = specificAliasTokens.filter((token) => n.includes(token)).length;
    const exactContextTokenHit = specificAliasTokens.some((token) => contextTokens.has(token) && n.split(/\s+/).includes(token));
    const nearContextTokenHit = specificAliasTokens.some((token) =>
      Array.from(contextTokens).some(
        (ctx) =>
          ctx !== token &&
          ((ctx.startsWith(token) || token.startsWith(ctx)) && Math.abs(ctx.length - token.length) <= 2),
      ),
    );
    const contextBonus = exactContextTokenHit ? 22 : nearContextTokenHit ? 10 : 0;
    const score = Math.round(
      (exact ? 100 : 0) +
        (contains ? 40 : 0) +
        Math.min(40, overlap * 15) +
        Math.round(overlapRatio * 20) +
        Math.min(35, specificOverlap * 17) -
        (genericOnlyAlias ? 45 : 0) +
        contextBonus,
    );
    if (score > bestScore) {
      bestScore = score;
      bestAlias = alias;
      bestAliasGeneric = genericOnlyAlias;
      bestEvidence =
        exact
          ? `match esatto alias "${alias}"`
          : contains
            ? `contenimento alias "${alias}"`
            : `overlap token ${overlap}/${aliasTokens.length} con alias "${alias}"`;
      if (contextBonus > 0) {
        bestEvidence += exactContextTokenHit
          ? ` + bonus contesto (token distintivo presente in girone/fixture)`
          : ` + bonus contesto (quasi-match token distintivo)`;
      }
    }
  }
  const boundedScore = Math.max(0, Math.min(100, bestScore));
  const matched = boundedScore >= CLONE_OWN_CLUB_MIN_CONFIDENCE && !bestAliasGeneric;
  return {
    matched,
    confidence: boundedScore,
    evidence: bestAliasGeneric ? `${bestEvidence} (alias troppo generico)` : bestEvidence,
    alias: bestAlias,
    genericAlias: bestAliasGeneric,
  };
}

function cloneOwnClubFinalDecision(input: {
  matched: boolean;
  genericAlias: boolean;
}): CloneOwnClubDecisionOutcome {
  if (input.matched) return "accepted";
  if (input.genericAlias) return "rejected_generic_alias";
  return "rejected_low_confidence";
}

function buildCloneCanonicalRecords(
  result: MatchPdfImportResult,
  sourceEngine: "standard" | "unified" | "merged",
  perRowConfidence: Record<string, number>,
): CloneCanonicalRecord[] {
  const records: CloneCanonicalRecord[] = [];
  const seen = new Set<string>();
  for (const entry of result.tournamentProgram ?? []) {
    const key = tournamentEntryMergeKey(entry);
    const confidence = perRowConfidence[key] ?? tournamentCloneEntryConfidence(entry);
    const phaseNorm = normalizeName(String(entry.phase ?? ""));
    const groupNorm = normalizeName(String(entry.group ?? ""));
    const hasResult = entry.homeScore != null || entry.awayScore != null;
    const isRankingHint =
      entry.kind === "composition" ||
      /\bclassificat[aoe]?\b/.test(normalizeName(`${entry.homeTeam} ${entry.awayTeam}`));
    if (entry.group && !seen.has(`group_header|${groupNorm}`)) {
      seen.add(`group_header|${groupNorm}`);
      records.push({
        id: `group_header|${groupNorm}`,
        type: "group_header",
        group: entry.group,
        phase: entry.phase,
        sourceEngine,
        confidence: Math.max(confidence - 10, 0),
        evidence: `girone/raggruppamento rilevato da entry programma (${entry.group})`,
      });
    }
    if (entry.phase && !seen.has(`phase_transition|${phaseNorm}`)) {
      seen.add(`phase_transition|${phaseNorm}`);
      records.push({
        id: `phase_transition|${phaseNorm}`,
        type: "phase_transition",
        phase: entry.phase,
        sourceEngine,
        confidence: Math.max(confidence - 12, 0),
        evidence: `fase rilevata: ${entry.phase}`,
      });
    }
    const type: CloneCanonicalRecordType = isRankingHint
      ? "composition_slot"
      : hasResult
        ? "result_line"
        : "match_fixture";
    const id = `${type}|${entry.id || key}`;
    records.push({
      id,
      type,
      date: entry.date,
      group: entry.group,
      phase: entry.phase,
      homeTeam: entry.homeTeam,
      awayTeam: entry.awayTeam,
      sourceEngine,
      confidence,
      evidence:
        type === "composition_slot"
          ? "placeholder/composizione fase (classificata/finale)"
          : hasResult
            ? "riga con punteggio finale rilevato"
            : "accoppiamento gara riconosciuto",
    });
    if (isRankingHint) {
      records.push({
        id: `ranking_hint|${entry.id || key}`,
        type: "ranking_hint",
        group: entry.group,
        phase: entry.phase,
        homeTeam: entry.homeTeam,
        awayTeam: entry.awayTeam,
        sourceEngine,
        confidence: Math.max(confidence - 8, 0),
        evidence: "hint classifica utile per composizioni/finali",
      });
    }
  }
  return records;
}

function tournamentEntryMergeKey(entry: TournamentProgramEntry): string {
  const sides = [normalizeName(entry.homeTeam), normalizeName(entry.awayTeam)].sort();
  return [
    normalizeName(entry.group ?? entry.phase ?? ""),
    sides[0] ?? "",
    sides[1] ?? "",
    entry.kind ?? "match",
  ].join("|");
}

function tournamentImportRowMergeKey(row: MatchImportRow): string {
  return [
    normalizeName(row.competition ?? ""),
    normalizeName(row.opponent),
    row.homeAway,
    row.date,
  ].join("|");
}

function mergeTournamentParseResults(
  preferred: MatchPdfImportResult,
  fallback: MatchPdfImportResult,
): MatchPdfImportResult {
  const program: TournamentProgramEntry[] = [];
  const byKey = new Map<string, number>();
  const addEntry = (entry: TournamentProgramEntry) => {
    const key = tournamentEntryMergeKey(entry);
    const existingIndex = byKey.get(key);
    if (existingIndex == null) {
      byKey.set(key, program.length);
      program.push(entry);
      return;
    }
    const existing = program[existingIndex];
    if (!existing) return;
    const existingHasDate = Boolean(existing.date && !Number.isNaN(new Date(existing.date).getTime()));
    const nextHasDate = Boolean(entry.date && !Number.isNaN(new Date(entry.date).getTime()));
    if (!existingHasDate && nextHasDate) program[existingIndex] = { ...existing, date: entry.date };
  };

  (preferred.tournamentProgram ?? []).forEach(addEntry);
  (fallback.tournamentProgram ?? []).forEach(addEntry);

  const recognized: MatchImportRow[] = [];
  const rowKeys = new Set<string>();
  for (const row of [...preferred.recognized, ...fallback.recognized]) {
    const key = tournamentImportRowMergeKey(row);
    if (rowKeys.has(key)) continue;
    rowKeys.add(key);
    recognized.push(row);
  }

  return {
    recognized,
    discarded: Math.min(preferred.discarded, fallback.discarded),
    totalDateLines: Math.max(preferred.totalDateLines, fallback.totalDateLines),
    tournamentProgram: program.length > 0 ? sanitizeTournamentProgramEntries(program) : undefined,
    tournamentScores: { ...(fallback.tournamentScores ?? {}), ...(preferred.tournamentScores ?? {}) },
  };
}

function mergeTournamentCloneResults(
  preferred: MatchPdfImportResult,
  fallback: MatchPdfImportResult,
  preferredConfidence: Record<string, number>,
  fallbackConfidence: Record<string, number>,
): MatchPdfImportResult {
  const programByKey = new Map<string, TournamentProgramEntry>();
  const upsert = (entry: TournamentProgramEntry, source: "preferred" | "fallback") => {
    const key = tournamentEntryMergeKey(entry);
    const nextConf = (source === "preferred" ? preferredConfidence[key] : fallbackConfidence[key]) ?? 0;
    const existing = programByKey.get(key);
    if (!existing) {
      programByKey.set(key, entry);
      return;
    }
    const existingConf = Math.max(preferredConfidence[key] ?? 0, fallbackConfidence[key] ?? 0);
    const takeNext = nextConf > existingConf;
    if (takeNext) {
      programByKey.set(key, { ...existing, ...entry });
      return;
    }
    programByKey.set(key, {
      ...existing,
      date: existing.date && !Number.isNaN(new Date(existing.date).getTime()) ? existing.date : entry.date,
      phase: existing.phase ?? entry.phase,
      group: existing.group ?? entry.group,
      homeScore: existing.homeScore ?? entry.homeScore,
      awayScore: existing.awayScore ?? entry.awayScore,
      kind: existing.kind ?? entry.kind,
    });
  };
  (preferred.tournamentProgram ?? []).forEach((entry) => upsert(entry, "preferred"));
  (fallback.tournamentProgram ?? []).forEach((entry) => upsert(entry, "fallback"));

  const byRecognized = new Map<string, MatchImportRow>();
  for (const row of [...preferred.recognized, ...fallback.recognized]) {
    const key = tournamentImportRowMergeKey(row);
    const existing = byRecognized.get(key);
    if (!existing) {
      byRecognized.set(key, row);
      continue;
    }
    const existingDateOk = Boolean(existing.date && !Number.isNaN(new Date(existing.date).getTime()));
    const nextDateOk = Boolean(row.date && !Number.isNaN(new Date(row.date).getTime()));
    if (!existingDateOk && nextDateOk) {
      byRecognized.set(key, row);
      continue;
    }
    if ((row.notes?.length ?? 0) > (existing.notes?.length ?? 0)) byRecognized.set(key, row);
  }

  const mergedProgram = sanitizeTournamentProgramEntries(Array.from(programByKey.values()));
  return {
    recognized: Array.from(byRecognized.values()),
    discarded: Math.min(preferred.discarded, fallback.discarded),
    totalDateLines: Math.max(preferred.totalDateLines, fallback.totalDateLines),
    tournamentProgram: mergedProgram.length > 0 ? mergedProgram : undefined,
    tournamentScores: { ...(fallback.tournamentScores ?? {}), ...(preferred.tournamentScores ?? {}) },
  };
}

export function parseMatchCalendarTextLines(
  allPageLines: string[],
  pageBlobs?: string[],
  options: ParseTextOptions = {},
): MatchPdfImportResult {
  const clonePreprocessed =
    options.parserVariant === "clone" && (options.documentMode ?? "auto") === "tournament"
      ? cloneSegmentTournamentLinesFromPdf(allPageLines)
      : null;
  const clonePreprocessedProgram = cloneBuildProgramFromPreprocessedFixtures(clonePreprocessed?.extractedFixtures ?? []);
  const workingLines = clonePreprocessed?.segmentedLines ?? allPageLines;
  if (options.parserVariant === "clone" && (options.documentMode ?? "auto") === "tournament") {
    cloneLogVeronaPdfLayoutDiagnostics({
      allPageLines,
      workingLines,
      layoutMeta: options.clonePdfLayoutMeta,
    });
    if (options.clonePdfLayoutMeta) {
      cloneBuildFutureStructureFromLayoutMeta(options.clonePdfLayoutMeta);
    }
  }
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
  const clubNameUsed = (options.societyHint?.trim() || options.clubName?.trim() || options.teamName?.trim() || societyDisplay || "").trim();
  const distinctiveClubTokens = buildCloneDistinctiveClubTokens([options.societyHint, options.clubName, options.teamName, societyDisplay]);
  const baseTournamentAliases = [...new Set(tournamentAliasSources.filter(Boolean).map((value) => normalizeName(String(value))))].filter(
    (value) => value.length >= 3,
  );
  const cloneTournamentAliases =
    options.parserVariant === "clone"
      ? buildCloneSocietyAliases([options.societyHint, options.clubName, options.teamName, societyDisplay])
      : [];
  const tournamentAliases = [...new Set([...baseTournamentAliases, ...cloneTournamentAliases])];
  const tournamentLooksValid = looksLikeTournamentProgram(fullText);
  const tournamentProgram = tournamentLooksValid && tournamentAliases.length > 0;
  const tournamentName = inferTournamentName(options.fileName, allPageLines);
  const tournamentTitle = extractTournamentTitle(allPageLines);
  if (options.parserVariant === "clone") {
    if (clonePreprocessed) {
      console.log("[CLONE-RUNTIME-CHECK] raw lines count before segmentation", allPageLines.length);
      console.log("[CLONE-RUNTIME-CHECK] expanded/segmented lines count after", workingLines.length);
      console.log(
        "[CLONE-RUNTIME-CHECK] first segmented lines JSON",
        JSON.stringify(workingLines.slice(0, 20), null, 2),
      );
      console.log(
        "[CLONE-RUNTIME-CHECK] fixtures extracted from preprocessing JSON",
        JSON.stringify(clonePreprocessed.extractedFixtures, null, 2),
      );
      console.log(
        "[CLONE-RUNTIME-CHECK] preprocessing fixtures parsed count",
        clonePreprocessedProgram.length,
      );
      console.log(
        "[CLONE-RUNTIME-CHECK] preprocessing fixtures parsed JSON",
        JSON.stringify(clonePreprocessedProgram, null, 2),
      );
    }
    console.log(
      "[CLONE-RUNTIME-CHECK] keyword lines JSON",
      JSON.stringify(cloneKeywordLines(workingLines), null, 2),
    );
  }

  if (documentMode === "tournament") {
    if (options.unifiedTournamentProgram) {
      const unifiedResult = parseUnifiedTournamentProgramLines(workingLines, {
        aliasNorms: tournamentAliases,
        tournamentTitle,
        tournamentName,
        fallbackDateIso: explicitTournamentFallbackIso,
        fallbackYearHint,
      });
      const standardResult = tournamentLooksValid
        ? parseTournamentProgramLines(workingLines, {
            aliasNorms: tournamentAliases,
            tournamentTitle,
            tournamentName,
            fallbackDateIso: explicitTournamentFallbackIso,
            fallbackYearHint,
          })
        : { recognized: [], discarded: 0, totalDateLines: 0 };
      if (options.parserVariant === "clone") {
        const unifiedMergedProgram = cloneMergeProgramWithPreprocessed(
          unifiedResult.tournamentProgram,
          clonePreprocessedProgram,
        );
        const standardMergedProgram = cloneMergeProgramWithPreprocessed(
          standardResult.tournamentProgram,
          clonePreprocessedProgram,
        );
        const unifiedAugmented: MatchPdfImportResult = {
          ...unifiedResult,
          tournamentProgram: unifiedMergedProgram,
          tournamentScores: scoresFromParsedTournamentProgram(unifiedMergedProgram),
        };
        const standardAugmented: MatchPdfImportResult = {
          ...standardResult,
          tournamentProgram: standardMergedProgram,
          tournamentScores: scoresFromParsedTournamentProgram(standardMergedProgram),
        };
        const unifiedAliasEnrichment = enrichCloneAliasesFromTournamentTeams(
          tournamentAliases,
          distinctiveClubTokens,
          unifiedAugmented.tournamentProgram ?? [],
        );
        const standardAliasEnrichment = enrichCloneAliasesFromTournamentTeams(
          tournamentAliases,
          distinctiveClubTokens,
          standardAugmented.tournamentProgram ?? [],
        );
        const unifiedRecognizedFromProgram = cloneRecognizedRowsFromTournamentProgram(
          unifiedAugmented.tournamentProgram ?? [],
          unifiedAliasEnrichment.aliases,
          tournamentName,
          tournamentTitle,
        );
        const standardRecognizedFromProgram = cloneRecognizedRowsFromTournamentProgram(
          standardAugmented.tournamentProgram ?? [],
          standardAliasEnrichment.aliases,
          tournamentName,
          tournamentTitle,
        );
        const dedupeRows = (rows: MatchImportRow[]) =>
          rows.filter((row, idx, arr) => {
            const key = `${row.date}|${normalizeName(row.opponent)}|${row.homeAway}`;
            return arr.findIndex((x) => `${x.date}|${normalizeName(x.opponent)}|${x.homeAway}` === key) === idx;
          });
        const unifiedWithOwnClub = {
          ...unifiedAugmented,
          recognized: dedupeRows([...(unifiedAugmented.recognized ?? []), ...unifiedRecognizedFromProgram]),
        };
        const standardWithOwnClub = {
          ...standardAugmented,
          recognized: dedupeRows([...(standardAugmented.recognized ?? []), ...standardRecognizedFromProgram]),
        };
        const unifiedCloneQuality = tournamentCloneParseQuality(unifiedWithOwnClub);
        const standardCloneQuality = tournamentCloneParseQuality(standardWithOwnClub);
        const clonePrimary = unifiedCloneQuality.score >= standardCloneQuality.score ? unifiedWithOwnClub : standardWithOwnClub;
        const cloneSecondaryResolved = clonePrimary === unifiedWithOwnClub ? standardWithOwnClub : unifiedWithOwnClub;
        const clonePrimaryConfidence =
          clonePrimary === unifiedWithOwnClub ? unifiedCloneQuality.perRowConfidence : standardCloneQuality.perRowConfidence;
        const cloneSecondaryConfidence =
          clonePrimary === unifiedWithOwnClub ? standardCloneQuality.perRowConfidence : unifiedCloneQuality.perRowConfidence;
        const mergedClone = mergeTournamentCloneResults(
          clonePrimary,
          cloneSecondaryResolved,
          clonePrimaryConfidence,
          cloneSecondaryConfidence,
        );
        const mergedProgramWithRoster = cloneAttachGroupRosterCompositions(
          workingLines,
          mergedClone.tournamentProgram ?? [],
          { fallbackDateIso: explicitTournamentFallbackIso },
        );
        const mergedCloneWithRoster: MatchPdfImportResult = {
          ...mergedClone,
          tournamentProgram: mergedProgramWithRoster,
          tournamentScores: scoresFromParsedTournamentProgram(mergedProgramWithRoster),
        };
        const canonicalRecords = [
          ...buildCloneCanonicalRecords(unifiedWithOwnClub, "unified", unifiedCloneQuality.perRowConfidence),
          ...buildCloneCanonicalRecords(standardWithOwnClub, "standard", standardCloneQuality.perRowConfidence),
          ...cloneCanonicalRecordsFromPreprocessed(clonePreprocessedProgram),
          ...buildCloneCanonicalRecords(mergedCloneWithRoster, "merged", {
            ...unifiedCloneQuality.perRowConfidence,
            ...standardCloneQuality.perRowConfidence,
          }),
        ];
        const mergedConfidence = {
          ...unifiedCloneQuality.perRowConfidence,
          ...standardCloneQuality.perRowConfidence,
        };
        const mergedContextTokens = buildCloneOwnClubContextTokens({
          recognized: mergedCloneWithRoster.recognized,
          tournamentProgram: mergedCloneWithRoster.tournamentProgram,
        });
        const mergedAliasEnrichment = enrichCloneAliasesFromTournamentTeams(
          tournamentAliases,
          distinctiveClubTokens,
          mergedCloneWithRoster.tournamentProgram ?? [],
        );
        const mergedOwnClubFilter = cloneFilterRecognizedRowsForOwnClub({
          rows: mergedCloneWithRoster.recognized,
          program: mergedCloneWithRoster.tournamentProgram ?? [],
          matchedTournamentTeams: mergedAliasEnrichment.matchedTournamentTeams,
          aliases: mergedAliasEnrichment.aliases,
          contextTokens: mergedContextTokens,
        });
        const ownClubDecisions = mergedOwnClubFilter.audits.slice(0, 140).map((audit) => ({
          text: audit.opponent,
          matched: audit.decision === "accepted",
          confidence: audit.containsMatchedTournamentTeam ? 100 : audit.decision === "accepted" ? 68 : 0,
          evidence: audit.reason,
          decision: audit.decision,
          sourceEngine: "merged" as const,
        }));
        const filteredRecognized = mergedOwnClubFilter.kept;
        console.log("[CLONE-RUNTIME-CHECK] clubNameUsed", clubNameUsed);
        console.log("[CLONE-RUNTIME-CHECK] aliases", mergedAliasEnrichment.aliases);
        console.log("[CLONE-RUNTIME-CHECK] aliases JSON", JSON.stringify(mergedAliasEnrichment.aliases, null, 2));
        console.log("[CLONE-RUNTIME-CHECK] distinctiveTokens JSON", JSON.stringify(distinctiveClubTokens, null, 2));
        console.log(
          "[CLONE-RUNTIME-CHECK] tournamentTeamTokens JSON",
          JSON.stringify(mergedAliasEnrichment.tournamentTeamTokens, null, 2),
        );
        console.log(
          "[CLONE-RUNTIME-CHECK] tournament teams JSON",
          JSON.stringify(mergedAliasEnrichment.tournamentTeams, null, 2),
        );
        console.log("[CLONE-RUNTIME-CHECK] matchedTournamentTeams", mergedAliasEnrichment.matchedTournamentTeams);
        console.log(
          "[CLONE-RUNTIME-CHECK] matchedTournamentTeams JSON",
          JSON.stringify(mergedAliasEnrichment.matchedTournamentTeams, null, 2),
        );
        console.log("[CLONE-RUNTIME-CHECK] tournament fixtures count", (mergedCloneWithRoster.tournamentProgram ?? []).length);
        console.log(
          "[CLONE-RUNTIME-CHECK] tournamentProgram summary JSON",
          JSON.stringify(cloneProgramSummary(mergedCloneWithRoster.tournamentProgram ?? []), null, 2),
        );
        console.log(
          "[CLONE-RUNTIME-CHECK] canonicalRecords JSON",
          JSON.stringify(canonicalRecords.slice(0, 250), null, 2),
        );
        console.log(
          "[CLONE-RUNTIME-CHECK] normalized fixtures JSON",
          JSON.stringify(cloneProgramSummary(mergedCloneWithRoster.tournamentProgram ?? []).normalizedFixtures, null, 2),
        );
        console.log("[CLONE-RUNTIME-CHECK] recognized before own filter", mergedCloneWithRoster.recognized.length);
        console.log("[CLONE-RUNTIME-CHECK] recognized after own filter", filteredRecognized.length);
        if ((mergedCloneWithRoster.tournamentProgram?.length ?? 0) > 0 || mergedCloneWithRoster.recognized.length > 0) {
          return {
            ...mergedCloneWithRoster,
            recognized: filteredRecognized,
            parserDebug: {
              variant: "clone",
              engineScores: {
                unified: unifiedCloneQuality.score,
                standard: standardCloneQuality.score,
              },
              perRowConfidence: mergedConfidence,
              canonicalRecords,
              ownClubAliasProfile: {
                clubNameUsed,
                aliases: mergedAliasEnrichment.aliases,
                distinctiveTokens: distinctiveClubTokens,
                tournamentTeamTokens: mergedAliasEnrichment.tournamentTeamTokens,
                matchedTournamentTeams: mergedAliasEnrichment.matchedTournamentTeams,
                decisions: ownClubDecisions,
              },
              notes: [
                "clone parser: ranking per motore con confidence per riga",
                "merge clone: preferenza per metadati piu' ricchi (fase/girone/risultati/date)",
                `clone alias resolver: soglia own-club ${CLONE_OWN_CLUB_MIN_CONFIDENCE}, con decisione accepted/rejected nel debug`,
              ],
            },
          };
        }
      }
      const unifiedQuality = tournamentParseQuality(unifiedResult);
      const standardQuality = tournamentParseQuality(standardResult);
      const primaryResult = standardQuality > unifiedQuality ? standardResult : unifiedResult;
      const secondaryResult = primaryResult === unifiedResult ? standardResult : unifiedResult;
      const mergedResult = mergeTournamentParseResults(primaryResult, secondaryResult);
      if ((mergedResult.tournamentProgram?.length ?? 0) > 0 || mergedResult.recognized.length > 0) {
        return mergedResult;
      }
    }
    return tournamentLooksValid
      ? parseTournamentProgramLines(workingLines, {
          aliasNorms: tournamentAliases,
          tournamentTitle,
          tournamentName,
          fallbackDateIso: explicitTournamentFallbackIso,
          fallbackYearHint,
        })
      : { recognized: [], discarded: 0, totalDateLines: 0 };
  }

  if (tournamentProgram) {
    return parseTournamentProgramLines(workingLines, {
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

export async function parseMatchCalendarPdfFileClone(
  file: File,
  options: ParsePdfOptions = {},
): Promise<MatchPdfImportResult> {
  console.log("[CLONE-RUNTIME-CHECK] parser clone called", {
    parserVariant: "clone",
    fileName: file.name,
  });
  return parseMatchCalendarPdfFile(file, {
    ...options,
    parserVariant: "clone",
  });
}

export async function parseTournamentImageFileClone(
  file: File,
  options: ParsePdfOptions = {},
): Promise<MatchPdfImportResult> {
  console.log("[CLONE-RUNTIME-CHECK] parser clone called", {
    parserVariant: "clone",
    fileName: file.name,
  });
  return parseTournamentImageFile(file, {
    ...options,
    parserVariant: "clone",
  });
}
