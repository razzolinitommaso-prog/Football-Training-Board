import { Router, type IRouter, type Request, type Response, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, clubsTable, clubMembershipsTable, seasonsTable, subscriptionsTable, playerParentDelegatesTable } from "@workspace/db";
import { activateAccount, activationContact, activations, ensureAccountActivations, findActivation, pendingStaffClubIds, validAccountPassword } from "../lib/account-activation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  RegisterUserBody,
  LoginUserBody,
  LoginUserResponse,
  GetCurrentUserResponse,
  LogoutUserResponse,
  normalizeParentAccessCode,
  validateParentAccessCode,
} from "@workspace/api-zod";
import { createAuthToken, requireAuth } from "../lib/auth";
import { ensureParentDelegateSecurityColumns, parentFamilyChildren } from "../lib/parent-delegate-access";
import { normalizeSessionRole } from "../lib/club-scope";
import { limitsForPlan } from "../lib/plan-limits";
import { normalizeSeasonName } from "../lib/season-defaults";

const router: IRouter = Router();

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
}
function saveSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function sessionAuthToken(req: any): string {
  return createAuthToken({
    userId: Number(req.session.userId),
    clubId: req.session.clubId,
    role: req.session.role,
    section: req.session.section ?? null,
    isSuperAdmin: req.session.isSuperAdmin === true,
  });
}

function membershipSections(membership: { clubSection?: string[] | string | null } | null | undefined): string[] {
  if (!membership) return [];
  if (Array.isArray(membership.clubSection)) {
    return membership.clubSection.filter((section): section is string => typeof section === "string" && section.trim().length > 0);
  }
  return typeof membership.clubSection === "string" && membership.clubSection.trim()
    ? [membership.clubSection.trim()]
    : [];
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[REGISTER] validation error:", parsed.error);
    }
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
  const limits = limitsForPlan(plan);
  const today = new Date().toISOString().slice(0, 10);
  const initialSeason = normalizeSeasonName((req.body as { initialSeasonName?: string }).initialSeasonName);

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

  await db.insert(seasonsTable).values({
    clubId: club.id,
    name: initialSeason.name,
    startDate: initialSeason.startDate,
    endDate: initialSeason.endDate,
    isActive: true,
    isArchived: false,
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

  res.status(201).json({ ...response, clubAccessCode: accessCode, clubParentCode: parentCode, authToken: sessionAuthToken(req) });
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

    const { email, password, section, clubId } = parsed.data;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Historical member records can contain uppercase letters. Match the email
    // case-insensitively without changing passwords, memberships or saved records.
    const emailUsers = await db.select().from(usersTable).where(eq(sql`lower(${usersTable.email})`, normalizedEmail));
    // Preserve the previously selected canonical account if legacy case-only
    // duplicates exist; never choose an arbitrary non-canonical duplicate.
    const user = emailUsers.find(candidate => candidate.email === normalizedEmail)
      ?? (emailUsers.length === 1 ? emailUsers[0] : undefined);
    if (!user) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[LOGIN] user not found");
      }
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
      if (process.env.NODE_ENV !== "production") {
        console.warn("[LOGIN] wrong password");
      }
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (user.isSuperAdmin) {
      await regenerateSession(req);
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
        authToken: sessionAuthToken(req),
      });
      return;
    }

    const requestedClubId =
      typeof clubId === "number" && Number.isInteger(clubId) && clubId > 0
        ? clubId
        : undefined;

    let memberships = await db
      .select()
      .from(clubMembershipsTable)
      .where(
        requestedClubId
          ? and(eq(clubMembershipsTable.userId, user.id), eq(clubMembershipsTable.clubId, requestedClubId))
          : eq(clubMembershipsTable.userId, user.id)
      )
      .orderBy(desc(clubMembershipsTable.id));

    const pendingClubs = await pendingStaffClubIds(user.id, memberships.map(item => item.clubId));
    if (pendingClubs.length) {
      memberships = memberships.filter(item => !pendingClubs.includes(item.clubId));
      if (!memberships.length) {
        res.status(403).json({ error: "Attiva l’accesso tramite l’invito ricevuto dalla società." });
        return;
      }
    }
    if (!memberships.length) {
      res.status(401).json({ error: "Utente o password non validi per questa società." });
      return;
    }

    const areaRoleMap: Record<string, string[]> = {
      admin: ["admin", "presidente"],
      director: ["director"],
      sporting: ["sporting_director"],
      secretary: ["secretary"],
      technical: ["technical_director"],
      fitness: ["fitness_coach", "athletic_director"],
      coach: ["coach"],
      parent: ["parent"],
      manager: ["team_manager"],
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
          "sporting_director",
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

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.clubId = membership.clubId;
    req.session.role = normalizeSessionRole(membership.role);
    delete req.session.section;
    if (!["admin", "presidente"].includes(membership.role) && section) {
      req.session.section = section.replace(/-/g, "_");
    }
    await saveSession(req);

    const loginClubView = club as typeof club & {
      backgroundLogoEnabled?: number | null;
      backgroundLogoMode?: string | null;
      backgroundLogoOpacity?: number | null;
    };
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
        primaryColor: club.primaryColor,
        secondaryColor: club.secondaryColor,
        backgroundLogoEnabled: loginClubView.backgroundLogoEnabled,
        backgroundLogoMode: loginClubView.backgroundLogoMode,
        backgroundLogoOpacity: loginClubView.backgroundLogoOpacity,
        foundedYear: club.foundedYear,
        description: club.description,
        createdAt: club.createdAt,
      },
      role: normalizeSessionRole(membership.role),
      sections: membershipSections(membership),
    });

    res.json({ ...response, authToken: sessionAuthToken(req) });
    return;
  } catch (error) {
    console.error("[LOGIN] Unexpected error:", error);
    res.status(500).json({ error: "Unexpected error" });
    return;
  }
});

function limitActivationAttempts(max: number): RequestHandler {
  let minute = 0;
  const counts = new Map<string, number>();
  return (req, res, next) => {
    const now = Math.floor(Date.now() / 60_000);
    if (now !== minute) { minute = now; counts.clear(); }
    const ip = req.ip ?? "";
    const count = (counts.get(ip) ?? 0) + 1;
    if (count > max) { res.set("Retry-After", "60").sendStatus(429); return; }
    counts.set(ip, count);
    next();
  };
}

router.post("/auth/activation/status", limitActivationAttempts(40), async (req, res): Promise<void> => {
  const match = findActivation(req.body?.token);
  if (!match) { res.sendStatus(404); return; }
  res.set("Cache-Control", "no-store");
  await ensureAccountActivations();
  const [invite] = await db.select({ kind: activations.kind, clubId: activations.clubId, usedAt: activations.usedAt,
    expiresAt: activations.expiresAt, status: activations.status, existingAccount: activations.existingAccount }).from(activations).where(match);
  if (!invite || invite.usedAt || invite.status === "revoked" || invite.expiresAt <= new Date()) { res.sendStatus(404); return; }
  res.json({ kind: invite.kind, clubId: invite.clubId, choosePassword: invite.kind === "parent" || !invite.existingAccount });
});

router.post("/auth/activation", limitActivationAttempts(15), async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  await ensureParentDelegateSecurityColumns();
  const password = req.body?.password;
  if (password !== req.body?.confirmPassword) { res.status(400).json({ error: "Le password non coincidono." }); return; }
  const result = await activateAccount(req.body?.token, password);
  if (!result) { res.status(404).json({ error: "Invito scaduto o già usato. Chiedine uno nuovo alla società." }); return; }
  if (result === "password") { res.status(400).json({ error: "La password deve avere almeno 8 caratteri e al massimo 72 byte." }); return; }
  if (result === "duplicate") { res.status(409).json({ error: "Questo recapito usa già la stessa password per un altro accesso in questa società. Scegline una diversa." }); return; }
  res.json(result);
});

router.post("/auth/parent-sign-in", limitActivationAttempts(12), async (req, res): Promise<void> => {
  const { contact, password, clubId } = req.body ?? {};
  const recipient = typeof contact === "string" && contact.length <= 254 ? activationContact(contact, contact) : null;
  if (!recipient || !validAccountPassword(password) || (clubId !== undefined && (!Number.isSafeInteger(clubId) || clubId <= 0))) {
    res.status(401).json({ error: "Recapito o password non validi." });
    return;
  }
  await ensureAccountActivations();
  await ensureParentDelegateSecurityColumns();
  const accounts = await db.select({ delegate: playerParentDelegatesTable, hash: activations.loginHash })
    .from(activations)
    .innerJoin(playerParentDelegatesTable, and(eq(activations.subjectId, playerParentDelegatesTable.id), eq(activations.clubId, playerParentDelegatesTable.clubId)))
    .where(and(eq(activations.kind, "parent"), eq(activations.destination, recipient.destination), isNotNull(activations.loginHash),
      eq(playerParentDelegatesTable.isActive, true), clubId ? eq(activations.clubId, clubId) : undefined));
  const matches = [];
  for (const { delegate, hash } of accounts) {
    if (hash && await bcrypt.compare(password, hash)) matches.push(delegate);
  }
  if (matches.length !== 1) {
    res.status(matches.length ? 409 : 401).json({ error: matches.length
      ? "Apri il link di accesso della tua società e riprova."
      : "Recapito o password non validi." });
    return;
  }
  const delegate = matches[0];
  const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, delegate.clubId));
  if (!club) { res.sendStatus(401); return; }
  await startParentSession(req, res, club, delegate, false, false);
});

router.post("/auth/parent-login", async (req, res): Promise<void> => {
  const { clubCode, parentCode, delegateCode } = req.body as { clubCode?: string; parentCode?: string; delegateCode?: string };

  const cleanedDelegateCode = normalizeParentAccessCode(delegateCode);
  if (typeof clubCode !== "string" || typeof parentCode !== "string" || !clubCode.trim() || !parentCode.trim() || !cleanedDelegateCode) {
    res.status(400).json({ error: "Codice club, codice genitori e codice delegato richiesti" });
    return;
  }

  if (validateParentAccessCode(cleanedDelegateCode)) {
    res.status(401).json({ error: "Codice delegato non valido" });
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

  await ensureParentDelegateSecurityColumns();

  let [parentDelegate] = await db
    .select()
    .from(playerParentDelegatesTable)
    .where(and(
      eq(playerParentDelegatesTable.clubId, club.id),
      eq(playerParentDelegatesTable.accessCode, cleanedDelegateCode),
      eq(playerParentDelegatesTable.isActive, true),
    ));
  let requiresPersonalAccessCode = false;
  let emergencyResetLogin = false;
  const hasPersonalCode = Boolean(parentDelegate?.personalAccessCodeHash);
  if (parentDelegate && hasPersonalCode && !parentDelegate.resetRequestedAt) {
    res.status(401).json({ error: "Usa la chiave personale impostata dal genitore" });
    return;
  }
  if (parentDelegate && hasPersonalCode && parentDelegate.resetRequestedAt) {
    requiresPersonalAccessCode = true;
    emergencyResetLogin = true;
  }
  if (!parentDelegate) {
    const candidates = await db
      .select()
      .from(playerParentDelegatesTable)
      .where(and(
        eq(playerParentDelegatesTable.clubId, club.id),
        eq(playerParentDelegatesTable.isActive, true),
      ));
    for (const candidate of candidates) {
      if (!candidate.personalAccessCodeHash) continue;
      if (await bcrypt.compare(cleanedDelegateCode, candidate.personalAccessCodeHash)) {
        parentDelegate = candidate;
        break;
      }
    }
  } else if (!hasPersonalCode) {
    requiresPersonalAccessCode = true;
  }
  if (!parentDelegate) {
    res.status(401).json({ error: "Codice delegato non valido" });
    return;
  }

  await ensureAccountActivations();
  const [invite] = await db.select({ existingAccount: activations.existingAccount, usedAt: activations.usedAt }).from(activations).where(and(
    eq(activations.kind, "parent"), eq(activations.clubId, club.id), eq(activations.subjectId, parentDelegate.id),
  ));
  if (invite?.usedAt) { res.status(403).json({ error: "Accedi con il recapito e la password scelti durante l’attivazione." }); return; }
  if (invite && !invite.existingAccount) { res.status(403).json({ error: "Attiva l’accesso tramite l’invito ricevuto dalla società." }); return; }
  await startParentSession(req, res, club, parentDelegate, requiresPersonalAccessCode, emergencyResetLogin);
});

async function startParentSession(
  req: Request, res: Response, club: typeof clubsTable.$inferSelect,
  parentDelegate: typeof playerParentDelegatesTable.$inferSelect, requiresPersonalAccessCode: boolean, emergencyResetLogin: boolean,
) {
  await regenerateSession(req);
  req.session.userId = 0;
  req.session.clubId = club.id;
  req.session.role = "parent";
  req.session.parentDelegateId = parentDelegate.id;
  req.session.parentPlayerId = parentDelegate.playerId;
  req.session.parentAccessVersion = parentDelegate.accessVersion ?? undefined;
  await saveSession(req);

  const authPayload = { userId: 0, clubId: club.id, role: "parent", parentDelegateId: parentDelegate.id, parentPlayerId: parentDelegate.playerId, parentAccessVersion: req.session.parentAccessVersion };
  res.json({
    user: {
      id: 0,
      email: parentDelegate?.email || `genitori@club.ftb`,
      firstName: parentDelegate?.firstName || "Area",
      lastName: parentDelegate?.lastName || "Genitori",
      createdAt: club.createdAt,
    },
    club: { id: club.id, name: club.name, city: club.city, country: club.country, logoUrl: null, foundedYear: null, description: null, createdAt: club.createdAt },
    role: "parent",
    parentDelegate: parentDelegate ? {
      id: parentDelegate.id,
      playerId: parentDelegate.playerId,
      relation: parentDelegate.relation,
      requiresPersonalAccessCode,
      emergencyResetLogin,
    } : null,
    authToken: createAuthToken(authPayload),
  });
}

router.get("/auth/parent-children", async (req, res): Promise<void> => {
  const { role, clubId, parentDelegateId, parentPlayerId } = req.session;
  if (role !== "parent" || !clubId || !parentDelegateId) { res.sendStatus(403); return; }
  res.json({ children: await parentFamilyChildren(clubId, parentDelegateId), selectedId: parentPlayerId });
});

router.post("/auth/parent-children/select", async (req, res): Promise<void> => {
  const { role, clubId, parentDelegateId, parentAccessVersion } = req.session;
  if (role !== "parent" || !clubId || !parentDelegateId) { res.sendStatus(403); return; }
  const playerId = req.body?.playerId;
  const children = await parentFamilyChildren(clubId, parentDelegateId);
  if (!Number.isSafeInteger(playerId) || !children.some(child => child.id === playerId)) {
    res.status(403).json({ error: "Atleta non collegato a questo account." });
    return;
  }
  req.session.parentPlayerId = playerId;
  await saveSession(req);
  res.json({ authToken: createAuthToken({ userId: 0, clubId, role: "parent", parentDelegateId,
    parentPlayerId: playerId, parentAccessVersion }) });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    res.clearCookie("connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: (process.env.SESSION_COOKIE_SAMESITE === "none" ? "none" : "lax") as "none" | "lax",
      secure: String(process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase() === "true",
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
    const [delegate] = await db.select({ email: playerParentDelegatesTable.email,
      firstName: playerParentDelegatesTable.firstName, lastName: playerParentDelegatesTable.lastName,
    }).from(playerParentDelegatesTable).where(and(eq(playerParentDelegatesTable.id, req.session.parentDelegateId ?? 0),
      eq(playerParentDelegatesTable.clubId, club.id), eq(playerParentDelegatesTable.isActive, true)));
    const parentClubView = club as typeof club & {
      backgroundLogoEnabled?: number | null;
      backgroundLogoMode?: string | null;
      backgroundLogoOpacity?: number | null;
    };
    res.json({
      user: { id: 0, email: delegate?.email ?? "", firstName: delegate?.firstName ?? "Area", lastName: delegate?.lastName ?? "Genitori", createdAt: club.createdAt },
      club: {
        id: club.id,
        name: club.name,
        city: club.city,
        country: club.country,
        logoUrl: club.logoUrl,
        primaryColor: club.primaryColor,
        secondaryColor: club.secondaryColor,
        backgroundLogoEnabled: parentClubView.backgroundLogoEnabled,
        backgroundLogoMode: parentClubView.backgroundLogoMode,
        backgroundLogoOpacity: parentClubView.backgroundLogoOpacity,
        foundedYear: club.foundedYear,
        description: club.description,
        createdAt: club.createdAt,
      },
      role: "parent",
      profileSubjectId: req.session.parentDelegateId ?? null,
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
  const [membership] = await db
    .select()
    .from(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.userId, user.id), eq(clubMembershipsTable.clubId, req.session.clubId!)));
  const sessionClubView = club as typeof club & {
    backgroundLogoEnabled?: number | null;
    backgroundLogoMode?: string | null;
    backgroundLogoOpacity?: number | null;
  };

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
      primaryColor: club.primaryColor,
      secondaryColor: club.secondaryColor,
      backgroundLogoEnabled: sessionClubView.backgroundLogoEnabled,
      backgroundLogoMode: sessionClubView.backgroundLogoMode,
      backgroundLogoOpacity: sessionClubView.backgroundLogoOpacity,
      foundedYear: club.foundedYear,
      description: club.description,
      createdAt: club.createdAt,
    },
    role: normalizeSessionRole(req.session.role!),
    sections: membershipSections(membership),
  });

  res.json({ ...response, section: req.session.section ?? null });
});

export default router;
