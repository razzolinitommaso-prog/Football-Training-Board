import { Router, type IRouter } from "express";
import { db, subscriptionsTable, billingPaymentsTable, teamsTable, playersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!["admin", "presidente"].includes(req.session.role)) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

router.get("/billing/subscription", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.clubId, req.session.clubId!));
  if (!sub) { res.json(null); return; }

  const [teamsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(teamsTable).where(eq(teamsTable.clubId, req.session.clubId!));
  const [playersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(playersTable).where(eq(playersTable.clubId, req.session.clubId!));

  res.json({
    ...sub,
    endDate: sub.endDate ?? null,
    currentTeams: teamsCount?.count ?? 0,
    currentPlayers: playersCount?.count ?? 0,
  });
});

router.post("/billing/subscription", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { planName, startDate, endDate } = req.body;
  if (!planName || !startDate) { res.status(400).json({ error: "planName and startDate required" }); return; }

  const planLimits: Record<string, { maxTeams: number; maxPlayers: number }> = {
    basic: { maxTeams: 3, maxPlayers: 50 },
    pro: { maxTeams: 10, maxPlayers: 200 },
    elite: { maxTeams: 99, maxPlayers: 9999 },
  };
  const limits = planLimits[planName] ?? planLimits.basic;

  const existing = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.clubId, req.session.clubId!));
  if (existing.length > 0) {
    const [updated] = await db.update(subscriptionsTable)
      .set({ planName, startDate, endDate: endDate ?? null, status: "active", ...limits })
      .where(eq(subscriptionsTable.clubId, req.session.clubId!)).returning();
    res.json(updated);
    return;
  }
  const [sub] = await db.insert(subscriptionsTable).values({
    clubId: req.session.clubId!, planName, startDate, endDate: endDate ?? null, status: "active", ...limits,
  }).returning();
  res.status(201).json(sub);
});

router.get("/billing/payments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const payments = await db.select().from(billingPaymentsTable)
    .where(eq(billingPaymentsTable.clubId, req.session.clubId!))
    .orderBy(desc(billingPaymentsTable.createdAt));
  res.json(payments);
});

router.post("/billing/payments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { amount, status, paymentDate, description } = req.body;
  if (amount == null) { res.status(400).json({ error: "amount required" }); return; }
  const [payment] = await db.insert(billingPaymentsTable).values({
    clubId: req.session.clubId!, amount: Number(amount), status: status ?? "pending",
    paymentDate: paymentDate ?? null, description: description ?? null,
  }).returning();
  res.status(201).json(payment);
});

export default router;
