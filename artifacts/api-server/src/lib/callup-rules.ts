import { isArchivedPlayer } from "@workspace/api-zod";
import { db, playersTable, trainingAttendancesTable, trainingSessionsTable } from "@workspace/db";
import { trainingLocalDate, WITHDRAWN_PLAYER_STATUS } from "@workspace/api-zod";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { sessionTeamScope } from "./session-team-scope";
import { rosterMembers } from "./training-roster-policy";
import { ensureCallupRulesStorage, sqlRows } from "./callup-rule-storage";
import { staffAttendance } from "./attendance-notifications";

export const RULE_EDIT_ROLES = ["technical_director", "director", "sporting_director"];
export const RULE_READ_ROLES = [...RULE_EDIT_ROLES, "coach", "fitness_coach", "athletic_director", "team_manager"];
export const conductLabels = { ottima: "Ottima", buona: "Buona", insufficiente: "Insufficiente" } as const;
export type Conduct = keyof typeof conductLabels;
export type CallupRule = { sessions: number; minimum: number };

export function validCallupRule(value: unknown): value is CallupRule {
  if (!value || typeof value !== "object") return false;
  const { sessions, minimum } = value as CallupRule;
  return Number.isInteger(sessions) && sessions >= 1 && sessions <= 5 &&
    Number.isInteger(minimum) && minimum >= 1 && minimum <= sessions;
}

export function legacyConduct(notes?: string | null): Conduct | null {
  const prefix = "[FTB_ATTENDANCE_META]";
  const line = notes?.split(/\r?\n/).find(item => item.startsWith(prefix));
  try {
    const value = line && JSON.parse(line.slice(prefix.length)).conduct;
    return typeof value === "string" && Object.hasOwn(conductLabels, value) ? value as Conduct : null;
  } catch { return null; }
}

export async function readCallupRule(clubId: number, teamId: number) {
  await ensureCallupRulesStorage();
  return sqlRows<CallupRule & { updatedAt: string }>(await db.execute(sql`
    SELECT sessions, minimum, updated_at AS "updatedAt" FROM match_callup_rules
    WHERE club_id = ${clubId} AND team_id = ${teamId}
  `))[0] ?? null;
}

export function matchKickoff(match: { date: Date; isPostponed?: boolean | null; rescheduleTbd?: boolean | null; rescheduleDate?: Date | null }) {
  return match.isPostponed ? (match.rescheduleTbd ? null : match.rescheduleDate ?? null) : match.date;
}

export function callupWeekStart(kickoff: Date) {
  const date = new Date(trainingLocalDate(kickoff) + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

export async function evaluateCallupRule(clubId: number, teamId: number, kickoff: Date, rule: CallupRule) {
  const weekStart = callupWeekStart(kickoff);
  const [clubPlayers, training] = await Promise.all([
    db.select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName,
      status: playersTable.status, notes: playersTable.notes, teamId: playersTable.teamId })
      .from(playersTable).where(eq(playersTable.clubId, clubId)),
    db.select({ id: trainingSessionsTable.id, scheduledAt: trainingSessionsTable.scheduledAt })
      .from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId), sessionTeamScope(teamId),
        eq(trainingSessionsTable.sessionKind, "regular"), lt(trainingSessionsTable.scheduledAt, new Date(Math.min(kickoff.getTime(), Date.now()))),
        sql`coalesce(${trainingSessionsTable.status}, '') NOT IN ('cancelled', 'canceled')`,
        sql`coalesce(${trainingSessionsTable.notes}, '') NOT IN ('[FTB_AUTO_TRAINING] GROUPED', '[FTB_AUTO_TRAINING] PROGRAM')`))
      .orderBy(desc(trainingSessionsTable.scheduledAt), desc(trainingSessionsTable.id)),
  ]);
  const roster = rosterMembers(clubPlayers, [teamId]).filter(player => !isArchivedPlayer(player) && player.status !== "training_trial");
  const sessionIds = training.map(session => session.id);
  const weekly = [...new Map(training.filter(session => trainingLocalDate(session.scheduledAt) >= weekStart)
    .reverse().map(session => [session.scheduledAt.toISOString(), session])).values()].reverse().slice(0, rule.sessions);
  const [attendance, reviews] = sessionIds.length ? await Promise.all([
    db.select().from(trainingAttendancesTable).where(and(eq(trainingAttendancesTable.clubId, clubId),
      inArray(trainingAttendancesTable.trainingSessionId, sessionIds), staffAttendance)).orderBy(asc(trainingAttendancesTable.id)),
    db.execute(sql`SELECT session_id AS "sessionId", player_id AS "playerId", conduct FROM training_conduct_reviews
      WHERE club_id = ${clubId} AND session_id IN (${sql.join(sessionIds.map(id => sql`${id}`), sql`, `)})`)
      .then(result => sqlRows<{ sessionId: number; playerId: number; conduct: Conduct }>(result)),
  ]) : [[], []];
  const records = new Map([...attendance].reverse().map(row => [row.trainingSessionId + ":" + row.playerId, row]));
  const conduct = new Map(reviews.map(row => [row.sessionId + ":" + row.playerId, row.conduct]));
  const rows = roster.map(player => {
    const statuses = weekly.map(session => records.get(session.id + ":" + player.id)?.status);
    const present = statuses.filter(status => status === "present").length;
    const recorded = statuses.filter(status => status === "present" || status === "absent" || status === "injured").length;
    const lastConduct = training.map(session => {
      const key = session.id + ":" + player.id;
      return conduct.get(key) ?? legacyConduct(records.get(key)?.notes);
    }).find(Boolean) ?? null;
    const reasons: string[] = [];
    if (lastConduct === "insufficiente") reasons.push("Ultima condotta insufficiente");
    const incomplete = recorded < rule.sessions;
    if (!incomplete && present < rule.minimum) reasons.push(`Presenze insufficienti: ${present}/${rule.sessions}, minimo ${rule.minimum}`);
    const state = reasons.length ? "blocked" : incomplete || !lastConduct ? "pending" : "eligible";
    if (incomplete) reasons.push(weekly.length < rule.sessions
      ? `Sedute valide prima della gara: ${weekly.length}/${rule.sessions}`
      : `Appelli da completare: ${rule.sessions - recorded}`);
    if (!lastConduct) reasons.push("Condotta da registrare");
    return { id: player.id, name: player.lastName + " " + player.firstName,
      present, recorded, conduct: lastConduct, state, reasons };
  });
  return { rule, weekStart, rows };
}

export async function activeMatchEligibility(match: { teamId: number | null; clubId: number; date: Date; isPostponed?: boolean | null; rescheduleTbd?: boolean | null; rescheduleDate?: Date | null }) {
  const kickoff = matchKickoff(match);
  if (!kickoff || !match.teamId || kickoff <= new Date()) return null;
  const rule = await readCallupRule(match.clubId, match.teamId);
  return rule ? evaluateCallupRule(match.clubId, match.teamId, kickoff, rule) : null;
}

export function callupRuleFailure(eligibility: Awaited<ReturnType<typeof activeMatchEligibility>>, ids: number[]) {
  if (!eligibility) return null;
  const rows = new Map(eligibility.rows.map(row => [row.id, row]));
  for (const id of ids) {
    const row = rows.get(id);
    if (!row) return "Un giocatore selezionato è fuori dalla rosa di questa annata.";
    if (row.state !== "eligible") return row.name + ": " + row.reasons.join(" · ");
  }
  return null;
}
