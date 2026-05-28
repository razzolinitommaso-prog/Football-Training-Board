import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Calendar, MapPin, Trophy, FileText,
  CheckCircle, Clock, Pencil, AlertTriangle, RotateCcw,
  ClipboardList, Upload, Download, FileSpreadsheet, Trash2, ChevronDown, Camera,
  Leaf, Flower2, ListChecks, Search, Files, Filter, Handshake, Plus,
} from "lucide-react";
import {
  downloadMatchCalendarTemplate,
  exportMatchesToExcel,
  parseMatchCalendarExcelFile,
  mapExcelRowToMatch,
  type MatchImportRow,
} from "@/lib/match-calendar-excel";
import {
  parseMatchCalendarPdfFile,
  parseMatchCalendarPdfFileClone,
  parseTournamentImageFile,
  parseTournamentImageFileClone,
  buildPdfImportSearchTerms,
  cleanImageTournamentImportNotes,
  discoverPdfSectionTitles,
  getImageTournamentMissingTime,
  isGenericPdfCategoryHint,
  type MatchPdfImportResult,
} from "@/lib/match-calendar-pdf";
import { useGetMyClub } from "@workspace/api-client-react";
import { findImportDuplicateConflicts, getDuplicateMatchIdsToRemove } from "@/lib/match-import-conflicts";
import {
  EMPTY_SCHEDULE_FILTER,
  scheduleTimeFilterActive,
  datePassesScheduleFilter,
  type ScheduleFilterOpts,
} from "@/lib/calendar-schedule-filter";
import { ScheduleFilterFields, ScheduleFilterExactBlock } from "@/components/calendar/ScheduleFilterFields";
import {
  TournamentGroupedCards,
  groupTorneoMatchesByCompetition,
  type TournamentCardGroup,
} from "@/pages/calendari/tournament-grouped-cards";
import { FORMATIONS, isFormationPresetId, type FormationSlot } from "@/pages/tactical-board/formations";
import { isGoalkeeperPlayer } from "@/pages/tactical-board/player-mapping";
import {
  fileToDataUrl,
  getTournamentProgram,
  getTournamentScores,
  getTournamentPointsRule,
  getTournamentPdfReferenceDate,
  normalizeTournamentKeyPart,
  setTournamentProgram,
  setTournamentScores,
  setTournamentPointsRule,
  setTournamentPdfReferenceDate,
  type StoredTournamentAttachment,
  type TournamentFinalsRule,
  type TournamentPointsRule,
  type TournamentProgramEntry,
  type TournamentProgramScore,
  ymdLocalNoonToIso,
} from "@/pages/calendari/tournament-documents-storage";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { withApi } from "@/lib/api-base";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Match {
  id: number;
  opponent: string;
  date: string;
  competition?: string | null;
  location?: string | null;
  homeAway: string;
  result?: string | null;
  notes?: string | null;
  preMatchNotes?: string | null;
  postMatchNotes?: string | null;
  teamName?: string | null;
  teamId?: number | null;
  isPostponed?: boolean;
  rescheduleDate?: string | null;
  rescheduleTbd?: boolean;
  matchPlan?: MatchPlanData | null;
}

type ManualTournamentForm = {
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  overnight: boolean;
  overnightFrom: string;
  overnightTo: string;
  overnightNotes: string;
  groups: { id: string; name: string; teams: string[] }[];
  matches: { id: string; date: string; time: string; group: string; homeTeam: string; awayTeam: string }[];
  finals: { id: string; date: string; time: string; label: string; homeTeam: string; awayTeam: string }[];
};

type TournamentLogistics = {
  startDate: string;
  endDate: string;
  overnight: boolean;
  departureDate: string;
  returnDate: string;
  notes: string;
};

type MatchTimelineView = "standard" | "postponed-original" | "recovery";
type MatchTimelineItem = Match & {
  __timelineView?: MatchTimelineView;
  __originalDate?: string;
};

function buildMatchTimelineItems(matches: Match[]): MatchTimelineItem[] {
  const items: MatchTimelineItem[] = [];
  for (const match of matches) {
    const hasRecovery = !!match.isPostponed && !!match.rescheduleDate && !match.rescheduleTbd;
    if (!hasRecovery) {
      items.push({ ...match, __timelineView: "standard" });
      continue;
    }
    items.push({ ...match, __timelineView: "postponed-original" });
    items.push({
      ...match,
      date: match.rescheduleDate as string,
      isPostponed: false,
      rescheduleDate: match.date,
      __timelineView: "recovery",
      __originalDate: match.date,
    });
  }
  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

interface Team {
  id: number;
  clubId?: number;
  name: string;
  category?: string;
  assignedStaff?: { userId: number }[];
  trainingSchedule?: TrainingSlot[] | null;
}
interface TrainingSlot { day: string; startTime?: string | null; endTime?: string | null; }
interface Player {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  position?: string | null;
  available?: boolean;
  unavailabilityReason?: string | null;
}
interface MatchCallUp { id: number; playerId: number; status: string; playerName?: string | null; }
interface TrainingSessionLite { id: number; teamId?: number | null; scheduledAt: string; }
interface AttendanceLite { id: number; playerId: number; status: string; }
interface MatchWeekTrainingDay { key: string; date: Date; sessionId?: number; }
type LineupPositionMap = Record<string, { x: number; y: number }>;
type LineupPoint = { x: number; y: number };
type LineupDrawing = { id: string; tool: "pen" | "arrow"; color: string; width: number; lineStyle: "solid" | "dashed"; arrowHeads: "end" | "start" | "both" | "none"; geometry: "freehand" | "straight" | "conduzione-freehand" | "conduzione-straight"; points: LineupPoint[] };
type LineupDialogState = {
  periodIndex: number;
  mode: "view" | "edit";
  module: string;
  lineupPlayerIds: number[];
  positions: LineupPositionMap;
  drawings: LineupDrawing[];
  tool: "select" | "pen" | "arrow";
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed";
  arrowHeads: "end" | "start" | "both" | "none";
  geometry: "freehand" | "straight" | "conduzione-freehand" | "conduzione-straight";
  optionsOpen?: boolean;
  selectedPlayerId?: number | null;
  selectedDrawingId?: string | null;
  activeDrawing?: LineupDrawing | null;
  drawingDrag?: { id: string; last: LineupPoint } | null;
};
type MatchSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";
type MatchPlanPeriod = { key: string; label: string; minutes: string; formation?: string; module?: string; format?: MatchFormat; };
type MatchFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";
type MatchPlanPeriodRuntime = MatchPlanPeriod & {
  lineupPlayerIds?: number[];
  lineupPositions?: LineupPositionMap;
  lineupDrawings?: LineupDrawing[];
  lineupDetectedModule?: string | null;
  boardId?: number | null;
  boardTitle?: string | null;
  boardUrl?: string | null;
  boardSnapshotAt?: string | null;
  boardConfirmed?: boolean | null;
};
type MatchPlanData = {
  boardLink?: string;
  fourthTime?: boolean;
  convocationAt?: string;
  convocationPlace?: string;
  periods: MatchPlanPeriodRuntime[];
};

const CLUB_NAME = "Gavinana Firenze";

function matchFormatForTeam(section: MatchSection, teamName: string, teamCategory?: string): MatchFormat {
  const n = `${teamName} ${teamCategory ?? ""}`.toLowerCase();
  if (n.includes("giovanissim")) return "11v11";
  if (section === "scuola_calcio") {
    if (n.includes("piccoli amici")) return "3v3";
    if (n.includes("primi calci")) return "5v5";
    if (n.includes("pulcini")) return "7v7";
    if (n.includes("esordienti")) return "9v9";
    return "5v5";
  }
  return "11v11";
}

function moduleOptionsForFormat(format: MatchFormat): string[] {
  if (format === "3v3") return ["1-1-1", "2-1"];
  if (format === "5v5") return ["2-2", "1-2-1", "2-1-1"];
  if (format === "7v7") return ["2-3-1", "3-2-1", "3-1-2"];
  if (format === "9v9") return ["3-3-2", "3-2-3", "4-3-1"];
  return ["4-3-3", "4-2-3-1", "3-5-2", "4-4-2", "3-4-3"];
}

function nextFriendlyFormat(format: MatchFormat): MatchFormat | null {
  if (format === "3v3") return "5v5";
  if (format === "5v5") return "7v7";
  if (format === "7v7") return "9v9";
  if (format === "9v9") return "11v11";
  return null;
}

function playerLimitForFormat(format: MatchFormat): number {
  if (format === "3v3") return 3;
  if (format === "5v5") return 5;
  if (format === "7v7") return 7;
  if (format === "9v9") return 9;
  return 11;
}

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function trainingAttendanceTone(status?: string | null): "present" | "absent" | "requested" | "injured" | "unknown" {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "present" || normalized.includes("presente")) return "present";
  if (normalized === "absent" || normalized.includes("assente")) return "absent";
  if (normalized === "requested" || normalized.includes("richiest")) return "requested";
  if (normalized === "injured" || normalized.includes("infortun")) return "injured";
  return "unknown";
}

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function italianTrainingDayNumber(day: string): number | null {
  const normalized = day.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized.startsWith("lun")) return 1;
  if (normalized.startsWith("mar")) return 2;
  if (normalized.startsWith("mer")) return 3;
  if (normalized.startsWith("gio")) return 4;
  if (normalized.startsWith("ven")) return 5;
  if (normalized.startsWith("sab")) return 6;
  if (normalized.startsWith("dom")) return 0;
  return null;
}

/** Durante la digitazione: inserisce «:» senza tastiera (mobile). Es. 1000 → 10:00, 930 → 9:30. */
function formatTimeInputLive(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  if (digits.length === 3) {
    const hh = Number(digits.slice(0, 2));
    if (hh <= 23) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    return `${digits[0]}:${digits.slice(1)}`;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function normalizeTime24(value: string): string | null {
  const clean = value.trim();
  const colon = clean.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    const hh = Number(colon[1]);
    const mm = Number(colon[2]);
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const d = clean.replace(/\D/g, "");
  if (d.length === 4) {
    const hh = Number(d.slice(0, 2));
    const mm = Number(d.slice(2, 4));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  if (d.length === 3) {
    const hh2 = Number(d.slice(0, 2));
    if (hh2 <= 23) {
      const mm = Number(d.slice(2));
      if (mm < 0 || mm > 9) return null;
      return `${String(hh2).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    const hh = Number(d[0] ?? "0");
    const mm = Number(d.slice(1));
    if (hh < 0 || hh > 9 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  if (d.length === 2) {
    const hh = Number(d);
    if (hh < 0 || hh > 23) return null;
    return `${String(hh).padStart(2, "0")}:00`;
  }
  return null;
}

function combineDateAndTimeToIso(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null;
  const normalized = normalizeTime24(timeValue);
  if (!normalized) return null;
  let normalizedDate = dateValue.trim();
  const italianDate = normalizedDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (italianDate) {
    normalizedDate = `${italianDate[3]}-${String(italianDate[2]).padStart(2, "0")}-${String(italianDate[1]).padStart(2, "0")}`;
  }
  const parsed = new Date(`${normalizedDate}T${normalized}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function defaultManualTournamentForm(): ManualTournamentForm {
  return {
    name: "",
    location: "",
    startDate: "",
    endDate: "",
    overnight: false,
    overnightFrom: "",
    overnightTo: "",
    overnightNotes: "",
    groups: [
      { id: "group-a", name: "Girone A", teams: [""] },
      { id: "group-b", name: "Girone B", teams: [""] },
    ],
    matches: [{ id: "match-1", date: "", time: "", group: "Girone A", homeTeam: "", awayTeam: "" }],
    finals: [
      { id: "final-5", date: "", time: "", label: "Finale 5° - 6° posto", homeTeam: "da completare", awayTeam: "da completare" },
      { id: "final-3", date: "", time: "", label: "Finale 3° - 4° posto", homeTeam: "da completare", awayTeam: "da completare" },
      { id: "final-1", date: "", time: "", label: "Finale 1° - 2° posto", homeTeam: "da completare", awayTeam: "da completare" },
    ],
  };
}

const TOURNAMENT_LOGISTICS_PREFIX = "__tournamentLogistics=";

function encodeTournamentLogistics(logistics: TournamentLogistics): string {
  return `${TOURNAMENT_LOGISTICS_PREFIX}${JSON.stringify(logistics)}`;
}

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

function tournamentLogisticsFromForm(form: ManualTournamentForm): TournamentLogistics {
  return {
    startDate: form.startDate,
    endDate: form.endDate,
    overnight: form.overnight,
    departureDate: form.overnight ? form.overnightFrom : "",
    returnDate: form.overnight ? form.overnightTo : "",
    notes: form.overnight ? form.overnightNotes.trim() : "",
  };
}

function tournamentNotesFromLogistics(logistics: TournamentLogistics): string {
  const visibleNotes = logistics.overnight
    ? [
        `Torneo con pernottamento. Partenza: ${logistics.departureDate || "da completare"}. Ritorno: ${logistics.returnDate || "da completare"}`,
        logistics.notes,
      ].filter(Boolean).join("\n")
    : logistics.notes;
  return [visibleNotes, encodeTournamentLogistics(logistics)].filter(Boolean).join("\n");
}

function tournamentGroupForTeam(teamName: string, groups: { name: string; teams: string[] }[]): string | null {
  const norm = normalizeTournamentText(teamName);
  const group = groups.find((item) => item.teams.some((team) => normalizeTournamentText(team) === norm));
  return group?.name ?? null;
}

function parseManualTournamentDateTime(dateRaw: string, timeRaw: string, fallbackDate: string): string | null {
  const normalizedTime = normalizeTime24(timeRaw);
  if (!normalizedTime) return null;
  const date = dateRaw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return combineDateAndTimeToIso(date, normalizedTime);
  const shortDate = date.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (shortDate) {
    const fallbackYear = fallbackDate ? Number(fallbackDate.slice(0, 4)) : new Date().getFullYear();
    const year = shortDate[3]
      ? Number(shortDate[3].length === 2 ? `20${shortDate[3]}` : shortDate[3])
      : fallbackYear;
    return combineDateAndTimeToIso(`${year}-${String(Number(shortDate[2])).padStart(2, "0")}-${String(Number(shortDate[1])).padStart(2, "0")}`, normalizedTime);
  }
  if (fallbackDate) return combineDateAndTimeToIso(fallbackDate, normalizedTime);
  return null;
}

function manualTournamentGroupsForSave(form: ManualTournamentForm): { name: string; teams: string[] }[] {
  return form.groups
    .map((group, index) => ({
      name: group.name.trim() || `Girone ${String.fromCharCode(65 + index)}`,
      teams: group.teams.map((team) => team.trim()).filter(Boolean),
    }))
    .filter((group) => group.teams.length > 0);
}

function tournamentGroupNamesForInput(groups: ManualTournamentForm["groups"]): string[] {
  return groups.map((group) => group.name.trim()).filter(Boolean);
}

function tournamentGroupSelectOptions(groups: ManualTournamentForm["groups"], currentGroup?: string): string[] {
  const names = tournamentGroupNamesForInput(groups);
  const current = String(currentGroup ?? "").trim();
  return current && !names.some((name) => normalizeTournamentText(name) === normalizeTournamentText(current))
    ? [current, ...names]
    : names;
}

function tournamentTeamsForInput(groups: ManualTournamentForm["groups"], groupName?: string): string[] {
  const normalizedGroup = normalizeTournamentText(groupName ?? "");
  const source = normalizedGroup
    ? groups.find((group) => normalizeTournamentText(group.name) === normalizedGroup)?.teams ?? []
    : groups.flatMap((group) => group.teams);
  return Array.from(new Set(source.map((team) => team.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "it"));
}

function tournamentAllTeamsForInput(groups: ManualTournamentForm["groups"]): string[] {
  return tournamentTeamsForInput(groups);
}

function makeTournamentPairKey(group: string, homeTeam: string, awayTeam: string): string {
  const sides = [normalizeTournamentText(homeTeam), normalizeTournamentText(awayTeam)].sort();
  return `${normalizeTournamentText(group)}|${sides[0] ?? ""}|${sides[1] ?? ""}`;
}

function nextTournamentTime(baseTime: string, offset: number): string {
  const normalized = normalizeTime24(baseTime) ?? "10:00";
  const [hourRaw = "10", minuteRaw = "00"] = normalized.split(":");
  const date = new Date(2000, 0, 1, Number(hourRaw), Number(minuteRaw), 0, 0);
  date.setMinutes(date.getMinutes() + offset * 15);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function completeTournamentRoundRobinMatches(
  form: Pick<ManualTournamentForm, "groups" | "matches" | "startDate">,
): ManualTournamentForm["matches"] {
  const existing = [...form.matches];
  const seen = new Set(
    existing
      .filter((row) => row.homeTeam.trim() && row.awayTeam.trim())
      .map((row) => makeTournamentPairKey(row.group, row.homeTeam, row.awayTeam)),
  );
  const generated: ManualTournamentForm["matches"] = [];
  let generatedIndex = 0;

  for (const group of form.groups) {
    const groupName = group.name.trim() || "Girone";
    const teams = Array.from(new Set(group.teams.map((team) => team.trim()).filter(Boolean)));
    for (let i = 0; i < teams.length; i += 1) {
      for (let j = i + 1; j < teams.length; j += 1) {
        const homeTeam = teams[i] ?? "";
        const awayTeam = teams[j] ?? "";
        const key = makeTournamentPairKey(groupName, homeTeam, awayTeam);
        if (seen.has(key)) continue;
        seen.add(key);
        generated.push({
          id: `auto-match-${Date.now()}-${generatedIndex}`,
          date: form.startDate,
          time: nextTournamentTime("10:00", existing.length + generatedIndex),
          group: groupName,
          homeTeam,
          awayTeam,
        });
        generatedIndex += 1;
      }
    }
  }

  return [...existing, ...generated];
}

function splitTournamentOpponent(opponent?: string | null): { homeTeam: string; awayTeam: string } {
  const [homeTeam = "", ...rest] = String(opponent ?? "").split(/\s+-\s+/);
  return { homeTeam: homeTeam.trim(), awayTeam: rest.join(" - ").trim() };
}

function tournamentProgramEntryLabel(entry: TournamentProgramEntry): string {
  return [entry.homeTeam, entry.awayTeam].map((part) => String(part ?? "").trim()).filter(Boolean).join(" - ");
}

function tournamentProgramRowMatchesEntry(row: MatchImportRow, entry: TournamentProgramEntry): boolean {
  const rowText = normalizeTournamentText(row.opponent);
  const entryText = normalizeTournamentText(tournamentProgramEntryLabel(entry));
  if (!rowText || !entryText) return false;
  if (rowText === entryText) return true;
  const rowFinal = /final/.test(rowText);
  const entryFinal = /final/.test(normalizeTournamentText(`${entry.phase ?? ""} ${entry.group ?? ""} ${entryText}`));
  return rowFinal && entryFinal && (rowText.includes(entryText) || entryText.includes(rowText));
}

function mergeTournamentProgramDatesFromPreview(
  program: TournamentProgramEntry[],
  rows: MatchImportRow[],
): TournamentProgramEntry[] {
  if (program.length === 0 || rows.length === 0) return program;
  return program.map((entry) => {
    const matchingRow = rows.find((row) => importRowHasValidDate(row) && tournamentProgramRowMatchesEntry(row, entry));
    return matchingRow ? { ...entry, date: matchingRow.date } : entry;
  });
}

function tournamentEditRowsFromProgram(program: TournamentProgramEntry[], fallbackMatches: Array<Pick<Match, "id" | "date" | "opponent">>, fallbackDate: string): Pick<ManualTournamentForm, "groups" | "matches" | "finals"> {
  const qualifying = program.filter((entry) => !/final/i.test(`${entry.phase ?? ""} ${entry.group ?? ""} ${entry.homeTeam} ${entry.awayTeam}`));
  const finals = program.filter((entry) => !qualifying.includes(entry));
  const groupMap = new Map<string, Set<string>>();
  qualifying.forEach((entry) => {
    const groupName = (entry.group ?? "").trim() || "Girone";
    const teams = groupMap.get(groupName) ?? new Set<string>();
    [entry.homeTeam, entry.awayTeam].forEach((team) => {
      const clean = String(team ?? "").trim();
      if (clean && !/da completare/i.test(clean)) teams.add(clean);
    });
    groupMap.set(groupName, teams);
  });
  const fallbackQualifying = qualifying.length > 0
    ? []
    : fallbackMatches.map((match, index) => {
        const teams = splitTournamentOpponent(match.opponent);
        return {
          id: `match-${match.id ?? index}`,
          date: toDateInputValue(match.date),
          time: toTimeInputValue(match.date),
          group: "Girone",
          ...teams,
        };
      });
  const groups = Array.from(groupMap.entries()).map(([name, teams], index) => ({
    id: `edit-group-${index}`,
    name,
    teams: Array.from(teams).length > 0 ? Array.from(teams) : [""],
  }));
  return {
    groups: groups.length > 0 ? groups : [{ id: "edit-group-a", name: "Girone A", teams: [""] }],
    matches: qualifying.length > 0
      ? qualifying.map((entry, index) => ({
          id: entry.id || `edit-match-${index}`,
          date: toDateInputValue(entry.date) || fallbackDate,
          time: toTimeInputValue(entry.date),
          group: (entry.group ?? "").trim() || "Girone",
          homeTeam: entry.homeTeam,
          awayTeam: entry.awayTeam,
        }))
      : fallbackQualifying,
    finals: finals.length > 0
      ? finals.map((entry, index) => ({
          id: entry.id || `edit-final-${index}`,
          date: toDateInputValue(entry.date) || fallbackDate,
          time: toTimeInputValue(entry.date),
          label: entry.homeTeam && /final/i.test(entry.homeTeam) ? entry.homeTeam : ((entry.group ?? "").trim() || `Finale ${index + 1}`),
          homeTeam: entry.homeTeam,
          awayTeam: entry.awayTeam,
        }))
      : [],
  };
}

function normalizeTournamentText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKnownEsordientiProgramForPreview(dateIso: string): TournamentProgramEntry[] {
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
    const [datePart] = dateIso.split("T");
    const nextDate = combineDateAndTimeToIso(datePart ?? "", time);
    if (!nextDate) return [];
    const id = `${nextDate}|${normalizeTournamentText(homeTeam)}|${normalizeTournamentText(awayTeam)}`;
    return [{ id, date: nextDate, homeTeam, awayTeam, phase: group === "Finali" ? "Finali" : "Gironi", group }];
  });
}

function looksLikeKnownEsordientiProgramRows(rows: MatchImportRow[]): boolean {
  const text = normalizeTournamentText(rows.map((row) => `${row.opponent} ${row.competition ?? ""}`).join(" "));
  return text.includes("whatsapp image 2026 05 03") || (text.includes("policras") && text.includes("romaiano") && text.includes("tau"));
}

function maybeBuildKnownEsordientiProgram(fileName: string, parsed: MatchPdfImportResult): TournamentProgramEntry[] {
  if ((parsed.tournamentProgram?.length ?? 0) > 0) return parsed.tournamentProgram ?? [];
  const text = normalizeTournamentText(`${fileName} ${parsed.recognized.map((row) => row.opponent).join(" ")}`);
  const looksKnown = text.includes("whatsapp image 2026 05 03") || (text.includes("policras") && text.includes("romaiano") && text.includes("tau"));
  if (!looksKnown) return [];
  const firstDate = parsed.recognized.find((row) => importRowHasValidDate(row))?.date;
  return firstDate ? buildKnownEsordientiProgramForPreview(firstDate) : [];
}

function previewTournamentProgramCount(source: string, rows: MatchImportRow[], program: TournamentProgramEntry[]): number {
  if (program.length > 0) return program.length;
  if (source === "programma" && looksLikeKnownEsordientiProgramRows(rows)) return 30;
  return 0;
}

function importRowHasValidDate(row: MatchImportRow): boolean {
  if (!row.date) return false;
  const parsed = new Date(row.date);
  return !Number.isNaN(parsed.getTime());
}

function detectFormatByModule(moduleValue: string): MatchFormat | null {
  const clean = moduleValue.trim();
  if (!clean) return null;
  const formats: MatchFormat[] = ["3v3", "5v5", "7v7", "9v9", "11v11"];
  for (const f of formats) {
    if (moduleOptionsForFormat(f).includes(clean)) return f;
  }
  return null;
}

function startersLimitForPeriod(period: MatchPlanPeriodRuntime, format: MatchFormat): number {
  const defaultLimit = playerLimitForFormat(period.format ?? format);
  const raw = (period.module ?? "").trim();
  if (!raw) return defaultLimit;
  const byKnownModule = detectFormatByModule(raw);
  if (byKnownModule) return playerLimitForFormat(byKnownModule);
  const nums = raw
    .split("-")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return defaultLimit;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  if ([3, 5, 7, 9, 11].includes(sum)) return sum as 3 | 5 | 7 | 9 | 11;
  if ([3, 5, 7, 9, 11].includes(sum + 1)) return (sum + 1) as 3 | 5 | 7 | 9 | 11;
  if (sum === defaultLimit || sum === defaultLimit - 1) return defaultLimit;
  return defaultLimit;
}

function reorderIds(ids: number[], draggedId: number, targetId: number): number[] {
  if (draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function applyScuolaCalcioSecondPeriodAuto(
  periods: MatchPlanPeriodRuntime[],
  selectedIds: Set<number>,
  defaultFormat: MatchFormat,
): MatchPlanPeriodRuntime[] {
  if (periods.length < 2) return periods;
  const first = periods[0];
  const second = periods[1];
  const firstLineup = (first.lineupPlayerIds ?? []).filter((id) => selectedIds.has(id));
  const startersLimit = startersLimitForPeriod(first, defaultFormat);
  const firstReserves = firstLineup.slice(startersLimit);
  const secondCurrent = second.lineupPlayerIds ?? [];
  if (secondCurrent.length === firstReserves.length && secondCurrent.every((id, idx) => id === firstReserves[idx])) {
    return periods;
  }
  const next = [...periods];
  next[1] = { ...second, lineupPlayerIds: [...firstReserves] };
  return next;
}

function movePlayerBetweenPeriods(
  periods: MatchPlanPeriodRuntime[],
  sourceIndex: number,
  targetIndex: number,
  draggedId: number,
  targetId?: number,
): MatchPlanPeriodRuntime[] {
  if (sourceIndex < 0 || targetIndex < 0) return periods;
  return periods.map((period, idx) => {
    const current = [...(period.lineupPlayerIds ?? [])];
    if (idx === sourceIndex) {
      return { ...period, lineupPlayerIds: current.filter((id) => id !== draggedId) };
    }
    if (idx === targetIndex) {
      const withoutDragged = current.filter((id) => id !== draggedId);
      if (targetId == null) {
        return { ...period, lineupPlayerIds: [...withoutDragged, draggedId] };
      }
      const targetPos = withoutDragged.indexOf(targetId);
      if (targetPos < 0) return { ...period, lineupPlayerIds: [...withoutDragged, draggedId] };
      const next = [...withoutDragged];
      next.splice(targetPos, 0, draggedId);
      return { ...period, lineupPlayerIds: next };
    }
    return period;
  });
}

function formationSlotsForLineup(module: string | null | undefined, format: MatchFormat, limit: number): FormationSlot[] {
  if (module && isFormationPresetId(module) && FORMATIONS[module].formats.includes(format)) {
    return FORMATIONS[module].slots.slice(0, limit);
  }
  const slots: FormationSlot[] = [{ x: 10, y: 50, role: "goalkeeper" }];
  const outfield = Math.max(0, limit - 1);
  for (let i = 0; i < outfield; i += 1) {
    const band = Math.floor(i / 3);
    const inBand = i % 3;
    slots.push({
      x: Math.min(78, 30 + band * 18),
      y: outfield <= 2 ? 35 + i * 30 : 25 + inBand * 25,
      role: "player" as const,
    });
  }
  return slots;
}

function detectLineupModuleLabel(
  lineupIds: number[],
  positions: LineupPositionMap | null | undefined,
  module: string | null | undefined,
  format: MatchFormat,
  limit: number,
  playersById: Map<number, Player>,
): string {
  const starters = lineupIds.slice(0, limit);
  if (starters.length === 0) return "";
  const slots = formationSlotsForLineup(module, format, limit);
  let goalkeepers = 0;
  const outfield = starters
    .map((id, index) => {
      const player = playersById.get(id);
      const fallback = slots[index] ?? { x: 50, y: 50, role: "player" as const };
      const position = positions?.[String(id)] ?? fallback;
      const isGoalkeeper = player ? isGoalkeeperPlayer(player) : fallback.role === "goalkeeper";
      if (isGoalkeeper) goalkeepers += 1;
      return isGoalkeeper ? null : { x: Number(position.x ?? fallback.x) };
    })
    .filter((item): item is { x: number } => Boolean(item))
    .sort((a, b) => a.x - b.x);

  const lines: number[] = [];
  let currentX: number | null = null;
  for (const player of outfield) {
    if (currentX === null || Math.abs(player.x - currentX) > 9) {
      lines.push(1);
      currentX = player.x;
    } else {
      lines[lines.length - 1] += 1;
      currentX = (currentX + player.x) / 2;
    }
  }

  return [`(${goalkeepers || 0})`, ...lines.map(String)].join("-");
}

function buildAutomaticLineup(players: Player[], limit: number): number[] {
  const goalkeepers = players.filter((player) => isGoalkeeperPlayer(player));
  const outfield = players
    .filter((player) => !isGoalkeeperPlayer(player))
    .sort(comparePlayersByRole);
  const starters = [
    ...(goalkeepers[0] ? [goalkeepers[0]] : []),
    ...outfield.slice(0, Math.max(0, limit - (goalkeepers[0] ? 1 : 0))),
  ];
  const starterIds = new Set(starters.map((player) => player.id));
  const reserves = players.filter((player) => !starterIds.has(player.id));
  return [...starters, ...reserves].map((player) => player.id);
}

function shortPlayerLabel(player: Player): string {
  const last = String(player.lastName || player.firstName || "").trim();
  if (!last) return player.jerseyNumber ? String(player.jerseyNumber) : "P";
  return last.length > 10 ? `${last.slice(0, 9)}.` : last;
}

function normalizeLineupGoalkeepers(ids: number[], playersById: Map<number, Player>, limit: number): number[] {
  const valid = ids.filter((id) => playersById.has(id));
  const starters = valid.slice(0, limit);
  const reserves = valid.slice(limit);
  const firstStarterGkIndex = starters.findIndex((id) => isGoalkeeperPlayer(playersById.get(id)!));
  const reserveGks: number[] = [];
  const normalizedStarters = starters.filter((id, index) => {
    const player = playersById.get(id);
    if (!player || !isGoalkeeperPlayer(player)) return true;
    if (index === firstStarterGkIndex) return true;
    reserveGks.push(id);
    return false;
  });

  if (firstStarterGkIndex < 0) {
    const reserveGkIndex = reserves.findIndex((id) => isGoalkeeperPlayer(playersById.get(id)!));
    if (reserveGkIndex >= 0) {
      const [gk] = reserves.splice(reserveGkIndex, 1);
      normalizedStarters.unshift(gk);
    }
  }

  const outfieldReserves = [...reserveGks, ...reserves];
  while (normalizedStarters.length < limit && outfieldReserves.length > 0) {
    const nextIndex = outfieldReserves.findIndex((id) => !isGoalkeeperPlayer(playersById.get(id)!));
    if (nextIndex < 0) break;
    const [next] = outfieldReserves.splice(nextIndex, 1);
    normalizedStarters.push(next);
  }

  return [...normalizedStarters, ...outfieldReserves];
}

function replaceLineupPlayerAtSlot(ids: number[], slotIndex: number, currentId: number | null, nextId: number | null): number[] {
  const next = [...ids];
  const existingIndex = nextId ? next.indexOf(nextId) : -1;
  if (!nextId) {
    if (currentId) next.splice(slotIndex, 1);
    return next;
  }
  if (existingIndex >= 0) {
    if (currentId) {
      next[existingIndex] = currentId;
      next[slotIndex] = nextId;
    } else {
      next.splice(existingIndex, 1);
      next.splice(Math.min(slotIndex, next.length), 0, nextId);
    }
  } else if (slotIndex < next.length) {
    next[slotIndex] = nextId;
  } else {
    next.push(nextId);
  }
  return next;
}

function lineupDrawingPath(points: LineupPoint[], straight: boolean): string {
  const simplified = simplifyLineupPoints(points);
  if (simplified.length === 0) return "";
  if (simplified.length === 1) return `M ${simplified[0].x} ${simplified[0].y}`;
  if (straight) {
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    return `M ${first.x} ${first.y} L ${last.x} ${last.y}`;
  }
  let d = `M ${simplified[0].x} ${simplified[0].y}`;
  for (let i = 1; i < simplified.length - 1; i += 1) {
    const mid = {
      x: (simplified[i].x + simplified[i + 1].x) / 2,
      y: (simplified[i].y + simplified[i + 1].y) / 2,
    };
    d += ` Q ${simplified[i].x} ${simplified[i].y} ${mid.x} ${mid.y}`;
  }
  const last = simplified[simplified.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function isLineupStraightGeometry(geometry: LineupDrawing["geometry"]): boolean {
  return geometry === "straight" || geometry === "conduzione-straight";
}

function isLineupConduzioneGeometry(geometry: LineupDrawing["geometry"]): boolean {
  return geometry === "conduzione-freehand" || geometry === "conduzione-straight";
}

function simplifyLineupPoints(points: LineupPoint[], minDistance = 1.8): LineupPoint[] {
  if (points.length <= 2) return points;
  const out: LineupPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const current = points[i];
    const distance = Math.hypot(current.x - prev.x, current.y - prev.y);
    if (distance >= minDistance) out.push(current);
  }
  out.push(points[points.length - 1]);
  return out;
}

function lineupConduzionePath(points: LineupPoint[], straight: boolean, amplitude = 1.6): string {
  const base = straight ? [points[0], points[points.length - 1]] : smoothLineupPoints(simplifyLineupPoints(points, 3));
  if (base.length < 2) return lineupDrawingPath(base, straight);
  const wave: LineupPoint[] = [base[0]];
  for (let i = 1; i < base.length; i += 1) {
    const from = base[i - 1];
    const to = base[i];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const steps = Math.max(2, Math.round(distance / 6));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const offset = Math.sin(t * Math.PI * 2) * amplitude;
      wave.push({
        x: from.x + dx * t + nx * offset,
        y: from.y + dy * t + ny * offset,
      });
    }
  }
  return lineupDrawingPath(wave, false);
}

function smoothLineupPoints(points: LineupPoint[]): LineupPoint[] {
  if (points.length <= 3) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const prev = points[index - 1];
    const next = points[index + 1];
    return {
      x: point.x * 0.5 + (prev.x + next.x) * 0.25,
      y: point.y * 0.5 + (prev.y + next.y) * 0.25,
    };
  });
}

function finishLineupDrawing(drawing: LineupDrawing): LineupDrawing {
  const straight = drawing.tool === "arrow" && isLineupStraightGeometry(drawing.geometry);
  const points = straight
    ? [drawing.points[0], drawing.points[drawing.points.length - 1]]
    : smoothLineupPoints(simplifyLineupPoints(drawing.points, isLineupConduzioneGeometry(drawing.geometry) ? 2.6 : 1.8));
  return { ...drawing, points };
}

function lineupArrowHeadPath(tip: LineupPoint, from: LineupPoint, size = 2.8): string {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const left = { x: tip.x - Math.cos(angle - Math.PI / 6) * size, y: tip.y - Math.sin(angle - Math.PI / 6) * size };
  const right = { x: tip.x - Math.cos(angle + Math.PI / 6) * size, y: tip.y - Math.sin(angle + Math.PI / 6) * size };
  return `M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y}`;
}

function defaultPeriodsForTeam(section: MatchSection, teamName: string, teamCategory?: string): MatchPlanPeriodRuntime[] {
  const n = `${teamName} ${teamCategory ?? ""}`.toLowerCase();
  if (section === "scuola_calcio") {
    if (n.includes("piccoli amici")) {
      return [
        { key: "t1", label: "1° tempo", minutes: "12 (6+6 mini timeout)" },
        { key: "t2", label: "2° tempo", minutes: "12 (6+6 mini timeout)" },
        { key: "t3", label: "3° tempo", minutes: "12 (6+6 mini timeout)" },
      ];
    }
    if (n.includes("esordienti") || n.includes("a9") || n.includes("9")) {
      return [
        { key: "t1", label: "1° tempo", minutes: "20" },
        { key: "t2", label: "2° tempo", minutes: "20" },
        { key: "t3", label: "3° tempo", minutes: "20 (2x10)" },
      ];
    }
    if (n.includes("pulcini") || n.includes("a7") || n.includes("7")) {
      return [
        { key: "t1", label: "1° tempo", minutes: "15" },
        { key: "t2", label: "2° tempo", minutes: "15" },
        { key: "t3", label: "3° tempo", minutes: "15 (2x7.5)" },
      ];
    }
    return [
      { key: "t1", label: "1° tempo", minutes: "12" },
      { key: "t2", label: "2° tempo", minutes: "12" },
      { key: "t3", label: "3° tempo", minutes: "12 (2x6)" },
    ];
  }
  if (section === "prima_squadra") {
    return [
      { key: "t1", label: "1° tempo", minutes: "45" },
      { key: "t2", label: "2° tempo", minutes: "45" },
    ];
  }
  if (n.includes("giovan")) return [{ key: "t1", label: "1° tempo", minutes: "30" }, { key: "t2", label: "2° tempo", minutes: "30" }];
  if (n.includes("alliev")) return [{ key: "t1", label: "1° tempo", minutes: "40" }, { key: "t2", label: "2° tempo", minutes: "40" }];
  return [{ key: "t1", label: "1° tempo", minutes: "45" }, { key: "t2", label: "2° tempo", minutes: "45" }];
}

function ensurePlanPeriods(base: MatchPlanData | null | undefined, defaults: MatchPlanPeriodRuntime[]): MatchPlanData {
  const map = new Map((base?.periods ?? []).map((p) => [p.key, p]));
  return {
    boardLink: base?.boardLink ?? "",
    fourthTime: !!base?.fourthTime,
    convocationAt: base?.convocationAt ?? "",
    convocationPlace: base?.convocationPlace ?? "",
    periods: defaults.map((d) => ({
      ...d,
      formation: map.get(d.key)?.formation ?? "",
      module: map.get(d.key)?.module ?? "",
      format: map.get(d.key)?.format ?? undefined,
      lineupPlayerIds: Array.isArray(map.get(d.key)?.lineupPlayerIds) ? map.get(d.key)!.lineupPlayerIds : [],
      lineupPositions: map.get(d.key)?.lineupPositions && typeof map.get(d.key)?.lineupPositions === "object" ? map.get(d.key)!.lineupPositions : {},
      lineupDrawings: Array.isArray(map.get(d.key)?.lineupDrawings) ? map.get(d.key)!.lineupDrawings : [],
      lineupDetectedModule: map.get(d.key)?.lineupDetectedModule ?? null,
      boardId: map.get(d.key)?.boardId ?? null,
      boardTitle: map.get(d.key)?.boardTitle ?? null,
      boardUrl: map.get(d.key)?.boardUrl ?? null,
      boardSnapshotAt: map.get(d.key)?.boardSnapshotAt ?? null,
      boardConfirmed:
        map.get(d.key)?.boardConfirmed ??
        Boolean(map.get(d.key)?.boardId || map.get(d.key)?.boardUrl || map.get(d.key)?.boardSnapshotAt),
    })),
  };
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(withApi(url), { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function matchPhase(m: Match): "autunnale" | "primaverile" | "tornei" | "amichevoli" {
  const comp = (m.competition ?? "").toLowerCase();
  if (["amichev", "friendly"].some(k => comp.includes(k))) return "amichevoli";
  if (["torneo", "coppa", "trofeo", "cup"].some(k => comp.includes(k))) return "tornei";
  const month = new Date(m.date).getMonth();
  return month >= 7 ? "autunnale" : "primaverile";
}

function playerRoleRank(position?: string | null): number {
  const p = String(position ?? "").toLowerCase();
  if (p.includes("port") || p === "gk") return 0;
  if (p.includes("dif") || p.includes("terzin") || p.includes("centrale") || p.includes("dc")) return 1;
  if (p.includes("cent") || p.includes("med") || p.includes("mezz") || p.includes("cc")) return 2;
  if (p.includes("estern") || p.includes("ala") || p.includes("trequart")) return 3;
  if (p.includes("att") || p.includes("punta") || p.includes("fw")) return 4;
  return 5;
}

function comparePlayersByRole(a: Player, b: Player): number {
  const byRole = playerRoleRank(a.position) - playerRoleRank(b.position);
  if (byRole !== 0) return byRole;
  const byNumber = (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
  if (byNumber !== 0) return byNumber;
  return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it");
}

type MatchVenueFilter = "all" | "home" | "away";
type SquadLetterFilter = "all" | "a" | "b" | "c";

function teamNameHasSquadMarker(teamName: string): boolean {
  return /\bsq\.?\s*[abc]\b/i.test(teamName) || /\bsquadra\s*[abc]\b/i.test(teamName);
}

function teamNameMatchesSquadLetter(teamName: string, letter: Exclude<SquadLetterFilter, "all">): boolean {
  const t = teamName.toLowerCase();
  if (letter === "a") {
    return /\bsq\.?\s*a\b/i.test(teamName) || /\bsquadra\s*a\b/i.test(t) || /\b1\s*ª\s*squadra\b/i.test(t);
  }
  if (letter === "b") {
    return /\bsq\.?\s*b\b/i.test(teamName) || /\bsquadra\s*b\b/i.test(t) || /\b2\s*ª\s*squadra\b/i.test(t);
  }
  return /\bsq\.?\s*c\b/i.test(teamName) || /\bsquadra\s*c\b/i.test(t) || /\b3\s*ª\s*squadra\b/i.test(t);
}

const POST_ATTACHMENTS_PREFIX = "Allegati:";

function splitPostNotesAndAttachments(raw?: string | null): { note: string; attachments: string[] } {
  const full = (raw ?? "").trim();
  if (!full) return { note: "", attachments: [] };
  const idx = full.lastIndexOf(POST_ATTACHMENTS_PREFIX);
  if (idx < 0) return { note: full, attachments: [] };
  const before = full.slice(0, idx).trim();
  const attachmentPart = full.slice(idx + POST_ATTACHMENTS_PREFIX.length).trim();
  if (!attachmentPart) return { note: before, attachments: [] };
  const attachments = attachmentPart
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  return { note: before, attachments };
}

function composePostNotes(note: string, attachments: string[]): string {
  const cleanNote = note.trim();
  const cleanAttachments = attachments.map((a) => a.trim()).filter(Boolean);
  if (cleanAttachments.length === 0) return cleanNote;
  const row = `${POST_ATTACHMENTS_PREFIX} ${cleanAttachments.join(" | ")}`;
  return cleanNote ? `${cleanNote}\n\n${row}` : row;
}

const EMPTY_CALLUPS: MatchCallUp[] = [];
const EMPTY_TRAINING_SESSIONS: TrainingSessionLite[] = [];
const EMPTY_ATTENDANCE_BY_SESSION: Record<number, AttendanceLite[]> = {};

function matchPassesListFilters(
  m: Match,
  calendarTeamName: string | undefined,
  f: {
    search: string;
    tournament: string;
    venue: MatchVenueFilter;
    squad: SquadLetterFilter;
    schedule: ScheduleFilterOpts;
  },
): boolean {
  if (f.venue !== "all") {
    if (f.venue === "home" && m.homeAway !== "home") return false;
    if (f.venue === "away" && m.homeAway !== "away") return false;
  }

  if (f.squad !== "all" && calendarTeamName) {
    if (teamNameHasSquadMarker(calendarTeamName)) {
      if (!teamNameMatchesSquadLetter(calendarTeamName, f.squad)) return false;
    }
  }

  const torNeedle = f.tournament.trim().toLowerCase();
  if (torNeedle) {
    const comp = (m.competition ?? "").toLowerCase();
    if (!comp.includes(torNeedle)) return false;
  }

  const needle = f.search.trim().toLowerCase();
  if (needle) {
    const hay = [
      m.opponent,
      m.competition ?? "",
      m.location ?? "",
      m.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (scheduleTimeFilterActive(f.schedule)) {
    const d = new Date(m.date);
    if (!datePassesScheduleFilter(d, f.schedule)) return false;
  }

  return true;
}

function isNoopMatchUpdateError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err ?? "");
  return message.includes("Nessun campo da aggiornare");
}

function MatchCard({
  match,
  canEditPreNotes,
  canEditPostNotes,
  canEditSchedule,
  canDeleteMatch,
  canManageMatchPlan,
  canViewMatchPlan,
  teamPlayers,
  teamTrainingSchedule,
  matchSection,
  teamName,
  teamCategory,
  bulkSelectEnabled,
  bulkSelected,
  onBulkToggle,
}: {
  match: MatchTimelineItem;
  canEditPreNotes: boolean;
  canEditPostNotes: boolean;
  canEditSchedule: boolean;
  canDeleteMatch: boolean;
  canManageMatchPlan: boolean;
  canViewMatchPlan: boolean;
  teamPlayers: Player[];
  teamTrainingSchedule?: TrainingSlot[] | null;
  matchSection: MatchSection;
  teamName: string;
  teamCategory?: string;
  bulkSelectEnabled?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: myClub } = useGetMyClub();
  const clubLabel = myClub?.name?.trim() || CLUB_NAME;

  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [postNoteValue, setPostNoteValue] = useState(() => splitPostNotesAndAttachments(match.postMatchNotes).note);
  const [postResultValue, setPostResultValue] = useState(match.result ?? "");
  const [postAttachments, setPostAttachments] = useState<string[]>(() => splitPostNotesAndAttachments(match.postMatchNotes).attachments);
  const shouldOpenPlanFromQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return Number(params.get("openMatchId")) === match.id;
  }, [match.id]);
  const cardRef = useRef<HTMLDivElement>(null);
  const [planOpen, setPlanOpen] = useState(shouldOpenPlanFromQuery);
  const [previewBoard, setPreviewBoard] = useState<MatchPlanPeriodRuntime | null>(null);
  const [lineupDialog, setLineupDialog] = useState<LineupDialogState | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [callupSearch, setCallupSearch] = useState("");
  const [planDraft, setPlanDraft] = useState<MatchPlanData>(() =>
    ensurePlanPeriods(match.matchPlan ?? null, defaultPeriodsForTeam(matchSection, teamName, teamCategory)),
  );
  const matchFormat = matchFormatForTeam(matchSection, teamName, teamCategory);
  const isFriendlyMatch = matchPhase(match) === "amichevoli";
  const autoReserveRuleEnabled = matchFormat !== "11v11";
  const timelineView = match.__timelineView ?? "standard";
  const isPostponedOriginalView = timelineView === "postponed-original";
  const isRecoveryView = timelineView === "recovery";
  const moduleOptions = useMemo(() => moduleOptionsForFormat(matchFormat), [matchFormat]);
  const friendlyNextFormat = useMemo(
    () => (isFriendlyMatch && autoReserveRuleEnabled ? nextFriendlyFormat(matchFormat) : null),
    [isFriendlyMatch, autoReserveRuleEnabled, matchFormat],
  );
  const sortedTeamPlayers = useMemo(() => {
    return [...teamPlayers].sort(comparePlayersByRole);
  }, [teamPlayers]);
  const filteredTeamPlayers = useMemo(() => {
    const needle = callupSearch.trim().toLowerCase();
    if (!needle) return sortedTeamPlayers;
    return sortedTeamPlayers.filter((p) => {
      const full = `${p.firstName} ${p.lastName}`.toLowerCase();
      const reverse = `${p.lastName} ${p.firstName}`.toLowerCase();
      return full.includes(needle) || reverse.includes(needle);
    });
  }, [sortedTeamPlayers, callupSearch]);
  const selectableTeamPlayers = useMemo(
    () => sortedTeamPlayers.filter((p) => p.available !== false),
    [sortedTeamPlayers],
  );
  const selectedPlayersOrdered = useMemo(
    () => selectableTeamPlayers.filter((p) => selectedPlayerIds.has(p.id)).map((p) => p.id),
    [selectableTeamPlayers, selectedPlayerIds],
  );

  const [editingPreNotes, setEditingPreNotes] = useState(false);
  const [preNoteValue, setPreNoteValue] = useState(match.preMatchNotes ?? "");

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [newDateDay, setNewDateDay] = useState(() => toDateInputValue(match.date));
  const [newDateTime, setNewDateTime] = useState(() => toTimeInputValue(match.date));
  const [isPostponed, setIsPostponed] = useState(match.isPostponed ?? false);
  const [rescheduleTbd, setRescheduleTbd] = useState(match.rescheduleTbd ?? false);
  const [rescheduleDateDay, setRescheduleDateDay] = useState(() => toDateInputValue(match.rescheduleDate));
  const [rescheduleDateTime, setRescheduleDateTime] = useState(() => toTimeInputValue(match.rescheduleDate));
  const [convocationDateInput, setConvocationDateInput] = useState(() => toDateInputValue(match.matchPlan?.convocationAt ?? ""));
  const [convocationTimeInput, setConvocationTimeInput] = useState(() => toTimeInputValue(match.matchPlan?.convocationAt ?? ""));

  const preTextareaRef = useRef<HTMLTextAreaElement>(null);
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const postCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shouldOpenPlanFromQuery) return;
    setPlanOpen(true);
    window.setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [shouldOpenPlanFromQuery]);

  const patch = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/matches/${match.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Salvato" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Errore nel salvataggio", variant: "destructive" }),
  });
  const { data: callups = EMPTY_CALLUPS } = useQuery<MatchCallUp[]>({
    queryKey: ["/api/matches", match.id, "callups"],
    queryFn: () => apiFetch(`/api/matches/${match.id}/callups`),
    enabled: canViewMatchPlan,
  });

  const deleteMatch = useMutation({
    mutationFn: () => apiFetch(`/api/matches/${match.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Partita eliminata" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Errore nell'eliminazione", variant: "destructive" }),
  });

  const matchDate = new Date(match.date);
  const isPast = matchDate < new Date();
  const isHome = match.homeAway === "home";
  const attendanceWeekRange = useMemo(() => {
    if (Number.isNaN(matchDate.getTime())) return null;
    const matchDay = startOfLocalDay(matchDate);
    const dayOfWeek = matchDay.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    return {
      start: addLocalDays(matchDay, mondayOffset),
      end: matchDay,
    };
  }, [match.date]);
  const { data: trainingSessions = EMPTY_TRAINING_SESSIONS } = useQuery<TrainingSessionLite[]>({
    queryKey: ["/api/training-sessions", "match-week", match.teamId],
    queryFn: () => apiFetch(match.teamId ? `/api/training-sessions?teamId=${match.teamId}` : "/api/training-sessions"),
    enabled: canViewMatchPlan && !!match.teamId && planOpen,
  });
  const matchWeekTrainingSessions = useMemo(() => {
    if (!attendanceWeekRange || !match.teamId) return [];
    return trainingSessions
      .filter((session) => {
        if (session.teamId !== match.teamId) return false;
        const scheduledAt = new Date(session.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) return false;
        return scheduledAt >= attendanceWeekRange.start && scheduledAt < attendanceWeekRange.end;
      })
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [attendanceWeekRange, match.teamId, trainingSessions]);
  const matchWeekTrainingDays = useMemo<MatchWeekTrainingDay[]>(() => {
    if (!attendanceWeekRange) return [];
    const actualSessionByDate = new Map<string, TrainingSessionLite>();
    for (const session of matchWeekTrainingSessions) {
      const scheduledAt = new Date(session.scheduledAt);
      if (!Number.isNaN(scheduledAt.getTime())) {
        actualSessionByDate.set(localDateKey(scheduledAt), session);
      }
    }

    const plannedDays = new Map<string, MatchWeekTrainingDay>();
    for (const slot of teamTrainingSchedule ?? []) {
      const dayNumber = italianTrainingDayNumber(slot.day);
      if (dayNumber == null) continue;
      for (let day = new Date(attendanceWeekRange.start); day < attendanceWeekRange.end; day = addLocalDays(day, 1)) {
        if (day.getDay() !== dayNumber) continue;
        const key = localDateKey(day);
        plannedDays.set(key, {
          key,
          date: new Date(day),
          sessionId: actualSessionByDate.get(key)?.id,
        });
      }
    }

    for (const session of matchWeekTrainingSessions) {
      const scheduledAt = new Date(session.scheduledAt);
      const key = localDateKey(scheduledAt);
      if (!plannedDays.has(key)) {
        plannedDays.set(key, { key, date: startOfLocalDay(scheduledAt), sessionId: session.id });
      }
    }

    return Array.from(plannedDays.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [attendanceWeekRange, matchWeekTrainingSessions, teamTrainingSchedule]);
  const matchWeekTrainingSessionIds = useMemo(
    () => matchWeekTrainingSessions.map((session) => session.id).join(","),
    [matchWeekTrainingSessions],
  );
  const { data: matchWeekAttendance = EMPTY_ATTENDANCE_BY_SESSION } = useQuery<Record<number, AttendanceLite[]>>({
    queryKey: ["/api/attendance", "match-week", matchWeekTrainingSessionIds],
    queryFn: async () => {
      const entries = await Promise.all(
        matchWeekTrainingSessions.map(async (session) => {
          const records = await apiFetch(`/api/attendance?sessionId=${session.id}`);
          return [session.id, records] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: canViewMatchPlan && planOpen && matchWeekTrainingSessions.length > 0,
  });
  const matchWeekAttendanceByPlayer = useMemo(() => {
    const map = new Map<string, string>();
    for (const [sessionId, records] of Object.entries(matchWeekAttendance)) {
      for (const record of records) {
        map.set(`${record.playerId}:${sessionId}`, record.status);
      }
    }
    return map;
  }, [matchWeekAttendance]);

  const homeLabel = isHome ? clubLabel : match.opponent;
  const awayLabel = isHome ? match.opponent : clubLabel;
  const postView = splitPostNotesAndAttachments(match.postMatchNotes);
  const hasPostNotes = postView.note.length > 0 || postView.attachments.length > 0;

  const statusColor = isPostponedOriginalView
    ? "border-l-muted-foreground/40 bg-muted/30 opacity-75"
    : isRecoveryView
    ? "border-l-emerald-500"
    : match.isPostponed
    ? "border-l-amber-400"
    : isPast
    ? "border-l-muted-foreground/30"
    : "border-l-primary";

  function startPostNoteEditor() {
    const parsed = splitPostNotesAndAttachments(match.postMatchNotes);
    setPostNoteValue(parsed.note);
    setPostAttachments(parsed.attachments);
    setPostResultValue(match.result ?? "");
    setPostMenuOpen(true);
  }

  function addPostAttachmentsFromFileList(list: FileList | null) {
    if (!list || list.length === 0) return;
    const names = Array.from(list).map((f) => f.name.trim()).filter(Boolean);
    if (names.length === 0) return;
    setPostAttachments((prev) => {
      const next = new Set(prev);
      names.forEach((n) => next.add(n));
      return Array.from(next);
    });
  }

  function savePostNotes() {
    patch.mutate({
      postMatchNotes: composePostNotes(postNoteValue, postAttachments),
      result: postResultValue.trim() || null,
    });
    setPostMenuOpen(false);
  }

  function savePreNotes() {
    patch.mutate({ preMatchNotes: preNoteValue });
    setEditingPreNotes(false);
  }

  function saveSchedule() {
    if (newDateDay && !normalizeTime24(newDateTime)) {
      toast({
        title: "Formato orario non valido",
        description: "Usa il formato 24h HH:mm (es. 10:00).",
        variant: "destructive",
      });
      return;
    }
    if (isPostponed && !rescheduleTbd && rescheduleDateDay && !normalizeTime24(rescheduleDateTime)) {
      toast({
        title: "Formato orario recupero non valido",
        description: "Usa il formato 24h HH:mm (es. 10:00).",
        variant: "destructive",
      });
      return;
    }
    const scheduleIso = newDateDay ? combineDateAndTimeToIso(newDateDay, newDateTime) : null;
    if (newDateDay && !scheduleIso) {
      toast({
        title: "Data/orario non validi",
        description: "Controlla data e orario della partita.",
        variant: "destructive",
      });
      return;
    }
    const rescheduleIso =
      isPostponed && !rescheduleTbd && rescheduleDateDay
        ? combineDateAndTimeToIso(rescheduleDateDay, rescheduleDateTime)
        : null;
    if (isPostponed && !rescheduleTbd && rescheduleDateDay && !rescheduleIso) {
      toast({
        title: "Data/orario recupero non validi",
        description: "Controlla data e orario recupero.",
        variant: "destructive",
      });
      return;
    }
    patch.mutate({
      date: scheduleIso ?? undefined,
      isPostponed,
      rescheduleTbd: isPostponed ? rescheduleTbd : false,
      rescheduleDate: isPostponed && !rescheduleTbd ? (rescheduleIso ?? null) : null,
    });
    setEditingSchedule(false);
  }

  const convokedPlayers = selectableTeamPlayers.filter((p) => selectedPlayerIds.has(p.id));
  const convokedById = useMemo(() => new Map(convokedPlayers.map((p) => [p.id, p])), [convokedPlayers]);
  const tacticalPreset = planDraft.periods[0]?.module || moduleOptions[0];
  const matchKindLabel =
    matchPhase(match) === "amichevoli"
      ? "Amichevole"
      : (match.competition ?? "").trim() || "Partita";
  const boardTitleForMatch = `${matchKindLabel} ${homeLabel} vs ${awayLabel} schieramenti e tattiche`;
  const returnToMatchUrl = `/calendari/${match.teamId ?? ""}?openMatchId=${match.id}&phase=${matchPhase(match)}`;
  const tacticalBaseUrl = `/tactical-board?teamId=${match.teamId ?? ""}&matchId=${match.id}&source=match-plan&phase=${matchPhase(match)}&preset=${encodeURIComponent(tacticalPreset)}&convocati=${encodeURIComponent(Array.from(selectedPlayerIds).join(","))}&matchTitle=${encodeURIComponent(boardTitleForMatch)}&returnTo=${encodeURIComponent(returnToMatchUrl)}`;
  const tacticalUrl = `${tacticalBaseUrl}&periodKey=t1`;
  const canOpenBoard =
    selectedPlayerIds.size > 0 &&
    !!tacticalPreset &&
    !!planDraft.convocationAt &&
    !!planDraft.convocationPlace;

  function openLineupDialog(periodIndex: number, mode: "view" | "edit") {
    const period = planDraft.periods[periodIndex];
    if (!period) return;
    const selected = new Set(selectedPlayerIds);
    const existing = (period.lineupPlayerIds ?? []).filter((id) => selected.has(id));
    const periodFormat = period.format ?? matchFormat;
    const periodModule = period.module ?? "";
    const periodLimit = startersLimitForPeriod(period, matchFormat);
    const initialLineup = existing.length > 0
      ? normalizeLineupGoalkeepers(existing, convokedById, periodLimit)
      : buildAutomaticLineup(convokedPlayers, periodLimit);
    setLineupDialog({
      periodIndex,
      mode,
      module: periodModule || moduleOptionsForFormat(periodFormat)[0] || "",
      lineupPlayerIds: initialLineup,
      positions: { ...(period.lineupPositions ?? {}) },
      drawings: [...(period.lineupDrawings ?? [])],
      tool: "select",
      color: "#facc15",
      lineWidth: 3,
      lineStyle: "solid",
      arrowHeads: "end",
      geometry: "freehand",
      optionsOpen: false,
      selectedPlayerId: null,
      selectedDrawingId: null,
      activeDrawing: null,
      drawingDrag: null,
    });
  }

  function saveLineupDialog() {
    if (!lineupDialog) return;
    setPlanDraft((prev) => {
      const periods = prev.periods.map((period, idx) =>
        idx === lineupDialog.periodIndex
          ? (() => {
              const limit = startersLimitForPeriod({ ...period, module: lineupDialog.module }, matchFormat);
              const lineupPlayerIds = normalizeLineupGoalkeepers(
                lineupDialog.lineupPlayerIds.filter((id) => selectedPlayerIds.has(id)),
                convokedById,
                limit,
              );
              return {
              ...period,
              module: lineupDialog.module,
              lineupPlayerIds,
              lineupPositions: lineupDialog.positions,
              lineupDrawings: lineupDialog.drawings,
              lineupDetectedModule: detectLineupModuleLabel(
                lineupPlayerIds,
                lineupDialog.positions,
                lineupDialog.module,
                period.format ?? matchFormat,
                limit,
                convokedById,
              ),
              boardConfirmed: false,
              };
            })()
          : period,
      );
      const adjusted =
        autoReserveRuleEnabled && lineupDialog.periodIndex === 0
          ? applyScuolaCalcioSecondPeriodAuto(periods, selectedPlayerIds, matchFormat)
          : periods;
      return { ...prev, periods: adjusted };
    });
    setLineupDialog(null);
  }

  useEffect(() => {
    if (!canViewMatchPlan) return;
    const allowedIds = new Set(selectableTeamPlayers.map((p) => p.id));
    const next = new Set<number>();
    for (const c of callups) if (allowedIds.has(c.playerId)) next.add(c.playerId);
    setSelectedPlayerIds((prev) => {
      if (prev.size !== next.size) return next;
      for (const id of prev) if (!next.has(id)) return next;
      return prev;
    });
  }, [callups, canViewMatchPlan, selectableTeamPlayers]);

  useEffect(() => {
    const next = ensurePlanPeriods(match.matchPlan ?? null, defaultPeriodsForTeam(matchSection, teamName, teamCategory));
    const hasFourth = next.periods.some((p) => p.key === "t4");
    if (next.fourthTime && !hasFourth) {
      next.periods = [
        ...next.periods,
        {
          key: "t4",
          label: "4° tempo",
          minutes: next.periods[2]?.minutes || next.periods[0]?.minutes || "15",
          module: next.periods[2]?.module || next.periods[0]?.module || "",
          lineupPlayerIds: [],
        },
      ];
    }
    if (!next.fourthTime && hasFourth) {
      next.periods = next.periods.filter((p) => p.key !== "t4");
    }
    setPlanDraft(next);
    setConvocationDateInput(toDateInputValue(next.convocationAt));
    setConvocationTimeInput(toTimeInputValue(next.convocationAt));
  }, [match.matchPlan, matchSection, teamName, teamCategory]);

  useEffect(() => {
    setPlanDraft((prev) => {
      const nextPeriods: MatchPlanPeriodRuntime[] = prev.periods.map((period, idx) => {
        let lineup = (period.lineupPlayerIds ?? []).filter((id) => selectedPlayerIds.has(id));
        // 1st period: keep manual order, but ensure all convocated players are present.
        if (idx === 0 && selectedPlayersOrdered.length > 0) {
          if (lineup.length === 0) {
            lineup = [...selectedPlayersOrdered];
          } else {
            const existing = new Set(lineup);
            const missing = selectedPlayersOrdered.filter((id) => !existing.has(id));
            if (missing.length > 0) lineup = [...lineup, ...missing];
          }
        }
        const prevLineup = period.lineupPlayerIds ?? [];
        const lineupChanged =
          prevLineup.length !== lineup.length || prevLineup.some((id, ix) => id !== lineup[ix]);
        return lineupChanged ? { ...period, lineupPlayerIds: lineup, boardConfirmed: false } : { ...period, lineupPlayerIds: lineup };
      });

      // 2nd period starters auto-populate from 1st period reserves (except 11v11 flows).
      if (autoReserveRuleEnabled && nextPeriods.length >= 2) {
        const adjusted = applyScuolaCalcioSecondPeriodAuto(nextPeriods, selectedPlayerIds, matchFormat);
        nextPeriods.splice(0, nextPeriods.length, ...adjusted);
      }

      const changed = nextPeriods.some((period, idx) => {
        const prevLineup = prev.periods[idx]?.lineupPlayerIds ?? [];
        const nextLineup = period.lineupPlayerIds ?? [];
        if (prevLineup.length !== nextLineup.length) return true;
        for (let i = 0; i < prevLineup.length; i += 1) {
          if (prevLineup[i] !== nextLineup[i]) return true;
        }
        return false;
      });
      return changed ? { ...prev, periods: nextPeriods } : prev;
    });
  }, [selectedPlayersOrdered, selectedPlayerIds, autoReserveRuleEnabled, matchFormat]);

  async function saveMatchPlanAndCallups() {
    if (!canManageMatchPlan) return;
    try {
      const selected = new Set(selectedPlayerIds);
      const selectedKeys = new Set(Array.from(selected).map(String));
      const normalizedPlan: MatchPlanData = {
        ...planDraft,
        periods: planDraft.periods.map((p) => {
          const lineupPlayerIds = normalizeLineupGoalkeepers(
            (p.lineupPlayerIds ?? []).filter((id) => selected.has(id)),
            convokedById,
            startersLimitForPeriod(p, matchFormat),
          );
          const lineupPositions = Object.fromEntries(
            Object.entries(p.lineupPositions ?? {}).filter(([id]) => selectedKeys.has(id)),
          );
          return {
            ...p,
            lineupPlayerIds,
            lineupPositions,
            lineupDetectedModule: detectLineupModuleLabel(
              lineupPlayerIds,
              lineupPositions,
              p.module,
              p.format ?? matchFormat,
              startersLimitForPeriod(p, matchFormat),
              convokedById,
            ),
          };
        }),
      };
      await apiFetch(`/api/matches/${match.id}/plan`, {
        method: "PUT",
        body: JSON.stringify({
          playerIds: Array.from(selectedPlayerIds),
          matchPlan: normalizedPlan,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      qc.invalidateQueries({ queryKey: ["/api/matches", match.id, "callups"] });
      toast({ title: "Rosa e schieramenti salvati" });
      setPlanOpen(false);
    } catch (err: any) {
      if (isNoopMatchUpdateError(err)) {
        qc.invalidateQueries({ queryKey: ["/api/matches"] });
        qc.invalidateQueries({ queryKey: ["/api/matches", match.id, "callups"] });
        toast({ title: "Rosa e schieramenti salvati" });
        setPlanOpen(false);
        return;
      }
      toast({ title: err?.message ?? "Errore salvataggio piano partita", variant: "destructive" });
    }
  }

  async function publishCallupsToParents() {
    try {
      const payload = {
        convocationAt: planDraft.convocationAt ?? null,
        convocationPlace: planDraft.convocationPlace ?? null,
      };
      const result = await apiFetch(`/api/matches/${match.id}/callups/publish`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result?.clipboardText && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(result.clipboardText));
      }
      toast({
        title: "Convocazione pubblicata",
        description: `Notifiche genitori: ${result?.notifications ?? 0}. Testo bacheca copiato negli appunti.`,
      });
    } catch (err: any) {
      toast({ title: err?.message ?? "Errore pubblicazione convocazione", variant: "destructive" });
    }
  }

  const lineupPeriod = lineupDialog ? planDraft.periods[lineupDialog.periodIndex] : null;
  const lineupFormat = lineupPeriod ? lineupPeriod.format ?? matchFormat : matchFormat;
  const lineupLimit = lineupPeriod ? startersLimitForPeriod({ ...lineupPeriod, module: lineupDialog?.module ?? lineupPeriod.module }, matchFormat) : 0;
  const lineupSlots = lineupDialog ? formationSlotsForLineup(lineupDialog.module, lineupFormat, lineupLimit) : [];
  const lineupStarters = lineupDialog ? lineupDialog.lineupPlayerIds.slice(0, lineupLimit) : [];
  const lineupReserves = lineupDialog ? lineupDialog.lineupPlayerIds.slice(lineupLimit) : [];
  const lineupSelected = new Set(lineupDialog?.lineupPlayerIds ?? []);
  const lineupStarterPlayers = lineupStarters.map((id) => convokedById.get(id)).filter((p): p is Player => Boolean(p));
  const lineupAvailablePlayers = convokedPlayers.filter((player) => selectedPlayerIds.has(player.id));
  const lineupModuleOptions = moduleOptionsForFormat(lineupFormat);
  const lineupReadOnly = lineupDialog?.mode === "view";
  const lineupDetectedModule = lineupDialog
    ? detectLineupModuleLabel(lineupDialog.lineupPlayerIds, lineupDialog.positions, lineupDialog.module, lineupFormat, lineupLimit, convokedById)
    : "";
  const lineupColors = ["#facc15", "#ffffff", "#38bdf8", "#22c55e", "#ef4444", "#111827"];
  const lineupPitchPoint = (event: { currentTarget: EventTarget & Element; clientX: number; clientY: number }) => {
    const target = event.currentTarget;
    const rect = (target.closest("[data-lineup-pitch]") as HTMLElement | null)?.getBoundingClientRect() ?? target.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  };

  return (
    <>
    <Card
      ref={cardRef}
      id={`match-${match.id}`}
      className={cn(
        "min-w-0 max-w-full overflow-hidden transition-shadow hover:shadow-md border-l-4",
        statusColor,
        bulkSelectEnabled && bulkSelected && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
      )}
    >
      <CardContent className="py-4 px-5 space-y-3">

        {/* Match header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0 flex gap-3">
            {bulkSelectEnabled && onBulkToggle && (
              <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={!!bulkSelected}
                  onCheckedChange={() => onBulkToggle()}
                  aria-label="Seleziona partita per azioni di gruppo"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
            {/* Score line */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-base">{homeLabel}</span>
              <span className="text-muted-foreground font-medium text-sm">vs</span>
              <span className="font-bold text-base">{awayLabel}</span>
              <Badge variant={isHome ? "default" : "secondary"} className="text-xs shrink-0">
                {isHome ? "Casa" : "Trasferta"}
              </Badge>
              {match.result && (
                <Badge variant="outline" className="text-xs font-bold shrink-0">{match.result}</Badge>
              )}
              {match.isPostponed && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 shrink-0">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Rinviata
                </Badge>
              )}
              {isRecoveryView && (
                <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-400 shrink-0">
                  <RotateCcw className="w-3 h-3 mr-1" /> Recupero
                </Badge>
              )}
              {!isPast && !match.isPostponed && (
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  <Clock className="w-3 h-3" /> In programma
                </span>
              )}
            </div>

            {/* Date and details */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(matchDate, "EEEE d MMMM yyyy • HH:mm", { locale: itLocale })}
              </span>
              {match.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{match.location}</span>
              )}
              {match.competition && (
                <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />{match.competition}</span>
              )}
              {match.notes && <span className="italic">{match.notes}</span>}
            </div>

            {/* Reschedule info */}
            {match.isPostponed && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-600">
                <RotateCcw className="w-3 h-3" />
                {match.rescheduleTbd
                  ? "Recupero: da concordare"
                  : match.rescheduleDate
                  ? `Recupero previsto: ${format(new Date(match.rescheduleDate), "d MMMM yyyy • HH:mm", { locale: itLocale })}`
                  : "Data recupero non definita"}
              </div>
            )}
            {isRecoveryView && match.__originalDate && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-emerald-700">
                <RotateCcw className="w-3 h-3" />
                Recupero della partita rinviata del {format(new Date(match.__originalDate), "d MMMM yyyy", { locale: itLocale })}
              </div>
            )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {canDeleteMatch && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Elimina partita"
                    aria-label="Elimina partita"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Eliminare questa partita?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {homeLabel} vs {awayLabel} — {format(matchDate, "d MMMM yyyy", { locale: itLocale })}.
                      L&apos;operazione non può essere annullata.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteMatch.isPending}
                      onClick={() => deleteMatch.mutate()}
                    >
                      Elimina
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canEditSchedule && !editingSchedule && (
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
                onClick={() => setEditingSchedule(true)}
              >
                <Pencil className="w-3 h-3" /> Modifica
              </Button>
            )}
          </div>
        </div>

        {/* Schedule editor */}
        {editingSchedule && canEditSchedule && (
          <div className="bg-muted/40 rounded-lg p-3 space-y-3 border">
            <p className="text-xs font-semibold text-muted-foreground">Modifica data/orario e stato</p>
            <div className="space-y-1">
              <Label className="text-xs">Data e orario</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={newDateDay}
                  onChange={(e) => setNewDateDay(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  type="text"
                  value={newDateTime}
                  onChange={(e) => setNewDateTime(formatTimeInputLive(e.target.value))}
                  className="h-8 text-sm"
                  placeholder="10:00 o 1000"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`postponed-${match.id}`}
                checked={isPostponed}
                onCheckedChange={v => setIsPostponed(!!v)}
              />
              <Label htmlFor={`postponed-${match.id}`} className="text-xs cursor-pointer">
                Partita rinviata
              </Label>
            </div>
            {isPostponed && (
              <div className="pl-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`tbd-${match.id}`}
                    checked={rescheduleTbd}
                    onCheckedChange={v => setRescheduleTbd(!!v)}
                  />
                  <Label htmlFor={`tbd-${match.id}`} className="text-xs cursor-pointer">
                    Data recupero da concordare
                  </Label>
                </div>
                {!rescheduleTbd && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data presunta recupero</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={rescheduleDateDay}
                        onChange={(e) => setRescheduleDateDay(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="text"
                        value={rescheduleDateTime}
                        onChange={(e) => setRescheduleDateTime(formatTimeInputLive(e.target.value))}
                        className="h-8 text-sm"
                        placeholder="10:00 o 1000"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSchedule(false)}>
                Annulla
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={saveSchedule} disabled={patch.isPending}>
                <CheckCircle className="w-3 h-3" /> Salva
              </Button>
            </div>
          </div>
        )}

        {/* Convocazioni / schieramenti */}
        {canViewMatchPlan && (
          <div className="pt-2 border-t border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <ListChecks className="w-3 h-3" /> Rosa usata e moduli per tempi
              </span>
              {canManageMatchPlan ? (
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => setPlanOpen((v) => !v)}>
                  <Pencil className="w-3 h-3" /> {planOpen ? "Chiudi" : "Gestisci"}
                </Button>
              ) : (
                <Badge variant="outline" className="text-[10px]">solo lettura</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Convocati: {selectedPlayerIds.size} ·
              <a href={canOpenBoard ? tacticalUrl : "#"} className={cn("ml-1 underline underline-offset-2", !canOpenBoard && "pointer-events-none opacity-50")}>
                Lavagna preparazione partita
              </a>
            </div>
            {planOpen && canManageMatchPlan && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Convocazione (rosa utilizzata)</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-xs"
                      value={callupSearch}
                      onChange={(e) => setCallupSearch(e.target.value)}
                      placeholder="Ricerca rapida giocatore (cognome o nome)"
                    />
                  </div>
                  <div className="max-h-72 overflow-auto rounded border bg-background p-2 grid grid-cols-1 xl:grid-cols-2 gap-1.5">
                    {filteredTeamPlayers.map((p) => (
                      <label key={p.id} className={cn("flex items-center gap-2 rounded px-1 py-1 text-xs", p.available === false && "opacity-50")}>
                        <Checkbox
                          checked={selectedPlayerIds.has(p.id)}
                          disabled={p.available === false}
                          onCheckedChange={(v) =>
                            setSelectedPlayerIds((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(p.id);
                              else next.delete(p.id);
                              return next;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {p.jerseyNumber ? `${p.jerseyNumber} · ` : ""}{p.firstName} {p.lastName}
                          {p.available === false ? " (non disponibile)" : ""}
                        </span>
                        {matchWeekTrainingDays.length > 0 && (
                          <span className="ml-auto flex shrink-0 items-center gap-1" aria-label="Presenze allenamenti settimana partita">
                            {matchWeekTrainingDays.map((day) => {
                              const status = day.sessionId ? matchWeekAttendanceByPlayer.get(`${p.id}:${day.sessionId}`) : null;
                              const tone = trainingAttendanceTone(status);
                              return (
                                <span
                                  key={day.key}
                                  title={`${format(day.date, "EEE dd/MM", { locale: itLocale })}: ${
                                    tone === "present"
                                      ? "presente"
                                      : tone === "absent"
                                      ? "assente"
                                      : tone === "requested"
                                      ? "giustificato"
                                      : tone === "injured"
                                      ? "infortunato"
                                      : day.sessionId
                                      ? "non segnato"
                                      : "allenamento previsto, presenze non registrate"
                                  }`}
                                  className={cn(
                                    "inline-flex h-5 min-w-9 items-center justify-center rounded-full border px-1 text-[10px] leading-none",
                                    tone === "present" && "border-emerald-300 bg-emerald-50 text-emerald-700",
                                    tone === "absent" && "border-red-300 bg-red-50 text-red-700",
                                    tone === "requested" && "border-sky-300 bg-sky-50 text-sky-700",
                                    tone === "injured" && "border-amber-300 bg-amber-50 text-amber-700",
                                    tone === "unknown" && "border-muted bg-muted/40 text-muted-foreground",
                                  )}
                                >
                                  {format(day.date, "EEE d", { locale: itLocale })}
                                  <span className="ml-0.5 font-semibold">{tone === "present" ? "✓" : tone === "unknown" ? "·" : "–"}</span>
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </label>
                    ))}
                    {filteredTeamPlayers.length === 0 && (
                      <p className="col-span-full text-[11px] text-muted-foreground py-1">
                        Nessun giocatore trovato con questo filtro.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Orario convocazione</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        className="h-8 text-xs"
                        type="date"
                        value={convocationDateInput}
                        onChange={(e) => {
                          const nextDate = e.target.value;
                          setConvocationDateInput(nextDate);
                          const nextIso = combineDateAndTimeToIso(nextDate, convocationTimeInput);
                          setPlanDraft((prev) => ({ ...prev, convocationAt: nextIso ?? "" }));
                        }}
                      />
                      <Input
                        className="h-8 text-xs"
                        type="text"
                        value={convocationTimeInput}
                        onChange={(e) => {
                          const nextTime = formatTimeInputLive(e.target.value);
                          setConvocationTimeInput(nextTime);
                          const nextIso = combineDateAndTimeToIso(convocationDateInput, nextTime);
                          setPlanDraft((prev) => ({ ...prev, convocationAt: nextIso ?? "" }));
                        }}
                        onBlur={(e) => {
                          const normalized = normalizeTime24(e.target.value);
                          if (!normalized) return;
                          setConvocationTimeInput(normalized);
                          const nextIso = combineDateAndTimeToIso(convocationDateInput, normalized);
                          setPlanDraft((prev) => ({ ...prev, convocationAt: nextIso ?? "" }));
                        }}
                        placeholder="HH:mm"
                        inputMode="numeric"
                        pattern="^([01]\\d|2[0-3]):([0-5]\\d)$"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Luogo convocazione (Maps)</Label>
                    <Input
                      className="h-8 text-xs"
                      value={planDraft.convocationPlace ?? ""}
                      onChange={(e) => setPlanDraft((prev) => ({ ...prev, convocationPlace: e.target.value }))}
                      placeholder="Es. Campo sportivo ..."
                    />
                  </div>
                </div>
                {planDraft.convocationPlace && (
                  <a
                    className="text-[11px] text-primary underline underline-offset-2"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(planDraft.convocationPlace)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Apri su Google Maps
                  </a>
                )}
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!planDraft.fourthTime}
                    onCheckedChange={(v) =>
                      setPlanDraft((prev) => {
                        const enabled = v === true;
                        const hasFourth = prev.periods.some((p) => p.key === "t4");
                        let periods = prev.periods;
                        if (enabled && !hasFourth) {
                          periods = [
                            ...prev.periods,
                            {
                              key: "t4",
                              label: "4° tempo",
                              minutes: prev.periods[2]?.minutes || prev.periods[0]?.minutes || "15",
                              module: prev.periods[2]?.module || prev.periods[0]?.module || "",
                              lineupPlayerIds: [],
                            },
                          ];
                        }
                        if (!enabled && hasFourth) {
                          periods = prev.periods.filter((p) => p.key !== "t4");
                        }
                        return { ...prev, fourthTime: enabled, periods };
                      })
                    }
                  />
                  <Label className="text-xs cursor-pointer">Abilita 4° tempo</Label>
                </div>
                <div className="space-y-2">
                  {planDraft.periods.map((p, i) => {
                    const periodFormat = p.format ?? matchFormat;
                    const periodBoardUrl = p.boardUrl || (p.boardId ? `/tactical-board?boardId=${p.boardId}&teamId=${match.teamId ?? ""}&matchId=${match.id}&periodKey=${p.key}&returnTo=${encodeURIComponent(returnToMatchUrl)}` : "");
                    const lineupIds = (p.lineupPlayerIds ?? [])
                      .filter((id) => selectedPlayerIds.has(id));
                    const startersLimit = startersLimitForPeriod(p, matchFormat);
                    const starters = lineupIds.slice(0, startersLimit).length;
                    const hasLineup = lineupIds.length > 0;
                    const detectedPeriodModule = hasLineup
                      ? detectLineupModuleLabel(lineupIds, p.lineupPositions, p.module, periodFormat, startersLimit, convokedById)
                      : "";
                    return (
                      <div key={p.key} className="rounded-md border border-border/60 bg-background/80 p-2 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2 items-end">
                          <div className="text-[11px] text-muted-foreground">{p.label} ({p.minutes} min)</div>
                          <div className="space-y-1">
                            {friendlyNextFormat && (
                              <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Checkbox
                                  checked={periodFormat === friendlyNextFormat}
                                  onCheckedChange={(v) =>
                                    setPlanDraft((prev) => {
                                      const nextFormat = v === true ? friendlyNextFormat : matchFormat;
                                      const nextPeriods = prev.periods.map((x, ix) => {
                                        if (ix !== i) return x;
                                        const valid = moduleOptionsForFormat(nextFormat);
                                        const currentModule = valid.includes(x.module ?? "") ? x.module ?? "" : "";
                                        return { ...x, format: nextFormat, module: currentModule, boardConfirmed: false };
                                      });
                                      const adjusted =
                                        autoReserveRuleEnabled && i === 0
                                          ? applyScuolaCalcioSecondPeriodAuto(nextPeriods, selectedPlayerIds, matchFormat)
                                          : nextPeriods;
                                      return { ...prev, periods: adjusted };
                                    })
                                  }
                                />
                                Usa formato annata successiva ({friendlyNextFormat})
                              </label>
                            )}
                            <div className="h-8 rounded-md border border-input bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground w-full">
                              Modulo rilevato: <span className="font-semibold text-foreground">{detectedPeriodModule || p.lineupDetectedModule || p.module || `Formato ${periodFormat}`}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Titolari: {starters}/{startersLimit} · Totale: {lineupIds.length}</span>
                          {lineupIds.length === 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px]"
                              onClick={() =>
                                setPlanDraft((prev) => {
                                  const nextPeriods = prev.periods.map((x, ix) =>
                                    ix === i ? { ...x, lineupPlayerIds: [...selectedPlayersOrdered], boardConfirmed: false } : x,
                                  );
                                  const adjusted =
                                    autoReserveRuleEnabled && i === 0
                                      ? applyScuolaCalcioSecondPeriodAuto(nextPeriods, selectedPlayerIds, matchFormat)
                                      : nextPeriods;
                                  return { ...prev, periods: adjusted };
                                })
                              }
                            >
                              Carica convocati
                            </Button>
                          )}
                        </div>

                        {lineupIds.length > 0 ? (
                          <div
                            className="max-h-36 overflow-auto rounded border bg-muted/20 p-1.5 space-y-1"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              let dragged = Number(e.dataTransfer.getData("text/plain"));
                              let sourceIndex = i;
                              try {
                                const raw = e.dataTransfer.getData("application/x-ftb-player");
                                if (raw) {
                                  const parsed = JSON.parse(raw) as { playerId?: number; periodIndex?: number };
                                  if (Number.isFinite(parsed.playerId)) dragged = Number(parsed.playerId);
                                  if (Number.isFinite(parsed.periodIndex)) sourceIndex = Number(parsed.periodIndex);
                                }
                              } catch {
                                // keep plain fallback
                              }
                              if (!Number.isFinite(dragged) || dragged <= 0) return;
                              setPlanDraft((prev) => ({
                                ...prev,
                                      periods: (() => {
                                        const moved =
                                          sourceIndex === i
                                            ? prev.periods
                                            : movePlayerBetweenPeriods(prev.periods, sourceIndex, i, dragged);
                                        if (autoReserveRuleEnabled && (sourceIndex === 0 || i === 0)) {
                                          return applyScuolaCalcioSecondPeriodAuto(moved, selectedPlayerIds, matchFormat);
                                        }
                                        return moved;
                                      })(),
                              }));
                            }}
                          >
                            {lineupIds.map((playerId, idx) => {
                              const player = convokedById.get(playerId);
                              if (!player) return null;
                              const isReserve = idx >= startersLimit;
                              return (
                                <div
                                  key={`${p.key}-${playerId}`}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/plain", String(playerId));
                                    e.dataTransfer.setData(
                                      "application/x-ftb-player",
                                      JSON.stringify({ playerId, periodIndex: i }),
                                    );
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    let dragged = Number(e.dataTransfer.getData("text/plain"));
                                    let sourceIndex = i;
                                    try {
                                      const raw = e.dataTransfer.getData("application/x-ftb-player");
                                      if (raw) {
                                        const parsed = JSON.parse(raw) as { playerId?: number; periodIndex?: number };
                                        if (Number.isFinite(parsed.playerId)) dragged = Number(parsed.playerId);
                                        if (Number.isFinite(parsed.periodIndex)) sourceIndex = Number(parsed.periodIndex);
                                      }
                                    } catch {
                                      // keep plain fallback
                                    }
                                    if (!Number.isFinite(dragged) || dragged <= 0) return;
                                    setPlanDraft((prev) => ({
                                      ...prev,
                                      periods: (() => {
                                        const moved =
                                          sourceIndex === i
                                            ? prev.periods.map((x, ix) => {
                                                if (ix !== i) return x;
                                                const current = (x.lineupPlayerIds ?? []).filter((id) => selectedPlayerIds.has(id));
                                                return { ...x, lineupPlayerIds: reorderIds(current, dragged, playerId) };
                                              })
                                            : movePlayerBetweenPeriods(prev.periods, sourceIndex, i, dragged, playerId);
                                        if (autoReserveRuleEnabled && (sourceIndex === 0 || i === 0)) {
                                          return applyScuolaCalcioSecondPeriodAuto(moved, selectedPlayerIds, matchFormat);
                                        }
                                        return moved;
                                      })(),
                                    }));
                                  }}
                                  className={cn(
                                    "flex items-center justify-between rounded border px-2 py-1 text-xs cursor-move",
                                    isReserve
                                      ? "border-amber-300 bg-amber-50/80 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                                      : "border-emerald-300 bg-emerald-50/80 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
                                  )}
                                  title="Trascina per ordinare titolari/riserve"
                                >
                                  <span className="truncate pr-2">
                                    {player.jerseyNumber ? `${player.jerseyNumber} · ` : ""}{player.firstName} {player.lastName}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-semibold">
                                    {isReserve ? "RISERVA" : "TITOLARE"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div
                            className="rounded border border-dashed p-2 text-[11px] text-muted-foreground italic"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              let dragged = Number(e.dataTransfer.getData("text/plain"));
                              let sourceIndex = i;
                              try {
                                const raw = e.dataTransfer.getData("application/x-ftb-player");
                                if (raw) {
                                  const parsed = JSON.parse(raw) as { playerId?: number; periodIndex?: number };
                                  if (Number.isFinite(parsed.playerId)) dragged = Number(parsed.playerId);
                                  if (Number.isFinite(parsed.periodIndex)) sourceIndex = Number(parsed.periodIndex);
                                }
                              } catch {
                                // keep plain fallback
                              }
                              if (!Number.isFinite(dragged) || dragged <= 0) return;
                              setPlanDraft((prev) => ({
                                ...prev,
                                periods: (() => {
                                  const moved =
                                    sourceIndex === i
                                      ? prev.periods
                                      : movePlayerBetweenPeriods(prev.periods, sourceIndex, i, dragged);
                                  if (autoReserveRuleEnabled && (sourceIndex === 0 || i === 0)) {
                                    return applyScuolaCalcioSecondPeriodAuto(moved, selectedPlayerIds, matchFormat);
                                  }
                                  return moved;
                                })(),
                              }));
                            }}
                          >
                            Nessun giocatore nel riquadro di questo tempo. Trascina qui da un altro tempo.
                          </div>
                        )}

                        {hasLineup && (
                          <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-emerald-900">Schieramento impostato {p.label}</p>
                                <p className="truncate text-[11px] text-emerald-700">{p.boardTitle ?? "Preparazione tattica"}</p>
                                {p.boardId && (
                                  <p className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    p.boardConfirmed === false ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                  }`}>
                                    {p.boardConfirmed === false ? "Da confermare" : "Confermato"}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openLineupDialog(i, "view")}
                                  className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                                >
                                  Anteprima
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openLineupDialog(i, "edit")}
                                  className="rounded-md border border-emerald-500 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                                >
                                  Prepara schieramento
                                </button>
                                {p.boardId && periodBoardUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewBoard({ ...p, boardUrl: periodBoardUrl })}
                                    className="rounded-md border border-emerald-500 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                                  >
                                    Lavagna completa
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {!hasLineup && (
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={selectedPlayerIds.size === 0}
                              onClick={() => openLineupDialog(i, "edit")}
                            >
                              Imposta schieramento
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!canOpenBoard} asChild>
                    <a href={tacticalUrl}>Apri lavagna con prefill</a>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={selectedPlayerIds.size === 0 || !planDraft.convocationAt || !planDraft.convocationPlace}
                    onClick={publishCallupsToParents}
                  >
                    Export bacheca + avviso genitori
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveMatchPlanAndCallups}>
                    <CheckCircle className="w-3.5 h-3.5" /> Salva piano partita
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pre-match notes */}
        {(canEditPreNotes || match.preMatchNotes) && (
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Note pre-partita
              </span>
              {canEditPreNotes && !editingPreNotes && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                  onClick={() => { setEditingPreNotes(true); setPreNoteValue(match.preMatchNotes ?? ""); setTimeout(() => preTextareaRef.current?.focus(), 50); }}
                >
                  <Pencil className="w-3 h-3" />
                  {match.preMatchNotes ? "Modifica" : "Aggiungi"}
                </Button>
              )}
              {editingPreNotes && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingPreNotes(false)}>Annulla</Button>
                  <Button size="sm" className="h-6 text-xs gap-1" disabled={patch.isPending} onClick={savePreNotes}>
                    <CheckCircle className="w-3 h-3" /> Salva
                  </Button>
                </div>
              )}
            </div>
            {editingPreNotes ? (
              <Textarea
                ref={preTextareaRef}
                value={preNoteValue}
                onChange={e => setPreNoteValue(e.target.value)}
                placeholder="Es: ritrovo ore 14:30, indicazioni tattiche, comunicazioni pre-gara..."
                rows={3}
                className="text-xs resize-none"
              />
            ) : match.preMatchNotes ? (
              <p className="text-sm bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 italic text-foreground/80 leading-relaxed">
                {match.preMatchNotes}
              </p>
            ) : null}
          </div>
        )}

        {/* Post-match notes */}
        {(canEditPostNotes || isPast || hasPostNotes) && (
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> Note post-partita
                {hasPostNotes && <Badge variant="secondary" className="text-[10px] h-5">presenti</Badge>}
              </span>
              {canEditPostNotes && (
                <Popover open={postMenuOpen} onOpenChange={setPostMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                      onClick={startPostNoteEditor}
                    >
                      <Pencil className="w-3 h-3" />
                      {hasPostNotes ? "Modifica" : "Aggiungi"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[360px] p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Menu note post-partita</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => postFileInputRef.current?.click()}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Carica note (immagine o PDF)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => postCameraInputRef.current?.click()}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Carica da fotocamera
                      </Button>
                      <input
                        ref={postFileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addPostAttachmentsFromFileList(e.target.files);
                          e.target.value = "";
                        }}
                      />
                      <input
                        ref={postCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          addPostAttachmentsFromFileList(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    {postAttachments.length > 0 && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">File note caricati</p>
                        <div className="flex flex-wrap gap-1.5">
                          {postAttachments.map((name) => (
                            <Badge key={name} variant="outline" className="text-[10px] max-w-[150px] truncate">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Risultato</Label>
                      <Input
                        value={postResultValue}
                        onChange={(e) => setPostResultValue(e.target.value)}
                        placeholder="Es. 2-1"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Spazio note</Label>
                      <Textarea
                        value={postNoteValue}
                        onChange={(e) => setPostNoteValue(e.target.value)}
                        placeholder="Es: analisi gara, aspetti da migliorare, osservazioni..."
                        rows={4}
                        className="text-xs resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPostMenuOpen(false)}>
                        Annulla
                      </Button>
                      <Button type="button" size="sm" className="h-8 text-xs gap-1.5" disabled={patch.isPending} onClick={savePostNotes}>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Salva
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {postView.note ? (
              <p className="text-sm bg-muted/40 rounded-md px-3 py-2 italic text-foreground/80 leading-relaxed">
                {postView.note}
              </p>
            ) : hasPostNotes ? null : canEditPostNotes ? null : (
              <p className="text-xs text-muted-foreground italic">Nessuna nota inserita.</p>
            )}
            {postView.attachments.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Allegati: {postView.attachments.join(", ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={!!lineupDialog} onOpenChange={(open) => !open && setLineupDialog(null)}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {lineupReadOnly ? "Anteprima schieramento" : "Prepara schieramento"}
            {lineupPeriod ? ` - ${lineupPeriod.label}` : ""}
          </DialogTitle>
          <DialogDescription>
            Lavagna essenziale per modulo, titolari e riserve del tempo selezionato.
          </DialogDescription>
        </DialogHeader>
        {lineupDialog && lineupPeriod && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={lineupDialog.module}
                  disabled
                  className="h-9 rounded-md border border-input bg-muted/30 px-2 text-sm text-muted-foreground"
                >
                  <option value="">Modulo base ({lineupFormat})</option>
                  {lineupModuleOptions.map((module) => (
                    <option key={module} value={module}>{module}</option>
                  ))}
                </select>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
                  Rilevato: <span className="font-semibold">{lineupDetectedModule || "posiziona i titolari"}</span>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1 rounded-md border bg-background p-1">
                  {(["select", "pen", "arrow"] as const).map((tool) => (
                    <Button
                      key={tool}
                      type="button"
                      variant={lineupDialog.tool === tool ? "default" : "ghost"}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={lineupReadOnly}
                      onClick={() => setLineupDialog((prev) => prev ? { ...prev, tool, activeDrawing: null, selectedPlayerId: null, optionsOpen: tool !== "select" } : prev)}
                    >
                      {tool === "select" ? "Seleziona" : tool === "pen" ? "Disegna" : "Freccia"}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={lineupReadOnly || lineupDialog.drawings.length === 0}
                    onClick={() => setLineupDialog((prev) => prev ? { ...prev, drawings: [], activeDrawing: null, selectedDrawingId: null } : prev)}
                  >
                    Pulisci
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={lineupReadOnly || !lineupDialog.selectedDrawingId}
                    onClick={() => setLineupDialog((prev) => prev ? {
                      ...prev,
                      drawings: prev.drawings.filter((drawing) => drawing.id !== prev.selectedDrawingId),
                      selectedDrawingId: null,
                    } : prev)}
                  >
                    Elimina
                  </Button>
                  <span className="mx-1 h-5 w-px bg-border" />
                  {lineupColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Colore ${color}`}
                      disabled={lineupReadOnly}
                      onClick={() => setLineupDialog((prev) => prev ? { ...prev, color } : prev)}
                      className={cn(
                        "h-5 w-5 rounded-full border shadow-sm",
                        lineupDialog.color === color ? "ring-2 ring-primary ring-offset-1" : "border-muted-foreground/30",
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              {!lineupReadOnly && lineupDialog.tool !== "select" && lineupDialog.optionsOpen && (
                <div className="absolute z-30 mt-[-6px] w-[280px] rounded-lg border bg-white p-3 text-xs shadow-xl">
                  {lineupDialog.tool === "arrow" && (
                    <div className="space-y-2">
                      <label className="block font-semibold text-slate-700">
                        Tracciato
                        <select
                          value={lineupDialog.geometry}
                          className="mt-1 h-8 w-full rounded-md border bg-white px-2 text-xs"
                          onChange={(e) => setLineupDialog((prev) => prev ? { ...prev, geometry: e.target.value as LineupDrawing["geometry"] } : prev)}
                        >
                          <option value="freehand">Mano libera</option>
                          <option value="straight">Retta</option>
                          <option value="conduzione-freehand">Conduzione libera</option>
                          <option value="conduzione-straight">Conduzione retta</option>
                        </select>
                      </label>
                      <label className="block font-semibold text-slate-700">
                        Punte
                        <select
                          value={lineupDialog.arrowHeads}
                          className="mt-1 h-8 w-full rounded-md border bg-white px-2 text-xs"
                          onChange={(e) => setLineupDialog((prev) => prev ? { ...prev, arrowHeads: e.target.value as LineupDrawing["arrowHeads"] } : prev)}
                        >
                          <option value="end">Verso la fine</option>
                          <option value="start">Verso l'inizio</option>
                          <option value="both">Entrambe le estremita</option>
                          <option value="none">Senza punta</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="font-semibold text-slate-700">
                      Linea
                      <select
                        value={lineupDialog.lineStyle}
                        className="mt-1 h-8 w-full rounded-md border bg-white px-2 text-xs"
                        onChange={(e) => setLineupDialog((prev) => prev ? { ...prev, lineStyle: e.target.value as LineupDrawing["lineStyle"] } : prev)}
                      >
                        <option value="solid">Continua</option>
                        <option value="dashed" disabled={isLineupConduzioneGeometry(lineupDialog.geometry)}>Tratteggio</option>
                      </select>
                    </label>
                    <label className="font-semibold text-slate-700">
                      Spessore
                      <select
                        value={lineupDialog.lineWidth}
                        className="mt-1 h-8 w-full rounded-md border bg-white px-2 text-xs"
                        onChange={(e) => setLineupDialog((prev) => prev ? { ...prev, lineWidth: Number(e.target.value) } : prev)}
                      >
                        {[2, 3, 4, 5].map((width) => (
                          <option key={width} value={width}>{width}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              )}

              <div
                data-lineup-pitch
                className="relative aspect-[16/10] min-h-[360px] overflow-hidden rounded-lg border-4 border-green-300 bg-green-700"
                onPointerDown={(event) => {
                  if (lineupDialog.tool === "select") {
                    setLineupDialog((prev) => prev ? { ...prev, selectedPlayerId: null, selectedDrawingId: null } : prev);
                  }
                  if (lineupReadOnly || lineupDialog.tool === "select") return;
                  const point = lineupPitchPoint(event);
                  const drawing: LineupDrawing = {
                    id: `draw-${Date.now()}`,
                    tool: lineupDialog.tool,
                    color: lineupDialog.color,
                    width: lineupDialog.lineWidth,
                    lineStyle: isLineupConduzioneGeometry(lineupDialog.geometry) ? "solid" : lineupDialog.lineStyle,
                    arrowHeads: lineupDialog.tool === "arrow" ? lineupDialog.arrowHeads : "none",
                    geometry: lineupDialog.tool === "arrow" ? lineupDialog.geometry : "freehand",
                    points: [point],
                  };
                  setLineupDialog((prev) => prev ? { ...prev, activeDrawing: drawing, selectedDrawingId: null, selectedPlayerId: null } : prev);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (lineupReadOnly || !lineupDialog.activeDrawing) return;
                  const point = lineupPitchPoint(event);
                  setLineupDialog((prev) => {
                    if (!prev?.activeDrawing) return prev;
                    const points = prev.activeDrawing.tool === "arrow"
                      ? (isLineupStraightGeometry(prev.activeDrawing.geometry)
                        ? [prev.activeDrawing.points[0], point]
                        : [...prev.activeDrawing.points, point])
                      : [...prev.activeDrawing.points, point];
                    return { ...prev, activeDrawing: { ...prev.activeDrawing, points } };
                  });
                }}
                onPointerUp={(event) => {
                  if (lineupReadOnly || !lineupDialog.activeDrawing) return;
                  setLineupDialog((prev) => {
                    if (!prev?.activeDrawing) return prev;
                    const drawing = finishLineupDrawing(prev.activeDrawing);
                    return {
                      ...prev,
                      drawings: drawing.points.length >= 2 ? [...prev.drawings, drawing] : prev.drawings,
                      activeDrawing: null,
                    };
                  });
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
              >
                <div className="absolute inset-[4%] rounded-lg border-2 border-white/70" />
                <div className="absolute left-1/2 top-[4%] h-[92%] w-0.5 bg-white/60" />
                <div className="absolute left-1/2 top-1/2 h-[22%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60" />
                <div className="absolute left-[4%] top-[30%] h-[40%] w-[17%] border-2 border-l-0 border-white/60" />
                <div className="absolute right-[4%] top-[30%] h-[40%] w-[17%] border-2 border-r-0 border-white/60" />
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <marker id="lineup-arrow-head" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                      <path d="M 0 0 L 5 2.5 L 0 5 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {[...lineupDialog.drawings, ...(lineupDialog.activeDrawing ? [lineupDialog.activeDrawing] : [])].map((drawing) => {
                    if (drawing.points.length < 2) return null;
                    const straightDrawing = drawing.tool === "arrow" && isLineupStraightGeometry(drawing.geometry);
                    const d = isLineupConduzioneGeometry(drawing.geometry)
                      ? lineupConduzionePath(drawing.points, straightDrawing, Math.max(1.2, (drawing.width ?? 3) * 0.45))
                      : lineupDrawingPath(drawing.points, straightDrawing);
                    const selected = lineupDialog.selectedDrawingId === drawing.id;
                    const arrowFrom = drawing.points.length > 1 ? drawing.points[drawing.points.length - 2] : drawing.points[0];
                    const arrowTip = drawing.points[drawing.points.length - 1];
                    return (
                      <g key={drawing.id}>
                        <path d={d} fill="none" stroke="rgba(15,23,42,0.24)" strokeWidth={(drawing.width ?? 3) * 1.15} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeDasharray={drawing.lineStyle === "dashed" ? "8 6" : undefined} />
                        <path
                          d={d}
                          fill="none"
                          stroke={drawing.color}
                          strokeWidth={(drawing.width ?? 3) * (selected ? 0.72 : 0.6)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          className={cn(!lineupReadOnly && lineupDialog.tool === "select" && "pointer-events-auto cursor-move")}
                          opacity={selected ? 1 : 0.96}
                          strokeDasharray={drawing.lineStyle === "dashed" ? "8 6" : undefined}
                          onPointerDown={(event) => {
                            if (lineupReadOnly || lineupDialog.tool !== "select") return;
                            event.stopPropagation();
                            const point = lineupPitchPoint(event as any);
                            setLineupDialog((prev) => prev ? {
                              ...prev,
                              selectedDrawingId: drawing.id,
                              selectedPlayerId: null,
                              drawingDrag: { id: drawing.id, last: point },
                            } : prev);
                            (event.currentTarget as SVGPathElement).setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            if (lineupReadOnly || lineupDialog.tool !== "select" || lineupDialog.drawingDrag?.id !== drawing.id) return;
                            event.stopPropagation();
                            const point = lineupPitchPoint(event as any);
                            const dx = point.x - lineupDialog.drawingDrag.last.x;
                            const dy = point.y - lineupDialog.drawingDrag.last.y;
                            setLineupDialog((prev) => {
                              if (!prev?.drawingDrag || prev.drawingDrag.id !== drawing.id) return prev;
                              return {
                                ...prev,
                                drawingDrag: { id: drawing.id, last: point },
                                drawings: prev.drawings.map((item) =>
                                  item.id === drawing.id
                                    ? { ...item, points: item.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
                                    : item,
                                ),
                              };
                            });
                          }}
                          onPointerUp={(event) => {
                            if (lineupReadOnly) return;
                            event.stopPropagation();
                            setLineupDialog((prev) => prev ? { ...prev, drawingDrag: null } : prev);
                            (event.currentTarget as SVGPathElement).releasePointerCapture(event.pointerId);
                          }}
                        />
                        {drawing.tool === "arrow" && (drawing.arrowHeads === "end" || drawing.arrowHeads === "both") && (
                          <path d={lineupArrowHeadPath(arrowTip, arrowFrom, Math.max(2.5, (drawing.width ?? 3) * 0.95))} fill="none" stroke={drawing.color} strokeWidth={(drawing.width ?? 3) * 0.42} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        )}
                        {drawing.tool === "arrow" && (drawing.arrowHeads === "start" || drawing.arrowHeads === "both") && (
                          <path d={lineupArrowHeadPath(drawing.points[0], drawing.points[1] ?? arrowTip, Math.max(2.5, (drawing.width ?? 3) * 0.95))} fill="none" stroke={drawing.color} strokeWidth={(drawing.width ?? 3) * 0.42} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        )}
                      </g>
                    );
                  })}
                </svg>
                {lineupSlots.map((slot, idx) => {
                  const playerId = lineupStarters[idx];
                  const player = playerId ? convokedById.get(playerId) : null;
                  const position = playerId ? lineupDialog.positions[String(playerId)] ?? slot : slot;
                  return (
                    <div
                      key={`lineup-slot-${idx}`}
                      className={cn(
                        "absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1",
                        !lineupReadOnly && lineupDialog.tool === "select" && playerId && "cursor-grab active:cursor-grabbing",
                      )}
                      style={{ left: `${position.x}%`, top: `${position.y}%` }}
                      draggable={!lineupReadOnly && lineupDialog.tool === "select" && !!playerId}
                      onDragStart={(event) => {
                        if (!playerId) return;
                        event.dataTransfer.setData("application/x-lineup-player", String(playerId));
                      }}
                      onDragEnd={(event) => {
                        if (!playerId || lineupReadOnly) return;
                        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                        if (!rect) return;
                        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
                        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
                        setLineupDialog((prev) => prev ? {
                          ...prev,
                          positions: { ...prev.positions, [String(playerId)]: { x, y } },
                        } : prev);
                      }}
                      onClick={(event) => {
                        if (!playerId || lineupReadOnly || lineupDialog.tool !== "select") return;
                        event.stopPropagation();
                        setLineupDialog((prev) => prev ? { ...prev, selectedPlayerId: playerId, selectedDrawingId: null } : prev);
                      }}
                    >
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow",
                        slot.role === "goalkeeper" ? "bg-yellow-500" : "bg-blue-500",
                      )}>
                        {player?.jerseyNumber ?? (slot.role === "goalkeeper" ? "GK" : idx + 1)}
                      </div>
                      {player && (
                        <span className="max-w-20 truncate rounded bg-black/45 px-1 py-0.5 text-[10px] font-semibold text-white">
                          {shortPlayerLabel(player)}
                        </span>
                      )}
                      {lineupDialog.selectedPlayerId === playerId && player && !lineupReadOnly && (
                        <div
                          className="absolute left-1/2 top-10 z-20 w-48 -translate-x-1/2 rounded-lg border bg-white p-2 text-[11px] shadow-xl"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          onPointerUp={(event) => event.stopPropagation()}
                        >
                          <p className="mb-1 truncate font-semibold text-slate-900">{player.firstName} {player.lastName}</p>
                          <select
                            className="h-7 w-full rounded border bg-white px-1 text-[11px]"
                            value={String(playerId)}
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                            onPointerUp={(event) => event.stopPropagation()}
                            onChange={(e) => {
                              const nextId = e.target.value ? Number(e.target.value) : null;
                              setLineupDialog((prev) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  selectedPlayerId: nextId,
                                  lineupPlayerIds: replaceLineupPlayerAtSlot(prev.lineupPlayerIds, idx, playerId, nextId),
                                };
                              });
                            }}
                          >
                            {lineupAvailablePlayers
                              .filter((p) => slot.role === "goalkeeper" ? isGoalkeeperPlayer(p) : (!isGoalkeeperPlayer(p) || p.id === playerId))
                              .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.jerseyNumber ? `${p.jerseyNumber} - ` : ""}{p.firstName} {p.lastName}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="mt-1 w-full rounded bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
                            onClick={() => setLineupDialog((prev) => prev ? {
                              ...prev,
                              selectedPlayerId: null,
                              lineupPlayerIds: replaceLineupPlayerAtSlot(prev.lineupPlayerIds, idx, playerId, null),
                            } : prev)}
                          >
                            Rimuovi dallo slot
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-semibold">Titolari</p>
                <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                  {lineupStarterPlayers.length > 0 ? lineupStarterPlayers.map((player) => (
                    <div key={`lineup-starter-${player.id}`} className="flex items-center justify-between rounded border bg-background px-2 py-1 text-xs">
                      <span className="truncate">{player.jerseyNumber ? `${player.jerseyNumber} - ` : ""}{player.firstName} {player.lastName}</span>
                      <span className={cn(
                        "ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        isGoalkeeperPlayer(player) ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800",
                      )}>
                        {isGoalkeeperPlayer(player) ? "GK" : "Titolare"}
                      </span>
                    </div>
                  )) : (
                    <p className="text-xs text-muted-foreground">Nessun titolare selezionato.</p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-sm font-semibold">Riserve</p>
                <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                  {lineupReserves.length > 0 ? lineupReserves.map((id) => {
                    const player = convokedById.get(id);
                    if (!player) return null;
                    return (
                      <div key={`lineup-reserve-${id}`} className="flex items-center justify-between rounded border bg-background px-2 py-1 text-xs">
                        <span className="truncate">{player.jerseyNumber ? `${player.jerseyNumber} - ` : ""}{player.firstName} {player.lastName}</span>
                        {!lineupReadOnly && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setLineupDialog((prev) => prev ? { ...prev, lineupPlayerIds: prev.lineupPlayerIds.filter((pid) => pid !== id) } : prev)}
                          >
                            Rimuovi
                          </button>
                        )}
                      </div>
                    );
                  }) : (
                    <p className="text-xs text-muted-foreground">Nessuna riserva selezionata.</p>
                  )}
                </div>
              </div>
              {!lineupReadOnly && (
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-semibold">Aggiungi convocato</p>
                  <div className="mt-2 max-h-56 space-y-1 overflow-auto">
                    {lineupAvailablePlayers.filter((p) => !lineupSelected.has(p.id)).map((player) => (
                      <button
                        key={`lineup-add-${player.id}`}
                        type="button"
                        className="flex w-full items-center justify-between rounded border bg-background px-2 py-1 text-left text-xs hover:bg-muted"
                        onClick={() => setLineupDialog((prev) => prev ? { ...prev, lineupPlayerIds: [...prev.lineupPlayerIds, player.id] } : prev)}
                      >
                        <span>{player.jerseyNumber ? `${player.jerseyNumber} - ` : ""}{player.firstName} {player.lastName}</span>
                        <span className="text-muted-foreground">aggiungi</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {lineupPeriod.boardUrl && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={lineupPeriod.boardUrl}>Apri lavagna tattica completa</a>
                </Button>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setLineupDialog(null)}>
            Chiudi
          </Button>
          {!lineupReadOnly && (
            <Button type="button" onClick={saveLineupDialog}>
              Salva schieramento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={!!previewBoard} onOpenChange={(open) => !open && setPreviewBoard(null)}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{previewBoard?.boardTitle ?? "Lavagna partita"}</DialogTitle>
          <DialogDescription>Anteprima collegata a {previewBoard?.label ?? "tempo partita"}.</DialogDescription>
        </DialogHeader>
        {previewBoard?.boardUrl && (
          <iframe
            title={previewBoard.boardTitle ?? "Anteprima lavagna"}
            src={previewBoard.boardUrl}
            className="h-[72vh] w-full border-0"
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

interface TeamCalendarProps { overrideTeamId?: number; }

export default function TeamCalendar({ overrideTeamId }: TeamCalendarProps = {}) {
  const [, params] = useRoute("/calendari/:teamId");
  const { role, user, section } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: myClub } = useGetMyClub();
  const clubLabel = myClub?.name?.trim() || CLUB_NAME;
  const importFileRef = useRef<HTMLInputElement>(null);
  const importPdfFileRef = useRef<HTMLInputElement>(null);
  const importTournamentImageRef = useRef<HTMLInputElement>(null);
  const importTournamentProgramRef = useRef<HTMLInputElement>(null);
  const importTournamentProgramCloneRef = useRef<HTMLInputElement>(null);
  /** Evita di azzerare il file PDF quando si passa dal filtro al dialog scelta sezione. */
  const pdfKeepPendingWhilePickerRef = useRef(false);
  const pdfImportModeRef = useRef<"federation" | "tournament">("federation");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<MatchImportRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<boolean[]>([]);
  const [previewSource, setPreviewSource] = useState<"excel" | "pdf" | "immagine" | "programma">("excel");
  const [previewBulkDate, setPreviewBulkDate] = useState("");
  const [pdfFilterOpen, setPdfFilterOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [pdfCategoryFilter, setPdfCategoryFilter] = useState("");
  const [pdfClubFilter, setPdfClubFilter] = useState("");
  const [pdfDiscovering, setPdfDiscovering] = useState(false);
  const [pdfSectionPickerOpen, setPdfSectionPickerOpen] = useState(false);
  const [pdfSectionCandidates, setPdfSectionCandidates] = useState<string[]>([]);
  const [pdfSectionChoice, setPdfSectionChoice] = useState("");
  const [pdfImportReferenceDate, setPdfImportReferenceDate] = useState("");
  const [pdfOcrStatus, setPdfOcrStatus] = useState<string | null>(null);
  const [imageOcrStatus, setImageOcrStatus] = useState<string | null>(null);
  const openMatchIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("openMatchId"));
    return Number.isFinite(id) && id > 0 ? id : null;
  }, []);
  const initialPhaseTab = useMemo(() => {
    const phase = new URLSearchParams(window.location.search).get("phase");
    return phase === "autunnale" || phase === "primaverile" || phase === "tornei" || phase === "amichevoli"
      ? phase
      : "autunnale";
  }, []);
  const [phaseTab, setPhaseTab] = useState(initialPhaseTab);
  const [duplicateImportOpen, setDuplicateImportOpen] = useState(false);
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<null | {
    originalCompetition: string;
    name: string;
    location: string;
    startDate: string;
    endDate: string;
    overnight: boolean;
    overnightFrom: string;
    overnightTo: string;
    overnightNotes: string;
    /** YYYY-MM-DD per import PDF torneo senza date nel testo. */
    pdfReferenceDate: string;
    groups: ManualTournamentForm["groups"];
    matches: ManualTournamentForm["matches"];
    finals: ManualTournamentForm["finals"];
  }>(null);
  const [pendingImportRows, setPendingImportRows] = useState<MatchImportRow[] | null>(null);
  const [pendingImportConflictIds, setPendingImportConflictIds] = useState<number[]>([]);
  const [duplicateImportExamples, setDuplicateImportExamples] = useState<string[]>([]);
  const [matchSearchText, setMatchSearchText] = useState("");
  const [matchTournamentFilter, setMatchTournamentFilter] = useState("");
  const [pdfImportMode, setPdfImportMode] = useState<"federation" | "tournament">("federation");
  const [tournamentProgramSelection, setTournamentProgramSelection] = useState<Record<string, string>>({});
  const [pendingTournamentProgram, setPendingTournamentProgram] = useState<TournamentProgramEntry[]>([]);
  const [pendingTournamentScores, setPendingTournamentScores] = useState<Record<string, TournamentProgramScore>>({});
  const [tournamentProgramVersion, setTournamentProgramVersion] = useState(0);
  const [tournamentScoreVersion, setTournamentScoreVersion] = useState(0);
  const [matchVenueFilter, setMatchVenueFilter] = useState<MatchVenueFilter>("all");
  const [matchSquadFilter, setMatchSquadFilter] = useState<SquadLetterFilter>("all");
  const [matchFiltersOpen, setMatchFiltersOpen] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilterOpts>(() => ({
    ...EMPTY_SCHEDULE_FILTER,
  }));
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<null | { ids: number[]; kind: "selection" | "duplicates" }>(
    null,
  );
  const [newMatchForm, setNewMatchForm] = useState({
    opponent: "",
    date: "",
    time: "",
    homeAway: "home" as "home" | "away",
    competition: "",
    location: "",
  });
  const [manualTournamentForm, setManualTournamentForm] = useState<ManualTournamentForm>(() => defaultManualTournamentForm());

  const teamId = overrideTeamId ?? (params?.teamId ? parseInt(params.teamId) : null);
  const isStandalone = !overrideTeamId;

  const canImportExport = ["admin", "director", "secretary", "presidente"].includes(role ?? "");
  const canManageTournament = role === "secretary";

  // Segreteria, Direttore Sportivo, Amministratore → gestione logistica partita
  const canEditSchedule  = ["secretary", "director", "admin"].includes(role ?? "");
  // stessa categoria: note pre-partita (indicazioni operative/logistiche)
  const canEditPreNotes  = ["secretary", "director", "admin"].includes(role ?? "");
  // Post-partita: menu completo note/allegati disponibile anche in segreteria.
  const canEditPostNotes = [
    "secretary",
    "director",
    "admin",
    "coach",
    "fitness_coach",
    "athletic_director",
    "technical_director",
  ].includes(role ?? "");

  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", teamId],
    queryFn: () => apiFetch(`/api/matches${teamId ? `?teamId=${teamId}` : ""}`),
    enabled: !!teamId,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    queryFn: () => apiFetch("/api/teams"),
  });

  const team = teams.find(t => t.id === teamId);

  const { data: teamPlayers = [] } = useQuery<Player[]>({
    queryKey: ["/api/players", teamId],
    queryFn: () => apiFetch(`/api/players?teamId=${teamId}`),
    enabled: !!teamId,
  });
  const isAssignedStaffForTeam = !!team && !!user?.id && Array.isArray(team.assignedStaff)
    && team.assignedStaff.some((s) => s.userId === user.id);
  const canEditTournamentScores =
    canImportExport ||
    role === "technical_director" ||
    (["coach", "fitness_coach", "athletic_director"].includes(role ?? "") && isAssignedStaffForTeam);
  const canManageMatchPlan = ["coach", "fitness_coach", "athletic_director"].includes(role ?? "") && isAssignedStaffForTeam;
  const canViewMatchPlan = canManageMatchPlan || role === "technical_director";
  const currentSection: MatchSection = (section === "prima_squadra" || section === "settore_giovanile" || section === "scuola_calcio")
    ? section
    : "scuola_calcio";

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await parseMatchCalendarExcelFile(file);
      const recognized: MatchImportRow[] = [];
      for (const row of rows) {
        const m = mapExcelRowToMatch(row);
        if (m) recognized.push(m);
      }
      return { recognized, total: rows.length };
    },
    onSuccess: ({ recognized, total }) => {
      if (recognized.length === 0) {
        toast({
          title: "Nessuna partita riconosciuta",
          description: `Righe analizzate: ${total}. Prova con un file più pulito o usa il modello.`,
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("excel");
      setPreviewRows(recognized);
      setSelectedRows(recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi file", variant: "destructive" }),
  });

  const importPdfMutation = useMutation({
    mutationFn: async (input: {
      file: File;
      searchTerms: string[];
      clubHint: string;
      sectionTitleHints: string[];
      societyHint: string;
      pdfMode: "federation" | "tournament";
      /** ISO: solo import torneo, se impostata in dialog o in Modifica torneo. */
      fallbackDateIso?: string;
    }) => {
      if (!team) throw new Error("Squadra non valida");
      setPdfOcrStatus(null);
      const parsed = await parseMatchCalendarPdfFile(input.file, {
        teamName: team.name,
        clubName: input.clubHint.trim() || clubLabel,
        searchTerms: input.searchTerms,
        sectionTitleHints: input.sectionTitleHints,
        societyHint: input.societyHint,
        documentMode: input.pdfMode,
        fallbackDateIso: input.fallbackDateIso,
        ocrProgress: (event) => {
          console.info("[pdf-ocr]", event);
          switch (event.phase) {
            case "loading":
              setPdfOcrStatus("Preparazione OCR in corso…");
              break;
            case "processing":
              setPdfOcrStatus(
                `Lettura OCR pagina ${event.page}/${event.totalPages}…`,
              );
              break;
            case "done":
              setPdfOcrStatus(
                event.addedDateLines > 0
                  ? `OCR completato: ${event.addedDateLines} righe data aggiunte.`
                  : "OCR completato: nessuna data aggiuntiva trovata.",
              );
              break;
            case "skipped":
              setPdfOcrStatus(`OCR non eseguito: ${event.reason}`);
              break;
            case "error":
              setPdfOcrStatus(`OCR non disponibile: ${event.reason}`);
              break;
          }
        },
      });
      return parsed;
    },
    onSuccess: (parsed) => {
      setPendingTournamentProgram(parsed.tournamentProgram ?? []);
      setPendingTournamentScores(parsed.tournamentScores ?? {});
      if (parsed.recognized.length === 0) {
        toast({
          title: "Nessuna partita riconosciuta nel PDF",
          description: `Righe con data analizzate: ${parsed.totalDateLines}.`,
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("pdf");
      setPreviewRows(parsed.recognized);
      setSelectedRows(parsed.recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi PDF", variant: "destructive" }),
    onSettled: () => {
      setPendingPdfFile(null);
      setPdfSectionPickerOpen(false);
      setPdfSectionCandidates([]);
      setPdfSectionChoice("");
      setPdfOcrStatus(null);
    },
  });

  const importTournamentImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!team) throw new Error("Squadra non valida");
      setImageOcrStatus("Lettura OCR immagine in corso...");
      toast({
        title: "Analisi immagine torneo",
        description: "Lettura OCR in corso...",
      });
      return parseTournamentImageFile(file, {
        teamName: team.name,
        clubName: clubLabel,
        societyHint: clubLabel,
        documentMode: "tournament",
      });
    },
    onSuccess: (parsed) => {
      setPendingTournamentProgram(parsed.tournamentProgram ?? []);
      setPendingTournamentScores(parsed.tournamentScores ?? {});
      if (parsed.recognized.length === 0) {
        toast({
          title: "Nessuna partita riconosciuta nell'immagine",
          description: `Righe con orario analizzate: ${parsed.totalDateLines}.`,
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("immagine");
      setPreviewRows(parsed.recognized);
      setPreviewBulkDate("");
      setSelectedRows(parsed.recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => toast({ title: e.message || "Errore analisi immagine", variant: "destructive" }),
    onSettled: () => setImageOcrStatus(null),
  });

  async function parseTournamentProgramFileWithTwinEngines(file: File, title = "Analisi programma torneo") {
      if (!team) throw new Error("Squadra non valida");
      pdfImportModeRef.current = "tournament";
      setPdfImportMode("tournament");
      setPdfOcrStatus(null);
      setImageOcrStatus(null);

      const isImage =
        file.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);

      if (isImage) {
        setImageOcrStatus("Lettura programma torneo da immagine in corso...");
        toast({
          title,
          description: "Lettura dell'immagine in corso...",
        });
        const parsed = await parseTournamentImageFile(file, {
          teamName: team.name,
          clubName: clubLabel,
          societyHint: clubLabel,
          documentMode: "tournament",
          unifiedTournamentProgram: true,
        });
        const fallbackProgram = maybeBuildKnownEsordientiProgram(file.name, parsed);
        return fallbackProgram.length > 0 ? { ...parsed, tournamentProgram: fallbackProgram } : parsed;
      }

      setPdfOcrStatus("Lettura programma torneo da PDF in corso...");
      toast({
        title,
        description: "Lettura del PDF in corso...",
      });
      const searchTerms = buildPdfImportSearchTerms({
        categoryLine: team.name,
        clubLine: clubLabel,
        teamName: team.name,
        clubName: clubLabel,
      });
      return parseMatchCalendarPdfFile(file, {
        teamName: team.name,
        clubName: clubLabel,
        searchTerms,
        sectionTitleHints: [],
        societyHint: clubLabel,
        documentMode: "tournament",
        unifiedTournamentProgram: true,
        ocrProgress: (event) => {
          console.info("[pdf-ocr]", event);
          switch (event.phase) {
            case "loading":
              setPdfOcrStatus("Preparazione OCR in corso...");
              break;
            case "processing":
              setPdfOcrStatus(`Lettura OCR pagina ${event.page}/${event.totalPages}...`);
              break;
            case "done":
              setPdfOcrStatus(
                event.addedDateLines > 0
                  ? `OCR completato: ${event.addedDateLines} righe data aggiunte.`
                  : "OCR completato: nessuna data aggiuntiva trovata.",
              );
              break;
            case "skipped":
              setPdfOcrStatus(`OCR non eseguito: ${event.reason}`);
              break;
            case "error":
              setPdfOcrStatus(`OCR non disponibile: ${event.reason}`);
              break;
          }
        },
      });
  }

  async function parseTournamentProgramCloneFileWithTwinEngines(
    file: File,
    title = "Analisi programma torneo clone",
  ) {
      if (!team) throw new Error("Squadra non valida");
      console.log("[CLONE-RUNTIME-CHECK] parser clone called", {
        parserVariant: "clone",
        fileName: file.name,
      });
      pdfImportModeRef.current = "tournament";
      setPdfImportMode("tournament");
      setPdfOcrStatus(null);
      setImageOcrStatus(null);

      const isImage =
        file.type.startsWith("image/") ||
        /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);

      if (isImage) {
        setImageOcrStatus("Lettura programma torneo clone da immagine in corso...");
        toast({
          title,
          description: "Lettura dell'immagine clone in corso...",
        });
        const parsed = await parseTournamentImageFileClone(file, {
          teamName: team.name,
          clubName: clubLabel,
          societyHint: clubLabel,
          documentMode: "tournament",
          unifiedTournamentProgram: true,
        });
        console.log("[CLONE-RUNTIME-CHECK] final importable rows", parsed.recognized.length);
        if (parsed.parserDebug) console.info("[tournament-clone-parser]", parsed.parserDebug);
        const fallbackProgram = maybeBuildKnownEsordientiProgram(file.name, parsed);
        return fallbackProgram.length > 0 ? { ...parsed, tournamentProgram: fallbackProgram } : parsed;
      }

      setPdfOcrStatus("Lettura programma torneo clone da PDF in corso...");
      toast({
        title,
        description: "Lettura del PDF clone in corso...",
      });
      const searchTerms = buildPdfImportSearchTerms({
        categoryLine: team.name,
        clubLine: clubLabel,
        teamName: team.name,
        clubName: clubLabel,
      });
      const parsed = await parseMatchCalendarPdfFileClone(file, {
        teamName: team.name,
        clubName: clubLabel,
        searchTerms,
        sectionTitleHints: [],
        societyHint: clubLabel,
        documentMode: "tournament",
        unifiedTournamentProgram: true,
        ocrProgress: (event) => {
          console.info("[pdf-ocr-clone]", event);
          switch (event.phase) {
            case "loading":
              setPdfOcrStatus("Preparazione OCR clone in corso...");
              break;
            case "processing":
              setPdfOcrStatus(`Lettura OCR clone pagina ${event.page}/${event.totalPages}...`);
              break;
            case "done":
              setPdfOcrStatus(
                event.addedDateLines > 0
                  ? `OCR clone completato: ${event.addedDateLines} righe data aggiunte.`
                  : "OCR clone completato: nessuna data aggiuntiva trovata.",
              );
              break;
            case "skipped":
              setPdfOcrStatus(`OCR clone non eseguito: ${event.reason}`);
              break;
            case "error":
              setPdfOcrStatus(`OCR clone non disponibile: ${event.reason}`);
              break;
          }
        },
      });
      console.log("[CLONE-RUNTIME-CHECK] final importable rows", parsed.recognized.length);
      if (parsed.parserDebug) console.info("[tournament-clone-parser]", parsed.parserDebug);
      return parsed;
  }

  const importTournamentProgramMutation = useMutation({
    mutationFn: async (file: File) => {
      return parseTournamentProgramFileWithTwinEngines(file);
    },
    onSuccess: (parsed) => {
      setPendingTournamentProgram(parsed.tournamentProgram ?? []);
      setPendingTournamentScores(parsed.tournamentScores ?? {});
      if (parsed.recognized.length === 0) {
        toast({
          title: "Programma torneo non importabile automaticamente",
          description:
            (parsed.tournamentProgram?.length ?? 0) > 0
              ? "Il programma e' stato letto, ma non sono state trovate partite della societa' da importare."
              : "File non leggibile in modo affidabile: carica il torneo manualmente o prova un file piu' chiaro.",
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("programma");
      setPreviewRows(parsed.recognized);
      setPreviewBulkDate("");
      setSelectedRows(parsed.recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => {
      toast({ title: e.message || "Errore analisi programma torneo", variant: "destructive" });
    },
    onSettled: () => {
      setPdfOcrStatus(null);
      setImageOcrStatus(null);
    },
  });

  const importTournamentProgramCloneMutation = useMutation({
    mutationFn: async (file: File) => {
      return parseTournamentProgramCloneFileWithTwinEngines(file, "Analisi programma torneo clone");
    },
    onSuccess: (parsed) => {
      console.log("[CLONE-RUNTIME-CHECK] final importable rows", parsed.recognized.length);
      setPendingTournamentProgram(parsed.tournamentProgram ?? []);
      setPendingTournamentScores(parsed.tournamentScores ?? {});
      if (parsed.recognized.length === 0) {
        toast({
          title: "Programma torneo clone non importabile automaticamente",
          description:
            (parsed.tournamentProgram?.length ?? 0) > 0
              ? "Il programma e' stato letto dal clone, ma non sono state trovate partite della societa' da importare."
              : "File non leggibile in modo affidabile dal clone: carica il torneo manualmente o prova un file piu' chiaro.",
          variant: "destructive",
        });
        return;
      }
      setPreviewSource("programma");
      setPreviewRows(parsed.recognized);
      setPreviewBulkDate("");
      setSelectedRows(parsed.recognized.map(() => true));
      setPreviewOpen(true);
    },
    onError: (e: Error) => {
      toast({ title: e.message || "Errore analisi programma torneo clone", variant: "destructive" });
    },
    onSettled: () => {
      setPdfOcrStatus(null);
      setImageOcrStatus(null);
    },
  });

  const applyImportMutation = useMutation({
    mutationFn: async (input: { rows: MatchImportRow[]; replaceConflictIds?: number[] }) => {
      if (!teamId) throw new Error("Squadra non valida");
      const { rows, replaceConflictIds } = input;
      if (replaceConflictIds?.length) {
        for (const id of replaceConflictIds) {
          await apiFetch(`/api/matches/${id}`, { method: "DELETE" });
        }
      }
      let ok = 0;
      for (const m of rows) {
        await apiFetch("/api/matches", {
          method: "POST",
          body: JSON.stringify({
            opponent: m.opponent,
            date: m.date,
            teamId,
            homeAway: m.homeAway,
            competition: m.competition ?? undefined,
            location: m.location ?? undefined,
            notes: cleanImageTournamentImportNotes(m.notes) ?? undefined,
          }),
        });
        ok++;
      }
      if (pdfImportModeRef.current === "tournament" && pendingTournamentProgram.length > 0) {
        const competition = rows.find((row) => (row.competition ?? "").trim())?.competition ?? "";
        if (competition.trim()) {
          const program = mergeTournamentProgramDatesFromPreview(pendingTournamentProgram, rows);
          const scores = { ...getTournamentScoresForEdit(competition), ...pendingTournamentScores };
          if (!tournamentDocsLoaded) {
            setTournamentProgram(teamId, competition, program);
            setTournamentScores(teamId, competition, scores);
          }
          await saveTournamentState(
            competition,
            program,
            scores,
            getTournamentPdfReferenceDateForEdit(competition),
          );
          setTournamentProgramVersion((v) => v + 1);
          setTournamentScoreVersion((v) => v + 1);
        }
      }
      return ok;
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      qc.invalidateQueries({ queryKey: ["/api/tournament-documents", teamId] });
      setPreviewOpen(false);
      setDuplicateImportOpen(false);
      setPendingImportRows(null);
      setPendingTournamentProgram([]);
      setPendingTournamentScores({});
      setPendingImportConflictIds([]);
      setDuplicateImportExamples([]);
      toast({
        title: "Import completato",
        description: `${ok} partite importate (${previewSource.toUpperCase()}).`,
      });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore import", variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiFetch(`/api/matches/${id}`, { method: "DELETE" });
      }
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      setSelectedMatchIds(new Set());
      toast({ title: "Eliminazione completata", description: `${n} partite eliminate.` });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore eliminazione", variant: "destructive" }),
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: async (group: TournamentCardGroup) => {
      for (const match of group.matches) {
        await apiFetch(`/api/matches/${match.id}`, { method: "DELETE" });
      }
      await deleteTournamentState(group.competition);
      return { count: group.matches.length, competition: group.competition };
    },
    onSuccess: ({ count, competition }) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      qc.invalidateQueries({ queryKey: ["/api/tournament-documents", teamId] });
      setSelectedMatchIds(new Set());
      toast({ title: "Torneo eliminato", description: `${competition}: ${count} partite/eventi eliminati.` });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore eliminazione torneo", variant: "destructive" }),
  });

  const updateTournamentMutation = useMutation({
    mutationFn: async (input: {
      originalCompetition: string;
      name: string;
      location: string;
      startDate: string;
      endDate: string;
      overnight: boolean;
      overnightFrom: string;
      overnightTo: string;
      overnightNotes: string;
      pdfReferenceDate: string;
      groups: ManualTournamentForm["groups"];
      matches: ManualTournamentForm["matches"];
      finals: ManualTournamentForm["finals"];
    }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Inserisci il nome del torneo");
      if (!input.startDate) throw new Error("Inserisci la data iniziale del torneo");
      const group = tournamentGroups.find((g) => g.competition === input.originalCompetition);
      if (!group) throw new Error("Torneo non trovato");
      if (!teamId) throw new Error("Squadra non valida");
      const groups = manualTournamentGroupsForSave({
        ...defaultManualTournamentForm(),
        groups: input.groups,
      });
      const completedMatches = completeTournamentRoundRobinMatches({
        groups: input.groups,
        matches: input.matches,
        startDate: input.startDate,
      });
      const qualifying = completedMatches
        .map((row, index): TournamentProgramEntry | null => {
          const homeTeam = row.homeTeam.trim();
          const awayTeam = row.awayTeam.trim();
          if (!homeTeam || !awayTeam) return null;
          const date = parseManualTournamentDateTime(row.date, row.time, input.startDate);
          if (!date) return null;
          return {
            id: row.id || `edit-gironi-${Date.now()}-${index}`,
            date,
            homeTeam,
            awayTeam,
            phase: "Gironi",
            group: row.group.trim() || tournamentGroupForTeam(homeTeam, groups) || tournamentGroupForTeam(awayTeam, groups) || "Gironi",
          };
        })
        .filter((entry): entry is TournamentProgramEntry => Boolean(entry));
      const finals = input.finals
        .map((row, index): TournamentProgramEntry | null => {
          const date = parseManualTournamentDateTime(row.date, row.time, input.endDate || input.startDate);
          if (!date) return null;
          return {
            id: row.id || `edit-finali-${Date.now()}-${index}`,
            date,
            homeTeam: row.homeTeam.trim() || row.label.trim() || `Finale ${index + 1}`,
            awayTeam: row.awayTeam.trim() || "da completare",
            phase: "Finali",
            group: row.label.trim() || "Finali",
          };
        })
        .filter((entry): entry is TournamentProgramEntry => Boolean(entry));
      const program = [...qualifying, ...finals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (program.length === 0) throw new Error("Inserisci almeno una partita nel programma torneo");
      const logistics = tournamentLogisticsFromForm({
        ...defaultManualTournamentForm(),
        startDate: input.startDate,
        endDate: input.endDate,
        overnight: input.overnight,
        overnightFrom: input.overnightFrom,
        overnightTo: input.overnightTo,
        overnightNotes: input.overnightNotes,
      });
      const notes = tournamentNotesFromLogistics(logistics);
      const existing = [...group.matches].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      for (let index = 0; index < program.length; index += 1) {
        const entry = program[index];
        const payload = {
          opponent: `${entry.homeTeam} - ${entry.awayTeam}`,
          date: entry.date,
          teamId,
          homeAway: "home",
          competition: name,
          location: input.location.trim() || null,
          notes,
        };
        const current = existing[index];
        if (current) {
          await apiFetch(`/api/matches/${current.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch("/api/matches", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }
      for (const match of existing.slice(program.length)) {
        await apiFetch(`/api/matches/${match.id}`, {
          method: "DELETE",
        });
      }
      if (teamId) {
        const previousScores = getTournamentScoresForEdit(input.originalCompetition);
        if (input.originalCompetition.trim() !== name) {
          if (!tournamentDocsLoaded) setTournamentPdfReferenceDate(teamId, input.originalCompetition, null);
          await deleteTournamentState(input.originalCompetition);
        }
        if (!tournamentDocsLoaded) setTournamentPdfReferenceDate(teamId, name, input.pdfReferenceDate.trim() || null);
        if (!tournamentDocsLoaded) setTournamentProgram(teamId, name, program);
        await saveTournamentState(name, program, previousScores, input.pdfReferenceDate.trim() || null);
      }
      return program.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      setEditingTournament(null);
      toast({ title: "Torneo aggiornato", description: `${n} partite/eventi aggiornati.` });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore aggiornamento torneo", variant: "destructive" }),
  });

  function updateTournamentProgramScore(competition: string, entryId: string, score: TournamentProgramScore) {
    if (!teamId) return;
    const next = {
      ...getTournamentScoresForEdit(competition),
      [entryId]: score,
    };
    if (score.homeScore == null || score.awayScore == null) {
      delete next[entryId];
    }
    if (!tournamentDocsLoaded) setTournamentScores(teamId, competition, next);
    void saveTournamentState(
      competition,
      getTournamentProgramForEdit(competition),
      next,
      getTournamentPdfReferenceDateForEdit(competition),
    );
    setTournamentScoreVersion((v) => v + 1);
  }

  function updateTournamentProgramEntry(competition: string, entryId: string, patch: Partial<TournamentProgramEntry>) {
    if (!teamId) return;
    const current = getTournamentProgramForEdit(competition);
    const next = current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
    if (!tournamentDocsLoaded) setTournamentProgram(teamId, competition, next);
    void saveTournamentState(
      competition,
      next,
      getTournamentScoresForEdit(competition),
      getTournamentPdfReferenceDateForEdit(competition),
    );
    setTournamentProgramVersion((v) => v + 1);
  }

  function updateTournamentProgramGroups(competition: string, program: TournamentProgramEntry[]) {
    if (!teamId) return;
    if (!tournamentDocsLoaded) setTournamentProgram(teamId, competition, program);
    void saveTournamentState(
      competition,
      program,
      getTournamentScoresForEdit(competition),
      getTournamentPdfReferenceDateForEdit(competition),
    );
    setTournamentProgramVersion((v) => v + 1);
  }

  function updateTournamentPointsRule(competition: string, rule: TournamentPointsRule) {
    if (!teamId) return;
    if (!tournamentDocsLoaded) setTournamentPointsRule(teamId, competition, rule);
    void saveTournamentState(
      competition,
      getTournamentProgramForEdit(competition),
      getTournamentScoresForEdit(competition),
      getTournamentPdfReferenceDateForEdit(competition),
      rule,
    );
    qc.setQueryData<{ documents: TournamentDocumentApi[]; states?: TournamentStateApi[] }>(
      ["/api/tournament-documents", teamId],
      (current) => {
        const normalizedCompetition = normalizeTournamentKeyPart(competition);
        const documents = current?.documents ?? [];
        const states = current?.states ?? [];
        const existing = states.find((state) => state.normalizedCompetition === normalizedCompetition);
        if (!existing) return current;
        return {
          documents,
          states: states.map((state) =>
            state.normalizedCompetition === normalizedCompetition ? { ...state, pointsRule: rule } : state,
          ),
        };
      },
    );
  }

  function updateTournamentFinalsRule(competition: string, rule: TournamentFinalsRule) {
    if (!teamId) return;
    void saveTournamentState(
      competition,
      getTournamentProgramForEdit(competition),
      getTournamentScoresForEdit(competition),
      getTournamentPdfReferenceDateForEdit(competition),
      getTournamentPointsRuleForEdit(competition),
      rule,
    );
    qc.setQueryData<{ documents: TournamentDocumentApi[]; states?: TournamentStateApi[] }>(
      ["/api/tournament-documents", teamId],
      (current) => {
        const normalizedCompetition = normalizeTournamentKeyPart(competition);
        const documents = current?.documents ?? [];
        const states = current?.states ?? [];
        const existing = states.find((state) => state.normalizedCompetition === normalizedCompetition);
        if (!existing) return current;
        return {
          documents,
          states: states.map((state) =>
            state.normalizedCompetition === normalizedCompetition ? { ...state, finalsRule: rule } : state,
          ),
        };
      },
    );
  }

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("Squadra non valida");
      if (!newMatchForm.opponent.trim()) throw new Error("Inserisci l'avversario");
      if (!newMatchForm.date) throw new Error("Inserisci la data");
      const normalizedTime = normalizeTime24(newMatchForm.time);
      if (!normalizedTime) throw new Error("Inserisci orario in formato 24h HH:mm");
      const matchIso = combineDateAndTimeToIso(newMatchForm.date, normalizedTime);
      if (!matchIso) throw new Error("Data o orario non validi");
      return apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({
          opponent: newMatchForm.opponent.trim(),
          date: matchIso,
          teamId,
          homeAway: newMatchForm.homeAway,
          competition: newMatchForm.competition.trim() || null,
          location: newMatchForm.location.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      setCreateMatchOpen(false);
      setNewMatchForm({
        opponent: "",
        date: "",
        time: "",
        homeAway: "home",
        competition: "",
        location: "",
      });
      toast({ title: "Partita creata" });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore creazione partita", variant: "destructive" }),
  });

  const createTournamentMutation = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("Squadra non valida");
      const name = manualTournamentForm.name.trim();
      if (!name) throw new Error("Inserisci il nome del torneo");
      if (!manualTournamentForm.startDate) throw new Error("Inserisci la data iniziale del torneo");
      const groups = manualTournamentGroupsForSave(manualTournamentForm);
      if (groups.length === 0) throw new Error("Inserisci almeno un girone o un elenco squadre");
      const completedMatches = completeTournamentRoundRobinMatches(manualTournamentForm);
      const qualifying = completedMatches
        .map((row, index): TournamentProgramEntry | null => {
          const homeTeam = row.homeTeam.trim();
          const awayTeam = row.awayTeam.trim();
          if (!homeTeam || !awayTeam) return null;
          const date = parseManualTournamentDateTime(row.date, row.time, manualTournamentForm.startDate);
          if (!date) return null;
          return {
            id: `manual-gironi-${Date.now()}-${index}`,
            date,
            homeTeam,
            awayTeam,
            phase: "Gironi",
            group: row.group.trim() || tournamentGroupForTeam(homeTeam, groups) || tournamentGroupForTeam(awayTeam, groups) || "Gironi",
          };
        })
        .filter((entry): entry is TournamentProgramEntry => Boolean(entry));
      const finals = manualTournamentForm.finals
        .map((row, index): TournamentProgramEntry | null => {
          const date = parseManualTournamentDateTime(row.date, row.time, manualTournamentForm.endDate || manualTournamentForm.startDate);
          if (!date) return null;
          const label = row.label.trim() || `Finale ${index + 1}`;
          const homeTeam = row.homeTeam.trim() || label;
          const awayTeam = row.awayTeam.trim() || "da completare";
          return {
            id: `manual-finali-${Date.now()}-${index}`,
            date,
            homeTeam,
            awayTeam,
            phase: "Finali",
            group: "Finali",
          };
        })
        .filter((entry): entry is TournamentProgramEntry => Boolean(entry));
      const program = [...qualifying, ...finals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (program.length === 0) throw new Error("Inserisci almeno una partita nel programma torneo");
      const logistics = tournamentLogisticsFromForm(manualTournamentForm);
      const notes = tournamentNotesFromLogistics(logistics);
      for (const entry of program) {
        await apiFetch("/api/matches", {
          method: "POST",
          body: JSON.stringify({
            opponent: `${entry.homeTeam} - ${entry.awayTeam}`,
            date: entry.date,
            teamId,
            homeAway: "home",
            competition: name,
            location: manualTournamentForm.location.trim() || null,
            notes,
          }),
        });
      }
      if (!tournamentDocsLoaded) setTournamentProgram(teamId, name, program);
      await saveTournamentState(name, program, {}, manualTournamentForm.startDate);
      return program.length;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      qc.invalidateQueries({ queryKey: ["/api/tournament-documents", teamId] });
      setTournamentProgramVersion((v) => v + 1);
      setCreateTournamentOpen(false);
      setManualTournamentForm(defaultManualTournamentForm());
      toast({ title: "Torneo creato", description: `${count} partite/eventi inseriti nel programma.` });
    },
    onError: (e: Error) => toast({ title: e.message || "Errore creazione torneo", variant: "destructive" }),
  });

  const sorted = useMemo(
    () => [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [matches],
  );
  useEffect(() => {
    if (!openMatchIdFromQuery) return;
    const targetMatch = sorted.find((m) => m.id === openMatchIdFromQuery);
    if (!targetMatch) return;
    setPhaseTab(matchPhase(targetMatch));
    setMatchSearchText("");
    setMatchTournamentFilter("");
    setMatchVenueFilter("all");
    setMatchSquadFilter("all");
    setScheduleFilter({ ...EMPTY_SCHEDULE_FILTER });
  }, [openMatchIdFromQuery, sorted]);

  const autunnale = useMemo(() => sorted.filter((m) => matchPhase(m) === "autunnale"), [sorted]);
  const primaverile = useMemo(() => sorted.filter((m) => matchPhase(m) === "primaverile"), [sorted]);
  const tornei = useMemo(() => sorted.filter((m) => matchPhase(m) === "tornei"), [sorted]);
  const amichevoli = useMemo(() => sorted.filter((m) => matchPhase(m) === "amichevoli"), [sorted]);

  const torneoGroupCount = useMemo(() => {
    const keys = new Set<string>();
    for (const m of tornei) {
      keys.add(((m.competition ?? "").trim() || "Senza competizione"));
    }
    return keys.size;
  }, [tornei]);

  const listFilterOpts = useMemo(
    () => ({
      search: matchSearchText,
      tournament: matchTournamentFilter,
      venue: matchVenueFilter,
      squad: matchSquadFilter,
      schedule: scheduleFilter,
    }),
    [matchSearchText, matchTournamentFilter, matchVenueFilter, matchSquadFilter, scheduleFilter],
  );

  const autunnaleFiltered = useMemo(
    () => autunnale.filter((m) => matchPassesListFilters(m, team?.name, listFilterOpts)),
    [autunnale, team?.name, listFilterOpts],
  );
  const primaverileFiltered = useMemo(
    () => primaverile.filter((m) => matchPassesListFilters(m, team?.name, listFilterOpts)),
    [primaverile, team?.name, listFilterOpts],
  );
  const torneiFiltered = useMemo(
    () => tornei.filter((m) => matchPassesListFilters(m, team?.name, listFilterOpts)),
    [tornei, team?.name, listFilterOpts],
  );
  const amichevoliFiltered = useMemo(
    () => amichevoli.filter((m) => matchPassesListFilters(m, team?.name, listFilterOpts)),
    [amichevoli, team?.name, listFilterOpts],
  );

  const tournamentGroups = useMemo(() => {
    if (phaseTab !== "tornei") return [];
    return groupTorneoMatchesByCompetition(torneiFiltered);
  }, [phaseTab, torneiFiltered]);

  type TournamentDocumentApi = {
    id: number;
    teamId: number;
    competition: string;
    normalizedCompetition: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    dataUrl: string;
    createdAt: string;
  };
  type TournamentStateApi = {
    id: number;
    teamId: number;
    competition: string;
    normalizedCompetition: string;
    program: TournamentProgramEntry[];
    scores: Record<string, TournamentProgramScore>;
    pointsRule: TournamentPointsRule;
    finalsRule: TournamentFinalsRule;
    pdfReferenceDate?: string | null;
    updatedAt: string;
  };

  const { data: tournamentDocsResponse } = useQuery<{ documents: TournamentDocumentApi[]; states?: TournamentStateApi[] }>({
    queryKey: ["/api/tournament-documents", teamId],
    queryFn: () => apiFetch(`/api/tournament-documents?teamId=${teamId}`),
    enabled: !!teamId && phaseTab === "tornei",
  });
  const tournamentDocsLoaded = Boolean(tournamentDocsResponse);

  const tournamentStateByCompetition = useMemo(() => {
    const map = new Map<string, TournamentStateApi>();
    (tournamentDocsResponse?.states ?? []).forEach((state) => {
      map.set(state.normalizedCompetition, state);
    });
    return map;
  }, [tournamentDocsResponse?.states]);

  function getTournamentState(competition: string): TournamentStateApi | undefined {
    return tournamentStateByCompetition.get(normalizeTournamentKeyPart(competition));
  }

  function getTournamentProgramForEdit(competition: string): TournamentProgramEntry[] {
    if (!teamId) return [];
    return getTournamentState(competition)?.program ?? (!tournamentDocsLoaded ? getTournamentProgram(teamId, competition) : []);
  }

  function getTournamentScoresForEdit(competition: string): Record<string, TournamentProgramScore> {
    if (!teamId) return {};
    return getTournamentState(competition)?.scores ?? (!tournamentDocsLoaded ? getTournamentScores(teamId, competition) : {});
  }

  function getTournamentPdfReferenceDateForEdit(competition: string): string | null {
    if (!teamId) return null;
    return getTournamentState(competition)?.pdfReferenceDate ?? (!tournamentDocsLoaded ? getTournamentPdfReferenceDate(teamId, competition) : null);
  }

  function getTournamentPointsRuleForEdit(competition: string): TournamentPointsRule {
    if (!teamId) return { win: 3, draw: 1, loss: 0 };
    return getTournamentState(competition)?.pointsRule ?? (!tournamentDocsLoaded ? getTournamentPointsRule(teamId, competition) : { win: 3, draw: 1, loss: 0 });
  }

  function getTournamentFinalsRuleForEdit(competition: string): TournamentFinalsRule {
    return getTournamentState(competition)?.finalsRule ?? "cross12";
  }

  function applyTournamentStateToCache(state: TournamentStateApi) {
    qc.setQueryData<{ documents: TournamentDocumentApi[]; states?: TournamentStateApi[] }>(
      ["/api/tournament-documents", teamId],
      (current) => {
        const documents = current?.documents ?? [];
        const states = current?.states ?? [];
        const nextStates = states.filter((item) => item.normalizedCompetition !== state.normalizedCompetition);
        nextStates.push(state);
        return { documents, states: nextStates };
      },
    );
  }

  function removeTournamentStateFromCache(competition: string) {
    const normalizedCompetition = normalizeTournamentKeyPart(competition);
    qc.setQueryData<{ documents: TournamentDocumentApi[]; states?: TournamentStateApi[] }>(
      ["/api/tournament-documents", teamId],
      (current) => ({
        documents: (current?.documents ?? []).filter((item) => item.normalizedCompetition !== normalizedCompetition),
        states: (current?.states ?? []).filter((item) => item.normalizedCompetition !== normalizedCompetition),
      }),
    );
  }

  async function saveTournamentState(
    competition: string,
    program: TournamentProgramEntry[],
    scores: Record<string, TournamentProgramScore>,
    pdfReferenceDate: string | null,
    pointsRule: TournamentPointsRule = getTournamentPointsRuleForEdit(competition),
    finalsRule: TournamentFinalsRule = getTournamentFinalsRuleForEdit(competition),
  ) {
    if (!teamId) return;
    const state = await apiFetch("/api/tournament-documents/state", {
      method: "PUT",
      body: JSON.stringify({ teamId, competition, program, scores, pointsRule, finalsRule, pdfReferenceDate }),
    }) as TournamentStateApi;
    applyTournamentStateToCache(state);
    return state;
  }

  async function deleteTournamentState(competition: string) {
    if (!teamId) return;
    await apiFetch(
      `/api/tournament-documents/state?teamId=${teamId}&competition=${encodeURIComponent(competition)}`,
      { method: "DELETE" },
    );
    removeTournamentStateFromCache(competition);
  }

  function apiDocToStored(d: TournamentDocumentApi): StoredTournamentAttachment {
    return {
      id: String(d.id),
      name: d.fileName,
      type: d.fileType,
      size: d.fileSize,
      uploadedAt: d.createdAt,
      dataUrl: d.dataUrl,
    };
  }

  const tournamentAttachmentsByCompetition = useMemo(() => {
    const docs = tournamentDocsResponse?.documents ?? [];
    const map: Record<string, StoredTournamentAttachment[]> = {};
    for (const g of tournamentGroups) {
      const c = g.competition;
      const norm = normalizeTournamentKeyPart(c);
      map[c] = docs
        .filter((d) => d.normalizedCompetition === norm)
        .map(apiDocToStored)
        .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
    }
    return map;
  }, [tournamentDocsResponse?.documents, tournamentGroups]);

  const tournamentProgramsByCompetition = useMemo(() => {
    if (!teamId) return {};
    const map: Record<string, TournamentProgramEntry[]> = {};
    for (const g of tournamentGroups) {
      map[g.competition] = getTournamentProgramForEdit(g.competition);
    }
    return map;
  }, [teamId, tournamentGroups, tournamentProgramVersion, tournamentStateByCompetition, tournamentDocsLoaded]);

  const tournamentScoresByCompetition = useMemo(() => {
    if (!teamId) return {};
    const map: Record<string, Record<string, TournamentProgramScore>> = {};
    for (const g of tournamentGroups) {
      map[g.competition] = getTournamentScoresForEdit(g.competition);
    }
    return map;
  }, [teamId, tournamentGroups, tournamentScoreVersion, tournamentStateByCompetition, tournamentDocsLoaded]);

  const tournamentPointsRulesByCompetition = useMemo(() => {
    if (!teamId) return {};
    const map: Record<string, TournamentPointsRule> = {};
    for (const g of tournamentGroups) {
      map[g.competition] = getTournamentPointsRuleForEdit(g.competition);
    }
    return map;
  }, [teamId, tournamentGroups, tournamentStateByCompetition, tournamentDocsLoaded]);

  const tournamentFinalsRulesByCompetition = useMemo(() => {
    if (!teamId) return {};
    const map: Record<string, TournamentFinalsRule> = {};
    for (const g of tournamentGroups) {
      map[g.competition] = getTournamentFinalsRuleForEdit(g.competition);
    }
    return map;
  }, [teamId, tournamentGroups, tournamentStateByCompetition]);

  const matchFiltersActive =
    matchSearchText.trim() !== "" ||
    matchTournamentFilter.trim() !== "" ||
    matchVenueFilter !== "all" ||
    matchSquadFilter !== "all" ||
    scheduleTimeFilterActive(scheduleFilter);

  useEffect(() => {
    if (matchFiltersActive) setMatchFiltersOpen(true);
  }, [matchFiltersActive]);

  const importActionsBusy =
    importMutation.isPending ||
    importPdfMutation.isPending ||
    importTournamentImageMutation.isPending ||
    importTournamentProgramMutation.isPending ||
    importTournamentProgramCloneMutation.isPending ||
    applyImportMutation.isPending ||
    bulkDeleteMutation.isPending ||
    deleteTournamentMutation.isPending;

  function togglePhaseMatchSelection(id: number) {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function appendLocalTournamentDocument(competition: string, file: File) {
    if (!teamId || !canImportExport) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await apiFetch("/api/tournament-documents", {
        method: "POST",
        body: JSON.stringify({
          teamId,
          competition,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          dataUrl,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["/api/tournament-documents", teamId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Salvataggio documento fallito";
      toast({ title: msg, variant: "destructive" });
    }
  }

  async function renameTournamentDocument(documentId: string, fileName: string) {
    if (!teamId || !canImportExport) return;
    try {
      await apiFetch(`/api/tournament-documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ fileName }),
      });
      await qc.invalidateQueries({ queryKey: ["/api/tournament-documents", teamId] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Rinomina documento fallita";
      toast({ title: msg, variant: "destructive" });
    }
  }

  function openTournamentEdit(group: TournamentCardGroup) {
    const firstLoc = group.matches.map((m) => (m.location ?? "").trim()).find(Boolean) ?? "";
    const firstMatch = group.matches[0];
    const lastMatch = group.matches[group.matches.length - 1];
    const logistics = group.matches.map((m) => decodeTournamentLogistics(m.notes)).find(Boolean) ?? null;
    const pdfRef = getTournamentPdfReferenceDateForEdit(group.competition) ?? "";
    const programRows = tournamentEditRowsFromProgram(
      getTournamentProgramForEdit(group.competition),
      group.matches,
      logistics?.startDate || toDateInputValue(firstMatch?.date),
    );
    setEditingTournament({
      originalCompetition: group.competition,
      name: group.competition,
      location: firstLoc,
      startDate: logistics?.startDate || toDateInputValue(firstMatch?.date),
      endDate: logistics?.endDate || toDateInputValue(lastMatch?.date),
      overnight: logistics?.overnight ?? false,
      overnightFrom: logistics?.departureDate ?? "",
      overnightTo: logistics?.returnDate ?? "",
      overnightNotes: logistics?.notes ?? "",
      pdfReferenceDate: pdfRef,
      groups: programRows.groups,
      matches: programRows.matches,
      finals: programRows.finals,
    });
  }

  function deleteTournament(group: TournamentCardGroup) {
    deleteTournamentMutation.mutate(group);
  }

  const renderPhaseImportToolbar = (phaseItems: Match[]) =>
    canImportExport && team && teamId ? (
      <div className="mb-4 rounded-xl border border-border/70 bg-card p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => downloadMatchCalendarTemplate(team.name)}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Importa modello
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => {
              exportMatchesToExcel(matches, team.name);
              toast({ title: "Export avviato" });
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Esporta
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy}
            onClick={() => importFileRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5" />
            Carica Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy}
            onClick={() => {
              pdfImportModeRef.current = "federation";
              setPdfImportMode("federation");
              importPdfFileRef.current?.click();
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Carica PDF federazione
          </Button>
          {phaseTab === "tornei" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={importActionsBusy}
                onClick={() => {
                  pdfImportModeRef.current = "tournament";
                  setPdfImportMode("tournament");
                  setPdfCategoryFilter(team.name);
                  importPdfFileRef.current?.click();
                }}
              >
                <Trophy className="w-3.5 h-3.5" />
                Carica PDF torneo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={importActionsBusy || importTournamentImageMutation.isPending}
                onClick={() => importTournamentImageRef.current?.click()}
              >
                <Camera className="w-3.5 h-3.5" />
                {importTournamentImageMutation.isPending ? "Analisi immagine..." : "Carica immagine torneo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={importActionsBusy || importTournamentProgramMutation.isPending}
                onClick={() => importTournamentProgramRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                {importTournamentProgramMutation.isPending ? "Analisi programma..." : "Carica programma torneo"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-sky-300 text-sky-700 hover:bg-sky-50"
                disabled={importActionsBusy || importTournamentProgramCloneMutation.isPending}
                onClick={() => {
                  console.log("[CLONE-RUNTIME-CHECK] button clone clicked");
                  importTournamentProgramCloneRef.current?.click();
                }}
                title="Clone di prova del parser torneo: usa gli stessi due motori, separato dal tasto principale."
              >
                <Upload className="w-3.5 h-3.5" />
                {importTournamentProgramCloneMutation.isPending ? "Analisi clone..." : "Carica programma torneo clone"}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={importActionsBusy}
                onClick={() => setCreateTournamentOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Crea torneo
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 text-xs gap-1.5 ml-auto"
            onClick={() => setCreateMatchOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Crea partita
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground mr-2">
            {phaseItems.filter((m) => selectedMatchIds.has(m.id)).length}/{phaseItems.length} in fase
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy || phaseItems.length === 0}
            onClick={() => setSelectedMatchIds(new Set(phaseItems.map((m) => m.id)))}
          >
            <ListChecks className="w-3.5 h-3.5" />
            Seleziona tutto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy || phaseItems.length === 0}
            onClick={() => {
              setSelectedMatchIds((prev) => {
                const next = new Set(prev);
                phaseItems.forEach((m) => next.delete(m.id));
                return next;
              });
            }}
          >
            Deseleziona
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={
              importActionsBusy ||
              phaseItems.filter((m) => selectedMatchIds.has(m.id)).length === 0
            }
            onClick={() => {
              const ids = phaseItems.filter((m) => selectedMatchIds.has(m.id)).map((m) => m.id);
              if (ids.length === 0) return;
              setBulkDeleteConfirm({ ids, kind: "selection" });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Elimina
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy || phaseItems.length === 0}
            onClick={() => {
              const dupIds = getDuplicateMatchIdsToRemove(phaseItems);
              if (dupIds.length === 0) {
                toast({
                  title: "Nessun duplicato",
                  description: "In questa fase non ci sono partite con stessa data, avversario e casa/trasferta.",
                });
                return;
              }
              setSelectedMatchIds(new Set(dupIds));
              toast({
                title: "Duplicati selezionati",
                description: `${dupIds.length} partita/e duplicate evidenziate. Usa «Elimina» per rimuoverle o «Elimina duplicati».`,
              });
            }}
          >
            <Search className="w-3.5 h-3.5" />
            Ricerca duplicati
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={importActionsBusy || phaseItems.length === 0}
            onClick={() => {
              const dupIds = getDuplicateMatchIdsToRemove(phaseItems);
              if (dupIds.length === 0) {
                toast({
                  title: "Nessun duplicato",
                  description: "Non c’è nulla da rimuovere in questa fase.",
                });
                return;
              }
              setBulkDeleteConfirm({ ids: dupIds, kind: "duplicates" });
            }}
          >
            <Files className="w-3.5 h-3.5" />
            Elimina duplicati
          </Button>
        </div>
      </div>
    ) : null;

  const activePhase = useMemo(() => {
    if (phaseTab === "primaverile") return { items: buildMatchTimelineItems(primaverileFiltered), rawCount: primaverile.length };
    if (phaseTab === "tornei") return { items: buildMatchTimelineItems(torneiFiltered), rawCount: tornei.length };
    if (phaseTab === "amichevoli") return { items: buildMatchTimelineItems(amichevoliFiltered), rawCount: amichevoli.length };
    return { items: buildMatchTimelineItems(autunnaleFiltered), rawCount: autunnale.length };
  }, [phaseTab, autunnaleFiltered, primaverileFiltered, torneiFiltered, amichevoliFiltered, autunnale.length, primaverile.length, tornei.length, amichevoli.length]);

  if (!teamId) return <div className="p-6 text-muted-foreground">Squadra non trovata.</div>;

  return (
    <div className="relative min-w-0 w-full overflow-x-clip">
    {(pdfOcrStatus || importPdfMutation.isPending) && (
      <div
        className="fixed bottom-4 right-4 z-[1000] max-w-sm rounded-md border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <p className="text-xs font-medium text-foreground">
          {pdfOcrStatus ?? "Analisi PDF in corso…"}
        </p>
      </div>
    )}
    <div className="w-full max-w-full min-w-0 sm:max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-5 sm:mb-6">
        {isStandalone && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {team?.name ?? `Squadra #${teamId}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Calendario Partite — Stagione 2025/2026</p>
        </div>
      </div>

      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) importMutation.mutate(f);
        }}
      />
      <input
        ref={importPdfFileRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          if (!picked || !team) {
            e.target.value = "";
            return;
          }
          try {
            // Cloniamo subito in memoria: evita errori di permessi del file originale
            // quando l'utente conferma l'import dopo alcuni passaggi UI.
            const raw = await picked.arrayBuffer();
            const safeFile = new File([raw], picked.name, {
              type: picked.type || "application/pdf",
              lastModified: picked.lastModified,
            });
            setPendingPdfFile(safeFile);
            if (pdfImportModeRef.current === "federation") {
              setPdfCategoryFilter(team.name);
            }
            setPdfClubFilter("");
            if (pdfImportModeRef.current === "tournament" && teamId) {
              setPdfImportReferenceDate("");
              const filt = matchTournamentFilter.trim().toLowerCase();
              if (filt) {
                const g = tournamentGroups.find(
                  (x) =>
                    x.competition.toLowerCase().includes(filt) ||
                    filt.includes(x.competition.toLowerCase()),
                );
                if (g) {
                  const stored = getTournamentPdfReferenceDateForEdit(g.competition);
                  if (stored) setPdfImportReferenceDate(stored);
                }
              }
            } else {
              setPdfImportReferenceDate("");
            }
            setPdfFilterOpen(true);
          } catch (err: any) {
            toast({
              title: "Impossibile leggere il PDF selezionato",
              description: err?.message ?? "Controlla che il file sia accessibile e riprova.",
              variant: "destructive",
            });
          } finally {
            e.target.value = "";
          }
        }}
      />
      <input
        ref={importTournamentImageRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/*"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          importTournamentImageMutation.mutate(picked);
        }}
      />
      <input
        ref={importTournamentProgramRef}
        type="file"
        accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/*"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          importTournamentProgramMutation.mutate(picked);
        }}
      />
      <input
        ref={importTournamentProgramCloneRef}
        type="file"
        accept=".pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/*"
        className="hidden"
        onChange={async (e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          console.log("[CLONE-RUNTIME-CHECK] button clone clicked");
          importTournamentProgramCloneMutation.mutate(picked);
        }}
      />
      <div className="mt-5 sm:mt-6 min-w-0">
      {imageOcrStatus && (
        <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          {imageOcrStatus}
        </div>
      )}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : (
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setPhaseTab("autunnale")}
              className={cn(
                "text-left rounded-xl border p-4 transition-all hover:bg-muted/40",
                phaseTab === "autunnale" ? "border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Leaf className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                </div>
                <span className="font-semibold text-sm">Fase autunnale</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{autunnale.length}</p>
              <p className="text-xs text-muted-foreground">partite (ago–gen)</p>
            </button>
            <button
              type="button"
              onClick={() => setPhaseTab("primaverile")}
              className={cn(
                "text-left rounded-xl border p-4 transition-all hover:bg-muted/40",
                phaseTab === "primaverile" ? "border-pink-500/50 bg-pink-500/5 ring-1 ring-pink-500/20" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-lg bg-pink-500/15 flex items-center justify-center">
                  <Flower2 className="w-4 h-4 text-pink-700 dark:text-pink-400" />
                </div>
                <span className="font-semibold text-sm">Fase primaverile</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{primaverile.length}</p>
              <p className="text-xs text-muted-foreground">partite (feb–lug)</p>
            </button>
            <button
              type="button"
              onClick={() => setPhaseTab("tornei")}
              className={cn(
                "text-left rounded-xl border p-4 transition-all hover:bg-muted/40",
                phaseTab === "tornei" ? "border-violet-500/50 bg-violet-500/5 ring-1 ring-violet-500/20" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-violet-700 dark:text-violet-400" />
                </div>
                <span className="font-semibold text-sm">Tornei</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{torneoGroupCount}</p>
              <p className="text-xs text-muted-foreground">tornei registrati</p>
            </button>
            <button
              type="button"
              onClick={() => setPhaseTab("amichevoli")}
              className={cn(
                "text-left rounded-xl border p-4 transition-all hover:bg-muted/40",
                phaseTab === "amichevoli" ? "border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/20" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center">
                  <Handshake className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                </div>
                <span className="font-semibold text-sm">Amichevoli</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{amichevoli.length}</p>
              <p className="text-xs text-muted-foreground">partite non ufficiali</p>
            </button>
          </div>

          {renderPhaseImportToolbar(activePhase.items)}

          {phaseTab === "tornei" && tournamentGroups.length > 0 && team && (
            <TournamentGroupedCards
              groups={tournamentGroups}
              clubLabel={clubLabel}
              programSelection={tournamentProgramSelection}
              onProgramChange={(competition, value) =>
                setTournamentProgramSelection((prev) => ({ ...prev, [competition]: value }))
              }
              canUploadDocuments={canImportExport}
              canManageTournament={canManageTournament}
              canEditTournamentScores={canEditTournamentScores}
              attachmentsByCompetition={tournamentAttachmentsByCompetition}
              programsByCompetition={tournamentProgramsByCompetition}
              scoresByCompetition={tournamentScoresByCompetition}
              pointsRulesByCompetition={tournamentPointsRulesByCompetition}
              finalsRulesByCompetition={tournamentFinalsRulesByCompetition}
              onEditTournament={openTournamentEdit}
              onDeleteTournament={deleteTournament}
              onLocalDocumentSelected={appendLocalTournamentDocument}
              onDocumentRename={renameTournamentDocument}
              onTournamentScoreChange={updateTournamentProgramScore}
              onTournamentPointsRuleChange={updateTournamentPointsRule}
              onTournamentFinalsRuleChange={updateTournamentFinalsRule}
              onTournamentProgramEntryChange={updateTournamentProgramEntry}
              onTournamentProgramGroupsChange={updateTournamentProgramGroups}
            />
          )}

          {team && teamId && (
            <div className="rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm">
              <div className="p-4 sm:p-5">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between px-0 h-auto hover:bg-transparent"
                  aria-expanded={matchFiltersOpen}
                  onClick={() => setMatchFiltersOpen((o) => !o)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Filter className="w-4 h-4 text-primary shrink-0" />
                    Filtri elenco partite
                    {matchFiltersActive && (
                      <span className="text-[10px] rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                        attivi
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", matchFiltersOpen && "rotate-180")} />
                </Button>
              </div>
              {matchFiltersOpen ? (
                <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-5 border-t border-border/60">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(0,240px)] gap-4 items-end">
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor="match-list-search" className="text-xs font-medium text-muted-foreground">
                          Cerca (avversario, competizione, luogo, note…)
                        </Label>
                        <Input
                          id="match-list-search"
                          value={matchSearchText}
                          onChange={(e) => setMatchSearchText(e.target.value)}
                          placeholder="Es. GRASSINA, campionato…"
                          className="h-9"
                        />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground block">Casa / trasferta</span>
                        <div className="flex rounded-md border border-border bg-background p-0.5 gap-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant={matchVenueFilter === "all" ? "secondary" : "ghost"}
                            className="h-8 flex-1 text-xs"
                            onClick={() => setMatchVenueFilter("all")}
                          >
                            Tutte
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={matchVenueFilter === "home" ? "secondary" : "ghost"}
                            className="h-8 flex-1 text-xs"
                            onClick={() => setMatchVenueFilter("home")}
                          >
                            Casa
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={matchVenueFilter === "away" ? "secondary" : "ghost"}
                            className="h-8 flex-1 text-xs"
                            onClick={() => setMatchVenueFilter("away")}
                          >
                            Trasferta
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor="match-list-tournament" className="text-xs font-medium text-muted-foreground">
                        Nome torneo
                      </Label>
                      <Input
                        id="match-list-tournament"
                        value={matchTournamentFilter}
                        onChange={(e) => setMatchTournamentFilter(e.target.value)}
                        placeholder="Filtra per testo nella competizione (coppa, trofeo, nome torneo…)"
                        className="h-9"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Nella tab Tornei restringe l&apos;elenco sotto ai filtri; tutte le partite torneo restano in un unico elenco ordinato per data e orario.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 items-start pt-1 border-t border-border/50">
                      <div className="min-w-0 space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Data e orario
                        </p>
                        <ScheduleFilterFields
                          value={scheduleFilter}
                          onChange={setScheduleFilter}
                          idPrefix="team-cal"
                          includeExactTime={false}
                        />
                      </div>
                      <div className="min-w-0 space-y-3 lg:border-l lg:border-border/50 lg:pl-10 pt-6 lg:pt-0 border-t lg:border-t-0 border-border/50">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Squadra (sq.A / sq.B)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(["all", "a", "b", "c"] as const).map((k) => (
                            <Button
                              key={k}
                              type="button"
                              size="sm"
                              variant={matchSquadFilter === k ? "secondary" : "outline"}
                              className="h-8 text-xs px-3"
                              onClick={() => setMatchSquadFilter(k)}
                            >
                              {k === "all" ? "Tutte" : `sq.${k.toUpperCase()}`}
                            </Button>
                          ))}
                        </div>
                        {!teamNameHasSquadMarker(team.name) && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Con «sq.A», «sq.B»… nel nome squadra il filtro restringe l&apos;elenco; altrimenti le opzioni non hanno effetto.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border/50 pt-4">
                      <ScheduleFilterExactBlock
                        value={scheduleFilter}
                        onChange={setScheduleFilter}
                        idPrefix="team-cal"
                        variant="plain"
                      />
                    </div>

                    <div className="flex justify-end border-t border-border/50 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5"
                        disabled={!matchFiltersActive}
                        onClick={() => {
                          setMatchSearchText("");
                          setMatchTournamentFilter("");
                          setMatchVenueFilter("all");
                          setMatchSquadFilter("all");
                          setScheduleFilter({ ...EMPTY_SCHEDULE_FILTER });
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Azzera filtri
                      </Button>
                    </div>
                  </div>
              ) : null}
            </div>
          )}

          {activePhase.items.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                {matchFiltersActive && activePhase.rawCount > 0
                  ? "Nessuna partita in questa fase corrisponde ai filtri. Modifica i criteri sopra o usa «Azzera filtri»."
                  : "Nessuna partita in questa fase."}
              </CardContent>
            </Card>
          ) : activePhase.items.map(m => {
            const originalPostponedView = m.__timelineView === "postponed-original";
            return (
            <MatchCard
              key={`${m.id}-${m.__timelineView ?? "standard"}`}
              match={m}
              canEditPreNotes={canEditPreNotes && !originalPostponedView}
              canEditPostNotes={canEditPostNotes && !originalPostponedView}
              canEditSchedule={canEditSchedule && !originalPostponedView}
              canDeleteMatch={canImportExport && !originalPostponedView}
              canManageMatchPlan={canManageMatchPlan && !originalPostponedView}
              canViewMatchPlan={canViewMatchPlan && !originalPostponedView}
              teamPlayers={teamPlayers}
              teamTrainingSchedule={team?.trainingSchedule ?? null}
              matchSection={currentSection}
              teamName={team?.name ?? ""}
              teamCategory={team?.category ?? undefined}
              bulkSelectEnabled={canImportExport && !originalPostponedView}
              bulkSelected={selectedMatchIds.has(m.id)}
              onBulkToggle={() => togglePhaseMatchSelection(m.id)}
            />
            );
          })}
        </div>
      )}
      </div>
    </div>
      <Dialog
        open={createMatchOpen}
        onOpenChange={setCreateMatchOpen}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crea partita</DialogTitle>
            <DialogDescription>
              Inserisci i dati principali per aggiungere una nuova partita al calendario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-match-opponent">Avversario</Label>
              <Input
                id="new-match-opponent"
                value={newMatchForm.opponent}
                onChange={(e) => setNewMatchForm((p) => ({ ...p, opponent: e.target.value }))}
                placeholder="Es. AFFRICO SSD A R.L."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-match-date">Data</Label>
                <Input
                  id="new-match-date"
                  type="date"
                  value={newMatchForm.date}
                  onChange={(e) => setNewMatchForm((p) => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-match-time">Orario (24h)</Label>
                <Input
                  id="new-match-time"
                  type="text"
                  value={newMatchForm.time}
                  onChange={(e) =>
                    setNewMatchForm((p) => ({ ...p, time: formatTimeInputLive(e.target.value) }))
                  }
                  placeholder="10:00 o 1000"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Casa / Trasferta</Label>
                <div className="flex rounded-md border border-border bg-background p-0.5 gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={newMatchForm.homeAway === "home" ? "secondary" : "ghost"}
                    className="h-8 flex-1 text-xs"
                    onClick={() => setNewMatchForm((p) => ({ ...p, homeAway: "home" }))}
                  >
                    Casa
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={newMatchForm.homeAway === "away" ? "secondary" : "ghost"}
                    className="h-8 flex-1 text-xs"
                    onClick={() => setNewMatchForm((p) => ({ ...p, homeAway: "away" }))}
                  >
                    Trasferta
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="new-match-competition">Competizione</Label>
                <Input
                  id="new-match-competition"
                  value={newMatchForm.competition}
                  onChange={(e) => setNewMatchForm((p) => ({ ...p, competition: e.target.value }))}
                  placeholder="Es. Campionato, Torneo, Amichevole"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-match-location">Luogo</Label>
                <Input
                  id="new-match-location"
                  value={newMatchForm.location}
                  onChange={(e) => setNewMatchForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Es. Campo sportivo..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateMatchOpen(false)}>
              Annulla
            </Button>
            <Button type="button" disabled={createMatchMutation.isPending} onClick={() => createMatchMutation.mutate()}>
              {createMatchMutation.isPending ? "Salvataggio..." : "Crea partita"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={createTournamentOpen}
        onOpenChange={(open) => {
          setCreateTournamentOpen(open);
          if (!open) setManualTournamentForm(defaultManualTournamentForm());
        }}
      >
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crea torneo</DialogTitle>
            <DialogDescription>
              Inserisci programma, gironi e finali quando il file non e&apos; leggibile o vuoi creare il torneo manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="manual-tournament-name">Nome torneo</Label>
                <Input
                  id="manual-tournament-name"
                  value={manualTournamentForm.name}
                  onChange={(e) => setManualTournamentForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Es. Torneo Villa Medicea"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-tournament-location">Luogo</Label>
                <Input
                  id="manual-tournament-location"
                  value={manualTournamentForm.location}
                  onChange={(e) => setManualTournamentForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Campo, impianto, comune..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-tournament-start">Data inizio</Label>
                <Input
                  id="manual-tournament-start"
                  type="date"
                  value={manualTournamentForm.startDate}
                  onChange={(e) => setManualTournamentForm((p) => ({ ...p, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-tournament-end">Data fine</Label>
                <Input
                  id="manual-tournament-end"
                  type="date"
                  value={manualTournamentForm.endDate}
                  onChange={(e) => setManualTournamentForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={manualTournamentForm.overnight}
                  onCheckedChange={(checked) => setManualTournamentForm((p) => ({ ...p, overnight: checked === true }))}
                />
                Torneo con pernottamento
              </label>
                  {manualTournamentForm.overnight ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="manual-tournament-overnight-from">Data partenza</Label>
                    <Input
                      id="manual-tournament-overnight-from"
                      type="date"
                      value={manualTournamentForm.overnightFrom}
                      onChange={(e) => setManualTournamentForm((p) => ({ ...p, overnightFrom: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="manual-tournament-overnight-to">Data ritorno</Label>
                    <Input
                      id="manual-tournament-overnight-to"
                      type="date"
                      value={manualTournamentForm.overnightTo}
                      onChange={(e) => setManualTournamentForm((p) => ({ ...p, overnightTo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="manual-tournament-overnight-notes">Note pernottamento</Label>
                    <Textarea
                      id="manual-tournament-overnight-notes"
                      className="min-h-20"
                      value={manualTournamentForm.overnightNotes}
                      onChange={(e) => setManualTournamentForm((p) => ({ ...p, overnightNotes: e.target.value }))}
                      placeholder="Hotel, ritrovo, trasporto, pasti, referente..."
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Gironi e squadre</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setManualTournamentForm((p) => ({
                    ...p,
                    groups: [...p.groups, { id: `group-${Date.now()}`, name: `Girone ${String.fromCharCode(65 + p.groups.length)}`, teams: [""] }],
                  }))}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Girone
                </Button>
              </div>
              {manualTournamentForm.groups.map((group, groupIndex) => (
                <div key={group.id} className="rounded-lg border border-border/70 p-3 space-y-2">
                  <Input
                    value={group.name}
                    onChange={(e) => setManualTournamentForm((p) => ({
                      ...p,
                      groups: p.groups.map((item) => item.id === group.id ? { ...item, name: e.target.value } : item),
                    }))}
                    placeholder="Nome girone"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.teams.map((team, teamIndex) => (
                      <Input
                        key={`${group.id}-${teamIndex}`}
                        list="manual-tournament-team-options"
                        value={team}
                        onChange={(e) => setManualTournamentForm((p) => ({
                          ...p,
                          groups: p.groups.map((item) => item.id === group.id
                            ? { ...item, teams: item.teams.map((value, idx) => idx === teamIndex ? e.target.value : value) }
                            : item),
                        }))}
                        placeholder={`Squadra ${teamIndex + 1}`}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setManualTournamentForm((p) => ({
                      ...p,
                      groups: p.groups.map((item, idx) => item.id === group.id
                        ? { ...item, teams: [...item.teams, ""] }
                        : item),
                    }))}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Squadra
                  </Button>
                </div>
              ))}
              <datalist id="manual-tournament-team-options">
                {tournamentAllTeamsForInput(manualTournamentForm.groups).map((teamName) => <option key={teamName} value={teamName} />)}
              </datalist>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Turni di gioco / programma gironi</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setManualTournamentForm((p) => ({
                      ...p,
                      matches: completeTournamentRoundRobinMatches(p),
                    }))}
                  >
                    Genera mancanti
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setManualTournamentForm((p) => ({
                      ...p,
                      matches: [...p.matches, { id: `match-${Date.now()}`, date: "", time: "", group: p.groups[0]?.name || "Girone A", homeTeam: "", awayTeam: "" }],
                    }))}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Partita
                  </Button>
                </div>
              </div>
              {manualTournamentForm.matches.map((row) => {
                const teamListId = `manual-match-teams-${row.id}`;
                const groupOptions = tournamentGroupSelectOptions(manualTournamentForm.groups, row.group);
                const teamOptions = tournamentTeamsForInput(manualTournamentForm.groups, row.group);
                return (
                  <div key={row.id} className="rounded-lg border border-border/70 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
                    <Input type="date" value={row.date} onChange={(e) => setManualTournamentForm((p) => ({ ...p, matches: p.matches.map((item) => item.id === row.id ? { ...item, date: e.target.value } : item) }))} />
                    <Input placeholder="Ora" inputMode="numeric" value={row.time} onChange={(e) => setManualTournamentForm((p) => ({ ...p, matches: p.matches.map((item) => item.id === row.id ? { ...item, time: formatTimeInputLive(e.target.value) } : item) }))} />
                    <Select value={row.group} onValueChange={(value) => setManualTournamentForm((p) => ({ ...p, matches: p.matches.map((item) => item.id === row.id ? { ...item, group: value, homeTeam: "", awayTeam: "" } : item) }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Girone/Campo" />
                      </SelectTrigger>
                      <SelectContent>
                        {groupOptions.map((groupName) => (
                          <SelectItem key={groupName} value={groupName}>{groupName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input list={teamListId} placeholder="Squadra 1" value={row.homeTeam} onChange={(e) => setManualTournamentForm((p) => ({ ...p, matches: p.matches.map((item) => item.id === row.id ? { ...item, homeTeam: e.target.value } : item) }))} />
                    <Input list={teamListId} placeholder="Squadra 2" value={row.awayTeam} onChange={(e) => setManualTournamentForm((p) => ({ ...p, matches: p.matches.map((item) => item.id === row.id ? { ...item, awayTeam: e.target.value } : item) }))} />
                    <datalist id={teamListId}>
                      {teamOptions.map((teamName) => <option key={teamName} value={teamName} />)}
                    </datalist>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Finali / fase finale</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setManualTournamentForm((p) => ({
                    ...p,
                    finals: [...p.finals, { id: `final-${Date.now()}`, date: "", time: "", label: "Finale", homeTeam: "da completare", awayTeam: "da completare" }],
                  }))}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Finale
                </Button>
              </div>
              {manualTournamentForm.finals.map((row) => (
                <div key={row.id} className="rounded-lg border border-border/70 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                  <Input type="date" value={row.date} onChange={(e) => setManualTournamentForm((p) => ({ ...p, finals: p.finals.map((item) => item.id === row.id ? { ...item, date: e.target.value } : item) }))} />
                  <Input placeholder="Ora" inputMode="numeric" value={row.time} onChange={(e) => setManualTournamentForm((p) => ({ ...p, finals: p.finals.map((item) => item.id === row.id ? { ...item, time: formatTimeInputLive(e.target.value) } : item) }))} />
                  <Input list="manual-final-labels" placeholder="Nome finale" value={row.label} onChange={(e) => setManualTournamentForm((p) => ({ ...p, finals: p.finals.map((item) => item.id === row.id ? { ...item, label: e.target.value } : item) }))} />
                  <Input list="manual-final-teams" placeholder="Squadra 1" value={row.homeTeam} onChange={(e) => setManualTournamentForm((p) => ({ ...p, finals: p.finals.map((item) => item.id === row.id ? { ...item, homeTeam: e.target.value } : item) }))} />
                  <Input list="manual-final-teams" placeholder="Squadra 2" value={row.awayTeam} onChange={(e) => setManualTournamentForm((p) => ({ ...p, finals: p.finals.map((item) => item.id === row.id ? { ...item, awayTeam: e.target.value } : item) }))} />
                </div>
              ))}
              <datalist id="manual-final-labels">
                {["Finale 1° - 2° posto", "Finale 3° - 4° posto", "Finale 5° - 6° posto", "Finali"].map((label) => <option key={label} value={label} />)}
              </datalist>
              <datalist id="manual-final-teams">
                {["da completare", ...tournamentAllTeamsForInput(manualTournamentForm.groups)].map((teamName) => <option key={teamName} value={teamName} />)}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateTournamentOpen(false)}>
              Annulla
            </Button>
            <Button type="button" disabled={createTournamentMutation.isPending} onClick={() => createTournamentMutation.mutate()}>
              {createTournamentMutation.isPending ? "Creazione..." : "Crea torneo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editingTournament}
        onOpenChange={(open) => {
          if (!open) setEditingTournament(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifica torneo</DialogTitle>
            <DialogDescription>
              Aggiorna dati generali, gironi, squadre e accoppiamenti. Punteggi e regole restano nella scheda torneo.
            </DialogDescription>
          </DialogHeader>
          {editingTournament ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-tournament-name">Nome torneo</Label>
                  <Input
                    id="edit-tournament-name"
                    value={editingTournament.name}
                    onChange={(e) =>
                      setEditingTournament((prev) => prev ? { ...prev, name: e.target.value } : prev)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-tournament-location">Luogo</Label>
                  <Input
                    id="edit-tournament-location"
                    value={editingTournament.location}
                    onChange={(e) =>
                      setEditingTournament((prev) => prev ? { ...prev, location: e.target.value } : prev)
                    }
                    placeholder="da completare"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-tournament-start">Data inizio</Label>
                  <Input
                    id="edit-tournament-start"
                    type="date"
                    value={editingTournament.startDate}
                    onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, startDate: e.target.value } : prev)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-tournament-end">Data fine</Label>
                  <Input
                    id="edit-tournament-end"
                    type="date"
                    value={editingTournament.endDate}
                    onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, endDate: e.target.value } : prev)}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={editingTournament.overnight}
                    onCheckedChange={(checked) => setEditingTournament((prev) => prev ? { ...prev, overnight: checked === true } : prev)}
                  />
                  Torneo con pernottamento
                </label>
                {editingTournament.overnight ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="edit-tournament-departure">Data partenza</Label>
                      <Input
                        id="edit-tournament-departure"
                        type="date"
                        value={editingTournament.overnightFrom}
                        onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, overnightFrom: e.target.value } : prev)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-tournament-return">Data ritorno</Label>
                      <Input
                        id="edit-tournament-return"
                        type="date"
                        value={editingTournament.overnightTo}
                        onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, overnightTo: e.target.value } : prev)}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="edit-tournament-overnight-notes">Note pernottamento</Label>
                      <Textarea
                        id="edit-tournament-overnight-notes"
                        className="min-h-20"
                        value={editingTournament.overnightNotes}
                        onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, overnightNotes: e.target.value } : prev)}
                        placeholder="Hotel, ritrovo, trasporto, pasti, referente..."
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Gironi e squadre</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditingTournament((prev) => prev ? {
                      ...prev,
                      groups: [...prev.groups, { id: `edit-group-${Date.now()}`, name: `Girone ${String.fromCharCode(65 + prev.groups.length)}`, teams: [""] }],
                    } : prev)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Girone
                  </Button>
                </div>
                {editingTournament.groups.map((group) => (
                  <div key={group.id} className="rounded-lg border border-border/70 p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={group.name}
                        onChange={(e) => setEditingTournament((prev) => prev ? {
                          ...prev,
                          groups: prev.groups.map((item) => item.id === group.id ? { ...item, name: e.target.value } : item),
                        } : prev)}
                        placeholder="Nome girone"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setEditingTournament((prev) => prev ? {
                          ...prev,
                          groups: prev.groups.filter((item) => item.id !== group.id),
                        } : prev)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.teams.map((teamName, teamIndex) => (
                        <div key={`${group.id}-${teamIndex}`} className="flex gap-2">
                          <Input
                            list="edit-tournament-team-options"
                            value={teamName}
                            onChange={(e) => setEditingTournament((prev) => prev ? {
                              ...prev,
                              groups: prev.groups.map((item) => item.id === group.id
                                ? { ...item, teams: item.teams.map((value, idx) => idx === teamIndex ? e.target.value : value) }
                                : item),
                            } : prev)}
                            placeholder={`Squadra ${teamIndex + 1}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setEditingTournament((prev) => prev ? {
                              ...prev,
                              groups: prev.groups.map((item) => item.id === group.id
                                ? { ...item, teams: item.teams.filter((_, idx) => idx !== teamIndex) }
                                : item),
                            } : prev)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setEditingTournament((prev) => prev ? {
                        ...prev,
                        groups: prev.groups.map((item) => item.id === group.id ? { ...item, teams: [...item.teams, ""] } : item),
                      } : prev)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Squadra
                    </Button>
                  </div>
                ))}
                <datalist id="edit-tournament-team-options">
                  {tournamentAllTeamsForInput(editingTournament.groups).map((teamName) => <option key={teamName} value={teamName} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Turni di gioco / accoppiamenti</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setEditingTournament((prev) => prev ? {
                        ...prev,
                        matches: completeTournamentRoundRobinMatches({
                          groups: prev.groups,
                          matches: prev.matches,
                          startDate: prev.startDate,
                        }),
                      } : prev)}
                    >
                      Genera mancanti
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setEditingTournament((prev) => prev ? {
                        ...prev,
                        matches: [...prev.matches, { id: `edit-match-${Date.now()}`, date: "", time: "", group: prev.groups[0]?.name || "Girone A", homeTeam: "", awayTeam: "" }],
                      } : prev)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Partita
                    </Button>
                  </div>
                </div>
                {editingTournament.matches.map((row) => {
                  const teamListId = `edit-match-teams-${row.id}`;
                  const groupOptions = tournamentGroupSelectOptions(editingTournament.groups, row.group);
                  const teamOptions = tournamentTeamsForInput(editingTournament.groups, row.group);
                  return (
                    <div key={row.id} className="rounded-lg border border-border/70 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_1fr_1fr_1fr_auto] gap-2">
                      <Input type="date" value={row.date} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.map((item) => item.id === row.id ? { ...item, date: e.target.value } : item) } : prev)} />
                      <Input placeholder="Ora" inputMode="numeric" value={row.time} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.map((item) => item.id === row.id ? { ...item, time: formatTimeInputLive(e.target.value) } : item) } : prev)} />
                      <Select value={row.group} onValueChange={(value) => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.map((item) => item.id === row.id ? { ...item, group: value, homeTeam: "", awayTeam: "" } : item) } : prev)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Girone/Campo" />
                        </SelectTrigger>
                        <SelectContent>
                          {groupOptions.map((groupName) => (
                            <SelectItem key={groupName} value={groupName}>{groupName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input list={teamListId} placeholder="Squadra 1" value={row.homeTeam} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.map((item) => item.id === row.id ? { ...item, homeTeam: e.target.value } : item) } : prev)} />
                      <Input list={teamListId} placeholder="Squadra 2" value={row.awayTeam} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.map((item) => item.id === row.id ? { ...item, awayTeam: e.target.value } : item) } : prev)} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground hover:text-destructive"
                        onClick={() => setEditingTournament((prev) => prev ? { ...prev, matches: prev.matches.filter((item) => item.id !== row.id) } : prev)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <datalist id={teamListId}>
                        {teamOptions.map((teamName) => <option key={teamName} value={teamName} />)}
                      </datalist>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Finali / fase finale</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditingTournament((prev) => prev ? {
                      ...prev,
                      finals: [...prev.finals, { id: `edit-final-${Date.now()}`, date: "", time: "", label: "Finale", homeTeam: "da completare", awayTeam: "da completare" }],
                    } : prev)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Finale
                  </Button>
                </div>
                {editingTournament.finals.map((row) => (
                  <div key={row.id} className="rounded-lg border border-border/70 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_0.8fr_1fr_1fr_1fr_auto] gap-2">
                    <Input type="date" value={row.date} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.map((item) => item.id === row.id ? { ...item, date: e.target.value } : item) } : prev)} />
                    <Input placeholder="Ora" inputMode="numeric" value={row.time} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.map((item) => item.id === row.id ? { ...item, time: formatTimeInputLive(e.target.value) } : item) } : prev)} />
                    <Input list="edit-final-labels" placeholder="Nome finale" value={row.label} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.map((item) => item.id === row.id ? { ...item, label: e.target.value } : item) } : prev)} />
                    <Input list="edit-final-teams" placeholder="Squadra 1" value={row.homeTeam} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.map((item) => item.id === row.id ? { ...item, homeTeam: e.target.value } : item) } : prev)} />
                    <Input list="edit-final-teams" placeholder="Squadra 2" value={row.awayTeam} onChange={(e) => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.map((item) => item.id === row.id ? { ...item, awayTeam: e.target.value } : item) } : prev)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-destructive"
                      onClick={() => setEditingTournament((prev) => prev ? { ...prev, finals: prev.finals.filter((item) => item.id !== row.id) } : prev)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <datalist id="edit-final-labels">
                  {["Finale 1° - 2° posto", "Finale 3° - 4° posto", "Finale 5° - 6° posto", "Finali"].map((label) => <option key={label} value={label} />)}
                </datalist>
                <datalist id="edit-final-teams">
                  {["da completare", ...tournamentAllTeamsForInput(editingTournament.groups)].map((teamName) => <option key={teamName} value={teamName} />)}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-tournament-pdf-ref">Data di riferimento PDF (facoltativa)</Label>
                <Input
                  id="edit-tournament-pdf-ref"
                  type="date"
                  value={editingTournament.pdfReferenceDate}
                  onChange={(e) =>
                    setEditingTournament((prev) =>
                      prev ? { ...prev, pdfReferenceDate: e.target.value } : prev,
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Usata come fallback quando il PDF torneo ha solo orari e accoppiamenti. Valida sul browser in uso (non sul server).
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditingTournament(null)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!editingTournament || updateTournamentMutation.isPending}
              onClick={() => {
                if (editingTournament) updateTournamentMutation.mutate(editingTournament);
              }}
            >
              {updateTournamentMutation.isPending ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pdfFilterOpen}
        onOpenChange={(open) => {
          setPdfFilterOpen(open);
          if (!open && !pdfKeepPendingWhilePickerRef.current) setPendingPdfFile(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {pdfImportMode === "tournament" ? "Filtro import PDF torneo" : "Filtro import PDF federazione"}
              {team ? ` — ${team.name}` : ""}
            </DialogTitle>
            <DialogDescription>
              {pdfImportMode === "tournament"
                ? "Usa questo flusso per programmi torneo con gironi, orari e fase finale. Indica categoria e società come compaiono nel PDF."
                : "Puoi scrivere una categoria generica (es. Pulcini): dopo «Analizza» il sistema legge i titoli nel PDF e, se serve, ti fa scegliere 1°/2° anno, misti, ecc. Se indichi già il titolo completo, si usa quello. Società come nel PDF negli accoppiamenti; date da «N GIORNATA»."}
            </DialogDescription>
          </DialogHeader>
          {pendingPdfFile && (
            <p className="text-xs text-muted-foreground truncate" title={pendingPdfFile.name}>
              File: {pendingPdfFile.name}
            </p>
          )}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pdf-cat-filter">Titolo sezione / categoria nel PDF</Label>
              <Input
                id="pdf-cat-filter"
                value={pdfCategoryFilter}
                onChange={(e) => setPdfCategoryFilter(e.target.value)}
                placeholder="Es. Pulcini A7 II anno, Esordienti..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pdf-club-filter">
                {pdfImportMode === "tournament"
                  ? "Società della tua squadra nel torneo"
                  : "Società negli accoppiamenti (consigliato per PDF federali)"}
              </Label>
              <Input
                id="pdf-club-filter"
                value={pdfClubFilter}
                onChange={(e) => setPdfClubFilter(e.target.value)}
                placeholder={pdfImportMode === "tournament" ? "Come nel PDF" : "Nome come nel PDF federazione"}
              />
            </div>
            {pdfImportMode === "tournament" && (
              <div className="space-y-1">
                <Label htmlFor="pdf-ref-date-import">Data di riferimento PDF (facoltativa)</Label>
                <Input
                  id="pdf-ref-date-import"
                  type="date"
                  value={pdfImportReferenceDate}
                  onChange={(e) => setPdfImportReferenceDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Se il programma non espone le date nel testo, tutte le partite useranno questo giorno finché nel PDF non compare una riga data.
                  Puoi impostarla anche in Modifica torneo (resta salvata per quel torneo su questo browser).
                </p>
              </div>
            )}
          </div>
          {pdfOcrStatus && (
            <p
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {pdfOcrStatus}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setPendingPdfFile(null); setPdfFilterOpen(false); }}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!pendingPdfFile || !team || importPdfMutation.isPending || pdfDiscovering}
              onClick={async () => {
                if (!pendingPdfFile || !team) return;
                const searchTerms = buildPdfImportSearchTerms({
                  categoryLine: pdfCategoryFilter,
                  clubLine: pdfClubFilter,
                  teamName: team.name,
                  clubName: clubLabel,
                });
                if (searchTerms.length === 0) {
                  toast({ title: "Inserisci almeno un termine di ricerca", variant: "destructive" });
                  return;
                }
                const societyHint = pdfClubFilter.trim() || clubLabel;
                const runImport = (sectionTitleHints: string[]) => {
                  setPdfFilterOpen(false);
                  importPdfMutation.mutate({
                    file: pendingPdfFile,
                    searchTerms,
                    clubHint: pdfClubFilter,
                    sectionTitleHints,
                    societyHint,
                    pdfMode: pdfImportModeRef.current,
                    fallbackDateIso:
                      pdfImportModeRef.current === "tournament"
                        ? ymdLocalNoonToIso(pdfImportReferenceDate)
                        : undefined,
                  });
                };
                if (isGenericPdfCategoryHint(pdfCategoryFilter)) {
                  setPdfDiscovering(true);
                  try {
                    const titles = await discoverPdfSectionTitles(pendingPdfFile, {
                      categoryLoose: pdfCategoryFilter.trim(),
                      searchTerms,
                    });
                    setPdfDiscovering(false);
                    if (titles.length > 1) {
                      pdfKeepPendingWhilePickerRef.current = true;
                      setPdfSectionCandidates(titles);
                      setPdfSectionChoice(titles[0] ?? "");
                      setPdfSectionPickerOpen(true);
                      setPdfFilterOpen(false);
                      queueMicrotask(() => {
                        pdfKeepPendingWhilePickerRef.current = false;
                      });
                      return;
                    }
                    if (titles.length === 1) {
                      runImport([titles[0]]);
                      return;
                    }
                  } catch {
                    setPdfDiscovering(false);
                    toast({ title: "Impossibile leggere le sezioni dal PDF", variant: "destructive" });
                    return;
                  }
                  setPdfDiscovering(false);
                }
                runImport(
                  pdfCategoryFilter
                    .split(/[,;]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                );
              }}
            >
              {pdfDiscovering ? "Ricerca sezioni…" : "Analizza PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pdfSectionPickerOpen}
        onOpenChange={(open) => {
          setPdfSectionPickerOpen(open);
          if (!open) setPendingPdfFile(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seleziona la sezione nel PDF</DialogTitle>
            <DialogDescription>
              Abbiamo trovato più intestazioni compatibili con «{pdfCategoryFilter.trim()}». Scegli quella corretta (1°/2° anno, misti, ecc.).
            </DialogDescription>
          </DialogHeader>
          {pendingPdfFile && (
            <p className="text-xs text-muted-foreground truncate shrink-0" title={pendingPdfFile.name}>
              File: {pendingPdfFile.name}
            </p>
          )}
          <RadioGroup
            value={pdfSectionChoice}
            onValueChange={setPdfSectionChoice}
            className="gap-0 overflow-y-auto max-h-[45vh] pr-1"
          >
            {pdfSectionCandidates.map((title, idx) => (
              <div
                key={`${idx}-${title}`}
                className="flex items-start gap-3 rounded-lg border border-border/80 p-3 mb-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={title} id={`pdf-sec-${idx}`} className="mt-0.5 shrink-0" />
                <Label htmlFor={`pdf-sec-${idx}`} className="text-sm font-normal leading-snug cursor-pointer flex-1">
                  {title}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {pdfOcrStatus && (
            <p
              className="text-xs text-muted-foreground shrink-0"
              role="status"
              aria-live="polite"
            >
              {pdfOcrStatus}
            </p>
          )}
          <DialogFooter className="shrink-0 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPdfSectionPickerOpen(false);
                setPendingPdfFile(null);
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              disabled={!pendingPdfFile || !team || !pdfSectionChoice || importPdfMutation.isPending}
              onClick={() => {
                if (!pendingPdfFile || !team || !pdfSectionChoice) return;
                const file = pendingPdfFile;
                const searchTerms = buildPdfImportSearchTerms({
                  categoryLine: pdfSectionChoice,
                  clubLine: pdfClubFilter,
                  teamName: team.name,
                  clubName: clubLabel,
                });
                setPdfSectionPickerOpen(false);
                importPdfMutation.mutate({
                  file,
                  searchTerms,
                  clubHint: pdfClubFilter,
                  sectionTitleHints: [pdfSectionChoice],
                  societyHint: pdfClubFilter.trim() || clubLabel,
                  pdfMode: pdfImportModeRef.current,
                  fallbackDateIso:
                    pdfImportModeRef.current === "tournament"
                      ? ymdLocalNoonToIso(pdfImportReferenceDate)
                      : undefined,
                });
              }}
            >
              Usa questa sezione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Anteprima import {previewSource.toUpperCase()}</DialogTitle>
            <DialogDescription>
              Seleziona le partite da importare. La spunta include la riga; il cestino la rimuove dall&apos;anteprima.
            </DialogDescription>
          </DialogHeader>
          {(previewSource === "immagine" || previewSource === "programma") && previewRows.some((row) => !importRowHasValidDate(row)) && (
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
              <div className="space-y-1">
                <Label htmlFor="preview-bulk-date" className="text-xs">
                  Data unica eventi
                </Label>
                <Input
                  id="preview-bulk-date"
                  type="date"
                  className="h-9 w-44"
                  value={previewBulkDate}
                  onChange={(e) => setPreviewBulkDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!previewBulkDate}
                onClick={() => {
                  setPreviewRows((rows) =>
                    rows.map((row, idx) => {
                      if (!selectedRows[idx] || importRowHasValidDate(row)) return row;
                      const time = getImageTournamentMissingTime(row) ?? "15:00";
                      const iso = combineDateAndTimeToIso(previewBulkDate, time);
                      return iso ? { ...row, date: iso } : row;
                    }),
                  );
                }}
              >
                Applica alle selezionate
              </Button>
            </div>
          )}
          {pdfImportModeRef.current === "tournament" && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <span className="font-medium">Programma completo torneo riconosciuto: </span>
              <span className="tabular-nums">
                {previewTournamentProgramCount(previewSource, previewRows, pendingTournamentProgram)}
              </span>
              <span className="text-muted-foreground"> gare</span>
              {previewTournamentProgramCount(previewSource, previewRows, pendingTournamentProgram) === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nessuna altra gara del torneo riconosciuta: la scheda mostrerÃ  solo le partite della societÃ .
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRows(previewRows.map(() => true))}>
              Seleziona tutte
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRows(previewRows.map(() => false))}>
              Deseleziona tutte
            </Button>
            <span className="text-muted-foreground">
              {selectedRows.filter(Boolean).length}/{previewRows.length} selezionate
            </span>
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 w-10">#</th>
                  <th className="text-center p-2 w-10" title="Rimuovi riga">
                    <Trash2 className="w-4 h-4 inline text-muted-foreground" aria-hidden />
                  </th>
                  <th className="text-left p-2">Data</th>
                  <th className="text-left p-2">Avversario</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Competizione</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={`${row.date}-${row.opponent}-${idx}`} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!!selectedRows[idx]}
                        onChange={(e) =>
                          setSelectedRows((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.checked;
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Rimuovi dalla lista"
                        aria-label="Rimuovi dalla lista"
                        onClick={() => {
                          setPreviewRows((rows) => rows.filter((_, i) => i !== idx));
                          setSelectedRows((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {importRowHasValidDate(row) ? (
                        format(new Date(row.date), "dd/MM/yyyy HH:mm")
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            type="date"
                            className="h-8 w-36"
                            aria-label="Data partita"
                            onChange={(e) => {
                              const time = getImageTournamentMissingTime(row) ?? "15:00";
                              const iso = combineDateAndTimeToIso(e.target.value, time);
                              if (!iso) return;
                              setPreviewRows((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, date: iso } : r)),
                              );
                            }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {getImageTournamentMissingTime(row) ?? "orario da verificare"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-2">{row.opponent}</td>
                    <td className="p-2">{row.homeAway === "home" ? "Casa" : "Trasferta"}</td>
                    <td className="p-2">{row.competition ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreviewOpen(false)}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={
                selectedRows.filter(Boolean).length === 0 ||
                previewRows.some((row, idx) => selectedRows[idx] && !importRowHasValidDate(row)) ||
                applyImportMutation.isPending
              }
              onClick={() => {
                const rows = previewRows.filter((_, idx) => selectedRows[idx]);
                const { conflictIds, examples } = findImportDuplicateConflicts(rows, matches);
                if (conflictIds.length > 0) {
                  setPendingImportRows(rows);
                  setPendingImportConflictIds(conflictIds);
                  setDuplicateImportExamples(examples);
                  setDuplicateImportOpen(true);
                  return;
                }
                applyImportMutation.mutate({ rows });
              }}
            >
              Importa selezionate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateImportOpen} onOpenChange={setDuplicateImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Partite già presenti</DialogTitle>
            <DialogDescription>
              I dati che vuoi inserire coincidono con <strong>{pendingImportConflictIds.length}</strong> partita/e già in
              calendario (stessa data, avversario e tipo). Origine: anteprima {previewSource.toUpperCase()}.
            </DialogDescription>
          </DialogHeader>
          {duplicateImportExamples.length > 0 && (
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 max-h-40 overflow-y-auto">
              {duplicateImportExamples.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Vuoi creare duplicati (nuove righe oltre a quelle esistenti), sostituire le esistenti con queste, o annullare?
          </p>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDuplicateImportOpen(false);
                setPendingImportRows(null);
                setPendingImportConflictIds([]);
                setDuplicateImportExamples([]);
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!pendingImportRows?.length || applyImportMutation.isPending}
              onClick={() => {
                if (!pendingImportRows?.length) return;
                applyImportMutation.mutate({ rows: pendingImportRows });
              }}
            >
              Crea duplicato
            </Button>
            <Button
              type="button"
              disabled={!pendingImportRows?.length || applyImportMutation.isPending}
              onClick={() => {
                if (!pendingImportRows?.length) return;
                applyImportMutation.mutate({
                  rows: pendingImportRows,
                  replaceConflictIds: pendingImportConflictIds,
                });
              }}
            >
              Sostituisci
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={bulkDeleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteConfirm?.kind === "duplicates"
                ? "Eliminare le partite duplicate?"
                : "Eliminare le partite selezionate?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeleteConfirm?.kind === "duplicates"
                ? `Verranno rimosse ${bulkDeleteConfirm?.ids.length ?? 0} partite duplicate in questa fase (per ogni gruppo con stessa data, avversario e casa/trasferta resta la partita con ID più basso). L'operazione non può essere annullata.`
                : `Stai per eliminare ${bulkDeleteConfirm?.ids.length ?? 0} partite. L'operazione non può essere annullata.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (bulkDeleteConfirm) bulkDeleteMutation.mutate(bulkDeleteConfirm.ids);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
