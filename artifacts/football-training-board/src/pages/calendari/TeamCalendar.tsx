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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  buildPdfImportSearchTerms,
  discoverPdfSectionTitles,
  isGenericPdfCategoryHint,
} from "@/lib/match-calendar-pdf";
import { findImportDuplicateConflicts, getDuplicateMatchIdsToRemove } from "@/lib/match-import-conflicts";
import {
  EMPTY_SCHEDULE_FILTER,
  scheduleTimeFilterActive,
  datePassesScheduleFilter,
  type ScheduleFilterOpts,
} from "@/lib/calendar-schedule-filter";
import { ScheduleFilterFields, ScheduleFilterExactBlock } from "@/components/calendar/ScheduleFilterFields";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
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

interface Team { id: number; name: string; category?: string; assignedStaff?: { userId: number }[]; }
interface Player {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  available?: boolean;
  unavailabilityReason?: string | null;
}
interface MatchCallUp { id: number; playerId: number; status: string; playerName?: string | null; }
type MatchSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";
type MatchPlanPeriod = { key: string; label: string; minutes: string; formation?: string; module?: string; format?: MatchFormat; };
type MatchFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";
type MatchPlanPeriodRuntime = MatchPlanPeriod & { lineupPlayerIds?: number[] };
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

function normalizeTime24(value: string): string | null {
  const clean = value.trim();
  const m = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function combineDateAndTimeToIso(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null;
  const normalized = normalizeTime24(timeValue);
  if (!normalized) return null;
  const parsed = new Date(`${dateValue}T${normalized}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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
    })),
  };
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
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

function matchPassesListFilters(
  m: Match,
  calendarTeamName: string | undefined,
  f: {
    search: string;
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
  matchSection,
  teamName,
  teamCategory,
  bulkSelectEnabled,
  bulkSelected,
  onBulkToggle,
}: {
  match: Match;
  canEditPreNotes: boolean;
  canEditPostNotes: boolean;
  canEditSchedule: boolean;
  canDeleteMatch: boolean;
  canManageMatchPlan: boolean;
  canViewMatchPlan: boolean;
  teamPlayers: Player[];
  matchSection: MatchSection;
  teamName: string;
  teamCategory?: string;
  bulkSelectEnabled?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [postMenuOpen, setPostMenuOpen] = useState(false);
  const [postNoteValue, setPostNoteValue] = useState(() => splitPostNotesAndAttachments(match.postMatchNotes).note);
  const [postResultValue, setPostResultValue] = useState(match.result ?? "");
  const [postAttachments, setPostAttachments] = useState<string[]>(() => splitPostNotesAndAttachments(match.postMatchNotes).attachments);
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
  const [callupSearch, setCallupSearch] = useState("");
  const [planDraft, setPlanDraft] = useState<MatchPlanData>(() =>
    ensurePlanPeriods(match.matchPlan ?? null, defaultPeriodsForTeam(matchSection, teamName, teamCategory)),
  );
  const matchFormat = matchFormatForTeam(matchSection, teamName, teamCategory);
  const isFriendlyMatch = matchPhase(match) === "amichevoli";
  const autoReserveRuleEnabled = matchFormat !== "11v11";
  const moduleOptions = useMemo(() => moduleOptionsForFormat(matchFormat), [matchFormat]);
  const friendlyNextFormat = useMemo(
    () => (isFriendlyMatch && autoReserveRuleEnabled ? nextFriendlyFormat(matchFormat) : null),
    [isFriendlyMatch, autoReserveRuleEnabled, matchFormat],
  );
  const sortedTeamPlayers = useMemo(() => {
    const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
    return [...teamPlayers].sort((a, b) => {
      const byLast = collator.compare((a.lastName ?? "").trim(), (b.lastName ?? "").trim());
      if (byLast !== 0) return byLast;
      const byFirst = collator.compare((a.firstName ?? "").trim(), (b.firstName ?? "").trim());
      if (byFirst !== 0) return byFirst;
      return (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999);
    });
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

  const homeLabel = isHome ? CLUB_NAME : match.opponent;
  const awayLabel = isHome ? match.opponent : CLUB_NAME;
  const postView = splitPostNotesAndAttachments(match.postMatchNotes);
  const hasPostNotes = postView.note.length > 0 || postView.attachments.length > 0;

  const statusColor = match.isPostponed
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
  const tacticalUrl = `/tactical-board?teamId=${match.teamId ?? ""}&preset=${encodeURIComponent(tacticalPreset)}&convocati=${encodeURIComponent(Array.from(selectedPlayerIds).join(","))}`;
  const canOpenBoard =
    selectedPlayerIds.size > 0 &&
    !!tacticalPreset &&
    !!planDraft.convocationAt &&
    !!planDraft.convocationPlace;

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
        return { ...period, lineupPlayerIds: lineup };
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
      const currentIds = new Set(callups.map((c) => c.playerId));
      const toAdd = Array.from(selectedPlayerIds).filter((id) => !currentIds.has(id));
      const toRemove = callups.filter((c) => !selectedPlayerIds.has(c.playerId)).map((c) => c.id);
      for (const playerId of toAdd) {
        await apiFetch(`/api/matches/${match.id}/callups`, {
          method: "POST",
          body: JSON.stringify({ playerId, status: "called" }),
        });
      }
      for (const id of toRemove) {
        await apiFetch(`/api/callups/${id}`, { method: "DELETE" });
      }
      const selected = new Set(selectedPlayerIds);
      const normalizedPlan: MatchPlanData = {
        ...planDraft,
        periods: planDraft.periods.map((p) => ({
          ...p,
          lineupPlayerIds: (p.lineupPlayerIds ?? []).filter((id) => selected.has(id)),
        })),
      };
      await apiFetch(`/api/matches/${match.id}`, {
        method: "PATCH",
        body: JSON.stringify({ matchPlan: normalizedPlan }),
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

  return (
    <Card
      className={cn(
        "transition-shadow hover:shadow-md border-l-4",
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
                  onChange={(e) => setNewDateTime(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="HH:mm"
                  inputMode="numeric"
                  pattern="^([01]\\d|2[0-3]):([0-5]\\d)$"
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
                        onChange={(e) => setRescheduleDateTime(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="HH:mm"
                        inputMode="numeric"
                        pattern="^([01]\\d|2[0-3]):([0-5]\\d)$"
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
                  <div className="max-h-32 overflow-auto rounded border bg-background p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {filteredTeamPlayers.map((p) => (
                      <label key={p.id} className={cn("flex items-center gap-2 text-xs", p.available === false && "opacity-50")}>
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
                        <span>
                          {p.jerseyNumber ? `${p.jerseyNumber} · ` : ""}{p.firstName} {p.lastName}
                          {p.available === false ? " (non disponibile)" : ""}
                        </span>
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
                          const nextTime = e.target.value;
                          setConvocationTimeInput(nextTime);
                          const nextIso = combineDateAndTimeToIso(convocationDateInput, nextTime);
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
                    const periodModuleOptions = moduleOptionsForFormat(periodFormat);
                    const lineupIds = (p.lineupPlayerIds ?? []).filter((id) => selectedPlayerIds.has(id));
                    const startersLimit = startersLimitForPeriod(p, matchFormat);
                    const starters = lineupIds.slice(0, startersLimit).length;
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
                                        return { ...x, format: nextFormat, module: currentModule };
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
                            <select
                              value={p.module ?? ""}
                              onChange={(e) =>
                                setPlanDraft((prev) => {
                                  const nextPeriods = prev.periods.map((x, ix) =>
                                    ix === i ? { ...x, module: e.target.value } : x,
                                  );
                                  const adjusted =
                                    autoReserveRuleEnabled && i === 0
                                      ? applyScuolaCalcioSecondPeriodAuto(nextPeriods, selectedPlayerIds, matchFormat)
                                      : nextPeriods;
                                  return { ...prev, periods: adjusted };
                                })
                              }
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs w-full"
                            >
                              <option value="">Seleziona modulo ({periodFormat})</option>
                              {periodModuleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
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
                                    ix === i ? { ...x, lineupPlayerIds: [...selectedPlayersOrdered] } : x,
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
  );
}

interface TeamCalendarProps { overrideTeamId?: number; }

export default function TeamCalendar({ overrideTeamId }: TeamCalendarProps = {}) {
  const [, params] = useRoute("/calendari/:teamId");
  const { role, user, section } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const importFileRef = useRef<HTMLInputElement>(null);
  const importPdfFileRef = useRef<HTMLInputElement>(null);
  /** Evita di azzerare il file PDF quando si passa dal filtro al dialog scelta sezione. */
  const pdfKeepPendingWhilePickerRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState<MatchImportRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<boolean[]>([]);
  const [previewSource, setPreviewSource] = useState<"excel" | "pdf">("excel");
  const [pdfFilterOpen, setPdfFilterOpen] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [pdfCategoryFilter, setPdfCategoryFilter] = useState("");
  const [pdfClubFilter, setPdfClubFilter] = useState("");
  const [pdfDiscovering, setPdfDiscovering] = useState(false);
  const [pdfSectionPickerOpen, setPdfSectionPickerOpen] = useState(false);
  const [pdfSectionCandidates, setPdfSectionCandidates] = useState<string[]>([]);
  const [pdfSectionChoice, setPdfSectionChoice] = useState("");
  const [phaseTab, setPhaseTab] = useState("autunnale");
  const [duplicateImportOpen, setDuplicateImportOpen] = useState(false);
  const [createMatchOpen, setCreateMatchOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<MatchImportRow[] | null>(null);
  const [pendingImportConflictIds, setPendingImportConflictIds] = useState<number[]>([]);
  const [duplicateImportExamples, setDuplicateImportExamples] = useState<string[]>([]);
  const [matchSearchText, setMatchSearchText] = useState("");
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

  const teamId = overrideTeamId ?? (params?.teamId ? parseInt(params.teamId) : null);
  const isStandalone = !overrideTeamId;

  const canImportExport = ["admin", "director", "secretary", "presidente"].includes(role ?? "");

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
    }) => {
      if (!team) throw new Error("Squadra non valida");
      const parsed = await parseMatchCalendarPdfFile(input.file, {
        teamName: team.name,
        clubName: input.clubHint.trim() || CLUB_NAME,
        searchTerms: input.searchTerms,
        sectionTitleHints: input.sectionTitleHints,
        societyHint: input.societyHint,
      });
      return parsed;
    },
    onSuccess: (parsed) => {
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
            notes: m.notes ?? undefined,
          }),
        });
        ok++;
      }
      return ok;
    },
    onSuccess: (ok) => {
      qc.invalidateQueries({ queryKey: ["/api/matches", teamId] });
      setPreviewOpen(false);
      setDuplicateImportOpen(false);
      setPendingImportRows(null);
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

  const sorted = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const autunnale   = sorted.filter(m => matchPhase(m) === "autunnale");
  const primaverile = sorted.filter(m => matchPhase(m) === "primaverile");
  const tornei      = sorted.filter(m => matchPhase(m) === "tornei");
  const amichevoli  = sorted.filter(m => matchPhase(m) === "amichevoli");

  const listFilterOpts = useMemo(
    () => ({
      search: matchSearchText,
      venue: matchVenueFilter,
      squad: matchSquadFilter,
      schedule: scheduleFilter,
    }),
    [matchSearchText, matchVenueFilter, matchSquadFilter, scheduleFilter],
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

  const matchFiltersActive =
    matchSearchText.trim() !== "" ||
    matchVenueFilter !== "all" ||
    matchSquadFilter !== "all" ||
    scheduleTimeFilterActive(scheduleFilter);

  useEffect(() => {
    if (matchFiltersActive) setMatchFiltersOpen(true);
  }, [matchFiltersActive]);

  const importActionsBusy =
    importMutation.isPending ||
    importPdfMutation.isPending ||
    applyImportMutation.isPending ||
    bulkDeleteMutation.isPending;

  function togglePhaseMatchSelection(id: number) {
    setSelectedMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            onClick={() => importPdfFileRef.current?.click()}
          >
            <FileText className="w-3.5 h-3.5" />
            Carica PDF federazione
          </Button>
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
    if (phaseTab === "primaverile") return { items: primaverileFiltered, rawCount: primaverile.length };
    if (phaseTab === "tornei") return { items: torneiFiltered, rawCount: tornei.length };
    if (phaseTab === "amichevoli") return { items: amichevoliFiltered, rawCount: amichevoli.length };
    return { items: autunnaleFiltered, rawCount: autunnale.length };
  }, [phaseTab, autunnaleFiltered, primaverileFiltered, torneiFiltered, amichevoliFiltered, autunnale.length, primaverile.length, tornei.length, amichevoli.length]);

  if (!teamId) return <div className="p-6 text-muted-foreground">Squadra non trovata.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
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
            setPdfCategoryFilter(team.name);
            setPdfClubFilter("");
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
                  onChange={(e) => setNewMatchForm((p) => ({ ...p, time: e.target.value }))}
                  placeholder="HH:mm"
                  inputMode="numeric"
                  pattern="^([01]\\d|2[0-3]):([0-5]\\d)$"
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
        open={pdfFilterOpen}
        onOpenChange={(open) => {
          setPdfFilterOpen(open);
          if (!open && !pdfKeepPendingWhilePickerRef.current) setPendingPdfFile(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtro import PDF</DialogTitle>
            <DialogDescription>
              Puoi scrivere una categoria generica (es. Pulcini): dopo «Analizza» il sistema legge i titoli nel PDF e, se serve, ti fa scegliere 1°/2° anno, misti, ecc. Se indichi già il titolo completo, si usa quello. Società come nel PDF negli accoppiamenti; date da «N GIORNATA».
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
              <Label htmlFor="pdf-club-filter">Società negli accoppiamenti (consigliato per PDF federali)</Label>
              <Input
                id="pdf-club-filter"
                value={pdfClubFilter}
                onChange={(e) => setPdfClubFilter(e.target.value)}
                placeholder="Nome come nel PDF federazione"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setPdfFilterOpen(false); setPendingPdfFile(null); }}>
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
                  clubName: CLUB_NAME,
                });
                if (searchTerms.length === 0) {
                  toast({ title: "Inserisci almeno un termine di ricerca", variant: "destructive" });
                  return;
                }
                const societyHint = pdfClubFilter.trim() || CLUB_NAME;
                const runImport = (sectionTitleHints: string[]) => {
                  setPdfFilterOpen(false);
                  importPdfMutation.mutate({
                    file: pendingPdfFile,
                    searchTerms,
                    clubHint: pdfClubFilter,
                    sectionTitleHints,
                    societyHint,
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
                  clubName: CLUB_NAME,
                });
                setPdfSectionPickerOpen(false);
                importPdfMutation.mutate({
                  file,
                  searchTerms,
                  clubHint: pdfClubFilter,
                  sectionTitleHints: [pdfSectionChoice],
                  societyHint: pdfClubFilter.trim() || CLUB_NAME,
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
                    <td className="p-2 whitespace-nowrap">{format(new Date(row.date), "dd/MM/yyyy HH:mm")}</td>
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
              disabled={selectedRows.filter(Boolean).length === 0 || applyImportMutation.isPending}
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

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
              <p className="text-2xl font-bold tabular-nums">{tornei.length}</p>
              <p className="text-xs text-muted-foreground">coppe e trofei</p>
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

          {team && teamId && (
            <div className="rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm">
              <Collapsible open={matchFiltersOpen} onOpenChange={setMatchFiltersOpen}>
                <div className="p-4 sm:p-5">
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-between px-0 h-auto hover:bg-transparent"
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
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-5">
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
                </CollapsibleContent>
              </Collapsible>
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
          ) : activePhase.items.map(m => (
            <MatchCard
              key={m.id}
              match={m}
              canEditPreNotes={canEditPreNotes}
              canEditPostNotes={canEditPostNotes}
              canEditSchedule={canEditSchedule}
              canDeleteMatch={canImportExport}
              canManageMatchPlan={canManageMatchPlan}
              canViewMatchPlan={canViewMatchPlan}
              teamPlayers={teamPlayers}
              matchSection={currentSection}
              teamName={team?.name ?? ""}
              teamCategory={team?.category ?? undefined}
              bulkSelectEnabled={canImportExport}
              bulkSelected={selectedMatchIds.has(m.id)}
              onBulkToggle={() => togglePhaseMatchSelection(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
