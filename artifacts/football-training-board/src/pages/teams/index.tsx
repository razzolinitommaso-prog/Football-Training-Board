import { useState, useEffect } from "react";
import { useListTeams, useCreateTeam, useDeleteTeam, useUpdateTeam } from "@workspace/api-client-react";
import type { TrainingSlot } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UsersRound, Trash2, ChevronRight, Users, UserCheck, FileDown, ShieldOff, Clock, PlusCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { exportToExcel, mapTeamsForExcel } from "@/lib/excel-export";
import { mapExcelRowToTeam, isValidTeamRow, downloadTeamTemplate } from "@/lib/excel-import";
import { ImportExcelDialog } from "@/components/import-excel-dialog";

const GIORNI_SETTIMANA = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

const SEZIONI = [
  { value: "scuola_calcio", label: "Scuola Calcio" },
  { value: "settore_giovanile", label: "Settore Giovanile" },
  { value: "prima_squadra", label: "Prima Squadra" },
] as const;

function sectionLabel(val?: string | null) {
  return SEZIONI.find(s => s.value === val)?.label ?? val ?? "";
}

const STAFF_ROLE_ICONS: Record<string, string> = {
  coach: "🏅",
  fitness_coach: "💪",
  technical_director: "📋",
  athletic_director: "🏋️",
  director: "🎯",
  admin: "⚙️",
  secretary: "📝",
};

function staffRoleLabel(role: string, t: ReturnType<typeof useLanguage>["t"]) {
  const labels: Record<string, string> = {
    coach: t.coach,
    fitness_coach: t.fitnessCoach,
    technical_director: t.technicalDirector ?? "Technical Director",
    athletic_director: t.athleticDirector ?? "Athletic Director",
    director: t.director ?? "Director",
    admin: t.admin ?? "Admin",
    secretary: t.secretary ?? "Secretary",
  };
  return labels[role] || role;
}

type ClubSection = "scuola_calcio" | "settore_giovanile" | "prima_squadra";

interface TeamsListProps {
  section?: ClubSection;
}

export default function TeamsList({ section }: TeamsListProps = {}) {
  const { t } = useLanguage();
  const { role } = useAuth();
  const { data: allTeams, isLoading } = useListTeams();
  const teams = section ? allTeams?.filter(t => t.clubSection === section) : allTeams;
  const [search, setSearch] = useState("");
  const [ageGroupFilter, setAgeGroupFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [scheduleTeam, setScheduleTeam] = useState<{ id: number; name: string } | null>(null);
  const [scheduleRows, setScheduleRows] = useState<TrainingSlot[]>([]);
  const [editTeam, setEditTeam] = useState<any | null>(null);
  const [editScheduleRows, setEditScheduleRows] = useState<TrainingSlot[]>([]);
  const [createScheduleRows, setCreateScheduleRows] = useState<TrainingSlot[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canExport = role === "admin" || role === "secretary" || role === "director";
  const isStaffRole = role === "coach" || role === "fitness_coach" || role === "technical_director" || role === "athletic_director";
  const canEditSchedule = role === "admin" || role === "coach" || role === "technical_director" || role === "director" || role === "secretary";
  const canEditTeam = role === "admin" || role === "director" || role === "secretary";

  const handleExportTeams = () => {
    if (!teams?.length) return;
    exportToExcel(mapTeamsForExcel(teams), "Squadre_FTB", "Squadre");
  };

  const teamSchema = z.object({
    name: z.string().min(2, t.nameRequired),
    ageGroup: z.string().optional(),
    category: z.string().optional(),
    clubSection: z.enum(["scuola_calcio", "settore_giovanile", "prima_squadra"]).default("scuola_calcio"),
  });

  const createMutation = useCreateTeam({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        setIsCreateOpen(false);
        toast({ title: t.createTeam });
        form.reset();
        setCreateScheduleRows([]);
      }
    }
  });

  const deleteMutation = useDeleteTeam({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        toast({ title: t.deleteTeam });
      }
    }
  });

  const updateScheduleMutation = useUpdateTeam({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        setScheduleTeam(null);
        toast({ title: "Orari salvati" });
      },
      onError: (err: any) => {
        console.error("[updateScheduleMutation] error:", err);
        toast({ title: "Errore nel salvataggio orari", description: err?.message ?? String(err), variant: "destructive" });
      },
    }
  });

  function openScheduleDialog(team: { id: number; name: string; trainingSchedule?: TrainingSlot[] | null }) {
    setScheduleTeam({ id: team.id, name: team.name });
    setScheduleRows(team.trainingSchedule ? [...team.trainingSchedule] : []);
  }

  function addScheduleRow() {
    setScheduleRows(prev => [...prev, { day: "Lunedì", startTime: "17:00", endTime: "19:00" }]);
  }

  function removeScheduleRow(idx: number) {
    setScheduleRows(prev => prev.filter((_, i) => i !== idx));
  }

  function updateScheduleRow(idx: number, field: keyof TrainingSlot, value: string) {
    setScheduleRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }

  function saveSchedule() {
    if (!scheduleTeam) return;
    console.log("[saveSchedule] id=", scheduleTeam.id, "scheduleRows=", scheduleRows);
    updateScheduleMutation.mutate({ id: scheduleTeam.id, data: { trainingSchedule: scheduleRows } });
  }

  const updateTeamMutation = useUpdateTeam({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
        setEditTeam(null);
        toast({ title: "Squadra aggiornata" });
      },
      onError: (err: any) => {
        console.error("[updateTeamMutation] error:", err);
        toast({ title: "Errore nel salvataggio squadra", description: err?.message ?? String(err), variant: "destructive" });
      },
    }
  });

  const editForm = useForm<z.infer<typeof teamSchema>>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", ageGroup: "", category: "", clubSection: "scuola_calcio" }
  });

  function openEditDialog(team: any) {
    setEditTeam(team);
    setEditScheduleRows(team.trainingSchedule ? [...team.trainingSchedule] : []);
    editForm.reset({
      name: team.name ?? "",
      ageGroup: team.ageGroup ?? "",
      category: team.category ?? "",
      clubSection: team.clubSection ?? "scuola_calcio",
    });
  }

  function saveEditTeam(data: z.infer<typeof teamSchema>) {
    if (!editTeam) return;
    console.log("[saveEditTeam] id=", editTeam.id, "editScheduleRows=", editScheduleRows, "formData=", data);
    updateTeamMutation.mutate({ id: editTeam.id, data: { ...data, trainingSchedule: editScheduleRows } });
  }

  function addEditScheduleRow() {
    setEditScheduleRows(prev => [...prev, { day: "Lunedì", startTime: "17:00", endTime: "19:00" }]);
  }

  function removeEditScheduleRow(idx: number) {
    setEditScheduleRows(prev => prev.filter((_, i) => i !== idx));
  }

  function updateEditScheduleRow(idx: number, field: keyof TrainingSlot, value: string) {
    setEditScheduleRows(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  }

  const form = useForm<z.infer<typeof teamSchema>>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: "", ageGroup: "", category: "", clubSection: section ?? "scuola_calcio" }
  });

  useEffect(() => {
    form.setValue("clubSection", section ?? "scuola_calcio");
  }, [section]);

  const uniqueAgeGroups = Array.from(new Set(teams?.map(t => t.ageGroup).filter(Boolean) as string[])).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
  const uniqueCategories = Array.from(new Set(teams?.map(t => t.category).filter(Boolean) as string[])).sort();

  const filteredTeams = teams?.filter(t => {
    if (!t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (ageGroupFilter !== "all" && t.ageGroup !== ageGroupFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  }).sort((a, b) => {
    const numA = parseInt((a.ageGroup ?? "").replace(/\D/g, ""), 10);
    const numB = parseInt((b.ageGroup ?? "").replace(/\D/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    if (!isNaN(numA)) return -1;
    if (!isNaN(numB)) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight">{t.teams}</h1>
            <p className="text-muted-foreground mt-1">{t.teamsDesc}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canExport && (
              <>
                <ImportExcelDialog
                  label="Importa"
                  templateLabel="Scarica template squadre"
                  previewColumns={[
                    { key: "Nome Squadra", label: "Nome Squadra" },
                    { key: "Categoria", label: "Categoria" },
                    { key: "Fascia d'Età", label: "Fascia d'Età" },
                  ]}
                  onDownloadTemplate={downloadTeamTemplate}
                  onParseRow={(row) => mapExcelRowToTeam(row) as Record<string, unknown>}
                  isValidRow={isValidTeamRow}
                  onImportRows={async ([row]) => {
                    await createMutation.mutateAsync({ data: row as any });
                    queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
                  }}
                />
                <Button variant="outline" onClick={handleExportTeams} disabled={!teams?.length} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  Esporta
                </Button>
              </>
            )}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                <Plus className="w-5 h-5 mr-2" />
                {t.addTeam}
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t.createNewTeam}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate({ data: { ...data, trainingSchedule: createScheduleRows } }))} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t.teamName} <span className="text-destructive">*</span></Label>
                <Input id="name" placeholder="e.g. U19 Academy" {...form.register("name")} />
              </div>
              {section ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border text-sm">
                  <span className="text-muted-foreground">Sezione:</span>
                  <span className="font-medium">{sectionLabel(section)}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Sezione <span className="text-destructive">*</span></Label>
                  <Controller
                    name="clubSection"
                    control={form.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona sezione" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEZIONI.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ageGroup">{t.ageGroup}</Label>
                  <Input id="ageGroup" placeholder="e.g. U19" {...form.register("ageGroup")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">{t.category}</Label>
                  <Input id="category" placeholder="e.g. Youth" {...form.register("category")} />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Orari di allenamento</span>
                </div>
                {createScheduleRows.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nessun orario. Puoi aggiungerli ora o in seguito.</p>
                )}
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {createScheduleRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-muted/40 border rounded-lg px-2 py-1.5">
                      <Select value={row.day} onValueChange={(val) => setCreateScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, day: val } : r))}>
                        <SelectTrigger className="w-[110px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GIORNI_SETTIMANA.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="time" value={row.startTime} onChange={(e) => setCreateScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, startTime: e.target.value } : r))} className="h-7 text-xs flex-1" />
                      <span className="text-muted-foreground text-xs">–</span>
                      <Input type="time" value={row.endTime} onChange={(e) => setCreateScheduleRows(prev => prev.map((r, i) => i === idx ? { ...r, endTime: e.target.value } : r))} className="h-7 text-xs flex-1" />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setCreateScheduleRows(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full gap-2 border-dashed text-xs"
                  onClick={() => setCreateScheduleRows(prev => [...prev, { day: "Lunedì", startTime: "17:00", endTime: "19:00" }])}>
                  <PlusCircle className="w-3.5 h-3.5" />
                  Aggiungi sessione
                </Button>
              </div>

              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createMutation.isPending} className="w-full sm:w-auto">
                  {createMutation.isPending ? t.creating : t.createTeam}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="space-y-2">
        <div className="bg-card border rounded-xl shadow-sm p-2 flex items-center gap-2 max-w-md focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search className="w-5 h-5 text-muted-foreground ml-2" />
          <Input
            placeholder={t.searchTeams}
            className="border-0 focus-visible:ring-0 shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {(uniqueAgeGroups.length > 0 || uniqueCategories.length > 0) && (
          <div className="flex flex-col gap-2 px-1">
            {uniqueAgeGroups.length > 0 && (
              <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Fascia età</span>
                  <button type="button" onClick={() => setAgeGroupFilter("all")}
                    className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${ageGroupFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    Tutte
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                  {uniqueAgeGroups.map(ag => (
                    <button key={ag} type="button" onClick={() => setAgeGroupFilter(ag)}
                      className={`shrink-0 px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${ageGroupFilter === ag ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {ag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {uniqueCategories.length > 0 && (
              <div className="flex flex-col gap-1 bg-card border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Categoria</span>
                  <button type="button" onClick={() => setCategoryFilter("all")}
                    className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${categoryFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    Tutte
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {uniqueCategories.map(cat => (
                    <button key={cat} type="button" onClick={() => setCategoryFilter(cat)}
                      className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(ageGroupFilter !== "all" || categoryFilter !== "all") && (
              <button type="button" onClick={() => { setAgeGroupFilter("all"); setCategoryFilter("all"); }}
                className="self-start px-2 py-1 text-[11px] text-destructive font-medium hover:underline">
                Azzera filtri
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : filteredTeams?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed">
          {isStaffRole && !search ? (
            <>
              <ShieldOff className="w-16 h-16 text-muted mx-auto mb-4" />
              <h3 className="text-xl font-semibold">Nessuna squadra assegnata</h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                Non hai ancora squadre assegnate. Contatta l'amministratore per ricevere l'accesso.
              </p>
            </>
          ) : (
            <>
              <UsersRound className="w-16 h-16 text-muted mx-auto mb-4" />
              <h3 className="text-xl font-semibold">{t.noTeamsFound}</h3>
              <p className="text-muted-foreground mt-2 mb-6">{t.getStartedTeam}</p>
              {!isStaffRole && <Button variant="outline" onClick={() => setIsCreateOpen(true)}>{t.createTeam}</Button>}
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams?.map(team => {
            const staff = (team as any).assignedStaff as { userId: number; name: string; role: string }[] | undefined;
            const coaches = staff?.filter(s => s.role === "coach" || s.role === "fitness_coach" || s.role === "technical_director") ?? [];

            return (
              <Card key={team.id} className="overflow-hidden group hover:shadow-lg transition-all border-border/50">
                <CardContent className="p-0">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex gap-1">
                        {canEditTeam ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Modifica squadra"
                            onClick={() => openEditDialog(team)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        ) : canEditSchedule ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Giorni e orari di allenamento"
                            onClick={() => openScheduleDialog({ id: team.id, name: team.name, trainingSchedule: (team as any).trainingSchedule })}>
                            <Clock className="w-4 h-4" />
                          </Button>
                        ) : null}
                        {canEditTeam && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => { if (confirm(t.deleteTeam)) deleteMutation.mutate({ id: team.id }) }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <Link href={`/teams/${team.id}`} className="block group/link">
                      <h3 className="text-xl font-bold font-display group-hover/link:text-primary transition-colors flex items-center gap-2">
                        {team.name}
                        <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all" />
                      </h3>
                    </Link>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {team.clubSection && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          team.clubSection === "scuola_calcio"
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800"
                            : team.clubSection === "settore_giovanile"
                            ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800"
                            : "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800"
                        }`}>
                          {sectionLabel(team.clubSection)}
                        </span>
                      )}
                      {team.ageGroup && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">{team.ageGroup}</span>}
                      {team.category && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border text-muted-foreground">{team.category}</span>}
                    </div>

                    {coaches.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          <UserCheck className="w-3.5 h-3.5" />
                          {t.assignedStaff}
                        </div>
                        <div className="space-y-1">
                          {coaches.map(s => (
                            <div key={s.userId} className="flex items-center gap-2 text-sm">
                              <span className="text-base leading-none">{STAFF_ROLE_ICONS[s.role] ?? "👤"}</span>
                              <span className="font-medium text-foreground">{s.name}</span>
                              <span className="text-xs text-muted-foreground">· {staffRoleLabel(s.role, t)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {(team as any).trainingSchedule?.length > 0 && (
                    <div className="px-6 pb-5 pt-1 border-t mt-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                        <Clock className="w-3.5 h-3.5" />
                        Giorni e orari di allenamento
                      </div>
                      <div className="space-y-1.5">
                        {((team as any).trainingSchedule as TrainingSlot[]).map((slot, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-foreground min-w-[80px]">{slot.day}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {slot.startTime} – {slot.endTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-muted/30 px-6 py-4 border-t flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span>{team.playerCount} {t.playerCount}</span>
                    </div>
                    <Link href={`/teams/${team.id}`} className="font-medium text-primary hover:underline">
                      {t.viewRoster}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Team Dialog — admin, director, secretary */}
      <Dialog open={!!editTeam} onOpenChange={(open) => { if (!open) setEditTeam(null); }}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              Modifica squadra
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(saveEditTeam)} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t.teamName} <span className="text-destructive">*</span></Label>
              <Input id="edit-name" {...editForm.register("name")} />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-ageGroup">{t.ageGroup}</Label>
                <Input id="edit-ageGroup" placeholder="es. U19" {...editForm.register("ageGroup")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">{t.category}</Label>
                <Input id="edit-category" placeholder="es. Juniores" {...editForm.register("category")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sezione</Label>
              <Controller
                name="clubSection"
                control={editForm.control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEZIONI.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Orari di allenamento</span>
              </div>
              {editScheduleRows.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nessun orario impostato. Aggiungi una sessione.
                </p>
              )}
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {editScheduleRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/40 border rounded-lg px-3 py-2">
                    <Select value={row.day} onValueChange={(val) => updateEditScheduleRow(idx, "day", val)}>
                      <SelectTrigger className="w-[120px] h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GIORNI_SETTIMANA.map(g => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1.5 flex-1">
                      <Input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => updateEditScheduleRow(idx, "startTime", e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                      <span className="text-muted-foreground text-xs">–</span>
                      <Input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateEditScheduleRow(idx, "endTime", e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      type="button"
                      onClick={() => removeEditScheduleRow(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addEditScheduleRow}>
                <PlusCircle className="w-4 h-4" />
                Aggiungi sessione
              </Button>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditTeam(null)}>Annulla</Button>
              <Button type="submit" disabled={updateTeamMutation.isPending}>
                {updateTeamMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleTeam} onOpenChange={(open) => { if (!open) setScheduleTeam(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Giorni e orari di allenamento — {scheduleTeam?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 max-h-[55vh] overflow-y-auto pr-1">
            {scheduleRows.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nessun orario impostato. Aggiungi una sessione.
              </p>
            )}
            {scheduleRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/40 border rounded-lg px-3 py-2">
                <Select value={row.day} onValueChange={(val) => updateScheduleRow(idx, "day", val)}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GIORNI_SETTIMANA.map(g => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 flex-1">
                  <Input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updateScheduleRow(idx, "startTime", e.target.value)}
                    className="h-8 text-sm flex-1"
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updateScheduleRow(idx, "endTime", e.target.value)}
                    className="h-8 text-sm flex-1"
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeScheduleRow(idx)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addScheduleRow}>
              <PlusCircle className="w-4 h-4" />
              Aggiungi sessione
            </Button>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setScheduleTeam(null)}>Annulla</Button>
            <Button onClick={saveSchedule} disabled={updateScheduleMutation.isPending}>
              {updateScheduleMutation.isPending ? "Salvataggio..." : "Salva orari"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
