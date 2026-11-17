import { useSearch } from "wouter";
import { FITNESS_RESULTS_WRITE_ROLES } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { normalizeSessionRole } from "@/lib/session-role";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Activity, Heart, Zap, Timer, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useListPlayers, useListTeams } from "@workspace/api-client-react";
import { useForm, Controller } from "react-hook-form";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface FitnessEntry {
  id: number;
  playerId: number;
  playerName: string | null;
  date: string;
  endurance: number | null;
  strength: number | null;
  speed: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  observedRole?: string | null;
  notes: string | null;
  activityType?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  parentNote?: string | null;
}

interface FormValues {
  targetMode: "single" | "team";
  teamId: number | "";
  playerId: number | "";
  date: string;
  activityType: string;
  endurance: number | "";
  strength: number | "";
  speed: number | "";
  heightCm?: string;
  weightKg?: string;
  observedRole?: string;
  notes: string;
  parentNote: string;
}

const newFitnessForm = (): FormValues => ({
  targetMode: "single", teamId: "", playerId: "", date: new Date().toISOString().slice(0, 10),
  activityType: "test_atletico", endurance: "", strength: "", speed: "", notes: "", parentNote: "",
});

const observedRoles = [
  { value: "GK", label: "Portiere" },
  { value: "DEF", label: "Difensore" },
  { value: "MID", label: "Centrocampista" },
  { value: "FWD", label: "Attaccante" },
];

const ACTIVITY_TYPES = [
  { value: "test_atletico", label: "Test atletico" },
  { value: "allenamento_specifico", label: "Allenamento specifico" },
  { value: "recupero_infortunio", label: "Recupero infortunio" },
  { value: "rientro_graduale", label: "Rientro graduale" },
  { value: "prevenzione", label: "Prevenzione" },
  { value: "potenziamento", label: "Potenziamento" },
  { value: "lavoro_differenziato", label: "Lavoro differenziato" },
];

function activityTypeLabel(value: string | null | undefined) {
  return ACTIVITY_TYPES.find((item) => item.value === value)?.label ?? "Test atletico";
}

function ScoreBar({ value, color }: { value: number | null; color: string }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{value}</span>
    </div>
  );
}

export default function PlayerPerformance() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { role, club, user } = useAuth();
  const search = new URLSearchParams(useSearch());
  const testsOnly = search.get("view") === "tests";
  const section = search.get("section");
  const capability = useQuery({
    queryKey: ["/api/player-fitness-data/capabilities", club?.id, user?.id, role],
    queryFn: () => customFetch<{ canEdit: boolean }>("/api/player-fitness-data/capabilities"),
    enabled: !testsOnly && !!user && FITNESS_RESULTS_WRITE_ROLES.includes(normalizeSessionRole(role)),
  });
  const canEdit = !testsOnly && capability.data?.canEdit === true;
  const [editing, setEditing] = useState<FitnessEntry | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterTeam, setFilterTeam] = useState<string>(() => search.get("teamId") ?? "all");
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const { data: players } = useListPlayers();
  const { data: teams } = useListTeams();

  const form = useForm<FormValues>({ defaultValues: newFitnessForm() });
  const targetMode = form.watch("targetMode");
  const selectedTeamId = form.watch("teamId");
  const playersInSelectedTeam = (players ?? []).filter((player) => Number(player.teamId ?? 0) === Number(selectedTeamId));
  const filteredPlayers = (players ?? []).filter((player) => {
    if (filterTeam !== "all" && Number(player.teamId ?? 0) !== Number(filterTeam)) return false;
    return true;
  });
  const params = new URLSearchParams();
  if (!canEdit) params.set("view", "tests");
  if (section) params.set("section", section);
  if (filterTeam !== "all") params.set("teamId", filterTeam);
  if (filterPlayer !== "all") params.set("playerId", filterPlayer);
  const filters = params.toString();
  const results = useQuery({
    queryKey: ["/api/player-fitness-data", "performance", club?.id, user?.id, role, filters],
    queryFn: () => customFetch<FitnessEntry[]>("/api/player-fitness-data" + (filters ? "?" + filters : "")),
    enabled: !!user,
  });
  const entries = results.data ?? [];

  function editTest(entry: FitnessEntry) {
    setEditing(entry);
    form.reset({
      targetMode: "single", teamId: "", playerId: entry.playerId,
      date: entry.date, activityType: entry.activityType ?? "test_atletico",
      endurance: entry.endurance ?? "", strength: entry.strength ?? "", speed: entry.speed ?? "",
      heightCm: entry.heightCm?.toString() ?? "", weightKg: entry.weightKg?.toString() ?? "",
      observedRole: entry.observedRole ?? "", notes: entry.notes ?? "", parentNote: entry.parentNote ?? "",
    });
    setIsOpen(true);
  }

  const onSubmit = async (values: FormValues) => {
    if (!canEdit || (values.targetMode === "single" && !values.playerId)) return;
    if (values.targetMode === "team" && (!values.teamId || playersInSelectedTeam.length === 0)) return;
    setSaving(true);
    try {
      await customFetch(editing ? "/api/player-fitness-data/" + editing.id : "/api/player-fitness-data", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          playerId: values.targetMode === "single" ? Number(values.playerId) : undefined,
          playerIds: values.targetMode === "team" ? playersInSelectedTeam.map((player) => player.id) : undefined,
          date: values.date,
          activityType: values.activityType,
          endurance: values.endurance !== "" ? Number(values.endurance) : null,
          strength: values.strength !== "" ? Number(values.strength) : null,
          speed: values.speed !== "" ? Number(values.speed) : null,
          heightCm: values.targetMode === "single" && values.heightCm ? Number(values.heightCm) : null,
          weightKg: values.targetMode === "single" && values.weightKg ? Number(values.weightKg) : null,
          observedRole: values.targetMode === "single" ? values.observedRole || null : null,
          notes: values.notes || null,
          parentNote: values.parentNote || null,
        }),
      });
      toast({ title: t.saved });
      setIsOpen(false);
      form.reset(newFitnessForm());
      const changedIds = values.targetMode === "team" ? playersInSelectedTeam.map(player => player.id) : [Number(values.playerId)];
      for (const playerId of changedIds) void queryClient.invalidateQueries({ queryKey: ["/api/players", playerId, "activity-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/player-fitness-data"] });
      setEditing(null);
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (id: number) => {
    try {
      await customFetch(`/api/player-fitness-data/${id}`, { method: "DELETE" });
      const playerId = entries.find(entry => entry.id === id)?.playerId;
      if (playerId != null) void queryClient.invalidateQueries({ queryKey: ["/api/players", playerId, "activity-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/player-fitness-data"] });
      toast({ title: t.saved });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{testsOnly ? "Test giocatori" : t.playerPerformance}</h1>
          <p className="text-muted-foreground mt-1">{canEdit ? t.playerPerformanceDesc : "Risultati dei test atletici · Sola lettura"}</p>
        </div>
        {canEdit && <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); form.reset(newFitnessForm()); }}><Plus className="w-4 h-4 mr-2" />{t.addTestResult}</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifica rilevazione" : t.recordPerformance}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {editing ? <p className="text-sm font-medium">{editing.playerName}</p> : <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo inserimento</Label>
                  <Controller
                    control={form.control}
                    name="targetMode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => field.onChange(v as FormValues["targetMode"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Singolo giocatore</SelectItem>
                          <SelectItem value="team">Tutta la squadra</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipologia</Label>
                  <Controller
                    control={form.control}
                    name="activityType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACTIVITY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              {targetMode === "team" ? (
                <div className="space-y-2">
                  <Label>Squadra *</Label>
                  <Controller
                    control={form.control}
                    name="teamId"
                    rules={{ required: true }}
                    render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona squadra" /></SelectTrigger>
                        <SelectContent>
                          {teams?.map(team => (
                            <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Verrà registrato per {playersInSelectedTeam.length} giocatori della squadra.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                <Label>{t.selectPlayer} *</Label>
                <Controller
                  control={form.control}
                  name="playerId"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <SelectTrigger><SelectValue placeholder={t.selectPlayer} /></SelectTrigger>
                      <SelectContent>
                        {(players ?? []).map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.firstName} {p.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              )}
              </>}
              <div className="space-y-2">
                <Label>{t.testDate} *</Label>
                <Input type="date" {...form.register("date", { required: true })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-red-500" />
                    {t.endurance}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("endurance")} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                    {t.strength}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("strength")} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-purple-500" />
                    {t.speed}
                  </Label>
                  <Input type="number" min={0} max={100} placeholder="0–100" {...form.register("speed")} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t.outOf100}</p>
              {targetMode === "single" && <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">Crescita e ruolo osservato</legend>
                <p className="text-xs text-muted-foreground">Dati facoltativi. Le misure aggiornano lo storico del giocatore alla data del test.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="test-height">Altezza (cm)</Label>
                    <Input id="test-height" type="number" step="0.01" min="0.01" {...form.register("heightCm")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="test-weight">Peso (kg)</Label>
                    <Input id="test-weight" type="number" step="0.01" min="0.01" {...form.register("weightKg")} />
                  </div>
                </div>
                <Controller control={form.control} name="observedRole" render={({ field }) => (
                  <Select value={field.value || "none"} onValueChange={value => field.onChange(value === "none" ? "" : value)}>
                    <SelectTrigger aria-label="Ruolo osservato"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ruolo osservato · Non indicato</SelectItem>
                      {observedRoles.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
              </fieldset>}
              <div className="space-y-2">
                <Label>Note staff</Label>
                <Textarea {...form.register("notes")} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Nota famiglia</Label>
                <Textarea {...form.register("parentNote")} rows={2} placeholder="Es. svolge allenamento specifico programmato durante la seduta." />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? t.saving : editing ? "Salva modifiche" : t.addTestResult}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3">
        <Label className="shrink-0">Squadra:</Label>
        <Select value={filterTeam} onValueChange={(value) => { setFilterTeam(value); setFilterPlayer("all"); }}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allTeams}</SelectItem>
            {teams?.map(team => (
              <SelectItem key={team.id} value={String(team.id)}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        <div className="flex items-center gap-3">
        <Label className="shrink-0">Giocatore:</Label>
        <Select value={filterPlayer} onValueChange={setFilterPlayer}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i giocatori</SelectItem>
            {filteredPlayers.map(p => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.firstName} {p.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {results.isError ? <p role="alert" className="text-sm">Impossibile caricare i risultati.{" "}
        <button type="button" className="underline" onClick={() => void results.refetch()}>Riprova</button></p> : results.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{t.noPerformanceData}</p>
            {canEdit && <p className="text-sm text-muted-foreground mt-1">{t.addFirstTest}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map(entry => (
            <Card key={entry.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="font-semibold">{entry.playerName ?? `Player #${entry.playerId}`}</span>
                      <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{activityTypeLabel(entry.activityType)}</span>
                      {entry.teamName && <span className="text-xs text-muted-foreground">{entry.teamName}</span>}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.date), "dd/MM/yyyy")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Heart className="w-3 h-3 text-red-500" />{t.endurance}
                        </div>
                        <ScoreBar value={entry.endurance} color="bg-red-400" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-yellow-500" />{t.strength}
                        </div>
                        <ScoreBar value={entry.strength} color="bg-yellow-400" />
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Timer className="w-3 h-3 text-purple-500" />{t.speed}
                        </div>
                        <ScoreBar value={entry.speed} color="bg-purple-400" />
                      </div>
                    </div>
                    {(entry.heightCm != null || entry.weightKg != null || entry.observedRole) &&
                      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {entry.heightCm != null && <span>Altezza {entry.heightCm.toLocaleString("it-IT", { maximumFractionDigits: 2 })} cm</span>}
                        {entry.weightKg != null && <span>Peso {entry.weightKg.toLocaleString("it-IT", { maximumFractionDigits: 2 })} kg</span>}
                        {entry.observedRole && <span>Ruolo osservato {observedRoles.find(role => role.value === entry.observedRole)?.label ?? entry.observedRole}</span>}
                      </p>}
                    {entry.notes && (
                      <p className="text-xs text-muted-foreground mt-2 italic">{entry.notes}</p>
                    )}
                    {entry.parentNote && (
                      <p className="text-xs text-muted-foreground mt-1">Famiglia: {entry.parentNote}</p>
                    )}
                  </div>
                  {canEdit && <div className="flex shrink-0 flex-wrap gap-1">
                    <Button type="button" size="sm" variant="ghost" aria-label="Modifica rilevazione" onClick={() => editTest(entry)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteEntry}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {entry.playerName} — {format(new Date(entry.date), "dd/MM/yyyy")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t.load}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteEntry(entry.id)} className="bg-destructive text-destructive-foreground">
                          {t.deleteTactic}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  </div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
