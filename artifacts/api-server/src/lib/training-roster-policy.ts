export function playerBirthYear(value: unknown): number | null {
  const date = String(value ?? "").trim();
  const year = /^(\d{4})(?:[-/]|$)/.exec(date)?.[1] ?? /(?:[-/])(\d{4})$/.exec(date)?.[1];
  return year && Number(year) >= 1900 && Number(year) <= 2200 ? Number(year) : null;
}
export function supplementalTrainingTeam(notes: string | null): number | null {
  const full = notes?.trim();
  if (!full?.startsWith("[FTB_PLAYER_META]")) return null;
  try {
    const meta = JSON.parse(full.slice("[FTB_PLAYER_META]".length).split("\n")[0].trim());
    const id = Number(meta.supplementalTeamId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch { return null; }
}
export function rosterMembers<T extends { id: number; teamId: number | null; notes: string | null }>(players: T[], teamIds: number[]): T[] {
  const teams = new Set(teamIds);
  return Array.from(new Map(players.filter(player => teams.has(player.teamId ?? -1) || teams.has(supplementalTrainingTeam(player.notes) ?? -1)).map(player => [player.id, player])).values());
}
