const assert = require("node:assert/strict"),
  path = require("node:path"),
  fs = require("node:fs"),
  { createRequire, Module } = require("node:module");
const root = path.resolve(__dirname, ".."),
  web = createRequire(
    path.join(root, "artifacts/football-training-board/package.json"),
  ),
  out = path.join(root, ".tools/financial-reconciliation.cjs");
fs.mkdirSync(path.dirname(out), { recursive: true });
createRequire(web.resolve("vite"))("esbuild").buildSync({
  entryPoints: [
    path.join(
      root,
      "artifacts/football-training-board/src/lib/financial-reconciliation.ts",
    ),
  ],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  alias: {"@workspace/api-zod":path.join(root,"lib/api-zod/src/financial-reconciliation.ts")},
});
const m = new Module(out, module);
m.filename = out;
m.paths = module.paths;
m._compile(fs.readFileSync(out, "utf8"), out);
const { reconcileIncome, reconcileExpenses } = m.exports;
const rows = [
  {
    id: 1,
    playerId: 1,
    amount: 190,
    status: "paid",
    paymentDate: "2026-09-15",
    paymentMethod: "cash",
  },
  { id: 2, playerId: 1, amount: 180, status: "pending", dueDate: "2027-01-30" },
  { id: 3, playerId: 1, amount: 25, status: "pending", dueDate: "2026-09-15" },
];
let a = reconcileIncome(rows, "2026-11-21");
assert.deepEqual(
  [a.registered, a.paid, a.residual, a.pending, a.overdue, a.balanced],
  [39500, 19000, 20500, 18000, 2500, true],
);
assert.equal(a.issues.length, 0);
a = reconcileIncome([...rows, { ...rows[0], id: 4 }, rows[0]], "2026-11-21");
assert(a.issues.some((x) => x.message.includes("Possibile duplicato")));
assert(a.issues.some((x) => x.message.includes("ID ripetuto")));
assert.equal(a.registered, 58500);
a = reconcileIncome(
  [
    { id: 1, playerId: 1, amount: 0.1, status: "paid" },
    { id: 2, playerId: 1, amount: 0.2, status: "pending" },
    { id: 3, playerId: 1, amount: NaN, status: "pending" },
  ],
  "2026-11-21",
);
assert.equal(a.registered, 30);
assert.equal(a.issues.length, 4);
const details = {
  allocations: [
    { teamId: 1, amountCents: 6000 },
    { teamId: 2, amountCents: 4000 },
  ],
};
const expenses = {
  dues: [{ id: 1, amountCents: 10000, paidCents: 3000, details }],
  receipts: [
    { id: "r1", dueId: 1, amountCents: 1000 },
    { id: "r2", dueId: 1, amountCents: 2000 },
  ],
};
let e = reconcileExpenses(expenses, "Membri");
assert.deepEqual(
  [e.due, e.paid, e.residual, e.balanced, e.issues.length],
  [10000, 3000, 7000, true, 0],
);
e = reconcileExpenses(
  { ...expenses, dues: [{ ...expenses.dues[0], paidCents: 12000 }] },
  "Membri",
);
assert(!e.balanced);
assert(e.issues.some((x) => x.message.includes("superiori")));
assert(e.issues.some((x) => x.message.includes("ricevute")));
e = reconcileExpenses(
  {
    ...expenses,
    dues: [
      {
        ...expenses.dues[0],
        details: { allocations: [{ teamId: 1, amountCents: 9000 }] },
      },
    ],
  },
  "Membri",
);
assert(e.issues.some((x) => x.message.includes("Ripartizione")));
for (let seed = 1; seed <= 100; seed++) {
  let expected = 0;
  const random = Array.from({ length: 31 }, (_, i) => {
    const cents = (seed * 53 + i * 97) % 10000;
    expected += cents;
    return {
      id: i,
      playerId: seed,
      amount: cents / 100,
      status: i % 3 ? "pending" : "paid",
      dueDate: i % 2 ? "2027-01-01" : "2020-01-01",
      paymentDate: "2026-01-01",
      paymentMethod: "cash",
    };
  });
  const r = reconcileIncome(random, "2026-11-21");
  assert.equal(r.registered, expected);
  assert.equal(r.registered, r.paid + r.pending + r.overdue);
}
console.log(
  "PASS financial reconciliation: cents, 100 mixed ledgers, duplicate warnings, missing data, receipts, overpayments and allocations",
);
