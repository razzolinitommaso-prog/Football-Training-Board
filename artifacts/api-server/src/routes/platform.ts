import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, clubsTable, clubMembershipsTable, playersTable, teamsTable, platformAnnouncementsTable, subscriptionsTable, billingPaymentsTable } from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/auth";

function planLimits(plan: string) {
  switch (plan) {
    case "advanced":  return { maxTeams: 5,  maxPlayers: 100 };
    case "semi-pro":  return { maxTeams: 10, maxPlayers: 200 };
    case "pro":       return { maxTeams: 99, maxPlayers: 999 };
    default:          return { maxTeams: 3,  maxPlayers: 50  };
  }
}

const router: IRouter = Router();

router.get("/platform/stats", requireSuperAdmin, async (req, res): Promise<void> => {
  const [{ totalClubs }] = await db.select({ totalClubs: count() }).from(clubsTable);
  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable).where(eq(usersTable.isSuperAdmin, false));
  const [{ totalPlayers }] = await db.select({ totalPlayers: count() }).from(playersTable);
  const [{ totalTeams }] = await db.select({ totalTeams: count() }).from(teamsTable);

  const recentClubs = await db
    .select({ id: clubsTable.id, name: clubsTable.name, createdAt: clubsTable.createdAt })
    .from(clubsTable)
    .orderBy(desc(clubsTable.createdAt))
    .limit(5);

  res.json({ totalClubs, totalUsers, totalPlayers, totalTeams, recentClubs });
});

router.get("/platform/clubs", requireSuperAdmin, async (req, res): Promise<void> => {
  const clubs = await db.select().from(clubsTable).orderBy(desc(clubsTable.createdAt));

  const enriched = await Promise.all(clubs.map(async (club) => {
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(clubMembershipsTable)
      .where(eq(clubMembershipsTable.clubId, club.id));

    const [{ playerCount }] = await db
      .select({ playerCount: count() })
      .from(playersTable)
      .where(eq(playersTable.clubId, club.id));

    const [{ teamCount }] = await db
      .select({ teamCount: count() })
      .from(teamsTable)
      .where(eq(teamsTable.clubId, club.id));

    const [subscription] = await db
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.clubId, club.id))
      .limit(1);

    const payments = await db
      .select()
      .from(billingPaymentsTable)
      .where(eq(billingPaymentsTable.clubId, club.id))
      .orderBy(desc(billingPaymentsTable.createdAt))
      .limit(3);

    return {
      ...club,
      memberCount,
      playerCount,
      teamCount,
      subscription: subscription ?? null,
      recentPayments: payments,
    };
  }));

  res.json(enriched);
});

router.post("/platform/clubs", requireSuperAdmin, async (req, res): Promise<void> => {
  const b = req.body as Record<string, string | number | undefined>;
  const s = (k: string) => b[k] ? String(b[k]) : null;

  if (!b.name) { res.status(400).json({ error: "Il nome della società è obbligatorio" }); return; }

  // Admin user (optional)
  const adminEmail = s("adminEmail");
  const adminPassword = s("adminPassword");
  const adminFirstName = s("adminFirstName") ?? "Admin";
  const adminLastName = s("adminLastName") ?? "User";

  if (adminEmail) {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));
    if (existing) { res.status(409).json({ error: "Email admin già in uso" }); return; }
  }

  const plan = s("planName") ?? "standard";
  const limits = planLimits(plan);
  const today = new Date().toISOString().slice(0, 10);
  const accessCode = String(Math.floor(1000 + Math.random() * 9000));
  const parentCode = Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();

  const [club] = await db.insert(clubsTable).values({
    name: String(b.name),
    legalName: s("legalName"), city: s("city"), country: s("country"),
    foundedYear: b.foundedYear ? Number(b.foundedYear) : null,
    description: s("description"), accessCode, parentCode,
    vatNumber: s("vatNumber"), fiscalCode: s("fiscalCode"),
    sdiCode: s("sdiCode"), pec: s("pec"),
    phone: s("phone"), email: s("email"), website: s("website"),
    legalAddress: s("legalAddress"), legalCity: s("legalCity"),
    legalZip: s("legalZip"), legalProvince: s("legalProvince"),
    operationalAddress: s("operationalAddress"), operationalCity: s("operationalCity"),
    operationalZip: s("operationalZip"), operationalProvince: s("operationalProvince"),
    contactName: s("contactName"), contactPhone: s("contactPhone"), contactEmail: s("contactEmail"),
  }).returning();

  await db.insert(subscriptionsTable).values({
    clubId: club.id, planName: plan, status: "active", startDate: today,
    paymentMethod: s("paymentMethod"),
    maxTeams: limits.maxTeams, maxPlayers: limits.maxPlayers,
  });

  let adminUser = null;
  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const [user] = await db.insert(usersTable)
      .values({ email: adminEmail, passwordHash, firstName: adminFirstName, lastName: adminLastName })
      .returning();
    await db.insert(clubMembershipsTable).values({ userId: user.id, clubId: club.id, role: "admin" });
    adminUser = { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  res.status(201).json({
    ...club, memberCount: adminUser ? 1 : 0, playerCount: 0, teamCount: 0,
    subscription: { planName: plan, status: "active", endDate: null },
    recentPayments: [], adminUser,
  });
});

router.patch("/platform/clubs/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id);
  if (isNaN(clubId)) { res.status(400).json({ error: "Invalid club ID" }); return; }

  const body = req.body as Record<string, string | number | undefined>;
  const updates: Record<string, string | number | null> = {};

  const fields = [
    "name", "legalName", "city", "country", "description", "foundedYear",
    "vatNumber", "fiscalCode", "sdiCode", "pec",
    "phone", "email", "website",
    "legalAddress", "legalCity", "legalZip", "legalProvince",
    "operationalAddress", "operationalCity", "operationalZip", "operationalProvince",
    "contactName", "contactPhone", "contactEmail",
  ];
  for (const f of fields) {
    if (f in body) {
      updates[f as keyof typeof updates] = body[f] != null && body[f] !== "" ? (f === "foundedYear" ? Number(body[f]) : String(body[f])) : null;
    }
  }

  const [updated] = await db.update(clubsTable).set(updates as any).where(eq(clubsTable.id, clubId)).returning();
  if (!updated) { res.status(404).json({ error: "Club not found" }); return; }
  res.json(updated);
});

router.delete("/platform/clubs/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.id);
  if (isNaN(clubId)) {
    res.status(400).json({ error: "Invalid club ID" });
    return;
  }

  const [deleted] = await db.delete(clubsTable).where(eq(clubsTable.id, clubId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Club not found" });
    return;
  }

  res.json({ message: "Club deleted", club: deleted });
});

router.get("/platform/announcements", requireSuperAdmin, async (req, res): Promise<void> => {
  const announcements = await db
    .select({
      id: platformAnnouncementsTable.id,
      title: platformAnnouncementsTable.title,
      message: platformAnnouncementsTable.message,
      type: platformAnnouncementsTable.type,
      targetClubId: platformAnnouncementsTable.targetClubId,
      isRead: platformAnnouncementsTable.isRead,
      sentAt: platformAnnouncementsTable.sentAt,
      clubName: clubsTable.name,
    })
    .from(platformAnnouncementsTable)
    .leftJoin(clubsTable, eq(platformAnnouncementsTable.targetClubId, clubsTable.id))
    .orderBy(desc(platformAnnouncementsTable.sentAt));

  res.json(announcements);
});

router.post("/platform/announcements", requireSuperAdmin, async (req, res): Promise<void> => {
  const { title, message, type, targetClubIds } = req.body as {
    title: string;
    message: string;
    type: string;
    targetClubIds: number[] | null;
  };

  if (!title || !message) {
    res.status(400).json({ error: "Title and message are required" });
    return;
  }

  if (!targetClubIds || targetClubIds.length === 0) {
    const allClubs = await db.select({ id: clubsTable.id }).from(clubsTable);
    const inserted = await db
      .insert(platformAnnouncementsTable)
      .values(allClubs.map((c) => ({
        title,
        message,
        type: type ?? "info",
        source: "platform",
        targetClubId: c.id,
      })))
      .returning();
    res.status(201).json(inserted);
  } else {
    const inserted = await db
      .insert(platformAnnouncementsTable)
      .values(targetClubIds.map((clubId) => ({
        title,
        message,
        type: type ?? "info",
        source: "platform",
        targetClubId: clubId,
      })))
      .returning();
    res.status(201).json(inserted);
  }
});

router.delete("/platform/announcements/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [deleted] = await db.delete(platformAnnouncementsTable).where(eq(platformAnnouncementsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  res.json({ message: "Deleted" });
});

router.get("/platform/announcements/club/:clubId", requireSuperAdmin, async (req, res): Promise<void> => {
  const clubId = parseInt(req.params.clubId);
  const items = await db
    .select()
    .from(platformAnnouncementsTable)
    .where(eq(platformAnnouncementsTable.targetClubId, clubId))
    .orderBy(desc(platformAnnouncementsTable.sentAt));
  res.json(items);
});

export default router;
