import { Router, type IRouter } from "express";
import { db, registrationsTable, playerPaymentsTable, playerDocumentsTable, equipmentAssignmentsTable, playersTable, platformAnnouncementsTable, trainingSessionsTable, matchesTable, teamsTable, clubNotificationsTable, clubNotificationReadsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, asc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function withPlayerName<T extends { playerId: number }>(records: T[]) {
  return Promise.all(records.map(async (r) => {
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, r.playerId));
    return { ...r, playerName: player ? `${player.firstName} ${player.lastName}` : null };
  }));
}

async function getSectionPlayerIds(clubId: number, section: string): Promise<number[]> {
  const rows = await db.select({ id: playersTable.id }).from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), eq(playersTable.clubSection, section)));
  return rows.map(r => r.id);
}

router.get("/registrations", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(registrationsTable.clubId, clubId);
  if (req.session.section) {
    const ids = await getSectionPlayerIds(clubId, req.session.section);
    where = ids.length > 0
      ? and(eq(registrationsTable.clubId, clubId), inArray(registrationsTable.playerId, ids))
      : and(eq(registrationsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(registrationsTable).where(where).orderBy(desc(registrationsTable.createdAt));
  res.json(await withPlayerName(records));
});

router.post("/registrations", requireAuth, async (req, res): Promise<void> => {
  const { playerId, seasonId, status, registrationDate, notes } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const [record] = await db.insert(registrationsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), seasonId: seasonId ?? null,
    status: status ?? "pending", registrationDate: registrationDate ?? null, notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/registrations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, registrationDate, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (registrationDate !== undefined) updates.registrationDate = registrationDate;
  if (notes !== undefined) updates.notes = notes;
  const [record] = await db.update(registrationsTable).set(updates)
    .where(and(eq(registrationsTable.id, id), eq(registrationsTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.delete("/registrations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(registrationsTable).where(and(eq(registrationsTable.id, id), eq(registrationsTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

router.get("/player-payments", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(playerPaymentsTable.clubId, clubId);
  if (req.session.section) {
    const ids = await getSectionPlayerIds(clubId, req.session.section);
    where = ids.length > 0
      ? and(eq(playerPaymentsTable.clubId, clubId), inArray(playerPaymentsTable.playerId, ids))
      : and(eq(playerPaymentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(playerPaymentsTable).where(where).orderBy(desc(playerPaymentsTable.createdAt));
  res.json(await withPlayerName(records));
});

router.post("/player-payments", requireAuth, async (req, res): Promise<void> => {
  const { playerId, amount, dueDate, status, description } = req.body;
  if (!playerId || amount == null) { res.status(400).json({ error: "playerId and amount required" }); return; }
  const [record] = await db.insert(playerPaymentsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), amount: Number(amount),
    dueDate: dueDate ?? null, status: status ?? "pending", description: description ?? null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/player-payments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, paymentDate, amount, description } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (amount !== undefined) updates.amount = Number(amount);
  if (description !== undefined) updates.description = description;
  const [record] = await db.update(playerPaymentsTable).set(updates)
    .where(and(eq(playerPaymentsTable.id, id), eq(playerPaymentsTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.delete("/player-payments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(playerPaymentsTable).where(and(eq(playerPaymentsTable.id, id), eq(playerPaymentsTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

router.get("/player-documents", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(playerDocumentsTable.clubId, clubId);
  if (req.session.section) {
    const ids = await getSectionPlayerIds(clubId, req.session.section);
    where = ids.length > 0
      ? and(eq(playerDocumentsTable.clubId, clubId), inArray(playerDocumentsTable.playerId, ids))
      : and(eq(playerDocumentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(playerDocumentsTable).where(where).orderBy(desc(playerDocumentsTable.createdAt));
  res.json(await withPlayerName(records));
});

router.post("/player-documents", requireAuth, async (req, res): Promise<void> => {
  const { playerId, type, expiryDate, notes } = req.body;
  if (!playerId || !type) { res.status(400).json({ error: "playerId and type required" }); return; }
  const [record] = await db.insert(playerDocumentsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), type,
    expiryDate: expiryDate ?? null, notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});

router.delete("/player-documents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(playerDocumentsTable).where(and(eq(playerDocumentsTable.id, id), eq(playerDocumentsTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

router.get("/equipment", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(equipmentAssignmentsTable.clubId, clubId);
  if (req.session.section) {
    const ids = await getSectionPlayerIds(clubId, req.session.section);
    where = ids.length > 0
      ? and(eq(equipmentAssignmentsTable.clubId, clubId), inArray(equipmentAssignmentsTable.playerId, ids))
      : and(eq(equipmentAssignmentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(equipmentAssignmentsTable).where(where);
  res.json(await withPlayerName(records));
});

router.post("/equipment", requireAuth, async (req, res): Promise<void> => {
  const { playerId, kitAssigned, trainingKit, matchKit, notes } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const existing = await db.select().from(equipmentAssignmentsTable)
    .where(and(eq(equipmentAssignmentsTable.playerId, Number(playerId)), eq(equipmentAssignmentsTable.clubId, req.session.clubId!)));
  if (existing.length > 0) {
    const [updated] = await db.update(equipmentAssignmentsTable)
      .set({ kitAssigned: kitAssigned ?? null, trainingKit: trainingKit ?? null, matchKit: matchKit ?? null, notes: notes ?? null })
      .where(eq(equipmentAssignmentsTable.id, existing[0].id)).returning();
    res.json(updated);
    return;
  }
  const [record] = await db.insert(equipmentAssignmentsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), kitAssigned: kitAssigned ?? null,
    trainingKit: trainingKit ?? null, matchKit: matchKit ?? null, notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});


const secretaryOrAdmin = ["admin", "presidente", "secretary", "director", "technical_director"];

router.get("/secretary/parent-comms", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const records = await db.select().from(platformAnnouncementsTable)
    .where(eq(platformAnnouncementsTable.targetClubId, req.session.clubId!))
    .orderBy(desc(platformAnnouncementsTable.sentAt));
  res.json(records);
});

router.post("/secretary/parent-comms", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const { title, message, type } = req.body as { title?: string; message?: string; type?: string };
  if (!title || !message) { res.status(400).json({ error: "Titolo e messaggio obbligatori" }); return; }
  const [record] = await db.insert(platformAnnouncementsTable).values({
    title, message, type: type ?? "info", source: "secretary", targetClubId: req.session.clubId!,
  }).returning();
  res.status(201).json(record);
});

router.delete("/secretary/parent-comms/:id", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = parseInt(req.params.id);
  await db.delete(platformAnnouncementsTable)
    .where(and(eq(platformAnnouncementsTable.id, id), eq(platformAnnouncementsTable.targetClubId!, req.session.clubId!)));
  res.json({ success: true });
});

router.get("/secretary/weekly-schedule", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const { from, to } = req.query as { from?: string; to?: string };
  const clubId = req.session.clubId!;
  const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0); return d; })();
  const toDate = to ? new Date(to) : (() => { const d = new Date(fromDate); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d; })();

  const sessions = await db.select().from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.clubId, clubId), gte(trainingSessionsTable.scheduledAt, fromDate), lte(trainingSessionsTable.scheduledAt, toDate)))
    .orderBy(asc(trainingSessionsTable.scheduledAt));

  const matches = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.clubId, clubId), gte(matchesTable.date, fromDate), lte(matchesTable.date, toDate)))
    .orderBy(asc(matchesTable.date));

  const sessionsEnriched = await Promise.all(sessions.map(async (s) => {
    let teamName = null;
    if (s.teamId) { const [t] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, s.teamId)); teamName = t?.name ?? null; }
    return { ...s, teamName, kind: "training" };
  }));

  const matchesEnriched = await Promise.all(matches.map(async (m) => {
    let teamName = null;
    if (m.teamId) { const [t] = await db.select({ name: teamsTable.name }).from(teamsTable).where(eq(teamsTable.id, m.teamId)); teamName = t?.name ?? null; }
    return { ...m, teamName, kind: "match" };
  }));

  res.json({ sessions: sessionsEnriched, matches: matchesEnriched, from: fromDate, to: toDate });
});

const clubRoles = ["admin", "secretary", "director", "technical_director", "coach", "fitness_coach", "athletic_director"];

router.get("/club/platform-announcements", requireAuth, async (req, res): Promise<void> => {
  if (!clubRoles.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const records = await db
    .select()
    .from(platformAnnouncementsTable)
    .where(and(
      eq(platformAnnouncementsTable.targetClubId, req.session.clubId!),
      eq(platformAnnouncementsTable.source, "platform"),
    ))
    .orderBy(desc(platformAnnouncementsTable.sentAt));
  res.json(records);
});

router.patch("/club/platform-announcements/:id/read", requireAuth, async (req, res): Promise<void> => {
  if (!clubRoles.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = parseInt(req.params.id);
  await db
    .update(platformAnnouncementsTable)
    .set({ isRead: true })
    .where(and(
      eq(platformAnnouncementsTable.id, id),
      eq(platformAnnouncementsTable.targetClubId, req.session.clubId!),
    ));
  res.json({ success: true });
});

// --- Club Internal Notifications ---

// GET /club/notifications — list notifications for current club with read status
router.get("/club/notifications", requireAuth, async (req, res) => {
  const clubId = req.session.clubId!;
  const userId = req.session.userId!;
  const notifications = await db
    .select()
    .from(clubNotificationsTable)
    .where(eq(clubNotificationsTable.clubId, clubId))
    .orderBy(desc(clubNotificationsTable.createdAt));

  const reads = await db
    .select()
    .from(clubNotificationReadsTable)
    .where(eq(clubNotificationReadsTable.userId, userId));

  const readSet = new Set(reads.map((r) => r.notificationId));

  const result = notifications.map((n) => ({
    ...n,
    isRead: readSet.has(n.id),
  }));
  res.json(result);
});

// POST /club/notifications — create a notification (admin/secretary only)
router.post("/club/notifications", requireAuth, async (req, res) => {
  const role = req.session.role;
  if (!["admin", "presidente", "secretary"].includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { title, message, type } = req.body;
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }
  const [notification] = await db
    .insert(clubNotificationsTable)
    .values({
      clubId: req.session.clubId!,
      title: String(title),
      message: String(message),
      type: String(type || "info"),
    })
    .returning();
  res.status(201).json(notification);
});

// PATCH /club/notifications/:id/read — mark a notification as read for the current user
router.patch("/club/notifications/:id/read", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.session.userId!;
  const existing = await db
    .select()
    .from(clubNotificationReadsTable)
    .where(
      and(
        eq(clubNotificationReadsTable.notificationId, id),
        eq(clubNotificationReadsTable.userId, userId)
      )
    );
  if (existing.length === 0) {
    await db
      .insert(clubNotificationReadsTable)
      .values({ notificationId: id, userId });
  }
  res.json({ success: true });
});

export default router;
