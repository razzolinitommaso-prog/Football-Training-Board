import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { ExerciseDrawingBoard } from "@/pages/exercises/ExerciseDrawingBoard";
import { ExerciseVoiceRecorder } from "@/pages/exercises/ExerciseVoiceRecorder";
import { ExerciseVideoRecorder } from "@/pages/exercises/ExerciseVideoRecorder";
import {
  Plus, Calendar, Clock, MapPin, Trash2, Eye, MessageSquare, Send,
  Megaphone, Star, ClipboardList, Loader2, BookOpen, UserCheck,
  ChevronDown, ChevronUp, X, Pencil, CalendarDays, Layers, Dumbbell, Shield, Users, Package2,
  PenLine, Mic, Video, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";

// ── Types ───────────────────────────────────────────────────────────────────

interface TrainingSession {
  id: number;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location: string | null;
  status: string;
  teamId: number | null;
  teamName: string | null;
  createdByUserId: number | null;
  creatorName: string | null;
  sessionKind: string;
  sentToUserIds: number[] | null;
  tdComment: string | null;
  tdGuidelines: string | null;
  description?: string | null;
  objectives?: string | null;
  notes?: string | null;
}

interface LinkedExercise {
  id: number;
  title: string;
  category?: string | null;
  description?: string | null;
  durationMinutes?: number | null;
  playersRequired?: number | null;
  equipment?: string | null;
  teamId?: number | null;
  trainingDay?: string | null;
  trainingSession?: string | null;
  trainingPhase?: string | null;
  principio?: string | null;
  drawingData?: string | null;
  drawingElementsJson?: string | null;
  voiceNoteData?: string | null;
  videoNoteData?: string | null;
  isDraft?: boolean;
  caricaRosaIntera?: boolean;
  scegliGiocatori?: boolean;
  selectedPlayerIdsJson?: string | null;
  playersRequiredMode?: "all" | "manual" | "selected";
  createdByUserId?: number | null;
  creatorName?: string | null;
  sourceExerciseId?: number | null;
  originalCreatedByName?: string | null;
}

interface SessionExerciseLink {
  id: number;
  trainingSessionId: number;
  exerciseId: number;
  order: number;
  notes?: string | null;
  exercise: LinkedExercise | null;
}

type ExerciseFormState = {
  title: string;
  category: string;
  description: string;
  durationMinutes: string;
  playersRequired: string;
  equipment: string;
  teamId: string;
  trainingDay: string;
  trainingSession: string;
  trainingPhase: string;
  principio: string;
  playersRequiredMode: "manual" | "all" | "selected";
  selectedPlayerIdsJson: string;
  drawingData: string;
  drawingElementsJson: string;
  voiceNoteData: string;
  videoNoteData: string;
  isDraft: boolean;
  notes: string;
};

interface PlayerOption {
  id: number;
  firstName: string;
  lastName: string;
  teamId?: number | null;
  teamName?: string | null;
  available?: boolean;
}

interface TrainingDirective {
  id: number;
  title: string;
  message: string;
  type: string;
  sentToUserIds: number[];
  scheduledFor: string | null;
  createdAt: string;
}

type DirectiveAttachment = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  teamAssignments?: { teamId: number; teamName: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STAFF_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const MATERIAL_OPTIONS = [
  { id: "cinesini", label: "Cinesini" },
  { id: "ostacoli_20", label: "Ostacoli 20cm" },
  { id: "ostacoli_40", label: "Ostacoli 40cm" },
  { id: "ostacoli_60", label: "Ostacoli 60cm" },
  { id: "ostacoli_80", label: "Ostacoli 80cm" },
  { id: "porticine", label: "Porticine" },
  { id: "coni", label: "Coni" },
  { id: "scalette", label: "Scalette" },
] as const;
type MaterialId = (typeof MATERIAL_OPTIONS)[number]["id"];
const EXERCISE_CATEGORIES = ["technique", "physical", "tactical", "warmup", "shooting", "passing", "defending"] as const;
const TRAINING_SESSIONS = [
  { value: "giorno_1" },
  { value: "giorno_2" },
  { value: "giorno_3" },
] as const;

const SESSION_SLOT_NOTE_PREFIX = "__trainingSession=";
const TRAINING_PHASES = [
  { value: "iniziale", label: "Iniziale" },
  { value: "centrale", label: "Centrale" },
  { value: "finale", label: "Finale" },
] as const;
const PRINCIPI = [
  { value: "forza", label: "FORZA" },
  { value: "resistenza", label: "RESISTENZA" },
  { value: "tecnico_tattico", label: "TECNICO TATTICO" },
] as const;

async function apiFetch(url: string, options?: RequestInit) {
  const method = options?.method ?? "GET";
  console.log(`[training] request ${method} ${url}`);
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  console.log(`[training] response ${method} ${url} -> ${res.status}`);
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[training] error ${method} ${url}:`, errorText);
    throw new Error(errorText);
  }
  if (res.status === 204) return null;
  const payload = await res.json();
  console.log(`[training] payload ${method} ${url}:`, payload);
  return payload;
}

function fmtDate(d: string) {
  return format(new Date(d), "EEE d MMM yyyy – HH:mm", { locale: itLocale });
}

function fmtShortDate(d: string) {
  return format(new Date(d), "d MMM yyyy", { locale: itLocale });
}

function toDateInputValue(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDisplayDateValue(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function toDateTimeLocalValue(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  const hours = `${parsed.getHours()}`.padStart(2, "0");
  const minutes = `${parsed.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function datePartFromLocalDateTime(localDateTime: string) {
  return localDateTime.split("T")[0] ?? "";
}

function timePartFromLocalDateTime(localDateTime: string) {
  return localDateTime.split("T")[1] ?? "";
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

function normalizeDateIt(value: string): string | null {
  const clean = value.trim();
  const m = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return null;
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizePrincipio(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  const direct = PRINCIPI.find((item) => item.value === normalized);
  if (direct) return direct.value;
  const byLabel = PRINCIPI.find((item) => item.label.toLowerCase() === normalized);
  return byLabel?.value ?? "";
}

function emptyExerciseFormFromSession(session: TrainingSession, existingCount: number): ExerciseFormState {
  const inheritedTrainingSession = getSessionTrainingSession(session) ?? "";
  return {
    title: `Esercitazione ${existingCount + 1} - ${session.title}`,
    category: "",
    description: "",
    durationMinutes: "",
    playersRequired: "",
    equipment: "",
    teamId: session.teamId ? String(session.teamId) : "",
    trainingDay: toDateInputValue(session.scheduledAt),
    trainingSession: inheritedTrainingSession,
    trainingPhase: "",
    principio: normalizePrincipio(session.objectives),
    playersRequiredMode: "manual",
    selectedPlayerIdsJson: "",
    drawingData: "",
    drawingElementsJson: "",
    voiceNoteData: "",
    videoNoteData: "",
    isDraft: false,
    notes: "",
  };
}

function formFromLinkedExercise(link: SessionExerciseLink): ExerciseFormState {
  const rawTrainingDay = link.exercise?.trainingDay ?? "";
  const normalizedTrainingDay = /^\d{4}-\d{2}-\d{2}$/.test(rawTrainingDay) ? rawTrainingDay : "";
  const inferredMode: "all" | "manual" | "selected" =
    link.exercise?.scegliGiocatori ? "selected" : link.exercise?.caricaRosaIntera ? "all" : "manual";
  return {
    title: link.exercise?.title ?? "",
    category: link.exercise?.category ?? "",
    description: link.exercise?.description ?? "",
    durationMinutes: link.exercise?.durationMinutes ? String(link.exercise.durationMinutes) : "",
    playersRequired: link.exercise?.playersRequired ? String(link.exercise.playersRequired) : "",
    equipment: link.exercise?.equipment ?? "",
    teamId: link.exercise?.teamId ? String(link.exercise.teamId) : "",
    trainingDay: normalizedTrainingDay,
    trainingSession: link.exercise?.trainingSession ?? (!normalizedTrainingDay ? rawTrainingDay : ""),
    trainingPhase: link.exercise?.trainingPhase ?? "",
    principio: link.exercise?.principio ?? "",
    playersRequiredMode: link.exercise?.playersRequiredMode ?? inferredMode,
    selectedPlayerIdsJson: link.exercise?.selectedPlayerIdsJson ?? "",
    drawingData: link.exercise?.drawingData ?? "",
    drawingElementsJson: link.exercise?.drawingElementsJson ?? "",
    voiceNoteData: link.exercise?.voiceNoteData ?? "",
    videoNoteData: link.exercise?.videoNoteData ?? "",
    isDraft: !!link.exercise?.isDraft,
    notes: link.notes ?? "",
  };
}

function parseSelectedPlayerIds(raw: string): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function getSessionTrainingSession(session: TrainingSession): string | null {
  const noteValue = session.notes ?? "";
  if (!noteValue.startsWith(SESSION_SLOT_NOTE_PREFIX)) return null;
  const value = noteValue.slice(SESSION_SLOT_NOTE_PREFIX.length).trim();
  if (!value) return null;
  return TRAINING_SESSIONS.some((item) => item.value === value) ? value : null;
}

function parseEquipmentSelection(raw: string): Partial<Record<MaterialId, number>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { items?: Record<string, number> };
    const source = parsed?.items ?? {};
    const next: Partial<Record<MaterialId, number>> = {};
    for (const option of MATERIAL_OPTIONS) {
      const value = Number(source[option.id]);
      if (Number.isFinite(value) && value > 0) next[option.id] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function serializeEquipmentSelection(selection: Partial<Record<MaterialId, number>>): string {
  const compact = Object.entries(selection)
    .filter(([, qty]) => Number.isFinite(Number(qty)) && Number(qty) > 0)
    .reduce<Record<string, number>>((acc, [key, qty]) => {
      acc[key] = Number(qty);
      return acc;
    }, {});
  if (Object.keys(compact).length === 0) return "";
  return JSON.stringify({ version: 1, items: compact });
}

function computeRecoveryPerExercise(sessionDuration: number | null, links: SessionExerciseLink[]): number | null {
  if (!sessionDuration || links.length === 0) return null;
  const plannedExerciseMinutes = links.reduce((sum, link) => sum + (link.exercise?.durationMinutes ?? 0), 0);
  const difference = sessionDuration - plannedExerciseMinutes;
  return difference / links.length;
}

function statusBadge(status: string) {
  if (status === "scheduled") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Pianificata</Badge>;
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Completata</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Annullata</Badge>;
}

function typeBadge(kind: string) {
  if (kind === "tipo") return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
      <Star className="w-2.5 h-2.5" /> Sessione Tipo
    </Badge>
  );
  return null;
}

function directiveTypeBadge(t: string) {
  if (t === "test") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">Test</Badge>;
  if (t === "training") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Allenamento</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Generale</Badge>;
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    coach: "Allenatore",
    fitness_coach: "Preparatore Fisico",
    athletic_director: "Resp. Atletico",
    technical_director: "Direttore Tecnico",
  };
  return map[role] ?? role;
}

function principioLabel(value: string | null | undefined) {
  if (!value) return "";
  const normalized = normalizePrincipio(value);
  return PRINCIPI.find((item) => item.value === normalized)?.label ?? value;
}

function trainingSessionOptionLabel(value: string, t?: any): string {
  if (value === "giorno_1") return t?.day1 ?? "Giorno 1";
  if (value === "giorno_2") return t?.day2 ?? "Giorno 2";
  if (value === "giorno_3") return t?.day3 ?? "Giorno 3";
  return value;
}

function trainingSessionLabel(value: string | null | undefined, t?: any): string | null {
  if (!value) return null;
  const mapped = TRAINING_SESSIONS.find((item) => item.value === value);
  if (mapped) return trainingSessionOptionLabel(mapped.value, t);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  }
  return value;
}

function trainingDayLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  if (TRAINING_SESSIONS.some((item) => item.value === value)) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  }
  return value;
}

function phaseLabel(value: string | null | undefined): string {
  if (!value) return "";
  return TRAINING_PHASES.find((item) => item.value === value)?.label ?? value;
}

function categoryLabel(value: string | null | undefined): string {
  if (!value) return "";
  const labels: Record<string, string> = {
    technique: "Tecnica",
    physical: "Fisica",
    tactical: "Tattica",
    warmup: "Riscaldamento",
    shooting: "Tiro",
    passing: "Passaggio",
    defending: "Difesa",
  };
  return labels[value] ?? value;
}

function matchesSessionSearch(session: TrainingSession, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;
  const sessionTraining = getSessionTrainingSession(session);
  const scheduledYear = Number.isNaN(new Date(session.scheduledAt).getTime()) ? "" : String(new Date(session.scheduledAt).getFullYear());
  const haystack = [
    session.title,
    session.status,
    session.location,
    session.teamName,
    session.creatorName,
    session.objectives,
    sessionTraining ? trainingSessionOptionLabel(sessionTraining) : "",
    session.scheduledAt,
    scheduledYear ? `annata ${scheduledYear}` : "",
    scheduledYear,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(normalizedSearch)) return true;
  if (normalizedSearch.startsWith("annata ")) {
    const annataNeedle = normalizedSearch.replace(/^annata\s+/, "").trim();
    if (annataNeedle && haystack.includes(annataNeedle)) return true;
  }
  return false;
}

function matchesExerciseSearch(
  link: SessionExerciseLink,
  normalizedSearch: string,
  sessionScheduledAt?: string,
  sessionTeamName?: string | null,
): boolean {
  if (!normalizedSearch) return true;
  const exerciseYear = (() => {
    const source = link.exercise?.trainingDay;
    if (!source) return "";
    const parsed = new Date(source);
    if (Number.isNaN(parsed.getTime())) return "";
    return String(parsed.getFullYear());
  })();
  const sessionYear = (() => {
    if (!sessionScheduledAt) return "";
    const parsed = new Date(sessionScheduledAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return String(parsed.getFullYear());
  })();
  const seasonFromSessionYear = sessionYear ? `${sessionYear}/${Number(sessionYear) + 1}` : "";
  const haystack = [
    link.exercise?.title,
    link.exercise?.description,
    link.exercise?.category,
    link.exercise?.trainingPhase,
    link.exercise?.principio,
    link.exercise?.trainingSession,
    link.exercise?.trainingDay,
    link.exercise?.equipment,
    exerciseYear ? `annata ${exerciseYear}` : "",
    exerciseYear,
    sessionTeamName,
    sessionYear ? `annata ${sessionYear}` : "",
    sessionYear,
    seasonFromSessionYear ? `annata ${seasonFromSessionYear}` : "",
    seasonFromSessionYear,
    link.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(normalizedSearch)) return true;
  if (normalizedSearch.startsWith("annata ")) {
    const annataNeedle = normalizedSearch.replace(/^annata\s+/, "").trim();
    if (annataNeedle && haystack.includes(annataNeedle)) return true;
  }
  return false;
}

const DIRECTIVE_ATTACHMENTS_MARKER = "\n\n[[FTB_ATTACHMENTS]]";

function composeDirectiveMessage(message: string, attachments: DirectiveAttachment[]): string {
  if (!attachments.length) return message;
  return `${message}${DIRECTIVE_ATTACHMENTS_MARKER}${JSON.stringify(attachments)}`;
}

function parseDirectiveMessage(raw: string): { text: string; attachments: DirectiveAttachment[] } {
  const idx = raw.indexOf(DIRECTIVE_ATTACHMENTS_MARKER);
  if (idx === -1) return { text: raw, attachments: [] };
  const text = raw.slice(0, idx);
  const serialized = raw.slice(idx + DIRECTIVE_ATTACHMENTS_MARKER.length);
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) return { text, attachments: [] };
    const attachments = parsed
      .filter((item): item is DirectiveAttachment =>
        !!item &&
        typeof item.name === "string" &&
        typeof item.mimeType === "string" &&
        typeof item.dataUrl === "string",
      );
    return { text, attachments };
  } catch {
    return { text: raw, attachments: [] };
  }
}

// ── Session Card ───────────────────────────────────────────────────────────

function SessionCard({
  session, canDelete, canEdit, onDelete, onEdit, onComment, onOpenDetails, showRecovery, isReadOnly,
}: {
  session: TrainingSession;
  canDelete?: boolean;
  canEdit?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onComment?: () => void;
  onOpenDetails?: () => void;
  showRecovery?: boolean;
  isReadOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const linkedExercisesQuery = useQuery<SessionExerciseLink[]>({
    queryKey: ["/api/training-sessions", session.id, "exercises"],
    queryFn: () => apiFetch(`/api/training-sessions/${session.id}/exercises`),
    enabled: !!showRecovery,
  });
  const linkedExercises = linkedExercisesQuery.data ?? [];
  const recoveryPerExercise = computeRecoveryPerExercise(session.durationMinutes, linkedExercises);
  const plannedExerciseMinutes = linkedExercises.reduce((sum, link) => sum + (link.exercise?.durationMinutes ?? 0), 0);
  const residualMinutes = (session.durationMinutes ?? 0) - plannedExerciseMinutes;
  return (
    <Card className={`overflow-hidden group hover:shadow-md transition-all ${session.sessionKind === "tipo" ? "border-amber-300/60 bg-amber-50/30" : ""}`}>
      <div className={`h-1 w-full ${
        session.status === "scheduled" ? "bg-primary" :
        session.status === "completed" ? "bg-green-500" : "bg-destructive"
      }`} />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {statusBadge(session.status)}
            {typeBadge(session.sessionKind)}
          </div>
          <div className="flex items-center gap-1">
            {onOpenDetails && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={onOpenDetails}
                title="Apri scheda sessione"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            {canEdit && onEdit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={onEdit}
                title="Modifica sessione"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {onComment && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onComment} title="Commenta / linee guida">
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                title="Elimina"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-sm leading-tight">{session.title}</h3>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span>{fmtDate(session.scheduledAt)}</span>
          </div>
          {session.durationMinutes && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{session.durationMinutes} min</span>
            </div>
          )}
          {session.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              <span>{session.location}</span>
            </div>
          )}
        </div>

        {(session.teamName || session.creatorName) && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
            {session.teamName && <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">{session.teamName}</span>}
            {session.creatorName && <span className="text-[10px] text-muted-foreground">da {session.creatorName}</span>}
          </div>
        )}

        {showRecovery && (
          <div className="rounded-md border bg-muted/20 p-2">
            {linkedExercisesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Caricamento esercitazioni...</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Esercitazioni: <span className="font-semibold text-foreground">{linkedExercises.length}</span>
                {" • "}Minutaggio previsto: <span className="font-semibold text-foreground">{plannedExerciseMinutes} min</span>
              </p>
            )}
          </div>
        )}

        {(session.tdComment || session.tdGuidelines) && (
          <div>
            <button className="flex items-center gap-1 text-[11px] text-primary font-medium" onClick={() => setOpen(v => !v)}>
              <BookOpen className="w-3 h-3" />
              Note del Direttore Tecnico
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {open && (
              <div className="mt-2 space-y-2 text-xs">
                {session.tdComment && (
                  <div className="bg-primary/5 rounded p-2 border border-primary/20">
                    <p className="font-medium text-primary mb-0.5">Commento</p>
                    <p className="text-foreground/80">{session.tdComment}</p>
                  </div>
                )}
                {session.tdGuidelines && (
                  <div className="bg-amber-50 rounded p-2 border border-amber-200">
                    <p className="font-medium text-amber-800 mb-0.5">Linee guida</p>
                    <p className="text-foreground/80">{session.tdGuidelines}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showRecovery && session.durationMinutes && (
          <div className="rounded-md border border-dashed bg-muted/30 p-2">
            {linkedExercisesQuery.isLoading ? (
              <p className="text-xs text-muted-foreground mt-0.5">Calcolo in corso...</p>
            ) : linkedExercises.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-0.5">Aggiungi almeno un'esercitazione per calcolare il recupero.</p>
            ) : (
              <>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Recupero medio tra esercitazioni{" "}
                  <span className="text-foreground font-semibold">{Math.round(recoveryPerExercise ?? 0)} min</span>
                </p>
                <p className="text-xs mt-0.5">
                  ({session.durationMinutes} - {plannedExerciseMinutes} = {residualMinutes}, ripartiti su {linkedExercises.length} esercitazioni)
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recipient Selector ─────────────────────────────────────────────────────

function RecipientSelector({
  members, selected, onChange, teamId,
}: {
  members: Member[];
  selected: number[];
  onChange: (ids: number[]) => void;
  teamId?: number | null;
}) {
  const staff = members.filter((m) => {
    if (!["coach", "fitness_coach", "athletic_director"].includes(m.role)) return false;
    if (!teamId) return true;
    return !!m.teamAssignments?.some((a) => a.teamId === teamId);
  });
  return (
    <div className="space-y-2 max-h-52 overflow-y-auto border rounded-md p-3">
      {staff.length === 0 && <p className="text-xs text-muted-foreground">Nessun allenatore/preparatore trovato</p>}
      {staff.map(m => (
        <div key={m.id} className="flex items-center gap-2">
          <Checkbox
            id={`r-${m.id}`}
            checked={selected.includes(m.id)}
            onCheckedChange={checked => {
              onChange(checked ? [...selected, m.id] : selected.filter(id => id !== m.id));
            }}
          />
          <Label htmlFor={`r-${m.id}`} className="text-xs font-normal cursor-pointer flex-1">
            <span className="font-medium">{m.firstName} {m.lastName}</span>
            <span className="text-muted-foreground ml-1.5 text-[10px]">{roleLabel(m.role)}</span>
            {m.teamAssignments?.map(a => (
              <span key={a.teamId} className="ml-1 text-[10px] text-primary">• {a.teamName}</span>
            ))}
          </Label>
        </div>
      ))}
    </div>
  );
}

// ── Create Session Dialog ──────────────────────────────────────────────────

function CreateSessionDialog({
  open, onClose, onCreated, onCreatedSession, members, isTD, teams,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onCreatedSession?: (session: TrainingSession) => void;
  members: Member[];
  isTD: boolean;
  teams: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState(90);
  const [location, setLocation] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [sessionPrincipio, setSessionPrincipio] = useState("");
  const [sessionTrainingSession, setSessionTrainingSession] = useState("");
  const [sessionKind, setSessionKind] = useState<"regular" | "tipo">("regular");
  const [recipientMode, setRecipientMode] = useState<"selected" | "all">("selected");
  const [recipients, setRecipients] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setScheduledDate(""); setScheduledTime(""); setDuration(90);
    setLocation(""); setTeamId(null); setSessionPrincipio(""); setSessionTrainingSession(""); setSessionKind("regular"); setRecipientMode("selected"); setRecipients([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateIso = normalizeDateIt(scheduledDate);
    const time24 = normalizeTime24(scheduledTime);
    if (!dateIso || !time24) {
      toast({ title: "Inserisci data/ora valide (dd/MM/yyyy e HH:mm)", variant: "destructive" });
      return;
    }
    const scheduledAt = `${dateIso}T${time24}`;
    if (!sessionTrainingSession) {
      toast({ title: t.selectTrainingSessionError, variant: "destructive" });
      return;
    }
    if (!sessionPrincipio) {
      toast({ title: t.selectPrincipleError, variant: "destructive" });
      return;
    }
    const eligibleRecipients = members.filter((m) => {
      if (!["coach", "fitness_coach", "athletic_director"].includes(m.role)) return false;
      if (!teamId) return true;
      return !!m.teamAssignments?.some((a) => a.teamId === teamId);
    });
    const resolvedRecipients = recipientMode === "all" ? eligibleRecipients.map((m) => m.id) : recipients;
    if (sessionKind === "tipo" && resolvedRecipients.length === 0) {
      toast({ title: "Seleziona almeno un destinatario", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const principioLabel = PRINCIPI.find((item) => item.value === sessionPrincipio)?.label ?? sessionPrincipio.toUpperCase();
      const sessionLabel = trainingSessionOptionLabel(sessionTrainingSession, t);
      const generatedTitle = `${principioLabel} - ${sessionLabel}`;
      const createdSession = await apiFetch("/api/training-sessions", {
        method: "POST",
        body: JSON.stringify({
          title: generatedTitle, scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration, location: location || null,
          objectives: sessionPrincipio || null,
          notes: sessionTrainingSession ? `${SESSION_SLOT_NOTE_PREFIX}${sessionTrainingSession}` : null,
          teamId, status: "scheduled",
          sessionKind,
          sentToUserIds: sessionKind === "tipo" ? resolvedRecipients : null,
        }),
      });
      onCreated();
      onCreatedSession?.(createdSession as TrainingSession);
      onClose();
      reset();
      toast({ title: sessionKind === "tipo" ? "Sessione Tipo inviata" : "Sessione creata" });
    } catch {
      toast({ title: "Errore nella creazione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isTD ? "Nuova Sessione" : "Pianifica Sessione di Allenamento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          {isTD && (
            <div className="space-y-2">
              <Label>Tipo sessione</Label>
              <Select value={sessionKind} onValueChange={v => setSessionKind(v as "regular" | "tipo")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Sessione regolare (visibile a te e direttore)</SelectItem>
                  <SelectItem value="tipo">Sessione TIPO — da inviare agli allenatori</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t.trainingSessionField} <span className="text-destructive">*</span></Label>
            <Select value={sessionTrainingSession || "_none"} onValueChange={v => setSessionTrainingSession(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.selectSession} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {TRAINING_SESSIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{trainingSessionOptionLabel(opt.value, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t.principle} <span className="text-destructive">*</span></Label>
            <Select value={sessionPrincipio || "_none"} onValueChange={v => setSessionPrincipio(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.selectPrincipleType} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {PRINCIPI.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data e ora <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(formatDateInput(e.target.value))}
                  placeholder="dd/MM/yyyy"
                  inputMode="numeric"
                />
                <Input
                  type="text"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(formatTimeInput(e.target.value))}
                  placeholder="HH:mm"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Durata (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={15} max={300} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Squadra</Label>
              <Select value={teamId?.toString() ?? ""} onValueChange={v => setTeamId(v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Luogo</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Campo 1..." />
            </div>
          </div>

          {isTD && sessionKind === "tipo" && (
            <div className="space-y-2">
              <Label>Invio sessione</Label>
              <Select value={recipientMode} onValueChange={(v) => { setRecipientMode(v as "selected" | "all"); if (v === "all") setRecipients([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Invia a tutti</SelectItem>
                  <SelectItem value="selected">Seleziona destinatari</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isTD && sessionKind === "tipo" && recipientMode === "selected" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Destinatari (allenatori / preparatori)
              </Label>
              <RecipientSelector members={members} selected={recipients} onChange={setRecipients} teamId={teamId} />
              {recipients.length > 0 && (
                <p className="text-xs text-muted-foreground">{recipients.length} destinatari selezionati</p>
              )}
            </div>
          )}

          {isTD && sessionKind === "tipo" && recipientMode === "all" && (
            <p className="text-xs text-muted-foreground">
              La sessione verra inviata a tutti gli allenatori/preparatori {teamId ? "della squadra selezionata" : "del club"}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {sessionKind === "tipo" ? "Invia Sessione Tipo" : "Crea Sessione"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSessionDialog({
  session,
  onClose,
  onSaved,
  teams,
}: {
  session: TrainingSession;
  onClose: () => void;
  onSaved: () => void;
  teams: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [scheduledDate, setScheduledDate] = useState(toDisplayDateValue(session.scheduledAt));
  const [scheduledTime, setScheduledTime] = useState(timePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)));
  const [duration, setDuration] = useState(session.durationMinutes ?? 90);
  const [location, setLocation] = useState(session.location ?? "");
  const [teamId, setTeamId] = useState<number | null>(session.teamId ?? null);
  const [sessionPrincipio, setSessionPrincipio] = useState(normalizePrincipio(session.objectives));
  const [sessionTrainingSession, setSessionTrainingSession] = useState(getSessionTrainingSession(session) ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dateIso = normalizeDateIt(scheduledDate);
    const time24 = normalizeTime24(scheduledTime);
    if (!dateIso || !time24) {
      toast({ title: "Inserisci data/ora valide (dd/MM/yyyy e HH:mm)", variant: "destructive" });
      return;
    }
    const scheduledAt = `${dateIso}T${time24}`;
    if (!sessionTrainingSession) {
      toast({ title: t.selectTrainingSessionError, variant: "destructive" });
      return;
    }
    if (!sessionPrincipio) {
      toast({ title: t.selectPrincipleError, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const principioLabel = PRINCIPI.find((item) => item.value === sessionPrincipio)?.label ?? sessionPrincipio.toUpperCase();
      const sessionLabel = trainingSessionOptionLabel(sessionTrainingSession, t);
      const generatedTitle = `${principioLabel} - ${sessionLabel}`;
      await apiFetch(`/api/training-sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: generatedTitle,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration,
          location: location || null,
          objectives: sessionPrincipio || null,
          notes: `${SESSION_SLOT_NOTE_PREFIX}${sessionTrainingSession}`,
          teamId,
        }),
      });
      toast({ title: "Sessione aggiornata" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica sessione</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t.trainingSessionField} <span className="text-destructive">*</span></Label>
            <Select value={sessionTrainingSession || "_none"} onValueChange={v => setSessionTrainingSession(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.selectSession} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {TRAINING_SESSIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{trainingSessionOptionLabel(opt.value, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t.principle} <span className="text-destructive">*</span></Label>
            <Select value={sessionPrincipio || "_none"} onValueChange={v => setSessionPrincipio(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.selectPrincipleType} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {PRINCIPI.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data e ora <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(formatDateInput(e.target.value))}
                  placeholder="dd/MM/yyyy"
                  inputMode="numeric"
                />
                <Input
                  type="text"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(formatTimeInput(e.target.value))}
                  placeholder="HH:mm"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Durata (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={15} max={300} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Squadra</Label>
              <Select value={teamId?.toString() ?? ""} onValueChange={v => setTeamId(v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Luogo</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Campo 1..." />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva modifiche
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Comment Dialog (TD only) ───────────────────────────────────────────────

function CommentDialog({
  session, onClose, onSaved,
}: {
  session: TrainingSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [comment, setComment] = useState(session.tdComment ?? "");
  const [guidelines, setGuidelines] = useState(session.tdGuidelines ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      await apiFetch(`/api/training-sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tdComment: comment, tdGuidelines: guidelines }),
      });
      toast({ title: "Note salvate" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Note e linee guida — {session.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Commento</Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Aggiungi un commento sulla sessione..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Linee guida da seguire</Label>
            <Textarea
              value={guidelines}
              onChange={e => setGuidelines(e.target.value)}
              placeholder="Es. Lavorate sull'intensità, pressione alta, uscite difensive..."
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva note
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Directive Dialog (TD only) ─────────────────────────────────────────────

function DirectiveDialog({
  open, onClose, onCreated, members,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Member[];
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recipients, setRecipients] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<DirectiveAttachment[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() { setTitle(""); setMessage(""); setType("general"); setScheduledFor(""); setRecipients([]); setAttachments([]); }

  async function onFileSelect(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const allowedTypes = ["application/pdf", "image/jpeg"];
    const maxSizeBytes = 4 * 1024 * 1024;
    const next: DirectiveAttachment[] = [];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast({ title: `Formato non supportato: ${file.name}`, variant: "destructive" });
        continue;
      }
      if (file.size > maxSizeBytes) {
        toast({ title: `${file.name} supera 4MB`, variant: "destructive" });
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      next.push({ name: file.name, mimeType: file.type, dataUrl });
    }

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !message) return;
    if (recipients.length === 0) {
      toast({ title: "Seleziona almeno un destinatario", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payloadMessage = composeDirectiveMessage(message, attachments);
      await apiFetch("/api/training-directives", {
        method: "POST",
        body: JSON.stringify({ title, message: payloadMessage, type, scheduledFor: scheduledFor || null, sentToUserIds: recipients }),
      });
      onCreated();
      onClose();
      reset();
      toast({ title: "Direttiva inviata" });
    } catch {
      toast({ title: "Errore", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            Nuova Direttiva
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Titolo <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Lavoro tattico settimana" required />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Generale</SelectItem>
                  <SelectItem value="training">Allenamento</SelectItem>
                  <SelectItem value="test">Test / Valutazione</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Messaggio <span className="text-destructive">*</span></Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Descrivi le direttive da seguire..." rows={4} required />
          </div>
          <div className="space-y-2">
            <Label>Data di riferimento (opzionale)</Label>
            <Input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Destinatari
            </Label>
            <RecipientSelector members={members} selected={recipients} onChange={setRecipients} />
          </div>
          <div className="space-y-2">
            <Label>Allegati (PDF, JPG)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
              multiple
              onChange={async (e) => {
                const input = e.currentTarget;
                const files = input.files;
                await onFileSelect(files);
                input.value = "";
              }}
            />
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs border rounded-md px-2 py-1.5">
                    <span className="truncate flex items-center gap-1.5"><Paperclip className="w-3 h-3" />{file.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      title="Rimuovi allegato"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Invia direttiva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Directives Banner (for coaches) ───────────────────────────────────────

function DirectivesBanner({ directives, onDismiss }: { directives: TrainingDirective[]; onDismiss: (id: number) => void }) {
  if (!directives.length) return null;
  return (
    <div className="space-y-3">
      {directives.map(d => (
        (() => {
          const parsed = parseDirectiveMessage(d.message);
          return (
        <Card key={d.id} className="border-amber-300/70 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <Megaphone className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{d.title}</p>
                    {directiveTypeBadge(d.type)}
                    {d.scheduledFor && (
                      <span className="text-[10px] text-muted-foreground">{fmtShortDate(d.scheduledFor)}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80">{parsed.text}</p>
                  {parsed.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {parsed.attachments.map((file, idx) => (
                        <a
                          key={`${file.name}-${idx}`}
                          href={file.dataUrl}
                          download={file.name}
                          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border bg-background hover:bg-muted transition-colors"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span className="max-w-[180px] truncate">{file.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {fmtShortDate(d.createdAt)} · Dal Direttore Tecnico
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => onDismiss(d.id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
          );
        })()
      ))}
    </div>
  );
}

function SessionDetailsDialog({
  session,
  onClose,
  teams,
}: {
  session: TrainingSession;
  onClose: () => void;
  teams: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [exerciseFormOpen, setExerciseFormOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SessionExerciseLink | null>(null);
  const [duplicateSourceExerciseId, setDuplicateSourceExerciseId] = useState<number | null>(null);
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(() => emptyExerciseFormFromSession(session, 0));

  const linkedExercisesQuery = useQuery<SessionExerciseLink[]>({
    queryKey: ["/api/training-sessions", session.id, "exercises"],
    queryFn: () => apiFetch(`/api/training-sessions/${session.id}/exercises`),
    enabled: !!session?.id,
  });
  const selectablePlayersQuery = useQuery<PlayerOption[]>({
    queryKey: ["/api/players", "training-session-exercise-selection", exerciseForm.teamId || "all", exerciseFormOpen, exerciseForm.playersRequiredMode],
    queryFn: () => apiFetch(exerciseForm.teamId ? `/api/players?teamId=${exerciseForm.teamId}` : "/api/players"),
    enabled: exerciseFormOpen && exerciseForm.playersRequiredMode === "selected",
  });

  const linkedExercises = [...(linkedExercisesQuery.data ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const recoveryPerExercise = computeRecoveryPerExercise(session.durationMinutes, linkedExercises);
  const plannedExerciseMinutes = linkedExercises.reduce((sum, link) => sum + (link.exercise?.durationMinutes ?? 0), 0);
  const residualMinutes = (session.durationMinutes ?? 0) - plannedExerciseMinutes;

  const createAndLinkExerciseMutation = useMutation({
    mutationFn: async ({ form, sourceExerciseId }: { form: ExerciseFormState; sourceExerciseId?: number | null }) => {
      const created = await apiFetch("/api/exercises", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          category: form.category || null,
          description: form.description || null,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
          playersRequired: computedPlayersRequired ? Number(computedPlayersRequired) : null,
          equipment: form.equipment || null,
          teamId: form.teamId ? Number(form.teamId) : null,
          trainingDay: form.trainingDay || null,
          trainingSession: form.trainingSession || null,
          trainingPhase: form.trainingPhase || null,
          principio: form.principio || null,
          drawingData: form.drawingData || null,
          drawingElementsJson: form.drawingElementsJson || null,
          voiceNoteData: form.voiceNoteData || null,
          videoNoteData: form.videoNoteData || null,
          isDraft: form.isDraft,
          caricaRosaIntera: form.playersRequiredMode === "all",
          scegliGiocatori: form.playersRequiredMode === "selected",
          selectedPlayerIdsJson: form.playersRequiredMode === "selected" ? (form.selectedPlayerIdsJson || null) : null,
          playersRequiredMode: form.playersRequiredMode,
          sourceExerciseId: sourceExerciseId ?? null,
        }),
      });
      await apiFetch(`/api/training-sessions/${session.id}/exercises`, {
        method: "POST",
        body: JSON.stringify({
          exerciseId: created.id,
          order: linkedExercises.length + 1,
          notes: form.notes || null,
        }),
      });
      return created;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "exercises"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Esercitazione creata e collegata" });
      setExerciseFormOpen(false);
      setEditingLink(null);
      setDuplicateSourceExerciseId(null);
    },
    onError: () => toast({ title: "Errore nel salvataggio esercitazione", variant: "destructive" }),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: async ({ link, form }: { link: SessionExerciseLink; form: ExerciseFormState }) => {
      if (!link.exercise?.id) throw new Error("Esercitazione non valida");
      return apiFetch(`/api/exercises/${link.exercise.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          category: form.category || null,
          description: form.description || null,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
          playersRequired: computedPlayersRequired ? Number(computedPlayersRequired) : null,
          equipment: form.equipment || null,
          teamId: form.teamId ? Number(form.teamId) : null,
          trainingDay: form.trainingDay || null,
          trainingSession: form.trainingSession || null,
          trainingPhase: form.trainingPhase || null,
          principio: form.principio || null,
          drawingData: form.drawingData || null,
          drawingElementsJson: form.drawingElementsJson || null,
          voiceNoteData: form.voiceNoteData || null,
          videoNoteData: form.videoNoteData || null,
          isDraft: form.isDraft,
          caricaRosaIntera: form.playersRequiredMode === "all",
          scegliGiocatori: form.playersRequiredMode === "selected",
          selectedPlayerIdsJson: form.playersRequiredMode === "selected" ? (form.selectedPlayerIdsJson || null) : null,
          playersRequiredMode: form.playersRequiredMode,
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "exercises"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Esercitazione aggiornata" });
      setExerciseFormOpen(false);
      setEditingLink(null);
      setDuplicateSourceExerciseId(null);
    },
    onError: () => toast({ title: "Errore nell'aggiornamento", variant: "destructive" }),
  });

  const removeLinkMutation = useMutation({
    mutationFn: (linkId: number) => apiFetch(`/api/training-sessions/${session.id}/exercises/${linkId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "exercises"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Esercitazione rimossa dalla sessione" });
    },
    onError: () => toast({ title: "Errore nella rimozione", variant: "destructive" }),
  });

  function openAddExercise() {
    setEditingLink(null);
    setDuplicateSourceExerciseId(null);
    setExerciseForm(emptyExerciseFormFromSession(session, linkedExercises.length));
    setExerciseFormOpen(true);
  }

  function openEditExercise(link: SessionExerciseLink) {
    const sourceId = link.exercise ? (link.exercise.sourceExerciseId ?? link.exercise.id) : null;
    setDuplicateSourceExerciseId(sourceId);
    setEditingLink(link);
    setExerciseForm(formFromLinkedExercise(link));
    setExerciseFormOpen(true);
  }

  async function handleSaveExercise(e: React.FormEvent) {
    e.preventDefault();
    if (!exerciseForm.title.trim()) {
      toast({ title: "Titolo esercitazione obbligatorio", variant: "destructive" });
      return;
    }
    if (exerciseForm.playersRequiredMode === "selected" && selectedPlayersCount === 0) {
      toast({
        title: "Seleziona i giocatori",
        description: "Con 'Selezionati da rosa' devi scegliere almeno un giocatore prima di salvare.",
        variant: "destructive",
      });
      return;
    }
    if (exerciseForm.playersRequiredMode === "manual" && !exerciseForm.playersRequired) {
      toast({
        title: "Numero giocatori mancante",
        description: "Inserisci il numero giocatori richiesti o cambia modalita.",
        variant: "destructive",
      });
      return;
    }
    if (editingLink) {
      updateExerciseMutation.mutate({ link: editingLink, form: exerciseForm });
      return;
    }
    createAndLinkExerciseMutation.mutate({ form: exerciseForm, sourceExerciseId: duplicateSourceExerciseId });
  }

  function handleSaveAsNewLinkedExercise() {
    if (!editingLink) return;
    if (!exerciseForm.title.trim()) {
      toast({ title: "Titolo esercitazione obbligatorio", variant: "destructive" });
      return;
    }
    if (exerciseForm.playersRequiredMode === "selected" && selectedPlayersCount === 0) {
      toast({
        title: "Seleziona i giocatori",
        description: "Con 'Selezionati da rosa' devi scegliere almeno un giocatore prima di salvare.",
        variant: "destructive",
      });
      return;
    }
    if (exerciseForm.playersRequiredMode === "manual" && !exerciseForm.playersRequired) {
      toast({
        title: "Numero giocatori mancante",
        description: "Inserisci il numero giocatori richiesti o cambia modalita.",
        variant: "destructive",
      });
      return;
    }
    const sourceId = editingLink.exercise ? (editingLink.exercise.sourceExerciseId ?? editingLink.exercise.id) : null;
    createAndLinkExerciseMutation.mutate({ form: exerciseForm, sourceExerciseId: sourceId });
  }

  const exerciseSaving = createAndLinkExerciseMutation.isPending || updateExerciseMutation.isPending;
  const materialSelection = parseEquipmentSelection(exerciseForm.equipment);
  const selectedPlayerIds = parseSelectedPlayerIds(exerciseForm.selectedPlayerIdsJson);
  const selectablePlayers = (selectablePlayersQuery.data ?? []).filter((p) => p.available !== false);
  const selectedPlayersCount = selectedPlayerIds.length;
  const allPlayersCount = selectablePlayers.length;
  const computedPlayersRequired =
    exerciseForm.playersRequiredMode === "all"
      ? allPlayersCount
      : exerciseForm.playersRequiredMode === "selected"
        ? selectedPlayersCount
        : (exerciseForm.playersRequired ? Number(exerciseForm.playersRequired) : null);

  function toggleMaterial(id: MaterialId, checked: boolean) {
    const next: Partial<Record<MaterialId, number>> = { ...materialSelection };
    if (checked) {
      next[id] = next[id] && next[id]! > 0 ? next[id] : 1;
    } else {
      delete next[id];
    }
    setExerciseForm((prev) => ({ ...prev, equipment: serializeEquipmentSelection(next) }));
  }

  function setMaterialQty(id: MaterialId, rawValue: string) {
    const parsed = Number(rawValue);
    const next: Partial<Record<MaterialId, number>> = { ...materialSelection };
    if (!Number.isFinite(parsed) || parsed <= 0) {
      delete next[id];
    } else {
      next[id] = parsed;
    }
    setExerciseForm((prev) => ({ ...prev, equipment: serializeEquipmentSelection(next) }));
  }

  function toggleSelectedPlayer(playerId: number, checked: boolean) {
    const nextSet = new Set(selectedPlayerIds);
    if (checked) nextSet.add(playerId);
    else nextSet.delete(playerId);
    setExerciseForm((prev) => ({
      ...prev,
      selectedPlayerIdsJson: nextSet.size > 0 ? JSON.stringify(Array.from(nextSet)) : "",
    }));
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Scheda sessione - {session.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {statusBadge(session.status)}
                {typeBadge(session.sessionKind)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{fmtDate(session.scheduledAt)}</span>
                </div>
                {session.durationMinutes && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{session.durationMinutes} min</span>
                  </div>
                )}
                {session.location && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{session.location}</span>
                  </div>
                )}
                {session.teamName && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ClipboardList className="w-4 h-4" />
                    <span>{session.teamName}</span>
                  </div>
                )}
              </div>
              {session.durationMinutes && (
                <div className="mt-3 rounded-md border border-dashed bg-background p-2">
                  {linkedExercisesQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground mt-0.5">Calcolo in corso...</p>
                  ) : linkedExercises.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-0.5">Aggiungi esercitazioni per calcolare il recupero medio.</p>
                  ) : (
                    <>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Recupero medio tra esercitazioni{" "}
                        <span className="text-foreground font-semibold">{Math.round(recoveryPerExercise ?? 0)} min</span>
                      </p>
                      <p className="text-xs mt-0.5">
                        ({session.durationMinutes} - {plannedExerciseMinutes} = {residualMinutes}, ripartiti su {linkedExercises.length} esercitazioni)
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Esercitazioni associate
              </h3>
              <div className="flex items-center gap-2">
                {!linkedExercisesQuery.isLoading && (
                  <Badge variant="secondary">{linkedExercises.length}</Badge>
                )}
                <Button size="sm" onClick={openAddExercise}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Aggiungi esercitazione
                </Button>
              </div>
            </div>

            {linkedExercisesQuery.isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array(2).fill(0).map((_, i) => (
                  <div key={i} className="h-28 rounded-lg bg-muted/30 animate-pulse" />
                ))}
              </div>
            ) : linkedExercises.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-sm text-muted-foreground">
                  Nessuna esercitazione collegata a questa sessione.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {linkedExercises.map((link, index) => (
                  <Card key={link.id} className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm leading-tight truncate">
                            {link.exercise?.title ?? "Esercitazione non trovata"}
                          </p>
                          {link.exercise?.principio && (
                            <p className="text-[11px] text-primary font-medium mt-0.5">
                              Principio: {principioLabel(link.exercise.principio)}
                            </p>
                          )}
                          {link.exercise?.sourceExerciseId && link.exercise?.originalCreatedByName && (
                            <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                              Originale creato da {link.exercise.originalCreatedByName}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">#{index + 1}</Badge>
                          {link.exercise && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Modifica esercitazione"
                              onClick={() => openEditExercise(link)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Rimuovi dalla sessione"
                            onClick={() => {
                              if (confirm("Rimuovere l'esercitazione da questa sessione?")) {
                                removeLinkMutation.mutate(link.id);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {trainingDayLabel(link.exercise?.trainingDay) && (
                          <span>Giorno: {trainingDayLabel(link.exercise?.trainingDay)}</span>
                        )}
                        {trainingSessionLabel(link.exercise?.trainingSession ?? link.exercise?.trainingDay) && (
                          <span>{t.trainingSessionField}: {trainingSessionLabel(link.exercise?.trainingSession ?? link.exercise?.trainingDay, t)}</span>
                        )}
                        {link.exercise?.durationMinutes && (
                          <span>Durata: {link.exercise.durationMinutes} min</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {link.exercise?.trainingPhase && (
                          <span>Fase: {phaseLabel(link.exercise.trainingPhase)}</span>
                        )}
                        {link.exercise?.category && (
                          <span>Categoria: {categoryLabel(link.exercise.category)}</span>
                        )}
                        {link.exercise?.teamId && (
                          <span>Squadra: {teams.find((team) => team.id === link.exercise?.teamId)?.name ?? `Team #${link.exercise.teamId}`}</span>
                        )}
                      </div>

                      {link.exercise?.description && (
                        <p className="text-xs text-foreground/80 line-clamp-3">{link.exercise.description}</p>
                      )}

                      {link.exercise?.playersRequired && (
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {link.exercise.playersRequired} giocatori
                          </span>
                        </div>
                      )}

                      {link.notes && (
                        <div className="rounded-md border bg-muted/40 p-2">
                          <p className="text-[11px] font-medium text-muted-foreground">Note sessione</p>
                          <p className="text-xs text-foreground/80">{link.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <Dialog open={exerciseFormOpen} onOpenChange={(v) => { if (!v) { setExerciseFormOpen(false); setEditingLink(null); setDuplicateSourceExerciseId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {editingLink ? "Modifica esercitazione collegata" : "Nuova esercitazione per sessione"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 overflow-auto">
            <form id="ex-form-session" onSubmit={handleSaveExercise} className="px-6 pb-4">
              <Tabs defaultValue="info" className="w-full pt-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="board" className="flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5" /> Lavagna
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" /> Voce
                  </TabsTrigger>
                  <TabsTrigger value="video" className="flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" /> Video
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Giorno allenamento</Label>
                      <Input
                        type="date"
                        value={TRAINING_SESSIONS.some((item) => item.value === exerciseForm.trainingDay) ? "" : exerciseForm.trainingDay}
                        onChange={(e) => setExerciseForm((prev) => ({ ...prev, trainingDay: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Sessione allenamento</Label>
                      <Select value={exerciseForm.trainingSession || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, trainingSession: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona sessione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {TRAINING_SESSIONS.map((s) => <SelectItem key={s.value} value={s.value}>{trainingSessionOptionLabel(s.value, t)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Durata (min)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={exerciseForm.durationMinutes}
                        onChange={(e) => setExerciseForm((prev) => ({ ...prev, durationMinutes: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Principio</Label>
                      <Select value={exerciseForm.principio || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, principio: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona principio" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuno</SelectItem>
                          {PRINCIPI.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select value={exerciseForm.category || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, category: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {EXERCISE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Fase allenamento</Label>
                      <Select value={exerciseForm.trainingPhase || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, trainingPhase: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona fase" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {TRAINING_PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Squadra</Label>
                      <Select value={exerciseForm.teamId || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, teamId: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona squadra" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {teams.map((team) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Titolo <span className="text-destructive">*</span></Label>
                    <Input
                      value={exerciseForm.title}
                      onChange={(e) => setExerciseForm((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Descrizione</Label>
                    <Textarea
                      value={exerciseForm.description}
                      onChange={(e) => setExerciseForm((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Giocatori richiesti</Label>
                        <Select
                          value={exerciseForm.playersRequiredMode}
                          onValueChange={(value) => setExerciseForm((prev) => ({
                            ...prev,
                            playersRequiredMode: value as "manual" | "all" | "selected",
                            ...(value === "all" ? { playersRequired: "", selectedPlayerIdsJson: "" } : {}),
                            ...(value === "manual" ? { selectedPlayerIdsJson: "" } : {}),
                          }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tutti</SelectItem>
                            <SelectItem value="manual">Inserisci numero</SelectItem>
                            <SelectItem value="selected">Selezionati da rosa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Totale richiesto</Label>
                        <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm font-semibold">
                          {computedPlayersRequired ?? 0} giocatori
                        </div>
                      </div>
                    </div>

                    {exerciseForm.playersRequiredMode === "manual" && (
                      <div className="space-y-2">
                        <Label>Inserisci numero</Label>
                        <Input
                          type="number"
                          min={1}
                          value={exerciseForm.playersRequired}
                          onChange={(e) => setExerciseForm((prev) => ({ ...prev, playersRequired: e.target.value }))}
                        />
                      </div>
                    )}

                    {exerciseForm.playersRequiredMode === "selected" && (
                      <div className="space-y-2 rounded-md border bg-background p-3">
                        <div className="text-xs text-muted-foreground">
                          {exerciseForm.teamId ? "Seleziona giocatori della squadra scelta" : "Seleziona giocatori dalle squadre assegnate all'allenatore"}
                        </div>
                        {selectablePlayersQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground italic">Caricamento giocatori...</p>
                        ) : selectablePlayers.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">Nessun giocatore disponibile per la selezione.</p>
                        ) : (
                          <div className="max-h-52 space-y-2 overflow-auto pr-1">
                            {selectablePlayers.map((player) => {
                              const isChecked = selectedPlayerIds.includes(player.id);
                              return (
                                <label key={player.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/40">
                                  <Checkbox checked={isChecked} onCheckedChange={(value) => toggleSelectedPlayer(player.id, !!value)} />
                                  <span className="text-sm">{player.firstName} {player.lastName}</span>
                                  {player.teamName ? <span className="ml-auto text-xs text-muted-foreground">{player.teamName}</span> : null}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">Materiale</div>
                    <div className="grid grid-cols-1 gap-2">
                      {MATERIAL_OPTIONS.map((option) => {
                        const checked = (materialSelection[option.id] ?? 0) > 0;
                        return (
                          <div key={option.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                            <Checkbox checked={checked} onCheckedChange={(value) => toggleMaterial(option.id, !!value)} />
                            <span className="flex-1 text-sm">{option.label}</span>
                            {checked ? (
                              <Input
                                type="number"
                                min={1}
                                className="w-24"
                                value={materialSelection[option.id] ?? 1}
                                onChange={(event) => setMaterialQty(option.id, event.target.value)}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50">
                    <div>
                      <p className="text-sm font-medium">Segna come bozza</p>
                      <p className="text-xs text-muted-foreground">L'esercizio sarà visibile come bozza da completare</p>
                    </div>
                    <Switch checked={exerciseForm.isDraft} onCheckedChange={(v) => setExerciseForm((prev) => ({ ...prev, isDraft: v }))} />
                  </div>
                </TabsContent>

                <TabsContent value="board" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Disegna rapidamente lo schema tattico dell'esercizio.</p>
                  <ExerciseDrawingBoard
                    value={exerciseForm.drawingData || null}
                    onChange={(data) => setExerciseForm((prev) => ({ ...prev, drawingData: data ?? "" }))}
                    onChangeElements={(els) => setExerciseForm((prev) => ({ ...prev, drawingElementsJson: els ? JSON.stringify(els) : "" }))}
                  />
                </TabsContent>

                <TabsContent value="voice" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Registra una nota vocale per descrivere l'esercizio.</p>
                  <ExerciseVoiceRecorder
                    value={exerciseForm.voiceNoteData || null}
                    onChange={(data) => setExerciseForm((prev) => ({ ...prev, voiceNoteData: data ?? "" }))}
                  />
                </TabsContent>

                <TabsContent value="video" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Registra una nota video per mostrare dettagli tecnici.</p>
                  <ExerciseVideoRecorder
                    value={exerciseForm.videoNoteData || null}
                    onChange={(data) => setExerciseForm((prev) => ({ ...prev, videoNoteData: data ?? "" }))}
                  />
                </TabsContent>
              </Tabs>
            </form>
          </ScrollArea>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setExerciseFormOpen(false); setEditingLink(null); setDuplicateSourceExerciseId(null); }}>
              Annulla
            </Button>
            {editingLink && (
              <Button type="button" variant="outline" onClick={handleSaveAsNewLinkedExercise} disabled={exerciseSaving}>
                Salva come nuova esercitazione
              </Button>
            )}
            <Button type="submit" form="ex-form-session" disabled={exerciseSaving}>
              {exerciseSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingLink ? "Salva modifiche" : "Salva esercitazione"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type TrainingPageProps = {
  section?: string;
};

export default function TrainingPage({ section }: TrainingPageProps = {}) {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [coachTeamScope, setCoachTeamScope] = useState("");
  const [coachDateFilter, setCoachDateFilter] = useState<"all" | string>("all");
  const [coachPrincipleFilter, setCoachPrincipleFilter] = useState<"all" | string>("all");
  const [coachSlotFilter, setCoachSlotFilter] = useState<"all" | string>("all");
  const [coachStatusFilter, setCoachStatusFilter] = useState<"all" | string>("all");
  const [tdSessionSearch, setTdSessionSearch] = useState("");
  const [tdExerciseSearch, setTdExerciseSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [commentSession, setCommentSession] = useState<TrainingSession | null>(null);
  const [detailsSession, setDetailsSession] = useState<TrainingSession | null>(null);
  const [directiveOpen, setDirectiveOpen] = useState(false);
  const [dismissedDirectives, setDismissedDirectives] = useState<number[]>([]);

  const sessionsQuery = useQuery<TrainingSession[]>({
    queryKey: ["/api/training-sessions"],
    queryFn: () => apiFetch("/api/training-sessions"),
    enabled: !!role,
  });

  const directivesQuery = useQuery<TrainingDirective[]>({
    queryKey: ["/api/training-directives"],
    queryFn: () => apiFetch("/api/training-directives"),
    enabled: !!role && !["secretary", "admin", "director"].includes(role),
  });

  const membersQuery = useQuery<Member[]>({
    queryKey: ["/api/clubs/me/members"],
    queryFn: () => apiFetch("/api/clubs/me/members"),
    enabled: role === "technical_director",
  });

  const teamsQuery = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/teams"],
    queryFn: () => apiFetch("/api/teams"),
    enabled: !!role,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/training-sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training-sessions"] }); toast({ title: "Sessione eliminata" }); },
    onError: () => toast({ title: "Errore nell'eliminazione", variant: "destructive" }),
  });

  const deleteDirectiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/training-directives/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/training-directives"] }),
  });

  function invalidateSessions() { qc.invalidateQueries({ queryKey: ["/api/training-sessions"] }); }
  function invalidateDirectives() { qc.invalidateQueries({ queryKey: ["/api/training-directives"] }); }

  const sessions = sessionsQuery.data ?? [];
  const directives = directivesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const userId = (user as any)?.id as number | undefined;

  const activeDirectives = directives.filter(d => !dismissedDirectives.includes(d.id));

  // ── Session grids ─────────────────────────────────────────────────────────
  const isReadOnly = ["admin", "presidente", "director"].includes(role ?? "");
  const isTD = role === "technical_director";
  const isCoach = ["coach", "fitness_coach", "athletic_director"].includes(role ?? "");

  const regularSessions = sessions.filter(s => s.sessionKind === "regular");
  const tipoSessions = sessions.filter(s => s.sessionKind === "tipo");
  const tdSessionExerciseQueries = useQueries({
    queries: isTD
      ? sessions.map((session) => ({
          queryKey: ["/api/training-sessions", session.id, "exercises", "td-search-scope"],
          queryFn: () => apiFetch(`/api/training-sessions/${session.id}/exercises`),
        }))
      : [],
  });
  const tdSessionExercisesBySessionId = new Map<number, SessionExerciseLink[]>();
  if (isTD) {
    sessions.forEach((session, index) => {
      tdSessionExercisesBySessionId.set(session.id, (tdSessionExerciseQueries[index]?.data as SessionExerciseLink[] | undefined) ?? []);
    });
  }
  const normalizedTdSessionSearch = tdSessionSearch.trim().toLowerCase();
  const normalizedTdExerciseSearch = tdExerciseSearch.trim().toLowerCase();
  const filteredSessionsForTD = sessions
    .filter((s) => matchesSessionSearch(s, normalizedTdSessionSearch))
    .filter((s) => {
      if (!normalizedTdExerciseSearch) return true;
      const links = tdSessionExercisesBySessionId.get(s.id) ?? [];
      if (links.length === 0) return false;
      return links.some((link) => matchesExerciseSearch(link, normalizedTdExerciseSearch, s.scheduledAt, s.teamName));
    });
  const filteredTipoSessionsForTD = filteredSessionsForTD.filter((s) => s.sessionKind === "tipo");
  const mySessionsForCoach = sessions.filter(s =>
    s.sessionKind === "regular" && s.createdByUserId === userId
  );
  const coachTeamOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const s of mySessionsForCoach) {
      const key = s.teamId != null ? String(s.teamId) : "__none__";
      if (!map.has(key)) {
        map.set(key, { id: key, label: s.teamName?.trim() || "Senza squadra" });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [mySessionsForCoach]);
  useEffect(() => {
    if (coachTeamOptions.length === 1 && !coachTeamScope) setCoachTeamScope(coachTeamOptions[0].id);
  }, [coachTeamOptions, coachTeamScope]);
  const coachSessionsByTeamScope = useMemo(() => {
    if (coachTeamOptions.length > 1 && !coachTeamScope) return [] as TrainingSession[];
    if (!coachTeamScope) return mySessionsForCoach;
    if (coachTeamScope === "__none__") return mySessionsForCoach.filter((s) => s.teamId == null);
    const targetId = Number(coachTeamScope);
    return mySessionsForCoach.filter((s) => s.teamId === targetId);
  }, [mySessionsForCoach, coachTeamOptions.length, coachTeamScope]);
  const coachDateOptions = useMemo(() => {
    const dates = new Set<string>();
    for (const s of coachSessionsByTeamScope) {
      const d = new Date(s.scheduledAt);
      if (!Number.isNaN(d.getTime())) dates.add(d.toISOString().slice(0, 10));
    }
    return Array.from(dates.values()).sort((a, b) => b.localeCompare(a));
  }, [coachSessionsByTeamScope]);
  const coachPrincipleOptions = useMemo(() => {
    const vals = new Set<string>();
    for (const s of coachSessionsByTeamScope) {
      const v = (s.objectives ?? "").trim();
      if (v) vals.add(v);
    }
    return Array.from(vals.values()).sort((a, b) => a.localeCompare(b, "it"));
  }, [coachSessionsByTeamScope]);
  const coachSlotOptions = useMemo(() => {
    const vals = new Set<string>();
    for (const s of coachSessionsByTeamScope) {
      const v = (getSessionTrainingSession(s) ?? "").trim();
      if (v) vals.add(v);
    }
    return Array.from(vals.values()).sort((a, b) => a.localeCompare(b, "it"));
  }, [coachSessionsByTeamScope]);
  const filteredMySessionsForCoach = coachSessionsByTeamScope.filter((s) => {
    const dateKey = (() => {
      const d = new Date(s.scheduledAt);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    })();
    const principle = (s.objectives ?? "").trim();
    const slot = (getSessionTrainingSession(s) ?? "").trim();
    const status = (s.status ?? "").trim();
    if (coachDateFilter !== "all" && dateKey !== coachDateFilter) return false;
    if (coachPrincipleFilter !== "all" && principle !== coachPrincipleFilter) return false;
    if (coachSlotFilter !== "all" && slot !== coachSlotFilter) return false;
    if (coachStatusFilter !== "all" && status !== coachStatusFilter) return false;
    return true;
  });
  const tipoReceived = sessions.filter(s =>
    s.sessionKind === "tipo" && s.sentToUserIds?.includes(userId ?? 0)
  );

  function SessionGrid({ items, emptyMsg, canDeleteFn, canEditFn, showComment, onOpenDetails, showRecovery }: {
    items: TrainingSession[];
    emptyMsg: string;
    canDeleteFn?: (s: TrainingSession) => boolean;
    canEditFn?: (s: TrainingSession) => boolean;
    showComment?: boolean;
    onOpenDetails?: (s: TrainingSession) => void;
    showRecovery?: boolean;
  }) {
    if (sessionsQuery.isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-44 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      );
    }
    if (!items.length) {
      return (
        <div className="text-center py-16">
          <Calendar className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">{emptyMsg}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(s => (
          <SessionCard
            key={s.id}
            session={s}
            canDelete={canDeleteFn ? canDeleteFn(s) : false}
            canEdit={canEditFn ? canEditFn(s) : false}
            onDelete={() => { if (confirm("Eliminare questa sessione?")) deleteMutation.mutate(s.id); }}
            onEdit={() => setEditingSession(s)}
            onComment={showComment ? () => setCommentSession(s) : undefined}
            onOpenDetails={onOpenDetails ? () => onOpenDetails(s) : undefined}
            showRecovery={showRecovery}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>
    );
  }

  // ── Technical Director view ───────────────────────────────────────────────
  if (isTD) {
    const tdDirectives = directives;
    const tdHasSearchFilters = !!(tdSessionSearch.trim() || tdExerciseSearch.trim());
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Gestione Allenamenti
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualizza tutte le sessioni, invia sessioni tipo e direttive agli allenatori
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDirectiveOpen(true)}>
              <Megaphone className="w-4 h-4 mr-2" />
              Direttiva
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nuova sessione
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cerca sessioni (principio, giorno, squadra, stato)</Label>
            <Input
              value={tdSessionSearch}
              onChange={(e) => setTdSessionSearch(e.target.value)}
              placeholder="Es. Giorno 2, tecnico tattico, pianificata..."
            />
          </div>
          <div className="space-y-2">
            <Label>Cerca esercitazioni nelle sessioni (titolo, categoria, principio, fase)</Label>
            <Input
              value={tdExerciseSearch}
              onChange={(e) => setTdExerciseSearch(e.target.value)}
              placeholder="Es. possesso, tecnica, fase centrale..."
            />
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="all">
              Tutte le sessioni
              {filteredSessionsForTD.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">{filteredSessionsForTD.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tipo">
              Sessioni Tipo
              {filteredTipoSessionsForTD.length > 0 && <Badge className="ml-1.5 bg-amber-100 text-amber-700 text-[10px] px-1">{filteredTipoSessionsForTD.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="directives">
              Direttive
              {tdDirectives.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">{tdDirectives.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Tab: All sessions */}
          <TabsContent value="all" className="mt-6">
            <SessionGrid
              items={filteredSessionsForTD}
              emptyMsg={tdHasSearchFilters ? "Nessuna sessione trovata con i filtri di ricerca" : "Nessuna sessione di allenamento registrata nel club"}
              canDeleteFn={s => s.createdByUserId === userId}
              canEditFn={s => s.createdByUserId === userId}
              showComment={true}
              onOpenDetails={setDetailsSession}
              showRecovery
            />
          </TabsContent>

          {/* Tab: Sessioni Tipo */}
          <TabsContent value="tipo" className="mt-6">
            <div className="mb-4 flex items-start gap-3 text-sm text-muted-foreground bg-amber-50/60 border border-amber-200 rounded-lg px-4 py-3">
              <Star className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                Le <strong>Sessioni Tipo</strong> vengono inviate agli allenatori o preparatori selezionati e appaiono direttamente nelle loro dashboard come sessioni da seguire.
              </span>
            </div>
            <SessionGrid
              items={filteredTipoSessionsForTD}
              emptyMsg={tdHasSearchFilters ? "Nessuna sessione trovata con i filtri di ricerca" : "Nessuna sessione tipo inviata"}
              canDeleteFn={s => s.createdByUserId === userId}
              canEditFn={s => s.createdByUserId === userId}
              showComment={true}
              onOpenDetails={setDetailsSession}
              showRecovery
            />
          </TabsContent>

          {/* Tab: Directives */}
          <TabsContent value="directives" className="mt-6">
            <div className="space-y-3">
              {tdDirectives.length === 0 ? (
                <div className="text-center py-16">
                  <Megaphone className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground">Nessuna direttiva inviata</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setDirectiveOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Invia prima direttiva
                  </Button>
                </div>
              ) : tdDirectives.map(d => (
                <Card key={d.id} className="border-amber-200/60">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{d.title}</p>
                          {directiveTypeBadge(d.type)}
                          {d.scheduledFor && (
                            <span className="text-[10px] text-muted-foreground">Ref: {fmtShortDate(d.scheduledFor)}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/80">{d.message}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Inviata il {fmtShortDate(d.createdAt)} · {d.sentToUserIds.length} destinatari
                        </p>
                      </div>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => { if (confirm("Eliminare questa direttiva?")) deleteDirectiveMutation.mutate(d.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <CreateSessionDialog
          open={createOpen} onClose={() => setCreateOpen(false)}
          onCreated={invalidateSessions} members={members} isTD teams={teams}
        />
        <DirectiveDialog
          open={directiveOpen} onClose={() => setDirectiveOpen(false)}
          onCreated={invalidateDirectives} members={members}
        />
        {commentSession && (
          <CommentDialog
            session={commentSession}
            onClose={() => setCommentSession(null)}
            onSaved={invalidateSessions}
          />
        )}
        {editingSession && (
          <EditSessionDialog
            session={editingSession}
            onClose={() => setEditingSession(null)}
            onSaved={invalidateSessions}
            teams={teams}
          />
        )}
      </div>
    );
  }

  // ── Secretary: pianificazione per tutto il club ────────────────────────────
  if (role === "secretary") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              Pianificazione sessioni (segreteria)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestisci le sessioni di tutte le squadre. Per avvisi verso allenatori, preparatori e genitori usa le notifiche piattaforma.
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/club/platform-notifications">Notifiche piattaforma</Link>
          </Button>
        </div>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Puoi creare, modificare ed eliminare sessioni per conto del club. Staff tecnico e preparatori vedono e aggiornano le sessioni delle proprie annate dalla propria area.
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuova sessione
          </Button>
        </div>

        <SessionGrid
          items={sessions}
          emptyMsg="Nessuna sessione di allenamento registrata nel club"
          canDeleteFn={() => true}
          canEditFn={() => true}
          onOpenDetails={setDetailsSession}
          showRecovery
        />

        <CreateSessionDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={invalidateSessions}
          onCreatedSession={(created) => setDetailsSession(created)}
          members={[]}
          isTD={false}
          teams={teams}
        />
        {detailsSession && (
          <SessionDetailsDialog
            session={detailsSession}
            onClose={() => setDetailsSession(null)}
            teams={teams}
          />
        )}
        {editingSession && (
          <EditSessionDialog
            session={editingSession}
            onClose={() => setEditingSession(null)}
            onSaved={invalidateSessions}
            teams={teams}
          />
        )}
      </div>
    );
  }

  // ── Admin / Director / Presidente: read-only ─────────────────────────────
  if (isReadOnly) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              Calendario Allenamenti
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Vista completa — solo lettura</p>
          </div>
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <Eye className="w-3 h-3" /> Solo visualizzazione
          </Badge>
        </div>
        <SessionGrid
          items={sessions}
          emptyMsg="Nessuna sessione di allenamento programmata"
          onOpenDetails={setDetailsSession}
        />
      </div>
    );
  }

  // ── Coach / Fitness Coach / Athletic Director ─────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Le mie Sessioni
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Pianifica e gestisci le tue sessioni di allenamento</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova sessione
        </Button>
      </div>

      {/* Directives from TD */}
      {activeDirectives.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
            Direttive dal Direttore Tecnico
          </h2>
          <DirectivesBanner
            directives={activeDirectives}
            onDismiss={id => setDismissedDirectives(prev => [...prev, id])}
          />
        </div>
      )}

      {/* Tipo sessions received */}
      {tipoReceived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-500" />
            Sessioni Tipo da Seguire ({tipoReceived.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tipoReceived.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        </div>
      )}

      {/* My sessions */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Le mie sessioni ({filteredMySessionsForCoach.length}/{mySessionsForCoach.length})
        </h2>
        {coachTeamOptions.length > 1 ? (
          <div className="space-y-2">
            <Label>Annata / squadra di riferimento</Label>
            <Select value={coachTeamScope} onValueChange={setCoachTeamScope}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona annata/squadra" />
              </SelectTrigger>
              <SelectContent>
                {coachTeamOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : coachTeamOptions.length === 1 ? (
          <div className="flex items-center gap-2 text-sm">
            <Label className="mb-0">Annata / squadra:</Label>
            <Badge variant="secondary">{coachTeamOptions[0].label}</Badge>
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={coachDateFilter} onValueChange={(v) => setCoachDateFilter(v)}>
            <SelectTrigger><SelectValue placeholder="Data" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le date</SelectItem>
              {coachDateOptions.map((d) => (
                <SelectItem key={d} value={d}>{d.split("-").reverse().join("/")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachPrincipleFilter} onValueChange={(v) => setCoachPrincipleFilter(v)}>
            <SelectTrigger><SelectValue placeholder="Principio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i principi</SelectItem>
              {coachPrincipleOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachSlotFilter} onValueChange={(v) => setCoachSlotFilter(v)}>
            <SelectTrigger><SelectValue placeholder="Giorno/sessione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le sessioni</SelectItem>
              {coachSlotOptions.map((slot) => (
                <SelectItem key={slot} value={slot}>{trainingSessionOptionLabel(slot, t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachStatusFilter} onValueChange={(v) => setCoachStatusFilter(v)}>
            <SelectTrigger><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="scheduled">Pianificata</SelectItem>
              <SelectItem value="completed">Completata</SelectItem>
              <SelectItem value="cancelled">Annullata</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <SessionGrid
          items={filteredMySessionsForCoach}
          emptyMsg={
            coachTeamOptions.length > 1 && !coachTeamScope
              ? "Seleziona prima un'annata/squadra"
              : "Nessuna sessione trovata con i filtri selezionati"
          }
          canDeleteFn={s => s.createdByUserId === userId}
          canEditFn={s => s.createdByUserId === userId}
          onOpenDetails={setDetailsSession}
          showRecovery
        />
      </div>

      <CreateSessionDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={invalidateSessions}
        onCreatedSession={(created) => setDetailsSession(created)}
        members={[]}
        isTD={false}
        teams={teams}
      />
      {detailsSession && (
        <SessionDetailsDialog
          session={detailsSession}
          onClose={() => setDetailsSession(null)}
          teams={teams}
        />
      )}
      {editingSession && (
        <EditSessionDialog
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={invalidateSessions}
          teams={teams}
        />
      )}
    </div>
  );
}
