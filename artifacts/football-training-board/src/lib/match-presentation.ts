export type MatchPreparation = "empty" | "partial" | "complete";
export const preparationLabels: Record<MatchPreparation, string> = {
  empty: "Da preparare",
  partial: "Da completare",
  complete: "Preparazione completa",
};

export { matchPreparationStatus as matchPreparation } from "@workspace/api-zod";

type DatedMatch = {
  date: string;
  result?: string | null;
  isPostponed?: boolean;
  rescheduleDate?: string | null;
  rescheduleTbd?: boolean;
  status?: string;
  __timelineView?: string;
};
export function isUpcomingMatch(match: DatedMatch, now = Date.now()) {
  if (
    match.__timelineView === "postponed-original" ||
    ["played", "cancelled", "canceled"].includes(match.status ?? "") ||
    /\d\s*[-–—:]\s*\d/.test(match.result ?? "")
  )
    return false;
  if (match.isPostponed && (match.rescheduleTbd || !match.rescheduleDate))
    return false;
  const at = new Date(
    match.isPostponed ? match.rescheduleDate! : match.date,
  ).getTime();
  return Number.isFinite(at) && at >= now;
}
export function upcomingFirst<T extends DatedMatch>(
  matches: T[],
  now = Date.now(),
) {
  return [...matches].sort((a, b) => {
    const upcomingA = isUpcomingMatch(a, now),
      upcomingB = isUpcomingMatch(b, now);
    if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
    const date = (m: T) =>
      new Date(
        m.isPostponed && m.rescheduleDate && !m.rescheduleTbd
          ? m.rescheduleDate
          : m.date,
      ).getTime();
    const difference = date(a) - date(b);
    return Number.isFinite(difference)
      ? upcomingA
        ? difference
        : -difference
      : 0;
  });
}
