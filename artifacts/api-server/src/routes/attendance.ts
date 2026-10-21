import { saveAttendanceAndNotify } from "../lib/attendance-notifications";
import { trainingAvailability } from "../lib/training-availability";
import { Router, type IRouter } from "express";
import { db, trainingAttendancesTable, playersTable, teamStaffAssignmentsTable, teamsTable, trainingSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const ATTENDANCE_MANAGE_ALL_ROLES = ["admin", "presidente", "director", "sporting_director", "technical_director", "secretary"];
const ATTENDANCE_TEAM_ROLES = ["coach", "fitness_coach", "athletic_director"];
type PlayerAvailabilityOverrideFields = {
  availabilityOverrideActive?: boolean | null;
  availabilityOverrideFrom?: string | null;
  availabilityOverrideUntil?: string | null;
};
const PLAYER_META_MARKER = "[FTB_PLAYER_META]";

function extractSupplementalTeamId(notes?: string | null): number | null {
  const full = String(notes ?? "").trim();
  if (!full.startsWith(PLAYER_META_MARKER)) return null;
  const metaStart = PLAYER_META_MARKER.length;
  const nextNewLineIdx = full.indexOf("\n");
  const encodedMeta = nextNewLineIdx >= 0
    ? full.slice(metaStart, nextNewLineIdx).trim()
    : full.slice(metaStart).trim();
  try {
    const parsed = JSON.parse(encodedMeta) as { supplementalTeamId?: unknown };
    const id = Number(parsed?.supplementalTeamId);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

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
  const [player] = await db
    .select({ id: playersTable.id, teamId: playersTable.teamId, notes: playersTable.notes })
    .from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)))
    .limit(1);
  if (!player) return false;
  if (!session.teamId) return true;
  return player.teamId === session.teamId || extractSupplementalTeamId(player.notes) === session.teamId;
}

function playerHasActiveAvailabilityOverride(player: typeof playersTable.$inferSelect): boolean {
  const availabilityOverride = player as typeof player & PlayerAvailabilityOverrideFields;
  if (availabilityOverride.availabilityOverrideActive !== true) return false;
  const today = new Date().toISOString().slice(0, 10);
  const from = String(availabilityOverride.availabilityOverrideFrom ?? "");
  const until = String(availabilityOverride.availabilityOverrideUntil ?? "");
  if (!until) return false;
  if (from && from > today) return false;
  if (until < today) return false;
  return true;
}

async function playerCanAttend(playerId: number, clubId: number): Promise<{ ok: boolean; reason?: string | null }> {
  const [player] = await db.select().from(playersTable)
    .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId)))
    .limit(1);
  if (!player) return { ok: false, reason: "Giocatore non trovato" };
  if (player.available !== false) return { ok: true };
  if (playerHasActiveAvailabilityOverride(player)) return { ok: true };
  return { ok: false, reason: player.unavailabilityReason ?? "non_disponibile" };
}

router.get("/training-availability", requireAuth, async (req,res):Promise<void>=>{
  const clubId=req.session.clubId!, teamId=Number(req.query.teamId);
  const date=String(req.query.date??""),start=String(req.query.start??"");
  if(!Number.isInteger(teamId)||teamId<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!Number.isFinite(Date.parse(date))){res.status(400).json({error:"Squadra, data e orario richiesti"});return;}
  const [team]=await db.select({id:teamsTable.id,coachId:teamsTable.coachId}).from(teamsTable).where(and(eq(teamsTable.clubId,clubId),eq(teamsTable.id,teamId))).limit(1);
  if(!team){res.status(403).json({error:"Squadra non autorizzata"});return;}
  let allowed=ATTENDANCE_MANAGE_ALL_ROLES.includes(req.session.role??"");
  if(!allowed&&ATTENDANCE_TEAM_ROLES.includes(req.session.role??"")){
    const [assignment]=await db.select({id:teamStaffAssignmentsTable.id}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,clubId),eq(teamStaffAssignmentsTable.teamId,teamId),eq(teamStaffAssignmentsTable.userId,req.session.userId!))).limit(1);
    allowed=Boolean(assignment)||team.coachId===req.session.userId;
  }
  if(!allowed){res.status(403).json({error:"Squadra non autorizzata"});return;}
  res.json(await trainingAvailability(clubId,teamId,date,start));
});

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

router.get("/attendance-summary", requireAuth, async (req, res): Promise<void> => {
  const rawIds = String(req.query.sessionIds ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
  const sessionIds = Array.from(new Set(rawIds)).slice(0, 80);
  if (sessionIds.length === 0) {
    res.json({});
    return;
  }

  const summaries: Record<number, { present: number; absent: number; requested: number; injured: number; total: number; recorded: number; percentage: number }> = {};
  for (const sessionId of sessionIds) {
    if (!(await userCanManageAttendanceForSession(req.session.userId!, req.session.clubId!, req.session.role ?? "", sessionId))) {
      continue;
    }
    const session = await getSessionForAttendance(sessionId, req.session.clubId!);
    if (!session) continue;

    const players = await db
      .select({ id: playersTable.id, teamId: playersTable.teamId, notes: playersTable.notes })
      .from(playersTable)
      .where(eq(playersTable.clubId, req.session.clubId!));
    const total = session.teamId
      ? players.filter((player) => player.teamId === session.teamId || extractSupplementalTeamId(player.notes) === session.teamId).length
      : players.length;

    const records = await db
      .select({ status: trainingAttendancesTable.status })
      .from(trainingAttendancesTable)
      .where(and(eq(trainingAttendancesTable.trainingSessionId, sessionId), eq(trainingAttendancesTable.clubId, req.session.clubId!)));
    const present = records.filter((record) => record.status === "present").length;
    const absent = records.filter((record) => record.status === "absent").length;
    const requested = records.filter((record) => record.status === "requested").length;
    const injured = records.filter((record) => record.status === "injured").length;
    const recorded = present + absent + requested + injured;
    const denominator = total || recorded;
    const percentage = denominator > 0 ? Math.round((present / denominator) * 100) : 0;
    summaries[sessionId] = { present, absent, requested, injured, total, recorded, percentage };
  }

  res.json(summaries);
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
  const nextStatus = status ?? "present";
  if (nextStatus !== "absent") {
    const availability = await playerCanAttend(playerNumericId, req.session.clubId!);
    if (!availability.ok) {
      res.status(400).json({ error: "Giocatore non disponibile per questa sessione", reason: availability.reason });
      return;
    }
  }
  const saved=await saveAttendanceAndNotify({clubId:req.session.clubId!,sessionId,playerId:playerNumericId,status:nextStatus,notes:notes??null});
  res.status(saved?.created?201:200).json(saved?.record);

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
  const saved=await saveAttendanceAndNotify({id,clubId:req.session.clubId!,sessionId:existing.trainingSessionId,playerId:existing.playerId,status,notes});
  if(!saved){res.status(404).json({error:"Not found"});return;}
  res.json(saved.record);
});

export default router;
