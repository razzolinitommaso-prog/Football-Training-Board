import { useState, useEffect, useRef } from "react";
import { useListPlayers, useCreatePlayer, useDeletePlayer, useListTeams, useUpdatePlayer, useCreateTeam } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, UserMinus, Pencil, Filter, AlertTriangle, FileDown, User, ImagePlus, X, Eye, Upload, FileText, Trash2, Banknote, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";
import { ToastAction } from "@/components/ui/toast";
import { exportToExcel, mapPlayersForExcel } from "@/lib/excel-export";
import { mapExcelRowToPlayer, mapExcelRowToPlayerPreview, isValidPlayerRow, downloadPlayerTemplate, cellToTrimmedString, normalizeImportedTeamDisplayName } from "@/lib/excel-import";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { withApi } from "@/lib/api-base";

/** Radix Checkbox può emettere `indeterminate`; Zod `z.boolean()` altrimenti fallisce e il submit non parte. */
const zRegisteredCheckbox = z.preprocess((v) => {
  if (v === "indeterminate") return false;
  return v;
}, z.boolean().optional());

const playerSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: z.coerce.number().optional().nullable(),
  position: z.string().optional(),
  jerseyNumber: z.coerce.number().optional().nullable(),
  status: z.string().default("active"),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  phoneOwnerType: z.string().optional(),
  parentFirstName: z.string().optional(),
  parentLastName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().optional(),
  parentRelation: z.string().optional(),
  secondaryContactFirstName: z.string().optional(),
  secondaryContactLastName: z.string().optional(),
  secondaryContactPhone: z.string().optional(),
  secondaryContactEmail: z.string().optional(),
  secondaryContactRelation: z.string().optional(),
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
  medicalCertificateExpiry: z.string().optional().nullable(),
  shuttleService: z.boolean().optional(),
});

const editSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: z.coerce.number().optional().nullable(),
  position: z.string().optional(),
  jerseyNumber: z.coerce.number().optional().nullable(),
  status: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  phoneOwnerType: z.string().optional(),
  parentFirstName: z.string().optional(),
  parentLastName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().optional(),
  parentRelation: z.string().optional(),
  secondaryContactFirstName: z.string().optional(),
  secondaryContactLastName: z.string().optional(),
  secondaryContactPhone: z.string().optional(),
  secondaryContactEmail: z.string().optional(),
  secondaryContactRelation: z.string().optional(),
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
  medicalCertificateExpiry: z.string().optional().nullable(),
  shuttleService: z.boolean().optional(),
  nationality: z.string().optional(),
  height: z.coerce.number().optional().nullable(),
  weight: z.coerce.number().optional().nullable(),
  notes: z.string().optional(),
  available: z.boolean().optional(),
  unavailabilityReason: z.string().optional(),
  expectedReturn: z.string().optional(),
  squad: z.enum(["A", "B", "C", "D"]).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  supplementalTeamId: z.coerce.number().optional().nullable(),
});

type EditForm = z.infer<typeof editSchema>;

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId?: number | null;
  teamName?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
  status: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  phoneOwnerType?: string | null;
  parentFirstName?: string | null;
  parentLastName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  parentRelation?: string | null;
  secondaryContactFirstName?: string | null;
  secondaryContactLastName?: string | null;
  secondaryContactPhone?: string | null;
  secondaryContactEmail?: string | null;
  secondaryContactRelation?: string | null;
  registered?: boolean | null;
  registrationNumber?: string | null;
  medicalCertificateExpiry?: string | null;
  shuttleService?: boolean | null;
  nationality?: string | null;
  height?: number | null;
  weight?: number | null;
  notes?: string | null;
  available?: boolean;
  unavailabilityReason?: string | null;
  expectedReturn?: string | null;
  squad?: "A" | "B" | "C" | "D" | null;
  imageUrl?: string | null;
};

type PlayerNameOrder = "surname_first" | "name_first";
type PlayerImageBackground = "white" | "club_logo";
type SeasonOption = { id: number; name: string; startDate?: string; endDate?: string; isActive?: boolean };
type PlayerDocument = {
  id: number;
  playerId: number;
  type: string;
  validFrom?: string | null;
  expiryDate?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  fileData?: string | null;
  notes?: string | null;
};

type PlayerPayment = {
  id: number;
  playerId: number;
  amount: number;
  dueDate?: string | null;
  status: string;
  paymentDate?: string | null;
  description?: string | null;
  paymentType?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  annualFeeTotal?: number | null;
  availabilityBlocking?: number | null;
  paymentMethod?: string | null;
};

type PlayerEquipment = {
  id: number;
  playerId: number;
  kitAssigned?: string | null;
  trainingKit?: string | null;
  matchKit?: string | null;
  notes?: string | null;
};

type KitRow = {
  key: string;
  label: string;
  area: "training" | "match" | "representation";
  price: string;
  ordered: boolean;
  arrived: boolean;
};

type InstallmentDraft = {
  amount: string;
  dueDate: string;
};

const KIT_ITEMS: Array<Pick<KitRow, "key" | "label" | "area">> = [
  { key: "training_socks", label: "Calzettone allenamento", area: "training" },
  { key: "training_shorts", label: "Pantaloncino allenamento", area: "training" },
  { key: "training_shirt", label: "Maglietta allenamento", area: "training" },
  { key: "k_way", label: "K-Way", area: "training" },
  { key: "winter_tracksuit", label: "Tuta invernale allenamento", area: "training" },
  { key: "winter_pants", label: "Pantalone invernale", area: "training" },
  { key: "winter_pinocchietto", label: "Pinocchietto invernale", area: "training" },
  { key: "winter_sweatshirt", label: "Felpa invernale allenamento", area: "training" },
  { key: "match_shorts", label: "Pantaloncino gara", area: "match" },
  { key: "match_socks", label: "Calzettone gara", area: "match" },
  { key: "match_shirt", label: "Maglietta gara", area: "match" },
  { key: "rep_tracksuit", label: "Tuta completa rappresentanza", area: "representation" },
  { key: "rep_pants_sweatshirt", label: "Pantalone + felpa rappresentanza", area: "representation" },
  { key: "rep_polo", label: "Polo di rappresentanza", area: "representation" },
  { key: "rep_jacket", label: "Giubbotto", area: "representation" },
];

function defaultKitRows(): KitRow[] {
  return KIT_ITEMS.map((item) => ({ ...item, price: "", ordered: false, arrived: false }));
}

function parseKitRows(raw: string | null | undefined): KitRow[] {
  if (!raw) return defaultKitRows();
  try {
    const parsed = JSON.parse(raw) as Partial<KitRow>[];
    if (!Array.isArray(parsed)) return defaultKitRows();
    return defaultKitRows().map((base) => {
      const saved = parsed.find((row) => row.key === base.key);
      return {
        ...base,
        price: saved?.price != null ? String(saved.price) : "",
        ordered: saved?.ordered === true,
        arrived: saved?.arrived === true,
      };
    });
  } catch {
    return defaultKitRows();
  }
}

function serializeKitRows(rows: KitRow[]): string {
  return JSON.stringify(rows.map((row) => ({
    key: row.key,
    label: row.label,
    area: row.area,
    price: row.price,
    ordered: row.ordered,
    arrived: row.arrived,
  })));
}

function buildInstallmentDrafts(totalValue: string, countValue: string, firstDueDate: string): InstallmentDraft[] {
  const total = Number(totalValue);
  const count = Math.max(1, Math.floor(Number(countValue) || 1));
  if (!Number.isFinite(total) || total <= 0) return [];
  const cents = Math.round(total * 100);
  const baseCents = Math.floor(cents / count);
  let assigned = 0;
  const baseDate = firstDueDate ? new Date(`${firstDueDate}T00:00:00`) : new Date();
  return Array.from({ length: count }, (_, index) => {
    const installmentCents = index === count - 1 ? cents - assigned : baseCents;
    assigned += installmentCents;
    const due = new Date(baseDate);
    due.setMonth(baseDate.getMonth() + index);
    return {
      amount: (installmentCents / 100).toFixed(2),
      dueDate: Number.isNaN(due.getTime()) ? "" : due.toISOString().slice(0, 10),
    };
  });
}

function rebalanceInstallments(drafts: InstallmentDraft[], index: number, value: string, totalValue: string): InstallmentDraft[] {
  const totalCents = Math.round((Number(totalValue) || 0) * 100);
  const next = drafts.map((draft) => ({ ...draft }));
  next[index].amount = value;
  const fixedCents = Math.round((Number(value) || 0) * 100);
  const otherIndexes = next.map((_, i) => i).filter((i) => i !== index);
  if (!otherIndexes.length) return next;
  const remaining = Math.max(0, totalCents - fixedCents);
  const base = Math.floor(remaining / otherIndexes.length);
  let assigned = 0;
  otherIndexes.forEach((otherIndex, position) => {
    const cents = position === otherIndexes.length - 1 ? remaining - assigned : base;
    assigned += cents;
    next[otherIndex].amount = (cents / 100).toFixed(2);
  });
  return next;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsDataURL(file);
  });
}

function playerDocumentLabel(type: string): string {
  if (type === "medicalCertificate") return "Certificato medico";
  if (type === "federationCard") return "Cartellino";
  if (type === "idCard") return "Documento identita";
  if (type === "privacy") return "Privacy";
  return "Altro";
}

const PLAYER_DOCUMENT_TYPES = [
  { value: "medicalCertificate", label: "Certificato medico", hasExpiry: true },
  { value: "federationCard", label: "Cartellino", hasExpiry: true },
  { value: "idCard", label: "Documento identita", hasExpiry: true },
  { value: "privacy", label: "Privacy", hasExpiry: false },
  { value: "other", label: "Altro documento", hasExpiry: false },
] as const;

function playerName(player: Pick<Player, "firstName" | "lastName">, order: PlayerNameOrder = "surname_first"): string {
  const firstName = String(player.firstName ?? "").trim();
  const lastName = String(player.lastName ?? "").trim();
  const parts = order === "surname_first" ? [lastName, firstName] : [firstName, lastName];
  return parts.filter(Boolean).join(" ");
}

function comparePlayersBySurname(a: Pick<Player, "firstName" | "lastName">, b: Pick<Player, "firstName" | "lastName">): number {
  return playerName(a, "surname_first").localeCompare(playerName(b, "surname_first"), "it", {
    sensitivity: "base",
    numeric: true,
  });
}

function normalizeImportTeamName(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "o")
    .replace(/\s+/g, " ");
}

function playerImportFingerprint(player: { firstName?: unknown; lastName?: unknown; teamId?: unknown }) {
  return [
    normalizeImportTeamName(String(player.lastName ?? "")),
    normalizeImportTeamName(String(player.firstName ?? "")),
    String(player.teamId ?? ""),
  ].join("|");
}

function removeUniformImageBackground(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const samples = [
    0,
    (width - 1) * 4,
    (width * (height - 1)) * 4,
    (width * height - 1) * 4,
  ];
  const bg = samples.reduce(
    (acc, idx) => ({
      r: acc.r + data[idx],
      g: acc.g + data[idx + 1],
      b: acc.b + data[idx + 2],
    }),
    { r: 0, g: 0, b: 0 },
  );
  const base = { r: bg.r / samples.length, g: bg.g / samples.length, b: bg.b / samples.length };
  const hard = 34;
  const soft = 96;

  for (let idx = 0; idx < data.length; idx += 4) {
    const dr = data[idx] - base.r;
    const dg = data[idx + 1] - base.g;
    const db = data[idx + 2] - base.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance <= hard) {
      data[idx + 3] = 0;
    } else if (distance < soft) {
      data[idx + 3] = Math.round(data[idx + 3] * ((distance - hard) / (soft - hard)));
    }
  }

  return imageData;
}

function reasonLabel(reason: string | null | undefined, t: ReturnType<typeof useLanguage>["t"]) {
  if (reason === "illness") return t.illness;
  if (reason === "injury") return t.injuryReason;
  if (reason === "vacation") return t.vacationReason;
  if (reason === "payment") return "Autorizzazione societaria";
  if (reason === "other") return t.otherReason;
  return reason || "—";
}

type TeamWithSeason = {
  id: number;
  name: string;
  seasonId?: number | null;
  seasonName?: string | null;
  [key: string]: unknown;
};

type ClubSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

interface PlayersListProps {
  section?: ClubSection;
}

type PlayerNoteRecipient = "secretary" | "technical_director" | "coach_staff";
type PlayerNoteThreadItem = {
  id: string;
  authorRole: string;
  authorName?: string;
  recipient: PlayerNoteRecipient;
  body: string;
  createdAt: string;
  requiresResponse?: boolean;
  replyToId?: string;
  repliedAt?: string;
};

const PLAYER_NOTES_MARKER = "[FTB_PLAYER_NOTES]";
const PLAYER_META_MARKER = "[FTB_PLAYER_META]";
type PlayerMeta = {
  squad?: "A" | "B" | "C" | "D" | null;
  imageUrl?: string | null;
  supplementalTeamId?: number | null;
};

function splitPlayerMeta(raw?: string | null): { notesRaw: string; meta: PlayerMeta } {
  const full = (raw ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return { notesRaw: full, meta: {} };
  const nextNewLineIdx = full.indexOf("\n");
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(PLAYER_META_MARKER.length, nextNewLineIdx).trim()
    : full.slice(PLAYER_META_MARKER.length).trim();
  const notesRaw = nextNewLineIdx >= 0 ? full.slice(nextNewLineIdx + 1) : "";
  try {
    const parsed = JSON.parse(encodedMeta) as PlayerMeta;
    return {
      notesRaw: notesRaw.trim(),
      meta: {
        squad: parsed?.squad ?? null,
        imageUrl: parsed?.imageUrl ?? null,
        supplementalTeamId: parsed?.supplementalTeamId ?? null,
      },
    };
  } catch {
    return { notesRaw: full, meta: {} };
  }
}

function composePlayerMeta(notesRaw: string, meta: PlayerMeta): string {
  const cleanNotes = notesRaw.trim();
  const hasAnyMeta = Boolean(meta?.squad || meta?.imageUrl || meta?.supplementalTeamId);
  if (!hasAnyMeta) return cleanNotes;
  const encoded = `${PLAYER_META_MARKER}${JSON.stringify({
    squad: meta.squad ?? null,
    imageUrl: meta.imageUrl ?? null,
    supplementalTeamId: meta.supplementalTeamId ?? null,
  })}`;
  return cleanNotes ? `${encoded}\n${cleanNotes}` : encoded;
}

function splitPlayerNotes(raw?: string | null): { plainNote: string; thread: PlayerNoteThreadItem[] } {
  const full = (raw ?? "").trim();
  if (!full) return { plainNote: "", thread: [] };
  const idx = full.lastIndexOf(PLAYER_NOTES_MARKER);
  if (idx < 0) return { plainNote: full, thread: [] };
  const before = full.slice(0, idx).trim();
  const jsonPart = full.slice(idx + PLAYER_NOTES_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (!Array.isArray(parsed)) return { plainNote: before, thread: [] };
    return { plainNote: before, thread: parsed as PlayerNoteThreadItem[] };
  } catch {
    return { plainNote: before, thread: [] };
  }
}

function composePlayerNotes(plainNote: string, thread: PlayerNoteThreadItem[]): string {
  const cleanPlain = plainNote.trim();
  if (!thread.length) return cleanPlain;
  const encoded = `${PLAYER_NOTES_MARKER}${JSON.stringify(thread)}`;
  return cleanPlain ? `${cleanPlain}\n\n${encoded}` : encoded;
}

function isMedicalCertificateValid(value?: string | null): boolean {
  if (!value) return false;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry >= today;
}

function getAvailabilityBlocks(registered?: boolean | null, medicalCertificateExpiry?: string | null): string[] {
  const blocks: string[] = [];
  if (registered !== true) blocks.push("non tesserato");
  if (!isMedicalCertificateValid(medicalCertificateExpiry)) blocks.push("certificato medico assente o scaduto");
  return blocks;
}

function buildAutomaticAvailabilityBody(blocks: string[]): string {
  return `Comunicazione automatica per dirigenti, staff e famiglia: giocatore non disponibile per ${blocks.join(" e ")}.`;
}

function addAutomaticAvailabilityNotes(
  thread: PlayerNoteThreadItem[],
  blocks: string[],
  role: string | undefined,
  authorName?: string,
): PlayerNoteThreadItem[] {
  if (!blocks.length) return thread;
  const body = buildAutomaticAvailabilityBody(blocks);
  const recipients: PlayerNoteRecipient[] = ["technical_director", "coach_staff"];
  const next = [...thread];
  const nowIso = new Date().toISOString();
  for (const recipient of recipients) {
    if (next.some((item) => item.recipient === recipient && item.body === body)) continue;
    next.push({
      id: `auto-availability-${recipient}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorRole: role ?? "system",
      authorName,
      recipient,
      body,
      createdAt: nowIso,
      requiresResponse: false,
    });
  }
  return next;
}

function medicalCertificateDaysToExpiry(value?: string | null): number | null {
  if (!value) return null;
  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function addAutomaticMedicalCertificateWarningNotes(
  thread: PlayerNoteThreadItem[],
  expiryDate: string | null | undefined,
  role: string | undefined,
  authorName?: string,
): PlayerNoteThreadItem[] {
  const days = medicalCertificateDaysToExpiry(expiryDate);
  if (days == null || days < 0 || days > 60) return thread;
  const body = `Comunicazione automatica per dirigenti, staff e famiglia: certificato medico in scadenza tra ${days} giorni.`;
  const recipients: PlayerNoteRecipient[] = ["technical_director", "coach_staff"];
  const next = [...thread];
  const nowIso = new Date().toISOString();
  for (const recipient of recipients) {
    if (next.some((item) => item.recipient === recipient && item.body === body)) continue;
    next.push({
      id: `auto-medical-warning-${recipient}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      authorRole: role ?? "system",
      authorName,
      recipient,
      body,
      createdAt: nowIso,
      requiresResponse: false,
    });
  }
  return next;
}

function normalizeTeamLabel(value?: string | null): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function teamCategoryRank(value?: string | null): number {
  const text = normalizeTeamLabel(value);
  if (text.includes("piccoli amici")) return 0;
  if (text.includes("primi calci")) return 1;
  if (text.includes("pulcini")) return 2;
  if (text.includes("esordienti")) return 3;
  if (text.includes("giovanissimi")) return 4;
  if (text.includes("allievi") || text.includes("alievi")) return 5;
  if (text.includes("juniores") || text.includes("juniors")) return 6;
  if (text.includes("prima squadra")) return 7;
  return 99;
}

function teamYearRank(value?: string | null): number {
  const text = normalizeTeamLabel(value);
  if (/(^|\s)1\s*[^\s\w]*\s*(?:o\s*)?anno\b/.test(text) || /(^|\s)1\s*(?:°|º|o)(\s|$)/.test(text)) return 1;
  if (/(^|\s)2\s*[^\s\w]*\s*(?:o\s*)?anno\b/.test(text) || /(^|\s)2\s*(?:°|º|o)(\s|$)/.test(text)) return 2;
  return 99;
}

function compareTeamsByAnnata(a: TeamWithSeason, b: TeamWithSeason): number {
  const aLabel = String(a.category ?? a.name ?? "");
  const bLabel = String(b.category ?? b.name ?? "");
  const categoryDiff = teamCategoryRank(aLabel) - teamCategoryRank(bLabel);
  if (categoryDiff !== 0) return categoryDiff;
  const yearDiff = teamYearRank(aLabel) - teamYearRank(bLabel);
  if (yearDiff !== 0) return yearDiff;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "it", { numeric: true, sensitivity: "base" });
}

export default function PlayersList({ section }: PlayersListProps = {}) {
  const { t } = useLanguage();
  const { role, user, club } = useAuth();
  const nr = normalizeSessionRole(role);
  const [location] = useLocation();
  const initialTeamFilter = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("teamId") || "all"
    : "all";
  const [teamFilter, setTeamFilter] = useState<string>(initialTeamFilter);
  const { data: players, isLoading } = useListPlayers();
  const { data: teams } = useListTeams();
  const { data: seasons = [] } = useQuery<SeasonOption[]>({
    queryKey: ["/api/seasons"],
    queryFn: async () => {
      const res = await fetch(withApi("/api/seasons"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load seasons");
      return res.json();
    },
  });
  const { data: playerDocuments = [] } = useQuery<PlayerDocument[]>({
    queryKey: ["/api/player-documents"],
    queryFn: async () => {
      const res = await fetch(withApi("/api/player-documents"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load player documents");
      return res.json();
    },
  });
  const canViewFinancials = ["admin", "presidente", "director", "secretary"].includes(nr);
  const canViewKit = canViewFinancials || ["sporting_director", "technical_director", "coach", "fitness_coach", "athletic_director"].includes(nr);
  const { data: playerPayments = [] } = useQuery<PlayerPayment[]>({
    queryKey: ["/api/player-payments"],
    enabled: canViewFinancials,
    queryFn: async () => {
      const res = await fetch(withApi("/api/player-payments"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load player payments");
      return res.json();
    },
  });
  const { data: playerEquipment = [] } = useQuery<PlayerEquipment[]>({
    queryKey: ["/api/equipment"],
    enabled: canViewKit,
    queryFn: async () => {
      const res = await fetch(withApi("/api/equipment"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load player equipment");
      return res.json();
    },
  });
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [heightMin, setHeightMin] = useState("");
  const [heightMax, setHeightMax] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [playerDialogMode, setPlayerDialogMode] = useState<"view" | "edit">("view");
  const [openedFromQuery, setOpenedFromQuery] = useState(false);
  const [formSeasonFilter, setFormSeasonFilter] = useState<string>("all");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [noteDraftText, setNoteDraftText] = useState("");
  const [noteRecipient, setNoteRecipient] = useState<PlayerNoteRecipient>("secretary");
  const [noteRequiresResponse, setNoteRequiresResponse] = useState(false);
  const [noteReplyToId, setNoteReplyToId] = useState<string>("");
  const noteDraftRef = useRef<HTMLTextAreaElement | null>(null);
  const playerImageInputRef = useRef<HTMLInputElement | null>(null);
  const [lastDeletedPlayer, setLastDeletedPlayer] = useState<Player | null>(null);
  const [imageCropSource, setImageCropSource] = useState<string | null>(null);
  const [imageCropSize, setImageCropSize] = useState<{ width: number; height: number } | null>(null);
  const [imageCropZoom, setImageCropZoom] = useState(1);
  const [imageCropOffset, setImageCropOffset] = useState({ x: 0, y: 0 });
  const [imageCropDrag, setImageCropDrag] = useState<null | { x: number; y: number; startX: number; startY: number }>(null);
  const [imageBackground, setImageBackground] = useState<PlayerImageBackground>("white");
  const [imageRemoveBackground, setImageRemoveBackground] = useState(false);
  const [nameOrder, setNameOrder] = useState<PlayerNameOrder>("surname_first");
  const [documentType, setDocumentType] = useState("medicalCertificate");
  const [documentValidFrom, setDocumentValidFrom] = useState("");
  const [documentExpiryDate, setDocumentExpiryDate] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentNotes, setDocumentNotes] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [annualFeeTotal, setAnnualFeeTotal] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [firstInstallmentDueDate, setFirstInstallmentDueDate] = useState("");
  const [annualInstallments, setAnnualInstallments] = useState<InstallmentDraft[]>([]);
  const [isSavingInstallments, setIsSavingInstallments] = useState(false);
  const [kitRows, setKitRows] = useState<KitRow[]>(defaultKitRows);
  const [kitNotes, setKitNotes] = useState("");
  const [kitPaymentStatus, setKitPaymentStatus] = useState<"pending" | "paid">("pending");
  const [kitPaymentMethod, setKitPaymentMethod] = useState("");
  const [kitPaymentDueDate, setKitPaymentDueDate] = useState("");
  const [kitInstallmentCount, setKitInstallmentCount] = useState("1");
  const [shuttleMonthlyCost, setShuttleMonthlyCost] = useState("");
  const [shuttlePaymentDueDate, setShuttlePaymentDueDate] = useState("");
  const [isSavingKit, setIsSavingKit] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManagePlayers = nr === "secretary" || nr === "sporting_director";
  const canDeletePlayer = canManagePlayers;
  const canWritePlayerNotes = ["admin", "presidente", "director", "sporting_director", "technical_director", "coach", "fitness_coach", "athletic_director", "secretary"].includes(nr);
  const isLimitedEditor = !canManagePlayers && canWritePlayerNotes;
  const canEditFullPlayer = canManagePlayers && playerDialogMode === "edit";
  const canEditFinancials = nr === "secretary" && playerDialogMode === "edit";
  const canEditAvailability = canManagePlayers && playerDialogMode === "edit";
  const canEditRoleAndSquad = canManagePlayers && playerDialogMode === "edit";
  const canUploadPlayerImage = canManagePlayers && playerDialogMode === "edit";
  const canEditSupplementalTeam = canUploadPlayerImage;
  const canExport = nr === "admin" || nr === "secretary" || nr === "director" || nr === "technical_director";
  const isStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "technical_director" || nr === "athletic_director";
  const isAssignedStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";
  const clubLogoUrl = String((club as { logoUrl?: string | null } | null)?.logoUrl ?? "");
  const editingPlayerDocuments = editingPlayer
    ? playerDocuments.filter((doc) => doc.playerId === editingPlayer.id)
    : [];
  const editingPlayerPayments = editingPlayer
    ? playerPayments.filter((payment) => payment.playerId === editingPlayer.id)
    : [];
  const editingPlayerEquipment = editingPlayer
    ? playerEquipment.find((item) => item.playerId === editingPlayer.id)
    : undefined;
  const displayedKitRows = editingPlayerEquipment ? parseKitRows(editingPlayerEquipment.trainingKit) : kitRows;
  const kitTotal = displayedKitRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
  const editingKitPayments = editingPlayerPayments.filter((payment) => payment.paymentType === "kit_payment");
  const editingKitPayment = editingKitPayments[0];
  const editingShuttlePayments = editingPlayerPayments.filter((payment) => payment.paymentType === "shuttle_monthly");
  const editingShuttlePayment = editingShuttlePayments[0];
  const overduePlayerPayments = editingPlayerPayments.filter((payment) => {
    if (payment.status === "paid" || !payment.dueDate) return false;
    return payment.dueDate <= new Date().toISOString().slice(0, 10);
  });
  const editingMedicalCertificate = editingPlayerDocuments
    .filter((doc) => doc.type === "medicalCertificate")
    .sort((a, b) => String(b.expiryDate ?? "").localeCompare(String(a.expiryDate ?? "")))[0] ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("teamId") || "all";
    setTeamFilter(fromQuery);
  }, [location]);

  const typedTeams = section
    ? ((teams as TeamWithSeason[] | undefined) ?? []).filter((team) => team.clubSection === section)
    : ((teams as TeamWithSeason[] | undefined) ?? []);

  const uniqueSeasons = Array.from(
    new Map(
      [
        ...seasons.map(s => ({ id: s.id, name: s.name })),
        ...typedTeams
        .filter(t => t.seasonId != null)
        .map(t => ({ id: t.seasonId!, name: t.seasonName ?? `Stagione ${t.seasonId}` })),
      ]
        .filter(s => s.id != null)
        .map(s => [s.id, s])
    ).values()
  );

  const filteredFormTeams = formSeasonFilter === "all"
    ? typedTeams
    : typedTeams.filter(t => t.seasonId?.toString() === formSeasonFilter);

  const handleExportPlayers = () => {
    if (!players?.length) return;
    exportToExcel(mapPlayersForExcel(players as any[], teams as any[] ?? []), "Giocatori_FTB", "Giocatori");
  };

  const createTeamMutation = useCreateTeam();

  const createMutation = useCreatePlayer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/players"] });
        setIsCreateOpen(false);
        setFormSeasonFilter("all");
        toast({ title: t.addPlayer });
        form.reset();
      }
    }
  });

  const importPlayersWithTeams = async (rows: Record<string, unknown>[]) => {
    const sectionForNewTeams = section ?? "scuola_calcio";
    const teamByName = new Map<string, { id: number; name: string }>();
    ((teams as any[] | undefined) ?? []).forEach((team) => {
      const keys = [
        team.name,
        [team.category, team.ageGroup].filter(Boolean).join(" "),
      ].map(normalizeImportTeamName).filter(Boolean);
      keys.forEach((key) => teamByName.set(key, { id: team.id, name: team.name }));
    });

    const errors: string[] = [];
    let success = 0;
    let createdTeams = 0;
    let duplicates = 0;
    const existingFingerprints = new Set(
      ((players as any[] | undefined) ?? []).map((player) => playerImportFingerprint(player))
    );
    const fileFingerprints = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const rawTeamName = normalizeImportedTeamDisplayName(row["Squadra"]);
        const normalizedTeamName = normalizeImportTeamName(rawTeamName);
        let team = normalizedTeamName ? teamByName.get(normalizedTeamName) : undefined;

        if (!team && rawTeamName) {
          const created = await createTeamMutation.mutateAsync({
            data: {
              name: rawTeamName,
              category: rawTeamName,
              clubSection: sectionForNewTeams,
            } as any,
          });
          team = { id: (created as any).id, name: (created as any).name ?? rawTeamName };
          teamByName.set(normalizedTeamName, team);
          createdTeams++;
        }

        const mapped = mapExcelRowToPlayer(row, Array.from(teamByName.values())) as Record<string, unknown>;
        if (team) mapped.teamId = team.id;
        const fingerprint = playerImportFingerprint(mapped);
        if (existingFingerprints.has(fingerprint) || fileFingerprints.has(fingerprint)) {
          duplicates++;
          errors.push(`Riga ${i + 1}: duplicato ignorato`);
          continue;
        }
        fileFingerprints.add(fingerprint);
        await createMutation.mutateAsync({ data: mapped as any });
        existingFingerprints.add(fingerprint);
        success++;
      } catch {
        errors.push(`Riga ${i + 1}: errore durante l'importazione`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    if (createdTeams > 0) {
      toast({ title: `${createdTeams} squadre create automaticamente` });
    }
    if (duplicates > 0) {
      toast({ title: `${duplicates} duplicati ignorati` });
    }
    return { success, failed: errors.length, errors };
  };

  const updateMutation = useUpdatePlayer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/players"] });
        setEditingPlayer(null);
        toast({ title: t.editPlayer });
      },
      onError: () => toast({ title: "Error saving", variant: "destructive" })
    }
  });

  const deleteMutation = useDeletePlayer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/players"] });
        const deleted = lastDeletedPlayer;
        toast({
          title: t.deletePlayer,
          action: deleted ? (
            <ToastAction
              altText="Annulla eliminazione"
              onClick={() => {
                createMutation.mutate({
                  data: {
                    firstName: deleted.firstName,
                    lastName: deleted.lastName,
                    teamId: deleted.teamId ?? null,
                    position: deleted.position ?? undefined,
                    jerseyNumber: deleted.jerseyNumber ?? undefined,
                    status: deleted.status ?? "active",
                    dateOfBirth: deleted.dateOfBirth ?? undefined,
                    registered: deleted.registered ?? false,
                    registrationNumber: deleted.registrationNumber ?? undefined,
                  } as any,
                });
              }}
            >
              Annulla
            </ToastAction>
          ) : undefined,
        });
      }
    }
  });

  const resetDocumentForm = () => {
    setDocumentType("medicalCertificate");
    setDocumentValidFrom("");
    setDocumentExpiryDate("");
    setDocumentFile(null);
    setDocumentNotes("");
  };

  const uploadPlayerDocument = async () => {
    if (!editingPlayer || !canEditFullPlayer) return;
    if (!documentFile) {
      toast({ title: "Seleziona un file", variant: "destructive" });
      return;
    }
    if (documentFile.size > 8 * 1024 * 1024) {
      toast({ title: "File troppo grande", description: "Massimo 8MB.", variant: "destructive" });
      return;
    }
    setIsUploadingDocument(true);
    try {
      const fileData = await fileToDataUrl(documentFile);
      const res = await fetch(withApi("/api/player-documents"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: editingPlayer.id,
          type: documentType,
          validFrom: documentValidFrom || null,
          expiryDate: documentExpiryDate || null,
          notes: documentNotes || null,
          fileName: documentFile.name,
          fileType: documentFile.type || "application/octet-stream",
          fileSize: documentFile.size,
          fileData,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (documentType === "medicalCertificate") {
        editForm.setValue("medicalCertificateExpiry", documentExpiryDate || null, { shouldDirty: true });
        if (documentExpiryDate) {
          await updateMutation.mutateAsync({
            id: editingPlayer.id,
            data: { medicalCertificateExpiry: documentExpiryDate } as any,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/player-documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      resetDocumentForm();
      toast({ title: "Documento caricato" });
    } catch {
      toast({ title: "Errore upload documento", variant: "destructive" });
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const deletePlayerDocument = async (docId: number) => {
    if (!canEditFullPlayer) return;
    const res = await fetch(withApi(`/api/player-documents/${docId}`), {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast({ title: "Errore eliminazione documento", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/player-documents"] });
    toast({ title: "Documento eliminato" });
  };

  const createAnnualFeeInstallments = async () => {
    if (!editingPlayer || !canEditFinancials) return;
    const total = Number(annualFeeTotal);
    const count = Math.max(1, Math.floor(Number(installmentCount) || 1));
    if (!Number.isFinite(total) || total <= 0) {
      toast({ title: "Inserisci una quota valida", variant: "destructive" });
      return;
    }
    const baseDate = firstInstallmentDueDate ? new Date(`${firstInstallmentDueDate}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      toast({ title: "Scadenza non valida", variant: "destructive" });
      return;
    }
    setIsSavingInstallments(true);
    try {
      const drafts = annualInstallments.length ? annualInstallments : buildInstallmentDrafts(annualFeeTotal, installmentCount, firstInstallmentDueDate);
      for (let index = 0; index < drafts.length; index++) {
        const draft = drafts[index];
        const installmentAmount = Number(draft.amount);
        const res = await fetch(withApi("/api/player-payments"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: editingPlayer.id,
            amount: installmentAmount,
            dueDate: draft.dueDate || null,
            status: "pending",
            description: `Quota annuale - rata ${index + 1}/${drafts.length}`,
            paymentType: "annual_fee_installment",
            installmentNumber: index + 1,
            totalInstallments: drafts.length,
            annualFeeTotal: total,
            availabilityBlocking: 1,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setAnnualFeeTotal("");
      setInstallmentCount("1");
      setFirstInstallmentDueDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Rate quota create" });
    } catch {
      toast({ title: "Errore creazione rate", variant: "destructive" });
    } finally {
      setIsSavingInstallments(false);
    }
  };

  const updateKitRow = (key: string, patch: Partial<KitRow>) => {
    setKitRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const savePlayerKit = async () => {
    if (!editingPlayer || !canEditFinancials) return;
    setIsSavingKit(true);
    try {
      const res = await fetch(withApi("/api/equipment"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: editingPlayer.id,
          kitAssigned: editingPlayer.jerseyNumber ? String(editingPlayer.jerseyNumber) : null,
          trainingKit: serializeKitRows(kitRows),
          matchKit: serializeKitRows(kitRows.filter((row) => row.area === "match")),
          notes: kitNotes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const total = kitRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
      if (total > 0) {
        for (const payment of editingKitPayments) {
          const deleteRes = await fetch(withApi(`/api/player-payments/${payment.id}`), { method: "DELETE", credentials: "include" });
          if (!deleteRes.ok) throw new Error(await deleteRes.text());
        }
        const count = Math.max(1, Math.floor(Number(kitInstallmentCount) || 1));
        const cents = Math.round(total * 100);
        const baseCents = Math.floor(cents / count);
        let assignedCents = 0;
        const baseDate = kitPaymentDueDate ? new Date(`${kitPaymentDueDate}T00:00:00`) : new Date();
        for (let index = 0; index < count; index++) {
          const due = new Date(baseDate);
          due.setMonth(baseDate.getMonth() + index);
          const installmentCents = index === count - 1 ? cents - assignedCents : baseCents;
          assignedCents += installmentCents;
          const paymentRes = await fetch(withApi("/api/player-payments"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: editingPlayer.id,
              amount: installmentCents / 100,
              dueDate: due.toISOString().slice(0, 10),
              status: kitPaymentStatus,
              paymentDate: kitPaymentStatus === "paid" ? new Date().toISOString().slice(0, 10) : null,
              description: count > 1 ? `Kit giocatore - rata ${index + 1}/${count}` : "Kit giocatore",
              paymentType: "kit_payment",
              paymentMethod: kitPaymentMethod || null,
              installmentNumber: index + 1,
              totalInstallments: count,
              annualFeeTotal: total,
              availabilityBlocking: 1,
            }),
          });
          if (!paymentRes.ok) throw new Error(await paymentRes.text());
        }
      }
      if (editForm.getValues("shuttleService") === true && Number(shuttleMonthlyCost) > 0) {
        const shuttlePayload = {
          playerId: editingPlayer.id,
          amount: Number(shuttleMonthlyCost),
          dueDate: shuttlePaymentDueDate || null,
          status: "pending",
          description: "Pulmino - quota mensile",
          paymentType: "shuttle_monthly",
          availabilityBlocking: 1,
        };
        const shuttleRes = await fetch(withApi(editingShuttlePayment ? `/api/player-payments/${editingShuttlePayment.id}` : "/api/player-payments"), {
          method: editingShuttlePayment ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(shuttlePayload),
        });
        if (!shuttleRes.ok) throw new Error(await shuttleRes.text());
      }
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Kit giocatore salvato" });
    } catch {
      toast({ title: "Errore salvataggio kit", variant: "destructive" });
    } finally {
      setIsSavingKit(false);
    }
  };

  const handleBulkDeletePlayers = async () => {
    const ids = selectedPlayerIds.filter((id) => (filteredPlayers ?? []).some((player) => player.id === id));
    if (!ids.length || !canDeletePlayer) return;
    if (!confirm(`Eliminare ${ids.length} giocatori selezionati?`)) return;
    setLastDeletedPlayer(null);
    for (const id of ids) {
      await deleteMutation.mutateAsync({ id });
    }
    setSelectedPlayerIds([]);
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
  };

  const form = useForm<z.infer<typeof playerSchema>>({
    resolver: zodResolver(playerSchema),
    defaultValues: { firstName: "", lastName: "", status: "active", registered: false, phoneOwnerType: "player", shuttleService: false }
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  const watchAvailable = editForm.watch("available");
  const watchRegisteredEdit = editForm.watch("registered");
  const watchRegisteredCreate = form.watch("registered");
  const watchPhoneOwnerCreate = form.watch("phoneOwnerType");
  const watchPhoneOwnerEdit = editForm.watch("phoneOwnerType");
  const watchMedicalCertificateEdit = editForm.watch("medicalCertificateExpiry");
  const watchMedicalCertificateCreate = form.watch("medicalCertificateExpiry");
  const editAvailabilityBlocks = getAvailabilityBlocks(watchRegisteredEdit, watchMedicalCertificateEdit);

  useEffect(() => {
    if (getAvailabilityBlocks(watchRegisteredEdit, watchMedicalCertificateEdit).length > 0) {
      editForm.setValue("available", false);
    }
  }, [watchRegisteredEdit, watchMedicalCertificateEdit, editForm]);

  useEffect(() => {
    if (getAvailabilityBlocks(watchRegisteredCreate, watchMedicalCertificateCreate).length > 0) {
      form.setValue("available" as any, false);
    }
  }, [watchRegisteredCreate, watchMedicalCertificateCreate, form]);

  useEffect(() => {
    setAnnualInstallments(buildInstallmentDrafts(annualFeeTotal, installmentCount, firstInstallmentDueDate));
  }, [annualFeeTotal, installmentCount, firstInstallmentDueDate]);

  useEffect(() => {
    if (!editingPlayer) {
      setKitRows(defaultKitRows());
      setKitNotes("");
      setKitPaymentStatus("pending");
      setKitPaymentMethod("");
      setKitPaymentDueDate("");
      setKitInstallmentCount("1");
      setShuttleMonthlyCost("");
      setShuttlePaymentDueDate("");
      return;
    }
    setKitRows(parseKitRows(editingPlayerEquipment?.trainingKit));
    setKitNotes(editingPlayerEquipment?.notes ?? "");
    setKitPaymentStatus(editingKitPayment?.status === "paid" ? "paid" : "pending");
    setKitPaymentMethod(editingKitPayment?.paymentMethod ?? "");
    setKitPaymentDueDate(editingKitPayment?.dueDate ?? "");
    setKitInstallmentCount(String(editingKitPayment?.totalInstallments ?? Math.max(editingKitPayments.length, 1)));
    setShuttleMonthlyCost(editingShuttlePayment?.amount != null ? String(editingShuttlePayment.amount) : "");
    setShuttlePaymentDueDate(editingShuttlePayment?.dueDate ?? "");
  }, [editingPlayer, editingPlayerEquipment?.trainingKit, editingPlayerEquipment?.notes, editingKitPayment?.status, editingKitPayment?.paymentMethod, editingKitPayment?.dueDate, editingKitPayment?.totalInstallments, editingKitPayments.length, editingShuttlePayment?.amount, editingShuttlePayment?.dueDate]);

  const openPlayerDialog = (player: Player, mode: "view" | "edit" = "view") => {
    setPlayerDialogMode(mode);
    setEditingPlayer(player);
    const { notesRaw, meta } = splitPlayerMeta(player.notes ?? "");
    const parsedNotes = splitPlayerNotes(notesRaw);
    setNoteDraftText("");
    setNoteReplyToId("");
    setNoteRequiresResponse(false);
    setNoteRecipient("secretary");
    resetDocumentForm();
    setKitRows(parseKitRows(playerEquipment.find((item) => item.playerId === player.id)?.trainingKit));
    setKitNotes(playerEquipment.find((item) => item.playerId === player.id)?.notes ?? "");
    const kitPayment = playerPayments.find((payment) => payment.playerId === player.id && payment.paymentType === "kit_payment");
    setKitPaymentStatus(kitPayment?.status === "paid" ? "paid" : "pending");
    setKitPaymentMethod(kitPayment?.paymentMethod ?? "");
    setKitPaymentDueDate(kitPayment?.dueDate ?? "");
    setKitInstallmentCount(String(kitPayment?.totalInstallments ?? Math.max(playerPayments.filter((payment) => payment.playerId === player.id && payment.paymentType === "kit_payment").length, 1)));
    const shuttlePayment = playerPayments.find((payment) => payment.playerId === player.id && payment.paymentType === "shuttle_monthly");
    setShuttleMonthlyCost(shuttlePayment?.amount != null ? String(shuttlePayment.amount) : "");
    setShuttlePaymentDueDate(shuttlePayment?.dueDate ?? "");
    editForm.reset({
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId ?? undefined,
      position: player.position ?? undefined,
      jerseyNumber: player.jerseyNumber ?? undefined,
      status: player.status,
      dateOfBirth: player.dateOfBirth ?? undefined,
      phone: player.phone ?? undefined,
      email: player.email ?? undefined,
      phoneOwnerType: player.phoneOwnerType ?? "player",
      parentFirstName: player.parentFirstName ?? undefined,
      parentLastName: player.parentLastName ?? undefined,
      parentPhone: player.parentPhone ?? undefined,
      parentEmail: player.parentEmail ?? undefined,
      parentRelation: player.parentRelation ?? undefined,
      secondaryContactFirstName: player.secondaryContactFirstName ?? undefined,
      secondaryContactLastName: player.secondaryContactLastName ?? undefined,
      secondaryContactPhone: player.secondaryContactPhone ?? undefined,
      secondaryContactEmail: player.secondaryContactEmail ?? undefined,
      secondaryContactRelation: player.secondaryContactRelation ?? undefined,
      registered: player.registered ?? false,
      registrationNumber: player.registrationNumber ?? undefined,
      medicalCertificateExpiry: player.medicalCertificateExpiry ?? undefined,
      shuttleService: player.shuttleService ?? false,
      nationality: player.nationality ?? undefined,
      height: player.height ?? undefined,
      weight: player.weight ?? undefined,
      notes: composePlayerNotes(parsedNotes.plainNote, parsedNotes.thread) ?? undefined,
      available: player.available ?? true,
      unavailabilityReason: player.unavailabilityReason ?? undefined,
      expectedReturn: player.expectedReturn ?? undefined,
      squad: player.squad ?? meta.squad ?? null,
      imageUrl: player.imageUrl ?? meta.imageUrl ?? null,
      supplementalTeamId: meta.supplementalTeamId ?? null,
    });
  };

  const openImageCropper = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (!value) return;
      setImageCropSource(value);
      setImageCropSize(null);
      setImageCropZoom(1);
      setImageCropOffset({ x: 0, y: 0 });
      setImageCropDrag(null);
      setImageBackground("white");
      setImageRemoveBackground(false);
    };
    reader.readAsDataURL(file);
  };

  const closeImageCropper = () => {
    setImageCropSource(null);
    setImageCropSize(null);
    setImageCropDrag(null);
  };

  const applyImageCrop = async () => {
    if (!imageCropSource) return;
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Immagine non valida"));
      image.src = src;
    });
    const image = await loadImage(imageCropSource);

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    if (imageBackground === "club_logo" && clubLogoUrl) {
      try {
        const logo = await loadImage(clubLogoUrl);
        ctx.globalAlpha = 0.12;
        const logoScale = Math.min(size * 0.62 / logo.width, size * 0.62 / logo.height);
        const logoWidth = logo.width * logoScale;
        const logoHeight = logo.height * logoScale;
        ctx.drawImage(logo, (size - logoWidth) / 2, (size - logoHeight) / 2, logoWidth, logoHeight);
        ctx.globalAlpha = 1;
      } catch {
        ctx.globalAlpha = 1;
      }
    }

    const baseScale = Math.max(size / image.width, size / image.height);
    const scale = baseScale * imageCropZoom;
    const width = image.width * scale;
    const height = image.height * scale;
    const previewToOutput = size / 320;

    const personCanvas = document.createElement("canvas");
    personCanvas.width = size;
    personCanvas.height = size;
    const personCtx = personCanvas.getContext("2d");
    if (!personCtx) return;
    personCtx.drawImage(
      image,
      (size - width) / 2 + imageCropOffset.x * previewToOutput,
      (size - height) / 2 + imageCropOffset.y * previewToOutput,
      width,
      height,
    );
    if (imageRemoveBackground) {
      const data = personCtx.getImageData(0, 0, size, size);
      personCtx.putImageData(removeUniformImageBackground(data), 0, 0);
    }
    ctx.drawImage(personCanvas, 0, 0);

    editForm.setValue("imageUrl", canvas.toDataURL("image/jpeg", 0.88), { shouldDirty: true });
    closeImageCropper();
  };

  const getReplyRecipient = (authorRole?: string): PlayerNoteRecipient => {
    const r = normalizeSessionRole(authorRole);
    if (r === "secretary") return "secretary";
    if (r === "technical_director") return "technical_director";
    return "coach_staff";
  };

  useEffect(() => {
    if (openedFromQuery || editingPlayer) return;
    const list = (players as Player[] | undefined) ?? [];
    if (list.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const openPlayerId = Number(params.get("openPlayerId") ?? 0);
    if (!Number.isFinite(openPlayerId) || openPlayerId <= 0) return;
    const target = list.find((p) => p.id === openPlayerId);
    if (!target) return;
    openPlayerDialog(target, "view");
    setOpenedFromQuery(true);
    if (params.get("focus") === "notes") {
      window.setTimeout(() => {
        const el = document.querySelector('textarea[placeholder="Scrivi una comunicazione sul giocatore..."]');
        if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
    params.delete("openPlayerId");
    params.delete("focus");
    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, [openedFromQuery, editingPlayer, players]);

  const handleEditSubmit = (data: EditForm) => {
    if (!editingPlayer) return;
    const registered = data.registered === true;
    const availabilityBlocks = getAvailabilityBlocks(registered, data.medicalCertificateExpiry);
    const authorName = `${(user as any)?.firstName ?? ""} ${(user as any)?.lastName ?? ""}`.trim() || undefined;
    const { notesRaw: notesWithoutMeta } = splitPlayerMeta(data.notes ?? "");
    const parsed = splitPlayerNotes(notesWithoutMeta);
    let thread = [...parsed.thread];
    const draftText = noteDraftText.trim();
    if (draftText && canWritePlayerNotes) {
      const nowIso = new Date().toISOString();
      if (noteReplyToId) {
        const idx = thread.findIndex((n) => n.id === noteReplyToId);
        if (idx >= 0) {
          thread[idx] = { ...thread[idx], repliedAt: nowIso };
        }
      }
      thread.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        authorRole: role ?? "unknown",
        authorName,
        recipient: noteRecipient,
        body: draftText,
        createdAt: nowIso,
        requiresResponse: noteRequiresResponse,
        replyToId: noteReplyToId || undefined,
      });
    }
    if (availabilityBlocks.length > 0 && canManagePlayers && playerDialogMode === "edit") {
      thread = addAutomaticAvailabilityNotes(thread, availabilityBlocks, role ?? undefined, authorName);
    }
    if (availabilityBlocks.length === 0 && canManagePlayers && playerDialogMode === "edit") {
      thread = addAutomaticMedicalCertificateWarningNotes(thread, data.medicalCertificateExpiry, role ?? undefined, authorName);
    }

    const payload: Record<string, unknown> = {
      ...data,
      registered,
      notes: composePlayerMeta(
        composePlayerNotes(parsed.plainNote, thread),
        {
          squad: data.squad ?? null,
          imageUrl: data.imageUrl ?? null,
          supplementalTeamId: data.supplementalTeamId ?? null,
        }
      ),
    };
    delete payload.supplementalTeamId;
    if (availabilityBlocks.length > 0) {
      payload.available = false;
      payload.unavailabilityReason = "other";
      payload.expectedReturn = null;
    }
    if (payload.status === "injured") {
      payload.available = false;
      payload.unavailabilityReason = "injury";
    }
    if (payload.available && availabilityBlocks.length === 0) {
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }

    if (playerDialogMode === "view" || isLimitedEditor) {
      const limitedPayload: Record<string, unknown> = {
        notes: payload.notes,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: limitedPayload as any });
    } else {
      updateMutation.mutate({ id: editingPlayer.id, data: payload as any });
    }

  };

  const activeFilterCount = [
    positionFilter !== "all",
    availabilityFilter !== "all",
    statusFilter !== "all",
    heightMin !== "",
    heightMax !== "",
  ].filter(Boolean).length;

  const playersMatchingFilters = (players as Player[] | undefined)?.filter(p => {
    const normalizedSearch = search.toLowerCase();
    const searchMatch = playerName(p, "name_first").toLowerCase().includes(normalizedSearch) ||
      playerName(p, "surname_first").toLowerCase().includes(normalizedSearch) ||
      (p.position?.toLowerCase().includes(search.toLowerCase()) ?? false);
    if (!searchMatch) return false;
    if (positionFilter !== "all" && p.position !== positionFilter) return false;
    if (availabilityFilter === "available" && p.available === false) return false;
    if (availabilityFilter === "unavailable" && p.available !== false) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (heightMin !== "") {
      if (!p.height || p.height < Number(heightMin)) return false;
    }
    if (heightMax !== "") {
      if (!p.height || p.height > Number(heightMax)) return false;
    }
    return true;
  });

  const filteredPlayers = playersMatchingFilters?.filter(p => {
    if (teamFilter === "all") return true;
    if (teamFilter === "unassigned") return !p.teamId;
    return Number(p.teamId ?? 0) === Number(teamFilter);
  }).sort(comparePlayersBySurname);
  const filteredPlayerIds = (filteredPlayers ?? []).map((player) => player.id);
  const selectedVisiblePlayerIds = selectedPlayerIds.filter((id) => filteredPlayerIds.includes(id));
  const allVisiblePlayersSelected = filteredPlayerIds.length > 0 && selectedVisiblePlayerIds.length === filteredPlayerIds.length;

  const teamsByAnnata = [...typedTeams].sort(compareTeamsByAnnata);
  const playersByTeam = new Map<number, Player[]>();
  (playersMatchingFilters ?? []).forEach((player) => {
    const teamId = Number(player.teamId ?? 0);
    if (!teamId) return;
    const list = playersByTeam.get(teamId) ?? [];
    list.push(player);
    playersByTeam.set(teamId, list);
  });
  playersByTeam.forEach((list) => {
    list.sort(comparePlayersBySurname);
  });
  const unassignedPlayers = (playersMatchingFilters ?? [])
    .filter((player) => !player.teamId)
    .sort(comparePlayersBySurname);

  const statusLabel = (status: string) => {
    if (status === "active") return t.active;
    if (status === "injured") return t.injured;
    if (status === "inactive") return t.inactive;
    return status;
  };

  return (
    <div className="max-w-full space-y-8 overflow-hidden animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">{t.playersDirectory}</h1>
          <p className="text-muted-foreground mt-1">{t.playersDesc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <>
              <ImportExcelDialog
                label="Importa Excel"
                templateLabel="Esporta modello"
                previewColumns={[
                  { key: "Nome", label: "Nome" },
                  { key: "Cognome", label: "Cognome" },
                  { key: "Squadra", label: "Squadra" },
                  { key: "Posizione", label: "Posizione" },
                  { key: "N° Maglia", label: "N° Maglia" },
                  { key: "Data di Nascita", label: "Data Nascita" },
                  { key: "Telefono", label: "Telefono" },
                  { key: "Email", label: "Email" },
                  { key: "Telefono riferito a", label: "Tel. riferito a" },
                  { key: "Nome Genitore", label: "Nome Genitore" },
                  { key: "Cognome Genitore", label: "Cognome Genitore" },
                  { key: "Telefono Genitore", label: "Tel. Genitore" },
                  { key: "Email Genitore", label: "Email Genitore" },
                  { key: "Relazione Genitore", label: "Relazione" },
                  { key: "Nome Secondo Referente", label: "Nome 2Â° referente" },
                  { key: "Cognome Secondo Referente", label: "Cognome 2Â° referente" },
                  { key: "Telefono Secondo Referente", label: "Tel. 2Â° referente" },
                  { key: "Email Secondo Referente", label: "Email 2Â° referente" },
                  { key: "Relazione Secondo Referente", label: "Relazione 2Â°" },
                  { key: "Tesserato", label: "Tesserato" },
                ]}
                onDownloadTemplate={downloadPlayerTemplate}
                onParseRow={(row) => mapExcelRowToPlayerPreview(row, (teams as any[] ?? [])) as Record<string, unknown>}
                isValidRow={isValidPlayerRow}
                onImportValidRows={importPlayersWithTeams}
                onImportRows={async ([row]) => {
                  await createMutation.mutateAsync({ data: row as any });
                  queryClient.invalidateQueries({ queryKey: ["/api/players"] });
                }}
              />
              <Button variant="outline" onClick={downloadPlayerTemplate} className="gap-2">
                <FileDown className="w-4 h-4" />
                Esporta modello
              </Button>
              <Button variant="outline" onClick={handleExportPlayers} disabled={!players?.length} className="gap-2">
                <FileDown className="w-4 h-4" />
                Esporta Excel
              </Button>
            </>
          )}
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) { setFormSeasonFilter("all"); form.reset(); } }}>
          {canManagePlayers && (
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <Plus className="w-5 h-5 mr-2" />
              {t.addPlayer}
            </Button>
          </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <DialogTitle>{t.addNewPlayer}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => {
              const registered = data.registered === true;
              const availabilityBlocks = getAvailabilityBlocks(registered, data.medicalCertificateExpiry);
              const payload = { ...data, registered } as Record<string, unknown>;
              if (availabilityBlocks.length > 0) {
                payload.available = false;
                payload.unavailabilityReason = "other";
                payload.expectedReturn = null;
              }
              createMutation.mutate({ data: payload as any });
            })} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t.firstName} <span className="text-destructive">*</span></Label>
                  <Input id="firstName" {...form.register("firstName")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t.lastName} <span className="text-destructive">*</span></Label>
                  <Input id="lastName" {...form.register("lastName")} />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  const firstName = form.getValues("firstName") ?? "";
                  const lastName = form.getValues("lastName") ?? "";
                  form.setValue("firstName", lastName, { shouldDirty: true });
                  form.setValue("lastName", firstName, { shouldDirty: true });
                }}
              >
                Scambia nome/cognome
              </Button>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">{t.dateOfBirth}</Label>
                  <Input id="dateOfBirth" type="date" {...form.register("dateOfBirth")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="position">{t.position}</Label>
                  <Select onValueChange={(v) => form.setValue("position", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GK">{t.goalkeeper}</SelectItem>
                      <SelectItem value="DEF">{t.defender}</SelectItem>
                      <SelectItem value="MID">{t.midfielder}</SelectItem>
                      <SelectItem value="FWD">{t.forward}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jerseyNumber">{t.jerseyNumber}</Label>
                  <Input id="jerseyNumber" type="number" {...form.register("jerseyNumber")} />
                </div>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contatti</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefono</Label>
                    <Input id="phone" {...form.register("phone")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email giocatore</Label>
                    <Input id="email" type="email" {...form.register("email")} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Telefono riferito a</Label>
                    <Controller
                      control={form.control}
                      name="phoneOwnerType"
                      render={({ field }) => (
                        <Select value={field.value || "player"} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="player">Giocatore</SelectItem>
                            <SelectItem value="parent">Genitore/Tutore</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                {watchPhoneOwnerCreate === "parent" && (
                  <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome genitore</Label>
                      <Input {...form.register("parentFirstName")} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cognome genitore</Label>
                      <Input {...form.register("parentLastName")} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefono genitore</Label>
                      <Input {...form.register("parentPhone")} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email genitore</Label>
                      <Input type="email" {...form.register("parentEmail")} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Relazione</Label>
                      <Input placeholder="Padre, madre, tutore..." {...form.register("parentRelation")} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome secondo referente</Label>
                    <Input {...form.register("secondaryContactFirstName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cognome secondo referente</Label>
                    <Input {...form.register("secondaryContactLastName")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefono secondo referente</Label>
                    <Input {...form.register("secondaryContactPhone")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email secondo referente</Label>
                    <Input type="email" {...form.register("secondaryContactEmail")} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Relazione secondo referente</Label>
                    <Input placeholder="Nonno, baby sitter, tutore, altro..." {...form.register("secondaryContactRelation")} />
                  </div>
                </div>
              </div>

              {/* Annata + Squadra */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assegnazione squadra</p>
                {uniqueSeasons.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Annata di riferimento</Label>
                    <Select value={formSeasonFilter} onValueChange={(v) => { setFormSeasonFilter(v); form.setValue("teamId", null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tutte le annate" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte le annate</SelectItem>
                        {uniqueSeasons.map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm">{t.assignToTeam}</Label>
                  <Controller
                    control={form.control}
                    name="teamId"
                    render={({ field }) => (
                      <Select onValueChange={(val) => field.onChange(parseInt(val))} value={field.value?.toString() || ""}>
                        <SelectTrigger>
                          <SelectValue placeholder={t.noTeamAssigned} />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredFormTeams.map(team => (
                            <SelectItem key={team.id} value={team.id.toString()}>
                              {team.name}
                              {team.seasonName ? <span className="text-muted-foreground ml-1">— {team.seasonName}</span> : null}
                            </SelectItem>
                          ))}
                          {filteredFormTeams.length === 0 && (
                            <div className="px-2 py-3 text-sm text-muted-foreground text-center">Nessuna squadra per questa annata</div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">{t.registrationNumber}</Label>
                  <Input id="registrationNumber" {...form.register("registrationNumber")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medicalCertificateExpiry">Certificato medico</Label>
                  <Input id="medicalCertificateExpiry" type="date" {...form.register("medicalCertificateExpiry")} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center gap-3 pt-7">
                  <Controller
                    control={form.control}
                    name="registered"
                    render={({ field }) => (
                      <Checkbox
                        id="registered"
                        checked={field.value === true}
                        onCheckedChange={(c) => field.onChange(c === true)}
                      />
                    )}
                  />
                  <Label htmlFor="registered" className="cursor-pointer">{t.registered}</Label>
                </div>
                <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                  <Controller
                    control={form.control}
                    name="shuttleService"
                    render={({ field }) => (
                      <Checkbox
                        id="shuttleService"
                        checked={field.value === true}
                        onCheckedChange={(c) => field.onChange(c === true)}
                      />
                    )}
                  />
                  <Label htmlFor="shuttleService" className="cursor-pointer">Usufruisce pulmino</Label>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createMutation.isPending} className="w-full sm:w-auto">
                  {createMutation.isPending ? t.saving : t.savePlayer}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingPlayer} onOpenChange={(o) => !o && setEditingPlayer(null)}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{playerDialogMode === "edit" ? t.editPlayer : "Scheda giocatore"}</DialogTitle>
          </DialogHeader>
          {editingPlayer && (
            playerDialogMode === "view" ? (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 pt-2">
              <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center">
                {editForm.watch("imageUrl") ? (
                  <img src={editForm.watch("imageUrl") ?? ""} alt="Giocatore" className="h-32 w-32 shrink-0 rounded-lg border bg-background object-cover shadow-sm sm:h-36 sm:w-36" />
                ) : (
                  <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm sm:h-36 sm:w-36">
                    <User className="h-14 w-14" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold leading-tight sm:text-2xl">{playerName(editingPlayer, nameOrder)}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary">{editingPlayer.teamName || t.unassigned}</Badge>
                    <Badge variant="outline">{editingPlayer.position || "Ruolo N/D"}</Badge>
                    {editingPlayer.jerseyNumber ? <Badge variant="outline">#{editingPlayer.jerseyNumber}</Badge> : null}
                    <Badge variant={watchAvailable === false ? "destructive" : "secondary"}>
                      {watchAvailable === false ? t.notAvailable : t.available}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div>
                  <Label className="text-sm font-semibold">Comunicazioni</Label>
                  <p className="text-xs text-muted-foreground">Puoi inviare una nota o rispondere a una richiesta.</p>
                </div>
                {(() => {
                  const parsed = splitPlayerNotes(editForm.watch("notes") ?? "");
                  const pendingForCurrentUser = parsed.thread.filter((n) =>
                    !!n.requiresResponse &&
                    !n.repliedAt &&
                    (
                      (n.recipient === "secretary" && (nr === "secretary" || nr === "sporting_director")) ||
                      (n.recipient === "technical_director" && nr === "technical_director") ||
                      (n.recipient === "coach_staff" && ["coach", "fitness_coach", "athletic_director"].includes(nr))
                    )
                  );
                  return (
                    <div className="space-y-2">
                      {parsed.thread.length > 0 && (
                        <div className="space-y-1 rounded border bg-muted/20 p-2">
                          {parsed.thread.slice(-3).map((n) => (
                            <div key={n.id} className={`text-xs rounded border px-2 py-1 bg-background ${noteReplyToId === n.id ? "border-primary ring-1 ring-primary/30" : ""}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{n.authorName || n.authorRole}</span>
                                <span className="text-muted-foreground">{new Date(n.createdAt).toLocaleString("it-IT")}</span>
                              </div>
                              <div className="text-muted-foreground mt-0.5">
                                A: {n.recipient === "secretary" ? "Segreteria/DS" : n.recipient === "technical_director" ? "Direttore tecnico" : "Allenatori/Preparatori"}
                              </div>
                              <p className="mt-1">{n.body}</p>
                              {n.requiresResponse && !n.repliedAt && <Badge variant="outline" className="mt-1 text-[10px]">In attesa risposta</Badge>}
                              {n.repliedAt && <Badge variant="secondary" className="mt-1 text-[10px]">Risposta ricevuta</Badge>}
                              {!!n.requiresResponse && !n.repliedAt && canWritePlayerNotes && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] mt-1"
                                  onClick={() => {
                                    setNoteReplyToId(n.id);
                                    setNoteRecipient(getReplyRecipient(n.authorRole));
                                    setNoteRequiresResponse(false);
                                    window.setTimeout(() => noteDraftRef.current?.focus(), 0);
                                  }}
                                >
                                  {noteReplyToId === n.id ? "Risposta selezionata" : "Rispondi"}
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canWritePlayerNotes && (
                        <div className="space-y-2 rounded border bg-background p-2">
                          <Textarea
                            ref={noteDraftRef}
                            value={noteDraftText}
                            onChange={(e) => setNoteDraftText(e.target.value)}
                            spellCheck={false}
                            placeholder="Scrivi una comunicazione sul giocatore..."
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Select value={noteRecipient} onValueChange={(v) => setNoteRecipient(v as PlayerNoteRecipient)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="secretary">Segreteria/DS</SelectItem>
                                <SelectItem value="technical_director">Direttore tecnico</SelectItem>
                                <SelectItem value="coach_staff">Allenatori/Preparatori</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2 px-2">
                              <Checkbox checked={noteRequiresResponse} onCheckedChange={(v) => setNoteRequiresResponse(v === true)} />
                              <Label className="text-xs">Richiesta risposta</Label>
                            </div>
                          </div>
                          {pendingForCurrentUser.length > 0 && (
                            <p className="text-[11px] text-amber-700">Hai {pendingForCurrentUser.length} richieste di risposta in attesa.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Dati principali</summary>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Nato il</span><p>{editingPlayer.dateOfBirth || "-"}</p></div>
                  <div><span className="text-muted-foreground">Nazionalita</span><p>{editingPlayer.nationality || "-"}</p></div>
                  <div><span className="text-muted-foreground">Altezza</span><p>{editingPlayer.height ? `${editingPlayer.height} cm` : "-"}</p></div>
                  <div><span className="text-muted-foreground">Peso</span><p>{editingPlayer.weight ? `${editingPlayer.weight} kg` : "-"}</p></div>
                  <div><span className="text-muted-foreground">Tesseramento</span><p>{editingPlayer.registered ? t.registered : "-"}</p></div>
                  <div><span className="text-muted-foreground">Numero matricola</span><p>{editingPlayer.registrationNumber || "-"}</p></div>
                  <div><span className="text-muted-foreground">Certificato medico</span><p>{isMedicalCertificateValid(editingPlayer.medicalCertificateExpiry) ? `Valido fino al ${editingPlayer.medicalCertificateExpiry}` : "Assente o scaduto"}</p></div>
                  <div><span className="text-muted-foreground">Pulmino</span><p>{editingPlayer.shuttleService ? "Si" : "No"}</p></div>
                  <div><span className="text-muted-foreground">Stato</span><p>{statusLabel(editingPlayer.status)}</p></div>
                  <div><span className="text-muted-foreground">Telefono</span><p>{editingPlayer.phone || "-"}</p></div>
                  <div><span className="text-muted-foreground">Email</span><p>{editingPlayer.email || "-"}</p></div>
                  {(editingPlayer.phoneOwnerType === "parent" || Boolean(editingPlayer.parentFirstName || editingPlayer.parentLastName || editingPlayer.parentPhone || editingPlayer.parentEmail || editingPlayer.parentRelation)) && (
                    <>
                      <div><span className="text-muted-foreground">Genitore/Tutore</span><p>{[editingPlayer.parentFirstName, editingPlayer.parentLastName].filter(Boolean).join(" ") || "-"}</p></div>
                      <div><span className="text-muted-foreground">Relazione</span><p>{editingPlayer.parentRelation || "-"}</p></div>
                      <div><span className="text-muted-foreground">Telefono genitore</span><p>{editingPlayer.parentPhone || "-"}</p></div>
                      <div><span className="text-muted-foreground">Email genitore</span><p>{editingPlayer.parentEmail || "-"}</p></div>
                    </>
                  )}
                  <div><span className="text-muted-foreground">Secondo referente</span><p>{[editingPlayer.secondaryContactFirstName, editingPlayer.secondaryContactLastName].filter(Boolean).join(" ") || "-"}</p></div>
                  <div><span className="text-muted-foreground">Relazione secondo referente</span><p>{editingPlayer.secondaryContactRelation || "-"}</p></div>
                  <div><span className="text-muted-foreground">Telefono secondo referente</span><p>{editingPlayer.secondaryContactPhone || "-"}</p></div>
                  <div><span className="text-muted-foreground">Email secondo referente</span><p>{editingPlayer.secondaryContactEmail || "-"}</p></div>
                </div>
              </details>

              {watchAvailable === false && (
                <details className="rounded-lg border p-3" open>
                  <summary className="cursor-pointer text-sm font-semibold text-amber-700">Disponibilita</summary>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Motivo</span><p>{reasonLabel(editingPlayer.unavailabilityReason, t)}</p></div>
                    <div><span className="text-muted-foreground">Rientro previsto</span><p>{editingPlayer.expectedReturn || "-"}</p></div>
                  </div>
                </details>
              )}

              {canViewFinancials && (
                <details className="rounded-lg border p-3" open={overduePlayerPayments.length > 0}>
                  <summary className="cursor-pointer text-sm font-semibold">Quote e rate</summary>
                  <div className="mt-3 space-y-2 text-sm">
                    {overduePlayerPayments.length > 0 && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        Sono presenti rate scadute non versate: il giocatore risulta non disponibile.
                      </div>
                    )}
                    {editingPlayerPayments.length === 0 ? (
                      <p className="text-muted-foreground">Nessuna quota registrata.</p>
                    ) : (
                      <div className="space-y-2">
                        {editingPlayerPayments.map((payment) => (
                          <div key={payment.id} className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium">{payment.description || "Quota giocatore"}</p>
                              <p className="text-xs text-muted-foreground">
                                {payment.dueDate ? `Scadenza ${payment.dueDate}` : "Senza scadenza"}
                                {payment.installmentNumber && payment.totalInstallments ? ` - rata ${payment.installmentNumber}/${payment.totalInstallments}` : ""}
                              </p>
                            </div>
                            <div className="text-sm font-semibold">
                              Euro {Number(payment.amount ?? 0).toFixed(2)} - {payment.status === "paid" ? "Versata" : "Non versata"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}

              {canViewKit && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Kit</summary>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="space-y-2">
                      {displayedKitRows.filter((row) => row.price || row.ordered || row.arrived).length === 0 ? (
                        <p className="text-muted-foreground">Nessun kit registrato.</p>
                      ) : displayedKitRows.filter((row) => row.price || row.ordered || row.arrived).map((row) => (
                        <div key={row.key} className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium">{row.label}</p>
                            <p className="text-xs text-muted-foreground">{row.area === "training" ? "Allenamento" : row.area === "match" ? "Gara" : "Rappresentanza"}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant={row.ordered ? "default" : "secondary"}>{row.ordered ? "Ordinato" : "Non ordinato"}</Badge>
                            <Badge variant={row.arrived ? "default" : "secondary"}>{row.arrived ? "Arrivato" : "Non arrivato"}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingPlayer(null)}>{t.cancel}</Button>
                {canWritePlayerNotes && (
                  <Button type="submit" disabled={updateMutation.isPending || !noteDraftText.trim()}>
                    {updateMutation.isPending ? t.saving : "Invia comunicazione"}
                  </Button>
                )}
              </DialogFooter>
            </form>
            ) : (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
                <div className="space-y-2">
                  <Label>Immagine giocatore</Label>
                  <div className="flex items-center gap-3">
                    {editForm.watch("imageUrl") ? (
                      <img
                        src={editForm.watch("imageUrl") ?? ""}
                        alt="Anteprima giocatore"
                        className="h-36 w-36 rounded-lg border bg-background object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center rounded-lg border bg-muted text-muted-foreground shadow-sm">
                        <User className="h-14 w-14" />
                      </div>
                    )}
                  </div>
                  {!canUploadPlayerImage && (
                    <p className="text-[11px] text-muted-foreground">Consentito solo a segreteria e ruoli equivalenti.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Carica file immagine</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      ref={playerImageInputRef}
                      type="file"
                      accept="image/*"
                      disabled={!canUploadPlayerImage}
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (!file) return;
                        openImageCropper(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-center gap-2 sm:w-auto"
                      disabled={!canUploadPlayerImage}
                      onClick={() => playerImageInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4" />
                      Scegli immagine
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-center gap-2 sm:w-auto"
                      disabled={!canUploadPlayerImage}
                      onClick={() => editForm.setValue("imageUrl", null, { shouldDirty: true })}
                      title="Rimuovi immagine"
                    >
                      <X className="h-4 w-4" />
                      Rimuovi
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Carica immagine profilo giocatore.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.firstName} <span className="text-destructive">*</span></Label>
                  <Input {...editForm.register("firstName")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastName} <span className="text-destructive">*</span></Label>
                  <Input {...editForm.register("lastName")} disabled={!canEditFullPlayer} />
                </div>
              </div>
              {canEditFullPlayer && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    const firstName = editForm.getValues("firstName") ?? "";
                    const lastName = editForm.getValues("lastName") ?? "";
                    editForm.setValue("firstName", lastName, { shouldDirty: true });
                    editForm.setValue("lastName", firstName, { shouldDirty: true });
                  }}
                >
                  Scambia nome/cognome
                </Button>
              )}

              {canViewFinancials && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kit</p>
                    </div>
                    <Badge variant="outline">Totale Euro {kitRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0).toFixed(2)}</Badge>
                  </div>
                  <div className="space-y-2">
                    {(["training", "match", "representation"] as const).map((area) => (
                      <div key={area} className="rounded-md border bg-background p-3">
                        <p className="mb-2 text-sm font-semibold">
                          {area === "training" ? "Kit allenamento" : area === "match" ? "Kit gara" : "Kit rappresentanza"}
                        </p>
                        <div className="space-y-2">
                          {kitRows.filter((row) => row.area === area).map((row) => (
                            <div key={row.key} className="grid grid-cols-1 gap-2 rounded-md border px-3 py-2 sm:grid-cols-[1fr_120px_100px_100px] sm:items-center">
                              <span className="text-sm font-medium">{row.label}</span>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Prezzo"
                                value={row.price}
                                onChange={(e) => updateKitRow(row.key, { price: e.target.value })}
                                disabled={!canEditFinancials}
                              />
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={row.ordered} onCheckedChange={(v) => updateKitRow(row.key, { ordered: v === true })} disabled={!canEditFinancials} />
                                Ordinato
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox checked={row.arrived} onCheckedChange={(v) => updateKitRow(row.key, { arrived: v === true })} disabled={!canEditFinancials} />
                                Arrivato
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label>Note kit</Label>
                    <Textarea value={kitNotes} onChange={(e) => setKitNotes(e.target.value)} disabled={!canEditFinancials} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 rounded-md border bg-background p-3 sm:grid-cols-3">
                    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                      <Checkbox
                        id="kitPaymentPaid"
                        checked={kitPaymentStatus === "paid"}
                        onCheckedChange={(v) => setKitPaymentStatus(v === true ? "paid" : "pending")}
                        disabled={!canEditFinancials}
                      />
                      <Label htmlFor="kitPaymentPaid" className="cursor-pointer">Pagato</Label>
                    </div>
                    <div className="space-y-2">
                      <Label>Metodo pagamento</Label>
                      <Select value={kitPaymentMethod || "_none"} onValueChange={(v) => setKitPaymentMethod(v === "_none" ? "" : v)} disabled={!canEditFinancials}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Da definire</SelectItem>
                          <SelectItem value="cash">Contanti</SelectItem>
                          <SelectItem value="bank_transfer">Bonifico</SelectItem>
                          <SelectItem value="card">Carta/POS</SelectItem>
                          <SelectItem value="other">Altro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Scadenza pagamento</Label>
                      <Input type="date" value={kitPaymentDueDate} onChange={(e) => setKitPaymentDueDate(e.target.value)} disabled={!canEditFinancials} />
                    </div>
                    <div className="space-y-2">
                      <Label>Numero rate kit</Label>
                      <Input type="number" min={1} value={kitInstallmentCount} onChange={(e) => setKitInstallmentCount(e.target.value)} disabled={!canEditFinancials} />
                    </div>
                    <div className="space-y-2">
                      <Label>Importo rata kit</Label>
                      <Input
                        value={Number(kitInstallmentCount) > 0 && kitRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0) > 0
                          ? (kitRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0) / Number(kitInstallmentCount)).toFixed(2)
                          : ""}
                        readOnly
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                      Se il kit risulta non pagato e la scadenza e superata, il genitore lo vede nei pagamenti e il giocatore viene gestito come non disponibile.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 rounded-md border bg-background p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Costo mensile pulmino</Label>
                      <Input type="number" step="0.01" value={shuttleMonthlyCost} onChange={(e) => setShuttleMonthlyCost(e.target.value)} disabled={!canEditFinancials || editForm.watch("shuttleService") !== true} />
                    </div>
                    <div className="space-y-2">
                      <Label>Scadenza prima quota pulmino</Label>
                      <Input type="date" value={shuttlePaymentDueDate} onChange={(e) => setShuttlePaymentDueDate(e.target.value)} disabled={!canEditFinancials || editForm.watch("shuttleService") !== true} />
                    </div>
                  </div>
                  {canEditFinancials && (
                    <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={isSavingKit} onClick={() => void savePlayerKit()}>
                      <Package className="h-4 w-4" />
                      {isSavingKit ? "Salvataggio..." : "Salva kit"}
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.nationality}</Label>
                  <Input {...editForm.register("nationality")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.dateOfBirth}</Label>
                  <Input type="date" {...editForm.register("dateOfBirth")} disabled={!canEditFullPlayer} />
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contatti</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Telefono</Label>
                    <Input {...editForm.register("phone")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email giocatore</Label>
                    <Input type="email" {...editForm.register("email")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Telefono riferito a</Label>
                    <Controller
                      control={editForm.control}
                      name="phoneOwnerType"
                      render={({ field }) => (
                        <Select value={field.value || "player"} onValueChange={field.onChange} disabled={!canEditFullPlayer}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="player">Giocatore</SelectItem>
                            <SelectItem value="parent">Genitore/Tutore</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                {(watchPhoneOwnerEdit === "parent" || Boolean(editForm.watch("parentFirstName") || editForm.watch("parentLastName") || editForm.watch("parentPhone") || editForm.watch("parentEmail") || editForm.watch("parentRelation"))) && (
                  <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome genitore</Label>
                      <Input {...editForm.register("parentFirstName")} disabled={!canEditFullPlayer} />
                    </div>
                    <div className="space-y-2">
                      <Label>Cognome genitore</Label>
                      <Input {...editForm.register("parentLastName")} disabled={!canEditFullPlayer} />
                    </div>
                    <div className="space-y-2">
                      <Label>Telefono genitore</Label>
                      <Input {...editForm.register("parentPhone")} disabled={!canEditFullPlayer} />
                    </div>
                    <div className="space-y-2">
                      <Label>Email genitore</Label>
                      <Input type="email" {...editForm.register("parentEmail")} disabled={!canEditFullPlayer} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Relazione</Label>
                      <Input placeholder="Padre, madre, tutore..." {...editForm.register("parentRelation")} disabled={!canEditFullPlayer} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 border-t pt-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome secondo referente</Label>
                    <Input {...editForm.register("secondaryContactFirstName")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cognome secondo referente</Label>
                    <Input {...editForm.register("secondaryContactLastName")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefono secondo referente</Label>
                    <Input {...editForm.register("secondaryContactPhone")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email secondo referente</Label>
                    <Input type="email" {...editForm.register("secondaryContactEmail")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Relazione secondo referente</Label>
                    <Input placeholder="Nonno, baby sitter, tutore, altro..." {...editForm.register("secondaryContactRelation")} disabled={!canEditFullPlayer} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tesseramento e certificato</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.registrationNumber}</Label>
                    <Input {...editForm.register("registrationNumber")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Scadenza certificato medico</Label>
                    <Input type="date" {...editForm.register("medicalCertificateExpiry")} disabled={!canEditFullPlayer} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                    <Controller
                      control={editForm.control}
                      name="registered"
                      render={({ field }) => (
                        <Checkbox
                          id="editRegistered"
                          checked={field.value === true}
                          onCheckedChange={(c) => field.onChange(c === true)}
                          disabled={!canEditFullPlayer}
                        />
                      )}
                    />
                    <Label htmlFor="editRegistered" className="cursor-pointer">{t.registered}</Label>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                    <Controller
                      control={editForm.control}
                      name="shuttleService"
                      render={({ field }) => (
                        <Checkbox
                          id="editShuttleService"
                          checked={field.value === true}
                          onCheckedChange={(c) => field.onChange(c === true)}
                          disabled={!canEditFullPlayer}
                        />
                      )}
                    />
                    <Label htmlFor="editShuttleService" className="cursor-pointer">Usufruisce pulmino</Label>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                    <Checkbox
                      id="medicalCertificatePresent"
                      checked={Boolean(editingMedicalCertificate || editForm.watch("medicalCertificateExpiry"))}
                      disabled
                    />
                    <Label htmlFor="medicalCertificatePresent">Certificato medico presente</Label>
                  </div>
                </div>
                {editingMedicalCertificate?.expiryDate && !isMedicalCertificateValid(editingMedicalCertificate.expiryDate) && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Certificato medico scaduto: il giocatore non puo essere disponibile.
                  </div>
                )}
                {editingMedicalCertificate?.expiryDate && isMedicalCertificateValid(editingMedicalCertificate.expiryDate) && (() => {
                  const days = Math.ceil((new Date(`${editingMedicalCertificate.expiryDate}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  return days <= 60 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Certificato medico in scadenza tra {Math.max(days, 0)} giorni.
                    </div>
                  ) : null;
                })()}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documenti giocatore</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PLAYER_DOCUMENT_TYPES.map((docType) => {
                    const uploaded = editingPlayerDocuments.some((doc) => doc.type === docType.value);
                    const checked = documentType === docType.value;
                    return (
                      <button
                        key={docType.value}
                        type="button"
                        disabled={!canEditFullPlayer}
                        onClick={() => setDocumentType(docType.value)}
                        className={`flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors ${checked ? "border-primary ring-1 ring-primary/30" : "hover:bg-muted/40"}`}
                      >
                        <span className={`h-4 w-4 shrink-0 rounded-full border ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{docType.label}</span>
                          <span className="block text-xs text-muted-foreground">{uploaded ? "Documento caricato" : "Da caricare"}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-md border bg-background p-3 space-y-3">
                  <p className="text-sm font-semibold">{playerDocumentLabel(documentType)}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>File PDF o immagine</Label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
                      disabled={!canEditFullPlayer}
                      onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data inizio validita</Label>
                    <Input type="date" value={documentValidFrom} onChange={(e) => setDocumentValidFrom(e.target.value)} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data scadenza</Label>
                    <Input type="date" value={documentExpiryDate} onChange={(e) => setDocumentExpiryDate(e.target.value)} disabled={!canEditFullPlayer} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Note documento</Label>
                  <Input value={documentNotes} onChange={(e) => setDocumentNotes(e.target.value)} disabled={!canEditFullPlayer} />
                </div>
                <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={!canEditFullPlayer || isUploadingDocument} onClick={() => void uploadPlayerDocument()}>
                  <Upload className="h-4 w-4" />
                  {isUploadingDocument ? "Caricamento..." : "Carica documento"}
                </Button>
                </div>
                <div className="space-y-2">
                  {editingPlayerDocuments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun documento caricato.</p>
                  ) : editingPlayerDocuments.map((doc) => (
                    <div key={doc.id} className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{playerDocumentLabel(doc.type)}{doc.fileName ? ` - ${doc.fileName}` : ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.validFrom ? `Dal ${doc.validFrom}` : "Inizio non indicato"} · {doc.expiryDate ? `Scade ${doc.expiryDate}` : "Nessuna scadenza"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.fileData && (
                          <Button type="button" size="sm" variant="outline" onClick={() => window.open(doc.fileData ?? "", "_blank")}>
                            Apri
                          </Button>
                        )}
                        {canEditFullPlayer && (
                          <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void deletePlayerDocument(doc.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t.jerseyNumber}</Label>
                  <Input type="number" {...editForm.register("jerseyNumber")} disabled={!canEditFullPlayer} />
                </div>
              </div>

              {canViewFinancials && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote e rate</p>
                  </div>
                  {overduePlayerPayments.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Rata scaduta non versata: il giocatore viene bloccato automaticamente.
                    </div>
                  )}
                  {canEditFinancials && (
                    <div className="grid grid-cols-1 gap-3 rounded-md border bg-background p-3 sm:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Quota totale</Label>
                        <Input type="number" step="0.01" value={annualFeeTotal} onChange={(e) => setAnnualFeeTotal(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Numero rate</Label>
                        <Input type="number" min={1} value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Prima scadenza</Label>
                        <Input type="date" value={firstInstallmentDueDate} onChange={(e) => setFirstInstallmentDueDate(e.target.value)} />
                      </div>
                      {annualInstallments.length > 0 && (
                        <div className="space-y-2 sm:col-span-4">
                          <Label>Piano rate</Label>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {annualInstallments.map((installment, index) => (
                              <div key={`annual-installment-${index}`} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2 rounded-md border px-3 py-2">
                                <span className="text-xs font-semibold text-muted-foreground">Rata {index + 1}</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={installment.amount}
                                  onChange={(e) => setAnnualInstallments((drafts) => rebalanceInstallments(drafts, index, e.target.value, annualFeeTotal))}
                                />
                                <Input
                                  type="date"
                                  value={installment.dueDate}
                                  onChange={(e) => setAnnualInstallments((drafts) => drafts.map((draft, i) => i === index ? { ...draft, dueDate: e.target.value } : draft))}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="sm:col-span-4">
                        <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={isSavingInstallments} onClick={() => void createAnnualFeeInstallments()}>
                          <Banknote className="h-4 w-4" />
                          {isSavingInstallments ? "Salvataggio..." : "Crea rate quota"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {editingPlayerPayments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nessuna quota registrata.</p>
                    ) : editingPlayerPayments.map((payment) => (
                      <div key={payment.id} className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{payment.description || "Quota giocatore"}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.dueDate ? `Scadenza ${payment.dueDate}` : "Senza scadenza"}
                            {payment.installmentNumber && payment.totalInstallments ? ` - rata ${payment.installmentNumber}/${payment.totalInstallments}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Euro {Number(payment.amount ?? 0).toFixed(2)}</span>
                          <Badge variant={payment.status === "paid" ? "default" : overduePlayerPayments.some((p) => p.id === payment.id) ? "destructive" : "secondary"}>
                            {payment.status === "paid" ? "Versata" : "Non versata"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.assignToTeam}</Label>
                  <Controller
                    control={editForm.control}
                    name="teamId"
                    render={({ field }) => (
                      <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""} disabled={!canEditFullPlayer}>
                        <SelectTrigger><SelectValue placeholder={t.noTeamAssigned} /></SelectTrigger>
                        <SelectContent>
                          {teams?.map(team => <SelectItem key={team.id} value={team.id.toString()}>{team.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assegna squadra supplementare</Label>
                  <Controller
                    control={editForm.control}
                    name="supplementalTeamId"
                    render={({ field }) => (
                      <Select
                        onValueChange={(v) => field.onChange(v === "_none" ? null : parseInt(v))}
                        value={field.value ? String(field.value) : "_none"}
                        disabled={!canEditSupplementalTeam}
                      >
                        <SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {teams?.map(team => (
                            <SelectItem key={`supp-${team.id}`} value={team.id.toString()}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.height} (cm)</Label>
                  <Input type="number" {...editForm.register("height")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.weight} (kg)</Label>
                  <Input type="number" {...editForm.register("weight")} disabled={!canEditFullPlayer} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Squadra</Label>
                  <Controller
                    control={editForm.control}
                    name="squad"
                    render={({ field }) => (
                      <Select
                        onValueChange={(v) => field.onChange(v)}
                        value={field.value || ""}
                        disabled={!canEditRoleAndSquad}
                      >
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.position}</Label>
                  <Controller
                    control={editForm.control}
                    name="position"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditRoleAndSquad}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GK">{t.goalkeeper}</SelectItem>
                          <SelectItem value="DEF">{t.defender}</SelectItem>
                          <SelectItem value="MID">{t.midfielder}</SelectItem>
                          <SelectItem value="FWD">{t.forward}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.status}</Label>
                <Controller
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "active"} disabled={!canEditFullPlayer}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t.active}</SelectItem>
                        <SelectItem value="injured">{t.injured}</SelectItem>
                        <SelectItem value="inactive">{t.inactive}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>{t.notes}</Label>
                {(() => {
                  const parsed = splitPlayerNotes(editForm.watch("notes") ?? "");
                  const pendingForCurrentUser = parsed.thread.filter((n) =>
                    !!n.requiresResponse &&
                    !n.repliedAt &&
                    (
                      (n.recipient === "secretary" && nr === "secretary") ||
                      (n.recipient === "technical_director" && nr === "technical_director") ||
                      (n.recipient === "coach_staff" && ["coach", "fitness_coach", "athletic_director"].includes(nr))
                    )
                  );
                  return (
                    <div className="space-y-2">
                      <Textarea
                        value={parsed.plainNote}
                        onChange={(e) => editForm.setValue("notes", composePlayerNotes(e.target.value, parsed.thread))}
                        disabled={!canEditFullPlayer}
                        spellCheck={false}
                        placeholder="Nota generale sul giocatore..."
                      />
                      {parsed.thread.length > 0 && (
                        <div className="space-y-1 max-h-36 overflow-auto rounded border p-2 bg-muted/20">
                          {parsed.thread.map((n) => (
                            <div
                              key={n.id}
                              className={`text-xs rounded border px-2 py-1 bg-background ${noteReplyToId === n.id ? "border-primary ring-1 ring-primary/30" : ""}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{n.authorName || n.authorRole}</span>
                                <span className="text-muted-foreground">{new Date(n.createdAt).toLocaleString("it-IT")}</span>
                              </div>
                              <div className="text-muted-foreground mt-0.5">
                                A: {n.recipient === "secretary" ? "Segreteria" : n.recipient === "technical_director" ? "Direttore tecnico" : "Allenatori/Preparatori"}
                              </div>
                              <p className="mt-1">{n.body}</p>
                              {n.requiresResponse && !n.repliedAt && (
                                <Badge variant="outline" className="mt-1 text-[10px]">In attesa risposta</Badge>
                              )}
                              {n.repliedAt && (
                                <Badge variant="secondary" className="mt-1 text-[10px]">Risposta ricevuta</Badge>
                              )}
                              {!!n.requiresResponse && !n.repliedAt && canWritePlayerNotes && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] mt-1"
                                  onClick={() => {
                                    setNoteReplyToId(n.id);
                                    setNoteRecipient(getReplyRecipient(n.authorRole));
                                    setNoteRequiresResponse(false);
                                    window.setTimeout(() => noteDraftRef.current?.focus(), 0);
                                  }}
                                >
                                  {noteReplyToId === n.id ? "Risposta selezionata" : "Rispondi"}
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {canWritePlayerNotes && (
                        <div className="space-y-2 rounded border p-2 bg-muted/20">
                          <Label className="text-xs">Nuova comunicazione</Label>
                          <Textarea
                            ref={noteDraftRef}
                            value={noteDraftText}
                            onChange={(e) => setNoteDraftText(e.target.value)}
                            spellCheck={false}
                            placeholder="Scrivi una comunicazione sul giocatore..."
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Select value={noteRecipient} onValueChange={(v) => setNoteRecipient(v as PlayerNoteRecipient)}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="secretary">Segreteria</SelectItem>
                                <SelectItem value="technical_director">Direttore tecnico</SelectItem>
                                <SelectItem value="coach_staff">Allenatori/Preparatori</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-2 px-2">
                              <Checkbox checked={noteRequiresResponse} onCheckedChange={(v) => setNoteRequiresResponse(v === true)} />
                              <Label className="text-xs">Richiesta risposta</Label>
                            </div>
                          </div>
                          {noteReplyToId && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Risposta a nota in attesa</span>
                              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setNoteReplyToId("")}>
                                Annulla
                              </Button>
                            </div>
                          )}
                          {pendingForCurrentUser.length > 0 && (
                            <p className="text-[11px] text-amber-700">
                              Hai {pendingForCurrentUser.length} richieste di risposta in attesa.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <Separator />

              {/* Availability Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h4 className="font-semibold text-sm">{t.playerAvailability}</h4>
                  {!canEditAvailability && (
                    <span className="text-xs text-muted-foreground ml-auto italic">(permessi insufficienti)</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <Controller
                    control={editForm.control}
                    name="available"
                    render={({ field }) => (
                      <Switch
                        id="available"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                        disabled={!canEditAvailability || editAvailabilityBlocks.length > 0}
                      />
                    )}
                  />
                  <Label htmlFor="available" className={`cursor-pointer font-medium ${watchAvailable !== false ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {watchAvailable !== false ? t.available : t.notAvailable}
                  </Label>
                </div>

                {editAvailabilityBlocks.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Non disponibile automaticamente: {editAvailabilityBlocks.join(" e ")}.
                  </div>
                )}

                {watchAvailable === false && (
                  <div className="space-y-3 pl-2 border-l-2 border-red-200 dark:border-red-800">
                    <div className="space-y-2">
                      <Label>{t.unavailabilityReason}</Label>
                      <Controller
                        control={editForm.control}
                        name="unavailabilityReason"
                        render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditAvailability}>
                            <SelectTrigger>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="illness">{t.illness}</SelectItem>
                              <SelectItem value="injury">{t.injuryReason}</SelectItem>
                              <SelectItem value="vacation">{t.vacationReason}</SelectItem>
                              <SelectItem value="other">{t.otherReason}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.expectedReturn}</Label>
                      <Input
                        type="date"
                        {...editForm.register("expectedReturn")}
                        disabled={!canEditAvailability}
                      />
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingPlayer(null)}>{t.cancel}</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? t.saving : "INVIA MODIFICHE"}
                </Button>
              </DialogFooter>
            </form>
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!imageCropSource} onOpenChange={(open) => !open && closeImageCropper()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Centra immagine giocatore</DialogTitle>
          </DialogHeader>
          {imageCropSource && (
            <div className="space-y-4">
              <div
                className="relative mx-auto h-80 w-80 max-w-full overflow-hidden rounded-xl border bg-white"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setImageCropDrag({
                    x: event.clientX,
                    y: event.clientY,
                    startX: imageCropOffset.x,
                    startY: imageCropOffset.y,
                  });
                }}
                onPointerMove={(event) => {
                  if (!imageCropDrag) return;
                  setImageCropOffset({
                    x: imageCropDrag.startX + event.clientX - imageCropDrag.x,
                    y: imageCropDrag.startY + event.clientY - imageCropDrag.y,
                  });
                }}
                onPointerUp={() => setImageCropDrag(null)}
                onPointerCancel={() => setImageCropDrag(null)}
              >
                {imageBackground === "club_logo" && clubLogoUrl && (
                  <img
                    src={clubLogoUrl}
                    alt="Logo societa"
                    className="pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 object-contain opacity-15"
                  />
                )}
                <img
                  src={imageCropSource}
                  alt="Ritaglio giocatore"
                  draggable={false}
                  onLoad={(event) => {
                    setImageCropSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: imageCropSize
                      ? `${imageCropSize.width * Math.max(320 / imageCropSize.width, 320 / imageCropSize.height) * imageCropZoom}px`
                      : "auto",
                    height: imageCropSize
                      ? `${imageCropSize.height * Math.max(320 / imageCropSize.width, 320 / imageCropSize.height) * imageCropZoom}px`
                      : "auto",
                    transform: `translate(calc(-50% + ${imageCropOffset.x}px), calc(-50% + ${imageCropOffset.y}px))`,
                    cursor: imageCropDrag ? "grabbing" : "grab",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10" />
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Sfondo</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={imageBackground === "white" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setImageBackground("white")}
                    >
                      Bianco
                    </Button>
                    <Button
                      type="button"
                      variant={imageBackground === "club_logo" ? "default" : "outline"}
                      size="sm"
                      disabled={!clubLogoUrl}
                      onClick={() => setImageBackground("club_logo")}
                    >
                      Logo societa
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                  <div>
                    <Label htmlFor="remove-player-bg">Rimuovi sfondo semplice</Label>
                    <p className="text-[11px] text-muted-foreground">Ideale con sfondi uniformi.</p>
                  </div>
                  <Switch
                    id="remove-player-bg"
                    checked={imageRemoveBackground}
                    onCheckedChange={setImageRemoveBackground}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="player-image-zoom">Zoom</Label>
                <Input
                  id="player-image-zoom"
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={imageCropZoom}
                  onChange={(event) => setImageCropZoom(Number(event.target.value))}
                />
              </div>
              <p className="text-xs text-muted-foreground">Trascina l'immagine per centrare il volto, poi regola lo zoom.</p>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeImageCropper}>Annulla</Button>
                <Button type="button" onClick={() => void applyImageCrop()}>Usa immagine</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Filter bar */}
      <div className="max-w-full space-y-2">
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder={t.searchByNameOrPosition}
              className="w-full min-w-0 pl-10 border-0 focus-visible:ring-0 shadow-none bg-transparent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="h-10 w-px bg-border hidden sm:block" />
          <div className="flex min-w-0 items-center gap-2 px-2 sm:w-[220px]">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="min-w-0 border-0 shadow-none focus:ring-0">
                <SelectValue placeholder={t.filterByTeam} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allTeams}</SelectItem>
                {teams?.map(team => <SelectItem key={team.id} value={team.id.toString()}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex max-w-full flex-col gap-2 px-1 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Position */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border bg-card px-2 py-1">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Ruolo</span>
            {[{ v: "all", l: "Tutti" }, { v: "GK", l: t.goalkeeper }, { v: "DEF", l: t.defender }, { v: "MID", l: t.midfielder }, { v: "FWD", l: t.forward }].map(o => (
              <button key={o.v} type="button" onClick={() => setPositionFilter(o.v)}
                className={`shrink-0 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${positionFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Availability */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border bg-card px-2 py-1">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Disponibilità</span>
            {[{ v: "all", l: "Tutti" }, { v: "available", l: t.available }, { v: "unavailable", l: t.notAvailable }].map(o => (
              <button key={o.v} type="button" onClick={() => setAvailabilityFilter(o.v)}
                className={`shrink-0 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${availabilityFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border bg-card px-2 py-1">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Stato</span>
            {[{ v: "all", l: "Tutti" }, { v: "active", l: t.active }, { v: "injured", l: t.injured }, { v: "inactive", l: t.inactive }].map(o => (
              <button key={o.v} type="button" onClick={() => setStatusFilter(o.v)}
                className={`shrink-0 px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${statusFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Height range */}
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border bg-card px-2 py-1">
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Altezza (cm)</span>
            <input type="number" placeholder="Min" value={heightMin} onChange={e => setHeightMin(e.target.value)}
              className="w-14 text-[11px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <span className="text-[11px] text-muted-foreground">–</span>
            <input type="number" placeholder="Max" value={heightMax} onChange={e => setHeightMax(e.target.value)}
              className="w-14 text-[11px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>

          {/* Reset */}
          {activeFilterCount > 0 && (
            <button type="button" onClick={() => { setPositionFilter("all"); setAvailabilityFilter("all"); setStatusFilter("all"); setHeightMin(""); setHeightMax(""); }}
              className="px-2 py-1 text-[11px] text-destructive font-medium hover:underline">
              Azzera filtri ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Annate e giocatori assegnati</h2>
            <p className="text-xs text-muted-foreground">Seleziona un'annata per filtrare rapidamente la lista.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNameOrder((current) => current === "surname_first" ? "name_first" : "surname_first")}
            >
              {nameOrder === "surname_first" ? "Cognome Nome" : "Nome Cognome"}
            </Button>
            <Badge variant="secondary">
              {(filteredPlayers ?? []).length} giocatori
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTeamFilter("all")}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              teamFilter === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            Tutte
            <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground">
              {(playersMatchingFilters ?? []).length}
            </span>
          </button>
          {teamsByAnnata.map((team) => {
            const teamPlayers = playersByTeam.get(Number(team.id)) ?? [];
            const selected = teamFilter === String(team.id);
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => setTeamFilter(String(team.id))}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{team.name}</span>
                <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground">
                  {teamPlayers.length}
                </span>
              </button>
            );
          })}
          {unassignedPlayers.length > 0 && (
            <button
              type="button"
              onClick={() => setTeamFilter("unassigned")}
              className={`inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition ${
                teamFilter === "unassigned"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              Senza squadra
              <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] text-foreground">{unassignedPlayers.length}</span>
            </button>
          )}
        </div>
      </section>

      {canDeletePlayer && (filteredPlayers ?? []).length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={allVisiblePlayersSelected}
              onCheckedChange={(checked) => {
                if (checked === true) {
                  setSelectedPlayerIds(Array.from(new Set([...selectedPlayerIds, ...filteredPlayerIds])));
                } else {
                  setSelectedPlayerIds(selectedPlayerIds.filter((id) => !filteredPlayerIds.includes(id)));
                }
              }}
            />
            Seleziona visibili
            {selectedVisiblePlayerIds.length > 0 && (
              <span className="text-xs text-muted-foreground">({selectedVisiblePlayerIds.length})</span>
            )}
          </label>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={selectedVisiblePlayerIds.length === 0 || deleteMutation.isPending}
            onClick={handleBulkDeletePlayers}
            className="w-full gap-2 sm:w-auto"
          >
            <UserMinus className="h-4 w-4" />
            Elimina selezionati
          </Button>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                {canDeletePlayer && <th className="px-4 py-4 w-10" />}
                <th className="px-6 py-4">{t.player}</th>
                <th className="px-6 py-4">{t.team}</th>
                <th className="px-6 py-4">{t.position}</th>
                <th className="px-6 py-4">{t.registered}</th>
                <th className="px-6 py-4">{t.playerAvailability}</th>
                <th className="px-6 py-4">{t.status}</th>
                <th className="px-6 py-4 text-right">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-32" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-16" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-6 w-20" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-8 w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredPlayers?.length === 0 ? (
                <tr>
                  <td colSpan={canDeletePlayer ? 8 : 7} className="px-6 py-16 text-center">
                    {isAssignedStaffRole && !search && (players as any[])?.length === 0 ? (
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-muted-foreground/30 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        <p className="font-semibold text-foreground">Nessuna squadra assegnata</p>
                        <p className="text-sm text-muted-foreground max-w-xs">Non hai ancora squadre assegnate. Contatta l'amministratore per ricevere l'accesso.</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t.noPlayersFound}</span>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPlayers?.map(player => (
                  (() => {
                    const { meta } = splitPlayerMeta(player.notes ?? "");
                    const imageUrl = player.imageUrl ?? meta.imageUrl ?? null;
                    return (
                  <tr key={player.id} className="hover:bg-muted/30 transition-colors">
                    {canDeletePlayer && (
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedPlayerIds.includes(player.id)}
                          onCheckedChange={(checked) => {
                            setSelectedPlayerIds((current) =>
                              checked === true
                                ? Array.from(new Set([...current, player.id]))
                                : current.filter((id) => id !== player.id)
                            );
                          }}
                          aria-label={`Seleziona ${playerName(player, nameOrder)}`}
                        />
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={playerName(player, nameOrder)}
                            className="w-10 h-10 rounded-md object-cover border shadow-sm"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-md flex items-center justify-center border shadow-sm ${
                            player.available === false
                              ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-foreground">{playerName(player, nameOrder)}</div>
                          {player.jerseyNumber && <div className="text-xs text-muted-foreground">#{player.jerseyNumber}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {player.teamName || t.unassigned}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono bg-muted px-2 py-1 rounded text-xs">{player.position || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                        player.registered
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {player.registered ? t.registered : "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {player.available === false ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                            <AlertTriangle className="w-3 h-3" />
                            {t.notAvailable}
                          </span>
                          {player.unavailabilityReason && (
                            <div className="text-xs text-muted-foreground">{reasonLabel(player.unavailabilityReason, t)}</div>
                          )}
                          {player.expectedReturn && (
                            <div className="text-xs text-muted-foreground">{t.expectedReturn}: {player.expectedReturn}</div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                          {t.available}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                        player.status === 'active' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' :
                        player.status === 'injured' ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' :
                        'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                      }`}>
                        {statusLabel(player.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openPlayerDialog(player, "view")}
                          title="Visualizza scheda"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManagePlayers && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openPlayerDialog(player, "edit")}
                            title={t.editPlayer}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canDeletePlayer}>
                              <span className="text-lg leading-none">⋯</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer"
                              disabled={!canDeletePlayer}
                              onClick={() => {
                                if (!canDeletePlayer) return;
                                if (confirm(t.removePlayer)) {
                                  setLastDeletedPlayer(player);
                                  deleteMutation.mutate({ id: player.id });
                                }
                              }}
                            >
                              <UserMinus className="w-4 h-4 mr-2" />
                              {t.deletePlayer}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))
          ) : filteredPlayers?.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t.noPlayersFound}
            </div>
          ) : (
            filteredPlayers?.map((player) => {
              const { meta } = splitPlayerMeta(player.notes ?? "");
              const imageUrl = player.imageUrl ?? meta.imageUrl ?? null;
              const selected = selectedPlayerIds.includes(player.id);
              return (
                <div key={player.id} className="p-4">
                  <div className="flex items-start gap-3">
                    {canDeletePlayer && (
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          setSelectedPlayerIds((current) =>
                            checked === true
                              ? Array.from(new Set([...current, player.id]))
                              : current.filter((id) => id !== player.id)
                          );
                        }}
                        aria-label={`Seleziona ${playerName(player, nameOrder)}`}
                        className="mt-2"
                      />
                    )}
                    {imageUrl ? (
                      <img src={imageUrl} alt={playerName(player, nameOrder)} className="h-11 w-11 rounded-md border object-cover shadow-sm" />
                    ) : (
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md border shadow-sm ${
                        player.available === false
                          ? "bg-red-100 text-red-800 border-red-200"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        <User className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{playerName(player, nameOrder)}</p>
                          <p className="truncate text-xs text-muted-foreground">{player.teamName || t.unassigned}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPlayerDialog(player, "view")}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManagePlayers && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPlayerDialog(player, "edit")}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded bg-muted px-2 py-1 font-mono text-xs">{player.position || "N/A"}</span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          player.available === false
                            ? "bg-red-100 text-red-800 border-red-200"
                            : "bg-green-100 text-green-800 border-green-200"
                        }`}>
                          {player.available === false ? t.notAvailable : t.available}
                        </span>
                        <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
                          {statusLabel(player.status)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
