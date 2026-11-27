/** The club-wide unavailable-player alert belongs to senior management. */
export function canViewUnavailablePlayersAlert(role: unknown): boolean {
  const normalized = String(role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ["technical_director", "sporting_director", "director", "presidente", "admin"].includes(normalized);
}
