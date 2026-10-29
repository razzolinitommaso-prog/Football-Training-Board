import { useSessionParticipants } from "@/hooks/use-session-participants";
import { attendanceExerciseView } from "@workspace/api-zod";
import { StationTurnPlanner } from "@/components/training/StationTurnPlanner";
import { rotationSeconds, rotationRecoverySeconds, rotationPhaseSeconds, type TrainingRotations } from "@workspace/api-zod";
import { SessionTeamPicker } from "@/components/training/SessionTeamPicker";
import { sessionTeamIds, withSessionTeams, SESSION_TEAMS_MARKER } from "@workspace/api-zod";
import { TrainingCategoryPicker } from "@/components/training/TrainingCategoryPicker";
import { trainingCategoryLabel } from "@workspace/api-zod";
import { SessionObjectivePicker } from "@/components/training/SessionObjectivePicker";
import { PrinciplePicker } from "@/components/training/PrinciplePicker";
import { trainingPrincipleLabel } from "@workspace/api-zod";
import { inferTrainingSlot, trainingSlotOptions } from "@/lib/training-session-slot";
import { TrainingRosterPicker } from "@/components/training/TrainingRosterPicker";
import { MaterialPicker } from "@/components/training/MaterialPicker";
import { divideExerciseMinutes, sumExerciseMinutes, mergeExerciseMaterials } from "@/lib/exercise-station-timing";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { confirmDeleteTrainingSession } from "@/lib/delete-training-session";
import { TrainingSessionsCalendar } from "@/components/training/TrainingSessionsCalendar";
import type { SessionCalendarTeam, SessionPreparation } from "@/lib/training-session-calendar";
import { TrainingSessionOverview } from "@/components/training/TrainingSessionOverview";
import { TrainingAvailabilityPanel } from "@/components/calendar/TrainingAvailability";
import { TrainingRosterOptions } from "@/components/training-roster-groups";
import { ExerciseTacticalBoard, detachExerciseBoard } from "@/components/exercise-tactical-board";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { withApi } from "@/lib/api-base";

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
  canEdit?: boolean;
  preparation?: SessionPreparation;
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
  attendanceAdjusted?: boolean;
  statoLavagnaJson?: string | null;
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

type AttendanceSummary = {
  present: number;
  absent: number;
  requested: number;
  injured: number;
  total: number;
  recorded: number;
  percentage: number;
};

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
  statoLavagnaJson: string;
  drawingData: string;
  drawingElementsJson: string;
  voiceNoteData: string;
  videoNoteData: string;
  isDraft: boolean;
  notes: string;
  stationsJson: string;
};

type InitialSessionDraft = {
  teamId?: number | null;
  date?: string | null;
  start?: string | null;
  durationMinutes?: number;
  trainingSession?: string;
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
  { id: "cinesini", label: "Cinesini", category: "Campo e delimitazione", availability: "base" },
  { id: "coni", label: "Coni", category: "Campo e delimitazione", availability: "base" },
  { id: "piattelli", label: "Piattelli / delimitatori", category: "Campo e delimitazione", availability: "base" },
  { id: "marker_numerati", label: "Marker numerati / colorati", category: "Campo e delimitazione", availability: "base" },
  { id: "bandierine", label: "Bandierine", category: "Campo e delimitazione", availability: "base" },
  { id: "nastro_segnaletico", label: "Nastro segnaletico", category: "Campo e delimitazione", availability: "base" },
  { id: "spray_segnaletico", label: "Spray segnaletico", category: "Campo e delimitazione", availability: "youth" },
  { id: "rotella_metrica", label: "Rotella metrica / misuratore distanze", category: "Campo e delimitazione", availability: "base" },
  { id: "palloni", label: "Palloni", category: "Palla e tecnica", availability: "base" },
  { id: "carrello_palloni", label: "Carrello / porta palloni", category: "Palla e tecnica", availability: "base" },
  { id: "pompa_palloni", label: "Pompa palloni", category: "Palla e tecnica", availability: "base" },
  { id: "rebounder", label: "Rebounder", category: "Palla e tecnica", availability: "base" },
  { id: "rete_elastica", label: "Rete elastica", category: "Palla e tecnica", availability: "base" },
  { id: "telo_precisione", label: "Telo porta di precisione", category: "Palla e tecnica", availability: "base" },
  { id: "porte_ridotte", label: "Porte ridotte", category: "Palla e tecnica", availability: "base" },
  { id: "porticine", label: "Porticine", category: "Palla e tecnica", availability: "base" },
  { id: "mini_porte", label: "Mini porte", category: "Palla e tecnica", availability: "base" },
  { id: "porte_regolamentari", label: "Porte regolamentari", category: "Palla e tecnica", availability: "base" },
  { id: "reti_porte", label: "Reti per porte", category: "Palla e tecnica", availability: "base" },
  { id: "paletti", label: "Paletti", category: "Tattica e situazioni", availability: "base" },
  { id: "sagome", label: "Sagome", category: "Tattica e situazioni", availability: "base" },
  { id: "manichini_barriere", label: "Manichini / barriere", category: "Tattica e situazioni", availability: "youth" },
  { id: "barriere_punizioni", label: "Barriere punizioni", category: "Tattica e situazioni", availability: "youth" },
  { id: "dummy_gonfiabili", label: "Dummy gonfiabili", category: "Tattica e situazioni", availability: "youth" },
  { id: "lavagna_tattica", label: "Lavagna tattica", category: "Tattica e situazioni", availability: "base" },
  { id: "scalette", label: "Scaletta coordinativa", category: "Coordinazione e agility", availability: "base" },
  { id: "speed_ladder", label: "Speed ladder", category: "Coordinazione e agility", availability: "youth" },
  { id: "cerchi", label: "Cerchi", category: "Coordinazione e agility", availability: "base" },
  { id: "ostacoli_20", label: "Ostacoli bassi / 20cm", category: "Coordinazione e agility", availability: "base" },
  { id: "ostacoli_40", label: "Ostacoli medi / 40cm", category: "Coordinazione e agility", availability: "youth" },
  { id: "ostacoli_60", label: "Ostacoli alti / 60cm", category: "Coordinazione e agility", availability: "youth" },
  { id: "ostacoli_80", label: "Ostacoli alti / 80cm", category: "Coordinazione e agility", availability: "youth" },
  { id: "hurdles_regolabili", label: "Hurdles regolabili", category: "Coordinazione e agility", availability: "youth" },
  { id: "over", label: "Over bassi", category: "Coordinazione e agility", availability: "base" },
  { id: "bastoni_coordinativi", label: "Bastoni coordinativi", category: "Coordinazione e agility", availability: "base" },
  { id: "stazioni_agility", label: "Esercizi agility", category: "Coordinazione e agility", availability: "base" },
  { id: "reaction_lights", label: "Luci / reaction lights", category: "Coordinazione e agility", availability: "youth" },
  { id: "elastici", label: "Elastici", category: "Preparazione atletica", availability: "performance" },
  { id: "corde", label: "Corde", category: "Preparazione atletica", availability: "performance" },
  { id: "speed_rope", label: "Speed rope", category: "Preparazione atletica", availability: "performance" },
  { id: "paracadute_velocita", label: "Paracadute velocita", category: "Preparazione atletica", availability: "performance" },
  { id: "slitte_resistance", label: "Slitte / resistance sled", category: "Preparazione atletica", availability: "performance" },
  { id: "giubbotti_zavorrati", label: "Giubbotti zavorrati", category: "Preparazione atletica", availability: "performance" },
  { id: "med_ball", label: "Med Ball / palle mediche", category: "Preparazione atletica", availability: "performance" },
  { id: "fitball", label: "Fitball", category: "Preparazione atletica", availability: "performance" },
  { id: "bosu", label: "Bosu", category: "Preparazione atletica", availability: "performance" },
  { id: "tappetini", label: "Tappetini", category: "Preparazione atletica", availability: "performance" },
  { id: "box_pliometrico", label: "Box pliometrico", category: "Preparazione atletica", availability: "performance" },
  { id: "foam_roller", label: "Foam roller", category: "Preparazione atletica", availability: "performance" },
  { id: "manubri", label: "Manubri", category: "Forza avanzata", availability: "advanced" },
  { id: "kettlebell", label: "Kettlebell", category: "Forza avanzata", availability: "advanced" },
  { id: "bilancieri", label: "Bilancieri", category: "Forza avanzata", availability: "advanced" },
  { id: "pesi_dischi", label: "Pesi / dischi", category: "Forza avanzata", availability: "advanced" },
  { id: "cronometro", label: "Cronometro", category: "Monitoraggio e analisi", availability: "base" },
  { id: "gps_tracker", label: "GPS / tracker", category: "Monitoraggio e analisi", availability: "performance" },
  { id: "cardiofrequenzimetri", label: "Cardiofrequenzimetri", category: "Monitoraggio e analisi", availability: "performance" },
  { id: "tablet_video", label: "Tablet / videocamera per analisi", category: "Monitoraggio e analisi", availability: "youth" },
  { id: "kit_primo_soccorso", label: "Kit primo soccorso", category: "Sicurezza e recupero", availability: "base" },
  { id: "ghiaccio", label: "Ghiaccio", category: "Sicurezza e recupero", availability: "base" },
  { id: "defibrillatore", label: "Defibrillatore", category: "Sicurezza e recupero", availability: "base" },
  { id: "casacche", label: "Casacche", category: "Organizzazione allenamento", availability: "base" },
  { id: "pettorine_numerate", label: "Pettorine numerate", category: "Organizzazione allenamento", availability: "base" },
  { id: "fischietto", label: "Fischietto", category: "Organizzazione allenamento", availability: "base" },
] as const;
type MaterialId = (typeof MATERIAL_OPTIONS)[number]["id"];
type MaterialAvailability = (typeof MATERIAL_OPTIONS)[number]["availability"];


const EXERCISE_STATIONS_MARKER = "\n\n[FTB_EXERCISE_STATIONS]";
type ExerciseStation = {
  id: string;
  title: string;
  exercise: string;
  equipment: string;
  durationMinutes: string;
  notes: string;
  objective: string;
  playersRequired: string;
  variants: string[];
};
const TRAINING_SESSIONS = [
  { value: "giorno_1" },
  { value: "giorno_2" },
  { value: "giorno_3" },
] as const;

const SESSION_SLOT_NOTE_PREFIX = "__trainingSession=";
const TRAINING_CALENDAR_NOTE_MARKER = "[FTB_TRAINING_CALENDAR]";
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
  if (import.meta.env.DEV) console.log(`[training] request ${method} ${url}`);
  const res = await fetch(withApi(url), {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (import.meta.env.DEV) console.log(`[training] response ${method} ${url} -> ${res.status}`);
  if (!res.ok) {
    const errorText = await res.text();
    if (import.meta.env.DEV) console.error(`[training] error ${method} ${url}:`, errorText);
    throw new Error(errorText);
  }
  if (res.status === 204) return null;
  const payload = await res.json();
  if (import.meta.env.DEV) console.log(`[training] payload ${method} ${url}:`, payload);
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
  return byLabel?.value ?? value.trim();
}

function emptyExerciseFormFromSession(session: TrainingSession, existingCount: number): ExerciseFormState {
  const inheritedTrainingSession = getSessionTrainingSession(session) ?? "";
  return {
    title: `Stazione ${existingCount + 1} - ${session.title}`,
    category: "",
    description: "",
    durationMinutes: "15",
    playersRequired: "",
    equipment: "",
    teamId: session.teamId ? String(session.teamId) : "",
    trainingDay: toDateInputValue(session.scheduledAt),
    trainingSession: inheritedTrainingSession,
    trainingPhase: "",
    principio: normalizePrincipio(session.objectives),
    playersRequiredMode: "manual",
    selectedPlayerIdsJson: "",
    statoLavagnaJson: "",
    drawingData: "",
    drawingElementsJson: "",
    voiceNoteData: "",
    videoNoteData: "",
    isDraft: false,
    notes: "",
    stationsJson: JSON.stringify([]),
  };
}

function formFromLinkedExercise(link: SessionExerciseLink): ExerciseFormState {
  const rawTrainingDay = link.exercise?.trainingDay ?? "";
  const normalizedTrainingDay = /^\d{4}-\d{2}-\d{2}$/.test(rawTrainingDay) ? rawTrainingDay : "";
  const inferredMode: "all" | "manual" | "selected" =
    link.exercise?.scegliGiocatori ? "selected" : link.exercise?.caricaRosaIntera ? "all" : "manual";
  const parsedDescription = splitExerciseDescriptionAndStations(link.exercise?.description ?? "");
  return {
    title: link.exercise?.title ?? "",
    category: link.exercise?.category ?? "",
    description: parsedDescription.description,
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
    statoLavagnaJson: link.exercise?.statoLavagnaJson ?? "",
    drawingData: link.exercise?.drawingData ?? "",
    drawingElementsJson: link.exercise?.drawingElementsJson ?? "",
    voiceNoteData: link.exercise?.voiceNoteData ?? "",
    videoNoteData: link.exercise?.videoNoteData ?? "",
    isDraft: !!link.exercise?.isDraft,
    notes: link.notes ?? "",
    stationsJson: JSON.stringify(parsedDescription.stations),
  };
}

function parseExerciseStations(raw: string): ExerciseStation[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        id: String(item?.id || `${Date.now()}-${index}`),
        title: String(item?.title ?? ""),
        exercise: String(item?.exercise ?? ""),
        equipment: String(item?.equipment ?? ""),
        durationMinutes: String(item?.durationMinutes ?? ""),
        notes: String(item?.notes ?? ""),
        objective: String(item?.objective ?? ""),
        playersRequired: String(item?.playersRequired ?? ""),
        variants: Array.isArray(item?.variants) ? item.variants.map((variant: unknown) => String(variant ?? "")) : ["", "", ""],
      }))
      .filter((station: ExerciseStation) =>
        station.title.trim() ||
        station.exercise.trim() ||
        station.equipment.trim() ||
        station.durationMinutes.trim() ||
        station.notes.trim() ||
        station.objective.trim() ||
        station.playersRequired.trim() ||
        station.variants.some((variant) => variant.trim()),
      );
  } catch {
    return [];
  }
}

function splitExerciseDescriptionAndStations(raw: string): { description: string; stations: ExerciseStation[] } {
  const idx = raw.indexOf(EXERCISE_STATIONS_MARKER);
  if (idx < 0) return { description: raw, stations: [] };
  const description = raw.slice(0, idx).trim();
  const json = raw.slice(idx + EXERCISE_STATIONS_MARKER.length).trim();
  return { description, stations: parseExerciseStations(json) };
}

function composeExerciseDescription(description: string, stations: ExerciseStation[]): string | null {
  const cleanDescription = description.trim();
  const cleanStations = stations.filter((station) =>
    station.title.trim() ||
    station.exercise.trim() ||
    station.equipment.trim() ||
    Number(station.durationMinutes) > 0 ||
    station.notes.trim() ||
    station.objective.trim() ||
    station.playersRequired.trim() ||
    station.variants.some((variant) => variant.trim()),
  );
  if (cleanStations.length === 0) return cleanDescription || null;
  return `${cleanDescription}${EXERCISE_STATIONS_MARKER}${JSON.stringify(cleanStations)}`;
}

function totalStationMinutes(stations: ExerciseStation[]): number {
  return sumExerciseMinutes(stations);
}

function normalizeClubSection(value: string | null | undefined): "scuola_calcio" | "settore_giovanile" | "prima_squadra" | null {
  const normalized = String(value ?? "").replace(/-/g, "_");
  if (normalized === "scuola_calcio" || normalized === "settore_giovanile" || normalized === "prima_squadra") return normalized;
  return null;
}

function canUseMaterial(
  availability: MaterialAvailability,
  section: ReturnType<typeof normalizeClubSection>,
  role: string | null | undefined,
): boolean {
  if (availability === "base") return true;
  if (section === "scuola_calcio") return false;
  if (availability === "youth") return section === "settore_giovanile" || section === "prima_squadra" || section == null;
  if (availability === "performance") return section === "settore_giovanile" || section === "prima_squadra";
  if (availability === "advanced") return section === "prima_squadra" || ["fitness_coach", "athletic_director", "director", "admin", "presidente"].includes(role ?? "");
  return false;
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
  const value = noteValue.slice(SESSION_SLOT_NOTE_PREFIX.length).split("\n")[0].trim();
  if (!value) return null;
  return /^giorno_([1-9]|1[0-4])$/.test(value) ? value : null;
}

function getTrainingCalendarNote(session: TrainingSession): string | null {
  const note = session.notes ?? "";
  const idx = note.indexOf(TRAINING_CALENDAR_NOTE_MARKER);
  if (idx < 0) return null;
  return note.slice(idx + TRAINING_CALENDAR_NOTE_MARKER.length).split(SESSION_TEAMS_MARKER)[0].trim() || null;
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

function sumStationEquipment(stations: ExerciseStation[]): Partial<Record<MaterialId, number>> {
  const totals: Partial<Record<MaterialId, number>> = {};
  stations.forEach((station) => {
    const selection = parseEquipmentSelection(station.equipment);
    Object.entries(selection).forEach(([id, qty]) => {
      const materialId = id as MaterialId;
      const value = Number(qty);
      if (Number.isFinite(value) && value > 0) {
        totals[materialId] = (totals[materialId] ?? 0) + value;
      }
    });
  });
  return totals;
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

function formatEquipmentLabel(raw: string | null | undefined): string | null {
  const selection = parseEquipmentSelection(raw ?? "");
  const items = MATERIAL_OPTIONS
    .filter((option) => (selection[option.id] ?? 0) > 0)
    .map((option) => `${option.label}: ${selection[option.id]}`);
  if (items.length > 0) return items.join(" · ");
  return raw || null;
}

function emptyExerciseStation(): ExerciseStation {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    exercise: "",
    equipment: "",
    durationMinutes: "0",
    notes: "",
    objective: "",
    playersRequired: "",
    variants: ["", "", ""],
  };
}

function statusBadge(status: string, timelineState?: SessionTimelineState) {
  if (timelineState === "next" || timelineState === "future") return <Badge variant="outline" className="bg-white text-slate-700 border-slate-200 text-[10px]">Da venire</Badge>;
  if (timelineState === "past") return <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">Passata</Badge>;
  if (status === "scheduled") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Pianificata</Badge>;
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Completata</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Annullata</Badge>;
}

function typeBadge(kind: string) {
  if (kind === "tipo") return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
      <Star className="w-2.5 h-2.5" /> Seduta Tipo
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
  return trainingPrincipleLabel(normalized || value);
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

function getSessionSeasonKey(session: TrainingSession): string {
  const parsed = new Date(session.scheduledAt);
  if (Number.isNaN(parsed.getTime())) return "senza-data";
  const year = parsed.getMonth() >= 6 ? parsed.getFullYear() : parsed.getFullYear() - 1;
  return String(year);
}

function getSessionSeasonLabel(seasonKey: string): string {
  if (seasonKey === "senza-data") return "Senza data";
  const startYear = Number(seasonKey);
  return Number.isFinite(startYear) ? `${startYear}/${startYear + 1}` : seasonKey;
}

function getSessionDateKey(session: TrainingSession): string {
  const parsed = new Date(session.scheduledAt);
  if (Number.isNaN(parsed.getTime())) return "";
  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

type SessionTimelineState = "next" | "future" | "past";

function getSessionTime(session: TrainingSession): number {
  const time = new Date(session.scheduledAt).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function sortSessionsByTimeline(items: TrainingSession[], nowMs = Date.now()): TrainingSession[] {
  return [...items].sort((a, b) => {
    const aTime = getSessionTime(a);
    const bTime = getSessionTime(b);
    const aPast = aTime < nowMs;
    const bPast = bTime < nowMs;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? bTime - aTime : aTime - bTime;
  });
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
  session, canDelete, canEdit, onDelete, onEdit, onComment, onOpenDetails, showRecovery, isReadOnly, timelineState, attendanceSummary,
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
  timelineState?: SessionTimelineState;
  attendanceSummary?: AttendanceSummary;
}) {
  const [open, setOpen] = useState(false);
  const calendarNote = getTrainingCalendarNote(session);
  const needsReschedule = !!calendarNote && /da riassegnare|eliminato/i.test(calendarNote);
  const movedBySecretary = !!calendarNote && /spostato/i.test(calendarNote);
  const linkedExercisesQuery = useQuery<SessionExerciseLink[]>({
    queryKey: ["/api/training-sessions", session.id, "exercises"],
    queryFn: () => apiFetch(`/api/training-sessions/${session.id}/exercises`),
    enabled: !!showRecovery,
  });
  const linkedExercises = linkedExercisesQuery.data ?? [];
  const cardTone =
    timelineState === "next"
      ? "border-emerald-300 bg-emerald-50 shadow-sm"
      : timelineState === "past"
        ? "border-orange-200 bg-orange-50/70"
        : session.status === "cancelled"
      ? "border-red-200 bg-red-50/60"
        : session.sessionKind === "tipo"
          ? "border-amber-200 bg-amber-50/60"
          : "border-border bg-card";
  return (
    <Card className={`overflow-hidden group hover:shadow-md transition-all ${cardTone}`}>
      <div className={`h-1 w-full ${
        timelineState === "next" ? "bg-emerald-500" :
        timelineState === "past" ? "bg-orange-500" :
        session.status === "cancelled" ? "bg-destructive" : "bg-border"
      }`} />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {statusBadge(session.status, timelineState)}
            {typeBadge(session.sessionKind)}
            {timelineState === "next" && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Prossima</Badge>}
            {needsReschedule && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Da riassegnare</Badge>}
            {movedBySecretary && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Spostata da segreteria</Badge>}
          </div>
          <div className="flex items-center gap-1">
            {onOpenDetails && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-primary"
                onClick={onOpenDetails}
                title="Apri scheda seduta"
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
                title="Modifica seduta"
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

        {calendarNote && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <span className="font-semibold">Nota calendario: </span>{calendarNote}
          </div>
        )}

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
          {attendanceSummary && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3" />
              <span>
                Presenze: <span className="font-semibold text-foreground">{attendanceSummary.present}</span>
                {attendanceSummary.total > 0 && <>/{attendanceSummary.total}</>}
                {attendanceSummary.recorded > 0 && (
                  <span className="text-muted-foreground"> ({attendanceSummary.percentage}%)</span>
                )}
              </span>
            </div>
          )}
        </div>

        {(session.teamName || session.creatorName) && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
            {session.teamName && <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">{session.teamName}</span>}
            {session.creatorName && (
              <span className="inline-flex max-w-full items-center gap-1 rounded border border-border/70 bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <UserCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">Creata da {session.creatorName}</span>
              </span>
            )}
          </div>
        )}

        {showRecovery && <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">{linkedExercisesQuery.isLoading?"Caricamento stazioni...":`${linkedExercises.length} stazioni. Apri la scheda per tempi pianificati e recuperi manuali tra le fasi.`}</div>}

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
  open, onClose, onCreated, onCreatedSession, members, isTD, teams, initialDraft,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onCreatedSession?: (session: TrainingSession, phase?: string) => void;
  members: Member[];
  isTD: boolean;
  teams: SessionCalendarTeam[];
  initialDraft?: InitialSessionDraft;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [creationRecoveries,setCreationRecoveries]=useState<[number,number]>([0,0]);
  const createFormRef=useRef<HTMLFormElement>(null);
  const requestedPhase=useRef<string|undefined>(undefined);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [duration, setDuration] = useState(90);
  const [location, setLocation] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [sharedTeamIds,setSharedTeamIds]=useState<number[]>([]);
  const [sessionPrincipio, setSessionPrincipio] = useState("");
  const [sessionTrainingSession, setSessionTrainingSession] = useState("");
  const manualSlot = useRef(false);
  const initialDraftApplied=useRef<InitialSessionDraft|null>(null);
  const [sessionKind, setSessionKind] = useState<"regular" | "tipo">("regular");
  const [recipientMode, setRecipientMode] = useState<"selected" | "all">("selected");
  const [recipients, setRecipients] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    manualSlot.current = false; initialDraftApplied.current=null;
    setScheduledDate(""); setScheduledTime(""); setDuration(90);
    setLocation(""); setTeamId(null); setSharedTeamIds([]); setSessionPrincipio(""); setSessionTrainingSession(""); setSessionKind("regular"); setRecipientMode("selected"); setRecipients([]); requestedPhase.current=undefined;setCreationRecoveries([0,0]);
  }

  useEffect(() => {
    if (!open) { initialDraftApplied.current=null; return; }
    if (!initialDraft || initialDraftApplied.current===initialDraft) return;
    if (initialDraft.teamId&&!teams.some(team=>team.id===initialDraft.teamId)) return;
    initialDraftApplied.current=initialDraft;
    if (initialDraft.trainingSession) { setSessionTrainingSession(initialDraft.trainingSession); manualSlot.current = true; }
    if (initialDraft.date) setScheduledDate(toDisplayDateValue(`${initialDraft.date}T00:00:00`));
    if (initialDraft.start) setScheduledTime(formatTimeInput(initialDraft.start));
    // Planning duration is independent of the field booking window.
    setDuration(90);
    if (initialDraft.teamId && teams.some((team) => team.id === initialDraft.teamId)) {
      setTeamId(initialDraft.teamId);
    }
  }, [initialDraft, open, teams]);

  useEffect(() => {
    if (!open || manualSlot.current || sessionKind !== "regular") return;
    setSessionTrainingSession(inferTrainingSlot(teams.find(team => team.id === teamId), normalizeDateIt(scheduledDate) ?? "", normalizeTime24(scheduledTime) ?? ""));
  }, [open, teamId, scheduledDate, scheduledTime, sessionKind, teams]);

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
      toast({ title: "Scegli l’obiettivo prevalente della seduta", variant: "destructive" });
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
      const principioLabel = trainingPrincipleLabel(sessionPrincipio);
      const sessionLabel = trainingSessionOptionLabel(sessionTrainingSession, t);
      const generatedTitle = `${principioLabel} - ${sessionLabel}`;
      const createdSession = await apiFetch("/api/training-sessions", {
        method: "POST",
        body: JSON.stringify({
          title: generatedTitle, scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration, location: location || null,
          objectives: sessionPrincipio || null,
          notes: withSessionTeams(sessionTrainingSession ? `${SESSION_SLOT_NOTE_PREFIX}${sessionTrainingSession}` : null,sharedTeamIds),
          teamId, status: "scheduled",
          sessionKind,
          sentToUserIds: sessionKind === "tipo" ? resolvedRecipients : null,
        }),
      });
      let recoverySaveFailed=false;
      if(sessionKind==="regular"){
        try{await apiFetch(`/api/training-sessions/${createdSession.id}/planning`,{method:"PUT",body:JSON.stringify({recoveries:creationRecoveries,recalculate:false,rotations:{}})});}
        catch{recoverySaveFailed=true;}
      }
      onCreated();
      onCreatedSession?.(createdSession as TrainingSession, requestedPhase.current);
      onClose();
      reset();
      toast({ title: recoverySaveFailed?"Seduta creata: recuperi da reinserire nella scheda":sessionKind === "tipo" ? "Seduta Tipo inviata" : "Seduta creata",variant:recoverySaveFailed?"destructive":"default" });
    } catch {
      toast({ title: "Errore nella creazione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] sm:max-w-[960px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {isTD ? "Nuova Seduta" : "Pianifica Seduta di Allenamento"}
          </DialogTitle>
        </DialogHeader>
        <form ref={createFormRef} onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          {isTD && (
            <div className="space-y-2">
              <Label>Tipo seduta</Label>
              <Select value={sessionKind} onValueChange={v => setSessionKind(v as "regular" | "tipo")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Seduta regolare (visibile a te e direttore)</SelectItem>
                  <SelectItem value="tipo">Seduta TIPO — da inviare agli allenatori</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <Label>{t.trainingSessionField} <span className="text-destructive">*</span></Label>
            <Select value={sessionTrainingSession || "_none"} onValueChange={v => { manualSlot.current = true; setSessionTrainingSession(v === "_none" ? "" : v); }}>
              <SelectTrigger><SelectValue placeholder={t.selectSession} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {trainingSlotOptions(teams.find(team => team.id === teamId), sessionTrainingSession).map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Obiettivo prevalente della seduta <span className="text-destructive">*</span></Label>
            <SessionObjectivePicker value={sessionPrincipio} onChange={setSessionPrincipio} section={teams.find(team => team.id === teamId)?.clubSection} />
          </div>

          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Data e ora <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  value={scheduledDate}
                  onChange={e => { manualSlot.current = false; setScheduledDate(formatDateInput(e.target.value)); }}
                  placeholder="dd/MM/yyyy"
                  inputMode="numeric"
                />
                <Input
                  type="text"
                  value={scheduledTime}
                  onChange={e => { manualSlot.current = false; setScheduledTime(formatTimeInput(e.target.value)); }}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Squadra</Label>
              <SessionTeamPicker teams={teams} teamId={teamId} sharedIds={sharedTeamIds} onChange={(id,ids)=>{manualSlot.current=false;setTeamId(id);setSharedTeamIds(ids);}}/>
            </div>
            <div className="space-y-2">
              <Label>Luogo</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Campo 1..." />
            </div>
          </div>

          {sessionKind === "regular" && <TrainingAvailabilityPanel teamId={teamId} teamIds={sharedTeamIds} date={normalizeDateIt(scheduledDate)} start={normalizeTime24(scheduledTime)} durationMinutes={duration}/> }

          {isTD && sessionKind === "tipo" && (
            <div className="space-y-2">
              <Label>Invio seduta</Label>
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
              La seduta verra inviata a tutti gli allenatori/preparatori {teamId ? "della squadra selezionata" : "del club"}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {sessionKind === "tipo" ? "Invia Seduta Tipo" : "Salva dati e prepara seduta"}
            </Button>
          </div>
        </form>
        {sessionKind==="regular"&&<TrainingSessionOverview phaseRecoveries={[0,1].map(index=><div key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3"><Label>Recupero tra fase {index+1} e {index+2}</Label><Input aria-label={`Recupero tra fase ${index+1} e ${index+2}`} type="number" min={0} max={300} className="w-20" value={creationRecoveries[index]} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0&&value<=300)setCreationRecoveries(old=>index===0?[value,old[1]]:[old[0],value]);}}/><span>min</span></div>)} metadata={[]} badges={null} principle={principioLabel(sessionPrincipio)||"Principio da scegliere"} slot={null} exercises={[]} loading={false} error={false} onRetry={()=>{}} readOnly={loading} duration={duration} plannedMinutes={0} recovery={<div><p>Base: 6 stazioni × 15 min + {creationRecoveries[0]+creationRecoveries[1]} min di recuperi.</p>{90+creationRecoveries[0]+creationRecoveries[1]>duration&&<p className="mt-1 text-amber-700">La base supera la durata della seduta. A fine preparazione potrai ricalcolare i tempi delle stazioni.</p>}<p className="mt-1 text-xs text-muted-foreground">Gli spazi vuoti non creano stazioni. Compila i dati e premi + per salvare la seduta e preparare la prima stazione.</p></div>} organization={null} onAdd={phase=>{requestedPhase.current=phase;createFormRef.current?.requestSubmit();}} onView={()=>{}} onEdit={()=>{}} onRemove={()=>{}}/>}
      </DialogContent>
    </Dialog>
  );
}

function EditSessionDialog({
  session,
  onClose,
  onSaved,
  onManageExercises,
  teams,
  inline = false,
  onDirtyChange,
}: {
  session: TrainingSession;
  onClose: () => void;
  onSaved: () => void;
  onManageExercises?: () => void;
  inline?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  teams: SessionCalendarTeam[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [scheduledDate, setScheduledDate] = useState(toDisplayDateValue(session.scheduledAt));
  const [scheduledTime, setScheduledTime] = useState(timePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)));
  const [duration, setDuration] = useState(session.durationMinutes ?? 90);
  const [location, setLocation] = useState(session.location ?? "");
  const [teamId, setTeamId] = useState<number | null>(session.teamId ?? null);
  const [sharedTeamIds,setSharedTeamIds]=useState<number[]>(()=>sessionTeamIds(session.teamId,session.notes));
  const [sessionPrincipio, setSessionPrincipio] = useState(normalizePrincipio(session.objectives));
  const [sessionTrainingSession, setSessionTrainingSession] = useState(getSessionTrainingSession(session) ?? inferTrainingSlot(teams.find(team => team.id === session.teamId), datePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)), timePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt))));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const original = [toDisplayDateValue(session.scheduledAt), timePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)), session.durationMinutes ?? 90, session.location ?? "", session.teamId ?? null, normalizePrincipio(session.objectives), getSessionTrainingSession(session) ?? inferTrainingSlot(teams.find(team => team.id === session.teamId), datePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)), timePartFromLocalDateTime(toDateTimeLocalValue(session.scheduledAt)))];
    onDirtyChange?.(JSON.stringify(original) !== JSON.stringify([scheduledDate, scheduledTime, duration, location, teamId, sessionPrincipio, sessionTrainingSession]) || JSON.stringify(sessionTeamIds(session.teamId,session.notes).sort((a,b)=>a-b))!==JSON.stringify([...sharedTeamIds].sort((a,b)=>a-b)));
  }, [scheduledDate, scheduledTime, duration, location, teamId, sessionPrincipio, sessionTrainingSession, sharedTeamIds, session, teams, onDirtyChange]);

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
      toast({ title: "Scegli l’obiettivo prevalente della seduta", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const principioLabel = trainingPrincipleLabel(sessionPrincipio);
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
          notes: withSessionTeams(`${SESSION_SLOT_NOTE_PREFIX}${sessionTrainingSession}${getTrainingCalendarNote(session) ? `\n${TRAINING_CALENDAR_NOTE_MARKER}${getTrainingCalendarNote(session)}` : ""}`,sharedTeamIds),
          teamId,
        }),
      });
      toast({ title: "Seduta aggiornata" });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: "Errore nel salvataggio",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const content = <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-3">
          <div className="space-y-2">
            <Label>{t.trainingSessionField} <span className="text-destructive">*</span></Label>
            <Select value={sessionTrainingSession || "_none"} onValueChange={v => setSessionTrainingSession(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t.selectSession} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">{t.selectSession}...</SelectItem>
                {trainingSlotOptions(teams.find(team => team.id === teamId), sessionTrainingSession).map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Obiettivo prevalente della seduta <span className="text-destructive">*</span></Label>
            <SessionObjectivePicker value={sessionPrincipio} onChange={setSessionPrincipio} section={teams.find(team => team.id === teamId)?.clubSection} />
          </div>

          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Squadra</Label>
              <SessionTeamPicker teams={teams} teamId={teamId} sharedIds={sharedTeamIds} onChange={(id,ids)=>{setTeamId(id);setSharedTeamIds(ids);}}/>
            </div>
            <div className="space-y-2">
              <Label>Luogo</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Campo 1..." />
            </div>
          </div>

          <TrainingAvailabilityPanel teamId={teamId} teamIds={sharedTeamIds} date={normalizeDateIt(scheduledDate)} start={normalizeTime24(scheduledTime)} durationMinutes={duration}/>

          {onManageExercises && (
            <Button type="button" variant="outline" className="w-full justify-center" onClick={onManageExercises}>
              Aggiungi / modifica stazioni
            </Button>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva modifiche
            </Button>
          </div>
        </form>;
  if (inline) return <div className="rounded-xl border bg-muted/10 p-3">{content}</div>;
  return <Dialog open onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Modifica seduta</DialogTitle></DialogHeader>{content}</DialogContent></Dialog>;
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
              placeholder="Aggiungi un commento sulla seduta..."
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
  readOnly = false,
  onEditSession,
  initialAddPhase,
  onDeleteSession,
}: {
  session: TrainingSession;
  onClose: () => void;
  teams: SessionCalendarTeam[];
  readOnly?: boolean;
  onEditSession?: () => void;
  initialAddPhase?: string;
  onDeleteSession?:()=>void;
}) {
  const { role, user } = useAuth();
  const [, navigate] = useLocation();
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [rotationDirty,setRotationDirty]=useState(false);
  const [rotationPreview,setRotationPreview]=useState<TrainingRotations|null>(null);
  function openAttendance() {
    if ((metadataDirty || recoveriesDirty || rotationDirty || exerciseFormOpen) && !window.confirm("Ci sono modifiche non salvate. Aprire le presenze e abbandonarle?")) return;
    const teamSection = normalizeClubSection(teams.find(team => team.id === session.teamId)?.clubSection);
    const base = teamSection ? `/${teamSection.replace(/_/g, "-")}` : "";
    const returnTo = `${window.location.pathname}?sessionId=${session.id}`;
    navigate(`${base}/attendance?sessionId=${session.id}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  const canEditMetadata=!readOnly&&(role!=="technical_director"||session.createdByUserId===user?.id);
  const { toast } = useToast();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const participants=useSessionParticipants(session.id,session.sessionKind!=="tipo");
  const blockedPlayerIds=participants.data?.blockedPlayerIds??[];
  const attendanceSignature=JSON.stringify(participants.data??null);
  useEffect(()=>{if(participants.data){void qc.invalidateQueries({queryKey:["/api/training-sessions",session.id,"planning"]});void qc.invalidateQueries({queryKey:["/api/training-sessions",session.id,"exercises"]});}},[attendanceSignature,qc,session.id]);
  const [editingMetadata,setEditingMetadata] = useState(true);
  const [recoveries,setRecoveries] = useState<[number,number]>([0,0]);
  const [recoveriesDirty,setRecoveriesDirty] = useState(false);
  const [recoveriesVersion,setRecoveriesVersion]=useState<string|undefined>();
  const planQuery=useQuery<{version?:string;rotations?:TrainingRotations;recoveries:[number,number];timings:Record<string,{seconds:number;stations:number[]}>}>({queryKey:["/api/training-sessions",session.id,"planning"],queryFn:()=>apiFetch(`/api/training-sessions/${session.id}/planning`)});
  useEffect(()=>{if(planQuery.data&&!recoveriesDirty){setRecoveries(planQuery.data.recoveries);setRecoveriesVersion(planQuery.data.version);}},[planQuery.data,recoveriesDirty]);
  const savePlan=useMutation({mutationFn:(recalculate:boolean)=>apiFetch(`/api/training-sessions/${session.id}/planning`,{method:"PUT",body:JSON.stringify({recoveries,recalculate,version:recoveriesVersion})}),onSuccess:async()=>{setRecoveriesDirty(false);await qc.invalidateQueries({queryKey:["/api/training-sessions",session.id,"planning"]});toast({title:"Tempi della seduta salvati"});},onError:()=>toast({title:"Impossibile salvare i tempi",variant:"destructive"})});
  const [exerciseFormOpen, setExerciseFormOpen] = useState(false);
  const [viewingLink, setViewingLink] = useState<SessionExerciseLink | null>(null);
  const [editingLink, setEditingLink] = useState<SessionExerciseLink | null>(null);
  const [duplicateSourceExerciseId, setDuplicateSourceExerciseId] = useState<number | null>(null);
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(() => emptyExerciseFormFromSession(session, 0));
  useEffect(()=>{if(blockedPlayerIds.length)setExerciseForm(previous=>{const next=attendanceExerciseView({...previous,playersRequired:Number(previous.playersRequired)||0},blockedPlayerIds);return {...previous,selectedPlayerIdsJson:next.selectedPlayerIdsJson??"",playersRequired:String(next.playersRequired??0),statoLavagnaJson:next.statoLavagnaJson??"",drawingElementsJson:next.drawingElementsJson??"",drawingData:next.drawingData??""};});},[blockedPlayerIds.join(",")]);


  const linkedExercisesQuery = useQuery<SessionExerciseLink[]>({
    queryKey: ["/api/training-sessions", session.id, "exercises"],
    queryFn: () => apiFetch(`/api/training-sessions/${session.id}/exercises`),
    enabled: !!session?.id,
  });
  const selectablePlayersQuery = useQuery<PlayerOption[]>({
    queryKey: ["training-rosters", "training-session-exercise-selection", exerciseForm.teamId || "all", exerciseFormOpen, exerciseForm.playersRequiredMode,session.notes],
    queryFn: async () => {const ids=sessionTeamIds(session.teamId,session.notes);if(!ids.length)return apiFetch("/api/players");const lists=await Promise.all(ids.map(id=>apiFetch(`/api/training-rosters/${id}?scope=team`)));return [...new Map(lists.flatMap(list=>list.players as PlayerOption[]).map(player=>[player.id,player])).values()];},
    enabled: exerciseFormOpen,
  });

  const linkedExercises = [...(linkedExercisesQuery.data ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const effectiveDuration=(link:SessionExerciseLink)=>planQuery.data?.timings[String(link.id)]?.seconds!==undefined?planQuery.data.timings[String(link.id)].seconds/60:link.exercise?.durationMinutes??0;
  const visibleRotations=rotationPreview??planQuery.data?.rotations;
  const turnRecoveryMinutes=visibleRotations?rotationRecoverySeconds(visibleRotations)/60:0;
  const plannedExerciseMinutes = visibleRotations!==undefined?rotationSeconds(visibleRotations)/60:linkedExercises.reduce((sum,link)=>sum+effectiveDuration(link),0);
  const recoveryMinutes=recoveries[0]+recoveries[1]+turnRecoveryMinutes;
  const residualMinutes=(session.durationMinutes??0)-plannedExerciseMinutes-recoveryMinutes;
  const formatMinutes=(minutes:number)=>{const seconds=Math.round(minutes*60);return seconds%60===0?`${seconds/60} min`:`${Math.floor(seconds/60)} min ${seconds%60} s`;};

  const createAndLinkExerciseMutation = useMutation({
    mutationFn: async ({ form, sourceExerciseId }: { form: ExerciseFormState; sourceExerciseId?: number | null }) => {
      const stations = parseExerciseStations(form.stationsJson);
      const stationEquipment = serializeEquipmentSelection(mergeExerciseMaterials(parseEquipmentSelection(form.equipment), sumStationEquipment(stations)));
      const created = await apiFetch("/api/exercises", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          category: form.category || null,
          description: composeExerciseDescription(form.description, stations),
          durationMinutes: Math.ceil(totalStationMinutes(stations)) || (form.durationMinutes ? Number(form.durationMinutes) : null),
          playersRequired: computedPlayersRequired ? Number(computedPlayersRequired) : null,
          equipment: stationEquipment || form.equipment || null,
          teamId: form.teamId ? Number(form.teamId) : null,
          trainingDay: form.trainingDay || null,
          trainingSession: form.trainingSession || null,
          trainingPhase: form.trainingPhase || null,
          principio: form.principio || null,
          statoLavagnaJson: form.statoLavagnaJson || null,
          drawingData: form.drawingData || null,
          drawingElementsJson: form.drawingElementsJson || null,
          voiceNoteData: form.voiceNoteData || null,
          videoNoteData: form.videoNoteData || null,
          isDraft: form.isDraft,
          caricaRosaIntera: false,
          scegliGiocatori: form.playersRequiredMode !== "manual",
          selectedPlayerIdsJson: form.playersRequiredMode === "all" ? JSON.stringify(selectablePlayers.map(player => player.id)) : form.playersRequiredMode === "selected" ? (form.selectedPlayerIdsJson || null) : null,
          playersRequiredMode: form.playersRequiredMode === "all" ? "selected" : form.playersRequiredMode,
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
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "planning"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Stazione creata e collegata" });
      setExerciseFormOpen(false);
      setEditingLink(null);
      setDuplicateSourceExerciseId(null);
    },
    onError: () => toast({ title: "Errore nel salvataggio stazione", variant: "destructive" }),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: async ({ link, form }: { link: SessionExerciseLink; form: ExerciseFormState }) => {
      if (!link.exercise?.id) throw new Error("Stazione non valida");
      const stations = parseExerciseStations(form.stationsJson);
      const stationEquipment = serializeEquipmentSelection(mergeExerciseMaterials(parseEquipmentSelection(form.equipment), sumStationEquipment(stations)));
      return apiFetch(`/api/exercises/${link.exercise.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          category: form.category || null,
          description: composeExerciseDescription(form.description, stations),
          durationMinutes: Math.ceil(totalStationMinutes(stations)) || (form.durationMinutes ? Number(form.durationMinutes) : null),
          playersRequired: computedPlayersRequired ? Number(computedPlayersRequired) : null,
          equipment: stationEquipment || form.equipment || null,
          teamId: form.teamId ? Number(form.teamId) : null,
          trainingDay: form.trainingDay || null,
          trainingSession: form.trainingSession || null,
          trainingPhase: form.trainingPhase || null,
          principio: form.principio || null,
          statoLavagnaJson: form.statoLavagnaJson || null,
          drawingData: form.drawingData || null,
          drawingElementsJson: form.drawingElementsJson || null,
          voiceNoteData: form.voiceNoteData || null,
          videoNoteData: form.videoNoteData || null,
          isDraft: form.isDraft,
          caricaRosaIntera: false,
          scegliGiocatori: form.playersRequiredMode !== "manual",
          selectedPlayerIdsJson: form.playersRequiredMode === "all" ? JSON.stringify(selectablePlayers.map(player => player.id)) : form.playersRequiredMode === "selected" ? (form.selectedPlayerIdsJson || null) : null,
          playersRequiredMode: form.playersRequiredMode === "all" ? "selected" : form.playersRequiredMode,
        }),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "exercises"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "planning"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Stazione aggiornata" });
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
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions", session.id, "planning"] });
      await qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });
      toast({ title: "Stazione rimossa dalla seduta" });
    },
    onError: () => toast({ title: "Errore nella rimozione", variant: "destructive" }),
  });

  function openAddExercise(phase = "") {
    setEditingLink(null);
    setDuplicateSourceExerciseId(null);
    setExerciseForm({ ...emptyExerciseFormFromSession(session, linkedExercises.length), trainingPhase: phase });
    setExerciseFormOpen(true);
  }

  const initialPhaseOpened=useRef(false);
  useEffect(()=>{if(initialAddPhase&&!initialPhaseOpened.current&&!linkedExercisesQuery.isLoading){initialPhaseOpened.current=true;openAddExercise(initialAddPhase);}},[initialAddPhase,linkedExercisesQuery.isLoading]);

  function openEditExercise(link: SessionExerciseLink) {
    const sourceId = link.exercise ? (link.exercise.sourceExerciseId ?? link.exercise.id) : null;
    setDuplicateSourceExerciseId(sourceId);
    setEditingLink(link);
    const form=formFromLinkedExercise(link);
    const allocation=planQuery.data?.rotations?.[link.exercise?.trainingPhase as "iniziale"|"centrale"|"finale"]?.flatMap(turn=>turn.stations).find(station=>station.linkId===link.id&&station.playerIds.length>0);
    setExerciseForm(allocation?{...form,playersRequiredMode:"selected",selectedPlayerIdsJson:JSON.stringify(allocation.playerIds),playersRequired:String(allocation.playerIds.length)}:form);
    setExerciseFormOpen(true);
  }

  async function handleSaveExercise(e: React.FormEvent) {
    e.preventDefault();
    if(participants.isLoading||participants.isError){toast({title:"Attendi il caricamento dell’appello prima di assegnare i giocatori",variant:"destructive"});return;}
    if(parseSelectedPlayerIds(exerciseForm.selectedPlayerIdsJson).some(id=>blockedPlayerIds.includes(id))){toast({title:"Un giocatore è stato segnato assente. Rivedi la scelta dei giocatori.",variant:"destructive"});return;}
    if(parseSelectedPlayerIds(exerciseForm.selectedPlayerIdsJson).some(id=>reservedPlayers.has(id))){toast({title:"Giocatore già assegnato a un'altra stazione dello stesso turno",variant:"destructive"});return;}
    if (!exerciseForm.title.trim()) {
      toast({ title: "Titolo stazione obbligatorio", variant: "destructive" });
      return;
    }
    if (exerciseForm.playersRequiredMode === "all" && (selectablePlayersQuery.isFetching || selectablePlayersQuery.error || !selectablePlayers.length)) {
      toast({ title: "Attendi il caricamento di una rosa valida", variant: "destructive" }); return;
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
      toast({ title: "Titolo stazione obbligatorio", variant: "destructive" });
      return;
    }
    if (exerciseForm.playersRequiredMode === "all" && (selectablePlayersQuery.isFetching || selectablePlayersQuery.error || !selectablePlayers.length)) {
      toast({ title: "Attendi il caricamento di una rosa valida", variant: "destructive" }); return;
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
    createAndLinkExerciseMutation.mutate({ form: { ...exerciseForm, statoLavagnaJson: detachExerciseBoard(exerciseForm.statoLavagnaJson) || "" }, sourceExerciseId: sourceId });
  }

  const exerciseSaving = createAndLinkExerciseMutation.isPending || updateExerciseMutation.isPending;
  const selectedTeam = exerciseForm.teamId ? teams.find((team) => team.id === Number(exerciseForm.teamId)) : null;
  const selectedMaterialSection = normalizeClubSection(selectedTeam?.clubSection);
  const availableMaterialOptions = MATERIAL_OPTIONS.filter((option) => canUseMaterial(option.availability, selectedMaterialSection, role));
  const exerciseStations = parseExerciseStations(exerciseForm.stationsJson);
  const stationMinutes = totalStationMinutes(exerciseStations);
  const stationEquipmentSummary = serializeEquipmentSelection(mergeExerciseMaterials(parseEquipmentSelection(exerciseForm.equipment), sumStationEquipment(exerciseStations)));
  const selectedPlayerIds = parseSelectedPlayerIds(exerciseForm.selectedPlayerIdsJson);
  const phaseTurns=planQuery.data?.rotations?.[exerciseForm.trainingPhase as "iniziale"|"centrale"|"finale"];
  const savedTurn=editingLink?(phaseTurns?.find(turn=>turn.stations.some(station=>station.linkId===editingLink.id&&station.playerIds.length>0))??phaseTurns?.[0]):phaseTurns?.[0];
  const reservedPlayers=new Set(planQuery.data?.rotations===undefined?[]:savedTurn?savedTurn.stations.filter(station=>station.linkId!==editingLink?.id).flatMap(station=>station.playerIds):linkedExercises.filter(link=>link.id!==editingLink?.id&&link.exercise?.trainingPhase===exerciseForm.trainingPhase).flatMap(link=>parseSelectedPlayerIds(link.exercise?.selectedPlayerIdsJson??"")));
  const selectablePlayers = (selectablePlayersQuery.data ?? []).filter((p) => p.available !== false&&!reservedPlayers.has(p.id)&&!blockedPlayerIds.includes(p.id));
  const selectedPlayersCount = selectedPlayerIds.length;
  const allPlayersCount = selectablePlayers.length;
  const computedPlayersRequired =
    exerciseForm.playersRequiredMode === "all"
      ? allPlayersCount
      : exerciseForm.playersRequiredMode === "selected"
        ? selectedPlayersCount
        : (exerciseForm.playersRequired ? Number(exerciseForm.playersRequired) : null);



  function setStations(next: ExerciseStation[], timing: "preserve" | "divide" | "sum" = "preserve") {
    setExerciseForm(prev => {
      const updated = timing === "divide" ? divideExerciseMinutes(next, Number(prev.durationMinutes)) : next;
      const minutes = totalStationMinutes(updated);
      return { ...prev, stationsJson: JSON.stringify(updated), durationMinutes: timing === "sum" && minutes > 0 ? String(Math.ceil(minutes)) : prev.durationMinutes };
    });
  }

  function setExerciseDuration(value: string) {
    setExerciseForm(prev => ({ ...prev, durationMinutes: value, stationsJson: JSON.stringify(divideExerciseMinutes(parseExerciseStations(prev.stationsJson), Number(value))) }));
  }

  function setStationEquipmentSelection(stationId: string, selection: Partial<Record<MaterialId, number>>) {
    setStations(exerciseStations.map((item) =>
      item.id === stationId ? { ...item, equipment: serializeEquipmentSelection(selection) } : item,
    ));
  }







  function updateStationVariant(station: ExerciseStation, variantIndex: number, value: string) {
    const variants = [...(station.variants.length > 0 ? station.variants : ["", "", ""])];
    variants[variantIndex] = value;
    setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, variants } : item));
  }

  function addStationVariant(station: ExerciseStation) {
    setStations(exerciseStations.map((item) =>
      item.id === station.id ? { ...item, variants: [...(item.variants.length > 0 ? item.variants : ["", "", ""]), ""] } : item,
    ));
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v&&(!(metadataDirty||recoveriesDirty||rotationDirty)||window.confirm("Chiudere e scartare le modifiche non salvate alla seduta?"))) onClose(); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] p-3 sm:max-w-[960px] sm:p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Scheda seduta - {session.title}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
          {session.sessionKind === "regular" && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={openAttendance}><UserCheck className="mr-2 h-4 w-4" />Presenze</Button>}
          {!readOnly&&onDeleteSession&&<Button type="button" variant="outline" size="sm" className="w-fit text-destructive" onClick={onDeleteSession}>Elimina seduta</Button>}
          {canEditMetadata && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={()=>{if(editingMetadata&&metadataDirty&&!window.confirm("Scartare le modifiche non salvate ai dati della seduta?"))return;setMetadataDirty(false);setEditingMetadata(!editingMetadata);}}>{editingMetadata?"Chiudi dati seduta":"Modifica dati seduta"}</Button>}
          </div>
        </DialogHeader>

        <StationTurnPlanner activities={linkedExercises.map(link=>({id:link.id,title:link.exercise?.title??"Stazione non disponibile",phase:link.exercise?.trainingPhase??null,seconds:Math.round(effectiveDuration(link)*60),playerIds:parseSelectedPlayerIds(link.exercise?.selectedPlayerIdsJson??""),preview:link.exercise?.drawingData??null,attendanceAdjusted:link.exercise?.attendanceAdjusted,principle:link.exercise?.principio?principioLabel(link.exercise.principio):null}))} blockedPlayerIds={blockedPlayerIds} attendanceLoading={participants.isLoading||participants.isError} teamId={session.teamId} teamIds={sessionTeamIds(session.teamId,session.notes)} saved={planQuery.data?.rotations} version={planQuery.data?.version} readOnly={readOnly||planQuery.isLoading||planQuery.isError} onDirtyChange={setRotationDirty} onSave={async(rotations,recalculate,version)=>{await apiFetch(`/api/training-sessions/${session.id}/planning`,{method:"PUT",body:JSON.stringify({recoveries,recalculate,rotations,version})});setRecoveriesDirty(false);await qc.invalidateQueries({queryKey:["/api/training-sessions",session.id,"planning"]});toast({title:"Organizzazione della seduta salvata"});}} onPreviewChange={setRotationPreview} onView={id=>setViewingLink(linkedExercises.find(link=>link.id===id)??null)} onEdit={id=>{const link=linkedExercises.find(link=>link.id===id);if(link)openEditExercise(link);}} onRemove={id=>{if(confirm("Rimuovere la stazione da questa seduta?"))removeLinkMutation.mutate(id);}}>
        {({toolbar,phases})=><TrainingSessionOverview
          editor={editingMetadata&&canEditMetadata?<EditSessionDialog key={session.id} inline onDirtyChange={setMetadataDirty} session={session} teams={teams} onClose={()=>{setEditingMetadata(false);setMetadataDirty(false);}} onSaved={()=>{setMetadataDirty(false);void qc.invalidateQueries({queryKey:["/api/training-sessions"]});}}/>:undefined}
          phaseRecoveries={[0,1].map(index=><div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3 text-sm"><Label htmlFor={`recovery-${session.id}-${index}`}>Recupero tra fase {index+1} e {index+2}</Label><Input id={`recovery-${session.id}-${index}`} aria-label={`Recupero tra fase ${index+1} e ${index+2}`} className="w-20" type="number" min={0} max={300} step={1} disabled={readOnly||planQuery.isLoading||planQuery.isError||savePlan.isPending} value={recoveries[index]} onChange={e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0&&value<=300){setRecoveries(previous=>index===0?[value,previous[1]]:[previous[0],value]);setRecoveriesDirty(true);}}}/><span>min</span></div>)}
          metadata={editingMetadata&&canEditMetadata?[]:[
            { label: "Giorno", value: format(new Date(session.scheduledAt), "EEEE", { locale: itLocale }) },
            { label: "Data", value: format(new Date(session.scheduledAt), "dd/MM/yyyy") },
            { label: "Ora", value: format(new Date(session.scheduledAt), "HH:mm") },
            { label: "Durata seduta", value: session.durationMinutes ? `${session.durationMinutes} min` : "Da indicare" },
          ]}
          badges={<>{statusBadge(session.status)}{typeBadge(session.sessionKind)}</>}
          principle={principioLabel(session.objectives) || "Da indicare"}
          slot={trainingSessionLabel(getSessionTrainingSession(session), t)}
          exercises={linkedExercises.map(link => ({
            id: link.id,
            title: link.exercise?.title ?? "Stazione non trovata",
            phase: link.exercise?.trainingPhase ?? null,
            duration: effectiveDuration(link),
            preview: link.exercise?.drawingData ?? null,
            attendanceAdjusted:link.exercise?.attendanceAdjusted,
            principle: link.exercise?.principio ? principioLabel(link.exercise.principio) : null,
            players: planQuery.data?.rotations?.[link.exercise?.trainingPhase as "iniziale"|"centrale"|"finale"]?.[0]?.stations.find(station=>station.linkId===link.id)?.playerIds.length ?? link.exercise?.playersRequired ?? null,
            available: Boolean(link.exercise),
          }))}
          loading={linkedExercisesQuery.isLoading}
          error={linkedExercisesQuery.isError}
          onRetry={() => void linkedExercisesQuery.refetch()}
          readOnly={readOnly}
          duration={session.durationMinutes}
          plannedMinutes={Math.round((plannedExerciseMinutes+recoveryMinutes)*100)/100}
          onAdd={openAddExercise}
          onView={id => setViewingLink(linkedExercises.find(link => link.id === id) ?? null)}
          onEdit={id => { const link = linkedExercises.find(link => link.id === id); if (link) openEditExercise(link); }}
          onRemove={id => { if (confirm("Rimuovere la stazione da questa seduta?")) removeLinkMutation.mutate(id); }}
          recovery={<div className="space-y-2">
            {planQuery.isLoading?<p role="status">Caricamento tempi della seduta...</p>:planQuery.isError?<p role="alert">Tempi non disponibili. <Button variant="link" onClick={()=>void planQuery.refetch()}>Riprova</Button></p>:<>
              {session.sessionKind!=="tipo"&&<p className="text-xs text-muted-foreground">{participants.isLoading?"Caricamento appello...":participants.isError?"Appello non disponibile: assegnazione giocatori sospesa.":`Appello: ${participants.data?.recordedPlayerIds.length??0} su ${participants.data?.total??0} registrati. Prima dell’appello vale la disponibilità dei genitori; presente e assente prevalgono nella seduta. Completa l’appello prima dell’inizio della seduta; restano possibili le rettifiche.`}</p>}
              <p>Stazioni: <strong>{formatMinutes(plannedExerciseMinutes)}</strong> · Recuperi: <strong>{formatMinutes(recoveryMinutes)}</strong></p>
              <p>Base iniziale: due stazioni per fase. Nei turni contemporanei il tempo viene contato una sola volta; le rotazioni aggiungono i turni successivi.</p>
              <p>Tempo residuo: <strong>{formatMinutes(Math.max(0,residualMinutes))}</strong></p>
              {!readOnly&&<Button type="button" variant="outline" disabled={!recoveriesDirty||rotationDirty||savePlan.isPending||planQuery.isLoading} onClick={()=>savePlan.mutate(false)}>Salva recuperi</Button>}
              {residualMinutes<0&&<div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950"><p>Tempo limite superato di {formatMinutes(-residualMinutes)}. Vuoi ricalcolare il minutaggio delle stazioni?</p>{rotationDirty&&<p className="mt-1 text-xs">Per includere i turni in modifica usa Organizza → Ricalcola tempi sui turni e salva.</p>}<p className="mt-1 text-xs">{planQuery.data?.rotations!==undefined?"Il tempo utile verrà ripartito tra i turni; le stazioni contemporanee avranno la stessa durata.":<>({session.durationMinutes} − {recoveryMinutes}) ÷ {linkedExercises.length} stazioni{linkedExercises.length>0&&session.durationMinutes&&session.durationMinutes>recoveryMinutes?` = circa ${formatMinutes((session.durationMinutes-recoveryMinutes)/linkedExercises.length)} ciascuna`:""}. Gli esercizi interni saranno riproporzionati. I tempi valgono solo per questa seduta.</>}</p>{!readOnly&&<Button type="button" className="mt-2" disabled={rotationDirty||savePlan.isPending||planQuery.isLoading||!linkedExercises.length||!session.durationMinutes||session.durationMinutes<=recoveryMinutes} onClick={()=>{if(confirm("Ricalcolare i tempi delle stazioni e dei relativi esercizi solo per questa seduta?"))savePlan.mutate(true);}}>Ricalcola minutaggio</Button>}</div>}
            </>}
          </div>}
          rotation={toolbar}
          phaseContent={phases}
          phaseMinutes={visibleRotations?Object.fromEntries(Object.keys(visibleRotations).map(phase=>[phase,rotationPhaseSeconds(visibleRotations,phase as "iniziale"|"centrale"|"finale")/60])):undefined}
          organization={<div className="space-y-2 border-t pt-3">

            <p><span className="text-muted-foreground">Squadra: </span>{session.teamName || "Da indicare"}</p>
            <p><span className="text-muted-foreground">Luogo: </span>{session.location || "Da indicare"}</p>
            {session.creatorName && <p><span className="text-muted-foreground">Creata da: </span>{session.creatorName}</p>}
            {session.description && <p className="whitespace-pre-wrap">{session.description}</p>}
            {getTrainingCalendarNote(session) && <p className="whitespace-pre-wrap">{getTrainingCalendarNote(session)}</p>}
          </div>}
        />}
        </StationTurnPlanner>
      </DialogContent>

      <Dialog open={!!viewingLink} onOpenChange={(open) => { if (!open) setViewingLink(null); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingLink?.exercise?.title ?? "Stazione"}</DialogTitle>
          </DialogHeader>
          {viewingLink?.exercise ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {viewingLink.exercise.principio && <Badge variant="secondary">{principioLabel(viewingLink.exercise.principio)}</Badge>}
                {viewingLink.exercise.trainingPhase && <Badge variant="outline">{phaseLabel(viewingLink.exercise.trainingPhase)}</Badge>}
                {viewingLink.exercise.category && <Badge variant="outline">{trainingCategoryLabel(viewingLink.exercise.category, teams.find(team=>team.id===viewingLink.exercise?.teamId)?.clubSection)}</Badge>}
                <Badge variant="outline">{formatMinutes(effectiveDuration(viewingLink))}</Badge>
              </div>
              {viewingLink.exercise.sourceExerciseId && viewingLink.exercise.originalCreatedByName && <p className="text-xs text-muted-foreground">Originale creato da {viewingLink.exercise.originalCreatedByName}</p>}
              {splitExerciseDescriptionAndStations(viewingLink.exercise.description ?? "").description && (
                <div className="space-y-1">
                  <Label>Descrizione</Label>
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                    {splitExerciseDescriptionAndStations(viewingLink.exercise.description ?? "").description}
                  </p>
                </div>
              )}
              {splitExerciseDescriptionAndStations(viewingLink.exercise.description ?? "").stations.length > 0 && (
                <div className="space-y-2">
                  <Label>Esercizi</Label>
                  <div className="space-y-2">
                    {splitExerciseDescriptionAndStations(viewingLink.exercise.description ?? "").stations.map((station, index) => (
                      <div key={station.id} className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold">{index + 1}. {station.title || "Stazione"}</p>
                          <Badge variant="outline">{formatMinutes((planQuery.data?.timings[String(viewingLink.id)]?.stations[index] ?? Number(station.durationMinutes||0)*60)/60)}</Badge>
                        </div>
                        {station.playersRequired && (
                          <p className="mt-2 text-muted-foreground">
                            <span className="font-medium text-foreground">Giocatori: </span>{station.playersRequired}
                          </p>
                        )}
                        {station.objective && (
                          <p className="mt-1 whitespace-pre-wrap">
                            <span className="font-medium">Obiettivo principale: </span>{station.objective}
                          </p>
                        )}
                        {station.exercise && (
                          <p className="mt-2 whitespace-pre-wrap">
                            <span className="font-medium">Descrizione svolgimento: </span>{station.exercise}
                          </p>
                        )}
                        {station.variants.filter((variant) => variant.trim()).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {station.variants.filter((variant) => variant.trim()).map((variant, variantIndex) => (
                              <p key={`${station.id}-view-variant-${variantIndex}`} className="whitespace-pre-wrap text-muted-foreground">
                                <span className="font-medium text-foreground">V{variantIndex + 1}: </span>{variant}
                              </p>
                            ))}
                          </div>
                        )}
                        {station.equipment && (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            <span className="font-medium text-foreground">Materiali: </span>{formatEquipmentLabel(station.equipment)}
                          </p>
                        )}
                        {station.notes && (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            <span className="font-medium text-foreground">Indicazioni: </span>{station.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {trainingDayLabel(viewingLink.exercise.trainingDay) && <div><span className="text-muted-foreground">Giorno: </span>{trainingDayLabel(viewingLink.exercise.trainingDay)}</div>}
                {trainingSessionLabel(viewingLink.exercise.trainingSession ?? viewingLink.exercise.trainingDay, t) && <div><span className="text-muted-foreground">{t.trainingSessionField}: </span>{trainingSessionLabel(viewingLink.exercise.trainingSession ?? viewingLink.exercise.trainingDay, t)}</div>}
                {viewingLink.exercise.playersRequired && <div><span className="text-muted-foreground">Giocatori: </span>{viewingLink.exercise.playersRequired}</div>}
                {formatEquipmentLabel(viewingLink.exercise.equipment) && <div><span className="text-muted-foreground">Materiale: </span>{formatEquipmentLabel(viewingLink.exercise.equipment)}</div>}
              </div>
              {viewingLink.notes && (
                <div className="space-y-1">
                  <Label>Note seduta</Label>
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{viewingLink.notes}</p>
                </div>
              )}
              {viewingLink.exercise.drawingData && (
                <div className="space-y-1">
                  <Label>Lavagna</Label>
                  <img src={viewingLink.exercise.drawingData} alt="Disegno stazione" className="max-h-[360px] w-full rounded-md border object-contain" />
                </div>
              )}
              {viewingLink.exercise.voiceNoteData && (
                <audio controls src={viewingLink.exercise.voiceNoteData} className="w-full" />
              )}
              {viewingLink.exercise.videoNoteData && (
                <video controls src={viewingLink.exercise.videoNoteData} className="max-h-[420px] w-full rounded-md border" />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Stazione non trovata.</p>
          )}
        </DialogContent>
      </Dialog>

      {!readOnly && <Dialog open={exerciseFormOpen} onOpenChange={(v) => { if (!v) { setExerciseFormOpen(false); setEditingLink(null); setDuplicateSourceExerciseId(null); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {editingLink ? "Modifica stazione collegata" : "Nuova stazione per seduta"}
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
                      <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Seduta allenamento</Label>
                      <Select value={exerciseForm.trainingSession || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, trainingSession: v === "_none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona seduta" /></SelectTrigger>
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
                        onChange={(e) => setExerciseDuration(e.target.value)}

                      />
                      {stationMinutes > 0 && (
                        <p className="text-[11px] text-muted-foreground">Calcolata dagli esercizi: {formatMinutes(stationMinutes)}{Math.ceil(stationMinutes) !== stationMinutes ? " · durata pianificata arrotondata al minuto superiore" : ""}</p>
                      )}
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

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Principio</Label>
                      <PrinciplePicker value={exerciseForm.principio} onChange={value => setExerciseForm(prev => ({ ...prev, principio: value }))} section={teams.find(team => team.id === Number(exerciseForm.teamId))?.clubSection} />
                    </div>
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <TrainingCategoryPicker value={exerciseForm.category} onChange={category=>setExerciseForm(prev=>({...prev,category}))} section={teams.find(team=>team.id===Number(exerciseForm.teamId))?.clubSection}/>
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
                      <Select value={exerciseForm.teamId || "_none"} onValueChange={(v) => setExerciseForm((prev) => ({ ...prev, teamId: v === "_none" ? "" : v, selectedPlayerIdsJson: "" }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona squadra" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {teams.map((team) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
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

                    <TrainingRosterOptions key={exerciseForm.teamId || "all"} teamId={exerciseForm.teamId} onSelect={ids => setExerciseForm(prev => ({ ...prev, playersRequiredMode: "selected", selectedPlayerIdsJson: JSON.stringify(ids.filter(id=>!reservedPlayers.has(id)&&!blockedPlayerIds.includes(id))) }))} />
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
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-muted-foreground">
                            {exerciseForm.teamId ? "Seleziona giocatori della squadra scelta" : "Seleziona giocatori dalle squadre assegnate all'allenatore"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setExerciseForm((prev) => ({
                                ...prev,
                                selectedPlayerIdsJson: selectablePlayers.length > 0 ? JSON.stringify(selectablePlayers.map((player) => player.id)) : "",
                              }))}
                              disabled={selectablePlayers.length === 0}
                            >
                              Tutti disponibili
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setExerciseForm((prev) => ({ ...prev, selectedPlayerIdsJson: "" }))}
                              disabled={selectedPlayersCount === 0}
                            >
                              Nessuno
                            </Button>
                          </div>
                        </div>
                        {selectablePlayersQuery.isLoading ? (
                          <p className="text-sm text-muted-foreground italic">Caricamento giocatori...</p>
                        ) : selectablePlayers.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">Nessun giocatore disponibile per la selezione.</p>
                        ) : (
                          <TrainingRosterPicker excludedIds={blockedPlayerIds} players={selectablePlayers} selectedIds={selectedPlayerIds} teamId={exerciseForm.teamId} onConfirm={ids => setExerciseForm(prev => ({ ...prev, selectedPlayerIdsJson: JSON.stringify(ids.filter(id=>!blockedPlayerIds.includes(id)&&!reservedPlayers.has(id))) }))} />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border p-3">
                    <Label>Materiali della stazione</Label>
                    <p className="text-xs text-muted-foreground">Dotazione complessiva, disponibile anche senza esercizi. Il riepilogo considera almeno la somma dei materiali degli esercizi.</p>
                    <MaterialPicker options={availableMaterialOptions} selection={parseEquipmentSelection(exerciseForm.equipment)} onConfirm={selection => setExerciseForm(prev => ({ ...prev, equipment: serializeEquipmentSelection(selection) }))} />
                    {formatEquipmentLabel(exerciseForm.equipment) && <p className="break-words text-xs">{formatEquipmentLabel(exerciseForm.equipment)}</p>}
                    {!Object.keys(parseEquipmentSelection(exerciseForm.equipment)).length && <Input value={exerciseForm.equipment} placeholder="Oppure scrivi materiali liberi" onChange={e => setExerciseForm(prev => ({ ...prev, equipment: e.target.value }))} />}
                  </div>

                  <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Esercizi</p>
                        <p className="text-xs text-muted-foreground">Aggiungendo o rimuovendo esercizi il totale viene ripartito. Modificando una durata, il totale viene aggiornato.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setStations([...exerciseStations, emptyExerciseStation()], "divide")}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Aggiungi esercizio
                      </Button>
                    </div>
                    {exerciseStations.length === 0 ? (
                      <div className="rounded-md border border-dashed bg-background px-3 py-3 text-sm text-muted-foreground">
                        Nessun esercizio inserito. Se lasci vuoto, la durata resta manuale.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {exerciseStations.map((station, index) => (
                          <div key={station.id} className="rounded-lg border bg-background p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="h-8">Esercizio {index + 1}</Badge>
                                <Input
                                  type="number"
                                  min={0}
                                  step="any"
                                  className="h-8 w-24"
                                  value={station.durationMinutes ? String(Number(Number(station.durationMinutes).toFixed(3))) : ""}
                                  onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, durationMinutes: e.target.value ? String(Math.max(1, Math.round(Number(e.target.value)))) : "" } : item), "sum")}
                                  placeholder="Min"
                                />
                                <span className="text-xs text-muted-foreground">min</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setStations(exerciseStations.filter((item) => item.id !== station.id), "divide")}
                              >
                                Rimuovi
                              </Button>
                            </div>

                            <div className="mt-3 space-y-2">
                              <Label>Titolo esercizio</Label>
                              <Input
                                value={station.title}
                                onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, title: e.target.value } : item))}
                                placeholder={`Esercizio ${index + 1}, es. conduzione e finalizzazione`}
                              />
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(150px,220px)_1fr]">
                              <div className="space-y-2">
                                <Label>Giocatori richiesti nella esercizio</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={station.playersRequired}
                                  onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, playersRequired: e.target.value } : item))}
                                  placeholder="Es. 6"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Obiettivo principale</Label>
                                <Input
                                  value={station.objective}
                                  onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, objective: e.target.value } : item))}
                                  placeholder="Es. conduzione orientata"
                                />
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              <Label>Descrizione svolgimento</Label>
                              <Textarea
                                rows={4}
                                value={station.exercise}
                                onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, exercise: e.target.value } : item))}
                                placeholder="Descrivi svolgimento, rotazioni, regole e tempi della esercizio"
                              />
                            </div>

                            <details className="mt-3 rounded-md border bg-muted/20">
                              <DisclosureSummary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
                                <span>Varianti</span>
                                <Badge variant="secondary">{station.variants.filter((variant) => variant.trim()).length}</Badge>
                              </DisclosureSummary>
                              <div className="space-y-2 border-t p-3">
                                {(station.variants.length > 0 ? station.variants : ["", "", ""]).map((variant, variantIndex) => (
                                  <Textarea
                                    key={`${station.id}-variant-${variantIndex}`}
                                    rows={2}
                                    value={variant}
                                    onChange={(e) => updateStationVariant(station, variantIndex, e.target.value)}
                                    placeholder={`Variante ${variantIndex + 1} (V${variantIndex + 1})`}
                                  />
                                ))}
                                <Button type="button" variant="outline" size="sm" onClick={() => addStationVariant(station)}>
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Aggiungi variante
                                </Button>
                              </div>
                            </details>

                            <div className="mt-3 rounded-md border bg-muted/20 p-2">
                              <Label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">Materiale esercizio</Label>
                              <MaterialPicker options={availableMaterialOptions} selection={parseEquipmentSelection(station.equipment)} onConfirm={selection => setStationEquipmentSelection(station.id, selection)} />
                              {formatEquipmentLabel(station.equipment) && <p className="mt-2 break-words text-xs">{formatEquipmentLabel(station.equipment)}</p>}
                              {!Object.keys(parseEquipmentSelection(station.equipment)).length && <Input className="mt-2" value={station.equipment} placeholder="Oppure scrivi materiali liberi" onChange={e => setStations(exerciseStations.map(item => item.id === station.id ? { ...item, equipment: e.target.value } : item))} />}

                            </div>
                            <Textarea
                              className="mt-2"
                              rows={2}
                              value={station.notes}
                              onChange={(e) => setStations(exerciseStations.map((item) => item.id === station.id ? { ...item, notes: e.target.value } : item))}
                              placeholder="Indicazioni della esercizio"
                            />
                          </div>
                        ))}
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                          Totale esercizi: {formatMinutes(stationMinutes)}
                        </div>
                      </div>
                    )}
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
                    <div>
                      <div className="text-sm font-medium">Riepilogo materiale</div>
                      <p className="text-xs text-muted-foreground">Dotazione complessiva e materiali degli esercizi, senza duplicare il riepilogo.</p>
                    </div>
                    {formatEquipmentLabel(stationEquipmentSummary) ? (
                      <div className="rounded-md border bg-background px-3 py-2 text-sm font-medium">
                        {formatEquipmentLabel(stationEquipmentSummary)}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed bg-background px-3 py-3 text-sm text-muted-foreground">
                        Nessun materiale inserito.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50">
                    <div>
                      <p className="text-sm font-medium">Segna come bozza</p>
                      <p className="text-xs text-muted-foreground">La stazione sarà visibile come bozza da completare</p>
                    </div>
                    <Switch checked={exerciseForm.isDraft} onCheckedChange={(v) => setExerciseForm((prev) => ({ ...prev, isDraft: v }))} />
                  </div>
                </TabsContent>

                <TabsContent value="board" className="pt-4 space-y-3">
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Lavagna stazione</p>
                      <p className="text-xs text-muted-foreground">Usa la veloce qui sotto oppure apri la lavagna tattica completa.</p>
                    </div>
                    <ExerciseTacticalBoard title={exerciseForm.title || "Stazione"} teamId={exerciseForm.teamId || session.teamId} value={exerciseForm.statoLavagnaJson} rosterPlayerIds={exerciseForm.playersRequiredMode === "selected" ? selectedPlayerIds.filter(id=>!blockedPlayerIds.includes(id)) : selectablePlayers.map(player => player.id)} onSave={result => setExerciseForm(prev => {const safe=attendanceExerciseView(result,blockedPlayerIds);return {...prev,statoLavagnaJson:safe.statoLavagnaJson??"",drawingData:safe.drawingData??"",drawingElementsJson:safe.drawingElementsJson??""};})} />
                  </div>
                  {exerciseForm.statoLavagnaJson && exerciseForm.drawingData ? <img src={exerciseForm.drawingData} alt="Anteprima lavagna stazione" className="max-h-[420px] w-full rounded-md border object-contain" /> : <ExerciseDrawingBoard
                    value={exerciseForm.drawingData || null}
                    onChange={(data) => setExerciseForm((prev) => ({ ...prev, drawingData: data ?? "" }))}
                    onChangeElements={(els) => setExerciseForm((prev) => ({ ...prev, drawingElementsJson: els ? JSON.stringify(els) : "" }))}
                  />}
                </TabsContent>

                <TabsContent value="voice" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Registra una nota vocale oppure carica un file audio gia presente sul telefono.</p>
                  <ExerciseVoiceRecorder
                    value={exerciseForm.voiceNoteData || null}
                    onChange={(data) => setExerciseForm((prev) => ({ ...prev, voiceNoteData: data ?? "" }))}
                  />
                </TabsContent>

                <TabsContent value="video" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Registra una nota video oppure carica un file video gia presente sul telefono.</p>
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
                Salva come nuova stazione
              </Button>
            )}
            <Button type="submit" form="ex-form-session" disabled={exerciseSaving}>
              {exerciseSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingLink ? "Salva modifiche" : "Salva stazione"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>}
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type TrainingPageProps = {
  section?: string;
};

export default function TrainingPage({ section }: TrainingPageProps = {}) {
  const { role, user, club, section: activeSection } = useAuth();
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
  const [createdPhase,setCreatedPhase] = useState<string|undefined>(undefined);
  const [calendarDraft, setCalendarDraft] = useState<InitialSessionDraft | null>(null);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [commentSession, setCommentSession] = useState<TrainingSession | null>(null);
  const [detailsSession, setDetailsSession] = useState<TrainingSession | null>(null);
  const [directiveOpen, setDirectiveOpen] = useState(false);
  const [dismissedDirectives, setDismissedDirectives] = useState<number[]>([]);
  const initialSessionHandledRef = useRef(false);
  const initialSessionId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("sessionId");
    const parsed = raw ? Number(raw) : null;
    return parsed && Number.isFinite(parsed) ? parsed : null;
  }, []);
  const initialSessionDraft = useMemo<InitialSessionDraft | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("newSession") !== "1") return null;
    const teamId = Number(params.get("teamId"));
    return {
      teamId: Number.isFinite(teamId) && teamId > 0 ? teamId : null,
      date: params.get("date"),
      start: params.get("start"),
    };
  }, []);

  const sessionsQuery = useQuery<TrainingSession[]>({
    queryKey: ["/api/training-sessions", "preparation-calendar", club?.id, user?.id, role, section ?? activeSection],
    queryFn: () => apiFetch(`/api/training-sessions?includePreparation=1${section ? `&section=${encodeURIComponent(section)}` : ""}`),
    enabled: !!role,
  });
  const initialSessionQuery = useQuery<TrainingSession>({
    queryKey: ["/api/training-sessions", initialSessionId, "initial-open"],
    queryFn: () => apiFetch(`/api/training-sessions/${initialSessionId}`),
    enabled: !!role && !!initialSessionId,
    retry: false,
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

  const teamsQuery = useQuery<SessionCalendarTeam[]>({
    queryKey: ["/api/teams", "training-calendar", club?.id, user?.id, role, section ?? activeSection],
    queryFn: () => apiFetch(`/api/teams${section ? `?section=${encodeURIComponent(section)}` : ""}`),
    enabled: !!role,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => confirmDeleteTrainingSession(id,apiFetch),
    onSuccess: (deleted,id) => { if(!deleted)return;qc.invalidateQueries({ queryKey: ["/api/training-sessions"] });qc.invalidateQueries({queryKey:["/api/attendance-summary"]});if(detailsSession?.id===id)setDetailsSession(null);toast({ title: "Seduta eliminata" }); },
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

  useEffect(() => {
    if (initialSessionHandledRef.current || !initialSessionId || sessionsQuery.isLoading || initialSessionQuery.isLoading) return;
    const target = sessions.find((session) => session.id === initialSessionId) ?? initialSessionQuery.data;
    if (!target) {
      if (sessionsQuery.isSuccess && (initialSessionQuery.isError || initialSessionQuery.isSuccess)) {
        initialSessionHandledRef.current = true;
        toast({
          title: "Seduta non trovata",
          description: "La seduta richiesta non è disponibile per il tuo accesso o non esiste più.",
          variant: "destructive",
        });
      }
      return;
    }
    initialSessionHandledRef.current = true;
    setDetailsSession(target);
  }, [initialSessionId, initialSessionQuery.data, initialSessionQuery.isError, initialSessionQuery.isLoading, initialSessionQuery.isSuccess, sessions, sessionsQuery.isLoading, sessionsQuery.isSuccess, toast]);

  useEffect(() => {
    if (!initialSessionDraft) return;
    setCreateOpen(true);
  }, [initialSessionDraft]);

  const activeDirectives = directives.filter(d => !dismissedDirectives.includes(d.id));

  useEffect(() => {
    if (detailsSession) {
      const fresh = sessionsQuery.data?.find(item => item.id === detailsSession.id);
      if (fresh && fresh !== detailsSession) setDetailsSession(fresh);
    }
  }, [sessionsQuery.data]);

  // ── Session grids ─────────────────────────────────────────────────────────
  const isReadOnly = ["admin", "presidente", "director", "sporting_director"].includes(role ?? "");
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
    s.sessionKind === "regular"
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

  function renderSessionsCalendar() {
    return <TrainingSessionsCalendar
      teams={teams}
      sessions={regularSessions}
      section={section}
      canCreate={["coach", "fitness_coach", "athletic_director", "technical_director", "secretary"].includes(role ?? "")}
      loading={sessionsQuery.isLoading || teamsQuery.isLoading}
      error={sessionsQuery.isError || teamsQuery.isError}
      onRetry={() => { void sessionsQuery.refetch(); void teamsQuery.refetch(); }}
      focusSession={detailsSession ?? initialSessionQuery.data}
      onOpen={id => { const target = sessions.find(session => session.id === id); if (target) setDetailsSession(target); }}
      onCreate={draft => {
        // Recheck the current list before opening creation: existing drafts always open in place.
        const existing = regularSessions.find(session => session.teamId === draft.teamId && Number.isFinite(Date.parse(session.scheduledAt)) && format(new Date(session.scheduledAt), "yyyy-MM-dd|HH:mm") === `${draft.date}|${draft.start}`);
        if (existing) { setDetailsSession(existing); return; }
        setCalendarDraft(draft); setCreateOpen(true);
      }}
    />;
  }

  function SessionGrid({ items, emptyMsg, canDeleteFn, canEditFn, showComment, onOpenDetails, showRecovery, isReadOnly: gridReadOnly = isReadOnly }: {
    items: TrainingSession[];
    emptyMsg: string;
    canDeleteFn?: (s: TrainingSession) => boolean;
    canEditFn?: (s: TrainingSession) => boolean;
    showComment?: boolean;
    onOpenDetails?: (s: TrainingSession) => void;
    showRecovery?: boolean;
    isReadOnly?: boolean;
  }) {
    const sessionIdsKey = useMemo(() => items.map((session) => session.id).slice(0, 80).join(","), [items]);
    const attendanceSummaryQuery = useQuery<Record<string, AttendanceSummary>>({
      queryKey: ["/api/attendance-summary", sessionIdsKey],
      queryFn: () => apiFetch(`/api/attendance-summary?sessionIds=${encodeURIComponent(sessionIdsKey)}`),
      enabled: sessionIdsKey.length > 0,
    });
    const attendanceSummaries = attendanceSummaryQuery.data ?? {};

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
    const orderedItems = sortSessionsByTimeline(items);
    const nextUpcomingId = orderedItems.find((session) => getSessionTime(session) >= Date.now())?.id ?? null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedItems.map(s => {
          const timelineState: SessionTimelineState = getSessionTime(s) < Date.now() ? "past" : s.id === nextUpcomingId ? "next" : "future";
          return (
          <SessionCard
            key={s.id}
            session={s}
            canDelete={canDeleteFn ? canDeleteFn(s) : false}
            canEdit={canEditFn ? canEditFn(s) : false}
            onDelete={() => deleteMutation.mutate(s.id)}
            onEdit={() => setEditingSession(s)}
            onComment={showComment ? () => setCommentSession(s) : undefined}
            onOpenDetails={onOpenDetails ? () => onOpenDetails(s) : undefined}
            showRecovery={showRecovery}
            isReadOnly={gridReadOnly}
            timelineState={timelineState}
            attendanceSummary={attendanceSummaries[String(s.id)]}
          />
          );
        })}
      </div>
    );
  }

  function SeasonArchive({ items, emptyMsg, readOnly = false }: { items: TrainingSession[]; emptyMsg: string; readOnly?: boolean }) {
    const grouped = useMemo(() => {
      const map = new Map<string, TrainingSession[]>();
      for (const session of items) {
        const key = getSessionSeasonKey(session);
        map.set(key, [...(map.get(key) ?? []), session]);
      }
      return Array.from(map.entries())
        .map(([key, group]) => ({
          key,
          label: getSessionSeasonLabel(key),
          items: sortSessionsByTimeline(group),
        }))
        .sort((a, b) => b.key.localeCompare(a.key));
    }, [items]);

    if (sessionsQuery.isLoading) {
      return <SessionGrid items={[]} emptyMsg={emptyMsg} />;
    }

    if (grouped.length === 0) {
      return <SessionGrid items={[]} emptyMsg={emptyMsg} />;
    }

    return (
      <Accordion type="multiple" defaultValue={[grouped[0]?.key ?? ""]} className="space-y-3">
        {grouped.map((group) => (
          <SeasonArchiveSection
            key={group.key}
            value={group.key}
            label={group.label}
            items={group.items}
            readOnly={readOnly}
          />
        ))}
      </Accordion>
    );
  }

  function SeasonArchiveSection({ value, label, items, readOnly }: { value: string; label: string; items: TrainingSession[]; readOnly: boolean }) {
    const [search, setSearch] = useState("");
    const [dateFilter, setDateFilter] = useState("all");
    const [principleFilter, setPrincipleFilter] = useState("all");
    const [teamFilter, setTeamFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const dateOptions = useMemo(() => Array.from(new Set(items.map(getSessionDateKey).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [items]);
    const principleOptions = useMemo(() => Array.from(new Set(items.map((s) => normalizePrincipio(s.objectives)).filter(Boolean))).sort(), [items]);
    const teamOptions = useMemo(() => {
      const map = new Map<string, string>();
      for (const s of items) {
        const key = s.teamId == null ? "__none__" : String(s.teamId);
        if (!map.has(key)) map.set(key, s.teamName ?? "Senza squadra");
      }
      return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it"));
    }, [items]);

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = items.filter((session) => {
      if (normalizedSearch && !matchesSessionSearch(session, normalizedSearch)) return false;
      if (dateFilter !== "all" && getSessionDateKey(session) !== dateFilter) return false;
      if (principleFilter !== "all" && normalizePrincipio(session.objectives) !== principleFilter) return false;
      if (teamFilter !== "all") {
        const key = session.teamId == null ? "__none__" : String(session.teamId);
        if (key !== teamFilter) return false;
      }
      if (statusFilter !== "all" && session.status !== statusFilter) return false;
      return true;
    });

    return (
      <AccordionItem value={value} className="rounded-lg border bg-background px-3">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center gap-3">
            <span className="font-semibold">Annata {label}</span>
            <Badge variant="secondary">{items.length}</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pb-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="md:col-span-2">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca principio, titolo, squadra..." />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger><SelectValue placeholder="Data" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le date</SelectItem>
                {dateOptions.map((date) => <SelectItem key={date} value={date}>{date.split("-").reverse().join("/")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={principleFilter} onValueChange={setPrincipleFilter}>
              <SelectTrigger><SelectValue placeholder="Principio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i principi</SelectItem>
                {principleOptions.map((principle) => <SelectItem key={principle} value={principle}>{principioLabel(principle)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger><SelectValue placeholder="Squadra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le squadre</SelectItem>
                {teamOptions.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="max-w-xs">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
            items={filtered}
            emptyMsg="Nessuna seduta trovata in questa annata"
            onOpenDetails={setDetailsSession}
            showRecovery
            isReadOnly={readOnly}
          />
        </AccordionContent>
      </AccordionItem>
    );
  }

  // ── Technical Director view ───────────────────────────────────────────────
  if (isTD) {
    const tdDirectives = directives;
    const tdHasSearchFilters = !!(tdSessionSearch.trim() || tdExerciseSearch.trim());
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Gestione Allenamenti
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualizza tutte le sedute, invia sedute tipo e direttive agli allenatori
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDirectiveOpen(true)}>
              <Megaphone className="w-4 h-4 mr-2" />
              Direttiva
            </Button>
            <Button onClick={() => { setCalendarDraft(null); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Nuova seduta
            </Button>
          </div>
        </div>

        <details className="rounded-xl border bg-card p-3">
          <DisclosureSummary className="cursor-pointer text-sm font-medium">Elenco, filtri, sedute tipo e direttive</DisclosureSummary>
          <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Cerca sedute (principio, giorno, squadra, stato)</Label>
            <Input
              value={tdSessionSearch}
              onChange={(e) => setTdSessionSearch(e.target.value)}
              placeholder="Es. Giorno 2, tecnico tattico, pianificata..."
            />
          </div>
          <div className="space-y-2">
            <Label>Cerca stazioni nelle sedute (titolo, categoria, principio, fase)</Label>
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
              Tutte le sedute
              {filteredSessionsForTD.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">{filteredSessionsForTD.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tipo">
              Sedute Tipo
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
              emptyMsg={tdHasSearchFilters ? "Nessuna seduta trovata con i filtri di ricerca" : "Nessuna seduta di allenamento registrata nel club"}
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
                Le <strong>Sedute Tipo</strong> vengono inviate agli allenatori o preparatori selezionati e appaiono direttamente nelle loro dashboard come sedute da seguire.
              </span>
            </div>
            <SessionGrid
              items={filteredTipoSessionsForTD}
              emptyMsg={tdHasSearchFilters ? "Nessuna seduta trovata con i filtri di ricerca" : "Nessuna seduta tipo inviata"}
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

          </div>
        </details>
        {renderSessionsCalendar()}


        {/* Dialogs */}
        <CreateSessionDialog
          open={createOpen} onClose={() => setCreateOpen(false)}
          onCreated={invalidateSessions}
          onCreatedSession={(created,phase)=>{setCreatedPhase(phase);setDetailsSession(created);}} members={members} isTD teams={teams}
          initialDraft={calendarDraft ?? initialSessionDraft ?? undefined}
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
        {detailsSession && (
          <SessionDetailsDialog onDeleteSession={()=>deleteMutation.mutate(detailsSession.id)} initialAddPhase={createdPhase} session={detailsSession} onClose={() => {setDetailsSession(null);setCreatedPhase(undefined);}} teams={teams}
            readOnly={!(detailsSession.canEdit === true || detailsSession.createdByUserId === userId)}
            onEditSession={() => { setEditingSession(detailsSession); setDetailsSession(null); }} />
        )}
        {editingSession && (
          <EditSessionDialog
            session={editingSession}
            onClose={() => setEditingSession(null)}
            onSaved={invalidateSessions}
            onManageExercises={() => {
              setDetailsSession(editingSession);
              setEditingSession(null);
            }}
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
              Pianificazione sedute (segreteria)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestisci le sedute di tutte le squadre. Per avvisi verso allenatori, preparatori e genitori usa le notifiche piattaforma.
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/club/platform-notifications">Notifiche piattaforma</Link>
          </Button>
        </div>

        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Puoi creare, modificare ed eliminare sedute per conto del club. Staff tecnico e preparatori vedono e aggiornano le sedute delle proprie annate dalla propria area.
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => { setCalendarDraft(null); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Nuova seduta
          </Button>
        </div>

        <details className="rounded-xl border bg-card p-3"><DisclosureSummary className="cursor-pointer text-sm font-medium">Elenco e gestione sedute</DisclosureSummary><div className="mt-4">
        <SessionGrid
          items={sessions}
          emptyMsg="Nessuna seduta di allenamento registrata nel club"
          canDeleteFn={() => true}
          canEditFn={() => true}
          onOpenDetails={setDetailsSession}
          showRecovery
        />

        </div></details>
        {renderSessionsCalendar()}


        <CreateSessionDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={invalidateSessions}
          onCreatedSession={(created,phase)=>{setCreatedPhase(phase);setDetailsSession(created);}}
          members={[]}
          isTD={false}
          teams={teams}
          initialDraft={calendarDraft ?? initialSessionDraft ?? undefined}
        />
        {detailsSession && (
          <SessionDetailsDialog
            onDeleteSession={()=>deleteMutation.mutate(detailsSession.id)}
            initialAddPhase={createdPhase}
            session={detailsSession}
            onClose={() => {setDetailsSession(null);setCreatedPhase(undefined);}}
            teams={teams}
            onEditSession={() => { setEditingSession(detailsSession); setDetailsSession(null); }}
          />
        )}
        {editingSession && (
          <EditSessionDialog
            session={editingSession}
            onClose={() => setEditingSession(null)}
            onSaved={invalidateSessions}
            onManageExercises={() => {
              setDetailsSession(editingSession);
              setEditingSession(null);
            }}
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
        <details className="rounded-xl border bg-card p-3"><DisclosureSummary className="cursor-pointer text-sm font-medium">Elenco e archivio sedute</DisclosureSummary><div className="mt-4">
        <SeasonArchive
          items={sessions}
          emptyMsg="Nessuna seduta di allenamento programmata"
          readOnly
        />
        </div></details>
        {renderSessionsCalendar()}

        {detailsSession && (
          <SessionDetailsDialog
            onDeleteSession={()=>deleteMutation.mutate(detailsSession.id)}
            initialAddPhase={createdPhase}
            session={detailsSession}
            onClose={() => {setDetailsSession(null);setCreatedPhase(undefined);}}
            teams={teams}
            readOnly
          />
        )}
      </div>
    );
  }

  // ── Coach / Fitness Coach / Athletic Director ─────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Le mie Sedute
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Pianifica e gestisci le tue sedute di allenamento</p>
        </div>
        <Button onClick={() => { setCalendarDraft(null); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova seduta
        </Button>
      </div>

      <details className="rounded-xl border bg-card p-3"><DisclosureSummary className="cursor-pointer text-sm font-medium">Elenco, filtri e gestione sedute</DisclosureSummary><div className="mt-4">
      {/* My sessions */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Le mie sedute ({filteredMySessionsForCoach.length}/{mySessionsForCoach.length})
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
                <SelectItem key={p} value={p}>{principioLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachSlotFilter} onValueChange={(v) => setCoachSlotFilter(v)}>
            <SelectTrigger><SelectValue placeholder="Giorno/seduta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le sedute</SelectItem>
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
              : "Nessuna seduta trovata con i filtri selezionati"
          }
          canDeleteFn={s => s.canEdit === true || s.createdByUserId === userId}
          canEditFn={s => s.canEdit === true || s.createdByUserId === userId}
          onOpenDetails={setDetailsSession}
          showRecovery
        />
      </div>

      </div></details>
        {renderSessionsCalendar()}

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
            Sedute Tipo da Seguire ({tipoReceived.length})
          </h2>
          <SessionGrid
            items={tipoReceived}
            emptyMsg="Nessuna seduta tipo da seguire"
          />
        </div>
      )}



      <CreateSessionDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={invalidateSessions}
          onCreatedSession={(created,phase)=>{setCreatedPhase(phase);setDetailsSession(created);}}
        members={[]}
        isTD={false}
        teams={teams}
        initialDraft={calendarDraft ?? initialSessionDraft ?? undefined}
      />
      {detailsSession && (
        <SessionDetailsDialog
            onDeleteSession={()=>deleteMutation.mutate(detailsSession.id)}
            initialAddPhase={createdPhase}
          session={detailsSession}
          onClose={() => {setDetailsSession(null);setCreatedPhase(undefined);}}
          teams={teams}
          readOnly={!(detailsSession.canEdit === true || detailsSession.createdByUserId === userId)}
          onEditSession={() => { setEditingSession(detailsSession); setDetailsSession(null); }}
        />
      )}
      {editingSession && (
        <EditSessionDialog
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={invalidateSessions}
          onManageExercises={() => {
            setDetailsSession(editingSession);
            setEditingSession(null);
          }}
          teams={teams}
        />
      )}
    </div>
  );
}
