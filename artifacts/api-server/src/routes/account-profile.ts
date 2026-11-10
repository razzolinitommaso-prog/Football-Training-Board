import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, clubMembershipsTable, playerParentDelegatesTable, sessionsTable, usersTable } from "@workspace/db";
import { activationScope, activations, ensureAccountActivations, validAccountPassword } from "../lib/account-activation";
import { requireAuth } from "../lib/auth";
import { ensureParentDelegateSecurityColumns } from "../lib/parent-delegate-access";

const router = Router();

router.get("/account/profile", requireAuth, async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const { role, userId, clubId, parentDelegateId, parentAccessVersion } = req.session;
  const parent = role === "parent";
  let profile;
  let directParentLogin = false;

  if (parent) {
    await ensureParentDelegateSecurityColumns();
    await ensureAccountActivations();
    const [delegate] = await db.select({
      firstName: playerParentDelegatesTable.firstName, lastName: playerParentDelegatesTable.lastName,
      email: playerParentDelegatesTable.email, phone: playerParentDelegatesTable.phone,
      loginHash: activations.loginHash, loginContact: activations.destination,
    }).from(playerParentDelegatesTable)
      .leftJoin(activations, and(eq(activations.kind, "parent"), eq(activations.clubId, playerParentDelegatesTable.clubId),
        eq(activations.subjectId, playerParentDelegatesTable.id)))
      .where(and(eq(playerParentDelegatesTable.clubId, clubId ?? 0), eq(playerParentDelegatesTable.id, parentDelegateId ?? 0),
        eq(playerParentDelegatesTable.isActive, true)));
    if (!delegate) { res.sendStatus(404); return; }
    const { loginHash, loginContact, ...details } = delegate;
    profile = { ...details, loginContact: loginHash ? loginContact : null };
    directParentLogin = Boolean(loginHash);
  } else {
    const [staff] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName,
      email: usersTable.email, phone: clubMembershipsTable.phone,
    }).from(usersTable).leftJoin(clubMembershipsTable, and(eq(clubMembershipsTable.userId, usersTable.id),
      eq(clubMembershipsTable.clubId, clubId ?? 0))).where(eq(usersTable.id, userId!));
    if (!staff) { res.sendStatus(404); return; }
    profile = staff;
  }

  const identity = parent
    ? sql`${sessionsTable.sess}->>'parentDelegateId' = ${String(parentDelegateId)} AND ${sessionsTable.sess}->>'clubId' = ${String(clubId)}
          AND COALESCE(${sessionsTable.sess}->>'parentAccessVersion', '') = ${parentAccessVersion ?? ""}`
    : sql`${sessionsTable.sess}->>'userId' = ${String(userId)}`;
  const sessions = await db.select({
    current: sql<boolean>`${sessionsTable.sid} = ${req.sessionID}`, expiresAt: sessionsTable.expire,
  }).from(sessionsTable).where(and(identity, gt(sessionsTable.expire, new Date())))
    .orderBy(sql`${sessionsTable.expire} DESC`);
  res.json({ ...profile, directParentLogin, sessions });
});

router.post("/account/password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, password, confirmPassword } = req.body ?? {};
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 256
    || !validAccountPassword(password) || password !== confirmPassword) {
    res.status(400).json({ error: "Controlla i campi. La nuova password deve avere almeno 8 caratteri e al massimo 72 byte." });
    return;
  }
  const { role, userId, clubId, parentDelegateId, parentAccessVersion } = req.session;
  if (role === "parent") {
    if (!clubId || !parentDelegateId) { res.sendStatus(403); return; }
    await ensureAccountActivations();
    await ensureParentDelegateSecurityColumns();
    const scope = activationScope({ kind: "parent", clubId, subjectId: parentDelegateId });
    const result = await db.transaction(async tx => {
      const [account] = await tx.select().from(activations).where(scope).for("update");
      if (!account?.loginHash || !await bcrypt.compare(currentPassword, account.loginHash)) return "invalid";
      const [delegate] = await tx.select().from(playerParentDelegatesTable).where(and(
        eq(playerParentDelegatesTable.id, parentDelegateId), eq(playerParentDelegatesTable.clubId, clubId),
        eq(playerParentDelegatesTable.isActive, true),
      )).for("update");
      if (!delegate || delegate.accessVersion !== (parentAccessVersion ?? null)) return "invalid";
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`parent-login:${clubId}:${account.destination}`}))`);
      const others = await tx.select({ hash: activations.loginHash }).from(activations).where(and(
        eq(activations.kind, "parent"), eq(activations.clubId, clubId), eq(activations.destination, account.destination),
        sql`${activations.subjectId} <> ${parentDelegateId} AND ${activations.loginHash} IS NOT NULL`,
      ));
      for (const { hash } of others) {
        if (hash && await bcrypt.compare(password, hash)) return "duplicate";
      }
      await tx.update(activations).set({ loginHash: await bcrypt.hash(password, 12) }).where(scope);
      await tx.update(playerParentDelegatesTable).set({ accessVersion: randomUUID() })
        .where(eq(playerParentDelegatesTable.id, parentDelegateId));
      return "changed";
    });
    if (result === "duplicate") { res.status(409).json({ error: "Scegli una password diversa da quella degli altri accessi con lo stesso recapito." }); return; }
    if (result === "invalid") { res.status(401).json({ error: "Password attuale non valida." }); return; }
    res.json({ signInAgain: true });
    return;
  }

  const [user] = await db.select({ hash: usersTable.passwordHash }).from(usersTable).where(eq(usersTable.id, userId!));
  if (!user || !(currentPassword === user.hash || await bcrypt.compare(currentPassword, user.hash))) {
    res.status(401).json({ error: "Password attuale non valida." });
    return;
  }
  const [changed] = await db.update(usersTable).set({ passwordHash: await bcrypt.hash(password, 12) })
    .where(and(eq(usersTable.id, userId!), eq(usersTable.passwordHash, user.hash))).returning({ id: usersTable.id });
  if (!changed) { res.status(409).json({ error: "La password è già cambiata. Accedi di nuovo." }); return; }
  res.json({ signInAgain: false });
});

export default router;
