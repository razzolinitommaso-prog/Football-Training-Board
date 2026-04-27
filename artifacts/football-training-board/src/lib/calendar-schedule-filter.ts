import { getDay } from "date-fns";

/** Filtro giorno/fascia per calendario partite e calendario sezione (segreteria). */
export type ScheduleFilterOpts = {
  daySaturday: boolean;
  daySunday: boolean;
  periodMorning: boolean;
  periodAfternoon: boolean;
  slotUseCustom: boolean;
  /** HH:mm */
  slotFrom: string;
  /** HH:mm */
  slotTo: string;
  exactTimeUse: boolean;
  /** HH:mm — partite con questo orario di inizio (locale). */
  exactTime: string;
};

export const EMPTY_SCHEDULE_FILTER: ScheduleFilterOpts = {
  daySaturday: false,
  daySunday: false,
  periodMorning: false,
  periodAfternoon: false,
  slotUseCustom: false,
  slotFrom: "",
  slotTo: "",
  exactTimeUse: false,
  exactTime: "",
};

/** Minuti da mezzanotte; null se formato non valido. */
export function parseHHmmToMinutes(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function combineLocalDayWithHHmm(day: Date, hhmm: string): Date {
  const mins = parseHHmmToMinutes(hhmm);
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  if (mins != null) {
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  }
  return d;
}

/** Mattina = prima delle 14:00; pomeriggio = dalle 14:00. */
const MORNING_END_MINUTES = 14 * 60;

export function scheduleTimeFilterActive(f: ScheduleFilterOpts): boolean {
  const customOk =
    f.slotUseCustom &&
    parseHHmmToMinutes(f.slotFrom) != null &&
    parseHHmmToMinutes(f.slotTo) != null;
  const exactOk = f.exactTimeUse && parseHHmmToMinutes(f.exactTime) != null;
  return (
    f.daySaturday ||
    f.daySunday ||
    f.periodMorning ||
    f.periodAfternoon ||
    customOk ||
    exactOk
  );
}

/**
 * `d` = istante locale dell’evento (inizio partita o inizio allenamento).
 * Se non c’è nessun vincolo sul filtro, resta true.
 */
export function datePassesScheduleFilter(d: Date, f: ScheduleFilterOpts): boolean {
  if (!scheduleTimeFilterActive(f)) return true;
  if (Number.isNaN(d.getTime())) return false;

  const dow = getDay(d);
  const hasDay = f.daySaturday || f.daySunday;
  if (hasDay) {
    let okDay = false;
    if (f.daySaturday && dow === 6) okDay = true;
    if (f.daySunday && dow === 0) okDay = true;
    if (!okDay) return false;
  }

  const mins = d.getHours() * 60 + d.getMinutes();

  const c0 = f.slotUseCustom ? parseHHmmToMinutes(f.slotFrom) : null;
  const c1 = f.slotUseCustom ? parseHHmmToMinutes(f.slotTo) : null;
  const hasValidCustom = c0 != null && c1 != null && c0 <= c1;
  if (hasValidCustom) {
    if (mins < c0! || mins > c1!) return false;
  }

  if (f.exactTimeUse) {
    const em = parseHHmmToMinutes(f.exactTime);
    if (em != null && mins !== em) return false;
  }

  const hasPeriod = f.periodMorning || f.periodAfternoon;
  if (hasPeriod) {
    let okP = false;
    if (f.periodMorning && mins < MORNING_END_MINUTES) okP = true;
    if (f.periodAfternoon && mins >= MORNING_END_MINUTES) okP = true;
    if (!okP) return false;
  }

  return true;
}
