const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), { createRequire, Module } = require("node:module");
const root = path.resolve(__dirname, ".."), web = createRequire(path.join(root, "artifacts/football-training-board/package.json"));
const folder = path.join(root, ".tools/motor-drafts"); fs.mkdirSync(folder, { recursive: true });
createRequire(web.resolve("vite"))("esbuild").buildSync({
  entryPoints: [path.join(root, "artifacts/football-training-board/src/lib/motor-test-drafts.ts")],
  outfile: path.join(folder, "drafts.cjs"), bundle: true, platform: "node", format: "cjs",
  alias: { "@workspace/api-zod": path.join(root, "lib/api-zod/src/index.ts") }, packages: "external",
});
const compiled = new Module(path.join(folder, "drafts.cjs"), module);
compiled.filename = path.join(folder, "drafts.cjs"); compiled.paths = [path.join(root, "lib/api-zod/node_modules")];
compiled._compile(fs.readFileSync(compiled.filename, "utf8"), compiled.filename);
const { MotorDraftStore, mergeMotorDraft } = compiled.exports;
class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, v); }
  removeItem(k) { this.data.delete(k); }
  key(i) { return [...this.data.keys()][i] ?? null; }
}
const base = () => ({ id: "test-session", revision: 1, teamId: 15, date: "2026-11-18", cycle: "start", trainingSessionId: null,
  tests: [{ id: "long-jump", minutes: 8, phase: "centrale", link: false }], results: {}, exerciseIds: {} });
const row = n => ({ height: null, weight: null, tests: { "long-jump": { measurement: n, score: null, notes: "original" } } });
function make(options = {}) {
  const storage = options.storage ?? new MemoryStorage(); let calls = 0;
  const store = new MotorDraftStore({ scope: "club:1:user:2:preparer", storage, delay: 100000,
    allowed: () => true, changed: () => {}, saved: () => {}, latest: async () => undefined,
    put: async s => { calls++; return { ...s, revision: s.revision + 1 }; }, ...options });
  return { store, storage, calls: () => calls };
}
async function run() {
  const first = make(); first.store.open(base());
  let draft = base();
  for (let id = 1; id <= 8; id++) {
    draft = { ...draft, results: { ...draft.results, [id]: row(id === 1 ? 0 : 100 + id) } };
    first.store.edit(draft);
    assert.equal(JSON.parse(first.storage.getItem(first.store.prefix + draft.id)).draft.results[id].tests["long-jump"].measurement, id === 1 ? 0 : 100 + id);
  }
  first.store.stop();
  const restored = make({ storage: first.storage });
  assert.equal(restored.store.recoverable().length, 1);
  assert.equal(Object.keys(restored.store.open(base()).results).length, 8, "all eight players recover before any request");
  await restored.store.flush(draft.id);
  assert.equal(restored.store.status(draft.id).dirty, false);
  assert.equal(Object.keys(restored.store.current(draft.id).results).length, 8);
  assert.equal(make({ storage: first.storage, scope: "club:1:user:other" }).store.recoverable().length, 0);
  restored.store.stop();

  let acknowledge; let inFlight = 0, peak = 0;
  const pending = make({ put: s => { inFlight++; peak = Math.max(peak, inFlight); return new Promise(resolve => { acknowledge = () => { inFlight--; resolve({ ...s, revision: s.revision + 1 }); }; }); } });
  pending.store.open(base()); pending.store.edit({ ...base(), results: { 1: row(150) } });
  const request = pending.store.flush("test-session");
  pending.store.edit({ ...pending.store.current("test-session"), results: { 1: row(160), 2: row(120) } });
  const duplicate = pending.store.flush("test-session");
  acknowledge(); await Promise.all([request, duplicate]);
  assert.equal(peak, 1, "only one request per session");
  assert.equal(pending.store.current("test-session").results[1].tests["long-jump"].measurement, 160, "late acknowledgement cannot erase typing");
  assert.ok(pending.store.status("test-session").dirty);
  const secondRequest = pending.store.flush("test-session"); acknowledge(); await secondRequest;
  assert.equal(pending.store.status("test-session").dirty, false); pending.store.stop();

  let online = false;
  const offline = make({ put: async s => { if (!online) throw new Error("offline"); return { ...s, revision: s.revision + 1 }; } });
  offline.store.open(base()); offline.store.edit({ ...base(), results: { 1: row(100) } });
  await offline.store.flush("test-session");
  assert.ok(offline.store.status("test-session").error);
  assert.ok(offline.store.status("test-session").local);
  online = true; await offline.store.flush("test-session");
  assert.equal(offline.store.status("test-session").dirty, false); offline.store.stop();

  const remote = { ...base(), revision: 2, results: { 2: row(99) } };
  let revision = 1;
  const conflict = make({ latest: async () => remote, put: async s => { if (revision++ === 1) throw Object.assign(new Error("stale"), { status: 409 }); return { ...s, revision: s.revision + 1 }; } });
  conflict.store.open(base()); conflict.store.edit({ ...base(), results: { 1: row(100) } });
  await conflict.store.flush("test-session");
  assert.deepEqual(Object.keys(conflict.store.current("test-session").results), ["1", "2"]);
  await conflict.store.flush("test-session"); assert.equal(conflict.store.status("test-session").dirty, false); conflict.store.stop();
  const same = mergeMotorDraft({ ...base(), results: { 1: row(80) } }, { ...base(), results: { 1: row(100) } }, { ...remote, results: { 1: row(120) } });
  assert.ok(same.conflicts.some(path => path.includes("measurement")));
  assert.equal(same.draft.results[1].tests["long-jump"].measurement, 100);
  const blocked = make({ put: async () => { throw Object.assign(new Error("stale"), { status: 409 }); }, latest: async () => ({ ...remote, results: { 1: row(120) } }) });
  blocked.store.open({ ...base(), results: { 1: row(80) } }); blocked.store.edit({ ...base(), results: { 1: row(100) } });
  await blocked.store.flush("test-session"); assert.ok(blocked.store.status("test-session").error);
  assert.equal(blocked.store.recoverable()[0].results[1].tests["long-jump"].measurement, 100); blocked.store.stop();

  const invalid = make(); invalid.store.open(base()); invalid.store.edit({ ...base(), results: { 1: { ...row(100), height: 0 } } });
  await invalid.store.flush("test-session"); assert.equal(invalid.calls(), 0); assert.ok(invalid.store.status("test-session").error);
  invalid.store.stop();
  const recovery = make({ storage: invalid.storage }); assert.equal(recovery.store.open(base()).results[1].height, 0, "incomplete/invalid drafts recover too"); recovery.store.stop();
  const brokenStorage = make({ storage: { getItem: () => null, key: () => null, length: 0, setItem: () => { throw new Error("quota"); }, removeItem: () => {} } });
  brokenStorage.store.open(base()); brokenStorage.store.edit({ ...base(), results: { 1: row(0) } });
  assert.ok(brokenStorage.store.unsafe()); await brokenStorage.store.flush("test-session"); assert.equal(brokenStorage.store.unsafe(), false); brokenStorage.store.stop();
  const reordered = make({ put: async s => ({ results: s.results, ...s, revision: s.revision + 1, stationId: undefined }) });
  reordered.store.open(base()); reordered.store.edit({ ...base(), results: { 1: row(99) } }); await reordered.store.flush("test-session");
  assert.equal(reordered.store.status("test-session").dirty, false, "key order/optional metadata cannot create endless saves"); reordered.store.stop();
  const automatic = make({ delay: 5 }); automatic.store.open(base()); automatic.store.edit({ ...base(), results: { 1: row(120) } });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(automatic.calls(), 1, "debounced autosave runs without clicking Save");
  assert.equal(automatic.store.status("test-session").dirty, false); automatic.store.stop();
  const denied = make({ allowed: () => false }); denied.store.open(base()); denied.store.edit({ ...base(), results: { 1: row(140) } });
  await denied.store.flush("test-session"); assert.equal(denied.calls(), 0); denied.store.stop();
  const program = make({ delay: 5 }); program.store.open({ ...base(), revision: 0 }); program.store.edit({ ...base(), revision: 0, date: "2026-11-19" });
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(program.calls(), 0, "new program is not locked before choosing date/team");
  await program.store.flush("test-session", true); assert.equal(program.calls(), 1); program.store.stop();
  let constraintCalls = 0;
  const constraint = make({ delay: 5, latest: async () => base(), put: async () => { constraintCalls++; throw Object.assign(new Error("Stazione rimossa"), { status: 409 }); } });
  constraint.store.open(base()); constraint.store.edit({ ...base(), results: { 1: row(99) } });
  await constraint.store.flush("test-session"); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(constraintCalls, 1, "non-revision 409 must not cause an infinite merge/retry loop");
  assert.match(constraint.store.status("test-session").message, /Stazione rimossa/); constraint.store.stop();
  console.log("PASS motor drafts: eight-player recovery, synchronous backup, late responses, serialized saves, offline retry, revisions, conflicts, partial inputs, storage failure and profile isolation");
}
run().catch(e => { console.error(e); process.exit(1); });
