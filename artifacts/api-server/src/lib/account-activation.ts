import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, clubsTable, clubMembershipsTable, playerParentDelegatesTable, usersTable, accountActivationsTable as activations } from "@workspace/db";
import { appUrl, smtpConfig } from "./parent-email";

export { activations };

let schema: Promise<unknown> | undefined;
export function ensureAccountActivations() {
  schema ??= db.execute(sql`
    CREATE TABLE IF NOT EXISTS account_activations (
      kind TEXT NOT NULL,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL,
      digest TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL,
      destination TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      existing_account BOOLEAN NOT NULL,
      login_hash TEXT,
      PRIMARY KEY (kind, club_id, subject_id)
    );
    CREATE INDEX IF NOT EXISTS account_activations_login ON account_activations (kind, destination, club_id)
      WHERE login_hash IS NOT NULL;
  `).catch(error => {
    schema = undefined;
    throw error;
  });
  return schema;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Scope = Pick<typeof activations.$inferSelect, "kind" | "clubId" | "subjectId">;

export function activationScope({ kind, clubId, subjectId }: Scope) {
  return and(eq(activations.kind, kind), eq(activations.clubId, clubId), eq(activations.subjectId, subjectId));
}

export function activationContact(email?: string | null, phone?: string | null, preferSms = false) {
  const mail = email?.trim().toLowerCase() ?? "";
  const number = phone?.replace(/[\s().-]/g, "").replace(/^00/, "+") ?? "";
  if (preferSms && /^\+[1-9]\d{7,14}$/.test(number)) return { channel: "sms" as const, destination: number };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { channel: "email" as const, destination: mail };
  if (/^\+[1-9]\d{7,14}$/.test(number)) return { channel: "sms" as const, destination: number };
  return null;
}

export function validAccountPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function findActivation(token: unknown) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return eq(activations.digest, tokenDigest(token));
}

export async function issueActivation(tx: Tx, scope: Scope, contact: NonNullable<ReturnType<typeof activationContact>>, existingAccount = false, replaceRevoked = false) {
  const token = randomBytes(32).toString("base64url");
  const issuedAt = new Date();
  const values = {
    ...contact, digest: tokenDigest(token), issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 48 * 60 * 60 * 1000),
    status: "pending", existingAccount,
  };
  const [row] = await tx.insert(activations).values({ ...scope, ...values })
    .onConflictDoUpdate({
      target: [activations.kind, activations.clubId, activations.subjectId],
      set: { ...values, usedAt: null },
      setWhere: replaceRevoked
        ? eq(activations.status, "revoked")
        : and(sql`${activations.usedAt} IS NULL`, sql`${activations.issuedAt} < now() - interval '1 minute'`),
    }).returning();
  return row ? { row, token } : null;
}

export async function deliverActivation(invite: NonNullable<Awaited<ReturnType<typeof issueActivation>>>) {
  const { row, token } = invite;
  let status = "failed";
  try {
    const [club] = await db.select({ name: clubsTable.name }).from(clubsTable).where(eq(clubsTable.id, row.clubId));
    const link = new URL("/attiva-accesso", appUrl());
    link.hash = token;
    const message = `Football Training Board · ${club?.name ?? "Invito"}\nAttiva l’accesso entro 48 ore: ${link.href}`;
    if (row.channel === "email") {
      const config = smtpConfig("Football Training Board");
      if (!config) throw new Error("SMTP unavailable");
      const { from, ...transport } = config;
      await nodemailer.createTransport({
        ...transport, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
      }).sendMail({ from, to: row.destination, subject: "Attiva il tuo accesso a Football Training Board", text: message });
    } else {
      const endpoint = process.env.ACTIVATION_SMS_WEBHOOK_URL;
      const secret = process.env.ACTIVATION_SMS_WEBHOOK_TOKEN;
      if (!endpoint || !secret || new URL(endpoint).protocol !== "https:") throw new Error("SMS unavailable");
      const response = await fetch(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: row.destination, message }),
      });
      if (!response.ok) throw new Error("SMS rejected");
    }
    status = "sent";
  } catch {
    // Provider errors may contain contact details or the link.
  }
  await db.update(activations).set({ status }).where(and(eq(activations.digest, row.digest), eq(activations.status, "pending")));
  return status;
}

export async function pendingStaffClubIds(userId: number, clubIds: number[]) {
  if (!clubIds.length) return [];
  await ensureAccountActivations();
  const rows = await db.select({ clubId: activations.clubId }).from(activations).where(and(
    eq(activations.kind, "staff"), eq(activations.subjectId, userId),
    inArray(activations.clubId, clubIds), sql`${activations.usedAt} IS NULL`,
  ));
  return rows.map(row => row.clubId);
}

export async function activateAccount(token: unknown, password: unknown) {
  const byToken = findActivation(token);
  if (!byToken) return null;
  await ensureAccountActivations();
  return db.transaction(async tx => {
    const [invite] = await tx.select().from(activations).where(byToken).for("update");
    if (!invite || invite.usedAt || invite.status === "revoked" || invite.expiresAt <= new Date()) return null;
    const scope = activationScope(invite);
    if (invite.kind === "staff") {
      const [membership] = await tx.select({ id: clubMembershipsTable.id, phone: clubMembershipsTable.phone }).from(clubMembershipsTable).where(and(
        eq(clubMembershipsTable.userId, invite.subjectId), eq(clubMembershipsTable.clubId, invite.clubId),
      ));
      if (!membership) return null;
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, invite.subjectId)).for("update");
      const contact = activationContact(user?.email, membership.phone, invite.channel === "sms");
      if (!user || !contact || contact.destination !== invite.destination || contact.channel !== invite.channel) return null;
      if (!invite.existingAccount) {
        const [activated] = await tx.select({ id: activations.subjectId }).from(activations).where(and(
          eq(activations.kind, "staff"), eq(activations.subjectId, invite.subjectId), eq(activations.existingAccount, false),
          sql`${activations.usedAt} IS NOT NULL`,
        )).limit(1);
        if (!activated) {
          if (!validAccountPassword(password)) return "password";
          await tx.update(usersTable).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(usersTable.id, user.id));
        }
      }
    } else {
      if (!validAccountPassword(password)) return "password";
      const [delegate] = await tx.select().from(playerParentDelegatesTable).where(and(
        eq(playerParentDelegatesTable.id, invite.subjectId), eq(playerParentDelegatesTable.clubId, invite.clubId),
        eq(playerParentDelegatesTable.isActive, true),
      )).for("update");
      const contact = activationContact(delegate?.email, delegate?.phone, invite.channel === "sms");
      if (!delegate || contact?.destination !== invite.destination) return null;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`parent-login:${invite.clubId}:${invite.destination}`}))`);
      const otherAccounts = await tx.select({ loginHash: activations.loginHash }).from(activations).where(and(
        eq(activations.kind, "parent"), eq(activations.clubId, invite.clubId), eq(activations.destination, invite.destination),
        sql`${activations.loginHash} IS NOT NULL`, sql`${activations.subjectId} <> ${invite.subjectId}`,
      ));
      for (const { loginHash } of otherAccounts) {
        if (loginHash && await bcrypt.compare(password, loginHash)) return "duplicate";
      }
      await tx.update(activations).set({ loginHash: await bcrypt.hash(password, 12) }).where(scope);
      await tx.update(playerParentDelegatesTable).set({ accessVersion: randomUUID(), personalAccessCodeHash: null,
        personalAccessCodeSetAt: null, resetRequestedAt: null })
        .where(eq(playerParentDelegatesTable.id, delegate.id));
    }
    await tx.update(activations).set({ usedAt: new Date() }).where(scope);
    return { kind: invite.kind, clubId: invite.clubId };
  });
}
