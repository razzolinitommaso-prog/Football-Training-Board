import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import {
  clubsTable,
  db,
  parentPlayerRelationsTable,
  playerParentDelegatesTable,
  playersTable,
} from "@workspace/db";

type ParentEmailNotification = {
  clubId: number;
  parentUserId: number;
  playerId?: number | null;
  title: string;
  message: string;
};

function smtpConfig() {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const fromEmail = String(process.env.SMTP_FROM_EMAIL ?? user).trim();
  const fromName = String(process.env.SMTP_FROM_NAME ?? "ASD FORTIS JUVENTUS NOTIFICHE").trim();
  if (!host || !user || !pass || !fromEmail) return null;
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from: `"${fromName.replace(/"/g, "")}" <${fromEmail}>`,
  };
}

function appUrl() {
  return String(process.env.PUBLIC_APP_URL ?? process.env.APP_ORIGIN ?? "https://football-training-board.onrender.com").trim().replace(/\/+$/, "");
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function resolveParentEmailRecipients(clubId: number, parentUserId: number, playerId?: number | null) {
  let playerIds = playerId ? [playerId] : [];
  if (playerIds.length === 0) {
    const relations = await db
      .select({ playerId: parentPlayerRelationsTable.playerId })
      .from(parentPlayerRelationsTable)
      .where(eq(parentPlayerRelationsTable.parentUserId, parentUserId));
    playerIds = relations.map((row) => row.playerId);
  }
  if (playerIds.length === 0) return { emails: [] as string[], childNames: [] as string[] };

  const delegates = await db
    .select({ email: playerParentDelegatesTable.email })
    .from(playerParentDelegatesTable)
    .where(and(
      eq(playerParentDelegatesTable.clubId, clubId),
      eq(playerParentDelegatesTable.isActive, true),
      inArray(playerParentDelegatesTable.playerId, playerIds),
    ));
  const players = await db
    .select({ firstName: playersTable.firstName, lastName: playersTable.lastName })
    .from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, playerIds)));

  const emails = Array.from(new Set(delegates.map((delegate) => normalizeEmail(delegate.email)).filter(Boolean) as string[]));
  const childNames = players
    .map((player) => `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim())
    .filter(Boolean);
  return { emails, childNames };
}

export async function sendParentNotificationEmail(notification: ParentEmailNotification) {
  const config = smtpConfig();
  if (!config) return { sent: 0, skipped: "smtp_not_configured" };

  try {
    const { emails, childNames } = await resolveParentEmailRecipients(
      notification.clubId,
      notification.parentUserId,
      notification.playerId ?? null,
    );
    if (emails.length === 0) return { sent: 0, skipped: "no_parent_email" };

    const [club] = await db
      .select({ name: clubsTable.name })
      .from(clubsTable)
      .where(eq(clubsTable.id, notification.clubId));
    const childLabel = childNames.length === 1 ? childNames[0] : childNames.length > 1 ? childNames.join(", ") : "figlio/a";
    const subject = `ASD FORTIS JUVENTUS NOTIFICHE - ${childLabel}`;
    const loginUrl = `${appUrl()}/area-login/genitori`;
    const text = [
      notification.title,
      "",
      notification.message,
      "",
      `Atleta: ${childLabel}`,
      `Accedi all'area genitori: ${loginUrl}`,
      "",
      `Comunicazione inviata tramite Football Training Board${club?.name ? ` per ${club.name}` : ""}.`,
    ].join("\n");
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">${htmlEscape(notification.title)}</h2>
        <p>${htmlEscape(notification.message).replace(/\n/g, "<br>")}</p>
        <p><strong>Atleta:</strong> ${htmlEscape(childLabel)}</p>
        <p><a href="${htmlEscape(loginUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px">Accedi all'area genitori</a></p>
        <p style="font-size:12px;color:#6b7280">Comunicazione inviata tramite Football Training Board${club?.name ? ` per ${htmlEscape(club.name)}` : ""}.</p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    await transporter.sendMail({
      from: config.from,
      to: emails,
      subject,
      text,
      html,
    });
    return { sent: emails.length };
  } catch (error) {
    console.warn("[parent-email] send failed", error);
    return { sent: 0, skipped: "send_failed" };
  }
}
