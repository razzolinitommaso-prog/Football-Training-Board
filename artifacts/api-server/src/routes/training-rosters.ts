import { Router, type Request } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, teamsTable, playersTable, teamStaffAssignmentsTable, trainingRosterGroupsTable as groups, trainingRosterGroupTeamsTable as links, trainingRosterGroupPlayersTable as members } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isClubWideListRole, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { playerBirthYear, rosterMembers, supplementalTrainingRole } from "../lib/training-roster-policy";

const router = Router();
let schemaReady: Promise<unknown> | undefined;
function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS training_roster_groups (
      id SERIAL PRIMARY KEY, club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE, name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('shared','work')), anchor_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
      criterion TEXT NOT NULL DEFAULT 'manual', birth_year INTEGER, archived BOOLEAN NOT NULL DEFAULT false)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS training_roster_group_teams (
      group_id INTEGER NOT NULL REFERENCES training_roster_groups(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS training_roster_group_team_unique ON training_roster_group_teams(team_id)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS training_roster_group_players (
      group_id INTEGER NOT NULL REFERENCES training_roster_groups(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS training_roster_group_player_unique ON training_roster_group_players(group_id,player_id)`);
  })().catch(error => { schemaReady = undefined; throw error; });
  return schemaReady;
}
const STAFF = new Set(["coach", "fitness_coach", "athletic_director"]);
async function context(req: Request) {
  const clubId = Number(req.session.clubId), userId = Number(req.session.userId);
  const role = normalizeSessionRole(req.session.role);
  const sections = await resolveAllowedClubSections(req, undefined);
  let teams = await db.select().from(teamsTable).where(eq(teamsTable.clubId, clubId));
  if (sections) teams = teams.filter(team => sections.includes(team.clubSection));
  if (!isClubWideListRole(role)) {
    if (!STAFF.has(role)) teams = [];
    else {
      const assignments = await db.select().from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId, clubId), eq(teamStaffAssignmentsTable.userId, userId)));
      const ids = new Set(assignments.map(row => row.teamId));
      teams = teams.filter(team => team.coachId === userId || ids.has(team.id));
    }
  }
  return { clubId, role, teams, allowed: new Set(teams.map(team => team.id)) };
}
async function configuration(req: Request) {
  const ctx = await context(req);
  const rows = await db.select().from(groups).where(and(eq(groups.clubId, ctx.clubId), eq(groups.archived, false)));
  const ids = rows.map(row => row.id);
  const teamLinks = ids.length ? await db.select().from(links).where(inArray(links.groupId, ids)) : [];
  const playerLinks = ids.length ? await db.select().from(members).where(inArray(members.groupId, ids)) : [];
  const sharedGroups = rows.filter(row => row.kind === "shared").map(row => ({ ...row, teamIds: teamLinks.filter(link => link.groupId === row.id).map(link => link.teamId) })).filter(row => row.teamIds.length >= 2 && row.teamIds.every(id => ctx.allowed.has(id)));
  const workGroups = rows.filter(row => row.kind === "work" && row.anchorTeamId && ctx.allowed.has(row.anchorTeamId)).filter(row => {
    const shared = rows.find(group => group.kind === "shared" && teamLinks.some(link => link.groupId === group.id && link.teamId === row.anchorTeamId));
    return !shared || sharedGroups.some(group => group.id === shared.id);
  }).map(row => ({ ...row, playerIds: playerLinks.filter(link => link.groupId === row.id).map(link => link.playerId) }));
  return { ...ctx, sharedGroups, workGroups };
}
async function roster(config: Awaited<ReturnType<typeof configuration>>, teamId: number, shared: boolean) {
  const group = shared ? config.sharedGroups.find(row => row.teamIds.includes(teamId)) : undefined;
  const teamIds = group?.teamIds ?? [teamId];
  const clubPlayers = await db.select().from(playersTable).where(eq(playersTable.clubId, config.clubId));
  const players = rosterMembers(clubPlayers, teamIds);
  return { group, teamIds, teamPlayerIds: rosterMembers(clubPlayers, [teamId]).map(player => player.id), players: players.map(player => ({ id: player.id, firstName: player.firstName, lastName: player.lastName, dateOfBirth: player.dateOfBirth, teamId: player.teamId, teamName: config.teams.find(team => team.id === player.teamId)?.name ?? null, position: teamIds.includes(player.teamId ?? -1) ? player.position : supplementalTrainingRole(player.notes) ?? player.position, jerseyNumber: player.jerseyNumber, available: player.available })) };
}
router.use("/training-rosters", requireAuth, async (_req, _res, next) => { try { await ensureSchema(); next(); } catch (error) { next(error); } });
router.get("/training-rosters/config", async (req, res) => {
  const config = await configuration(req);
  res.json({ teams: config.teams.map(team => ({ id: team.id, name: team.name, seasonId: team.seasonId, clubSection: team.clubSection })), sharedGroups: config.sharedGroups, workGroups: config.workGroups });
});
router.get("/training-rosters/:teamId", async (req, res) => {
  const config = await configuration(req), teamId = Number(req.params.teamId);
  if (!config.allowed.has(teamId)) { res.status(403).json({ error: "Squadra non autorizzata" }); return; }
  const result = await roster(config, teamId, req.query.scope === "shared");
  const workGroups = config.workGroups.filter(group => result.teamIds.includes(group.anchorTeamId!)).map(group => ({ ...group, playerIds: result.players.filter(player => group.criterion === "year" ? playerBirthYear(player.dateOfBirth) === group.birthYear : group.playerIds.includes(player.id)).map(player => player.id) }));
  res.json({ ...result, workGroups });
});
async function saveGroup(req: Request, res: import("express").Response) {
  const config = await configuration(req);
  if (!isClubWideListRole(config.role) && !STAFF.has(config.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = req.params.id ? Number(req.params.id) : null;
  const current = id ? [...config.sharedGroups, ...config.workGroups].find(row => row.id === id) : null;
  if (id && !current) { res.status(403).json({ error: "Gruppo non autorizzato" }); return; }
  const name = String(req.body.name ?? "").trim();
  const kind = req.body.kind;
  if (!name || name.length > 100 || !["shared", "work"].includes(kind) || (current && current.kind !== kind)) { res.status(400).json({ error: "Nome o tipo non valido" }); return; }
  const teamIds = Array.from(new Set<number>(Array.isArray(req.body.teamIds) ? req.body.teamIds : []));
  const anchorTeamId = kind === "work" ? Number(req.body.anchorTeamId) : null;
  const usedTeamIds = kind === "shared" ? teamIds : [anchorTeamId!];
  if ((kind === "shared" && teamIds.length < 2) || usedTeamIds.some(teamId => !Number.isInteger(teamId) || !config.allowed.has(teamId))) { res.status(400).json({ error: "Seleziona squadre autorizzate" }); return; }
  const teams = config.teams.filter(team => usedTeamIds.includes(team.id));
  if (new Set(teams.map(team => team.seasonId)).size > 1 || new Set(teams.map(team => team.clubSection)).size > 1) { res.status(400).json({ error: "Le squadre devono appartenere alla stessa stagione e sezione" }); return; }
  const criterion = kind === "work" ? String(req.body.criterion) : "manual";
  const birthYear = criterion === "year" ? Number(req.body.birthYear) : null;
  if (!["manual", "year", "level", "objective"].includes(criterion) || (criterion === "year" && (!Number.isInteger(birthYear) || birthYear! < 1900 || birthYear! > 2200))) { res.status(400).json({ error: "Criterio o annata non validi" }); return; }
  const playerIds = Array.from(new Set<number>(Array.isArray(req.body.playerIds) ? req.body.playerIds : []));
  if (kind === "work") {
    const currentRoster = await roster(config, anchorTeamId!, true);
    if (playerIds.some(playerId => !currentRoster.players.some(player => player.id === playerId)) || (criterion !== "year" && !playerIds.length)) { res.status(400).json({ error: "Seleziona giocatori della rosa autorizzata" }); return; }
  }
  try {
    const result = await db.transaction(async tx => {
      const values = { clubId: config.clubId, seasonId: teams[0].seasonId, name, kind, anchorTeamId, criterion, birthYear };
      const [group] = id ? await tx.update(groups).set(values).where(and(eq(groups.id, id), eq(groups.clubId, config.clubId), eq(groups.archived, false))).returning() : await tx.insert(groups).values(values).returning();
      if (!group) throw Object.assign(new Error("Il gruppo è stato disattivato. Ricarica la lista."), { code: "GROUP_CHANGED" });
      await tx.delete(links).where(eq(links.groupId, group.id));
      await tx.delete(members).where(eq(members.groupId, group.id));
      if (kind === "shared") await tx.insert(links).values(teamIds.map(teamId => ({ groupId: group.id, teamId })));
      if (kind === "work" && criterion !== "year") await tx.insert(members).values(playerIds.map(playerId => ({ groupId: group.id, playerId })));
      return group;
    });
    res.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === "GROUP_CHANGED") { res.status(409).json({ error: (error as Error).message }); return; }
    if ((error as { cause?: { code?: string }; code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") { res.status(409).json({ error: "Una squadra appartiene già a un gruppo condiviso. Modifica o disattiva prima quel gruppo." }); return; }
    throw error;
  }
}
router.post("/training-rosters/groups", saveGroup);
router.put("/training-rosters/groups/:id", saveGroup);
router.delete("/training-rosters/groups/:id", async (req, res) => {
  const config = await configuration(req), id = Number(req.params.id);
  if (![...config.sharedGroups, ...config.workGroups].some(group => group.id === id)) { res.status(403).json({ error: "Gruppo non autorizzato" }); return; }
  await db.transaction(async tx => {
    await tx.update(groups).set({ archived: true }).where(and(eq(groups.id, id), eq(groups.clubId, config.clubId)));
    await tx.delete(links).where(eq(links.groupId, id));
  });
  res.json({ archived: true });
});
export default router;
