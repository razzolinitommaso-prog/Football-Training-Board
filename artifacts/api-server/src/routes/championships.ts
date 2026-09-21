import { Router, type IRouter } from "express";
import {
  championshipFixturesTable,
  championshipGroupsTable,
  championshipsTable,
  db,
  matchesTable,
  teamsTable,
  type ChampionshipPointsRule,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const MANAGE_ROLES = ["admin", "presidente", "director", "secretary", "sporting_director", "technical_director"];
const SECTION_VALUES = new Set(["scuola_calcio", "settore_giovanile", "prima_squadra"]);
const LEG_VALUES = new Set(["andata", "ritorno"]);
const DEFAULT_POINTS_RULE: ChampionshipPointsRule = { win: 3, draw: 1, loss: 0 };

type StandingRow = {
  team: string;
  pg: number;
  v: number;
  n: number;
  p: number;
  gf: number;
  gs: number;
  dr: number;
  pts: number;
};

function normalizeSection(value: unknown): string | null {
  const section = String(value ?? "").trim();
  return SECTION_VALUES.has(section) ? section : null;
}

function normalizePointsRule(value: unknown): ChampionshipPointsRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_POINTS_RULE;
  const row = value as Record<string, unknown>;
  const win = Number(row.win);
  const draw = Number(row.draw);
  const loss = Number(row.loss);
  return {
    win: Number.isFinite(win) ? win : DEFAULT_POINTS_RULE.win,
    draw: Number.isFinite(draw) ? draw : DEFAULT_POINTS_RULE.draw,
    loss: Number.isFinite(loss) ? loss : DEFAULT_POINTS_RULE.loss,
  };
}

function normalizeLeg(value: unknown): string | null {
  const leg = String(value ?? "").trim().toLowerCase();
  return LEG_VALUES.has(leg) ? leg : null;
}

function scoreValue(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function tableKey(team: string): string {
  return team
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function standingsFor(
  fixtures: Array<{ homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }>,
  pointsRule: ChampionshipPointsRule,
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const ensure = (team: string) => {
    const key = tableKey(team);
    if (!table.has(key)) table.set(key, { team, pg: 0, v: 0, n: 0, p: 0, gf: 0, gs: 0, dr: 0, pts: 0 });
    return table.get(key)!;
  };

  for (const fixture of fixtures) {
    const home = ensure(fixture.homeTeam);
    const away = ensure(fixture.awayTeam);
    if (fixture.homeScore == null || fixture.awayScore == null) continue;
    home.pg += 1;
    away.pg += 1;
    home.gf += fixture.homeScore;
    home.gs += fixture.awayScore;
    away.gf += fixture.awayScore;
    away.gs += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) {
      home.v += 1;
      home.pts += pointsRule.win;
      away.p += 1;
      away.pts += pointsRule.loss;
    } else if (fixture.homeScore < fixture.awayScore) {
      away.v += 1;
      away.pts += pointsRule.win;
      home.p += 1;
      home.pts += pointsRule.loss;
    } else {
      home.n += 1;
      away.n += 1;
      home.pts += pointsRule.draw;
      away.pts += pointsRule.draw;
    }
  }

  return [...table.values()]
    .map((row) => ({ ...row, dr: row.gf - row.gs }))
    .sort((a, b) => b.pts - a.pts || b.dr - a.dr || b.gf - a.gf || a.pg - b.pg || a.team.localeCompare(b.team, "it"));
}

async function teamBelongsToClub(teamId: number | null, clubId: number): Promise<boolean> {
  if (!teamId) return true;
  const [team] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, teamId), eq(teamsTable.clubId, clubId)))
    .limit(1);
  return !!team;
}

async function enrichedChampionships(params: { clubId: number; section?: string | null; teamId?: number | null }) {
  const conditions = [eq(championshipsTable.clubId, params.clubId) as any];
  if (params.section) conditions.push(eq(championshipsTable.section, params.section) as any);
  if (params.teamId) conditions.push(eq(championshipsTable.teamId, params.teamId) as any);

  const championships = await db
    .select()
    .from(championshipsTable)
    .where(and(...conditions))
    .orderBy(asc(championshipsTable.title));
  const ids = championships.map((item) => item.id);
  if (ids.length === 0) return [];

  const groups = await db
    .select()
    .from(championshipGroupsTable)
    .where(and(eq(championshipGroupsTable.clubId, params.clubId), inArray(championshipGroupsTable.championshipId, ids)))
    .orderBy(asc(championshipGroupsTable.name));
  const fixtures = await db
    .select()
    .from(championshipFixturesTable)
    .where(and(eq(championshipFixturesTable.clubId, params.clubId), inArray(championshipFixturesTable.championshipId, ids)))
    .orderBy(asc(championshipFixturesTable.date), asc(championshipFixturesTable.round), asc(championshipFixturesTable.id));
  const matchIds = fixtures.map((fixture) => fixture.matchId).filter((id): id is number => typeof id === "number");
  const linkedMatches = matchIds.length > 0
    ? await db.select({ id: matchesTable.id, result: matchesTable.result }).from(matchesTable).where(inArray(matchesTable.id, matchIds))
    : [];
  const resultByMatchId = new Map(linkedMatches.map((match) => [match.id, match.result]));

  return championships.map((championship) => {
    const pointsRule = normalizePointsRule(championship.pointsRule);
    const championshipGroups = groups.filter((group) => group.championshipId === championship.id);
    return {
      ...championship,
      pointsRule,
      groups: championshipGroups.map((group) => {
        const groupFixtures = fixtures
          .filter((fixture) => fixture.groupId === group.id)
          .map((fixture) => {
            const linkedResult = fixture.matchId ? resultByMatchId.get(fixture.matchId) : null;
            return { ...fixture, linkedResult: linkedResult ?? null };
          });
        return {
          ...group,
          fixtures: groupFixtures,
          standings: standingsFor(groupFixtures, pointsRule),
        };
      }),
    };
  });
}

router.get("/championships", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  const section = normalizeSection(req.query.section);
  const teamIdRaw = req.query.teamId == null ? null : Number(req.query.teamId);
  const teamId = Number.isFinite(teamIdRaw) && teamIdRaw! > 0 ? teamIdRaw : null;
  res.json(await enrichedChampionships({ clubId, section, teamId }));
});

router.post("/championships", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a creare campionati" });
    return;
  }
  const title = String(req.body?.title ?? "").trim();
  const section = normalizeSection(req.body?.section);
  const teamIdRaw = req.body?.teamId == null ? null : Number(req.body.teamId);
  const teamId = Number.isFinite(teamIdRaw) && teamIdRaw! > 0 ? teamIdRaw : null;
  if (!title || !section) {
    res.status(400).json({ error: "Titolo e sezione sono obbligatori" });
    return;
  }
  if (!(await teamBelongsToClub(teamId, clubId))) {
    res.status(400).json({ error: "Squadra non valida per questa societa" });
    return;
  }
  const [championship] = await db
    .insert(championshipsTable)
    .values({
      clubId,
      section,
      teamId,
      seasonId: req.body?.seasonId ?? null,
      title,
      category: String(req.body?.category ?? "").trim() || null,
      pointsRule: normalizePointsRule(req.body?.pointsRule),
      createdByUserId: req.session.userId ?? null,
    })
    .returning();
  await db.insert(championshipGroupsTable).values({
    clubId,
    championshipId: championship.id,
    name: String(req.body?.groupName ?? "").trim() || "Girone",
  });
  res.status(201).json((await enrichedChampionships({ clubId, section, teamId })).find((item) => item.id === championship.id));
});

router.patch("/championship-fixtures/:id/result", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a modificare risultati campionato" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Fixture non valida" });
    return;
  }
  const homeScore = scoreValue(req.body?.homeScore);
  const awayScore = scoreValue(req.body?.awayScore);
  const [updated] = await db
    .update(championshipFixturesTable)
    .set({ homeScore, awayScore, updatedAt: new Date() })
    .where(and(eq(championshipFixturesTable.id, id), eq(championshipFixturesTable.clubId, clubId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Partita girone non trovata" });
    return;
  }
  res.json(updated);
});

router.post("/championships/:id/fixtures", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId;
  if (!clubId) {
    res.status(400).json({ error: "Club context required" });
    return;
  }
  if (!MANAGE_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato a creare partite girone" });
    return;
  }
  const championshipId = Number(req.params.id);
  const groupId = Number(req.body?.groupId);
  const homeTeam = String(req.body?.homeTeam ?? "").trim();
  const awayTeam = String(req.body?.awayTeam ?? "").trim();
  if (!Number.isInteger(championshipId) || !Number.isInteger(groupId) || !homeTeam || !awayTeam) {
    res.status(400).json({ error: "Campionato, girone, casa e trasferta sono obbligatori" });
    return;
  }
  const [championship] = await db
    .select()
    .from(championshipsTable)
    .where(and(eq(championshipsTable.id, championshipId), eq(championshipsTable.clubId, clubId)))
    .limit(1);
  const [group] = await db
    .select()
    .from(championshipGroupsTable)
    .where(and(eq(championshipGroupsTable.id, groupId), eq(championshipGroupsTable.championshipId, championshipId), eq(championshipGroupsTable.clubId, clubId)))
    .limit(1);
  if (!championship || !group) {
    res.status(404).json({ error: "Campionato o girone non trovato" });
    return;
  }
  const dateRaw = String(req.body?.date ?? "").trim();
  const date = dateRaw ? new Date(dateRaw) : null;
  const [fixture] = await db
    .insert(championshipFixturesTable)
    .values({
      clubId,
      championshipId,
      groupId,
      homeTeam,
      awayTeam,
      round: req.body?.round == null ? null : Number(req.body.round),
      leg: normalizeLeg(req.body?.leg),
      date: date && !Number.isNaN(date.getTime()) ? date : null,
      location: String(req.body?.location ?? "").trim() || null,
      notes: String(req.body?.notes ?? "").trim() || null,
      homeScore: scoreValue(req.body?.homeScore),
      awayScore: scoreValue(req.body?.awayScore),
    })
    .returning();
  res.status(201).json(fixture);
});

export default router;
