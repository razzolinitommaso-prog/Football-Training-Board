import { z } from "zod";

export const MATCH_REPORT_SUBSTITUTION_LIMIT = 200;

const playerId = z.number().int().positive();
const moment = { period: z.number().int().min(0).max(3), minute: z.number().min(0).max(180) };
export const matchReportSchema = z.object({
  version: z.literal(1),
  automaticFractions: z.literal(true).optional(),
  fractionLineups: z.record(z.string().max(100), z.array(playerId).max(30)).optional(),
  fractionOverrides: z.array(z.string().max(100)).max(2880).optional(),
  periods: z.array(z.object({
    minutes: z.number().min(1).max(180),
    starters: z.array(playerId).max(30),
    intervalNotes: z.string().max(2000).optional(),
    goalsFor: z.number().int().min(0).max(100).optional(),
    goalsAgainst: z.number().int().min(0).max(100).optional(),
    opponentOwnGoals: z.number().int().min(0).max(100).optional(),
  })).min(1).max(4),
  goals: z.array(z.object({ id: z.string().min(1).max(100), playerId, ...moment, goalSlot: z.number().int().min(0).max(99).optional() })).max(100),
  substitutions: z.array(z.object({
    id: z.string().min(1).max(100), outPlayerId: playerId,
    inPlayerId: playerId.nullable(), ...moment, notes: z.string().max(2000),
  })).max(MATCH_REPORT_SUBSTITUTION_LIMIT),
});
export type MatchReport = z.infer<typeof matchReportSchema>;

/** Missing period scores stay unknown; legacy reports must not become 0–0. */
export function matchReportScore(report: MatchReport) {
  if (!report.periods.every(p => p.goalsFor !== undefined && p.goalsAgainst !== undefined)) return null;
  const goalsFor = report.periods.reduce((sum, p) => sum + p.goalsFor!, 0);
  const goalsAgainst = report.periods.reduce((sum, p) => sum + p.goalsAgainst!, 0);
  return { goalsFor, goalsAgainst, points: goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0 };
}

export function matchReportScoreError(report: MatchReport): string | null {
  const any = report.periods.some(p => p.goalsFor !== undefined || p.goalsAgainst !== undefined || p.opponentOwnGoals !== undefined);
  if (!any) return null;
  if (!matchReportScore(report)) return "Completa i gol della squadra e degli avversari per tutti i tempi disputati.";
  for (const [index, p] of report.periods.entries()) {
    const credited = report.goals.filter(g => g.period === index).length + (p.opponentOwnGoals ?? 0);
    if (credited !== p.goalsFor) return `Nel ${index + 1}° tempo marcatori e autoreti avversarie (${credited}) devono coincidere con i gol della squadra (${p.goalsFor}).`;
  }
  return null;
}

/** Players explicitly recorded in a saved report, independent of the current call-up list. */
export function matchReportPlayerIds(report?: MatchReport | null): number[] {
  if (!report) return [];
  return [...new Set([
    ...report.periods.flatMap(period => period.starters),
    ...report.goals.map(goal => goal.playerId),
    ...report.substitutions.flatMap(change => change.inPlayerId === null ? [change.outPlayerId] : [change.outPlayerId, change.inPlayerId]),
  ])];
}

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
