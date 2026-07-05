import { useState, useEffect, useRef } from "react";
import { useListPlayers, useCreatePlayer, useDeletePlayer, useListTeams, useUpdatePlayer, useCreateTeam } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, UserMinus, Pencil, Filter, AlertTriangle, FileDown, User, ImagePlus, X, Eye } from "lucide-react";
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
import { mapExcelRowToPlayer, isValidPlayerRow, downloadPlayerTemplate, cellToTrimmedString } from "@/lib/excel-import";
import { ImportExcelDialog } from "@/components/import-excel-dialog";

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
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
});

const editSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: z.coerce.number().optional().nullable(),
  position: z.string().optional(),
  jerseyNumber: z.coerce.number().optional().nullable(),
  status: z.string().optional(),
  dateOfBirth: z.string().optional(),
  registered: zRegisteredCheckbox,
  registrationNumber: z.string().optional(),
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
  registered?: boolean | null;
  registrationNumber?: string | null;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canManagePlayers = nr === "secretary" || nr === "sporting_director";
  const canDeletePlayer = canManagePlayers;
  const canWritePlayerNotes = ["admin", "presidente", "director", "sporting_director", "technical_director", "coach", "fitness_coach", "athletic_director", "secretary"].includes(nr);
  const isLimitedEditor = !canManagePlayers && canWritePlayerNotes;
  const canEditFullPlayer = canManagePlayers && playerDialogMode === "edit";
  const canEditAvailability = canManagePlayers && playerDialogMode === "edit";
  const canEditRoleAndSquad = canManagePlayers && playerDialogMode === "edit";
  const canUploadPlayerImage = canManagePlayers && playerDialogMode === "edit";
  const canEditSupplementalTeam = canUploadPlayerImage;
  const canExport = nr === "admin" || nr === "secretary" || nr === "director" || nr === "technical_director";
  const isStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "technical_director" || nr === "athletic_director";
  const isAssignedStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";
  const clubLogoUrl = String((club as { logoUrl?: string | null } | null)?.logoUrl ?? "");

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
      typedTeams
        .filter(t => t.seasonId != null)
        .map(t => [t.seasonId, { id: t.seasonId!, name: t.seasonName ?? `Stagione ${t.seasonId}` }])
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const rawTeamName = cellToTrimmedString(row["Squadra"]);
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
        await createMutation.mutateAsync({ data: mapped as any });
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

  const form = useForm<z.infer<typeof playerSchema>>({
    resolver: zodResolver(playerSchema),
    defaultValues: { firstName: "", lastName: "", status: "active", registered: false }
  });

  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  const watchAvailable = editForm.watch("available");
  const watchRegisteredEdit = editForm.watch("registered");
  const watchRegisteredCreate = form.watch("registered");

  useEffect(() => {
    if (watchRegisteredEdit === false) {
      editForm.setValue("available", false);
    }
  }, [watchRegisteredEdit, editForm]);

  useEffect(() => {
    if (watchRegisteredCreate === false) {
      form.setValue("available" as any, false);
    }
  }, [watchRegisteredCreate, form]);

  const openPlayerDialog = (player: Player, mode: "view" | "edit" = "view") => {
    setPlayerDialogMode(mode);
    setEditingPlayer(player);
    const { notesRaw, meta } = splitPlayerMeta(player.notes ?? "");
    const parsedNotes = splitPlayerNotes(notesRaw);
    setNoteDraftText("");
    setNoteReplyToId("");
    setNoteRequiresResponse(false);
    setNoteRecipient("secretary");
    editForm.reset({
      firstName: player.firstName,
      lastName: player.lastName,
      teamId: player.teamId ?? undefined,
      position: player.position ?? undefined,
      jerseyNumber: player.jerseyNumber ?? undefined,
      status: player.status,
      dateOfBirth: player.dateOfBirth ?? undefined,
      registered: player.registered ?? false,
      registrationNumber: player.registrationNumber ?? undefined,
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
    const { notesRaw: notesWithoutMeta } = splitPlayerMeta(data.notes ?? "");
    const parsed = splitPlayerNotes(notesWithoutMeta);
    const thread = [...parsed.thread];
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
        authorName: `${(user as any)?.firstName ?? ""} ${(user as any)?.lastName ?? ""}`.trim() || undefined,
        recipient: noteRecipient,
        body: draftText,
        createdAt: nowIso,
        requiresResponse: noteRequiresResponse,
        replyToId: noteReplyToId || undefined,
      });
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
    if (!registered) payload.available = false;
    if (payload.status === "injured") {
      payload.available = false;
      payload.unavailabilityReason = "injury";
    }
    if (payload.available) {
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
    <div className="space-y-8 animate-in fade-in duration-500">
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
                  { key: "Tesserato", label: "Tesserato" },
                ]}
                onDownloadTemplate={downloadPlayerTemplate}
                onParseRow={(row) => mapExcelRowToPlayer(row, (teams as any[] ?? [])) as Record<string, unknown>}
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
              const payload = { ...data, registered } as Record<string, unknown>;
              if (!registered) payload.available = false;
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
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{playerDialogMode === "edit" ? t.editPlayer : "Scheda giocatore"}</DialogTitle>
          </DialogHeader>
          {editingPlayer && (
            playerDialogMode === "view" ? (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 pt-2">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                {editForm.watch("imageUrl") ? (
                  <img src={editForm.watch("imageUrl") ?? ""} alt="Giocatore" className="h-16 w-16 rounded-md object-cover border" />
                ) : (
                  <div className="h-16 w-16 rounded-md border bg-background flex items-center justify-center text-muted-foreground">
                    <User className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">{playerName(editingPlayer, nameOrder)}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
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
                  <div><span className="text-muted-foreground">Stato</span><p>{statusLabel(editingPlayer.status)}</p></div>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Immagine giocatore</Label>
                  <div className="flex items-center gap-3">
                    {editForm.watch("imageUrl") ? (
                      <img
                        src={editForm.watch("imageUrl") ?? ""}
                        alt="Anteprima giocatore"
                        className="h-20 w-20 rounded-md object-cover border"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-md border bg-muted flex items-center justify-center text-muted-foreground">
                        <User className="h-8 w-8" />
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.registrationNumber}</Label>
                  <Input {...editForm.register("registrationNumber")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.jerseyNumber}</Label>
                  <Input type="number" {...editForm.register("jerseyNumber")} disabled={!canEditFullPlayer} />
                </div>
              </div>

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

              <div className="flex items-center gap-3">
                <Controller
                  control={editForm.control}
                  name="registered"
                  render={({ field }) => (
                    <Checkbox
                      id="edit-registered"
                      checked={field.value === true}
                      onCheckedChange={(c) => field.onChange(c === true)}
                      disabled={!canEditFullPlayer}
                    />
                  )}
                />
                <Label htmlFor="edit-registered" className="cursor-pointer">{t.registered}</Label>
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
                        disabled={!canEditAvailability}
                      />
                    )}
                  />
                  <Label htmlFor="available" className={`cursor-pointer font-medium ${watchAvailable !== false ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {watchAvailable !== false ? t.available : t.notAvailable}
                  </Label>
                </div>

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
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2 bg-card p-2 rounded-xl border shadow-sm">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder={t.searchByNameOrPosition}
              className="pl-10 border-0 focus-visible:ring-0 shadow-none bg-transparent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="h-10 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2 px-2 min-w-[180px]">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
                <SelectValue placeholder={t.filterByTeam} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.allTeams}</SelectItem>
                {teams?.map(team => <SelectItem key={team.id} value={team.id.toString()}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-1">
          {/* Position */}
          <div className="flex items-center gap-1 bg-card border rounded-lg px-2 py-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Ruolo</span>
            {[{ v: "all", l: "Tutti" }, { v: "GK", l: t.goalkeeper }, { v: "DEF", l: t.defender }, { v: "MID", l: t.midfielder }, { v: "FWD", l: t.forward }].map(o => (
              <button key={o.v} type="button" onClick={() => setPositionFilter(o.v)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${positionFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Availability */}
          <div className="flex items-center gap-1 bg-card border rounded-lg px-2 py-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Disponibilità</span>
            {[{ v: "all", l: "Tutti" }, { v: "available", l: t.available }, { v: "unavailable", l: t.notAvailable }].map(o => (
              <button key={o.v} type="button" onClick={() => setAvailabilityFilter(o.v)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${availabilityFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1 bg-card border rounded-lg px-2 py-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Stato</span>
            {[{ v: "all", l: "Tutti" }, { v: "active", l: t.active }, { v: "injured", l: t.injured }, { v: "inactive", l: t.inactive }].map(o => (
              <button key={o.v} type="button" onClick={() => setStatusFilter(o.v)}
                className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${statusFilter === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {o.l}
              </button>
            ))}
          </div>

          {/* Height range */}
          <div className="flex items-center gap-1 bg-card border rounded-lg px-2 py-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Altezza (cm)</span>
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

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
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
                  <td colSpan={7} className="px-6 py-16 text-center">
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
      </div>
    </div>
  );
}
