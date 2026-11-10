import type { NextFunction, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, playerParentDelegatesTable } from "@workspace/db";

let securityColumns: Promise<unknown> | undefined;

export function ensureParentDelegateSecurityColumns() {
  securityColumns ??= db.execute(sql`
    ALTER TABLE player_parent_delegates
      ADD COLUMN IF NOT EXISTS personal_access_code_hash TEXT,
      ADD COLUMN IF NOT EXISTS personal_access_code_set_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reset_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS access_version TEXT
  `).catch(error => {
    securityColumns = undefined;
    throw error;
  });
  return securityColumns;
}

export async function requireCurrentParentAccess(req: Request, res: Response, next: NextFunction) {
  const { role, clubId, parentDelegateId, parentPlayerId, parentAccessVersion } = req.session;
  const canStartOrEndSession = req.method === "POST" &&
    ["/auth/parent-login", "/auth/parent-sign-in", "/auth/activation", "/auth/activation/status", "/auth/login", "/auth/register", "/auth/logout"].includes(req.path);
  if (role !== "parent" || !parentDelegateId || canStartOrEndSession) {
    next();
    return;
  }

  try {
    await ensureParentDelegateSecurityColumns();
    const [delegate] = await db.select({
      playerId: playerParentDelegatesTable.playerId,
      accessVersion: playerParentDelegatesTable.accessVersion,
    }).from(playerParentDelegatesTable).where(and(
      eq(playerParentDelegatesTable.id, parentDelegateId),
      eq(playerParentDelegatesTable.clubId, clubId ?? 0),
      eq(playerParentDelegatesTable.isActive, true),
    ));
    if (!delegate || delegate.playerId !== parentPlayerId || delegate.accessVersion !== (parentAccessVersion ?? null)) {
      res.status(401).json({ error: "L’accesso è stato aggiornato. Accedi di nuovo con la chiave valida." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
