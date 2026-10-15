import assert from "node:assert/strict";
import { test } from "node:test";
import { parentPlayedMinutes, parentTrainingOccurrence, parentTrainingType } from "../src/parent-activity";

test("tipologia pubblica solo categorie riconosciute, mai testo tecnico libero", () => {
  assert.equal(parentTrainingType("tecnico_tattico"), "Tecnico-tattico");
  assert.equal(parentTrainingType(" FORZA "), "Forza");
  assert.equal(parentTrainingType("Dettaglio interno su esercitazioni e altri bambini"), null);
  assert.equal(parentTrainingType(null), null);
});
test("il collegamento calendario/presenze usa l'ora di Roma anche con ora legale", () => {
  assert.equal(parentTrainingOccurrence(4, new Date("2026-10-15T15:00:00Z")), "4-2026-10-15-17:00");
  assert.equal(parentTrainingOccurrence(4, new Date("2026-12-15T16:00:00Z")), "4-2026-12-15-17:00");
});
test("una convocazione o una formazione senza resoconto non equivale a zero minuti", () => {
  assert.equal(parentPlayedMinutes(null, 1), null);
  assert.equal(parentPlayedMinutes({ periods: [{ minutes: "40", lineupPlayerIds: [1] }] }, 1), null);
  assert.equal(parentPlayedMinutes({ postMatchReport: { version: 1 } }, 1), null);
});
test("calcola solo i minuti del figlio, con rientri e zero panchina documentato", () => {
  const postMatchReport = { version: 1, periods: [{ minutes: 40, starters: [1, 2] }], goals: [], substitutions: [
    { id: "a", outPlayerId: 1, inPlayerId: 3, period: 0, minute: 10, notes: "Nota staff riservata" },
    { id: "b", outPlayerId: 3, inPlayerId: 1, period: 0, minute: 30, notes: "Nota su altro bambino" },
  ] };
  assert.equal(parentPlayedMinutes({ postMatchReport }, 1), 20);
  assert.equal(parentPlayedMinutes({ postMatchReport }, 2), 40);
  assert.equal(parentPlayedMinutes({ postMatchReport }, 4), 0);
});
test("resoconto incoerente non produce minuti inventati", () => {
  const postMatchReport = { version: 1, periods: [{ minutes: 40, starters: [1] }], goals: [], substitutions: [
    { id: "a", outPlayerId: 2, inPlayerId: 1, period: 0, minute: 10, notes: "" },
  ] };
  assert.equal(parentPlayedMinutes({ postMatchReport }, 1), null);
});
