import { useState, useEffect } from "react";
import { useListPlayers, useCreatePlayer, useDeletePlayer, useListTeams, useUpdatePlayer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, UserMinus, Pencil, Filter, AlertTriangle, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { exportToExcel, mapPlayersForExcel } from "@/lib/excel-export";
import { mapExcelRowToPlayer, isValidPlayerRow, downloadPlayerTemplate } from "@/lib/excel-import";
import { ImportExcelDialog } from "@/components/import-excel-dialog";

const playerSchema = z.object({
  firstName: z.string().min(2, "Required"),
  lastName: z.string().min(2, "Required"),
  teamId: z.coerce.number().optional().nullable(),
  position: z.string().optional(),
  jerseyNumber: z.coerce.number().optional().nullable(),
  status: z.string().default("active"),
  dateOfBirth: z.string().optional(),
  registered: z.boolean().optional(),
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
  registered: z.boolean().optional(),
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

export default function PlayersList() {
  const { t } = useLanguage();
  const { role } = useAuth();
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const { data: players, isLoading } = useListPlayers(teamFilter !== "all" ? { teamId: parseInt(teamFilter) } : undefined);
  const { data: teams } = useListTeams();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [birthYearFilter, setBirthYearFilter] = useState("all");
  const [heightMin, setHeightMin] = useState("");
  const [heightMax, setHeightMax] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [formSeasonFilter, setFormSeasonFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEditAvailability = role === "admin" || role === "secretary";
  const canExport = role === "admin" || role === "secretary" || role === "director";
  const isStaffRole = role === "coach" || role === "fitness_coach" || role === "technical_director" || role === "athletic_director";

  const typedTeams = (teams as TeamWithSeason[] | undefined) ?? [];

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
        toast({ title: t.deletePlayer });
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
      notes: player.notes ?? undefined,
      available: player.available ?? true,
      unavailabilityReason: player.unavailabilityReason ?? undefined,
      expectedReturn: player.expectedReturn ?? undefined,
    });
  };

  const handleEditSubmit = (data: EditForm) => {
    if (!editingPlayer) return;
    const payload: Record<string, unknown> = { ...data };
    if (data.registered === false) {
      payload.available = false;
    }
    if (payload.available) {
      payload.unavailabilityReason = null;
      payload.expectedReturn = null;
    }
    updateMutation.mutate({ id: editingPlayer.id, data: payload as any });
  };

  const uniqueBirthYears = Array.from(
    new Set(
      (players as Player[] | undefined)
        ?.map(p => p.dateOfBirth ? new Date(p.dateOfBirth).getFullYear().toString() : null)
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => Number(b) - Number(a));

  const activeFilterCount = [
    positionFilter !== "all",
    availabilityFilter !== "all",
    statusFilter !== "all",
    birthYearFilter !== "all",
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
    if (birthYearFilter !== "all") {
      const year = p.dateOfBirth ? new Date(p.dateOfBirth).getFullYear().toString() : null;
      if (year !== birthYearFilter) return false;
    }
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
              const payload = { ...data } as Record<string, unknown>;
              if (data.registered === false) payload.available = false;
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
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
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
                  <Input {...editForm.register("firstName")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastName} <span className="text-destructive">*</span></Label>
                  <Input {...editForm.register("lastName")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.dateOfBirth}</Label>
                  <Input type="date" {...editForm.register("dateOfBirth")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.nationality}</Label>
                  <Input {...editForm.register("nationality")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.position}</Label>
                  <Controller
                    control={editForm.control}
                    name="position"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || ""}>
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
                  <Input type="number" {...editForm.register("jerseyNumber")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.assignToTeam}</Label>
                  <Controller
                    control={editForm.control}
                    name="teamId"
                    render={({ field }) => (
                      <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
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
                  <Input {...editForm.register("registrationNumber")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.height} (cm)</Label>
                  <Input type="number" {...editForm.register("height")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.weight} (kg)</Label>
                  <Input type="number" {...editForm.register("weight")} />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Controller
                  control={editForm.control}
                  name="registered"
                  render={({ field }) => (
                    <Checkbox
                      id="edit-registered"
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="edit-registered" className="cursor-pointer">{t.registered}</Label>
              </div>

              <div className="space-y-2">
                <Label>{t.notes}</Label>
                <Input {...editForm.register("notes")} />
              </div>

              <Separator />

              {/* Availability Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h4 className="font-semibold text-sm">{t.playerAvailability}</h4>
                  {!canEditAvailability && (
                    <span className="text-xs text-muted-foreground ml-auto italic">(solo admin/segreteria)</span>
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

          {/* Birth year */}
          {uniqueBirthYears.length > 0 && (
            <div className="flex items-center gap-1 bg-card border rounded-lg px-2 py-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Annata</span>
              <Select value={birthYearFilter} onValueChange={setBirthYearFilter}>
                <SelectTrigger className="h-6 border-0 shadow-none p-0 text-[11px] w-[80px] focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {uniqueBirthYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

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
            <button type="button" onClick={() => { setPositionFilter("all"); setAvailabilityFilter("all"); setStatusFilter("all"); setBirthYearFilter("all"); setHeightMin(""); setHeightMax(""); }}
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
                    {isStaffRole && !search && (players as any[])?.length === 0 ? (
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
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <span className="text-lg leading-none">⋯</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive focus:text-destructive cursor-pointer"
                              onClick={() => { if (confirm(t.removePlayer)) deleteMutation.mutate({ id: player.id }) }}>
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
