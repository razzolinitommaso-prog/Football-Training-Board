const assert = require("node:assert/strict");
module.exports = async ({ pg, base, call, recent }) => {
  const fixtures = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    homeTeam: i === 0 ? "Club test" : `Casa ${i}`,
    awayTeam: `Ospite ${i}`,
    date: `2026-11-21T${String(12 + i).padStart(2, "0")}:00:00Z`,
    round: 10,
    leg: "andata",
    homeScore: i === 0 ? 0 : 2,
    awayScore: i === 0 ? 0 : 1,
  }));
  const selected = recent(fixtures, (r) => r.homeTeam === "Club test");
  assert.equal(selected.clubResult.id, 1);
  assert.equal(selected.roundResults.length, 8);
  assert.equal(selected.otherResults.length, 7);
  assert.ok(!selected.otherResults.some((r) => r.id === 1));
  assert.equal(recent(fixtures, () => false).clubResult, null);
  assert.equal(
    recent([{ ...fixtures[0], homeScore: null }], () => true).clubResult,
    null,
  );
  const older = {
    ...fixtures[0],
    id: 100,
    round: 9,
    date: "2026-11-14T12:00:00Z",
  };
  assert.equal(
    recent([older, ...fixtures.slice(1)], (r) => r.homeTeam === "Club test")
      .clubResult.id,
    100,
  );
  const fetchOriginal = global.fetch;
  let goal = 2,
    empty = false,
    calls = 0;
  const payload = () => ({
    component: "QuadroGare",
    props: {
      championship: { name: "Primi Calci LND test" },
      group: { name: "Girone Test" },
      currentMatchday: { number: 1, leg: "first" },
      matches: empty
        ? []
        : [
            {
              id: "school-lnd-fixture",
              home: "Club test",
              away: "Ospiti Test",
              date: "2026-11-21",
              time: "15:00",
              homeGoals: goal,
              awayGoals: 1,
              outcome: "Disputata",
            },
          ],
      standings: [],
    },
  });
  global.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === "gare.lnd.it") {
      calls++;
      return new Response(
        `<script type="application/json">${JSON.stringify(payload())}</script>`,
        { headers: { "content-type": "text/html" } },
      );
    }
    if (url.hostname !== "127.0.0.1")
      throw Error("No external requests in isolated LND test");
    return fetchOriginal(input, options);
  };
  const body = {
    section: "scuola_calcio",
    teamId: 11,
    url: "https://gare.lnd.it/competizione/toscana?campionato=TEST&girone=A&stagione=2026",
  };
  const sync = async (b = body, role = "technical_director", club = 1) => {
    const r = await fetch(base + "/championships/lnd/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-role": role,
        "x-club": String(club),
      },
      body: JSON.stringify(b),
    });
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal((await sync(body, "parent")).status, 403);
    assert.equal((await sync(body, "team_manager")).status, 403);
    assert.equal(
      (await sync({ ...body, url: "https://example.test/not-lnd" })).status,
      400,
    );
    assert.equal((await sync({ ...body, teamId: 22 })).status, 400);
    assert.equal((await sync({ ...body, teamId: 12 })).status, 400);
    assert.equal(calls, 0);
    const first = await sync();
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(first.data.created, 1);
    const id = first.data.championship.id,
      fixtureId = first.data.championship.groups[0].fixtures[0].id;
    assert.equal(first.data.championship.section, "scuola_calcio");
    assert.equal(first.data.championship.teamId, 11);
    assert.equal(first.data.championship.sourceUrl, body.url);
    assert.deepEqual(first.data.championship.groups[0].standings, []);
    goal = 3;
    const second = await sync();
    assert.equal(second.status, 200, JSON.stringify(second));
    assert.equal(second.data.created, 0);
    assert.equal(second.data.updated, 1);
    assert.equal(second.data.championship.groups[0].fixtures[0].id, fixtureId);
    assert.equal(second.data.championship.groups[0].fixtures[0].homeScore, 3);
    const own = await call("/championships?section=scuola_calcio", {
      "x-role": "technical_director",
    });
    assert.ok(own.data.some((c) => c.id === id));
    const foreign = await call("/championships?section=scuola_calcio", {
      "x-role": "technical_director",
      "x-club": "2",
    });
    assert.ok(!foreign.data.some((c) => c.id === id));
    const youth=await sync({...body,section:'settore_giovanile',teamId:12});
    assert.equal(youth.status,200,JSON.stringify(youth));
    assert.equal(youth.data.championship.groups[0].standings.length,2,'existing youth standings calculation remains available');
    empty = true;
    assert.equal(
      (await sync({ ...body, title: "Vuoto di collaudo" })).status,
      422,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT count(*)::integer AS n FROM championship_fixtures WHERE championship_id=$1",
          [id],
        )
      ).rows[0].n,
      1,
    );
    console.log(
      "PASS LND school: HTTP preview/sync parser reused, saved source, correct annata/club, repeated sync updates same fixture, no invented standings, empty feed rejection; own latest result survives 8-game round and 0-0.",
    );
  } finally {
    global.fetch = fetchOriginal;
  }
};
