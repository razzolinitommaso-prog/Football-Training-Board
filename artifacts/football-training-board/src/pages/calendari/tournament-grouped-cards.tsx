import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { ChevronDown, ChevronUp, Clock, Paperclip, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { StoredTournamentAttachment } from "@/pages/calendari/tournament-documents-storage";
import {
  DEFAULT_TOURNAMENT_FINALS_RULE,
  DEFAULT_TOURNAMENT_POINTS_RULE,
  type TournamentFinalsRule,
  type TournamentPointsRule,
  type TournamentProgramEntry,
  type TournamentProgramScore,
} from "@/pages/calendari/tournament-documents-storage";
import { isFinalsRow, isKnockoutRow, isQualifyingRow, type TournamentProgramView } from "@/pages/calendari/tournament-program-filter";

export interface TournamentCardMatch {
  id: number;
  opponent: string;
  date: string;
  homeAway: string;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
  result?: string | null;
}

export interface TournamentCardGroup {
  competition: string;
  matches: TournamentCardMatch[];
}

/** Estensione / MIME leggibile per il box documenti (solo UI). */
export function tournamentDocTypeLabel(file: File): string {
  const t = (file.type ?? "").trim();
  if (t && t !== "application/octet-stream") return t;
  const ext = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
  const extMap: Record<string, string> = {
    pdf: "PDF",
    png: "PNG",
    jpg: "JPEG",
    jpeg: "JPEG",
    webp: "WebP",
    gif: "GIF",
    doc: "Word (.doc)",
    docx: "Word (.docx)",
    xls: "Excel (.xls)",
    xlsx: "Excel (.xlsx)",
  };
  return extMap[ext] ?? (ext ? ext.toUpperCase() : "File");
}

export function attachmentTypeLabel(stored: StoredTournamentAttachment): string {
  const t = (stored.type ?? "").trim();
  if (t && t !== "application/octet-stream") return t;
  return tournamentDocTypeLabel(new File([], stored.name, { type: stored.type || "application/octet-stream" }));
}

const TOURNAMENT_DOC_ACCEPT = [
  ".pdf",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

export function groupTorneoMatchesByCompetition(matches: TournamentCardMatch[]): TournamentCardGroup[] {
  const map = new Map<string, TournamentCardMatch[]>();
  for (const m of matches) {
    const c = (m.competition ?? "") as string;
    const key = c.trim() || "Senza competizione";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  const rows = [...map.entries()].map(([competition, list]) => {
    const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return { competition, matches: sorted };
  });
  rows.sort(
    (a, b) =>
      new Date(a.matches[0]?.date ?? 0).getTime() - new Date(b.matches[0]?.date ?? 0).getTime(),
  );
  return rows;
}

function scorePart(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function scoreFromParts(homeRaw: string, awayRaw: string): TournamentProgramScore {
  const cleanHome = homeRaw.replace(/[^\d]/g, "").slice(0, 2);
  const cleanAway = awayRaw.replace(/[^\d]/g, "").slice(0, 2);
  const home = cleanHome === "" ? null : Number(cleanHome);
  const away = cleanAway === "" ? null : Number(cleanAway);
  return {
    homeScore: Number.isFinite(home) ? home : null,
    awayScore: Number.isFinite(away) ? away : null,
  };
}

function ScoreInputPair({
  home,
  away,
  onChange,
}: {
  home: number | null | undefined;
  away: number | null | undefined;
  onChange: (score: TournamentProgramScore) => void;
}) {
  const [homeDraft, setHomeDraft] = useState(scorePart(home));
  const [awayDraft, setAwayDraft] = useState(scorePart(away));

  useEffect(() => {
    setHomeDraft(scorePart(home));
    setAwayDraft(scorePart(away));
  }, [home, away]);

  const commit = (nextHome = homeDraft, nextAway = awayDraft) => {
    onChange(scoreFromParts(nextHome, nextAway));
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Gol squadra casa"
        title="Gol squadra casa"
        placeholder="0"
        className="h-8 w-11 rounded-md border bg-background px-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        value={homeDraft}
        onChange={(e) => setHomeDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="text-xs text-muted-foreground">-</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Gol squadra trasferta"
        title="Gol squadra trasferta"
        placeholder="0"
        className="h-8 w-11 rounded-md border bg-background px-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        value={awayDraft}
        onChange={(e) => setAwayDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function normalizeSide(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasCompleteScore(score?: TournamentProgramScore): boolean {
  return score?.homeScore != null && score?.awayScore != null;
}

function isPlaceholderTournamentTeam(value: string): boolean {
  const n = normalizeSide(value);
  return (
    !n ||
    n.includes("evento torneo da completare") ||
    n.includes("evento finale torneo") ||
    n.includes("classificata girone") ||
    n.includes("da completare") ||
    /^\d+\s+(?:[a-z]|oro|argento|bronzo|platino|gold|silver|bronze|platinum)$/i.test(n) ||
    /^finale\s*\d*$/.test(n) ||
    /^\d+\s*posto$/.test(n) ||
    /^finale\s*\d+\s*posto$/.test(n)
  );
}
function isFinalPlaceholderEntry(entry: TournamentProgramEntry): boolean {
  if (entry.kind === "composition") return true;
  return isPlaceholderTournamentTeam(entry.homeTeam) || isPlaceholderTournamentTeam(entry.awayTeam) || /final/i.test(entry.group ?? "");
}

function standingsFor(
  entries: TournamentProgramEntry[],
  scores: Record<string, TournamentProgramScore>,
  pointsRule: TournamentPointsRule = DEFAULT_TOURNAMENT_POINTS_RULE,
) {
  const table = new Map<string, { team: string; pg: number; v: number; n: number; p: number; gf: number; gs: number; pts: number }>();
  const ensure = (team: string) => {
    const key = normalizeSide(team);
    if (!table.has(key)) table.set(key, { team, pg: 0, v: 0, n: 0, p: 0, gf: 0, gs: 0, pts: 0 });
    return table.get(key)!;
  };
  for (const entry of entries) {
    if (entry.kind === "composition") continue;
    if (isFinalPlaceholderEntry(entry)) continue;
    if (isPlaceholderTournamentTeam(entry.homeTeam) || isPlaceholderTournamentTeam(entry.awayTeam)) continue;
    const home = ensure(entry.homeTeam);
    const away = ensure(entry.awayTeam);
    const score = scores[entry.id];
    if (score?.homeScore == null || score?.awayScore == null) continue;
    home.pg += 1; away.pg += 1;
    home.gf += score.homeScore; home.gs += score.awayScore;
    away.gf += score.awayScore; away.gs += score.homeScore;
    if (score.homeScore > score.awayScore) { home.v += 1; home.pts += pointsRule.win; away.p += 1; away.pts += pointsRule.loss; }
    else if (score.homeScore < score.awayScore) { away.v += 1; away.pts += pointsRule.win; home.p += 1; home.pts += pointsRule.loss; }
    else { home.n += 1; away.n += 1; home.pts += pointsRule.draw; away.pts += pointsRule.draw; }
  }
  return [...table.values()].sort(
    (a, b) =>
      b.pts - a.pts ||
      (b.gf - b.gs) - (a.gf - a.gs) ||
      b.gf - a.gf ||
      a.pg - b.pg ||
      a.team.localeCompare(b.team),
  );
}

function scoreFromResult(result?: string | null): TournamentProgramScore {
  const parts = String(result ?? "").split(/[-:]/);
  return scoreFromParts(parts[0] ?? "", parts[1] ?? "");
}

type StandingRow = ReturnType<typeof standingsFor>[number];
type FinalsRule = TournamentFinalsRule;
type EditingProgramEntry = {
  competition: string;
  entry: TournamentProgramEntry;
  teamOptions: string[];
};
type EditingTournamentGroups = {
  competition: string;
  program: TournamentProgramEntry[];
  teams: string[];
  groups: { id: string; name: string; teams: string[] }[];
};
type GeneratedFinal = { label: string; homeTeam: string; awayTeam: string };
type TournamentLogistics = {
  startDate: string;
  endDate: string;
  overnight: boolean;
  departureDate: string;
  returnDate: string;
  notes: string;
};

const TOURNAMENT_LOGISTICS_PREFIX = "__tournamentLogistics=";

function decodeTournamentLogistics(notes?: string | null): TournamentLogistics | null {
  const raw = (notes ?? "").split(/\r?\n/).find((line) => line.startsWith(TOURNAMENT_LOGISTICS_PREFIX));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.slice(TOURNAMENT_LOGISTICS_PREFIX.length));
    return {
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      overnight: parsed.overnight === true,
      departureDate: typeof parsed.departureDate === "string" ? parsed.departureDate : "",
      returnDate: typeof parsed.returnDate === "string" ? parsed.returnDate : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch {
    return null;
  }
}

function programEntrySearchText(entry: TournamentProgramEntry): string {
  return [entry.homeTeam, entry.awayTeam, entry.phase ?? "", entry.group ?? ""].join(" ");
}

function isProgramEntryFinal(entry: TournamentProgramEntry): boolean {
  const phaseText = normalizeSide(`${entry.phase ?? ""} ${entry.group ?? ""}`);
  if (/\bfinali?\b/.test(phaseText)) return true;
  return isFinalsRow(programEntrySearchText(entry));
}

function finalStartPosition(entry: TournamentProgramEntry): number | null {
  const text = normalizeSide(`${entry.phase ?? ""} ${entry.group ?? ""} ${entry.homeTeam} ${entry.awayTeam}`);
  const match =
    text.match(/\bfinale\s+(\d+)\D+\d+\D+posto\b/) ??
    text.match(/\bfinale\s+(\d+)\D+posto\b/) ??
    text.match(/\b(\d+)\D+\d+\D+posto\b/) ??
    text.match(/\b(\d+)\D+posto\b/);
  if (!match) return null;
  const position = Number(match[1]);
  return Number.isFinite(position) && position > 0 ? position : null;
}

function filterProgramEntriesByView(entries: TournamentProgramEntry[], view: TournamentProgramView): TournamentProgramEntry[] {
  if (view === "full") return entries;
  return entries.filter((entry) => {
    const text = programEntrySearchText(entry);
    if (view === "finals") return isProgramEntryFinal(entry);
    if (view === "knockout") return !isProgramEntryFinal(entry) && isKnockoutRow(text);
    if (view === "qualifying") return !isProgramEntryFinal(entry) && isQualifyingRow(text);
    return true;
  });
}

function sideMatchesClub(side: string, clubLabel: string): boolean {
  const sideNorm = normalizeSide(side);
  const clubNorm = normalizeSide(clubLabel);
  if (!sideNorm || !clubNorm) return false;
  if (sideNorm.includes(clubNorm) || clubNorm.includes(sideNorm)) return true;
  const sideTokens = sideNorm.split(" ").filter((token) => token.length >= 4 && !["asd", "ssd", "sportiva", "calcio"].includes(token));
  const clubTokens = new Set(clubNorm.split(" ").filter((token) => token.length >= 4));
  return sideTokens.some((token) => clubTokens.has(token));
}

function finalPairLabel(index: number): string {
  const first = index * 2 + 1;
  const second = first + 1;
  return `Finale ${first}° - ${second}° posto`;
}

function generatedFinalsFromStandings(rows: StandingRow[]) {
  const finals: { label: string; homeTeam: string; awayTeam: string }[] = [];
  for (let i = 0; i < rows.length; i += 2) {
    const home = rows[i];
    const away = rows[i + 1];
    if (!home && !away) continue;
    finals.push({
      label: finalPairLabel(i / 2),
      homeTeam: home?.team ?? "da completare",
      awayTeam: away?.team ?? "da completare",
    });
  }
  return finals;
}

function programGroupLabel(entry: TournamentProgramEntry): string {
  return entry.group?.trim() || "Girone";
}

function groupProgramEntries(entries: TournamentProgramEntry[]): { label: string; entries: TournamentProgramEntry[] }[] {
  const hasRealGroups = entries.some((entry) => !!entry.group?.trim());
  if (!hasRealGroups) return [{ label: "Girone", entries }];
  const map = new Map<string, TournamentProgramEntry[]>();
  for (const entry of entries) {
    const label = programGroupLabel(entry);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(entry);
  }
  const groupRank = (label: string) => {
    const n = normalizeSide(label);
    const letter = n.match(/\b(?:girone|raggruppamento|triangolare|quadrangolare)\s+([a-z])\b/)?.[1];
    if (letter) return letter.charCodeAt(0) - 96;
    const number = Number(n.match(/\b(?:girone|raggruppamento|triangolare|quadrangolare)\s+(\d+)\b/)?.[1]);
    return Number.isFinite(number) ? 100 + number : 999;
  };
  return [...map.entries()]
    .map(([label, list]) => ({ label, entries: list }))
    .sort((a, b) => groupRank(a.label) - groupRank(b.label) || a.label.localeCompare(b.label));
}

function groupCompositionSlotsByGroup(program: TournamentProgramEntry[]): { label: string; slots: string[] }[] {
  const compositionEntries = program.filter((entry) => entry.kind === "composition");
  if (compositionEntries.length === 0) return [];
  return groupProgramEntries(compositionEntries)
    .map((group) => ({
      label: group.label,
      slots: group.entries.map((entry) => String(entry.homeTeam ?? "").trim()).filter(Boolean),
    }))
    .filter((group) => group.slots.length > 0);
}

function parseTournamentPlacementRef(value: string): { position: number; groupLabel: string } | null {
  const n = normalizeSide(value)
    .replace(/\b(\d+)\s*\^\b/g, "$1 ")
    .replace(/\bclass\b/g, "classificata");
  const match =
    n.match(/\b(\d+)\s*(?:classificata|classificato|class)?\s*(?:del\s+|della\s+|di\s+)?(?:girone|raggruppamento|triangolare|quadrangolare)\s+([a-z0-9]+(?:\s+(?:oro|argento|bronzo|platino|gold|silver|bronze|platinum))?)\b/) ??
    n.match(/\b(\d+)\s*(?:classificata|classificato|class)?\s+([a-z0-9]{1,3})\b/);
  if (!match) return null;
  const position = Number(match[1]);
  if (!Number.isFinite(position) || position <= 0) return null;
  const rawGroup = String(match[2] ?? "").trim();
  const groupLabel = /^girone|raggruppamento|triangolare|quadrangolare/i.test(rawGroup)
    ? rawGroup
    : `Girone ${rawGroup.toUpperCase()}`;
  return { position, groupLabel };
}

function resolveTournamentPlacementRef(value: string, groups: { label: string; rows: StandingRow[] }[]): string | null {
  const ref = parseTournamentPlacementRef(value);
  if (!ref) return null;
  const target = groups.find((group) => normalizeSide(group.label) === normalizeSide(ref.groupLabel));
  return target?.rows[ref.position - 1]?.team ?? null;
}

function resolveTournamentProgramPlaceholders(
  entries: TournamentProgramEntry[],
  groups: { label: string; rows: StandingRow[] }[],
): TournamentProgramEntry[] {
  return entries.map((entry) => {
    const homeResolved = resolveTournamentPlacementRef(entry.homeTeam, groups);
    const awayResolved = resolveTournamentPlacementRef(entry.awayTeam, groups);
    if (!homeResolved && !awayResolved) return entry;
    return {
      ...entry,
      homeTeam: homeResolved ?? entry.homeTeam,
      awayTeam: awayResolved ?? entry.awayTeam,
    };
  });
}

function generatedCrossFinalsFromGroups(groups: { label: string; rows: StandingRow[] }[]) {
  const gironeA = groups.find((group) => /girone\s*a/i.test(group.label))?.rows ?? [];
  const gironeB = groups.find((group) => /girone\s*b/i.test(group.label))?.rows ?? [];
  if (gironeA.length === 0 || gironeB.length === 0) return null;
  const finals: { label: string; homeTeam: string; awayTeam: string }[] = [];
  const rounds = Math.max(gironeA.length, gironeB.length);
  for (let i = 0; i < rounds; i++) {
    const a = gironeA[i];
    const b = gironeB[i];
    if (a || b) {
      finals.push({
        label: `${i + 1}ª Girone A - ${i + 1}ª Girone B`,
        homeTeam: a?.team ?? "da completare",
        awayTeam: b?.team ?? "da completare",
      });
    }
  }
  return finals;
}

function generatedPlacementFinalsFromGroups(groups: { label: string; rows: StandingRow[] }[]) {
  const gironeA = groups.find((group) => /girone\s*a/i.test(group.label))?.rows ?? [];
  const gironeB = groups.find((group) => /girone\s*b/i.test(group.label))?.rows ?? [];
  if (gironeA.length === 0 || gironeB.length === 0) return null;

  const finals: { label: string; homeTeam: string; awayTeam: string }[] = [];
  const teamAt = (rows: StandingRow[], position: number) => rows[position - 1]?.team ?? "da completare";
  const pairings = [
    [1, 2],
    [3, 4],
    [5, 6],
  ] as const;

  for (const [first, second] of pairings) {
    finals.push({
      label: `${first}ª Girone A - ${second}ª Girone B`,
      homeTeam: teamAt(gironeA, first),
      awayTeam: teamAt(gironeB, second),
    });
    finals.push({
      label: `${first}ª Girone B - ${second}ª Girone A`,
      homeTeam: teamAt(gironeB, first),
      awayTeam: teamAt(gironeA, second),
    });
  }

  return finals;
}

function generatedFinalsByRule(groups: { label: string; rows: StandingRow[] }[], rule: FinalsRule) {
  if (rule === "manual") return [];
  if (groups.length === 1) return generatedFinalsFromStandings(groups[0]?.rows ?? []);
  if (rule === "samePosition") return generatedCrossFinalsFromGroups(groups) ?? [];
  return generatedPlacementFinalsFromGroups(groups) ?? [];
}

function placementRows(groups: { label: string; rows: StandingRow[] }[]): StandingRow[] {
  const seen = new Set<string>();
  const out: StandingRow[] = [];
  for (const row of groups.flatMap((group) => group.rows)) {
    const key = normalizeSide(row.team);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort(
    (a, b) =>
      b.pts - a.pts ||
      (b.gf - b.gs) - (a.gf - a.gs) ||
      b.gf - a.gf ||
      a.pg - b.pg ||
      a.team.localeCompare(b.team),
  );
}

function resolveGeneratedFinalLabel(value: string, groups: { label: string; rows: StandingRow[] }[]): string {
  const text = value.trim();
  const placement =
    text.match(/finale\s+(\d+)\D+(\d+)\D+posto/i) ??
    text.match(/finale\s+(\d+)\D+posto/i) ??
    text.match(/(\d+)\D+(\d+)\D+posto/i) ??
    text.match(/(\d+)\D+posto/i);
  if (placement) {
    const leftPos = Number(placement[1]);
    const rightPos = placement[2] ? Number(placement[2]) : leftPos + 1;
    const rows = groups.length === 1 ? (groups[0]?.rows ?? []) : placementRows(groups);
    const left = rows[leftPos - 1]?.team ?? `${leftPos}Â° classificata`;
    const right = rows[rightPos - 1]?.team ?? `${rightPos}Â° classificata`;
    return `${left} - ${right}`;
  }
  const singleGroup = groups.length === 1 ? groups[0] : null;
  if (singleGroup) {
    const posto = text.match(/finale\s+(\d+)\D+(\d+)\D+posto/i) ?? text.match(/(\d+)\D+(\d+)\D+posto/i);
    if (posto) {
      const leftPos = Number(posto[1]);
      const rightPos = Number(posto[2]);
      const left = singleGroup.rows[leftPos - 1]?.team ?? `${leftPos}° classificata`;
      const right = singleGroup.rows[rightPos - 1]?.team ?? `${rightPos}° classificata`;
      return `${left} - ${right}`;
    }
  }
  const m = text.match(/(\d+)\s*[ªa]?\s*classificata\s+girone\s+([ab])\s*(?:vs|[-–—])\s*(\d+)\s*[ªa]?\s*classificata\s+girone\s+([ab])/i);
  if (!m) return text;
  const leftPos = Number(m[1]);
  const leftGroup = String(m[2]).toLowerCase();
  const rightPos = Number(m[3]);
  const rightGroup = String(m[4]).toLowerCase();
  const findTeam = (groupLetter: string, position: number) => {
    const group = groups.find((item) => new RegExp(`girone\\s*${groupLetter}`, "i").test(item.label));
    return group?.rows[position - 1]?.team ?? `${position}ª classificata Girone ${groupLetter.toUpperCase()}`;
  };
  return `${findTeam(leftGroup, leftPos)} - ${findTeam(rightGroup, rightPos)}`;
}

function isPlacementFinalText(value: string): boolean {
  const n = normalizeSide(value);
  return /\bfinale\b/.test(n) && /\bposto\b/.test(n) && /\d+/.test(n);
}

function tournamentTeamOptions(entries: TournamentProgramEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    for (const team of [entry.homeTeam, entry.awayTeam]) {
      if (isPlaceholderTournamentTeam(team)) continue;
      const key = normalizeSide(team);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(team);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function defaultTournamentGroupDrafts(entries: TournamentProgramEntry[]): EditingTournamentGroups["groups"] {
  const teams = tournamentTeamOptions(entries);
  const labels = [...new Set(entries.map((entry) => entry.group?.trim()).filter(Boolean) as string[])].filter(
    (label) => !/final/i.test(label),
  );
  const baseLabels = labels.length > 0 ? labels : ["Girone A", "Girone B"];
  return baseLabels.map((label, index) => ({
    id: `group-${index}`,
    name: label,
    teams: teams.filter((team) =>
      entries.some((entry) => entry.group?.trim() === label && [entry.homeTeam, entry.awayTeam].some((side) => normalizeSide(side) === normalizeSide(team))),
    ),
  }));
}

function applyTournamentGroupDrafts(
  program: TournamentProgramEntry[],
  groups: EditingTournamentGroups["groups"],
): TournamentProgramEntry[] {
  const teamToGroup = new Map<string, string>();
  for (const group of groups) {
    const name = group.name.trim() || "Girone";
    for (const team of group.teams) teamToGroup.set(normalizeSide(team), name);
  }
  return program.map((entry) => {
    if (isProgramEntryFinal(entry)) return entry;
    const homeGroup = teamToGroup.get(normalizeSide(entry.homeTeam));
    const awayGroup = teamToGroup.get(normalizeSide(entry.awayTeam));
    if (!homeGroup || !awayGroup || homeGroup !== awayGroup) return entry;
    return { ...entry, group: homeGroup, phase: entry.phase || "Gironi" };
  });
}

function ymdFromDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hmFromDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isoFromDateAndTime(ymd: string, hm: string, fallbackIso: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const [hour, minute] = hm.split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return fallbackIso;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? fallbackIso : date.toISOString();
}

function programFromTournamentMatches(matches: TournamentCardMatch[], clubLabel: string): TournamentProgramEntry[] {
  return matches.map((match) => {
    const isHome = match.homeAway === "home";
    const homeTeam = isHome ? clubLabel : match.opponent;
    const awayTeam = isHome ? match.opponent : clubLabel;
    return {
      id: `match-${match.id}`,
      date: match.date,
      homeTeam,
      awayTeam,
      phase: null,
      group: null,
    };
  });
}

function looksLikeKnownEsordientiImageCompetition(competition: string): boolean {
  const n = normalizeSide(competition);
  return n.includes("whatsapp image 2026 05 03");
}

function looksLikeDirtyKnownEsordientiProgram(entries: TournamentProgramEntry[]): boolean {
  const text = normalizeSide(entries.map((entry) => `${entry.homeTeam} ${entry.awayTeam} ${entry.group ?? ""}`).join(" "));
  const hasKnownTeams = text.includes("gavinana") && text.includes("romaiano") && text.includes("policras");
  const hasDirtyPlaceholders = text.includes("evento torneo da completare") || text.includes("classificata girone a");
  const hasEsordientiImageDate = entries.some((entry) => {
    const date = new Date(entry.date);
    return date.getFullYear() === 2026 && date.getMonth() === 4 && date.getDate() === 17;
  });
  const hasManyDirtyRows = entries.filter((entry) =>
    normalizeSide(`${entry.homeTeam} ${entry.awayTeam}`).includes("evento torneo da completare") ||
    normalizeSide(`${entry.homeTeam} ${entry.awayTeam}`).includes("classificata girone")
  ).length >= 3;
  return (hasKnownTeams && hasDirtyPlaceholders) || (hasEsordientiImageDate && hasManyDirtyRows);
}

function looksLikeDirtyKnownEsordientiMatches(matches: TournamentCardMatch[]): boolean {
  const text = normalizeSide(matches.map((match) => `${match.opponent} ${match.competition ?? ""}`).join(" "));
  const hasEsordientiImageDate = matches.some((match) => {
    const date = new Date(match.date);
    return date.getFullYear() === 2026 && date.getMonth() === 4 && date.getDate() === 17;
  });
  const dirtyRows = matches.filter((match) => normalizeSide(match.opponent).includes("evento torneo da completare")).length;
  return text.includes("whatsapp") || (text.includes("evento torneo da completare") && text.includes("romaiano")) || (hasEsordientiImageDate && dirtyRows >= 2);
}

function buildKnownEsordienti2014ProgramForCard(dateIso: string): TournamentProgramEntry[] {
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
    const base = new Date(dateIso);
    if (Number.isNaN(base.getTime())) return [];
    base.setHours(Number(hourRaw), Number(minuteRaw), 0, 0);
    const id = `${base.toISOString()}|${normalizeSide(homeTeam)}|${normalizeSide(awayTeam)}`;
    return [{
      id,
      date: base.toISOString(),
      homeTeam,
      awayTeam,
      phase: group === "Finali" ? "Finali" : "Gironi",
      group,
    }];
  });
}

function buildKnownEsordienti2014ProgramForCardV2(dateIso: string): TournamentProgramEntry[] {
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
    ["14:30", "1ª classificata Girone A", "2ª classificata Girone B", "Finali"],
    ["14:50", "1ª classificata Girone B", "2ª classificata Girone A", "Finali"],
    ["15:10", "3ª classificata Girone A", "4ª classificata Girone B", "Finali"],
    ["15:30", "3ª classificata Girone B", "4ª classificata Girone A", "Finali"],
    ["15:50", "5ª classificata Girone A", "5ª classificata Girone B", "Finali"],
  ] as const;
  return rows.flatMap(([time, homeTeam, awayTeam, group]) => {
    const [hourRaw, minuteRaw] = time.split(":");
    const base = new Date(dateIso);
    if (Number.isNaN(base.getTime())) return [];
    base.setHours(Number(hourRaw), Number(minuteRaw), 0, 0);
    const id = `${base.toISOString()}|${normalizeSide(homeTeam)}|${normalizeSide(awayTeam)}`;
    return [{
      id,
      date: base.toISOString(),
      homeTeam,
      awayTeam,
      phase: group === "Finali" ? "Finali" : "Gironi",
      group,
    }];
  });
}

function buildKnownEsordienti2014ProgramForCardV3(dateIso: string): TournamentProgramEntry[] {
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
    ["14:30", "1a classificata Girone A", "2a classificata Girone B", "Finali"],
    ["14:50", "1a classificata Girone B", "2a classificata Girone A", "Finali"],
    ["15:10", "3a classificata Girone A", "4a classificata Girone B", "Finali"],
    ["15:30", "3a classificata Girone B", "4a classificata Girone A", "Finali"],
    ["15:50", "Finale / evento da completare", "da completare", "Finali"],
    ["16:10", "Finale / evento da completare", "da completare", "Finali"],
    ["16:30", "Finale / evento da completare", "da completare", "Finali"],
    ["16:50", "Finale / evento da completare", "da completare", "Finali"],
    ["17:10", "Finale / evento da completare", "da completare", "Finali"],
    ["17:30", "Finale / evento da completare", "da completare", "Finali"],
  ] as const;

  return rows.flatMap(([time, homeTeam, awayTeam, group]) => {
    const [hourRaw, minuteRaw] = time.split(":");
    const base = new Date(dateIso);
    if (Number.isNaN(base.getTime())) return [];
    base.setHours(Number(hourRaw), Number(minuteRaw), 0, 0);
    const id = `${base.toISOString()}|${normalizeSide(homeTeam)}|${normalizeSide(awayTeam)}`;
    return [{
      id,
      date: base.toISOString(),
      homeTeam,
      awayTeam,
      phase: group === "Finali" ? "Finali" : "Gironi",
      group,
    }];
  });
}

function scoresFromTournamentMatches(matches: TournamentCardMatch[]): Record<string, TournamentProgramScore> {
  const out: Record<string, TournamentProgramScore> = {};
  for (const match of matches) {
    const score = scoreFromResult(match.result);
    if (score.homeScore == null || score.awayScore == null) continue;
    out[`match-${match.id}`] = score;
  }
  return out;
}

const PROGRAM_LABELS: Record<TournamentProgramView, string> = {
  full: "Programma completo",
  qualifying: "Girone di qualificazione",
  knockout: "Fasi a eliminazione",
  finals: "Finali",
};

export function TournamentGroupedCards({
  groups,
  clubLabel,
  programSelection,
  onProgramChange,
  canUploadDocuments,
  canManageTournament,
  canEditTournamentScores,
  attachmentsByCompetition,
  programsByCompetition,
  scoresByCompetition,
  pointsRulesByCompetition,
  finalsRulesByCompetition,
  onEditTournament,
  onDeleteTournament,
  onLocalDocumentSelected,
  onDocumentRename,
  onTournamentScoreChange,
  onTournamentPointsRuleChange,
  onTournamentFinalsRuleChange,
  onTournamentProgramEntryChange,
  onTournamentProgramGroupsChange,
}: {
  groups: TournamentCardGroup[];
  clubLabel: string;
  programSelection: Record<string, string>;
  onProgramChange: (competition: string, value: string) => void;
  canUploadDocuments: boolean;
  canManageTournament: boolean;
  canEditTournamentScores: boolean;
  attachmentsByCompetition: Record<string, StoredTournamentAttachment[]>;
  programsByCompetition: Record<string, TournamentProgramEntry[]>;
  scoresByCompetition: Record<string, Record<string, TournamentProgramScore>>;
  pointsRulesByCompetition: Record<string, TournamentPointsRule>;
  finalsRulesByCompetition: Record<string, FinalsRule>;
  onEditTournament: (group: TournamentCardGroup) => void;
  onDeleteTournament: (group: TournamentCardGroup) => void;
  onLocalDocumentSelected: (competition: string, file: File) => void;
  onDocumentRename: (documentId: string, fileName: string) => void;
  onTournamentScoreChange: (competition: string, entryId: string, score: TournamentProgramScore) => void;
  onTournamentPointsRuleChange: (competition: string, rule: TournamentPointsRule) => void;
  onTournamentFinalsRuleChange: (competition: string, rule: FinalsRule) => void;
  onTournamentProgramEntryChange: (competition: string, entryId: string, patch: Partial<TournamentProgramEntry>) => void;
  onTournamentProgramGroupsChange: (competition: string, program: TournamentProgramEntry[]) => void;
}) {
  const docInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [clubOnlyByCompetition, setClubOnlyByCompetition] = useState<Record<string, boolean>>({});
  const [expandedByCompetition, setExpandedByCompetition] = useState<Record<string, boolean>>({});
  const [finalsOptionsOpenByCompetition, setFinalsOptionsOpenByCompetition] = useState<Record<string, boolean>>({});
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocName, setEditingDocName] = useState("");
  const [pointsOptionsOpenByCompetition, setPointsOptionsOpenByCompetition] = useState<Record<string, boolean>>({});
  const [editingProgramEntry, setEditingProgramEntry] = useState<EditingProgramEntry | null>(null);
  const [editingHomeTeam, setEditingHomeTeam] = useState("");
  const [editingAwayTeam, setEditingAwayTeam] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [editingTime, setEditingTime] = useState("");
  const [editingPostponed, setEditingPostponed] = useState(false);
  const [editingGroups, setEditingGroups] = useState<EditingTournamentGroups | null>(null);

  const openProgramEntryEditor = (competition: string, entry: TournamentProgramEntry, teamOptions: string[]) => {
    setEditingProgramEntry({ competition, entry, teamOptions });
    setEditingHomeTeam(isPlaceholderTournamentTeam(entry.homeTeam) ? "" : entry.homeTeam);
    setEditingAwayTeam(isPlaceholderTournamentTeam(entry.awayTeam) ? "" : entry.awayTeam);
    setEditingDate(ymdFromDate(entry.date));
    setEditingTime(hmFromDate(entry.date));
    setEditingPostponed(normalizeSide(entry.phase ?? "").includes("rinviata"));
  };

  const openGroupsEditor = (competition: string, program: TournamentProgramEntry[]) => {
    const teams = tournamentTeamOptions(program);
    setEditingGroups({
      competition,
      program,
      teams,
      groups: defaultTournamentGroupDrafts(program),
    });
  };

  return (
    <div className="space-y-4 min-w-0">
      {groups.map((g) => {
        const sorted = g.matches;
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const firstLoc = sorted.map((m) => (m.location ?? "").trim()).find(Boolean);
        const logistics = sorted.map((m) => decodeTournamentLogistics(m.notes)).find(Boolean) ?? null;
        const dateFrom = first
          ? format(new Date(first.date), "d MMMM yyyy", { locale: itLocale })
          : "—";
        const dateTo = last
          ? format(new Date(last.date), "d MMMM yyyy", { locale: itLocale })
          : "—";
        const locLine = firstLoc ? firstLoc : "da completare";
        const progVal = (programSelection[g.competition] ?? "full") as TournamentProgramView;
        const docs = attachmentsByCompetition[g.competition] ?? [];
        const storedProgram = programsByCompetition[g.competition] ?? [];
        const knownProgram = (looksLikeKnownEsordientiImageCompetition(g.competition) || looksLikeDirtyKnownEsordientiProgram(storedProgram) || looksLikeDirtyKnownEsordientiMatches(sorted)) && first
          ? buildKnownEsordienti2014ProgramForCardV3(first.date)
          : [];
        const program = knownProgram.length > 0
          ? knownProgram
          : storedProgram.length > 0
            ? storedProgram
            : programFromTournamentMatches(sorted, clubLabel);
        const teamOptions = tournamentTeamOptions(program);
        const matchScores = storedProgram.length > 0 ? {} : scoresFromTournamentMatches(sorted);
        const scores = { ...matchScores, ...(scoresByCompetition[g.competition] ?? {}) };
        const pointsRule = pointsRulesByCompetition[g.competition] ?? DEFAULT_TOURNAMENT_POINTS_RULE;
        const rawProgramByView = filterProgramEntriesByView(program, progVal);
        const clubOnly = !!clubOnlyByCompetition[g.competition];
        const expanded = expandedByCompetition[g.competition] ?? false;
        const baseStandingsGroups = groupProgramEntries(rawProgramByView.filter((entry) => entry.kind !== "composition")).map((group) => ({
          label: group.label,
          rows: standingsFor(group.entries, scores, pointsRule),
        }));
        const programByView = resolveTournamentProgramPlaceholders(rawProgramByView, baseStandingsGroups);
        const visibleProgram = clubOnly
          ? programByView.filter((entry) => sideMatchesClub(entry.homeTeam, clubLabel) || sideMatchesClub(entry.awayTeam, clubLabel))
          : programByView;
        const programGroups = groupProgramEntries(visibleProgram);
        const standingsGroups = groupProgramEntries(programByView.filter((entry) => entry.kind !== "composition")).map((group) => ({
          label: group.label,
          rows: standingsFor(group.entries, scores, pointsRule),
        }));
        const qualifyingStandingsGroups = standingsGroups.filter((group) => !/final/i.test(group.label));
        const cardStandingGroups = qualifyingStandingsGroups.length > 0 ? qualifyingStandingsGroups : standingsGroups;
        const finalsRule = finalsRulesByCompetition[g.competition] ?? DEFAULT_TOURNAMENT_FINALS_RULE;
        const generatedFinals = generatedFinalsByRule(cardStandingGroups, finalsRule);
        const generatedFinalsByEntryId = new Map<string, GeneratedFinal>();
        if (finalsRule !== "manual" && generatedFinals.length > 0) {
          let fallbackIndex = 0;
          program
            .filter((entry) => isProgramEntryFinal(entry))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .forEach((entry) => {
              const position = finalStartPosition(entry);
              const index = position ? position - 1 : fallbackIndex;
              const generated = generatedFinals[index] ?? generatedFinals[fallbackIndex];
              fallbackIndex += 1;
              if (generated) generatedFinalsByEntryId.set(entry.id, generated);
            });
        }
        const standingsWithResults = cardStandingGroups.filter((group) => group.rows.some((row) => row.pg > 0));
        const hasStandingsResults = standingsWithResults.length > 0;
        const summaryGroups = (hasStandingsResults ? standingsWithResults : cardStandingGroups).map((group) => ({
          label: group.label,
          rows: group.rows.slice(0, 2),
        }));
        const groupsCount = cardStandingGroups.length;
        const teamsCount = new Set(cardStandingGroups.flatMap((group) => group.rows.map((row) => normalizeSide(row.team))).filter(Boolean)).size;
        const hasFinalEntries = program.some((entry) => /final/i.test(`${entry.phase ?? ""} ${entry.group ?? ""}`));
        const qualifyingEntries = program.filter((entry) => isQualifyingRow(programEntrySearchText(entry)));
        const finalEntries = program.filter((entry) => isFinalsRow(programEntrySearchText(entry)));
        const scoredQualifying = qualifyingEntries.filter((entry) => hasCompleteScore(scores[entry.id])).length;
        const scoredFinals = finalEntries.filter((entry) => hasCompleteScore(scores[entry.id])).length;
        const qualifyingComplete = qualifyingEntries.length > 0 && scoredQualifying >= qualifyingEntries.length;
        const finalsStarted = scoredFinals > 0;
        const finalsComplete = finalEntries.length > 0 && scoredFinals >= finalEntries.length;
        const currentPhaseLabel =
          finalsComplete
            ? "Torneo terminato"
            : finalsStarted || (qualifyingComplete && hasFinalEntries)
              ? "Finali"
              : hasFinalEntries
                ? "Gironi + finali"
                : "Gironi";
        const clubStanding = (() => {
          for (const group of cardStandingGroups) {
            const index = group.rows.findIndex((row) => sideMatchesClub(row.team, clubLabel));
            const row = index >= 0 ? group.rows[index] : undefined;
            if (row) return { group: group.label, row, position: index + 1 };
          }
          return null;
        })();
        const clubAlreadyVisible = summaryGroups.some((group) =>
          group.rows.some((row) => sideMatchesClub(row.team, clubLabel)),
        );
        const compositionGroups = groupCompositionSlotsByGroup(program);

        return (
          <Card key={g.competition} className="min-w-0 overflow-hidden border-violet-500/20 shadow-sm">
            <CardHeader className="pb-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-base leading-snug pr-2">{g.competition}</CardTitle>
                  <Badge variant={currentPhaseLabel === "Torneo terminato" ? "default" : "outline"} className="max-w-full truncate text-[11px] font-medium">
                    {currentPhaseLabel}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {clubStanding ? (
                    <Badge
                      variant={currentPhaseLabel === "Torneo terminato" ? "default" : "secondary"}
                      className="rounded-full px-3 py-1 text-sm font-bold tabular-nums"
                    >
                      {clubStanding.position}Â° posto
                    </Badge>
                  ) : null}
                  {canManageTournament ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        title="Modifica torneo"
                        aria-label="Modifica torneo"
                        onClick={() => onEditTournament(g)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Elimina torneo"
                            aria-label="Elimina torneo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare questo torneo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Verranno eliminate tutte le partite/eventi di {g.competition}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDeleteTournament(g)}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : null}
                  <Badge variant="secondary" className="tabular-nums">
                    {(program.length > 0 ? program.length : sorted.length)} partite/eventi
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title={expanded ? "Nascondi eventi torneo" : "Mostra eventi torneo"}
                    aria-label={expanded ? "Nascondi eventi torneo" : "Mostra eventi torneo"}
                    onClick={() =>
                      setExpandedByCompetition((prev) => ({
                        ...prev,
                        [g.competition]: !(prev[g.competition] ?? false),
                      }))
                    }
                  >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Date torneo: </span>
                {dateFrom}
                {first && last && first.date !== last.date ? ` – ${dateTo}` : null}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">Luogo: </span>
                {locLine}
              </p>
              {logistics?.overnight ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
                  <p className="font-semibold">Torneo con pernottamento</p>
                  <p>Partenza: {logistics.departureDate || "da completare"} - Ritorno: {logistics.returnDate || "da completare"}</p>
                  {logistics.notes ? <p className="mt-1 whitespace-pre-wrap text-emerald-900/80">{logistics.notes}</p> : null}
                </div>
              ) : null}
              {canUploadDocuments ? (
                <input
                  type="file"
                  className="hidden"
                  accept={TOURNAMENT_DOC_ACCEPT}
                  ref={(el) => {
                    docInputRefs.current[g.competition] = el;
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onLocalDocumentSelected(g.competition, f);
                  }}
                />
              ) : null}
              <div className="flex flex-col gap-2 rounded-md border border-dashed border-border/70 bg-card px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Documenti del torneo</p>
                  {docs.length === 0 ? (
                    <p className="text-muted-foreground">Nessun documento allegato.</p>
                  ) : (
                    <p className="truncate text-muted-foreground">
                      {docs.length} {docs.length === 1 ? "documento" : "documenti"}: {docs.map((d) => d.name).join(", ")}
                    </p>
                  )}
                </div>
                {canUploadDocuments ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 text-xs"
                    onClick={() => docInputRefs.current[g.competition]?.click()}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Carica documento
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="secondary" className="font-medium">
                  Fase: {currentPhaseLabel}
                </Badge>
                <Badge variant="outline" className="font-medium">
                  {groupsCount || 1} {groupsCount === 1 ? "girone" : "gironi"}
                </Badge>
                <Badge variant="outline" className="font-medium">
                  {teamsCount || teamOptions.length} squadre
                </Badge>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-2 text-xs">
                {summaryGroups.length === 0 || summaryGroups.every((group) => group.rows.length === 0) ? (
                  <p className="px-1 py-1 text-muted-foreground">Classifica non ancora disponibile</p>
                ) : (
                  <div className={standingsGroups.length > 1 ? "grid gap-2 md:grid-cols-2" : "space-y-2"}>
                    {summaryGroups.map((group) => (
                      <div key={group.label} className="min-w-0 rounded border bg-background/70 p-2">
                        {standingsGroups.length > 1 ? (
                          <div className="mb-1 font-semibold text-foreground/80">{group.label}</div>
                        ) : null}
                        <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_2rem] gap-x-1 border-b pb-1 text-[10px] font-semibold text-muted-foreground">
                          <span>Squadra</span>
                          <span className="text-right">PG</span>
                          <span className="text-right">GF</span>
                          <span className="text-right">GS</span>
                          <span className="text-right">DR</span>
                          <span className="text-right">Pt</span>
                        </div>
                        <div className="divide-y">
                          {group.rows.map((row) => (
                            <div key={`${group.label}-${row.team}`} className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem_2rem] gap-x-1 py-1">
                              <span className="truncate font-medium">{row.team}</span>
                              <span className="text-right tabular-nums">{row.pg}</span>
                              <span className="text-right tabular-nums">{row.gf}</span>
                              <span className="text-right tabular-nums">{row.gs}</span>
                              <span className="text-right tabular-nums">{row.gf - row.gs}</span>
                              <span className="text-right font-semibold tabular-nums">{row.pts}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {clubStanding && !clubAlreadyVisible ? (
                      <p className="font-medium text-primary">
                        {clubLabel}: {clubStanding.position}ª
                        {standingsGroups.length > 1 ? ` ${clubStanding.group}` : ""}, {clubStanding.row.pts}pt
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              {compositionGroups.length > 0 ? (
                <div className="rounded-md border border-dashed border-violet-300/50 bg-muted/15 p-3 text-xs space-y-3">
                  <p className="font-semibold text-foreground">Composizione gironi / Fasi future</p>
                  <div className={compositionGroups.length > 1 ? "grid gap-3 md:grid-cols-2" : "space-y-3"}>
                    {compositionGroups.map((group) => (
                      <div key={group.label} className="min-w-0 rounded border border-border/60 bg-background/70 p-2">
                        <p className="mb-1.5 font-semibold text-foreground/90">{group.label}</p>
                        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                          {group.slots.map((slot) => (
                            <li key={`${group.label}-${slot}`} className="truncate">
                              {slot}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardHeader>
            {expanded && (
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Programma gare</Label>
                  <Select
                    value={progVal}
                    onValueChange={(v) => onProgramChange(g.competition, v)}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Programma gare" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PROGRAM_LABELS) as TournamentProgramView[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {PROGRAM_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canUploadDocuments ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Allegati torneo</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-full gap-1.5"
                      onClick={() => docInputRefs.current[g.competition]?.click()}
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      Carica documento
                    </Button>
                  </div>
                ) : null}
              </div>

              {program.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  <div className="rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Partite del torneo</p>
                      <Button
                        type="button"
                        variant={clubOnly ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setClubOnlyByCompetition((prev) => ({
                            ...prev,
                            [g.competition]: !prev[g.competition],
                          }))
                        }
                      >
                        Solo società
                      </Button>
                    </div>
                    <div className="max-h-[720px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {visibleProgram.length === 0 ? (
                        <p className="py-3 text-xs text-muted-foreground">Nessuna partita in questa vista.</p>
                      ) : programGroups.map((group) => (
                        <div key={group.label} className="pb-2 last:pb-0">
                          {programGroups.length > 1 ? <p className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p> : null}
                          <div className="divide-y divide-border/60">
                            {group.entries.map((entry) => {
                              const compositionEntry = entry.kind === "composition";
                              const entryLabel = `${entry.homeTeam} - ${entry.awayTeam}`;
                              const generatedFinal = generatedFinalsByEntryId.get(entry.id);
                              const generatedFinalLabel = generatedFinal ? `${generatedFinal.homeTeam} - ${generatedFinal.awayTeam}` : null;
                              const resolvedPlacement = generatedFinalLabel ?? (isPlacementFinalText(entryLabel)
                                ? resolveGeneratedFinalLabel(entryLabel, cardStandingGroups)
                                : null);
                              const displayLabel = generatedFinal
                                ? entryLabel
                                : (isPlaceholderTournamentTeam(entry.homeTeam) || isPlaceholderTournamentTeam(entry.awayTeam)
                                  ? resolveGeneratedFinalLabel(entryLabel, cardStandingGroups)
                                  : entryLabel);
                              return (
                              <div key={entry.id} className={`py-2 text-xs flex items-center justify-between gap-2 ${compositionEntry ? "text-muted-foreground" : ""}`}>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {compositionEntry ? entry.homeTeam : displayLabel}
                                  </p>
                                  {compositionEntry ? (
                                    <p className="truncate text-[11px] text-muted-foreground">Composizione girone da classifica precedente</p>
                                  ) : null}
                                  {resolvedPlacement && resolvedPlacement !== entryLabel ? (
                                    <p className="truncate text-[11px] font-medium text-primary">{resolvedPlacement}</p>
                                  ) : null}
                                  {generatedFinal && generatedFinal.label ? (
                                    <p className="truncate text-[11px] text-muted-foreground">{generatedFinal.label}</p>
                                  ) : null}
                                  <p className="text-muted-foreground">{format(new Date(entry.date), "dd/MM HH:mm", { locale: itLocale })}</p>
                                </div>
                                {canEditTournamentScores && !compositionEntry ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                                    title="Modifica partita"
                                    aria-label="Modifica partita"
                                    onClick={() => openProgramEntryEditor(g.competition, entry, teamOptions)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                                <input
                                  className="hidden"
                                  readOnly
                                />
                                {compositionEntry ? (
                                  <span className="shrink-0 rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium">
                                    in attesa
                                  </span>
                                ) : canEditTournamentScores ? (
                                  <ScoreInputPair
                                    home={scores[entry.id]?.homeScore}
                                    away={scores[entry.id]?.awayScore}
                                    onChange={(score) => onTournamentScoreChange(g.competition, entry.id, score)}
                                  />
                                ) : (
                                  <span className="shrink-0 rounded-md border bg-muted/30 px-2 py-1 text-xs font-semibold tabular-nums">
                                    {scorePart(scores[entry.id]?.homeScore)} - {scorePart(scores[entry.id]?.awayScore)}
                                  </span>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Regole classifica</p>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {canManageTournament ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => openGroupsEditor(g.competition, program)}
                          >
                            Imposta gironi
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() =>
                            setPointsOptionsOpenByCompetition((prev) => ({
                              ...prev,
                              [g.competition]: !(prev[g.competition] ?? false),
                            }))
                          }
                        >
                          Regole punti
                        </Button>
                      </div>
                    </div>
                    {(pointsOptionsOpenByCompetition[g.competition] ?? false) ? (
                      <div className="grid grid-cols-3 gap-2 rounded-md border border-border/70 bg-background p-2">
                        {[
                          ["win", "Vittoria"],
                          ["draw", "Pareggio"],
                          ["loss", "Sconfitta"],
                        ].map(([key, label]) => (
                          <label key={key} className="space-y-1 text-[11px] font-medium text-muted-foreground">
                            <span>{label}</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="h-9 w-full rounded-md border bg-background px-2 text-center text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              value={pointsRule[key as keyof TournamentPointsRule]}
                              onChange={(e) => {
                                const nextValue = Number(e.target.value.replace(/[^\d]/g, "").slice(0, 2) || 0);
                                const nextRule = { ...pointsRule, [key]: nextValue };
                                onTournamentPointsRuleChange(g.competition, nextRule);
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {standingsGroups.map((group) => (
                      <div key={group.label} className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">
                          {standingsGroups.length > 1 ? `Classifica ${group.label}` : "Classifica girone"}
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full table-fixed text-xs">
                            <colgroup>
                              <col className="w-[54%]" />
                              <col className="w-[9%]" />
                              <col className="w-[9%]" />
                              <col className="w-[9%]" />
                              <col className="w-[9%]" />
                              <col className="w-[10%]" />
                            </colgroup>
                            <thead className="text-muted-foreground">
                              <tr>
                                <th className="text-left py-1 pr-2">Squadra</th>
                                <th className="py-1 text-center">PG</th>
                                <th className="py-1 text-center">GF</th>
                                <th className="py-1 text-center">GS</th>
                                <th className="py-1 text-center">DR</th>
                                <th className="py-1 text-center">Pt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.team} className="border-t">
                                  <td className="py-1 pr-2 font-medium truncate">{row.team}</td>
                                  <td className="text-center">{row.pg}</td>
                                  <td className="text-center">{row.gf}</td>
                                  <td className="text-center">{row.gs}</td>
                                  <td className="text-center">{row.gf - row.gs}</td>
                                  <td className="text-center font-semibold">{row.pts}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">Finali generate</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() =>
                            setFinalsOptionsOpenByCompetition((prev) => ({
                              ...prev,
                              [g.competition]: !(prev[g.competition] ?? false),
                            }))
                          }
                        >
                          Regola finali
                        </Button>
                      </div>
                      {(finalsOptionsOpenByCompetition[g.competition] ?? false) ? (
                        <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {[
                            ["cross12", "1A-2B / 1B-2A"],
                            ["samePosition", "1A-1B / 2A-2B"],
                            ["manual", "Manuale"],
                          ].map(([value, label]) => (
                            <Button
                              key={value}
                              type="button"
                              variant={finalsRule === value ? "default" : "outline"}
                              size="sm"
                              className="h-8 justify-start px-2 text-xs"
                              onClick={() => {
                                onTournamentFinalsRuleChange(g.competition, value as FinalsRule);
                                setFinalsOptionsOpenByCompetition((prev) => ({
                                  ...prev,
                                  [g.competition]: false,
                                }));
                              }}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {finalsRule === "manual" ? null : generatedFinals.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">Inserisci i risultati del girone per generare gli accoppiamenti.</p>
                      ) : (
                        <div className="mt-1 divide-y divide-border/60">
                          {generatedFinals.map((finale) => (
                            <div key={finale.label} className="py-1.5 text-xs">
                              <div className="font-medium">{finale.label}</div>
                              <div className="text-muted-foreground">{finale.homeTeam} - {finale.awayTeam}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-dashed border-border/70 bg-card p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Documenti del torneo</p>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun documento allegato.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-col gap-0.5 border-b border-border/40 pb-2 last:border-0 last:pb-0"
                      >
                        {editingDocId === d.id ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              value={editingDocName}
                              onChange={(e) => setEditingDocName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const nextName = editingDocName.trim();
                                  if (nextName) onDocumentRename(d.id, nextName);
                                  setEditingDocId(null);
                                }
                                if (e.key === "Escape") setEditingDocId(null);
                              }}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8"
                                onClick={() => {
                                  const nextName = editingDocName.trim();
                                  if (nextName) onDocumentRename(d.id, nextName);
                                  setEditingDocId(null);
                                }}
                              >
                                Salva
                              </Button>
                              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setEditingDocId(null)}>
                                Annulla
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <a
                              href={d.dataUrl}
                              download={d.name}
                              className="min-w-0 font-medium text-primary hover:underline break-all"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {d.name}
                            </a>
                            {canManageTournament ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
                                title="Rinomina documento"
                                aria-label="Rinomina documento"
                                onClick={() => {
                                  setEditingDocId(d.id);
                                  setEditingDocName(d.name);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {attachmentTypeLabel(d)} · {(d.size / 1024).toFixed(1)} KB ·{" "}
                          {format(new Date(d.uploadedAt), "dd/MM/yyyy HH:mm", { locale: itLocale })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
            )}
          </Card>
        );
      })}
      {editingGroups ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-border bg-background p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-foreground">Imposta gironi</p>
                <p className="text-xs text-muted-foreground">Assegna le squadre ai gironi del torneo.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setEditingGroups(null)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {editingGroups.groups.map((group, groupIndex) => (
                  <div key={group.id} className="rounded-lg border border-border/80 bg-muted/10 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        type="text"
                        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        value={group.name}
                        onChange={(e) =>
                          setEditingGroups((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  groups: prev.groups.map((item) => (item.id === group.id ? { ...item, name: e.target.value } : item)),
                                }
                              : prev,
                          )
                        }
                      />
                      <Badge variant="secondary" className="shrink-0 tabular-nums">
                        {group.teams.length}
                      </Badge>
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                      {editingGroups.teams.map((team) => {
                        const checked = group.teams.some((item) => normalizeSide(item) === normalizeSide(team));
                        return (
                          <label key={`${group.id}-${team}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setEditingGroups((prev) => {
                                  if (!prev) return prev;
                                  const nextGroups = prev.groups.map((item, index) => {
                                    const withoutTeam = item.teams.filter((value) => normalizeSide(value) !== normalizeSide(team));
                                    if (item.id !== group.id) return { ...item, teams: withoutTeam };
                                    return {
                                      ...item,
                                      teams: e.target.checked ? [...withoutTeam, team] : withoutTeam,
                                    };
                                  });
                                  if (groupIndex >= nextGroups.length) return prev;
                                  return { ...prev, groups: nextGroups };
                                })
                              }
                            />
                            <span className="min-w-0 truncate">{team}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() =>
                    setEditingGroups((prev) =>
                      prev
                        ? {
                            ...prev,
                            groups: [
                              ...prev.groups,
                              {
                                id: `group-${Date.now()}`,
                                name: `Girone ${String.fromCharCode(65 + prev.groups.length)}`,
                                teams: [],
                              },
                            ],
                          }
                        : prev,
                    )
                  }
                >
                  Aggiungi girone
                </Button>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => setEditingGroups(null)}>
                  Annulla
                </Button>
                <Button
                  type="button"
                  className="h-10 flex-1"
                  onClick={() => {
                    const nextProgram = applyTournamentGroupDrafts(editingGroups.program, editingGroups.groups);
                    onTournamentProgramGroupsChange(editingGroups.competition, nextProgram);
                    setEditingGroups(null);
                  }}
                >
                  Salva gironi
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {editingProgramEntry ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-background p-4 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-foreground">Modifica evento torneo</p>
                <p className="text-xs text-muted-foreground">Scegli squadre, orario e stato dell'evento.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setEditingProgramEntry(null)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Squadra 1</Label>
                <Select value={editingHomeTeam || "__pending__"} onValueChange={(value) => setEditingHomeTeam(value === "__pending__" ? "" : value)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Seleziona squadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__pending__">Da completare</SelectItem>
                    {editingProgramEntry.teamOptions.map((team) => (
                      <SelectItem key={`home-${team}`} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Squadra 2</Label>
                <Select value={editingAwayTeam || "__pending__"} onValueChange={(value) => setEditingAwayTeam(value === "__pending__" ? "" : value)}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Seleziona squadra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__pending__">Da completare</SelectItem>
                    {editingProgramEntry.teamOptions.map((team) => (
                      <SelectItem key={`away-${team}`} value={team}>{team}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1.5 text-xs font-medium">
                  <span>Data</span>
                  <input
                    type="date"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editingDate}
                    onChange={(e) => setEditingDate(e.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium">
                  <span>Ora</span>
                  <input
                    type="time"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={editingTime}
                    onChange={(e) => setEditingTime(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
                onClick={() => setEditingPostponed((value) => !value)}
              >
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Rinviata
                </span>
                <span className={editingPostponed ? "font-semibold text-primary" : "text-muted-foreground"}>
                  {editingPostponed ? "Si" : "No"}
                </span>
              </button>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => setEditingProgramEntry(null)}>
                  Annulla
                </Button>
                <Button
                  type="button"
                  className="h-10 flex-1"
                  onClick={() => {
                    const entry = editingProgramEntry.entry;
                    const nextDate = isoFromDateAndTime(editingDate, editingTime, entry.date);
                    const phaseBase = (entry.phase ?? "").replace(/\s*-\s*rinviata$/i, "").trim();
                    onTournamentProgramEntryChange(editingProgramEntry.competition, entry.id, {
                      homeTeam: editingHomeTeam || "da completare",
                      awayTeam: editingAwayTeam || "da completare",
                      date: nextDate,
                      phase: editingPostponed ? `${phaseBase || "Evento"} - rinviata` : (phaseBase || entry.phase || null),
                    });
                    setEditingProgramEntry(null);
                  }}
                >
                  Salva
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
