import { Router, type IRouter } from "express";
import { db, subscriptionsTable, billingPaymentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { getClubUsageAndLimits, limitsForPlan } from "../lib/plan-limits";

const router: IRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (!["admin", "presidente"].includes(req.session.role ?? "")) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

router.get("/billing/subscription", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.clubId, req.session.clubId!));
  if (!sub) { res.json(null); return; }

  const usage = await getClubUsageAndLimits(req.session.clubId!);

  res.json({
    ...sub,
    endDate: sub.endDate ?? null,
    maxTeams: usage.maxTeams,
    maxPlayers: usage.maxPlayers,
    currentTeams: usage.currentTeams,
    currentPlayers: usage.currentPlayers,
    teamsOverLimit: usage.currentTeams > usage.maxTeams,
    playersOverLimit: usage.currentPlayers > usage.maxPlayers,
  });
});

router.post("/billing/subscription", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { planName, startDate, endDate } = req.body;
  if (!planName || !startDate) { res.status(400).json({ error: "planName and startDate required" }); return; }

  const limits = limitsForPlan(planName);

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
