import { Router, type IRouter } from "express";
import { db, teamsTable, playersTable, clubMembershipsTable } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const VALID_SECTIONS = ["scuola_calcio", "settore_giovanile", "prima_squadra"] as const;
type ClubSection = typeof VALID_SECTIONS[number];

router.get("/section-stats", requireAuth, async (req, res): Promise<void> => {
  const section = (typeof req.query.section === "string" ? req.query.section : req.session.section) as string;
  if (!VALID_SECTIONS.includes(section as ClubSection)) {
    res.status(400).json({ error: "Invalid section. Must be one of: scuola_calcio, settore_giovanile, prima_squadra" });
    return;
  }

  const clubId = req.session.clubId!;

  const [teamsCount] = await db
    .select({ count: count() })
    .from(teamsTable)
    .where(and(eq(teamsTable.clubId, clubId), eq(teamsTable.clubSection, section)));

  const [playersCount] = await db
    .select({ count: count() })
    .from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), eq(playersTable.clubSection, section)));

  const [membersCount] = await db
    .select({ count: count() })
    .from(clubMembershipsTable)
    .where(and(
      eq(clubMembershipsTable.clubId, clubId),
      sql`${clubMembershipsTable.clubSection} @> ARRAY[${section}]::text[]`
    ));

  res.json({
    section,
    teams: teamsCount?.count ?? 0,
    players: playersCount?.count ?? 0,
    members: membersCount?.count ?? 0,
  });
});

export default router;
