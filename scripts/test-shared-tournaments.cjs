// Runs the real Express handlers with in-memory PostgreSQL. Never loads application DB credentials.
// Usage: node scripts/test-shared-tournaments.cjs <path-to-@electric-sql/pglite>
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const root = path.resolve(__dirname, ".."),
  req = createRequire(path.join(root, "artifacts/api-server/package.json"));
const express = req("express");
const frontendRequire = createRequire(
  path.join(root, "artifacts/football-training-board/package.json"),
);
const viteRequire = createRequire(frontendRequire.resolve("vite"));
const esbuild = viteRequire("esbuild");
if (process.argv[2]) {
  process.env.NODE_PATH = path.resolve(process.argv[2], "../..");
  require("node:module").Module._initPaths();
}
const { PGlite } = require(process.argv[2] || "@electric-sql/pglite");
(async () => {
  const pg = new PGlite();
  let server;
  try {
    await pg.exec(`CREATE TABLE clubs(id int PRIMARY KEY);CREATE TABLE seasons(id int PRIMARY KEY);CREATE TABLE users(id int PRIMARY KEY);
   INSERT INTO clubs VALUES(1),(2);INSERT INTO seasons VALUES(1),(2);INSERT INTO users VALUES(1),(2),(3);
   CREATE TABLE teams(id int PRIMARY KEY,club_id int,coach_id int,season_id int,name text,age_group text,category text,club_section text,season_training_start_date date,official_training_end_date date,training_schedule jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
   INSERT INTO teams(id,club_id,season_id,name,club_section) VALUES(11,1,1,'Piccoli Amici','scuola_calcio'),(12,1,1,'Primi Calci','scuola_calcio'),(13,2,1,'Altra società','scuola_calcio'),(14,1,2,'Altra stagione','scuola_calcio'),(15,1,1,'Allievi','settore_giovanile');
   CREATE TABLE team_staff_assignments(id serial PRIMARY KEY,team_id int,user_id int,club_id int,role text,created_at timestamptz DEFAULT now());
   INSERT INTO team_staff_assignments(team_id,user_id,club_id,role) VALUES(11,2,1,'coach');
   CREATE TABLE matches(id serial PRIMARY KEY,club_id int REFERENCES clubs(id),team_id int REFERENCES teams(id),season_id int,opponent text,date timestamptz,competition text,location text,home_away text,notes text,match_plan jsonb,result text,pre_match_notes text,post_match_notes text);
   CREATE TABLE call_ups(id serial PRIMARY KEY,match_id int REFERENCES matches(id) ON DELETE CASCADE);
   CREATE TABLE tournament_states(id serial PRIMARY KEY,club_id int,team_id int,competition text,normalized_competition text,program jsonb,scores jsonb DEFAULT '{}',pdf_reference_date text,updated_at timestamptz DEFAULT now());
   CREATE TABLE tournament_documents(id serial PRIMARY KEY,club_id int,team_id int,competition text,normalized_competition text);
   CREATE FUNCTION pg_advisory_xact_lock(integer,integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
   INSERT INTO matches(club_id,team_id,opponent,date,competition) VALUES(1,11,'Storico','2026-10-01','Torneo precedente');`);
    await pg.exec(
      fs.readFileSync(path.join(root, "docs/shared-tournaments.sql"), "utf8"),
    );
    await pg.exec(
      fs.readFileSync(path.join(root, "docs/shared-tournaments.sql"), "utf8"),
    );
    globalThis.sharedTournamentTest = { pg, failInsert: false };
    const temp = path.join(root, ".tools/shared-tournament-tests");
    fs.mkdirSync(temp, { recursive: true });
    const fake = path.join(temp, "db.ts");
    fs.writeFileSync(
      fake,
      `import {drizzle} from 'drizzle-orm/pglite'; export {teamsTable} from '../../lib/db/src/schema/teams';export {teamStaffAssignmentsTable} from '../../lib/db/src/schema/team-assignments';
   const fixture=(globalThis as any).sharedTournamentTest; export const db=drizzle(fixture.pg);
   const query=async(text:string,params?:unknown[])=>{if(fixture.failInsert&&text.includes('INSERT INTO shared_tournament_teams'))throw Error('Simulated second write failure');
    if(text.trim().startsWith('CREATE TABLE')){await fixture.pg.exec(text);return {rows:[],rowCount:0};}
    const result=await fixture.pg.query(text,params);return {...result,rowCount:result.rows.length};};
   export const pool={query,connect:async()=>({query,release(){}})};`,
    );
    const auth = path.join(temp, "auth.ts");
    fs.writeFileSync(
      auth,
      `export function requireAuth(req:any,res:any,next:any){if(req.headers['x-anonymous']){res.status(401).json({error:'No session'});return;} req.session={role:req.headers['x-role']??'secretary',userId:Number(req.headers['x-user']??1),clubId:Number(req.headers['x-club']??1),section:req.headers['x-section']??'scuola_calcio'};next();}`,
    );
    const scope = path.join(temp, "scope.ts");
    fs.writeFileSync(
      scope,
      `export const normalizeSessionRole=(value:any)=>String(value??'').toLowerCase();export const isClubWideListRole=(role:string)=>['admin','secretary','presidente','director','technical_director','sporting_director'].includes(role);export async function resolveAllowedClubSections(req:any){return isClubWideListRole(req.session.role)?undefined:[req.session.section];}`,
    );
    const bundle = path.join(temp, "route.cjs");
    await esbuild.build({
      entryPoints: [
        path.join(
          root,
          "artifacts/api-server/src/routes/shared-tournaments.ts",
        ),
      ],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      plugins: [
        {
          name: "isolated-db",
          setup(build) {
            build.onResolve({ filter: /^@workspace\/db$/ }, () => ({
              path: fake,
            }));
            build.onResolve({ filter: /^@workspace\/api-zod$/ }, () => ({
              path: path.join(root, "lib/api-zod/src/shared-tournaments.ts"),
            }));
            build.onResolve({ filter: /\/lib\/auth$/ }, () => ({ path: auth }));
            build.onResolve({ filter: /\/lib\/club-scope$/ }, () => ({
              path: scope,
            }));
          },
        },
      ],
      nodePaths: [
        path.join(root, "artifacts/api-server/node_modules"),
        path.join(root, "lib/api-zod/node_modules"),
        path.join(root, "lib/db/node_modules"),
      ],
    });
    const app = express();
    app.use(express.json({ limit: "16mb" }));
    const compiled = new (require("node:module").Module)(bundle, module);
    compiled.filename = bundle;
    compiled.paths = [
      path.join(root, "artifacts/api-server/node_modules"),
      path.join(root, "lib/db/node_modules"),
      path.join(root, "lib/api-zod/node_modules"),
    ];
    compiled._compile(fs.readFileSync(bundle, "utf8"), bundle);
    app.use("/api", compiled.exports.default);
    app.use((error, _req, res, _next) =>
      res.status(500).json({ error: error.message }),
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const call = async (url, method = "GET", body, headers = {}) => {
      if (
        body &&
        ((method === "PUT" && url.endsWith("/program")) ||
          method === "PATCH") &&
        body.expectedRevision === undefined
      ) {
        const id = url.split("/")[2];
        const current = (
          await pg.query(
            "SELECT revision FROM shared_tournaments WHERE id=$1",
            [id],
          )
        ).rows[0];
        body = { ...body, expectedRevision: current?.revision ?? 0 };
      }
      const r = await fetch(base + url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, data: await r.json() };
    };
    const body = {
      name: "Primavera",
      location: "Campo centrale",
      startDate: "2027-05-15",
      endDate: "2027-05-16",
      teamIds: [11, 12],
    };
    assert.equal(
      (
        await call("/shared-tournaments?teamId=11", "GET", null, {
          "x-anonymous": "1",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/shared-tournaments", "POST", body, {
          "x-role": "coach",
          "x-user": "2",
        })
      ).status,
      403,
    );
    for (const teamId of [13, 14, 15])
      assert.equal(
        (
          await call("/shared-tournaments", "POST", {
            ...body,
            teamIds: [11, teamId],
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await call("/shared-tournaments", "POST", {
          ...body,
          startDate: "2027-02-30",
        })
      ).status,
      400,
    );
    globalThis.sharedTournamentTest.failInsert = true;
    assert.equal((await call("/shared-tournaments", "POST", body)).status, 500);
    globalThis.sharedTournamentTest.failInsert = false;
    assert.equal(
      (await pg.query("SELECT count(*)::int AS n FROM shared_tournaments"))
        .rows[0].n,
      0,
      "Creation rolls back header on second-write failure",
    );
    const created = await call("/shared-tournaments", "POST", body);
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal(created.data.teams.length, 2);
    assert.equal((await call("/shared-tournaments", "POST", body)).status, 409);
    const coachHeaders = { "x-role": "coach", "x-user": "2" };
    const visible = await call(
      "/shared-tournaments?teamId=11",
      "GET",
      null,
      coachHeaders,
    );
    assert.equal(visible.status, 200);
    assert.deepEqual(
      visible.data[0].teams.map((t) => t.id),
      [11],
    );
    assert.equal(
      (await call("/shared-tournaments?teamId=12", "GET", null, coachHeaders))
        .status,
      403,
    );
    assert.equal(
      (
        await call("/shared-tournaments?teamId=11", "GET", null, {
          "x-club": "2",
        })
      ).status,
      403,
    );
    const entry = (suffix, side = "home") => ({
      id: `entry-${suffix}`,
      date: "2027-05-15T08:00:00.000Z",
      homeTeam: "Fortis",
      awayTeam: "Vicchio",
      group: "A",
      phase: "Gironi",
      ownSide: side,
    });
    const program = [
      entry("11"),
      {
        ...entry("other", "none"),
        homeTeam: "Società esterna A",
        awayTeam: "Società esterna B",
      },
    ];
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 12,
          program: [{ ...entry("12"), awayTeam: "Laurenziana" }],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT count(*)::int AS n FROM shared_tournament_matches",
        )
      ).rows[0].n,
      2,
      "Idempotent programme and no fixture for external game",
    );
    let page = await call(
      `/shared-tournaments/${id}/program?teamId=11`,
      "GET",
      null,
      coachHeaders,
    );
    assert.equal(page.data.program.length, 2);
    assert.ok(page.data.program[0].matchId);
    assert.equal(page.data.program[1].matchId, undefined);
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program: page.data.program.map(({ matchId, ...entry }) => entry),
        })
      ).status,
      200,
      "Programme can be reopened and saved without hidden fields",
    );
    const fixtureId = page.data.program[0].matchId;
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program,
          expectedRevision: 0,
        })
      ).status,
      409,
      "Stale programme rejected",
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}`, "PATCH", {
          ...body,
          expectedRevision: 0,
        })
      ).status,
      409,
      "Stale common edits rejected",
    );
    await pg.query("INSERT INTO call_ups(match_id) VALUES($1)", [fixtureId]);
    await pg.query(
      `UPDATE matches SET match_plan='{"saved":true}'::jsonb WHERE id=$1`,
      [fixtureId],
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program: [],
        })
      ).status,
      409,
      "Cannot remove prepared match",
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program: [{ ...entry("11"), awayTeam: "Changed" }],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/program`, "PUT", {
          teamId: 11,
          program: [{ ...entry("11"), date: "2027-06-01T08:00:00.000Z" }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          `/shared-tournaments/${id}/program?teamId=12`,
          "GET",
          null,
          coachHeaders,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}`, "PATCH", {
          ...body,
          name: "Primavera aggiornata",
          location: "Campo nuovo",
        })
      ).status,
      200,
    );
    const fixtures = (
      await pg.query(
        "SELECT * FROM matches WHERE id IN(SELECT match_id FROM shared_tournament_matches)",
      )
    ).rows;
    assert.ok(
      fixtures.every(
        (m) =>
          m.competition === "Torneo: Primavera aggiornata" &&
          m.location === "Campo nuovo",
      ),
    );
    assert.deepEqual(fixtures.find((m) => m.id === fixtureId).match_plan, {
      saved: true,
    });
    assert.equal((await pg.query("SELECT * FROM call_ups")).rows.length, 1);
    assert.equal(
      (await call(`/shared-tournaments/${id}`, "DELETE")).status,
      409,
    );
    const document = {
      name: "programma.pdf",
      dataUrl:
        "data:application/pdf;base64," +
        Buffer.from("%PDF-1.4\nexample").toString("base64"),
    };
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/documents`, "POST", {
          name: "bad.pdf",
          dataUrl: "data:application/pdf;base64,YmFk",
        })
      ).status,
      400,
    );
    const doc = await call(
      `/shared-tournaments/${id}/documents`,
      "POST",
      document,
    );
    assert.equal(doc.status, 201);
    assert.equal(
      (
        await call(
          `/shared-tournaments/${id}/documents`,
          "GET",
          null,
          coachHeaders,
        )
      ).data[0].name,
      "programma.pdf",
    );
    assert.equal(
      (
        await call(
          `/shared-tournaments/${id}/documents`,
          "POST",
          document,
          coachHeaders,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`/shared-tournaments/${id}/documents`, "GET", null, {
          "x-club": "2",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(
          `/shared-tournaments/${id}/documents/${doc.data.id}`,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT opponent FROM matches WHERE competition='Torneo precedente'",
        )
      ).rows[0].opponent,
      "Storico",
    );
    assert.equal(
      (
        await call("/shared-tournaments", "POST", {
          ...body,
          name: "Torneo: Prímavera aggiornata",
        })
      ).status,
      409,
      "Canonical-name collision",
    );
    const empty = await call("/shared-tournaments", "POST", {
      ...body,
      name: "Torneo vuoto",
      teamIds: [11],
    });
    assert.equal(empty.status, 201);
    assert.equal(
      (
        await call(`/shared-tournaments/${empty.data.id}/program`, "PUT", {
          teamId: 11,
          program: [entry("external-only", "none")],
        })
      ).status,
      200,
    );
    assert.equal(
      (await call(`/shared-tournaments/${empty.data.id}`, "DELETE")).status,
      200,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT id FROM tournament_states WHERE competition='Torneo vuoto'",
        )
      ).rows.length,
      0,
      "Delete cleans programme-only state",
    );
    console.log(
      "PASS real handlers + isolated PostgreSQL: multi-team single header, scopes, roles, invalid dates, rollback, own fixtures, external programmes, repeated saves, protected match data, common updates, common files, deletion guards, legacy match preserved. Advisory-lock exclusion is not simulated by this sequential test.",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pg.close();
    delete globalThis.sharedTournamentTest;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
