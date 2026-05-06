import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, clubsTable, clubMembershipsTable, subscriptionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  RegisterUserBody,
  LoginUserBody,
  LoginUserResponse,
  GetCurrentUserResponse,
  LogoutUserResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";

const router: IRouter = Router();

function saveSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function planLimits(plan: string) {
  switch (plan) {
    case "advanced":  return { maxTeams: 5,  maxPlayers: 100 };
    case "semi-pro":  return { maxTeams: 10, maxPlayers: 200 };
    case "pro":       return { maxTeams: 99, maxPlayers: 999 };
    default:          return { maxTeams: 3,  maxPlayers: 50  }; // standard
  }
}

router.post("/auth/register", async (req, res): Promise<void> => {
  console.log("BODY:", req.body);
  const parsed = RegisterUserBody.safeParse(req.body);
  console.log("VALID:", parsed.success);
  if (!parsed.success) {
    console.log("ZOD ERROR:", parsed.error);
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    email, password, firstName, lastName,
    clubName, clubCity, clubCountry,
    legalName, foundedYear, description,
    vatNumber, fiscalCode, sdiCode, pec,
    phone, clubEmail, website,
    legalAddress, legalCity, legalZip, legalProvince,
    operationalAddress, operationalCity, operationalZip, operationalProvince,
    contactName, contactPhone, contactEmail,
    planName, paymentMethod,
  } = parsed.data;

  const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingUser.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const accessCode = String(Math.floor(1000 + Math.random() * 9000));
  const parentCode = Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const plan = planName ?? "standard";
  const limits = planLimits(plan);
  const today = new Date().toISOString().slice(0, 10);

  const [club] = await db
    .insert(clubsTable)
    .values({
      name: clubName,
      legalName: legalName ?? null,
      city: clubCity ?? null,
      country: clubCountry ?? null,
      foundedYear: foundedYear ?? null,
      description: description ?? null,
      accessCode,
      parentCode,
      vatNumber: vatNumber ?? null,
      fiscalCode: fiscalCode ?? null,
      sdiCode: sdiCode ?? null,
      pec: pec ?? null,
      phone: phone ?? null,
      email: clubEmail ?? null,
      website: website ?? null,
      legalAddress: legalAddress ?? null,
      legalCity: legalCity ?? null,
      legalZip: legalZip ?? null,
      legalProvince: legalProvince ?? null,
      operationalAddress: operationalAddress ?? null,
      operationalCity: operationalCity ?? null,
      operationalZip: operationalZip ?? null,
      operationalProvince: operationalProvince ?? null,
      contactName: contactName ?? null,
      contactPhone: contactPhone ?? null,
      contactEmail: contactEmail ?? null,
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, firstName, lastName })
    .returning();

  await db.insert(clubMembershipsTable).values({ userId: user.id, clubId: club.id, role: "admin" });

  await db.insert(subscriptionsTable).values({
    clubId: club.id,
    planName: plan,
    status: "active",
    startDate: today,
    paymentMethod: paymentMethod ?? null,
    maxTeams: limits.maxTeams,
    maxPlayers: limits.maxPlayers,
  });

  req.session.userId = user.id;
  req.session.clubId = club.id;
  req.session.role = "admin";
  await saveSession(req);

  const response = LoginUserResponse.parse({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
    },
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      country: club.country,
      logoUrl: null,
      foundedYear: null,
      description: null,
      createdAt: club.createdAt,
    },
    role: "admin",
  });

  res.status(201).json({ ...response, clubAccessCode: accessCode, clubParentCode: parentCode });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  try {
    const requestedAreaKeyFromBody =
      typeof (req.body as { area?: unknown })?.area === "string"
        ? ((req.body as { area?: string }).area ?? "").trim()
        : "";
    const requestedAreaKeyFromQuery =
      typeof (req.query as { area?: unknown })?.area === "string"
        ? String((req.query as { area?: string }).area ?? "").trim()
        : "";
    const requestedAreaKey = requestedAreaKeyFromBody || requestedAreaKeyFromQuery;
    const parsed = LoginUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { email, password, section } = parsed.data;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[LOGIN] email="${normalizedEmail}" section="${section ?? "none"}"`);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (!user) {
      console.log(`[LOGIN] FAIL - user not found for email="${normalizedEmail}"`);
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    let validPassword = false;
    try {
      validPassword = await bcrypt.compare(password, user.passwordHash);
    } catch {
      validPassword = false;
    }
    if (!validPassword) {
      validPassword = password === user.passwordHash;
    }
    if (!validPassword) {
      console.log(`[LOGIN] FAIL - wrong password for email="${normalizedEmail}"`);
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.isSuperAdmin) {
      req.session.userId = user.id;
      req.session.isSuperAdmin = true;
      await saveSession(req);
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt,
        },
        role: "superadmin",
        isSuperAdmin: true,
      });
      return;
    }

    const memberships = await db
      .select()
      .from(clubMembershipsTable)
      .where(eq(clubMembershipsTable.userId, user.id))
      .orderBy(desc(clubMembershipsTable.id));

    if (!memberships.length) {
      res.status(401).json({ error: "User has no club membership" });
      return;
    }

    const areaRoleMap: Record<string, string[]> = {
      admin: ["admin", "presidente"],
      director: ["director"],
      secretary: ["secretary"],
      technical: ["technical_director"],
      fitness: ["fitness_coach", "athletic_director"],
      coach: ["coach"],
      parent: ["parent"],
    };

    let membership = memberships[0];

    if (requestedAreaKey) {
      const allowedRoles = areaRoleMap[requestedAreaKey];
      if (allowedRoles) {
        const match = memberships.find((m) => allowedRoles.includes(m.role));
        if (!match) {
          res.status(403).json({ error: "Accesso negato per mancanza di permessi nell'area selezionata." });
          return;
        }
        membership = match;
      }
    } else if (memberships.length > 1) {
      const clubIds = new Set(memberships.map((m) => m.clubId));
      if (clubIds.size === 1) {
        const rolePriority = [
          "technical_director",
          "director",
          "admin",
          "presidente",
          "secretary",
          "coach",
          "fitness_coach",
          "athletic_director",
        ];
        for (const r of rolePriority) {
          const m = memberships.find((x) => x.role === r);
          if (m) {
            membership = m;
            break;
          }
        }
      }
    }

    // Section access control: admin and presidente bypass section filtering
    if (section && !["admin", "presidente"].includes(membership.role)) {
      const requestedSection = section.replace(/-/g, "_");
      const userSections: string[] = Array.isArray(membership.clubSection)
        ? membership.clubSection
        : [membership.clubSection ?? "scuola_calcio"];
      if (!userSections.includes(requestedSection)) {
        const sectionLabels: Record<string, string> = {
          scuola_calcio: "Scuola Calcio",
          settore_giovanile: "Settore Giovanile",
          prima_squadra: "Prima Squadra",
        };
        const userSectionNames = userSections.map((s) => sectionLabels[s] ?? s).join(", ");
        res.status(403).json({
          error: `Non hai accesso alla sezione "${sectionLabels[requestedSection] ?? section}". Le tue sezioni sono: ${userSectionNames}.`,
        });
        return;
      }
    }

    const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, membership.clubId));
    if (!club) {
      res.status(401).json({ error: "Club not found for user" });
      return;
    }

    req.session.userId = user.id;
    req.session.clubId = membership.clubId;
    req.session.role = normalizeSessionRole(membership.role);
    delete req.session.section;
    if (!["admin", "presidente"].includes(membership.role) && section) {
      req.session.section = section.replace(/-/g, "_");
    }
    await saveSession(req);

    const response = LoginUserResponse.parse({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
      },
      club: {
        id: club.id,
        name: club.name,
        city: club.city,
        country: club.country,
        logoUrl: club.logoUrl,
        foundedYear: club.foundedYear,
        description: club.description,
        createdAt: club.createdAt,
      },
      role: normalizeSessionRole(membership.role),
    });

    res.json(response);
    return;
  } catch (error) {
    console.error("[LOGIN] Unexpected error:", error);
    res.status(500).json({ error: "Unexpected error" });
    return;
  }
});

router.post("/auth/parent-login", async (req, res): Promise<void> => {
  const { clubCode, parentCode } = req.body as { clubCode?: string; parentCode?: string };

  if (!clubCode || !parentCode) {
    res.status(400).json({ error: "Codice club e codice genitori richiesti" });
    return;
  }

  const [club] = await db.select().from(clubsTable).where(eq(clubsTable.accessCode, clubCode.trim()));
  if (!club) {
    res.status(401).json({ error: "Codice club non valido" });
    return;
  }

  if (!club.parentCode || club.parentCode !== parentCode.trim().toUpperCase()) {
    res.status(401).json({ error: "Codice genitori non valido" });
    return;
  }

  req.session.userId = 0;
  req.session.clubId = club.id;
  req.session.role = "parent";
  await saveSession(req);

  res.json({
    user: { id: 0, email: `genitori@club.ftb`, firstName: "Area", lastName: "Genitori", createdAt: club.createdAt },
    club: { id: club.id, name: club.name, city: club.city, country: club.country, logoUrl: null, foundedYear: null, description: null, createdAt: club.createdAt },
    role: "parent",
  });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    res.clearCookie("connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.json(LogoutUserResponse.parse({ message: "Logged out" }));
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId && req.session.userId !== 0) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (req.session.role === "parent") {
    const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, req.session.clubId!));
    if (!club) { res.status(401).json({ error: "Not authenticated" }); return; }
    res.json({
      user: { id: 0, email: "genitori@club.ftb", firstName: "Area", lastName: "Genitori", createdAt: club.createdAt },
      club: { id: club.id, name: club.name, city: club.city, country: club.country, logoUrl: club.logoUrl, foundedYear: club.foundedYear, description: club.description, createdAt: club.createdAt },
      role: "parent",
    });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (req.session.isSuperAdmin) {
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt,
      },
      role: "superadmin",
      isSuperAdmin: true,
    });
    return;
  }

  const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, req.session.clubId!));
  if (!club) {
    res.status(404).json({ error: "Club not found" });
    return;
  }

  const response = GetCurrentUserResponse.parse({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
    },
    club: {
      id: club.id,
      name: club.name,
      city: club.city,
      country: club.country,
      logoUrl: club.logoUrl,
      foundedYear: club.foundedYear,
      description: club.description,
      createdAt: club.createdAt,
    },
    role: normalizeSessionRole(req.session.role!),
  });

  res.json({ ...response, section: req.session.section ?? null });
});

export default router;
