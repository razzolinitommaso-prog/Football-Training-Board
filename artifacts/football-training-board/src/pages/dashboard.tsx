import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetDashboardStats, useListPlayers, useListTeams } from "@workspace/api-client-react";
import type { TrainingSlot } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersRound, Users, ShieldCheck, CalendarDays, ArrowRight, Activity, AlertTriangle, X, Bell, BellRing, CheckCheck, Plus, Send, Info, Siren, Clock, Layers, RefreshCw, Trophy, FileUp, FileText, Download, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Dumbbell, Heart, Eye, RotateCcw, Leaf, Grape, Handshake } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, addMonths, endOfMonth, endOfWeek, eachDayOfInterval, format, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { withApi } from "@/lib/api-base";
import { normalizeSessionRole } from "@/lib/session-role";

type SecretaryClubFileRow = {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type DashboardTeam = {
  id: number;
  name: string;
  clubSection?: string | null;
  trainingSchedule?: TrainingSlot[] | null;
};

type DashboardMatch = {
  id: number;
  opponent: string;
  date: string;
  isPostponed?: boolean | null;
  rescheduleDate?: string | null;
  rescheduleTbd?: boolean | null;
  homeAway?: string | null;
  result?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
};

type DashboardExtraEvent = {
  id: number;
  section?: string | null;
  category?: string | null;
  title: string;
  dateFrom: string;
  dateTo: string;
  startTime?: string | null;
  endTime?: string | null;
  frequency?: "everyday" | "selected_days" | string | null;
  weekdays?: number[] | null;
  targetMode?: "all" | "selected" | string | null;
  teamIds?: number[] | null;
};

type DashboardTrainingOverride = {
  id: number;
  teamId: number;
  originalDate: string;
  originalStartTime: string;
  originalEndTime: string;
  status: "moved" | "cancelled" | "note" | "joined" | string;
  newDate?: string | null;
  newStartTime?: string | null;
  newEndTime?: string | null;
  targetTeamId?: number | null;
  targetDate?: string | null;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
  location?: string | null;
  notes?: string | null;
};

type DashboardMatchPhase = "autunnale" | "primaverile" | "tornei" | "amichevoli";

type DashboardCalendarItem =
  | {
      kind: "training" | "extra";
      key: string;
      date: Date;
      time: string;
      title: string;
      subtitle: string;
      teamId?: number;
      teamName?: string;
      originalDate?: string;
      originalStartTime?: string;
      originalEndTime?: string;
      trainingStatus?: "regular" | "moved" | "cancelled" | "moved-original" | "note" | "joined" | "joined-original";
      trainingOverride?: DashboardTrainingOverride;
      trainingNotes?: string | null;
    }
  | {
      kind: "match";
      key: string;
      date: Date;
      time: string;
      title: string;
      subtitle: string;
      teamId?: number;
      teamName?: string;
      match: DashboardMatch;
    }
  | {
      kind: "tournament";
      key: string;
      date: Date;
      dateEnd?: Date;
      time: string;
      title: string;
      subtitle: string;
      teamId?: number;
      teamName?: string;
      matches: DashboardMatch[];
    };

const DASHBOARD_TEAM_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#0ea5e9",
  "#14b8a6",
  "#f97316",
];

/** Elenco file: in caso di errore API rete nulla in UI (lista vuota), solo log in sviluppo. */
async function fetchSecretaryClubFilesList(): Promise<SecretaryClubFileRow[]> {
  try {
    const res = await fetch(withApi("/api/secretary/club-files"), { credentials: "include" });
    const text = await res.text();
    if (!res.ok) {
      if (import.meta.env.DEV) {
        console.warn("[secretary/club-files] elenco non disponibile:", res.status, text.slice(0, 160));
      }
      return [];
    }
    try {
      return JSON.parse(text) as SecretaryClubFileRow[];
    } catch {
      return [];
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn("[secretary/club-files]", e);
    return [];
  }
}

async function secretaryDownloadFile(fileId: number, filename: string) {
  const res = await fetch(withApi(`/api/secretary/club-files/${fileId}/file`), { credentials: "include" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ClubNotification = {
  id: number;
  clubId?: number;
  playerId?: number;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  isRead: boolean;
  isTrashed?: boolean;
  isSent?: boolean;
  createdByUserId?: number | null;
  source?: "internal" | "platform" | "player_notes";
  recipientTag?: string;
  seasonTag?: string;
  surnameTag?: string;
};

type NotificationFolder = "received" | "sent" | "trash";

const PLAYER_NOTES_MARKER = "[FTB_PLAYER_NOTES]";
const PLAYER_META_MARKER = "[FTB_PLAYER_META]";

function stripPlayerMeta(raw?: string | null): string {
  const full = String(raw ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return full;
  const nextNewLineIdx = full.indexOf("\n");
  return nextNewLineIdx >= 0 ? full.slice(nextNewLineIdx + 1).trim() : "";
}

function parsePlayerThread(raw?: string | null): Array<{ recipient?: string; createdAt?: string; repliedAt?: string; requiresResponse?: boolean }> {
  const full = String(raw ?? "").trim();
  if (!full) return [];
  const idx = full.lastIndexOf(PLAYER_NOTES_MARKER);
  if (idx < 0) return [];
  const jsonPart = full.slice(idx + PLAYER_NOTES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function noteRecipientForRole(role: string): "secretary" | "technical_director" | "coach_staff" | null {
  if (role === "secretary") return "secretary";
  if (role === "technical_director") return "technical_director";
  if (role === "coach" || role === "fitness_coach" || role === "athletic_director") return "coach_staff";
  return null;
}

function noteRecipientLabel(recipient: "secretary" | "technical_director" | "coach_staff"): string {
  if (recipient === "secretary") return "segreteria";
  if (recipient === "technical_director") return "direttore tecnico";
  return "staff tecnico";
}

function dashboardRoleLabel(role: string): string {
  const normalized = normalizeSessionRole(role);
  const labels: Record<string, string> = {
    admin: "Admin",
    presidente: "Presidente",
    director: "Direttore",
    secretary: "Segreteria",
    coach: "Allenatori",
    technical_director: "Direttori tecnici",
    fitness_coach: "Preparatori",
    athletic_director: "Resp. atletici",
    parent: "Genitori",
  };
  return labels[normalized] ?? role;
}

function parseLocalDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function combineLocalDateAndTime(day: Date, hhmm?: string | null): Date {
  const [hRaw, mRaw] = String(hhmm || "00:00").split(":");
  const h = Number.parseInt(hRaw || "0", 10);
  const m = Number.parseInt(mRaw || "0", 10);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0);
}

function formatDashboardTimeInputLive(raw: string): string {
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

function normalizeDashboardTime24(value: string): string | null {
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
    if (hh2 <= 23) return `${String(hh2).padStart(2, "0")}:0${d.slice(2)}`;
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

function combineDashboardDateAndTimeToIso(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null;
  const normalized = normalizeDashboardTime24(timeValue);
  if (!normalized) return null;
  const parsed = new Date(`${dateValue}T${normalized}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function matchTimeLabel(date: Date): string {
  return format(date, "HH:mm");
}

function normalCompetition(value?: string | null): string {
  return String(value ?? "").trim();
}

function isTournamentMatch(match: DashboardMatch): boolean {
  return /^torneo\b/i.test(normalCompetition(match.competition));
}

const DASHBOARD_TOURNAMENT_LOGISTICS_PREFIX = "__tournamentLogistics=";

function parseDashboardTournamentDate(value?: string | null): Date | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decodeDashboardTournamentLogistics(notes?: string | null): { startDate?: string; endDate?: string; departureDate?: string; returnDate?: string } | null {
  const raw = String(notes ?? "").split(/\r?\n/).find((line) => line.startsWith(DASHBOARD_TOURNAMENT_LOGISTICS_PREFIX));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.slice(DASHBOARD_TOURNAMENT_LOGISTICS_PREFIX.length));
    return {
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      departureDate: typeof parsed.departureDate === "string" ? parsed.departureDate : "",
      returnDate: typeof parsed.returnDate === "string" ? parsed.returnDate : "",
    };
  } catch {
    return null;
  }
}

function dashboardMatchPhase(match: DashboardMatch): DashboardMatchPhase {
  const comp = normalCompetition(match.competition).toLowerCase();
  if (["amichev", "friendly"].some((key) => comp.includes(key))) return "amichevoli";
  if (["torneo", "coppa", "trofeo", "cup"].some((key) => comp.includes(key))) return "tornei";
  const date = parseLocalDateTime(match.date);
  const month = date?.getMonth();
  return month === 0 || (month != null && month >= 7) ? "autunnale" : "primaverile";
}

function homeAwayLabel(value?: string | null): string {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "home" || raw === "casa") return "Casa";
  if (raw === "away" || raw === "trasferta") return "Trasferta";
  return value ? String(value) : "";
}

async function fetchJsonOrThrow<T>(url: string): Promise<T> {
  if (import.meta.env.DEV) console.log(`[dashboard] request GET ${url}`);
  const res = await fetch(withApi(url), { credentials: "include" });
  if (import.meta.env.DEV) console.log(`[dashboard] response GET ${url} -> ${res.status}`);
  if (!res.ok) {
    const errorText = await res.text();
    if (import.meta.env.DEV) console.error(`[dashboard] error GET ${url}:`, errorText);
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  const payload = (await res.json()) as T;
  if (import.meta.env.DEV) console.log(`[dashboard] payload GET ${url}:`, payload);
  return payload;
}

function typeStyle(type: string) {
  if (type === "urgent") return { bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", icon: <Siren className="w-4 h-4 text-red-500" />, badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (type === "warning") return { bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  return { bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", icon: <Info className="w-4 h-4 text-blue-500" />, badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
}

function notificationKey(notification: Pick<ClubNotification, "id" | "source">) {
  return `${notification.source ?? "internal"}:${notification.id}`;
}

function reasonLabel(reason: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  if (reason === "illness") return t.illness;
  if (reason === "injury") return t.injuryReason;
  if (reason === "vacation") return t.vacationReason;
  if (reason === "other") return t.otherReason;
  return reason || "";
}

export default function Dashboard() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { role, user, club, section } = useAuth();
  const nr = normalizeSessionRole(role);
  const clubIdNum = Number((club as { id?: number } | null)?.id ?? 0);
  const dashboardSection = section || "scuola_calcio";
  const canPrepareFromDashboardCalendar = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director" || nr === "technical_director";
  const canEditDashboardCalendar = nr === "secretary" || nr === "admin" || nr === "director" || nr === "presidente";

  const { data: stats, isLoading } = useGetDashboardStats({
    query: {
      queryKey: ["/api/dashboard/stats", clubIdNum, nr],
      enabled: Boolean(user && nr),
    },
  });
  const { data: allPlayers } = useListPlayers(undefined, {
    query: {
      queryKey: ["/api/players", clubIdNum, nr],
      // La sessione API ha già clubId: non attendere club.id dal client (evita gare e liste mai caricate).
      enabled: Boolean(user),
    },
  });
  const { data: allTeams } = useListTeams({
    query: {
      queryKey: ["/api/teams", clubIdNum, nr],
      enabled: Boolean(user),
    },
  });
  const canQuickCreateTrainingTools =
    nr === "coach" || nr === "fitness_coach" || nr === "technical_director";

  const queryClient = useQueryClient();
  const showSecretaryFilesCard = nr === "secretary" && clubIdNum > 0;
  const [secretaryUploadKind, setSecretaryUploadKind] = useState<"federation" | "tournament">("federation");
  const [calendarImportMode, setCalendarImportMode] = useState<"federation" | "tournament" | null>(null);
  const [calendarImportTeamId, setCalendarImportTeamId] = useState("");
  const { data: secretaryFiles = [] } = useQuery({
    queryKey: ["/api/secretary/club-files", clubIdNum],
    queryFn: fetchSecretaryClubFilesList,
    enabled: showSecretaryFilesCard,
  });

  const uploadSecretaryFileMutation = useMutation({
    mutationFn: async (payload: { fileName: string; mimeType: string; dataBase64: string }) => {
      const res = await fetch(withApi("/api/secretary/club-files"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }
      return res.json() as Promise<SecretaryClubFileRow>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/secretary/club-files", clubIdNum] });
      toast({ title: "File caricato", description: "Il file e ora disponibile nella card." });
    },
    onError: (error) => {
      let message = error instanceof Error ? error.message : "Caricamento non riuscito.";
      try {
        const parsed = JSON.parse(message) as { error?: string };
        message = parsed.error || message;
      } catch {
        // keep plain text
      }
      toast({ title: "File non caricato", description: message, variant: "destructive" });
    },
  });

  const deleteSecretaryFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const res = await fetch(withApi(`/api/secretary/club-files/${fileId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(text || `Delete failed (${res.status})`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/secretary/club-files", clubIdNum] });
    },
  });

  const handleSecretaryReferenceUpload = (file: File, kind: "federation" | "tournament") => {
    if (!file || clubIdNum <= 0) return;
    if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Formato non valido", description: "Carica un file PDF.", variant: "destructive" });
      return;
    }
    toast({ title: "Caricamento file", description: file.name });
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = typeof reader.result === "string" ? reader.result : "";
      if (!dataBase64) return;
      const label = kind === "federation" ? "[PDF Federazione]" : "[PDF Torneo]";
      uploadSecretaryFileMutation.mutate({
        fileName: `${label} ${file.name}`,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
      });
    };
    reader.onerror = () => {
      toast({ title: "File non letto", description: "Non riesco a leggere il file selezionato.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

function dashboardTeamPairKey(name?: string | null): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(?:^|\s)[12]\s*[^\s\w]*\s*(?:o\s*)?anno\b/g, " ")
    .replace(/(?:^|\s)[12]\s*(?:°|º|o)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dashboardTeamYearRank(name?: string | null): 1 | 2 | null {
  const text = String(name ?? "").toLowerCase();
  if (/(^|\s)1\s*[^\s\w]*\s*(?:o\s*)?anno\b/.test(text) || /(^|\s)1\s*(?:°|º|o|Â°)(\s|$)/.test(text)) return 1;
  if (/(^|\s)2\s*[^\s\w]*\s*(?:o\s*)?anno\b/.test(text) || /(^|\s)2\s*(?:°|º|o|Â°)(\s|$)/.test(text)) return 2;
  return null;
}

  const teamsForCalendarImport = ((allTeams ?? []) as any[]).filter((team) => Number(team?.id) > 0);
  const openCalendarPdfImport = (mode: "federation" | "tournament") => {
    setCalendarImportMode(mode);
    setCalendarImportTeamId("");
  };
  const startCalendarPdfImport = () => {
    if (!calendarImportMode || !calendarImportTeamId) return;
    setLocation(`/calendari/${calendarImportTeamId}?importPdf=${calendarImportMode}`);
  };

  const isStaffViewer = nr === "coach" || nr === "technical_director" || nr === "fitness_coach" || nr === "athletic_director";
  const isTrainingStaff = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";

  const myUserId = Number((user as any)?.id ?? 0);
  const { data: rawDraftExercises = [] } = useQuery<{ id: number; title: string; trainingDay?: string | null; createdByUserId?: number | null }[]>({
    queryKey: ["/api/exercises/drafts"],
    queryFn: () => fetchJsonOrThrow<{ id: number; title: string; trainingDay?: string | null; createdByUserId?: number | null }[]>("/api/exercises/drafts"),
    enabled: isTrainingStaff,
  });
  const draftExercises = rawDraftExercises.filter((ex) => (ex.createdByUserId ?? null) === myUserId);

  const { data: dashboardExercises = [] } = useQuery<Array<{ id: number; trainingDay?: string | null; trainingSession?: string | null }>>({
    queryKey: ["/api/exercises", clubIdNum, nr, "dashboard-tiles"],
    queryFn: () => fetchJsonOrThrow<Array<{ id: number; trainingDay?: string | null; trainingSession?: string | null }>>("/api/exercises"),
    enabled: Boolean(isTrainingStaff && user),
  });

  const { data: dashboardMembers = [] } = useQuery<Array<{ id: number; role: string }>>({
    queryKey: ["/api/clubs/me/members", clubIdNum, dashboardSection, "dashboard-tiles"],
    queryFn: () => fetchJsonOrThrow<Array<{ id: number; role: string }>>(`/api/clubs/me/members?section=${encodeURIComponent(dashboardSection)}`),
    enabled: Boolean(user),
  });

  const { data: seasons = [] } = useQuery<{ id: number; name: string; isActive: boolean }[]>({
    queryKey: ["/api/seasons"],
    queryFn: () => fetchJsonOrThrow<{ id: number; name: string; isActive: boolean }[]>("/api/seasons"),
  });

  const activeSeason = seasons.find(s => s.isActive) ?? seasons[seasons.length - 1] ?? null;
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const viewedSeason = seasons.find(s => s.id === (selectedSeasonId ?? activeSeason?.id)) ?? activeSeason;

  const now = new Date();
  const isTransitionWindow = now.getMonth() >= 6 && now.getMonth() <= 7;
  const canManageSeasons = nr === "admin" || nr === "secretary";

  const myTeams = isStaffViewer && user?.id && nr !== "technical_director"
    ? (allTeams ?? []).filter((team: any) =>
        Array.isArray(team.assignedStaff) &&
        team.assignedStaff.some((s: any) => s.userId === user.id)
      )
    : [];
  /** Direttore tecnico: panoramica su tutte le squadre del club (anche senza assegnazione personale). */
  const teamsForStaffUi = nr === "technical_director" ? (allTeams ?? []) : myTeams;

  const isClubWideTechnicalRole = nr === "technical_director" || nr === "director";

  const { data: trainingSessionsForDash = [] } = useQuery({
    queryKey: ["/api/training-sessions", clubIdNum, nr, "dashboard-tiles"],
    queryFn: () =>
      fetchJsonOrThrow<Array<{ status?: string; scheduledAt?: string }>>("/api/training-sessions"),
    enabled: Boolean(isClubWideTechnicalRole && user),
  });

  const { data: dashboardMatches = [] } = useQuery<DashboardMatch[]>({
    queryKey: ["/api/matches", clubIdNum, nr, "dashboard-calendar"],
    queryFn: () => fetchJsonOrThrow<DashboardMatch[]>("/api/matches"),
    enabled: Boolean(user),
  });

  const { data: dashboardExtraEvents = [] } = useQuery<DashboardExtraEvent[]>({
    queryKey: ["/api/calendar-extra-events", clubIdNum, nr, dashboardSection, "dashboard-calendar"],
    queryFn: () => fetchJsonOrThrow<DashboardExtraEvent[]>(`/api/calendar-extra-events?section=${dashboardSection}`),
    enabled: Boolean(user),
  });

  const [selectedCalendarItem, setSelectedCalendarItem] = useState<DashboardCalendarItem | null>(null);
  const [dashboardCalendarMonth, setDashboardCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [dashboardCalendarCollapsed, setDashboardCalendarCollapsed] = useState(false);
  const [dashboardSelectedTeamIds, setDashboardSelectedTeamIds] = useState<Set<number>>(new Set());
  const [phaseTeamPicker, setPhaseTeamPicker] = useState<null | { phase: DashboardMatchPhase; title: string }>(null);
  const [calendarEditDate, setCalendarEditDate] = useState("");
  const [calendarEditTime, setCalendarEditTime] = useState("");
  const [calendarEditLocation, setCalendarEditLocation] = useState("");
  const [calendarEditPostponed, setCalendarEditPostponed] = useState(false);
  const [calendarEditRescheduleTbd, setCalendarEditRescheduleTbd] = useState(false);
  const [calendarEditRescheduleDate, setCalendarEditRescheduleDate] = useState("");
  const [calendarEditRescheduleTime, setCalendarEditRescheduleTime] = useState("");
  const [trainingEditMode, setTrainingEditMode] = useState<"note" | "moved" | "cancelled" | "joined">("note");
  const [trainingEditDate, setTrainingEditDate] = useState("");
  const [trainingEditStartTime, setTrainingEditStartTime] = useState("");
  const [trainingEditEndTime, setTrainingEditEndTime] = useState("");
  const [trainingEditLocation, setTrainingEditLocation] = useState("");
  const [trainingEditNotes, setTrainingEditNotes] = useState("");
  const [trainingJoinTargetKey, setTrainingJoinTargetKey] = useState("");

  const dashboardOverrideFrom = useMemo(
    () => format(startOfWeek(startOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [dashboardCalendarMonth],
  );
  const dashboardOverrideTo = useMemo(
    () => format(endOfWeek(endOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    [dashboardCalendarMonth],
  );

  const { data: dashboardTrainingOverrides = [] } = useQuery<DashboardTrainingOverride[]>({
    queryKey: ["/api/training-calendar-overrides", clubIdNum, nr, dashboardSection, dashboardOverrideFrom, dashboardOverrideTo],
    queryFn: () =>
      fetchJsonOrThrow<DashboardTrainingOverride[]>(
        `/api/training-calendar-overrides?section=${dashboardSection}&from=${dashboardOverrideFrom}&to=${dashboardOverrideTo}`,
      ),
    enabled: Boolean(user),
  });

  const dashboardTeams = useMemo(
    () => ((allTeams ?? []) as DashboardTeam[]).filter((team) => Number(team?.id) > 0),
    [allTeams],
  );

  function openDashboardPhaseCalendar(phase: DashboardMatchPhase, title: string) {
    if (dashboardTeams.length === 0) {
      setLocation(`/scuola-calcio/calendar?phase=${phase}`);
      return;
    }
    if (nr !== "secretary" && dashboardTeams.length === 1) {
      setLocation(`/calendari/${dashboardTeams[0].id}?phase=${phase}`);
      return;
    }
    setPhaseTeamPicker({ phase, title });
  }

  const scheduledTrainingJoinTargetOptions = useMemo(() => {
    if (selectedCalendarItem?.kind !== "training") return [];
    const dayMap: Record<string, number> = {
      "Domenica": 0,
      "LunedÃ¬": 1,
      "Lunedi": 1,
      "MartedÃ¬": 2,
      "Martedi": 2,
      "MercoledÃ¬": 3,
      "Mercoledi": 3,
      "GiovedÃ¬": 4,
      "Giovedi": 4,
      "VenerdÃ¬": 5,
      "Venerdi": 5,
      "Sabato": 6,
    };
    const from = startOfWeek(selectedCalendarItem.date, { weekStartsOn: 1 });
    const to = endOfWeek(selectedCalendarItem.date, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: from, end: to });
    const selectedPairKey = dashboardTeamPairKey(selectedCalendarItem.teamName);
    const selectedRank = dashboardTeamYearRank(selectedCalendarItem.teamName);
    return dashboardTeams.flatMap((team) =>
      (team.trainingSchedule ?? []).flatMap((slot) => {
        const targetDay = dayMap[String(slot.day ?? "")];
        if (targetDay == null) return [];
        return days
          .filter((day) => day.getDay() === targetDay)
          .map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const start = String(slot.startTime ?? "");
            const end = String(slot.endTime ?? "");
            return {
              key: `${team.id}|${date}|${start}|${end}`,
              teamId: Number(team.id),
              teamName: team.name,
              date,
              start,
              end,
              label: `${format(day, "EEE d MMM", { locale: itLocale })} ${start}${end ? `-${end}` : ""} - ${team.name}`,
            };
          });
      }),
    ).filter((option) => {
      const optionPairKey = dashboardTeamPairKey(option.teamName);
      const optionRank = dashboardTeamYearRank(option.teamName);
      return (
        option.teamId === selectedCalendarItem.teamId &&
        option.date === selectedCalendarItem.originalDate &&
        option.start === selectedCalendarItem.originalStartTime
      ) ? false : Boolean(selectedPairKey && selectedRank && optionPairKey === selectedPairKey && optionRank && optionRank !== selectedRank);
    });
  }, [dashboardTeams, selectedCalendarItem]);

  useEffect(() => {
    const ids = dashboardTeams.map((team) => Number(team.id));
    if (ids.length === 0) {
      setDashboardSelectedTeamIds(new Set());
      return;
    }
    setDashboardSelectedTeamIds((prev) => {
      if (prev.size === 0) return new Set(ids);
      const next = new Set<number>();
      ids.forEach((id) => {
        if (prev.has(id)) next.add(id);
      });
      return next.size > 0 ? next : new Set(ids);
    });
  }, [dashboardTeams]);

  useEffect(() => {
    if (selectedCalendarItem?.kind !== "match") {
      setCalendarEditDate("");
      setCalendarEditTime("");
      setCalendarEditLocation("");
      setCalendarEditPostponed(false);
      setCalendarEditRescheduleTbd(false);
      setCalendarEditRescheduleDate("");
      setCalendarEditRescheduleTime("");
      return;
    }
    const date = parseLocalDateTime(selectedCalendarItem.match.date) ?? selectedCalendarItem.date;
    const rescheduleDate = parseLocalDateTime(selectedCalendarItem.match.rescheduleDate);
    setCalendarEditDate(format(date, "yyyy-MM-dd"));
    setCalendarEditTime(format(date, "HH:mm"));
    setCalendarEditLocation(selectedCalendarItem.match.location ?? "");
    setCalendarEditPostponed(!!selectedCalendarItem.match.isPostponed);
    setCalendarEditRescheduleTbd(!!selectedCalendarItem.match.rescheduleTbd);
    setCalendarEditRescheduleDate(rescheduleDate ? format(rescheduleDate, "yyyy-MM-dd") : "");
    setCalendarEditRescheduleTime(rescheduleDate ? format(rescheduleDate, "HH:mm") : "");
  }, [selectedCalendarItem]);

  useEffect(() => {
    if (selectedCalendarItem?.kind !== "training") {
      setTrainingEditMode("note");
      setTrainingEditDate("");
      setTrainingEditStartTime("");
      setTrainingEditEndTime("");
      setTrainingEditLocation("");
      setTrainingEditNotes("");
      setTrainingJoinTargetKey("");
      return;
    }
    const item = selectedCalendarItem;
    const override = item.trainingOverride;
    setTrainingEditMode(
      override?.status === "cancelled"
        ? "cancelled"
        : override?.status === "moved"
          ? "moved"
          : override?.status === "joined"
            ? "joined"
            : "note",
    );
    setTrainingEditDate(override?.newDate ?? format(item.date, "yyyy-MM-dd"));
    setTrainingEditStartTime(override?.newStartTime ?? item.originalStartTime ?? item.time.split("-")[0] ?? "");
    setTrainingEditEndTime(override?.newEndTime ?? item.originalEndTime ?? item.time.split("-")[1] ?? "");
    setTrainingEditLocation(override?.location ?? "");
    setTrainingEditNotes(override?.notes ?? "");
    setTrainingJoinTargetKey(
      override?.targetTeamId
        ? String(override.targetTeamId)
        : "",
    );
  }, [selectedCalendarItem]);

  const updateDashboardMatchMutation = useMutation({
    mutationFn: async (payload: {
      matchId: number;
      date: string;
      location: string;
      isPostponed: boolean;
      rescheduleTbd: boolean;
      rescheduleDate: string | null;
    }) => {
      const res = await fetch(withApi(`/api/matches/${payload.matchId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: payload.date,
          location: payload.location,
          isPostponed: payload.isPostponed,
          rescheduleTbd: payload.isPostponed ? payload.rescheduleTbd : false,
          rescheduleDate: payload.isPostponed && !payload.rescheduleTbd ? payload.rescheduleDate : null,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Aggiornamento non riuscito");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      await queryClient.refetchQueries({ queryKey: ["/api/matches"], type: "active" });
      setSelectedCalendarItem(null);
      toast({ title: "Evento aggiornato", description: "Data, orario e luogo sono stati salvati." });
    },
    onError: (error: any) => {
      toast({
        title: "Aggiornamento non riuscito",
        description: error?.message || "Riprova tra poco.",
        variant: "destructive",
      });
    },
  });

  const updateDashboardTrainingMutation = useMutation({
    mutationFn: async (payload: {
      teamId: number;
      originalDate: string;
      originalStartTime: string;
      originalEndTime: string;
      status: "note" | "moved" | "cancelled" | "joined";
      newDate: string | null;
      newStartTime: string | null;
      newEndTime: string | null;
      targetTeamId?: number | null;
      targetDate?: string | null;
      targetStartTime?: string | null;
      targetEndTime?: string | null;
      location: string | null;
      notes: string | null;
    }) => {
      const res = await fetch(withApi("/api/training-calendar-overrides"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()) || "Aggiornamento allenamento non riuscito");
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/training-calendar-overrides"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/training-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/club/notifications"] }),
      ]);
      setSelectedCalendarItem(null);
      toast({ title: "Allenamento aggiornato", description: "Calendario, sessioni collegate e bacheca sono stati aggiornati." });
    },
    onError: (error: any) => {
      toast({
        title: "Aggiornamento non riuscito",
        description: error?.message || "Riprova tra poco.",
        variant: "destructive",
      });
    },
  });

  const dashboardCalendarItems = useMemo<DashboardCalendarItem[]>(() => {
    const teams = dashboardSelectedTeamIds.size > 0
      ? dashboardTeams.filter((team) => dashboardSelectedTeamIds.has(Number(team.id)))
      : [];
    const allowedTeamIds = new Set(teams.map((team) => Number(team.id)));
    const teamById = new Map<number, DashboardTeam>();
    teams.forEach((team) => teamById.set(Number(team.id), team));
    const nowDay = startOfDay(new Date());
    const monthStart = startOfWeek(startOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 });
    const monthEnd = endOfWeek(endOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 });
    const maxDay = monthEnd;
    const items: DashboardCalendarItem[] = [];
    const overrideByOccurrence = new Map<string, DashboardTrainingOverride>();
    const joinedByTargetOccurrence = new Map<string, DashboardTrainingOverride>();
    dashboardTrainingOverrides.forEach((override) => {
      overrideByOccurrence.set(
        `${override.teamId}|${override.originalDate}|${override.originalStartTime}`,
        override,
      );
      if (override.status === "joined" && override.targetTeamId && override.targetDate && override.targetStartTime) {
        joinedByTargetOccurrence.set(
          `${override.targetTeamId}|${override.targetDate}|${override.targetStartTime}`,
          override,
        );
      }
    });

    teams.forEach((team) => {
      (team.trainingSchedule ?? []).forEach((slot) => {
        const dayMap: Record<string, number> = {
          "Domenica": 0,
          "Lunedì": 1,
          "Lunedi": 1,
          "Martedì": 2,
          "Martedi": 2,
          "Mercoledì": 3,
          "Mercoledi": 3,
          "Giovedì": 4,
          "Giovedi": 4,
          "Venerdì": 5,
          "Venerdi": 5,
          "Sabato": 6,
        };
        const targetDay = dayMap[String(slot.day ?? "")];
        if (targetDay == null) return;
        const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
        monthDays.forEach((day) => {
          if (day.getDay() !== targetDay) return;
          const at = combineLocalDateAndTime(day, slot.startTime);
          if (at > maxDay) return;
          const originalDate = format(day, "yyyy-MM-dd");
          const originalStartTime = String(slot.startTime ?? "");
          const originalEndTime = String(slot.endTime ?? "");
          const override = overrideByOccurrence.get(`${team.id}|${originalDate}|${originalStartTime}`);
          const joinedIntoThis =
            joinedByTargetOccurrence.get(`${team.id}|${originalDate}|${originalStartTime}`) ??
            Array.from(joinedByTargetOccurrence.values()).find(
              (joined) =>
                Number(joined.targetTeamId) === Number(team.id) &&
                joined.targetDate === originalDate &&
                joined.targetStartTime === originalStartTime,
            );
          if (joinedIntoThis && joinedIntoThis.teamId !== team.id) {
            const sourceTeam = teamById.get(Number(joinedIntoThis.teamId));
            items.push({
              kind: "training",
              key: `training-joined-target-${joinedIntoThis.id}`,
              date: at,
              time: `${originalStartTime}${originalEndTime ? `-${originalEndTime}` : ""}`,
              title: `Allenamento congiunto ${team.name}${sourceTeam ? ` + ${sourceTeam.name}` : ""}`,
              subtitle: sourceTeam ? `${team.name} con ${sourceTeam.name}` : team.name,
              teamId: team.id,
              teamName: team.name,
              originalDate,
              originalStartTime,
              originalEndTime,
              trainingStatus: "joined",
              trainingOverride: joinedIntoThis,
              trainingNotes: joinedIntoThis.notes ?? null,
            });
            return;
          }
          if (override?.status === "cancelled") {
            items.push({
              kind: "training",
              key: `training-cancelled-${override.id}`,
              date: at,
              time: `${originalStartTime}${originalEndTime ? `-${originalEndTime}` : ""}`,
              title: `Allenamento annullato ${team.name}`,
              subtitle: team.name,
              teamId: team.id,
              teamName: team.name,
              originalDate,
              originalStartTime,
              originalEndTime,
              trainingStatus: "cancelled",
              trainingOverride: override,
              trainingNotes: override.notes ?? null,
            });
            return;
          }
          if ((override?.status === "moved" || override?.status === "joined") && override.newDate && override.newStartTime) {
            items.push({
              kind: "training",
              key: `training-${override.status}-original-${override.id}`,
              date: at,
              time: `${originalStartTime}${originalEndTime ? `-${originalEndTime}` : ""}`,
              title: override.status === "joined" ? `Allenamento congiunto ${team.name}` : `Allenamento spostato ${team.name}`,
              subtitle: team.name,
              teamId: team.id,
              teamName: team.name,
              originalDate,
              originalStartTime,
              originalEndTime,
              trainingStatus: override.status === "joined" ? "joined-original" : "moved-original",
              trainingOverride: override,
              trainingNotes: override.notes ?? null,
            });
            const movedAt = combineLocalDateAndTime(new Date(`${override.newDate}T00:00:00`), override.newStartTime);
            if (movedAt >= monthStart && movedAt <= monthEnd) {
              items.push({
                kind: "training",
                key: `training-${override.status}-${override.id}`,
                date: movedAt,
                time: `${override.newStartTime}${override.newEndTime ? `-${override.newEndTime}` : ""}`,
                title: override.status === "joined" ? `Allenamento congiunto ${team.name}` : `Recupero allenamento ${team.name}`,
                subtitle: override.status === "joined" ? `Congiunto dal ${format(day, "d MMM", { locale: itLocale })}` : `Recupero del ${format(day, "d MMM", { locale: itLocale })}`,
                teamId: team.id,
                teamName: team.name,
                originalDate,
                originalStartTime,
                originalEndTime,
                trainingStatus: override.status === "joined" ? "joined" : "moved",
                trainingOverride: override,
                trainingNotes: override.notes ?? null,
              });
            }
            return;
          }
          if (override?.status === "note") {
            items.push({
              kind: "training",
              key: `training-note-${override.id}`,
              date: at,
              time: `${originalStartTime}${originalEndTime ? `-${originalEndTime}` : ""}`,
              title: `Allenamento ${team.name}`,
              subtitle: team.name,
              teamId: team.id,
              teamName: team.name,
              originalDate,
              originalStartTime,
              originalEndTime,
              trainingStatus: "note",
              trainingOverride: override,
              trainingNotes: override.notes ?? null,
            });
            return;
          }
          items.push({
            kind: "training",
            key: `training-${team.id}-${format(day, "yyyy-MM-dd")}-${slot.startTime}`,
            date: at,
            time: `${slot.startTime ?? ""}${slot.endTime ? `-${slot.endTime}` : ""}`,
            title: `Allenamento ${team.name}`,
            subtitle: team.name,
            teamId: team.id,
            teamName: team.name,
            originalDate,
            originalStartTime,
            originalEndTime,
            trainingStatus: "regular",
          });
        });
      });
    });

    dashboardTrainingOverrides.forEach((override) => {
      if (override.status !== "joined" || !override.targetTeamId || !override.targetDate || !override.targetStartTime) return;
      const targetTeamId = Number(override.targetTeamId);
      if (!allowedTeamIds.has(targetTeamId)) return;
      const targetTeam = dashboardTeams.find((team) => Number(team.id) === targetTeamId);
      if (!targetTeam) return;
      const sourceTeam = dashboardTeams.find((team) => Number(team.id) === Number(override.teamId));
      const targetAt = combineLocalDateAndTime(new Date(`${override.targetDate}T00:00:00`), override.targetStartTime);
      if (targetAt < monthStart || targetAt > monthEnd) return;
      const key = `training-joined-target-${override.id}`;
      if (items.some((item) => item.key === key)) return;
      items.push({
        kind: "training",
        key,
        date: targetAt,
        time: `${override.targetStartTime}${override.targetEndTime ? `-${override.targetEndTime}` : ""}`,
        title: `Allenamento congiunto ${targetTeam.name}${sourceTeam ? ` + ${sourceTeam.name}` : ""}`,
        subtitle: sourceTeam ? `${targetTeam.name} con ${sourceTeam.name}` : targetTeam.name,
        teamId: targetTeam.id,
        teamName: targetTeam.name,
        originalDate: override.targetDate,
        originalStartTime: override.targetStartTime,
        originalEndTime: override.targetEndTime ?? "",
        trainingStatus: "joined",
        trainingOverride: override,
        trainingNotes: override.notes ?? null,
      });
    });

    const tournamentGroups = new Map<string, DashboardMatch[]>();
    dashboardMatches.forEach((match) => {
      const date = parseLocalDateTime(match.date);
      const recoveryDate = match.isPostponed && match.rescheduleDate && !match.rescheduleTbd
        ? parseLocalDateTime(match.rescheduleDate)
        : null;
      const originalInMonth = !!date && date >= monthStart && date <= monthEnd;
      const recoveryInMonth = !!recoveryDate && recoveryDate >= monthStart && recoveryDate <= monthEnd;
      if (!date || (!originalInMonth && !recoveryInMonth)) return;
      if (match.teamId && !allowedTeamIds.has(Number(match.teamId))) return;
      const team = match.teamId ? teamById.get(Number(match.teamId)) : undefined;
      if (recoveryDate) {
        if (originalInMonth) {
          items.push({
            kind: "match",
            key: `match-${match.id}-postponed-original`,
            date,
            time: matchTimeLabel(date),
            title: `${team?.name ?? match.teamName ?? "Squadra"} vs ${match.opponent}`,
            subtitle: ["Rinviata", homeAwayLabel(match.homeAway), match.competition].filter(Boolean).join(" - "),
            teamId: Number(match.teamId ?? 0) || undefined,
            teamName: team?.name ?? match.teamName ?? undefined,
            match,
          });
        }
        if (recoveryInMonth) {
          items.push({
            kind: "match",
            key: `match-${match.id}-recovery`,
            date: recoveryDate,
            time: matchTimeLabel(recoveryDate),
            title: `Recupero: ${team?.name ?? match.teamName ?? "Squadra"} vs ${match.opponent}`,
            subtitle: [homeAwayLabel(match.homeAway), match.competition].filter(Boolean).join(" - "),
            teamId: Number(match.teamId ?? 0) || undefined,
            teamName: team?.name ?? match.teamName ?? undefined,
            match: { ...match, date: match.rescheduleDate as string, isPostponed: false, rescheduleDate: match.date },
          });
        }
        return;
      }
      if (isTournamentMatch(match) && match.competition) {
        const key = `${normalCompetition(match.competition)}|${match.teamId ?? ""}`;
        const list = tournamentGroups.get(key) ?? [];
        list.push(match);
        tournamentGroups.set(key, list);
        return;
      }
      items.push({
        kind: "match",
        key: `match-${match.id}`,
        date,
        time: matchTimeLabel(date),
        title: `${team?.name ?? match.teamName ?? "Squadra"} vs ${match.opponent}`,
        subtitle: [homeAwayLabel(match.homeAway), match.competition].filter(Boolean).join(" · "),
        teamId: Number(match.teamId ?? 0) || undefined,
        teamName: team?.name ?? match.teamName ?? undefined,
        match,
      });
    });

    tournamentGroups.forEach((matches, key) => {
      const sorted = [...matches].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const firstDate = parseLocalDateTime(sorted[0]?.date);
      if (!firstDate) return;
      const lastDate = parseLocalDateTime(sorted[sorted.length - 1]?.date) ?? firstDate;
      const logistics = sorted.map((match) => decodeDashboardTournamentLogistics(match.notes)).find(Boolean);
      const periodStart =
        parseDashboardTournamentDate(logistics?.departureDate) ??
        parseDashboardTournamentDate(logistics?.startDate) ??
        startOfDay(firstDate);
      const periodEnd =
        parseDashboardTournamentDate(logistics?.returnDate) ??
        parseDashboardTournamentDate(logistics?.endDate) ??
        startOfDay(lastDate);
      const displayStart = periodStart <= periodEnd ? periodStart : startOfDay(firstDate);
      const displayEnd = periodStart <= periodEnd ? periodEnd : startOfDay(lastDate);
      const periodText = displayEnd.getTime() > displayStart.getTime()
        ? `Periodo ${format(displayStart, "d MMM", { locale: itLocale })}-${format(displayEnd, "d MMM", { locale: itLocale })}`
        : "";
      const first = sorted[0];
      const team = first.teamId ? teamById.get(Number(first.teamId)) : undefined;
      const tournamentSubtitle = [team?.name ?? first.teamName ?? "Squadra", periodText, `${sorted.length} partite/eventi`].filter(Boolean).join(" - ");
      items.push({
        kind: "tournament",
        key: `tournament-${key}`,
        date: combineLocalDateAndTime(displayStart, "09:00"),
        dateEnd: displayEnd,
        time: "Tutto il giorno",
        title: normalCompetition(first.competition).replace(/^torneo:\s*/i, "Torneo: ") || "Torneo",
        subtitle: tournamentSubtitle,
        teamId: Number(first.teamId ?? 0) || undefined,
        teamName: team?.name ?? first.teamName ?? undefined,
        matches: sorted,
      });
    });

    dashboardExtraEvents.forEach((evt) => {
      if (Array.isArray(evt.teamIds) && evt.teamIds.length > 0 && !evt.teamIds.some((id) => allowedTeamIds.has(Number(id)))) return;
      const from = parseLocalDateTime(`${evt.dateFrom}T00:00:00`);
      const to = parseLocalDateTime(`${evt.dateTo}T23:59:59`);
      if (!from || !to) return;
      eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach((day) => {
        if (day < startOfDay(from) || day > to || day > maxDay) return;
        if (evt.frequency === "selected_days" && Array.isArray(evt.weekdays) && !evt.weekdays.includes(day.getDay())) return;
        const at = combineLocalDateAndTime(day, evt.startTime);
        items.push({
          kind: "extra",
          key: `extra-${evt.id}-${format(day, "yyyy-MM-dd")}`,
          date: at,
          time: `${evt.startTime ?? ""}${evt.endTime ? `-${evt.endTime}` : ""}` || matchTimeLabel(at),
          title: evt.title,
          subtitle: evt.category ? String(evt.category).replace(/_/g, " ") : "Impegno",
        });
      });
    });

    return items
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 200);
  }, [dashboardTeams, dashboardMatches, dashboardExtraEvents, dashboardCalendarMonth, dashboardSelectedTeamIds, dashboardTrainingOverrides]);

  const dashboardCalendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(dashboardCalendarMonth), { weekStartsOn: 1 }),
      }),
    [dashboardCalendarMonth],
  );

  const dashboardEventsByDay = useMemo(() => {
    const map = new Map<string, DashboardCalendarItem[]>();
    dashboardCalendarItems.forEach((item) => {
      const itemStart = startOfDay(item.date);
      const itemEnd = item.kind === "tournament" && item.dateEnd ? startOfDay(item.dateEnd) : itemStart;
      eachDayOfInterval({ start: itemStart <= itemEnd ? itemStart : itemEnd, end: itemEnd >= itemStart ? itemEnd : itemStart }).forEach((day) => {
        const key = format(day, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      });
    });
    return map;
  }, [dashboardCalendarItems]);

  const trainingJoinTargetOptions = useMemo(() => {
    if (selectedCalendarItem?.kind !== "training") return scheduledTrainingJoinTargetOptions;
    const selectedPairKey = dashboardTeamPairKey(selectedCalendarItem.teamName);
    const selectedRank = dashboardTeamYearRank(selectedCalendarItem.teamName);
    const from = startOfWeek(selectedCalendarItem.date, { weekStartsOn: 1 });
    const to = endOfWeek(selectedCalendarItem.date, { weekStartsOn: 1 });
    const byKey = new Map<string, {
      key: string;
      teamId: number;
      teamName: string;
      date: string;
      start: string;
      end: string;
      label: string;
    }>();
    scheduledTrainingJoinTargetOptions.forEach((option) => byKey.set(option.key, option));
    dashboardCalendarItems.forEach((item) => {
      if (item.kind !== "training" || !item.teamId || !item.originalStartTime) return;
      if (item.date < from || item.date > to) return;
      if (item.trainingStatus === "cancelled" || item.trainingStatus === "moved-original" || item.trainingStatus === "joined-original") return;
      const itemPairKey = dashboardTeamPairKey(item.teamName);
      const itemRank = dashboardTeamYearRank(item.teamName);
      if (!selectedPairKey || !selectedRank || itemPairKey !== selectedPairKey || !itemRank || itemRank === selectedRank) return;
      if (
        item.teamId === selectedCalendarItem.teamId &&
        item.originalDate === selectedCalendarItem.originalDate &&
        item.originalStartTime === selectedCalendarItem.originalStartTime
      ) return;
      const date = format(item.date, "yyyy-MM-dd");
      const start = item.time.split("-")[0] || item.originalStartTime;
      const end = item.time.split("-")[1] || item.originalEndTime || "";
      const key = `${item.teamId}|${date}|${start}|${end}`;
      byKey.set(key, {
        key,
        teamId: Number(item.teamId),
        teamName: item.teamName ?? "Squadra",
        date,
        start,
        end,
        label: `${format(item.date, "EEE d MMM", { locale: itLocale })} ${start}${end ? `-${end}` : ""} - ${item.teamName ?? "Squadra"}`,
      });
    });
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [dashboardCalendarItems, scheduledTrainingJoinTargetOptions, selectedCalendarItem]);

  const trainingJoinTwinTeam = useMemo(() => {
    if (selectedCalendarItem?.kind !== "training" || !selectedCalendarItem.teamId) return null;
    const currentTeam = dashboardTeams.find((team) => Number(team.id) === Number(selectedCalendarItem.teamId));
    const currentName = currentTeam?.name ?? selectedCalendarItem.teamName;
    const pairKey = dashboardTeamPairKey(currentName);
    const rank = dashboardTeamYearRank(currentName);
    if (!pairKey || !rank) return null;
    return dashboardTeams.find((team) => {
      if (Number(team.id) === Number(selectedCalendarItem.teamId)) return false;
      return dashboardTeamPairKey(team.name) === pairKey && dashboardTeamYearRank(team.name) !== rank;
    }) ?? null;
  }, [dashboardTeams, selectedCalendarItem]);

  const dashboardWeekPreviewItems = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return dashboardCalendarItems
      .filter((item) => {
        const itemStart = startOfDay(item.date);
        const itemEnd = item.kind === "tournament" && item.dateEnd ? startOfDay(item.dateEnd) : itemStart;
        return itemStart <= weekEnd && itemEnd >= today;
      })
      .slice(0, 8);
  }, [dashboardCalendarItems]);

  const dashboardUpcomingCalendarTrainingCount = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return dashboardCalendarItems.filter((item) => {
      if (item.kind !== "training") return false;
      if (item.date < today || item.date > weekEnd) return false;
      return !["cancelled", "moved-original", "joined-original"].includes(item.trainingStatus ?? "regular");
    }).length;
  }, [dashboardCalendarItems]);

  const dashboardMatchSummary = useMemo(() => {
    const summary = {
      autunnale: 0,
      primaverile: 0,
      tournaments: new Set<string>(),
      amichevoli: 0,
    };
    dashboardMatches.forEach((match) => {
      const phase = dashboardMatchPhase(match);
      if (phase === "tornei") {
        const competition = normalCompetition(match.competition) || "Torneo";
        summary.tournaments.add(`${match.teamId ?? "team"}|${competition.toLowerCase()}`);
        return;
      }
      if (phase === "amichevoli") {
        summary.amichevoli += 1;
        return;
      }
      summary[phase] += 1;
    });
    return {
      autunnale: summary.autunnale,
      primaverile: summary.primaverile,
      tornei: summary.tournaments.size,
      amichevoli: summary.amichevoli,
    };
  }, [dashboardMatches]);

  const dashboardTeamCount = useMemo(() => {
    const fromApi = stats?.totalTeams ?? 0;
    const n = allTeams?.length ?? 0;
    if (isClubWideTechnicalRole && n > fromApi) return n;
    return fromApi;
  }, [stats?.totalTeams, allTeams?.length, isClubWideTechnicalRole]);
  const dashboardSectionLabel = dashboardSection === "settore_giovanile"
    ? "Settore giovanile"
    : dashboardSection === "prima_squadra"
      ? "Prima squadra"
      : "Scuola calcio";

  const dashboardTeamYearsLabel = useMemo(() => {
    const teamNames = ((allTeams as any[] | undefined) ?? [])
      .map((team) => String(team?.name ?? "").trim())
      .filter(Boolean);
    if (teamNames.length === 0) return "Nessuna";
    const preview = teamNames.slice(0, 2).join(", ");
    return teamNames.length > 2 ? `${preview} +${teamNames.length - 2}` : preview;
  }, [allTeams]);

  const dashboardPlayerCount = useMemo(() => {
    const fromApi = stats?.totalPlayers ?? 0;
    const n = allPlayers?.length ?? 0;
    if (isClubWideTechnicalRole && n > fromApi) return n;
    return fromApi;
  }, [stats?.totalPlayers, allPlayers?.length, isClubWideTechnicalRole]);

  const dashboardPlayerSummary = useMemo(() => {
    const players = (allPlayers as any[] | undefined) ?? [];
    const hasPlayerList = players.length > 0;
    const isActivePlayer = (player: any) => player.status !== "inactive";
    const active = hasPlayerList
      ? players.filter(isActivePlayer).length
      : dashboardPlayerCount;
    const inactive = hasPlayerList
      ? players.filter((player) => player.status === "inactive").length
      : 0;
    const available = hasPlayerList
      ? players.filter((player) => isActivePlayer(player) && player.available !== false).length
      : active;
    const unavailable = hasPlayerList
      ? players.filter((player) => isActivePlayer(player) && player.available === false).length
      : 0;
    return { active, inactive, available, unavailable };
  }, [allPlayers, dashboardPlayerCount]);

  const dashboardUpcomingCount = useMemo(() => {
    const fromApi = stats?.upcomingTrainingSessions ?? 0;
    if (!isClubWideTechnicalRole || trainingSessionsForDash.length === 0) {
      return Math.max(fromApi, dashboardUpcomingCalendarTrainingCount);
    }
    const nowMs = Date.now();
    const n = trainingSessionsForDash.filter(
      (s) => s.status === "scheduled" && new Date(s.scheduledAt ?? 0).getTime() >= nowMs,
    ).length;
    return Math.max(fromApi, n, dashboardUpcomingCalendarTrainingCount);
  }, [stats?.upcomingTrainingSessions, trainingSessionsForDash, isClubWideTechnicalRole, dashboardUpcomingCalendarTrainingCount]);

  const dashboardExerciseSummary = useMemo(() => {
    const exercises = dashboardExercises ?? [];
    const associated = exercises.filter((exercise) => Boolean(exercise.trainingDay || exercise.trainingSession));
    const free = exercises.filter((exercise) => !exercise.trainingDay && !exercise.trainingSession);
    const completeSessionKeys = new Set(
      associated
        .map((exercise) => `${exercise.trainingDay ?? ""}|${exercise.trainingSession ?? ""}`)
        .filter((key) => key !== "|"),
    );
    return {
      associated: associated.length,
      free: free.length,
      completeSessions: completeSessionKeys.size,
    };
  }, [dashboardExercises]);

  const dashboardStaffRoleSummary = useMemo(() => {
    const roles = new Map<string, number>();
    dashboardMembers.forEach((member) => {
      const label = dashboardRoleLabel(member.role);
      roles.set(label, (roles.get(label) ?? 0) + 1);
    });
    return Array.from(roles.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);
  }, [dashboardMembers]);
  const dashboardStaffCount = dashboardMembers.length || stats?.totalMembers || 0;

  const [alertDismissed, setAlertDismissed] = useState(false);

  // --- Notifications state ---
  const [notifications, setNotifications] = useState<ClubNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notificationsCollapsed, setNotificationsCollapsed] = useState(true);
  const [notifFolderFilter, setNotifFolderFilter] = useState<NotificationFolder>("received");
  const [notifSourceFilter, setNotifSourceFilter] = useState("all");
  const [notifTypeFilter, setNotifTypeFilter] = useState("all");
  const [notifSeasonFilter, setNotifSeasonFilter] = useState("all");
  const [notifRecipientFilter, setNotifRecipientFilter] = useState("all");
  const [notifSurnameFilter, setNotifSurnameFilter] = useState("");
  const [selectedNotification, setSelectedNotification] = useState<ClubNotification | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formType, setFormType] = useState("info");
  const [formSending, setFormSending] = useState(false);
  const [formError, setFormError] = useState("");

  const canSend = nr === "admin" || nr === "presidente" || nr === "director" || nr === "technical_director";
  const canSeePlatformAnnouncements = nr === "admin" || nr === "presidente" || nr === "director";

  const moveNotificationToTrash = async (notification: ClubNotification) => {
    if (notification.source !== "internal") {
      setNotifications((prev) => prev.map((n) => notificationKey(n) === notificationKey(notification) ? { ...n, isTrashed: true } : n));
      setSelectedNotification((prev) => prev && notificationKey(prev) === notificationKey(notification) ? { ...prev, isTrashed: true } : prev);
      return;
    }
    const res = await fetch(withApi(`/api/club/notifications/${notification.id}/trash`), { method: "PATCH", credentials: "include" });
    if (!res.ok) {
      toast({ title: "Cestino non aggiornato", description: "Riprova tra poco.", variant: "destructive" });
      return;
    }
    setNotifications((prev) => prev.map((n) => notificationKey(n) === notificationKey(notification) ? { ...n, isTrashed: true } : n));
    setSelectedNotification((prev) => prev && notificationKey(prev) === notificationKey(notification) ? { ...prev, isTrashed: true } : prev);
  };

  const restoreNotificationFromTrash = async (notification: ClubNotification) => {
    if (notification.source !== "internal") {
      setNotifications((prev) => prev.map((n) => notificationKey(n) === notificationKey(notification) ? { ...n, isTrashed: false } : n));
      setSelectedNotification((prev) => prev && notificationKey(prev) === notificationKey(notification) ? { ...prev, isTrashed: false } : prev);
      return;
    }
    const res = await fetch(withApi(`/api/club/notifications/${notification.id}/restore`), { method: "PATCH", credentials: "include" });
    if (!res.ok) {
      toast({ title: "Ripristino non riuscito", description: "Riprova tra poco.", variant: "destructive" });
      return;
    }
    setNotifications((prev) => prev.map((n) => notificationKey(n) === notificationKey(notification) ? { ...n, isTrashed: false } : n));
    setSelectedNotification((prev) => prev && notificationKey(prev) === notificationKey(notification) ? { ...prev, isTrashed: false } : prev);
  };

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    setNotifError("");
    try {
      const [internalRes, platformRes] = await Promise.all([
        fetch(withApi("/api/club/notifications"), { credentials: "include" }),
        (canSeePlatformAnnouncements ? fetch(withApi("/api/club/platform-announcements"), { credentials: "include" }) : Promise.resolve(null)),
      ]);

      if (import.meta.env.DEV) console.log("[dashboard] response GET /api/club/notifications ->", internalRes.status);
      if (platformRes) {
        if (import.meta.env.DEV) console.log("[dashboard] response GET /api/club/platform-announcements ->", platformRes.status);
      }
      if (!internalRes.ok) {
        throw new Error(`Request failed (${internalRes.status}) for /api/club/notifications`);
      }

      const internal: ClubNotification[] = internalRes.ok
        ? (await internalRes.json()).map((n: any) => ({ ...n, isTrashed: Boolean(n.isTrashed), isSent: Boolean(n.isSent), source: "internal" as const }))
        : [];

      const platform: ClubNotification[] = (platformRes && platformRes.ok)
        ? (await platformRes.json()).map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            type: n.type === "critical" ? "urgent" : n.type,
            createdAt: n.sentAt,
            isRead: n.isRead,
            isTrashed: false,
            isSent: false,
            source: "platform" as const,
          }))
        : [];

      const merged = [...platform, ...internal].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setNotifications(merged);
      if (import.meta.env.DEV) console.log("[dashboard] payload notifications:", merged);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[dashboard] notifications error:", error);
      setNotifications([]);
      setNotifError("Errore caricamento comunicazioni dal backend.");
    }
    setNotifLoading(false);
  }, [canSeePlatformAnnouncements]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: number, source?: string) => {
    const url = source === "platform"
      ? `/api/club/platform-announcements/${id}/read`
      : `/api/club/notifications/${id}/read`;
    await fetch(withApi(url), { method: "PATCH", credentials: "include" });
    setNotifications(prev => prev.map(n => n.id === id && n.source === source ? { ...n, isRead: true } : n));
  };

  const openNotificationDetails = (notification: ClubNotification) => {
    setSelectedNotification(notification);
    if (!notification.isRead && notification.source !== "player_notes") {
      void markRead(notification.id, notification.source);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      const url = n.source === "platform"
        ? `/api/club/platform-announcements/${n.id}/read`
        : `/api/club/notifications/${n.id}/read`;
      await fetch(withApi(url), { method: "PATCH", credentials: "include" });
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const openPlayerNotesInbox = (notification: ClubNotification) => {
    if (notification.playerId) {
      setLocation(`/players?openPlayerId=${notification.playerId}&focus=notes`);
      return;
    }
    setLocation("/players");
  };

  const sendNotification = async () => {
    if (!formTitle.trim() || !formMessage.trim()) { setFormError("Compila titolo e messaggio."); return; }
    setFormSending(true);
    setFormError("");
    try {
      const res = await fetch(withApi("/api/club/notifications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: formTitle.trim(), message: formMessage.trim(), type: formType }),
      });
      if (!res.ok) { setFormError("Errore durante l'invio."); setFormSending(false); return; }
      await res.json();
      setFormTitle(""); setFormMessage(""); setFormType("info"); setShowForm(false);
      await fetchNotifications();
    } catch { setFormError("Errore di rete."); }
    setFormSending(false);
  };

  const playerNoteAlerts: ClubNotification[] = useMemo(() => {
    const myRecipient = noteRecipientForRole(nr);
    if (!myRecipient) return [];
    const players = (allPlayers as Array<{ id?: number; firstName?: string; lastName?: string; notes?: string | null; teamId?: number | null; teamName?: string | null }> | undefined) ?? [];
    const alerts: ClubNotification[] = [];
    for (const player of players) {
      const noteText = stripPlayerMeta(player.notes);
      const thread = parsePlayerThread(noteText);
      let playerPendingCount = 0;
      let latestCreatedAt: string | null = null;
      for (const n of thread) {
        if (n?.recipient !== myRecipient) continue;
        if (!n?.requiresResponse) continue;
        if (n?.repliedAt) continue;
        playerPendingCount += 1;
        const createdAt = String(n?.createdAt ?? "");
        if (createdAt && (!latestCreatedAt || new Date(createdAt).getTime() > new Date(latestCreatedAt).getTime())) {
          latestCreatedAt = createdAt;
        }
      }
      if (playerPendingCount > 0) {
        const fullName = `${String(player.firstName ?? "").trim()} ${String(player.lastName ?? "").trim()}`.trim() || "Giocatore";
        const playerTeam = ((allTeams ?? []) as Array<{ id?: number; seasonName?: string | null; name?: string }>).find(
          (t) => Number(t?.id ?? 0) === Number(player.teamId ?? 0)
        );
        alerts.push({
          id: -(900000 + Number(player.id ?? alerts.length + 1)),
          playerId: Number(player.id ?? 0) || undefined,
          title: `Nota giocatore: ${fullName}`,
          message: `${playerPendingCount} richiesta/e in attesa verso ${noteRecipientLabel(myRecipient)}.`,
          type: "warning",
          createdAt: latestCreatedAt ?? new Date().toISOString(),
          isRead: false,
          source: "player_notes",
          recipientTag: noteRecipientLabel(myRecipient),
          seasonTag: String(playerTeam?.seasonName ?? "").trim() || String(player.teamName ?? "").trim() || "—",
          surnameTag: String(player.lastName ?? "").trim(),
        });
      }
    }
    return alerts;
  }, [nr, allPlayers, allTeams]);

  const notificationsView = useMemo(
    () =>
      [...notifications, ...playerNoteAlerts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notifications, playerNoteAlerts]
  );

  const notificationSeasonOptions = useMemo(
    () =>
      Array.from(
        new Set(
          notificationsView
            .map((n) => String(n.seasonTag ?? "").trim())
            .filter((v) => v.length > 0 && v !== "—")
        )
      ).sort((a, b) => a.localeCompare(b)),
    [notificationsView]
  );

  const notificationRecipientOptions = useMemo(
    () =>
      Array.from(
        new Set(
          notificationsView
            .map((n) => String(n.recipientTag ?? "").trim())
            .filter((v) => v.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [notificationsView]
  );

  const notificationsFilteredView = useMemo(() => {
    const surnameNeedle = notifSurnameFilter.trim().toLowerCase();
    return notificationsView.filter((n) => {
      const isTrashed = Boolean(n.isTrashed);
      const isSent = Boolean(n.isSent);
      if (notifFolderFilter === "trash" && !isTrashed) return false;
      if (notifFolderFilter === "sent" && (!isSent || isTrashed)) return false;
      if (notifFolderFilter === "received" && isTrashed) return false;
      if (notifSourceFilter !== "all" && (n.source ?? "internal") !== notifSourceFilter) return false;
      if (notifTypeFilter !== "all") {
        const normalizedType = n.source === "player_notes" ? "note" : n.type;
        if (normalizedType !== notifTypeFilter) return false;
      }
      if (notifSeasonFilter !== "all" && String(n.seasonTag ?? "—") !== notifSeasonFilter) return false;
      if (notifRecipientFilter !== "all" && String(n.recipientTag ?? "") !== notifRecipientFilter) return false;
      if (surnameNeedle) {
        const surname = String(n.surnameTag ?? "").toLowerCase();
        const title = String(n.title ?? "").toLowerCase();
        const message = String(n.message ?? "").toLowerCase();
        if (!surname.includes(surnameNeedle) && !title.includes(surnameNeedle) && !message.includes(surnameNeedle)) return false;
      }
      return true;
    });
  }, [notificationsView, notifFolderFilter, notifSourceFilter, notifTypeFilter, notifSeasonFilter, notifRecipientFilter, notifSurnameFilter]);

  const unreadCount = notificationsView.filter(n => !n.isRead).length;
  const trashedNotificationsCount = notificationsView.filter((n) => Boolean(n.isTrashed)).length;
  const sentNotificationsCount = notificationsView.filter((n) => Boolean(n.isSent) && !n.isTrashed).length;
  const recipientNoteNotifications = notificationsView.filter((n) =>
    String(n.title ?? "").toLowerCase().startsWith("nota giocatore") || n.source === "player_notes"
  );
  const unreadRecipientNotesCount = recipientNoteNotifications.filter((n) => !n.isRead).length;

  const showUnavailableAlert = !alertDismissed && (
    nr === "coach" || nr === "technical_director" || nr === "fitness_coach" ||
    nr === "admin" || nr === "athletic_director"
  );

  const unavailablePlayers = (allPlayers as any[] | undefined)?.filter(
    (p: any) => p.status !== "inactive" && p.available === false
  ) ?? [];

  const chartDataEn = [
    { name: "Mon", sessions: 2 },
    { name: "Tue", sessions: 4 },
    { name: "Wed", sessions: 3 },
    { name: "Thu", sessions: 5 },
    { name: "Fri", sessions: 2 },
    { name: "Sat", sessions: 1 },
    { name: "Sun", sessions: 0 },
  ];
  const chartDataIt = [
    { name: "Lun", sessions: 2 },
    { name: "Mar", sessions: 4 },
    { name: "Mer", sessions: 3 },
    { name: "Gio", sessions: 5 },
    { name: "Ven", sessions: 2 },
    { name: "Sab", sessions: 1 },
    { name: "Dom", sessions: 0 },
  ];
  const chartData = language === "it" ? chartDataIt : chartDataEn;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[400px] lg:col-span-2 rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header + Season Banner */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">{t.dashboard}</h1>
          <p className="text-muted-foreground mt-1 text-lg">{t.overviewDesc}</p>
        </div>

        {/* Season indicator */}
        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground font-medium whitespace-nowrap">Stagione sportiva:</span>
            {canManageSeasons && seasons.length > 1 ? (
              <Select
                value={String(selectedSeasonId ?? activeSeason?.id ?? "")}
                onValueChange={v => setSelectedSeasonId(Number(v))}
              >
                <SelectTrigger className="h-7 text-sm font-semibold border-primary/30 bg-primary/5 hover:bg-primary/10 min-w-[110px]">
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}{s.isActive ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                {viewedSeason?.name ?? "—"}
              </span>
            )}
          </div>
          {canManageSeasons && (
            <Link href="/season-transition" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
              <RefreshCw className="w-3 h-3" />
              Transizione stagionale
            </Link>
          )}
        </div>
      </div>

{/* QUICK ACTIONS — Lavagna/Esercitazione solo staff tecnico; Pianifica settimana fuori card solo non-segreteria */}
<div
  className={cn(
    "grid grid-cols-1 gap-3",
    canQuickCreateTrainingTools ? "sm:grid-cols-3" : "sm:grid-cols-1 max-w-md",
  )}
>
  {canQuickCreateTrainingTools && (
    <>
      <Link href="/tactical-board">
        <Button className="w-full h-12 text-sm font-semibold">
          ➕ Nuova Lavagna
        </Button>
      </Link>
      <Link href="/exercises">
        <Button variant="secondary" className="w-full h-12 text-sm font-semibold">
          ➕ Nuova Esercitazione
        </Button>
      </Link>
    </>
  )}
  {nr !== "secretary" && (
    <Link href="/training">
      <Button variant="outline" className="w-full h-12 text-sm font-semibold">
        📅 Pianifica Settimana
      </Button>
    </Link>
  )}
</div>

      {/* Notifications Panel */}
      <Card className="shadow-md border-border/50">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="relative">
                {unreadCount > 0
                  ? <BellRing className="w-5 h-5 text-primary animate-bounce" />
                  : <Bell className="w-5 h-5 text-muted-foreground" />
                }
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              <CardTitle className="text-base font-display">Comunicazioni Interne</CardTitle>
              {unreadRecipientNotesCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  Note ricevute: {unreadRecipientNotesCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setNotificationsCollapsed((v) => !v)}
                title={notificationsCollapsed ? "Mostra comunicazioni" : "Nascondi comunicazioni"}
              >
                {notificationsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </Button>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground" onClick={markAllRead}>
                  <CheckCheck className="w-3.5 h-3.5" />
                  Segna tutte lette
                </Button>
              )}
              {canSend && (
                <Button size="sm" className="text-xs h-7 gap-1" onClick={() => setShowForm(v => !v)}>
                  <Plus className="w-3.5 h-3.5" />
                  Nuova notifica
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Send form (admin/secretary only) */}
        {showForm && canSend && (
          <div className="px-4 pt-4 pb-2 border-b bg-muted/30">
            <div className="space-y-3 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Titolo *</Label>
                  <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Es: Allenamento annullato" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Avviso</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Messaggio *</Label>
                <Textarea value={formMessage} onChange={e => setFormMessage(e.target.value)} placeholder="Scrivi il messaggio per tutto lo staff..." rows={2} className="text-sm resize-none" />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setFormError(""); }}>Annulla</Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={sendNotification} disabled={formSending}>
                  <Send className="w-3 h-3" />
                  {formSending ? "Invio..." : "Invia"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {notifError && (
            <div className="p-4 text-sm text-red-600 border-b border-red-200 bg-red-50 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800">
              {notifError}
            </div>
          )}
          {notificationsCollapsed ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} notifiche non lette` : `${notificationsView.length} notifiche`} - Inviate {sentNotificationsCount} - Cestino {trashedNotificationsCount}
            </div>
          ) : notifLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b bg-muted/20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                <Select value={notifFolderFilter} onValueChange={(value) => setNotifFolderFilter(value as NotificationFolder)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Cartella" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Ricevuti</SelectItem>
                    <SelectItem value="sent">Inviati ({sentNotificationsCount})</SelectItem>
                    <SelectItem value="trash">Cestino ({trashedNotificationsCount})</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={notifSourceFilter} onValueChange={setNotifSourceFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Provenienza" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Provenienza: tutte</SelectItem>
                    <SelectItem value="internal">Interne</SelectItem>
                    <SelectItem value="platform">Piattaforma FTB</SelectItem>
                    <SelectItem value="player_notes">Note giocatore</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={notifTypeFilter} onValueChange={setNotifTypeFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipologia" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tipologia: tutte</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Avviso</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={notifSeasonFilter} onValueChange={setNotifSeasonFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Annata" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Annata: tutte</SelectItem>
                    {notificationSeasonOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={notifRecipientFilter} onValueChange={setNotifRecipientFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Inviate a" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Inviate a: tutti</SelectItem>
                    {notificationRecipientOptions.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={notifSurnameFilter}
                  onChange={(e) => setNotifSurnameFilter(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Cognome..."
                />
              </div>
              {notificationsFilteredView.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <Bell className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">Nessuna comunicazione con i filtri selezionati.</p>
                </div>
              ) : (
                <div className="divide-y max-h-[340px] overflow-y-auto">
                  {notificationsFilteredView.map(n => {
                    const s = typeStyle(n.type);
                    const isTrashed = Boolean(n.isTrashed);
                    return (
                      <div
                        key={n.id}
                        className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30", n.isRead ? "opacity-60" : "")}
                      >
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border", s.bg)}>
                          {s.icon}
                        </div>
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left cursor-pointer"
                          onClick={() => openNotificationDetails(n)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", s.badge)}>
                              {n.source === "player_notes" ? "Note" : n.type === "urgent" ? "Urgente" : n.type === "warning" ? "Avviso" : "Info"}
                            </span>
                            {n.source === "platform" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                Piattaforma FTB
                              </span>
                            )}
                            {n.source === "player_notes" && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                Note giocatori
                              </span>
                            )}
                            <span className="font-semibold text-sm leading-tight">{n.title}</span>
                            {!n.isRead && (
                              <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" title="Non letta" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(n.createdAt), "d MMM yyyy • HH:mm", { locale: itLocale })}
                          </p>
                        </button>
                        {n.source === "player_notes" ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Leggi dettagli"
                              onClick={() => openNotificationDetails(n)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300"
                              title="Apri note giocatori"
                              onClick={() => openPlayerNotesInbox(n)}
                            >
                              Apri
                            </Button>
                          </div>
                        ) : (!n.isRead ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Leggi dettagli"
                              onClick={() => openNotificationDetails(n)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Segna come letta"
                              onClick={() => markRead(n.id, n.source)}
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </Button>
                            {isTrashed ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Ripristina"
                                onClick={() => restoreNotificationFromTrash(n)}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Sposta nel cestino"
                                onClick={() => moveNotificationToTrash(n)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              title="Leggi dettagli"
                              onClick={() => openNotificationDetails(n)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {isTrashed ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                title="Ripristina"
                                onClick={() => restoreNotificationFromTrash(n)}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Sposta nel cestino"
                                onClick={() => moveNotificationToTrash(n)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedNotification)} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedNotification && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {selectedNotification.source === "player_notes"
                      ? "Note"
                      : selectedNotification.type === "urgent"
                        ? "Urgente"
                        : selectedNotification.type === "warning"
                          ? "Avviso"
                          : "Info"}
                  </Badge>
                  {selectedNotification.source === "platform" && <Badge variant="outline">Piattaforma FTB</Badge>}
                  {selectedNotification.source === "internal" && <Badge variant="outline">Interna</Badge>}
                  {selectedNotification.source === "player_notes" && <Badge variant="outline">Note giocatori</Badge>}
                </div>
                <DialogTitle className="text-xl">{selectedNotification.title}</DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedNotification.createdAt), "d MMMM yyyy 'alle' HH:mm", { locale: itLocale })}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[55vh] overflow-y-auto rounded-md border bg-muted/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedNotification.message}</p>
              </div>
              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {selectedNotification.recipientTag && <span>Destinatari: {selectedNotification.recipientTag}</span>}
                  {selectedNotification.seasonTag && <span>Annata: {selectedNotification.seasonTag}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {selectedNotification.source === "player_notes" && (
                    <Button variant="secondary" size="sm" onClick={() => openPlayerNotesInbox(selectedNotification)}>
                      Apri note
                    </Button>
                  )}
                  {selectedNotification.isTrashed ? (
                    <Button variant="outline" size="sm" onClick={() => restoreNotificationFromTrash(selectedNotification)}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Ripristina
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => moveNotificationToTrash(selectedNotification)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Cestino
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setSelectedNotification(null)}>Chiudi</Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Panoramica</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t.totalTeams} value={dashboardTeamCount} icon={UsersRound} link="/teams">
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <span>Visibili: <strong className="text-foreground">{dashboardTeamCount}</strong></span>
            <span>Area: <strong className="text-foreground">{dashboardSectionLabel}</strong></span>
            <span className="col-span-2 truncate">Annate: <strong className="text-foreground">{dashboardTeamYearsLabel}</strong></span>
          </div>
        </StatCard>
        <StatCard title="Giocatori" value={dashboardPlayerSummary.active} icon={Users} link="/players">
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <span>Attivi: <strong className="text-foreground">{dashboardPlayerSummary.active}</strong></span>
            <span>Non attivi: <strong className="text-foreground">{dashboardPlayerSummary.inactive}</strong></span>
            <span>Disponibili: <strong className="text-foreground">{dashboardPlayerSummary.available}</strong></span>
            <span>Non disponibili: <strong className="text-foreground">{dashboardPlayerSummary.unavailable}</strong></span>
          </div>
        </StatCard>
        {nr === "secretary" ? (
          <StatCard title="Area Genitori" value="App" icon={Heart} link="/secretary/parent-app">
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span>Comunicazioni</span>
              <span>Documenti</span>
              <span>Eventi</span>
              <span>Famiglie</span>
            </div>
          </StatCard>
        ) : (
          <StatCard title="Sessioni / sedute" value={dashboardUpcomingCount} icon={CalendarDays} link="/training">
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <span>Sedute: <strong className="text-foreground">{dashboardUpcomingCount}</strong></span>
              <span>Complete: <strong className="text-foreground">{dashboardExerciseSummary.completeSessions}</strong></span>
              <span>Assoc.: <strong className="text-foreground">{dashboardExerciseSummary.associated}</strong></span>
              <span>Libere: <strong className="text-foreground">{dashboardExerciseSummary.free}</strong></span>
            </div>
          </StatCard>
        )}
        <StatCard title={t.staffMembers} value={dashboardStaffCount} icon={ShieldCheck} link="/members">
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <span>Totale: <strong className="text-foreground">{dashboardStaffCount}</strong></span>
            {dashboardStaffRoleSummary.length > 0 ? (
              dashboardStaffRoleSummary.map(([label, count]) => (
                <span key={label} className="truncate">
                  {label}: <strong className="text-foreground">{count}</strong>
                </span>
              ))
            ) : (
              <span>Ruoli: <strong className="text-foreground">0</strong></span>
            )}
          </div>
        </StatCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fasi ed eventi</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMatchSummaryCard
          title="Fase autunnale"
          value={dashboardMatchSummary.autunnale}
          description="partite (ago-gen)"
          icon={Leaf}
          tone="amber"
          onClick={() => openDashboardPhaseCalendar("autunnale", "Fase autunnale")}
        />
        <DashboardMatchSummaryCard
          title="Fase primaverile"
          value={dashboardMatchSummary.primaverile}
          description="partite (feb-lug)"
          icon={Grape}
          tone="pink"
          onClick={() => openDashboardPhaseCalendar("primaverile", "Fase primaverile")}
        />
        <DashboardMatchSummaryCard
          title="Tornei"
          value={dashboardMatchSummary.tornei}
          description="tornei registrati"
          icon={Trophy}
          tone="violet"
          onClick={() => openDashboardPhaseCalendar("tornei", "Tornei")}
        />
        <DashboardMatchSummaryCard
          title="Amichevoli"
          value={dashboardMatchSummary.amichevoli}
          description="partite non ufficiali"
          icon={Handshake}
          tone="sky"
          onClick={() => openDashboardPhaseCalendar("amichevoli", "Amichevoli")}
        />
        </div>
      </section>

      <Dialog open={phaseTeamPicker !== null} onOpenChange={(open) => !open && setPhaseTeamPicker(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Scegli annata</DialogTitle>
            <DialogDescription>
              {phaseTeamPicker ? `Seleziona l'annata per aprire ${phaseTeamPicker.title.toLowerCase()}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {dashboardTeams.map((team) => (
              <Button
                key={team.id}
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  if (!phaseTeamPicker) return;
                  setLocation(`/calendari/${team.id}?phase=${phaseTeamPicker.phase}`);
                  setPhaseTeamPicker(null);
                }}
              >
                {team.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="shadow-md border-border/50">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-display">
                Calendario - {format(dashboardCalendarMonth, "MMMM yyyy", { locale: itLocale })}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setDashboardCalendarMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDashboardCalendarMonth(startOfMonth(new Date()))}>
                Oggi
              </Button>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setDashboardCalendarMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Link href="/scuola-calcio/calendar">
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  Apri completo
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                title={dashboardCalendarCollapsed ? "Apri calendario" : "Chiudi calendario"}
                onClick={() => setDashboardCalendarCollapsed((value) => !value)}
              >
                {dashboardCalendarCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {dashboardTeams.length > 1 && (
            <div className="border-b px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  Annate visibili ({dashboardSelectedTeamIds.size}/{dashboardTeams.length})
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDashboardSelectedTeamIds(new Set(dashboardTeams.map((team) => Number(team.id))))}>
                    Tutte
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setDashboardSelectedTeamIds(new Set())}>
                    Nessuna
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboardTeams.map((team, index) => {
                  const id = Number(team.id);
                  const selected = dashboardSelectedTeamIds.has(id);
                  const color = DASHBOARD_TEAM_PALETTE[index % DASHBOARD_TEAM_PALETTE.length];
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        selected ? "bg-emerald-50 text-emerald-900" : "bg-background text-muted-foreground opacity-60",
                      )}
                      style={{ borderColor: selected ? color : undefined }}
                      onClick={() =>
                        setDashboardSelectedTeamIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          return next;
                        })
                      }
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      {team.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="border-b px-4 py-3">
            <div className="mb-2 text-sm font-medium">Da oggi a fine settimana</div>
            {dashboardWeekPreviewItems.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Nessun impegno in programma.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {dashboardWeekPreviewItems.map((item) => {
                  const postponed = item.kind === "match" && !!item.match.isPostponed;
                  const typeLabel = postponed
                    ? "Rinviata"
                            : item.kind === "training"
                              ? item.trainingStatus === "cancelled"
                                ? "Allenamento annullato"
                                : item.trainingStatus === "joined" || item.trainingStatus === "joined-original"
                                  ? "Allenamento congiunto"
                                  : item.trainingStatus === "moved"
                                    ? "Recupero allenamento"
                                    : item.trainingStatus === "moved-original"
                                      ? "Allenamento spostato"
                                      : "Allenamento"
                      : item.kind === "tournament"
                        ? "Torneo"
                        : "Partita";
                  const notePreview =
                    item.kind === "training" && item.trainingNotes
                      ? item.trainingNotes.replace(/\s+/g, " ").trim()
                      : "";
                  return (
                  <button
                    key={`preview-${item.key}`}
                    type="button"
                    className={cn(
                      "rounded-lg border bg-card px-3 py-2 text-left text-xs hover:border-primary/50",
                      postponed && "border-amber-300 bg-amber-50 text-amber-900",
                      item.kind === "training" && item.trainingStatus === "moved-original" && "border-slate-300 bg-slate-50 text-slate-700",
                      item.kind === "training" && item.trainingStatus === "joined-original" && "border-slate-300 bg-slate-50 text-slate-700",
                      item.kind === "training" && item.trainingStatus === "cancelled" && "border-red-200 bg-red-50 text-red-800",
                      item.kind === "training" && item.trainingStatus === "moved" && "border-emerald-300 bg-emerald-50 text-emerald-900",
                      item.kind === "training" && item.trainingStatus === "joined" && "border-cyan-300 bg-cyan-50 text-cyan-900",
                    )}
                    onClick={() => setSelectedCalendarItem(item)}
                  >
                    <span className={cn("font-semibold text-primary", postponed && "text-amber-700")}>
                      {format(item.date, "EEE d", { locale: itLocale })} · {item.time}
                    </span>
                    <span className="mt-1 block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-muted-foreground">{typeLabel} - {item.subtitle}</span>
                    {notePreview && <span className="mt-1 block truncate text-muted-foreground">Nota: {notePreview}</span>}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          {!dashboardCalendarCollapsed && (
            <>
              <div className="grid grid-cols-7 border-b bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((day) => (
                  <div key={day} className="px-2 py-2 text-center">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {dashboardCalendarDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const events = dashboardEventsByDay.get(key) ?? [];
                  const muted = !isSameMonth(day, dashboardCalendarMonth);
                  const today = startOfDay(day).getTime() === startOfDay(new Date()).getTime();
                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-h-[118px] border-b border-r p-2",
                        muted && "bg-muted/20 text-muted-foreground",
                      )}
                    >
                      <div className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold", today && "bg-emerald-600 text-white")}>
                        {format(day, "d")}
                      </div>
                      <div className="mt-2 space-y-1">
                        {events.slice(0, 4).map((item) => {
                          const postponed = item.kind === "match" && !!item.match.isPostponed;
                          const typeLabel = postponed
                            ? "Rinviata"
                            : item.kind === "training"
                              ? item.trainingStatus === "cancelled"
                                ? "Annull."
                                  : item.trainingStatus === "joined" || item.trainingStatus === "joined-original"
                                    ? "Congiunto"
                                    : item.trainingStatus === "moved"
                                      ? "Recupero"
                                      : item.trainingStatus === "moved-original"
                                        ? "Spostato"
                                        : "Allen."
                              : item.kind === "tournament"
                                ? "Torneo"
                                : "Partita";
                          const className = postponed
                            ? "bg-amber-50 text-amber-900 border-amber-300"
                            : item.kind === "training"
                              ? item.trainingStatus === "cancelled"
                                ? "bg-red-50 text-red-800 border-red-200"
                                : item.trainingStatus === "moved-original"
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : item.trainingStatus === "joined-original"
                                    ? "bg-slate-100 text-slate-700 border-slate-300"
                                    : item.trainingStatus === "moved"
                                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                      : item.trainingStatus === "joined"
                                        ? "bg-cyan-50 text-cyan-900 border-cyan-300"
                                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : item.kind === "tournament"
                                ? "bg-violet-50 text-violet-800 border-violet-200"
                                : "bg-blue-50 text-blue-800 border-blue-200";
                          return (
                            <button
                              key={item.key}
                              type="button"
                              className={cn("w-full rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight hover:shadow-sm", className)}
                              onClick={() => setSelectedCalendarItem(item)}
                            >
                              <span className="font-semibold">{item.time} - {typeLabel}</span>
                              <span className="block truncate">{item.title}</span>
                            </button>
                          );
                        })}
                        {events.length > 4 && (
                          <div className="text-[11px] text-muted-foreground">+{events.length - 4} altri</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <div className="hidden">
          {dashboardCalendarItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nessun impegno nei prossimi giorni.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {dashboardCalendarItems.map((item) => {
                const Icon = item.kind === "training" ? Dumbbell : item.kind === "tournament" ? Trophy : CalendarDays;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className="text-left rounded-xl border bg-card p-3 hover:border-primary/50 hover:shadow-sm transition"
                    onClick={() => setSelectedCalendarItem(item)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-muted-foreground">
                            {format(item.date, "EEE d MMM", { locale: itLocale })} · {item.time}
                          </p>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {item.kind === "training" ? "Allenamento" : item.kind === "tournament" ? "Torneo" : "Partita"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-foreground line-clamp-2">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{item.subtitle}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {showSecretaryFilesCard && (
        <>
          <Card className="shadow-md border-border/50 border-emerald-500/20 bg-emerald-500/[0.03]">
            <CardHeader className="pb-2 border-b border-emerald-500/10">
              <div className="flex items-center gap-2">
                <FileUp className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base font-display">File per pianificazione e calendari</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Importa i PDF nel calendario della squadra corretta: scegli annata/squadra, carica il file e conferma le partite riconosciute.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap gap-2">
                <Link href={nr === "secretary" ? "/scuola-calcio/calendar" : "/training"}>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {nr === "secretary" ? "Apri Calendario" : "Pianifica Settimana"}
                  </Button>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={uploadSecretaryFileMutation.isPending}
                  onClick={() => openCalendarPdfImport("federation")}
                >
                  <FileText className="w-4 h-4" />
                  PDF federazione
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={uploadSecretaryFileMutation.isPending}
                  onClick={() => openCalendarPdfImport("tournament")}
                >
                  <Trophy className="w-4 h-4" />
                  PDF tornei
                </Button>
                <input
                  id="secretary-file-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,application/pdf"
                  onChange={async (e) => {
                    const input = e.target;
                    const file = input.files?.[0];
                    input.value = "";
                    if (!file) return;
                    handleSecretaryReferenceUpload(file, secretaryUploadKind);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  disabled={secretaryFiles.length === 0 || uploadSecretaryFileMutation.isPending}
                  onClick={async () => {
                    try {
                      const bundle = await fetchJsonOrThrow<
                        { id: number; name: string; mimeType: string; createdAt: string; dataUrl: string }[]
                      >("/api/secretary/club-files/export-bundle");
                      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `ftb-file-condivisione-club-${clubIdNum}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      /* toast optional */
                    }
                  }}
                >
                  <Download className="w-4 h-4" />
                  Esporta elenco
                </Button>
              </div>
              {secretaryFiles.length > 0 ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {secretaryFiles.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="text-primary hover:underline truncate min-w-0 text-left"
                        onClick={() => void secretaryDownloadFile(f.id, f.originalFilename)}
                      >
                        {f.originalFilename}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={deleteSecretaryFileMutation.isPending}
                        onClick={() => deleteSecretaryFileMutation.mutate(f.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Dialog open={calendarImportMode !== null} onOpenChange={(open) => !open && setCalendarImportMode(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {calendarImportMode === "tournament" ? "Import PDF tornei" : "Import PDF federazione"}
                </DialogTitle>
                <DialogDescription>
                  Seleziona la squadra/annata in cui inserire le partite del PDF.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="calendar-import-team">Squadra / annata</Label>
                <Select value={calendarImportTeamId} onValueChange={setCalendarImportTeamId}>
                  <SelectTrigger id="calendar-import-team">
                    <SelectValue placeholder="Scegli squadra" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamsForCalendarImport.map((team) => (
                      <SelectItem key={team.id} value={String(team.id)}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCalendarImportMode(null)}>
                  Annulla
                </Button>
                <Button type="button" disabled={!calendarImportTeamId} onClick={startCalendarPdfImport}>
                  Continua
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Dialog open={selectedCalendarItem !== null} onOpenChange={(open) => !open && setSelectedCalendarItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedCalendarItem?.kind === "training" &&
              (selectedCalendarItem.trainingStatus === "joined" || selectedCalendarItem.trainingStatus === "joined-original")
                ? selectedCalendarItem.title.replace(/^Recupero allenamento/i, "Allenamento congiunto").replace(/^Allenamento spostato/i, "Allenamento congiunto")
                : selectedCalendarItem?.title ?? "Impegno"}
            </DialogTitle>
            <DialogDescription>
              {selectedCalendarItem
                ? selectedCalendarItem.kind === "tournament" && selectedCalendarItem.dateEnd && startOfDay(selectedCalendarItem.dateEnd).getTime() !== startOfDay(selectedCalendarItem.date).getTime()
                  ? `${format(selectedCalendarItem.date, "d MMMM yyyy", { locale: itLocale })} - ${format(selectedCalendarItem.dateEnd, "d MMMM yyyy", { locale: itLocale })}`
                  : `${format(selectedCalendarItem.date, "EEEE d MMMM yyyy", { locale: itLocale })} · ${selectedCalendarItem.time}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedCalendarItem && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{selectedCalendarItem.subtitle}</p>
                {selectedCalendarItem.kind === "training" &&
                  (selectedCalendarItem.trainingStatus === "joined" || selectedCalendarItem.trainingStatus === "joined-original") && (
                    <p className="mt-1 text-sm font-medium text-cyan-700">Allenamento congiunto</p>
                  )}
                {selectedCalendarItem.teamName && (
                  <p className="mt-1 text-muted-foreground">Squadra: {selectedCalendarItem.teamName}</p>
                )}
              </div>

              {selectedCalendarItem.kind === "tournament" && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Partite del torneo</p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border divide-y">
                    {selectedCalendarItem.matches.map((match) => {
                      const date = parseLocalDateTime(match.date);
                      return (
                        <div key={match.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{match.opponent}</p>
                            <p className="text-xs text-muted-foreground">
                              {date ? `${format(date, "d MMM", { locale: itLocale })} · ${matchTimeLabel(date)}` : "Orario da completare"}
                            </p>
                          </div>
                          {match.teamId ? (
                            <Button
                              type="button"
                              size="sm"
                              className="shrink-0"
                              variant={canPrepareFromDashboardCalendar ? "default" : "outline"}
                              onClick={() => {
                                if (canPrepareFromDashboardCalendar) {
                                  setLocation(`/calendari/${match.teamId}?openMatchId=${match.id}`);
                                  return;
                                }
                                const matchDate = date ?? selectedCalendarItem.date;
                                setSelectedCalendarItem({
                                  kind: "match",
                                  key: `match-${match.id}`,
                                  date: matchDate,
                                  time: matchTimeLabel(matchDate),
                                  title: `${selectedCalendarItem.teamName ?? match.teamName ?? "Squadra"} vs ${match.opponent}`,
                                  subtitle: [homeAwayLabel(match.homeAway), match.competition].filter(Boolean).join(" · "),
                                  teamId: Number(match.teamId ?? 0) || undefined,
                                  teamName: selectedCalendarItem.teamName ?? match.teamName ?? undefined,
                                  match,
                                });
                              }}
                            >
                              {canPrepareFromDashboardCalendar ? "Prepara" : "Modifica"}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedCalendarItem.kind === "match" && (
                <>
                  {canEditDashboardCalendar && (
                    <div className="rounded-xl border p-3">
                      <p className="mb-3 text-sm font-semibold">Modifica organizzativa</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="calendar-edit-date">Data</Label>
                          <Input id="calendar-edit-date" type="date" value={calendarEditDate} onChange={(e) => setCalendarEditDate(e.target.value)} />
                        </div>
                        <div>
                          <Label htmlFor="calendar-edit-time">Orario</Label>
                          <Input
                            id="calendar-edit-time"
                            type="text"
                            value={calendarEditTime}
                            onChange={(e) => setCalendarEditTime(formatDashboardTimeInputLive(e.target.value))}
                            onBlur={(e) => {
                              const normalized = normalizeDashboardTime24(e.target.value);
                              if (normalized) setCalendarEditTime(normalized);
                            }}
                            placeholder="HH:mm"
                            inputMode="numeric"
                            autoComplete="off"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor="calendar-edit-location">Luogo</Label>
                          <Input id="calendar-edit-location" value={calendarEditLocation} onChange={(e) => setCalendarEditLocation(e.target.value)} placeholder="Es. Campo sportivo..." />
                        </div>
                      </div>
                      <div className="mt-3 space-y-3 rounded-lg bg-muted/30 p-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border"
                            checked={calendarEditPostponed}
                            onChange={(e) => setCalendarEditPostponed(e.target.checked)}
                          />
                          Partita rinviata
                        </label>
                        {calendarEditPostponed && (
                          <div className="space-y-3 pl-6">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border"
                                checked={calendarEditRescheduleTbd}
                                onChange={(e) => setCalendarEditRescheduleTbd(e.target.checked)}
                              />
                              Data recupero da concordare
                            </label>
                            {!calendarEditRescheduleTbd && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <Label htmlFor="calendar-reschedule-date">Nuova data recupero</Label>
                                  <Input id="calendar-reschedule-date" type="date" value={calendarEditRescheduleDate} onChange={(e) => setCalendarEditRescheduleDate(e.target.value)} />
                                </div>
                                <div>
                                  <Label htmlFor="calendar-reschedule-time">Orario recupero</Label>
                                  <Input
                                    id="calendar-reschedule-time"
                                    type="text"
                                    value={calendarEditRescheduleTime}
                                    onChange={(e) => setCalendarEditRescheduleTime(formatDashboardTimeInputLive(e.target.value))}
                                    onBlur={(e) => {
                                      const normalized = normalizeDashboardTime24(e.target.value);
                                      if (normalized) setCalendarEditRescheduleTime(normalized);
                                    }}
                                    placeholder="HH:mm"
                                    inputMode="numeric"
                                    autoComplete="off"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        className="mt-3"
                        disabled={!calendarEditDate || updateDashboardMatchMutation.isPending}
                        onClick={() => {
                          const match = selectedCalendarItem.match;
                          const isoDate = combineDashboardDateAndTimeToIso(calendarEditDate, calendarEditTime || "00:00");
                          if (!isoDate) {
                            toast({ title: "Data/orario non validi", description: "Controlla data e orario della partita.", variant: "destructive" });
                            return;
                          }
                          const rescheduleIso =
                            calendarEditPostponed && !calendarEditRescheduleTbd && calendarEditRescheduleDate
                              ? combineDashboardDateAndTimeToIso(calendarEditRescheduleDate, calendarEditRescheduleTime || "00:00")
                              : null;
                          if (calendarEditPostponed && !calendarEditRescheduleTbd && calendarEditRescheduleDate && !rescheduleIso) {
                            toast({ title: "Recupero non valido", description: "Controlla data e orario del recupero.", variant: "destructive" });
                            return;
                          }
                          updateDashboardMatchMutation.mutate({
                            matchId: match.id,
                            date: isoDate,
                            location: calendarEditLocation.trim(),
                            isPostponed: calendarEditPostponed,
                            rescheduleTbd: calendarEditRescheduleTbd,
                            rescheduleDate: rescheduleIso,
                          });
                        }}
                      >
                        Salva modifiche
                      </Button>
                    </div>
                  )}
                  {canPrepareFromDashboardCalendar && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          const match = selectedCalendarItem.match;
                          setLocation(`/calendari/${match.teamId ?? ""}?openMatchId=${match.id}`);
                        }}
                      >
                        Apri scheda partita
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const match = selectedCalendarItem.match;
                          setLocation(`/tactical-board?teamId=${match.teamId ?? ""}&matchId=${match.id}&source=dashboard`);
                        }}
                      >
                        Prepara partita
                      </Button>
                    </div>
                  )}
                </>
              )}

              {selectedCalendarItem.kind === "training" && (
                <>
                  {canEditDashboardCalendar && selectedCalendarItem.teamId && selectedCalendarItem.originalDate && (
                    <div className="rounded-xl border p-3">
                      <p className="mb-3 text-sm font-semibold">Modifica allenamento</p>
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Button
                          type="button"
                          variant={trainingEditMode === "note" ? "default" : "outline"}
                          onClick={() => setTrainingEditMode("note")}
                        >
                          Solo nota
                        </Button>
                        <Button
                          type="button"
                          variant={trainingEditMode === "moved" ? "default" : "outline"}
                          onClick={() => setTrainingEditMode("moved")}
                        >
                          Sposta / recupera
                        </Button>
                        <Button
                          type="button"
                          variant={trainingEditMode === "joined" ? "default" : "outline"}
                          onClick={() => setTrainingEditMode("joined")}
                        >
                          Congiungi
                        </Button>
                        <Button
                          type="button"
                          variant={trainingEditMode === "cancelled" ? "destructive" : "outline"}
                          onClick={() => setTrainingEditMode("cancelled")}
                        >
                          Elimina data
                        </Button>
                      </div>
                      {(trainingEditMode === "moved" || trainingEditMode === "joined") && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <Label htmlFor="training-edit-date">Nuova data</Label>
                            <Input id="training-edit-date" type="date" value={trainingEditDate} onChange={(e) => setTrainingEditDate(e.target.value)} />
                          </div>
                          <div>
                            <Label htmlFor="training-edit-start">Inizio</Label>
                            <Input
                              id="training-edit-start"
                              value={trainingEditStartTime}
                              onChange={(e) => setTrainingEditStartTime(formatDashboardTimeInputLive(e.target.value))}
                              onBlur={(e) => {
                                const normalized = normalizeDashboardTime24(e.target.value);
                                if (normalized) setTrainingEditStartTime(normalized);
                              }}
                              placeholder="HH:mm"
                              inputMode="numeric"
                            />
                          </div>
                          <div>
                            <Label htmlFor="training-edit-end">Fine</Label>
                            <Input
                              id="training-edit-end"
                              value={trainingEditEndTime}
                              onChange={(e) => setTrainingEditEndTime(formatDashboardTimeInputLive(e.target.value))}
                              onBlur={(e) => {
                                const normalized = normalizeDashboardTime24(e.target.value);
                                if (normalized) setTrainingEditEndTime(normalized);
                              }}
                              placeholder="HH:mm"
                              inputMode="numeric"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <Label htmlFor="training-edit-location">Luogo</Label>
                            <Input id="training-edit-location" value={trainingEditLocation} onChange={(e) => setTrainingEditLocation(e.target.value)} placeholder="Es. Campo sportivo..." />
                          </div>
                          {trainingEditMode === "joined" && (
                            <div className="sm:col-span-3">
                              <Label>Annata da congiungere</Label>
                              {trainingJoinTwinTeam ? (
                                <label className="mt-1 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-emerald-600"
                                    checked={trainingJoinTargetKey === String(trainingJoinTwinTeam.id)}
                                    onChange={(event) => setTrainingJoinTargetKey(event.target.checked ? String(trainingJoinTwinTeam.id) : "")}
                                  />
                                  <span className="font-medium">{trainingJoinTwinTeam.name}</span>
                                </label>
                              ) : (
                                <p className="mt-1 text-xs text-amber-700">
                                  Nessuna annata gemella trovata per questa squadra.
                                </p>
                              )}
                              <p className="mt-1 text-xs text-muted-foreground">
                                La data e gli orari sopra indicano dove creare l'allenamento congiunto; l'evento originale resta tracciato nello storico.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-3">
                        <Label htmlFor="training-edit-notes">Note per staff tecnico</Label>
                        <Textarea
                          id="training-edit-notes"
                          value={trainingEditNotes}
                          onChange={(e) => setTrainingEditNotes(e.target.value)}
                          rows={3}
                          placeholder="Motivo dello spostamento, indicazioni o comunicazioni..."
                        />
                      </div>
                      <Button
                        type="button"
                        className="mt-3"
                        disabled={updateDashboardTrainingMutation.isPending}
                        onClick={() => {
                          if (!selectedCalendarItem.teamId || !selectedCalendarItem.originalDate || !selectedCalendarItem.originalStartTime || !selectedCalendarItem.originalEndTime) return;
                          const needsTarget = trainingEditMode === "moved" || trainingEditMode === "joined";
                          const start = needsTarget ? normalizeDashboardTime24(trainingEditStartTime) : null;
                          const end = needsTarget ? normalizeDashboardTime24(trainingEditEndTime) : null;
                          if (needsTarget && (!trainingEditDate || !start || !end)) {
                            toast({ title: "Data/orario non validi", description: "Controlla nuova data, inizio e fine allenamento.", variant: "destructive" });
                            return;
                          }
                          const joinTarget = trainingEditMode === "joined" && trainingJoinTwinTeam && trainingJoinTargetKey === String(trainingJoinTwinTeam.id)
                            ? trainingJoinTwinTeam
                            : null;
                          if (trainingEditMode === "joined" && !joinTarget) {
                            toast({ title: "Annata mancante", description: "Seleziona l'annata gemella da congiungere.", variant: "destructive" });
                            return;
                          }
                          const effectiveStatus =
                            trainingEditMode === "moved" &&
                            trainingEditDate === selectedCalendarItem.originalDate &&
                            start === selectedCalendarItem.originalStartTime &&
                            end === selectedCalendarItem.originalEndTime
                              ? "note"
                              : trainingEditMode;
                          updateDashboardTrainingMutation.mutate({
                            teamId: selectedCalendarItem.teamId,
                            originalDate: selectedCalendarItem.originalDate,
                            originalStartTime: selectedCalendarItem.originalStartTime,
                            originalEndTime: selectedCalendarItem.originalEndTime,
                            status: effectiveStatus,
                            newDate: effectiveStatus === "moved" || effectiveStatus === "joined" ? trainingEditDate : null,
                            newStartTime: effectiveStatus === "moved" || effectiveStatus === "joined" ? start : null,
                            newEndTime: effectiveStatus === "moved" || effectiveStatus === "joined" ? end : null,
                            targetTeamId: joinTarget?.id ?? null,
                            targetDate: effectiveStatus === "joined" ? trainingEditDate : null,
                            targetStartTime: effectiveStatus === "joined" ? start : null,
                            targetEndTime: effectiveStatus === "joined" ? end : null,
                            location: effectiveStatus === "moved" || effectiveStatus === "joined" ? trainingEditLocation.trim() || null : null,
                            notes: trainingEditNotes.trim() || null,
                          });
                        }}
                      >
                        Salva modifica allenamento
                      </Button>
                    </div>
                  )}
                  {canPrepareFromDashboardCalendar && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Button type="button" onClick={() => setLocation("/training")}>
                        Apri sessioni
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setLocation("/exercises")}>
                        Prepara esercitazione
                      </Button>
                    </div>
                  )}
                </>
              )}

              {selectedCalendarItem.kind === "extra" && canPrepareFromDashboardCalendar && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button type="button" onClick={() => setLocation("/training")}>
                    Pianifica attività
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setLocation("/exercises")}>
                    Prepara esercitazione
                  </Button>
                </div>
              )}
              {(selectedCalendarItem.kind === "extra" || (selectedCalendarItem.kind === "training" && !canPrepareFromDashboardCalendar && !canEditDashboardCalendar)) && (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Evento visualizzato dal cruscotto. Le azioni tecniche sono disponibili solo allo staff tecnico.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedCalendarItem(null)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Calendari Partite (stessa vista per segreteria, DT, presidenza, DG, admin) ── */}
      {(nr === "admin" ||
        nr === "director" ||
        nr === "secretary" ||
        nr === "presidente" ||
        nr === "technical_director") && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-display">Calendari Partite</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {(() => {
              const teams = (allTeams ?? []) as any[];
              if (teams.length === 0) {
                return (
                  <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                    <Trophy className="w-10 h-10 mb-3 opacity-20" />
                    <p className="text-sm">Nessuna squadra nel club o calendario non ancora impostato.</p>
                  </div>
                );
              }
              const sectionMeta = [
                {
                  key: "scuola_calcio",
                  label: "Scuola Calcio",
                  color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
                },
                {
                  key: "settore_giovanile",
                  label: "Settore Giovanile",
                  color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
                },
                {
                  key: "prima_squadra",
                  label: "Prima Squadra",
                  color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
                },
              ] as const;
              const usedIds = new Set<number>();
              return (
                <div className="space-y-5">
                  {sectionMeta.map((section) => {
                    const sectionTeams = teams.filter((t: any) => t.clubSection === section.key);
                    sectionTeams.forEach((t: any) => usedIds.add(t.id));
                    if (sectionTeams.length === 0) return null;
                    return (
                      <div key={section.key}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section.label}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {sectionTeams.map((team: any) => (
                            <Link key={team.id} href={`/calendari/${team.id}`}>
                              <div className="group flex flex-col gap-1.5 p-3 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 group-hover:bg-primary/20 transition-colors">
                                    {(team.name as string).substring(0, 2).toUpperCase()}
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-xs font-semibold leading-tight line-clamp-2">{team.name}</p>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full self-start ${section.color}`}>
                                  {section.label}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const rest = teams.filter((t: any) => !usedIds.has(t.id));
                    if (rest.length === 0) return null;
                    return (
                      <div key="altre">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Altre squadre</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {rest.map((team: any) => (
                            <Link key={team.id} href={`/calendari/${team.id}`}>
                              <div className="group flex flex-col gap-1.5 p-3 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                                <div className="flex items-center justify-between">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 group-hover:bg-primary/20 transition-colors">
                                    {(team.name as string).substring(0, 2).toUpperCase()}
                                  </div>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-xs font-semibold leading-tight line-clamp-2">{team.name}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Calendari per coach / preparatori (il DT usa la card "Calendari Partite" sopra, evita duplicato) */}
      {isStaffViewer && teamsForStaffUi.length > 0 && nr !== "technical_director" && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-display">I miei Calendari Partite</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teamsForStaffUi.map((team: any) => (
                <Link key={team.id} href={`/calendari/${team.id}`}>
                  <div className="group flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 group-hover:bg-primary/20 transition-colors">
                      {(team.name as string).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{team.name}</p>
                      <p className="text-xs text-muted-foreground">Clicca per vedere le partite</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training schedule for coaches, technical directors, fitness coaches */}
      {isStaffViewer && (
        <Card className="shadow-md border-border/50">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <CardTitle className="text-base font-display">
                {nr === "technical_director" ? "Orari di allenamento (squadre area)" : "I miei orari di allenamento"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {teamsForStaffUi.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                <Clock className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">
                  {nr === "technical_director"
                    ? "Nessuna squadra nell'area o orari non ancora impostati."
                    : "Nessuna squadra assegnata o orari non ancora impostati."}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {teamsForStaffUi.map((team: any) => {
                  const slots: TrainingSlot[] = team.trainingSchedule ?? [];
                  return (
                    <div key={team.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {team.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight">{team.name}</p>
                          {team.category && (
                            <p className="text-xs text-muted-foreground">{team.category}{team.ageGroup ? ` · ${team.ageGroup}` : ""}</p>
                          )}
                        </div>
                      </div>
                      {slots.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {slots.map((slot, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/8 border border-primary/15 text-xs font-medium">
                              <span className="text-foreground">{slot.day}</span>
                              <span className="text-muted-foreground">{slot.startTime}–{slot.endTime}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic flex-1">Orari non ancora impostati</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {nr !== "secretary" && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xl font-display">{t.activityOverview}</CardTitle>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    dx={-10}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                  />
                  <Bar
                    dataKey="sessions"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-md border-border/50 flex flex-col">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-display">{t.recentSessions}</CardTitle>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-primary">
                <Link href="/training">{t.viewAll}</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {stats?.recentTrainingSessions?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                <CalendarDays className="w-10 h-10 mb-3 opacity-20" />
                <p>{t.noRecentSessions}</p>
              </div>
            ) : (
              <div className="divide-y">
                {stats?.recentTrainingSessions?.map((session) => (
                  <div key={session.id} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                    <div className="space-y-1">
                      <p className="font-semibold leading-none">{session.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(session.scheduledAt), "d MMM yyyy • HH:mm", { locale: language === "it" ? itLocale : undefined })}
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                      <Link href={`/training/${session.id}`}><ArrowRight className="w-4 h-4" /></Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Transition window CTA */}
      {isTransitionWindow && canManageSeasons && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 dark:bg-blue-950/30 dark:border-blue-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 text-sm">Periodo di transizione stagionale</h3>
            <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5 mb-2">
              Siamo nel periodo di transizione (luglio–agosto). Conferma, trasferisci o promuovi i giocatori per la prossima stagione.
            </p>
            <Link href="/season-transition">
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 h-7 text-xs gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" />
                Vai alla transizione stagionale
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Unavailable Players Alert */}
      {showUnavailableAlert && unavailablePlayers.length > 0 && (
        <div className="relative bg-amber-50 border border-amber-200 rounded-xl p-4 dark:bg-amber-950/30 dark:border-amber-800 animate-in fade-in slide-in-from-top-2 duration-300">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400"
            onClick={() => setAlertDismissed(true)}
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 pr-8">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {t.unavailablePlayers} ({unavailablePlayers.length})
              </h3>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5 mb-3">
                {t.unavailablePlayersAlert}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {unavailablePlayers.map((p: any) => (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div className="font-semibold text-amber-900 dark:text-amber-200">
                      {p.firstName} {p.lastName}
                    </div>
                    {p.teamName && (
                      <div className="text-amber-600 dark:text-amber-400 text-[11px]">{p.teamName}</div>
                    )}
                    <div className="flex flex-wrap gap-x-3 mt-1 text-amber-700 dark:text-amber-300">
                      {p.unavailabilityReason && (
                        <span>⚠ {reasonLabel(p.unavailabilityReason, t)}</span>
                      )}
                      {p.expectedReturn && (
                        <span>📅 {p.expectedReturn}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <Button size="sm" variant="outline" asChild className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30 text-xs h-7">
                  <Link href="/players">{t.players} →</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Exercises Banner — coach/fitness_coach/athletic_director */}
      {isTrainingStaff && draftExercises.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 dark:bg-amber-950/30 dark:border-amber-700 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <span className="text-base">✏️</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                {draftExercises.length === 1 ? "1 bozza allenamento da completare" : `${draftExercises.length} bozze allenamento da completare`}
              </h3>
              <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5 mb-2">
                {draftExercises.length === 1 ? "C'è un'esercitazione in bozza che richiede la tua attenzione." : "Ci sono esercitazioni in bozza che richiedono la tua attenzione."}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {draftExercises.slice(0, 4).map(ex => (
                  <span key={ex.id} className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-full px-2.5 py-0.5 font-medium">
                    {ex.title}
                    {ex.trainingDay && <span className="text-amber-500 dark:text-amber-400 text-[10px]">· {new Date(ex.trainingDay).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}</span>}
                  </span>
                ))}
                {draftExercises.length > 4 && <span className="text-xs text-amber-600">+{draftExercises.length - 4} altri</span>}
              </div>
              <Link href="/exercises">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/30 h-7 text-xs gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  Vai alla libreria esercizi
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardMatchSummaryCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: number;
  description: string;
  icon: any;
  tone: "amber" | "pink" | "violet" | "sky";
  onClick: () => void;
}) {
  const styles: Record<typeof tone, { border: string; iconWrap: string; icon: string }> = {
    amber: { border: "border-amber-200", iconWrap: "bg-amber-100", icon: "text-amber-600" },
    pink: { border: "border-pink-200", iconWrap: "bg-pink-100", icon: "text-pink-600" },
    violet: { border: "border-violet-300 ring-1 ring-violet-200", iconWrap: "bg-violet-100", icon: "text-violet-600" },
    sky: { border: "border-sky-200", iconWrap: "bg-sky-100", icon: "text-sky-600" },
  };
  const style = styles[tone];
  return (
    <button type="button" onClick={onClick} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg">
      <Card className={cn("border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md", style.border)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", style.iconWrap)}>
              <Icon className={cn("h-5 w-5", style.icon)} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-5">{title}</div>
              <div className="mt-2 text-2xl font-display font-bold leading-none">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{description}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function StatCard({ title, value, icon: Icon, link, children }: { title: string, value: number | string, icon: any, link: string, children?: ReactNode }) {
  return (
    <Card className="shadow-md border-border/50 hover:shadow-lg transition-shadow group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500">
        <Icon className="w-24 h-24" />
      </div>
      <CardContent className="p-6 relative z-10 flex min-h-[180px] flex-col">
        <div className="flex min-h-[44px] items-start justify-between gap-3 pb-2">
          <p className="text-sm font-medium leading-snug text-muted-foreground">{title}</p>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="mt-4 flex-1">
          <div className="min-h-[48px] text-4xl font-display font-bold leading-none">{value}</div>
          {children}
        </div>
        <Link href={link} className="absolute inset-0 z-20">
          <span className="sr-only">{title}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
