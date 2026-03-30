import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Calendar, Clock, MapPin, Trash2, Eye, MessageSquare, Send,
  Megaphone, Star, ClipboardList, Loader2, BookOpen, UserCheck,
  ChevronDown, ChevronUp, X,
} from "lucide-react";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";

// ── Types ───────────────────────────────────────────────────────────────────

interface TrainingSession {
  id: number;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  location: string | null;
  status: string;
  teamId: number | null;
  teamName: string | null;
  createdByUserId: number | null;
  creatorName: string | null;
  sessionKind: string;
  sentToUserIds: number[] | null;
  tdComment: string | null;
  tdGuidelines: string | null;
  description?: string | null;
  objectives?: string | null;
  notes?: string | null;
}

interface TrainingDirective {
  id: number;
  title: string;
  message: string;
  type: string;
  sentToUserIds: number[];
  scheduledFor: string | null;
  createdAt: string;
}

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
  teamAssignments?: { teamId: number; teamName: string }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STAFF_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function fmtDate(d: string) {
  return format(new Date(d), "EEE d MMM yyyy – HH:mm", { locale: itLocale });
}

function fmtShortDate(d: string) {
  return format(new Date(d), "d MMM yyyy", { locale: itLocale });
}

function statusBadge(status: string) {
  if (status === "scheduled") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Pianificata</Badge>;
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Completata</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Annullata</Badge>;
}

function typeBadge(kind: string) {
  if (kind === "tipo") return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] gap-1">
      <Star className="w-2.5 h-2.5" /> Sessione Tipo
    </Badge>
  );
  return null;
}

function directiveTypeBadge(t: string) {
  if (t === "test") return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px]">Test</Badge>;
  if (t === "training") return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Allenamento</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Generale</Badge>;
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    coach: "Allenatore",
    fitness_coach: "Preparatore Fisico",
    athletic_director: "Resp. Atletico",
    technical_director: "Direttore Tecnico",
  };
  return map[role] ?? role;
}

// ── Session Card ───────────────────────────────────────────────────────────

function SessionCard({
  session, canDelete, onDelete, onComment, isReadOnly,
}: {
  session: TrainingSession;
  canDelete?: boolean;
  onDelete?: () => void;
  onComment?: () => void;
  isReadOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`overflow-hidden group hover:shadow-md transition-all ${session.sessionKind === "tipo" ? "border-amber-300/60 bg-amber-50/30" : ""}`}>
      <div className={`h-1 w-full ${
        session.status === "scheduled" ? "bg-primary" :
        session.status === "completed" ? "bg-green-500" : "bg-destructive"
      }`} />
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {statusBadge(session.status)}
            {typeBadge(session.sessionKind)}
          </div>
          <div className="flex items-center gap-1">
            {onComment && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={onComment} title="Commenta / linee guida">
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete} title="Elimina">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        <h3 className="font-semibold text-sm leading-tight">{session.title}</h3>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span>{fmtDate(session.scheduledAt)}</span>
          </div>
          {session.durationMinutes && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              <span>{session.durationMinutes} min</span>
            </div>
          )}
          {session.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              <span>{session.location}</span>
            </div>
          )}
        </div>

        {(session.teamName || session.creatorName) && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
            {session.teamName && <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">{session.teamName}</span>}
            {session.creatorName && <span className="text-[10px] text-muted-foreground">da {session.creatorName}</span>}
          </div>
        )}

        {(session.tdComment || session.tdGuidelines) && (
          <div>
            <button className="flex items-center gap-1 text-[11px] text-primary font-medium" onClick={() => setOpen(v => !v)}>
              <BookOpen className="w-3 h-3" />
              Note del Direttore Tecnico
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {open && (
              <div className="mt-2 space-y-2 text-xs">
                {session.tdComment && (
                  <div className="bg-primary/5 rounded p-2 border border-primary/20">
                    <p className="font-medium text-primary mb-0.5">Commento</p>
                    <p className="text-foreground/80">{session.tdComment}</p>
                  </div>
                )}
                {session.tdGuidelines && (
                  <div className="bg-amber-50 rounded p-2 border border-amber-200">
                    <p className="font-medium text-amber-800 mb-0.5">Linee guida</p>
                    <p className="text-foreground/80">{session.tdGuidelines}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recipient Selector ─────────────────────────────────────────────────────

function RecipientSelector({
  members, selected, onChange,
}: {
  members: Member[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const staff = members.filter(m => ["coach", "fitness_coach", "athletic_director"].includes(m.role));
  return (
    <div className="space-y-2 max-h-52 overflow-y-auto border rounded-md p-3">
      {staff.length === 0 && <p className="text-xs text-muted-foreground">Nessun allenatore/preparatore trovato</p>}
      {staff.map(m => (
        <div key={m.id} className="flex items-center gap-2">
          <Checkbox
            id={`r-${m.id}`}
            checked={selected.includes(m.id)}
            onCheckedChange={checked => {
              onChange(checked ? [...selected, m.id] : selected.filter(id => id !== m.id));
            }}
          />
          <Label htmlFor={`r-${m.id}`} className="text-xs font-normal cursor-pointer flex-1">
            <span className="font-medium">{m.firstName} {m.lastName}</span>
            <span className="text-muted-foreground ml-1.5 text-[10px]">{roleLabel(m.role)}</span>
            {m.teamAssignments?.map(a => (
              <span key={a.teamId} className="ml-1 text-[10px] text-primary">• {a.teamName}</span>
            ))}
          </Label>
        </div>
      ))}
    </div>
  );
}

// ── Create Session Dialog ──────────────────────────────────────────────────

function CreateSessionDialog({
  open, onClose, onCreated, members, isTD, teams,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Member[];
  isTD: boolean;
  teams: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(90);
  const [location, setLocation] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [sessionKind, setSessionKind] = useState<"regular" | "tipo">("regular");
  const [recipients, setRecipients] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() {
    setTitle(""); setScheduledAt(""); setDuration(90);
    setLocation(""); setTeamId(null); setSessionKind("regular"); setRecipients([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !scheduledAt) return;
    if (sessionKind === "tipo" && recipients.length === 0) {
      toast({ title: "Seleziona almeno un destinatario", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/training-sessions", {
        method: "POST",
        body: JSON.stringify({
          title, scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration, location: location || null,
          teamId, status: "scheduled",
          sessionKind,
          sentToUserIds: sessionKind === "tipo" ? recipients : null,
        }),
      });
      onCreated();
      onClose();
      reset();
      toast({ title: sessionKind === "tipo" ? "Sessione Tipo inviata" : "Sessione creata" });
    } catch {
      toast({ title: "Errore nella creazione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isTD ? "Nuova Sessione" : "Pianifica Sessione di Allenamento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {isTD && (
            <div className="space-y-2">
              <Label>Tipo sessione</Label>
              <Select value={sessionKind} onValueChange={v => setSessionKind(v as "regular" | "tipo")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Sessione regolare (visibile a te e direttore)</SelectItem>
                  <SelectItem value="tipo">Sessione TIPO — da inviare agli allenatori</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Titolo <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Lavoro difensivo" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data e ora <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Durata (min)</Label>
              <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={15} max={300} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Squadra</Label>
              <Select value={teamId?.toString() ?? ""} onValueChange={v => setTeamId(v ? Number(v) : null)}>
                <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                <SelectContent>
                  {teams.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Luogo</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Campo 1..." />
            </div>
          </div>

          {isTD && sessionKind === "tipo" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Destinatari (allenatori / preparatori)
              </Label>
              <RecipientSelector members={members} selected={recipients} onChange={setRecipients} />
              {recipients.length > 0 && (
                <p className="text-xs text-muted-foreground">{recipients.length} destinatari selezionati</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {sessionKind === "tipo" ? "Invia Sessione Tipo" : "Crea Sessione"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Comment Dialog (TD only) ───────────────────────────────────────────────

function CommentDialog({
  session, onClose, onSaved,
}: {
  session: TrainingSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [comment, setComment] = useState(session.tdComment ?? "");
  const [guidelines, setGuidelines] = useState(session.tdGuidelines ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      await apiFetch(`/api/training-sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tdComment: comment, tdGuidelines: guidelines }),
      });
      toast({ title: "Note salvate" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Errore nel salvataggio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Note e linee guida — {session.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Commento</Label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Aggiungi un commento sulla sessione..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Linee guida da seguire</Label>
            <Textarea
              value={guidelines}
              onChange={e => setGuidelines(e.target.value)}
              placeholder="Es. Lavorate sull'intensità, pressione alta, uscite difensive..."
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva note
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Directive Dialog (TD only) ─────────────────────────────────────────────

function DirectiveDialog({
  open, onClose, onCreated, members,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  members: Member[];
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recipients, setRecipients] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  function reset() { setTitle(""); setMessage(""); setType("general"); setScheduledFor(""); setRecipients([]); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !message) return;
    if (recipients.length === 0) {
      toast({ title: "Seleziona almeno un destinatario", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/training-directives", {
        method: "POST",
        body: JSON.stringify({ title, message, type, scheduledFor: scheduledFor || null, sentToUserIds: recipients }),
      });
      onCreated();
      onClose();
      reset();
      toast({ title: "Direttiva inviata" });
    } catch {
      toast({ title: "Errore", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            Nuova Direttiva
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Titolo <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Lavoro tattico settimana" required />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Generale</SelectItem>
                  <SelectItem value="training">Allenamento</SelectItem>
                  <SelectItem value="test">Test / Valutazione</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Messaggio <span className="text-destructive">*</span></Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Descrivi le direttive da seguire..." rows={4} required />
          </div>
          <div className="space-y-2">
            <Label>Data di riferimento (opzionale)</Label>
            <Input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Destinatari
            </Label>
            <RecipientSelector members={members} selected={recipients} onChange={setRecipients} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { onClose(); reset(); }}>Annulla</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Invia direttiva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Directives Banner (for coaches) ───────────────────────────────────────

function DirectivesBanner({ directives, onDismiss }: { directives: TrainingDirective[]; onDismiss: (id: number) => void }) {
  if (!directives.length) return null;
  return (
    <div className="space-y-3">
      {directives.map(d => (
        <Card key={d.id} className="border-amber-300/70 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <Megaphone className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{d.title}</p>
                    {directiveTypeBadge(d.type)}
                    {d.scheduledFor && (
                      <span className="text-[10px] text-muted-foreground">{fmtShortDate(d.scheduledFor)}</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80">{d.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {fmtShortDate(d.createdAt)} · Dal Direttore Tecnico
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => onDismiss(d.id)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [commentSession, setCommentSession] = useState<TrainingSession | null>(null);
  const [directiveOpen, setDirectiveOpen] = useState(false);
  const [dismissedDirectives, setDismissedDirectives] = useState<number[]>([]);

  const sessionsQuery = useQuery<TrainingSession[]>({
    queryKey: ["/api/training-sessions"],
    queryFn: () => apiFetch("/api/training-sessions"),
    enabled: role !== "secretary",
  });

  const directivesQuery = useQuery<TrainingDirective[]>({
    queryKey: ["/api/training-directives"],
    queryFn: () => apiFetch("/api/training-directives"),
    enabled: !!role && !["secretary", "admin", "director"].includes(role),
  });

  const membersQuery = useQuery<Member[]>({
    queryKey: ["/api/clubs/me/members"],
    queryFn: () => apiFetch("/api/clubs/me/members"),
    enabled: role === "technical_director",
  });

  const teamsQuery = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/teams"],
    queryFn: () => apiFetch("/api/teams"),
    enabled: !!role,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/training-sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/training-sessions"] }); toast({ title: "Sessione eliminata" }); },
    onError: () => toast({ title: "Errore nell'eliminazione", variant: "destructive" }),
  });

  const deleteDirectiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/training-directives/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/training-directives"] }),
  });

  function invalidateSessions() { qc.invalidateQueries({ queryKey: ["/api/training-sessions"] }); }
  function invalidateDirectives() { qc.invalidateQueries({ queryKey: ["/api/training-directives"] }); }

  const sessions = sessionsQuery.data ?? [];
  const directives = directivesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const teams = teamsQuery.data ?? [];
  const userId = (user as any)?.id as number | undefined;

  const activeDirectives = directives.filter(d => !dismissedDirectives.includes(d.id));

  // ── Secretary: no access ─────────────────────────────────────────────────
  if (role === "secretary") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <Eye className="w-12 h-12 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Accesso non consentito</h2>
        <p className="text-muted-foreground max-w-sm">
          La segreteria non ha accesso alla sezione sessioni di allenamento.
        </p>
      </div>
    );
  }

  // ── Session grids ─────────────────────────────────────────────────────────
  const isReadOnly = role === "admin" || role === "director";
  const isTD = role === "technical_director";
  const isCoach = ["coach", "fitness_coach", "athletic_director"].includes(role ?? "");

  const regularSessions = sessions.filter(s => s.sessionKind === "regular");
  const tipoSessions = sessions.filter(s => s.sessionKind === "tipo");
  const mySessionsForCoach = sessions.filter(s =>
    s.sessionKind === "regular" && s.createdByUserId === userId
  );
  const tipoReceived = sessions.filter(s =>
    s.sessionKind === "tipo" && s.sentToUserIds?.includes(userId ?? 0)
  );

  function SessionGrid({ items, emptyMsg, canDeleteFn, showComment }: {
    items: TrainingSession[];
    emptyMsg: string;
    canDeleteFn?: (s: TrainingSession) => boolean;
    showComment?: boolean;
  }) {
    if (sessionsQuery.isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="h-44 rounded-lg bg-muted/30 animate-pulse" />
          ))}
        </div>
      );
    }
    if (!items.length) {
      return (
        <div className="text-center py-16">
          <Calendar className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-muted-foreground">{emptyMsg}</p>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(s => (
          <SessionCard
            key={s.id}
            session={s}
            canDelete={canDeleteFn ? canDeleteFn(s) : false}
            onDelete={() => { if (confirm("Eliminare questa sessione?")) deleteMutation.mutate(s.id); }}
            onComment={showComment ? () => setCommentSession(s) : undefined}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>
    );
  }

  // ── Technical Director view ───────────────────────────────────────────────
  if (isTD) {
    const tdDirectives = directives;
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              Gestione Allenamenti
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualizza tutte le sessioni, invia sessioni tipo e direttive agli allenatori
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDirectiveOpen(true)}>
              <Megaphone className="w-4 h-4 mr-2" />
              Direttiva
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nuova sessione
            </Button>
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="all">
              Tutte le sessioni
              {sessions.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">{sessions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tipo">
              Sessioni Tipo
              {tipoSessions.length > 0 && <Badge className="ml-1.5 bg-amber-100 text-amber-700 text-[10px] px-1">{tipoSessions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="directives">
              Direttive
              {tdDirectives.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">{tdDirectives.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Tab: All sessions */}
          <TabsContent value="all" className="mt-6">
            <SessionGrid
              items={sessions}
              emptyMsg="Nessuna sessione di allenamento registrata nel club"
              canDeleteFn={s => s.createdByUserId === userId}
              showComment={true}
            />
          </TabsContent>

          {/* Tab: Sessioni Tipo */}
          <TabsContent value="tipo" className="mt-6">
            <div className="mb-4 flex items-start gap-3 text-sm text-muted-foreground bg-amber-50/60 border border-amber-200 rounded-lg px-4 py-3">
              <Star className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                Le <strong>Sessioni Tipo</strong> vengono inviate agli allenatori o preparatori selezionati e appaiono direttamente nelle loro dashboard come sessioni da seguire.
              </span>
            </div>
            <SessionGrid
              items={tipoSessions}
              emptyMsg="Nessuna sessione tipo inviata"
              canDeleteFn={s => s.createdByUserId === userId}
            />
          </TabsContent>

          {/* Tab: Directives */}
          <TabsContent value="directives" className="mt-6">
            <div className="space-y-3">
              {tdDirectives.length === 0 ? (
                <div className="text-center py-16">
                  <Megaphone className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground">Nessuna direttiva inviata</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setDirectiveOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Invia prima direttiva
                  </Button>
                </div>
              ) : tdDirectives.map(d => (
                <Card key={d.id} className="border-amber-200/60">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{d.title}</p>
                          {directiveTypeBadge(d.type)}
                          {d.scheduledFor && (
                            <span className="text-[10px] text-muted-foreground">Ref: {fmtShortDate(d.scheduledFor)}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/80">{d.message}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Inviata il {fmtShortDate(d.createdAt)} · {d.sentToUserIds.length} destinatari
                        </p>
                      </div>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => { if (confirm("Eliminare questa direttiva?")) deleteDirectiveMutation.mutate(d.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <CreateSessionDialog
          open={createOpen} onClose={() => setCreateOpen(false)}
          onCreated={invalidateSessions} members={members} isTD teams={teams}
        />
        <DirectiveDialog
          open={directiveOpen} onClose={() => setDirectiveOpen(false)}
          onCreated={invalidateDirectives} members={members}
        />
        {commentSession && (
          <CommentDialog
            session={commentSession}
            onClose={() => setCommentSession(null)}
            onSaved={invalidateSessions}
          />
        )}
      </div>
    );
  }

  // ── Admin / Director: read-only ───────────────────────────────────────────
  if (isReadOnly) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              Calendario Allenamenti
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Vista completa — solo lettura</p>
          </div>
          <Badge variant="outline" className="gap-1.5 text-muted-foreground">
            <Eye className="w-3 h-3" /> Solo visualizzazione
          </Badge>
        </div>
        <SessionGrid
          items={sessions}
          emptyMsg="Nessuna sessione di allenamento programmata"
        />
      </div>
    );
  }

  // ── Coach / Fitness Coach / Athletic Director ─────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Le mie Sessioni
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Pianifica e gestisci le tue sessioni di allenamento</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuova sessione
        </Button>
      </div>

      {/* Directives from TD */}
      {activeDirectives.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-amber-500" />
            Direttive dal Direttore Tecnico
          </h2>
          <DirectivesBanner
            directives={activeDirectives}
            onDismiss={id => setDismissedDirectives(prev => [...prev, id])}
          />
        </div>
      )}

      {/* Tipo sessions received */}
      {tipoReceived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-500" />
            Sessioni Tipo da Seguire ({tipoReceived.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tipoReceived.map(s => <SessionCard key={s.id} session={s} />)}
          </div>
        </div>
      )}

      {/* My sessions */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Le mie sessioni ({mySessionsForCoach.length})
        </h2>
        <SessionGrid
          items={mySessionsForCoach}
          emptyMsg="Non hai ancora pianificato sessioni di allenamento"
          canDeleteFn={s => s.createdByUserId === userId}
        />
      </div>

      <CreateSessionDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={invalidateSessions} members={[]} isTD={false} teams={teams}
      />
    </div>
  );
}
