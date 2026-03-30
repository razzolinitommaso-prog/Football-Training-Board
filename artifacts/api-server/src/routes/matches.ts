import { Router, type IRouter } from "express";
import { db, matchesTable, callUpsTable, playersTable, teamsTable } from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function enrichMatch(match: typeof matchesTable.$inferSelect) {
  let teamName: string | null = null;
  if (match.teamId) {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, match.teamId));
    if (team) teamName = team.name;
  }
  return { ...match, teamName, competition: match.competition ?? null, location: match.location ?? null, result: match.result ?? null, notes: match.notes ?? null, preMatchNotes: match.preMatchNotes ?? null, postMatchNotes: match.postMatchNotes ?? null };
}

const SCHEDULE_ROLES = ["secretary", "director", "admin"];
const POST_NOTES_ROLES = ["coach", "fitness_coach", "athletic_director", "technical_director"];

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
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const role = req.session.role ?? "";
  const { opponent, date, teamId, competition, location, homeAway, result, notes, preMatchNotes, postMatchNotes } = req.body;
  const updates: Record<string, unknown> = {};

  const scheduleFields = [date, req.body.isPostponed, req.body.rescheduleDate, req.body.rescheduleTbd, preMatchNotes];
  const postNotesFields = [postMatchNotes];
  const wantsScheduleEdit = scheduleFields.some(f => f !== undefined);
  const wantsPostNotesEdit = postNotesFields.some(f => f !== undefined);

  if (wantsScheduleEdit && !SCHEDULE_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare data, orario o note pre-partita" }); return;
  }
  if (wantsPostNotesEdit && !POST_NOTES_ROLES.includes(role)) {
    res.status(403).json({ error: "Non autorizzato a modificare le note post-partita" }); return;
  }

  if (opponent !== undefined && SCHEDULE_ROLES.includes(role)) updates.opponent = opponent;
  if (date !== undefined) updates.date = new Date(date);
  if (teamId !== undefined) updates.teamId = teamId;
  if (competition !== undefined && SCHEDULE_ROLES.includes(role)) updates.competition = competition;
  if (location !== undefined && SCHEDULE_ROLES.includes(role)) updates.location = location;
  if (homeAway !== undefined && SCHEDULE_ROLES.includes(role)) updates.homeAway = homeAway;
  if (result !== undefined) updates.result = result;
  if (notes !== undefined) updates.notes = notes;
  if (preMatchNotes !== undefined) updates.preMatchNotes = preMatchNotes;
  if (postMatchNotes !== undefined) updates.postMatchNotes = postMatchNotes;
  if (req.body.isPostponed !== undefined) updates.isPostponed = req.body.isPostponed;
  if (req.body.rescheduleDate !== undefined) updates.rescheduleDate = req.body.rescheduleDate ? new Date(req.body.rescheduleDate) : null;
  if (req.body.rescheduleTbd !== undefined) updates.rescheduleTbd = req.body.rescheduleTbd;

  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nessun campo da aggiornare" }); return; }

  const [match] = await db.update(matchesTable).set(updates)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, req.session.clubId!))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  const enriched = await enrichMatch(match);
  res.json(enriched);
});

router.delete("/matches/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [match] = await db.delete(matchesTable)
    .where(and(eq(matchesTable.id, id), eq(matchesTable.clubId, req.session.clubId!))).returning();
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  res.sendStatus(204);
});

router.get("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const callups = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, matchId));
  const enriched = await Promise.all(callups.map(async (cu) => {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, cu.playerId));
    return { ...cu, playerName: player ? `${player.firstName} ${player.lastName}` : null };
  }));
  res.json(enriched);
});

router.post("/matches/:id/callups", requireAuth, async (req, res): Promise<void> => {
  const matchId = parseInt(req.params.id);
  if (isNaN(matchId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { playerId, status } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const [cu] = await db.insert(callUpsTable).values({ matchId, playerId: Number(playerId), status: status ?? "pending" }).returning();
  res.status(201).json(cu);
});

router.patch("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status } = req.body;
  const [cu] = await db.update(callUpsTable).set({ status }).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.json(cu);
});

router.delete("/callups/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [cu] = await db.delete(callUpsTable).where(eq(callUpsTable.id, id)).returning();
  if (!cu) { res.status(404).json({ error: "Call-up not found" }); return; }
  res.sendStatus(204);
});

export default router;
