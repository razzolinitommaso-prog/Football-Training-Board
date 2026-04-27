/**
 * Ruoli che devono vedere squadre/giocatori/sessioni/statistiche a livello di tutto il club,
 * senza restringere implicitamente a req.session.section (che spesso è vuota o non allineata alle squadre).
 */
export const CLUB_WIDE_LIST_ROLES = new Set<string>(["technical_director", "director"]);

/** Normalizza il ruolo in sessione (trim, lower case, spazi/trattini → _) per confronti stabili con PG/connect-pg-simple. */
export function normalizeSessionRole(role: unknown): string {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

/** Chi vede tutte le sessioni del club (come lista /training-sessions senza filtro “solo mie”). */
const VIEW_ALL_CLUB_TRAINING_SESSIONS = new Set([
  "admin",
  "presidente",
  "director",
  "technical_director",
  "secretary",
]);

export function canViewAllClubTrainingSessions(role: unknown): boolean {
  return VIEW_ALL_CLUB_TRAINING_SESSIONS.has(normalizeSessionRole(role));
}

export function isClubWideListRole(role: unknown): boolean {
  return CLUB_WIDE_LIST_ROLES.has(normalizeSessionRole(role));
}

export function resolveClubSectionFilter(
  role: unknown,
  querySection: string | undefined,
  sessionSection: string | undefined,
): string | undefined {
  // DT / DG: sempre panoramica club (altrimenti ?section=... nel GET filtrerebbe a zero righe).
  if (isClubWideListRole(role)) return undefined;
  if (typeof querySection === "string" && querySection.length > 0) return querySection;
  return sessionSection;
}
