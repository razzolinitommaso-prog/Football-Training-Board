import { useState, useEffect } from "react";
import {
  Heart, Send, Trash2, CalendarDays, FileText, Megaphone, Plus,
  MessageSquare, ChevronLeft, ChevronRight, Loader2, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Errore API"); }
  return res.json();
}

const TABS = [
  { key: "comms",     label: "Comunicazioni", icon: MessageSquare },
  { key: "calendar",  label: "Calendario Sett.",  icon: CalendarDays },
  { key: "documents", label: "Documenti",     icon: FileText },
  { key: "events",    label: "Eventi",        icon: Megaphone },
] as const;

type TabKey = typeof TABS[number]["key"];

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getWeekRange(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7);
  d.setHours(0, 0, 0, 0);
  const from = new Date(d);
  const to = new Date(d);
  to.setDate(to.getDate() + 6);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function fmtWeek(from: Date, to: Date) {
  return `${from.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${to.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    info:      { label: "Info",       cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    calendar:  { label: "Calendario", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    document:  { label: "Documento",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    event:     { label: "Evento",     cls: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    warning:   { label: "Avviso",     cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const s = map[type] ?? map.info;
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

export default function SecretaryParentApp() {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("comms");
  const [comms, setComms] = useState<any[]>([]);
  const [loadingComms, setLoadingComms] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Comms form
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState("info");

  // Calendar
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<{ sessions: any[]; matches: any[] } | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [calNote, setCalNote] = useState("");

  // Document form
  const [docTitle, setDocTitle] = useState("");
  const [docDesc, setDocDesc] = useState("");
  const [docUrl, setDocUrl] = useState("");

  // Event form
  const [evTitle, setEvTitle] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evDesc, setEvDesc] = useState("");
  const [evLocation, setEvLocation] = useState("");

  function loadComms() {
    setLoadingComms(true);
    apiFetch("/secretary/parent-comms")
      .then(setComms)
      .catch(err => toast({ title: "Errore", description: err.message, variant: "destructive" }))
      .finally(() => setLoadingComms(false));
  }

  useEffect(() => { loadComms(); }, []);

  function loadSchedule() {
    const { from, to } = getWeekRange(weekOffset);
    setLoadingSchedule(true);
    apiFetch(`/secretary/weekly-schedule?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(d => setSchedule(d))
      .catch(err => toast({ title: "Errore", description: err.message, variant: "destructive" }))
      .finally(() => setLoadingSchedule(false));
  }

  useEffect(() => {
    if (tab === "calendar") loadSchedule();
  }, [tab, weekOffset]);

  async function sendComm(payload: { title: string; message: string; type: string }) {
    setSending(true);
    try {
      await apiFetch("/secretary/parent-comms", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Inviato!", description: "I genitori vedranno questa comunicazione nell'app." });
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      loadComms();
      return true;
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleSendComm(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) { toast({ title: "Compila titolo e messaggio", variant: "destructive" }); return; }
    const ok = await sendComm({ title, message, type: msgType });
    if (ok) { setTitle(""); setMessage(""); }
  }

  async function handleSendCalendar() {
    const { from, to } = getWeekRange(weekOffset);
    if (!schedule) return;
    const events = [
      ...schedule.sessions.map(s => `⚽ ${fmtDate(s.scheduledAt)} — Allenamento${s.teamName ? ` (${s.teamName})` : ""}${s.location ? ` @ ${s.location}` : ""}`),
      ...schedule.matches.map(m => `🏆 ${fmtDate(m.date)} — Partita vs ${m.opponent}${m.teamName ? ` (${m.teamName})` : ""}${m.venue ? ` @ ${m.venue}` : ""} [${m.homeAway === "home" ? "Casa" : "Trasferta"}]`),
    ].sort();
    const calTitle = `📅 Calendario settimana ${fmtWeek(from, to)}`;
    const calMsg = events.length > 0
      ? events.join("\n") + (calNote.trim() ? `\n\n📝 ${calNote}` : "")
      : `Nessun evento programmato per la settimana ${fmtWeek(from, to)}.` + (calNote.trim() ? `\n\n📝 ${calNote}` : "");
    await sendComm({ title: calTitle, message: calMsg, type: "calendar" });
    setCalNote("");
  }

  async function handleSendDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docTitle.trim() || !docDesc.trim()) { toast({ title: "Compila titolo e descrizione", variant: "destructive" }); return; }
    const msg = docDesc + (docUrl.trim() ? `\n\n🔗 ${docUrl.trim()}` : "");
    const ok = await sendComm({ title: docTitle, message: msg, type: "document" });
    if (ok) { setDocTitle(""); setDocDesc(""); setDocUrl(""); }
  }

  async function handleSendEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evTitle.trim() || !evDesc.trim()) { toast({ title: "Compila titolo e descrizione", variant: "destructive" }); return; }
    const msg = (evDate ? `📆 Data: ${new Date(evDate).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}\n` : "")
      + (evLocation ? `📍 Luogo: ${evLocation}\n\n` : "")
      + evDesc;
    const ok = await sendComm({ title: evTitle, message: msg, type: "event" });
    if (ok) { setEvTitle(""); setEvDate(""); setEvDesc(""); setEvLocation(""); }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await apiFetch(`/secretary/parent-comms/${deleteId}`, { method: "DELETE" });
      toast({ title: "Eliminato" });
      loadComms();
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  }

  const filteredByTab = (type: string) => comms.filter(c => c.type === type);
  const { from, to } = getWeekRange(weekOffset);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
          <Heart className="w-5 h-5 text-pink-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">App Genitori</h1>
          <p className="text-muted-foreground text-sm">Gestisci comunicazioni, documenti ed eventi visibili dai genitori</p>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-muted/30 rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 text-sm font-medium py-2 px-3 rounded-lg transition-all ${tab === t.key ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── COMUNICAZIONI ── */}
      {tab === "comms" && (
        <div className="space-y-4">
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Nuova Comunicazione</h2>
            <form onSubmit={handleSendComm} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {["info","warning","event"].map(t => (
                  <button key={t} type="button" onClick={() => setMsgType(t)}
                    className={`py-2 text-xs rounded-lg border transition-all ${msgType === t ? "bg-primary/10 border-primary/30 text-primary font-semibold" : "border-border text-muted-foreground hover:border-primary/20"}`}>
                    {t === "info" ? "ℹ️ Informativa" : t === "warning" ? "⚠️ Avviso" : "📢 Annuncio"}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-xs">Titolo *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Oggetto del messaggio..." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Messaggio *</Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Testo della comunicazione..." rows={4} className="mt-1 resize-none" />
              </div>
              <Button type="submit" disabled={sending} className="w-full">
                {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Invio...</> : sent ? <><CheckCircle className="w-4 h-4 mr-2" />Inviato!</> : <><Send className="w-4 h-4 mr-2" />Invia ai Genitori</>}
              </Button>
            </form>
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground">Storico comunicazioni ({comms.filter(c => c.type === "info" || c.type === "warning").length})</h3>
          {loadingComms ? <div className="h-24 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
            <div className="space-y-2">
              {comms.filter(c => c.type === "info" || c.type === "warning").length === 0 ? (
                <p className="text-center py-10 text-sm text-muted-foreground">Nessuna comunicazione inviata</p>
              ) : comms.filter(c => c.type === "info" || c.type === "warning").map(c => (
                <CommCard key={c.id} comm={c} onDelete={() => setDeleteId(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CALENDARIO ── */}
      {tab === "calendar" && (
        <div className="space-y-4">
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Calendario Settimana</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium min-w-[180px] text-center">{fmtWeek(from, to)}</span>
                <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>

            {loadingSchedule ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : schedule && (schedule.sessions.length + schedule.matches.length) === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-25" />
                <p>Nessun evento programmato per questa settimana</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...  (schedule?.sessions ?? []).map(s => ({ date: s.scheduledAt, label: `⚽ Allenamento`, team: s.teamName, sub: s.location, kind: "training" })),
                   ...(schedule?.matches ?? []).map(m => ({ date: m.date, label: `🏆 Partita vs ${m.opponent}`, team: m.teamName, sub: m.venue, kind: "match" }))]
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((ev, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${ev.kind === "match" ? "bg-amber-500/5 border-amber-500/15" : "bg-primary/5 border-primary/10"}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{ev.label}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(ev.date)}{ev.team ? ` · ${ev.team}` : ""}{ev.sub ? ` · ${ev.sub}` : ""}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div>
              <Label className="text-xs">Note aggiuntive (opzionale)</Label>
              <Textarea value={calNote} onChange={e => setCalNote(e.target.value)} placeholder="Indicazioni, avvisi o informazioni da aggiungere al calendario..." rows={2} className="mt-1 resize-none" />
            </div>
            <Button onClick={handleSendCalendar} disabled={sending || !schedule} className="w-full bg-emerald-600 hover:bg-emerald-500">
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Invio...</> : <><Send className="w-4 h-4 mr-2" />Invia Calendario ai Genitori</>}
            </Button>
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground">Calendari inviati ({filteredByTab("calendar").length})</h3>
          <div className="space-y-2">
            {filteredByTab("calendar").length === 0 ? (
              <p className="text-center py-10 text-sm text-muted-foreground">Nessun calendario inviato</p>
            ) : filteredByTab("calendar").map(c => (
              <CommCard key={c.id} comm={c} onDelete={() => setDeleteId(c.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── DOCUMENTI ── */}
      {tab === "documents" && (
        <div className="space-y-4">
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Pubblica Documento</h2>
            <form onSubmit={handleSendDocument} className="space-y-3">
              <div>
                <Label className="text-xs">Titolo documento *</Label>
                <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Es. Modulo iscrizione 2025/26..." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Descrizione *</Label>
                <Textarea value={docDesc} onChange={e => setDocDesc(e.target.value)} placeholder="Istruzioni, scadenze o informazioni sul documento..." rows={3} className="mt-1 resize-none" />
              </div>
              <div>
                <Label className="text-xs">Link al documento (opzionale)</Label>
                <Input value={docUrl} onChange={e => setDocUrl(e.target.value)} placeholder="https://drive.google.com/..." className="mt-1" />
              </div>
              <Button type="submit" disabled={sending} className="w-full bg-amber-600 hover:bg-amber-500">
                {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Pubblicazione...</> : <><FileText className="w-4 h-4 mr-2" />Pubblica per i Genitori</>}
              </Button>
            </form>
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground">Documenti pubblicati ({filteredByTab("document").length})</h3>
          <div className="space-y-2">
            {filteredByTab("document").length === 0 ? (
              <p className="text-center py-10 text-sm text-muted-foreground">Nessun documento pubblicato</p>
            ) : filteredByTab("document").map(c => (
              <CommCard key={c.id} comm={c} onDelete={() => setDeleteId(c.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── EVENTI ── */}
      {tab === "events" && (
        <div className="space-y-4">
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Promuovi Evento</h2>
            <form onSubmit={handleSendEvent} className="space-y-3">
              <div>
                <Label className="text-xs">Nome evento *</Label>
                <Input value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Es. Torneo estivo, Cena sociale..." className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Data evento</Label>
                  <Input type="datetime-local" value={evDate} onChange={e => setEvDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Luogo</Label>
                  <Input value={evLocation} onChange={e => setEvLocation(e.target.value)} placeholder="Campo, palestra..." className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Descrizione *</Label>
                <Textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Dettagli, programma, informazioni utili..." rows={4} className="mt-1 resize-none" />
              </div>
              <Button type="submit" disabled={sending} className="w-full bg-purple-600 hover:bg-purple-500">
                {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Invio...</> : <><Megaphone className="w-4 h-4 mr-2" />Promuovi Evento</>}
              </Button>
            </form>
          </div>

          <h3 className="text-sm font-semibold text-muted-foreground">Eventi promossi ({filteredByTab("event").length})</h3>
          <div className="space-y-2">
            {filteredByTab("event").length === 0 ? (
              <p className="text-center py-10 text-sm text-muted-foreground">Nessun evento promosso</p>
            ) : filteredByTab("event").map(c => (
              <CommCard key={c.id} comm={c} onDelete={() => setDeleteId(c.id)} />
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa voce?</AlertDialogTitle>
            <AlertDialogDescription>Sarà rimossa anche dall'Area Genitori e non potrà essere recuperata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CommCard({ comm, onDelete }: { comm: any; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-card border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 mb-1">
            <TypeBadge type={comm.type} />
            <span className="text-xs text-muted-foreground">{new Date(comm.sentAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <p className="font-medium text-sm">{comm.title}</p>
          {expanded && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{comm.message}</p>}
        </div>
        <button onClick={onDelete} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
