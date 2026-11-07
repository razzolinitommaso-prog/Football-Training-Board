/** Ordered starters followed by reserves; missing counts preserve legacy plans. */
export type LineupSelection = { lineupPlayerIds?: number[]; lineupStarterCount?: number; lineupGoalkeeperId?: number | null };

export function splitMatchLineup(period: LineupSelection | null | undefined, limit: number, selected?: Set<number>) {
  const ids = [...new Set(period?.lineupPlayerIds ?? [])];
  const count = typeof period?.lineupStarterCount === "number" && Number.isFinite(period.lineupStarterCount)
    ? Math.max(0, Math.min(limit, Math.floor(period.lineupStarterCount))) : limit;
  const allowed = (id: number) => !selected || selected.has(id);
  const starters = ids.slice(0, count).filter(allowed);
  const reserves = ids.slice(count).filter(allowed);
  return { starters, reserves, lineupPlayerIds: [...starters, ...reserves], lineupStarterCount: starters.length };
}

export function changeMatchLineupStatus(period: LineupSelection, limit: number, playerId: number, reserve: boolean, selected: Set<number>) {
  const groups = splitMatchLineup(period, limit, selected);
  const alreadyStarter = groups.starters.includes(playerId);
  const alreadyReserve = groups.reserves.includes(playerId);
  if (!selected.has(playerId) || (reserve ? alreadyReserve : alreadyStarter)) return groups;
  const starters = groups.starters.filter(id => id !== playerId);
  const reserves = groups.reserves.filter(id => id !== playerId);
  if (reserve) reserves.push(playerId);
  else {
    if (starters.length >= limit && limit > 0) reserves.unshift(starters.pop()!);
    starters.push(playerId);
  }
  return { lineupPlayerIds: [...starters, ...reserves], lineupStarterCount: starters.length };
}


/** A match assignment is independent of the player's position in the club roster. */
export function lineupKeeper(period: LineupSelection | null | undefined, starters: number[], natural: (id:number)=>boolean): number|null {
  if (period?.lineupGoalkeeperId !== undefined)
    return period.lineupGoalkeeperId !== null && starters.includes(period.lineupGoalkeeperId) ? period.lineupGoalkeeperId : null;
  return starters.find(natural) ?? null;
}

export function setLineupKeeper<T extends LineupSelection & {lineupPositions?: Record<string,{x:number;y:number}>}>(period:T, id:number|null, limit:number, selected:Set<number>, natural:(id:number)=>boolean):T {
  if (id !== null && (!selected.has(id) || limit < 1)) return period;
  const {starters} = splitMatchLineup(period,limit,selected);
  const previous=lineupKeeper(period,starters,natural);
  const positions={...period.lineupPositions};
  if (id !== null) {
    if (!starters.includes(id)) {
      if (starters.length>=limit) {
        const outgoing=[...starters].reverse().find(player=>player!==previous)??starters[0];
        starters.splice(starters.indexOf(outgoing),1);
      }
      starters.push(id);
    }
    if(previous!==id){
      const oldPoint=previous===null?undefined:positions[previous];
      const newPoint=positions[id];
      if(previous!==null){if(newPoint)positions[previous]=newPoint;else delete positions[previous];}
      if(oldPoint)positions[id]=oldPoint;else delete positions[id];
    }
    starters.splice(starters.indexOf(id),1);
    starters.unshift(id);
  }
  return {...period,lineupGoalkeeperId:id,lineupPlayerIds:[...starters,...[...selected].filter(player=>!starters.includes(player))],lineupStarterCount:starters.length,lineupPositions:Object.fromEntries(Object.entries(positions).filter(([key])=>starters.includes(Number(key)))),boardConfirmed:false,lineupDetectedModule:null};
}

export function matchPeriodByKey<T extends {key:string;secondPart?:T;additionalParts?:T[]}>(periods:T[],key:string):T|undefined {
  const period = periods.find(p => p.key === key || key.startsWith(p.key + "-"));
  if (!period || period.key === key) return period;
  if (key === period.key + "-second") return period.secondPart;
  const match = /-part-(\d+)$/.exec(key);
  return match ? period.additionalParts?.[Number(match[1]) - 3] : undefined;
}
