import { z } from "zod/v4";

export const motorTestCatalog = [
  { id: "anthropometry", title: "Antropometria", principle: "Peso e statura", instructions: "Predisporre una superficie piana. Misurare la massa corporea con la bilancia e la statura con lo stadiometro.", materials: "Bilancia, stadiometro o metro verticale, scheda rilevazioni.", minutes: 5, unit: "" },
  { id: "colors", title: "Test dei 4 colori", principle: "Reazione e discriminazione visiva", instructions: "Posizionare quattro cinesini di colori diversi attorno al giocatore, che parte dal centro. Al segnale vocale o visivo deve toccare il colore indicato nel minor tempo possibile.", materials: "4 cinesini di colori diversi, cronometro.", minutes: 6, unit: "s" },
  { id: "roll", title: "Rotolamento e capovolta", principle: "Coordinazione dinamica e orientamento spaziale", instructions: "Posare un materassino e segnare il traguardo a 10 m. Eseguire una capovolta in avanti o un rotolamento laterale, rialzarsi e scattare fino al traguardo.", materials: "Materassino, cinesini, rotella metrica, cronometro.", minutes: 7, unit: "s" },
  { id: "high-jump", title: "Salto in alto da fermo", principle: "Spinta verticale e arrivo stabile", instructions: "Predisporre un bersaglio verticale graduato. Da fermo eseguire lo stacco verso il bersaglio, osservando ritmo e stabilità all’arrivo. Rilevare l’altezza secondo il protocollo della prova.", materials: "Bersaglio verticale, metro, superficie stabile.", minutes: 8, unit: "cm" },
  { id: "long-jump", title: "Salto in lungo da fermo", principle: "Spinta orizzontale e arrivo stabile", instructions: "Segnare la linea di partenza. Saltare in avanti a piedi uniti da fermo e misurare la distanza dalla linea al punto d’appoggio più vicino, osservando la stabilità all’arrivo.", materials: "Nastro o linea per lo stacco, rotella metrica, superficie di arrivo stabile.", minutes: 8, unit: "cm" },
  { id: "slalom", title: "Conduzione palla a slalom", principle: "Controllo palla e cambi di direzione", instructions: "Disporre 5–6 cinesini su 10–15 m. Cronometrare il percorso di andata e ritorno in conduzione tra i cinesini.", materials: "Pallone, 5–6 cinesini, metro, cronometro.", minutes: 8, unit: "s" },
  { id: "balance", title: "Equilibrio monopodalico", principle: "Controllo posturale e stabilità", instructions: "Su superficie stabile, mantenere l’appoggio su una gamba. Cronometrare la tenuta e annotare se la prova è stata eseguita a occhi aperti o chiusi.", materials: "Superficie piana e stabile, cronometro.", minutes: 6, unit: "s" },
  { id: "march", title: "Marcia sul posto ad occhi chiusi", principle: "Propriocezione dinamica e orientamento", instructions: "Segnare il punto di partenza in uno spazio libero. Marciare sul posto a occhi chiusi per 20–30 secondi alzando le ginocchia. Osservare e annotare lo spostamento e le eventuali perdite d’asse.", materials: "Segno a terra, metro, cronometro.", minutes: 5, unit: "cm" },
  { id: "circuit", title: "Percorso misto a tempo", principle: "Fluidità e transizioni motorie", instructions: "Allestire in sequenza ostacoli bassi, spazio di strisciata, cerchi a campana e rettilineo per lo sprint finale. Cronometrare il circuito intero.", materials: "Ostacoli bassi, materassino, cerchi, cinesini, cronometro.", minutes: 10, unit: "s" },
] as const;

export const trainingExerciseStationsMarker = "\n\n[FTB_EXERCISE_STATIONS]";

export const motorTestCycles = { start: "Inizio stagione", middle: "Metà stagione", end: "Fine stagione" } as const;
const ids = motorTestCatalog.map(item => item.id);
const result = z.object({ measurement: z.number().min(0).max(10000).nullable(), score: z.number().int().min(1).max(10).nullable(), notes: z.string().max(1000) });
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
}).refine(input => new Set(input.tests.map(test => test.id)).size === input.tests.length, { message: "Una prova compare più di una volta." });

export type MotorTestInput = z.infer<typeof motorTestSessionInput>;
export type MotorTestId = (typeof ids)[number];
export type MotorTestResult = z.infer<typeof result>;
export type MotorPlayerResult = MotorTestInput["results"][string];
export type MotorTestSession = MotorTestInput & { id: string; stationId?: number; exerciseIds: Partial<Record<MotorTestId, number>> };
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
