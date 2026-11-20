const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
module.exports = async ({ pg, base, call }) => {
  const request = async (
    path,
    body,
    role = "admin",
    method = "POST",
    headers = {},
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "content-type": "application/json",
        "x-role": role,
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      data: r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : await r.text(),
    };
  };
  const ok = (r, n = 200) => assert.equal(r.status, n, JSON.stringify(r.data));
  const get = (p, role = "admin", headers = {}) =>
    call(p, { "x-role": role, ...headers });
  for (const t of ["clubs", "players", "teams", "users", "club_memberships"])
    await pg.exec(
      `CREATE SEQUENCE IF NOT EXISTS ${t}_test_seq START 10000;ALTER TABLE ${t} ALTER COLUMN id SET DEFAULT nextval('${t}_test_seq')`,
    );
  await pg.exec(
    "UPDATE players SET status='active',created_at=now();ALTER TABLE players ALTER COLUMN created_at SET DEFAULT now();ALTER TABLE teams ALTER COLUMN created_at SET DEFAULT now();UPDATE teams SET created_at=now();",
  );
  await pg.exec(
    `INSERT INTO seasons(id,club_id,name,start_date,end_date,is_active) VALUES(70,1,'2026/2027','2026-07-01','2027-06-30',true); UPDATE teams SET season_id=70 WHERE club_id=1;INSERT INTO club_memberships(id,user_id,club_id,role,club_section) VALUES(101,2,1,'coach','{scuola_calcio}');INSERT INTO club_memberships(id,user_id,club_id,role,club_section) VALUES(100,1,1,'admin','{scuola_calcio,prima_squadra}');`,
  );
  ok(await get("/society-management", "coach"), 403);
  ok(
    await request("/society-management/group", { name: "Gruppo Fortis" }),
    201,
  );
  ok(await request("/society-management/group", { name: "Duplicato" }), 409);
  ok(
    await request("/society-management/clubs", { name: "Estranea", clubId: 2 }),
    403,
  );
  ok(
    await request("/society-management/clubs", {
      name: "Società Due",
      fiscalCode: "TEST-CF",
    }),
    201,
  );
  let index = await get("/society-management");
  ok(index);
  const other = index.data.groupClubs.find((c) => c.id !== 1).id;
  assert.equal(
    (await get("/society-management", "admin", { "x-user": "2" })).data.group
      .manager,
    false,
  );
  ok(
    await request("/society-management/access", {
      userId: 2,
      clubIds: [2],
      role: "secretary",
      sections: ["scuola_calcio"],
    }),
    403,
  );
  ok(
    await request("/society-management/access", {
      userId: 2,
      clubIds: [other],
      role: "secretary",
      sections: ["scuola_calcio"],
    }),
    204,
  );
  ok(
    await request("/society-management/switch", { clubId: 2, role: "admin" }),
    403,
  );
  const switched = await request("/society-management/switch", {
    clubId: other,
    role: "admin",
  });
  ok(switched);
  assert(switched.data.authToken);
  const pos = await get("/player-positions/101");
  ok(pos);
  ok(
    await request(
      "/player-positions/101",
      {
        ...pos.data,
        state: "not_renewed",
        notes: "Mancato rinnovo",
        effectiveDate: "2026-11-20",
      },
      "admin",
      "PUT",
    ),
    204,
  );
  const active1 = await get("/players?activeRoster=1");
  ok(active1);
  assert(!active1.data.some((p) => p.id === 101));
  assert((await get("/players")).data.some((p) => p.id === 101));
  ok(
    await request(
      "/player-positions/101",
      {
        ...pos.data,
        state: "active",
        notes: "Vecchia revisione",
        effectiveDate: "2026-11-20",
      },
      "admin",
      "PUT",
    ),
    409,
  );
  let latest = (await get("/player-positions/101")).data;
  ok(
    await request(
      "/player-positions/101",
      {
        ...latest,
        state: "retired_definitive",
        notes: "Ritiro definitivo",
        effectiveDate: "2026-11-20",
      },
      "admin",
      "PUT",
    ),
    204,
  );
  const st = await get("/seasons/70/player-status");
  ok(st);
  assert(!st.data.some((p) => p.playerId === 101));
  latest = (await get("/player-positions/101")).data;
  ok(
    await request(
      "/player-positions/101",
      {
        ...latest,
        state: "active",
        notes: "Rientro esplicito",
        effectiveDate: "2026-11-20",
      },
      "admin",
      "PUT",
    ),
    204,
  );
  assert((await get("/players?activeRoster=1")).data.some((p) => p.id === 101));
  const test = await request("/society-management/test-player", {});
  ok(test);
  assert.equal(
    (await request("/society-management/test-player", {})).data.id,
    test.data.id,
  );
  assert(
    !(await get("/players?activeRoster=1")).data.some(
      (p) => p.id === test.data.id,
    ),
  );
  await pg.exec(
    `UPDATE players SET club_section='prima_squadra' WHERE id=101;UPDATE teams SET club_section='prima_squadra' WHERE id=11;`,
  );
  ok(await get("/player-finance/101/profile"));
  ok(await get("/player-finance/201/profile"), 404);
  ok(await get("/player-finance/101/profile", "coach"), 403);
  const c = {
    id: randomUUID(),
    revision: 0,
    title: "Accordo calciatore",
    role: "player",
    seasonId: 70,
    fromMonth: "2026-11",
    toMonth: "2026-12",
    contractType: "annual",
    amountMode: "monthly",
    compensationCents: 12345,
    reimbursementCents: 0,
    terms: "30",
    lastPaymentDate: "2027-01-31",
    allocations: [{ teamId: 11, share: 10000 }],
    notes: "Test",
    documentId: null,
    active: true,
  };
  ok(
    await request(
      `/player-finance/101/contracts/${c.id}`,
      c,
      "secretary",
      "PUT",
    ),
  );
  let dues = (await get("/player-finance/expenses")).data.dues;
  assert.equal(dues.length, 2);
  assert.equal(
    dues.reduce((a, d) => a + d.amountCents, 0),
    24690,
  );
  const pay = {
    id: randomUUID(),
    amountCents: 1000,
    paidDate: "2026-11-20",
    method: "bank_transfer",
    documentId: null,
    notes: "Acconto",
  };
  ok(
    await request(
      `/player-finance/expenses/${dues[0].id}/pay`,
      pay,
      "secretary",
    ),
    204,
  );
  ok(
    await request(
      `/player-finance/expenses/${dues[0].id}/pay`,
      pay,
      "secretary",
    ),
    204,
  );
  assert.equal((await get("/player-finance/expenses")).data.receipts.length, 1);
  ok(
    await request(
      `/player-finance/expenses/${dues[0].id}/pay`,
      { ...pay, id: randomUUID(), amountCents: 99999 },
      "secretary",
    ),
    409,
  );
  ok(
    await request(
      `/player-finance/101/contracts/${c.id}`,
      { ...c, revision: 1, compensationCents: 9 },
      "secretary",
      "PUT",
    ),
    409,
  );
  const tc = { ...c, id: randomUUID(), revision: 0, allocations: [] };
  ok(
    await request(
      `/player-finance/${test.data.id}/contracts/${tc.id}`,
      tc,
      "secretary",
      "PUT",
    ),
  );
  assert.equal((await get("/player-finance/expenses")).data.dues.length, 2);
  assert.equal(
    (await get("/player-finance/expenses?playerId=" + test.data.id)).data.dues
      .length,
    4,
  );
  ok(
    await request(
      "/society-management/members/2/dismissal",
      { role: "coach", effectiveDate: "2026-11-20", notes: "Esonero motivato" },
      "admin",
      "PUT",
    ),
    204,
  );
  ok(await get("/teams", "coach", { "x-user": "2" }), 403);
  ok(
    await get("/teams", "secretary", {
      "x-user": "2",
      "x-club": String(other),
    }),
  );
  ok(
    await request(
      "/society-management/members/2/dismissal",
      {
        role: "coach",
        effectiveDate: "2026-11-20",
        notes: "Nuovo incarico",
        restore: true,
      },
      "admin",
      "PUT",
    ),
    204,
  );
  ok(await get("/teams", "coach", { "x-user": "2" }));
  const groupSummary = await get("/society-management/summary");
  ok(groupSummary);
  assert.equal(groupSummary.data.find((c) => c.id === 1).expenses, "10,00");
  ok(
    await get("/society-management/choices", "warehouse_keeper", {
      "x-user": "2",
    }),
  );
  ok(await get("/players", "warehouse_keeper", { "x-user": "2" }), 403);
  await pg.exec(
    "INSERT INTO player_payments(id,club_id,player_id,amount,status,payment_type) VALUES(9991,1,101,100,'pending','annual_fee_installment');UPDATE players SET registered=false WHERE id=101",
  );
  let ledger = await get("/player-payments");
  ok(ledger);
  assert.equal(ledger.data.find((p) => p.id === 9991).forecastEligible, false);
  await pg.exec("UPDATE players SET registered=true WHERE id=101");
  ledger = await get("/player-payments");
  assert.equal(ledger.data.find((p) => p.id === 9991).forecastEligible, true);
  await pg.exec("UPDATE users SET email='member-two@example.test' WHERE id=2;UPDATE club_memberships SET joined_at=now() WHERE user_id=2;INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(5001,1,2,11,'coach'),(5002,1,2,11,'team_manager')");
  const updated=await request('/clubs/me/members/2',{role:'coach',clubSection:['scuola_calcio'],phone:'3331234567',teamIds:[]},'admin','PATCH');ok(updated);assert.equal(updated.data.role,'coach');
  const roles=(await pg.query("SELECT role FROM club_memberships WHERE club_id=1 AND user_id=2 ORDER BY role")).rows.map(r=>r.role);assert.deepEqual(roles,['coach','team_manager']);
  assert.equal((await pg.query("SELECT role FROM team_staff_assignments WHERE user_id=2 AND club_id=1")).rows[0].role,'team_manager');
  console.log(
    "PASS society groups, explicit grants, club isolation, lifecycle revisions/archives/return, senior dues/partial payments/idempotency, test exclusion, role dismissal/restoration",
  );
};
