import { splitMatchLineup } from "./match-lineup";
import type { MatchReport } from "@workspace/api-zod";
export type RotationPeriod = {
  key: string;
  label: string;
  minutes: string;
  module?: string;
  format?: string;
  lineupPlayerIds?: number[];
  lineupStarterCount?: number;
  rotationAuto?: boolean;
  lineupPositions?: Record<string, { x: number; y: number }>;
  secondPart?: RotationPeriod;
  thirdPartMinutes?: number;
};
export function periodMinutes(value: string) {
  const number = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : 12;
}
export function thirdPartDuration(period: RotationPeriod) {
  const total = periodMinutes(period.minutes);
  return typeof period.thirdPartMinutes === "number" &&
    period.thirdPartMinutes > 0 &&
    period.thirdPartMinutes < total
    ? period.thirdPartMinutes
    : total / 2;
}
export function rotationUnits<T extends RotationPeriod>(periods: T[]) {
  const fourth = periods.some((p) => p.key === "t4");
  return periods.flatMap((period, index) =>
    period.key === "t3" && !fourth
      ? [
          { period, index, second: false, minutes: thirdPartDuration(period) },
          {
            period: {
              module: period.module,
              format: period.format,
              ...period.secondPart,
              lineupPlayerIds: period.secondPart?.lineupPlayerIds ?? [],
              lineupStarterCount: period.secondPart?.lineupStarterCount,
              rotationAuto: period.secondPart?.rotationAuto,
              lineupPositions: period.secondPart?.lineupPositions ?? {},
              secondPart: undefined,
              key: "t3-second",
              label: "3° tempo · seconda parte",
              minutes: String(
                periodMinutes(period.minutes) - thirdPartDuration(period),
              ),
            } as T,
            index,
            second: true,
            minutes: periodMinutes(period.minutes) - thirdPartDuration(period),
          },
        ]
      : [
          {
            period,
            index,
            second: false,
            minutes: periodMinutes(period.minutes),
          },
        ],
  );
}
/** Keep manual selections, regenerate only automatic units; an explicit rebuild preserves the first lineup. */
export function rotateMatchPeriods<T extends RotationPeriod>(
  periods: T[],
  selected: Set<number>,
  limitFor: (p: T) => number,
  goalkeepers: Set<number> = new Set(),
  force = false,
): T[] {
  const next = periods.map((p) => ({ ...p })),
    totals = new Map<number, number>();
  let previous = new Set<number>();
  for (const [unitIndex, unit] of rotationUnits(periods).entries()) {
    const source = unit.period,
      limit = limitFor(source),
      groups = splitMatchLineup(source, limit, selected);
    const empty =
      !source.lineupPlayerIds?.length && source.lineupStarterCount == null;
    let starters = groups.starters;
    const automatic =
      empty || (unitIndex > 0 && (force || source.rotationAuto === true));
    if (automatic) {
      const ranked = [...selected].sort(
        (a, b) =>
          Number(previous.has(a)) - Number(previous.has(b)) ||
          (totals.get(a) ?? 0) - (totals.get(b) ?? 0) ||
          a - b,
      );
      const keeper =
        limit > 3 ? ranked.find((id) => goalkeepers.has(id)) : undefined;
      starters = [
        ...(keeper === undefined ? [] : [keeper]),
        ...ranked
          .filter((id) => id !== keeper && (limit <= 3 || !goalkeepers.has(id)))
          .slice(0, Math.max(0, limit - (keeper === undefined ? 0 : 1))),
      ];
    }
    const lineup = [
      ...starters,
      ...[...selected].filter((id) => !starters.includes(id)),
    ];
    const changed =
      JSON.stringify(source.lineupPlayerIds) !== JSON.stringify(lineup) ||
      source.lineupStarterCount !== starters.length;
    const updated = {
      ...source,
      lineupPlayerIds: lineup,
      lineupStarterCount: starters.length,
      ...(automatic ? { rotationAuto: true } : {}),
      ...(changed
        ? {
            boardConfirmed: false,
            lineupDetectedModule: null,
            ...(automatic
              ? {
                  lineupPositions: Object.fromEntries(
                    Object.entries(source.lineupPositions ?? {}).filter(
                      ([id]) =>
                        groups.starters.includes(Number(id)) &&
                        starters.includes(Number(id)),
                    ),
                  ),
                }
              : {}),
          }
        : {}),
      ...(unit.second ? { minutes: String(unit.minutes) } : {}),
    } as T;
    if (unit.second)
      next[unit.index] = { ...next[unit.index], secondPart: updated };
    else next[unit.index] = updated;
    starters.forEach((id) =>
      totals.set(id, (totals.get(id) ?? 0) + unit.minutes),
    );
    previous = new Set(starters);
  }
  return next;
}
export function plannedPlayerMinutes<T extends RotationPeriod>(
  periods: T[],
  selected: Set<number>,
  limitFor: (p: T) => number,
) {
  const totals: Record<number, number> = Object.fromEntries(
    [...selected].map((id) => [id, 0]),
  );
  for (const unit of rotationUnits(periods))
    for (const id of splitMatchLineup(
      unit.period,
      limitFor(unit.period),
      selected,
    ).starters)
      totals[id] += unit.minutes;
  return totals;
}
export function seedMatchReport<T extends RotationPeriod>(
  periods: T[],
  called: Set<number>,
  limitFor: (p: T) => number,
): MatchReport {
  const report: MatchReport = {
    version: 1,
    goals: [],
    substitutions: [],
    periods: periods.map((p) => ({
      minutes: periodMinutes(p.minutes),
      starters: splitMatchLineup(p, limitFor(p), called).starters,
    })),
  };
  if (!periods.some((p) => p.key === "t4")) {
    const index = periods.findIndex((p) => p.key === "t3"),
      third = periods[index];
    if (third?.secondPart) {
      const first = report.periods[index].starters,
        second = splitMatchLineup(
          third.secondPart,
          limitFor(third.secondPart as T),
          called,
        ).starters;
      const outgoing = first.filter((id) => !second.includes(id)),
        incoming = second.filter((id) => !first.includes(id));
      if (incoming.length > outgoing.length)
        throw Error(
          "Completa gli schieramenti delle due parti del terzo tempo prima di generare il resoconto.",
        );
      outgoing.forEach((id, i) =>
        report.substitutions.push({
          id: "planned-third-" + i,
          outPlayerId: id,
          inPlayerId: incoming[i] ?? null,
          period: index,
          minute: thirdPartDuration(third),
          notes: "Cambio tra le due parti del 3° tempo",
        }),
      );
    }
  }
  return report;
}
export function toggleFourthPeriod<
  T extends RotationPeriod,
  P extends {
    fourthTime?: boolean;
    periods: T[];
    fourthPeriodDraft?: T;
    postMatchReport?: MatchReport;
  },
>(plan: P, enabled: boolean): P {
  const fourth =
    plan.periods.find((p) => p.key === "t4") ??
    plan.fourthPeriodDraft ??
    ({
      module: plan.periods[2]?.module ?? plan.periods[0]?.module,
      format: plan.periods[2]?.format ?? plan.periods[0]?.format,
      key: "t4",
      label: "4° tempo",
      minutes: String(
        periodMinutes(
          plan.periods[2]?.minutes ?? plan.periods[0]?.minutes ?? "12",
        ),
      ),
    } as T);
  const periods = enabled
    ? [...plan.periods.filter((p) => p.key !== "t4"), fourth]
    : plan.periods.filter((p) => p.key !== "t4");
  let report = plan.postMatchReport;
  if (report && report.periods.length !== periods.length) {
    if (enabled && report.periods.length === periods.length - 1)
      report = {
        ...report,
        periods: [
          ...report.periods,
          { minutes: periodMinutes(fourth.minutes), starters: [] },
        ],
      };
    else if (!enabled && report.periods.length === periods.length + 1) {
      const removed = report.periods[report.periods.length - 1];
      if (
        removed.starters.length ||
        removed.intervalNotes ||
        report.goals.some((e) => e.period >= periods.length) ||
        report.substitutions.some((e) => e.period >= periods.length)
      )
        throw Error(
          "Il quarto tempo contiene già un resoconto: correggilo prima di disabilitarlo.",
        );
      report = { ...report, periods: report.periods.slice(0, periods.length) };
    } else throw Error("Adegua prima i tempi del resoconto esistente.");
  }
  return {
    ...plan,
    fourthTime: enabled,
    periods,
    fourthPeriodDraft: fourth,
    ...(report ? { postMatchReport: report } : {}),
  };
}
