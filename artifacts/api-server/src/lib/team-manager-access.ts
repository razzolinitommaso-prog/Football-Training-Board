import type { Request, Response, NextFunction } from "express";

// This role has a dedicated read-only API. Existing roles are unaffected.
export function restrictTeamManagerApi(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "team_manager") return next();
  const path = req.path.replace(/\/+$/, "") || "/";
  const allowed = req.method === "GET" && ["/auth/me", "/clubs/me", "/clubs/public/search", "/dirigenti/overview"].includes(path)
    || req.method === "POST" && ["/auth/login", "/auth/logout"].includes(path);
  if (!allowed) { res.status(403).json({ error: "Operazione non disponibile nell'area dirigenti" }); return; }
  next();
}
