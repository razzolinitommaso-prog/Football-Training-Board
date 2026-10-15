import { z } from "zod";

const playerId = z.number().int().positive();
const moment = { period: z.number().int().min(0).max(3), minute: z.number().min(0).max(180) };
export const matchReportSchema = z.object({
  version: z.literal(1),
  periods: z.array(z.object({
    minutes: z.number().min(1).max(180),
    starters: z.array(playerId).max(30),
    intervalNotes: z.string().max(2000).optional(),
  })).min(1).max(4),
  goals: z.array(z.object({ id: z.string().min(1).max(100), playerId, ...moment })).max(100),
  substitutions: z.array(z.object({
    id: z.string().min(1).max(100), outPlayerId: playerId,
    inPlayerId: playerId.nullable(), ...moment, notes: z.string().max(2000),
  })).max(200),
});
export type MatchReport = z.infer<typeof matchReportSchema>;

/** Each period starts with its actual lineup. Minutes are relative to that period,
 * including recovery time in its effective duration; re-entries are supported. */
export function analyseMatchReport(report: MatchReport, calledPlayerIds: number[], limit: number | number[] = 11) {
  const errors: string[] = [];
  const called = new Set(calledPlayerIds);
  const minutes = new Map(calledPlayerIds.map(id => [id, 0]));
  const intervals: { period: number; outPlayerIds: number[]; inPlayerIds: number[]; notes: string }[] = [];
  if (!matchReportSchema.safeParse(report).success) {
    return { errors: ["Completa giocatori, durata, tempi e minuti degli eventi."], minutes: Object.fromEntries(minutes) as Record<number, number>, intervals };
  }
  const known = (id: number) => {
    if (!called.has(id)) errors.push(`Il giocatore ${id} non è tra i convocati salvati.`);
  };
  const ids = [...report.goals, ...report.substitutions].map(event => event.id);
  if (new Set(ids).size !== ids.length) errors.push("Sono presenti eventi duplicati.");
  for (const event of [...report.goals, ...report.substitutions]) {
    if (!report.periods[event.period] || event.minute > report.periods[event.period].minutes) {
      errors.push("Il tempo o il minuto di un evento supera la durata effettiva del periodo.");
    }
  }
  let previousEnd: Set<number> | null = null;
  report.periods.forEach((period, index) => {
    const active = new Set(period.starters);
    if (previousEnd) {
      const outPlayerIds = [...previousEnd].filter(id => !active.has(id));
      const inPlayerIds = [...active].filter(id => !previousEnd!.has(id));
      if (outPlayerIds.length || inPlayerIds.length) intervals.push({ period: index, outPlayerIds, inPlayerIds, notes: period.intervalNotes ?? "" });
    }
    if (active.size !== period.starters.length) errors.push(`Titolari duplicati nel ${index + 1}° tempo.`);
    const periodLimit = Array.isArray(limit) ? limit[index] ?? 11 : limit;
    if (active.size > periodLimit) errors.push(`Troppi titolari nel ${index + 1}° tempo (massimo ${periodLimit}).`);
    active.forEach(known);
    let last = 0;
    const accrue = (end: number) => {
      active.forEach(id => minutes.set(id, (minutes.get(id) ?? 0) + end - last));
      last = end;
    };
    const changes = report.substitutions.filter(change => change.period === index)
      .map((change, order) => ({ ...change, order }))
      .sort((a, b) => a.minute - b.minute || a.order - b.order);
    for (const change of changes) {
      known(change.outPlayerId);
      if (change.inPlayerId !== null) known(change.inPlayerId);
      if (change.minute > period.minutes) continue;
      if (!active.has(change.outPlayerId) || (change.inPlayerId !== null && active.has(change.inPlayerId))) {
        errors.push(`Cambio non valido al ${change.minute}′ del ${index + 1}° tempo: controlla chi è in campo.`);
        continue;
      }
      accrue(change.minute);
      active.delete(change.outPlayerId);
      if (change.inPlayerId !== null) active.add(change.inPlayerId);
    }
    accrue(period.minutes);
    previousEnd = new Set(active);
    for (const goal of report.goals.filter(goal => goal.period === index)) {
      known(goal.playerId);
      // At the instant of a change either player may score: event ordering within
      // the same minute is not recorded, so don't invent an order for the goal.
      const onField = new Set(period.starters);
      for (const change of changes.filter(change => change.minute < goal.minute)) {
        onField.delete(change.outPlayerId);
        if (change.inPlayerId !== null) onField.add(change.inPlayerId);
      }
      const atChange = changes.some(change => change.minute === goal.minute &&
        (change.outPlayerId === goal.playerId || change.inPlayerId === goal.playerId));
      if (!onField.has(goal.playerId) && !atChange) errors.push(`Marcatore non in campo al ${goal.minute}′ del ${index + 1}° tempo.`);
    }
  });
  return { errors: [...new Set(errors)], minutes: Object.fromEntries(minutes) as Record<number, number>, intervals };
}
