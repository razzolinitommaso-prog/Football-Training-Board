import { useState, useEffect } from "react";
import { useListPlayers, useCreatePlayer, useDeletePlayer, useListTeams, useUpdatePlayer } from "@workspace/api-client-react";
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
import { Plus, Search, UserMinus, Pencil, Filter, AlertTriangle, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { Separator } from "@/components/ui/separator";
import { ToastAction } from "@/components/ui/toast";
import { exportToExcel, mapPlayersForExcel } from "@/lib/excel-export";
import { mapExcelRowToPlayer, isValidPlayerRow, downloadPlayerTemplate } from "@/lib/excel-import";
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
};

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

export default function PlayersList({ section }: PlayersListProps = {}) {
  const { t } = useLanguage();
  const { role, user } = useAuth();
  const nr = normalizeSessionRole(role);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const { data: players, isLoading } = useListPlayers(teamFilter !== "all" ? { teamId: parseInt(teamFilter) } : undefined);
  const { data: teams } = useListTeams();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [heightMin, setHeightMin] = useState("");
  const [heightMax, setHeightMax] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formSeasonFilter, setFormSeasonFilter] = useState<string>("all");
  const [noteDraftText, setNoteDraftText] = useState("");
  const [noteRecipient, setNoteRecipient] = useState<PlayerNoteRecipient>("secretary");
  const [noteRequiresResponse, setNoteRequiresResponse] = useState(false);
  const [noteReplyToId, setNoteReplyToId] = useState<string>("");
  const [lastDeletedPlayer, setLastDeletedPlayer] = useState<Player | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canDeletePlayer = ["admin", "presidente", "secretary", "director"].includes(nr);
  const isLimitedEditor = ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(nr);
  const canEditFullPlayer = !isLimitedEditor && !!nr;
  const canEditAvailability = nr === "admin" || nr === "secretary" || nr === "director" || isLimitedEditor;
  const canWritePlayerNotes = isLimitedEditor || nr === "secretary" || nr === "director" || nr === "admin" || nr === "presidente";
  const canExport = nr === "admin" || nr === "secretary" || nr === "director" || nr === "technical_director";
  const isStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "technical_director" || nr === "athletic_director";
  const isAssignedStaffRole = nr === "coach" || nr === "fitness_coach" || nr === "athletic_director";

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

  const openEdit = (player: Player) => {
    setEditingPlayer(player);
    const parsedNotes = splitPlayerNotes(player.notes ?? "");
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
    });
  };

  const handleEditSubmit = (data: EditForm) => {
    if (!editingPlayer) return;
    const registered = data.registered === true;
    const parsed = splitPlayerNotes(data.notes ?? "");
    const thread = [...parsed.thread];
    const draftText = noteDraftText.trim();
    let repliedNote: PlayerNoteThreadItem | null = null;
    if (draftText && canWritePlayerNotes) {
      const nowIso = new Date().toISOString();
      if (noteReplyToId) {
        const idx = thread.findIndex((n) => n.id === noteReplyToId);
        if (idx >= 0) {
          thread[idx] = { ...thread[idx], repliedAt: nowIso };
          repliedNote = thread[idx];
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
      notes: composePlayerNotes(parsed.plainNote, thread),
    };
    if (!registered) payload.available = false;
    if (payload.status === "injured") {
      payload.available = false;
      payload.unavailabilityReason = "injury";
    }
    if (payload.available) {
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }

    if (isLimitedEditor) {
      const limitedPayload: Record<string, unknown> = {
        notes: payload.notes,
        available: payload.available,
        unavailabilityReason: payload.unavailabilityReason,
        expectedReturn: payload.expectedReturn,
        status: payload.status,
      };
      updateMutation.mutate({ id: editingPlayer.id, data: limitedPayload as any });
    } else {
      updateMutation.mutate({ id: editingPlayer.id, data: payload as any });
    }

    if (repliedNote && ["secretary", "technical_director", "director", "admin", "presidente"].includes(nr)) {
      void fetch("/api/club/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Risposta nota giocatore: ${editingPlayer.firstName} ${editingPlayer.lastName}`,
          message: `Risposta inviata alla nota in attesa su ${editingPlayer.firstName} ${editingPlayer.lastName}.`,
          type: "info",
        }),
      }).catch(() => null);
    }
  };

  const activeFilterCount = [
    positionFilter !== "all",
    availabilityFilter !== "all",
    statusFilter !== "all",
    heightMin !== "",
    heightMax !== "",
  ].filter(Boolean).length;

  const filteredPlayers = (players as Player[] | undefined)?.filter(p => {
    const searchMatch = `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
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

        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <ImportExcelDialog
                label="Importa Excel"
                templateLabel="Scarica template giocatori"
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
                onImportRows={async ([row]) => {
                  await createMutation.mutateAsync({ data: row as any });
                  queryClient.invalidateQueries({ queryKey: ["/api/players"] });
                }}
              />
              <Button variant="outline" onClick={handleExportPlayers} disabled={!players?.length} className="gap-2">
                <FileDown className="w-4 h-4" />
                Esporta Excel
              </Button>
            </>
          )}
          <Dialog open={isCreateOpen} onOpenChange={(o) => { setIsCreateOpen(o); if (!o) { setFormSeasonFilter("all"); form.reset(); } }}>
          {!["coach", "fitness_coach", "athletic_director"].includes(role ?? "") && (
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
            <DialogTitle>{t.editPlayer}</DialogTitle>
          </DialogHeader>
          {editingPlayer && (
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4 pt-2">
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.dateOfBirth}</Label>
                  <Input type="date" {...editForm.register("dateOfBirth")} disabled={!canEditFullPlayer} />
                </div>
                <div className="space-y-2">
                  <Label>{t.nationality}</Label>
                  <Input {...editForm.register("nationality")} disabled={!canEditFullPlayer} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.position}</Label>
                  <Controller
                    control={editForm.control}
                    name="position"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={!canEditFullPlayer}>
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
                  <Label>{t.registrationNumber}</Label>
                  <Input {...editForm.register("registrationNumber")} disabled={!canEditFullPlayer} />
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

              <div className="space-y-2">
                <Label>{t.status}</Label>
                <Controller
                  control={editForm.control}
                  name="status"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || "active"}>
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
                        disabled={!canWritePlayerNotes}
                        placeholder="Nota generale sul giocatore..."
                      />
                      {parsed.thread.length > 0 && (
                        <div className="space-y-1 max-h-36 overflow-auto rounded border p-2 bg-muted/20">
                          {parsed.thread.map((n) => (
                            <div key={n.id} className="text-xs rounded border px-2 py-1 bg-background">
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
                                  onClick={() => setNoteReplyToId(n.id)}
                                >
                                  Rispondi
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
                            value={noteDraftText}
                            onChange={(e) => setNoteDraftText(e.target.value)}
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
                  {updateMutation.isPending ? t.saving : t.saveChanges}
                </Button>
              </DialogFooter>
            </form>
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
                  <tr key={player.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold font-display text-sm border shadow-sm ${player.available === false ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" : "bg-secondary text-secondary-foreground"}`}>
                          {player.firstName[0]}{player.lastName[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{player.firstName} {player.lastName}</div>
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
                          onClick={() => openEdit(player)}
                          title={t.editPlayer}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
