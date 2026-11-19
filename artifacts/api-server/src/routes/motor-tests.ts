import { isDeepStrictEqual } from "node:util";
import { Router, type Request } from "express";
import { db, clubMembershipsTable, teamStaffAssignmentsTable, exercisesTable, playersTable, teamsTable, trainingAttendancesTable, trainingSessionExercisesTable, trainingSessionsTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { FITNESS_RESULTS_ROLES, motorTestCatalog, motorTestSessionInput, normalizeMotorResults, composeMotorStation, motorTestBoard, sessionTeamIds, trainingLocalSlot, trainingExerciseStationsMarker, type MotorPlayerResult, type MotorTestSession } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getPlayerMeasurementTeamScope, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { ensureMotorTestStorage, motorRows } from "../lib/motor-test-storage";
import { rosterMembers } from "../lib/training-roster-policy";
import { trainingAvailability } from "../lib/training-availability";
import { staffAttendance } from "../lib/attendance-notifications";

const catalog = new Map(motorTestCatalog.map(item => [item.id, item]));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function allowedTeams(req: Request) {
  if (!req.session.clubId || !FITNESS_RESULTS_ROLES.includes(normalizeSessionRole(req.session.role))) return [];
  const [scope, sections] = await Promise.all([getPlayerMeasurementTeamScope(req), resolveAllowedClubSections(req, undefined)]);
  const rows = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable).where(and(
    eq(teamsTable.clubId, req.session.clubId),
    scope ? (scope.size ? inArray(teamsTable.id, [...scope]) : sql`false`) : undefined,
    sections ? (sections.length ? inArray(teamsTable.clubSection, sections) : sql`false`) : undefined,
  )).orderBy(asc(teamsTable.name));
  return rows;
}

function eligibleSession(session: typeof trainingSessionsTable.$inferSelect, teamId: number, date: string) {
  return !!session.teamId && session.sessionKind === "regular" && !["cancelled", "canceled"].includes(session.status)
    && trainingLocalSlot(session.scheduledAt).date === date && sessionTeamIds(session.teamId, session.notes).includes(teamId);
}

export function motorTestsRouter(canEdit: (req: Request) => Promise<boolean>) {
  const router = Router();
  async function canRecordAsCoach(req: Request) {
    if(normalizeSessionRole(req.session.role)!=="coach" || !req.session.userId || !req.session.clubId) return false;
    const memberships=await db.select({staffRole:clubMembershipsTable.staffRole}).from(clubMembershipsTable).where(and(eq(clubMembershipsTable.clubId,req.session.clubId),eq(clubMembershipsTable.userId,req.session.userId)));
    return !memberships.some(member=>["collaboratore","stagista"].includes(normalizeSessionRole(member.staffRole)));
  }
  async function coachTeamIds(req: Request): Promise<number[]> {
    if(!await canRecordAsCoach(req)) return [];
    const [direct,assigned]=await Promise.all([
      db.select({id:teamsTable.id}).from(teamsTable).where(and(eq(teamsTable.clubId,req.session.clubId!),eq(teamsTable.coachId,req.session.userId!))),
      db.select({id:teamStaffAssignmentsTable.teamId}).from(teamStaffAssignmentsTable).where(and(eq(teamStaffAssignmentsTable.clubId,req.session.clubId!),eq(teamStaffAssignmentsTable.userId,req.session.userId!),eq(teamStaffAssignmentsTable.role,"coach"))),
    ]);
    return [...new Set([...direct,...assigned].map(row=>row.id))];
  }
  router.get("/motor-tests", requireAuth, async (req, res) => {
    if (!FITNESS_RESULTS_ROLES.includes(normalizeSessionRole(req.session.role))) { res.sendStatus(403); return; }
    const teams = await allowedTeams(req);
    await ensureMotorTestStorage();
    const sessions = teams.length ? motorRows<{ data: MotorTestSession }>(await db.execute(sql`
      SELECT data FROM motor_test_sessions WHERE club_id=${req.session.clubId}
        AND team_id IN (${sql.join(teams.map(team => sql`${team.id}`), sql`,`)})
      ORDER BY test_date DESC, id DESC`)).map(row => row.data) : [];
    const recordTeamIds=(await coachTeamIds(req)).filter(id=>teams.some(team=>team.id===id));
    res.json({ teams, sessions, canRecord: recordTeamIds.length>0, recordTeamIds });
  });

  router.get("/motor-tests/context", requireAuth, async (req, res) => {
    const teamId = Number(req.query.teamId), date = String(req.query.date ?? "");
    const linked = Number(req.query.trainingSessionId) || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(await allowedTeams(req)).some(team => team.id === teamId)) { res.sendStatus(403); return; }
    const clubId = req.session.clubId!;
    const [players, clubSessions] = await Promise.all([
      db.select({ id: playersTable.id, firstName: playersTable.firstName, lastName: playersTable.lastName, teamId: playersTable.teamId, notes: playersTable.notes, status: playersTable.status })
        .from(playersTable).where(eq(playersTable.clubId, clubId)).orderBy(asc(playersTable.lastName), asc(playersTable.firstName)),
      db.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId),
        sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date = ${date}::date`)).orderBy(asc(trainingSessionsTable.scheduledAt)),
    ]);
    const roster = rosterMembers(players, [teamId]).filter(player => player.status !== "training_trial");
    const sessions = clubSessions.filter(session => eligibleSession(session, teamId, date));
    const selected = linked ? sessions.find(session => session.id === linked) : sessions.length === 1 ? sessions[0] : undefined;
    if (linked && !selected) { res.status(400).json({ error: "La seduta collegata non appartiene al giorno o all’annata." }); return; }
    const slot = selected && trainingLocalSlot(selected.scheduledAt);
    const [family, coach] = selected && slot ? await Promise.all([
      trainingAvailability(clubId, teamId, date, slot.start, [teamId], [teamId], selected.durationMinutes ?? undefined),
      db.select({ id: trainingAttendancesTable.playerId, status: trainingAttendancesTable.status }).from(trainingAttendancesTable)
        .where(and(eq(trainingAttendancesTable.clubId, clubId), eq(trainingAttendancesTable.trainingSessionId, selected.id), staffAttendance)).orderBy(asc(trainingAttendancesTable.id)),
    ]) : [null, [] as { id: number; status: string }[]] as const;
    res.json({
      trainingSessionId: selected?.id ?? null,
      presentCount: roster.filter(player => coach.find(row => row.id === player.id)?.status === "present").length,
      sessions: sessions.map(session => ({ id: session.id, title: session.title, time: trainingLocalSlot(session.scheduledAt).start })),
      players: roster.map(player => ({ id: player.id, name: player.lastName + " " + player.firstName,
        family: family?.records.find(item => item.playerId === player.id)?.status ?? null,
        coach: coach.find(item => item.id === player.id)?.status ?? null })),
    });
  });

  router.put("/motor-tests/:id", requireAuth, async (req, res) => {
    const programEditor = await canEdit(req);
    if (!programEditor && !await canRecordAsCoach(req)) { res.sendStatus(403); return; }
    const id = String(req.params.id);
    const parsed = motorTestSessionInput.safeParse(req.body);
    if (!uuid.test(id) || !parsed.success) { res.status(400).json({ error: !parsed.success ? parsed.error.issues.map(issue => issue.message).slice(0,4).join(" · ") : "Identificativo della sessione non valido." }); return; }
    const input = normalizeMotorResults(parsed.data), clubId = req.session.clubId!, userId = req.session.userId!;
    if (!(await allowedTeams(req)).some(team => team.id === input.teamId)) { res.sendStatus(403); return; }
    if(!programEditor && !(await coachTeamIds(req)).includes(input.teamId)) { res.sendStatus(403);return; }
    if (Object.keys(input.results).length > 150 || (!input.linkProgram && input.tests.some(test => test.link) && !input.trainingSessionId)) {
      res.status(400).json({ error: "Scegli la seduta del mister per le prove da aggiungere." }); return;
    }
    await ensureMotorTestStorage();
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
      const previous = motorRows<{ clubId: number; createdAt: string; data: MotorTestSession }>(await tx.execute(sql`
        SELECT club_id AS "clubId", created_at::text AS "createdAt", data FROM motor_test_sessions WHERE id=${id}::uuid`))[0];
      if ((previous?.data.revision ?? 0) !== input.revision || (previous && (previous.clubId !== clubId || previous.data.teamId !== input.teamId || previous.data.date !== input.date || previous.data.cycle !== input.cycle))) {
        return { status: 409, error: "La sessione è cambiata. Ricarica prima di salvare." };
      }
      if (!programEditor && (!previous || !isDeepStrictEqual(
        { teamId: input.teamId, date: input.date, cycle: input.cycle, trainingSessionId: input.trainingSessionId, tests: input.tests, linkProgram: input.linkProgram, programPhase: input.programPhase },
        { teamId: previous.data.teamId, date: previous.data.date, cycle: previous.data.cycle, trainingSessionId: previous.data.trainingSessionId, tests: previous.data.tests, linkProgram: previous.data.linkProgram, programPhase: previous.data.programPhase },
      ))) return { status: 403, error: "Il mister può registrare i risultati del programma esistente; il preparatore gestisce sessione e programma." };
      const exerciseIds = { ...previous?.data.exerciseIds };
      let stationId = previous?.data.stationId;
      if (input.linkProgram && Object.keys(exerciseIds).length) {
        return { status: 409, error: "Questa sessione ha già prove singole nella seduta. Gestiscile dalla pagina Sedute." };
      }
      if (stationId && (!input.linkProgram || input.trainingSessionId !== previous?.data.trainingSessionId || input.programPhase !== previous?.data.programPhase)) {
        return { status: 409, error: "La seduta e la fase della stazione collegata vanno modificate dalla pagina Sedute." };
      }
      if (stationId && previous?.data.tests.some(test => !input.tests.some(next => next.id === test.id) && Object.values(previous.data.results).some(result => result.tests[test.id] != null || (test.id === "anthropometry" && (result.height != null || result.weight != null))))) {
        return { status: 409, error: "Non puoi rimuovere una prova con risultati già salvati." };
      }
      if (input.linkProgram && !input.trainingSessionId) {
        const candidates = (await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId),
          sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date = ${input.date}::date`)))
          .filter(session => eligibleSession(session, input.teamId, input.date));
        if (candidates.length !== 1) return { status: 400, error: candidates.length
          ? "Ci sono più sedute per questo giorno. Indica quella del mister a cui aggiungere il programma."
          : "Non ci sono sedute per questa annata e questo giorno." };
        input.trainingSessionId = candidates[0].id;
      }
      if (Object.keys(exerciseIds).length && (input.trainingSessionId !== previous?.data.trainingSessionId ||
        Object.keys(exerciseIds).some(key => !input.tests.some(test => test.id === key && test.link)))) {
        return { status: 409, error: "Le prove già inserite nella seduta vanno gestite dalla pagina Sedute." };
      }
      if (!input.trainingSessionId) {
        const sameDay = (await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId),
          sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date = ${input.date}::date`)))
          .filter(session => eligibleSession(session, input.teamId, input.date));
        if (sameDay.length === 1) input.trainingSessionId = sameDay[0].id;
        else if (sameDay.length > 1 && Object.keys(input.results).length) return { status: 400, error: "Seleziona la seduta del mister per usare l’appello corretto." };
      }
      const playerIds = Object.keys(input.results).map(Number).sort((a,b) => a-b);
      const players = playerIds.length ? await tx.select().from(playersTable).where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, playerIds)))
        .orderBy(asc(playersTable.id)).for("update") : [];
      const valid = new Set(rosterMembers(players, [input.teamId]).filter(player => player.status !== "training_trial").map(player => player.id));
      const knownResults = previous?.data.results ?? {};
      if(Object.keys(knownResults).some(playerId=>!Object.hasOwn(input.results,playerId))) return {status:409,error:"Il salvataggio non può eliminare le rilevazioni di altri giocatori. Ricarica la sessione."};
      if (playerIds.some(playerId => !valid.has(playerId) && !isDeepStrictEqual(knownResults[playerId], input.results[playerId]))) {
        return { status: 400, error: "Una valutazione riguarda un giocatore fuori dall’annata." };
      }
      const active = new Set(input.tests.map(test => test.id));
      for (const entry of Object.values(input.results)) {
        if (Object.keys(entry.tests).some(test => !active.has(test as typeof input.tests[number]["id"]))) {
          return { status: 400, error: "Una valutazione riguarda una prova rimossa." };
        }
      }
      if (input.trainingSessionId) {
        const [session] = await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId),
          eq(trainingSessionsTable.id, input.trainingSessionId))).for("update");
        if (!session || !eligibleSession(session, input.teamId, input.date)) return { status: 400, error: "La seduta deve appartenere all’annata e al giorno selezionati." };
        const recorded = await tx.select({ playerId: trainingAttendancesTable.playerId, status: trainingAttendancesTable.status })
          .from(trainingAttendancesTable).where(and(eq(trainingAttendancesTable.clubId, clubId),
            eq(trainingAttendancesTable.trainingSessionId, session.id), staffAttendance)).orderBy(asc(trainingAttendancesTable.id));
        const staffByPlayer = new Map([...recorded].reverse().map(row => [row.playerId, row.status]));
        const present = new Set([...staffByPlayer].filter(([, status]) => status === "present").map(([playerId]) => playerId));
        if (playerIds.some(playerId => !present.has(playerId) && !isDeepStrictEqual(input.results[playerId], knownResults[playerId]))) {
          return { status: 409, error: "Puoi valutare solo i presenti nell’appello della seduta. Aggiorna le presenze con il mister." };
        }
        if (stationId && programEditor) {
          const [station] = await tx.select().from(exercisesTable).where(and(eq(exercisesTable.id,stationId),eq(exercisesTable.clubId,clubId))).for("update");
          const [link] = await tx.select().from(trainingSessionExercisesTable).where(and(eq(trainingSessionExercisesTable.trainingSessionId,session.id),eq(trainingSessionExercisesTable.exerciseId,stationId)));
          if(!station || !link) return {status:409,error:"La stazione collegata non è più disponibile nella seduta. Ricarica la sessione."};
          if(!station.description?.includes(trainingExerciseStationsMarker)) return {status:409,error:"La stazione è stata modificata nella seduta. Controlla le esercitazioni prima di sincronizzarla."};
          let description:string;
          try { description=composeMotorStation(input.tests,station.description,id); } catch { return {status:409,error:"Le esercitazioni salvate nella stazione non sono leggibili. Controllale nella seduta prima di sincronizzare."}; }
          await tx.update(exercisesTable).set({description,durationMinutes:input.tests.reduce((sum,test)=>sum+test.minutes,0)}).where(eq(exercisesTable.id,stationId));
        }
        const pending = input.linkProgram ? [] : input.tests.filter(test => test.link && !exerciseIds[test.id]);
        if (pending.length || (input.linkProgram && !stationId)) {
          const [last] = await tx.select({ order: sql<number>`coalesce(max(${trainingSessionExercisesTable.order}), -1)::integer` })
            .from(trainingSessionExercisesTable).where(eq(trainingSessionExercisesTable.trainingSessionId, session.id));
          let order = last.order + 1;
          if (input.linkProgram) {
            const [station] = await tx.insert(exercisesTable).values({ clubId, teamId: session.teamId,
              createdByUserId: session.createdByUserId ?? userId, title: "Test motori", category: "Test motori",
              description: composeMotorStation(input.tests,undefined,id),
              statoLavagnaJson: motorTestBoard(input.tests[0].id),
              equipment: "Materiali indicati nelle singole prove della stazione.",
              trainingDay: input.date, trainingPhase: input.programPhase ?? "centrale",
              durationMinutes: input.tests.reduce((total, test) => total + test.minutes, 0),
            }).returning({ id: exercisesTable.id });
            await tx.insert(trainingSessionExercisesTable).values({ trainingSessionId: session.id, exerciseId: station.id, order: order++ });
            stationId = station.id;
          }
          for (const test of pending) {
            const item = catalog.get(test.id)!;
            const [exercise] = await tx.insert(exercisesTable).values({ clubId, teamId: session.teamId, createdByUserId: session.createdByUserId ?? userId,
              title: item.title, description: item.instructions, equipment: item.materials, durationMinutes: test.minutes, trainingDay: input.date,
              principio: item.principle, trainingPhase: test.phase, category: "Test motori", statoLavagnaJson: motorTestBoard(test.id) }).returning({ id: exercisesTable.id });
            await tx.insert(trainingSessionExercisesTable).values({ trainingSessionId: session.id, exerciseId: exercise.id, order: order++ });
            exerciseIds[test.id] = exercise.id;
          }
        }
      }
      if (input.cycle === "start" && active.has("anthropometry") && playerIds.length) {
        const year = Number(input.date.slice(0, 4)) - (Number(input.date.slice(5, 7)) < 7 ? 1 : 0);
        const seasonStart = String(year) + "-07-01";
        const alreadyStarted = new Set(motorRows<{ playerId: number }>(await tx.execute(sql`
          SELECT DISTINCT key::integer AS "playerId" FROM motor_test_sessions
          CROSS JOIN LATERAL jsonb_object_keys(data->'results') AS key
          WHERE club_id=${clubId} AND id<>${id}::uuid AND test_date BETWEEN ${seasonStart}::date AND ${input.date}::date
            AND (test_date < ${input.date}::date OR created_at < coalesce(${previous?.createdAt ?? null}::timestamptz, now()))
            AND data->>'cycle'='start'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'tests') AS proof WHERE proof->>'id'='anthropometry')
            AND key IN (${sql.join(playerIds.map(playerId => sql`${String(playerId)}`), sql`,`)})`)).map(row => row.playerId));
        for (const player of players.filter(player => valid.has(player.id) && !alreadyStarted.has(player.id))) {
          const { height, weight } = input.results[player.id] as MotorPlayerResult;
          const history = player.profileHistory;
          const entry = history?.entry ?? { source: "legacy" as const, date: null, position: player.position, jerseyNumber: player.jerseyNumber, height: player.height, weight: player.weight };
          const validMeasurement = (value?: number | null) => typeof value === "number" && value > 0;
          const initialHeight = validMeasurement(entry.height) ? entry.height : validMeasurement(player.height) ? player.height : height == null ? null : Math.round(height);
          const initialWeight = validMeasurement(entry.weight) ? entry.weight : validMeasurement(player.weight) ? player.weight : weight == null ? null : Math.round(weight);
          const addHeight = !validMeasurement(player.height) && !validMeasurement(entry.height) && initialHeight != null && initialHeight > 0;
          const addWeight = !validMeasurement(player.weight) && !validMeasurement(entry.weight) && initialWeight != null && initialWeight > 0;
          if (!addHeight && !addWeight) continue;
          await tx.update(playersTable).set({
            ...(addHeight ? { height: initialHeight } : {}), ...(addWeight ? { weight: initialWeight } : {}),
            profileHistory: { entry: { ...entry, height: initialHeight, weight: initialWeight }, changes: history?.changes ?? [] },
          }).where(and(eq(playersTable.id, player.id), eq(playersTable.clubId, clubId)));
        }
      }
      const data: MotorTestSession = { ...input, revision: input.revision + 1, id, exerciseIds, stationId };
      await tx.execute(sql`INSERT INTO motor_test_sessions(id, club_id, team_id, test_date, data)
        VALUES(${id}::uuid,${clubId},${input.teamId},${input.date}::date,${JSON.stringify(data)}::jsonb)
        ON CONFLICT(id) DO UPDATE SET test_date=excluded.test_date, data=excluded.data`);
      return { data };
    });
    if ("error" in result) { res.status(result.status ?? 400).json({ error: result.error }); return; }
    res.json(result.data);
  });
  return router;
}
