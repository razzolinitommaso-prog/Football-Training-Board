import { Router } from "express";
import { db, matchesTable, teamsTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getAssignedTeamIds, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { ensureCallupRulesStorage, sqlRows } from "../lib/callup-rule-storage";
import { RULE_EDIT_ROLES, RULE_READ_ROLES, evaluateCallupRule, matchKickoff, validCallupRule, type CallupRule } from "../lib/callup-rules";
import type { Request } from "express";

const router = Router();

async function ruleTeams(req: Request, teamId?: number) {
  const { clubId, userId } = req.session;
  const role = normalizeSessionRole(req.session.role);
  if (!clubId || !userId || !RULE_READ_ROLES.includes(role)) return null;
  const canEdit = RULE_EDIT_ROLES.includes(role);
  const [sections, assigned] = await Promise.all([
    resolveAllowedClubSections(req, typeof req.query.section === "string" ? req.query.section : undefined),
    canEdit ? Promise.resolve(undefined) : getAssignedTeamIds(userId, clubId),
  ]);
  if (sections?.length === 0 || assigned?.length === 0) return { teams: [], canEdit };
  const teams = await db.select({ id: teamsTable.id, name: teamsTable.name, section: teamsTable.clubSection })
    .from(teamsTable).where(and(eq(teamsTable.clubId, clubId),
      teamId ? eq(teamsTable.id, teamId) : undefined,
      sections ? inArray(teamsTable.clubSection, sections) : undefined,
      assigned ? inArray(teamsTable.id, assigned) : undefined)).orderBy(asc(teamsTable.name));
  return { teams, canEdit };
}

router.get("/callup-rules", requireAuth, async (req, res) => {
  const teamId = req.query.teamId === undefined ? undefined : Number(req.query.teamId);
  if (teamId !== undefined && (!Number.isSafeInteger(teamId) || teamId < 1)) { res.sendStatus(400); return; }
  const access = await ruleTeams(req, teamId);
  if (!access) { res.sendStatus(403); return; }
  await ensureCallupRulesStorage();
  const rules = new Map(sqlRows<CallupRule & { teamId: number; updatedAt: string }>(await db.execute(sql`
    SELECT team_id AS "teamId", sessions, minimum, allow_unrated_conduct AS "allowUnratedConduct", updated_at AS "updatedAt" FROM match_callup_rules WHERE club_id = ${req.session.clubId}
  `)).map(rule => [rule.teamId, rule]));
  res.json({ canEdit: access.canEdit, teams: access.teams.map(team => ({ ...team, rule: rules.get(team.id) ?? null })) });
});

router.put("/callup-rules/:teamId", requireAuth, async (req, res) => {
  const teamId = Number(req.params.teamId);
  const access = Number.isSafeInteger(teamId) && teamId > 0 ? await ruleTeams(req, teamId) : null;
  if (!access?.canEdit || !access.teams.length) { res.sendStatus(403); return; }
  if (!validCallupRule(req.body)) { res.status(400).json({ error: "Indica da 1 a 5 allenamenti e un minimo compreso nel totale." }); return; }
  await ensureCallupRulesStorage();
  const { sessions, minimum, allowUnratedConduct } = req.body;
  await db.execute(sql`INSERT INTO match_callup_rules (club_id, team_id, sessions, minimum, allow_unrated_conduct)
    VALUES (${req.session.clubId}, ${teamId}, ${sessions}, ${minimum}, ${allowUnratedConduct ?? false})
    ON CONFLICT (team_id) DO UPDATE SET sessions = EXCLUDED.sessions, minimum = EXCLUDED.minimum,
      allow_unrated_conduct = coalesce(${allowUnratedConduct ?? null}::boolean, match_callup_rules.allow_unrated_conduct), updated_at = now()
    WHERE match_callup_rules.club_id = EXCLUDED.club_id`);
  res.sendStatus(204);
});

router.post("/callup-rules/:teamId/preview", requireAuth, async (req, res) => {
  const teamId = Number(req.params.teamId);
  const access = Number.isSafeInteger(teamId) && teamId > 0 ? await ruleTeams(req, teamId) : null;
  if (!access?.canEdit || !access.teams.length) { res.sendStatus(403); return; }
  if (!validCallupRule(req.body)) { res.status(400).json({ error: "Regola non valida." }); return; }
  await ensureCallupRulesStorage();
  const matches = await db.select().from(matchesTable).where(and(eq(matchesTable.clubId, req.session.clubId!), eq(matchesTable.teamId, teamId)));
  const candidate = matches.flatMap(match => {
    const kickoff = matchKickoff(match);
    return kickoff && kickoff > new Date() ? [{ match, kickoff }] : [];
  }).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())[0];
  if (!candidate) { res.json(null); return; }
  const result = await evaluateCallupRule(req.session.clubId!, teamId, candidate.kickoff, req.body);
  res.json({ ...result, opponent: candidate.match.opponent, kickoff: candidate.kickoff });
});

export default router;
