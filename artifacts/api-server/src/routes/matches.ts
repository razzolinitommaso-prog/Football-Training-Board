import { Router, type IRouter } from "express";
import {
  db,
  matchesTable,
  callUpsTable,
  playersTable,
  teamsTable,
  teamStaffAssignmentsTable,
  parentPlayerRelationsTable,
  parentNotificationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const SCHEDULE_ROLES = ["secretary", "director", "admin"];
const POST_NOTES_ROLES = [
  "secretary",
  "director",
  "admin",
  "coach",
  "fitness_coach",
  "athletic_director",
  "technical_director",
];
const MATCH_PLAN_EDIT_ROLES = ["coach", "fitness_coach", "athletic_director"];
const MATCH_PLAN_VIEW_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];
const MATCH_PLAN_MARKER = "[FTB_MATCH_PLAN]";

function parseRouteIdParam(value: string | string[] | undefined): number {
  if (Array.isArray(value)) return Number.parseInt(value[0] ?? "", 10);
  return Number.parseInt(value ?? "", 10);
}

function splitPublicNotesAndPlan(raw?: string | null): { publicNotes: string | null; plan: unknown | null } {
  const text = (raw ?? "").trim();
  if (!text) return { publicNotes: null, plan: null };
  const idx = text.lastIndexOf(MATCH_PLAN_MARKER);
  if (idx < 0) return { publicNotes: text, plan: null };
  const before = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + MATCH_PLAN_MARKER.length).trim();
  let parsed: unknown = null;
  try {
    parsed = jsonPart ? JSON.parse(jsonPart) : null;
  } catch {
    parsed = null;
  }
  return { publicNotes: before || null, plan: parsed };
}

function composeNotesWithPlan(publicNotes: string | null, plan: unknown | null): string | null {
  const cleanNotes = (publicNotes ?? "").trim();
  if (plan == null) return cleanNotes || null;
  const encoded = `${MATCH_PLAN_MARKER}${JSON.stringify(plan)}`;
  return cleanNotes ? `${cleanNotes}\n\n${encoded}` : encoded;
}

async function userCanManageAssignedTeamMatch(userId: number, clubId: number, role: string, teamId: number | null): Promise<boolean> {
  if (!teamId) return false;
  if (!MATCH_PLAN_EDIT_ROLES.includes(role)) return false;
  const [assignment] = await db
    .select({ id: teamStaffAssignmentsTable.id })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.clubId, clubId),
      eq(teamStaffAssignmentsTable.teamId, teamId),
    ))
    .limit(1);
  return !!assignment;
}

async function userCanViewMatchPlan(userId: number, clubId: number, role: string, teamId: number | null): Promise<boolean> {
  if (["admin", "presidente", "director", "secretary"].includes(role)) return true;
  if (role === "technical_director") return true;
  if (!MATCH_PLAN_VIEW_ROLES.includes(role)) return false;
  return userCanManageAssignedTeamMatch(userId, clubId, role, teamId);
}

async function enrichMatch(match: typeof matchesTable.$inferSelect) {
  let teamName: string | null = null;
  if (match.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, match.teamId));
    if (team) teamName = team.name;
  }
  const split = splitPublicNotesAndPlan(match.notes ?? null);
  return {
    ...match,
    teamName,
    competition: match.competition ?? null,
    location: match.location ?? null,
    result: match.result ?? null,
    notes: split.publicNotes,
    matchPlan: split.plan,
    preMatchNotes: match.preMatchNotes ?? null,
    postMatchNotes: match.postMatchNotes ?? null,
  };
}

router.get("/matches", requireAuth, async (req, res): Promise<void> => {
  const teamId = req.query.teamId ? parseInt(req.query.teamId as string) : null;
  const conditions: ReturnType<typeof eq>[] = [eq(matchesTable.clubId, req.session.clubId!) as any];
  if (teamId && !isNaN(teamId)) conditions.push(eq(matchesTable.teamId, teamId) as any);
  const sectionFilter = req.session.section;
  if (sectionFilter) {
    const sectionTeams = await db.select({ id: teamsTable.id }).from(teamsTable)
      .where(and(eq(teamsTable.clubId, req.session.clubId!), eq(teamsTable.clubSection, sectionFilter)));
    const ids = sectionTeams.map(t => t.id);
    conditions.push((ids.length > 0 ? inArray(matchesTable.teamId, ids) : sql`false`) as any);
  }
  const matches = await db.select().from(matchesTable).where(and(...conditions)).orderBy(desc(matchesTable.date));
  const enriched = await Promise.all(matches.map(enrichMatch));
  res.json(enriched);
});

router.post("/matches", requireAuth, async (req, res): Promise<void> => {
  const { opponent, date, teamId, seasonId, competition, location, homeAway } = req.body;
  if (!opponent || !date) { res.status(400).json({ error: "opponent and date required" }); return; }
  const [match] = await db.insert(matchesTable).values({
    clubId: req.session.clubId!, opponent, date: new Date(date),
    teamId: teamId ?? null, seasonId: seasonId ?? null, competition: competition ?? null,
    location: location ?? null, homeAway: homeAway ?? "home",
  }).returning();
  const enriched = await enrichMatch(match);
  res.status(201).json(enriched);
});

router.patch("/matches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const role = req.session.role ?? "";
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;
  const { opponent, date, teamId, competition, location, homeAway, result, notes, preMatchNotes, postMatchNotes, matchPlan } = req.body;
  const updates: Record<string, unknown> = {};

  const [existing] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId)));
  if (!existing) { res.status(404).json({ error: "Match not found" }); return; }

  const scheduleFields = [date, req.body.isPostponed, req.body.rescheduleDate, req.body.rescheduleTbd, preMatchNotes];
  const postNotesFields = [postMatchNotes];
  const matchPlanFields = [matchPlan];
  const wantsScheduleEdit = scheduleFields.some(f => f !== undefined);
  const wantsPostNotesEdit = postNotesFields.some(f => f !== undefined);
  const wantsMatchPlanEdit = matchPlanFields.some(f => f !== undefined);

  if (wantsScheduleEdit && !SCHEDULE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare data, orario o note pre-partita" }); return;
  }
  if (wantsPostNotesEdit && !POST_NOTES_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare le note post-partita" }); return;
  }
  if (wantsMatchPlanEdit) {
    const canManage = await userCanManageAssignedTeamMatch(userId, clubId, role, existing.teamId ?? null);
    if (!canManage) {
      res.status(403).json({ error: "Non autorizzato a modificare convocazioni/schieramenti di questa squadra" }); return;
    }
  }

  if (opponent !== undefined && SCHEDULE_ROLES.includes(role)) updates.opponent = opponent;
  if (date !== undefined) updates.date = new Date(date);
  if (teamId !== undefined) updates.teamId = teamId;
  if (competition !== undefined && SCHEDULE_ROLES.includes(role)) updates.competition = competition;
  if (location !== undefined && SCHEDULE_ROLES.includes(role)) updates.location = location;
  if (homeAway !== undefined && SCHEDULE_ROLES.includes(role)) updates.homeAway = homeAway;
  if (result !== undefined) updates.result = result;
  if (notes !== undefined) {
    const parsed = splitPublicNotesAndPlan(existing.notes ?? null);
    updates.notes = composeNotesWithPlan(typeof notes === "string" ? notes : null, parsed.plan);
  }
  if (preMatchNotes !== undefined) updates.preMatchNotes = preMatchNotes;
  if (postMatchNotes !== undefined) updates.postMatchNotes = postMatchNotes;
  if (matchPlan !== undefined) {
    const parsed = splitPublicNotesAndPlan(existing.notes ?? null);
    updates.notes = composeNotesWithPlan(parsed.publicNotes, matchPlan ?? null);
  }
  if (req.body.isPostponed !== undefined) updates.isPostponed = req.body.isPostponed;
  if (req.body.rescheduleDate !== undefined) updates.rescheduleDate = req.body.rescheduleDate ? new Date(req.body.rescheduleDate) : null;
  if (req.body.rescheduleTbd !== undefined) updates.rescheduleTbd = req.body.rescheduleTbd;

  if (Object.keys(updates).length === 0) {
    const enrichedCurrent = await enrichMatch(existing);
    res.json(enrichedCurrent);
    return;
  }

  const [match] = await db.update(matchesTable).set(updates)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, clubId))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const enriched = await enrichMatch(match);
  res.json(enriched);
});

router.delete("/matches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.delete(matchesTable)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, req.session.clubId!))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  res.sendStatus(204);
});

router.get("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canView = await userCanViewMatchPlan(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canView) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const enriched = await Promise.all(callups.map(async (cu) => {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, cu.playerId));
    return { ...cu, playerName: player ? `${player.firstName} ${player.lastName}` : null };
  }));
  res.json(enriched);
});

router.post("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { playerId, status } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [existing] = await db.select({ id: callUpsTable.id }).from(callUpsTable).where(and(eq(callUpsTable.matchId, matchId), eq(callUpsTable.playerId, Number(playerId))));
  if (existing) {
    res.status(200).json({ id: existing.id, matchId, playerId: Number(playerId), status: status ?? "pending" });
    return;
  }
  const [cu] = await db.insert(callUpsTable).values({ matchId, playerId: Number(playerId), status: status ?? "pending" }).returning();
  res.status(201).json(cu);
});

router.patch("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status } = req.body;
  const [existing] = await db.select().from(callUpsTable).where(eq(callUpsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Call-up not found" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, existing.matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [cu] = await db.update(callUpsTable).set({ status }).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.json(cu);
});

router.delete("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseRouteIdParam(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(callUpsTable).where(eq(callUpsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Call-up not found" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, existing.matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a modificare le convocazioni" }); return; }
  const [cu] = await db.delete(callUpsTable).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.sendStatus(204);
});

router.post("/matches/:id/callups/publish", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseRouteIdParam(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.clubId, req.session.clubId!)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const canManage = await userCanManageAssignedTeamMatch(req.session.userId!, req.session.clubId!, req.session.role ?? "", match.teamId ?? null);
  if (!canManage) { res.status(403).json({ error: "Non autorizzato a pubblicare convocazioni" }); return; }

  const convocationAtRaw = typeof req.body?.convocationAt === "string" ? req.body.convocationAt : "";
  const convocationPlace = typeof req.body?.convocationPlace === "string" ? req.body.convocationPlace.trim() : "";
  if (!convocationAtRaw || !convocationPlace) {
    res.status(400).json({ error: "Orario e luogo convocazione obbligatori" }); return;
  }
  const convocationDate = new Date(convocationAtRaw);
  if (Number.isNaN(convocationDate.getTime())) {
    res.status(400).json({ error: "Orario convocazione non valido" }); return;
  }

  const [team] = match.teamId ? await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, match.teamId)) : [null];
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const playerIds = [...new Set(callups.map((c) => c.playerId))];
  if (playerIds.length === 0) { res.status(400).json({ error: "Nessun convocato selezionato" }); return; }
  const relations = await db
    .select({ parentUserId: parentPlayerRelationsTable.parentUserId, playerId: parentPlayerRelationsTable.playerId })
    .from(parentPlayerRelationsTable)
    .where(inArray(parentPlayerRelationsTable.playerId, playerIds));

  const players = await db
    .select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName })
    .from(playersTable)
    .where(inArray(playersTable.id, playerIds));
  const playerNameMap = new Map(players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));

  const title = `Convocazione partita ${team?.name ?? ""}`.trim();
  let notifications = 0;
  for (const rel of relations) {
    const childName = playerNameMap.get(rel.playerId) ?? "tuo figlio/a";
    const message =
      `Convocazione ${childName}: ${convocationDate.toLocaleString("it-IT")} presso ${convocationPlace}. ` +
      `Partita vs ${match.opponent}${team?.name ? ` (${team.name})` : ""}.`;
    await db.insert(parentNotificationsTable).values({
      parentUserId: rel.parentUserId,
      clubId: req.session.clubId!,
      type: "match_callup",
      title,
      message,
      isRead: false,
    });
    notifications++;
  }

  const clipboardText = [
    `CONVOCAZIONE PARTITA - ${team?.name ?? "Squadra"}`,
    `Avversario: ${match.opponent}`,
    `Data partita: ${new Date(match.date).toLocaleString("it-IT")}`,
    `Convocazione: ${convocationDate.toLocaleString("it-IT")}`,
    `Luogo convocazione: ${convocationPlace}`,
    "",
    "Convocati:",
    ...playerIds.map((id, i) => `${i + 1}. ${playerNameMap.get(id) ?? `Giocatore #${id}`}`),
  ].join("\n");

  res.json({ notifications, clipboardText, parentsImpacted: new Set(relations.map((r) => r.parentUserId)).size });
});

export default router;
