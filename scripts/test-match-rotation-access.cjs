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
      `export function requireAuth(req:any,res:any,next:any){if(req.headers['x-anonymous']){res.status(401).json({error:'No session'});return;}next();}export {createAuthToken} from '../../artifacts/api-server/src/lib/auth.ts';`,
    );
    fs.writeFileSync(
      path.join(dir, "email.ts"),
      `export async function sendParentNotificationEmail(){throw Error('No notifications allowed in test');}`,
    );
    fs.writeFileSync(
      path.join(dir, "entry.ts"),
      `export {default as rules} from '../../artifacts/api-server/src/routes/callup-rules';export {default as teams} from '../../artifacts/api-server/src/routes/teams';export {default as championships} from '../../artifacts/api-server/src/routes/championships';export {default as auth} from '../../artifacts/api-server/src/routes/auth';export {default as training} from '../../artifacts/api-server/src/routes/training';export {default as attendance} from '../../artifacts/api-server/src/routes/attendance';export {default as exercises} from '../../artifacts/api-server/src/routes/exercises';export {default as players} from '../../artifacts/api-server/src/routes/players';export {default as parent} from '../../artifacts/api-server/src/routes/parent';export {default as manager} from '../../artifacts/api-server/src/routes/team-manager';export {default as matches} from '../../artifacts/api-server/src/routes/matches';export {restrictTeamManagerApi} from '../../artifacts/api-server/src/lib/team-manager-access';export {attachBearerSession} from '../../artifacts/api-server/src/lib/auth.ts';export {requireCurrentParentAccess} from '../../artifacts/api-server/src/lib/parent-delegate-access';export {readSessionEligibility} from '../../artifacts/api-server/src/lib/training-session-attendance';export * as schema from '../../lib/db/src/schema';export {getTableConfig,PgTable} from 'drizzle-orm/pg-core';`,
    );
    fs.appendFileSync(path.join(dir,"entry.ts"),"\nexport {default as clubsRouter} from '../../artifacts/api-server/src/routes/clubs';export {ensureSocietyStorage} from '../../artifacts/api-server/src/lib/society-storage';export {enforceSocietyAccess} from '../../artifacts/api-server/src/lib/society-access';export {default as societies} from '../../artifacts/api-server/src/routes/society-management';export {default as playerFinance} from '../../artifacts/api-server/src/routes/player-finance';");
    if (process.argv.includes("--callup-rules")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {evaluateCallupRule,readCallupRule} from '../../artifacts/api-server/src/lib/callup-rules';");
    }
    if (process.argv.includes("--payment-desk")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {quoteBalancePayments} from '../../artifacts/football-training-board/src/lib/payment-summary';");
    }
    const bundle = path.join(dir, "bundle.cjs");
    if (process.argv.includes("--member-services")) {
      fs.appendFileSync(path.join(dir,"entry.ts"),"\nexport {default as memberServices} from '../../artifacts/api-server/src/routes/member-services';export * as memberModels from '../../lib/api-zod/src/member-services';export * as memberChart from '../../artifacts/football-training-board/src/lib/member-expense-chart';");
    }
    if (process.argv.includes("--extra-time") || process.argv.includes("--payment-desk") || process.argv.includes("--withdrawals") || process.argv.includes("--document-files")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {default as secretary} from '../../artifacts/api-server/src/routes/secretary';");
    }
    if (process.argv.includes("--fitness-results") || process.argv.includes("--motor-tests")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {default as fitness} from '../../artifacts/api-server/src/routes/fitness';");
    }
    if (process.argv.includes("--withdrawals")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {default as seasons} from '../../artifacts/api-server/src/routes/seasons';export {default as seasonStatus} from '../../artifacts/api-server/src/routes/player-season-status';");
    }
    if (process.argv.includes("--station-reuse-graphics")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {prepareReusedBoard,syncExerciseBoardRoster,attendanceExerciseView} from '../../lib/api-zod/src/index';");
    }
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
    await routes.ensureSocietyStorage();
    const app = req("express")();
    app.use(req("express").json());
    app.use((request, _res, next) => {
      if (request.headers.authorization) {
        request.session = { save: callback => callback() };
        return routes.attachBearerSession(request, _res, next);
      }
      request.session = {
        clubId: Number(request.headers["x-club"] ?? 1),
        userId: Number(request.headers["x-user"] ?? 1),
        role: request.headers["x-role"] ?? "parent",
        parentPlayerId: Number(request.headers["x-child"] ?? 101),
        section: "scuola_calcio",
        save: callback => callback(),
        regenerate: callback => callback(),
      };
      next();
    });
    app.use("/api", routes.enforceSocietyAccess,routes.societies,routes.playerFinance,routes.clubsRouter);
    app.use("/api", routes.restrictTeamManagerApi, routes.requireCurrentParentAccess, routes.parent, routes.manager, routes.rules, routes.matches, routes.players, routes.training, routes.attendance, routes.exercises, routes.auth, routes.championships, routes.teams);
    if (routes.secretary) app.use("/api", routes.secretary);
    if (routes.fitness) app.use("/api", routes.fitness);
    if (routes.memberServices) app.use("/api", routes.memberServices);
    if (routes.seasons) app.use("/api", routes.seasons, routes.seasonStatus);
    app.use((error, _req, res, _next) =>
      res.status(500).json({ error: error.message }),
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = "http://127.0.0.1:" + server.address().port + "/api",
      call = async (url, headers = {}) => {
        const response = await fetch(base + url, { headers });
        return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() };
      };

    if(process.argv.includes("--societies")) {
      await require("./test-society-lifecycle.cjs")({pg,base,call,models:routes.memberModels});return;
    }
    if(process.argv.includes("--member-services")) {
      await require("./test-member-services.cjs")({pg,base,call,models:routes.memberModels,chart:routes.memberChart});
      return;
    }


    if (process.argv.includes("--station-reuse-graphics")) {
      await pg.exec("INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Test'); INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,'coach')");
      const picture = "data:image/png;base64,AA==";
      const sourceBoard = { boardId: 7, data: { teamId:11, elements:[
        {id:"actor",type:"player",playerId:"101",name:"Old name",x:25,y:40},
        {id:"cone",type:"cone",x:60,y:20}, {id:"line",type:"arrow",points:[{x:20,y:30},{x:70,y:50}]}],
        animation:{frames:[{elements:[{id:"actor",type:"player",playerId:"101",x:40,y:45}]}]} } };
      const original = JSON.stringify(sourceBoard);
      const reused = routes.prepareReusedBoard(original, 12, picture);
      const board = JSON.parse(reused);
      assert.equal(board.boardId,null);
      assert.equal(board.data.teamId,12);
      assert.equal(board.data.elements.length,3);
      assert.equal(board.data.elements[0].playerId,undefined);
      assert.equal(board.data.elements[0].name,undefined);
      assert.equal(board.data.elements[0].x,25);
      assert.equal(board.data.animation.frames[0].elements[0].x,40);
      assert.equal(board.reusedPreview,picture);
      assert.equal(JSON.stringify(sourceBoard),original);
      const assigned = routes.syncExerciseBoardRoster(reused,[102],[{id:102,firstName:"Current",lastName:"Child"}]);
      assert.equal(JSON.parse(assigned).reusedPreview,picture);
      const safe = routes.attendanceExerciseView({statoLavagnaJson:assigned,drawingData:null},[102]);
      assert.equal(JSON.parse(safe.statoLavagnaJson).reusedPreview,picture);
      await pg.query("INSERT INTO exercises(id,club_id,team_id,created_by_user_id,title,description,stato_lavagna_json,drawing_data) VALUES(700,1,11,3,'Schema precedente','Descrizione completa',$1,$2)",[original,picture]);
      await pg.exec("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,session_kind) VALUES(700,1,11,'Vecchia seduta','2026-11-10T16:30:00Z','scheduled','regular'),(701,1,11,'Seduta attuale','2026-11-17T16:30:00Z','scheduled','regular'); INSERT INTO training_session_exercises(id,training_session_id,exercise_id,\"order\") VALUES(700,700,700,0)");
      const headers={"x-role":"coach","x-user":"3","content-type":"application/json"};
      const archive=await call("/exercises?reuseForSessionId=701",headers);
      assert.equal(archive.status,200,JSON.stringify(archive.data));
      assert.equal(archive.data.find(row=>row.id===700).drawingData,picture);
      const response=await fetch(base+"/exercises",{method:"POST",headers,body:JSON.stringify({title:"Copia indipendente",teamId:11,sourceExerciseId:700,statoLavagnaJson:safe.statoLavagnaJson})});
      const saved=await response.json();
      assert.equal(response.status,201,JSON.stringify(saved));
      const reloaded=await call("/exercises/"+saved.id,headers);
      assert.equal(reloaded.status,200);
      assert.equal(JSON.parse(reloaded.data.statoLavagnaJson).reusedPreview,picture);
      assert.equal(JSON.parse(reloaded.data.statoLavagnaJson).data.elements.find(row=>row.id==="cone").x,60);
      assert.equal((await pg.query("SELECT stato_lavagna_json FROM exercises WHERE id=700")).rows[0].stato_lavagna_json,original);
      console.log("PASS station reuse: archive description/image, detached layout and animation, current roster/attendance, saved/reloaded preview, source unchanged");
      return;
    }
    if (process.argv.includes("--fitness-match-readonly")) {
      await pg.exec("INSERT INTO users(id,first_name,last_name) VALUES(3,'Staff','Assigned'); INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,'coach')");
      const before = await pg.query("SELECT match_plan FROM matches WHERE id=501");
      for (const role of ["fitness_coach", "athletic_director"]) {
        const headers = { "x-role": role, "x-user": "3", "content-type": "application/json" };
        assert.equal((await call("/matches/501/callups", headers)).status, 200);
        for (const [url, method, body] of [
          ["/matches/501/plan", "PUT", { playerIds: [101,102], matchPlan: plan }],
          ["/matches/501", "PATCH", { matchPlan: plan }],
          ["/matches/501/callups", "POST", { playerId: 101 }],
          ["/callups/1", "PATCH", { status: "confirmed" }],
          ["/callups/1", "DELETE", {}],
          ["/matches/501/callups/publish", "POST", {}],
          ["/matches/501/meeting", "PATCH", { convocationAt: "2026-10-10T14:00:00Z", convocationPlace: "Campo" }],
          ["/matches/501/report-confirmation", "POST", {}],
        ]) {
          const response = await fetch(base+url, { method, headers, body: JSON.stringify(body) });
          assert.equal(response.status, 403, role+" "+method+" "+url+" "+await response.text());
        }
        assert.equal((await call("/matches/502/callups", headers)).status, 403);
      }
      assert.equal((await call("/matches/501/callups", {"x-role":"coach","x-user":"3"})).status, 200);
      const coachMeeting = await fetch(base+"/matches/501/callups", { method:"POST",
        headers:{"x-role":"coach","x-user":"3","content-type":"application/json"},
        body: JSON.stringify({playerId:101}) });
      assert.equal(coachMeeting.status, 200, await coachMeeting.text());
      assert.deepEqual((await pg.query("SELECT match_plan FROM matches WHERE id=501")).rows, before.rows);
      assert.equal((await pg.query("SELECT id FROM call_ups WHERE match_id=501")).rows.length, 2);
      console.log("PASS fitness match readonly: assigned viewing, all callup/lineup writes denied, coach callup preserved");
      return;
    }
    if (process.argv.includes("--dashboard-preparation")) {
      await pg.exec(`
        INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,session_kind,notes) VALUES
          (900,1,11,'Allenamento da preparare','2026-11-16T16:00:00Z','scheduled','regular','[FTB_AUTO_TRAINING]'),
          (901,1,11,'Piano parziale','2026-11-17T16:00:00Z','scheduled','regular',NULL),
          (902,1,11,'Piano completo','2026-11-18T16:00:00Z','scheduled','regular',NULL),
          (903,2,22,'Altro club','2026-11-18T16:00:00Z','scheduled','regular',NULL);
        INSERT INTO exercises(id,club_id,title,training_phase) VALUES
          (910,1,'Riscaldamento','iniziale'),(911,1,'Possesso','centrale'),(912,1,'Partitella','finale');
        INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES
          (910,901,910,0),(911,902,910,0),(912,902,911,1),(913,902,912,2);
      `);
      const result = await call("/training-sessions?includePreparation=1", { "x-role": "admin" });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const byId = new Map(result.data.map(session => [session.id, session.preparation]));
      assert.deepEqual(byId.get(900), { exerciseCount: 0, phases: [], complete: false });
      assert.deepEqual(byId.get(901), { exerciseCount: 1, phases: ["iniziale"], complete: false });
      assert.equal(byId.get(902).complete, true);
      assert.deepEqual(byId.get(902).phases.sort(), ["centrale", "finale", "iniziale"]);
      assert.equal(byId.has(903), false);
      console.log("PASS dashboard preparation: unstarted, partial, complete and club scope");
      return;
    }
    if (process.argv.includes("--availability-override-scope")) {
      const headers = {"x-role":"admin","content-type":"application/json"};
      const write = async (url, method, body, extra={}) => { const response=await fetch(base+url,{method,headers:{...headers,...(!url.startsWith('/players') ? {'x-role':'coach','x-user':'3'}:{}),...extra},body:JSON.stringify(body)});return {status:response.status,data:await response.text()}; };
      await pg.exec(`INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Scope'); UPDATE teams SET coach_id=3 WHERE id=11;
        INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,'coach');
        UPDATE players SET registered=true, medical_certificate_expiry='2099-01-01',status='active',available=true,created_at=now(),availability_override_active=true,availability_override_from='2000-01-01',availability_override_until='2099-01-01',availability_override_scope='training_only' WHERE id=101;
        CREATE SEQUENCE scope_notifications; ALTER TABLE club_notifications ALTER COLUMN id SET DEFAULT nextval('scope_notifications');
        INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,session_kind) VALUES(601,1,11,'Scope test','2026-10-12T15:30:00Z',90,'scheduled','regular');`);
      const player = await call('/players/101',{'x-role':'admin'});
      assert.equal(player.status,200,JSON.stringify(player.data));assert.equal(player.data.availabilityOverrideScope,'training_only');assert.equal(player.data.available,false);
      const training = await routes.readSessionEligibility(1,{id:601,teamId:11,notes:'',scheduledAt:new Date('2026-10-12T15:30:00Z'),durationMinutes:90,sessionKind:'regular'});
      assert(!training.blockedPlayerIds.includes(101),'Training-only override must allow training');
      const denied = await write('/matches/501/callups','POST',{playerId:101,status:'called'});assert.equal(denied.status,409,denied.data);assert(denied.data.includes('solo per allenamenti'));
      assert.equal((await write('/callups/1','PATCH',{status:'called'})).status,409);
      const deniedPlan=await write('/matches/501/plan','PUT',{playerIds:[101,102],matchPlan:plan});assert.equal(deniedPlan.status,409,deniedPlan.data);
      const deniedPublish=await write('/matches/501/callups/publish','POST',{convocationAt:'2026-10-10T14:00:00Z',convocationPlace:'Campo test'});assert.equal(deniedPublish.status,409,deniedPublish.data);
      const invalid=await write('/players/101','PATCH',{availabilityOverrideScope:'matches_only'});assert.equal(invalid.status,400,invalid.data);
      const unauthorized=await write('/players/101','PATCH',{availabilityOverrideScope:'training_and_matches'},{'x-role':'coach'});assert([200,403].includes(unauthorized.status),unauthorized.data);
      assert.equal((await call('/players/101',{'x-role':'admin'})).data.availabilityOverrideScope,'training_only','Coach must not change the override scope');
      const saved=await write('/players/101','PATCH',{availabilityOverrideActive:true,availabilityOverrideScope:'training_and_matches'});assert.equal(saved.status,200,saved.data);
      const all=await call('/players/101',{'x-role':'admin'});assert.equal(all.data.availabilityOverrideScope,'training_and_matches');assert.equal(all.data.available,true);
      assert.equal((await write('/callups/1','PATCH',{status:'called'})).status,200);
      await pg.exec("UPDATE players SET availability_override_scope='training_only',availability_override_until='2026-10-01' WHERE id=101");
      assert.equal((await write('/callups/1','PATCH',{status:'called'})).status,200,'Scope must use the match date, not a stale flag');
      console.log('PASS availability scope: round trip, training allowed, match/callup/plan blocked, dates, legacy scope and permissions');
      return;
    }
    if (process.argv.includes("--callup-rules")) {
      const now = new Date();
      const kickoff = new Date(now.getTime() + 300_000);
      const day = new Date(now.getTime() - 60_000);
      await pg.exec("UPDATE teams SET coach_id=3 WHERE id=11; INSERT INTO users(id,first_name,last_name) VALUES(3,\u0027Assigned\u0027,\u0027Coach\u0027); INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,\u0027coach\u0027);");
      await pg.query("UPDATE matches SET date=$1 WHERE id=501", [kickoff.toISOString()]);
      await pg.query("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,session_kind,status) VALUES(900,1,11,\u0027Seduta test\u0027,$1,\u0027regular\u0027,\u0027completed\u0027)", [day.toISOString()]);
      await pg.exec("INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(905,1,900,101,\u0027present\u0027);");
      const director = { "x-role": "technical_director" };
      const coach = { "x-role": "coach", "x-user": "3" };
      const write = (url, method, headers, data) => fetch(base + url, { method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(data) });
      const path = "/callup-rules/11";
      assert.equal((await write(path, "PUT", coach, { sessions: 1, minimum: 1 })).status, 403);
      assert.equal((await write(path, "PUT", director, { sessions: 6, minimum: 1 })).status, 400);
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 3 })).status, 400);
      const created = await write(path, "PUT", director, { sessions: 1, minimum: 1 });
      assert.equal(created.status, 204, await created.text());
      const manager = await call("/callup-rules?teamId=11", { "x-role": "team_manager" });
      assert.equal(manager.status, 200);
      assert.equal(manager.data.canEdit, false);
      assert.equal(manager.data.teams[0].rule.minimum, 1);
      await pg.exec("CREATE SEQUENCE callup_test_notifications; ALTER TABLE parent_notifications ALTER COLUMN id SET DEFAULT nextval(\u0027callup_test_notifications\u0027), ALTER COLUMN created_at SET DEFAULT now(); INSERT INTO parent_player_relations(id,parent_user_id,player_id) VALUES (1,1,101),(2,1,102);");
      const conduct = "/attendance/conduct/900";
      assert.equal((await write(conduct, "PUT", coach, { playerId: 101, conduct: "insufficiente" })).status, 400);
      const saved = await write(conduct, "PUT", coach, { playerId: 101, conduct: "insufficiente", note: "Motivazione di prova" });
      assert.equal(saved.status, 200, await saved.text());
      const checked = await call("/matches/501/callup-eligibility", coach);
      assert.equal(checked.status, 200, JSON.stringify(checked.data));
      assert.equal(checked.data.rows.find(row => row.id === 101).state, "blocked");
      assert.equal(checked.data.rows.find(row => row.id === 102).state, "pending");
      assert.equal((await write("/matches/501/callups/publish", "POST", coach, { convocationAt: now.toISOString(), convocationPlace: "Campo" })).status, 409);
      const corrected = await write(conduct, "PUT", coach, { playerId: 101, conduct: "buona" });
      assert.equal(corrected.status, 200, await corrected.text());
      assert.equal((await call("/matches/501/callup-eligibility", coach)).data.rows.find(row => row.id === 101).state, "eligible");
      await pg.exec("DELETE FROM call_ups WHERE match_id=501 AND player_id=102;");
      const publish = () => write("/matches/501/callups/publish", "POST", coach, { convocationAt: now.toISOString(), convocationPlace: "Campo" });
      const published = await publish();
      const publicResult = await published.json();
      assert.equal(published.status, 200, JSON.stringify(publicResult));
      assert.equal(publicResult.notifications, 1);
      assert.equal((await (await publish()).json()).notifications, 0);
      const firstChild = await call("/parent/notifications", { "x-child": "101" });
      const sibling = await call("/parent/notifications", { "x-child": "102" });
      assert.equal(firstChild.status, 200, JSON.stringify(firstChild.data));
      assert.equal(sibling.status, 200, JSON.stringify(sibling.data));
      assert.deepEqual(firstChild.data.map(item => item.type).sort(), ["match_callup", "training_conduct", "training_conduct"]);
      assert.deepEqual(sibling.data, []);
      // Same attendance, different rules per team; conduct never replaces attendance.
      await pg.exec("INSERT INTO teams(id,club_id,name,club_section) VALUES(13,1,'Piccoli Amici','scuola_calcio');");
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 1 })).status, 204);
      assert.equal((await write("/callup-rules/13", "PUT", director, { sessions: 2, minimum: 2 })).status, 204);
      assert.equal((await routes.readCallupRule(1, 11)).minimum, 1);
      assert.equal((await routes.readCallupRule(1, 13)).minimum, 2);
      await pg.query("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,session_kind,status) VALUES(901,1,11,'Seconda seduta',$1,'regular','completed'),(899,1,11,'Settimana precedente',$2,'regular','completed')", [new Date(now.getTime() - 120_000).toISOString(), new Date(now.getTime() - 7 * 86400_000).toISOString()]);
      await pg.exec("INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(906,1,901,101,'absent'),(907,1,900,102,'present'),(908,1,901,102,'present');");
      const check = async rule => (await routes.evaluateCallupRule(1, 11, kickoff, rule)).rows;
      let rows = await check({ sessions: 2, minimum: 1 });
      assert.equal(rows.find(row => row.id === 101).present, 1);
      assert.equal(rows.find(row => row.id === 101).state, "eligible", "1/2 plus good conduct is sufficient for Primi Calci");
      assert.equal(rows.find(row => row.id === 102).state, "pending", "2/2 without any conduct remains to verify");
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 1, allowUnratedConduct: "true" })).status, 400);
      assert.equal((await write(path, "PUT", coach, { sessions: 2, minimum: 1, allowUnratedConduct: true })).status, 403);
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 1, allowUnratedConduct: true })).status, 204);
      let persistedRule = await routes.readCallupRule(1, 11);
      assert.equal(persistedRule.allowUnratedConduct, true);
      assert.equal((await call("/callup-rules?teamId=11", coach)).data.teams[0].rule.allowUnratedConduct, true);
      assert.equal((await call("/matches/501/callup-eligibility", coach)).data.rows.find(row => row.id === 102).state, "eligible", "Explicit permission admits unrated conduct");
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 2 })).status, 204);
      persistedRule = await routes.readCallupRule(1, 11);
      assert.equal(persistedRule.allowUnratedConduct, true, "An older client omitting the option must preserve the saved choice");
      assert.equal((await routes.readCallupRule(1, 13)).allowUnratedConduct, false, "Other annate keep their own conduct rule");
      rows = await check(persistedRule);
      assert.equal(rows.find(row => row.id === 101).state, "blocked", "Allowing unrated conduct never bypasses attendance");
      assert.equal(rows.find(row => row.id === 102).state, "eligible");
      assert.equal((await write(path, "PUT", director, { sessions: 2, minimum: 1, allowUnratedConduct: false })).status, 204);
      assert.equal((await call("/matches/501/callup-eligibility", coach)).data.rows.find(row => row.id === 102).state, "pending", "Turning the option off restores missing-conduct verification");
      rows = await check({ sessions: 2, minimum: 2 });
      assert.equal(rows.find(row => row.id === 101).state, "blocked", "Good conduct cannot bypass a 2/2 attendance rule");
      assert.ok(rows.find(row => row.id === 101).reasons.some(reason => reason.includes("minimo 2")));
      await pg.exec("INSERT INTO training_conduct_reviews(club_id,session_id,player_id,conduct) VALUES(1,899,102,'ottima');");
      rows = await check({ sessions: 2, minimum: 2 });
      assert.equal(rows.find(row => row.id === 102).state, "eligible", "Latest recorded conduct remains valid when the current session has no new review");
      assert.equal(rows.find(row => row.id === 102).present, 2);
      await pg.exec("INSERT INTO training_conduct_reviews(club_id,session_id,player_id,conduct) VALUES(1,900,102,'insufficiente');");
      assert.equal((await check({ sessions: 2, minimum: 1 })).find(row => row.id === 102).state, "blocked", "New insufficient conduct supersedes older good conduct");
      assert.equal((await check({ sessions: 2, minimum: 1, allowUnratedConduct: true })).find(row => row.id === 102).state, "blocked", "Insufficient conduct is never admitted by the unrated option");
      await pg.exec("DELETE FROM training_conduct_reviews WHERE player_id=102; DELETE FROM training_attendances WHERE id=908;");
      const minimumReached = (await check({sessions:2,minimum:1,allowUnratedConduct:true})).find(row=>row.id===102);
      assert.equal(minimumReached.present,1);
      assert.equal(minimumReached.recorded,1);
      assert.equal(minimumReached.state,'eligible','1/2 with unrated conduct admitted must not wait for the second roll call');
      assert.equal((await check({sessions:2,minimum:2,allowUnratedConduct:true})).find(row=>row.id===102).state,'pending','Missing roll call cannot supply a second presence');
      assert.equal((await check({sessions:2,minimum:1,allowUnratedConduct:false})).find(row=>row.id===102).state,'pending','Explicit conduct verification still required when configured');
      assert.equal((await write(path,'PUT',director,{sessions:2,minimum:1,allowUnratedConduct:true})).status,204);
      assert.equal((await call('/matches/501/callup-eligibility',coach)).data.rows.find(row=>row.id===102).state,'eligible');
      await pg.query('UPDATE training_sessions SET scheduled_at=$1 WHERE id=901',[new Date(now.getTime()+120_000).toISOString()]);
      const futureRollCall=(await check({sessions:2,minimum:1,allowUnratedConduct:true})).find(row=>row.id===102);
      assert.equal(futureRollCall.state,'eligible','A second weekly session still in the future cannot block an attained 1/2 minimum');
      assert(futureRollCall.reasons.some(reason=>reason.includes('già raggiunto')));
      console.log("Callup permissions, weekly attendance, separate conduct, publication deduplication and sibling scope OK");
      return;
    }
    if (process.argv.includes("--motor-tests")) {
      await pg.exec(`UPDATE teams SET coach_id=3 WHERE id=11;
        INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Test');
        UPDATE players SET club_section='scuola_calcio',status='active',height=130 WHERE id=101;
        UPDATE players SET club_section='scuola_calcio',status='active' WHERE id=102;
        INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,session_kind,created_by_user_id)
          VALUES(900,1,11,'Seduta test','2026-11-17T16:30:00Z',75,'scheduled','regular',3);
        INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(900,1,900,101,'present');`);
      const staff = { "x-role": "fitness_coach", "x-user": "3" };
      const endpoint = "/motor-tests/12121212-1212-1212-1212-121212121212";
      const save = (data, headers = staff, path = endpoint) => fetch(base + path, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(data) });
      const test = { revision: 0, teamId: 11, date: "2026-11-17", cycle: "start", trainingSessionId: 900, tests: [
        { id: "anthropometry", minutes: 5, phase: "iniziale", link: false },
        { id: "high-jump", minutes: 8, phase: "centrale", link: true },
        { id: "long-jump", minutes: 8, phase: "centrale", link: false },
      ], results: { "101": { height: 135, weight: 28.4, tests: { "high-jump": { measurement: 27.5, score: 8, notes: "Atterraggio stabile" },
        "long-jump": { measurement: 121, score: 7, notes: "Spinta" } } } } };
      const context = await call("/motor-tests/context?teamId=11&date=2026-11-17&trainingSessionId=900", staff);
      assert.equal(context.status, 200, JSON.stringify(context.data));
      assert.equal(context.data.players.find(player => player.id === 101).coach, "present");
      await pg.exec("INSERT INTO players(id,club_id,team_id,first_name,last_name,status,club_section) VALUES(103,1,11,'Terzo','Test','active','scuola_calcio'),(104,1,11,'Quarto','Test','active','scuola_calcio'),(105,1,11,'Quinto','Test','active','scuola_calcio'),(106,1,11,'Sesto','Test','active','scuola_calcio'); INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(901,1,900,103,'present'),(902,1,900,104,'present'),(903,1,900,105,'present'),(904,1,900,106,'present')");
      const autoContext = await call("/motor-tests/context?teamId=11&date=2026-11-17", staff);
      assert.equal(autoContext.data.trainingSessionId, 900);
      assert.equal(autoContext.data.presentCount, 5);
      const absentResult = await save({ ...test, results: { "102": test.results[101] } });
      assert.equal(absentResult.status, 409);
      assert.equal((await save(test, { "x-role": "coach", "x-user": "3" })).status, 403);
      assert.equal((await save({ ...test, teamId: 12 })).status, 403);
      assert.equal((await save({ ...test, date: "2026-11-18" })).status, 400);
      const saved = await save(test);
      const body = await saved.json();
      assert.equal(saved.status, 200, JSON.stringify(body));
      assert.equal(body.results[101].tests["high-jump"].measurement, 27.5);
      assert.equal(body.results[101].tests["long-jump"].notes, "Spinta");
      assert.equal((await save(test)).status, 409);
      const updated = await save({ ...test, revision: 1, results: { ...test.results, "101": { ...test.results[101], weight: 40 } } });
      assert.equal(updated.status, 200, await updated.text());
      const [profile] = (await pg.query("SELECT height,weight,profile_history FROM players WHERE id=101")).rows;
      assert.equal(profile.height, 135);
      assert.equal(profile.weight, 40);
      assert.equal(profile.profile_history.entry.weight, 28.4);
      assert.equal(profile.profile_history.entry.height, 130);
      const exercises = (await pg.query("SELECT e.title FROM exercises e JOIN training_session_exercises x ON x.exercise_id=e.id WHERE x.training_session_id=900")).rows;
      assert.deepEqual(exercises, [{ title: "Salto in alto da fermo" }]);
      const summary = await call("/players/101/activity-summary", { "x-role": "admin" });
      assert.equal(summary.status, 200, JSON.stringify(summary.data));
      assert.equal(summary.data.motorTests[0].result.tests["high-jump"].score, 8);
      assert.deepEqual(summary.data.profile.height, { value: 135, date: "2026-11-17" });
      assert.deepEqual(summary.data.profile.weight, { value: 40, date: "2026-11-17" });
      assert.equal(summary.data.motorTests[0].tests.length, 3);
      const notTested = await call("/players/102/activity-summary", { "x-role": "admin" });
      assert.equal(notTested.status, 200, JSON.stringify(notTested.data));
      assert.ok(notTested.data.motorTests.some(row => row.id === "12121212-1212-1212-1212-121212121212" && !Object.keys(row.result.tests).length));
      const parent = await call("/parent/player-card", { "x-role": "parent", "x-child": "101" });
      assert.equal(parent.status, 200, JSON.stringify(parent.data));
      assert.equal(parent.data.activitySummary.motorTests[0].result.tests["high-jump"].measurement, 27.5);
      assert.equal(parent.data.activitySummary.motorTests[0].result.tests["high-jump"].notes, "Atterraggio stabile");
      const sibling = await call("/parent/player-card?playerId=101", { "x-role": "parent", "x-child": "102" });
      assert.equal(sibling.status, 200, JSON.stringify(sibling.data));
      assert.ok(sibling.data.activitySummary.motorTests.every(row => !Object.keys(row.result.tests).length));
      assert.ok(!JSON.stringify(sibling.data).includes("Atterraggio stabile"));
      const foreignChild = await call("/parent/player-card", { "x-role": "parent", "x-child": "201" });
      assert.equal(foreignChild.status, 200);
      assert.equal(foreignChild.data, null);
      await pg.exec("INSERT INTO training_conduct_reviews(club_id,session_id,player_id,conduct) VALUES(1,900,101,'buona')");
      await pg.query("UPDATE training_attendances SET notes=$1 WHERE training_session_id=900 AND player_id=101", ['[FTB_ATTENDANCE_META] {"conduct":"insufficiente"}']);
      const reviewedParent = await call("/parent/player-card", { "x-role": "parent", "x-child": "101" });
      assert.equal(reviewedParent.data.activitySummary.conduct.training.buona, 1);
      assert.equal(reviewedParent.data.activitySummary.conduct.training.insufficiente ?? 0, 0);
      const siblingReview = await call("/parent/player-card", { "x-role": "parent", "x-child": "102" });
      assert.equal(siblingReview.data.activitySummary.conduct.training.buona ?? 0, 0);
      const groupedPath = "/motor-tests/12121212-1212-1212-1212-121212121213";
      const groupedTest = { ...test, cycle: "middle", trainingSessionId: null, linkProgram: true, programPhase: "centrale",
        tests: test.tests.map(item => ({ ...item, link: false })), results: {} };
      const groupedSave = await save(groupedTest, staff, groupedPath);
      const grouped = await groupedSave.json();
      assert.equal(groupedSave.status, 200, JSON.stringify(grouped));
      assert.equal(grouped.trainingSessionId, 900);
      assert.ok(grouped.stationId);
      assert.equal((await save(grouped, staff, groupedPath)).status, 200);
      const fromCoach = await call("/training-sessions/900/exercises", { "x-role": "coach", "x-user": "3" });
      assert.equal(fromCoach.status, 200, JSON.stringify(fromCoach.data));
      const stations = fromCoach.data.filter(link => link.exercise?.title === "Test motori");
      assert.equal(stations.length, 1);
      assert.equal(stations[0].exercise.durationMinutes, 21);
      const stationsMarker = "[FTB_EXERCISE_STATIONS]";
      const proofs = JSON.parse(stations[0].exercise.description.split(stationsMarker)[1]);
      assert.deepEqual(proofs.map(proof => proof.id), ["anthropometry", "high-jump", "long-jump"]);
      assert.ok(proofs.every(proof => proof.exercise && proof.equipment && proof.objective));
      assert.ok(proofs.every(proof => proof.boardJson && proof.boardPreview && proof.motorSessionId === "12121212-1212-1212-1212-121212121213"));
      const groupedCurrent=(await call("/motor-tests",staff)).data.sessions.find(row=>row.id===grouped.id);
      const reorder=await save({...groupedCurrent,tests:[...groupedCurrent.tests].reverse()},staff,groupedPath);
      assert.equal(reorder.status,200,await reorder.text());
      const reorderedStation=await pg.query("SELECT description FROM exercises WHERE id=$1",[grouped.stationId]);
      assert.deepEqual(JSON.parse(reorderedStation.rows[0].description.split(stationsMarker)[1]).map(row=>row.id),["long-jump","high-jump","anthropometry"]);
      const latest=(await call("/motor-tests",staff)).data.sessions.find(row=>row.id==="12121212-1212-1212-1212-121212121212");
      const rich={version:1,status:"done",reason:"",conditions:{},reference:"formal",attempts:[{id:"formal",kind:"formal",valid:true,values:{leftBase:185,leftTop:218,rightBase:182,rightTop:218},observations:{"0":{value:true,note:"Spinta coordinata"}}}]};
      const coachSaved=await save({...latest,results:{...latest.results,"101":{...latest.results[101],tests:{...latest.results[101].tests,"high-jump":{...latest.results[101].tests["high-jump"],assessment:rich}}}}},{"x-role":"coach","x-user":"3"});
      const coachData=await coachSaved.json();assert.equal(coachSaved.status,200,JSON.stringify(coachData));
      assert.equal(coachData.results[101].tests["high-jump"].measurement,36);
      assert.equal(coachData.results[101].tests["high-jump"].assessment.attempts[0].observations["0"].note,"Spinta coordinata");
      assert.equal((await save({...coachData,tests:[...coachData.tests].reverse()},{"x-role":"coach","x-user":"3"})).status,403);
      assert.equal((await save({...coachData,results:{...coachData.results,"102":coachData.results[101]}},{"x-role":"coach","x-user":"3"})).status,409);
      assert.equal((await save(coachData,{"x-role":"secretary","x-user":"3"})).status,403);
      assert.equal((await save(coachData,{"x-role":"coach","x-user":"1"})).status,403);
      const refreshedParent=await call("/parent/player-card",{"x-role":"parent","x-child":"101"});
      assert.equal(refreshedParent.data.activitySummary.motorTests.find(row=>row.id===coachData.id).result.tests["high-jump"].measurement,36);
      const tgmdAssessment={...rich,legacyMeasurement:121,reference:"long-confirm",attempts:[{id:"long-confirm",kind:"formal",valid:true,values:{cm:130},observations:{}}],tgmd:{edition:"tgmd3-it-2023",confirmedProtocol:true,trials:[[false,false,false,false],[false,false,false,false]],notes:["Entrambe le prove osservate","","",""]}};
      const tgmdSave=await save({...coachData,results:{...coachData.results,"101":{...coachData.results[101],tests:{...coachData.results[101].tests,"long-jump":{...coachData.results[101].tests["long-jump"],assessment:tgmdAssessment}}}}},{"x-role":"coach","x-user":"3"});
      const tgmdData=await tgmdSave.json();assert.equal(tgmdSave.status,200,JSON.stringify(tgmdData));
      const tgmdParent=await call("/parent/player-card",{"x-role":"parent","x-child":"101"});
      const parentLong=tgmdParent.data.activitySummary.motorTests.find(row=>row.id===coachData.id).result.tests["long-jump"];
      assert.equal(parentLong.measurement,130);assert.equal(parentLong.assessment.legacyMeasurement,121);
      assert.deepEqual(parentLong.assessment.tgmd.trials,[[false,false,false,false],[false,false,false,false]]);
      assert.equal(parentLong.assessment.tgmd.notes[0],"Entrambe le prove osservate");
      await pg.exec("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,session_kind) VALUES(901,1,11,'Seconda seduta','2026-11-17T18:00:00Z','scheduled','regular')");
      assert.equal((await save(groupedTest, staff, "/motor-tests/12121212-1212-1212-1212-121212121214")).status, 400);
      const newerTest = { ...test, revision: 0, date: "2027-02-18", cycle: "middle", trainingSessionId: null,
        tests: test.tests.map(item => ({ ...item, link: false })), results: { "101": { height: 128.5, weight: 26.75, tests: {} } } };
      const newerSave = await save(newerTest, staff, "/motor-tests/12121212-1212-1212-1212-121212121215");
      assert.equal(newerSave.status, 200, await newerSave.clone().text());
      const currentMeasures = async () => (await pg.query("SELECT height,weight,profile_history FROM players WHERE id=101")).rows[0];
      let measures = await currentMeasures();
      assert.equal(measures.height, 128.5, "a lower but newer measurement is authoritative");
      assert.equal(measures.weight, 26.75); assert.equal(measures.profile_history.entry.height, 130);
      const older = (await call("/motor-tests", staff)).data.sessions.find(row => row.id === "12121212-1212-1212-1212-121212121212");
      assert.equal((await save({ ...older, results: { ...older.results, "101": { ...older.results[101], height: 140 } } })).status, 200);
      assert.equal((await currentMeasures()).height, 128.5, "editing an older test cannot replace the current measurement");
      const entryPath = "/players/101/entry-measurements";
      const correctEntry = (role, club = "1") => fetch(base + entryPath, { method: "PATCH", headers: { "x-role": role, "x-user": "3", "x-club": club, "content-type": "application/json" }, body: JSON.stringify({ height: 129.25, weight: 27.5, note: "Correzione dato dichiarato" }) });
      assert.equal((await correctEntry("coach")).status, 403);
      assert.equal((await correctEntry("secretary", "2")).status, 404);
      const correctedEntry = await correctEntry("fitness_coach"); assert.equal(correctedEntry.status, 200, await correctedEntry.clone().text());
      measures = await currentMeasures(); assert.equal(measures.profile_history.entry.height, 129.25);
      assert.equal(measures.profile_history.entry.weight, 27.5); assert.equal(measures.height, 128.5); assert.equal(measures.weight, 26.75);
      assert.equal(measures.profile_history.entryCorrections[0].height.from, 130);
      assert.equal(measures.profile_history.entryCorrections[0].height.to, 129.25);
      await pg.exec("UPDATE players SET team_id=12 WHERE id=101; UPDATE players SET created_at=coalesce(created_at, now()) WHERE club_id=1");
      const seasonRoster = await call("/players", { "x-role": "admin" });
      assert.equal(seasonRoster.status, 200, JSON.stringify(seasonRoster.data));
      const seasonCarry = seasonRoster.data.find(row => row.id === 101);
      assert.equal(seasonCarry.height, 128.5); assert.equal(seasonCarry.weight, 26.75);
      assert.equal((await currentMeasures()).profile_history.entry.height, 129.25, "entry and latest measures survive a change of team/season");
      await pg.exec("UPDATE players SET team_id=11 WHERE id=101; INSERT INTO club_memberships(id,club_id,user_id,role,staff_role,club_section) VALUES(99003,1,3,'fitness_coach','collaboratore','{scuola_calcio}')");
      assert.equal((await correctEntry("fitness_coach")).status, 403);
      console.log("PASS motor tests: single station, coach access, auto-selection, ambiguity, initial measurements and separate results");
      return;
    }
    if (process.argv.includes("--fitness-results")) {
      await pg.exec(`UPDATE players SET club_section='scuola_calcio' WHERE id IN (101,201);
        UPDATE players SET team_id=12, club_section='settore_giovanile' WHERE id=102;
        UPDATE teams SET coach_id=3 WHERE id=11;
        INSERT INTO users(id,first_name,last_name) VALUES(3,'Assigned','Coach');
        INSERT INTO player_fitness_data(id,club_id,player_id,date,activity_type,speed,notes)
          VALUES(701,1,101,'2026-11-12','test_atletico',72,'Riservato'),
            (702,1,102,'2026-11-13','test_atletico',79,'Secondo settore'),
            (703,2,201,'2026-11-14','test_atletico',90,'Altro club'),
            (704,1,101,'2026-11-15','recupero_infortunio',50,'Riservato');`);
      for (const role of ["director", "sporting_director", "technical_director"]) {
        const result = await call("/player-fitness-data?view=dashboard&section=scuola_calcio", { "x-role": role });
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal(result.data.total, 1);
        assert.deepEqual(result.data.entries.map(entry => entry.id), [701]);
        assert.ok(!JSON.stringify(result.data).includes("Riservato"));
      }
      const headers = { "x-role": "coach", "x-user": "3" };
      const own = await call("/player-fitness-data?view=dashboard", headers);
      assert.deepEqual(own.data.entries.map(entry => entry.id), [701]);
      assert.deepEqual((await call("/player-fitness-data?view=dashboard&teamId=12", headers)).data, { total: 0, entries: [] });
      const send = (role, method, path, body) => fetch(base + path, {
        method, headers: { "x-role": role, "x-user": "3", "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = { playerId: 101, date: "2026-11-16", activityType: "test_atletico", speed: 80 };
      assert.equal((await send("technical_director", "POST", "/player-fitness-data", payload)).status, 403);
      assert.equal((await send("coach", "PATCH", "/player-fitness-data/701", { speed: 85 })).status, 403);
      assert.equal((await send("fitness_coach", "POST", "/player-fitness-data", { ...payload, playerId: 102 })).status, 403);
      assert.equal((await send("fitness_coach", "POST", "/player-fitness-data", { ...payload, playerId: 102, playerIds: [] })).status, 400);
      const created = await send("fitness_coach", "POST", "/player-fitness-data", payload);
      const createdEntry = await created.json();
      assert.equal(created.status, 201, JSON.stringify(createdEntry));
      assert.equal((await send("fitness_coach", "PATCH", "/player-fitness-data/" + createdEntry.id, { speed: 85 })).status, 200);
      assert.equal((await call("/player-fitness-data?view=dashboard", headers)).data.entries[0].speed, 85);
      await pg.exec("INSERT INTO club_memberships(id,club_id,user_id,role,staff_role,club_section) VALUES(3,1,3,'fitness_coach','collaboratore','{scuola_calcio}')");
      const collaborator = { "x-role": "fitness_coach", "x-user": "3" };
      assert.deepEqual((await call("/player-fitness-data/capabilities", collaborator)).data, { canEdit: false });
      assert.equal((await send("fitness_coach", "PATCH", "/player-fitness-data/701", { speed: 86 })).status, 403);
      assert.equal((await call("/player-fitness-data?view=tests", collaborator)).status, 200);
      await pg.query("UPDATE players SET notes=$1, club_section=$2 WHERE id=102", ['[FTB_PLAYER_META] {"supplementalTeamId":11}', "scuola_calcio"]);
      await pg.exec("UPDATE player_fitness_data SET activity_type=NULL WHERE id=702");
      const aggregation = await call("/player-fitness-data?view=tests&teamId=11", headers);
      assert.equal(aggregation.status, 200);
      assert.equal(aggregation.data.filter(row => row.id === 702).length, 1);
      assert.equal(aggregation.data.find(row => row.id === 702).notes, null);
      console.log("PASS fitness results: roles, scope, legacy and supplemental tests, note privacy.");
      return;
    }
    if (process.argv.includes("--withdrawals")) {
      await pg.exec(`UPDATE players SET club_section='scuola_calcio', status='active', available=true, registered=true, created_at=now() WHERE id IN (101,102);
        INSERT INTO seasons(id,club_id,name,start_date,end_date,is_active) VALUES
          (12001,1,'2026/27','2026-07-01','2027-06-30',true), (12002,1,'2027/28','2027-07-01','2028-06-30',false);
        UPDATE teams SET season_id=12001 WHERE id=11;
        INSERT INTO player_payments(id,club_id,player_id,amount,status,due_date)
          VALUES (6001,1,101,20,'pending','2020-01-01'), (6002,1,101,30,'overdue','2020-01-01'), (6003,1,102,70,'paid','2020-01-01');`);
      const admin = { "x-role": "admin" };
      const ledger = "/player-payments/overdue-players?seasonId=12001";
      assert.equal((await call(ledger, { "x-role": "coach" })).status, 403);
      const before = await call(ledger, admin);
      assert.equal(before.status, 200, JSON.stringify(before.data));
      assert.deepEqual(before.data.overdueIds, [101]);
      assert.deepEqual(before.data.enrolledIds.sort(), [101,102]);
      const send = async (url, method, body, headers = admin) => fetch(base + url, {
        method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
      });
      const transition = (season, status) => send("/seasons/" + season + "/player-status", "POST", { playerId: 101, status });
      assert.equal((await transition(12001, "withdrawn")).status, 201);
      const directory = await call("/players?teamId=11", admin);
      assert.equal(directory.status, 200, JSON.stringify(directory.data));
      assert.equal(directory.data.find(row => row.id === 101).status, "withdrawn");
      assert.equal(directory.data.find(row => row.id === 101).available, false);
      assert.ok(!(await call("/players?teamId=11&activeRoster=1", admin)).data.some(row => row.id === 101));
      assert.ok(!(await call("/teams/11/members", admin)).data.some(row => row.id === 101));
      assert.equal((await call("/dirigenti/overview?teamId=11", { "x-role": "team_manager" })).data.players.length, 1);
      assert.equal((await call("/matches/501/callups", admin)).data.length, 2);
      assert.deepEqual((await call(ledger, admin)).data, { enrolledIds: [102], overdueIds: [] });
      assert.equal((await transition(12001, "confirmed")).status, 200);
      assert.ok((await call("/players?teamId=11&activeRoster=1", admin)).data.some(row => row.id === 101));
      assert.equal((await transition(12001, "withdrawn")).status, 200);
      assert.equal((await transition(12002, "confirmed")).status, 201);
      assert.ok(!(await call("/players?teamId=11&activeRoster=1", admin)).data.some(row => row.id === 101));
      assert.equal((await send("/seasons/12002", "PATCH", { isActive: true })).status, 200);
      assert.ok((await call("/players?teamId=11&activeRoster=1", admin)).data.some(row => row.id === 101));
      const promote = await send("/seasons/12001/promote", "POST", { toSeasonId: 12002 });
      assert.equal(promote.status, 200);
      assert.equal((await promote.json()).promoted[0].playersPromoted, 1);
      const team = (await pg.query("SELECT t.season_id FROM players p JOIN teams t ON t.id=p.team_id WHERE p.id=101")).rows[0];
      assert.equal(team.season_id, 12002);
      console.log("PASS withdrawals and payment alerts: unique overdue players, scope, active rosters, historical callups and return in either season.");
      return;
    }
    if (process.argv.includes("--document-files")) {
      await pg.exec("UPDATE players SET club_section='scuola_calcio' WHERE id IN (101, 102); UPDATE teams SET coach_id=3 WHERE id=11");
      const fileData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=";
      const payload = { playerId: 101, type: "medicalCertificate", fileName: "certificato.png", fileType: "image/png", fileData };
      const send = async (url, method, body, role) => {
        const response = await fetch(base + url, {
          method, headers: { "content-type": "application/json", "x-role": role, "x-user": role === "coach" ? "3" : "1" },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: await response.json() };
      };
      const saved = await send("/player-documents", "POST", payload, "secretary");
      assert.equal(saved.status, 201, JSON.stringify(saved.data));
      assert.equal(saved.data.fileData, fileData);
      const loaded = await call("/player-documents", { "x-role": "secretary" });
      assert.equal(loaded.data.find(doc => doc.id === saved.data.id).fileData, fileData);
      assert.equal((await send("/player-documents", "POST", { ...payload, playerId: 201 }, "secretary")).status, 404);
      assert.equal((await send("/parent/documents", "POST", { ...payload, playerId: 102 }, "parent")).status, 403);
      assert.equal((await send("/parent/documents", "POST", { ...payload, fileData: "" }, "parent")).status, 400);
      const sent = await send("/parent/documents", "POST", payload, "parent");
      assert.equal(sent.status, 201, JSON.stringify(sent.data));
      assert.equal(sent.data.type, "parentSubmission");
      const opened = await call("/parent/documents?view=upload");
      assert.equal(opened.data.child.id, 101);
      assert.equal(opened.data.uploads[0].fileData, fileData);
      assert.equal(opened.data.clubDocs[0].id, saved.data.id);
      const notes = "Nota di prova\n\n[FTB_POST_FILES]" + JSON.stringify([{ fileName: "foto.png", fileData }]);
      const savedNotes = await send("/matches/501", "PATCH", { postMatchNotes: notes }, "coach");
      assert.equal(savedNotes.status, 200, JSON.stringify(savedNotes.data));
      assert.equal(savedNotes.data.postMatchNotes, notes);
      const stored = await pg.query("SELECT post_match_notes FROM matches WHERE id=501");
      assert.equal(stored.rows[0].post_match_notes, notes);
      const publicMatches = await call("/parent/matches");
      assert.ok(!JSON.stringify(publicMatches.data).includes(fileData));
      console.log("PASS document files: staff and parent upload, reload, scope and match attachment persistence.");
      return;
    }
    if (process.argv.includes("--payment-desk")) {
      await pg.exec("DROP TABLE player_payment_kit_items");
      await pg.exec(`UPDATE players SET status='active', available=true, registered=true,
        medical_certificate_expiry='2099-01-01', availability_override_active=false WHERE id IN (101,102,201);
        UPDATE players SET available=false, unavailability_reason='other' WHERE id=102`);
      const send = (url, method, body, role = "secretary", club = "1") => fetch(base + url, {
        method, headers: { "Content-Type": "application/json", "x-role": role, "x-club": club }, body: JSON.stringify(body),
      });
      const add = async (playerId, dueDate, paymentType = "annual_fee_installment", amount = 180) => {
        const response = await send("/player-payments", "POST", { playerId, dueDate, paymentType, amount, status: "pending" });
        assert.equal(response.status, 201);
        return response.json();
      };
      const availability = async id => (await pg.query("SELECT available, unavailability_reason FROM players WHERE id=$1", [id])).rows[0];
      const first = await add(101, "2020-01-01");
      const second = await add(101, "2020-02-01", "insurance_fee", 25);
      const unrelated = await add(102, "2020-02-01");
      await pg.query("UPDATE players SET notes=$1 WHERE id=101", ['[FTB_PLAYER_META] {"supplementalTeamId":12}']);
      const registry = await call("/player-payments", { "x-role": "admin" });
      assert.equal(registry.status, 200, JSON.stringify(registry.data));
      const assigned = registry.data.filter(payment => payment.playerId === 101);
      assert.equal(assigned.length, 2);
      assert.ok(assigned.every(payment => payment.teamId === 11 && payment.supplementalTeamId === 12 && !("playerNotes" in payment)));
      assert.equal(registry.data.find(payment => payment.id === unrelated.id).supplementalTeamId, null);
      assert.equal(assigned[0].paymentTime, null);
      const receipt = { playerId: 101, amount: 9, status: "paid", paymentDate: "2026-11-17", paymentMethod: "card" };
      assert.equal((await send("/player-payments", "POST", { ...receipt, paymentTime: "24:00" })).status, 400);
      const timedResponse = await send("/player-payments", "POST", { ...receipt, paymentTime: "14:45" });
      assert.equal(timedResponse.status, 201);
      const timed = await timedResponse.json();
      const readTime = async () => (await call("/player-payments", { "x-role": "admin" })).data.find(item => item.id === timed.id).paymentTime;
      assert.equal(await readTime(), "14:45");
      const timedPath = "/player-payments/" + timed.id;
      assert.equal((await send(timedPath, "PATCH", { ...receipt, paymentDate: "2026-11-18" })).status, 200);
      assert.equal(await readTime(), null);
      assert.equal((await send(timedPath, "PATCH", { ...receipt, paymentTime: "09:05" })).status, 200);
      assert.equal(await readTime(), "09:05");
      assert.equal((await send(timedPath, "PATCH", { ...receipt, paymentTime: null })).status, 200);
      assert.equal(await readTime(), null);
      assert.equal((await send(timedPath, "DELETE")).status, 204);
      assert.deepEqual(await availability(101), { available: false, unavailability_reason: "payment" });
      const due = `/player-payments/${first.id}/due-date`;
      const newDate = { dueDate: "2098-02-01" };
      assert.equal((await send(due, "PATCH", newDate, "admin")).status, 403);
      assert.equal((await send(due, "PATCH", newDate, "presidente", "2")).status, 409);
      assert.equal((await send(due, "PATCH", { dueDate: "2026-02-30" }, "presidente")).status, 400);
      assert.equal((await send(due, "PATCH", newDate, "presidente")).status, 200);
      assert.equal((await availability(101)).available, false);
      const collect = (playerId, ids, role) => send("/player-payments/settle", "POST",
        { playerId, ids, paymentDate: "2026-11-12", paymentMethod: "cash" }, role);
      assert.equal((await collect(101, [second.id], "presidente")).status, 403);
      assert.equal((await collect(101, [first.id, unrelated.id])).status, 409);
      assert.equal((await collect(101, [second.id])).status, 204);
      assert.deepEqual(await availability(101), { available: true, unavailability_reason: null });
      assert.equal((await collect(101, [second.id])).status, 409);
      assert.equal((await send(`/player-payments/${second.id}/due-date`, "PATCH", newDate, "presidente")).status, 409);
      assert.equal((await collect(102, [unrelated.id])).status, 204);
      assert.deepEqual(await availability(102), { available: false, unavailability_reason: "other" });
      await pg.exec("UPDATE players SET available=false, status='inactive', unavailability_reason='regular' WHERE id=101");
      assert.equal((await collect(101, [first.id])).status, 204);
      assert.deepEqual(await availability(101), { available: true, unavailability_reason: null });
      const ledger = await call("/player-payments", { "x-role": "presidente" });
      assert.equal(ledger.status, 200, JSON.stringify(ledger.data));
      assert.equal(ledger.data.find(row => row.id === second.id).paymentMethod, "cash");
      assert.equal(ledger.data.find(row => row.id === first.id).dueDate, newDate.dueDate);
      const balanceAnnual = await add(101, "2098-03-01", "annual_fee_installment", 180);
      const balanceInsurance = await add(101, "2098-03-01", "insurance_fee", 25);
      const separateDebt = await add(101, "2098-03-01", "other", 50);
      const beforeBalance = (await call("/player-payments", { "x-role": "secretary" })).data.filter(row => row.playerId === 101);
      const balanceRows = routes.quoteBalancePayments(beforeBalance);
      assert.deepEqual(balanceRows.map(row => row.id).sort((a,b)=>a-b), [balanceAnnual.id, balanceInsurance.id].sort((a,b)=>a-b));
      assert.equal((await collect(101, balanceRows.map(row => row.id))).status, 204);
      const afterBalance = (await call("/player-payments", { "x-role": "secretary" })).data.filter(row => row.playerId === 101);
      assert.equal(afterBalance.length, beforeBalance.length, "Settlement updates existing rows without creating a duplicate quota");
      assert.equal(routes.quoteBalancePayments(afterBalance).length, 0);
      assert.equal(afterBalance.find(row => row.id === separateDebt.id).status, "pending", "Unrelated debts are not included in quote balance");
      assert.deepEqual(routes.quoteBalancePayments([
        {id:1,status:'pending',amount:180,paymentType:'player_total_installment',description:'Piano totale – rata 3/3'},
        {id:2,status:'paid',amount:190,paymentType:'registration_fee'},
        {id:3,status:'pending',amount:67,paymentType:'kit_payment'},
        {id:4,status:'pending',amount:30,paymentType:'shuttle_monthly'},
        {id:5,status:'pending',amount:25,paymentType:'extra_time_fee'},
        {id:6,status:'pending',amount:0,paymentType:'annual_fee_installment'},
        {id:7,status:'paid',amount:25,paymentType:'insurance_fee'},
      ]).map(row=>row.id), [1], "Unified residual included, paid fees and separate services excluded");
      await pg.exec("INSERT INTO players(id,club_id,team_id,first_name,last_name) VALUES(103,1,11,'New','Player')");
      await pg.exec("INSERT INTO players(id,club_id,team_id,first_name,last_name) VALUES(104,1,11,'Annual','Example')");
      const firstFee = await send('/player-payments','POST',{playerId:104,amount:170,paymentType:'registration_fee',status:'paid',paymentDate:'2026-10-22',paymentMethod:'bank_transfer'});
      assert.equal(firstFee.status,201);
      const feeReceipt = await firstFee.json();
      const insuranceFee = await send('/player-payments','POST',{playerId:104,amount:25,paymentType:'insurance_fee',status:'paid',paymentDate:'2026-11-01',paymentMethod:'card'});
      assert.equal(insuranceFee.status,201);
      const totalBody={playerId:104,total:335,dueDate:'2098-01-30',expectedQuoteRows:[feeReceipt]};
      assert.equal((await send('/player-payments/annual-total','POST',totalBody,'presidente')).status,403);
      assert.equal((await send('/player-payments','POST',{playerId:104,amount:335,paymentType:'annual_fee_installment',status:'pending',dueDate:'2098-01-30'})).status,409,'Raw annual plus registration must not double-charge');
      const totalResponse=await send('/player-payments/annual-total','POST',totalBody);
      assert.equal(totalResponse.status,200,await totalResponse.clone().text());
      const annualDue=await totalResponse.json();
      assert.equal(annualDue.amount,165,'Annual total 335 less registration 170; insurance separate');
      assert.equal(annualDue.annualFeeTotal,335);
      assert.equal((await send('/player-payments/annual-total','POST',totalBody)).status,409,'Stale retry cannot duplicate residual');
      const annualSnapshot=(await call('/player-payments',{'x-role':'secretary'})).data.filter(row=>row.playerId===104);
      assert.equal(annualSnapshot.reduce((n,row)=>n+row.amount,0),360);
      assert.deepEqual(annualSnapshot.find(row=>row.id===feeReceipt.id),{...annualSnapshot.find(row=>row.id===feeReceipt.id),amount:170,status:'paid',paymentMethod:'bank_transfer',paymentDate:'2026-10-22'});
      const expectedQuoteRows=annualSnapshot.filter(row=>row.paymentType!=='insurance_fee');
      assert.equal((await send('/player-payments/annual-total','POST',{...totalBody,total:100,expectedQuoteRows})).status,409,'Cannot erase or reduce paid receipts');
      await pg.query('UPDATE player_payments SET amount=335,annual_fee_total=NULL WHERE id=$1',[annualDue.id]);
      const legacyRows=(await call('/player-payments',{'x-role':'secretary'})).data.filter(row=>row.playerId===104&&row.paymentType!=='insurance_fee');
      const repair=await send('/player-payments/annual-total','POST',{...totalBody,expectedQuoteRows:legacyRows});
      assert.equal(repair.status,200);
      assert.equal((await repair.json()).amount,165,'Correct existing unpaid annual row without replacing receipts');
      assert.equal((await send('/player-payments','POST',{playerId:104,amount:10,paymentType:'registration_fee',status:'pending'})).status,409,'First installment cannot be added on top of an existing annual debt');
      await pg.exec("INSERT INTO players(id,club_id,team_id,first_name,last_name) VALUES(105,1,11,'Annual first','Example')");
      const annualFirstResponse=await send('/player-payments/annual-total','POST',{playerId:105,total:335,dueDate:'2098-01-30',expectedQuoteRows:[]});
      assert.equal(annualFirstResponse.status,200);
      const annualFirst=await annualFirstResponse.json();
      const registrationBody={playerId:105,amount:170,paymentType:'registration_fee',status:'paid',paymentDate:'2026-10-22',paymentMethod:'bank_transfer',registrationWithinAnnual:true,expectedQuoteRows:[annualFirst]};
      assert.equal((await send('/player-payments','POST',registrationBody)).status,201);
      assert.equal((await send('/player-payments','POST',registrationBody)).status,409,'Stale first-installment retry does not add another receipt');
      const annualFirstRows=(await call('/player-payments',{'x-role':'secretary'})).data.filter(row=>row.playerId===105);
      assert.equal(annualFirstRows.reduce((n,row)=>n+row.amount,0),335,'Annual-first workflow keeps total unchanged');
      assert.equal(annualFirstRows.find(row=>row.id===annualFirst.id).amount,165);
      const plan = {
        playerId: 103, total: 310, alreadyPaid: 0, upfront: 25,
        deposits: [{ amount: 25, purpose: "Assicurazione", paymentMethod: "cash", paymentDate: "2026-11-12" }],
        replaceTypes: ["player_total_installment"],
        installments: [
          { amount: 145, purpose: "Iscrizione", dueDate: "2098-01-01" },
          { amount: 140, dueDate: "2098-02-01" },
        ],
        expectedPayments: [],
      };
      assert.equal((await send("/player-payment-plan", "POST", plan)).status, 204);
      const planned = (await call("/player-payments", { "x-role": "secretary" })).data.filter(row => row.playerId === 103);
      const enrollment = planned.find(row => row.description.endsWith(" - Iscrizione"));
      assert.equal(enrollment.amount, 145);
      assert.equal(enrollment.dueDate, "2098-01-01");
      assert.equal(enrollment.status, "pending");
      assert.equal(planned.filter(row => row.status !== "paid").reduce((sum, row) => sum + row.amount, 0), 285);
      await pg.exec(`UPDATE players SET club_section='scuola_calcio' WHERE id=101;
        INSERT INTO warehouse_items(id,club_id,section,code,name,item_type,price,size,is_active)
        VALUES (6101,1,'apparel','K-XS','Maglia allenamento','inventory',10,'XS',1),
          (6102,2,'apparel','K-OUT','Altra società','inventory',10,'XS',1),
          (6103,1,'apparel','ANNUALE','Quota annuale','annual_fee',10,NULL,1)`);
      const newKit = { playerId: 101, paymentType: "kit_payment", kitItemId: 6101, amount: 10,
        status: "paid", paymentDate: "2026-11-16", paymentMethod: "card" };
      assert.equal((await send("/player-payments", "POST", { ...newKit, kitItemId: 6102 })).status, 404);
      assert.equal((await send("/player-payments", "POST", { ...newKit, kitItemId: 6103 })).status, 404);
      const kitResponse = await send("/player-payments", "POST", newKit);
      assert.equal(kitResponse.status, 201, await kitResponse.clone().text());
      const kit = await kitResponse.json();
      assert.equal(kit.paymentType, "kit_article");
      assert.deepEqual(kit.kitArticle, { id: 6101, name: "Maglia allenamento", code: "K-XS", size: "XS", rowKey: `payment:${kit.id}`, slotKey: "training_shirt", quantity: 1 });
      const kitOrderPath = `/player-payments/${kit.id}/kit-order`;
      assert.equal((await call(kitOrderPath, { "x-role": "coach" })).status, 403);
      assert.equal((await call(kitOrderPath, { "x-role": "secretary", "x-club": "2" })).status, 404);
      let kitOrder = await call(kitOrderPath, { "x-role": "secretary" });
      assert.equal(kitOrder.data.row.sourcePaymentId, kit.id);
      assert.equal(kitOrder.data.row.price, "10");
      assert.equal(kitOrder.data.requests.length, 0, "a receipt does not imply a warehouse request or delivery");
      assert.equal((await send(kitOrderPath, "POST", { quantity: 1, slotKey: "training_shirt" })).status, 200);
      const assignment = async () => (await pg.query("SELECT training_kit FROM equipment_assignments WHERE club_id=1 AND player_id=101 ORDER BY id LIMIT 1")).rows[0];
      let assignedKit = JSON.parse((await assignment()).training_kit);
      assert.equal(assignedKit.kitRows.filter(row => row.sourcePaymentId === kit.id).length, 1);
      const staleEquipment = { playerId: 101, trainingKit: JSON.stringify({ kitRows: [], extraTimeRows: [{ notes: "Keep extra time" }] }) };
      assert.equal((await send("/equipment", "POST", staleEquipment)).status, 200);
      assignedKit = JSON.parse((await assignment()).training_kit);
      assert.equal(assignedKit.kitRows.filter(row => row.sourcePaymentId === kit.id).length, 1, "stale player form cannot erase a payment-owned row");
      assert.equal(assignedKit.extraTimeRows[0].notes, "Keep extra time");
      const badRow = { ...assignedKit.kitRows[0], sourcePaymentId: 999999, key: "payment:999999" };
      assert.equal((await send("/equipment", "POST", { playerId: 101, trainingKit: JSON.stringify([badRow]) })).status, 400);
      const legacyKit = await add(101, "2098-02-01", "kit_payment", 8);
      const linkPath = `/player-payments/${legacyKit.id}/kit-item`;
      assert.equal((await send(linkPath, "PATCH", { kitItemId: 6101 }, "admin")).status, 403);
      assert.equal((await send(linkPath, "PATCH", { kitItemId: 6101 })).status, 200);
      assert.equal((await send(linkPath, "PATCH", { kitItemId: 6101 })).status, 404);
      const refreshedKit = (await call("/player-payments", { "x-role": "presidente" })).data;
      const linked = refreshedKit.find(row => row.id === legacyKit.id);
      assert.equal(linked.amount, 8);
      assert.equal(linked.status, "pending");
      assert.equal(linked.dueDate, "2098-02-01");
      assert.equal(linked.kitArticle.id, kit.kitArticle.id);
      assert.equal(linked.kitArticle.rowKey, `payment:${legacyKit.id}`);
      assert.equal(refreshedKit.find(row => row.id === kit.id).paymentMethod, "card");
      // Existing article-only records can be aligned without recording the receipt again.
      await pg.query("INSERT INTO player_payments(club_id,player_id,amount,status,payment_type,payment_date,payment_method,description) VALUES(1,101,10,'paid','kit_article','2026-11-16','card','Old Kway') RETURNING id").then(async result => {
        const oldId = result.rows[0].id;
        await pg.query("INSERT INTO player_payment_kit_items(payment_id,article) VALUES($1,$2)", [oldId, JSON.stringify({ id: 6101, name: "Maglia allenamento", code: "K-XS", size: "XS" })]);
        const path = `/player-payments/${oldId}/kit-order`;
        assert.equal((await call(path, { "x-role": "secretary" })).data.row, null);
        assert.equal((await send(path, "POST", { quantity: 1, slotKey: "training_shirt" })).status, 200);
        const read = (await call(path, { "x-role": "secretary" })).data;
        assert.equal(read.payment.amount, 10); assert.equal(read.payment.paymentDate, "2026-11-16"); assert.equal(read.payment.paymentMethod, "card");
        assert.equal((await send(`/player-payments/${oldId}`, "DELETE", undefined)).status, 204);
      });
      await pg.exec("UPDATE warehouse_items SET quantity_available=0, quantity_reserved=0 WHERE id=6101");
      const request = { playerId: 101, rowKey: `payment:${kit.id}`, itemIds: [6101], quantity: 1 };
      const requested = await Promise.all([send("/warehouse-kit-requests", "POST", request), send("/warehouse-kit-requests", "POST", request)]);
      assert.ok(requested.every(response => response.status === 204));
      kitOrder = await call(kitOrderPath, { "x-role": "secretary" });
      assert.equal(kitOrder.data.requests.length, 1, "repeated warehouse requests are idempotent");
      assert.equal(kitOrder.data.requests[0].status, "pending");
      const requestPath = `/warehouse-kit-requests/${kitOrder.data.requests[0].id}`;
      assert.equal((await send(kitOrderPath, "POST", { quantity: 2, slotKey: "training_shirt" })).status, 409);
      assert.equal((await send(`/player-payments/${kit.id}`, "DELETE", undefined)).status, 409);
      assert.equal((await send(requestPath, "PATCH", { status: "ordered" }, "coach")).status, 403);
      assert.equal((await send(requestPath, "PATCH", { status: "ordered" })).status, 204);
      assert.equal((await send(requestPath, "PATCH", { status: "arrived" })).status, 204);
      assert.equal((await send(requestPath, "PATCH", { status: "arrived" })).status, 204);
      const stock = async () => (await pg.query("SELECT quantity_available,quantity_reserved FROM warehouse_items WHERE id=6101")).rows[0];
      assert.deepEqual(await stock(), { quantity_available: 1, quantity_reserved: 1 });
      assert.equal((await send(requestPath, "PATCH", { status: "delivered" })).status, 204);
      assert.equal((await send(requestPath, "PATCH", { status: "delivered" })).status, 204);
      assert.deepEqual(await stock(), { quantity_available: 0, quantity_reserved: 0 });
      assert.equal((await call(kitOrderPath, { "x-role": "secretary" })).data.requests[0].status, "delivered");
      const familyKit = await call("/parent/kit", { "x-role": "parent" });
      assert.equal(familyKit.status, 200, JSON.stringify(familyKit.data));
      assert.ok(JSON.parse(familyKit.data[0].trainingKit).some(row => row.key === `payment:${kit.id}` && row.status === "delivered"));
      assert.equal((await send(`/player-payments/${kit.id}`, "DELETE", undefined)).status, 409, "delivered history cannot be erased with the receipt");
      await pg.exec("UPDATE warehouse_items SET quantity_available=1, quantity_reserved=0 WHERE id=6101");
      assert.equal((await send(`/player-payments/${legacyKit.id}/kit-order`, "POST", { quantity: 2, slotKey: "training_shirt" })).status, 200);
      assert.equal((await send(`/player-payments/${legacyKit.id}`, "PATCH", { amount: 12 })).status, 200);
      assert.equal((await call(`/player-payments/${legacyKit.id}/kit-order`, { "x-role": "secretary" })).data.row.price, "6");
      assert.equal((await send("/warehouse-kit-requests", "POST", { playerId: 101, rowKey: `payment:${legacyKit.id}`, itemIds: [6101], quantity: 2 })).status, 204);
      const split = (await call(`/player-payments/${legacyKit.id}/kit-order`, { "x-role": "secretary" })).data.requests;
      assert.equal(split.length, 2);
      assert.deepEqual(split.map(line => line.status).sort(), ["pending", "reserved"]);
      assert.deepEqual(await stock(), { quantity_available: 1, quantity_reserved: 1 });
      for (const line of split) assert.equal((await send(`/warehouse-kit-requests/${line.id}`, "PATCH", { status: "canceled" })).status, 204);
      assert.deepEqual(await stock(), { quantity_available: 1, quantity_reserved: 0 }, "canceling releases only the reserved pieces");
      assert.equal((await send(`/player-payments/${legacyKit.id}`, "DELETE", undefined)).status, 204);
      assert.equal((await pg.query("SELECT payment_id FROM player_payment_kit_items WHERE payment_id=$1", [legacyKit.id])).rows.length, 0);
      assert.ok(!JSON.parse((await assignment()).training_kit).kitRows.some(row => row.sourcePaymentId === legacyKit.id));
      assert.ok(JSON.parse((await assignment()).training_kit).kitRows.some(row => row.sourcePaymentId === kit.id));
      console.log("PASS payment desk: scope, receipt preservation, kit/equipment synchronization, stale forms, warehouse ordering/arrival/delivery, stock idempotency and history.");
      return;
    }
    if (process.argv.includes("--extra-time")) {
      await pg.exec("UPDATE players SET status='active', available=true, availability_override_active=false WHERE club_id=1; INSERT INTO players(id,club_id,team_id,first_name,last_name,status,available,availability_override_active) VALUES(103,1,11,'Third','Child','active',true,false)");
      const secretary = { "x-role": "secretary" };
      const send = (url, method, body, headers = secretary) => fetch(base + url, {
        method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
      });
      const body = { formula: "group-3-5", agreement: "Due rate", participants: [
        { playerId: 101, movements: [{ amount: 10, status: "paid", date: "2026-11-11", method: "cash" }, { amount: 13.34, status: "pending", date: "2026-12-01" }] },
        { playerId: 102, movements: [{ amount: 23.33, status: "paid", date: "2026-11-12", method: "card" }] },
        { playerId: 103, movements: [] },
      ] };
      assert.equal((await send("/extra-time", "POST", body, { "x-role": "coach" })).status, 403);
      assert.equal((await send("/extra-time", "POST", { ...body, participants: [...body.participants.slice(0, 2), { playerId: 201, movements: [] }] })).status, 404);
      const create = await send("/extra-time", "POST", body);
      const saved = await create.json();
      assert.equal(create.status, 201, JSON.stringify(saved));
      const group = await call("/extra-time", secretary);
      assert.equal(group.status, 200, JSON.stringify(group.data));
      assert.deepEqual(group.data.map(row => row.shareCents), [2334, 2333, 2333]);
      assert.ok(group.data.every(row => row.id === saved.id));
      const playerView = await call("/extra-time?playerId=101", secretary);
      assert.deepEqual(playerView.data, [group.data[0]]);
      assert.deepEqual((await call("/extra-time", { ...secretary, "x-club": "2" })).data, []);
      const [receipt, installment] = playerView.data[0].movements;
      assert.equal(receipt.paymentMethod, "cash");
      assert.equal(receipt.paymentDate, "2026-11-11");
      assert.equal((await send("/player-payments/" + installment.id, "PATCH", { status: "paid", paymentDate: "2026-11-12", paymentMethod: "bank_transfer" })).status, 200);
      const after = await call("/extra-time?playerId=101", secretary);
      assert.equal(after.data[0].movements.length, 2);
      assert.equal(after.data[0].movements.find(row => row.id === installment.id).paymentMethod, "bank_transfer");
      const extraMovement = "/extra-time/participants/" + group.data[2].participantId + "/movements";
      assert.equal((await send(extraMovement, "POST", { amount: 23.34, status: "paid", date: "2026-11-12", method: "cash" })).status, 409);
      assert.equal((await send(extraMovement, "POST", { amount: 10, status: "paid", date: "2026-11-12", method: "cash" })).status, 204);
      const legacy = await send("/player-payments", "POST", { playerId: 103, amount: 13.33, status: "paid", paymentType: "other", paymentDate: "2026-11-12", paymentMethod: "card" });
      assert.equal(legacy.status, 201);
      const legacyPayment = await legacy.json();
      assert.equal((await send(extraMovement, "POST", { paymentId: legacyPayment.id })).status, 204);
      assert.equal((await send(extraMovement, "POST", { paymentId: legacyPayment.id })).status, 409);
      const third = await call("/extra-time?playerId=103", secretary);
      assert.equal(third.data[0].movements.reduce((total, row) => total + Math.round(row.amount * 100), 0), 2333);
      const payments = await call("/player-payments", secretary);
      assert.equal(payments.data.length, 5);
      assert.equal(payments.data.reduce((total, row) => total + Math.round(row.amount * 100), 0), 7000);
      console.log("PASS Extra Time: scoped package, split to cents, both views, settlement and global payment totals.");
      return;
    }
    if (process.argv.includes("--secretary-guests")) {
      await pg.exec("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,notes,session_kind,created_by_user_id) VALUES (34001,1,11,'Guest trial','2026-10-12T15:30:00Z',90,'scheduled','','regular',1),(34002,1,12,'Other section','2026-10-12T15:30:00Z',90,'scheduled','','regular',1),(34003,2,22,'Other club','2026-10-12T15:30:00Z',90,'scheduled','','regular',1)");
      const secretary = { "x-role": "secretary" };
      const send = async (url, method, body) => fetch(base + url, {
        method, headers: { "Content-Type": "application/json", ...secretary }, body: JSON.stringify(body),
      });
      const sessionUrl = "/training-sessions/34001";
      const detail = await call(sessionUrl, secretary);
      assert.equal(detail.status, 200, JSON.stringify(detail.data));
      assert.equal(detail.data.canEdit, false);
      assert.equal((await send("/training-sessions", "POST", {})).status, 403);
      assert.equal((await send(sessionUrl, "PATCH", { title: "Modified" })).status, 403);
      assert.equal((await send(sessionUrl, "DELETE", {})).status, 403);
      assert.equal((await send(sessionUrl + "/planning", "PUT", { recoveries: [0, 0], recalculate: false })).status, 403);
      assert.equal((await send(sessionUrl + "/exercises", "POST", { exerciseId: 1 })).status, 403);
      const guest = { firstName: "Giocatore", lastName: "Ospite", startsOn: "2026-10-12", endsOn: "2026-10-14" };
      assert.equal((await call("/training-sessions/34002/trial-players", secretary)).status, 200);
      assert.equal((await send("/training-sessions/34003/trial-players", "POST", guest)).status, 403);
      const created = await send(sessionUrl + "/trial-players", "POST", guest);
      const result = await created.json();
      assert.equal(created.status, 201, JSON.stringify(result));
      assert.ok((await call(sessionUrl + "/trial-players", secretary)).data.some(trial => trial.playerId === result.playerId));
      assert.equal((await send(sessionUrl + "/trial-players/" + result.playerId, "PATCH", { score: 8, decision: "approved" })).status, 403);
      console.log("PASS secretary can add a guest in scope and cannot prepare, delete or evaluate a session.");
      return;
    }
    if (process.argv.includes("--parent-family")) {
      await pg.exec("ALTER TABLE players ALTER COLUMN created_at SET DEFAULT now()");
      await pg.exec("UPDATE clubs SET access_code='FAMILY-CLUB', parent_code='FAMILY1' WHERE id=1");
      await pg.exec("INSERT INTO player_parent_delegates(id,club_id,player_id,first_name,last_name,relation,email,access_code,is_active) VALUES (33001,1,101,'Test','Genitore','Madre','parent@example.org','DELEGATE1',true)");
      const send = async (url, method, body, headers = {}) => {
        const response = await fetch(base + url, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
        });
        return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text() };
      };
      const login = code => send("/auth/parent-login", "POST", { clubCode: "FAMILY-CLUB", parentCode: "FAMILY1", delegateCode: code });
      const bearer = result => ({ Authorization: "Bearer " + result.data.authToken });
      const first = await login("DELEGATE1");
      assert.equal(first.status, 200, JSON.stringify(first.data));
      const codeChange = await send("/parent/access-code", "POST", { currentCode: "DELEGATE1", newCode: "FAMILY1234" }, bearer(first));
      assert.equal(codeChange.status, 200, JSON.stringify(codeChange.data));
      const account = await login("FAMILY1234");
      assert.equal(account.status, 200, JSON.stringify(account.data));
      const parent = bearer(account);
      const secretary = { "x-role": "secretary" };
      const search = await send("/parent-family-accounts/search", "POST", { contact: "PARENT@example.org" }, secretary);
      assert.equal(search.status, 200, JSON.stringify(search.data));
      assert.deepEqual(search.data.map(row => row.id), [33001]);
      assert.equal(search.data[0].email, undefined);
      const linkPath = "/players/102/parent-family-links/33001";
      assert.equal((await send(linkPath, "PUT", undefined, { "x-role": "coach" })).status, 403);
      assert.equal((await send("/players/201/parent-family-links/33001", "PUT", undefined, secretary)).status, 404);
      assert.equal((await send("/auth/parent-children/select", "POST", { playerId: 102 }, parent)).status, 403);
      const link = await send(linkPath, "PUT", undefined, secretary);
      assert.equal(link.status, 204, JSON.stringify(link.data));
      assert.equal((await send(linkPath, "PUT", undefined, secretary)).status, 204);
      const children = await call("/auth/parent-children", parent);
      assert.equal(children.status, 200, JSON.stringify(children.data));
      assert.deepEqual(children.data.children.map(child => child.id), [101, 102]);
      assert.equal(children.data.selectedId, 101);
      const selected = await send("/auth/parent-children/select", "POST", { playerId: 102 }, parent);
      assert.equal(selected.status, 200, JSON.stringify(selected.data));
      const activity = await call("/parent/activity", bearer(selected));
      assert.equal(activity.status, 200, JSON.stringify(activity.data));
      assert.equal(activity.data.matches[0].rotation.rows[0].playerId, 102);
      assert.equal((await call("/parent/activity", { ...bearer(selected), "X-FTB-Parent-Child": "101" })).status, 409);
      assert.equal((await send(linkPath, "DELETE", undefined, secretary)).status, 204);
      assert.equal((await call("/parent/activity", bearer(selected))).status, 401);
      assert.equal((await call("/parent/activity", parent)).status, 200);
      const newPlayer = { firstName: "New", lastName: "Sibling", status: "active", teamId: 11 };
      assert.equal((await send("/players", "POST", { ...newPlayer, parentFamilyDelegateId: 99999 }, secretary)).status, 409);
      assert.equal((await send("/players", "POST", { ...newPlayer, teamId: 22, parentFamilyDelegateId: 33001 }, secretary)).status, 400);
      const created = await send("/players", "POST", {
        ...newPlayer,
        parentFamilyDelegateId: 33001,
        parentDelegates: [{ firstName: "Test", lastName: "Genitore", relation: "Madre", email: "PARENT@example.org" }],
      }, secretary);
      assert.equal(created.status, 201, JSON.stringify(created.data));
      const savedChildren = await call("/auth/parent-children", parent);
      assert.deepEqual(savedChildren.data.children.map(child => child.id), [101, created.data.id]);
      const duplicates = await pg.query("SELECT id FROM player_parent_delegates WHERE player_id = $1", [created.data.id]);
      assert.equal(duplicates.rows.length, 0);
      const siblings = await pg.query("SELECT id FROM players WHERE first_name = 'New' AND last_name = 'Sibling'");
      assert.equal(siblings.rows.length, 1);
      console.log("PASS parent family: verified account search, linking, club and role boundaries, child-scoped data, stale tab and revocation.");
      return;
    }
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
    assert.equal(manager.data.matches[0].rotation.units[0].formation.capacity, 5);
    assert.equal(manager.data.matches[0].rotation.rows[0].cells[0].lineupOrder, 0);
    const confirmationMatch = manager.data.matches[0];
    const confirmationRequest = async (url, method, body, headers) => {
      const response = await fetch(base + url, { method, body: JSON.stringify(body),
        headers: { "content-type": "application/json", ...headers } });
      return { status: response.status, data: await response.json() };
    };
    const submitConfirmation = (headers, report = confirmationMatch.report, review = {}) =>
      confirmationRequest(`/matches/${confirmationMatch.id}/report-confirmation`, "POST", { report, ...review }, headers);
    if (process.argv.includes("--match-meeting")) {
      const matchId = confirmationMatch.id;
      await pg.exec("INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Test'); INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,'coach');");
      const coachSession = { "x-role": "coach", "x-user": "3" };
      const meetingPath = `/matches/${matchId}/meeting`;
      const meeting = { convocationAt: "2026-10-10T12:00:00.000Z", convocationPlace: " Novoli " };
      const lineupSaved = await confirmationRequest(`/matches/${matchId}/plan`, "PUT", { playerIds: [101], matchPlan: plan }, coachSession);
      assert.equal(lineupSaved.status, 200, JSON.stringify(lineupSaved.data));
      assert.equal((await confirmationRequest(meetingPath, "PATCH", meeting, { "x-role": "secretary" })).status, 403);
      assert.equal((await confirmationRequest(meetingPath, "PATCH", meeting, { "x-role": "coach", "x-user": "2" })).status, 403);
      const invalidDate = await confirmationRequest(meetingPath, "PATCH", { ...meeting, convocationAt: "+020226-10-17T12:00:00.000Z" }, coachSession);
      assert.equal(invalidDate.status, 400);
      assert.match(invalidDate.data.error, /quattro cifre/);
      const saved = await fetch(base + meetingPath, { method: "PATCH",
        headers: { "content-type": "application/json", ...coachSession }, body: JSON.stringify(meeting) });
      assert.equal(saved.status, 204, await saved.text());
      const persisted = (await pg.query("SELECT match_plan FROM matches WHERE id=$1", [matchId])).rows[0].match_plan;
      assert.deepEqual(persisted, { ...plan, convocationAt: meeting.convocationAt, convocationPlace: "Novoli" });
      const called = await pg.query("SELECT DISTINCT player_id FROM call_ups WHERE match_id=$1 ORDER BY player_id", [matchId]);
      assert.deepEqual(called.rows.map(row => row.player_id), [101]);
      const managerSession = { "x-role": "team_manager" };
      const refreshed = (await call("/dirigenti/overview?teamId=11", managerSession)).data.matches[0];
      assert.deepEqual(refreshed.callups.map(row => row.id), [101]);
      assert.deepEqual(refreshed.reportPlayers.map(row => row.id), [101, 102]);
      assert.equal(refreshed.reportRotation.rows.find(row => row.playerId === 102).actualMinutes, 30);
      assert.equal((await submitConfirmation(managerSession)).status, 200);
      const invalid = { ...plan.postMatchReport, periods: plan.postMatchReport.periods.map((period, index) =>
        index === 0 ? { ...period, starters: [201] } : period) };
      assert.equal((await confirmationRequest(`/matches/${matchId}`, "PATCH", {
        matchPlan: { ...persisted, postMatchReport: invalid },
      }, coachSession)).status, 400);
      console.log("PASS match meeting and roster: removal, historical report and approval, no new outside player.");
      return;
    }
    const secretarySession = { "x-role": "secretary" };
    const matchPath = `/matches/${confirmationMatch.id}`;
    assert.equal((await confirmationRequest(matchPath, "PATCH", { postMatchNotes: "Nota post-partita" }, secretarySession)).status, 403);
    assert.equal((await confirmationRequest(matchPath, "PATCH", { result: "2-1" }, secretarySession)).status, 403);
    assert.equal((await confirmationRequest(matchPath, "PATCH", { matchPlan: plan }, secretarySession)).status, 403);
    assert.equal((await confirmationRequest(matchPath, "PATCH", { location: "Campo test" }, secretarySession)).status, 200);
    const managerSession = { "x-role": "team_manager" };
    assert.equal((await submitConfirmation({ ...managerSession, "x-user": "2" })).status, 403);
    assert.equal((await submitConfirmation(managerSession, { ...confirmationMatch.report, goals: [{ id: "stale", playerId: 101, period: 0, minute: 1 }] })).status, 409);
    assert.equal((await confirmationRequest(`/matches/${confirmationMatch.id}`, "PATCH", { result: "9-0" }, managerSession)).status, 403);
    if (process.argv.includes("--manager-confirmation")) {
      const coachReport = confirmationMatch.report;
      const correction = {
        ...coachReport,
        substitutions: coachReport.substitutions.map(change => ({ ...change, minute: 8 })),
      };
      const invalid = { ...correction, substitutions: [{ ...correction.substitutions[0], inPlayerId: 999 }] };
      assert.equal((await submitConfirmation(managerSession, coachReport, { managerReport: invalid })).status, 400);
      const review = { managerReport: correction, notes: "Cambio al minuto 8 del terzo tempo." };
      const reviewed = await submitConfirmation(managerSession, coachReport, review);
      assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
      assert.equal((await submitConfirmation(managerSession, coachReport, review)).status, 200);
      assert.equal((await submitConfirmation(managerSession, coachReport)).status, 409);
      const refreshed = await call("/dirigenti/overview?teamId=11", managerSession);
      const reviewedMatch = refreshed.data.matches[0];
      assert.deepEqual(reviewedMatch.report, coachReport);
      assert.deepEqual(reviewedMatch.review.report, correction);
      assert.equal(reviewedMatch.review.notes, review.notes);
      assert.equal(reviewedMatch.rotation.reportConfirmed, true);
      assert.equal(reviewedMatch.rotation.rows[0].actualMinutes, 20);
      assert.equal(reviewedMatch.rotation.rows[0].cells.find(cell => cell.key === "t3-second").actualMinutes, 2);
      const parentRefresh = await call("/parent/matches");
      assert.ok(!JSON.stringify(parentRefresh.data).includes(review.notes));
      console.log("PASS manager review: assigned team, stale reports, separate correction and notes, updated third fraction, parent privacy.");
      return;
    }
    const confirmed = await submitConfirmation(managerSession);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
    const approved = await call("/dirigenti/overview?teamId=11", managerSession);
    assert.equal(approved.data.matches[0].rotation.reportConfirmed, true);
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
    const reportDay = new Date().toLocaleDateString("sv-SE", {timeZone:"Europe/Rome"});
    const joinedSlot = {day:"martedi",startTime:"17:30",endTime:"19:00",jointTeamId:911,validFrom:"2025-01-01"};
    await pg.exec("INSERT INTO clubs(id,name) VALUES(91,'Attendance fixture');");
    await pg.query("INSERT INTO seasons(id,club_id,name,start_date,end_date,is_active) VALUES(91,91,'Current','2025-01-01','2098-12-31',true),(92,91,'Other','2024-01-01','2024-12-31',false);");
    await pg.query("INSERT INTO teams(id,club_id,name,club_section,season_id,training_schedule,coach_id) VALUES(911,91,'Primi Calci','scuola_calcio',91,NULL,91),(912,91,'Piccoli Amici','scuola_calcio',91,$1::jsonb,91),(913,91,'Different season','scuola_calcio',92,$1::jsonb,91),(914,91,'Different section','settore_giovanile',91,$1::jsonb,91),(915,91,'Future group','scuola_calcio',91,$2::jsonb,91);", [JSON.stringify([joinedSlot]),JSON.stringify([{...joinedSlot,validFrom:"2099-01-01"}])]);
    await pg.exec("INSERT INTO club_memberships(id,club_id,user_id,role,club_section) VALUES(91,91,91,'team_manager','{scuola_calcio}'); INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(91,91,91,911,'team_manager'); INSERT INTO players(id,club_id,team_id,first_name,last_name) VALUES(911,91,911,'Main','Player'),(912,91,912,'Joined','Player'),(913,91,913,'Other season','Player'),(914,91,914,'Other sector','Player'),(915,91,915,'Future','Player');");
    await pg.query("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,notes) VALUES(911,91,911,'Joint training',$1,'scheduled','[FTB_SESSION_TEAMS]911,912'),(914,91,914,'Foreign sector training',$1,'scheduled','[FTB_SESSION_TEAMS]911,914');", [reportDay]);
    await pg.exec("INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(911,91,911,912,'present');");
    const registerPlan = {periods:[{key:"t1",minutes:"12",lineupPlayerIds:[912],lineupStarterCount:1}], postMatchReport:{version:1,goals:[],substitutions:[],periods:[{minutes:12,starters:[912]}]}};
    await pg.query("INSERT INTO matches(id,club_id,team_id,season_id,opponent,date,home_away,match_plan,notes,is_postponed,reschedule_tbd) VALUES(911,91,911,91,'Legacy report',$1,'home',NULL,$2,false,false),(912,91,912,91,'Joined team match',$1,'home',$3::jsonb,NULL,false,false),(913,91,911,92,'Wrong season',$1,'home',NULL,NULL,false,false),(914,91,914,91,'Wrong sector',$1,'home',NULL,NULL,false,false),(915,91,911,91,'Availability only',$1,'home',NULL,NULL,false,false),(916,91,911,91,'Postponed',$1,'home',NULL,NULL,true,true),(917,91,911,91,'Planned only',$1,'home',$4::jsonb,NULL,false,false),(918,91,912,91,'Unrelated match',$1,'home',NULL,NULL,false,false);", [reportDay,"Public [FTB_MATCH_PLAN]"+JSON.stringify(registerPlan),JSON.stringify(registerPlan),JSON.stringify({periods:registerPlan.periods})]);
    await pg.exec("INSERT INTO call_ups(id,match_id,player_id,status,created_at) VALUES(911,911,912,'called',now()),(912,911,912,'called',now()),(913,912,912,'called',now()),(914,913,912,'called',now()),(915,914,912,'called',now()),(916,915,912,'available',now()),(917,916,912,'called',now()),(918,917,912,'called',now()),(919,918,201,'called',now());");
    const registerUrl = "/attendance-register?teamId=911";
    const managerHeaders = {"x-role":"team_manager","x-club":"91","x-user":"91"};
    const jointOverview = await call("/dirigenti/overview?teamId=911", managerHeaders);
    assert.deepEqual(jointOverview.data.players.map(player=>player.id).sort(),[911,912]);
    assert.equal(jointOverview.data.players.find(player=>player.id===912).teamName,"Piccoli Amici");
    assert.ok(!jointOverview.data.matches.some(match=>match.id===912));
    for (const childId of [911, 912]) {
      const parentRoster = await call("/parent/children", {...managerHeaders, "x-role":"parent", "x-child":String(childId)});
      assert.equal(parentRoster.status, 200);
      const [ownTeam] = parentRoster.data;
      assert.equal(parentRoster.data.length, 1);
      assert.equal(ownTeam.id, childId);
      assert.deepEqual(ownTeam.rosterTeams.map(team=>team.id).sort(), [911, 912]);
      assert.deepEqual(ownTeam.players.map(player=>player.id).sort(), [911, 912]);
      assert.deepEqual(ownTeam.players.filter(player=>player.isOwnChild).map(player=>player.id), [childId]);
      assert.ok(!("dateOfBirth" in ownTeam.players.find(player=>player.id!==childId)));
    }
    await pg.query("UPDATE teams SET training_schedule=$1::jsonb WHERE id=912", [JSON.stringify([{...joinedSlot,validUntil:"2025-01-02"}])]);
    const separatedParent = await call("/parent/children", {...managerHeaders, "x-role":"parent", "x-child":"911"});
    assert.deepEqual(separatedParent.data[0].players.map(player=>player.id), [911]);
    await pg.query("UPDATE teams SET training_schedule=$1::jsonb WHERE id=912", [JSON.stringify([joinedSlot])]);
    console.log("PASS parent roster: both joint teams, expired joint schedule, and own-child privacy.");
    const managerRegister = await call(registerUrl, managerHeaders);
    assert.equal(managerRegister.status,200,JSON.stringify(managerRegister.data));
    assert.equal(managerRegister.data.canEdit,false);
    assert.deepEqual(managerRegister.data.sessions.map(session=>session.id),[911]);
    assert.deepEqual(managerRegister.data.matches.map(match=>match.id).sort(),[911,915,917]);
    const joinedPlayer = managerRegister.data.players.find(player=>player.id===912);
    assert.equal(joinedPlayer.attendance[911],"present");
    assert.deepEqual(joinedPlayer.games[911],{called:true,plannedMinutes:12,minutes:12});
    assert.deepEqual(joinedPlayer.games[917],{called:true,plannedMinutes:12,minutes:null});
    assert.equal(joinedPlayer.games[915],undefined);
    assert.equal((await call("/attendance-register?teamId=912",managerHeaders)).status,403);
    assert.equal((await call(registerUrl,{...managerHeaders,"x-club":"1"})).status,403);
    assert.equal((await call(registerUrl,{...managerHeaders,"x-user":"92"})).status,403);
    assert.equal((await fetch(base+"/attendance",{method:"POST",headers:managerHeaders})).status,403);
    const coachRegister = await call(registerUrl,{...managerHeaders,"x-role":"coach"});
    assert.ok(coachRegister.data.matches.some(match=>match.id===912));
    assert.ok(!coachRegister.data.matches.some(match=>match.id===918));
    const parentRegister = await call("/attendance-register?teamId=912",{...managerHeaders,"x-role":"parent","x-child":"912"});
    assert.deepEqual(parentRegister.data.players.map(player=>player.id),[912]);
    assert.equal(parentRegister.data.players[0].games[911].minutes,12);
    await pg.query("UPDATE teams SET training_schedule=$1::jsonb WHERE id=912", [JSON.stringify([{...joinedSlot,validUntil:"2025-01-02"}])]);
    const separated = await call("/dirigenti/overview?teamId=911",managerHeaders);
    assert.deepEqual(separated.data.players.map(player=>player.id),[911]);
    const history = await call(registerUrl,managerHeaders);
    assert.equal(history.data.players.find(player=>player.id===912).attendance[911],"present");
    console.log("PASS attendance register: joined current and historical roster, manager read only, protected away fixtures, saved callups, legacy report, and planned versus actual.");
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
    const beforeAppello = { available: 0, secretaryUnavailable: 3, parentUnavailable: 1, pending: 4, total: 8 };
    assert.deepEqual(eligibility.beforeAppello, beforeAppello, "A player marked unavailable by both sources is counted once");
    const participants = await call("/training-sessions/601/participants", { "x-role": "admin" });
    assert.equal(participants.status, 200, JSON.stringify(participants.data));
    assert.deepEqual(participants.data.beforeAppello, beforeAppello);
    const preview = await call("/training-availability?teamId=11&date=2026-10-12&start=17:30&duration=90", { "x-role": "admin" });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.deepEqual(preview.data.beforeAppello, beforeAppello);
    assert.equal(preview.data.secretaryUnavailablePlayerIds, undefined);
    assert.equal(preview.data.unavailable, 2, "Raw parent replies stay available to the attendance register");
    assert.deepEqual(participants.data.afterAppello, { present: 1, absent: 1, injured: 0, pending: 6 });
    assert.deepEqual(participants.data.blockedPlayerIds, [102, 104, 107, 108]);
    assert.equal((await call("/training-sessions/601/participants", { "x-role": "admin", "x-club": "2" })).status, 403);
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
    assert.deepEqual(shared.beforeAppello, { ...beforeAppello, secretaryUnavailable: 4, total: 9 });
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
    // Station organization uses real planning handlers and optimistic source versions.
    await pg.exec(`INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,session_kind,created_by_user_id) VALUES(1950,1,11,'Station fixture','2026-10-12T15:30:00Z',90,'scheduled','regular',3); INSERT INTO exercises(id,club_id,title,team_id,created_by_user_id,duration_minutes,training_phase,selected_player_ids_json) VALUES(1951,1,'First',11,3,15,'iniziale','[101,109]'),(1952,1,'Second',11,3,15,'iniziale','[101,109]'),(1953,1,'Independent',11,3,20,'iniziale','[101,109]'); INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES(1951,1950,1951,0),(1952,1950,1952,1),(1953,1950,1953,2);`);
    const stationHeaders={'x-user':'3','x-role':'coach'};
    let initialStations=await call('/training-sessions/1950/planning',stationHeaders);
    assert.equal(initialStations.status,200,JSON.stringify(initialStations.data));assert.equal(initialStations.data.rotations.iniziale.length,3);assert.equal(initialStations.data.timings['1953'].seconds,1200);
    const initialVersion=initialStations.data.version;
    const joined={iniziale:[{id:'joined',stations:[{linkId:1951,playerIds:[101],seconds:900},{linkId:1952,playerIds:[109],seconds:900}],recoverySeconds:60},{id:'joined-second',stations:[{linkId:1951,playerIds:[109],seconds:900},{linkId:1952,playerIds:[101],seconds:900}],recoverySeconds:0},{id:'independent',stations:[{linkId:1953,playerIds:[101,109],seconds:1200}],recoverySeconds:0}],centrale:[],finale:[]};
    const savedStations=await write('/training-sessions/1950/planning',{recoveries:[5,0],recalculate:false,rotations:joined,version:initialVersion},3,'coach','PUT');assert.equal(savedStations.status,200,JSON.stringify(savedStations.data));
    const stationReload=await call('/training-sessions/1950/planning',stationHeaders);assert.deepEqual(stationReload.data.rotations,joined);assert.equal(stationReload.data.version,savedStations.data.version);
    assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false,version:initialVersion},3,'coach','PUT')).status,409);
    assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false},1,'parent','PUT')).status,403);
    const invalid=JSON.parse(JSON.stringify(joined));invalid.iniziale[0].stations[1].playerIds=[101];assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false,rotations:invalid},3,'coach','PUT')).status,400);
    await pg.query('UPDATE exercises SET duration_minutes=10,selected_player_ids_json=$1 WHERE id=1951',['[109]']);
    const sourceChanged=await call('/training-sessions/1950/planning',stationHeaders);assert.equal(sourceChanged.data.timings['1951'].seconds,600);assert.equal(sourceChanged.data.timings['1952'].seconds,600);assert.deepEqual(sourceChanged.data.rotations.iniziale[0].stations[0].playerIds,[109]);assert.deepEqual(sourceChanged.data.rotations.iniziale[0].stations[1].playerIds,[]);
    assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false,version:stationReload.data.version},3,'coach','PUT')).status,409);
    await pg.exec(`INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,session_kind,created_by_user_id) VALUES(1954,1,11,'Legacy timed session','2026-10-12T15:30:00Z',90,'scheduled','regular',3); INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES(1954,1954,1953,0);`);
    const legacySignature=require('crypto').createHash('sha256').update(JSON.stringify([20,null])).digest('hex');await pg.query('INSERT INTO training_session_plans(session_id,club_id,plan) VALUES(1954,1,$1::jsonb)',[JSON.stringify({recoveries:[0,0],timings:{1954:{seconds:300,stations:[],signature:legacySignature}}})]);
    assert.equal((await call('/training-sessions/1954/planning',stationHeaders)).data.timings['1954'].seconds,300,'Legacy timing allocation preserved');
    const savedPassBoard=JSON.stringify({data:{elements:[{type:'player',playerId:101,x:25,y:40},{type:'cone'}],animation:{frames:[{elements:[{type:'player',playerId:101,x:40,y:50}]}]}}});
    const customPasses={iniziale:[{id:'pass-one',stations:[{linkId:1951,playerIds:[101],seconds:900,boardJson:savedPassBoard,boardPreview:'data:image/png;base64,AA=='},{linkId:1952,playerIds:[109],seconds:900}],recoverySeconds:60},{id:'pass-two',stations:[{linkId:1951,playerIds:[101,109],seconds:900,manualPlayers:true},{linkId:1952,playerIds:[],seconds:900,manualPlayers:true}],recoverySeconds:0},{id:'independent',stations:[{linkId:1953,playerIds:[101,109],seconds:1200}],recoverySeconds:0}],centrale:[],finale:[]};
    assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false,rotations:customPasses,version:sourceChanged.data.version},3,'coach','PUT')).status,200);
    const passReload=await call('/training-sessions/1950/planning',stationHeaders);assert.equal(passReload.data.rotations.iniziale[0].stations[0].boardJson,savedPassBoard);assert.equal(passReload.data.rotations.iniziale[1].stations[0].manualPlayers,true);assert.deepEqual(passReload.data.rotations.iniziale[1].stations[0].playerIds,[101,109]);
    const invalidPass=JSON.parse(JSON.stringify(customPasses));invalidPass.iniziale[0].stations[0].boardJson=JSON.stringify({data:{elements:[{type:'player',playerId:201}]}});assert.equal((await write('/training-sessions/1950/planning',{recoveries:[0,0],recalculate:false,rotations:invalidPass},3,'coach','PUT')).status,400);
    await pg.exec(`INSERT INTO training_attendances(id,club_id,training_session_id,player_id,status) VALUES(19999,1,1950,101,'absent')`);
    const withoutAbsent=(await call('/training-sessions/1950/planning',stationHeaders)).data.rotations.iniziale;assert.ok(!withoutAbsent.some(t=>t.stations.some(s=>s.playerIds.includes(101))));assert.ok(!withoutAbsent[0].stations[0].boardJson.includes('"playerId":101'));assert.equal(withoutAbsent[0].stations[0].boardPreview,undefined);
    await pg.exec('DELETE FROM training_attendances WHERE id=19999');assert.equal((await pg.query('SELECT selected_player_ids_json FROM exercises WHERE id=1951')).rows[0].selected_player_ids_json,'[109]');
    console.log('PASS rotation-board HTTP: per-pass roster, manual repetitions and board positions/frames survive reload; attendance removes absent actors/previews; foreign actors rejected; shared exercise unchanged.');
    const boardWrite=await write('/exercises/1953',{statoLavagnaJson:JSON.stringify({data:{elements:[{type:'player',playerId:101},{type:'cone'},{type:'cone'}]}})},3,'coach','PATCH');
    assert.equal(boardWrite.status,200,JSON.stringify(boardWrite.data));const boardStored=(await pg.query('SELECT selected_player_ids_json,players_required,equipment FROM exercises WHERE id=1953')).rows[0];assert.deepEqual(JSON.parse(boardStored.selected_player_ids_json),[101]);assert.equal(boardStored.players_required,1);assert.equal(JSON.parse(boardStored.equipment).items.coni,2);
    console.log('PASS board station synchronization: direct board PATCH updates selected players, count and automatic materials under existing author permissions.');
    console.log('PASS station HTTP planning: sequential defaults, association saved/reloaded, duplicate concurrent players rejected, independent reuse, parent write denied, stale source/version conflict and source duration/roster changes reconciled.');
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
    const loginPassword='isolated-login-test';
    const loginHash=await req('bcryptjs').hash(loginPassword,4);
    await pg.query(`INSERT INTO users(id,email,password_hash,first_name,last_name,created_at) VALUES(1900,'SPORT.TEST@example.test',$1,'Sport','Test',now())`,[loginHash]);
    await pg.exec(`UPDATE clubs SET created_at=now() WHERE id=1; INSERT INTO club_memberships(id,user_id,club_id,role,club_section) VALUES(1900,1900,1,'sporting_director','{scuola_calcio,settore_giovanile,prima_squadra}')`);
    const login=async(body,area='sporting')=>write('/auth/login?area='+area,body,1,'parent');
    for(const section of ['scuola-calcio','settore-giovanile','prima-squadra']){
      const result=await login({email:'sport.test@example.test',password:loginPassword,section,clubId:1});
      assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.user.id,1900);assert.equal(result.data.role,'sporting_director');
    }
    assert.equal((await login({email:'Sport.Test@Example.Test',password:loginPassword,clubId:1})).status,200);
    assert.equal((await login({email:'sport.test@example.test',password:'wrong-test-only'})).status,401);
    assert.equal((await login({email:'sport.test@example.test',password:loginPassword},'coach')).status,403);
    assert.equal((await login({email:'sport.test@example.test',password:loginPassword,clubId:2})).status,401);
    assert.equal((await pg.query('SELECT password_hash FROM users WHERE id=1900')).rows[0].password_hash,loginHash);


    await pg.exec(`INSERT INTO teams(id,club_id,name,club_section) VALUES(1911,1,'Unassigned School','scuola_calcio'),(1912,1,'Prima Squadra','prima_squadra');INSERT INTO club_memberships(id,club_id,user_id,role,club_section) VALUES(1910,1,1910,'secretary','{scuola_calcio}');`);
    const navigation=async(user,role,club=1)=>call('/teams/navigation-scope',{'x-user':String(user),'x-role':role,'x-club':String(club)});
    for(const role of ['secretary','sporting_director','presidente','director','technical_director','admin']){
      const view=await navigation(1910,role);assert.equal(view.status,200,JSON.stringify(view.data));assert.deepEqual(view.data.sections,['scuola_calcio']);assert.ok(view.data.teams.every(t=>t.clubSection==='scuola_calcio'));assert.ok(view.data.teams.some(t=>t.id===1911));assert.ok(!view.data.teams.some(t=>[12,22,1912].includes(t.id)));
    }
    const tamperedScope=await call('/teams/navigation-scope?section=prima_squadra&teamId=22',{'x-user':'1910','x-role':'secretary'});assert.deepEqual(tamperedScope.data.sections,['scuola_calcio']);assert.ok(!tamperedScope.data.teams.some(t=>t.id===22||t.id===1912));
    await pg.exec(`INSERT INTO club_memberships(id,club_id,user_id,role,club_section) VALUES(1913,1,1913,'secretary','{unknown_section}'),(1914,1,1914,'coach','{scuola_calcio}')`);
    assert.deepEqual((await navigation(1913,'secretary')).data,{sections:[],teams:[]});assert.deepEqual((await navigation(1914,'coach')).data,{sections:[],teams:[]});
    const coachNavigation=await navigation(3,'coach');assert.equal(coachNavigation.status,200);assert.deepEqual(coachNavigation.data.teams.map(t=>t.id),[11]);
    await pg.exec(`UPDATE teams SET coach_id=3 WHERE id=1911`);assert.deepEqual((await navigation(3,'coach')).data.teams.map(t=>t.id).sort((a,b)=>a-b),[11,1911]);
    await pg.exec(`UPDATE teams SET coach_id=null WHERE id=1911`);
    const dtNavigation=await navigation(4,'technical_director');assert.deepEqual(dtNavigation.data.sections,['scuola_calcio','settore_giovanile']);assert.ok(!dtNavigation.data.teams.some(t=>t.id===1912||t.id===22));
    const dsNavigation=await navigation(1900,'sporting_director');assert.ok(dsNavigation.data.teams.some(t=>t.id===1912));
    assert.equal((await navigation(1,'parent')).status,403);assert.equal((await navigation(1,'team_manager')).status,403);
    assert.equal((await call('/teams/navigation-scope',{'x-anonymous':'1'})).status,401);
    assert.ok((await navigation(4,'technical_director',2)).data.teams.every(t=>t.id===22));
    console.log('PASS unified navigation scope: management roles honor explicit sections, DT/DS cross-sector assignments, coach direct/staff assignments, club boundary, parent/manager/anonymous denied. Read-only.');
    const zeroStandings=['Club test','Other team'].map(team=>({team,pg:0,v:0,n:0,p:0,gf:0,gs:0,dr:0,pts:0}));
    await pg.exec(`INSERT INTO championships(id,club_id,section,team_id,title,category,source_provider) VALUES(2101,1,'settore_giovanile',12,'Campionato test','Allievi','lnd');INSERT INTO championship_groups(id,club_id,championship_id,name) VALUES(2201,1,2101,'B');INSERT INTO championship_fixtures(id,club_id,championship_id,group_id,round,leg,home_team,away_team,date) VALUES(2301,1,2101,2201,1,'andata','Club test','Other team','2026-10-20T15:00:00Z');INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,result,competition) VALUES(2401,1,12,'Other team','2026-10-20T15:00:00Z','home','2-1','Campionato'),(2403,1,12,'Other team','2025-10-20T15:00:00Z','home','9-0','Campionato');`);
    await pg.query('UPDATE championship_groups SET standings=$1::jsonb WHERE id=2201',[JSON.stringify(zeroStandings)]);
    const readGroup=async()=>{const response=await call('/championships?section=settore_giovanile',{'x-role':'technical_director'});assert.equal(response.status,200,JSON.stringify(response.data));return response.data.find(c=>c.id===2101).groups[0];};
    let group=await readGroup();assert.equal(group.ftbStandings.status,'provisional');assert.equal(group.ftbStandings.resultMatches,1);assert.equal(group.ftbStandings.internalResultMatches,1);assert.equal(group.ftbStandings.rows.find(row=>row.team==='Club test').pts,3);assert.equal(group.fixtures[0].homeScore,null);assert.equal(group.fixtures[0].matchId,null);assert.equal(group.standings[0].pg,0);
    assert.deepEqual((await pg.query('SELECT match_id,home_score,away_score FROM championship_fixtures WHERE id=2301')).rows[0],{match_id:null,home_score:null,away_score:null});
    await pg.exec(`INSERT INTO matches(id,club_id,team_id,opponent,date,home_away,result,competition) VALUES(2402,1,12,'Other team','2026-10-20T15:00:00Z','home','4-0','Campionato')`);
    group=await readGroup();assert.equal(group.fixtures[0].linkedResult,null);assert.equal(group.ftbStandings.resultMatches,0);await pg.exec('DELETE FROM matches WHERE id=2402');
    await pg.exec('UPDATE championship_fixtures SET home_score=3,away_score=0 WHERE id=2301');
    group=await readGroup();assert.equal(group.ftbStandings.status,'review');assert.equal(group.ftbStandings.conflictingResults,1);assert.equal(group.ftbStandings.rows.find(row=>row.team==='Club test').gf,3);
    await pg.exec('UPDATE championship_fixtures SET home_score=null,away_score=null,match_id=503 WHERE id=2301');
    group=await readGroup();assert.equal(group.fixtures[0].linkedResult,null);assert.equal(group.ftbStandings.resultMatches,0);
    await pg.exec(`UPDATE championship_fixtures SET match_id=2401,date='2099-10-20' WHERE id=2301`);
    group=await readGroup();assert.equal(group.ftbStandings.resultMatches,0);
    await pg.exec(`UPDATE championship_fixtures SET match_id=null,date='2026-10-20T15:00:00Z' WHERE id=2301`);
    const adjusted=[{team:'Club test',pg:1,v:1,n:0,p:0,gf:2,gs:1,dr:1,pts:1},{team:'Other team',pg:1,v:0,n:0,p:1,gf:1,gs:2,dr:-1,pts:0}];
    await pg.query('UPDATE championship_groups SET standings=$1::jsonb WHERE id=2201',[JSON.stringify(adjusted)]);
    group=await readGroup();assert.equal(group.ftbStandings.status,'aligned');assert.equal(group.ftbStandings.rows.find(row=>row.team==='Club test').pts,1);
    assert.deepEqual((await pg.query('SELECT standings FROM championship_groups WHERE id=2201')).rows[0].standings,adjusted);
    console.log('PASS FTB standings: same read-only match identity as UI, linked result fills missing fixture, provisional vs official, historical season excluded, ambiguous and foreign links ignored, future excluded, conflicts flagged with original score retained, official adjusted points preserved when aligned; no links/scores/official table written.');
    console.log('PASS login email case: historical uppercase record accepts lowercase/mixed-case login; SC/SG/PS access retained, wrong password/area/club still rejected, password hash unchanged.');
    console.log(
      "PASS training eligibility: parent refusal, global unavailability, dated overrides, staff present/absent, correction and templates.",
    );
    await pg.exec("UPDATE clubs SET access_code='RESET-CLUB', parent_code='PARENTS1' WHERE id=1");
    await pg.exec("INSERT INTO player_parent_delegates(id,club_id,player_id,first_name,last_name,relation,access_code,is_active) VALUES (33001,1,101,'Test','Genitore','Madre','DELEGATE1',true), (33002,1,101,'Altro','Genitore','Padre','DELEGATE2',true)");
    async function parentRequest(url, method, body, headers = {}) {
      const response = await fetch(base + url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    }
    const parentLogin = delegateCode => parentRequest("/auth/parent-login", "POST", { clubCode: "RESET-CLUB", parentCode: "PARENTS1", delegateCode });
    const bearer = login => ({ Authorization: "Bearer " + login.data.authToken });
    const changeCode = (login, currentCode, newCode) => parentRequest("/parent/access-code", "POST", { currentCode, newCode }, bearer(login));
    const initial = await parentLogin("DELEGATE1");
    assert.equal(initial.status, 200, JSON.stringify(initial.data));
    assert.equal(initial.data.parentDelegate.requiresPersonalAccessCode, true);
    assert.equal((await changeCode(initial, "", "PERSONALE1234567")).status, 401);
    assert.equal((await changeCode(initial, "DELEGATE1", "PERSONALE12345678")).status, 400);
    assert.equal((await changeCode(initial, "DELEGATE1", "PERSONALE1234567")).status, 200);
    const personal = await parentLogin("personale1234567");
    assert.equal(personal.status, 200, JSON.stringify(personal.data));
    assert.equal(personal.data.parentDelegate.requiresPersonalAccessCode, false);
    const otherDelegate = await parentLogin("DELEGATE2");
    assert.equal(otherDelegate.status, 200);
    const resetPath = "/players/101/parent-delegates/33001/reset-access";
    assert.equal((await parentRequest(resetPath, "POST", undefined, { "x-role": "coach" })).status, 403);
    assert.equal((await parentRequest(resetPath, "POST", undefined, { "x-role": "secretary", "x-club": "2" })).status, 404);
    const reset = await parentRequest(resetPath, "POST", undefined, { "x-role": "secretary" });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(reset.data.id, 33001);
    assert.equal(reset.data.personalAccessCodeHash, undefined);
    assert.match(reset.data.accessCode, /^[A-Z0-9]{12}$/);
    assert.equal((await parentLogin("DELEGATE1")).status, 401);
    assert.equal((await parentLogin("PERSONALE1234567")).status, 401);
    assert.equal((await call("/auth/me", bearer(personal))).status, 401);
    assert.equal((await call("/auth/me", bearer(otherDelegate))).status, 200);
    const metadataSave = await parentRequest("/players/101/parent-delegates", "PUT", {
      delegates: [
        { id: 33001, firstName: "Test", lastName: "Genitore", phone: "012345" },
        { id: 33002, firstName: "Altro", lastName: "Genitore" },
      ],
    }, { "x-role": "secretary" });
    assert.equal(metadataSave.status, 200, JSON.stringify(metadataSave.data));
    assert.equal(metadataSave.data[0].id, 33001);
    assert.equal(metadataSave.data[0].accessCode, reset.data.accessCode);
    const recovered = await parentLogin(reset.data.accessCode);
    assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
    assert.equal(recovered.data.parentDelegate.requiresPersonalAccessCode, true);
    assert.equal((await changeCode(recovered, reset.data.accessCode, "NUOVACHIAVE2026")).status, 200);
    assert.equal((await parentLogin(reset.data.accessCode)).status, 401);
    assert.equal((await parentLogin("NUOVACHIAVE2026")).status, 200);
    console.log("PASS parent access recovery: 16-character sign-in, per-delegate reset, permissions, previous sessions revoked and new key survives metadata edits.");

    await pg.exec("UPDATE teams SET coach_id=3 WHERE id=11");
    await pg.exec("INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,duration_minutes,status,notes,session_kind,created_by_user_id) VALUES (34001,1,11,'Trial first','2026-10-12T15:30:00Z',90,'scheduled','','regular',3), (34002,1,11,'Trial last','2026-10-14T15:30:00Z',90,'scheduled','','regular',3), (34003,1,11,'After trial','2026-10-15T15:30:00Z',90,'scheduled','','regular',3), (34004,1,12,'Other team','2026-10-14T15:30:00Z',90,'scheduled','','regular',3)");
    const trialPath = "/training-sessions/34001/trial-players";
    const trialBody = { firstName: "Giocatore", lastName: "Ospite", startsOn: "2026-10-12", endsOn: "2026-10-14" };
    const secretary = { "x-role": "secretary" };
    const coach = { "x-role": "coach", "x-user": "3" };
    assert.equal((await parentRequest(trialPath, "POST", trialBody)).status, 403);
    assert.equal((await parentRequest(trialPath, "POST", { ...trialBody, startsOn: "2026-10-13" }, secretary)).status, 400);
    const guest = await parentRequest(trialPath, "POST", trialBody, secretary);
    assert.equal(guest.status, 201, JSON.stringify(guest.data));
    const guestId = guest.data.playerId;
    const coachGuest = await parentRequest(trialPath, "POST", { ...trialBody, firstName: "Secondo" }, coach);
    assert.equal(coachGuest.status, 201, JSON.stringify(coachGuest.data));
    const roster = async (sessionId) => {
      const result = await call("/training-sessions/" + sessionId + "/roster", secretary);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return result.data;
    };
    assert.equal((await roster(34001)).find(player => player.id === guestId)?.teamName, "Ospite in prova");
    assert.ok((await roster(34002)).some(player => player.id === guestId));
    assert.ok(!(await roster(34003)).some(player => player.id === guestId));
    assert.ok(!(await roster(34004)).some(player => player.id === guestId));
    const trialAppello = await call("/attendance-roster/34002/guests", coach);
    assert.equal(trialAppello.status, 200, JSON.stringify(trialAppello.data));
    assert.ok(trialAppello.data.some(player => player.id === guestId));
    const guestPresent = await parentRequest("/attendance", "POST", { trainingSessionId: 34002, playerId: guestId, status: "present" }, coach);
    assert.ok([200, 201].includes(guestPresent.status), JSON.stringify(guestPresent.data));
    assert.equal((await parentRequest("/attendance", "POST", { trainingSessionId: 34003, playerId: guestId, status: "present" }, coach)).status, 400);
    const trialParticipants = await call("/training-sessions/34002/participants", coach);
    assert.equal(trialParticipants.status, 200, JSON.stringify(trialParticipants.data));
    assert.equal(trialParticipants.data.beforeAppello.guests, 2);
    assert.ok(trialParticipants.data.presentPlayerIds.includes(guestId));
    await pg.exec(`INSERT INTO exercises(id,club_id,title,team_id,created_by_user_id,duration_minutes,training_phase) VALUES (34011,1,'Trial station',11,3,15,'iniziale');
      INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES(34011,34002,34011,0);`);
    const trialRotations = {
      iniziale: [{ id: "trial", stations: [{ linkId: 34011, playerIds: [guestId], seconds: 900 }], recoverySeconds: 0 }],
      centrale: [],
      finale: [],
    };
    const trialPlanning = await write("/training-sessions/34002/planning", { recoveries: [0, 0], recalculate: false, rotations: trialRotations }, 3, "coach", "PUT");
    assert.equal(trialPlanning.status, 200, JSON.stringify(trialPlanning.data));
    assert.deepEqual(trialPlanning.data.rotations.iniziale[0].stations[0].playerIds, [guestId]);
    const trialBoard = await write("/exercises/34011", {
      programSessionId: 34002,
      statoLavagnaJson: JSON.stringify({ boardId: null, data: { teamId: 11, elements: [{ type: "player", playerId: guestId }] } }),
    }, 3, "coach", "PATCH");
    assert.equal(trialBoard.status, 200, JSON.stringify(trialBoard.data));
    assert.deepEqual(JSON.parse(trialBoard.data.selectedPlayerIdsJson), [guestId]);

    await pg.query("INSERT INTO exercises(id,club_id,title,team_id,created_by_user_id,duration_minutes,training_phase,selected_player_ids_json) VALUES (34012,1,'Trial group two',11,3,15,'iniziale',$1)", [JSON.stringify([coachGuest.data.playerId])]);
    await pg.exec('INSERT INTO training_session_exercises(id,training_session_id,exercise_id,"order") VALUES(34012,34002,34012,1)');
    const setupVersion = (await call("/training-sessions/34002/planning", coach)).data.version;
    const eligible = (await roster(34002)).map(player => player.id).filter(id => !trialParticipants.data.blockedPlayerIds.includes(id));
    const otherIds = eligible.filter(id => id !== guestId && id !== coachGuest.data.playerId).sort((a, b) => a - b);
    const firstIds = [guestId, coachGuest.data.playerId, ...otherIds];
    const guidedStation = (title, version, groups, ids) => write("/exercises", {
      programSessionId: 34002, trainingPhase: "centrale", teamId: 11, title, durationMinutes: 12,
      scegliGiocatori: true, playersRequired: ids.length, selectedPlayerIdsJson: JSON.stringify(ids),
      stationAllocation: { version, groups },
    });
    const grouped = await guidedStation("Guided group one", setupVersion, otherIds.length ? [0, 1, 2] : [0, 1], firstIds);
    assert.equal(grouped.status, 201, JSON.stringify(grouped.data));
    const linkedBeforeMove = await call("/training-sessions/34002/planning", coach);
    assert.deepEqual(linkedBeforeMove.data.rotations.centrale[0].stations[0].playerIds, firstIds);
    assert.equal((await guidedStation("Stale guided station", setupVersion, [1], [coachGuest.data.playerId])).status, 409);
    assert.equal((await pg.query("SELECT id FROM exercises WHERE title = 'Stale guided station'")).rows.length, 0);
    const moved = await guidedStation("Guided group two", linkedBeforeMove.data.version, [1], [coachGuest.data.playerId]);
    assert.equal(moved.status, 201, JSON.stringify(moved.data));
    const afterMove = (await call("/training-sessions/34002/planning", coach)).data.rotations.centrale;
    assert.deepEqual(afterMove.map(turn => turn.stations[0].playerIds), [[guestId, ...otherIds], [coachGuest.data.playerId]]);
    assert.deepEqual(afterMove.map(turn => turn.stations[0].seconds), [720, 720]);
    console.log("PASS guided station allocation: explicit group confirmation, redistribution in one write, stale proposal leaves no orphan.");
    const reviewPath = trialPath + "/" + guestId;
    assert.equal((await parentRequest(reviewPath, "PATCH", { score: 8, decision: "approved" }, secretary)).status, 403);
    assert.equal((await parentRequest(reviewPath, "PATCH", { score: 11, decision: "approved" }, coach)).status, 400);
    assert.equal((await parentRequest(reviewPath, "PATCH", { score: 8, decision: "approved" }, coach)).status, 200);
    assert.equal((await call(trialPath, coach)).data.find(trial => trial.playerId === guestId)?.decision, "approved");
    assert.ok(!(await roster(34003)).some(player => player.id === guestId));
    await pg.exec("UPDATE players SET status=coalesce(status,'active'), created_at=coalesce(created_at,now())");
    const official = await call("/players", secretary);
    assert.equal(official.status, 200, JSON.stringify(official.data));
    assert.ok(!official.data.some(player => player.id === guestId));
    console.log("PASS training guests: coach/secretary permissions, inclusive dates, team scope, attendance, station planning, board, review and exclusion from the official roster.");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pg.close();
    delete globalThis.rotationAccessTest;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
