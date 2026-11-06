const assert = require("assert/strict"),
  fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  { createRequire } = require("module");
const root = path.resolve(__dirname, ".."),
  ts = require(path.join(root, "node_modules/typescript")),
  lib = path.join(root, "lib/api-zod/src");
function load(file) {
  const module = { exports: {} },
    req = createRequire(path.join(root, "lib/api-zod/package.json"));
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name.startsWith("./") ? load(path.join(lib, name + ".ts")) : req(name),
    },
  );
  return module.exports;
}
const {
  buildMatchRotationSummary: summary,
  parentPublicMatch,
  defaultRotationCapacity,
} = load(path.join(lib, "match-rotation-summary.ts"));
const own = { id: 101, firstName: "Own", lastName: "Child" },
  peer = { id: 102, firstName: "Peer", lastName: "Other" };
const plan = {
  secret: "Never return",
  periods: [
    {
      key: "t1",
      label: "Private peer note",
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
        id: "change",
        period: 2,
        minute: 6,
        outPlayerId: 101,
        inPlayerId: 102,
        notes: "Private note",
      },
    ],
  },
};
const parent = summary(plan, [own], 5),
  manager = summary(plan, [own, peer], 5);
assert.equal(parent.rows.length, 1);
assert.equal(parent.rows[0].playerId, 101);
assert.equal(parent.rows[0].actualMinutes, 18);
assert.equal(manager.rows[1].actualMinutes, 30);
assert.equal(parent.rows[0].plannedMinutes, 18);
assert.equal(parent.rows[0].plannedPeriods, 1.5);
assert.deepEqual(
  Array.from(parent.units, (u) => u.label),
  ["1° tempo", "2° tempo", "3A", "3B"],
);
const json = JSON.stringify(parent);
for (const text of [
  "Other",
  "Peer",
  "102",
  "Private note",
  "Never return",
  "postMatchReport",
  "lineupPlayerIds",
])
  assert.ok(!json.includes(text), "Private data excluded: " + text);
const missing = summary({ ...plan, postMatchReport: undefined }, [own], 5);
assert.equal(missing.rows[0].actualMinutes, null);
assert.equal(missing.hasReport, false);
const zero = summary(
  {
    ...plan,
    postMatchReport: {
      version: 1,
      goals: [],
      substitutions: [],
      periods: [
        { minutes: 12, starters: [102] },
        { minutes: 12, starters: [102] },
        { minutes: 12, starters: [102] },
      ],
    },
  },
  [own],
  5,
);
assert.equal(zero.rows[0].actualMinutes, 0);
const full = {
  ...plan,
  periods: [
    ...plan.periods,
    { key: "t4", minutes: "12", lineupPlayerIds: [101], lineupStarterCount: 1 },
  ],
  postMatchReport: {
    version: 1,
    goals: [],
    substitutions: [],
    periods: [
      { minutes: 13, starters: [101] },
      { minutes: 12, starters: [] },
      { minutes: 13, starters: [101] },
      { minutes: 12, starters: [101] },
    ],
  },
};
assert.equal(
  summary(full, [own], 5).rows[0].actualMinutes,
  38,
  "Recovery minutes counted for unsplit third",
);
assert.equal(summary(full, [own], 5).units.length, 4);
const publicMatch = parentPublicMatch({
  id: 1,
  opponent: "Public club",
  matchPlan: plan,
  notes: "Public note [FTB_MATCH_PLAN]" + JSON.stringify(plan),
});
assert.equal(publicMatch.matchPlan, undefined);
assert.equal(publicMatch.notes, "Public note");
assert.equal(defaultRotationCapacity("Esordienti", "", "scuola_calcio"), 9);
assert.equal(defaultRotationCapacity("Pulcini", "", "scuola_calcio"), 7);
assert.equal(defaultRotationCapacity("Piccoli Amici", "", "scuola_calcio"), 3);
assert.equal(defaultRotationCapacity("Allievi", "", "settore_giovanile"), 11);
console.log(
  "PASS rotation views: own-child-only projection, all authorized rows, actual/planned distinction, split/full third, recovery minutes, missing versus zero, private notes and raw plan excluded, category capacities.",
);


const {matchPreparationStatus:preparation} = load(path.join(lib,'match-rotation-summary.ts'));
assert.equal(preparation(null),'empty');
assert.equal(preparation({periods:[],convocationPlace:'Campo'}),'partial');
const prepared={convocationAt:'2026-11-07T14:15:00Z',convocationPlace:'Campo',periods:[{key:'t1',format:'5v5',minutes:'12',lineupPlayerIds:[1,2,3,4,5,6,7,8],lineupStarterCount:5},{key:'t2',format:'5v5',minutes:'12',lineupPlayerIds:[4,5,6,7,8,1,2,3],lineupStarterCount:5},{key:'t3',format:'5v5',minutes:'12',lineupPlayerIds:[1,2,3,6,7,4,5,8],lineupStarterCount:5,secondPart:{format:'5v5',lineupPlayerIds:[1,2,3,6,8,4,5,7],lineupStarterCount:5}}]};
assert.equal(preparation(prepared,5),'complete');
assert.equal(preparation({...prepared,convocationAt:'invalid'},5),'partial');
assert.equal(preparation({...prepared,periods:prepared.periods.map(p=>p.key==='t3'?{...p,secondPart:undefined}:p)},5),'partial');
assert.equal(preparation({...prepared,convocationPlace:''},5),'partial');
const publicPrepared=parentPublicMatch({matchPlan:prepared,notes:'Public'},5);
assert.equal(publicPrepared.preparationStatus,'complete');
assert.equal(publicPrepared.matchPlan,undefined);
assert.ok(!JSON.stringify(publicPrepared).includes('lineupPlayerIds'));
console.log('PASS preparation state: independent of date/results, incomplete third/ritrovo detected, public enum without technical data.');
