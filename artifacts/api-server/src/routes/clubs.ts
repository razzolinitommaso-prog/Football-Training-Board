import { Router, type IRouter } from "express";
import { db, clubsTable, clubMembershipsTable, usersTable, teamStaffAssignmentsTable, teamsTable } from "@workspace/db";
import { eq, and, ilike, SQL, sql } from "drizzle-orm";
import {
  GetMyClubResponse,
  UpdateMyClubBody,
  UpdateMyClubResponse,
  ListClubMembersResponse,
  InviteClubMemberBody,
  UpdateClubMemberRoleBody,
  UpdateClubMemberRoleResponse,
  ListClubsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import bcrypt from "bcryptjs";

const router: IRouter = Router();

router.get("/clubs/public/search", async (req, res): Promise<void> => {
  const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const clubs = await db
    .select({ id: clubsTable.id, name: clubsTable.name, logoUrl: clubsTable.logoUrl, city: clubsTable.city })
    .from(clubsTable)
    .where(ilike(clubsTable.name, `%${name}%`));
  res.json(clubs);
});

router.post("/clubs/public/verify", async (req, res): Promise<void> => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name || !code) { res.status(400).json({ error: "name and code required" }); return; }
  const trimmedName = name.trim();
  const trimmedCode = code.trim();
  const clubs = await db
    .select({ id: clubsTable.id, name: clubsTable.name, logoUrl: clubsTable.logoUrl, city: clubsTable.city, accessCode: clubsTable.accessCode })
    .from(clubsTable)
    .where(ilike(clubsTable.name, `%${trimmedName}%`));
  if (!clubs || clubs.length === 0) { res.status(404).json({ error: "Club not found" }); return; }
  const club = clubs[0];
  if (club.accessCode && club.accessCode !== trimmedCode) {
    res.status(401).json({ error: "Invalid club code" }); return;
  }
  res.json({ id: club.id, name: club.name, logoUrl: club.logoUrl, city: club.city });
});

router.get("/clubs", requireAuth, async (req, res): Promise<void> => {
  const clubs = await db.select().from(clubsTable);
  res.json(ListClubsResponse.parse(clubs.map(c => ({
    ...c,
    city: c.city ?? null,
    country: c.country ?? null,
    logoUrl: c.logoUrl ?? null,
    foundedYear: c.foundedYear ?? null,
    description: c.description ?? null,
  }))));
});

router.get("/clubs/me", requireAuth, async (req, res): Promise<void> => {
  const [club] = await db.select().from(clubsTable).where(eq(clubsTable.id, req.session.clubId!));
  if (!club) {
    res.status(404).json({ error: "Club not found" });
    return;
  }
  res.json(GetMyClubResponse.parse({
    ...club,
    city: club.city ?? null,
    country: club.country ?? null,
    logoUrl: club.logoUrl ?? null,
    primaryColor: club.primaryColor ?? null,
    secondaryColor: club.secondaryColor ?? null,
    foundedYear: club.foundedYear ?? null,
    description: club.description ?? null,
  }));
});

router.get("/clubs/me/credentials", requireAuth, async (req, res): Promise<void> => {
  const allowedRoles = ["admin", "secretary", "director", "technical_director"];
  if (!allowedRoles.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" }); return;
  }
  const [club] = await db
    .select({ name: clubsTable.name, accessCode: clubsTable.accessCode, parentCode: clubsTable.parentCode })
    .from(clubsTable).where(eq(clubsTable.id, req.session.clubId!));
  if (!club) { res.status(404).json({ error: "Club non trovato" }); return; }
  res.json(club);
});

router.patch("/clubs/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMyClubBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.city !== undefined) updateData.city = parsed.data.city;
  if (parsed.data.country !== undefined) updateData.country = parsed.data.country;
  if (parsed.data.logoUrl !== undefined) updateData.logoUrl = parsed.data.logoUrl;
  if (parsed.data.primaryColor !== undefined) updateData.primaryColor = parsed.data.primaryColor;
  if (parsed.data.secondaryColor !== undefined) updateData.secondaryColor = parsed.data.secondaryColor;
  if (parsed.data.foundedYear !== undefined) updateData.foundedYear = parsed.data.foundedYear;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;

  const [club] = await db
    .update(clubsTable)
    .set(updateData)
    .where(eq(clubsTable.id, req.session.clubId!))
    .returning();

  res.json(UpdateMyClubResponse.parse({
    ...club,
    city: club.city ?? null,
    country: club.country ?? null,
    logoUrl: club.logoUrl ?? null,
    primaryColor: club.primaryColor ?? null,
    secondaryColor: club.secondaryColor ?? null,
    foundedYear: club.foundedYear ?? null,
    description: club.description ?? null,
  }));
});

router.get("/clubs/me/members", requireAuth, async (req, res): Promise<void> => {
  const section = typeof req.query.section === "string" ? req.query.section : undefined;
  let membersWhere: SQL = eq(clubMembershipsTable.clubId, req.session.clubId!);
  if (section) {
    membersWhere = and(
      eq(clubMembershipsTable.clubId, req.session.clubId!),
      sql`${clubMembershipsTable.clubSection} @> ARRAY[${section}]::text[]`
    )!;
  }

  const members = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: clubMembershipsTable.role,
      joinedAt: clubMembershipsTable.joinedAt,
      clubSection: clubMembershipsTable.clubSection,
      staffRole: clubMembershipsTable.staffRole,
      registered: clubMembershipsTable.registered,
      registrationNumber: clubMembershipsTable.registrationNumber,
      phone: clubMembershipsTable.phone,
      licenseType: clubMembershipsTable.licenseType,
      specialization: clubMembershipsTable.specialization,
      degreeScienzeMoto: clubMembershipsTable.degreeScienzeMoto,
      degreeScienzeMotoType: clubMembershipsTable.degreeScienzeMotoType,
    })
    .from(clubMembershipsTable)
    .innerJoin(usersTable, eq(clubMembershipsTable.userId, usersTable.id))
    .where(membersWhere);

  const assignments = await db
    .select({
      userId: teamStaffAssignmentsTable.userId,
      id: teamStaffAssignmentsTable.id,
      teamId: teamStaffAssignmentsTable.teamId,
      teamName: teamsTable.name,
    })
    .from(teamStaffAssignmentsTable)
    .innerJoin(teamsTable, eq(teamStaffAssignmentsTable.teamId, teamsTable.id))
    .where(eq(teamStaffAssignmentsTable.clubId, req.session.clubId!));

  const membersWithAssignments = members.map(m => ({
    ...m,
    teamAssignments: assignments.filter(a => a.userId === m.id).map(a => ({ id: a.id, teamId: a.teamId, teamName: a.teamName })),
  }));

  res.json(membersWithAssignments);
});

router.post("/clubs/me/members", requireAuth, async (req, res): Promise<void> => {
  const parsed = InviteClubMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, firstName, lastName, password, role, clubSection, registered, registrationNumber, phone, licenseType, specialization, degreeScienzeMoto, degreeScienzeMotoType } = parsed.data;

  const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email));
  
  let userId: number;
  
  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    const existingMembership = await db.select().from(clubMembershipsTable).where(
      and(eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.clubId, req.session.clubId!))
    );
    if (existingMembership.length > 0) {
      res.status(400).json({ error: "User is already a member of this club" });
      return;
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db
      .insert(usersTable)
      .values({ email, firstName, lastName, passwordHash })
      .returning();
    userId = newUser.id;
  }

  const sectionsArray = Array.isArray(clubSection) && clubSection.length > 0
    ? clubSection
    : ["scuola_calcio"];

  await db.insert(clubMembershipsTable).values({
    userId,
    clubId: req.session.clubId!,
    role,
    clubSection: sectionsArray,
    registered: registered ?? false,
    registrationNumber: registrationNumber ?? null,
    phone: phone ?? null,
    licenseType: licenseType ?? null,
    specialization: specialization ?? null,
    degreeScienzeMoto: degreeScienzeMoto ?? false,
    degreeScienzeMotoType: degreeScienzeMotoType ?? null,
  });

  const [member] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: clubMembershipsTable.role,
      joinedAt: clubMembershipsTable.joinedAt,
    })
    .from(clubMembershipsTable)
    .innerJoin(usersTable, eq(clubMembershipsTable.userId, usersTable.id))
    .where(and(eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.clubId, req.session.clubId!)));

  res.status(201).json(member);
});

router.patch("/clubs/me/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(rawId, 10);

  const parsed = UpdateClubMemberRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { firstName, lastName, email, newPassword, role, clubSection, staffRole, registered, registrationNumber, phone, licenseType, specialization, degreeScienzeMoto, degreeScienzeMotoType, teamIds } = parsed.data;

  type UserUpdateFields = {
    firstName?: string;
    lastName?: string;
    email?: string;
    passwordHash?: string;
  };
  const userUpdates: UserUpdateFields = {};
  if (firstName) userUpdates.firstName = firstName;
  if (lastName) userUpdates.lastName = lastName;
  if (email) userUpdates.email = email;
  if (newPassword) userUpdates.passwordHash = await bcrypt.hash(newPassword, 12);

  if (Object.keys(userUpdates).length > 0) {
    await db.update(usersTable).set(userUpdates).where(eq(usersTable.id, userId));
  }

  const updateSectionsArray = Array.isArray(clubSection) && clubSection.length > 0
    ? clubSection
    : clubSection
      ? [clubSection as string]
      : undefined;

  await db
    .update(clubMembershipsTable)
    .set({
      role,
      ...(updateSectionsArray ? { clubSection: updateSectionsArray } : {}),
      staffRole: staffRole ?? null,
      registered: registered ?? false,
      registrationNumber: registrationNumber ?? null,
      phone: phone ?? null,
      licenseType: licenseType ?? null,
      specialization: specialization ?? null,
      degreeScienzeMoto: degreeScienzeMoto ?? false,
      degreeScienzeMotoType: degreeScienzeMotoType ?? null,
    })
    .where(and(eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.clubId, req.session.clubId!)));

  if (teamIds !== undefined) {
    await db
      .delete(teamStaffAssignmentsTable)
      .where(and(
        eq(teamStaffAssignmentsTable.userId, userId),
        eq(teamStaffAssignmentsTable.clubId, req.session.clubId!)
      ));

    if (teamIds.length > 0) {
      await db.insert(teamStaffAssignmentsTable).values(
        teamIds.map(teamId => ({ teamId, userId, clubId: req.session.clubId!, role }))
      );
    }
  }

  const [member] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: clubMembershipsTable.role,
      joinedAt: clubMembershipsTable.joinedAt,
    })
    .from(clubMembershipsTable)
    .innerJoin(usersTable, eq(clubMembershipsTable.userId, usersTable.id))
    .where(and(eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.clubId, req.session.clubId!)));

  res.json(UpdateClubMemberRoleResponse.parse(member));
});

router.delete("/clubs/me/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const userId = parseInt(rawId, 10);

  await db
    .delete(clubMembershipsTable)
    .where(and(eq(clubMembershipsTable.userId, userId), eq(clubMembershipsTable.clubId, req.session.clubId!)));

  res.sendStatus(204);
});

export default router;
