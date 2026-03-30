import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  BookOpen, Plus, Trash2, Clock, Users, Package2, Pencil,
  ClipboardList, BookMarked, Link2, Info, Mic, PenLine,
  CalendarDays, Layers, Dumbbell, Shield,
} from "lucide-react";
import { ExerciseDrawingBoard } from "./ExerciseDrawingBoard";
import { ExerciseVoiceRecorder } from "./ExerciseVoiceRecorder";

interface Exercise {
  id: number; title: string; category?: string | null; description?: string | null;
  durationMinutes?: number | null; playersRequired?: number | null; equipment?: string | null;
  drawingData?: string | null; drawingElementsJson?: string | null; voiceNoteData?: string | null;
  isDraft?: boolean; teamId?: number | null; trainingDay?: string | null;
  principio?: string | null; trainingPhase?: string | null;
}

interface MyTeam { id: number; name: string; clubSection?: string | null; }

interface Guideline {
  id: number; title: string; content: string; category: string;
  sortOrder: number; linkedExerciseId?: number | null;
  linkedExercise?: { id: number; title: string } | null;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const CATEGORIES = ["technique", "physical", "tactical", "warmup", "shooting", "passing", "defending"] as const;

const categoryColors: Record<string, string> = {
  technique: "bg-blue-100 text-blue-700",
  physical: "bg-red-100 text-red-700",
  tactical: "bg-purple-100 text-purple-700",
  warmup: "bg-amber-100 text-amber-700",
  shooting: "bg-orange-100 text-orange-700",
  passing: "bg-green-100 text-green-700",
  defending: "bg-slate-100 text-slate-700",
};

const PHASES = [
  { value: "iniziale", label: "Iniziale", color: "bg-emerald-100 text-emerald-700" },
  { value: "centrale", label: "Centrale", color: "bg-blue-100 text-blue-700" },
  { value: "finale", label: "Finale", color: "bg-amber-100 text-amber-700" },
];

const PRINCIPI = [
  { value: "forza",           label: "FORZA",           color: "bg-red-100 text-red-700" },
  { value: "resistenza",      label: "RESISTENZA",      color: "bg-orange-100 text-orange-700" },
  { value: "tecnico_tattico", label: "TECNICO TATTICO", color: "bg-indigo-100 text-indigo-700" },
];

const GUIDELINE_CATEGORIES = [
  { value: "general",   label: "Generale",       color: "bg-gray-100 text-gray-700" },
  { value: "tactical",  label: "Tattica",         color: "bg-purple-100 text-purple-700" },
  { value: "technical", label: "Tecnica",         color: "bg-blue-100 text-blue-700" },
  { value: "physical",  label: "Fisico/Atletico", color: "bg-red-100 text-red-700" },
  { value: "mental",    label: "Mentale",         color: "bg-teal-100 text-teal-700" },
  { value: "recovery",  label: "Recupero",        color: "bg-green-100 text-green-700" },
];

function getGlCatColor(cat: string) { return GUIDELINE_CATEGORIES.find(c => c.value === cat)?.color ?? "bg-gray-100 text-gray-700"; }
function getGlCatLabel(cat: string) { return GUIDELINE_CATEGORIES.find(c => c.value === cat)?.label ?? cat; }
function getPhaseLabel(v: string) { return PHASES.find(p => p.value === v)?.label ?? v; }
function getPhaseColor(v: string) { return PHASES.find(p => p.value === v)?.color ?? "bg-gray-100 text-gray-700"; }
function getPrincipioLabel(v: string) { return PRINCIPI.find(p => p.value === v)?.label ?? v; }
function getPrincipioColor(v: string) { return PRINCIPI.find(p => p.value === v)?.color ?? "bg-gray-100 text-gray-700"; }

function emptyForm(): Omit<Exercise, "id"> {
  return { title: "", category: null, description: null, durationMinutes: null, playersRequired: null, equipment: null, drawingData: null, drawingElementsJson: null, voiceNoteData: null, isDraft: false, teamId: null, trainingDay: null, principio: null, trainingPhase: null };
}

export default function ExercisesPage() {
  const { t } = useLanguage();
  const { role } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const canEditGuidelines = role === "technical_director";

  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [glOpen, setGlOpen] = useState(false);
  const [editingGl, setEditingGl] = useState<Guideline | null>(null);
  const [glForm, setGlForm] = useState({ title: "", content: "", category: "general", linkedExerciseId: "", sortOrder: "0" });

  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ["/api/exercises"],
    queryFn: () => apiFetch("/api/exercises"),
  });

  const { data: guidelines = [], isLoading: glLoading } = useQuery<Guideline[]>({
    queryKey: ["/api/training-guidelines"],
    queryFn: () => apiFetch("/api/training-guidelines"),
  });

  const { data: myTeams = [] } = useQuery<MyTeam[]>({
    queryKey: ["/api/exercises/my-teams"],
    queryFn: () => apiFetch("/api/exercises/my-teams"),
  });

  const createEx = useMutation({
    mutationFn: (d: object) => apiFetch("/api/exercises", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/exercises"] }); closeExDialog(); toast({ title: "Esercizio creato" }); },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const updateEx = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiFetch(`/api/exercises/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/exercises"] }); closeExDialog(); toast({ title: "Esercizio aggiornato" }); },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const deleteEx = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/exercises/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/exercises"] }); toast({ title: "Esercizio eliminato" }); },
  });

  const toggleDraft = useMutation({
    mutationFn: ({ id, isDraft }: { id: number; isDraft: boolean }) =>
      apiFetch(`/api/exercises/${id}`, { method: "PATCH", body: JSON.stringify({ isDraft }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/exercises"] }),
  });

  const createGl = useMutation({
    mutationFn: (d: object) => apiFetch("/api/training-guidelines", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training-guidelines"] }); closeGlDialog(); toast({ title: "Linea guida aggiunta" }); },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const updateGl = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiFetch(`/api/training-guidelines/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training-guidelines"] }); closeGlDialog(); toast({ title: "Linea guida aggiornata" }); },
    onError: () => toast({ title: "Errore", variant: "destructive" }),
  });

  const deleteGl = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/training-guidelines/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/training-guidelines"] }),
  });

  function openNewEx() { setEditingEx(null); setForm(emptyForm()); setDialogOpen(true); }
  function openEditEx(ex: Exercise) { setEditingEx(ex); setForm({ ...ex }); setDialogOpen(true); }
  function closeExDialog() { setDialogOpen(false); setEditingEx(null); setForm(emptyForm()); }

  function openNewGl() { setEditingGl(null); setGlForm({ title: "", content: "", category: "general", linkedExerciseId: "", sortOrder: "0" }); setGlOpen(true); }
  function openEditGl(gl: Guideline) {
    setEditingGl(gl);
    setGlForm({ title: gl.title, content: gl.content, category: gl.category, linkedExerciseId: gl.linkedExerciseId?.toString() ?? "", sortOrder: gl.sortOrder.toString() });
    setGlOpen(true);
  }
  function closeGlDialog() { setGlOpen(false); setEditingGl(null); }

  function handleSaveEx(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      category: form.category || null,
      description: form.description || null,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
      playersRequired: form.playersRequired ? Number(form.playersRequired) : null,
      equipment: form.equipment || null,
      drawingData: form.drawingData ?? null,
      drawingElementsJson: form.drawingElementsJson ?? null,
      voiceNoteData: form.voiceNoteData ?? null,
      isDraft: form.isDraft ?? false,
      teamId: form.teamId ?? null,
      trainingDay: form.trainingDay || null,
      principio: form.principio || null,
      trainingPhase: form.trainingPhase || null,
    };
    if (editingEx) updateEx.mutate({ id: editingEx.id, data: payload });
    else createEx.mutate(payload);
  }

  function handleSaveGl(e: React.FormEvent) {
    e.preventDefault();
    const payload = { title: glForm.title, content: glForm.content, category: glForm.category, linkedExerciseId: glForm.linkedExerciseId ? Number(glForm.linkedExerciseId) : null, sortOrder: Number(glForm.sortOrder) || 0 };
    if (editingGl) updateGl.mutate({ id: editingGl.id, data: payload });
    else createGl.mutate(payload);
  }

  const filtered = filter === "all" ? exercises : exercises.filter(ex => ex.category === filter);
  const guidelinesByCategory = GUIDELINE_CATEGORIES.map(cat => ({ ...cat, items: guidelines.filter(g => g.category === cat.value) })).filter(cat => cat.items.length > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t.exerciseLibrary}</h1>
          <p className="text-sm text-muted-foreground">{t.exercisesDesc}</p>
        </div>
      </div>

      <Tabs defaultValue="exercises" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="exercises" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Esercizi
          </TabsTrigger>
          <TabsTrigger value="guidelines" className="flex items-center gap-2">
            <BookMarked className="w-4 h-4" /> Linee Guida
          </TabsTrigger>
        </TabsList>

        {/* ── TAB ESERCIZI ─────────────────────────────────────────── */}
        <TabsContent value="exercises" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Tutti</Button>
              {CATEGORIES.map(c => (
                <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} onClick={() => setFilter(c)}>
                  {t[c as keyof typeof t] as string}
                </Button>
              ))}
            </div>
            <Button onClick={openNewEx}><Plus className="w-4 h-4 mr-2" />{t.addExercise}</Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">{t.noExercises}</CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {filtered.map((ex) => (
                <Card key={ex.id} className={`hover:shadow-md transition-shadow ${ex.isDraft ? "border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {ex.isDraft && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300">
                              ✏️ Bozza
                            </span>
                          )}
                          <CardTitle className="text-base leading-snug">{ex.title}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ex.category && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryColors[ex.category] ?? "bg-gray-100 text-gray-700"}`}>
                              {t[ex.category as keyof typeof t] as string ?? ex.category}
                            </span>
                          )}
                          {ex.principio && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPrincipioColor(ex.principio)}`}>
                              <Dumbbell className="w-2.5 h-2.5 mr-1" />{getPrincipioLabel(ex.principio)}
                            </span>
                          )}
                          {ex.trainingPhase && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPhaseColor(ex.trainingPhase)}`}>
                              <Layers className="w-2.5 h-2.5 mr-1" />{getPhaseLabel(ex.trainingPhase)}
                            </span>
                          )}
                          {ex.teamId && myTeams.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Shield className="w-3 h-3" />
                              {myTeams.find(tm => tm.id === ex.teamId)?.name ?? `Team #${ex.teamId}`}
                            </span>
                          )}
                          {ex.trainingDay && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="w-3 h-3" />
                              {new Date(ex.trainingDay).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Indicators + action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {ex.drawingData && <span title="Ha disegno tattico"><PenLine className="w-3.5 h-3.5 text-primary/60" /></span>}
                        {ex.voiceNoteData && <span title="Ha nota vocale"><Mic className="w-3.5 h-3.5 text-primary/60" /></span>}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEditEx(ex)} title="Modifica">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm("Eliminare l'esercizio?")) deleteEx.mutate(ex.id); }} title="Elimina">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {ex.description && <p className="text-sm text-muted-foreground line-clamp-2">{ex.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {ex.durationMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ex.durationMinutes} min</span>}
                      {ex.playersRequired && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ex.playersRequired} gioc.</span>}
                      {ex.equipment && <span className="flex items-center gap-1"><Package2 className="w-3 h-3" />{ex.equipment}</span>}
                    </div>
                    {/* Draft toggle */}
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-xs text-muted-foreground">Segna come bozza</span>
                      <Switch
                        checked={!!ex.isDraft}
                        onCheckedChange={(checked) => toggleDraft.mutate({ id: ex.id, isDraft: checked })}
                      />
                    </div>
                    {/* Preview of drawing if exists */}
                    {ex.drawingData && (
                      <div className="mt-1 rounded overflow-hidden border" style={{ maxHeight: 90 }}>
                        <img src={ex.drawingData} alt="Disegno tattico" className="w-full object-cover" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TAB LINEE GUIDA ──────────────────────────────────────── */}
        <TabsContent value="guidelines" className="space-y-6 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/15 flex-1">
              <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Bacheca Linee Guida Tecniche</p>
                <p>Principi e indicazioni operative definiti dal Direttore Tecnico. Segui questi riferimenti nella pianificazione delle sessioni.</p>
              </div>
            </div>
            {canEditGuidelines && (
              <Button onClick={openNewGl}><Plus className="w-4 h-4 mr-2" />Aggiungi Linea Guida</Button>
            )}
          </div>

          {glLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t.loading}</div>
          ) : guidelines.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-16 text-center space-y-3">
              <BookMarked className="w-12 h-12 mx-auto text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">Nessuna linea guida ancora inserita</p>
              {canEditGuidelines
                ? <p className="text-sm text-muted-foreground">Aggiungi i principi metodologici da seguire durante gli allenamenti.</p>
                : <p className="text-sm text-muted-foreground">Il Direttore Tecnico non ha ancora inserito linee guida.</p>}
            </CardContent></Card>
          ) : (
            <div className="space-y-6">
              {guidelinesByCategory.map(cat => (
                <div key={cat.value} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${cat.color}`}>{cat.label}</span>
                    <Separator className="flex-1" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {cat.items.map(gl => (
                      <Card key={gl.id} className="hover:shadow-md transition-shadow border-l-4 border-l-primary/60">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold leading-snug">{gl.title}</CardTitle>
                            {canEditGuidelines && (
                              <div className="flex gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditGl(gl)}><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Eliminare?")) deleteGl.mutate(gl.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{gl.content}</p>
                          {gl.linkedExercise && (
                            <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                              <Link2 className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs text-primary font-medium">Esercizio: {gl.linkedExercise.title}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Exercise Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeExDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>{editingEx ? "Modifica Esercizio" : t.createExercise}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 overflow-auto">
            <form id="ex-form" onSubmit={handleSaveEx} className="px-6 pb-4">
              <Tabs defaultValue="info" className="w-full pt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="board" className="flex items-center gap-1.5">
                    <PenLine className="w-3.5 h-3.5" /> Lavagna
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" /> Voce
                  </TabsTrigger>
                </TabsList>

                {/* Info tab */}
                <TabsContent value="info" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>{t.exerciseTitle} <span className="text-destructive">*</span></Label>
                    <Input value={form.title ?? ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.category}</Label>
                      <Select value={form.category ?? ""} onValueChange={v => setForm(f => ({ ...f, category: v || null }))}>
                        <SelectTrigger><SelectValue placeholder={t.category} /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{t[c as keyof typeof t] as string}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t.duration} (min)</Label>
                      <Input type="number" value={form.durationMinutes ?? ""} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value ? Number(e.target.value) : null }))} min={0} />
                    </div>
                  </div>

                  {/* Team + Principio */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Squadra</Label>
                      <Select value={form.teamId?.toString() ?? "_none"} onValueChange={v => setForm(f => ({ ...f, teamId: v === "_none" ? null : Number(v) }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona squadra" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {myTeams.map(tm => <SelectItem key={tm.id} value={tm.id.toString()}>{tm.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Dumbbell className="w-3.5 h-3.5" /> Principio</Label>
                      <Select value={form.principio ?? "_none"} onValueChange={v => setForm(f => ({ ...f, principio: v === "_none" ? null : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona principio" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuno</SelectItem>
                          {PRINCIPI.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Training day + phase */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Giorno allenamento</Label>
                      <Input type="date" value={form.trainingDay ?? ""} onChange={e => setForm(f => ({ ...f, trainingDay: e.target.value || null }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Fase allenamento</Label>
                      <Select value={form.trainingPhase ?? "_none"} onValueChange={v => setForm(f => ({ ...f, trainingPhase: v === "_none" ? null : v }))}>
                        <SelectTrigger><SelectValue placeholder="Seleziona fase" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nessuna</SelectItem>
                          {PHASES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t.description}</Label>
                    <Textarea value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))} rows={3} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.playersRequired}</Label>
                      <Input type="number" value={form.playersRequired ?? ""} onChange={e => setForm(f => ({ ...f, playersRequired: e.target.value ? Number(e.target.value) : null }))} min={0} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.equipment}</Label>
                      <Input value={form.equipment ?? ""} onChange={e => setForm(f => ({ ...f, equipment: e.target.value || null }))} />
                    </div>
                  </div>

                  {/* Draft flag */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/10">
                    <div>
                      <p className="text-sm font-medium">Segna come bozza</p>
                      <p className="text-xs text-muted-foreground">L'esercizio sarà visibile come bozza da completare</p>
                    </div>
                    <Switch checked={!!form.isDraft} onCheckedChange={v => setForm(f => ({ ...f, isDraft: v }))} />
                  </div>
                </TabsContent>

                {/* Drawing board tab */}
                <TabsContent value="board" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Disegna rapidamente lo schema tattico dell'esercizio. Puoi approfondire poi sulla lavagna tattica principale.</p>
                  <ExerciseDrawingBoard
                    value={form.drawingData}
                    onChange={data => setForm(f => ({ ...f, drawingData: data }))}
                    onChangeElements={els => setForm(f => ({ ...f, drawingElementsJson: els ? JSON.stringify(els) : null }))}
                  />
                </TabsContent>

                {/* Voice note tab */}
                <TabsContent value="voice" className="pt-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Registra una nota vocale per descrivere l'esercizio o aggiungere indicazioni verbali.</p>
                  <ExerciseVoiceRecorder
                    value={form.voiceNoteData}
                    onChange={data => setForm(f => ({ ...f, voiceNoteData: data }))}
                  />
                </TabsContent>
              </Tabs>
            </form>
          </ScrollArea>
          <DialogFooter className="px-6 py-4 border-t">
            <Button type="button" variant="ghost" onClick={closeExDialog}>{t.cancel}</Button>
            <Button type="submit" form="ex-form" disabled={createEx.isPending || updateEx.isPending}>
              {editingEx ? "Salva modifiche" : t.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Guideline Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={glOpen} onOpenChange={(o) => { if (!o) closeGlDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingGl ? "Modifica Linea Guida" : "Nuova Linea Guida"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveGl} className="space-y-4">
            <div className="space-y-2">
              <Label>Titolo <span className="text-destructive">*</span></Label>
              <Input value={glForm.title} onChange={e => setGlForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={glForm.category} onValueChange={v => setGlForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GUIDELINE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ordine</Label>
                <Input type="number" value={glForm.sortOrder} onChange={e => setGlForm(f => ({ ...f, sortOrder: e.target.value }))} min={0} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contenuto <span className="text-destructive">*</span></Label>
              <Textarea value={glForm.content} onChange={e => setGlForm(f => ({ ...f, content: e.target.value }))} rows={5} required />
            </div>
            <div className="space-y-2">
              <Label>Esercizio di riferimento</Label>
              <Select value={glForm.linkedExerciseId || "_none"} onValueChange={v => setGlForm(f => ({ ...f, linkedExerciseId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nessuno</SelectItem>
                  {exercises.map(ex => <SelectItem key={ex.id} value={ex.id.toString()}>{ex.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeGlDialog}>{t.cancel}</Button>
              <Button type="submit" disabled={createGl.isPending || updateGl.isPending}>{editingGl ? "Aggiorna" : "Aggiungi"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
