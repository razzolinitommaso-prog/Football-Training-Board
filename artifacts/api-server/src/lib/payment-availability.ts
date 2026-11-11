import type { RequestHandler } from "express";
import { trainingLocalDate } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function reconcilePaymentAvailability(clubId: number, playerId?: number, today = trainingLocalDate()) {
  const playerScope = playerId === undefined ? sql`` : sql`AND player_id = ${playerId}`;
  const targetScope = playerId === undefined ? sql`` : sql`AND p.id = ${playerId}`;
  const override = sql`(p.availability_override_active AND p.availability_override_until IS NOT NULL
    AND p.availability_override_until >= ${today}::date
    AND (p.availability_override_from IS NULL OR p.availability_override_from <= ${today}::date))`;
  const canRestore = sql`(p.status = 'active' AND (${override} OR
    (p.registered IS TRUE AND coalesce(p.medical_certificate_expiry >= ${today}::date, false))))`;
  const result = await db.execute(sql`
    WITH overdue AS (
      SELECT DISTINCT player_id FROM player_payments
      WHERE club_id = ${clubId} ${playerScope} AND status <> 'paid' AND amount > 0
        AND (status = 'overdue' OR due_date < ${today}::date)
    )
    UPDATE players p
    SET available = CASE
          WHEN p.unavailability_reason = 'payment' THEN ${canRestore}
          ELSE false
        END,
        unavailability_reason = CASE
          WHEN p.unavailability_reason IS DISTINCT FROM 'payment' THEN 'payment'
          WHEN p.status = 'injured' THEN 'injury'
          WHEN p.status = 'suspended' THEN 'suspended'
          WHEN p.status = 'pending_transfer' THEN 'pending_transfer'
          WHEN ${canRestore} THEN NULL
          ELSE 'other'
        END
    WHERE p.club_id = ${clubId} ${targetScope}
      AND (
        (p.available AND (p.unavailability_reason IS NULL OR p.unavailability_reason = 'regular')
          AND EXISTS (SELECT 1 FROM overdue WHERE player_id = p.id)
          AND NOT ${override})
        OR (p.unavailability_reason = 'payment'
          AND ((p.status = 'active' AND ${override}) OR NOT EXISTS (SELECT 1 FROM overdue WHERE player_id = p.id)))
      )
    RETURNING p.id
  `);
  return result.rows.length;
}

const recentChecks = new Map<number, { day: string; until: number; check: Promise<number> }>();

export const refreshClubPaymentAvailability: RequestHandler = async (req, _res, next) => {
  const { role, clubId } = req.session;
  if (!role || !clubId || !/^\/(players|teams|training[^/]*|attendance[^/]*|matches|parent|dirigenti|dashboard|player-payments)(\/|$)/.test(req.path)) {
    next();
    return;
  }
  const day = trainingLocalDate();
  const now = Date.now();
  let current = recentChecks.get(clubId);
  if (!current || current.day !== day || current.until <= now) {
    for (const [id, entry] of recentChecks) if (entry.until <= now) recentChecks.delete(id);
    current = { day, until: now + 60_000, check: reconcilePaymentAvailability(clubId, undefined, day) };
    recentChecks.set(clubId, current);
  }
  try {
    await current.check;
    next();
  } catch (error) {
    if (recentChecks.get(clubId) === current) recentChecks.delete(clubId);
    next(error);
  }
};
