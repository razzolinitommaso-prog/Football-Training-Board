import { PlayerKitEditor } from "./player-kit-editor";
import { ParentFamilyLinks } from "@/components/parent-family-links";
import { PLAYER_KIT_ROWS, kitRowHasContent, kitRowItemIds, kitRowNeedsLink, KIT_REQUEST_STATUS, savedKitSelections, type KitRequestLine, type KitRow } from "@/lib/player-kit-catalog";
import "./player-directory.css";
import { useTechnicalScope } from "@/components/technical-scope";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { useState, useEffect, useRef, useMemo } from "react";
import { TrainingRosterManager } from "@/components/training-roster-groups";
import { useListPlayers, useCreatePlayer, useDeletePlayer, useListTeams, useUpdatePlayer, useCreateTeam, useListClubMembers, type ClubMember, type Team } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, UserMinus, Pencil, Filter, AlertTriangle, FileDown, User, ImagePlus, X, Eye, Upload, FileText, Trash2, Banknote, Package, ChevronRight, Copy, KeyRound, Clock, ClipboardCheck, Trophy, Activity, ShieldAlert, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { Link, useLocation } from "wouter";
import { MAX_PLAYER_PAYMENT_AMOUNT } from "@/lib/fee-list";
import { depositPurposes, isReceiptMethod, paymentStatus, playerEconomicBalance, quotePaymentStatus, receiptMethodLabel } from "@/lib/payment-summary";
import { ReceiptMethodSelect } from "@/components/receipt-method-select";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { Separator } from "@/components/ui/separator";
import { ToastAction } from "@/components/ui/toast";
import { exportToExcel, mapPlayersForExcel } from "@/lib/excel-export";
import { mapExcelRowToPlayer, mapExcelRowToPlayerPreview, isValidPlayerRow, downloadPlayerTemplate, cellToTrimmedString, normalizeImportedTeamDisplayName, prepareAdaptivePlayerImportRows, importSeasonStartYear, resolveImportedPlayerRowTeam, inferPlayerImportSeasonStartYearFromRows, inferPlayerImportSeasonStartYearFromSheets } from "@/lib/excel-import";
import { ImportExcelDialog } from "@/components/import-excel-dialog";
import { withApi } from "@/lib/api-base";

/** Radix Checkbox può emettere `indeterminate`; Zod `z.boolean()` altrimenti fallisce e il submit non parte. */
const zRegisteredCheckbox = z.preprocess((v) => {
  if (v === "indeterminate") return false;
  return v;
}, z.boolean().optional());

const zNullableNumberInput = z.preprocess((v) => {
  if (v === "") return null;
  return v;
}, z.coerce.number().optional().nullable());

const zEntryMeasurement = z.preprocess(
  value => value === "" ? null : value,
  z.coerce.number().int().positive().max(2147483647).nullish(),
);

const zNullableSquadInput = z.preprocess((v) => {
  if (v === "") return null;
  return v;
}, z.enum(["A", "B", "C", "D"]).optional().nullable());

const zNullableLineupStatusInput = z.preprocess((v) => {
  if (v === "") return null;
  return v;
}, z.enum(["starter", "reserve"]).optional().nullable());

const playerSchema = z.object({
  height: zEntryMeasurement,
  weight: zEntryMeasurement,
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: zNullableNumberInput,
  position: z.string().optional(),
  jerseyNumber: zNullableNumberInput,
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
  parentDelegates: z.array(z.object({
    id: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    relation: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    isActive: z.boolean().optional(),
  })).optional(),
  secondaryContactFirstName: z.string().optional(),
  secondaryContactLastName: z.string().optional(),
  secondaryContactPhone: z.string().optional(),
  secondaryContactEmail: z.string().optional(),
  secondaryContactRelation: z.string().optional(),
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
  medicalCertificateExpiry: z.string().optional().nullable(),
  shuttleService: z.boolean().optional(),
  shuttleRoute: z.string().optional().nullable(),
  shuttleDirection: z.string().optional().nullable(),
});

const editSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: zNullableNumberInput,
  position: z.string().optional(),
  jerseyNumber: zNullableNumberInput,
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
  parentDelegates: z.array(z.object({
    id: z.number().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    relation: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    isActive: z.boolean().optional(),
  })).optional(),
  secondaryContactFirstName: z.string().optional(),
  secondaryContactLastName: z.string().optional(),
  secondaryContactPhone: z.string().optional(),
  secondaryContactEmail: z.string().optional(),
  secondaryContactRelation: z.string().optional(),
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
  medicalCertificateExpiry: z.string().optional().nullable(),
  shuttleService: z.boolean().optional(),
  shuttleRoute: z.string().optional().nullable(),
  shuttleDirection: z.string().optional().nullable(),
  nationality: z.string().optional(),
  height: zEntryMeasurement,
  weight: zEntryMeasurement,
  notes: z.string().optional(),
  available: z.boolean().optional(),
  unavailabilityReason: z.string().optional(),
  expectedReturn: z.string().optional(),
  availabilityOverrideActive: z.boolean().optional(),
  availabilityOverrideFrom: z.string().optional().nullable(),
  availabilityOverrideUntil: z.string().optional().nullable(),
  availabilityOverrideReason: z.string().optional().nullable(),
  squad: zNullableSquadInput,
  supplementalSquad: zNullableSquadInput,
  imageUrl: z.string().optional().nullable(),
  supplementalTeamId: zNullableNumberInput,
  primarySpecificRole: z.string().optional().nullable(),
  primaryLineupStatus: zNullableLineupStatusInput,
  supplementalSpecificRole: z.string().optional().nullable(),
  supplementalLineupStatus: zNullableLineupStatusInput,
});

type EditForm = z.infer<typeof editSchema>;

type Player = {
  clubSection?: string | null;
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
  parentDelegates?: ParentDelegate[];
  secondaryContactFirstName?: string | null;
  secondaryContactLastName?: string | null;
  secondaryContactPhone?: string | null;
  secondaryContactEmail?: string | null;
  secondaryContactRelation?: string | null;
  registered?: boolean | null;
  registrationNumber?: string | null;
  medicalCertificateExpiry?: string | null;
  shuttleService?: boolean | null;
  shuttleRoute?: string | null;
  shuttleDirection?: string | null;
  nationality?: string | null;
  height?: number | null;
  weight?: number | null;
  notes?: string | null;
  available?: boolean;
  unavailabilityReason?: string | null;
  expectedReturn?: string | null;
  availabilityOverrideActive?: boolean | null;
  availabilityOverrideFrom?: string | null;
  availabilityOverrideUntil?: string | null;
  availabilityOverrideReason?: string | null;
  squad?: "A" | "B" | "C" | "D" | null;
  supplementalSquad?: "A" | "B" | "C" | "D" | null;
  supplementalTeamId?: number | null;
  supplementalTeamName?: string | null;
  primarySpecificRole?: string | null;
  primaryLineupStatus?: "starter" | "reserve" | null;
  supplementalSpecificRole?: string | null;
  supplementalLineupStatus?: "starter" | "reserve" | null;
  imageUrl?: string | null;
};

type ParentDelegate = {
  id?: number;
  firstName?: string | null;
  lastName?: string | null;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  accessCode?: string | null;
  activationStatus?: string | null;
  deliveryChannel?: string | null;
  deliveryStatus?: string | null;
  isActive?: boolean | null;
};
type ParentAccessCredentials = { accessCode?: string | null; parentCode?: string | null };

const emptyParentDelegate = (): ParentDelegate => ({
  firstName: "",
  lastName: "",
  relation: "",
  phone: "",
  email: "",
  isActive: true,
});

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

type WarehouseListItem = {
  id: number;
  section: string;
  code: string;
  name: string;
  itemType: string;
  price?: number | null;
  isActive: number;
  category?: string | null;
  size?: string | null;
  quantityAvailable?: number | null;
  quantityReserved?: number | null;
};

type ExtraTimeRow = {
  key: string;
  group: "individual" | "group";
  label: string;
  activity: string;
  packageType: string;
  packagePrice: string;
  playersCount: string;
  lessonsCount: string;
  durationMinutes: string;
  hourlyCost: string;
  packageDates: string;
  lessonTime: string;
  coachName: string;
  notes: string;
  parentVisible: boolean;
};

type ProfileEntry = {
  source: "entry" | "legacy";
  date: string | null;
  position: string | null;
  jerseyNumber: number | null;
  height: number | null;
  weight: number | null;
};
type AssignmentChange = {
  date: string;
  team: string | null;
  season: string | null;
  role?: { from: string | null; to: string | null };
  jersey?: { from: number | null; to: number | null };
};
type PlayerActivitySummary = {
  profile?: {
    entry: ProfileEntry;
    changes: AssignmentChange[];
    height: { value: number; date: string } | null;
    weight: { value: number; date: string } | null;
    observedRole: { value: string; date: string } | null;
  };
  period?: { start: string; through: string };
  conduct: { status: string; reason?: string | null; training?: Record<string, number> };
  trainingAttendance: {
    totalPastSessions: number;
    present: number;
    unrecorded: number;
    percentage: number | null;
  };
  matchAttendance: {
    totalPastMatches: number;
    callups: number;
    appearances: number;
    recorded?: number;
    unrecorded?: number;
    minutes?: number | null;
    percentage: number | null;
  };
  fitnessTests: Array<{
    id: number;
    date: string;
    endurance?: number | null;
    strength?: number | null;
    speed?: number | null;
    notes?: string | null;
  }>;
  discipline: {
    cards: Array<{ id?: number; matchId?: number; date?: string; type?: string; reason?: string; opponent?: string; notes?: string | null }>;
  };
};

type InstallmentDraft = {
  amount: string;
  dueDate: string;
};

function parseEuroInput(value: string | number | null | undefined): number {
  if (value == null) return Number.NaN;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return Number.NaN;
  return Number(normalized);
}

function isSafePlayerPaymentAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_PLAYER_PAYMENT_AMOUNT;
}

function formatEuro(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return amount.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function kitRowQuantity(row: Pick<KitRow, "quantity">): number {
  const value = Math.max(1, Math.floor(Number(row.quantity) || 1));
  return Number.isFinite(value) ? value : 1;
}

function kitRowTotal(row: Pick<KitRow, "price" | "quantity" | "assignment">): number {
  return row.assignment === "loan" ? 0 : (parseEuroInput(row.price) || 0) * kitRowQuantity(row);
}

function defaultKitRows(): KitRow[] {
  return PLAYER_KIT_ROWS.map((item) => ({ ...item, price: "", quantity: "1", ordered: false, arrived: false }));
}

function parseKitRows(raw: string | null | undefined): KitRow[] {
  const source = savedKitSelections(raw);
  return defaultKitRows().map((base) => {
    const saved = source.find((row) => row.key === base.key);
    return {
      ...base,
      assignment: saved?.assignment === "manual" || saved?.assignment === "loan" ? saved.assignment : undefined,
      price: saved?.assignment === "loan" ? "0" : saved?.price != null ? String(saved.price) : "",
      quantity: saved?.quantity != null ? String(saved.quantity) : "1",
      ordered: saved?.ordered === true,
      arrived: saved?.arrived === true,
      listItemId: saved?.listItemId ? String(saved.listItemId) : "",
      componentItemIds: Array.isArray(saved?.componentItemIds) ? saved.componentItemIds.slice(0, 2).map((id) => id ? String(id) : "") : undefined,
    };
  });
}

function parseExtraTimeRows(raw: string | null | undefined): ExtraTimeRow[] {
  if (!raw) return defaultExtraTimeRows();
  try {
    const parsed = JSON.parse(raw) as { extraTimeRows?: Partial<ExtraTimeRow>[] };
    if (!Array.isArray(parsed.extraTimeRows)) return defaultExtraTimeRows();
    return normalizeExtraTimeRows(parsed.extraTimeRows.map((row) => ({
      key: String(row.key ?? ""),
      group: row.group === "group" ? "group" : "individual",
      label: String(row.label ?? ""),
      activity: String(row.activity ?? ""),
      packageType: String(row.packageType ?? ""),
      packagePrice: String(row.packagePrice ?? ""),
      playersCount: String(row.playersCount ?? ""),
      lessonsCount: String(row.lessonsCount ?? ""),
      durationMinutes: String(row.durationMinutes ?? ""),
      hourlyCost: String(row.hourlyCost ?? ""),
      packageDates: String(row.packageDates ?? ""),
      lessonTime: String(row.lessonTime ?? ""),
      coachName: String(row.coachName ?? ""),
      notes: String(row.notes ?? ""),
      parentVisible: row.parentVisible !== false,
    })));
  } catch {
    return defaultExtraTimeRows();
  }
}

function serializeKitRows(rows: KitRow[], extraRows?: ExtraTimeRow[]): string {
  const kitRows = rows.map((row) => ({
    key: row.key,
    label: row.label,
    area: row.area,
    price: row.assignment === "loan" ? "0" : row.price,
    assignment: row.assignment,
    quantity: row.quantity || "1",
    ordered: row.ordered,
    arrived: row.arrived,
    listItemId: row.listItemId || "",
    componentItemIds: row.componentItemIds,
  }));
  if (!extraRows) return JSON.stringify(kitRows);
  return JSON.stringify({
    kitRows,
    extraTimeRows: normalizeExtraTimeRows(extraRows),
  });
}

function extraTimeRowHasContent(row: ExtraTimeRow): boolean {
  return Boolean(
    row.packageType ||
    row.packagePrice ||
    row.lessonsCount ||
    row.packageDates ||
    row.lessonTime ||
    row.coachName ||
    row.notes ||
    (row.activity && row.activity !== "Tecnica"),
  );
}

function ExtraTimeSummary({ rows }: { rows: ExtraTimeRow[] }) {
  const visibleRows = normalizeExtraTimeRows(rows).filter(extraTimeRowHasContent);
  if (visibleRows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun Extra Time programmato.</p>;
  }
  return (
    <div className="space-y-2">
      {visibleRows.map((row) => (
        <div key={row.key} className="rounded-md border bg-background px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{row.group === "individual" ? "Allenamento individuale" : "Lezione di gruppo"}</p>
            <Badge variant="outline">{row.activity || "-"}</Badge>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><span className="text-muted-foreground">Pacchetto</span><p>{extraTimePackageLabel(row)}</p></div>
            <div><span className="text-muted-foreground">Lezioni</span><p>{row.lessonsCount || "0"} da {row.durationMinutes || "0"} min</p></div>
            {row.group === "group" && <div><span className="text-muted-foreground">Giocatori</span><p>{row.playersCount || "-"}</p></div>}
            <div><span className="text-muted-foreground">Date</span><p>{row.packageDates || "-"}</p></div>
            <div><span className="text-muted-foreground">Orario</span><p>{row.lessonTime || "-"}</p></div>
            <div><span className="text-muted-foreground">Mister/Preparatore</span><p>{row.coachName || "-"}</p></div>
          </div>
          {row.notes && (
            <div className="mt-2 rounded border bg-muted/30 px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</span>
              <p>{row.notes}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const EXTRA_TIME_ITEMS: Array<Pick<ExtraTimeRow, "key" | "group" | "label" | "activity">> = [
  { key: "individual_package", group: "individual", label: "Allenamento individuale", activity: "Tecnica" },
  { key: "group_package", group: "group", label: "Lezione di gruppo", activity: "Tecnica" },
];

const EXTRA_TIME_ACTIVITY_OPTIONS = [
  "Motoria",
  "Tecnica",
  "Motoria + tecnica",
  "Recupero infortuni",
  "Preparazione",
];

const EXTRA_TIME_PACKAGE_PRICES: Record<ExtraTimeRow["group"], Array<{ value: string; label: string; price: string }>> = {
  individual: [
    { value: "package_1", label: "Pacchetto 1", price: "35" },
    { value: "package_2", label: "Pacchetto 2", price: "45" },
    { value: "package_3", label: "Pacchetto 3", price: "50" },
  ],
  group: [
    { value: "package_1", label: "Pacchetto 1", price: "10" },
    { value: "package_2", label: "Pacchetto 2", price: "25" },
    { value: "package_3", label: "Pacchetto 3", price: "30" },
  ],
};

function extraTimePackageLabel(row: ExtraTimeRow): string {
  const item = EXTRA_TIME_PACKAGE_PRICES[row.group].find((entry) => entry.value === row.packageType);
  return item ? `${item.label} - Euro ${formatEuro(item.price)}` : "Seleziona pacchetto";
}

function extraTimePackagePrice(group: ExtraTimeRow["group"], value: string): string {
  return EXTRA_TIME_PACKAGE_PRICES[group].find((entry) => entry.value === value)?.price ?? "";
}

function extraTimePackageOptions(group: ExtraTimeRow["group"]) {
  return EXTRA_TIME_PACKAGE_PRICES[group];
}

function normalizeExtraTimeRows(rows: ExtraTimeRow[]): ExtraTimeRow[] {
  return defaultExtraTimeRows().map((base) => {
    const saved = rows.find((row) => row.key === base.key || row.group === base.group);
    return saved
      ? {
          ...base,
          activity: saved.activity || base.activity,
          packageType: saved.packageType || "",
          packagePrice: saved.packagePrice || extraTimePackagePrice(base.group, saved.packageType || ""),
          playersCount: saved.playersCount || base.playersCount,
          lessonsCount: saved.lessonsCount || "",
          durationMinutes: saved.durationMinutes || base.durationMinutes,
          hourlyCost: saved.hourlyCost || "",
          packageDates: saved.packageDates || "",
          lessonTime: saved.lessonTime || "",
          coachName: saved.coachName || "",
          notes: saved.notes || "",
          parentVisible: saved.parentVisible !== false,
        }
      : base;
  });
}

function defaultExtraTimeRows(): ExtraTimeRow[] {
  return EXTRA_TIME_ITEMS.map((item) => ({
    ...item,
    packageType: "",
    packagePrice: "",
    playersCount: item.group === "group" ? "2" : "1",
    lessonsCount: "",
    durationMinutes: "60",
    hourlyCost: "",
    packageDates: "",
    lessonTime: "",
    coachName: "",
    notes: "",
    parentVisible: true,
  }));
}

function extraTimeRowTotal(row: ExtraTimeRow): number {
  const lessons = Math.max(0, Number(row.lessonsCount) || 0);
  const packagePrice = parseEuroInput(row.packagePrice) || 0;
  if (packagePrice > 0) return lessons * packagePrice;
  const durationHours = Math.max(0, Number(row.durationMinutes) || 0) / 60;
  const hourlyCost = parseEuroInput(row.hourlyCost) || 0;
  return lessons * durationHours * hourlyCost;
}

function buildInstallmentDrafts(totalValue: string, countValue: string, firstDueDate: string): InstallmentDraft[] {
  const total = parseEuroInput(totalValue);
  const count = Math.max(1, Math.floor(Number(countValue) || 1));
  if (!isSafePlayerPaymentAmount(total)) return [];
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
      dueDate: Number.isNaN(due.getTime()) ? "" : due.toLocaleDateString("sv-SE"),
    };
  });
}

function rebalanceInstallments(drafts: InstallmentDraft[], index: number, value: string, totalValue: string): InstallmentDraft[] {
  const totalCents = Math.round((parseEuroInput(totalValue) || 0) * 100);
  const next = drafts.map((draft) => ({ ...draft }));
  next[index].amount = value;
  const fixedCents = Math.round((parseEuroInput(value) || 0) * 100);
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

const SPECIFIC_ROLE_OPTIONS = [
  { value: "CB", label: "CB - Centrale difesa" },
  { value: "LIB", label: "LIB - Libero" },
  { value: "FB", label: "FB - Esterno basso" },
  { value: "WB", label: "WB - Esterno" },
  { value: "BR", label: "BR - Braccetto" },
  { value: "CM", label: "CM - Centrocampista centrale" },
  { value: "WM", label: "WM - Centrocampista esterno" },
  { value: "REG", label: "REG - Play" },
  { value: "AM", label: "AM - Trequartista" },
  { value: "WF", label: "WF - Attaccante esterno" },
  { value: "ST", label: "ST - Attaccante centrale" },
  { value: "WA", label: "WA - Esterno alto" },
] as const;

function SpecificRoleSelect({
  value,
  onChange,
  disabled,
  placeholder = "Ruolo specifico",
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Select onValueChange={(v) => onChange(v === "_none" ? null : v)} value={value || "_none"} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Non indicato</SelectItem>
        {SPECIFIC_ROLE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LineupStatusSelect({
  value,
  onChange,
  disabled,
}: {
  value?: "starter" | "reserve" | null;
  onChange: (value: "starter" | "reserve" | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select onValueChange={(v) => onChange(v === "_none" ? null : v as "starter" | "reserve")} value={value || "_none"} disabled={disabled}>
      <SelectTrigger><SelectValue placeholder="Titolare/Riserva" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Non indicato</SelectItem>
        <SelectItem value="starter">Titolare</SelectItem>
        <SelectItem value="reserve">Riserva</SelectItem>
      </SelectContent>
    </Select>
  );
}

function specificRoleLabel(value?: string | null): string {
  if (!value) return "-";
  return SPECIFIC_ROLE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function lineupStatusLabel(value?: "starter" | "reserve" | string | null): string {
  if (value === "starter") return "Titolare";
  if (value === "reserve") return "Riserva";
  return "-";
}

function playerName(player: Pick<Player, "firstName" | "lastName">, order: PlayerNameOrder = "surname_first"): string {
  const firstName = String(player.firstName ?? "").trim();
  const lastName = String(player.lastName ?? "").trim();
  const parts = order === "surname_first" ? [lastName, firstName] : [firstName, lastName];
  return parts.filter(Boolean).join(" ");
}

function percentLabel(value: number | null): string {
  return value == null ? "N/D" : `${value}%`;
}

function usePlayerActivitySummary(playerId: number | undefined) {
  const { club, user, role } = useAuth();
  return useQuery<PlayerActivitySummary>({
    queryKey: ["/api/players", playerId, "activity-summary", club?.id, user?.id, role],
    queryFn: async () => {
      const res = await fetch(withApi(`/api/players/${playerId}/activity-summary`), { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: playerId != null,
  });
}

const profileDateLabel = (date?: string | null) => date ? date.split("-").reverse().join("/") : "";
const profileRoleLabel = (role?: string | null) =>
  ({ GK: "Portiere", DEF: "Difensore", MID: "Centrocampista", FWD: "Attaccante" } as Record<string, string>)[role ?? ""] ?? role ?? "—";
const profileMeasure = (value: number | null | undefined, unit: string) =>
  value == null ? "—" : value.toLocaleString("it-IT", { maximumFractionDigits: 2 }) + " " + unit;

function PlayerEntryValues({ entry, player, showIdentity, inputs }: {
  entry?: ProfileEntry;
  player: Player;
  showIdentity?: boolean;
  inputs?: Partial<Record<"height" | "weight", React.ReactNode>>;
}) {
  const values = entry ?? player;
  const label = entry?.source === "entry" ? "Dati d’ingresso" : "Primo dato disponibile";
  return <div className="mt-3 space-y-2">
    <p className="text-xs font-medium text-muted-foreground">{label}{entry?.date ? " · " + profileDateLabel(entry.date) : ""}</p>
    <dl className={showIdentity ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" : "grid grid-cols-2 gap-2 sm:grid-cols-4"}>
      {[
        ...(showIdentity ? [["Nazionalità", player.nationality || "—"], ["Data di nascita", profileDateLabel(player.dateOfBirth) || "—"]] : []),
        [entry?.source === "entry" ? "Ruolo iniziale" : "Primo ruolo noto", profileRoleLabel(values.position)],
        [entry?.source === "entry" ? "Maglia iniziale" : "Prima maglia nota", values.jerseyNumber ?? "—"],
      ].map(([title, value]) => <div key={title} className="min-w-0 rounded-md border bg-muted/25 p-2">
        <dt className="text-xs text-muted-foreground">{title}</dt>
        <dd className="break-words text-sm font-medium">{value}</dd>
      </div>)}
      {(["height", "weight"] as const).map(field => <div key={field} className="min-w-0 rounded-md border bg-muted/25 p-2">
        {inputs?.[field] ?? <>
          <dt className="text-xs text-muted-foreground">{field === "height" ? "Altezza" : "Peso"}</dt>
          <dd className="break-words text-sm font-medium">{profileMeasure(values[field], field === "height" ? "cm" : "kg")}</dd>
        </>}
      </div>)}
    </dl>
  </div>;
}

function PlayerActivitySummaryPanel({ player, isYouthSection, summary }: {
  player: Player;
  isYouthSection: boolean;
  summary: ReturnType<typeof usePlayerActivitySummary>;
}) {
  const { t } = useLanguage();
  const { data, isLoading, isError } = summary;
  const profile = data?.profile;
  const changes = [...(profile?.changes ?? [])].reverse();
  const latestRole = changes.find(change => change.role);
  const latestJersey = changes.find(change => change.jersey);
  return (
    <details className="group rounded-lg border p-3" open>
      <DisclosureSummary className="flex cursor-pointer list-none items-center justify-between gap-3" indicator={false}>
        <span className="flex-1 text-sm font-semibold">Storico sportivo automatico</span>
        <span className="text-xs text-muted-foreground">Sola lettura</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </DisclosureSummary>
      {isLoading ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      ) : isError || !data ? (
        <p className="mt-3 text-sm text-muted-foreground">Riepilogo non disponibile.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {profile && <section className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-semibold">Crescita e percorso</h3>
            <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {[
                { label: "Altezza · Test", value: profileMeasure(profile.height?.value, "cm"), date: profile.height?.date },
                { label: "Peso · Test", value: profileMeasure(profile.weight?.value, "kg"), date: profile.weight?.date },
                { label: "Ruolo assegnato", value: profileRoleLabel(player.position), date: latestRole?.date },
                { label: "Maglia attuale", value: player.jerseyNumber ?? "—", date: latestJersey?.date },
              ].map(item => <div key={item.label} className="min-w-0 rounded-md border border-primary/15 bg-primary/5 p-2">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="break-words text-sm font-semibold">{item.value}</dd>
                {item.date && <dd className="text-xs text-muted-foreground">{profileDateLabel(item.date)}</dd>}
              </div>)}
            </dl>
            {profile.observedRole && <p className="text-xs text-muted-foreground">Ruolo osservato nel test · {profileRoleLabel(profile.observedRole.value)} · {profileDateLabel(profile.observedRole.date)}</p>}
            {changes.length > 0 && <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
              {changes.map((change, index) => <li key={index} className="break-words">
                {[profileDateLabel(change.date), change.team, change.season].filter(Boolean).join(" · ")}
                {change.role && <> · Ruolo {profileRoleLabel(change.role.from)} → {profileRoleLabel(change.role.to)}</>}
                {change.jersey && <> · Maglia {change.jersey.from ?? "—"} → {change.jersey.to ?? "—"}</>}
              </li>)}
            </ul>}
          </section>}
          {data.period && <p className="text-xs text-muted-foreground">Stagione: {data.period.start.split("-").reverse().join("/")} – {data.period.through.split("-").reverse().join("/")}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                Presenze allenamenti
              </div>
              <div className="mt-2 text-2xl font-bold">{percentLabel(data.trainingAttendance.percentage)}</div>
              <p className="text-xs text-muted-foreground">
                {data.trainingAttendance.present}/{data.trainingAttendance.totalPastSessions} presenti
                {data.trainingAttendance.unrecorded > 0 ? ` - ${data.trainingAttendance.unrecorded} non registrati` : ""}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-primary" />
                Presenze partite
              </div>
              <div className="mt-2 text-2xl font-bold">{percentLabel(data.matchAttendance.percentage)}</div>
              <p className="text-xs text-muted-foreground">
                {data.matchAttendance.appearances}/{data.matchAttendance.recorded ?? data.matchAttendance.totalPastMatches} partite con resoconto · {data.matchAttendance.callups} convocazioni
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.matchAttendance.minutes != null ? `${data.matchAttendance.minutes} minuti effettivi` : "Minuti effettivi non registrati"}
                {(data.matchAttendance.unrecorded ?? 0) > 0 ? ` · ${data.matchAttendance.unrecorded} convocazioni senza resoconto` : ""}
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" />
              Risultati test
            </div>
            {data.fitnessTests.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nessun test registrato.</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {data.fitnessTests.map((test) => (
                  <div key={test.id} className="rounded border bg-background px-2 py-1.5 text-xs">
                    <div className="font-medium">{new Date(`${test.date}T00:00:00`).toLocaleDateString("it-IT")}</div>
                    <div className="text-muted-foreground">
                      Resistenza {test.endurance ?? "-"} - Forza {test.strength ?? "-"} - Velocita {test.speed ?? "-"}
                    </div>
                    {test.notes ? <div className="mt-0.5 text-muted-foreground">{test.notes}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Condotta
            </div>
            <p className="mt-2 text-sm">{data.conduct.status}</p>
            {data.conduct.reason ? <p className="text-xs text-muted-foreground">Motivo: {reasonLabel(data.conduct.reason, t)}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded border bg-background px-2 py-0.5">Ottima: {data.conduct.training?.ottima ?? 0}</span>
              <span className="rounded border bg-background px-2 py-0.5">Buona: {data.conduct.training?.buona ?? 0}</span>
              <span className="rounded border bg-background px-2 py-0.5">Insufficiente: {data.conduct.training?.insufficiente ?? 0}</span>
            </div>
          </div>

          {isYouthSection && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Cartellini settore giovanile
              </div>
              {data.discipline.cards.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nessun cartellino registrato.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {data.discipline.cards.map((card, index) => (
                    <div key={`${card.id ?? index}`} className="rounded border bg-background px-2 py-1 text-xs">
                      {card.date ? new Date(card.date).toLocaleDateString("it-IT") : "-"} - {card.type ?? "Cartellino"} - {card.reason ?? "altro"}
                      {card.opponent ? ` - vs ${card.opponent}` : ""}
                      {card.notes ? ` - ${card.notes}` : ""}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Motivazioni: proteste, fallo di gioco, altro.</p>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

function comparePlayersBySurname(a: Pick<Player, "firstName" | "lastName">, b: Pick<Player, "firstName" | "lastName">): number {
  return playerName(a, "surname_first").localeCompare(playerName(b, "surname_first"), "it", {
    sensitivity: "base",
    numeric: true,
  });
}

function phoneHref(value?: string | null): string | null {
  const cleaned = String(value ?? "").replace(/[^\d+]/g, "");
  return cleaned.length >= 5 ? `tel:${cleaned}` : null;
}

function PhoneLink({ value }: { value?: string | null }) {
  const href = phoneHref(value);
  if (!href) return <p>-</p>;
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      <Phone className="h-3.5 w-3.5" />
      {value}
    </a>
  );
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

function importTeamAliases(team: { name?: unknown; category?: unknown; ageGroup?: unknown }): string[] {
  const label = normalizeImportTeamName([team.name, team.category, team.ageGroup].filter(Boolean).join(" "));
  const aliases = new Set<string>();
  [team.name, team.category, team.ageGroup, [team.category, team.ageGroup].filter(Boolean).join(" ")]
    .map((value) => normalizeImportTeamName(String(value ?? "")))
    .filter(Boolean)
    .forEach((value) => aliases.add(value));

  const addYears = (...years: string[]) => years.forEach((year) => aliases.add(normalizeImportTeamName(year)));
  if (/\ballievi\b/.test(label) && /\ba\b/.test(label)) addYears("2010");
  if (/\ballievi\b/.test(label) && /\bb\b/.test(label)) addYears("2011");
  if (/\bgiovanissimi\b/.test(label) && /\ba\b/.test(label)) addYears("2012");
  if (/\bgiovanissimi\b/.test(label) && /\bb\b/.test(label)) addYears("2013");
  if (/\besordienti\b/.test(label) && /\b2o?\s*anno\b/.test(label)) addYears("2014");
  if (/\besordienti\b/.test(label) && /\b1o?\s*anno\b/.test(label)) addYears("2015");
  if (/\bpulcini\b/.test(label) && /\b2o?\s*anno\b/.test(label)) addYears("2016");
  if (/\bpulcini\b/.test(label) && /\b1o?\s*anno\b/.test(label)) addYears("2017");
  if (/\bprimi\s+calci\b/.test(label) && /\b2o?\s*anno\b/.test(label)) addYears("2018");
  if (/\bprimi\s+calci\b/.test(label) && /\b1o?\s*anno\b/.test(label)) addYears("2019");
  if (/\bpiccoli\s+amici\b/.test(label)) addYears("2020", "2021");
  if (/\bjuniores\b/.test(label)) addYears("juniores");
  if (/\bprima\s+squadra\b/.test(label)) addYears("prima squadra");

  return Array.from(aliases).filter(Boolean);
}

function findTeamForResolvedPlayerImport(
  teams: { id: number; name: string; category?: string | null; ageGroup?: string | null; clubSection?: ClubSection }[],
  resolvedTeam: ReturnType<typeof resolveImportedPlayerRowTeam> | null,
  fallbackName: string,
) {
  const targetName = normalizeImportTeamName(resolvedTeam?.teamName ?? fallbackName);
  const targetCategory = normalizeImportTeamName(resolvedTeam?.category ?? fallbackName);
  const targetSection = resolvedTeam?.clubSection;
  const scopedTeams = targetSection ? teams.filter((team) => team.clubSection === targetSection) : teams;

  return (
    scopedTeams.find((team) => normalizeImportTeamName(team.name) === targetName) ??
    scopedTeams.find((team) => normalizeImportTeamName(team.category) === targetCategory) ??
    scopedTeams.find((team) => importTeamAliases(team).includes(targetName)) ??
    undefined
  );
}

function playerImportFingerprint(player: { firstName?: unknown; lastName?: unknown; dateOfBirth?: unknown }) {
  return [
    normalizeImportTeamName(String(player.lastName ?? "")),
    normalizeImportTeamName(String(player.firstName ?? "")),
    normalizeImportDateKey(player.dateOfBirth),
  ].join("|");
}

function playerImportNameKey(player: { firstName?: unknown; lastName?: unknown }) {
  return [
    normalizeImportTeamName(String(player.lastName ?? "")),
    normalizeImportTeamName(String(player.firstName ?? "")),
  ].join("|");
}

function playerImportRegistrationKey(player: { registrationNumber?: unknown }) {
  return normalizeImportTeamName(String(player.registrationNumber ?? ""));
}

function playerImportPhoneKey(player: { phone?: unknown }) {
  return String(player.phone ?? "").replace(/\D+/g, "");
}

function playerImportDateTeamPhoneKey(player: { dateOfBirth?: unknown; teamId?: unknown; phone?: unknown }) {
  const phone = playerImportPhoneKey(player);
  if (!phone) return "";
  return [
    normalizeImportDateKey(player.dateOfBirth),
    Number(player.teamId ?? 0) || "",
    phone,
  ].join("|");
}

function findExistingPlayerForImport(candidates: Player[] | undefined, mappedDate: string, mappedTeamId: number): Player | undefined {
  const list = candidates ?? [];
  if (list.length === 0) return undefined;

  if (mappedDate) {
    const sameDate = list.filter((player) => normalizeImportDateKey(player.dateOfBirth) === mappedDate);
    if (sameDate.length === 1) return sameDate[0];
    if (mappedTeamId) {
      const sameDateAndTeam = sameDate.filter((player) => Number(player.teamId ?? 0) === mappedTeamId);
      if (sameDateAndTeam.length === 1) return sameDateAndTeam[0];
    }
  }

  if (mappedTeamId) {
    const sameTeam = list.filter((player) => Number(player.teamId ?? 0) === mappedTeamId);
    if (sameTeam.length === 1) return sameTeam[0];
  }

  return list.length === 1 ? list[0] : undefined;
}

function normalizeImportDateKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const european = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (european) {
    const year = european[3].length === 2 ? `20${european[3]}` : european[3];
    return `${year}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}`;
  }
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return normalizeImportTeamName(raw);
}

function compactImportPayload(mapped: Record<string, unknown>, existing?: Player): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const hasIncomingRegistered = Object.prototype.hasOwnProperty.call(mapped, "registered") && mapped.registered !== undefined && mapped.registered !== "";
  const hasIncomingCertificate = Object.prototype.hasOwnProperty.call(mapped, "medicalCertificateExpiry") && Boolean(mapped.medicalCertificateExpiry);
  for (const [key, value] of Object.entries(mapped)) {
    if (value === undefined || value === "" || value === null) continue;
    if (typeof value === "number" && Number.isNaN(value)) continue;
    payload[key] = value;
  }

  if (existing) {
    payload.firstName = existing.firstName;
    payload.lastName = existing.lastName;
    payload.status = payload.status ?? existing.status ?? "active";
    payload.teamId = payload.teamId ?? existing.teamId ?? null;
  } else {
    payload.status = payload.status ?? "active";
  }

  const registered = hasIncomingRegistered
    ? payload.registered === true
    : existing
      ? existing.registered === true
      : false;
  const certificate = String(payload.medicalCertificateExpiry ?? existing?.medicalCertificateExpiry ?? "");
  const hasValidCertificate = isMedicalCertificateValid(certificate);
  const shouldRecalculateAvailability = !existing || hasIncomingRegistered || hasIncomingCertificate;
  if (registered && hasValidCertificate) {
    payload.available = true;
    payload.status = "active";
    payload.unavailabilityReason = null;
    payload.expectedReturn = null;
  } else if (shouldRecalculateAvailability) {
    payload.available = false;
    payload.status = "inactive";
    if (!payload.unavailabilityReason) {
      payload.unavailabilityReason = "other";
    }
  }

  return payload;
}

async function fetchPlayersForImport(_section?: ClubSection): Promise<Player[]> {
  const urls = ["/api/players?section=all", "/api/players"];
  for (const url of urls) {
    const res = await fetch(withApi(url), { credentials: "include" });
    if (res.ok) return res.json() as Promise<Player[]>;
  }
  return [];
}

async function importErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      return String(parsed.error ?? parsed.message ?? text);
    } catch {
      return text;
    }
  } catch {
    return fallback;
  }
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
  if (reason === "regular") return "Regolare";
  if (reason === "suspended") return "Sospeso";
  if (reason === "pending_transfer") return "In attesa di trasferimento";
  if (reason === "other") return t.otherReason;
  return reason || "—";
}

type TeamWithSeason = Team & {
  seasonId?: number | null;
  seasonName?: string | null;
  [key: string]: unknown;
};

type TeamStaffAssignmentLite = {
  userId?: number | null;
  role?: string | null;
  staffRole?: string | null;
};

function staffRoleForSection(raw: string | null | undefined, section: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { bySection?: Record<string, string> };
    if (parsed?.bySection && typeof parsed.bySection === "object") {
      if (section && parsed.bySection[section]) return parsed.bySection[section];
      return Object.values(parsed.bySection)[0] ?? null;
    }
  } catch {
    return raw;
  }
  return raw;
}

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
  supplementalSquad?: "A" | "B" | "C" | "D" | null;
  imageUrl?: string | null;
  supplementalTeamId?: number | null;
  primarySpecificRole?: string | null;
  primaryLineupStatus?: "starter" | "reserve" | null;
  supplementalSpecificRole?: string | null;
  supplementalLineupStatus?: "starter" | "reserve" | null;
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
        supplementalSquad: parsed?.supplementalSquad ?? null,
        imageUrl: parsed?.imageUrl ?? null,
        supplementalTeamId: parsed?.supplementalTeamId ?? null,
        primarySpecificRole: parsed?.primarySpecificRole ?? null,
        primaryLineupStatus: parsed?.primaryLineupStatus ?? null,
        supplementalSpecificRole: parsed?.supplementalSpecificRole ?? null,
        supplementalLineupStatus: parsed?.supplementalLineupStatus ?? null,
      },
    };
  } catch {
    return { notesRaw: full, meta: {} };
  }
}

function composePlayerMeta(notesRaw: string, meta: PlayerMeta): string {
  const cleanNotes = notesRaw.trim();
  const hasAnyMeta = Boolean(
    meta?.squad ||
    meta?.supplementalSquad ||
    meta?.imageUrl ||
    meta?.supplementalTeamId ||
    meta?.primarySpecificRole ||
    meta?.primaryLineupStatus ||
    meta?.supplementalSpecificRole ||
    meta?.supplementalLineupStatus
  );
  if (!hasAnyMeta) return cleanNotes;
  const encoded = `${PLAYER_META_MARKER}${JSON.stringify({
    squad: meta.squad ?? null,
    supplementalSquad: meta.supplementalSquad ?? null,
    imageUrl: meta.imageUrl ?? null,
    supplementalTeamId: meta.supplementalTeamId ?? null,
    primarySpecificRole: meta.primarySpecificRole ?? null,
    primaryLineupStatus: meta.primaryLineupStatus ?? null,
    supplementalSpecificRole: meta.supplementalSpecificRole ?? null,
    supplementalLineupStatus: meta.supplementalLineupStatus ?? null,
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

function addMonthsMinusOneDay(dateValue: string, months: number): string {
  if (!dateValue || months <= 0) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
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

function teamAnnataLabel(team: TeamWithSeason): string {
  const base = String(team.category || team.ageGroup || team.name || "").trim();
  return base || "Senza annata";
}

function importSeasonStartYearFromTeams(teams: TeamWithSeason[]): number | null {
  const years = teams
    .map((team) => importSeasonStartYear(team.seasonName ?? ""))
    .filter((year) => Number.isFinite(year) && year >= 2020 && year <= 2100);

  if (years.length === 0) return null;

  const counts = new Map<number, number>();
  years.forEach((year) => counts.set(year, (counts.get(year) ?? 0) + 1));

  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0]?.[0] ?? null;
}

function importSeasonStartYearFromSeasons(seasons: SeasonOption[]): number | null {
  const years = seasons
    .map((season) => importSeasonStartYear(season.name || season.startDate))
    .filter((year) => Number.isFinite(year) && year >= 2020 && year <= 2100);

  return years.length > 0 ? Math.max(...years) : null;
}

export default function PlayersList({ section: pageSection }: PlayersListProps = {}) {
  const technicalScope = useTechnicalScope();
  const section = technicalScope.enabled ? technicalScope.section : pageSection;
  const { t } = useLanguage();
  const { role, user, club } = useAuth();
  const nr = normalizeSessionRole(role);
  const [location] = useLocation();
  const initialTeamFilter = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("teamId") || "all"
    : "all";
  const [teamFilter, setTeamFilter] = useState<string>(initialTeamFilter);
  const isAssignedStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";
  const playersUrl = section
    ? `/api/players?section=${encodeURIComponent(section)}`
    : "/api/players";
  const selectedTeamId = Number(teamFilter);
  const selectedTeamIdForFetch = Number.isFinite(selectedTeamId) && selectedTeamId > 0 ? selectedTeamId : null;
  const { data: sectionPlayers, isLoading: isPlayersLoading } = useQuery<Player[]>({
    queryKey: ["/api/players", section || "all", nr, "players-page"],
    queryFn: async () => {
      const res = await fetch(withApi(playersUrl), { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Player[]>;
    },
  });
  const { data: selectedTeamPlayers = [], isLoading: isSelectedTeamPlayersLoading } = useQuery<Player[]>({
    queryKey: ["/api/players", "team", selectedTeamIdForFetch, nr, "players-page"],
    enabled: !!selectedTeamIdForFetch,
    queryFn: async () => {
      const res = await fetch(withApi(`/api/players?teamId=${selectedTeamIdForFetch}`), { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Player[]>;
    },
  });
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", section || "all"],
    queryFn: async () => {
      const url = section
        ? `/api/teams?section=${encodeURIComponent(section)}`
        : "/api/teams";
      const res = await fetch(withApi(url), { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Team[]>;
    },
  });
  const players = useMemo(() => {
    const byId = new Map<number, Player>();
    (sectionPlayers ?? []).forEach((player) => byId.set(player.id, player));
    selectedTeamPlayers.forEach((player) => byId.set(player.id, player));
    return Array.from(byId.values()).filter(player=>!technicalScope.enabled||technicalScope.teams.some(team=>(!section||team.clubSection===section)&&(!technicalScope.teamId||team.id===technicalScope.teamId)&&(player.teamId===team.id||player.supplementalTeamId===team.id))||!technicalScope.teamId&&!player.teamId&&!player.supplementalTeamId&&technicalScope.sections.some(allowed=>allowed===player.clubSection&&(!section||section===allowed)));
  }, [sectionPlayers, selectedTeamPlayers, technicalScope.enabled, technicalScope.teams, technicalScope.teamId, technicalScope.sections, section]);
  const isLoading =
    isPlayersLoading ||
    (!!selectedTeamIdForFetch && isSelectedTeamPlayersLoading && (sectionPlayers?.length ?? 0) === 0);
  const { data: importTeams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", "import-scope"],
    queryFn: async () => {
      const res = await fetch(withApi("/api/teams?section=all"), { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<Team[]>;
    },
  });
  const { data: clubMembers = [] } = useListClubMembers();
  const { data: parentAccessCredentials } = useQuery<ParentAccessCredentials>({
    queryKey: ["/api/clubs/me/credentials"],
    queryFn: async () => {
      const res = await fetch(withApi("/api/clubs/me/credentials"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load parent credentials");
      return res.json();
    },
    enabled: nr === "secretary" || nr === "sporting_director",
  });
  const { data: seasons = [] } = useQuery<SeasonOption[]>({
    queryKey: ["/api/seasons"],
    queryFn: async () => {
      const res = await fetch(withApi("/api/seasons"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load seasons");
      return res.json();
    },
  });
  const activeSeason = seasons.find((season) => season.isActive) ?? seasons[seasons.length - 1] ?? null;
  const importSeasonTeams = section
    ? (teams as TeamWithSeason[]).filter((team) => team.clubSection === section)
    : (teams as TeamWithSeason[]);
  const seasonStartYearForImport = importSeasonStartYearFromTeams(importSeasonTeams)
    ?? importSeasonStartYearFromSeasons(seasons)
    ?? importSeasonStartYear(activeSeason?.name ?? activeSeason?.startDate);
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
    queryKey: ["/api/equipment", club?.id, user?.id, nr],
    enabled: canViewKit,
    queryFn: async () => {
      const res = await fetch(withApi("/api/equipment"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load player equipment");
      return res.json();
    },
  });
  const { data: warehouseListItems = [], isPending: priceListPending, isError: priceListError } = useQuery<WarehouseListItem[]>({
    queryKey: ["/api/warehouse-items", "price-list", club?.id, user?.id, nr],
    enabled: canViewFinancials || canViewKit,
    queryFn: async () => {
      const res = await fetch(withApi("/api/warehouse-items?section=all"), { credentials: "include" });
      if (!res.ok) throw new Error("Impossibile caricare il listino.");
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
  const [createParentFamilyId, setCreateParentFamilyId] = useState<number>();
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const playerActivity = usePlayerActivitySummary(editingPlayer?.id);
  const [playerDialogMode, setPlayerDialogMode] = useState<"view" | "edit">("view");
  const [openedFromQuery, setOpenedFromQuery] = useState(false);
  const [formSeasonFilter, setFormSeasonFilter] = useState<string>("all");
  const [formAnnataFilter, setFormAnnataFilter] = useState<string>("all");
  const [createMedicalCertificateDate, setCreateMedicalCertificateDate] = useState("");
  const [createMedicalCustomPeriod, setCreateMedicalCustomPeriod] = useState(false);
  const [createMedicalPeriod, setCreateMedicalPeriod] = useState("12");
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
  const [registrationFeeTotal, setRegistrationFeeTotal] = useState("");
  const [registrationFeeListItemId, setRegistrationFeeListItemId] = useState("");
  const [insuranceFeeTotal, setInsuranceFeeTotal] = useState("");
  const [annualFeeTotal, setAnnualFeeTotal] = useState("");
  const [annualFeeListItemId, setAnnualFeeListItemId] = useState("");
  const [insuranceFeeListItemId, setInsuranceFeeListItemId] = useState("");
  const [shuttleFeeListItemId, setShuttleFeeListItemId] = useState("");
  const [depositDrafts, setDepositDrafts] = useState([{ id: "first", amount: "", purpose: "Generale", method: "", paymentDate: "" }]);
  const [economicPlanPaid, setEconomicPlanPaid] = useState(false);
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
  const [shuttleMonthsCount, setShuttleMonthsCount] = useState("1");
  const [shuttlePaymentDueDate, setShuttlePaymentDueDate] = useState("");
  const [extraTimeRows, setExtraTimeRows] = useState<ExtraTimeRow[]>(defaultExtraTimeRows);
  const [isSavingKit, setIsSavingKit] = useState(false);
  const [parentDelegateRows, setParentDelegateRows] = useState<ParentDelegate[]>([emptyParentDelegate()]);
  const [isSavingParentDelegates, setIsSavingParentDelegates] = useState(false);
  const [delegateToReset, setDelegateToReset] = useState<{ playerId: number; delegateId: number; name: string } | null>(null);
  const [isResettingDelegate, setIsResettingDelegate] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPrimaryCoachForPlayer = (player?: Player | null) => {
    if (nr !== "coach" || !user?.id || !player?.teamId) return false;
    const team = (teams as TeamWithSeason[] | undefined)?.find((item) => Number(item.id) === Number(player.teamId));
    if (!team) return false;
    const teamRecord = team as Record<string, unknown>;
    if (Number(teamRecord.coachId ?? 0) === Number(user.id)) return true;
    const teamStaff = ((teamRecord.assignedStaff ?? []) as TeamStaffAssignmentLite[]);
    return teamStaff.some((staff) =>
      Number(staff.userId ?? 0) === Number(user.id) &&
      staff.role === "coach" &&
      staffRoleForSection(staff.staffRole, String(teamRecord.clubSection ?? "")) === "primo_allenatore"
    );
  };
  const canPrimaryCoachEditRole =
    playerDialogMode === "edit" &&
    isPrimaryCoachForPlayer(editingPlayer);
  const canManagePlayers = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"].includes(nr);
  const canDeletePlayer = canManagePlayers;
  const canWritePlayerNotes = ["admin", "presidente", "director", "sporting_director", "technical_director", "coach", "fitness_coach", "athletic_director", "secretary"].includes(nr);
  const canEditSportAvailability = ["technical_director", "coach", "fitness_coach", "athletic_director"].includes(nr) && playerDialogMode === "edit";
  const isLimitedEditor = !canManagePlayers && canWritePlayerNotes && !canEditSportAvailability;
  const canEditFullPlayer = canManagePlayers && playerDialogMode === "edit";
  const canResetParentAccess = canEditFullPlayer && ["secretary", "admin", "presidente"].includes(nr);
  const canEditFinancials = nr === "secretary" && playerDialogMode === "edit";
  const canViewExtraTime = Boolean(editingPlayer);
  const canEditAvailability = (canManagePlayers || canEditSportAvailability) && playerDialogMode === "edit";
  const canForceAvailability = ["admin", "presidente", "director", "secretary"].includes(nr) && playerDialogMode === "edit";
  const canEditRoleAndSquad = canManagePlayers && playerDialogMode === "edit";
  const canEditPlayerRole = (canManagePlayers || canPrimaryCoachEditRole) && playerDialogMode === "edit";
  const canUploadPlayerImage = canManagePlayers && playerDialogMode === "edit";
  const canEditSupplementalTeam = canManagePlayers && playerDialogMode === "edit";
  const canExport = nr === "admin" || nr === "secretary" || nr === "director" || nr === "technical_director";
  const isStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "technical_director" || nr === "athletic_director";
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
  const kitTotal = displayedKitRows.reduce((sum, row) => sum + kitRowTotal(row), 0);
  const editingKitPayments = editingPlayerPayments.filter((payment) => payment.paymentType === "kit_payment");
  const editingKitPayment = editingKitPayments[0];
  const editingShuttlePayments = editingPlayerPayments.filter((payment) => payment.paymentType === "shuttle_monthly");
  const editingShuttlePayment = editingShuttlePayments[0];
  const plannedRegistrationFee = parseEuroInput(registrationFeeTotal);
  const plannedAnnualFee = parseEuroInput(annualFeeTotal);
  const plannedInsuranceFee = parseEuroInput(insuranceFeeTotal);
  const plannedShuttleFee = parseEuroInput(shuttleMonthlyCost);
  const plannedShuttleMonths = Math.max(0, Math.floor(Number(shuttleMonthsCount) || 0));
  const plannedKitTotal = kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0);
  const normalizedExtraTimeRows = normalizeExtraTimeRows(extraTimeRows);
  const displayedExtraTimeRows = editingPlayerEquipment ? parseExtraTimeRows(editingPlayerEquipment.trainingKit) : normalizedExtraTimeRows;
  const plannedExtraTimeTotal = normalizedExtraTimeRows.reduce((sum, row) => sum + extraTimeRowTotal(row), 0);
  const editingPlayerTeam = editingPlayer?.teamId ? teams?.find((team) => team.id === editingPlayer.teamId) : undefined;
  const editingPlayerMeta = splitPlayerMeta(editingPlayer?.notes ?? "").meta;
  const editingSupplementalTeamId =
    editingPlayer?.supplementalTeamId ??
    editingPlayerMeta.supplementalTeamId ??
    null;
  const editingSupplementalTeam = editingSupplementalTeamId
    ? teams?.find((team) => team.id === editingSupplementalTeamId)
    : undefined;
  const editingPrimarySpecificRole = editingPlayer?.primarySpecificRole ?? editingPlayerMeta.primarySpecificRole ?? null;
  const editingPrimaryLineupStatus = editingPlayer?.primaryLineupStatus ?? editingPlayerMeta.primaryLineupStatus ?? null;
  const editingSupplementalSpecificRole = editingPlayer?.supplementalSpecificRole ?? editingPlayerMeta.supplementalSpecificRole ?? null;
  const editingSupplementalLineupStatus = editingPlayer?.supplementalLineupStatus ?? editingPlayerMeta.supplementalLineupStatus ?? null;
  const editingPrimarySquad = editingPlayer?.squad ?? editingPlayerMeta.squad ?? null;
  const editingSupplementalSquad = editingPlayer?.supplementalSquad ?? editingPlayerMeta.supplementalSquad ?? null;
  const editingPlayerIsYouthSection = (editingPlayerTeam as any)?.clubSection === "settore_giovanile" || section === "settore_giovanile";
  const extraTimeAssignableStaff = (clubMembers as ClubMember[])
    .filter((member) => {
      const memberSections = Array.isArray(member.clubSection) ? member.clubSection : [member.clubSection ?? ""];
      return ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(member.role) && memberSections.includes("extra_time");
    })
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it"));
  const depositAmounts = depositDrafts.map(draft => draft.amount === "" ? 0 : parseEuroInput(draft.amount));
  const extraDepositCents = depositAmounts.slice(1).reduce((sum, amount) => sum + Math.round(amount * 100), 0);
  const economicBalance = playerEconomicBalance({
    registration: isSafePlayerPaymentAmount(plannedRegistrationFee) ? plannedRegistrationFee : 0,
    annual: isSafePlayerPaymentAmount(plannedAnnualFee) ? plannedAnnualFee : 0,
    insurance: isSafePlayerPaymentAmount(plannedInsuranceFee) ? plannedInsuranceFee : 0,
    shuttle: isSafePlayerPaymentAmount(plannedShuttleFee) ? plannedShuttleFee * plannedShuttleMonths : 0,
    kit: plannedKitTotal,
  }, plannedExtraTimeTotal, editingPlayerPayments,
  !registrationFeeTotal && !annualFeeTotal && !insuranceFeeTotal,
  (Math.round(depositAmounts[0] * 100) + extraDepositCents) / 100, economicPlanPaid);
  const { quotes: plannedQuotesTotal, savedPlanBalance, total: plannedEconomicTotal, alreadyPaid: plannedAlreadyPaid, upfront: plannedUpfrontAmount,
    outstanding: plannedOutstanding, residual: plannedResidualTotal } = economicBalance;
  const deposits = depositDrafts.map((draft, index) => ({
    ...draft,
    amount: economicPlanPaid && index === 0
      ? (Math.round(plannedOutstanding * 100) - extraDepositCents) / 100
      : depositAmounts[index],
  }));
  function updateDeposit(id: string, patch: Partial<Omit<(typeof depositDrafts)[number], "id">>) {
    setDepositDrafts(drafts => drafts.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }
  const paymentToday = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const overduePlayerPayments = editingPlayerPayments.filter(payment => paymentStatus(payment, paymentToday) === "overdue");
  const editingMedicalCertificate = editingPlayerDocuments
    .filter((doc) => doc.type === "medicalCertificate")
    .sort((a, b) => String(b.expiryDate ?? "").localeCompare(String(a.expiryDate ?? "")))[0] ?? null;
  const activeListItems = warehouseListItems.filter((item) => item.isActive !== 0 && item.price != null);
  const registrationFeeListItems = activeListItems.filter((item) => item.itemType === "registration_fee");
  const annualFeeListItems = activeListItems.filter((item) => item.itemType === "annual_fee");
  const insuranceFeeListItems = activeListItems.filter((item) => item.itemType === "insurance_fee");
  const shuttleFeeListItems = activeListItems.filter((item) => item.itemType === "shuttle_fee");
  const kitListItems = activeListItems.filter((item) =>
    item.section === "apparel" &&
    !["registration_fee", "annual_fee", "insurance_fee", "shuttle_fee"].includes(item.itemType)
  );
  const currentMedicalExpiry = editingMedicalCertificate?.expiryDate ?? editingPlayer?.medicalCertificateExpiry ?? null;
  const currentMedicalDaysLeft = currentMedicalExpiry
    ? Math.ceil((new Date(`${currentMedicalExpiry}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const registrationSectionStatus = (() => {
    const registered = editingPlayer?.registered === true;
    const medicalValid = isMedicalCertificateValid(currentMedicalExpiry);
    if (!registered && !medicalValid) return { tone: "red" as const, label: "Mancante" };
    if (!registered || !medicalValid || (currentMedicalDaysLeft !== null && currentMedicalDaysLeft <= 60)) return { tone: "yellow" as const, label: "Da verificare" };
    return { tone: "green" as const, label: "Completo" };
  })();
  const documentSectionStatus = (() => {
    const uploadedTypes = new Set(editingPlayerDocuments.map((doc) => doc.type));
    if (uploadedTypes.size === 0) return { tone: "red" as const, label: "Nessun documento" };
    if (PLAYER_DOCUMENT_TYPES.some((docType) => !uploadedTypes.has(docType.value))) return { tone: "yellow" as const, label: "Manca qualcosa" };
    return { tone: "green" as const, label: "Completo" };
  })();
  const paymentSectionStatus = quotePaymentStatus(editingPlayerPayments, paymentToday);
  const { data: playerKitRequests = [], isError: kitRequestsError, isPending: kitRequestsPending } = useQuery<KitRequestLine[]>({
    queryKey: ["/api/warehouse-kit-requests", club?.id, user?.id, editingPlayer?.id],
    enabled: Boolean(editingPlayer && (canViewFinancials || nr === "sporting_director")),
    queryFn: async () => {
      const response = await fetch(withApi(`/api/warehouse-kit-requests?playerId=${editingPlayer?.id}`), { credentials: "include" });
      if (!response.ok) throw new Error("Richieste kit non disponibili");
      return response.json();
    },
  });
  const currentKitRequests = playerKitRequests.filter((line) => !line.archived);
  const kitSectionStatus = (() => {
    const activeRows = displayedKitRows.filter(kitRowHasContent);
    if (activeRows.length === 0) return { tone: "red" as const, label: "Non registrato" };
    if (currentKitRequests.some((line) => line.status === "pending")) return { tone: "yellow" as const, label: "Da ordinare" };
    const activeIds = priceListPending || priceListError ? undefined : new Set(kitListItems.map((item) => String(item.id)));
    if (activeRows.some((row) => kitRowNeedsLink(row, activeIds))) {
      return { tone: "yellow" as const, label: "Da collegare" };
    }
    if (activeRows.every((row) => currentKitRequests.some((line) => line.rowKey === row.key) &&
        currentKitRequests.filter((line) => line.rowKey === row.key).every((line) => line.status === "delivered"))) {
      return { tone: "green" as const, label: "Consegnato" };
    }
    return { tone: "neutral" as const, label: "Registrato" };
  })();

  type SectionStatus = { tone: "red" | "yellow" | "green" | "neutral"; label: string };
  const notApplicable: SectionStatus = { tone: "neutral", label: "Non applicabile" };
  function completionStatus(required: unknown[]): SectionStatus {
    const present = required.filter(value => typeof value === "string" ? value.trim() !== "" : Boolean(value)).length;
    if (present === 0) return { tone: "red", label: "Mancanti" };
    if (present < required.length) return { tone: "yellow", label: "Da completare" };
    return { tone: "green", label: "Completi" };
  }

  function SectionStatusBadge({ status }: { status: SectionStatus }) {
    const classes = {
      neutral: "border-border bg-muted text-muted-foreground",
      red: "border-red-200 bg-red-50 text-red-700",
      yellow: "border-amber-200 bg-amber-50 text-amber-800",
      green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }[status.tone];
    return (
      <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${classes}`}>
        <span className={`h-2 w-2 rounded-full ${status.tone === "red" ? "bg-red-500" : status.tone === "yellow" ? "bg-amber-500" : status.tone === "green" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
        {status.label}
      </span>
    );
  }

  function CollapsibleSectionSummary({
    title,
    status,
    icon,
    tone = "muted",
  }: {
    title: string;
    status?: SectionStatus;
    icon?: React.ReactNode;
    tone?: "muted" | "success";
  }) {
    const textClass = tone === "success" ? "text-emerald-800" : "text-muted-foreground";
    return (
      <DisclosureSummary className={`flex cursor-pointer list-none items-center justify-start gap-2 text-xs font-semibold uppercase tracking-wide ${textClass} [&::-webkit-details-marker]:hidden`} indicator={false}>
        {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {status && <SectionStatusBadge status={status} />}
        <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-open:rotate-90" />
      </DisclosureSummary>
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromQuery = new URLSearchParams(window.location.search).get("teamId") || "all";
    setTeamFilter(technicalScope.enabled ? String(technicalScope.teamId ?? "all") : fromQuery);
  }, [location, technicalScope.enabled, technicalScope.teamId]);

  const typedTeams = section
    ? (teams as TeamWithSeason[]).filter((team) => team.clubSection === section)
    : (teams as TeamWithSeason[]);

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

  const seasonFilteredFormTeams = formSeasonFilter === "all"
    ? typedTeams
    : typedTeams.filter(t => t.seasonId?.toString() === formSeasonFilter);
  const uniqueFormAnnate = Array.from(
    new Map(
      seasonFilteredFormTeams
        .map((team) => ({ key: teamAnnataLabel(team), label: teamAnnataLabel(team), rank: teamCategoryRank(teamAnnataLabel(team)), year: teamYearRank(teamAnnataLabel(team)) }))
        .map((item) => [item.key, item])
    ).values()
  ).sort((a, b) => (a.rank - b.rank) || (a.year - b.year) || a.label.localeCompare(b.label, "it", { numeric: true, sensitivity: "base" }));
  const filteredFormTeams = formAnnataFilter === "all"
    ? seasonFilteredFormTeams
    : seasonFilteredFormTeams.filter(t => teamAnnataLabel(t) === formAnnataFilter);

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
        setCreateParentFamilyId(undefined);
        setFormSeasonFilter("all");
        setFormAnnataFilter("all");
        resetCreateMedicalCertificateFields();
        toast({ title: t.addPlayer });
        form.reset();
      },
      onError: (error) => {
        if (createParentFamilyId !== undefined) {
          toast({ title: "Impossibile salvare il giocatore", description: error.message, variant: "destructive" });
        }
      }
    }
  });

  const importPlayersWithTeams = async (rows: Record<string, unknown>[]) => {
    const rowSeasonStartYear = inferPlayerImportSeasonStartYearFromRows(rows, seasonStartYearForImport);
    const teamByName = new Map<string, { id: number; name: string; category?: string | null; ageGroup?: string | null; clubSection?: ClubSection }>();
    const teamsForImport = ((importTeams as any[] | undefined) ?? []).length > 0
      ? (importTeams as any[])
      : ((teams as any[] | undefined) ?? []);
    teamsForImport.forEach((team) => {
      const keys = importTeamAliases(team);
      keys.forEach((key) => teamByName.set(key, { id: team.id, name: team.name, category: team.category, ageGroup: team.ageGroup, clubSection: team.clubSection }));
    });

    const errors: string[] = [];
    const warnings: string[] = [];
    let success = 0;
    let createdPlayers = 0;
    let updatedPlayers = 0;
    let createdTeams = 0;
    let duplicates = 0;
    const existingByFingerprint = new Map<string, Player>();
    const existingByName = new Map<string, Player[]>();
    const existingByRegistration = new Map<string, Player>();
    const existingByDateTeamPhone = new Map<string, Player>();
    const existingPlayersForImport = await fetchPlayersForImport(section);
    const existingSource = existingPlayersForImport.length > 0 ? existingPlayersForImport : ((players as Player[] | undefined) ?? []);
    existingSource.forEach((player) => {
      existingByFingerprint.set(playerImportFingerprint(player), player);
      const nameKey = playerImportNameKey(player);
      existingByName.set(nameKey, [...(existingByName.get(nameKey) ?? []), player]);
      const registrationKey = playerImportRegistrationKey(player);
      if (registrationKey) existingByRegistration.set(registrationKey, player);
      const dateTeamPhoneKey = playerImportDateTeamPhoneKey(player);
      if (dateTeamPhoneKey) existingByDateTeamPhone.set(dateTeamPhoneKey, player);
    });
    const fileFingerprints = new Set<string>();
    const failedTeamCreations = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const rowWithSheetTeam = {
          ...row,
          Squadra: row["Squadra"] || row.__derivedTeamName || row.__sheetName || "",
        };
        const resolvedTeam = resolveImportedPlayerRowTeam(rowWithSheetTeam, rowSeasonStartYear);
        if (section && resolvedTeam?.clubSection && resolvedTeam.clubSection !== section) {
          duplicates++;
          warnings.push(`Riga ${i + 1}: ${resolvedTeam.teamName} appartiene a ${resolvedTeam.clubSection}, non a ${section}. Riga ignorata.`);
          continue;
        }
        const rawTeamName = resolvedTeam?.teamName ?? normalizeImportedTeamDisplayName(rowWithSheetTeam["Squadra"]);
        const normalizedTeamName = normalizeImportTeamName(rawTeamName);
        let team = resolvedTeam
          ? findTeamForResolvedPlayerImport(Array.from(teamByName.values()), resolvedTeam, rawTeamName)
          : normalizedTeamName ? teamByName.get(normalizedTeamName) : undefined;
        const sectionForNewTeams = resolvedTeam?.clubSection ?? section ?? "scuola_calcio";

        if (!team && rawTeamName && !failedTeamCreations.has(normalizedTeamName)) {
          try {
            const resolvedAgeGroup = resolvedTeam?.under ? `U${resolvedTeam.under}` : resolvedTeam?.category ?? rawTeamName;
            const created = await createTeamMutation.mutateAsync({
              data: {
                name: rawTeamName,
                category: resolvedTeam?.category ?? rawTeamName,
                ageGroup: resolvedAgeGroup,
                clubSection: sectionForNewTeams,
              } as any,
            });
            team = { id: (created as any).id, name: (created as any).name ?? rawTeamName, category: resolvedTeam?.category ?? rawTeamName, ageGroup: resolvedAgeGroup, clubSection: sectionForNewTeams };
            importTeamAliases({ name: team.name, category: team.category, ageGroup: team.ageGroup }).forEach((key) => teamByName.set(key, team!));
            createdTeams++;
          } catch (error: any) {
            failedTeamCreations.add(normalizedTeamName);
            warnings.push(`Squadra "${rawTeamName}" non creata/assegnata: ${error?.data?.error ?? error?.message ?? "importo i giocatori senza squadra"}`);
          }
        }
        if (resolvedTeam && !team) {
          duplicates++;
          warnings.push(`Riga ${i + 1}: ${resolvedTeam.teamName} risolta dal parser ma non trovata tra le squadre. Riga ignorata per non conservare una squadra errata.`);
          continue;
        }

        const mapped = mapExcelRowToPlayer(
          {
            ...rowWithSheetTeam,
            ...(resolvedTeam ? {
              Squadra: resolvedTeam.teamName,
              __derivedTeamName: resolvedTeam.teamName,
              __derivedCategory: resolvedTeam.category,
              __derivedClubSection: resolvedTeam.clubSection,
            } : {}),
          },
          Array.from(teamByName.values()),
        ) as Record<string, unknown>;
        if (team) mapped.teamId = team.id;
        const fingerprint = playerImportFingerprint(mapped);
        if (fileFingerprints.has(fingerprint)) {
          duplicates++;
          errors.push(`Riga ${i + 1}: duplicato ignorato`);
          continue;
        }
        fileFingerprints.add(fingerprint);
        const registrationKey = playerImportRegistrationKey(mapped);
        const nameKey = playerImportNameKey(mapped);
        const mappedDate = normalizeImportDateKey(mapped.dateOfBirth);
        const mappedTeamId = Number(mapped.teamId ?? 0);
        const dateTeamPhoneKey = playerImportDateTeamPhoneKey(mapped);
        const existing =
          (registrationKey ? existingByRegistration.get(registrationKey) : undefined) ??
          (dateTeamPhoneKey ? existingByDateTeamPhone.get(dateTeamPhoneKey) : undefined) ??
          existingByFingerprint.get(fingerprint) ??
          findExistingPlayerForImport(existingByName.get(nameKey), mappedDate, mappedTeamId);

        const payload = compactImportPayload(mapped, existing);
        if (team) payload.teamId = team.id;
        if (existing) {
          const response = await fetch(withApi(`/api/players/${existing.id}`), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw new Error(await importErrorMessage(response, "Aggiornamento non riuscito"));
          updatedPlayers++;
        } else {
          await createMutation.mutateAsync({ data: payload as any });
          createdPlayers++;
        }
        success++;
      } catch (error: any) {
        errors.push(`Riga ${i + 1}: ${error?.data?.error ?? error?.message ?? "errore durante l'importazione"}`);
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
    if (updatedPlayers > 0) {
      toast({ title: `${updatedPlayers} giocatori aggiornati` });
    }
    if (createdPlayers > 0) {
      toast({ title: `${createdPlayers} giocatori creati` });
    }
    if (warnings.length > 0) {
      toast({ title: `${warnings.length} avvisi importazione`, description: warnings.slice(0, 2).join(" · ") });
    }
    return {
      success,
      failed: errors.length,
      errors,
      created: createdPlayers,
      updated: updatedPlayers,
      duplicates,
      warnings,
    };
  };

  const updateMutation = useUpdatePlayer({
    mutation: {
      onSuccess: (updatedPlayer) => {
        queryClient.setQueriesData({ queryKey: ["/api/players"] }, (current: unknown) => {
          if (!Array.isArray(current)) return current;
          return current.map((player: Player) => player.id === updatedPlayer.id ? { ...player, ...updatedPlayer } : player);
        });
        queryClient.invalidateQueries({ queryKey: ["/api/players"], exact: false });
        setEditingPlayer(null);
        toast({ title: t.editPlayer });
      },
      onError: (error: any) => {
        const raw =
          error?.data?.error ??
          error?.data?.message ??
          error?.message ??
          "Salvataggio non riuscito.";
        let message = String(raw);
        try {
          const parsed = JSON.parse(message) as { error?: unknown; message?: unknown };
          message = String(parsed.error ?? parsed.message ?? message);
        } catch {
          // Plain text error from API.
        }
        toast({ title: "Errore salvataggio", description: message, variant: "destructive" });
      },
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

  const deletePlayerPayment = async (paymentId: number) => {
    if (!canEditFinancials) return;
    const res = await fetch(withApi(`/api/player-payments/${paymentId}`), {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast({ title: "Errore eliminazione quota", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    toast({ title: "Quota eliminata" });
  };

  const saveKitAssignmentOnly = async () => {
    if (!editingPlayer) return;
    const res = await fetch(withApi("/api/equipment"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: editingPlayer.id,
        kitAssigned: editingPlayer.jerseyNumber ? String(editingPlayer.jerseyNumber) : null,
        trainingKit: serializeKitRows(kitRows, extraTimeRows),
        matchKit: serializeKitRows(kitRows.filter((row) => row.area === "match")),
        notes: kitNotes || null,
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Salvataggio kit non riuscito");
    const saved: PlayerEquipment = await res.json();
    queryClient.setQueryData<PlayerEquipment[]>(["/api/equipment", club?.id, user?.id, nr], (current = []) => {
      if (!current.some((item) => item.playerId === saved.playerId)) return [...current, saved];
      return current.map((item) => item.playerId === saved.playerId ? { ...item, ...saved } : item);
    });
  };

  const saveKitLinks = async (rowKey?: string) => {
    if (!editingPlayer || !canEditFinancials) return;
    setIsSavingKit(true);
    try {
      await saveKitAssignmentOnly();
      const row = kitRows.find((item) => item.key === rowKey);
      if (row) {
        const response = await fetch(withApi("/api/warehouse-kit-requests"), {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: editingPlayer.id, rowKey, itemIds: kitRowItemIds(row), quantity: kitRowQuantity(row) }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Richiesta non registrata");
      }
      toast({ title: rowKey ? "Richiesta registrata in Magazzino" : "Collegamenti kit salvati" });
    } catch (error) {
      toast({ title: "Controlla il kit", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-kit-requests"] });
      setIsSavingKit(false);
    }
  };

  const createUnifiedEconomicPlan = async () => {
    if (!editingPlayer || !canEditFinancials) return;
    if (!isSafePlayerPaymentAmount(plannedEconomicTotal)) {
      toast({ title: "Totale non valido", description: "Il totale deve essere compreso tra 0,01 e 20.000 euro.", variant: "destructive" });
      return;
    }
    if (plannedUpfrontAmount > plannedOutstanding) {
      toast({ title: "Acconto troppo alto", description: "Il nuovo acconto non può superare il saldo ancora da pagare.", variant: "destructive" });
      return;
    }
    const receipts = deposits.filter((deposit, index) => index > 0 || deposit.amount !== 0);
    if (receipts.some(deposit => !isSafePlayerPaymentAmount(deposit.amount) || deposit.amount < 0.01 || !isReceiptMethod(deposit.method) || !deposit.paymentDate)) {
      toast({ title: "Controlla i versamenti", description: "Indica importo, data e metodo di incasso per ogni versamento.", variant: "destructive" });
      return;
    }
    const installments = annualInstallments.map((draft) => ({
      amount: parseEuroInput(draft.amount), dueDate: draft.dueDate,
    }));
    if (installments.some((draft) => !isSafePlayerPaymentAmount(draft.amount) || !draft.dueDate) ||
        Math.round(installments.reduce((total, draft) => total + draft.amount, 0) * 100) !== Math.round(plannedResidualTotal * 100)) {
      toast({ title: "Piano rate non valido", description: "Controlla importi e scadenze delle rate.", variant: "destructive" });
      return;
    }
    setIsSavingInstallments(true);
    try {
      await saveKitAssignmentOnly();
      const response = await fetch(withApi("/api/player-payment-plan"), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: editingPlayer.id, total: plannedEconomicTotal, alreadyPaid: plannedAlreadyPaid, upfront: plannedUpfrontAmount,
          deposits: receipts.map(({ amount, purpose, method, paymentDate }) => ({ amount, purpose, paymentMethod: method, paymentDate })),
          replaceTypes: economicBalance.replaceTypes, installments,
          expectedPayments: editingPlayerPayments.map(({ id, status, amount }) => ({ id, status, amount })),
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Piano totale non salvato");
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setDepositDrafts([{ id: "first", amount: "", purpose: "Generale", method: "", paymentDate: "" }]);
      setEconomicPlanPaid(false);
      toast({ title: "Piano totale creato" });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
      toast({ title: "Errore creazione piano totale", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsSavingInstallments(false);
    }
  };

  const createAnnualFeeInstallments = async () => {
    if (!editingPlayer || !canEditFinancials) return;
    const total = parseEuroInput(annualFeeTotal);
    const registrationFee = parseEuroInput(registrationFeeTotal);
    const insuranceFee = parseEuroInput(insuranceFeeTotal);
    const shuttleFee = parseEuroInput(shuttleMonthlyCost);
    const hasAnnualFee = isSafePlayerPaymentAmount(total);
    const hasRegistrationFee = isSafePlayerPaymentAmount(registrationFee);
    const hasInsuranceFee = isSafePlayerPaymentAmount(insuranceFee);
    const hasShuttleFee = editForm.getValues("shuttleService") === true && isSafePlayerPaymentAmount(shuttleFee);
    const invalidAmounts = [
      annualFeeTotal && !hasAnnualFee ? "quota annuale" : "",
      registrationFeeTotal && !hasRegistrationFee ? "quota iscrizione" : "",
      insuranceFeeTotal && !hasInsuranceFee ? "quota assicurazione" : "",
      shuttleMonthlyCost && editForm.getValues("shuttleService") === true && !hasShuttleFee ? "quota pulmino" : "",
    ].filter(Boolean);
    if (invalidAmounts.length > 0) {
      toast({
        title: "Importo non valido",
        description: `Controlla ${invalidAmounts.join(", ")}. Massimo Euro ${formatEuro(MAX_PLAYER_PAYMENT_AMOUNT)}.`,
        variant: "destructive",
      });
      return;
    }
    if (!hasAnnualFee && !hasRegistrationFee && !hasInsuranceFee && !hasShuttleFee) {
      toast({ title: "Inserisci almeno una voce economica valida", variant: "destructive" });
      return;
    }
    const baseDate = firstInstallmentDueDate ? new Date(`${firstInstallmentDueDate}T00:00:00`) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
      toast({ title: "Scadenza non valida", variant: "destructive" });
      return;
    }
    setIsSavingInstallments(true);
    try {
      const createPayment = async (body: Record<string, unknown>) => {
        const res = await fetch(withApi("/api/player-payments"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
      };
      if (hasRegistrationFee) {
        await createPayment({
          playerId: editingPlayer.id,
          amount: registrationFee,
          dueDate: firstInstallmentDueDate || null,
          status: "pending",
          description: "Quota iscrizione",
          paymentType: "registration_fee",
          availabilityBlocking: 1,
        });
      }
      if (hasInsuranceFee) {
        await createPayment({
          playerId: editingPlayer.id,
          amount: insuranceFee,
          dueDate: firstInstallmentDueDate || null,
          status: "pending",
          description: "Quota assicurazione",
          paymentType: "insurance_fee",
          availabilityBlocking: 1,
        });
      }
      if (hasShuttleFee) {
        await createPayment({
          playerId: editingPlayer.id,
          amount: shuttleFee,
          dueDate: firstInstallmentDueDate || null,
          status: "pending",
          description: "Quota pulmino",
          paymentType: "shuttle_monthly",
          availabilityBlocking: 1,
        });
      }
      const drafts = hasAnnualFee
        ? (annualInstallments.length ? annualInstallments : buildInstallmentDrafts(annualFeeTotal, installmentCount, firstInstallmentDueDate))
        : [];
      const validDrafts = drafts.filter((draft) => isSafePlayerPaymentAmount(parseEuroInput(draft.amount)));
      const draftTotal = validDrafts.reduce((sum, draft) => sum + parseEuroInput(draft.amount), 0);
      if (hasAnnualFee && validDrafts.length === 0) {
        toast({ title: "Piano rate non valido", variant: "destructive" });
        return;
      }
      if (hasAnnualFee && Math.abs(draftTotal - total) > 0.02) {
        toast({ title: "Totale rate non coerente", description: "Il totale delle rate deve combaciare con la quota annuale.", variant: "destructive" });
        return;
      }
      for (let index = 0; index < validDrafts.length; index++) {
        const draft = validDrafts[index];
        const installmentAmount = parseEuroInput(draft.amount);
        if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) continue;
        await createPayment({
            playerId: editingPlayer.id,
            amount: installmentAmount,
            dueDate: draft.dueDate || null,
            status: "pending",
            description: `Quota annuale - rata ${index + 1}/${validDrafts.length}`,
            paymentType: "annual_fee_installment",
            installmentNumber: index + 1,
            totalInstallments: validDrafts.length,
            annualFeeTotal: total,
            availabilityBlocking: 1,
        });
      }
      setRegistrationFeeTotal("");
      setRegistrationFeeListItemId("");
      setInsuranceFeeTotal("");
      setAnnualFeeTotal("");
      setShuttleMonthlyCost("");
      setAnnualFeeListItemId("");
      setInsuranceFeeListItemId("");
      setShuttleFeeListItemId("");
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

  const updateExtraTimeRow = (key: string, patch: Partial<ExtraTimeRow>) => {
    setExtraTimeRows((rows) => normalizeExtraTimeRows(rows).map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const applyListItemPrice = (itemId: string, setter: (value: string) => void) => {
    const item = activeListItems.find((entry) => String(entry.id) === itemId);
    const price = item?.price;
    const isFee = item?.itemType === "registration_fee" || item?.itemType === "annual_fee" || item?.itemType === "insurance_fee";
    setter(price == null ? "" : isFee ? price.toFixed(2) : String(price));
  };

  const savePlayerKit = async () => {
    if (!editingPlayer || !canEditFinancials) return;
    const total = kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0);
    if (total > 0 && kitPaymentStatus === "paid" && !isReceiptMethod(kitPaymentMethod)) {
      toast({ title: "Scegli il metodo di incasso del kit", variant: "destructive" });
      return;
    }
    setIsSavingKit(true);
    try {
      await saveKitAssignmentOnly();
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
              paymentMethod: kitPaymentStatus === "paid" ? kitPaymentMethod : null,
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
          dueDate: firstInstallmentDueDate || shuttlePaymentDueDate || null,
          status: editingShuttlePayment ? undefined : "pending",
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
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-kit-requests"] });
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
    defaultValues: { firstName: "", lastName: "", status: "active", registered: false, phoneOwnerType: "player", shuttleService: false, shuttleRoute: "", shuttleDirection: "round_trip" }
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  const watchAvailable = editForm.watch("available");
  const watchAvailabilityOverrideActive = editForm.watch("availabilityOverrideActive");
  const watchRegisteredEdit = editForm.watch("registered");
  const watchRegisteredCreate = form.watch("registered");
  const watchPhoneOwnerCreate = form.watch("phoneOwnerType");
  const watchPhoneOwnerEdit = editForm.watch("phoneOwnerType");
  const watchShuttleCreate = form.watch("shuttleService");
  const watchShuttleEdit = editForm.watch("shuttleService");
  const entryMeasures = playerActivity.data?.profile?.entry ?? editingPlayer;
  const initialHeight = (entryMeasures?.height ?? 0) > 0 ? entryMeasures?.height : null;
  const initialWeight = (entryMeasures?.weight ?? 0) > 0 ? entryMeasures?.weight : null;
  const playerDataStatus = completionStatus([
    editForm.watch("dateOfBirth"),
    editForm.watch("nationality"),
    ...(watchRegisteredEdit ? [initialHeight ?? editForm.watch("height"), initialWeight ?? editForm.watch("weight")] : []),
  ]);
  const contactStatus = completionStatus([
    editForm.watch("phone") || editForm.watch("email") || editForm.watch("parentPhone") || editForm.watch("parentEmail") ||
    editForm.watch("secondaryContactPhone") || editForm.watch("secondaryContactEmail"),
  ]);
  const savedDelegateCount = parentDelegateRows.filter(row => row.id && row.isActive !== false).length;
  const delegatesStatus = savedDelegateCount > 0
    ? completionStatus([true]) : editingPlayerIsYouthSection || (editingPlayerTeam as TeamWithSeason | undefined)?.clubSection === "scuola_calcio" || section === "scuola_calcio" ? completionStatus([false]) : notApplicable;
  const shuttleStatus = watchShuttleEdit ? completionStatus([true, editForm.watch("shuttleRoute")]) : notApplicable;
  const assignedTeamStatus = completionStatus([editForm.watch("teamId")]);
  const watchMedicalCertificateEdit = editForm.watch("medicalCertificateExpiry");
  const watchMedicalCertificateCreate = form.watch("medicalCertificateExpiry");
  const editAvailabilityBlocks = getAvailabilityBlocks(watchRegisteredEdit, watchMedicalCertificateEdit);
  const resetCreateMedicalCertificateFields = () => {
    setCreateMedicalCertificateDate("");
    setCreateMedicalCustomPeriod(false);
    setCreateMedicalPeriod("12");
  };
  const updateCreateMedicalExpiry = (dateValue: string, periodValue = createMedicalPeriod, customPeriod = createMedicalCustomPeriod) => {
    if (!dateValue) {
      form.setValue("medicalCertificateExpiry", null, { shouldDirty: true });
      return;
    }
    if (customPeriod && periodValue === "custom") {
      form.setValue("medicalCertificateExpiry", null, { shouldDirty: true });
      return;
    }
    const months = Number(customPeriod ? periodValue : "12");
    const expiry = addMonthsMinusOneDay(dateValue, months);
    form.setValue("medicalCertificateExpiry", expiry || null, { shouldDirty: true });
  };
  const setEditPlayerAvailable = (available: boolean) => {
    editForm.setValue("available", available, { shouldDirty: true });
    if (available) {
      editForm.setValue("status", "active", { shouldDirty: true });
      editForm.setValue("unavailabilityReason", undefined, { shouldDirty: true });
      editForm.setValue("expectedReturn", undefined, { shouldDirty: true });
      return;
    }
    if (editForm.getValues("status") === "active") {
      editForm.setValue("status", "inactive", { shouldDirty: true });
    }
    if (!editForm.getValues("unavailabilityReason")) {
      editForm.setValue("unavailabilityReason", "other", { shouldDirty: true });
    }
  };
  const setEditPlayerStatus = (status: string) => {
    editForm.setValue("status", status, { shouldDirty: true });
    if (status === "active") {
      editForm.setValue("available", true, { shouldDirty: true });
      editForm.setValue("unavailabilityReason", undefined, { shouldDirty: true });
      editForm.setValue("expectedReturn", undefined, { shouldDirty: true });
      return;
    }
    editForm.setValue("available", false, { shouldDirty: true });
    if (status === "injured") editForm.setValue("unavailabilityReason", "injury", { shouldDirty: true });
    if (status === "suspended") editForm.setValue("unavailabilityReason", "suspended", { shouldDirty: true });
    if (status === "pending_transfer") editForm.setValue("unavailabilityReason", "pending_transfer", { shouldDirty: true });
    if (status === "inactive" && !editForm.getValues("unavailabilityReason")) {
      editForm.setValue("unavailabilityReason", "other", { shouldDirty: true });
    }
  };
  const setEditPlayerUnavailabilityReason = (reason: string) => {
    editForm.setValue("unavailabilityReason", reason, { shouldDirty: true });
    if (reason === "regular") {
      if (getAvailabilityBlocks(editForm.getValues("registered"), editForm.getValues("medicalCertificateExpiry")).length === 0) {
        setEditPlayerAvailable(true);
      } else {
        editForm.setValue("status", "inactive", { shouldDirty: true });
        editForm.setValue("available", false, { shouldDirty: true });
      }
      return;
    }
    if (reason === "injury") editForm.setValue("status", "injured", { shouldDirty: true });
    if (reason === "suspended") editForm.setValue("status", "suspended", { shouldDirty: true });
    if (reason === "pending_transfer") editForm.setValue("status", "pending_transfer", { shouldDirty: true });
  };

  useEffect(() => {
    const blocks = getAvailabilityBlocks(watchRegisteredEdit, watchMedicalCertificateEdit);
    if (blocks.length > 0) {
      editForm.setValue("available", false);
      return;
    }
    const status = editForm.getValues("status");
    const reason = editForm.getValues("unavailabilityReason");
    if (status === "inactive" && reason === "regular") {
      setEditPlayerAvailable(true);
    }
  }, [watchRegisteredEdit, watchMedicalCertificateEdit, editForm]);

  useEffect(() => {
    if (getAvailabilityBlocks(watchRegisteredCreate, watchMedicalCertificateCreate).length > 0) {
      form.setValue("available" as any, false);
    }
  }, [watchRegisteredCreate, watchMedicalCertificateCreate, form]);

  useEffect(() => {
    setAnnualInstallments(buildInstallmentDrafts(String(plannedResidualTotal), installmentCount, firstInstallmentDueDate));
  }, [plannedResidualTotal, installmentCount, firstInstallmentDueDate]);

  useEffect(() => {
    if (!editingPlayer) {
      setKitRows(defaultKitRows());
      setKitNotes("");
      setKitPaymentStatus("pending");
      setKitPaymentMethod("");
      setKitPaymentDueDate("");
      setKitInstallmentCount("1");
      setShuttleMonthlyCost("");
      setShuttleMonthsCount("1");
      setShuttlePaymentDueDate("");
      setExtraTimeRows(defaultExtraTimeRows());
      return;
    }
    setKitRows(parseKitRows(editingPlayerEquipment?.trainingKit));
    setExtraTimeRows(parseExtraTimeRows(editingPlayerEquipment?.trainingKit));
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
    setRegistrationFeeTotal("");
    setRegistrationFeeListItemId("");
    setAnnualFeeTotal("");
    setAnnualFeeListItemId("");
    setInsuranceFeeTotal("");
    setInsuranceFeeListItemId("");
    setDepositDrafts([{ id: "first", amount: "", purpose: "Generale", method: "", paymentDate: "" }]);
    setEconomicPlanPaid(false);
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
    setParentDelegateRows(normalizeParentDelegateRows(player.parentDelegates));
    const shuttlePayment = playerPayments.find((payment) => payment.playerId === player.id && payment.paymentType === "shuttle_monthly");
    setShuttleMonthlyCost(shuttlePayment?.amount != null ? String(shuttlePayment.amount) : "");
    setShuttleMonthsCount("1");
    setShuttlePaymentDueDate(shuttlePayment?.dueDate ?? "");
    setExtraTimeRows(parseExtraTimeRows(playerEquipment.find((item) => item.playerId === player.id)?.trainingKit));
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
      shuttleRoute: player.shuttleRoute ?? undefined,
      shuttleDirection: player.shuttleDirection ?? "round_trip",
      nationality: player.nationality ?? undefined,
      height: player.height && player.height > 0 ? player.height : undefined,
      weight: player.weight && player.weight > 0 ? player.weight : undefined,
      notes: composePlayerNotes(parsedNotes.plainNote, parsedNotes.thread) ?? undefined,
      available: player.available ?? true,
      unavailabilityReason: player.unavailabilityReason ?? undefined,
      expectedReturn: player.expectedReturn ?? undefined,
      availabilityOverrideActive: player.availabilityOverrideActive ?? false,
      availabilityOverrideFrom: player.availabilityOverrideFrom ?? undefined,
      availabilityOverrideUntil: player.availabilityOverrideUntil ?? undefined,
      availabilityOverrideReason: player.availabilityOverrideReason ?? undefined,
      squad: player.squad ?? meta.squad ?? null,
      supplementalSquad: player.supplementalSquad ?? meta.supplementalSquad ?? null,
      imageUrl: player.imageUrl ?? meta.imageUrl ?? null,
      supplementalTeamId: player.supplementalTeamId ?? meta.supplementalTeamId ?? null,
      primarySpecificRole: player.primarySpecificRole ?? meta.primarySpecificRole ?? null,
      primaryLineupStatus: player.primaryLineupStatus ?? meta.primaryLineupStatus ?? null,
      supplementalSpecificRole: player.supplementalSpecificRole ?? meta.supplementalSpecificRole ?? null,
      supplementalLineupStatus: player.supplementalLineupStatus ?? meta.supplementalLineupStatus ?? null,
    });
  };

  function normalizeParentDelegateRows(delegates?: ParentDelegate[] | null): ParentDelegate[] {
    const rows = (delegates ?? [])
      .slice(0, 3)
      .map((delegate) => ({
        ...delegate,
        firstName: delegate.firstName ?? "",
        lastName: delegate.lastName ?? "",
        relation: delegate.relation ?? "",
        phone: delegate.phone ?? "",
        email: delegate.email ?? "",
        isActive: delegate.isActive !== false,
      }));
    return rows.length > 0 ? rows : [emptyParentDelegate()];
  }

  function cleanParentDelegates(rows: ParentDelegate[]): ParentDelegate[] {
    return rows
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        firstName: String(row.firstName ?? "").trim(),
        lastName: String(row.lastName ?? "").trim(),
        relation: String(row.relation ?? "").trim(),
        phone: String(row.phone ?? "").trim(),
        email: String(row.email ?? "").trim(),
        isActive: row.isActive !== false,
      }))
      .filter((row) => Boolean(row.firstName || row.lastName || row.phone || row.email));
  }

  function updateParentDelegateRow(index: number, patch: Partial<ParentDelegate>) {
    setParentDelegateRows((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  const [sendingDelegateId, setSendingDelegateId] = useState<number | null>(null);
  async function sendParentActivation(playerId: number, delegateId: number, channel?: "sms") {
    setSendingDelegateId(delegateId);
    try {
      const response = await fetch(withApi(`/api/players/${playerId}/parent-delegates/${delegateId}/resend-activation`), {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Impossibile inviare l’invito.");
      setParentDelegateRows(rows => rows.map(row => row.id === delegateId ? { ...row, accessCode: null, activationStatus: body.activationStatus } : row));
      toast({ title: body.activationStatus === "sent" ? "Invito inviato" : "Invio da riprovare",
        description: body.activationStatus === "sent" ? undefined : "Controlla recapito e configurazione." });
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Invio non riuscito", variant: "destructive" }); }
    finally { setSendingDelegateId(null); }
  }

  function parentDelegateMessage(delegate: ParentDelegate) {
    const clubCode = String(parentAccessCredentials?.accessCode ?? (club as { accessCode?: string | null } | null)?.accessCode ?? "");
    const parentCode = String(parentAccessCredentials?.parentCode ?? (club as { parentCode?: string | null } | null)?.parentCode ?? "");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return [
      "Accesso App Genitori Football Training Board",
      `${origin}/parent/login`,
      `Codice Club: ${clubCode || "da Credenziali & Accessi"}`,
      `Codice Genitori: ${parentCode || "da Credenziali & Accessi"}`,
      `Codice iniziale/reset delegato: ${delegate.accessCode || "verra generato al salvataggio"}`,
    ].join("\n");
  }

  async function saveParentDelegatesForPlayer() {
    if (!editingPlayer) return;
    setIsSavingParentDelegates(true);
    try {
      const res = await fetch(withApi(`/api/players/${editingPlayer.id}/parent-delegates`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delegates: cleanParentDelegates(parentDelegateRows) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const delegates = await res.json() as ParentDelegate[];
      setParentDelegateRows(normalizeParentDelegateRows(delegates));
      setEditingPlayer((current) => current ? { ...current, parentDelegates: delegates } : current);
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Delegati App Genitori aggiornati" });
    } catch {
      toast({ title: "Errore salvataggio delegati", variant: "destructive" });
    } finally {
      setIsSavingParentDelegates(false);
    }
  }

  async function resetParentDelegateAccess() {
    if (!delegateToReset || isResettingDelegate) return;
    const { playerId, delegateId } = delegateToReset;
    setIsResettingDelegate(true);
    try {
      const path = "/api/players/" + playerId + "/parent-delegates/" + delegateId + "/reset-access";
      const response = await fetch(withApi(path), { method: "POST", credentials: "include" });
      const updated = await response.json() as ParentDelegate & { error?: string };
      if (!response.ok) throw new Error(updated.error || "Impossibile resettare l’accesso.");
      const updateAccessCode = (delegate: ParentDelegate) => delegate.id === delegateId
        ? { ...delegate, accessCode: updated.accessCode, activationStatus: updated.activationStatus, deliveryStatus: updated.deliveryStatus }
        : delegate;
      setParentDelegateRows(rows => rows.map(updateAccessCode));
      setEditingPlayer(current => current?.id === playerId
        ? { ...current, parentDelegates: current.parentDelegates?.map(updateAccessCode) }
        : current);
      void queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setDelegateToReset(null);
      toast({ title: "Accesso resettato", description: "Usa «Copia accesso iniziale» per copiare il nuovo codice." });
    } catch (error) {
      toast({
        title: "Reset non riuscito",
        description: error instanceof Error ? error.message : "Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsResettingDelegate(false);
    }
  }

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
    const editKit = params.get("focus") === "kit" && nr === "secretary";
    openPlayerDialog(target, editKit ? "edit" : "view");
    setOpenedFromQuery(true);
    if (editKit) {
      window.setTimeout(() => {
        const panel = document.querySelector("[data-player-kit-editor]");
        if (panel instanceof HTMLDetailsElement) {
          panel.open = true;
          panel.scrollIntoView({ block: "start" });
        }
      }, 120);
    }
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
  }, [openedFromQuery, editingPlayer, players, nr]);

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
    if (data.availabilityOverrideActive === true && !data.availabilityOverrideUntil) {
      toast({
        title: "Periodo deroga obbligatorio",
        description: "Indica la data finale per forzare la disponibilita.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      ...data,
      registered,
      notes: composePlayerMeta(
        composePlayerNotes(parsed.plainNote, thread),
        {
          squad: data.squad ?? null,
          supplementalSquad: data.supplementalSquad ?? null,
          imageUrl: data.imageUrl ?? null,
          supplementalTeamId: data.supplementalTeamId ?? null,
          primarySpecificRole: data.primarySpecificRole ?? null,
          primaryLineupStatus: data.primaryLineupStatus ?? null,
          supplementalSpecificRole: data.supplementalSpecificRole ?? null,
          supplementalLineupStatus: data.supplementalLineupStatus ?? null,
        }
      ),
      parentDelegates: cleanParentDelegates(parentDelegateRows),
    };
    if (initialHeight || !editForm.getFieldState("height").isDirty || data.height == null) delete payload.height;
    if (initialWeight || !editForm.getFieldState("weight").isDirty || data.weight == null) delete payload.weight;
    if (payload.shuttleService !== true) {
      payload.shuttleRoute = null;
      payload.shuttleDirection = null;
    } else if (!payload.shuttleDirection) {
      payload.shuttleDirection = "round_trip";
    }
    delete payload.imageUrl;
    const availabilityOverrideEnabled =
      data.availabilityOverrideActive === true &&
      Boolean(data.availabilityOverrideUntil);
    if (availabilityBlocks.length > 0 && !availabilityOverrideEnabled) {
      payload.available = false;
      if (!payload.unavailabilityReason) {
        payload.unavailabilityReason = "regular";
      }
      payload.expectedReturn = null;
    }
    if (payload.status === "injured") {
      payload.available = false;
      payload.unavailabilityReason = "injury";
    }
    if (payload.status === "suspended") {
      payload.available = false;
      payload.unavailabilityReason = "suspended";
    }
    if (payload.status === "pending_transfer") {
      payload.available = false;
      payload.unavailabilityReason = "pending_transfer";
    }
    if (availabilityOverrideEnabled) {
      payload.available = true;
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }
    if (payload.status === "inactive" && payload.unavailabilityReason === "regular" && availabilityBlocks.length === 0) {
      payload.available = true;
    }
    if (payload.available && availabilityBlocks.length === 0) {
      payload.status = "active";
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }

    const overridePayload: Record<string, unknown> = {
      availabilityOverrideActive: data.availabilityOverrideActive === true,
      availabilityOverrideFrom: data.availabilityOverrideFrom || null,
      availabilityOverrideUntil: data.availabilityOverrideUntil || null,
      availabilityOverrideReason: data.availabilityOverrideReason || null,
    };
    const canSubmitAvailabilityOverrideOnly =
      canForceAvailability &&
      availabilityOverrideEnabled &&
      playerDialogMode === "edit" &&
      !canManagePlayers;

    if (canSubmitAvailabilityOverrideOnly) {
      updateMutation.mutate({ id: editingPlayer.id, data: overridePayload as any });
    } else if (canPrimaryCoachEditRole && !canManagePlayers) {
      const rolePayload: Record<string, unknown> = {
        position: payload.position ?? null,
        primarySpecificRole: payload.primarySpecificRole ?? null,
        primaryLineupStatus: payload.primaryLineupStatus ?? null,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: rolePayload as any });
    } else if (canEditSportAvailability && !canManagePlayers) {
      const sportAvailabilityPayload: Record<string, unknown> = {
        notes: payload.notes,
        status: payload.status,
        available: payload.available,
        unavailabilityReason: payload.unavailabilityReason ?? null,
        expectedReturn: payload.expectedReturn ?? null,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: sportAvailabilityPayload as any });
    } else if (playerDialogMode === "view" || isLimitedEditor) {
      const limitedPayload: Record<string, unknown> = {
        notes: payload.notes,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: limitedPayload as any });
    } else {
      updateMutation.mutate({ id: editingPlayer.id, data: payload as any });
    }

  };

  const handleEditInvalid = (errors?: Record<string, unknown>) => {
    const invalidFields = Object.keys(errors ?? {});
    toast({
      title: "Scheda non salvata",
      description: invalidFields.length > 0
        ? `Controlla questi campi: ${invalidFields.slice(0, 4).join(", ")}.`
        : "Controlla i campi della scheda: alcuni dati non sono in un formato valido.",
      variant: "destructive",
    });
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
    const selectedTeamId = Number(teamFilter);
    return Number(p.teamId ?? 0) === selectedTeamId || Number(p.supplementalTeamId ?? 0) === selectedTeamId;
  }).sort(comparePlayersBySurname);
  const filteredPlayerIds = (filteredPlayers ?? []).map((player) => player.id);
  const selectedVisiblePlayerIds = selectedPlayerIds.filter((id) => filteredPlayerIds.includes(id));
  const allVisiblePlayersSelected = filteredPlayerIds.length > 0 && selectedVisiblePlayerIds.length === filteredPlayerIds.length;

  const teamsByAnnata = [...typedTeams].sort(compareTeamsByAnnata);
  const playersByTeam = new Map<number, Player[]>();
  (playersMatchingFilters ?? []).forEach((player) => {
    const teamId = Number(player.teamId ?? 0);
    const supplementalTeamId = Number(player.supplementalTeamId ?? 0);
    const ids = [teamId, supplementalTeamId].filter((id, index, source) => id > 0 && source.indexOf(id) === index);
    ids.forEach((id) => {
      const list = playersByTeam.get(id) ?? [];
      list.push(player);
      playersByTeam.set(id, list);
    });
  });
  playersByTeam.forEach((list) => {
    list.sort(comparePlayersBySurname);
  });
  const unassignedPlayers = (playersMatchingFilters ?? [])
    .filter((player) => !player.teamId && !player.supplementalTeamId)
    .sort(comparePlayersBySurname);
  const teamCountLabel = (team: TeamWithSeason, loadedCount: number) => {
    const fallbackCount = typeof team.playerCount === "number" ? team.playerCount : null;
    if (loadedCount > 0) return String(loadedCount);
    if (isLoading && fallbackCount == null) return "...";
    if (fallbackCount != null) return String(fallbackCount);
    return String(loadedCount);
  };
  const allPlayersCountLabel = isLoading && (playersMatchingFilters ?? []).length === 0
    ? "..."
    : String((playersMatchingFilters ?? []).length);

  const statusLabel = (status: string) => {
    if (status === "active") return t.active;
    if (status === "injured") return t.injured;
    if (status === "inactive") return t.inactive;
    if (status === "suspended") return "Sospeso";
    if (status === "pending_transfer") return "In attesa trasferimento";
    return status;
  };
  const playerHealthTone = (player: Player): "green" | "orange" | "red" => {
    const registered = player.registered === true;
    const medicalValid = isMedicalCertificateValid(player.medicalCertificateExpiry);
    if (registered && medicalValid && player.available !== false && player.status !== "injured") return "green";
    if (!registered && !medicalValid) return "red";
    return "orange";
  };
  const toneClasses = {
    badge: {
      green: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
      orange: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
      red: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    },
  } as const;

  const directoryTag = (label: string, classes: string, warning = false) => <span className={`player-directory-tag ${classes}`}>{warning && <AlertTriangle aria-hidden="true" />}{label}</span>;
  const neutralTag = "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  function renderAvailabilityTag(player: Player) {
    return player.available === false ? directoryTag(t.notAvailable,toneClasses.badge[playerHealthTone(player)],true) : directoryTag(t.available,toneClasses.badge.green);
  }
  function renderRegistrationTag(player: Player) {
    return player.registered === true ? directoryTag(t.registered,toneClasses.badge.green) : player.registered === false ? directoryTag("Non tesserato",toneClasses.badge.orange) : directoryTag("Non indicato",neutralTag);
  }
  function renderStateTag(player: Player) {
    return directoryTag(player.status === "pending_transfer" ? "Trasferimento" : statusLabel(player.status),player.status === "inactive" ? neutralTag : toneClasses.badge[playerHealthTone(player)]);
  }
  function renderDirectoryPhoto(player: Player, imageUrl: string | null) {
    return imageUrl ? <img src={imageUrl} alt={playerName(player,nameOrder)} className="player-directory-photo border" /> : <span className="player-directory-photo flex items-center justify-center border bg-muted/30 text-muted-foreground"><User aria-hidden="true" className="h-4 w-4" /></span>;
  }
  function renderPlayerSelection(player: Player) {
    return <Checkbox checked={selectedPlayerIds.includes(player.id)} onCheckedChange={checked=>setSelectedPlayerIds(current=>checked===true?Array.from(new Set([...current,player.id])):current.filter(id=>id!==player.id))} aria-label={`Seleziona ${playerName(player,nameOrder)}`} />;
  }
  function renderDirectoryActions(player: Player) {
    return <div className="player-directory-actions">
      <Button variant="ghost" size="icon" onClick={()=>openPlayerDialog(player,"view")} title="Visualizza scheda" aria-label={`Visualizza ${playerName(player,nameOrder)}`}><Eye className="h-4 w-4" /></Button>
      {(canManagePlayers || isPrimaryCoachForPlayer(player)) && <Button variant="ghost" size="icon" onClick={()=>openPlayerDialog(player,"edit")} title={t.editPlayer} aria-label={`Modifica ${playerName(player,nameOrder)}`}><Pencil className="h-4 w-4" /></Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={!canDeletePlayer} aria-label={`Altre azioni per ${playerName(player,nameOrder)}`}><span className="text-lg leading-none">⋯</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" disabled={!canDeletePlayer} onClick={()=>{if(canDeletePlayer&&confirm(t.removePlayer)){setLastDeletedPlayer(player);deleteMutation.mutate({id:player.id});}}}><UserMinus className="mr-2 h-4 w-4" />{t.deletePlayer}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    </div>;
  }
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
                  { key: "Settore", label: "Settore" },
                  { key: "Categoria", label: "Categoria" },
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
                  { key: "Certificato medico", label: "Certificato" },
                ]}
                onDownloadTemplate={downloadPlayerTemplate}
                onParseRow={(row) => mapExcelRowToPlayerPreview(row, ((importTeams as any[] | undefined) ?? (teams as any[] | undefined) ?? [])) as Record<string, unknown>}
                isValidRow={isValidPlayerRow}
                prepareRows={(sheets) => prepareAdaptivePlayerImportRows(sheets, { seasonStartYear: inferPlayerImportSeasonStartYearFromSheets(sheets, seasonStartYearForImport) })}
                getPreviewSummary={(rows) => {
                  const previewSeasonStartYear = inferPlayerImportSeasonStartYearFromRows(rows, seasonStartYearForImport);
                  const buckets = new Map<string, number>();
                  let unresolved = 0;
                  for (const row of rows) {
                    const resolved = resolveImportedPlayerRowTeam(row, previewSeasonStartYear);
                    if (!resolved) {
                      unresolved++;
                      continue;
                    }
                    const label = `${resolved.clubSection} · ${resolved.category}`;
                    buckets.set(label, (buckets.get(label) ?? 0) + 1);
                  }
                  return [
                    ...Array.from(buckets.entries()).map(([label, value]) => ({ label, value, tone: "green" as const })),
                    ...(unresolved > 0 ? [{ label: "Righe senza annata riconosciuta", value: unresolved, tone: "amber" as const }] : []),
                  ];
                }}
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
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) { setCreateParentFamilyId(undefined); setFormSeasonFilter("all"); setFormAnnataFilter("all"); resetCreateMedicalCertificateFields(); form.reset(); } }}>
          {canManagePlayers && (
          <DialogTrigger asChild>
            <Button className="shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
              <Plus className="w-5 h-5 mr-2" />
              {t.addPlayer}
            </Button>
          </DialogTrigger>
          )}
          <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-[540px] flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
            <DialogHeader>
              <DialogTitle className="px-6 pt-6">{t.addNewPlayer}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => {
              const registered = data.registered === true;
              const availabilityBlocks = getAvailabilityBlocks(registered, data.medicalCertificateExpiry);
              const payload = { ...data, registered } as Record<string, unknown>;
              if (payload.shuttleService !== true) {
                payload.shuttleRoute = null;
                payload.shuttleDirection = null;
              } else if (!payload.shuttleDirection) {
                payload.shuttleDirection = "round_trip";
              }
              payload.parentDelegates = cleanParentDelegates([
                {
                  firstName: data.parentFirstName,
                  lastName: data.parentLastName,
                  relation: data.parentRelation,
                  phone: data.parentPhone,
                  email: data.parentEmail,
                },
                {
                  firstName: data.secondaryContactFirstName,
                  lastName: data.secondaryContactLastName,
                  relation: data.secondaryContactRelation,
                  phone: data.secondaryContactPhone,
                  email: data.secondaryContactEmail,
                },
              ]);
              if (availabilityBlocks.length > 0) {
                payload.available = false;
                payload.unavailabilityReason = "other";
                payload.expectedReturn = null;
              }
              if (createParentFamilyId !== undefined) payload.parentFamilyDelegateId = createParentFamilyId;
              createMutation.mutate({ data: payload as any });
            })} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-6 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="jerseyNumber">{t.jerseyNumber}</Label>
                  <Input id="jerseyNumber" type="number" {...form.register("jerseyNumber")} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="create-entry-height">Altezza iniziale (cm)</Label>
                  <Input id="create-entry-height" type="number" min={1} step={1} {...form.register("height")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-entry-weight">Peso iniziale (kg)</Label>
                  <Input id="create-entry-weight" type="number" min={1} step={1} {...form.register("weight")} />
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

              {(nr === "secretary" || nr === "admin") && <ParentFamilyLinks onSelect={setCreateParentFamilyId} />}
              {/* Stagione + annata + squadra */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assegnazione squadra</p>
                {uniqueSeasons.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Stagione di riferimento</Label>
                    <Select value={formSeasonFilter} onValueChange={(v) => { setFormSeasonFilter(v); setFormAnnataFilter("all"); form.setValue("teamId", null); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tutte le stagioni" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutte le stagioni</SelectItem>
                        {uniqueSeasons.map(s => (
                          <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-sm">Annata di riferimento</Label>
                  <Select value={formAnnataFilter} onValueChange={(v) => { setFormAnnataFilter(v); form.setValue("teamId", null); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tutte le annate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte le annate</SelectItem>
                      {uniqueFormAnnate.map((annata) => (
                        <SelectItem key={annata.key} value={annata.key}>{annata.label}</SelectItem>
                      ))}
                      {uniqueFormAnnate.length === 0 && (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">Nessuna annata per questa stagione</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Squadra assegnata</Label>
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
                            <div className="px-2 py-3 text-sm text-muted-foreground text-center">Nessuna squadra per questa selezione</div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">{t.registrationNumber}</Label>
                  <Input id="registrationNumber" {...form.register("registrationNumber")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medicalCertificateDate">Data certificato</Label>
                  <Input
                    id="medicalCertificateDate"
                    type="date"
                    value={createMedicalCertificateDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCreateMedicalCertificateDate(value);
                      updateCreateMedicalExpiry(value);
                    }}
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="medicalCustomPeriod"
                    checked={createMedicalCustomPeriod}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setCreateMedicalCustomPeriod(enabled);
                      const nextPeriod = enabled ? createMedicalPeriod : "12";
                      setCreateMedicalPeriod(nextPeriod);
                      updateCreateMedicalExpiry(createMedicalCertificateDate, nextPeriod, enabled);
                    }}
                  />
                  <Label htmlFor="medicalCustomPeriod" className="cursor-pointer">Altro periodo certificato</Label>
                </div>
                {createMedicalCustomPeriod && (
                  <div className="space-y-2">
                    <Label>Validita certificato</Label>
                    <Select
                      value={createMedicalPeriod}
                      onValueChange={(value) => {
                        setCreateMedicalPeriod(value);
                        updateCreateMedicalExpiry(createMedicalCertificateDate, value, true);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona periodo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 mesi</SelectItem>
                        <SelectItem value="6">6 mesi</SelectItem>
                        <SelectItem value="12">12 mesi</SelectItem>
                        <SelectItem value="custom">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="medicalCertificateExpiry">Scadenza certificato</Label>
                  <Input
                    id="medicalCertificateExpiry"
                    type="date"
                    {...form.register("medicalCertificateExpiry")}
                    disabled={!(createMedicalCustomPeriod && createMedicalPeriod === "custom")}
                  />
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
                {watchShuttleCreate && (
                  <div className="grid grid-cols-1 gap-4 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tratta pulmino</Label>
                      <Input placeholder="Es. Ronta" {...form.register("shuttleRoute")} />
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo tratta</Label>
                      <Controller
                        control={form.control}
                        name="shuttleDirection"
                        render={({ field }) => (
                          <Select value={field.value || "round_trip"} onValueChange={field.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="outbound">Solo andata</SelectItem>
                              <SelectItem value="round_trip">Andata e ritorno</SelectItem>
                              <SelectItem value="return">Solo ritorno</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              </div>

              <DialogFooter className="border-t bg-background px-6 py-4">
                <Button type="submit" disabled={createMutation.isPending} className="w-full sm:w-auto">
                  {createMutation.isPending ? t.saving : t.savePlayer}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Dialog open={delegateToReset !== null} onOpenChange={open => {
        if (!open && !isResettingDelegate) setDelegateToReset(null);
      }}>
        <DialogContent className="w-[calc(100%-1rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Reset accesso genitore</DialogTitle>
            <DialogDescription>
              Genera un nuovo codice iniziale per {delegateToReset?.name}. Il codice precedente, la chiave personale e le sessioni aperte verranno disattivati. Il genitore potrà scegliere una nuova chiave al prossimo accesso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isResettingDelegate} onClick={() => setDelegateToReset(null)}>Annulla</Button>
            <Button type="button" variant="destructive" disabled={isResettingDelegate} onClick={() => void resetParentDelegateAccess()}>
              {isResettingDelegate ? "Reset in corso…" : "Conferma reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPlayer} onOpenChange={(o) => !o && setEditingPlayer(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[900px] max-h-[90dvh] overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle>{playerDialogMode === "edit" ? t.editPlayer : "Scheda giocatore"}</DialogTitle>
          </DialogHeader>
          {editingPlayer && (
            playerDialogMode === "view" ? (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit, handleEditInvalid)} className="space-y-4 pt-2">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                {editForm.watch("imageUrl") ? (
                  <img src={editForm.watch("imageUrl") ?? ""} alt="Giocatore" className="h-12 w-12 shrink-0 rounded-lg border bg-background object-cover sm:h-16 sm:w-16" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground sm:h-16 sm:w-16">
                    <User className="h-6 w-6 sm:h-8 sm:w-8" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold leading-tight sm:text-2xl">{playerName(editingPlayer, nameOrder)}</h3>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="secondary">{editingPlayer.teamName || t.unassigned}</Badge>
                    {editingSupplementalTeamId ? (
                      <Badge variant="outline">
                        Supplementare: {editingPlayer.supplementalTeamName || editingSupplementalTeam?.name || `Squadra #${editingSupplementalTeamId}`}
                      </Badge>
                    ) : null}
                    <Badge variant="outline">{editingPlayer.position || "Ruolo N/D"}</Badge>
                    {editingPrimaryLineupStatus ? (
                      <Badge variant="outline">{lineupStatusLabel(editingPrimaryLineupStatus)}</Badge>
                    ) : null}
                    {editingPlayer.jerseyNumber ? <Badge variant="outline">#{editingPlayer.jerseyNumber}</Badge> : null}
                    <Badge variant={watchAvailable === false ? "destructive" : "secondary"}>
                      {watchAvailable === false ? t.notAvailable : t.available}
                    </Badge>
                  </div>
                </div>
              </div>

              <details className="group rounded-lg border p-3" open>
                <CollapsibleSectionSummary title="Dati giocatore" status={playerDataStatus} />
                {playerActivity.isLoading ? <Skeleton className="mt-3 h-14 rounded-md" /> : <PlayerEntryValues entry={playerActivity.data?.profile?.entry} player={editingPlayer} showIdentity />}
              </details>

              <PlayerActivitySummaryPanel player={editingPlayer} isYouthSection={editingPlayerIsYouthSection} summary={playerActivity} />

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tesseramento</p>
                  <p className="mt-1 text-sm font-semibold">{editingPlayer.registered ? t.registered : "Non tesserato"}</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificato</p>
                  <p className="mt-1 text-sm font-semibold">{isMedicalCertificateValid(editingPlayer.medicalCertificateExpiry) ? `Valido fino al ${editingPlayer.medicalCertificateExpiry}` : "Assente o scaduto"}</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pulmino</p>
                  <p className="mt-1 text-sm font-semibold">{editingPlayer.shuttleService ? "Si" : "No"}</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">App genitori</p>
                  <p className="mt-1 text-sm font-semibold">{savedDelegateCount === 0 ? "Nessun delegato" : savedDelegateCount === 1 ? "1 delegato" : savedDelegateCount + " delegati"}</p>
                </div>
              </div>

              <details className="group rounded-lg border p-3">
                <CollapsibleSectionSummary title="Comunicazioni" status={{ tone: "neutral", label: "Messaggi" }} />
                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Puoi inviare una nota o rispondere a una richiesta.</p>
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
              </details>

              {canViewExtraTime && (
                <details className="group rounded-lg border p-3">
                  <CollapsibleSectionSummary title="Extra Time" icon={<Clock className="h-4 w-4" />} />
                  <div className="mt-3">
                    <ExtraTimeSummary rows={displayedExtraTimeRows} />
                  </div>
                </details>
              )}

              <details className="group rounded-lg border p-3" open>
                <CollapsibleSectionSummary title="Squadra assegnata" status={assignedTeamStatus} />
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Squadra principale</span><p>{editingPlayer.teamName || t.unassigned}</p></div>
                  <div><span className="text-muted-foreground">Gruppo principale</span><p>{editingPrimarySquad || "-"}</p></div>
                  <div><span className="text-muted-foreground">Ruolo principale</span><p>{specificRoleLabel(editingPrimarySpecificRole)}</p></div>
                  <div><span className="text-muted-foreground">Stato principale</span><p>{lineupStatusLabel(editingPrimaryLineupStatus)}</p></div>
                  <div><span className="text-muted-foreground">Stato giocatore</span><p>{statusLabel(editingPlayer.status)}</p></div>
                  <div><span className="text-muted-foreground">Squadra supplementare</span><p>{editingPlayer.supplementalTeamName || editingSupplementalTeam?.name || (editingSupplementalTeamId ? `Squadra #${editingSupplementalTeamId}` : "-")}</p></div>
                  <div><span className="text-muted-foreground">Gruppo supplementare</span><p>{editingSupplementalSquad || "-"}</p></div>
                  <div><span className="text-muted-foreground">Ruolo supplementare</span><p>{specificRoleLabel(editingSupplementalSpecificRole)}</p></div>
                  <div><span className="text-muted-foreground">Stato supplementare</span><p>{lineupStatusLabel(editingSupplementalLineupStatus)}</p></div>
                </div>
              </details>
              <details className="group rounded-lg border p-3">
                <CollapsibleSectionSummary title="Tesseramento e certificato" status={registrationSectionStatus} />
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Tesseramento</span><p>{editingPlayer.registered ? t.registered : "-"}</p></div>
                  <div><span className="text-muted-foreground">Numero matricola</span><p>{editingPlayer.registrationNumber || "-"}</p></div>
                  <div><span className="text-muted-foreground">Certificato medico</span><p>{isMedicalCertificateValid(editingPlayer.medicalCertificateExpiry) ? `Valido fino al ${editingPlayer.medicalCertificateExpiry}` : "Assente o scaduto"}</p></div>
                </div>
              </details>
              <details className="group rounded-lg border p-3">
                <CollapsibleSectionSummary title="Pulmino" status={shuttleStatus} />
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Pulmino</span><p>{editingPlayer.shuttleService ? "Si" : "No"}</p></div>
                  {editingPlayer.shuttleService && (
                    <>
                      <div><span className="text-muted-foreground">Tratta pulmino</span><p>{editingPlayer.shuttleRoute || "-"}</p></div>
                      <div><span className="text-muted-foreground">Tipo tratta</span><p>{editingPlayer.shuttleDirection === "outbound" ? "Solo andata" : editingPlayer.shuttleDirection === "return" ? "Solo ritorno" : "Andata e ritorno"}</p></div>
                    </>
                  )}
                </div>
              </details>
              <details className="group rounded-lg border p-3">
                <CollapsibleSectionSummary title="Contatti" status={contactStatus} />
                <div className="mt-3 grid grid-cols-1 gap-3 break-words text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Telefono</span><PhoneLink value={editingPlayer.phone} /></div>
                  <div><span className="text-muted-foreground">Email</span><p>{editingPlayer.email || "-"}</p></div>
                  {(editingPlayer.phoneOwnerType === "parent" || Boolean(editingPlayer.parentFirstName || editingPlayer.parentLastName || editingPlayer.parentPhone || editingPlayer.parentEmail || editingPlayer.parentRelation)) && (
                    <>
                      <div><span className="text-muted-foreground">Genitore/Tutore</span><p>{[editingPlayer.parentFirstName, editingPlayer.parentLastName].filter(Boolean).join(" ") || "-"}</p></div>
                      <div><span className="text-muted-foreground">Relazione</span><p>{editingPlayer.parentRelation || "-"}</p></div>
                      <div><span className="text-muted-foreground">Telefono genitore</span><PhoneLink value={editingPlayer.parentPhone} /></div>
                      <div><span className="text-muted-foreground">Email genitore</span><p>{editingPlayer.parentEmail || "-"}</p></div>
                    </>
                  )}
                  <div><span className="text-muted-foreground">Secondo referente</span><p>{[editingPlayer.secondaryContactFirstName, editingPlayer.secondaryContactLastName].filter(Boolean).join(" ") || "-"}</p></div>
                  <div><span className="text-muted-foreground">Relazione secondo referente</span><p>{editingPlayer.secondaryContactRelation || "-"}</p></div>
                  <div><span className="text-muted-foreground">Telefono secondo referente</span><PhoneLink value={editingPlayer.secondaryContactPhone} /></div>
                  <div><span className="text-muted-foreground">Email secondo referente</span><p>{editingPlayer.secondaryContactEmail || "-"}</p></div>
                </div>
              </details>

              <details className="group rounded-lg border p-3">
                <CollapsibleSectionSummary title="Documenti giocatore" icon={<FileText className="h-4 w-4" />} status={documentSectionStatus} />
                <div className="mt-2 space-y-1 text-sm">
                  {editingPlayerDocuments.length ? editingPlayerDocuments.map(doc => (
                    <p key={doc.id} className="break-words">{playerDocumentLabel(doc.type)}{doc.expiryDate && " · Scadenza " + profileDateLabel(doc.expiryDate)}</p>
                  )) : <p className="text-muted-foreground">Nessun documento registrato.</p>}
                </div>
              </details>

              {(watchAvailable === false || editingPlayer.availabilityOverrideActive) && (
                <details className="group rounded-lg border p-3" open>
                  <CollapsibleSectionSummary title="Disponibilita" tone="muted" />
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Motivo</span><p>{reasonLabel(editingPlayer.unavailabilityReason, t)}</p></div>
                  <div><span className="text-muted-foreground">Rientro previsto</span><p>{editingPlayer.expectedReturn || "-"}</p></div>
                  {editingPlayer.availabilityOverrideActive && (
                    <>
                      <div><span className="text-muted-foreground">Forza disponibilita</span><p>Attiva fino al {editingPlayer.availabilityOverrideUntil || "-"}</p></div>
                      <div><span className="text-muted-foreground">Motivo deroga</span><p>{editingPlayer.availabilityOverrideReason || "-"}</p></div>
                    </>
                  )}
                </div>
              </details>
              )}

              {canViewKit && (
                <details className="group rounded-lg border p-3">
                  <CollapsibleSectionSummary title="Kit" status={kitSectionStatus} />
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="space-y-2">
                      {displayedKitRows.filter(kitRowHasContent).length === 0 ? (
                        <p className="text-muted-foreground">Nessun kit registrato.</p>
                      ) : displayedKitRows.filter(kitRowHasContent).map((row) => (
                        <div key={row.key} className="flex flex-col gap-1 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium">{row.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.area === "training" ? "Allenamento" : row.area === "match" ? "Gara" : "Rappresentanza"}
                              {kitRowItemIds(row).map((id) => activeListItems.find((entry) => String(entry.id) === id)?.size).filter(Boolean).map((size) => " · " + size).join("")}
                              {" "} - {kitRowQuantity(row)} pz
                              {row.assignment === "loan" && " · Comodato d’uso"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {currentKitRequests.filter((line) => line.rowKey === row.key).map((line) => (
                              <Badge key={line.id} variant="outline">{KIT_REQUEST_STATUS[line.status]} · {line.quantity} pz</Badge>
                            ))}
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
            <form onSubmit={editForm.handleSubmit(handleEditSubmit, handleEditInvalid)} className="space-y-4 pt-2">
              <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[5rem_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label>Immagine giocatore</Label>
                  <div className="flex items-center gap-3">
                    {editForm.watch("imageUrl") ? (
                      <img
                        src={editForm.watch("imageUrl") ?? ""}
                        alt="Anteprima giocatore"
                        className="h-14 w-14 rounded-lg border bg-background object-cover sm:h-16 sm:w-16"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border bg-muted text-muted-foreground sm:h-16 sm:w-16">
                        <User className="h-6 w-6 sm:h-8 sm:w-8" />
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

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3" open>
                <CollapsibleSectionSummary title="Dati giocatore" status={playerDataStatus} />
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.nationality}</Label>
                    <Input {...editForm.register("nationality")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.dateOfBirth}</Label>
                    <Input type="date" {...editForm.register("dateOfBirth")} disabled={!canEditFullPlayer} />
                  </div>
                </div>
                {playerActivity.isLoading ? <Skeleton className="mt-3 h-14 rounded-md" /> : (
                  <PlayerEntryValues entry={playerActivity.data?.profile?.entry} player={editingPlayer} inputs={canEditFullPlayer ? {
                    height: initialHeight == null ? <>
                      <dt><Label htmlFor="edit-entry-height" className="text-xs text-muted-foreground">Altezza iniziale (cm)</Label></dt>
                      <dd><Input id="edit-entry-height" className="mt-1" type="number" min={1} step={1} {...editForm.register("height")} /></dd>
                    </> : undefined,
                    weight: initialWeight == null ? <>
                      <dt><Label htmlFor="edit-entry-weight" className="text-xs text-muted-foreground">Peso iniziale (kg)</Label></dt>
                      <dd><Input id="edit-entry-weight" className="mt-1" type="number" min={1} step={1} {...editForm.register("weight")} /></dd>
                    </> : undefined,
                  } : undefined} />
                )}
              </details>

              <PlayerActivitySummaryPanel player={editingPlayer} isYouthSection={editingPlayerIsYouthSection} summary={playerActivity} />

              {false && canViewFinancials && (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kit</p>
                    </div>
                    <Badge variant="outline">Totale Euro {formatEuro(kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0))}</Badge>
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
                    {kitPaymentStatus === "paid" && <ReceiptMethodSelect value={isReceiptMethod(kitPaymentMethod) ? kitPaymentMethod : ""} onChange={setKitPaymentMethod} disabled={!canEditFinancials} />}
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
                        value={Number(kitInstallmentCount) > 0 && kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0) > 0
                          ? (kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0) / Number(kitInstallmentCount)).toFixed(2)
                          : ""}
                        readOnly
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-3">
                      Se il kit risulta non pagato e la scadenza e superata, il genitore lo vede nei pagamenti e il giocatore viene gestito come non disponibile.
                    </p>
                  </div>
                  {canEditFinancials && (
                    <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={isSavingKit} onClick={() => void savePlayerKit()}>
                      <Package className="h-4 w-4" />
                      {isSavingKit ? "Salvataggio..." : "Salva kit"}
                    </Button>
                  )}
                </div>
              )}

              {false && (
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
              )}

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Contatti" status={contactStatus} />
                <div className="mt-3 space-y-3">
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
              </details>

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Utenti collegati App Genitori" status={delegatesStatus} />
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Inserisci fino a 3 delegati. I nuovi delegati con un recapito valido ricevono un invito. Per gli accessi con codice resta disponibile il reset.
                  </p>
                  {editingPlayer && canEditFullPlayer && (nr === "secretary" || nr === "admin") && <ParentFamilyLinks key={editingPlayer.id} playerId={editingPlayer.id} />}
                  <div className="space-y-3">
                    {parentDelegateRows.map((delegate, index) => (
                      <div key={delegate.id ?? index} className="rounded-md border bg-background p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <KeyRound className="h-4 w-4 text-primary" />
                            Delegato {index + 1}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {delegate.activationStatus && <Badge variant="outline">{delegate.activationStatus === "active" ? "Accesso attivato" : delegate.activationStatus === "failed" ? "Invio da riprovare" : "Invito da accettare"}</Badge>}
                            {canEditFullPlayer && editingPlayer && delegate.id && delegate.isActive !== false && delegate.activationStatus !== "active" && (delegate.email || delegate.phone) && <>
                              <Button type="button" size="sm" variant="outline" disabled={sendingDelegateId !== null}
                                onClick={() => void sendParentActivation(editingPlayer.id, delegate.id!)}>{delegate.activationStatus ? "Reinvia invito" : "Invia invito"}</Button>
                              {delegate.phone && <Button type="button" size="sm" variant="ghost" disabled={sendingDelegateId !== null}
                                onClick={() => void sendParentActivation(editingPlayer.id, delegate.id!, "sms")}>Invia via SMS</Button>}
                            </>}
                            {delegate.accessCode && (
                              <Badge variant="outline" className="font-mono">{delegate.accessCode}</Badge>
                            )}
                            {delegate.accessCode && <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="gap-2"
                              onClick={() => {
                                void navigator.clipboard.writeText(parentDelegateMessage(delegate));
                                toast({ title: "Messaggio accesso copiato" });
                              }}
                            >
                              <Copy className="h-4 w-4" />
                              Copia accesso iniziale
                            </Button>}
                            {canResetParentAccess && delegate.id && delegate.isActive !== false && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isSavingParentDelegates || isResettingDelegate || updateMutation.isPending}
                                onClick={() => {
                                  if (!editingPlayer || !delegate.id) return;
                                  const name = [delegate.firstName, delegate.lastName].filter(Boolean).join(" ").trim();
                                  setDelegateToReset({ playerId: editingPlayer.id, delegateId: delegate.id, name: name || "il delegato selezionato" });
                                }}
                              >
                                Reset accesso
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input value={delegate.firstName ?? ""} onChange={(e) => updateParentDelegateRow(index, { firstName: e.target.value })} disabled={!canEditFullPlayer} />
                          </div>
                          <div className="space-y-2">
                            <Label>Cognome</Label>
                            <Input value={delegate.lastName ?? ""} onChange={(e) => updateParentDelegateRow(index, { lastName: e.target.value })} disabled={!canEditFullPlayer} />
                          </div>
                          <div className="space-y-2">
                            <Label>Relazione</Label>
                            <Input placeholder="Madre, padre, nonno, baby sitter..." value={delegate.relation ?? ""} onChange={(e) => updateParentDelegateRow(index, { relation: e.target.value })} disabled={!canEditFullPlayer} />
                          </div>
                          <div className="space-y-2">
                            <Label>Telefono</Label>
                            <Input value={delegate.phone ?? ""} onChange={(e) => updateParentDelegateRow(index, { phone: e.target.value })} disabled={!canEditFullPlayer} />
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Email</Label>
                            <Input type="email" value={delegate.email ?? ""} onChange={(e) => updateParentDelegateRow(index, { email: e.target.value })} disabled={!canEditFullPlayer} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={!canEditFullPlayer || parentDelegateRows.length >= 3}
                      onClick={() => setParentDelegateRows((rows) => [...rows, emptyParentDelegate()].slice(0, 3))}
                    >
                      Aggiungi delegato
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 sm:w-auto"
                      disabled={!canEditFullPlayer || isSavingParentDelegates}
                      onClick={() => void saveParentDelegatesForPlayer()}
                    >
                      <KeyRound className="h-4 w-4" />
                      {isSavingParentDelegates ? "Salvataggio..." : "Salva delegati"}
                    </Button>
                  </div>
                </div>
              </details>

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Tesseramento e certificato" status={registrationSectionStatus} />
                <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Scadenza certificato medico</Label>
                    <Input type="date" {...editForm.register("medicalCertificateExpiry")} disabled={!canEditFullPlayer} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.registrationNumber}</Label>
                    <Input {...editForm.register("registrationNumber")} disabled={!canEditFullPlayer} />
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
              </details>

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Pulmino" status={shuttleStatus} />
                <div className="mt-3 space-y-3">
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
                    <Label htmlFor="editShuttleService" className="cursor-pointer">Usufruisce del pulmino</Label>
                  </div>
                  {watchShuttleEdit && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tratta</Label>
                        <Input placeholder="Es. Ronta" {...editForm.register("shuttleRoute")} disabled={!canEditFullPlayer} />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo tratta</Label>
                        <Controller
                          control={editForm.control}
                          name="shuttleDirection"
                          render={({ field }) => (
                            <Select value={field.value || "round_trip"} onValueChange={field.onChange} disabled={!canEditFullPlayer}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="outbound">Solo andata</SelectItem>
                                <SelectItem value="round_trip">Andata e ritorno</SelectItem>
                                <SelectItem value="return">Solo ritorno</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </details>

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Documenti giocatore" icon={<FileText className="h-4 w-4" />} status={documentSectionStatus} />
                <div className="mt-3 space-y-3">
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
              </details>

              <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                <CollapsibleSectionSummary title="Squadra assegnata" status={assignedTeamStatus} />
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Ruolo assegnato</Label>
                    <Controller
                      control={editForm.control}
                      name="position"
                      render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditPlayerRole}>
                          <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
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
                    <div className="space-y-2">
                      <Label>Maglia attuale</Label>
                      <Input type="number" {...editForm.register("jerseyNumber")} disabled={!canEditFullPlayer} />
                    </div>
                  </div>
                  <div className="rounded-md border bg-background p-3 space-y-3">
                    <p className="text-sm font-semibold">Assegnazione principale</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Annata principale</Label>
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
                        <Label>Gruppo interno</Label>
                        <Controller
                          control={editForm.control}
                          name="squad"
                          render={({ field }) => (
                            <Select onValueChange={(v) => field.onChange(v)} value={field.value || ""} disabled={!canEditRoleAndSquad}>
                              <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
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
                        <Label>Ruolo specifico</Label>
                        <Controller
                          control={editForm.control}
                          name="primarySpecificRole"
                          render={({ field }) => (
                            <SpecificRoleSelect value={field.value} onChange={field.onChange} disabled={!canEditPlayerRole} />
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stato in formazione</Label>
                        <Controller
                          control={editForm.control}
                          name="primaryLineupStatus"
                          render={({ field }) => (
                            <LineupStatusSelect
                              value={field.value}
                              onChange={field.onChange}
                              disabled={!canEditPlayerRole || !editingPlayerIsYouthSection}
                            />
                          )}
                        />
                        {!editingPlayerIsYouthSection && (
                          <p className="text-xs text-muted-foreground">Campo attivo solo per annate del Settore Giovanile.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-background p-3 space-y-3">
                    <p className="text-sm font-semibold">Assegnazione supplementare</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Annata supplementare</Label>
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
                                  <SelectItem key={`early-supp-${team.id}`} value={team.id.toString()}>
                                    {team.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Gruppo supplementare</Label>
                        <Controller
                          control={editForm.control}
                          name="supplementalSquad"
                          render={({ field }) => (
                            <Select onValueChange={(v) => field.onChange(v === "_none" ? null : v)} value={field.value || "_none"} disabled={!canEditSupplementalTeam}>
                              <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">Non indicata</SelectItem>
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
                        <Label>Ruolo specifico supplementare</Label>
                        <Controller
                          control={editForm.control}
                          name="supplementalSpecificRole"
                          render={({ field }) => (
                            <SpecificRoleSelect value={field.value} onChange={field.onChange} disabled={!canEditSupplementalTeam} />
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stato in formazione supplementare</Label>
                        <Controller
                          control={editForm.control}
                          name="supplementalLineupStatus"
                          render={({ field }) => (
                            <LineupStatusSelect
                              value={field.value}
                              onChange={field.onChange}
                              disabled={!canEditSupplementalTeam || !editingPlayerIsYouthSection}
                            />
                          )}
                        />
                        {!editingPlayerIsYouthSection && (
                          <p className="text-xs text-muted-foreground">Campo attivo solo per annate del Settore Giovanile.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>{t.status}</Label>
                      <Controller
                        control={editForm.control}
                        name="status"
                        render={({ field }) => (
                          <Select onValueChange={setEditPlayerStatus} value={field.value || "active"} disabled={!canEditFullPlayer}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">{t.active}</SelectItem>
                              <SelectItem value="injured">{t.injured}</SelectItem>
                              <SelectItem value="suspended">Sospeso</SelectItem>
                              <SelectItem value="pending_transfer">In attesa trasferimento</SelectItem>
                              <SelectItem value="inactive">{t.inactive}</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </details>

              {false && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              </div>
              )}

              {canViewFinancials && (
                <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                  <CollapsibleSectionSummary title="Quote" icon={<Banknote className="h-4 w-4" />} status={paymentSectionStatus} />
                  <div className="mt-3 space-y-3">
                  {overduePlayerPayments.length > 0 && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Ci sono pagamenti scaduti. Le voci con blocco attivo possono incidere sulla disponibilità.
                    </div>
                  )}
                  {canEditFinancials && (
                    <div className="space-y-3 rounded-md border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <p className="text-muted-foreground">{priceListError ? "Impossibile caricare il listino." : priceListPending ? "Caricamento listino…" : "Le tariffe attive si possono selezionare qui."}</p>
                        <Link href="/secretary/fee-list" className="font-medium text-primary underline-offset-4 hover:underline">Apri Listino quote</Link>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Quota iscrizione</Label>
                          <Select value={registrationFeeListItemId || "_manual"} onValueChange={(value) => {
                            setRegistrationFeeListItemId(value === "_manual" ? "" : value);
                            if (value !== "_manual") applyListItemPrice(value, setRegistrationFeeTotal);
                          }}>
                            <SelectTrigger aria-label="Listino quota iscrizione"><SelectValue placeholder="Scegli dal listino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_manual">Manuale</SelectItem>
                              {!priceListPending && !priceListError && !registrationFeeListItems.length && <SelectItem value="_empty" disabled>Nessuna tariffa attiva</SelectItem>}
                              {registrationFeeListItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name} - Euro {formatEuro(item.price)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input aria-label="Importo quota iscrizione" type="number" step="0.01" value={registrationFeeTotal} onChange={event => {
                            setRegistrationFeeListItemId("");
                            setRegistrationFeeTotal(event.target.value);
                          }} />
                        </div>
                        <div className="space-y-2">
                          <Label>Quota annuale</Label>
                          <Select value={annualFeeListItemId || "_manual"} onValueChange={(value) => {
                            setAnnualFeeListItemId(value === "_manual" ? "" : value);
                            if (value !== "_manual") applyListItemPrice(value, setAnnualFeeTotal);
                          }}>
                            <SelectTrigger><SelectValue placeholder="Scegli dal listino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_manual">Manuale</SelectItem>
                              {!priceListPending && !priceListError && !annualFeeListItems.length && <SelectItem value="_empty" disabled>Nessuna tariffa attiva</SelectItem>}
                              {annualFeeListItems.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>{item.name} - Euro {formatEuro(item.price)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" step="0.01" value={annualFeeTotal} onChange={(e) => { setAnnualFeeListItemId(""); setAnnualFeeTotal(e.target.value); }} />
                        </div>
                        <div className="space-y-2">
                          <Label>Quota assicurazione</Label>
                          <Select value={insuranceFeeListItemId || "_manual"} onValueChange={(value) => {
                            setInsuranceFeeListItemId(value === "_manual" ? "" : value);
                            if (value !== "_manual") applyListItemPrice(value, setInsuranceFeeTotal);
                          }}>
                            <SelectTrigger><SelectValue placeholder="Scegli dal listino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_manual">Manuale</SelectItem>
                              {!priceListPending && !priceListError && !insuranceFeeListItems.length && <SelectItem value="_empty" disabled>Nessuna tariffa attiva</SelectItem>}
                              {insuranceFeeListItems.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>{item.name} - Euro {formatEuro(item.price)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" step="0.01" value={insuranceFeeTotal} onChange={(e) => { setInsuranceFeeListItemId(""); setInsuranceFeeTotal(e.target.value); }} />
                        </div>
                        <div className="space-y-2">
                          <Label>Quota pulmino mensile</Label>
                          <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            La quota compare qui solo se il pulmino e attivo nei dati anagrafici.
                          </p>
                          <Select value={shuttleFeeListItemId || "_manual"} onValueChange={(value) => {
                            setShuttleFeeListItemId(value === "_manual" ? "" : value);
                            if (value !== "_manual") applyListItemPrice(value, setShuttleMonthlyCost);
                          }} disabled={editForm.watch("shuttleService") !== true}>
                            <SelectTrigger><SelectValue placeholder="Scegli dal listino" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_manual">Manuale</SelectItem>
                              {shuttleFeeListItems.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>{item.name} - Euro {formatEuro(item.price)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input type="number" step="0.01" value={shuttleMonthlyCost} onChange={(e) => { setShuttleFeeListItemId(""); setShuttleMonthlyCost(e.target.value); }} disabled={editForm.watch("shuttleService") !== true} />
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="Mesi pulmino"
                            value={shuttleMonthsCount}
                            onChange={(e) => setShuttleMonthsCount(e.target.value)}
                            disabled={editForm.watch("shuttleService") !== true}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border bg-muted/30 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Totale quote</p>
                          <p className="text-lg font-bold">Euro {formatEuro(plannedQuotesTotal)}</p>
                        </div>
                        <div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuovi versamenti</p>
                          <p className="text-lg font-bold">Euro {formatEuro(plannedUpfrontAmount)}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Residuo totale da rateizzare</p>
                          <p className="text-lg font-bold">Euro {formatEuro(plannedResidualTotal)}</p>
                        </div>
                        <label className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                          <Checkbox
                            checked={economicPlanPaid}
                            onCheckedChange={(value) => setEconomicPlanPaid(value === true)}
                          />
                          Pagato totale
                        </label>
                        <div className="space-y-2">
                          <Label>Numero rate</Label>
                          <Input type="number" min={1} value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Prima scadenza</Label>
                          <Input type="date" value={firstInstallmentDueDate} onChange={(e) => setFirstInstallmentDueDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Acconti e saldo già versati</Label>
                        {depositDrafts.map((draft, index) => (
                          <div key={draft.id} className="grid items-end gap-2 rounded-md border px-3 py-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                            <label className="block min-w-0 space-y-1 text-sm">Voce
                              <ScrollableSelect aria-label={`Voce versamento ${index + 1}`} className="w-full" value={draft.purpose} onValueChange={purpose => updateDeposit(draft.id, { purpose })}>
                                {depositPurposes.map(purpose => <option key={purpose} value={purpose}>{purpose}</option>)}
                              </ScrollableSelect>
                            </label>
                            <label className="block min-w-0 space-y-1 text-sm">Importo (€)
                              <Input type="number" min="0" step="0.01" readOnly={economicPlanPaid && index === 0}
                                value={economicPlanPaid && index === 0 ? Math.max(0, deposits[0].amount || 0) : draft.amount}
                                onChange={event => updateDeposit(draft.id, { amount: event.target.value })} />
                            </label>
                            <ReceiptMethodSelect value={draft.method} onChange={method => updateDeposit(draft.id, { method })} />
                            <label className="block min-w-0 space-y-1 text-sm">Data d’incasso
                              <Input type="date" value={draft.paymentDate} onChange={event => updateDeposit(draft.id, { paymentDate: event.target.value })} />
                            </label>
                            {index > 0 && <Button type="button" variant="ghost" size="icon" aria-label={`Rimuovi versamento ${index + 1}`}
                              onClick={() => setDepositDrafts(drafts => drafts.filter(row => row.id !== draft.id))}><Trash2 className="h-4 w-4" /></Button>}
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" disabled={depositDrafts.length >= 120}
                          onClick={() => setDepositDrafts(drafts => [...drafts, { id: crypto.randomUUID(), amount: "", purpose: "Generale", method: "", paymentDate: "" }])}>
                          <Plus className="h-4 w-4" /> Aggiungi versamento
                        </Button>
                      </div>
                      {annualInstallments.length > 0 && (
                        <div className="space-y-2">
                          <Label>Piano rate</Label>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {annualInstallments.map((installment, index) => (
                              <div key={`annual-installment-${index}`} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2 rounded-md border px-3 py-2">
                                <span className="text-xs font-semibold text-muted-foreground">Rata {index + 1}</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={installment.amount}
                                  onChange={(e) => setAnnualInstallments((drafts) => rebalanceInstallments(drafts, index, e.target.value, String(plannedResidualTotal)))}
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
                      {false && (
                      <div>
                        <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={isSavingInstallments} onClick={() => void createAnnualFeeInstallments()}>
                          <Banknote className="h-4 w-4" />
                          {isSavingInstallments ? "Salvataggio..." : "Crea voci economiche"}
                        </Button>
                      </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-t pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamenti registrati</p>
                      <Badge variant="outline">{editingPlayerPayments.length} voci</Badge>
                    </div>
                    {editingPlayerPayments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nessuna quota registrata.</p>
                    ) : editingPlayerPayments.map((payment) => (
                      <div key={payment.id} className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{payment.description || "Quota giocatore"}</p>
                          <p className="text-xs text-muted-foreground">
                            {payment.dueDate ? `Scadenza ${payment.dueDate}` : "Senza scadenza"}
                            {payment.installmentNumber && payment.totalInstallments ? ` - rata ${payment.installmentNumber}/${payment.totalInstallments}` : ""}
                            {payment.status === "paid" && " · " + receiptMethodLabel(payment.paymentMethod)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Euro {formatEuro(payment.amount)}</span>
                          <Badge variant={payment.status === "paid" ? "default" : overduePlayerPayments.some((p) => p.id === payment.id) ? "destructive" : "secondary"}>
                            {payment.status === "paid" ? "Versata" : "Non versata"}
                          </Badge>
                          {canEditFinancials && (
                            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void deletePlayerPayment(payment.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                </details>
              )}

              {!canEditFinancials && canViewExtraTime && (
                <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                  <CollapsibleSectionSummary title="Extra Time" icon={<Clock className="h-4 w-4" />} />
                  <div className="mt-3">
                    <ExtraTimeSummary rows={displayedExtraTimeRows} />
                  </div>
                </details>
              )}

              {canEditFinancials && (
                <details data-player-kit-editor className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                  <CollapsibleSectionSummary title="Kit" icon={<Package className="h-4 w-4" />} status={kitSectionStatus} />
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">Totale <strong className="font-medium">€ {formatEuro(plannedKitTotal)}</strong></p>
                      <Button type="button" size="sm" variant="outline" disabled={isSavingKit}
                        onClick={() => void saveKitLinks()}>Salva collegamenti</Button>
                    </div>
                    <PlayerKitEditor rows={kitRows} items={kitListItems} requests={currentKitRequests} busy={isSavingKit || kitRequestsPending}
                      requestsUnavailable={kitRequestsError} updateRow={updateKitRow}
                      requestRow={(key) => { if (!kitRequestsPending) void saveKitLinks(key); }} formatEuro={formatEuro} rowTotal={kitRowTotal} parsePrice={parseEuroInput} />
                    <div className="space-y-2 border-t pt-3">
                      <Label>Note kit</Label>
                      <Textarea value={kitNotes} onChange={(e) => setKitNotes(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="kitPaymentPaidInline"
                          checked={kitPaymentStatus === "paid"}
                          onCheckedChange={(v) => setKitPaymentStatus(v === true ? "paid" : "pending")}
                        />
                        <Label htmlFor="kitPaymentPaidInline" className="cursor-pointer">Pagato</Label>
                      </div>
                      {kitPaymentStatus === "paid" && <ReceiptMethodSelect value={isReceiptMethod(kitPaymentMethod) ? kitPaymentMethod : ""} onChange={setKitPaymentMethod} />}
                      <div className="space-y-2">
                        <Label>Scadenza pagamento</Label>
                        <Input type="date" value={kitPaymentDueDate} onChange={(e) => setKitPaymentDueDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Numero rate kit</Label>
                        <Input type="number" min={1} value={kitInstallmentCount} onChange={(e) => setKitInstallmentCount(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Importo rata kit</Label>
                        <Input
                          value={Number(kitInstallmentCount) > 0 && kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0) > 0
                            ? (kitRows.reduce((sum, row) => sum + kitRowTotal(row), 0) / Number(kitInstallmentCount)).toFixed(2)
                            : ""}
                          readOnly
                        />
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="w-full gap-2 sm:w-auto" disabled={isSavingKit} onClick={() => void savePlayerKit()}>
                      <Package className="h-4 w-4" />
                      {isSavingKit ? "Salvataggio..." : "Salva kit e pagamenti"}
                    </Button>
                  </div>
                </details>
              )}

              {canEditFinancials && (
                <details className="group rounded-lg border border-border/60 bg-muted/10 p-3">
                  <CollapsibleSectionSummary title="Extra Time" icon={<Clock className="h-4 w-4" />} status={plannedExtraTimeTotal > 0 ? { tone: "yellow", label: "Programmato" } : { tone: "red", label: "Non registrato" }} />
                  <div className="mt-3 space-y-3 rounded-md border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra Time</p>
                      </div>
                      <Badge variant="outline">Totale Euro {formatEuro(plannedExtraTimeTotal)}</Badge>
                    </div>
                    {(["individual", "group"] as const).map((group) => (
                      <div key={group} className="space-y-2 rounded-md border bg-muted/10 p-3">
                        <p className="text-sm font-semibold">{group === "individual" ? "Allenamenti individuali" : "Lezioni di gruppo"}</p>
                        {normalizedExtraTimeRows.filter((row) => row.group === group).map((row) => (
                          <div key={row.key} className="grid grid-cols-1 gap-2 rounded-md border bg-background px-3 py-2 md:grid-cols-2 xl:grid-cols-4">
                            <div className="space-y-2">
                              <Label>Voce</Label>
                              <Select value={row.activity} onValueChange={(value) => updateExtraTimeRow(row.key, { activity: value })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {EXTRA_TIME_ACTIVITY_OPTIONS.map((activity) => (
                                    <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Tipologia pacchetto</Label>
                              <Select
                                value={row.packageType || "_none"}
                                onValueChange={(value) => {
                                  const packageType = value === "_none" ? "" : value;
                                  updateExtraTimeRow(row.key, {
                                    packageType,
                                    packagePrice: extraTimePackagePrice(row.group, packageType),
                                  });
                                }}
                              >
                                <SelectTrigger><SelectValue placeholder={extraTimePackageLabel(row)} /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">Da definire</SelectItem>
                                  {extraTimePackageOptions(row.group).map((item) => (
                                    <SelectItem key={item.value} value={item.value}>
                                      {item.label} - Euro {formatEuro(item.price)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {group === "group" && (
                              <div className="space-y-2">
                                <Label>N. giocatori</Label>
                                <Input type="number" min={2} value={row.playersCount} onChange={(e) => updateExtraTimeRow(row.key, { playersCount: e.target.value })} />
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label>N. lezioni</Label>
                              <Input type="number" min={0} value={row.lessonsCount} onChange={(e) => updateExtraTimeRow(row.key, { lessonsCount: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Minuti per lezione</Label>
                              <Input type="number" min={0} step={15} value={row.durationMinutes} onChange={(e) => updateExtraTimeRow(row.key, { durationMinutes: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Prezzo pacchetto</Label>
                              <Input type="number" step="0.01" value={row.packagePrice || row.hourlyCost} onChange={(e) => updateExtraTimeRow(row.key, { packagePrice: e.target.value, packageType: "" })} />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Date pacchetto calendario</Label>
                              <Input placeholder="es. 12/09, 19/09, 26/09" value={row.packageDates} onChange={(e) => updateExtraTimeRow(row.key, { packageDates: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Orario lezioni</Label>
                              <Input placeholder="es. 17:30" value={row.lessonTime} onChange={(e) => updateExtraTimeRow(row.key, { lessonTime: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Mister assegnato</Label>
                              <Select
                                value={row.coachName || "unassigned"}
                                onValueChange={(value) => updateExtraTimeRow(row.key, { coachName: value === "unassigned" ? "" : value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleziona mister/preparatore" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Non assegnato</SelectItem>
                                  {extraTimeAssignableStaff.map((member) => {
                                    const fullName = `${member.firstName} ${member.lastName}`.trim();
                                    return (
                                      <SelectItem key={member.id} value={fullName}>
                                        {fullName}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              {extraTimeAssignableStaff.length === 0 && (
                                <p className="text-xs text-muted-foreground">Assegna Extra Time al membro dalla sezione Membri.</p>
                              )}
                            </div>
                            <label className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                              <Checkbox checked={row.parentVisible} onCheckedChange={(value) => updateExtraTimeRow(row.key, { parentVisible: value === true })} />
                              Area genitori
                            </label>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Note</Label>
                              <Textarea
                                placeholder="Note interne sul pacchetto, obiettivi o accordi specifici"
                                value={row.notes}
                                onChange={(e) => updateExtraTimeRow(row.key, { notes: e.target.value })}
                              />
                            </div>
                            <div className="rounded-md border bg-muted/30 px-3 py-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Totale voce</p>
                              <p className="text-base font-bold">Euro {formatEuro(extraTimeRowTotal(row))}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Le voci Extra Time entrano nel totale economico finale. Il collegamento automatico con calendario e area genitori verra gestito come fase dedicata.
                    </p>
                  </div>
                </details>
              )}

              {canViewFinancials && (
                <details open className="group rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                  <CollapsibleSectionSummary title="Totale economico giocatore" tone="success" />
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border border-emerald-100 bg-background/70 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Quote</p>
                        <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedQuotesTotal)}</p>
                      </div>
                      <div className="rounded-md border border-emerald-100 bg-background/70 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Kit</p>
                        <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedKitTotal)}</p>
                      </div>
                      <div className="rounded-md border border-emerald-100 bg-background/70 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Extra Time</p>
                        <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedExtraTimeTotal)}</p>
                      </div>
                      <div className="rounded-md border border-emerald-200 bg-emerald-100 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Totale finale</p>
                        <p className="text-xl font-bold text-emerald-950">Euro {formatEuro(plannedEconomicTotal)}</p>
                        {savedPlanBalance > 0 && <p className="text-xs text-muted-foreground">Include € {formatEuro(savedPlanBalance)} del piano già registrato</p>}
                      </div>
                    </div>
                    {canEditFinancials && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="min-w-0 rounded-md border bg-background/80 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Già incassato</p>
                          <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedAlreadyPaid)}</p>
                        </div>
                        <div className="min-w-0 rounded-md border bg-background/80 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Nuovo acconto</p>
                          <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedUpfrontAmount)}</p>
                          {deposits.filter(deposit => deposit.amount > 0).map(deposit => (
                            <p key={deposit.id} className="text-xs text-muted-foreground">
                              {deposit.purpose} · € {formatEuro(deposit.amount)} · {receiptMethodLabel(deposit.method)} · {deposit.paymentDate ? deposit.paymentDate.split("-").reverse().join("/") : "Data da indicare"}
                            </p>
                          ))}
                        </div>
                        <div className="min-w-0 rounded-md border bg-background/80 px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Residuo totale da rateizzare</p>
                          <p className="text-lg font-bold text-emerald-900">Euro {formatEuro(plannedResidualTotal)}</p>
                        </div>
                        <div className="flex min-w-0 items-end">
                          <Button type="button" variant="outline" className="w-full gap-2" disabled={isSavingInstallments} onClick={() => void createUnifiedEconomicPlan()}>
                            <Banknote className="h-4 w-4" />
                            {isSavingInstallments ? "Salvataggio..." : "Crea piano totale"}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-emerald-800">
                      Il piano aggiorna le rate da pagare delle voci incluse e conserva gli incassi registrati.
                    </div>
                  </div>
                </details>
              )}

              {false && (
              <>
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
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditPlayerRole}>
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
                    <Select onValueChange={setEditPlayerStatus} value={field.value || "active"} disabled={!canEditFullPlayer}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t.active}</SelectItem>
                        <SelectItem value="injured">{t.injured}</SelectItem>
                        <SelectItem value="suspended">Sospeso</SelectItem>
                        <SelectItem value="pending_transfer">In attesa trasferimento</SelectItem>
                        <SelectItem value="inactive">{t.inactive}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              </>
              )}

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
                {canEditSportAvailability && !canManagePlayers && (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Puoi aggiornare indisponibilita sportiva, motivo e rientro previsto. Le verifiche amministrative restano alla segreteria.
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <Controller
                    control={editForm.control}
                    name="available"
                    render={({ field }) => (
                      <Switch
                        id="available"
                        checked={field.value ?? true}
                        onCheckedChange={setEditPlayerAvailable}
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

                {canForceAvailability && (
                  <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Forza disponibilita</p>
                        <p className="text-xs text-blue-800">
                          Deroga temporanea per certificato, tesseramento o pagamenti da regolarizzare.
                        </p>
                      </div>
                      <Controller
                        control={editForm.control}
                        name="availabilityOverrideActive"
                        render={({ field }) => (
                          <Switch
                            id="availabilityOverrideActive"
                            checked={field.value === true}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                    {watchAvailabilityOverrideActive && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Dal</Label>
                          <Input type="date" {...editForm.register("availabilityOverrideFrom")} />
                        </div>
                        <div className="space-y-2">
                          <Label>Al</Label>
                          <Input type="date" {...editForm.register("availabilityOverrideUntil")} />
                        </div>
                        <div className="space-y-2 sm:col-span-3">
                          <Label>Motivo deroga</Label>
                          <Input
                            placeholder="es. autorizzazione temporanea presidenza"
                            {...editForm.register("availabilityOverrideReason")}
                          />
                        </div>
                      </div>
                    )}
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
                          <Select onValueChange={setEditPlayerUnavailabilityReason} value={field.value || ""} disabled={!canEditAvailability}>
                            <SelectTrigger>
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="illness">{t.illness}</SelectItem>
                              <SelectItem value="injury">{t.injuryReason}</SelectItem>
                              <SelectItem value="vacation">{t.vacationReason}</SelectItem>
                              <SelectItem value="regular">Regolare</SelectItem>
                              <SelectItem value="suspended">Sospeso</SelectItem>
                              <SelectItem value="pending_transfer">In attesa di trasferimento</SelectItem>
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
      <TrainingRosterManager kind="work" />
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
              {allPlayersCountLabel}
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
                  {teamCountLabel(team as TeamWithSeason, teamPlayers.length)}
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

      <div className="player-directory">
        <div className="hidden overflow-hidden rounded-xl border bg-card xl:block">
          <table className="player-directory-table">
            <colgroup>
              {canDeletePlayer && <col style={{ width: 40 }} />}
              <col /><col style={{ width: "18%" }} /><col style={{ width: 76 }} />
              <col style={{ width: 136 }} /><col style={{ width: 154 }} /><col style={{ width: 100 }} /><col style={{ width: canDeletePlayer ? 104 : 76 }} />
            </colgroup>
            <thead className="border-b bg-muted/40 text-muted-foreground"><tr>
              {canDeletePlayer && <th><span className="sr-only">Selezione</span></th>}
              <th>{t.player}</th><th>Annata</th><th>{t.position}</th><th>Tesseramento</th><th>{t.playerAvailability}</th><th>{t.status}</th><th className="text-right">{t.actions}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {isLoading ? Array.from({ length: 5 }, (_, i) => <tr key={i}><td colSpan={canDeletePlayer ? 8 : 7}><Skeleton className="h-10 w-full" /></td></tr>) : !filteredPlayers?.length ?
                <tr><td colSpan={canDeletePlayer ? 8 : 7} className="!py-12 text-center text-muted-foreground">{isAssignedStaffRole && !search && !(players as Player[])?.length ? "Nessuna squadra assegnata. Contatta l’amministratore per ricevere l’accesso." : t.noPlayersFound}</td></tr> :
                filteredPlayers.map(player => {
                  const { meta } = splitPlayerMeta(player.notes ?? "");
                  const imageUrl = player.imageUrl ?? meta.imageUrl ?? null;
                  return <tr key={player.id} className="transition-colors hover:bg-muted/25">
                    {canDeletePlayer && <td>{renderPlayerSelection(player)}</td>}
                    <td><div className="flex items-center gap-3">{renderDirectoryPhoto(player,imageUrl)}<div className="min-w-0"><p className="player-directory-name font-semibold">{playerName(player,nameOrder)}</p>{player.jerseyNumber && <p className="mt-0.5 text-xs text-muted-foreground">#{player.jerseyNumber}</p>}</div></div></td>
                    <td className="text-muted-foreground">{player.teamName || t.unassigned}</td>
                    <td><span className="whitespace-nowrap text-xs text-muted-foreground">{player.position || "N/D"}</span></td>
                    <td>{renderRegistrationTag(player)}</td><td>{renderAvailabilityTag(player)}</td><td>{renderStateTag(player)}</td><td>{renderDirectoryActions(player)}</td>
                  </tr>;
                })}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:hidden">
          {isLoading ? Array.from({length: 4},(_,i)=><Skeleton key={i} className="h-48 rounded-xl" />) : !filteredPlayers?.length ? <p className="rounded-xl border bg-card px-4 py-12 text-center text-sm text-muted-foreground">{t.noPlayersFound}</p> : filteredPlayers.map(player => {
            const { meta } = splitPlayerMeta(player.notes ?? "");
            const imageUrl = player.imageUrl ?? meta.imageUrl ?? null;
            return <article key={player.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                {canDeletePlayer && renderPlayerSelection(player)}
                {renderDirectoryPhoto(player,imageUrl)}
                <div className="min-w-0 flex-1"><p className="player-directory-name text-sm font-semibold">{playerName(player,nameOrder)}</p>{player.jerseyNumber && <p className="mt-0.5 text-xs text-muted-foreground">#{player.jerseyNumber}</p>}<p className="mt-1 text-xs text-muted-foreground">{player.teamName || t.unassigned}</p></div>
                {renderDirectoryActions(player)}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t pt-3">
                <div><dt className="mb-1.5 text-xs text-muted-foreground">{t.position}</dt><dd className="text-xs">{player.position || "Non indicato"}</dd></div>
                <div><dt className="mb-1.5 text-xs text-muted-foreground">Tesseramento</dt><dd>{renderRegistrationTag(player)}</dd></div>
                <div><dt className="mb-1.5 text-xs text-muted-foreground">{t.playerAvailability}</dt><dd>{renderAvailabilityTag(player)}</dd></div>
                <div><dt className="mb-1.5 text-xs text-muted-foreground">{t.status}</dt><dd>{renderStateTag(player)}</dd></div>
              </dl>
            </article>;
          })}
        </div>
      </div>
    </div>
  );
}
