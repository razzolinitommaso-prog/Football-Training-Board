import { Router, type IRouter } from "express";
import {
  db, clubsTable, playersTable, teamsTable,
  trainingSessionsTable, matchesTable, callUpsTable,
  playerPaymentsTable, playerDocumentsTable,
  platformAnnouncementsTable,
} from "@workspace/db";
import { eq, and, gte, asc, desc } from "drizzle-orm";

const router: IRouter = Router();

function requireParentSession(req: any, res: any, next: any) {
  if (req.session.role !== "parent" || !req.session.clubId) {
    res.status(403).json({ error: "Parent session required" });
    return;
  }
  next();
}

function requireAdminSession(req: any, res: any, next: any) {
  if (!req.session.userId || !["admin", "presidente"].includes(req.session.role)) {
    res.status(403).json({ error: "Admin required" });
    return;
  }
  next();
}

router.get("/parent/children", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const now = new Date();

  const teams = await db.select().from(teamsTable).where(eq(teamsTable.clubId, clubId)).orderBy(asc(teamsTable.name));

  const enriched = await Promise.all(teams.map(async (team) => {
    const players = await db.select().from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), eq(playersTable.teamId, team.id)))
      .orderBy(asc(playersTable.lastName));

    const nextTraining = await db.select().from(trainingSessionsTable)
      .where(and(eq(trainingSessionsTable.teamId, team.id), gte(trainingSessionsTable.scheduledAt, now)))
      .orderBy(asc(trainingSessionsTable.scheduledAt)).limit(1);

    const nextMatch = await db.select().from(matchesTable)
      .where(and(eq(matchesTable.teamId, team.id), gte(matchesTable.date, now)))
      .orderBy(asc(matchesTable.date)).limit(1);

    return { ...team, players, nextTraining: nextTraining[0] ?? null, nextMatch: nextMatch[0] ?? null };
  }));

  res.json(enriched);
});

router.get("/parent/training", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const now = new Date();

  const sessions = await db.select().from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.clubId, clubId), gte(trainingSessionsTable.scheduledAt, now)))
    .orderBy(asc(trainingSessionsTable.scheduledAt)).limit(30);

  const enriched = await Promise.all(sessions.map(async (s) => {
    let teamName = null;
    if (s.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, s.teamId));
      teamName = team?.name ?? null;
    }
    return { ...s, teamName };
  }));

  res.json(enriched);
});

router.get("/parent/matches", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;

  const matches = await db.select().from(matchesTable)
    .where(eq(matchesTable.clubId, clubId))
    .orderBy(asc(matchesTable.date)).limit(50);

  const enriched = await Promise.all(matches.map(async (match) => {
    let teamName = null;
    if (match.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, match.teamId));
      teamName = team?.name ?? null;
    }
    const callUps = await db.select().from(callUpsTable).where(eq(callUpsTable.matchId, match.id));
    const callUpsWithNames = await Promise.all(callUps.map(async (cu) => {
      const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName })
        .from(playersTable).where(eq(playersTable.id, cu.playerId));
      return { ...cu, playerName: player ? `${player.firstName} ${player.lastName}` : `#${cu.playerId}` };
    }));
    return { ...match, teamName, callUps: callUpsWithNames };
  }));

  res.json(enriched);
});

router.patch("/parent/availability/:matchId/:playerId", requireParentSession, async (req, res): Promise<void> => {
  const matchId = parseInt(req.params.matchId);
  const playerId = parseInt(req.params.playerId);
  const { status } = req.body as { status: string };
  const clubId = req.session.clubId!;

  if (!["available", "unavailable", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }

  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)));
  if (!player) { res.status(403).json({ error: "Player not in your club" }); return; }

  const [existing] = await db.select().from(callUpsTable)
    .where(and(eq(callUpsTable.matchId, matchId), eq(callUpsTable.playerId, playerId)));

  if (existing) {
    const [updated] = await db.update(callUpsTable).set({ status })
      .where(and(eq(callUpsTable.matchId, matchId), eq(callUpsTable.playerId, playerId))).returning();
    res.json(updated);
  } else {
    const [created] = await db.insert(callUpsTable).values({ matchId, playerId, status }).returning();
    res.json(created);
  }
});

router.get("/parent/payments", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;

  const payments = await db.select().from(playerPaymentsTable)
    .where(eq(playerPaymentsTable.clubId, clubId))
    .orderBy(desc(playerPaymentsTable.createdAt));

  const enriched = await Promise.all(payments.map(async (p) => {
    const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId })
      .from(playersTable).where(eq(playersTable.id, p.playerId));
    let teamName = null;
    if (player?.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, player.teamId));
      teamName = team?.name ?? null;
    }
    return { ...p, playerName: player ? `${player.firstName} ${player.lastName}` : `#${p.playerId}`, teamName };
  }));

  res.json(enriched);
});

router.get("/parent/documents", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;

  const docs = await db.select().from(playerDocumentsTable)
    .where(eq(playerDocumentsTable.clubId, clubId));

  const enriched = await Promise.all(docs.map(async (d) => {
    const [player] = await db.select({ firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId })
      .from(playersTable).where(eq(playersTable.id, d.playerId));
    let teamName = null;
    if (player?.teamId) {
      const [team] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, player.teamId));
      teamName = team?.name ?? null;
    }
    return { ...d, playerName: player ? `${player.firstName} ${player.lastName}` : `#${d.playerId}`, teamName };
  }));

  res.json(enriched);
});

router.get("/parent/communications", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;

  const [clubAnnouncements, globalAnnouncements] = await Promise.all([
    db.select().from(platformAnnouncementsTable).where(eq(platformAnnouncementsTable.targetClubId, clubId)).orderBy(desc(platformAnnouncementsTable.sentAt)).limit(20),
    db.select().from(platformAnnouncementsTable).where(eq(platformAnnouncementsTable.targetClubId, null as any)).orderBy(desc(platformAnnouncementsTable.sentAt)).limit(10),
  ]);

  const combined = [...clubAnnouncements, ...globalAnnouncements].sort((a, b) => new Date(b.sentAt ?? b.createdAt ?? 0).getTime() - new Date(a.sentAt ?? a.createdAt ?? 0).getTime()).slice(0, 30);

  res.json(combined);
});

router.get("/parent/team/:teamId", requireParentSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const teamId = parseInt(req.params.teamId);

  const [team] = await db.select().from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)));
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }

  const players = await db.select().from(playersTable)
    .where(and(eq(playersTable.teamId, teamId), eq(playersTable.clubId, clubId)))
    .orderBy(asc(playersTable.lastName));

  const upcomingTraining = await db.select().from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.teamId, teamId), gte(trainingSessionsTable.scheduledAt, new Date())))
    .orderBy(asc(trainingSessionsTable.scheduledAt)).limit(5);

  const upcomingMatches = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.teamId, teamId), gte(matchesTable.date, new Date())))
    .orderBy(asc(matchesTable.date)).limit(5);

  res.json({ ...team, players, upcomingTraining, upcomingMatches });
});

router.get("/admin/parent-code", requireAdminSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const [club] = await db.select({ accessCode: clubsTable.accessCode, parentCode: clubsTable.parentCode, name: clubsTable.name })
    .from(clubsTable).where(eq(clubsTable.id, clubId));
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  res.json(club);
});

router.post("/admin/parent-code/regenerate", requireAdminSession, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  const newCode = Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const [updated] = await db.update(clubsTable).set({ parentCode: newCode }).where(eq(clubsTable.id, clubId)).returning({ parentCode: clubsTable.parentCode });
  res.json(updated);
});

export default router;
