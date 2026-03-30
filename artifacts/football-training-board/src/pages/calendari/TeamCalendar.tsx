import { useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Calendar, MapPin, Trophy, FileText,
  CheckCircle, Clock, Pencil, AlertTriangle, RotateCcw,
  ClipboardList,
} from "lucide-react";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";

interface Match {
  id: number;
  opponent: string;
  date: string;
  competition?: string | null;
  location?: string | null;
  homeAway: string;
  result?: string | null;
  notes?: string | null;
  preMatchNotes?: string | null;
  postMatchNotes?: string | null;
  teamName?: string | null;
  teamId?: number | null;
  isPostponed?: boolean;
  rescheduleDate?: string | null;
  rescheduleTbd?: boolean;
}

interface Team { id: number; name: string; category?: string; }

const CLUB_NAME = "Gavinana Firenze";

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) } });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function matchPhase(m: Match): "autunnale" | "primaverile" | "tornei" {
  const comp = (m.competition ?? "").toLowerCase();
  if (["torneo", "coppa", "trofeo", "amichev", "cup"].some(k => comp.includes(k))) return "tornei";
  const month = new Date(m.date).getMonth();
  return month >= 7 ? "autunnale" : "primaverile";
}

function MatchCard({ match, canEditPreNotes, canEditPostNotes, canEditSchedule }: {
  match: Match;
  canEditPreNotes: boolean;
  canEditPostNotes: boolean;
  canEditSchedule: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editingPostNotes, setEditingPostNotes] = useState(false);
  const [postNoteValue, setPostNoteValue] = useState(match.postMatchNotes ?? "");

  const [editingPreNotes, setEditingPreNotes] = useState(false);
  const [preNoteValue, setPreNoteValue] = useState(match.preMatchNotes ?? "");

  const [editingSchedule, setEditingSchedule] = useState(false);
  const [newDate, setNewDate] = useState(() => {
    try { return format(new Date(match.date), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
  });
  const [isPostponed, setIsPostponed] = useState(match.isPostponed ?? false);
  const [rescheduleTbd, setRescheduleTbd] = useState(match.rescheduleTbd ?? false);
  const [rescheduleDate, setRescheduleDate] = useState(() => {
    if (!match.rescheduleDate) return "";
    try { return format(new Date(match.rescheduleDate), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
  });

  const postTextareaRef = useRef<HTMLTextAreaElement>(null);
  const preTextareaRef = useRef<HTMLTextAreaElement>(null);

  const patch = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/api/matches/${match.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Salvato" });
    },
    onError: (err: any) => toast({ title: err?.message ?? "Errore nel salvataggio", variant: "destructive" }),
  });

  const matchDate = new Date(match.date);
  const isPast = matchDate < new Date();
  const isHome = match.homeAway === "home";

  const homeLabel = isHome ? CLUB_NAME : match.opponent;
  const awayLabel = isHome ? match.opponent : CLUB_NAME;

  const statusColor = match.isPostponed
    ? "border-l-amber-400"
    : isPast
    ? "border-l-muted-foreground/30"
    : "border-l-primary";

  function savePostNotes() {
    patch.mutate({ postMatchNotes: postNoteValue });
    setEditingPostNotes(false);
  }

  function savePreNotes() {
    patch.mutate({ preMatchNotes: preNoteValue });
    setEditingPreNotes(false);
  }

  function saveSchedule() {
    patch.mutate({
      date: newDate ? new Date(newDate).toISOString() : undefined,
      isPostponed,
      rescheduleTbd: isPostponed ? rescheduleTbd : false,
      rescheduleDate: isPostponed && !rescheduleTbd && rescheduleDate ? new Date(rescheduleDate).toISOString() : null,
    });
    setEditingSchedule(false);
  }

  return (
    <Card className={`transition-shadow hover:shadow-md border-l-4 ${statusColor}`}>
      <CardContent className="py-4 px-5 space-y-3">

        {/* Match header */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            {/* Score line */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-bold text-base">{homeLabel}</span>
              <span className="text-muted-foreground font-medium text-sm">vs</span>
              <span className="font-bold text-base">{awayLabel}</span>
              <Badge variant={isHome ? "default" : "secondary"} className="text-xs shrink-0">
                {isHome ? "Casa" : "Trasferta"}
              </Badge>
              {match.result && (
                <Badge variant="outline" className="text-xs font-bold shrink-0">{match.result}</Badge>
              )}
              {match.isPostponed && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 shrink-0">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Rinviata
                </Badge>
              )}
              {!isPast && !match.isPostponed && (
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  <Clock className="w-3 h-3" /> In programma
                </span>
              )}
            </div>

            {/* Date and details */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(matchDate, "EEEE d MMMM yyyy • HH:mm", { locale: itLocale })}
              </span>
              {match.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{match.location}</span>
              )}
              {match.competition && (
                <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />{match.competition}</span>
              )}
              {match.notes && <span className="italic">{match.notes}</span>}
            </div>

            {/* Reschedule info */}
            {match.isPostponed && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-600">
                <RotateCcw className="w-3 h-3" />
                {match.rescheduleTbd
                  ? "Recupero: da concordare"
                  : match.rescheduleDate
                  ? `Recupero previsto: ${format(new Date(match.rescheduleDate), "d MMMM yyyy • HH:mm", { locale: itLocale })}`
                  : "Data recupero non definita"}
              </div>
            )}
          </div>

          {/* Schedule edit button */}
          {canEditSchedule && !editingSchedule && (
            <Button
              size="sm" variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary shrink-0"
              onClick={() => setEditingSchedule(true)}
            >
              <Pencil className="w-3 h-3" /> Modifica
            </Button>
          )}
        </div>

        {/* Schedule editor */}
        {editingSchedule && canEditSchedule && (
          <div className="bg-muted/40 rounded-lg p-3 space-y-3 border">
            <p className="text-xs font-semibold text-muted-foreground">Modifica data/orario e stato</p>
            <div className="space-y-1">
              <Label className="text-xs">Data e orario</Label>
              <Input
                type="datetime-local"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`postponed-${match.id}`}
                checked={isPostponed}
                onCheckedChange={v => setIsPostponed(!!v)}
              />
              <Label htmlFor={`postponed-${match.id}`} className="text-xs cursor-pointer">
                Partita rinviata
              </Label>
            </div>
            {isPostponed && (
              <div className="pl-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`tbd-${match.id}`}
                    checked={rescheduleTbd}
                    onCheckedChange={v => setRescheduleTbd(!!v)}
                  />
                  <Label htmlFor={`tbd-${match.id}`} className="text-xs cursor-pointer">
                    Data recupero da concordare
                  </Label>
                </div>
                {!rescheduleTbd && (
                  <div className="space-y-1">
                    <Label className="text-xs">Data presunta recupero</Label>
                    <Input
                      type="datetime-local"
                      value={rescheduleDate}
                      onChange={e => setRescheduleDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingSchedule(false)}>
                Annulla
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={saveSchedule} disabled={patch.isPending}>
                <CheckCircle className="w-3 h-3" /> Salva
              </Button>
            </div>
          </div>
        )}

        {/* Pre-match notes */}
        {(canEditPreNotes || match.preMatchNotes) && (
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Note pre-partita
              </span>
              {canEditPreNotes && !editingPreNotes && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                  onClick={() => { setEditingPreNotes(true); setPreNoteValue(match.preMatchNotes ?? ""); setTimeout(() => preTextareaRef.current?.focus(), 50); }}
                >
                  <Pencil className="w-3 h-3" />
                  {match.preMatchNotes ? "Modifica" : "Aggiungi"}
                </Button>
              )}
              {editingPreNotes && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingPreNotes(false)}>Annulla</Button>
                  <Button size="sm" className="h-6 text-xs gap-1" disabled={patch.isPending} onClick={savePreNotes}>
                    <CheckCircle className="w-3 h-3" /> Salva
                  </Button>
                </div>
              )}
            </div>
            {editingPreNotes ? (
              <Textarea
                ref={preTextareaRef}
                value={preNoteValue}
                onChange={e => setPreNoteValue(e.target.value)}
                placeholder="Es: ritrovo ore 14:30, indicazioni tattiche, comunicazioni pre-gara..."
                rows={3}
                className="text-xs resize-none"
              />
            ) : match.preMatchNotes ? (
              <p className="text-sm bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 italic text-foreground/80 leading-relaxed">
                {match.preMatchNotes}
              </p>
            ) : null}
          </div>
        )}

        {/* Post-match notes */}
        {(isPast || match.postMatchNotes) && (
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="w-3 h-3" /> Note post-partita
              </span>
              {canEditPostNotes && !editingPostNotes && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                  onClick={() => { setEditingPostNotes(true); setPostNoteValue(match.postMatchNotes ?? ""); setTimeout(() => postTextareaRef.current?.focus(), 50); }}
                >
                  <Pencil className="w-3 h-3" />
                  {match.postMatchNotes ? "Modifica" : "Aggiungi"}
                </Button>
              )}
              {editingPostNotes && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingPostNotes(false)}>Annulla</Button>
                  <Button size="sm" className="h-6 text-xs gap-1" disabled={patch.isPending} onClick={savePostNotes}>
                    <CheckCircle className="w-3 h-3" /> Salva
                  </Button>
                </div>
              )}
            </div>
            {editingPostNotes ? (
              <Textarea
                ref={postTextareaRef}
                value={postNoteValue}
                onChange={e => setPostNoteValue(e.target.value)}
                placeholder="Es: buona prestazione collettiva, difficoltà nella fase difensiva..."
                rows={3}
                className="text-xs resize-none"
              />
            ) : match.postMatchNotes ? (
              <p className="text-sm bg-muted/40 rounded-md px-3 py-2 italic text-foreground/80 leading-relaxed">
                {match.postMatchNotes}
              </p>
            ) : canEditPostNotes ? null : (
              <p className="text-xs text-muted-foreground italic">Nessuna nota inserita.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TeamCalendarProps { overrideTeamId?: number; }

export default function TeamCalendar({ overrideTeamId }: TeamCalendarProps = {}) {
  const [, params] = useRoute("/calendari/:teamId");
  const [, navigate] = useLocation();
  const { role } = useAuth();

  const teamId = overrideTeamId ?? (params?.teamId ? parseInt(params.teamId) : null);
  const isStandalone = !overrideTeamId;

  // Segreteria, Direttore Sportivo, Amministratore → gestione logistica partita
  const canEditSchedule  = ["secretary", "director", "admin"].includes(role ?? "");
  // stessa categoria: note pre-partita (indicazioni operative/logistiche)
  const canEditPreNotes  = ["secretary", "director", "admin"].includes(role ?? "");
  // Allenatori, preparatori, direttore tecnico → analisi post-gara
  const canEditPostNotes = ["coach", "fitness_coach", "athletic_director", "technical_director"].includes(role ?? "");

  const { data: matches = [], isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", teamId],
    queryFn: () => apiFetch(`/api/matches${teamId ? `?teamId=${teamId}` : ""}`),
    enabled: !!teamId,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    queryFn: () => apiFetch("/api/teams"),
  });

  const team = teams.find(t => t.id === teamId);

  const sorted = [...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const autunnale   = sorted.filter(m => matchPhase(m) === "autunnale");
  const primaverile = sorted.filter(m => matchPhase(m) === "primaverile");
  const tornei      = sorted.filter(m => matchPhase(m) === "tornei");

  if (!teamId) return <div className="p-6 text-muted-foreground">Squadra non trovata.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        {isStandalone && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {team?.name ?? `Squadra #${teamId}`}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Calendario Partite — Stagione 2025/2026</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna partita programmata per questa squadra.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="autunnale">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="autunnale">
              🍂 Fase Autunnale
              {autunnale.length > 0 && <span className="ml-1.5 text-[10px] bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5">{autunnale.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="primaverile">
              🌸 Fase Primaverile
              {primaverile.length > 0 && <span className="ml-1.5 text-[10px] bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5">{primaverile.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="tornei">
              🏆 Tornei
              {tornei.length > 0 && <span className="ml-1.5 text-[10px] bg-secondary text-secondary-foreground rounded-full px-1.5 py-0.5">{tornei.length}</span>}
            </TabsTrigger>
          </TabsList>

          {[
            { value: "autunnale",   items: autunnale },
            { value: "primaverile", items: primaverile },
            { value: "tornei",      items: tornei },
          ].map(({ value, items }) => (
            <TabsContent key={value} value={value} className="mt-4 space-y-3">
              {items.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    Nessuna partita in questa fase.
                  </CardContent>
                </Card>
              ) : items.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  canEditPreNotes={canEditPreNotes}
                  canEditPostNotes={canEditPostNotes}
                  canEditSchedule={canEditSchedule}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
