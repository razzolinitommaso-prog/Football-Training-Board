import { analyseMatchReport, matchReportSchema } from "./match-report";

export type ParentTrainingActivity = {
  id: string; scheduledAt: string; teamName: string; trainingType: string | null;
  attendance: string | null; conduct: "ottima" | "buona" | "insufficiente" | null;
  availability: string | null; availabilityReason: string | null;
};
export type ParentMatchActivity = { id: number; date: string; opponent: string; minutes: number | null };
export type ParentActivity = {
  playerName: string | null; trainings: ParentTrainingActivity[]; matches: ParentMatchActivity[];
};

/** Never return a free-form technical objective or a session title to families. */
export function parentTrainingType(objectives: string | null): string | null {
  const labels: Record<string, string> = { forza: "Forza", resistenza: "Resistenza", tecnico_tattico: "Tecnico-tattico" };
  return labels[String(objectives ?? "").trim().toLowerCase()] ?? null;
}

export function parentTrainingOccurrence(teamId: number, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${teamId}-${get("year")}-${get("month")}-${get("day")}-${get("hour")}:${get("minute")}`;
}

/** Only an actual recorded report may establish zero played minutes. A callup,
 * a tactical formation or an invalid/absent report does not prove participation. */
export function parentPlayedMinutes(plan: unknown, ownPlayerId: number): number | null {
  const source = plan && typeof plan === "object" ? plan as { postMatchReport?: unknown } : null;
  const parsed = matchReportSchema.safeParse(source?.postMatchReport);
  if (!parsed.success) return null;
  const report = parsed.data;
  const ids = new Set([ownPlayerId, ...report.periods.flatMap(period => period.starters), ...report.goals.map(goal => goal.playerId),
    ...report.substitutions.flatMap(change => change.inPlayerId === null ? [change.outPlayerId] : [change.outPlayerId, change.inPlayerId])]);
  const analysis = analyseMatchReport(report, [...ids]);
  return analysis.errors.length ? null : analysis.minutes[ownPlayerId] ?? 0;
}
