import type { Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { clubMembershipsTable, db, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";

/**
 * Ruoli che devono vedere squadre/giocatori/sessioni/statistiche a livello di tutto il club,
 * senza restringere implicitamente a req.session.section (che spesso è vuota o non allineata alle squadre).
 */
export const CLUB_WIDE_LIST_ROLES = new Set<string>(["admin", "presidente", "director", "sporting_director", "technical_director", "secretary"]);
export const CLUB_WIDE_SECTION_ROLES = new Set<string>(["admin", "presidente", "director", "sporting_director", "technical_director", "secretary"]);

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
  "sporting_director",
  "technical_director",
  "secretary",
]);

export function canViewAllClubTrainingSessions(role: unknown): boolean {
  return VIEW_ALL_CLUB_TRAINING_SESSIONS.has(normalizeSessionRole(role));
}

export function isClubWideListRole(role: unknown): boolean {
  return CLUB_WIDE_LIST_ROLES.has(normalizeSessionRole(role));
}

export function isClubWideSectionRole(role: unknown): boolean {
  return CLUB_WIDE_SECTION_ROLES.has(normalizeSessionRole(role));
}

export function normalizeClubSection(value: unknown): string | undefined {
  const section = String(value ?? "").trim().replace(/-/g, "_");
  return section || undefined;
}

export async function getSessionMembershipSections(req: Request): Promise<string[]> {
  const clubId = Number(req.session.clubId ?? 0);
  const userId = Number(req.session.userId ?? 0);
  if (!clubId || !userId) return [];
  const [membership] = await db
    .select({ clubSection: clubMembershipsTable.clubSection })
    .from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.clubId, clubId), eq(clubMembershipsTable.userId, userId)))
    .limit(1);
  const rawSections = Array.isArray(membership?.clubSection)
    ? membership.clubSection
    : membership?.clubSection
      ? [membership.clubSection]
      : [];
  return Array.from(new Set(rawSections.map(normalizeClubSection).filter((section): section is string => Boolean(section))));
}

export async function resolveAllowedClubSections(req: Request, querySection: string | undefined): Promise<string[] | undefined> {
  const role = normalizeSessionRole(req.session.role);
  const requested = normalizeClubSection(querySection);
  const requestedAll = requested === "all";

  if (isClubWideSectionRole(role)) {
    return requested && !requestedAll ? [requested] : undefined;
  }

  const membershipSections = await getSessionMembershipSections(req);
  const sessionSection = normalizeClubSection(req.session.section);
  const allowedSections = membershipSections.length > 0
    ? membershipSections
    : sessionSection
      ? [sessionSection]
      : [];

  if (requested && !requestedAll) {
    return allowedSections.includes(requested) ? [requested] : [];
  }

  return allowedSections.length > 0 ? allowedSections : [];
}

export function resolveClubSectionFilter(
  role: unknown,
  querySection: string | undefined,
  sessionSection: string | undefined,
): string | undefined {
  if (typeof querySection === "string" && querySection.trim().toLowerCase() === "all") return undefined;
  // DT / DG: sempre panoramica club (altrimenti ?section=... nel GET filtrerebbe a zero righe).
  if (isClubWideListRole(role)) return undefined;
  if (typeof querySection === "string" && querySection.length > 0) return querySection;
  return sessionSection;
}

export async function getAssignedTeamIds(userId: number, clubId: number): Promise<number[]> {
  const staffRows = await db
    .select({ teamId: teamStaffAssignmentsTable.teamId })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
    ));

  const coachedRows = await db
    .select({ teamId: teamsTable.id })
    .from(teamsTable)
    .where(and(
      eq(teamsTable.coachId, userId),
      eq(teamsTable.clubId, clubId),
    ));

  return Array.from(new Set([
    ...staffRows.map((row) => row.teamId),
    ...coachedRows.map((row) => row.teamId),
  ]));
}

export async function getPlayerMeasurementTeamScope(req: Request): Promise<Set<number> | null> {
  const role = normalizeSessionRole(req.session.role);
  if (isClubWideListRole(role)) return null;
  if (!["coach", "fitness_coach", "athletic_director"].includes(role) || !req.session.userId || !req.session.clubId) return new Set();
  const [assigned, sections] = await Promise.all([
    getAssignedTeamIds(req.session.userId, req.session.clubId),
    resolveAllowedClubSections(req, undefined),
  ]);
  if (!sections) return new Set(assigned);
  if (!sections.length || !assigned.length) return new Set();
  const teams = await db.select({ id: teamsTable.id }).from(teamsTable).where(and(
    eq(teamsTable.clubId, req.session.clubId), inArray(teamsTable.id, assigned), inArray(teamsTable.clubSection, sections),
  ));
  return new Set(teams.map(team => team.id));
}

export function canAccessPlayerMeasurements(scope: Set<number> | null, teamId: number | null | undefined) {
  return scope === null || (teamId != null && scope.has(teamId));
}
