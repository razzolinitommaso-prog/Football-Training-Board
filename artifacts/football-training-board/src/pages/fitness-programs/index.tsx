import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Dumbbell, Users, Pencil, CalendarDays, ClipboardList, PenLine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react/custom-fetch";
import { useListTeams } from "@workspace/api-client-react";
import { useForm, Controller } from "react-hook-form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type ProgramDay = {
  week: number;
  day: string;
  title: string;
  durationMinutes: string;
  materials: string;
  instructions: string;
};

type ProgramPlan = { version: 1; days: ProgramDay[] };

interface FitnessProgram {
  id: number;
  title: string;
  description: string | null;
  durationWeeks: number | null;
  intensityLevel: string;
  teamId: number | null;
  teamName: string | null;
  planJson?: string | null;
  materials?: string | null;
  boardNotes?: string | null;
  createdAt: string;
}

interface FormValues {
  title: string;
  description: string;
  durationWeeks: number | "";
  intensityLevel: string;
  teamId: number | "";
  materials: string;
  boardNotes: string;
}

const WEEK_DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function parsePlan(raw: string | null | undefined, durationWeeks = 1): ProgramPlan {
  try {
    const parsed = JSON.parse(raw ?? "") as ProgramPlan;
    if (parsed?.version === 1 && Array.isArray(parsed.days)) return parsed;
  } catch {
    // Old programs have no structured plan yet.
  }
  return {
    version: 1,
    days: Array.from({ length: Math.max(1, durationWeeks) }, (_, index) => ({
      week: index + 1,
      day: "Lunedì",
      title: "",
      durationMinutes: "",
      materials: "",
      instructions: "",
    })),
  };
}

function serializePlan(days: ProgramDay[]) {
  const cleanDays = days.filter((day) => day.title.trim() || day.materials.trim() || day.instructions.trim() || day.durationMinutes.trim());
  return cleanDays.length > 0 ? JSON.stringify({ version: 1, days: cleanDays } satisfies ProgramPlan) : null;
}

function programSummary(plan: ProgramPlan) {
  const sessions = plan.days.filter((day) => day.title.trim()).length;
  const minutes = plan.days.reduce((sum, day) => sum + (Number(day.durationMinutes) || 0), 0);
  return { sessions, minutes };
}

export default function FitnessPrograms() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<FitnessProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<FitnessProgram | null>(null);
  const [saving, setSaving] = useState(false);
  const [planDays, setPlanDays] = useState<ProgramDay[]>(parsePlan(null, 1).days);
  const { data: teams } = useListTeams();

  const form = useForm<FormValues>({
    defaultValues: { title: "", description: "", durationWeeks: 1, intensityLevel: "medium", teamId: "", materials: "", boardNotes: "" },
  });

  const watchedWeeks = Number(form.watch("durationWeeks") || 1);

  const intensityColors: Record<string, string> = {
    low: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    high: "bg-orange-100 text-orange-800",
    very_high: "bg-red-100 text-red-800",
  };

  const intensityLabel: Record<string, string> = {
    low: t.low,
    medium: t.medium,
    high: t.high,
    very_high: t.veryHigh,
  };

  const loadPrograms = () => {
    setLoading(true);
    customFetch<FitnessProgram[]>("/api/fitness-programs", { method: "GET" })
      .then(setPrograms)
      .finally(() => setLoading(false));
  };

  useEffect(loadPrograms, []);

  function resetDialog() {
    setEditingProgram(null);
    setPlanDays(parsePlan(null, 1).days);
    form.reset({ title: "", description: "", durationWeeks: 1, intensityLevel: "medium", teamId: "", materials: "", boardNotes: "" });
  }

  function openEdit(program: FitnessProgram) {
    setEditingProgram(program);
    form.reset({
      title: program.title,
      description: program.description ?? "",
      durationWeeks: program.durationWeeks ?? 1,
      intensityLevel: program.intensityLevel,
      teamId: program.teamId ?? "",
      materials: program.materials ?? "",
      boardNotes: program.boardNotes ?? "",
    });
    setPlanDays(parsePlan(program.planJson, program.durationWeeks ?? 1).days);
    setIsOpen(true);
  }

  useEffect(() => {
    setPlanDays((current) => {
      const existingWeeks = new Set(current.map((day) => day.week));
      const next = [...current].filter((day) => day.week <= watchedWeeks);
      for (let week = 1; week <= watchedWeeks; week++) {
        if (!existingWeeks.has(week)) next.push({ week, day: "Lunedì", title: "", durationMinutes: "", materials: "", instructions: "" });
      }
      return next.sort((a, b) => a.week - b.week || WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day));
    });
  }, [watchedWeeks]);

  function updatePlanDay(index: number, patch: Partial<ProgramDay>) {
    setPlanDays((current) => current.map((day, i) => (i === index ? { ...day, ...patch } : day)));
  }

  function addPlanDay(week: number) {
    setPlanDays((current) => [...current, { week, day: "Lunedì", title: "", durationMinutes: "", materials: "", instructions: "" }]);
  }

  function removePlanDay(index: number) {
    setPlanDays((current) => current.filter((_, i) => i !== index));
  }

  const daysByWeek = useMemo(() => {
    const map = new Map<number, Array<ProgramDay & { originalIndex: number }>>();
    planDays.forEach((day, index) => {
      const list = map.get(day.week) ?? [];
      list.push({ ...day, originalIndex: index });
      map.set(day.week, list);
    });
    return Array.from({ length: Math.max(1, watchedWeeks) }, (_, index) => ({
      week: index + 1,
      days: map.get(index + 1) ?? [],
    }));
  }, [planDays, watchedWeeks]);

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const payload = {
        title: values.title,
        description: values.description || null,
        durationWeeks: values.durationWeeks || null,
        intensityLevel: values.intensityLevel,
        teamId: values.teamId || null,
        materials: values.materials || null,
        boardNotes: values.boardNotes || null,
        planJson: serializePlan(planDays),
      };
      if (editingProgram) await customFetch(`/api/fitness-programs/${editingProgram.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await customFetch("/api/fitness-programs", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: t.saved });
      setIsOpen(false);
      resetDialog();
      loadPrograms();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (id: number) => {
    try {
      await customFetch(`/api/fitness-programs/${id}`, { method: "DELETE" });
      setPrograms((p) => p.filter((x) => x.id !== id));
      toast({ title: t.saved });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t.fitnessPrograms}</h1>
          <p className="text-muted-foreground mt-1">{t.fitnessProgramsDesc}</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />{t.addProgram}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProgram ? "Modifica programma atletico" : t.createNewProgram}</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.programTitle} *</Label>
                  <Input {...form.register("title", { required: true })} />
                </div>
                <div className="space-y-2">
                  <Label>{t.assignedTo}</Label>
                  <Controller
                    control={form.control}
                    name="teamId"
                    render={({ field }) => (
                      <Select value={String(field.value)} onValueChange={(v) => field.onChange(v === "all" ? "" : parseInt(v))}>
                        <SelectTrigger><SelectValue placeholder={t.allTeamsProgram} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t.allTeamsProgram}</SelectItem>
                          {teams?.map((team) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.description}</Label>
                <Textarea {...form.register("description")} rows={3} placeholder="Obiettivo del programma, fase della stagione, carichi generali..." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t.durationWeeks}</Label>
                  <Input type="number" min={1} max={12} {...form.register("durationWeeks")} />
                </div>
                <div className="space-y-2">
                  <Label>{t.intensityLevel}</Label>
                  <Controller
                    control={form.control}
                    name="intensityLevel"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{t.low}</SelectItem>
                          <SelectItem value="medium">{t.medium}</SelectItem>
                          <SelectItem value="high">{t.high}</SelectItem>
                          <SelectItem value="very_high">{t.veryHigh}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Materiali generali</Label>
                  <Input {...form.register("materials")} placeholder="Elastici, coni, ostacoli, GPS..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Indicazioni lavagna / area di lavoro</Label>
                <Textarea {...form.register("boardNotes")} rows={2} placeholder="Disposizione campo, corsie, distanze, vincoli..." />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-base font-semibold">Programmazione settimane e giorni</Label>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href="/exercises"><ClipboardList className="w-4 h-4 mr-2" />Libreria esercitazioni</Link>
                  </Button>
                </div>
                {daysByWeek.map(({ week, days }) => (
                  <div key={week} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">Settimana {week}</p>
                      <Button type="button" variant="ghost" size="sm" onClick={() => addPlanDay(week)}>
                        <Plus className="w-4 h-4 mr-1" />Giorno
                      </Button>
                    </div>
                    {days.map((day) => (
                      <div key={day.originalIndex} className="grid grid-cols-1 md:grid-cols-[150px_1fr_110px] gap-2 rounded-md bg-muted/20 p-2">
                        <Select value={day.day} onValueChange={(value) => updatePlanDay(day.originalIndex, { day: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{WEEK_DAYS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={day.title} onChange={(e) => updatePlanDay(day.originalIndex, { title: e.target.value })} placeholder="Esercitazione o lavoro atletico" />
                        <Input value={day.durationMinutes} onChange={(e) => updatePlanDay(day.originalIndex, { durationMinutes: e.target.value })} type="number" min={0} placeholder="Min" />
                        <Input value={day.materials} onChange={(e) => updatePlanDay(day.originalIndex, { materials: e.target.value })} placeholder="Materiali" />
                        <Textarea className="md:col-span-2" value={day.instructions} onChange={(e) => updatePlanDay(day.originalIndex, { instructions: e.target.value })} rows={2} placeholder="Indicazioni operative" />
                        <div className="md:col-span-3 flex justify-end">
                          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removePlanDay(day.originalIndex)}>
                            <Trash2 className="w-4 h-4 mr-1" />Rimuovi
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" asChild>
                  <Link href="/tactical-board"><PenLine className="w-4 h-4 mr-2" />Apri lavagna</Link>
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t.saving : editingProgram ? "Aggiorna programma" : t.addProgram}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Dumbbell className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{t.noPrograms}</p>
            <p className="text-sm text-muted-foreground mt-1">{t.createFirstProgram}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((prog) => {
            const plan = parsePlan(prog.planJson, prog.durationWeeks ?? 1);
            const summary = programSummary(plan);
            return (
              <Card key={prog.id}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold leading-tight">{prog.title}</h3>
                    <Badge className={`shrink-0 text-xs ${intensityColors[prog.intensityLevel] ?? intensityColors.medium}`}>
                      {intensityLabel[prog.intensityLevel] ?? prog.intensityLevel}
                    </Badge>
                  </div>
                  {prog.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{prog.description}</p>}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{prog.teamName ?? t.allTeamsProgram}</span>
                    <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{prog.durationWeeks ?? 1} {t.weeks}</span>
                    <span>{summary.sessions} esercitazioni</span>
                    <span>{summary.minutes || "-"} minuti</span>
                  </div>
                  {prog.materials && <p className="mt-3 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">Materiali: {prog.materials}</p>}
                  <div className="mt-3 pt-3 border-t flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(prog)}><Pencil className="w-4 h-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t.deleteProgram}</AlertDialogTitle>
                          <AlertDialogDescription>{prog.title}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t.load}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteProgram(prog.id)} className="bg-destructive text-destructive-foreground">{t.deleteTactic}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
