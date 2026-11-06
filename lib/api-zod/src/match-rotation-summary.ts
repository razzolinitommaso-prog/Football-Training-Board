import {
  analyseMatchReport,
  matchReportSchema,
  type MatchReport,
} from "./match-report";
export type RotationSummaryPlayer = {
  id: number;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
};
export type RotationSummaryUnit = {
  key: string;
  label: string;
  minutes: number;
  periodKey: string;
  periodIndex: number;
  start: number;
  share: number;
};
export type RotationSummaryRow = {
  playerId: number;
  name: string;
  jerseyNumber: number | null;
  cells: {
    key: string;
    status: "T" | "P" | "—";
    actualMinutes: number | null;
    fixed?: boolean;
    position?: { x: number; y: number };
  }[];
  plannedMinutes: number;
  plannedPeriods: number;
  actualMinutes: number | null;
};
export type MatchRotationSummary = {
  units: RotationSummaryUnit[];
  rows: RotationSummaryRow[];
  hasReport: boolean;
};
const record = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const duration = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 12;
};
export function rotationSummaryCapacity(p: Record<string, any>, fallback = 11) {
  const match = /^(3|5|7|9|11)v/.exec(String(p.format ?? ""));
  if (match) return Number(match[1]);
  const nums = String(p.module ?? "")
    .replace(/^\(1\)/, "")
    .split("-")
    .map(Number);
  const sum = nums.reduce((a, b) => a + b, 0);
  if (nums.length > 1 && Number.isFinite(sum) && sum > 0) {
    if ([3, 5, 7, 9, 11].includes(sum)) return sum;
    if ([3, 5, 7, 9, 11].includes(sum + 1)) return sum + 1;
  }
  return fallback;
}
export function defaultRotationCapacity(
  name: unknown,
  category: unknown,
  section: unknown,
) {
  if (section !== "scuola_calcio") return 11;
  const text =
    String(name ?? "").toLowerCase() +
    " " +
    String(category ?? "").toLowerCase();
  return text.includes("esordient")
    ? 9
    : text.includes("pulcin")
      ? 7
      : text.includes("piccoli amici")
        ? 3
        : 5;
}
function effectiveMinutes(
  report: MatchReport,
  index: number,
  id: number,
  start: number,
  end: number,
) {
  const p = report.periods[index];
  if (!p) return 0;
  let active = p.starters.includes(id),
    last = 0,
    total = 0;
  for (const change of [
    ...report.substitutions.filter((e) => e.period === index),
  ].sort((a, b) => a.minute - b.minute)) {
    if (active)
      total += Math.max(
        0,
        Math.min(end, change.minute) - Math.max(start, last),
      );
    if (change.outPlayerId === id) active = false;
    if (change.inPlayerId === id) active = true;
    last = change.minute;
  }
  if (active)
    total += Math.max(0, Math.min(end, p.minutes) - Math.max(start, last));
  return total;
}
/** Only the supplied, already-authorized players become rows. Never serialize the source plan/report. */
export function buildMatchRotationSummary(
  value: unknown,
  players: RotationSummaryPlayer[],
  fallback = 11,
): MatchRotationSummary {
  const plan = record(value),
    periods = (Array.isArray(plan.periods) ? plan.periods : []).map(record),
    fourth = periods.some((p) => p.key === "t4");
  const units: RotationSummaryUnit[] = [],
    sources: Record<string, any>[] = [];
  periods.forEach((p, index) => {
    const minutes = duration(p.minutes),
      split =
        p.key === "t3" &&
        !fourth &&
        p.secondPart &&
        typeof p.secondPart === "object";
    let first = Number(p.thirdPartMinutes);
    if (!(first > 0 && first < minutes)) first = minutes / 2;
    units.push({
      key: String(p.key),
      label: split
        ? "3A"
        : ((
            {
              t1: "1° tempo",
              t2: "2° tempo",
              t3: "3° tempo",
              t4: "4° tempo",
            } as Record<string, string>
          )[String(p.key)] ?? "Tempo"),
      minutes: split ? first : minutes,
      periodKey: String(p.key),
      periodIndex: index,
      start: 0,
      share: split ? first / minutes : 1,
    });
    sources.push(p);
    if (split) {
      units.push({
        key: "t3-second",
        label: "3B",
        minutes: minutes - first,
        periodKey: "t3",
        periodIndex: index,
        start: first,
        share: (minutes - first) / minutes,
      });
      sources.push({
        ...p,
        ...record(p.secondPart),
        lineupPlayerIds: record(p.secondPart).lineupPlayerIds ?? [],
        lineupStarterCount: record(p.secondPart).lineupStarterCount,
      });
    }
  });
  const parsed = matchReportSchema.safeParse(plan.postMatchReport);
  let report: MatchReport | null = null;
  if (parsed.success && parsed.data.periods.length === periods.length) {
    const data = parsed.data,
      ids = new Set([
        ...players.map((p) => p.id),
        ...data.periods.flatMap((p) => p.starters),
        ...data.goals.map((g) => g.playerId),
        ...data.substitutions.flatMap((e) => [
          e.outPlayerId,
          ...(e.inPlayerId === null ? [] : [e.inPlayerId]),
        ]),
      ]);
    if (!analyseMatchReport(data, [...ids]).errors.length) report = data;
  }
  return {
    units,
    hasReport: !!report,
    rows: players.map((player) => {
      let plannedMinutes = 0,
        plannedPeriods = 0;
      const cells = units.map((unit, i) => {
        const p = sources[i],
          ids = [
            ...new Set<number>(
              (Array.isArray(p.lineupPlayerIds)
                ? p.lineupPlayerIds
                : []
              ).filter((id: unknown) => Number.isInteger(id)),
            ),
          ];
        const limit = rotationSummaryCapacity(p, fallback),
          count =
            typeof p.lineupStarterCount === "number" &&
            Number.isFinite(p.lineupStarterCount)
              ? Math.max(0, Math.min(limit, Math.floor(p.lineupStarterCount)))
              : limit,
          starter = ids.slice(0, count).includes(player.id),
          status = starter ? "T" : ids.includes(player.id) ? "P" : "—";
        if (starter) {
          plannedMinutes += unit.minutes;
          plannedPeriods += unit.share;
        }
        const position = record(record(p.lineupPositions)[String(player.id)]);
        return {
          key: unit.key,
          fixed: record(p.rotationLocks)[String(player.id)] === "T" || record(p.rotationLocks)[String(player.id)] === "P",
          status: status as "T" | "P" | "—",
          actualMinutes: report
            ? effectiveMinutes(
                report,
                unit.periodIndex,
                player.id,
                unit.start,
                unit.key === "t3" && units.some((u) => u.key === "t3-second")
                  ? unit.minutes
                  : report.periods[unit.periodIndex].minutes,
              )
            : null,
          ...(starter &&
          Number.isFinite(position.x) &&
          Number.isFinite(position.y)
            ? {
                position: {
                  x: Math.max(0, Math.min(100, position.x)),
                  y: Math.max(0, Math.min(100, position.y)),
                },
              }
            : {}),
        };
      });
      return {
        playerId: player.id,
        name: (player.lastName + " " + player.firstName).trim(),
        jerseyNumber: player.jerseyNumber ?? null,
        cells,
        plannedMinutes,
        plannedPeriods,
        actualMinutes: report
          ? cells.reduce((sum, c) => sum + (c.actualMinutes ?? 0), 0)
          : null,
      };
    }),
  };
}
/** Public preparation state only; does not expose formations, attendance or peer minutes. */
export function matchPreparationStatus(value: unknown, fallback = 11, calledIds?: Set<number>): "empty" | "partial" | "complete" {
  const plan = record(value);
  const periods = Array.isArray(plan.periods) ? plan.periods.map(record) : [];
  const ids = calledIds ?? new Set<number>(periods.flatMap(p => [
    ...(Array.isArray(p.lineupPlayerIds) ? p.lineupPlayerIds : []),
    ...(Array.isArray(record(p.secondPart).lineupPlayerIds) ? record(p.secondPart).lineupPlayerIds : []),
  ]).filter(Number.isInteger));
  const started = ids.size || plan.convocationAt || plan.convocationPlace || plan.boardLink;
  if (!started) return "empty";
  if (!periods.length || typeof plan.convocationAt !== "string" || !Number.isFinite(Date.parse(plan.convocationAt)) || typeof plan.convocationPlace !== "string" || !plan.convocationPlace.trim()) return "partial";
  const complete = periods.every(p => {
    const sources = p.key === "t3" && !periods.some(p => p.key === "t4") ? [p, record(p.secondPart)] : [p];
    return sources.every(source => {
      const limit = rotationSummaryCapacity({ ...p, ...source }, fallback);
      const lineup = Array.isArray(source.lineupPlayerIds) ? [...new Set<number>(source.lineupPlayerIds.filter(Number.isInteger))] : [];
      const count = typeof source.lineupStarterCount === "number" ? Math.max(0, Math.min(limit, source.lineupStarterCount)) : limit;
      return ids.size > 0 && lineup.slice(0, count).filter(id => ids.has(id)).length === limit;
    });
  });
  return complete ? "complete" : "partial";
}

/** Preserve public fixture metadata while excluding technical plans, report markers and peer availability. */
export function parentPublicMatch<T extends Record<string, any>>(match: T, capacity = 11) {
  const { matchPlan, ...publicMatch } = match;
  return {
    ...publicMatch,
    preparationStatus: matchPreparationStatus(matchPlan, capacity),
    notes:
      typeof match.notes === "string"
        ? match.notes.split("[FTB_MATCH_PLAN]")[0].trim()
        : match.notes,
  };
}
