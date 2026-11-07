import { changeMatchLineupStatus, setLineupKeeper, splitMatchLineup } from "./match-lineup";
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
  lineupManual?: boolean;
  lineupGoalkeeperId?: number | null;
  /** Individual choices from the comparison. Advanced/manual lineups remain whole-period choices. */
  rotationLocks?: Record<string, "T" | "P">;
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
    const locks = force && unitIndex > 0 ? {} : (source.rotationLocks ?? {});
    const partial = source.rotationLocks !== undefined;
    const automatic = (!source.lineupManual || (force && unitIndex > 0)) && (
      empty ||
      (!(force && unitIndex === 0) &&
        (partial ||
          (unitIndex > 0 && (force || source.rotationAuto === true)))));
    if (automatic) {
      const ranked = [...selected].sort(
        (a, b) =>
          Number(previous.has(a)) - Number(previous.has(b)) ||
          (totals.get(a) ?? 0) - (totals.get(b) ?? 0) ||
          a - b,
      );
      const fixed = ranked.filter((id) => locks[id] === "T");
      const eligible = ranked.filter(
        (id) => locks[id] !== "P" && !fixed.includes(id),
      );
      const designated=source.lineupGoalkeeperId;
      const keeper=designated!==undefined
        ? designated!==null&&selected.has(designated)&&locks[designated]!=="P"?designated:undefined
        : limit>3?fixed.find(id=>goalkeepers.has(id))??eligible.find(id=>goalkeepers.has(id)):undefined;
      const chosen=[...fixed];
      if(keeper!==undefined&&!chosen.includes(keeper)&&chosen.length<limit)chosen.push(keeper);
      starters=[...chosen,...eligible.filter(id=>!chosen.includes(id)).slice(0,Math.max(0,limit-chosen.length))];
      if(keeper!==undefined&&starters.includes(keeper))starters=[keeper,...starters.filter(id=>id!==keeper)];

    }
    const lineup = [
      ...starters,
      ...(source.lineupManual&&!automatic?groups.reserves:[...selected].filter((id) => !starters.includes(id))),
    ];
    const changed =
      JSON.stringify(source.lineupPlayerIds) !== JSON.stringify(lineup) ||
      source.lineupStarterCount !== starters.length;
    const updated = {
      ...source,
      lineupPlayerIds: lineup,
      lineupStarterCount: starters.length,
      ...(automatic ? { rotationAuto: true } : {}),
      ...(force && unitIndex > 0 ? { rotationLocks: undefined, lineupManual: false } : {}),
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
  // Improve the whole-game balance, rather than looking only at the previous segment.
  // Existing manual periods (and the first formation) are protected; cell locks are
  // exact constraints. A swap never changes the number of places or the keeper role.
  const units = rotationUnits(next);
  const ids = [...selected];
  const originalUnits = rotationUnits(periods);
  const editable = units.map((_, i) => {
    const p = originalUnits[i].period;
    if ((force && i === 0) || (p.lineupManual && !force)) return false;
    return (
      p.rotationLocks !== undefined ||
      (i > 0 &&
        (force ||
          p.rotationAuto === true ||
          (!p.lineupPlayerIds?.length && p.lineupStarterCount == null)))
    );
  });
  const startersByUnit = units.map(
    (u) => splitMatchLineup(u.period, limitFor(u.period), selected).starters,
  );
  const score = () => {
    const values = ids.map((id) =>
      startersByUnit.reduce(
        (sum, starters, i) =>
          sum + (starters.includes(id) ? units[i].minutes : 0),
        0,
      ),
    );
    const spread = values.length
      ? Math.max(...values) - Math.min(...values)
      : 0;
    const squares = values.reduce((sum, value) => sum + value * value, 0);
    const repeats = startersByUnit.reduce(
      (sum, starters, i) =>
        sum +
        (i
          ? starters.filter((id) => startersByUnit[i - 1].includes(id)).length
          : 0),
      0,
    );
    return [spread, squares, repeats];
  };
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++)
      if (Math.abs(a[i] - b[i]) > 1e-7) return a[i] < b[i];
    return false;
  };
  // Bounded deterministic local improvement; no expensive search during a tap.
  for (let pass = 0; pass < 100; pass++) {
    let best = score(),
      swap: [number, number, number] | undefined;
    for (let i = 0; i < units.length; i++) {
      if (!editable[i]) continue;
      const locks = units[i].period.rotationLocks ?? {};
      for (const outgoing of startersByUnit[i]) {
        if (locks[outgoing] === "T" || units[i].period.lineupGoalkeeperId === outgoing) continue;
        for (const incoming of ids) {
          if (startersByUnit[i].includes(incoming) || locks[incoming] === "P")
            continue;
          if (
            units[i].period.lineupGoalkeeperId === undefined && limitFor(units[i].period) > 3 &&
            startersByUnit[i].some(id=>goalkeepers.has(id)) && goalkeepers.has(outgoing) && !goalkeepers.has(incoming) && !startersByUnit[i].some(id=>id!==outgoing&&goalkeepers.has(id))
          )
            continue;
          const index = startersByUnit[i].indexOf(outgoing);
          startersByUnit[i][index] = incoming;
          const candidate = score();
          startersByUnit[i][index] = outgoing;
          if (better(candidate, best)) {
            best = candidate;
            swap = [i, outgoing, incoming];
          }
        }
      }
    }
    if (!swap) break;
    const [i, outgoing, incoming] = swap;
    startersByUnit[i][startersByUnit[i].indexOf(outgoing)] = incoming;
  }
  units.forEach((unit, i) => {
    const starters = startersByUnit[i];
    const before = splitMatchLineup(
      unit.period,
      limitFor(unit.period),
      selected,
    ).starters;
    if (
      starters.length === before.length &&
      starters.every((id, index) => id === before[index])
    )
      return;
    const updated = {
      ...unit.period,
      lineupPlayerIds: [
        ...starters,
        ...ids.filter((id) => !starters.includes(id)),
      ],
      lineupStarterCount: starters.length,
      boardConfirmed: false,
      lineupDetectedModule: null,
      lineupPositions: Object.fromEntries(
        Object.entries(unit.period.lineupPositions ?? {}).filter(
          ([id]) =>
            starters.includes(Number(id)) && before.includes(Number(id)),
        ),
      ),
    } as T;
    if (unit.second)
      next[unit.index] = { ...next[unit.index], secondPart: updated };
    else
      next[unit.index] = {
        ...updated,
        secondPart: next[unit.index].secondPart,
      };
  });
  return next;
}

/** A comparison tap pins one cell, not an entire period. Reject impossible constraints. */
export function selectRotationCell<T extends RotationPeriod>(
  periods: T[],
  selected: Set<number>,
  limitFor: (p: T) => number,
  goalkeepers: Set<number>,
  key: string,
  id: number,
  reserve: boolean,
): T[] {
  if (!selected.has(id)) return periods;
  const unit = rotationUnits(periods).find((u) => u.period.key === key);
  if (!unit) return periods;
  const locks = Object.fromEntries(
    Object.entries(unit.period.rotationLocks ?? {}).filter(([player]) =>
      selected.has(Number(player)),
    ),
  ) as Record<string, "T" | "P">;
  locks[id] = reserve ? "P" : "T";
  const fixed = Object.entries(locks)
    .filter(([, status]) => status === "T")
    .map(([player]) => Number(player));
  const capacity = Math.min(limitFor(unit.period), selected.size);
  const eligible = [...selected].filter((player) => locks[player] !== "P");
  if (fixed.length > capacity || eligible.length < capacity)
    throw Error(
      "Scelta incompatibile con i posti in campo. Libera una scelta fissata prima di cambiarla.",
    );
  const updated = {
    ...unit.period,
    lineupGoalkeeperId: unit.period.lineupGoalkeeperId!=null && ((reserve&&unit.period.lineupGoalkeeperId===id)||(fixed.length===capacity&&!fixed.includes(unit.period.lineupGoalkeeperId))) ? null : unit.period.lineupGoalkeeperId,
    rotationLocks: locks,
    rotationAuto: true,
  } as T;
  const next = periods.map((p, index) =>
    index !== unit.index
      ? p
      : unit.second
        ? { ...p, secondPart: updated }
        : updated,
  );
  return rotateMatchPeriods(next, selected, limitFor, goalkeepers);
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
    matchGoalkeeperId?: number | null;
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
      lineupGoalkeeperId: plan.matchGoalkeeperId,
      ...(plan.periods.every(p=>p.lineupManual)?{lineupManual:true,lineupStarterCount:0,lineupPlayerIds:[]}:{}),
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


export function editManualLineupCell<T extends RotationPeriod>(periods:T[], selected:Set<number>,limitFor:(p:T)=>number,key:string,id:number,reserve:boolean):T[]{
 const unit=rotationUnits(periods).find(u=>u.period.key===key);
 if(!unit||!selected.has(id))return periods;
 const change=changeMatchLineupStatus(unit.period,limitFor(unit.period),id,reserve,selected);
 const keeper=unit.period.lineupGoalkeeperId,starters=change.lineupPlayerIds.slice(0,change.lineupStarterCount);
 const updated={...unit.period,...change,lineupManual:true,rotationAuto:false,rotationLocks:undefined,
  lineupGoalkeeperId:keeper!=null&&!starters.includes(keeper)?null:keeper,
  lineupPositions:Object.fromEntries(Object.entries(unit.period.lineupPositions??{}).filter(([key])=>starters.includes(Number(key)))),
  boardConfirmed:false,lineupDetectedModule:null} as T;
 return periods.map((p,i)=>i!==unit.index?p:unit.second?{...p,secondPart:updated}:updated);
}

export function clearMatchLineups<T extends RotationPeriod,P extends {periods:T[];fourthPeriodDraft?:T;matchGoalkeeperId?:number|null}>(plan:P):P {
 const clear=(p:T):T=>({...p,lineupPlayerIds:[],lineupStarterCount:0,lineupManual:true,lineupGoalkeeperId:null,
  rotationAuto:false,rotationLocks:undefined,lineupPositions:{},lineupDetectedModule:null,boardId:null,boardUrl:null,boardTitle:null,boardSnapshotAt:null,boardConfirmed:false,
  ...(p.secondPart?{secondPart:clear(p.secondPart as T)}:{})});
 return {...plan,matchGoalkeeperId:null,periods:plan.periods.map(clear),...(plan.fourthPeriodDraft?{fourthPeriodDraft:clear(plan.fourthPeriodDraft)}:{})};
}

export function designateMatchKeeper<T extends RotationPeriod,P extends {periods:T[];fourthPeriodDraft?:T;matchGoalkeeperId?:number|null}>(plan:P,key:string,id:number|null,selected:Set<number>,limitFor:(p:T)=>number,natural:(id:number)=>boolean):P{
 if(id!==null&&!selected.has(id))return plan;
 const update=(p:T):T=>{
   const changed=setLineupKeeper(p,id,limitFor(p),selected,natural);
   const locks=p.rotationLocks?{...p.rotationLocks}:undefined;
   if(locks&&id!==null){delete locks[id];for(const key of Object.keys(locks))if(locks[key]==="T"&&!changed.lineupPlayerIds?.slice(0,changed.lineupStarterCount).includes(Number(key)))delete locks[key];}
   return {...changed,rotationLocks:locks};
 };
 const all=key==="all";
 return {...plan,...(all?{matchGoalkeeperId:id}:{}),periods:plan.periods.map(p=>{
   const next=all||p.key===key?update(p):p;
   if(p.key!=="t3"||(!all&&key!=="t3-second"))return next;
   const second={module:p.module,format:p.format,key:"t3-second",label:"3° tempo · seconda parte",minutes:String(periodMinutes(p.minutes)/2),...p.secondPart} as T;
   return {...next,secondPart:update(second)};
 }),...(all&&plan.fourthPeriodDraft?{fourthPeriodDraft:update(plan.fourthPeriodDraft)}:{})};
}
