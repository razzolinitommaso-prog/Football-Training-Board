import type { Request, Response, NextFunction } from "express";

// The dedicated API allows reads and confirmation of a saved match report.
export function restrictTeamManagerApi(req: Request, res: Response, next: NextFunction) {
  if (req.session.role !== "team_manager") return next();
  const path = req.path.replace(/\/+$/, "") || "/";
  const allowed = req.method === "GET" && ["/auth/me", "/account/profile", "/clubs/me", "/clubs/public/search", "/dirigenti/overview", "/attendance-register", "/calendar-extra-events", "/callup-rules"].includes(path)
    || req.method === "POST" && ["/auth/login", "/auth/logout", "/auth/parent-sign-in", "/auth/parent-login", "/auth/activation", "/auth/activation/status", "/account/password"].includes(path)
    || req.method === "POST" && /^\/matches\/[1-9]\d*\/report-confirmation$/.test(path);
  if (!allowed) { res.status(403).json({ error: "Operazione non disponibile nell'area dirigenti" }); return; }
  next();
}
