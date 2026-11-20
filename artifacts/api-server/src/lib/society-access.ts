import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ensureSocietyStorage } from "./society-storage";
export function enforceSocietyAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.clubId) {
    next();
    return;
  }
  void ensureSocietyStorage()
    .then(async () => {
      if (
        !["/auth/login", "/auth/logout"].includes(req.path) &&
        req.session.userId &&
        req.session.role &&
        (
          await db.execute(
            sql`SELECT 1 FROM member_dismissals WHERE club_id=${req.session.clubId} AND user_id=${req.session.userId} AND role=${req.session.role} AND effective_date<=CURRENT_DATE`,
          )
        ).rows.length
      ) {
        res
          .status(403)
          .json({
            error: "Incarico esonerato. Accedi con un altro ruolo abilitato.",
          });
        return;
      }
      const operational = [
        "warehouse_keeper",
        "maintenance",
        "groundskeeper",
        "driver",
        "physiotherapist",
        "doctor",
        "communications",
        "event_manager",
        "administrative_manager",
        "other",
        "collaborator",
      ];
      if (
        operational.includes(req.session.role ?? "") &&
        ![
          "/auth/me",
          "/auth/logout",
          "/auth/profile",
          "/account/profile",
          "/account/password",
          "/society-management/choices",
          "/society-management/switch",
        ].some((path) => req.path === path || req.path.startsWith(path + "/"))
      ) {
        res
          .status(403)
          .json({
            error:
              "Questo incarico non abilita ai registri sportivi o amministrativi. Seleziona un altro ruolo autorizzato.",
          });
        return;
      }
      next();
    })
    .catch(next);
}
