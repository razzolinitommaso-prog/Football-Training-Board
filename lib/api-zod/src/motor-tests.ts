import { z } from "zod/v4";

export const motorTestCatalog = [
  { id: "anthropometry", title: "Antropometria", principle: "Peso e statura", instructions: "Misurare statura e massa corporea prima delle prove.", minutes: 5, unit: "" },
  { id: "colors", title: "Test dei 4 colori", principle: "Reazione e discriminazione visiva", instructions: "Al segnale raggiungere il cinesino del colore indicato.", minutes: 6, unit: "s" },
  { id: "roll", title: "Rotolamento e capovolta", principle: "Coordinazione dinamica e orientamento spaziale", instructions: "Capovolta o rotolamento sul materassino, rialzata e scatto di 10 metri.", minutes: 7, unit: "s" },
  { id: "high-jump", title: "Salto in alto da fermo", principle: "Spinta verticale e arrivo stabile", instructions: "Stacco verticale da fermo e atterraggio stabile.", minutes: 8, unit: "cm" },
  { id: "long-jump", title: "Salto in lungo da fermo", principle: "Spinta orizzontale e arrivo stabile", instructions: "Salto in avanti a piedi uniti da fermo, con arrivo stabile.", minutes: 8, unit: "cm" },
  { id: "slalom", title: "Conduzione palla a slalom", principle: "Controllo palla e cambi di direzione", instructions: "Andata e ritorno in conduzione tra 5–6 cinesini su 10–15 metri.", minutes: 8, unit: "s" },
  { id: "balance", title: "Equilibrio monopodalico", principle: "Controllo posturale e stabilità", instructions: "Cronometrare la tenuta in appoggio su un solo arto su superficie stabile.", minutes: 6, unit: "s" },
  { id: "march", title: "Marcia sul posto ad occhi chiusi", principle: "Propriocezione dinamica e orientamento", instructions: "Marciare per 20–30 secondi e misurare lo spostamento finale.", minutes: 5, unit: "cm" },
  { id: "circuit", title: "Percorso misto a tempo", principle: "Fluidità e transizioni motorie", instructions: "Cronometrare il circuito con ostacoli, strisciata, salti e sprint finale.", minutes: 10, unit: "s" },
] as const;

export const motorTestCycles = { start: "Inizio stagione", middle: "Metà stagione", end: "Fine stagione" } as const;
const ids = motorTestCatalog.map(item => item.id);
const result = z.object({ measurement: z.number().min(0).max(10000).nullable(), score: z.number().int().min(1).max(10).nullable(), notes: z.string().max(1000) });
export const motorTestSessionInput = z.object({
  revision: z.number().int().nonnegative(),
  teamId: z.number().int().positive(),
  date: z.iso.date(),
  cycle: z.enum(["start", "middle", "end"]),
  trainingSessionId: z.number().int().positive().nullable(),
  tests: z.array(z.object({ id: z.enum(ids), minutes: z.number().int().min(1).max(180), link: z.boolean(), phase: z.enum(["iniziale", "centrale", "finale"]) })).min(1).max(ids.length),
  results: z.record(z.string().regex(/^[1-9]\d*$/), z.object({
    height: z.number().positive().max(300).nullable(),
    weight: z.number().positive().max(400).nullable(),
    tests: z.partialRecord(z.enum(ids), result),
  })),
}).refine(input => new Set(input.tests.map(test => test.id)).size === input.tests.length, { message: "Una prova compare più di una volta." });

export type MotorTestInput = z.infer<typeof motorTestSessionInput>;
export type MotorTestId = (typeof ids)[number];
export type MotorTestResult = z.infer<typeof result>;
export type MotorPlayerResult = MotorTestInput["results"][string];
export type MotorTestSession = MotorTestInput & { id: string; exerciseIds: Partial<Record<MotorTestId, number>> };
export type MotorTestHistory = { id: string; date: string; cycle: MotorTestInput["cycle"]; result: MotorPlayerResult };

export function summarizeMotorTests(history: MotorTestHistory[]) {
  const scored = (entry: MotorTestHistory) => Object.entries(entry.result.tests).filter(([id, value]) => id !== "anthropometry" && value?.score != null);
  const latest = history.find(entry => scored(entry).length);
  if (!latest) return { index: null, growth: null, comparable: 0 };
  const latestScores = scored(latest);
  const index = Math.round(10 * latestScores.reduce((total, [, row]) => total + row!.score!, 0) / latestScores.length);
  const previous = history.find(entry => entry.date < latest.date && latestScores.some(([id]) => entry.result.tests[id as MotorTestId]?.score != null));
  const deltas = latestScores.flatMap(([id, row]) => {
    const prior = previous?.result.tests[id as MotorTestId]?.score;
    return prior == null ? [] : [row!.score! - prior];
  });
  return { index, growth: deltas.length ? Math.round(10 * deltas.reduce((a,b) => a+b,0) / deltas.length) : null, comparable: deltas.length };
}
