import { eachDayOfInterval, format } from "date-fns";

export type ManagerTrainingCalendar = {
  start: string | null;
  end: string | null;
  slots: { day: string; startTime: string; endTime: string; campo: string | null }[];
  changes: { id: number; status: string; location: string | null; originalDate: string | null; originalStartTime: string | null; originalEndTime: string | null; newDate: string | null; newStartTime: string | null; newEndTime: string | null }[];
};
export type ManagerTrainingSession = { shared?:boolean|null;durationMinutes?:number|null; id: number; title: string; scheduledAt: string; location: string | null; status: string };
export type ManagerCalendarEvent = { id: string; title: string; kind: string; date: string | null; location: string | null; endTime?: string | null; status?: string; detail?: string };
const weekdays: Record<string, number> = { domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6 };
const normalizeDay = (day: string) => day.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const validTime = (time: string | null) => Boolean(time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
const occurrence = (date: string, time: string) => `${date}|${time}`;

// Uses local calendar dates, like the operational dashboard. Session timestamps
// are converted to local time before matching a scheduled occurrence.
export function managerTrainingEvents(calendar: ManagerTrainingCalendar | null | undefined, sessions: ManagerTrainingSession[], from: Date, to: Date): ManagerCalendarEvent[] {
  const rows = new Map<string, ManagerCalendarEvent>();
  const fromKey = format(from, "yyyy-MM-dd"), toKey = format(to, "yyyy-MM-dd");
  const inRange = (date: string) => date >= fromKey && date <= toKey;
  const put = (date: string | null, time: string | null, event: Omit<ManagerCalendarEvent, "date">) => {
    if (!date || !inRange(date) || !validTime(time)) return;
    rows.set(occurrence(date, time!), { ...event, date: `${date}T${time}:00` });
  };
  for (const day of eachDayOfInterval({ start: from, end: to })) {
    const date = format(day, "yyyy-MM-dd");
    if ((calendar?.start && date < calendar.start) || (calendar?.end && date > calendar.end)) continue;
    for (const slot of calendar?.slots ?? []) {
      if (weekdays[normalizeDay(slot.day)] !== day.getDay()) continue;
      put(date, slot.startTime, { id: `schedule-${date}-${slot.startTime}`, title: "Allenamento", kind: "Allenamento", location: slot.campo, endTime: slot.endTime, status: "regular" });
    }
  }
  // Apply changes independently of the visible source month, so a recovery
  // from a previous month still appears at its effective date.
  for (const change of calendar?.changes ?? []) {
    const originalKey = change.originalDate && change.originalStartTime ? occurrence(change.originalDate, change.originalStartTime) : null;
    const original = originalKey ? rows.get(originalKey) : undefined;
    if (change.status === "note") {
      if (originalKey && original) rows.set(originalKey, { ...original, location: change.location || original.location });
      continue;
    }
    if (!["cancelled", "moved", "joined"].includes(change.status)) continue;
    const relocated = change.status === "moved" || change.status === "joined";
    const detail = relocated && change.newDate && validTime(change.newStartTime) ? `Nuovo appuntamento: ${change.newDate.split("-").reverse().join("/")} alle ${change.newStartTime}` : undefined;
    if (change.originalDate && change.originalStartTime) put(change.originalDate, change.originalStartTime, {
      id: `change-original-${change.id}`, kind: "Allenamento", title: change.status === "cancelled" ? "Allenamento annullato" : change.status === "joined" ? "Allenamento unito a un altro appuntamento" : "Allenamento spostato",
      location: original?.location ?? null, endTime: change.originalEndTime, status: change.status === "cancelled" ? "cancelled" : "relocated", detail,
    });
    if (relocated) {
      const destinationKey = change.newDate && change.newStartTime ? occurrence(change.newDate, change.newStartTime) : null;
      const destination = destinationKey ? rows.get(destinationKey) : undefined;
      put(change.newDate, change.newStartTime, { id: `change-${change.id}`, kind: "Allenamento", title: change.status === "joined" ? "Allenamento congiunto" : "Recupero allenamento", location: change.location || destination?.location || original?.location || null, endTime: change.newEndTime || destination?.endTime, status: change.status });
    }
  }
  for (const session of sessions) {
    if (["cancelled", "canceled"].includes(session.status)) continue;
    const at = new Date(session.scheduledAt);
    if(session.shared&&!['cancelled','canceled'].includes(session.status)&&Number.isFinite(at.getTime()))for(const [eventKey,event] of rows){
      const start=event.date?new Date(event.date):null;
      const end=start?(event.endTime?new Date(`${format(start,'yyyy-MM-dd')}T${event.endTime}:00`).getTime():start.getTime()+90*60000):0;
      if(start&&event.status==='regular'&&end>at.getTime()&&start.getTime()<at.getTime()+(session.durationMinutes??90)*60000)rows.delete(eventKey);
    }
    if (!Number.isFinite(at.getTime())) continue;
    const date = format(at, "yyyy-MM-dd"), time = format(at, "HH:mm");
    if (!inRange(date)) continue;
    const key = occurrence(date, time), existing = rows.get(key);
    if (existing) {
      if (existing.status === "cancelled" || existing.status === "relocated") continue;
      rows.set(key, { ...existing, title: existing.status === "regular" ? session.title || existing.title : existing.title, location: existing.location || session.location });
    } else {
      put(date, time, { id: `training-${session.id}`, title: session.title || "Allenamento", kind: "Allenamento", location: session.location, status: "prepared" });
    }
  }
  return [...rows.values()].sort((a, b) => a.date!.localeCompare(b.date!));
}
