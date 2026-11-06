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
      require: (n) =>
        n.startsWith("./") ? load(path.join(lib, n + ".ts")) : req(n),
    },
  );
  return module.exports;
}
const org = load(path.join(lib, "station-organization.ts")),
  rot = load(path.join(lib, "training-rotations.ts")),
  mat = load(path.join(lib, "exercise-board-materials.ts")),
  board = load(path.join(lib, "exercise-board-roster.ts"));
const plain = (v) => JSON.parse(JSON.stringify(v));
const acts = [
  { id: 1, phase: "iniziale", seconds: 900, playerIds: [1, 2, 3, 4] },
  { id: 2, phase: "iniziale", seconds: 900, playerIds: [1, 2, 3, 4] },
  { id: 3, phase: "iniziale", seconds: 1200, playerIds: [1, 2, 3, 4] },
];
let plan = org.reconcileStationOrganization(undefined, acts);
assert.equal(rot.rotationSeconds(plan), 3000);
assert.equal(rot.validateTrainingRotations(plan, acts, [1, 2, 3, 4]), null);
plan.iniziale = org.associateStation(plan.iniziale, 2, 1, true);
assert.equal(rot.rotationSeconds(plan), 3000);
assert.equal(rot.validateTrainingRotations(plan, acts, [1, 2, 3, 4]), null);
assert.equal(
  new Set(plan.iniziale[0].stations.flatMap((s) => s.playerIds)).size,
  4,
);
assert.deepEqual(
  plain(org.firstStationAssignment(plan, 3).playerIds),
  [1, 2, 3, 4],
);
plan.iniziale = org.rotateStationGroup(plan.iniziale, 1);
assert.equal(rot.rotationSeconds(plan), 3000);
assert.deepEqual(
  plain(plan.iniziale[1].stations[0].playerIds),
  plain(plan.iniziale[0].stations[1].playerIds),
);
plan.iniziale[0].recoverySeconds = 300;
assert.equal(rot.rotationPhaseSeconds(plan, "iniziale"), 3300);
plan.iniziale = org.assignStationPlayers(plan.iniziale, 1, [1, 3, 4]);
assert.equal(rot.validateTrainingRotations(plan, acts, [1, 2, 3, 4]), null);
assert.deepEqual(plain(plan.iniziale[1].stations[1].playerIds), [1, 3, 4]);
const independent = JSON.stringify(plan.iniziale.at(-1));
const separated = org.associateStation(plan.iniziale, 2, 1, false);
assert.equal(JSON.stringify(separated.at(-1)), independent);
assert.equal(org.stationGroups(separated).length, 3);
const saved = plain(plan),
  sources = org.stationSources(acts),
  changed = acts.map((a) =>
    a.id === 1 ? { ...a, seconds: 600, playerIds: [2] } : a,
  );
const reconciled = org.reconcileStationOrganization(saved, changed, sources);
assert.equal(org.firstStationAssignment(reconciled, 1).seconds, 600);
assert.equal(org.firstStationAssignment(reconciled, 2).seconds, 600);
assert.deepEqual(
  plain(org.firstStationAssignment(reconciled, 1).playerIds),
  [2],
);
assert.deepEqual(
  plain(org.reconcileStationOrganization(plan, acts)),
  plain(plan),
);
const removed = org.reconcileStationOrganization(
  plan,
  acts.filter((a) => a.id !== 2),
);
assert.ok(
  !removed.iniziale.some((t) => t.stations.some((s) => s.linkId === 2)),
);
const added = org.reconcileStationOrganization(plan, [
  ...acts,
  { id: 4, phase: "centrale", seconds: 0, playerIds: [] },
]);
assert.equal(org.firstStationAssignment(added, 4).seconds, 900);
assert.deepEqual(
  plain(
    org.sessionMaterialQuantities(plan, {
      1: { coni: 3 },
      2: { coni: 5 },
      3: { coni: 6, palloni: 2 },
    }),
  ),
  { coni: 8, palloni: 2 },
);
const scene = (els) => JSON.stringify({ data: { elements: els } }),
  cones = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: "c" + i, type: "cone" }));
let equipment = mat.mergeBoardMaterials("note manuali", scene(cones(4)));
assert.equal(mat.materialNotes(equipment), "note manuali");
assert.equal(mat.readMaterialSelection(equipment).coni, 4);
equipment = mat.writeMaterialSelection(
  mat.readMaterialSelection(equipment),
  equipment,
);
equipment = mat.mergeBoardMaterials(equipment, scene(cones(2)));
assert.equal(mat.readMaterialSelection(equipment).coni, 2);
equipment = mat.writeMaterialSelection({ coni: 7, palloni: 3 }, equipment);
equipment = mat.mergeBoardMaterials(equipment, scene([]));
assert.deepEqual(plain(mat.readMaterialSelection(equipment)), {
  coni: 7,
  palloni: 3,
});
assert.equal(mat.mergeBoardMaterials(equipment, "invalid"), equipment);
assert.equal(
  mat.boardMaterialQuantities(
    JSON.stringify({
      data: {
        elements: cones(2),
        animation: { frames: [{ elements: cones(5) }, { elements: cones(3) }] },
      },
    }),
  ).coni,
  5,
);
const raw = JSON.stringify({
  data: {
    elements: [
      { id: "p", type: "player", playerId: "1", x: 25, y: 35 },
      { id: "o", type: "opponent", playerId: 999 },
      ...cones(2),
    ],
    animation: {
      frames: [
        { elements: [{ id: "p", type: "player", playerId: 1, x: 40, y: 45 }] },
        { elements: [] },
      ],
    },
  },
});
const projected = JSON.parse(
  board.syncExerciseBoardRoster(
    raw,
    [2],
    [{ id: 2, firstName: "Due", lastName: "Test" }],
  ),
);
assert.deepEqual(plain(board.boardPlayerIds(JSON.stringify(projected))), [2]);
assert.equal(projected.data.elements.find((e) => e.id === "p").x, 25);
assert.equal(
  projected.data.elements.filter((e) => e.type === "cone").length,
  2,
);
assert.equal(projected.data.animation.frames[0].elements[0].x, 40);
const retained = JSON.parse(board.syncExerciseBoardRoster(raw, [1]));
assert.equal(retained.data.animation.frames[1].elements.length, 0);
assert.equal(board.syncExerciseBoardRoster("legacy", [1]), "legacy");
console.log(
  "PASS: stations independent/associated, derived rotations, source changes, legacy preservation, material peak/provenance and board roster synchronization",
);

// Full rotation is now created at association time, with manual exceptions preserved.
const activities = [1, 2, 3, 4, 5, 6].map((id, i) => ({
  id,
  phase: i < 2 ? "iniziale" : i < 4 ? "centrale" : "finale",
  seconds: 900,
  playerIds: id % 2 ? [1, 2, 3, 4] : [5, 6, 7],
}));
let linked = org.reconcileStationOrganization(undefined, activities);
for (const phase of ["iniziale", "centrale", "finale"]) {
  const ids = activities.filter((a) => a.phase === phase).map((a) => a.id);
  linked[phase] = org.associateStation(linked[phase], ids[1], ids[0], true);
}
assert.equal(rot.rotationSeconds(linked), 5400);
assert.equal(linked.iniziale.length, 2);
linked = org.inheritPreviousStationGroups(linked, "centrale", 3);
linked = org.inheritPreviousStationGroups(linked, "finale", 5);
assert.deepEqual(plain(linked.centrale[0].stations[0].playerIds), [1, 2, 3, 4]);
assert.deepEqual(plain(linked.centrale[1].stations[0].playerIds), [5, 6, 7]);
linked.iniziale = org.repeatStationPlayers(linked.iniziale, 1, 1, [1]);
linked = org.prepareStationOrganization(linked);
assert.deepEqual(plain(linked.iniziale[1].stations[0].playerIds), [5, 6, 7, 1]);
assert.ok(!linked.iniziale[1].stations[1].playerIds.includes(1));
assert.equal(rot.rotationSeconds(linked), 5400);
linked = org.copyStationPassToFollowing(linked, "iniziale", 1, 1);
assert.deepEqual(plain(linked.centrale[1].stations[0].playerIds), [5, 6, 7, 1]);
assert.equal(
  rot.validateTrainingRotations(linked, activities, [1, 2, 3, 4, 5, 6, 7]),
  null,
);
linked.iniziale = org.assignStationPlayers(linked.iniziale, 1, [1, 2, 3]);
assert.ok(
  linked.iniziale[1].stations[0].playerIds.includes(1),
  "Manual repetition survives edits to starting groups",
);
linked.iniziale = org.addStationPass(linked.iniziale, 1);
assert.equal(rot.rotationSeconds(linked), 6300);
const slot = linked.iniziale[0].stations[0];
slot.boardJson = JSON.stringify({
  data: {
    elements: slot.playerIds.map((id) => ({
      type: "player",
      playerId: id,
      x: 20,
      y: 30,
    })),
    animation: {
      frames: [
        {
          elements: slot.playerIds.map((id) => ({
            type: "player",
            playerId: id,
          })),
        },
      ],
    },
  },
});
slot.boardPreview = "data:image/png;base64,test";
const attendance = load(path.join(lib, "training-attendance.ts"));
const filtered = attendance.excludeTrainingPlayers(linked, [1]);
assert.ok(
  !board.boardPlayerIds(filtered.iniziale[0].stations[0].boardJson).includes(1),
);
assert.equal(filtered.iniziale[0].stations[0].boardPreview, undefined);
const jsonSaved = JSON.parse(JSON.stringify(linked));
assert.equal(jsonSaved.iniziale[0].stations[0].boardJson, slot.boardJson);
assert.ok(jsonSaved.centrale[0].groupSource);
console.log(
  "PASS: automatic complete cycle, unequal groups, repeat without extra minutes, explicit cross-phase exceptions, starting-order inheritance, extra passage, saved board context and attendance filtering across frames",
);

const oldSingle={iniziale:[{id:'old',stations:[{linkId:1,seconds:900,playerIds:[1,2]},{linkId:2,seconds:900,playerIds:[3,4]}],recoverySeconds:300},{id:'after',stations:[{linkId:3,seconds:1200,playerIds:[1,2,3,4]}],recoverySeconds:0}]};
const oldCopy=JSON.stringify(oldSingle),completed=org.reconcileStationOrganization(oldSingle,acts);assert.equal(completed.iniziale.length,3);assert.equal(rot.rotationSeconds(completed),3000);assert.equal(completed.iniziale[0].recoverySeconds,0);assert.equal(completed.iniziale[1].recoverySeconds,300);assert.equal(JSON.stringify(oldSingle),oldCopy);
console.log('PASS: previously saved single passage completed without mutating storage or losing the recovery before the next independent station');
