import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFPageProxy } from "pdfjs-dist";
import type { MatchImportRow } from "./match-calendar-excel";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
};

export type MatchPdfImportResult = {
  recognized: MatchImportRow[];
  discarded: number;
  totalDateLines: number;
};

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
  let rowBuf: { str: string; x: number }[] = [];
  let curY = NaN;

  const flushRow = () => {
    if (!rowBuf.length) return;
    rowBuf.sort((a, b) => a.x - b.x);
    const parts: string[] = [];
    for (let i = 0; i < rowBuf.length; i++) {
      if (i > 0) {
        const dx = rowBuf[i].x - rowBuf[i - 1].x;
        parts.push(dx > COLUMN_GAP_THRESHOLD ? "\t" : " ");
      }
      parts.push(rowBuf[i].str);
    }
    const line = parts.join("").replace(/ +/g, " ").trim();
    if (line) lines.push(line);
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
  return lines.filter((l) => l.length > 0);
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

export async function parseMatchCalendarPdfFile(
  file: File,
  options: ParsePdfOptions = {},
): Promise<MatchPdfImportResult> {
  const raw = await file.arrayBuffer();
  const loadingTask = getDocument({ data: raw });
  const pdf = await loadingTask.promise;

  const termNorms = (options.searchTerms ?? []).map((t) => normalizeName(String(t))).filter((t) => t.length >= 2);
  const sectionNorms = (options.sectionTitleHints ?? [])
    .map((t) => normalizeName(String(t)))
    .filter((t) => t.length >= 3);
  const societyDisplay = (options.societyHint?.trim() || options.clubName?.trim() || options.teamName?.trim() || "").trim();
  const societyNorm = normalizeName(societyDisplay);

  const allPageLines: string[] = [];
  const pageBlobs: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const lines = await pageToLines(page);
    allPageLines.push(...lines);
    pageBlobs.push(lines.join(" "));
  }

  const fullText = pageBlobs.join("\n");
  const federal = looksLikeFederalCalendar(fullText) && societyNorm.length >= 2;

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
    for (const pageText of pageBlobs) {
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
      notes: "Import automatico da PDF federale",
    });
  }

  return { recognized, discarded, totalDateLines };
}
