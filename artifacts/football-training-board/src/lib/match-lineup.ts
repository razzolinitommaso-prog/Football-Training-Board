/** Ordered starters followed by reserves; missing counts preserve legacy plans. */
export type LineupSelection = { lineupPlayerIds?: number[]; lineupStarterCount?: number };

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
