import type { Request } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";
import {
  getSessionMembershipSections,
  normalizeClubSection,
  normalizeSessionRole,
} from "./club-scope";

export const STAFF_NAVIGATION_ROLES = new Set([
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
  "coach",
  "fitness_coach",
  "athletic_director",
]);
const MANAGEMENT = new Set([
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
]);
const SECTIONS = ["scuola_calcio", "settore_giovanile", "prima_squadra"];

/** Read-only navigation scope; no assignments or permissions are created. */
export async function readNavigationScope(req: Request) {
  const clubId = Number(req.session.clubId),
    userId = Number(req.session.userId);
  const role = normalizeSessionRole(req.session.role);
  if (!clubId || !userId || !STAFF_NAVIGATION_ROLES.has(role)) return null;
  const rawMembership = await getSessionMembershipSections(req);
  const membership = rawMembership.filter(
    (section) => SECTIONS.includes(section),
  );
  const sessionSection = normalizeClubSection(req.session.section);
  // Preserve legacy management accounts without explicit sections; explicit membership wins.
  const sections = rawMembership.length
    ? membership
    : MANAGEMENT.has(role)
      ? SECTIONS
      : SECTIONS.filter((section) => section === sessionSection);
  let teams = sections.length
    ? await db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          clubSection: teamsTable.clubSection,
          coachId: teamsTable.coachId,
        })
        .from(teamsTable)
        .where(
          and(
            eq(teamsTable.clubId, clubId),
            inArray(teamsTable.clubSection, sections),
          ),
        )
        .orderBy(asc(teamsTable.name))
    : [];
  if (!MANAGEMENT.has(role)) {
    const assignments = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(
        and(
          eq(teamStaffAssignmentsTable.clubId, clubId),
          eq(teamStaffAssignmentsTable.userId, userId),
        ),
      );
    const ids = new Set(assignments.map((row) => row.teamId));
    teams = teams.filter((team) => team.coachId === userId || ids.has(team.id));
  }
  return {
    sections: MANAGEMENT.has(role)
      ? sections
      : sections.filter((section) =>
          teams.some((team) => team.clubSection === section),
        ),
    teams: teams.map(({ coachId, ...team }) => team),
  };
}
