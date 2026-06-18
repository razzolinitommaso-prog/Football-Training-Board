import { Router, type IRouter } from "express";
import { db, trainingAttendancesTable, playersTable, teamStaffAssignmentsTable, teamsTable, trainingSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const ATTENDANCE_MANAGE_ALL_ROLES = ["admin", "presidente", "director", "technical_director", "secretary"];
const ATTENDANCE_TEAM_ROLES = ["coach", "fitness_coach", "athletic_director"];

async function getSessionForAttendance(sessionId: number, clubId: number) {
  const [session] = await db
    .select()
    .from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.id, sessionId), eq(trainingSessionsTable.clubId, clubId)))
    .limit(1);
  return session ?? null;
}

async function userCanManageAttendanceForSession(userId: number, clubId: number, role: string, sessionId: number): Promise<boolean> {
  if (ATTENDANCE_MANAGE_ALL_ROLES.includes(role)) return true;
  if (!ATTENDANCE_TEAM_ROLES.includes(role)) return false;
  const session = await getSessionForAttendance(sessionId, clubId);
  if (!session?.teamId) return false;

  const [assignment] = await db
    .select({ id: teamStaffAssignmentsTable.id })
    .from(teamStaffAssignmentsTable)
    .where(and(
      eq(teamStaffAssignmentsTable.clubId, clubId),
      eq(teamStaffAssignmentsTable.userId, userId),
      eq(teamStaffAssignmentsTable.teamId, session.teamId),
    ))
    .limit(1);
  if (assignment) return true;

  const [team] = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(and(eq(teamsTable.id, session.teamId), eq(teamsTable.clubId, clubId), eq(teamsTable.coachId, userId)))
    .limit(1);
  return !!team;
}

async function playerIsValidForSession(playerId: number, clubId: number, sessionId: number): Promise<boolean> {
  const session = await getSessionForAttendance(sessionId, clubId);
  if (!session) return false;
  const conditions = [
    eq(playersTable.id, playerId),
    eq(playersTable.clubId, clubId),
  ];
  if (session.teamId) {
    conditions.push(eq(playersTable.teamId, session.teamId));
  }
  const [player] = await db.select({ id: playersTable.id }).from(playersTable).where(and(...conditions)).limit(1);
  return !!player;
}

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const sessionId = req.query.sessionId ? parseInt(req.query.sessionId as string) : null;
  if (!sessionId || isNaN(sessionId)) { res.status(400).json({ error: "sessionId required" }); return; }
  if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
    res.status(403).json({ error: "Non autorizzato a visualizzare presenze di questa sessione" });
    return;
  }
  const records = await db.select().from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.trainingSessionId, sessionId), eq(trainingAttendancesTable.clubId, req.session.clubId!)));
  const enriched = await Promise.all(records.map(async (r) => {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, r.playerId), eq(playersTable.clubId, req.session.clubId!)));
    return { ...r, playerName: player ? `${player.firstName} ${player.lastName}` : null, notes: r.notes ?? null };
  }));
  res.json(enriched);
});

router.post("/attendance", requireAuth, async (req, res): Promise<void> => {
  const { trainingSessionId, playerId, status, notes } = req.body;
  if (!trainingSessionId || !playerId) { res.status(400).json({ error: "trainingSessionId and playerId required" }); return; }
  const sessionId = Number(trainingSessionId);
  const playerNumericId = Number(playerId);
  if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
    res.status(403).json({ error: "Non autorizzato a modificare presenze di questa sessione" });
    return;
  }
  if (!(await playerIsValidForSession(playerNumericId, req.session.clubId!, sessionId))) {
    res.status(400).json({ error: "Giocatore non valido per questa sessione" });
    return;
  }
  const existing = await db.select().from(trainingAttendancesTable)
    .where(and(
      eq(trainingAttendancesTable.trainingSessionId, sessionId),
      eq(trainingAttendancesTable.playerId, playerNumericId),
      eq(trainingAttendancesTable.clubId, req.session.clubId!),
    ));
  if (existing.length > 0) {
    const [updated] = await db.update(trainingAttendancesTable).set({ status: status ?? "present", notes: notes ?? null })
      .where(eq(trainingAttendancesTable.id, existing[0].id)).returning();
    res.json(updated);
    return;
  }
  const [record] = await db.insert(trainingAttendancesTable).values({
    trainingSessionId: sessionId, playerId: playerNumericId,
    clubId: req.session.clubId!, status: status ?? "present", notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, notes } = req.body;
  const [existing] = await db
    .select()
    .from(trainingAttendancesTable)
    .where(and(eq(trainingAttendancesTable.id, id), eq(trainingAttendancesTable.clubId, req.session.clubId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", existing.trainingSessionId))) {
    res.status(403).json({ error: "Non autorizzato a modificare presenze di questa sessione" });
    return;
  }
  const [record] = await db.update(trainingAttendancesTable).set({ status, notes })
    .where(and(eq(trainingAttendancesTable.id, id), eq(trainingAttendancesTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

export default router;
