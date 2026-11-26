import { isDeepStrictEqual } from "node:util";
import { Router, type Request } from "express";
import { db, exercisesTable, playersTable, teamsTable, trainingAttendancesTable, trainingSessionExercisesTable, trainingSessionsTable } from "@workspace/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { FITNESS_RESULTS_ROLES, motorTestCatalog, motorTestSessionInput, normalizeMotorResults, composeMotorStation, motorTestBoard, sessionTeamIds, trainingLocalSlot, trainingExerciseStationsMarker, type MotorPlayerResult, type MotorTestSession } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getPlayerMeasurementTeamScope, normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { ensureMotorTestStorage, motorRows } from "../lib/motor-test-storage";
import { ensurePlayerMeasurementStorage, refreshPlayerMeasurements } from "../lib/player-measurements";
import { rosterMembers } from "../lib/training-roster-policy";
import { trainingAvailability } from "../lib/training-availability";
import { staffAttendance } from "../lib/attendance-notifications";

const catalog = new Map(motorTestCatalog.map(item => [item.id, item]));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function allowedTeams(req: Request) {
  if (!req.session.clubId || !FITNESS_RESULTS_ROLES.includes(normalizeSessionRole(req.session.role))) return [];
  const [scope, sections] = await Promise.all([getPlayerMeasurementTeamScope(req), resolveAllowedClubSections(req, undefined)]);
  const rows = await db.select({ id: teamsTable.id, name: teamsTable.name, clubSection: teamsTable.clubSection }).from(teamsTable).where(and(
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
  router.get("/motor-tests", requireAuth, async (req, res) => {
    if (!FITNESS_RESULTS_ROLES.includes(normalizeSessionRole(req.session.role))) { res.sendStatus(403); return; }
    const teams = await allowedTeams(req);
    await ensureMotorTestStorage();
    const sessions = teams.length ? motorRows<{ data: MotorTestSession }>(await db.execute(sql`
      SELECT data FROM motor_test_sessions WHERE club_id=${req.session.clubId}
        AND team_id IN (${sql.join(teams.map(team => sql`${team.id}`), sql`,`)})
      ORDER BY test_date DESC, id DESC`)).map(row => row.data) : [];
    const recordTeamIds=await canEdit(req) ? teams.map(team=>team.id) : [];
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
    const motorSession=String(req.query.motorSession??"");
    if(uuid.test(motorSession)){
      await ensureMotorTestStorage();
      const [saved]=motorRows<{data:MotorTestSession}>(await db.execute(sql`SELECT data FROM motor_test_sessions WHERE id=${motorSession}::uuid AND club_id=${clubId} AND team_id=${teamId}`));
      if(saved) for(const player of players) if(saved.data.results[player.id]&&!roster.some(row=>row.id===player.id)) roster.push(player);
    }
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
      presentCount: roster.filter(player => [...coach].reverse().find(row => row.id === player.id)?.status === "present").length,
      sessions: sessions.map(session => ({ id: session.id, title: session.title, time: trainingLocalSlot(session.scheduledAt).start })),
      players: roster.map(player => ({ id: player.id, name: player.lastName + " " + player.firstName,
        family: family?.records.find(item => item.playerId === player.id)?.status ?? null,
        coach: [...coach].reverse().find(item => item.id === player.id)?.status ?? null })),
    });
  });

  router.put("/motor-tests/:id", requireAuth, async (req, res) => {
    const programEditor = await canEdit(req);
    if (!programEditor) { res.status(403).json({error:"I test sono consultabili dal mister. Le rilevazioni si modificano dall’area preparatori."}); return; }
    const id = String(req.params.id);
    const parsed = motorTestSessionInput.safeParse(req.body);
    if (!uuid.test(id) || !parsed.success) { res.status(400).json({ error: !parsed.success ? parsed.error.issues.map(issue => issue.message).slice(0,4).join(" · ") : "Identificativo della sessione non valido." }); return; }
    const input = normalizeMotorResults(parsed.data), clubId = req.session.clubId!, userId = req.session.userId!;
    if (!(await allowedTeams(req)).some(team => team.id === input.teamId)) { res.sendStatus(403); return; }

    if (Object.keys(input.results).length > 150 || (!input.linkProgram && input.tests.some(test => test.link) && !input.trainingSessionId)) {
      res.status(400).json({ error: "Scegli la seduta del mister per le prove da aggiungere." }); return;
    }
    await Promise.all([ensureMotorTestStorage(), ensurePlayerMeasurementStorage()]);
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
      const previous = motorRows<{ clubId: number; createdAt: string; data: MotorTestSession }>(await tx.execute(sql`
        SELECT club_id AS "clubId", created_at::text AS "createdAt", data FROM motor_test_sessions WHERE id=${id}::uuid`))[0];
      if ((previous?.data.revision ?? 0) !== input.revision || (previous && (previous.clubId !== clubId || previous.data.teamId !== input.teamId || previous.data.date !== input.date || previous.data.cycle !== input.cycle))) {
        return { status: 409, error: "La sessione è cambiata. Ricarica prima di salvare." };
      }
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
      if (!input.trainingSessionId && (!previous || (input.workingDate??input.date)===input.date)) {
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
      // A campaign keeps its original date and station. Attendance is checked on the
      // actual measurement day; unchanged historical results remain admissible.
      const workingDate = input.workingDate ?? input.date;
      let workingSessionId = workingDate === input.date ? input.trainingSessionId : input.workingTrainingSessionId ?? null;
      if (workingDate !== input.date) {
        const candidates = (await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId,clubId),
          sql`(${trainingSessionsTable.scheduledAt} AT TIME ZONE 'Europe/Rome')::date = ${workingDate}::date`)))
          .filter(session=>eligibleSession(session,input.teamId,workingDate));
        if (!workingSessionId && candidates.length === 1) workingSessionId=candidates[0].id;
        if (!workingSessionId || !candidates.some(session=>session.id===workingSessionId)) return {status:409,error:"Scegli la seduta della giornata di rilevazione e registra l’appello prima di completare i test."};
      }
      const changedIds=playerIds.filter(playerId=>!isDeepStrictEqual(input.results[playerId],knownResults[playerId]));
      if (workingSessionId) {
        const recorded=await tx.select({playerId:trainingAttendancesTable.playerId,status:trainingAttendancesTable.status}).from(trainingAttendancesTable)
          .where(and(eq(trainingAttendancesTable.clubId,clubId),eq(trainingAttendancesTable.trainingSessionId,workingSessionId),staffAttendance)).orderBy(asc(trainingAttendancesTable.id));
        const present=new Map(recorded.map(row=>[row.playerId,row.status]));
        if(changedIds.some(playerId=>present.get(playerId)!=="present")) return {status:409,error:"Puoi valutare solo i presenti nell’appello della giornata di rilevazione. I risultati delle altre giornate sono conservati."};
      }
      if (input.trainingSessionId) {
        const [session] = await tx.select().from(trainingSessionsTable).where(and(eq(trainingSessionsTable.clubId, clubId),
          eq(trainingSessionsTable.id, input.trainingSessionId))).for("update");
        if (!session || !eligibleSession(session, input.teamId, input.date)) return { status: 400, error: "La seduta deve appartenere all’annata e al giorno selezionati." };
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
      const days = structuredClone(previous?.data.days ?? (previous && Object.keys(knownResults).length ? [{date:previous.data.date,trainingSessionId:previous.data.trainingSessionId,results:knownResults}] : []));
      for(const playerId of playerIds){
        const player=input.results[playerId],old=knownResults[playerId];
        for(const field of ["height","weight"] as const) player[`${field}Date`]=player[field]!==old?.[field] ? workingDate : old?.[`${field}Date`] ?? input.date;
        for(const [testId,row] of Object.entries(player.tests)){
          if(!row)continue;
          const prior=old?.tests[testId as keyof typeof player.tests];
          const comparable=(value:typeof row|undefined)=>value ? {...value,recordedOn:undefined}:value;
          row.recordedOn=isDeepStrictEqual(comparable(row),comparable(prior)) ? prior?.recordedOn ?? input.date : workingDate;
        }
      }
      if(changedIds.length){
        let day=days.find(day=>day.date===workingDate&&day.trainingSessionId===workingSessionId);
        if(!day){day={date:workingDate,trainingSessionId:workingSessionId,results:{}};days.push(day);}
        for(const playerId of changedIds) day.results[playerId]=structuredClone(input.results[playerId]);
      }
      const data: MotorTestSession = { ...input, workingTrainingSessionId:workingSessionId, revision: input.revision + 1, id, exerciseIds, stationId, days };
      await tx.execute(sql`INSERT INTO motor_test_sessions(id, club_id, team_id, test_date, data)
        VALUES(${id}::uuid,${clubId},${input.teamId},${input.date}::date,${JSON.stringify(data)}::jsonb)
        ON CONFLICT(id) DO UPDATE SET test_date=excluded.test_date, data=excluded.data`);
      await refreshPlayerMeasurements(tx, clubId, players.filter(player => valid.has(player.id)).map(player => player.id));
      return { data };
    });
    if ("error" in result) { res.status(result.status ?? 400).json({ error: result.error }); return; }
    res.json(result.data);
  });
  return router;
}
