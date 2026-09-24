import { Router, type IRouter } from "express";
import {
  championshipFixturesTable,
  championshipGroupsTable,
  championshipsTable,
  db,
  matchesTable,
  teamsTable,
  type ChampionshipPointsRule,
} from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const MANAGE_ROLES = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"];
const SECTION_VALUES = new Set(["scuola_calcio", "settore_giovanile", "prima_squadra"]);
const LEG_VALUES = new Set(["andata", "ritorno"]);
const DEFAULT_POINTS_RULE: ChampionshipPointsRule = { win: 3, draw: 1, loss: 0 };

type StandingRow = {
  team: string;
  pg: number;
  v: number;
  n: number;
  p: number;
  gf: number;
  gs: number;
  dr: number;
  pts: number;
};

type LndFixtureRow = {
  externalKey: string;
  round: number | null;
  leg: "andata" | "ritorno" | null;
  homeTeam: string;
  awayTeam: string;
  date: string | null;
  location: string | null;
  homeScore: number | null;
  awayScore: number | null;
  notes: string | null;
};

type LndStandingRow = StandingRow;

type LndParsedCompetition = {
  sourceUrl: string;
  sourceParams: Record<string, string>;
  title: string;
  category: string | null;
  groupName: string;
  fixtures: LndFixtureRow[];
  standings: LndStandingRow[];
  rawLineCount: number;
};

async function ensureChampionshipTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS championships (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id INTEGER REFERENCES seasons(id) ON DELETE SET NULL,
      section TEXT NOT NULL,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      category TEXT,
      points_rule JSONB NOT NULL DEFAULT '{"win":3,"draw":1,"loss":0}'::jsonb,
      source_provider TEXT,
      source_url TEXT,
      source_params JSONB,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS championship_groups (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS championship_fixtures (
      id SERIAL PRIMARY KEY,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES championship_groups(id) ON DELETE CASCADE,
      match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
      round INTEGER,
      leg TEXT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      date TIMESTAMPTZ,
      location TEXT,
      home_score INTEGER,
      away_score INTEGER,
      notes TEXT,
      external_source_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`ALTER TABLE championships ADD COLUMN IF NOT EXISTS source_provider TEXT`);
  await db.execute(sql`ALTER TABLE championships ADD COLUMN IF NOT EXISTS source_url TEXT`);
  await db.execute(sql`ALTER TABLE championships ADD COLUMN IF NOT EXISTS source_params JSONB`);
  await db.execute(sql`ALTER TABLE championship_fixtures ADD COLUMN IF NOT EXISTS external_source_key TEXT`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championships_club_section ON championships(club_id, section)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championships_source ON championships(club_id, source_provider)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championship_groups_championship ON championship_groups(championship_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championship_fixtures_group ON championship_fixtures(group_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championship_fixtures_match ON championship_fixtures(match_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_championship_fixtures_source_key ON championship_fixtures(club_id, external_source_key)`);
}

function normalizeSection(value: unknown): string | null {
  const section = String(value ?? "").trim();
  return SECTION_VALUES.has(section) ? section : null;
}

function normalizePointsRule(value: unknown): ChampionshipPointsRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_POINTS_RULE;
  const row = value as Record<string, unknown>;
  const win = Number(row.win);
  const draw = Number(row.draw);
  const loss = Number(row.loss);
  return {
    win: Number.isFinite(win) ? win : DEFAULT_POINTS_RULE.win,
    draw: Number.isFinite(draw) ? draw : DEFAULT_POINTS_RULE.draw,
    loss: Number.isFinite(loss) ? loss : DEFAULT_POINTS_RULE.loss,
  };
}

function normalizeLeg(value: unknown): string | null {
  const leg = String(value ?? "").trim().toLowerCase();
  return LEG_VALUES.has(leg) ? leg : null;
}

function scoreValue(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function tableKey(team: string): string {
  return team
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string): string {
  return cleanText(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function normalizeName(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fixtureSourceKey(input: {
  sourceParams: Record<string, string>;
  round: number | null;
  leg: string | null;
  homeTeam: string;
  awayTeam: string;
  date: string | null;
}) {
  const parts = [
    "lnd",
    input.sourceParams.regione ?? "",
    input.sourceParams.campionato ?? "",
    input.sourceParams.girone ?? "",
    input.sourceParams.stagione ?? "",
    input.leg ?? "",
    input.round ?? "",
    input.date ? input.date.slice(0, 10) : "",
    normalizeName(input.homeTeam),
    normalizeName(input.awayTeam),
  ];
  return parts.join("|");
}

function parseSourceUrl(value: unknown): URL | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname !== "gare.lnd.it") return null;
    return url;
  } catch {
    return null;
  }
}

function lndParamsFromUrl(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  const pathRegion = url.pathname.split("/").filter(Boolean).at(-1);
  if (pathRegion) params.regione = pathRegion;
  for (const key of ["campionato", "giornata", "girone", "leg", "stagione"]) {
    const value = url.searchParams.get(key);
    if (value) params[key] = value;
  }
  return params;
}

function lineTokensFromHtml(html: string): string[] {
  return stripHtml(html)
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line.length > 0);
}

function extractTableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => stripHtml(cell[1]))
      .map((cell) => cleanText(cell))
      .filter(Boolean);
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(row: Record<string, unknown>, key: string): string {
  return cleanText(row[key]);
}

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function parseLndDateTime(dateValue: unknown, timeValue: unknown): string | null {
  const dateText = cleanText(dateValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const timeText = cleanText(timeValue) || "15:00:00";
  const time = timeText.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const hour = time ? Number(time[1]) : 15;
  const minute = time ? Number(time[2]) : 0;
  const second = time?.[3] ? Number(time[3]) : 0;
  const date = new Date(`${dateText}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function scoreFromLnd(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function extractLndInertiaPayload(html: string): Record<string, unknown> | null {
  const scriptMatches = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scriptMatches) {
    const text = match[1]?.trim();
    if (!text || !text.includes('"component"') || !text.includes("QuadroGare")) continue;
    try {
      const parsed = JSON.parse(text);
      return asRecord(parsed);
    } catch {
      continue;
    }
  }
  return null;
}

function parseLndInertiaPayload(html: string, url: URL, params: Record<string, string>): LndParsedCompetition | null {
  const payload = extractLndInertiaPayload(html);
  const props = asRecord(payload?.props);
  if (!props) return null;
  const championship = asRecord(props.championship);
  const group = asRecord(props.group);
  const currentMatchday = asRecord(props.currentMatchday);
  const matches = Array.isArray(props.matches) ? props.matches.map(asRecord).filter((row): row is Record<string, unknown> => !!row) : [];
  const standingsRows = Array.isArray(props.standings) ? props.standings.map(asRecord).filter((row): row is Record<string, unknown> => !!row) : [];
  const leg = normalizeLegFromSource(readString(currentMatchday ?? {}, "leg") || params.leg);
  const round = readNumber(currentMatchday ?? {}, "number") ?? (params.giornata ? Number(params.giornata) : null);
  const sourceParams = {
    ...params,
    giornata: round ? String(round) : (params.giornata ?? ""),
    leg: readString(currentMatchday ?? {}, "leg") || (params.leg ?? ""),
  };
  const fixtures = uniqueFixtures(matches.map((match) => {
    const homeTeam = readString(match, "home");
    const awayTeam = readString(match, "away");
    const date = parseLndDateTime(match.date, match.time);
    const field = readString(match, "field");
    const fieldAddress = readString(match, "fieldAddress");
    const externalId = readString(match, "id");
    return {
      externalKey: externalId ? `lnd|match|${externalId}` : fixtureSourceKey({ sourceParams, round, leg, homeTeam, awayTeam, date }),
      round: Number.isInteger(round) ? round : null,
      leg,
      homeTeam,
      awayTeam,
      date,
      location: [field, fieldAddress].filter(Boolean).join(" - ") || null,
      homeScore: scoreFromLnd(match.homeGoals),
      awayScore: scoreFromLnd(match.awayGoals),
      notes: readString(match, "outcome") || null,
    } satisfies LndFixtureRow;
  }).filter((fixture) => fixture.homeTeam && fixture.awayTeam));
  const standings = standingsRows.map((row) => {
    const gf = readNumber(row, "goalsFor") ?? 0;
    const gs = readNumber(row, "goalsAgainst") ?? 0;
    return {
      team: readString(row, "team").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      pg: readNumber(row, "played") ?? 0,
      v: readNumber(row, "wins") ?? 0,
      n: readNumber(row, "draws") ?? 0,
      p: readNumber(row, "losses") ?? 0,
      gf,
      gs,
      dr: gf - gs,
      pts: readNumber(row, "points") ?? 0,
    } satisfies LndStandingRow;
  }).filter((row) => row.team);
  const groupName = readString(group ?? {}, "name") || (params.girone ? `Girone ${params.girone}` : "Girone");
  const category = readString(championship ?? {}, "name") || null;
  return {
    sourceUrl: url.toString(),
    sourceParams,
    title: category ? `${category} - ${groupName}` : `Campionato ${groupName}`,
    category,
    groupName,
    fixtures,
    standings,
    rawLineCount: matches.length + standings.length,
  };
}

function parseScore(value: string): { homeScore: number; awayScore: number } | null {
  const match = cleanText(value).match(/\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/);
  if (!match) return null;
  const homeScore = Number(match[1]);
  const awayScore = Number(match[2]);
  return Number.isInteger(homeScore) && Number.isInteger(awayScore) ? { homeScore, awayScore } : null;
}

function isDateLike(value: string): boolean {
  return /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(value);
}

function isTimeLike(value: string): boolean {
  return /\b\d{1,2}[:.]\d{2}\b/.test(value);
}

function parseItalianDate(value: string, seasonStartYear: number | null): string | null {
  const dateMatch = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!dateMatch) return null;
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  let year = dateMatch[3] ? Number(dateMatch[3]) : null;
  if (year != null && year < 100) year += 2000;
  if (year == null && seasonStartYear) year = month >= 7 ? seasonStartYear : seasonStartYear + 1;
  if (!year) return null;
  const timeMatch = value.match(/\b(\d{1,2})[:.](\d{2})\b/);
  const hour = timeMatch ? Number(timeMatch[1]) : 15;
  const minute = timeMatch ? Number(timeMatch[2]) : 0;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeLegFromSource(value: string | undefined | null): "andata" | "ritorno" | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("second") || normalized.includes("return") || normalized.includes("ritorno")) return "ritorno";
  if (normalized.includes("first") || normalized.includes("andata")) return "andata";
  return null;
}

function isUsefulTeamName(value: string): boolean {
  const n = normalizeName(value);
  if (n.length < 3) return false;
  return !/\b(?:giornata|girone|classifica|punti|risultato|data|ora|campo|societa|casa|ospitata|squadra|calendario|competizione|stagione|vittorie|sconfitte)\b/.test(n);
}

function parseFixtureFromCells(cells: string[], params: Record<string, string>): LndFixtureRow | null {
  const seasonYear = Number(params.stagione);
  const scoreCell = cells.find((cell) => parseScore(cell));
  const score = scoreCell ? parseScore(scoreCell) : null;
  const dateText = cells.find(isDateLike) ?? cells.find(isTimeLike) ?? "";
  const date = parseItalianDate(cells.join(" "), Number.isFinite(seasonYear) ? seasonYear : null) ?? parseItalianDate(dateText, Number.isFinite(seasonYear) ? seasonYear : null);
  const ignored = new Set(cells.filter((cell) => cell === scoreCell || isDateLike(cell) || isTimeLike(cell)));
  const teamCells = cells.filter((cell) => !ignored.has(cell) && isUsefulTeamName(cell));
  let homeTeam = teamCells[0] ?? "";
  let awayTeam = teamCells[1] ?? "";
  if (!awayTeam) {
    const joined = cells.join(" ");
    const split = joined.match(/(.+?)\s+[-–—]\s+(.+?)(?:\s+\d{1,2}\s*[-:]\s*\d{1,2}|\s+\d{1,2}[/-]\d{1,2}|$)/);
    if (split) {
      homeTeam = split[1];
      awayTeam = split[2];
    }
  }
  homeTeam = cleanText(homeTeam.replace(/\b\d{1,2}[/-]\d{1,2}.*$/g, ""));
  awayTeam = cleanText(awayTeam.replace(/\b\d{1,2}[/-]\d{1,2}.*$/g, ""));
  if (!homeTeam || !awayTeam || !isUsefulTeamName(homeTeam) || !isUsefulTeamName(awayTeam)) return null;
  const round = params.giornata ? Number(params.giornata) : null;
  const leg = normalizeLegFromSource(params.leg);
  return {
    externalKey: fixtureSourceKey({ sourceParams: params, round, leg, homeTeam, awayTeam, date }),
    round: Number.isInteger(round) ? round : null,
    leg,
    homeTeam,
    awayTeam,
    date,
    location: cells.find((cell) => /\bcampo\b/i.test(cell)) ?? null,
    homeScore: score?.homeScore ?? null,
    awayScore: score?.awayScore ?? null,
    notes: null,
  };
}

function parseFixtureFromLine(line: string, params: Record<string, string>): LndFixtureRow | null {
  const normalizedLine = cleanText(line);
  if (!/[-–—]/.test(normalizedLine)) return null;
  const score = parseScore(normalizedLine);
  const seasonYear = Number(params.stagione);
  const date = parseItalianDate(normalizedLine, Number.isFinite(seasonYear) ? seasonYear : null);
  const withoutDate = normalizedLine
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\s*[-:]\s*\d{1,2}\b/g, " ");
  const split = withoutDate.match(/(.+?)\s+[-–—]\s+(.+)/);
  if (!split) return null;
  const homeTeam = cleanText(split[1]);
  const awayTeam = cleanText(split[2].replace(/\b(?:campo|ore|ora|risultato)\b.*$/i, ""));
  if (!homeTeam || !awayTeam || !isUsefulTeamName(homeTeam) || !isUsefulTeamName(awayTeam)) return null;
  const round = params.giornata ? Number(params.giornata) : null;
  const leg = normalizeLegFromSource(params.leg);
  return {
    externalKey: fixtureSourceKey({ sourceParams: params, round, leg, homeTeam, awayTeam, date }),
    round: Number.isInteger(round) ? round : null,
    leg,
    homeTeam,
    awayTeam,
    date,
    location: null,
    homeScore: score?.homeScore ?? null,
    awayScore: score?.awayScore ?? null,
    notes: null,
  };
}

function parseStandingFromCells(cells: string[]): LndStandingRow | null {
  const numbers = cells.map((cell) => Number(cleanText(cell).replace(/^\+/, ""))).filter(Number.isFinite);
  if (numbers.length < 5) return null;
  const team = cells.find((cell) => isUsefulTeamName(cell) && !Number.isFinite(Number(cell))) ?? "";
  if (!team) return null;
  const pts = numbers.at(-1) ?? 0;
  const pg = numbers[0] ?? 0;
  const v = numbers[1] ?? 0;
  const n = numbers[2] ?? 0;
  const p = numbers[3] ?? 0;
  const dr = numbers.length >= 6 ? numbers.at(-2)! : 0;
  return { team, pg, v, n, p, gf: 0, gs: 0, dr, pts };
}

function uniqueFixtures(fixtures: LndFixtureRow[]): LndFixtureRow[] {
  const seen = new Set<string>();
  const rows: LndFixtureRow[] = [];
  for (const fixture of fixtures) {
    if (seen.has(fixture.externalKey)) continue;
    seen.add(fixture.externalKey);
    rows.push(fixture);
  }
  return rows;
}

async function fetchAndParseLnd(url: URL): Promise<LndParsedCompetition> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "FootballTrainingBoard/1.0 (+https://football-training-board.onrender.com)",
    },
  });
  if (!response.ok) throw new Error(`Gare LND non raggiungibile (${response.status})`);
  const html = await response.text();
  const params = lndParamsFromUrl(url);
  const inertiaParsed = parseLndInertiaPayload(html, url, params);
  if (inertiaParsed) return inertiaParsed;
  const lines = lineTokensFromHtml(html);
  const tableRows = extractTableRows(html);
  const fixtures = uniqueFixtures([
    ...tableRows.map((row) => parseFixtureFromCells(row, params)).filter((row): row is LndFixtureRow => !!row),
    ...lines.map((line) => parseFixtureFromLine(line, params)).filter((row): row is LndFixtureRow => !!row),
  ]);
  const standings = tableRows.map(parseStandingFromCells).filter((row): row is LndStandingRow => !!row);
  const titleLine =
    lines.find((line) => /\bunder\s*\d+|\ballievi|\bjuniores|\bpromozione|\beccellenza|\bprima categoria|\bseconda categoria/i.test(line)) ??
    `Campionato ${params.campionato ?? ""}`.trim();
  const groupName = params.girone ? `Girone ${params.girone}` : "Girone";
  const category = cleanText(titleLine.replace(/\s*-\s*FI\s*-/i, ""));
  return {
    sourceUrl: url.toString(),
    sourceParams: params,
    title: category ? `${category} - ${groupName}` : `Campionato ${groupName}`,
    category: category || null,
    groupName,
    fixtures,
    standings,
    rawLineCount: lines.length,
  };
}

function mergeLndParsed(base: LndParsedCompetition, next: LndParsedCompetition): LndParsedCompetition {
  const fixtures = uniqueFixtures([...base.fixtures, ...next.fixtures]);
  const standings = next.standings.length > 0 ? next.standings : base.standings;
  return {
    ...base,
    fixtures,
    standings,
    rawLineCount: base.rawLineCount + next.rawLineCount,
  };
}

async function fetchAndParseLndCompetition(url: URL): Promise<LndParsedCompetition> {
  const base = await fetchAndParseLnd(url);
  if (!url.searchParams.has("giornata")) return base;

  let merged = base;
  for (const leg of ["first", "second"]) {
    let emptyRuns = 0;
    for (let round = 1; round <= 30; round++) {
      if (url.searchParams.get("leg") === leg && Number(url.searchParams.get("giornata")) === round) continue;
      const roundUrl = new URL(url.toString());
      roundUrl.searchParams.set("leg", leg);
      roundUrl.searchParams.set("giornata", String(round));
      try {
        const parsed = await fetchAndParseLnd(roundUrl);
        if (parsed.fixtures.length === 0) {
          emptyRuns++;
        } else {
          emptyRuns = 0;
          merged = mergeLndParsed(merged, parsed);
        }
        if (emptyRuns >= 3 && round > 3) break;
      } catch {
        emptyRuns++;
        if (emptyRuns >= 3 && round > 3) break;
      }
    }
  }
  return merged;
}

function standingsFor(
  fixtures: Array<{ homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }>,
  pointsRule: ChampionshipPointsRule,
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const ensure = (team: string) => {
    const key = tableKey(team);
    if (!table.has(key)) table.set(key, { team, pg: 0, v: 0, n: 0, p: 0, gf: 0, gs: 0, dr: 0, pts: 0 });
    return table.get(key)!;
  };

  for (const fixture of fixtures) {
    const home = ensure(fixture.homeTeam);
    const away = ensure(fixture.awayTeam);
    if (fixture.homeScore == null || fixture.awayScore == null) continue;
    home.pg += 1;
    away.pg += 1;
    home.gf += fixture.homeScore;
    home.gs += fixture.awayScore;
    away.gf += fixture.awayScore;
    away.gs += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) {
      home.v += 1;
      home.pts += pointsRule.win;
      away.p += 1;
      away.pts += pointsRule.loss;
    } else if (fixture.homeScore < fixture.awayScore) {
      away.v += 1;
      away.pts += pointsRule.win;
      home.p += 1;
      home.pts += pointsRule.loss;
    } else {
      home.n += 1;
      away.n += 1;
      home.pts += pointsRule.draw;
      away.pts += pointsRule.draw;
    }
  }

  return [...table.values()]
    .map((row) => ({ ...row, dr: row.gf - row.gs }))
    .sort((a, b) => b.pts - a.pts || b.dr - a.dr || b.gf - a.gf || a.pg - b.pg || a.team.localeCompare(b.team, "it"));
}

async function teamBelongsToClub(teamId: number | null, clubId: number): Promise<boolean> {
  if (!teamId) return true;
  const [team] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)))
    .limit(1);
  return !!team;
}

async function enrichedChampionships(params: { clubId: number; section?: string | null; teamId?: number | null }) {
  const conditions = [eq(championshipsTable.clubId, params.clubId) as any];
  if (params.section) conditions.push(eq(championshipsTable.section, params.section) as any);
  if (params.teamId) conditions.push(eq(championshipsTable.teamId, params.teamId) as any);

  const championships = await db
    .select()
    .from(championshipsTable)
    .where(and(...conditions))
    .orderBy(asc(championshipsTable.title));
  const ids = championships.map((item) => item.id);
  if (ids.length === 0) return [];

  const groups = await db
    .select()
    .from(championshipGroupsTable)
    .where(and(eq(championshipGroupsTable.clubId, params.clubId), inArray(championshipGroupsTable.championshipId, ids)))
    .orderBy(asc(championshipGroupsTable.name));
  const fixtures = await db
    .select()
    .from(championshipFixturesTable)
    .where(and(eq(championshipFixturesTable.clubId, params.clubId), inArray(championshipFixturesTable.championshipId, ids)))
    .orderBy(asc(championshipFixturesTable.date), asc(championshipFixturesTable.round), asc(championshipFixturesTable.id));
  const matchIds = fixtures.map((fixture) => fixture.matchId).filter((id): id is number => typeof id === "number");
  const linkedMatches = matchIds.length > 0
    ? await db.select({ id: matchesTable.id, result: matchesTable.result }).from(matchesTable).where(inArray(matchesTable.id, matchIds))
    : [];
  const resultByMatchId = new Map(linkedMatches.map((match) => [match.id, match.result]));

  return championships.map((championship) => {
    const pointsRule = normalizePointsRule(championship.pointsRule);
    const championshipGroups = groups.filter((group) => group.championshipId === championship.id);
    return {
      ...championship,
      pointsRule,
      groups: championshipGroups.map((group) => {
        const groupFixtures = fixtures
          .filter((fixture) => fixture.groupId === group.id)
          .map((fixture) => {
            const linkedResult = fixture.matchId ? resultByMatchId.get(fixture.matchId) : null;
            return { ...fixture, linkedResult: linkedResult ?? null };
          });
        return {
          ...group,
          fixtures: groupFixtures,
          standings: standingsFor(groupFixtures, pointsRule),
        };
      }),
    };
  });
}

router.get("/championships", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  await ensureChampionshipTables();
  const section = normalizeSection(req.query.section);
  const teamIdRaw = req.query.teamId == null ? null : Number(req.query.teamId);
  const teamId = Number.isFinite(teamIdRaw) && teamIdRaw! > 0 ? teamIdRaw : null;
  res.json(await enrichedChampionships({ clubId, section, teamId }));
});

router.post("/championships/lnd/preview", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  await ensureChampionshipTables();
  const url = parseSourceUrl(req.body?.url);
  if (!url) {
    res.status(400).json({ error: "Inserisci un URL valido di gare.lnd.it" });
    return;
  }
  try {
    const parsed = await fetchAndParseLnd(url);
    res.json(parsed);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Errore lettura Gare LND" });
  }
});

router.post("/championships/lnd/sync", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a sincronizzare campionati LND" });
    return;
  }
  await ensureChampionshipTables();
  const section = normalizeSection(req.body?.section);
  const url = parseSourceUrl(req.body?.url);
  const teamIdRaw = req.body?.teamId == null ? null : Number(req.body.teamId);
  const teamId = Number.isFinite(teamIdRaw) && teamIdRaw! > 0 ? teamIdRaw : null;
  if (!section || !url) {
    res.status(400).json({ error: "Sezione e URL Gare LND sono obbligatori" });
    return;
  }
  if (section === "scuola_calcio") {
    res.status(400).json({ error: "La sync LND dei campionati vale per Settore Giovanile e Prima Squadra" });
    return;
  }
  if (!(await teamBelongsToClub(teamId, clubId))) {
    res.status(400).json({ error: "Squadra non valida per questa societa" });
    return;
  }

  try {
    const parsed = await fetchAndParseLndCompetition(url);
    if (parsed.fixtures.length === 0 && parsed.standings.length === 0) {
      res.status(422).json({ error: "Gare LND lette ma nessuna partita o classifica riconosciuta" });
      return;
    }
    const title = String(req.body?.title ?? "").trim() || parsed.title;
    const category = String(req.body?.category ?? "").trim() || parsed.category;
    const groupName = String(req.body?.groupName ?? "").trim() || parsed.groupName;

    const existingChampionships = await db
      .select()
      .from(championshipsTable)
      .where(and(eq(championshipsTable.clubId, clubId), eq(championshipsTable.section, section)));
    let championship = existingChampionships.find((item) => normalizeName(item.title) === normalizeName(title) && (teamId ? item.teamId === teamId : true));

    if (!championship) {
      [championship] = await db
        .insert(championshipsTable)
        .values({
          clubId,
          section,
          teamId,
          title,
          category,
          pointsRule: DEFAULT_POINTS_RULE,
          createdByUserId: req.session.userId ?? null,
        })
        .returning();
    } else {
      [championship] = await db
        .update(championshipsTable)
        .set({
          title,
          category,
          updatedAt: new Date(),
        })
        .where(and(eq(championshipsTable.id, championship.id), eq(championshipsTable.clubId, clubId)))
        .returning();
    }
    await db.execute(sql`
      UPDATE championships
      SET source_provider = 'lnd',
          source_url = ${parsed.sourceUrl},
          source_params = ${JSON.stringify(parsed.sourceParams)}::jsonb,
          updated_at = NOW()
      WHERE id = ${championship.id} AND club_id = ${clubId}
    `);

    let [group] = await db
      .select()
      .from(championshipGroupsTable)
      .where(and(eq(championshipGroupsTable.clubId, clubId), eq(championshipGroupsTable.championshipId, championship.id), eq(championshipGroupsTable.name, groupName)))
      .limit(1);
    if (!group) {
      [group] = await db.insert(championshipGroupsTable).values({ clubId, championshipId: championship.id, name: groupName }).returning();
    }

    const existingFixtures = await db
      .select()
      .from(championshipFixturesTable)
      .where(and(eq(championshipFixturesTable.clubId, clubId), eq(championshipFixturesTable.championshipId, championship.id), eq(championshipFixturesTable.groupId, group.id)));
    let created = 0;
    let updated = 0;
    for (const fixture of parsed.fixtures) {
      const current = existingFixtures.find((item) =>
        normalizeName(item.homeTeam) === normalizeName(fixture.homeTeam) &&
        normalizeName(item.awayTeam) === normalizeName(fixture.awayTeam) &&
        (item.leg ?? "") === (fixture.leg ?? "") &&
        (item.round ?? null) === (fixture.round ?? null),
      );
      const date = fixture.date ? new Date(fixture.date) : null;
      const values = {
        round: fixture.round,
        leg: fixture.leg,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        date: date && !Number.isNaN(date.getTime()) ? date : null,
        location: fixture.location,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        notes: fixture.notes,
        updatedAt: new Date(),
      };
      if (current) {
        await db
          .update(championshipFixturesTable)
          .set(values)
          .where(and(eq(championshipFixturesTable.id, current.id), eq(championshipFixturesTable.clubId, clubId)));
        await db.execute(sql`UPDATE championship_fixtures SET external_source_key = ${fixture.externalKey} WHERE id = ${current.id} AND club_id = ${clubId}`);
        updated++;
      } else {
        const [createdFixture] = await db.insert(championshipFixturesTable).values({
          clubId,
          championshipId: championship.id,
          groupId: group.id,
          ...values,
        }).returning({ id: championshipFixturesTable.id });
        await db.execute(sql`UPDATE championship_fixtures SET external_source_key = ${fixture.externalKey} WHERE id = ${createdFixture.id} AND club_id = ${clubId}`);
        created++;
      }
    }

    const [fresh] = await enrichedChampionships({ clubId, section, teamId }).then((rows) => rows.filter((item) => item.id === championship.id));
    res.json({
      championship: fresh ?? championship,
      preview: parsed,
      created,
      updated,
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Errore sincronizzazione Gare LND" });
  }
});

router.post("/championships", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a creare campionati" });
    return;
  }
  await ensureChampionshipTables();
  const title = String(req.body?.title ?? "").trim();
  const section = normalizeSection(req.body?.section);
  const teamIdRaw = req.body?.teamId == null ? null : Number(req.body.teamId);
  const teamId = Number.isFinite(teamIdRaw) && teamIdRaw! > 0 ? teamIdRaw : null;
  if (!title || !section) {
    res.status(400).json({ error: "Titolo e sezione sono obbligatori" });
    return;
  }
  if (!(await teamBelongsToClub(teamId, clubId))) {
    res.status(400).json({ error: "Squadra non valida per questa societa" });
    return;
  }
  const [championship] = await db
    .insert(championshipsTable)
    .values({
      clubId,
      section,
      teamId,
      seasonId: req.body?.seasonId ?? null,
      title,
      category: String(req.body?.category ?? "").trim() || null,
      pointsRule: normalizePointsRule(req.body?.pointsRule),
      createdByUserId: req.session.userId ?? null,
    })
    .returning();
  await db.insert(championshipGroupsTable).values({
    clubId,
    championshipId: championship.id,
    name: String(req.body?.groupName ?? "").trim() || "Girone",
  });
  res.status(201).json((await enrichedChampionships({ clubId, section, teamId })).find((item) => item.id === championship.id));
});

router.patch("/championship-fixtures/:id/result", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a modificare risultati campionato" });
    return;
  }
  await ensureChampionshipTables();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Fixture non valida" });
    return;
  }
  const homeScore = scoreValue(req.body?.homeScore);
  const awayScore = scoreValue(req.body?.awayScore);
  const [updated] = await db
    .update(championshipFixturesTable)
    .set({ homeScore, awayScore, updatedAt: new Date() })
    .where(and(eq(championshipFixturesTable.id, id), eq(championshipFixturesTable.clubId, clubId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Partita girone non trovata" });
    return;
  }
  res.json(updated);
});

router.post("/championships/:id/fixtures", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a creare partite girone" });
    return;
  }
  await ensureChampionshipTables();
  const championshipId = Number(req.params.id);
  const groupId = Number(req.body?.groupId);
  const homeTeam = String(req.body?.homeTeam ?? "").trim();
  const awayTeam = String(req.body?.awayTeam ?? "").trim();
  const matchIdRaw = req.body?.matchId == null ? null : Number(req.body.matchId);
  const matchId = Number.isInteger(matchIdRaw) && matchIdRaw! > 0 ? matchIdRaw : null;
  if (!Number.isInteger(championshipId) || !Number.isInteger(groupId) || !homeTeam || !awayTeam) {
    res.status(400).json({ error: "Campionato, girone, casa e trasferta sono obbligatori" });
    return;
  }
  const [championship] = await db
    .select()
    .from(championshipsTable)
    .where(and(eq(championshipsTable.id, championshipId), eq(championshipsTable.clubId, clubId)))
    .limit(1);
  const [group] = await db
    .select()
    .from(championshipGroupsTable)
    .where(and(eq(championshipGroupsTable.id, groupId), eq(championshipGroupsTable.championshipId, championshipId), eq(championshipGroupsTable.clubId, clubId)))
    .limit(1);
  if (!championship || !group) {
    res.status(404).json({ error: "Campionato o girone non trovato" });
    return;
  }
  if (matchId) {
    const [match] = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, clubId)))
      .limit(1);
    if (!match) {
      res.status(400).json({ error: "Partita calendario non valida per questa societa" });
      return;
    }
  }
  const dateRaw = String(req.body?.date ?? "").trim();
  const date = dateRaw ? new Date(dateRaw) : null;
  const [fixture] = await db
    .insert(championshipFixturesTable)
    .values({
      clubId,
      championshipId,
      groupId,
      matchId,
      homeTeam,
      awayTeam,
      round: req.body?.round == null ? null : Number(req.body.round),
      leg: normalizeLeg(req.body?.leg),
      date: date && !Number.isNaN(date.getTime()) ? date : null,
      location: String(req.body?.location ?? "").trim() || null,
      notes: String(req.body?.notes ?? "").trim() || null,
      homeScore: scoreValue(req.body?.homeScore),
      awayScore: scoreValue(req.body?.awayScore),
    })
    .returning();
  res.status(201).json(fixture);
});

export default router;
