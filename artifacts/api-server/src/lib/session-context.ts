import type { Request } from "express";

/** clubId / userId numerici dalla sessione (connect-pg-simple può deserializzare come stringa). */
export function requireClubAndUserIds(req: Request): { clubId: number; userId: number } | null {
  const clubId = Number(req.session.clubId);
  const userId = Number(req.session.userId);
  if (!Number.isFinite(clubId) || clubId <= 0 || !Number.isFinite(userId)) {
    return null;
  }
  return { clubId, userId };
}
