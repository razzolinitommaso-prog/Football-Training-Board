import { useEffect, useState } from "react";
import { CalendarDays, Clock, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { withApi } from "@/lib/api-base";
import { upcomingFirst } from "@/lib/match-presentation";
import { trainingLocalDate } from "@workspace/api-zod";

type ParentCallup = {
  id: number;
  status: string;
  teamName: string | null;
  calledPlayers: { firstName: string; lastName: string; isOwnChild: boolean }[];
  match: {
    id: number;
    opponent: string;
    date: string;
    homeAway: string;
    competition: string | null;
    location: string | null;
    result?: string | null;
    notes: string | null;
    preMatchNotes: string | null;
    isPostponed: boolean;
    rescheduleDate: string | null;
    rescheduleTbd: boolean;
    convocationAt: string | null;
    convocationPlace: string | null;
  };
};

function scheduledDate(match: ParentCallup["match"]) {
  return match.isPostponed ? (match.rescheduleTbd ? null : match.rescheduleDate) : match.date;
}

async function apiFetch(path: string) {
  const res = await fetch(withApi(`/api${path}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function statusLabel(status: string) {
  if (status === "called") return "Convocato";
  if (status === "available") return "Disponibile";
  if (status === "unavailable") return "Non disponibile";
  return "In attesa";
}

function formatDate(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Non indicato";
  return new Date(value).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CallupDetail({ label, children }: { label: string; children?: string | null }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{children?.trim() || "Non indicato"}</dd></div>;
}

export default function ParentCallups() {
  const [items, setItems] = useState<ParentCallup[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch("/parent/callups")
      .then(setItems)
      .catch((error) => { setError(true); if (import.meta.env.DEV) console.error(error); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>;
  if (error) return <p role="alert">Non è stato possibile caricare le convocazioni. Riprova aggiornando la pagina.</p>;

  const hasDateFilter = Boolean(fromDate || toDate);
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const seenMatchIds = new Set<number>();
  const datedItems = new Map<number, ParentCallup>();
  const undatedItems: ParentCallup[] = [];
  for (const item of items) {
    if (seenMatchIds.has(item.match.id)) continue;
    seenMatchIds.add(item.match.id);
    const date = scheduledDate(item.match);
    if (!date) {
      if (!hasDateFilter) undatedItems.push(item);
      continue;
    }
    const day = trainingLocalDate(new Date(date));
    if (!invalidRange && (!fromDate || day >= fromDate) && (!toDate || day <= toDate)) datedItems.set(item.match.id, item);
  }
  const visibleItems = [
    ...upcomingFirst([...datedItems.values()].map(item => item.match)).map(match => datedItems.get(match.id)!),
    ...undatedItems,
  ];
  const homeCount = visibleItems.filter(item => item.match.homeAway === "home").length;
  const awayCount = visibleItems.filter(item => item.match.homeAway === "away").length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Convocazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">Convocazioni inserite dal mister. La disponibilità si comunica nel Calendario generale.</p>
      </div>

      {items.length > 0 && <section className="space-y-3 rounded-2xl border bg-card p-4" aria-label="Filtra convocazioni per data">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-medium">Dalla data
            <Input className="mt-1 min-w-0" type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
          </label>
          <label className="min-w-0 text-sm font-medium">Alla data
            <Input className="mt-1 min-w-0" type="date" value={toDate} onChange={event => setToDate(event.target.value)} />
          </label>
        </div>
        {hasDateFilter && <Button type="button" variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Azzera date</Button>}
        {invalidRange ? <p role="alert" className="text-sm text-destructive">La data finale deve essere uguale o successiva a quella iniziale.</p> : (
          <dl className="grid grid-cols-2 gap-2 text-sm" aria-label="Riepilogo delle convocazioni visualizzate">
            <div className="rounded-lg bg-muted/50 p-2"><dt>In casa</dt><dd className="text-lg font-semibold">{homeCount}</dd></div>
            <div className="rounded-lg bg-muted/50 p-2"><dt>In trasferta</dt><dd className="text-lg font-semibold">{awayCount}</dd></div>
          </dl>
        )}
      </section>}

      {!invalidRange && (visibleItems.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-4 h-14 w-14 opacity-25" />
          <p className="font-semibold">{hasDateFilter ? "Nessuna convocazione nel periodo selezionato" : "Nessuna convocazione"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div key={item.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">vs {item.match?.opponent ?? "Avversario"}</p>
                  <p className="text-xs text-muted-foreground">{item.teamName ?? "Squadra"}</p>
                  {item.match?.date && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-primary">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {scheduledDate(item.match) ? formatDate(scheduledDate(item.match)) : "Nuova data da definire"}
                    </p>
                  )}
                </div>
                <Badge variant={item.status === "called" || item.status === "available" ? "default" : item.status === "unavailable" ? "destructive" : "secondary"}>
                  {statusLabel(item.status)}
                </Badge>
              </div>
              <Dialog>
              <DialogTrigger asChild><Button variant="outline" className="mt-3 w-full sm:w-auto">Visualizza convocazione</Button></DialogTrigger>
              <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl">
              <DialogHeader className="pr-6">
                <DialogTitle className="break-words">Convocazione · vs {item.match?.opponent ?? "Avversario"}</DialogTitle>
                <DialogDescription>{item.teamName ?? "Squadra"} · {formatDate(item.match?.date)}</DialogDescription>
              </DialogHeader>
              <dl className="mt-4 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
                <CallupDetail label="Squadra">{item.teamName}</CallupDetail>
                <CallupDetail label="Avversario">{item.match?.opponent}</CallupDetail>
                <CallupDetail label="Casa / trasferta">{item.match?.homeAway === "home" ? "Casa" : item.match?.homeAway === "away" ? "Trasferta" : null}</CallupDetail>
                <CallupDetail label="Competizione">{item.match?.competition}</CallupDetail>
                <CallupDetail label="Giorno e orario partita">{formatDate(item.match?.date)}</CallupDetail>
                <CallupDetail label="Luogo e indirizzo campo">{item.match?.location}</CallupDetail>
                <CallupDetail label="Giorno e orario ritrovo">{formatDate(item.match?.convocationAt)}</CallupDetail>
                <CallupDetail label="Luogo di ritrovo">{item.match?.convocationPlace}</CallupDetail>
                {item.match?.isPostponed && <div className="sm:col-span-2"><CallupDetail label="Partita rinviata">{item.match.rescheduleTbd ? "Nuova data da definire" : formatDate(item.match.rescheduleDate)}</CallupDetail></div>}
                <div className="sm:col-span-2"><CallupDetail label="Indicazioni pre-partita">{item.match?.preMatchNotes}</CallupDetail></div>
                {item.match?.notes && <div className="sm:col-span-2"><CallupDetail label="Altre indicazioni">{item.match.notes}</CallupDetail></div>}
              </dl>
              <section className="min-w-0 space-y-3 border-t pt-4">
                <h3 className="font-semibold">Atleti convocati · {item.calledPlayers?.length ?? 0}</h3>
                {item.calledPlayers?.length ? <ul className="space-y-2 text-sm">{item.calledPlayers.map((player: { firstName: string; lastName: string; isOwnChild?: boolean }, index: number) =>
                  <li key={index} className={`break-words rounded-lg bg-muted/40 px-3 py-2 ${player.isOwnChild ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{player.firstName} {player.lastName}</li>)}</ul>
                  : <p className="text-sm text-muted-foreground">Elenco convocati non disponibile.</p>}
              </section>
              </DialogContent>
              </Dialog>
              {item.status === "pending" && (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" /> Conferma richiesta.</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
