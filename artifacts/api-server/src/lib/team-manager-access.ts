import type { Request, Response, NextFunction } from "express";

// This role has a dedicated read-only API. Existing roles are unaffected.
export function restrictTeamManagerApi(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "team_manager") return next();
  const path = req.path.replace(/\/+$/, "") || "/";
  const allowed = req.method === "GET" && ["/auth/me", "/account/profile", "/clubs/me", "/clubs/public/search", "/dirigenti/overview", "/attendance-register", "/calendar-extra-events"].includes(path)
    || req.method === "POST" && ["/auth/login", "/auth/logout", "/auth/parent-sign-in", "/auth/parent-login", "/auth/activation", "/auth/activation/status", "/account/password"].includes(path);
  if (!allowed) { res.status(403).json({ error: "Operazione non disponibile nell'area dirigenti" }); return; }
  next();
}
