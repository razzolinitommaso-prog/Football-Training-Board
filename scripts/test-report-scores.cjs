const assert = require("node:assert/strict");
module.exports = async ({ pg, base, call, plan }) => {
  const saved = structuredClone(plan);
  saved.periods.push({
    key: "t4",
    minutes: "12",
    lineupPlayerIds: [101, 102],
    lineupStarterCount: 2,
  });
  saved.postMatchReport = {
    version: 1,
    periods: [
      { minutes: 12, starters: [101, 102], goalsFor: 1, goalsAgainst: 0 },
      { minutes: 12, starters: [101, 102], goalsFor: 0, goalsAgainst: 2 },
      {
        minutes: 12,
        starters: [101, 102],
        goalsFor: 2,
        goalsAgainst: 0,
        opponentOwnGoals: 1,
      },
      { minutes: 12, starters: [101, 102], goalsFor: 0, goalsAgainst: 0 },
    ],
    goals: [
      { id: "g1", playerId: 101, period: 0, minute: 2 },
      { id: "g2", playerId: 102, period: 2, minute: 4 },
    ],
    substitutions: [],
  };
  const patch = async (body) => {
    const r = await fetch(base + "/matches/501", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-role": "coach" },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  };
  let result = await patch({ matchPlan: saved, result: "99-99" });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(
    result.data.result,
    "3-2",
    "period sum overrides stale aggregate",
  );
  assert.deepEqual(
    result.data.matchPlan.postMatchReport,
    saved.postMatchReport,
  );
  await pg.exec(
    `INSERT INTO championships(id,club_id,team_id,section,title) VALUES(801,1,11,'scuola_calcio','Campionato test');INSERT INTO championship_groups(id,club_id,championship_id,name) VALUES(802,1,801,'Girone test');INSERT INTO championship_fixtures(id,club_id,championship_id,group_id,match_id,home_team,away_team,date) VALUES(803,1,801,802,501,'Club test','Opponent','2026-10-10');`,
  );
  await pg.exec("UPDATE championship_fixtures SET home_score=0,away_score=2 WHERE id=803");
  const list = await call("/championships?section=scuola_calcio", {
    "x-role": "technical_director",
  });
  assert.equal(list.status, 200, JSON.stringify(list));
  const group = list.data.find((c) => c.id === 801).groups[0];
  assert.deepEqual(group.standings, [], "official standings unchanged");
  assert.equal(group.fixtures[0].homeScore,0,'federated score is preserved separately');
  assert.equal(
    group.ftbStandings.rows.find((r) => r.team === "Club test").pts,
    3,
  );
  assert.equal(
    group.ftbStandings.rows.find((r) => r.team === "Club test").gf,
    3,
  );
  assert.deepEqual(
    group.scorers.map((s) => s.goals),
    [1, 1],
    "opponent own goal is not credited to a player",
  );
  result = await patch({ matchPlan: saved, homeAway: "away" });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.result, "2-3");
  result = await patch({result:'0-0'});
  assert.equal(result.status,400,'aggregate cannot diverge from saved period scores');
  const broken = structuredClone(saved);
  broken.postMatchReport.periods[2].goalsFor = 3;
  result = await patch({ matchPlan: broken });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /3° tempo/);
  delete broken.postMatchReport.periods[2].goalsAgainst;
  result = await patch({ matchPlan: broken });
  assert.equal(result.status, 400);
  assert.match(result.data.error, /tutti i tempi/);
  const persisted = (
    await pg.query("SELECT result,match_plan FROM matches WHERE id=501")
  ).rows[0];
  assert.equal(persisted.result, "2-3");
  assert.deepEqual(
    persisted.match_plan,
    saved,
    "rejected saves leave data intact",
  );
  const clean = structuredClone(saved);
  clean.postMatchReport.goals = [];
  clean.postMatchReport.periods = clean.postMatchReport.periods.map((p) => ({
    ...p,
    goalsFor: 0,
    goalsAgainst: 0,
    opponentOwnGoals: 0,
  }));
  result = await patch({ matchPlan: clean });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.result, "0-0");
  console.log(
    "PASS report scores HTTP: four periods, own goals, stale total, home/away, 0-0, scorer mismatch, incomplete score and atomic rejection.",
  );
};
