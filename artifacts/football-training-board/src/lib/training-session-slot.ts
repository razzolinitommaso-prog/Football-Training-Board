type SlotTeam = { trainingSchedule?: { day: string; startTime: string }[] | null };
const weekdays = ["lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica"];
const dayNames = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const normalize = (day: string) => day.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export function trainingSlotOptions(team?: SlotTeam | null, stored?: string | null) {
  const schedule = [...new Map((team?.trainingSchedule ?? []).filter(slot => weekdays.includes(normalize(slot.day))).map(slot => [`${normalize(slot.day)}|${slot.startTime}`, slot])).values()]
    .sort((a, b) => weekdays.indexOf(normalize(a.day)) - weekdays.indexOf(normalize(b.day)) || a.startTime.localeCompare(b.startTime));
  const count = Math.max(3, schedule.length, /^giorno_\d+$/.test(stored ?? "") ? Number(stored!.slice(7)) : 0);
  return Array.from({ length: Math.min(count, 14) }, (_, index) => ({ value: `giorno_${index + 1}`, label: schedule[index] ? `${dayNames[weekdays.indexOf(normalize(schedule[index].day))]} ${schedule[index].startTime} · Giorno ${index + 1}` : `Giorno ${index + 1}`, day: schedule[index] ? weekdays.indexOf(normalize(schedule[index].day)) : -1, time: schedule[index]?.startTime }));
}
export function inferTrainingSlot(team: SlotTeam | null | undefined, date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const at = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(at.getTime())) return "";
  const day = (at.getDay() + 6) % 7;
  const candidates = trainingSlotOptions(team).filter(slot => slot.day === day);
  return candidates.find(slot => slot.time === time)?.value ?? (candidates.length === 1 ? candidates[0].value : "");
}
export function safeTrainingReturnPath(value: string | null) {
  return value && /^\/(?:scuola-calcio\/|settore-giovanile\/|prima-squadra\/)?training(?:\?|$)/.test(value) ? value : null;
}
