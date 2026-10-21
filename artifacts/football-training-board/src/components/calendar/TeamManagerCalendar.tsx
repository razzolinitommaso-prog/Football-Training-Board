import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

import { managerTrainingEvents, type ManagerCalendarEvent, type ManagerTrainingCalendar, type ManagerTrainingSession } from "@/lib/team-manager-training-calendar";
const dateKey = (date: Date) => format(date, "yyyy-MM-dd");

export function TeamManagerCalendar({ events, training = [], trainingCalendar }: { events: ManagerCalendarEvent[]; training?: ManagerTrainingSession[]; trainingCalendar?: ManagerTrainingCalendar | null }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const byDay = new Map<string, ManagerCalendarEvent[]>();
  for (const event of [...events, ...managerTrainingEvents(trainingCalendar, training, days[0], days[days.length - 1])]) {
    if (!event.date || !Number.isFinite(Date.parse(event.date))) continue;
    const key = dateKey(new Date(event.date));
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  const moveMonth = (amount: number) => {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelected(dateKey(next));
  };
  const today = dateKey(new Date());
  const selectedEvents = byDay.get(selected) ?? [];
  return <section className="space-y-4">
    <div><h2 className="text-lg font-semibold">Calendario squadra</h2><p className="text-xs text-muted-foreground">Programmazione allenamenti, variazioni e partite della squadra. Tocca un giorno per i dettagli.</p></div>
    <div className="rounded-2xl border bg-card p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Mese precedente" onClick={() => moveMonth(-1)}><ChevronLeft className="h-4 w-4"/></Button>
        <h3 aria-live="polite" className="text-center text-base font-semibold capitalize">{format(month, "MMMM yyyy", { locale: it })}</h3>
        <Button type="button" variant="outline" size="icon" aria-label="Mese successivo" onClick={() => moveMonth(1)}><ChevronRight className="h-4 w-4"/></Button>
      </div>
      <div className="mb-3 text-center"><Button type="button" variant="outline" size="sm" onClick={() => { setMonth(startOfMonth(new Date())); setSelected(today); }}>Oggi</Button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map(day => {
          const key = dateKey(day);
          const dayEvents = byDay.get(key) ?? [];
          const training = dayEvents.some(event => event.kind === "Allenamento");
          const match = dayEvents.some(event => event.kind === "Partita");
          return <button type="button" key={key} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined}
            aria-label={`${format(day, "EEEE d MMMM yyyy", { locale: it })}${training ? ", allenamento" : ""}${match ? ", partita" : ""}`}
            onClick={() => { setSelected(key); if (!isSameMonth(day, month)) setMonth(startOfMonth(day)); }}
            className={`min-h-14 rounded-xl border p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${key === selected ? "border-primary bg-primary/10" : "border-transparent bg-muted/30 hover:border-primary/40"} ${isSameMonth(day, month) ? "opacity-100" : "opacity-40"}`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${key === today ? "bg-primary text-primary-foreground" : ""}`}>{day.getDate()}</span>
            <span className="mt-1 flex gap-1 px-1">{training && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>}{match && <span className="h-1.5 w-1.5 rounded-full bg-amber-500"/>}</span>
          </button>;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Allenamento</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500"/>Partita</span>
      </div>
    </div>
    <div aria-live="polite" className="space-y-3">
      <h3 className="font-semibold capitalize">{format(new Date(`${selected}T12:00:00`), "EEEE d MMMM yyyy", { locale: it })}</h3>
      {selectedEvents.map(event => <article key={event.id} className="rounded-2xl border bg-card p-4">
        <p className="text-xs text-primary">{event.kind} · {format(new Date(event.date!), "HH:mm")}{event.endTime ? `–${event.endTime}` : ""}</p>
        <h4 className={`mt-1 break-words font-medium ${event.status === "cancelled" || event.status === "relocated" ? "text-muted-foreground" : ""}`}>{event.title}</h4>
        <p className="mt-1 break-words text-sm text-muted-foreground">{event.location || "Luogo da definire"}</p>{event.detail && <p className="mt-2 text-sm">{event.detail}</p>}
      </article>)}
      {!selectedEvents.length && <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nessun appuntamento per questo giorno.</p>}
    </div>
  </section>;
}
