const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { createRequire } = require("node:module");
const root = path.resolve(__dirname, ".."),
  web = createRequire(
    path.join(root, "artifacts/football-training-board/package.json"),
  );
const esbuild = createRequire(web.resolve("vite"))("esbuild");
const folder = path.join(root, ".tools/motor-assessment");
fs.mkdirSync(folder, { recursive: true });
esbuild.buildSync({
  entryPoints: [path.join(root, "lib/api-zod/src/index.ts")],
  outfile: path.join(folder, "schema.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
const source = createRequire(path.join(root, "lib/api-zod/package.json"));
const Module = require("node:module").Module;
const compiled = new Module(path.join(folder, "schema.cjs"), module);
compiled.filename = path.join(folder, "schema.cjs");
compiled.paths = [path.join(root, "lib/api-zod/node_modules")];
compiled._compile(
  fs.readFileSync(compiled.filename, "utf8"),
  compiled.filename,
);
const s = compiled.exports;
const attempt = (id, values, kind = "formal") => ({
  id,
  kind,
  valid: true,
  values,
  observations: {},
});
const assessment = (attempts, conditions = {}) => ({
  version: 1,
  status: "done",
  reason: "",
  reference: attempts[0].id,
  attempts,
  conditions,
});
const high = assessment([
  attempt("first", {
    leftBase: 185,
    leftTop: 218,
    rightBase: 182,
    rightTop: 218,
  }),
]);
assert.equal(s.motorAssessmentMeasurement("high-jump", high), 36);
assert.equal(
  s.motorAssessmentMeasurement(
    "high-jump",
    assessment([attempt("bad", { leftBase: 218, leftTop: 185 })]),
  ),
  null,
);
const long = assessment(
  [
    attempt("practice", { cm: 250 }, "practice"),
    attempt("one", { cm: 188 }),
    attempt("two", { cm: 190 }),
  ],
  { protocol: "ALPHA · migliore di due tentativi validi" },
);
assert.equal(
  s.motorAssessmentMeasurement("long-jump", long),
  190,
  "practice excluded, best formal retained",
);
assert.equal(
  s.motorAssessmentMeasurement("long-jump", {
    ...long,
    attempts: long.attempts.slice(0, 2),
  }),
  null,
  "two measured formal attempts required",
);
assert.equal(
  s.motorAssessmentMeasurement(
    "balance",
    assessment([
      attempt("zero", {
        leftTime: 0,
        rightTime: 30,
        leftHops: 0,
        rightHops: 2,
      }),
    ]),
  ),
  0,
  "zero remains a value",
);
assert.equal(
  s.motorAssessmentMeasurement(
    "march",
    assessment([
      attempt("none", { cm: 0, rotationLevel: "Nessuna", degrees: 0 }),
    ]),
  ),
  0,
);
assert.equal(
  s.motorAssessmentSchema.safeParse(
    assessment([attempt("degrees", { degrees: 361 })]),
  ).success,
  false,
);
assert.equal(
  s.motorAssessmentSchema.safeParse(
    assessment([attempt("hops", { rightHops: 1.5 })]),
  ).success,
  false,
);
assert.equal(
  s.motorAssessmentSchema.safeParse({ ...high, status: "not-done", reason: "" })
    .success,
  false,
);
const tgmd = {
  edition: "tgmd3-it-2023",
  confirmedProtocol: true,
  trials: [
    [true, false, true, true],
    [true, false, true, false],
  ],
  notes: ["", "", "", ""],
};
assert.equal(s.tgmdLongJumpScore(tgmd), 5);
assert.equal(s.tgmdLongJumpScore({ ...tgmd, confirmedProtocol: false }), null);
assert.equal(
  s.tgmdLongJumpScore({
    ...tgmd,
    trials: [[null, false, true, true], tgmd.trials[1]],
  }),
  null,
  "unobserved is not zero",
);
assert.equal(
  s.tgmdLongJumpScore({
    ...tgmd,
    trials: [
      [false, false, false, false],
      [false, false, false, false],
    ],
  }),
  0,
);
const tests = [{ id: "high-jump", minutes: 8, phase: "centrale", link: false }];
const input = {
  revision: 0,
  teamId: 11,
  date: "2026-11-19",
  cycle: "start",
  trainingSessionId: null,
  tests,
  results: {
    101: {
      height: null,
      weight: null,
      tests: {
        "high-jump": {
          measurement: 100,
          score: 8,
          notes: "Sx 185,218",
          assessment: high,
        },
      },
    },
  },
};
assert.equal(s.motorTestSessionInput.safeParse(input).success, true);
const normalized = s.normalizeMotorResults(input);
assert.equal(normalized.results[101].tests["high-jump"].measurement, 36);
assert.equal(normalized.results[101].tests["high-jump"].notes, "Sx 185,218");
assert.equal(normalized.results[101].tests["high-jump"].score, 8);
assert.equal(
  s.motorTestSessionInput.safeParse({
    ...input,
    results: {
      101: {
        ...input.results[101],
        tests: {
          "high-jump": {
            ...input.results[101].tests["high-jump"],
            assessment: { ...high, tgmd },
          },
        },
      },
    },
  }).success,
  false,
  "TGMD cannot be attached to a different exercise",
);
assert.equal(
  s.summarizeMotorTests([
    {
      date: input.date,
      id: "one",
      cycle: "start",
      result: normalized.results[101],
    },
  ]).index,
  null,
  "rich observations do not invent normative votes",
);
const proofs = [...s.motorTestCatalog].map((t) => ({
  id: t.id,
  minutes: t.minutes,
  phase: "centrale",
  link: false,
}));
let description = s.composeMotorStation(proofs, undefined, "session-id");
let rows = JSON.parse(description.split(s.trainingExerciseStationsMarker)[1]);
assert.equal(rows.length, 9);
assert.ok(
  rows.every(
    (row) =>
      row.boardJson && row.boardPreview && row.motorSessionId === "session-id",
  ),
);
rows[0].boardJson = "custom-board";
rows[0].boardPreview = "custom-preview";
rows[0].exercise = "Custom instructions";
rows[0].notes = "Keep me";
description =
  "Custom station heading" +
  s.trainingExerciseStationsMarker +
  JSON.stringify(rows);
const reordered = s.composeMotorStation(
  [...proofs].reverse(),
  description,
  "session-id",
);
const next = JSON.parse(reordered.split(s.trainingExerciseStationsMarker)[1]);
assert.deepEqual(
  next.map((r) => r.id),
  proofs.map((t) => t.id).reverse(),
);
assert.equal(next.at(-1).boardJson, "custom-board");
assert.equal(next.at(-1).exercise, "Custom instructions");
assert.equal(next.at(-1).notes, "Keep me");
assert.ok(reordered.startsWith("Custom station heading"));
assert.throws(() =>
  s.composeMotorStation(
    proofs,
    "Broken" + s.trainingExerciseStationsMarker + "bad json",
  ),
);
for (const proof of proofs)
  assert.ok(s.motorTestDiagram(proof.id).startsWith("<svg"));
assert.ok(
  s.motorTestCatalog
    .find((t) => t.id === "slalom")
    .title.includes("attraverso"),
);
console.log(
  "PASS motor assessment: legacy preservation, trial derivation, zero/null, TGMD completeness, validation and station reorder/boards",
);
