// Real HTTP handlers and isolated PostgreSQL. Synthetic data only.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const root = path.resolve(__dirname, ".."),
  web = createRequire(
    path.join(root, "artifacts/football-training-board/package.json"),
  ),
  api = createRequire(path.join(root, "artifacts/api-server/package.json"));
(async () => {
  const { PGlite } = require("@electric-sql/pglite"),
    pg = new PGlite();
  let server;
  try {
    globalThis.warehouseFinanceTest = pg;
    const dir = path.join(root, ".tools/warehouse-test");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "db.ts"),
      `import {drizzle} from 'drizzle-orm/pglite';export const db=drizzle((globalThis as any).warehouseFinanceTest);export * from '../../lib/db/src/schema';`,
    );
    fs.writeFileSync(
      path.join(dir, "auth.ts"),
      `export const requireAuth=(req:any,res:any,next:any)=>req.session?.userId?next():res.sendStatus(401);`,
    );
    fs.writeFileSync(
      path.join(dir, "entry.ts"),
      `export {default as router} from '../../artifacts/api-server/src/routes/warehouse-finance';export {warehouseStatistics,weightedModes,warehouseExpenseData} from '../../artifacts/football-training-board/src/lib/warehouse-analysis';export {memberExpenseMovements} from '../../artifacts/football-training-board/src/lib/member-expense-chart';export {reconcileExpenses} from '../../lib/api-zod/src/financial-reconciliation';export {financialExportSheets} from '../../artifacts/football-training-board/src/lib/financial-reconciliation';export {auditClubData} from '../../artifacts/api-server/src/lib/club-data-audit';export {clubBackup} from '../../artifacts/api-server/src/lib/club-backup';`,
    );
    await createRequire(web.resolve("vite"))("esbuild").build({
      entryPoints: [path.join(dir, "entry.ts")],
      outfile: path.join(dir, "bundle.cjs"),
      bundle: true,
      platform: "node",
      format: "cjs",
      nodePaths: [
        path.join(root, "lib/db/node_modules"),
        path.join(root, "lib/api-zod/node_modules"),
        path.join(root, "artifacts/api-server/node_modules"),
      ],
      plugins: [
        {
          name: "test-db",
          setup(b) {
            b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
              path: path.join(dir, "db.ts"),
            }));
            b.onResolve({ filter: /\/lib\/auth$/ }, () => ({
              path: path.join(dir, "auth.ts"),
            }));
          },
        },
      ],
    });
    const mod = require(path.join(dir, "bundle.cjs"));
    await pg.exec(
      `CREATE TABLE clubs(id integer PRIMARY KEY);CREATE TABLE users(id integer PRIMARY KEY);CREATE TABLE players(id integer PRIMARY KEY,club_id integer REFERENCES clubs(id),is_test boolean);CREATE TABLE warehouse_items(id integer PRIMARY KEY,club_id integer REFERENCES clubs(id),name text,code text,size text,section text,price real,quantity_available integer,quantity_reserved integer,updated_at timestamptz);CREATE TABLE player_payments(id integer PRIMARY KEY,club_id integer REFERENCES clubs(id),status text,amount real,payment_date date,player_id integer REFERENCES players(id));CREATE TABLE player_payment_kit_items(payment_id integer REFERENCES player_payments(id),article jsonb);INSERT INTO clubs VALUES(1),(2);INSERT INTO users VALUES(1);INSERT INTO warehouse_items VALUES(1,1,'Tuta','T1','M','apparel',45,10,2,now()),(2,2,'Tuta altra società','T2','L','apparel',90,12,0,now());`,
    );
    const express = api("express"),
      app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = {
        userId: 1,
        clubId: Number(req.headers["x-club"] ?? 1),
        role: req.headers["x-role"] ?? "secretary",
      };
      next();
    });
    app.use("/api", mod.router);
    app.use((e, _req, res, _next) =>
      res.status(500).json({ error: e.message }),
    );
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api/warehouse-finance`;
    const call = async (path = "", body, headers = {}) => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, data: await r.json() };
    };
    for (const role of [
      "parent",
      "coach",
      "fitness_coach",
      "athletic_director",
      "technical_director",
      "sporting_director",
      "team_manager",
    ])
      assert.equal((await call("", undefined, { "x-role": role })).status, 403);
    const purchase = {
      id: crypto.randomUUID(),
      itemId: 1,
      quantity: 3,
      unitCents: 1500,
      purchaseDate: "2026-11-01",
      dueDate: "2026-12-31",
      supplier: "Fornitore di prova",
      reference: "DOC-TEST",
      loadStock: true,
    };
    for (const role of ["admin", "presidente", "director"])
      assert.equal(
        (await call("/purchases", purchase, { "x-role": role })).status,
        403,
      );
    for (const change of [
      { quantity: -1 },
      { unitCents: 1.5 },
      { purchaseDate: "2026-02-30" },
      { dueDate: "2026-10-31" },
      { quantity: 2147483647 },
      { reference: "" },
    ])
      assert.equal(
        (await call("/purchases", { ...purchase, ...change })).status,
        400,
      );
    assert.equal(
      (await call("/purchases", purchase, { "x-club": "2" })).status,
      400,
    );
    const saved = await call("/purchases", purchase);
    assert.equal(saved.status, 201, JSON.stringify(saved));
    assert.equal(
      (await call("/purchases", purchase)).status,
      201,
      "retry must be idempotent",
    );
    assert.equal(
      (
        await pg.query(
          "SELECT quantity_available FROM warehouse_items WHERE id=1",
        )
      ).rows[0].quantity_available,
      13,
    );
    assert.equal(
      (await call("/purchases", { ...purchase, quantity: 9 })).status,
      400,
    );
    const receipt = {
      id: crypto.randomUUID(),
      purchaseId: purchase.id,
      amountCents: 1000,
      paidDate: "2026-11-02",
      method: "bank_transfer",
    };
    assert.equal(
      (await call("/receipts", receipt, { "x-club": "2" })).status,
      400,
    );
    assert.equal(
      (await call("/receipts", { ...receipt, paidDate: "2026-10-31" })).status,
      400,
    );
    assert.equal((await call("/receipts", receipt)).status, 201);
    assert.equal(
      (await call("/receipts", receipt)).status,
      201,
      "receipt retry must be idempotent",
    );
    assert.equal(
      (
        await call("/receipts", {
          ...receipt,
          id: crypto.randomUUID(),
          amountCents: 3501,
        })
      ).status,
      400,
      "overpayment blocked",
    );
    const expense = (await call()).data;
    assert.equal(expense.purchases.length, 1);
    assert.equal(expense.purchases[0].paidCents, 1000);
    assert.equal(expense.receipts.length, 1);
    assert.equal(
      (await call("", undefined, { "x-club": "2" })).data.purchases.length,
      0,
    );
    const audit = mod.reconcileExpenses(
      mod.warehouseExpenseData(expense),
      "KIT",
    );
    assert.equal(audit.due, 4500);
    assert.equal(audit.paid, 1000);
    assert.equal(audit.residual, 3500);
    assert.equal(audit.balanced, true);
    assert.deepEqual(audit.issues, []);
    const movements = mod.memberExpenseMovements(
      mod.warehouseExpenseData(expense),
      "",
      "2026-11-27",
    );
    assert.equal(
      movements
        .filter((r) => r.key === "memberPaid")
        .reduce((n, r) => n + r.amount, 0),
      1000,
    );
    assert.equal(
      movements
        .filter((r) => r.key === "memberPending")
        .reduce((n, r) => n + r.amount, 0),
      3500,
    );
    assert.equal(
      mod
        .financialExportSheets(
          [],
          undefined,
          undefined,
          "2026-11-27",
          mod.warehouseExpenseData(expense),
        )
        .find((s) => s.name === "Fornitori KIT rate").rows[0].Dovuto,
      45,
    );
    assert.equal(
      (
        await call("/purchases", {
          ...purchase,
          id: crypto.randomUUID(),
          loadStock: false,
          reference: "DOC-2",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await pg.query(
          "SELECT quantity_available FROM warehouse_items WHERE id=1",
        )
      ).rows[0].quantity_available,
      13,
      "already registered arrivals do not load twice",
    );
    const analysis = await call("/analysis");
    assert.equal(analysis.status, 200, JSON.stringify(analysis));
    assert.equal(analysis.data.items.length, 1);
    assert.equal(analysis.data.items[0].unitCents, 1500);
    const source = {
      ...analysis.data,
      requests: [{ itemId: 1, quantity: 3, date: "2026-11-01" }],
      sales: [
        {
          id: 1,
          date: "2026-11-01",
          status: "paid",
          article: { id: 1, name: "Tuta", size: "M", quantity: 2 },
        },
        {
          id: 2,
          date: "2026-11-02",
          status: "paid",
          article: { id: 1, name: "Tuta", size: "L", quantity: 2 },
        },
        {
          id: 3,
          date: "2027-01-02",
          status: "pending",
          article: { id: 1, name: "Tuta", size: "XL", quantity: 99 },
        },
      ],
    };
    const stats = mod.warehouseStatistics(source, "2026-11-01", "2026-11-30");
    assert.equal(stats.sold, 4);
    assert.equal(stats.purchased, 6);
    assert.deepEqual(mod.weightedModes(stats.groups[0].sold), [
      { value: "M", quantity: 2 },
      { value: "L", quantity: 2 },
    ]);
    assert.deepEqual(
      mod.warehouseStatistics(source, "2027-01-01", "2027-12-31").mostSold,
      [],
    );
    const client = {
      query: async (text, params) => {
        const r = await pg.query(text, params);
        return { ...r, rowCount: r.rows.length };
      },
    };
    const chunks = [];
    for await (const chunk of mod.clubBackup(client, 1)) chunks.push(chunk);
    const report = await mod.auditClubData(
      (async function* () {
        yield* chunks;
      })(),
      1,
      "2026-11-27",
    );
    assert.equal(report.warehouse.due, 9000);
    assert.equal(report.warehouse.paid, 1000);
    assert.equal(report.warehouse.balanced, true);
    assert.equal(report.references.missing, 0);
    console.log(
      "PASS warehouse finance: permissions, club isolation, validation, atomic stock, idempotency, partial payments, overpayment, modes, periods, cash chart, Excel and full backup audit.",
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pg.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
