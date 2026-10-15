import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseMatchReport, matchReportSchema, type MatchReport } from "../src/match-report.ts";
const make = (): MatchReport => ({ version: 1, periods: [{ minutes: 40, starters: [1, 2] }, { minutes: 42, starters: [1, 3] }], goals: [], substitutions: [] });
test("durata effettiva, recupero, panchina e titolari diversi dopo l'intervallo", () => {
  const result = analyseMatchReport(make(), [1, 2, 3, 4]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.minutes, { 1: 82, 2: 40, 3: 42, 4: 0 });
});
test("registra automaticamente cambi e motivazione all'intervallo", () => {
  const data = make();
  data.periods[1].intervalNotes = "Cambio tattico dopo il primo tempo";
  assert.deepEqual(analyseMatchReport(data, [1, 2, 3]).intervals, [{ period: 1, outPlayerIds: [2], inPlayerIds: [3], notes: "Cambio tattico dopo il primo tempo" }]);
});
test("cambi in ordine temporale, rientro, espulsione e note dopo serializzazione", () => {
  const data = make();
  data.substitutions = [
    { id: "b", period: 0, minute: 30, outPlayerId: 3, inPlayerId: 2, notes: "Rientro" },
    { id: "a", period: 0, minute: 10, outPlayerId: 2, inPlayerId: 3, notes: "Scelta tattica" },
    { id: "c", period: 1, minute: 12, outPlayerId: 3, inPlayerId: null, notes: "Espulsione" },
  ];
  const result = analyseMatchReport(data, [1, 2, 3]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.minutes, { 1: 82, 2: 20, 3: 32 });
  assert.equal(matchReportSchema.parse(JSON.parse(JSON.stringify(data))).substitutions[0].notes, "Rientro");
});
test("cambi al termine del tempo e all'intervallo", () => {
  const data = make();
  data.substitutions = [
    { id: "a", period: 0, minute: 40, outPlayerId: 2, inPlayerId: 3, notes: "" },
    { id: "b", period: 1, minute: 0, outPlayerId: 3, inPlayerId: 2, notes: "" },
  ];
  assert.deepEqual(analyseMatchReport(data, [1, 2, 3]).minutes, { 1: 82, 2: 82, 3: 0 });
});
test("blocca uscita di panchinaro e ingresso di giocatore già in campo", () => {
  const data = make();
  data.substitutions = [{ id: "a", period: 0, minute: 10, outPlayerId: 3, inPlayerId: 1, notes: "" }];
  assert.match(analyseMatchReport(data, [1, 2, 3]).errors.join(), /Cambio non valido/);
});
test("blocca non convocati, eventi fuori durata e tempi inesistenti", () => {
  const data = make();
  data.goals = [{ id: "a", playerId: 9, period: 0, minute: 45 }, { id: "b", playerId: 1, period: 3, minute: 1 }];
  const errors = analyseMatchReport(data, [1, 2, 3]).errors.join();
  assert.match(errors, /non è tra i convocati/);
  assert.match(errors, /supera la durata/);
});
test("marcatore in campo o coinvolto in un cambio allo stesso minuto", () => {
  const data = make();
  data.substitutions = [{ id: "c", outPlayerId: 2, inPlayerId: 3, period: 0, minute: 10, notes: "" }];
  data.goals = [{ id: "g", playerId: 3, period: 0, minute: 9 }];
  assert.match(analyseMatchReport(data, [1, 2, 3]).errors.join(), /Marcatore non in campo/);
  data.goals[0].minute = 10;
  assert.deepEqual(analyseMatchReport(data, [1, 2, 3]).errors, []);
});
test("limite formato e duplicati", () => {
  const data = make();
  data.periods[0].starters = [1, 2, 2];
  data.goals = [{ id: "g", playerId: 1, period: 0, minute: 1 }, { id: "g", playerId: 1, period: 0, minute: 2 }];
  const errors = analyseMatchReport(data, [1, 2, 3], 1).errors.join();
  assert.match(errors, /Troppi titolari/);
  assert.match(errors, /Titolari duplicati/);
  assert.match(errors, /eventi duplicati/);
});
test("quattro tempi e frazioni di minuto scuola calcio", () => {
  const data = make();
  data.periods = Array.from({ length: 4 }, () => ({ minutes: 7.5, starters: [1] }));
  assert.equal(analyseMatchReport(data, [1], 3).minutes[1], 30);
  assert.equal(matchReportSchema.safeParse(data).success, true);
});
test("schema rifiuta durata nulla e minuti/tempi negativi", () => {
  const data = make();
  data.periods[0].minutes = 0;
  assert.equal(matchReportSchema.safeParse(data).success, false);
  data.periods[0].minutes = 40;
  data.goals = [{ id: "a", playerId: 1, period: -1, minute: -2 }];
  assert.equal(matchReportSchema.safeParse(data).success, false);
});
