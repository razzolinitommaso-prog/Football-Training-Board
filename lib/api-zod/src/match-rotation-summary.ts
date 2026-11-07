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
export function matchPeriodIsSplit(period: { key?: unknown; splitAtHalf?: unknown }, fourth: boolean) {
  return period.splitAtHalf === true || (period.key === "t3" && !fourth);
}

export function matchPeriodFirstPartMinutes(period: { firstPartMinutes?: unknown; thirdPartMinutes?: unknown }, total: number) {
  const first = period.firstPartMinutes === undefined ? period.thirdPartMinutes : period.firstPartMinutes;
  return typeof first === "number" && first > 0 && first < total ? first : total / 2;
}


export function matchPeriodPartKey(key: string, index: number) {
  return index === 0 ? key : index === 1 ? key + "-second" : key + "-part-" + (index + 1);
}

export function matchPeriodPartAddress(key: string) {
  const match = /^(t[1-4])(?:-(second|part-(\d+)))?$/.exec(key);
  if (!match) return undefined;
  const part = match[2] === "second" ? 1 : match[3] ? Number(match[3]) - 1 : 0;
  if (!Number.isSafeInteger(part) || part >= matchPeriodPartLimit(180) || (match[3] && part < 2)) return undefined;
  return { key: match[1], part };
}

export function matchPeriodPartLimit(minutes: number) {
  return Math.max(1, Math.floor(Math.min(minutes, 180) * 60 / 15));
}

export function matchPeriodParts(period: {
  key?: unknown; minutes?: unknown; fractionCount?: unknown; splitAtHalf?: unknown;
  firstPartMinutes?: unknown; thirdPartMinutes?: unknown;
}, fourth: boolean) {
  const minutes = duration(period.minutes);
  const legacy = matchPeriodIsSplit(period, fourth) ? 2 : 1;
  const count = typeof period.fractionCount === "number" && Number.isSafeInteger(period.fractionCount)
    ? Math.max(1, Math.min(matchPeriodPartLimit(minutes), period.fractionCount)) : legacy;
  if (count === 1) return [minutes];
  if (count === 2) {
    const first = matchPeriodFirstPartMinutes(period, minutes);
    return [first, minutes - first];
  }
  const seconds = Math.round(minutes * 60);
  return Array.from({ length: count }, (_, i) =>
    (Math.floor(seconds / count) + (i < seconds % count ? 1 : 0)) / 60);
}

function partLabel(index: number) {
  return index < 26 ? String.fromCharCode(65 + index) : "·" + (index + 1);
}

export function matchPeriodLabel(key: string, index: number, count: number) {
  const number = /^t[1-4]$/.test(key) ? key.slice(1) : "";
  return count > 1 && number ? number + partLabel(index) : number ? number + "° tempo" : "Tempo";
}

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

    const key = String(p.key);
    const parts = matchPeriodParts(p, fourth);
    const total = parts.reduce((sum, minutes) => sum + minutes, 0);
    let start = 0;
    parts.forEach((minutes, part) => {
      units.push({
        key: matchPeriodPartKey(key, part),
        label: matchPeriodLabel(key, part, parts.length),
        minutes, periodKey: key, periodIndex: index, start, share: minutes / total,
      });
      const nested = part === 1 ? p.secondPart : p.additionalParts?.[part - 2];
      sources.push(part === 0 ? p : { ...p, ...record(nested), lineupPlayerIds: record(nested).lineupPlayerIds ?? [], lineupStarterCount: record(nested).lineupStarterCount });
      start += minutes;
    });
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
                units[i + 1]?.periodIndex === unit.periodIndex
                  ? unit.start + unit.minutes
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
  const fourth = periods.some(p => p.key === "t4");
  const sourcesFor = (p: Record<string, any>) => matchPeriodParts(p, fourth).map((_, index) =>
    index === 0 ? p : record(index === 1 ? p.secondPart : p.additionalParts?.[index - 2]));
  const ids = calledIds ?? new Set<number>(periods.flatMap(p => sourcesFor(p).flatMap(source =>
    Array.isArray(source.lineupPlayerIds) ? source.lineupPlayerIds.filter(Number.isInteger) : [])));
  const started = ids.size || plan.convocationAt || plan.convocationPlace || plan.boardLink;
  if (!started) return "empty";
  if (!periods.length || typeof plan.convocationAt !== "string" || !Number.isFinite(Date.parse(plan.convocationAt)) || typeof plan.convocationPlace !== "string" || !plan.convocationPlace.trim()) return "partial";
  const complete = periods.every(p => {
    const sources = sourcesFor(p);
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
