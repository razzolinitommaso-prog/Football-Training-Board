import { z } from "zod/v4";
import { motorAssessmentSchema, motorAssessmentMeasurement, motorObservationCriteria, newMotorAttempt, type MotorAssessment } from "./motor-test-assessment";

export const motorTestCatalog = [
  { id: "anthropometry", title: "Antropometria", principle: "Peso e statura", instructions: "Predisporre una superficie piana. Misurare la massa corporea con la bilancia e la statura con lo stadiometro.", materials: "Bilancia, stadiometro o metro verticale, scheda rilevazioni.", minutes: 5, unit: "" },
  { id: "colors", title: "Test dei 4 colori", principle: "Reazione e discriminazione visiva", instructions: "Posizionare quattro cinesini di colori diversi attorno al giocatore, che parte dal centro. Al segnale vocale o visivo deve toccare il colore indicato nel minor tempo possibile.", materials: "4 cinesini di colori diversi, cronometro.", minutes: 6, unit: "s" },
  { id: "roll", title: "Rotolamento e capovolta", principle: "Coordinazione dinamica e orientamento spaziale", instructions: "Posare un materassino e segnare il traguardo a 10 m. Eseguire una capovolta in avanti o un rotolamento laterale, rialzarsi e scattare fino al traguardo.", materials: "Materassino, cinesini, rotella metrica, cronometro.", minutes: 7, unit: "s" },
  { id: "high-jump", title: "Salto in alto da fermo", principle: "Spinta verticale e arrivo stabile", instructions: "Predisporre un bersaglio verticale graduato. Da fermo eseguire lo stacco verso il bersaglio, osservando ritmo e stabilità all’arrivo. Rilevare l’altezza secondo il protocollo della prova.", materials: "Bersaglio verticale, metro, superficie stabile.", minutes: 8, unit: "cm" },
  { id: "long-jump", title: "Salto in lungo da fermo", principle: "Spinta orizzontale e arrivo stabile", instructions: "Segnare la linea di partenza. Saltare in avanti a piedi uniti da fermo e misurare la distanza dalla linea al punto d’appoggio più vicino, osservando la stabilità all’arrivo.", materials: "Nastro o linea per lo stacco, rotella metrica, superficie di arrivo stabile.", minutes: 8, unit: "cm" },
  { id: "slalom", title: "Conduzione della palla attraverso i coni", principle: "Controllo della palla e cambi di direzione", instructions: "Disporre 5–6 coni su 10–15 m. Condurre la palla attraverso i coni, alternando i cambi di direzione e mantenendo il controllo del pallone. Cronometrare andata e ritorno; registrare separatamente coni saltati, coni abbattuti e perdite di controllo.", materials: "Pallone, 5–6 coni, metro, cronometro.", minutes: 8, unit: "s" },
  { id: "balance", title: "Equilibrio monopodalico", principle: "Controllo posturale e stabilità", instructions: "Su superficie stabile, mantenere l’appoggio su una gamba. Cronometrare la tenuta e annotare se la prova è stata eseguita a occhi aperti o chiusi.", materials: "Superficie piana e stabile, cronometro.", minutes: 6, unit: "s" },
  { id: "march", title: "Marcia sul posto ad occhi chiusi", principle: "Propriocezione dinamica e orientamento", instructions: "Segnare il punto di partenza in uno spazio libero. Marciare sul posto a occhi chiusi per 20–30 secondi alzando le ginocchia. Osservare e annotare lo spostamento e le eventuali perdite d’asse.", materials: "Segno a terra, metro, cronometro.", minutes: 5, unit: "cm" },
  { id: "circuit", title: "Percorso misto a tempo", principle: "Fluidità e transizioni motorie", instructions: "Allestire in sequenza ostacoli bassi, spazio di strisciata, cerchi a campana e rettilineo per lo sprint finale. Cronometrare il circuito intero.", materials: "Ostacoli bassi, materassino, cerchi, cinesini, cronometro.", minutes: 10, unit: "s" },
] as const;

export const trainingExerciseStationsMarker = "\n\n[FTB_EXERCISE_STATIONS]";

export const motorTestCycles = { start: "Inizio stagione", middle: "Metà stagione", end: "Fine stagione" } as const;
const ids = motorTestCatalog.map(item => item.id);
const result = z.object({ measurement: z.number().min(0).max(10000).nullable(), score: z.number().int().min(1).max(10).nullable(), notes: z.string().max(1000), assessment: motorAssessmentSchema.optional() });
export const motorTestSessionInput = z.object({
  revision: z.number().int().nonnegative(),
  teamId: z.number().int().positive(),
  date: z.iso.date(),
  cycle: z.enum(["start", "middle", "end"]),
  trainingSessionId: z.number().int().positive().nullable(),
  linkProgram: z.boolean().optional(),
  programPhase: z.enum(["iniziale", "centrale", "finale"]).optional(),
  tests: z.array(z.object({ id: z.enum(ids), minutes: z.number().int().min(1).max(180), link: z.boolean(), phase: z.enum(["iniziale", "centrale", "finale"]) })).min(1).max(ids.length),
  results: z.record(z.string().regex(/^[1-9]\d*$/), z.object({
    height: z.number().positive().max(300).nullable(),
    weight: z.number().positive().max(400).nullable(),
    tests: z.partialRecord(z.enum(ids), result),
  })),
}).refine(input => new Set(input.tests.map(test => test.id)).size === input.tests.length, { message: "Una prova compare più di una volta." }).superRefine((input, ctx) => {
  for (const [playerId, player] of Object.entries(input.results)) for (const [id, row] of Object.entries(player.tests)) {
    if (id !== "long-jump" && row?.assessment?.tgmd) ctx.addIssue({ code: "custom", path: ["results", playerId, "tests", id], message: "La valutazione TGMD-3 configurata riguarda soltanto il salto in lungo da fermo." });
  }
});

export type MotorTestInput = z.infer<typeof motorTestSessionInput>;
export type MotorTestId = (typeof ids)[number];
export type MotorTestResult = z.infer<typeof result>;
export type MotorPlayerResult = MotorTestInput["results"][string];
export type MotorTestSession = MotorTestInput & { id: string; stationId?: number; exerciseIds: Partial<Record<MotorTestId, number>> };
export type MotorTestHistory = { id: string; date: string; cycle: MotorTestInput["cycle"]; result: MotorPlayerResult; tests?: MotorTestInput["tests"]; trainingSessionId?: number | null };

export function summarizeMotorTests(history: MotorTestHistory[]) {
  const scored = (entry: MotorTestHistory) => Object.entries(entry.result.tests).filter(([id, value]) => id !== "anthropometry" && !value?.assessment && value?.score != null);
  const latest = history.find(entry => scored(entry).length);
  if (!latest) return { index: null, growth: null, comparable: 0 };
  const latestScores = scored(latest);
  const index = Math.round(10 * latestScores.reduce((total, [, row]) => total + row!.score!, 0) / latestScores.length);
  const previous = history.find(entry => entry.date < latest.date && latestScores.some(([id]) => !entry.result.tests[id as MotorTestId]?.assessment && entry.result.tests[id as MotorTestId]?.score != null));
  const deltas = latestScores.flatMap(([id, row]) => {
    const priorRow = previous?.result.tests[id as MotorTestId];
    const prior = priorRow?.assessment ? null : priorRow?.score;
    return prior == null ? [] : [row!.score! - prior];
  });
  return { index, growth: deltas.length ? Math.round(10 * deltas.reduce((a,b) => a+b,0) / deltas.length) : null, comparable: deltas.length };
}

export function motorTestCompletion(tests: MotorTestInput["tests"], result?: MotorPlayerResult) {
  let complete = 0, assessed = 0, started = 0;
  for (const test of tests) {
    const row = result?.tests[test.id];
    const anthropometry = test.id === "anthropometry";
    const assessment = row?.assessment;
    const measured = anthropometry ? result?.height != null && result.weight != null : assessment ? assessment.status === "done" && motorAssessmentMeasurement(test.id, assessment) != null : row?.measurement != null;
    if (measured) complete++;
    const reference = assessment?.attempts.find(a => a.id === assessment.reference);
    const sides = test.id === "balance" ? ["left", "right"] : [""];
    const observed = !!reference && sides.every(side => motorObservationCriteria[test.id].every((_, index) => reference.observations[index + (side ? ":" + side : "")]?.value != null));
    if (measured && (anthropometry || (assessment ? observed : row?.score != null))) assessed++;
    if (measured || row?.measurement != null || row?.score != null || assessment || (anthropometry && (result?.height != null || result?.weight != null))) started++;
  }
  return { completed: complete, assessed, total: tests.length, status: tests.length > 0 && complete === tests.length ? "complete" as const : started > 0 ? "partial" as const : "not-started" as const };
}
export const motorCompletionLabels = { complete: "Test completato", partial: "Test parziale", "not-started": "Test da eseguire" };

/** Legacy data is displayed in the new editor without rewriting the stored record. */
export function motorLegacyAssessment(id: Exclude<MotorTestId, "anthropometry">, value: MotorTestResult): MotorAssessment {
  if (value.assessment) return value.assessment;
  const practice = newMotorAttempt("practice", "legacy-practice");
  const formal = newMotorAttempt("formal", "legacy-formal");
  if (value.measurement != null && id !== "high-jump" && id !== "balance") {
    formal.values[id === "long-jump" || id === "march" ? "cm" : "seconds"] = value.measurement;
  }
  // Only the explicit two-measurement notation is transferable. Raw notes stay unchanged.
  if (id === "high-jump") {
    for (const [line, side] of [["sx", "left"], ["dx", "right"]] as const) {
      const match = value.notes.match(new RegExp("(?:^|\\n)\\s*" + line + "\\s*:?\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:,\\s+|;\\s*|/\\s*)(\\d+(?:[.,]\\d+)?)\\s*(?:cm)?\\s*(?=\\n|$)", "i"));
      if (!match) continue;
      const base = Number(match[1].replace(",", ".")), top = Number(match[2].replace(",", "."));
      if (base > 0 && top >= base && top <= 300) {
        formal.values[side + "Base"] = base;
        formal.values[side + "Top"] = top;
      }
    }
  }
  return { version: 1, legacyMeasurement: value.measurement, status: "done", reason: "", conditions: {}, reference: formal.id, attempts: [practice, formal] };
}

/** Rich measurements are authoritative; never interpret handwritten legacy notes. */
export function normalizeMotorResults(input: MotorTestInput): MotorTestInput {
  return { ...input, results: Object.fromEntries(Object.entries(input.results).map(([id, player]) => [id, { ...player,
    tests: Object.fromEntries(Object.entries(player.tests).map(([testId, row]) => [testId, row?.assessment ? { ...row, measurement: motorAssessmentMeasurement(testId as MotorTestId, row.assessment) ?? (row.assessment.status === "done" ? row.assessment.legacyMeasurement ?? null : null) } : row])),
  }])) };
}
