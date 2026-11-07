// Executes the actual rotation helpers and the existing normalizers, with no DB/session access.
const fs = require("fs"),
  path = require("path"),
  vm = require("vm"),
  assert = require("assert/strict"),
  { createRequire } = require("module");
const root = process.env.FTB_TEST_ROOT || path.resolve(__dirname, "..");
const ts = require(path.join(root, "node_modules/typescript"));
const lib = path.join(root, "artifacts/football-training-board/src/lib");
function load(file, extra = {}) {
  const module = { exports: {} };
  const localRequire = createRequire(file);
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name === "./match-lineup"
          ? load(path.join(lib, "match-lineup.ts"))
          : localRequire(name),
      ...extra,
    },
  );
  return module.exports;
}
function extract(file, names, extra = {}) {
  const text = fs.readFileSync(file, "utf8"),
    ast = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  const source =
    ast.statements
      .filter(
        (n) => ts.isFunctionDeclaration(n) && names.includes(n.name?.text),
      )
      .map((n) => n.getText(ast))
      .join("\n") +
    "\nmodule.exports={" +
    names.join(",") +
    "};";
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    { module, exports: module.exports, ...extra },
  );
  return module.exports;
}
const rotation = load(path.join(lib, "match-period-rotation.ts"));
const actual = extract(
  path.join(
    root,
    "artifacts/football-training-board/src/pages/calendari/TeamCalendar.tsx",
  ),
  ["defaultPeriodsForTeam", "ensurePlanPeriods", "copyLineupAlternative"],
  { periodMinutes: rotation.periodMinutes },
);
const backend = extract(
  path.join(root, "artifacts/api-server/src/routes/matches.ts"),
  ["normalizeMatchPlan", "preserveMatchReport"],
);
const zodReq = createRequire(path.join(root, "lib/api-zod/package.json"));
const reportFile = path.join(root, "lib/api-zod/src/match-report.ts");
const reportModule = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(reportFile, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText,
  { module: reportModule, exports: reportModule.exports, require: zodReq },
);
const json = (x) => JSON.parse(JSON.stringify(x)),
  same = (a, b, message) => assert.deepEqual(json(a), json(b), message);
const defaults = actual.defaultPeriodsForTeam(
  "scuola_calcio",
  "Primi Calci",
  "",
);
const saved = {
  fourthTime: true,
  periods: [
    ...defaults.map((p, i) => ({
      ...p,
      minutes: i === 0 ? "18" : p.minutes,
      lineupPlayerIds: [i + 1],
    })),
    {
      key: "t4",
      label: "4° tempo",
      minutes: "17",
      module: "2-2",
      lineupPlayerIds: [8, 9],
      lineupStarterCount: 1,
      lineupPositions: { 8: { x: 25, y: 50 } },
      lineupDrawings: [],
      lineupAlternatives: [
        {
          id: "alt",
          title: "Alternativa",
          module: "2-2",
          lineupPlayerIds: [9, 8],
          lineupStarterCount: 1,
          lineupPositions: { 9: { x: 40, y: 50 } },
          lineupDrawings: [],
        },
      ],
    },
  ],
};
let reopened = actual.ensurePlanPeriods(json(saved), defaults);
assert.equal(reopened.periods.length, 4);
assert.equal(reopened.periods[0].minutes, "18");
assert.equal(reopened.periods[3].minutes, "17");
same(reopened.periods[3].lineupPlayerIds, [8, 9]);
same(reopened.periods[3].lineupPositions, saved.periods[3].lineupPositions);
same(
  reopened.periods[3].lineupAlternatives,
  saved.periods[3].lineupAlternatives,
);
const selected = new Set(Array.from({ length: 10 }, (_, i) => i + 1)),
  limit = () => 5;
const initial = defaults.map((p, i) => ({
  ...p,
  ...(i === 0 ? { lineupPlayerIds: [...selected], lineupStarterCount: 5 } : {}),
}));
const three = rotation.rotateMatchPeriods(initial, selected, limit);
const units = rotation.rotationUnits(three);
same(
  units.map((u) => u.minutes),
  [12, 12, 6, 6],
);
same(
  units.map((u) => u.period.lineupPlayerIds.slice(0, 5)),
  [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
  ],
);
const totals = rotation.plannedPlayerMinutes(three, selected, limit);
assert.ok(Object.values(totals).every((value) => value === 18));
assert.equal(
  Object.values(totals).reduce((a, b) => a + b, 0),
  180,
);
same(
  rotation.rotateMatchPeriods(three, selected, limit),
  three,
  "Repeated rotation is stable",
);
const linked = rotation.rotateMatchPeriods(
  initial.map((p) =>
    p.key === "t3"
      ? { ...p, boardId: 90, boardUrl: "/board/90", module: "2-2" }
      : p,
  ),
  selected,
  limit,
);
assert.equal(
  linked[2].secondPart.boardId,
  undefined,
  "Second part does not impersonate first-part board",
);
assert.equal(linked[2].secondPart.module, "2-2");
const custom = three.map((p) =>
  p.key === "t3" ? { ...p, thirdPartMinutes: 4 } : p,
);
same(
  rotation.rotationUnits(custom).map((u) => u.minutes),
  [12, 12, 4, 8],
);
const splitSaved = actual.ensurePlanPeriods(
  { periods: three, fourthTime: false },
  defaults,
);
same(splitSaved.periods[2].secondPart, three[2].secondPart);
let four = rotation.toggleFourthPeriod(
  { periods: three, fourthTime: false },
  true,
);
four = {
  ...four,
  periods: rotation.rotateMatchPeriods(four.periods, selected, limit),
};
same(
  rotation.rotationUnits(four.periods).map((u) => u.minutes),
  [12, 12, 12, 12],
);
assert.ok(
  Object.values(
    rotation.plannedPlayerMinutes(four.periods, selected, limit),
  ).every((v) => v === 24),
);
four.periods[3] = {
  ...four.periods[3],
  lineupPositions: { 6: { x: 25, y: 75 } },
};
const disabled = rotation.toggleFourthPeriod(four, false),
  enabled = rotation.toggleFourthPeriod(disabled, true);
same(
  enabled.periods[3],
  four.periods[3],
  "Disabling and enabling preserves t4",
);
same(
  disabled.periods[2].secondPart,
  three[2].secondPart,
  "Dormant split lineup retained",
);
const manual = three.map((p, i) =>
  i === 1
    ? {
        ...p,
        lineupPlayerIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        lineupStarterCount: 5,
        rotationAuto: false,
      }
    : p,
);
const kept = rotation.rotateMatchPeriods(manual, selected, limit);
same(
  kept[1].lineupPlayerIds.slice(0, 5),
  [1, 2, 3, 4, 5],
  "Manual selection protected",
);
const forced = rotation.rotateMatchPeriods(
  manual,
  selected,
  limit,
  new Set(),
  true,
);
same(forced[1].lineupPlayerIds.slice(0, 5), [6, 7, 8, 9, 10]);
const emptyBench = manual.map((p, i) =>
  i === 1 ? { ...p, lineupStarterCount: 0 } : p,
);
assert.equal(
  rotation.rotateMatchPeriods(emptyBench, selected, limit)[1]
    .lineupStarterCount,
  0,
  "Explicit empty field remains empty",
);
const removed = rotation.rotateMatchPeriods(
  three,
  new Set([...selected].filter((id) => id !== 8)),
  limit,
);
assert.ok(
  rotation
    .rotationUnits(removed)
    .every((u) => !u.period.lineupPlayerIds.includes(8)),
);
const keepers = rotation.rotateMatchPeriods(
  initial,
  selected,
  limit,
  new Set([1, 6]),
);
assert.ok(
  rotation
    .rotationUnits(keepers)
    .every(
      (u) =>
        u.period.lineupPlayerIds
          .slice(0, u.period.lineupStarterCount)
          .filter((id) => [1, 6].includes(id)).length === 1,
    ),
);
const odd = rotation.rotateMatchPeriods(
  initial.map((p, i) => (i ? { ...p, lineupPlayerIds: undefined } : p)),
  new Set([1, 2, 3, 4, 5, 6, 7]),
  limit,
);
const oddTotals = Object.values(
  rotation.plannedPlayerMinutes(odd, new Set([1, 2, 3, 4, 5, 6, 7]), limit),
);
assert.equal(
  oddTotals.reduce((a, b) => a + b, 0),
  180,
);
assert.ok(Math.max(...oddTotals) - Math.min(...oddTotals) <= 12);
const report = rotation.seedMatchReport(three, selected, limit);
assert.equal(report.periods.length, 3);
assert.equal(report.substitutions.length, 5);
assert.ok(report.substitutions.every((e) => e.period === 2 && e.minute === 6));
const analysis = reportModule.exports.analyseMatchReport(
  report,
  [...selected],
  5,
);
same(analysis.errors, []);
same(
  analysis.minutes,
  totals,
  "Actual report seeding agrees with planned minutes",
);
assert.equal(
  rotation.seedMatchReport(four.periods, selected, limit).substitutions.length,
  0,
);
const reported = { periods: three, fourthTime: false, postMatchReport: report };
const added = rotation.toggleFourthPeriod(reported, true);
assert.equal(added.postMatchReport.periods.length, 4);
same(added.postMatchReport.substitutions, report.substitutions);
same(rotation.toggleFourthPeriod(added, false).postMatchReport, report);
assert.throws(
  () =>
    rotation.toggleFourthPeriod(
      {
        ...added,
        postMatchReport: {
          ...added.postMatchReport,
          periods: added.postMatchReport.periods.map((p, i) =>
            i === 3 ? { ...p, starters: [1] } : p,
          ),
        },
      },
      false,
    ),
  /resoconto/,
);
const oldClient = {
  periods: three.map(({ secondPart, thirdPartMinutes, ...p }) => p),
};
backend.preserveMatchReport(oldClient, {
  periods: custom,
  fourthPeriodDraft: four.periods[3],
});
same(oldClient.periods[2].secondPart, custom[2].secondPart);
assert.equal(oldClient.periods[2].thirdPartMinutes, 4);
same(oldClient.fourthPeriodDraft, four.periods[3]);
const adult = actual.defaultPeriodsForTeam(
  "prima_squadra",
  "Prima squadra",
  "",
);
assert.equal(adult.length, 2);
assert.equal(
  actual.ensurePlanPeriods({ periods: adult }, adult).periods.length,
  2,
);
assert.equal(rotation.periodMinutes("15,5"), 15.5);
const reordered = actual.ensurePlanPeriods(
  { periods: [three[1], three[0], three[2]] },
  defaults,
);
same(
  reordered.periods.map((p) => p.key),
  ["t2", "t1", "t3"],
  "Saved order retained",
);
const formatSource = three.map((p) =>
  p.key === "t3" ? { ...p, module: "2-2", format: "5v5" } : p,
);
const formatFourth = rotation.toggleFourthPeriod(
  { periods: formatSource },
  true,
).periods[3];
assert.equal(formatFourth.module, "2-2");
assert.equal(formatFourth.format, "5v5");
console.log(
  "PASS match rotation: saved t4/minutes/positions/alternatives, split third, 4 full periods, unequal split, uneven rosters, keepers, manual overrides, roster removal, report minutes, protected completed reports, older clients, two-period legacy plans. No real data used.",
);


// Comparison cell locks must not turn the whole period manual.
const eight = new Set([1,2,3,4,5,6,7,8]);
let balanced = rotation.rotateMatchPeriods(initial, eight, limit);
const originalBalanced = json(balanced);
balanced = rotation.selectRotationCell(balanced, eight, limit, new Set(), 't2', 1, false);
assert.equal(balanced[1].rotationLocks[1], 'T');
assert.ok(balanced[1].lineupPlayerIds.slice(0,5).includes(1));
const balanceValues = Object.values(rotation.plannedPlayerMinutes(balanced,eight,limit));
assert.equal(Math.max(...balanceValues)-Math.min(...balanceValues),6,'8 children / 5 places / 36 min: best attainable 6 minute spread');
assert.equal(balanceValues.reduce((s,v)=>s+v,0),180);
assert.equal(originalBalanced[1].rotationLocks,undefined,'No mutation of input');
balanced = rotation.selectRotationCell(balanced,eight,limit,new Set(),'t3-second',8,false);
assert.equal(balanced[2].secondPart.rotationLocks[8],'T');
assert.ok(balanced[2].secondPart.lineupPlayerIds.slice(0,5).includes(8));
assert.ok(balanced[1].lineupPlayerIds.slice(0,5).includes(1),'Earlier cell constraint retained');
const reloadedCells = actual.ensurePlanPeriods({periods:json(balanced)},defaults);
same(reloadedCells.periods[1].rotationLocks,{1:'T'},'Cell locks persist on reopen');
same(reloadedCells.periods[2].secondPart.rotationLocks,{8:'T'});
const allFixed = balanced.map((p,i)=> i===1 ? {...p,rotationLocks:{1:'T',2:'T',3:'T',4:'T',5:'T'}}:p);
assert.throws(()=>rotation.selectRotationCell(allFixed,eight,limit,new Set(),'t2',6,false),/posti in campo/);
const bothNatural = rotation.selectRotationCell(balanced,eight,limit,new Set([1,2]),'t2',2,false);
assert.ok([1,2].every(id=>bothNatural[1].lineupPlayerIds.slice(0,5).includes(id)), 'A natural keeper can also start outfield');
const excluded = rotation.rotateMatchPeriods(balanced,new Set([...eight].filter(id=>id!==8)),limit);
assert.ok(rotation.rotationUnits(excluded).every(u=>!u.period.lineupPlayerIds.includes(8)));
same(rotation.rotateMatchPeriods(balanced,eight,limit),balanced,'Cell rebalance stable');
const againForced=rotation.rotateMatchPeriods(balanced,eight,limit,new Set(),true);
assert.equal(againForced[1].rotationLocks,undefined,'Explicit regeneration clears subsequent cell constraints');
same(againForced[0].lineupPlayerIds,balanced[0].lineupPlayerIds,'Explicit subsequent regeneration preserves the first formation even with cell locks');
const firstCellLocked=rotation.selectRotationCell(balanced,eight,limit,new Set(),'t1',8,false);
same(rotation.rotateMatchPeriods(firstCellLocked,eight,limit,new Set(),true)[0].lineupPlayerIds,firstCellLocked[0].lineupPlayerIds,'First partial-lock formation remains unchanged on explicit regeneration');
const frozenReport={periods:json(balanced),postMatchReport:json(report)};
rotation.selectRotationCell(frozenReport.periods,eight,limit,new Set(),'t2',2,false);
same(frozenReport.postMatchReport,report,'No actual report mutation');
console.log('PASS comparison cells: optimal sample balance, individual constraints, split third, reopen, incompatible choices, keepers, roster removal, stable recalculation, report untouched.');


const presentation = extract(path.join(lib,'match-presentation.ts'),['isUpcomingMatch','upcomingFirst']);
const clock = Date.parse('2026-11-06T10:00:00Z');
const list = [{id:1,date:'2026-10-30T10:00:00Z'}, {id:2,date:'2026-11-14T10:00:00Z'}, {id:3,date:'2026-11-07T10:00:00Z'}, {id:4,date:'2026-11-08T10:00:00Z',isPostponed:true,rescheduleTbd:true}, {id:5,date:'2026-11-09T10:00:00Z',status:'cancelled'}, {id:6,date:'2026-11-08T10:00:00Z',result:'2-1'}, {id:7,date:'2026-10-29T10:00:00Z',isPostponed:true,rescheduleDate:'2026-11-10T10:00:00Z'}];
same(presentation.upcomingFirst(list,clock).filter(m=>presentation.isUpcomingMatch(m,clock)).map(m=>m.id),[3,7,2]);
same(list.map(m=>m.id),[1,2,3,4,5,6,7],'Ordering does not mutate source records');
assert.equal(presentation.isUpcomingMatch({date:'invalid'},clock),false);
assert.equal(presentation.isUpcomingMatch({date:'2026-11-07T10:00:00Z',result:'—'},clock),true,'A placeholder result is not a played game');
assert.equal(presentation.isUpcomingMatch({date:'2027-01-01T10:00:00Z',__timelineView:'postponed-original'},clock),false);
console.log('PASS match ordering: next game first, recovery date, played/cancelled/TBD excluded, originals preserved.');

const lineup = load(path.join(lib,'match-lineup.ts'));
const natural = id => id === 1;
const retained = { id: 'plan-a', lineupPlayerIds: [1,2,3,4,5] };
const prepared = {...frozenReport, periods: frozenReport.periods.map((p,i)=>i ? p : {...p,boardId:12,lineupAlternatives:[retained]}), fourthPeriodDraft: {key:'t4',minutes:'12',lineupPlayerIds:[1]}};
const reset = rotation.clearMatchLineups(prepared);
assert.ok(rotation.rotationUnits(reset.periods).every(u => u.period.lineupManual && u.period.lineupStarterCount === 0 && !u.period.lineupPlayerIds.length));
assert.equal(reset.fourthPeriodDraft.lineupStarterCount,0);
assert.equal(reset.periods[0].boardId,null);
assert.equal(prepared.periods[0].boardId,12);
same(reset.periods[0].lineupAlternatives,[retained]);
same(reset.postMatchReport,report);
same(reset.periods.map(p=>p.minutes),prepared.periods.map(p=>p.minutes));
const manualReset = rotation.editManualLineupCell(reset.periods,eight,limit,'t3-second',3,false);
const resetReopened = actual.ensurePlanPeriods(json({...reset,periods:manualReset}),defaults);
const recalculated = rotation.rotateMatchPeriods(resetReopened.periods,eight,limit,new Set([1]));
same(lineup.matchPeriodByKey(recalculated,'t3-second').lineupPlayerIds,[3]);
assert.equal(lineup.splitMatchLineup(recalculated[2],5).starters.length,0,'3A stays blank');
assert.equal(lineup.splitMatchLineup(recalculated[0],5).starters.length,0,'Auto balance must not refill the first lineup');

const formation = {key:'t1',minutes:'12',lineupPlayerIds:[1,2,3,4,5,6,7,8],lineupStarterCount:5,lineupPositions:{1:{x:50,y:90},2:{x:50,y:30}}};
const replaceKeeper = lineup.setLineupKeeper(formation,2,5,eight,natural);
assert.equal(lineup.lineupKeeper(replaceKeeper,replaceKeeper.lineupPlayerIds.slice(0,5),natural),2);
same(replaceKeeper.lineupPositions,{1:{x:50,y:30},2:{x:50,y:90}});
const fromBench = lineup.setLineupKeeper(formation,8,5,eight,natural);
assert.equal(fromBench.lineupStarterCount,5);
assert.ok(fromBench.lineupPlayerIds.slice(0,5).includes(1));
assert.equal(fromBench.lineupPlayerIds[0],8);
assert.equal(lineup.setLineupKeeper(formation,99,5,eight,natural),formation);

const gameKeeper = rotation.designateMatchKeeper(reset,'all',2,eight,limit,natural);
assert.ok(rotation.rotationUnits(gameKeeper.periods).every(u => u.period.lineupGoalkeeperId === 2));
assert.equal(rotation.toggleFourthPeriod({...gameKeeper,postMatchReport:undefined},true).periods[3].lineupGoalkeeperId,2);
const segmentKeeper = rotation.designateMatchKeeper(gameKeeper,'t3-second',1,eight,limit,natural);
assert.equal(lineup.matchPeriodByKey(segmentKeeper.periods,'t3-second').lineupGoalkeeperId,1);
assert.equal(segmentKeeper.periods[2].lineupGoalkeeperId,2);
same(segmentKeeper.postMatchReport,report);
const legacyKeeperClient = json({periods:segmentKeeper.periods});
delete legacyKeeperClient.periods[0].lineupGoalkeeperId;
delete legacyKeeperClient.periods[0].lineupManual;
delete legacyKeeperClient.periods[2].secondPart.lineupGoalkeeperId;
backend.preserveMatchReport(legacyKeeperClient,segmentKeeper);
assert.equal(legacyKeeperClient.matchGoalkeeperId,2);
assert.equal(legacyKeeperClient.periods[0].lineupGoalkeeperId,2);
assert.equal(legacyKeeperClient.periods[0].lineupManual,true);
assert.equal(legacyKeeperClient.periods[2].secondPart.lineupGoalkeeperId,1);
legacyKeeperClient.periods[0].lineupGoalkeeperId=null;
backend.preserveMatchReport(legacyKeeperClient,segmentKeeper);
assert.equal(legacyKeeperClient.periods[0].lineupGoalkeeperId,null,'Explicit removal stays removed');
console.log('PASS manual reset, rotation isolation, keeper promotion/swap, 3B, fourth and legacy saves.');
