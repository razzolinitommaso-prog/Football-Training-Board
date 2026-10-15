import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { ParentActivity } from "@workspace/api-zod";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, ChevronLeft, ChevronRight } from "lucide-react";

const attendanceLabels: Record<string, string> = { present: "Presente", absent: "Assente", injured: "Assente per infortunio", requested: "Richiesto da altra squadra" };
const conductLabels = { ottima: "Ottima", buona: "Buona", insufficiente: "Insufficiente" };
const date = (value: string) => new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dayKey = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const calendarKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export default function ParentActivityPage() {
  const [activity, setActivity] = useState<ParentActivity | null>(null);
  const [error, setError] = useState(false);
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date().toISOString()));
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  useEffect(() => {
    const controller = new AbortController();
    fetch(withApi("/api/parent/activity"), { credentials: "include", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<ParentActivity>; })
      .then(data => {
        setActivity(data);
        if (data.trainings.length) {
          const key = dayKey(data.trainings[0].scheduledAt);
          setSelectedDay(key);
          setMonth(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
        }
      }).catch(err => { if (err.name !== "AbortError") setError(true); });
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert">Non è stato possibile caricare il riepilogo. Riprova aggiornando la pagina.</p>;
  if (!activity) return <p role="status">Caricamento riepilogo…</p>;
  const recorded = activity.matches.filter(match => match.minutes !== null);
  const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - (month.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, index) => new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + index));
  const selectedTrainings = activity.trainings.filter(training => dayKey(training.scheduledAt) === selectedDay);
  const trainingDays = new Set(activity.trainings.map(training => dayKey(training.scheduledAt)));
  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Allenamenti e minuti giocati</h1><p className="text-sm text-muted-foreground">{activity.playerName ?? "Nessun figlio collegato"}</p></div>
      <Link href="/parent/attendance"><Button variant="outline"><CalendarDays className="mr-2 h-4 w-4" />Calendario generale</Button></Link>
    </div>
    <p className="text-sm text-muted-foreground">Qui consulti lo storico di tuo figlio. Per comunicare disponibilità o assenza usa il Calendario generale.</p>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Allenamenti · {activity.trainings.length} schede nello storico</h2>
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button aria-label="Mese precedente" variant="outline" size="icon" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <h3 className="font-semibold capitalize">{month.toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</h3>
          <Button aria-label="Mese successivo" variant="outline" size="icon" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{["L", "M", "M", "G", "V", "S", "D"].map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">{days.map(day => {
          const key = calendarKey(day);
          return <button type="button" key={key} aria-label={`Allenamenti ${key}`} aria-pressed={key === selectedDay} onClick={() => setSelectedDay(key)}
            className={`min-h-12 rounded-lg border p-1 text-sm ${key === selectedDay ? "border-primary bg-primary/10" : "border-transparent bg-muted/30"} ${day.getMonth() !== month.getMonth() ? "opacity-40" : ""}`}>
            {day.getDate()}{trainingDays.has(key) && <span className="mx-auto mt-1 block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </button>;
        })}</div>
        <p className="mt-2 text-xs text-muted-foreground">Seleziona il giorno per consultare il riepilogo. Qui non si modifica la disponibilità.</p>
      </div>
      {activity.trainings.length === 0 && <p className="rounded-xl border p-4 text-sm text-muted-foreground">Nessun allenamento trascorso registrato per tuo figlio.</p>}
      {activity.trainings.length > 0 && selectedTrainings.length === 0 && <p className="text-sm text-muted-foreground">Nessun riepilogo per il giorno selezionato.</p>}
      {selectedTrainings.map(training => <article key={training.id} className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        <h3 className="font-semibold">{date(training.scheduledAt)}</h3><p className="text-muted-foreground">{training.teamName}</p>
        <p>Tipologia: <strong>{training.trainingType ?? "Non indicata dallo staff"}</strong></p>
        <p>Disponibilità comunicata: <strong>{training.availability === "available" ? "Disponibile" : training.availability === "unavailable" ? "Non disponibile" : "Non comunicata"}</strong>{training.availabilityReason && ` · ${training.availabilityReason}`}</p>
        <p>Presenza effettiva: <strong>{training.attendance ? attendanceLabels[training.attendance] ?? "Da verificare" : "Non ancora registrata dallo staff"}</strong></p>
        <p>Condotta: <strong>{training.conduct ? conductLabels[training.conduct] : "Non registrata"}</strong></p>
      </article>)}
    </section>
    <section id="minutaggio" className="space-y-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5" />Minutaggio effettivo di gioco</h2>
      <p className="text-sm">{recorded.length ? <><strong>{recorded.reduce((sum, match) => sum + (match.minutes ?? 0), 0)} minuti</strong> su {recorded.length} partite con resoconto.</> : "Nessun minutaggio ancora registrato."}</p>
      <p className="text-xs text-muted-foreground">La convocazione non prova la presenza in campo. Sono conteggiati solo i minuti dei resoconti post partita; zero indica un resoconto compilato senza ingresso in campo.</p>
      {activity.matches.map(match => <article key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
        <div><h3 className="font-semibold">vs {match.opponent}</h3><p className="text-muted-foreground">{date(match.date)}</p></div>
        <strong>{match.minutes === null ? "Non registrato" : `${match.minutes}′ giocati`}</strong>
      </article>)}
    </section>
  </div>;
}
