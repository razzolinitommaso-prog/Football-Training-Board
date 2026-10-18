export type LinkedFixture = { id: number; matchId?: number | null; round?: number | null; leg?: string | null; homeTeam: string; awayTeam: string; date?: string | null };
export type LinkedChampionship = { id: number; teamId?: number | null; category?: string | null; title: string; groups: { id: number; fixtures: LinkedFixture[] }[] };
export type InternalChampionshipMatch = { id: number; teamId?: number | null; opponent: string; homeAway?: string | null; date: string; competition?: string | null; notes?: string | null };
export type ChampionshipTeam = { id: number; name: string; category?: string | null; clubSection?: string | null };

export function championshipNameKey(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(?:a s d|s s d|a c d|asd|ssd|acd)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function championshipMatchPath(section: string, teamId: number, matchId?: number, championshipId?: number, groupId?: number) {
  const query = new URLSearchParams({ teamId: String(teamId) });
  if (matchId) query.set("openMatchId", String(matchId));
  if (championshipId) query.set("championshipId", String(championshipId));
  if (groupId) query.set("groupId", String(groupId));
  return `/${section.replace(/_/g, "-")}/campionati?${query}`;
}

/** Resolve read-only. Never create matches or choose between multiple plausible identities. */
export function resolveChampionshipMatch(fixture: LinkedFixture, championship: LinkedChampionship, championships: LinkedChampionship[], matches: InternalChampionshipMatch[], teams: ChampionshipTeam[], clubNames: string[], teamScopeCache?: Map<number, number[]>) {
  const byId = new Map(matches.filter(match => match.teamId && teams.some(team => team.id === match.teamId)).map(match => [match.id, match]));
  if (fixture.matchId) { const match = byId.get(fixture.matchId); return match && (!championship.teamId || championship.teamId === match.teamId) ? match : null; }
  const key = championshipNameKey;
  const season = (value?: string | null) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0) : null; };

  const category = key(championship.category ?? "");
  let teamIds = championship.teamId ? [championship.teamId] : teams.filter(team => category && [team.name, team.category ?? ""].some(name => key(name) === category)).map(team => team.id);
  // Imported federal fixtures carry persistent links. Reuse those only within the same team/category and round.
  const linkedIds = new Set<number>();
  for (const source of championships) {
    const sameScope = championship.teamId && source.teamId === championship.teamId
      || category && key(source.category ?? "") === category;
    if (!sameScope) continue;
    for (const group of source.groups) for (const other of group.fixtures) {
      if (!other.matchId || !byId.has(other.matchId)) continue;
      if (key(other.homeTeam) !== key(fixture.homeTeam) || key(other.awayTeam) !== key(fixture.awayTeam)) continue;
      if (!fixture.round || other.round !== fixture.round || !fixture.leg || other.leg !== fixture.leg) continue;
      const match = byId.get(other.matchId)!;
      if (season(fixture.date) == null || season(fixture.date) !== season(other.date) || season(fixture.date) !== season(match.date)) continue;
      if (championship.teamId && match.teamId !== championship.teamId) continue;
      linkedIds.add(other.matchId);
    }
  }
  if (linkedIds.size > 1) return null;
  if (linkedIds.size === 1) return byId.get([...linkedIds][0])!;
  const day = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); };
  const aliases = new Set(clubNames.filter(Boolean).map(key));
  const firstLegRounds = Math.max(0, ...championship.groups.flatMap(group => group.fixtures.filter(row => row.leg === "andata").map(row => row.round ?? 0)));
  const matchesFixture = (row: LinkedFixture, match: InternalChampionshipMatch) => {
    const home = aliases.has(key(row.homeTeam)), away = aliases.has(key(row.awayTeam));
    if (home === away || !row.date || season(row.date) !== season(match.date)) return false;
    if (!key(match.competition ?? "").includes("campionato") || key(match.opponent) !== key(home ? row.awayTeam : row.homeTeam)) return false;
    if (![home ? "home" : "away", home ? "casa" : "trasferta"].includes(String(match.homeAway).toLowerCase())) return false;
    const round = String(match.notes ?? "").match(/(\d+)\s*[ª°a.]?\s*giornata/i);
    const leg = String(match.notes ?? "").toLowerCase().match(/\b(andata|ritorno)\b/);
    if (round && row.round && leg && row.leg) {
      const internalRound = Number(round[1]);
      const matchingRound = internalRound === row.round || row.leg === "ritorno" && firstLegRounds > 0 && internalRound > firstLegRounds && internalRound === row.round + firstLegRounds;
      return matchingRound && leg[1] === row.leg;
    }
    return day(match.date) !== "" && day(match.date) === day(row.date);
  };
  // Federated category names may differ. Infer a team only from at least three distinct
  // opponents in this exact season, with no competing team calendar satisfying the same evidence.
  if (!teamIds.length && teamScopeCache?.has(championship.id)) teamIds = teamScopeCache.get(championship.id)!;
  else if (!teamIds.length) {
    const compatible = teams.filter(team => {
      const opponents = new Set<string>();
      for (const match of matches.filter(item => item.teamId === team.id)) {
        const found = championship.groups.flatMap(group => group.fixtures).filter(row => matchesFixture(row, match));
        if (found.length === 1) opponents.add(key(match.opponent));
      }
      return opponents.size >= 3;
    });
    if (compatible.length === 1) teamIds = [compatible[0].id];
    teamScopeCache?.set(championship.id, teamIds);
  }
  if (!teamIds.length) return null;
  const candidates = [...byId.values()].filter(match => teamIds.includes(match.teamId!) && matchesFixture(fixture, match));
  return candidates.length === 1 ? candidates[0] : null;
}
