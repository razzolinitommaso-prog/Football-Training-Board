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
      `export {default as teams} from '../../artifacts/api-server/src/routes/teams';export {default as championships} from '../../artifacts/api-server/src/routes/championships';export {default as auth} from '../../artifacts/api-server/src/routes/auth';export {default as training} from '../../artifacts/api-server/src/routes/training';export {default as attendance} from '../../artifacts/api-server/src/routes/attendance';export {default as exercises} from '../../artifacts/api-server/src/routes/exercises';export {default as players} from '../../artifacts/api-server/src/routes/players';export {default as parent} from '../../artifacts/api-server/src/routes/parent';export {default as manager} from '../../artifacts/api-server/src/routes/team-manager';export {default as matches} from '../../artifacts/api-server/src/routes/matches';export {restrictTeamManagerApi} from '../../artifacts/api-server/src/lib/team-manager-access';export {attachBearerSession} from '../../artifacts/api-server/src/lib/auth.ts';export {requireCurrentParentAccess} from '../../artifacts/api-server/src/lib/parent-delegate-access';export {readSessionEligibility} from '../../artifacts/api-server/src/lib/training-session-attendance';export * as schema from '../../lib/db/src/schema';export {getTableConfig,PgTable} from 'drizzle-orm/pg-core';`,
    );
    const bundle = path.join(dir, "bundle.cjs");
    if (process.argv.includes("--extra-time")) {
      fs.appendFileSync(path.join(dir, "entry.ts"), "\nexport {default as secretary} from '../../artifacts/api-server/src/routes/secretary';");
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
    app.use("/api", routes.restrictTeamManagerApi, routes.requireCurrentParentAccess, routes.parent, routes.manager, routes.matches, routes.players, routes.training, routes.attendance, routes.exercises, routes.auth, routes.championships, routes.teams);
    if (routes.secretary) app.use("/api", routes.secretary);
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
