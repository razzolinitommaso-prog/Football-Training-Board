import type { NextFunction, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, playerParentDelegatesTable } from "@workspace/db";

let familyTable: Promise<unknown> | undefined;

export function ensureParentFamilyLinks() {
  familyTable ??= db.execute(sql`
    CREATE TABLE IF NOT EXISTS parent_delegate_children (
      delegate_id INTEGER NOT NULL REFERENCES player_parent_delegates(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      PRIMARY KEY (delegate_id, player_id)
    );
  `).then(() => db.execute(sql`
    CREATE INDEX IF NOT EXISTS parent_delegate_children_player ON parent_delegate_children(player_id);
  `)).catch(error => {
    familyTable = undefined;
    throw error;
  });
  return familyTable;
}

export async function parentFamilyChildren(clubId: number, delegateId: number) {
  await ensureParentFamilyLinks();
  const result = await db.execute(sql`
    SELECT p.id, p.first_name AS "firstName", p.last_name AS "lastName",
      (p.id = d.player_id) AS "primary"
    FROM player_parent_delegates d
    JOIN players p ON p.club_id = d.club_id AND (
      p.id = d.player_id OR EXISTS (
        SELECT 1 FROM parent_delegate_children l WHERE l.delegate_id = d.id AND l.player_id = p.id
      )
    )
    WHERE d.club_id = ${clubId} AND d.id = ${delegateId} AND d.is_active
    ORDER BY (p.id = d.player_id) DESC, p.last_name, p.first_name, p.id
  `);
  return result.rows as { id: number; firstName: string; lastName: string; primary: boolean }[];
}

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
    const validChild = delegate && (delegate.playerId === parentPlayerId ||
      (await parentFamilyChildren(clubId ?? 0, parentDelegateId)).some(child => child.id === parentPlayerId));
    if (!delegate || !validChild || delegate.accessVersion !== (parentAccessVersion ?? null)) {
      res.status(401).json({ error: "L’accesso è stato aggiornato. Accedi di nuovo con la chiave valida." });
      return;
    }
    const expectedChild = req.get("x-ftb-parent-child");
    const canResolveChild = ["/auth/me", "/auth/parent-children", "/auth/parent-children/select"].includes(req.path);
    if (expectedChild && expectedChild !== String(parentPlayerId) && !canResolveChild) {
      res.status(409).json({ error: "Il profilo del figlio è cambiato. Ricarica la pagina." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
