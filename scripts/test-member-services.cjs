// Runs against actual Express handlers and an isolated PostgreSQL instance.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
module.exports = async ({ pg, base, call, models, chart }) => {
  const write = async (
    path,
    body,
    role = "secretary",
    method = "PUT",
    extra = {},
  ) => {
    const response = await fetch(base + "/member-services" + path, {
      method,
      headers: { "content-type": "application/json", "x-role": role, ...extra },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.headers.get("content-type")?.includes("json")
        ? await response.json()
        : await response.text(),
    };
  };
  const get = (path, role = "secretary", extra = {}) =>
    call("/member-services" + path, { "x-role": role, ...extra });
  const ok = (r, status = 200) =>
    assert.equal(r.status, status, JSON.stringify(r.data));
  await pg.exec(`INSERT INTO seasons(id,club_id,name,start_date,end_date,is_active) VALUES(70,1,'2026/2027','2026-07-01','2027-06-30',true);
    UPDATE teams SET season_id=70 WHERE club_id=1;
    INSERT INTO users(id,first_name,last_name) VALUES(3,'Coach','Multi'),(4,'Foreign','Staff'),(5,'Secretary','Staff');
    INSERT INTO club_memberships(id,club_id,user_id,role,club_section) VALUES(3,1,3,'coach','{scuola_calcio}'),(4,1,3,'fitness_coach','{scuola_calcio}'),(5,2,4,'coach','{scuola_calcio}'),(6,1,5,'secretary','{scuola_calcio}');
    INSERT INTO team_staff_assignments(id,club_id,user_id,team_id,role) VALUES(3,1,3,11,'coach');
    INSERT INTO training_sessions(id,club_id,team_id,title,scheduled_at,status,session_kind) VALUES(800,1,11,'Member training','2026-11-18T16:00:00Z','scheduled','regular'),(801,2,22,'Foreign','2026-11-18T16:00:00Z','scheduled','regular');`);
  for (const role of ["parent", "coach", "fitness_coach", "team_manager"])
    assert.equal((await get("", role)).status, 403);
  for (const role of ["technical_director", "sporting_director"]) {
    ok(await get("", role));
    ok(await get("/expenses", role), 403);
  }
  for (const role of ["secretary", "admin", "presidente", "director"])
    ok(await get("/expenses", role));
  const index = await get("");
  ok(index);
  await pg.exec("UPDATE teams SET season_id=NULL WHERE id=12");
  assert.equal(
    (await get("")).data.teams.find((t) => t.id === 12).seasonId,
    70,
  );
  assert.equal(index.data.members.filter((m) => m.id === 3).length, 1);
  assert.deepEqual(index.data.members.find((m) => m.id === 3).roles.sort(), [
    "coach",
    "fitness_coach",
  ]);
  await pg.exec(
    "INSERT INTO users(id,first_name,last_name) VALUES(6,'Parent','Only');INSERT INTO club_memberships(id,club_id,user_id,role) VALUES(7,1,6,'parent')",
  );
  assert(!(await get("")).data.members.some((m) => m.id === 6));
  ok(await get("/6/profile"), 404);
  ok(await get("/4/profile"), 404);
  for (const terms of ["30", "60", "90"])
    assert.equal(
      models.memberFmDate("2026-09", terms),
      { 30: "2026-10-31", 60: "2026-11-30", 90: "2026-12-31" }[terms],
    );
  assert.equal(models.memberFmDate("2028-01", "30"), "2028-02-29");
  assert.match(models.memberMoney(360000), /3\.600,00/);
  for (const role of [
    "coach",
    "fitness_coach",
    "athletic_director",
    "technical_director",
    "sporting_director",
  ]) {
    const slots = models.memberKitSlots([role]);
    assert(slots.some((s) => s.key === "training_shirt"));
    assert(!slots.some((s) => s.key.startsWith("match_")));
  }
  assert(
    models
      .memberKitSlots(["team_manager"])
      .every((s) => s.key.startsWith("rep_")),
  );
  for (const role of ["secretary", "presidente", "admin"])
    assert.equal(models.memberKitSlots([role, "coach"]).length, 0);
  const contract = {
    id: randomUUID(),
    revision: 0,
    title: "Coach 2019",
    role: "coach",
    seasonId: 70,
    fromMonth: "2026-09",
    toMonth: "2026-11",
    contractType: "annual",
    amountMode: "total",
    compensationCents: 100001,
    reimbursementCents: 0,
    terms: "30",
    lastPaymentDate: "2026-12-31",
    allocations: [
      { teamId: 11, share: 6000 },
      { teamId: 12, share: 4000 },
    ],
    notes: "",
    documentId: null,
    active: true,
  };
  const installments = models.memberInstallments(contract);
  await pg.exec(
    "INSERT INTO seasons(id,club_id,name,start_date,end_date,is_active) VALUES(71,1,'2025/2026','2025-07-01','2026-06-30',false)",
  );
  const historic = {
    ...contract,
    id: randomUUID(),
    seasonId: 71,
    fromMonth: "2025-09",
    toMonth: "2025-11",
    lastPaymentDate: "2025-12-31",
    allocations: [{ teamId: 12, share: 10000 }],
  };
  ok(await write(`/3/contracts/${historic.id}`, historic), 400);
  assert.equal(
    installments.reduce((s, r) => s + r.amountCents, 0),
    100001,
  );
  for (const row of installments)
    assert.equal(
      row.allocations.reduce((s, a) => s + a.amountCents, 0),
      row.amountCents,
    );
  ok(
    await write(`/3/contracts/${contract.id}`, contract, "technical_director"),
    403,
  );
  const saved = await write(`/3/contracts/${contract.id}`, contract);
  ok(saved);
  assert.equal(saved.data.revision, 1);
  ok(await write(`/3/contracts/${contract.id}`, contract), 409);
  ok(
    await write(`/4/contracts/${randomUUID()}`, {
      ...contract,
      id: randomUUID(),
    }),
    400,
  );
  const hidden = await get("/3/profile", "sporting_director");
  ok(hidden);
  assert.deepEqual(hidden.data.contracts, []);
  assert(!JSON.stringify(hidden.data).includes("compensationCents"));
  let ledger = (await get("/expenses")).data;
  assert.equal(ledger.dues.length, 3);
  assert.equal(
    ledger.dues.reduce((s, d) => s + d.amountCents, 0),
    100001,
  );
  const due = ledger.dues[0],
    payment = {
      id: randomUUID(),
      amountCents: 10000,
      paidDate: "2026-10-31",
      method: "bank_transfer",
      documentId: null,
      notes: "Acconto",
    };
  ok(await write(`/expenses/${due.id}/pay`, payment, "secretary", "POST"), 204);
  ok(await write(`/expenses/${due.id}/pay`, payment, "secretary", "POST"), 204);
  ok(
    await write(
      `/expenses/${due.id}/pay`,
      { ...payment, amountCents: 20000 },
      "secretary",
      "POST",
    ),
    409,
  );
  ok(
    await write(
      `/expenses/${due.id}/pay`,
      { ...payment, id: randomUUID(), amountCents: due.amountCents },
      "secretary",
      "POST",
    ),
    409,
  );
  ledger = (await get("/expenses")).data;
  assert.equal(ledger.receipts.length, 1);
  assert.equal(ledger.dues[0].paidCents, 10000);
  // Every team's paid plus remaining cents equal its registered allocation.
  for (const team of ["", "11", "12"]) {
    const movements = chart.memberExpenseMovements(ledger, team, "2026-11-20");
    assert.equal(
      movements.reduce((n, m) => n + m.amount, 0),
      ledger.dues.reduce(
        (n, d) =>
          n + chart.memberAllocatedAmount(d.amountCents, d.details, team),
        0,
      ),
    );
  }
  const tinyDetails = {
    allocations: [
      { teamId: 11, amountCents: 2 },
      { teamId: 12, amountCents: 1 },
    ],
  };
  const tiny = {
    dues: [
      {
        id: 99,
        dueDate: "2026-12-31",
        amountCents: 3,
        paidCents: 2,
        details: tinyDetails,
      },
    ],
    receipts: [
      {
        id: "a",
        dueId: 99,
        paidDate: "2026-10-01",
        amountCents: 1,
        details: tinyDetails,
      },
      {
        id: "b",
        dueId: 99,
        paidDate: "2026-10-02",
        amountCents: 1,
        details: tinyDetails,
      },
    ],
  };
  for (const team of ["11", "12"])
    assert.equal(
      chart
        .memberExpenseMovements(tiny, team, "2026-11-20")
        .reduce((n, m) => n + m.amount, 0),
      team === "11" ? 2 : 1,
    );
  ok(
    await write(`/3/contracts/${contract.id}`, {
      ...saved.data,
      compensationCents: 200000,
    }),
    409,
  );
  const noteEdit = await write(`/3/contracts/${contract.id}`, {
    ...saved.data,
    notes: "Documento verificato",
  });
  ok(noteEdit);
  // A second distinct role stays a professional duty and does not create a login profile.
  const second = {
    ...contract,
    id: randomUUID(),
    title: "Preparazione",
    role: "fitness_coach",
    fromMonth: "2026-11",
    toMonth: "2026-11",
    compensationCents: 0,
    reimbursementCents: 2000,
    contractType: "volunteer",
    lastPaymentDate: "2026-12-31",
  };
  ok(await write(`/3/contracts/${second.id}`, second));
  assert.equal(
    (
      await pg.query(
        "SELECT count(*)::int AS n FROM club_memberships WHERE user_id=3",
      )
    ).rows[0].n,
    2,
  );
  const reimb = (await get("/expenses")).data.dues.find(
    (d) => d.contractId === second.id,
  );
  ok(
    await write(
      `/expenses/${reimb.id}/pay`,
      { ...payment, id: randomUUID(), amountCents: 2000 },
      "secretary",
      "POST",
    ),
    400,
  );
  const file = {
    kind: "receipt",
    fileName: "receipt.pdf",
    fileType: "application/pdf",
    fileData: "data:application/pdf;base64,JVBERi0xLjQK",
  };
  const upload = await write("/3/documents", file, "secretary", "POST");
  ok(upload, 201);
  ok(await get(`/3/documents/${upload.data.id}`, "technical_director"), 403);
  ok(await get(`/3/documents/${upload.data.id}`));
  ok(
    await get(`/3/documents/${upload.data.id}`, "secretary", { "x-club": "2" }),
    404,
  );
  ok(
    await write(
      `/expenses/${reimb.id}/pay`,
      {
        ...payment,
        id: randomUUID(),
        amountCents: 2000,
        documentId: upload.data.id,
      },
      "secretary",
      "POST",
    ),
    204,
  );
  const medical = await write(
    "/3/documents",
    { ...file, kind: "medical" },
    "secretary",
    "POST",
  );
  ok(medical, 201);
  const profile = {
    revision: 0,
    medicalFrom: "2026-09-01",
    medicalUntil: "2027-09-01",
    medicalDocumentId: medical.data.id,
    notes: "Visita",
  };
  ok(await write("/3/profile", profile), 204);
  ok(await write("/3/profile", profile), 409);
  ok(await get(`/3/documents/${medical.data.id}`, "technical_director"));
  const attendance = {
    kind: "training",
    eventId: 800,
    records: [{ userId: 3, status: "present", notes: "", revision: 0 }],
  };
  ok(await write("/attendance", attendance, "sporting_director"), 204);
  ok(await write("/attendance", attendance), 409);
  ok(await write("/attendance", { ...attendance, eventId: 801 }), 404);
  ok(
    await write("/attendance", {
      ...attendance,
      records: [...attendance.records, ...attendance.records],
    }),
    400,
  );
  ok(
    await write("/attendance", {
      ...attendance,
      records: [
        { userId: 3, status: null, notes: "Da verificare", revision: 1 },
      ],
    }),
    204,
  );
  const register = await get(
    "/attendance?from=2026-11-01&through=2026-11-30&teamId=11",
    "technical_director",
  );
  ok(register);
  assert.equal(register.data.members.filter((m) => m.id === 3).length, 1);
  assert.equal(register.data.records.find((r) => r.userId === 3).status, null);
  assert.equal(register.data.records.find((r) => r.userId === 3).revision, 2);
  ok(
    await write("/attendance", {
      kind: "match",
      eventId: 501,
      records: [
        { userId: 3, status: "present", notes: "Partita", revision: 0 },
      ],
    }),
    204,
  );
  // KIT requests reserve and deliver the same shared stock as player requests.
  ok(await get("/kit-catalog"));
  await pg.exec(
    `INSERT INTO warehouse_items(id,club_id,name,code,section,category,size,is_active,quantity_available,quantity_reserved,kit_slots) VALUES(900,1,'Polo rappresentanza','MEM-POLO','apparel','rappresentanza','M',1,1,0,'["rep_polo"]'::jsonb),(901,1,'Maglia gara','MEM-GARA','apparel','gara','M',1,10,0,'["match_shirt"]'::jsonb)`,
  );
  ok(
    await write(
      "/3/kit/rep_polo",
      { itemId: 900, quantity: 2, revision: 0 },
      "admin",
    ),
    403,
  );
  ok(
    await write("/3/kit/match_shirt", {
      itemId: 901,
      quantity: 1,
      revision: 0,
    }),
    403,
  );
  ok(
    await write("/5/kit/rep_polo", { itemId: 900, quantity: 1, revision: 0 }),
    403,
  );
  ok(
    await write("/3/kit/rep_polo", { itemId: 900, quantity: 2, revision: 0 }),
    204,
  );
  ok(
    await write(
      "/3/kit/rep_polo/request",
      { revision: 1 },
      "secretary",
      "POST",
    ),
    204,
  );
  ok(
    await write(
      "/3/kit/rep_polo/request",
      { revision: 1 },
      "secretary",
      "POST",
    ),
    204,
  );
  let kit = (await get("/3/kit")).data;
  assert.equal(kit.requests.length, 2);
  const stock = async () =>
    (
      await pg.query(
        "SELECT quantity_available AS available,quantity_reserved AS reserved FROM warehouse_items WHERE id=900",
      )
    ).rows[0];
  assert.deepEqual(await stock(), { available: 1, reserved: 1 });
  const reserved = kit.requests.find((r) => r.status === "reserved"),
    pending = kit.requests.find((r) => r.status === "pending");
  ok(
    await write(
      `/kit-requests/${reserved.id}`,
      { status: "delivered" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  ok(
    await write(
      `/kit-requests/${reserved.id}`,
      { status: "delivered" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  assert.deepEqual(await stock(), { available: 0, reserved: 0 });
  ok(
    await write(
      `/kit-requests/${pending.id}`,
      { status: "ordered" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  ok(
    await write(
      `/kit-requests/${pending.id}`,
      { status: "arrived" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  assert.deepEqual(await stock(), { available: 1, reserved: 1 });
  ok(
    await write(
      `/kit-requests/${pending.id}`,
      { status: "delivered" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  assert.deepEqual(await stock(), { available: 0, reserved: 0 });
  ok(
    await write(
      "/3/kit/rep_polo/request",
      { revision: 1 },
      "secretary",
      "POST",
    ),
    204,
  );
  assert.equal((await get("/3/kit")).data.requests.length, 2);
  ok(await write("/3/kit/rep_polo/new-cycle", {}, "secretary", "POST"), 204);
  ok(
    await write(
      "/3/kit/rep_polo/request",
      { revision: 1 },
      "secretary",
      "POST",
    ),
    204,
  );
  const newPending = (await get("/3/kit")).data.requests.find(
    (r) => !r.archived && r.status === "pending",
  );
  ok(
    await write(
      `/kit-requests/${newPending.id}`,
      { status: "canceled" },
      "secretary",
      "PATCH",
    ),
    204,
  );
  assert.deepEqual(await stock(), { available: 0, reserved: 0 });
  assert(
    (await pg.query("SELECT count(*)::int AS n FROM member_service_audit"))
      .rows[0].n > 15,
  );
  console.log(
    "PASS member services: access, privacy, contracts, cents/FM, partial/idempotent payments, documents, attendance revisions and shared KIT stock",
  );
};
