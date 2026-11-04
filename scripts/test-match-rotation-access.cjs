// Actual HTTP handlers + isolated PostgreSQL; session authentication is simulated, no real credentials.
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  { createRequire, Module } = require("module");
const root = path.resolve(__dirname, ".."),
  req = createRequire(path.join(root, "artifacts/api-server/package.json")),
  webReq = createRequire(
    path.join(root, "artifacts/football-training-board/package.json"),
  ),
  esbuild = createRequire(webReq.resolve("vite"))("esbuild");
if (process.argv[2]) {
  process.env.NODE_PATH = path.resolve(process.argv[2], "../..");
  Module._initPaths();
}
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
(async () => {
  const pg = new PGlite();
  let server;
  try {
    globalThis.rotationAccessTest = { pg };
    const dir = path.join(root, ".tools/rotation-access");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "db.ts"),
      `import {drizzle} from 'drizzle-orm/pglite';export * from '../../lib/db/src/schema';export const db=drizzle((globalThis as any).rotationAccessTest.pg);export const pool={query:async(t:string,p?:unknown[])=>{const result=await (globalThis as any).rotationAccessTest.pg.query(t,p);return {...result,rowCount:result.rows.length};}};`,
    );
    fs.writeFileSync(
      path.join(dir, "auth.ts"),
      `export function requireAuth(req:any,res:any,next:any){if(req.headers['x-anonymous']){res.status(401).json({error:'No session'});return;}next();}`,
    );
    fs.writeFileSync(
      path.join(dir, "email.ts"),
      `export async function sendParentNotificationEmail(){throw Error('No notifications allowed in test');}`,
    );
    fs.writeFileSync(
      path.join(dir, "entry.ts"),
      `export {default as training} from '../../artifacts/api-server/src/routes/training';export {default as exercises} from '../../artifacts/api-server/src/routes/exercises';export {default as players} from '../../artifacts/api-server/src/routes/players';export {default as parent} from '../../artifacts/api-server/src/routes/parent';export {default as manager} from '../../artifacts/api-server/src/routes/team-manager';export {default as matches} from '../../artifacts/api-server/src/routes/matches';export {readSessionEligibility} from '../../artifacts/api-server/src/lib/training-session-attendance';export * as schema from '../../lib/db/src/schema';export {getTableConfig,PgTable} from 'drizzle-orm/pg-core';`,
    );
    const bundle = path.join(dir, "bundle.cjs");
    await esbuild.build({
      entryPoints: [path.join(dir, "entry.ts")],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      plugins: [
        {
          name: "isolated",
          setup(b) {
            b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
              path: path.join(dir, "db.ts"),
            }));
            b.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
              path: path.join(root, "lib/api-zod/src/index.ts"),
            }));
            b.onResolve({ filter: /\/lib\/auth$/ }, () => ({
              path: path.join(dir, "auth.ts"),
            }));
            b.onResolve({ filter: /\/lib\/parent-email$/ }, () => ({
              path: path.join(dir, "email.ts"),
            }));
          },
        },
      ],
      nodePaths: [
        path.join(root, "artifacts/api-server/node_modules"),
        path.join(root, "lib/db/node_modules"),
        path.join(root, "lib/api-zod/node_modules"),
      ],
    });
    const compiled = new Module(bundle, module);
    compiled.filename = bundle;
    compiled.paths = [
      path.join(root, "artifacts/api-server/node_modules"),
      path.join(root, "lib/db/node_modules"),
      path.join(root, "lib/api-zod/node_modules"),
    ];
    compiled._compile(fs.readFileSync(bundle, "utf8"), bundle);
    const routes = compiled.exports,
      seen = new Set();
    for (const table of Object.values(routes.schema)) {
      if (!(table instanceof routes.PgTable)) continue;
      const config = routes.getTableConfig(table);
      if (seen.has(config.name)) continue;
      seen.add(config.name);
      await pg.exec(
        'CREATE TABLE "' +
          config.name +
          '" (' +
          config.columns
            .map(
              (c) =>
                '"' +
                c.name +
                '" ' +
                c.getSQLType() +
                (c.primary ? " PRIMARY KEY" : ""),
            )
            .join(",") +
          ")",
      );
    }
    await pg.exec(
      `INSERT INTO clubs(id,name) VALUES(1,'Club test'),(2,'Other club');INSERT INTO teams(id,club_id,name,club_section,category) VALUES(11,1,'Primi Calci','scuola_calcio','Primi Calci'),(12,1,'Allievi','settore_giovanile','Allievi'),(22,2,'Foreign','scuola_calcio','Primi Calci');INSERT INTO users(id,first_name,last_name) VALUES(1,'Manager','Allowed'),(2,'Manager','Unassigned');INSERT INTO club_memberships(id,club_id,user_id,role,club_section) VALUES(1,1,1,'team_manager','{scuola_calcio}'),(2,1,2,'team_manager','{scuola_calcio}');INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(1,1,1,11,'team_manager');INSERT INTO players(id,club_id,team_id,first_name,last_name) VALUES(101,1,11,'Own','Child'),(102,1,11,'Peer','Other'),(201,2,22,'Foreign','Child');`,
    );
    const plan = {
      periods: [
        {
          key: "t1",
          minutes: "12",
          lineupPlayerIds: [101, 102],
          lineupStarterCount: 2,
        },
        {
          key: "t2",
          minutes: "12",
          lineupPlayerIds: [102, 101],
          lineupStarterCount: 1,
        },
        {
          key: "t3",
          minutes: "12",
          lineupPlayerIds: [101, 102],
          lineupStarterCount: 1,
          secondPart: { lineupPlayerIds: [102, 101], lineupStarterCount: 1 },
        },
      ],
      postMatchReport: {
        version: 1,
        goals: [],
        periods: [
          { minutes: 12, starters: [101, 102] },
          { minutes: 12, starters: [102] },
          { minutes: 12, starters: [101] },
        ],
        substitutions: [
          {
            id: "mid",
            period: 2,
            minute: 6,
            outPlayerId: 101,
            inPlayerId: 102,
            notes: "Private technical note",
          },
        ],
      },
    };
    await pg.query(
      `INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,match_plan,notes) VALUES(501,1,11,'Opponent','2026-10-10T15:00:00Z','home',$1::jsonb,$2),(502,1,12,'Other section','2026-10-11','home',$1::jsonb,''),(503,2,22,'Foreign club','2026-10-11','home',$1::jsonb,'')`,
      [JSON.stringify(plan), "Public [FTB_MATCH_PLAN]" + JSON.stringify(plan)],
    );
    await pg.exec(
      `INSERT INTO call_ups(id,match_id,player_id,status,created_at) VALUES(1,501,101,'called',now()),(2,501,102,'called',now()),(3,503,201,'called',now());`,
    );
    const app = req("express")();
    app.use(req("express").json());
    app.use((request, _res, next) => {
      request.session = {
        clubId: Number(request.headers["x-club"] ?? 1),
        userId: Number(request.headers["x-user"] ?? 1),
        role: request.headers["x-role"] ?? "parent",
        parentPlayerId: Number(request.headers["x-child"] ?? 101),
        section: "scuola_calcio",
      };
      next();
    });
    app.use("/api", routes.parent, routes.manager, routes.matches, routes.players, routes.training, routes.exercises);
    app.use((error, _req, res, _next) =>
      res.status(500).json({ error: error.message }),
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = "http://127.0.0.1:" + server.address().port + "/api",
      call = async (url, headers = {}) => {
        const response = await fetch(base + url, { headers });
        return { status: response.status, data: await response.json() };
      };
    const activity = await call("/parent/activity?playerId=102");
    assert.equal(activity.status, 200, JSON.stringify(activity.data));
    assert.equal(activity.data.matches[0].rotation.rows.length, 1);
    assert.equal(activity.data.matches[0].rotation.rows[0].playerId, 101);
    assert.equal(activity.data.matches[0].rotation.rows[0].actualMinutes, 18);
    assert.ok(
      !JSON.stringify(activity.data).includes("Private technical note"),
    );
    assert.ok(!JSON.stringify(activity.data).includes("Other"));
    const publicFixtures = await call("/parent/matches");
    assert.equal(publicFixtures.status, 200);
    assert.equal(publicFixtures.data[0].matchPlan, undefined);
    assert.equal(publicFixtures.data[0].notes, "Public");
    assert.equal(publicFixtures.data[0].callUps.length, 2);
    assert.equal((await call("/matches?teamId=11")).status, 403);
    const manager = await call("/dirigenti/overview?teamId=11", {
      "x-role": "team_manager",
    });
    assert.equal(manager.status, 200, JSON.stringify(manager.data));
    assert.equal(manager.data.matches.length, 1);
    assert.deepEqual(
      manager.data.matches[0].rotation.rows.map((row) => row.playerId),
      [101, 102],
    );
    assert.equal(manager.data.matches[0].matchPlan, undefined);
    assert.equal(
      (
        await call("/dirigenti/overview?teamId=12", {
          "x-role": "team_manager",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/dirigenti/overview?teamId=22", {
          "x-role": "team_manager",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/dirigenti/overview?teamId=11", {
          "x-role": "team_manager",
          "x-user": "2",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call("/dirigenti/overview?teamId=11", { "x-role": "coach" }))
        .status,
      403,
    );
    assert.equal(
      (await call("/matches?teamId=11", { "x-role": "team_manager" })).status,
      403,
    );
    await pg.query(
      "INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,match_plan) VALUES(504,1,11,'Future match','2099-12-01','home',$1::jsonb)",
      [JSON.stringify({ periods: plan.periods })],
    );
    await pg.exec(
      "INSERT INTO call_ups(id,match_id,player_id,status,created_at) VALUES(4,504,101,'called',now())",
    );
    const future = await call("/parent/activity");
    const upcoming = future.data.matches.find((match) => match.id === 504);
    assert.equal(upcoming.rotation.rows.length, 1);
    assert.equal(upcoming.rotation.rows[0].playerId, 101);
    assert.equal(upcoming.rotation.rows[0].plannedMinutes, 18);
    assert.equal(upcoming.minutes, null);
    assert.equal(upcoming.rotation.rows[0].actualMinutes, null);
    console.log(
      "PASS real HTTP handlers + isolated PostgreSQL: own-child projection, query tampering ignored, public callups preserved, raw plans/markers excluded, manager assignments/section/club enforced, generic bypass blocked.",
    );
    await pg.exec(`
      INSERT INTO players(id,club_id,team_id,first_name,last_name,available,availability_override_active,availability_override_from,availability_override_until) VALUES
      (104,1,11,'Global','Unavailable',false,false,NULL,NULL),
      (105,1,11,'Staff','Present',false,false,NULL,NULL),
      (106,1,11,'Valid','Override',false,true,'2026-10-01','2026-10-31'),
      (107,1,11,'Expired','Override',false,true,'2026-09-01','2026-09-30'),
      (108,1,11,'Staff','Absent',true,false,NULL,NULL),
      (109,1,11,'No','Reply',true,false,NULL,NULL);
      INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,notes,session_kind)
      VALUES(601,1,11,'Eligibility fixture','2026-10-12T15:30:00Z',90,'scheduled','', 'regular');
      INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES
      (801,1,601,105,'present'),(802,1,601,108,'absent');
      INSERT INTO parent_training_availabilities(id,club_id,team_id,player_id,occurrence_id,scheduled_at,status,updated_at) VALUES
      (901,1,11,102,'11-2026-10-12-17:30','2026-10-12T15:30:00Z','unavailable',now()),
      (902,1,11,105,'11-2026-10-12-17:30','2026-10-12T15:30:00Z','unavailable',now());
    `);
    const fixture = {
      id: 601,
      teamId: 11,
      notes: "",
      scheduledAt: new Date("2026-10-12T15:30:00Z"),
      durationMinutes: 90,
      sessionKind: "regular",
    };
    const eligibility = await routes.readSessionEligibility(1, fixture);
    assert.deepEqual(eligibility.blockedPlayerIds, [102, 104, 107, 108]);
    assert.ok(eligibility.presentPlayerIds.includes(105));
    assert.ok(!eligibility.blockedPlayerIds.includes(106));
    assert.ok(!eligibility.blockedPlayerIds.includes(109));
    await pg.exec(
      "UPDATE training_attendances SET status='present' WHERE id=802",
    );
    const corrected = await routes.readSessionEligibility(1, fixture);
    assert.ok(!corrected.blockedPlayerIds.includes(108));
    await pg.exec("INSERT INTO teams(id,club_id,name,club_section) VALUES(13,1,'Joint team','scuola_calcio'); INSERT INTO players(id,club_id,team_id,first_name,last_name,available) VALUES(110,1,13,'Joint','Unavailable',false); UPDATE players SET available=false WHERE id=201");
    const shared = await routes.readSessionEligibility(1, {
      ...fixture, notes: "[FTB_SESSION_TEAMS]11,13",
    });
    assert.ok(shared.blockedPlayerIds.includes(110));
    assert.ok(!shared.blockedPlayerIds.includes(201));
    const templates = await routes.readSessionEligibility(1, {
      ...fixture,
      sessionKind: "tipo",
    });
    assert.ok(!templates.blockedPlayerIds.includes(104));
    // Player card must include supplementary and historical teams, within the season.
    const current = new Date(), seasonYear = current.getFullYear() - (current.getMonth() < 6 ? 1 : 0);
    const day = `${seasonYear}-07-02`, oldDay = `${seasonYear}-06-01`;
    await pg.query(`INSERT INTO seasons(id,club_id,name,start_date,end_date) VALUES(31,1,'Activity test',$1,$2)`, [`${seasonYear}-07-01`,`${seasonYear+1}-06-30`]);
    await pg.exec(`INSERT INTO teams(id,club_id,name,club_section,season_id) VALUES(31,1,'Primary','scuola_calcio',31),(32,1,'Supplementary','scuola_calcio',31);
      INSERT INTO players(id,club_id,team_id,first_name,last_name,notes) VALUES(301,1,31,'Supplementary','Player','[FTB_PLAYER_META]{"supplementalTeamId":32}');`);
    for (const [id, teamId, report, date] of [[901,32,{periods:[{minutes:12,starters:[301]}]},day],[902,32,null,day],[903,12,{periods:[{minutes:12,starters:[]}]},day],[904,32,null,day],[905,32,null,day],[906,32,null,oldDay]]) {
      const matchPlan = report ? {postMatchReport:{version:1,goals:[],substitutions:[],...report}} : {};
      await pg.query(`INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,match_plan) VALUES($1,1,$2,'Activity opponent',$3,'home',$4::jsonb)`,[id,teamId,date,JSON.stringify(matchPlan)]);
      await pg.query(`INSERT INTO call_ups(id,match_id,player_id,status) VALUES($1,$2,301,$3)`,[id,id,id===905?'available':'called']);
    }
    await pg.exec(`INSERT INTO call_ups(id,match_id,player_id,status) VALUES(907,901,301,'called'),(908,503,301,'called');`);
    for (const [id,teamId,notes,date] of [[901,31,'',day],[902,32,'',day],[903,32,'[FTB_SESSION_TEAMS]31,32',day],[904,12,'',day],[905,32,'',oldDay]]) {
      await pg.query(`INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,notes) VALUES($1,1,$2,'Activity training',$3,'completed',$4)`,[id,teamId,date,notes]);
      if(id!==901) await pg.query(`INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES($1,1,$1,301,'present')`,[id]);
    }
    const sports = await call('/players/301/activity-summary',{'x-role':'technical_director'});
    assert.equal(sports.status,200,JSON.stringify(sports.data));
    assert.equal(sports.data.trainingAttendance.totalPastSessions,4);
    assert.equal(sports.data.trainingAttendance.present,3);
    assert.equal(sports.data.trainingAttendance.unrecorded,1);
    assert.deepEqual(sports.data.matchAttendance,{totalPastMatches:5,callups:4,appearances:1,recorded:2,unrecorded:2,minutes:12,percentage:50});
    console.log('PASS player activity: supplementary/historical teams, joint sessions once, season boundary, distinct callups, parent availability excluded, report-only participation/minutes, foreign club excluded.');
    // Technical director proposes; coach explicitly adopts independent station copies.
    await pg.exec(`INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Test'),(4,'Technical','Director');
      INSERT INTO club_memberships(id,club_id,user_id,role,club_section,staff_role) VALUES(3,1,3,'coach','{scuola_calcio}','primo_allenatore'),(4,1,4,'technical_director','{scuola_calcio,settore_giovanile}',null);
      UPDATE teams SET coach_id=3 WHERE id=11;
      INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,session_kind,created_by_user_id,sent_to_user_ids,notes,duration_minutes)
      VALUES(1201,1,11,'Proposal',now(),'scheduled','tipo',4,'[3]','',90),(1202,1,11,'Coach session',now(),'scheduled','regular',3,null,'',90);`);
    const oldBoard = {boardId:99,data:{teamId:11,elements:[{type:'player',playerId:101,name:'Source identity'}],animation:{frames:[{elements:[{type:'player',playerId:101,name:'Source identity'}]}]}}};
    await pg.query(`INSERT INTO exercises(id,club_id,title,team_id,created_by_user_id,stato_lavagna_json,drawing_data,equipment,duration_minutes,training_phase) VALUES(1201,1,'Proposal station',11,4,$1,'old-image','Palloni: 4',15,'iniziale'),(1202,1,'Existing station',11,3,null,null,null,10,'centrale')`,[JSON.stringify(oldBoard)]);
    await pg.exec(`INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES(1201,1201,1201,0),(1202,1202,1202,0);`);
    const write = async (url, body, who=3, role='coach', method='POST') => {
      const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json','x-user':String(who),'x-role':role},body:JSON.stringify(body)});
      return {status:response.status,data:response.status===204?null:await response.json()};
    };
    const adoption = {targetSessionId:1202,exerciseIds:[1201],expectedExerciseIds:[1202]};
    assert.equal((await write('/training-sessions/1201/adopt',adoption,2)).status,403);
    assert.equal((await write('/training-sessions/1201/adopt',adoption,4,'technical_director')).status,403);
    assert.equal((await write('/training-sessions/1201/adopt',{...adoption,exerciseIds:[1202]})).status,400);
    assert.equal((await write('/training-sessions/1201/adopt',{...adoption,expectedExerciseIds:[]})).status,409);
    const adopted = await write('/training-sessions/1201/adopt',adoption);
    assert.equal(adopted.status,201,JSON.stringify(adopted.data));
    const [copied] = (await pg.query('SELECT * FROM exercises WHERE id=$1',[adopted.data.exerciseIds[0]])).rows;
    assert.equal(copied.created_by_user_id,3); assert.equal(copied.source_exercise_id,1201);
    assert.equal(copied.equipment,'Palloni: 4'); assert.equal(copied.duration_minutes,15);
    assert.equal(copied.drawing_data,null); assert.equal(copied.selected_player_ids_json,null);
    assert.ok(!copied.stato_lavagna_json.includes('Source identity')); assert.ok(!copied.stato_lavagna_json.includes('playerId')); assert.equal(JSON.parse(copied.stato_lavagna_json).boardId,null);
    const targetLinks=(await pg.query('SELECT * FROM training_session_exercises WHERE training_session_id=1202')).rows;
    assert.equal(targetLinks.length,2); assert.ok(targetLinks.some(row=>row.exercise_id===1202));
    assert.equal((await write('/training-sessions/1201/adopt',{...adoption,expectedExerciseIds:targetLinks.map(row=>row.id)})).status,409);
    assert.equal((await pg.query('SELECT stato_lavagna_json FROM exercises WHERE id=1201')).rows[0].stato_lavagna_json,JSON.stringify(oldBoard));
    assert.equal((await write('/training-sessions/1202/exercises',{exerciseId:1201},4,'technical_director')).status,403);
    assert.equal((await write('/exercises/1202',{title:'Forbidden edit'},4,'technical_director','PATCH')).status,403);
    assert.equal((await write('/exercises/1201',{title:'Forbidden original edit'},3,'coach','PATCH')).status,403);
    const opEdit=await write('/training-sessions/1202',{title:'Forbidden metadata'},4,'technical_director','PATCH');
    assert.equal((await pg.query('SELECT title FROM training_sessions WHERE id=1202')).rows[0].title,'Coach session');
    const tdCreate=await write('/training-sessions',{title:'Proposed only',scheduledAt:new Date().toISOString(),teamId:11,durationMinutes:90,status:'scheduled',sessionKind:'regular'},4,'technical_director');
    assert.equal(tdCreate.status,201,JSON.stringify(tdCreate.data)); assert.equal(tdCreate.data.sessionKind,'tipo');
    console.log('PASS technical proposals: explicit adoption, assignment/recipient checks, independent cleaned copies, existing preparation retained, stale/repeat rejection, operational stations protected and TD creation forced to tipo.');
    const tdHeaders={'x-user':'4','x-role':'technical_director'};
    assert.equal((await call('/training-supervision',{'x-role':'coach','x-user':'3'})).status,403);
    assert.equal((await call('/training-supervision')).status,403);
    assert.equal((await call('/training-supervision?teamId=22',tdHeaders)).status,403);
    const oversight=await call('/training-supervision?section=scuola_calcio&teamId=11',tdHeaders);
    assert.equal(oversight.status,200,JSON.stringify(oversight.data));
    assert.equal(oversight.data.facts['1201'].adoptions,1);
    assert.ok(oversight.data.staff.some(p=>p.userId===3));
    assert.equal(oversight.data.facts['503'],undefined);
    assert.equal(oversight.data.facts['601'].recorded,2);
    const youthOversight=await call('/training-supervision?section=settore_giovanile&teamId=12',tdHeaders);
    assert.equal(youthOversight.status,200);
    assert.equal(youthOversight.data.facts['1202'],undefined);
    assert.equal((await call('/training-supervision?section=scuola_calcio&teamId=12',tdHeaders)).status,403);
    await pg.exec(`INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,session_kind) VALUES(1800,2,22,'Foreign preparation','2026-10-12','regular')`);
    const reviewBody={scores:{coherence:3,organization:2,suitability:null,progression:4},note:'Controllare i recuperi',expectedUpdatedAt:null};
    assert.equal((await write('/training-sessions/1800/review',reviewBody,4,'technical_director','PUT')).status,404);
    assert.equal((await write('/training-sessions/1202/review',reviewBody,3,'coach','PUT')).status,403);
    assert.equal((await write('/training-sessions/1201/review',reviewBody,4,'technical_director','PUT')).status,404);
    assert.equal((await write('/training-sessions/1202/review',{...reviewBody,scores:{...reviewBody.scores,coherence:5}},4,'technical_director','PUT')).status,400);
    const reviewSave=await write('/training-sessions/1202/review',reviewBody,4,'technical_director','PUT');
    assert.equal(reviewSave.status,200,JSON.stringify(reviewSave.data));
    const reloaded=await call('/training-supervision?teamId=11',tdHeaders);
    assert.equal(reloaded.status,200,JSON.stringify(reloaded.data));
    assert.equal(reloaded.data.facts['1202'].review.note,reviewBody.note);
    assert.equal(reloaded.data.facts['1202'].review.stale,false);
    assert.equal((await write('/training-sessions/1202/review',reviewBody,4,'technical_director','PUT')).status,409);
    await pg.exec(`UPDATE exercises SET duration_minutes=22 WHERE id=1202`);
    assert.equal((await call('/training-supervision?teamId=11',tdHeaders)).data.facts['1202'].review.stale,true);
    const edited={...reviewBody,note:'Riverificata',expectedUpdatedAt:new Date(reloaded.data.facts['1202'].review.updatedAt).toISOString()};
    assert.equal((await write('/training-sessions/1202/review',edited,4,'technical_director','PUT')).status,200);
    assert.equal((await call('/training-supervision?teamId=11',tdHeaders)).data.facts['1202'].review.stale,false);
    console.log('PASS TD supervision: role/club scope, real adoption evidence, saved nullable criterion reviews, invalid score and stale overwrite rejection, changed preparation flagged and re-review supported.');
    console.log(
      "PASS training eligibility: parent refusal, global unavailability, dated overrides, staff present/absent, correction and templates.",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pg.close();
    delete globalThis.rotationAccessTest;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
