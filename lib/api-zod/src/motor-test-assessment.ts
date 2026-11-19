import { z } from "zod/v4";
import type { MotorTestId, MotorTestResult } from "./motor-tests";

export const motorObservationSchema = z.object({
  value: z.boolean().nullable(),
  note: z.string().max(1000),
});
const values = z.record(
  z.string().max(60),
  z.union([z.number().min(0).max(10000), z.string().max(200), z.null()]),
);
export const motorAttemptSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["practice", "formal"]),
  valid: z.boolean(),
  values,
  observations: z.record(z.string().max(80), motorObservationSchema),
});
export const motorAssessmentSchema = z
  .object({
    version: z.literal(1),
    legacyMeasurement: z.number().min(0).max(10000).nullable().optional(),
    status: z.enum(["done", "partial", "not-done"]),
    reason: z.string().max(1000),
    conditions: values,
    reference: z.string().max(80),
    attempts: z.array(motorAttemptSchema).max(12),
    tgmd: z
      .object({
        edition: z.literal("tgmd3-it-2023"),
        confirmedProtocol: z.boolean(),
        trials: z.tuple([
          z.tuple([
            z.boolean().nullable(),
            z.boolean().nullable(),
            z.boolean().nullable(),
            z.boolean().nullable(),
          ]),
          z.tuple([
            z.boolean().nullable(),
            z.boolean().nullable(),
            z.boolean().nullable(),
            z.boolean().nullable(),
          ]),
        ]),
        notes: z.array(z.string().max(1000)).length(4),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (new Set(data.attempts.map((a) => a.id)).size !== data.attempts.length)
      ctx.addIssue({
        code: "custom",
        message: "I tentativi devono avere identificativi distinti.",
      });
    if (
      data.attempts.length &&
      !data.attempts.some((a) => a.id === data.reference)
    )
      ctx.addIssue({
        code: "custom",
        message: "Scegli il tentativo di riferimento.",
      });
    for (const [index, attempt] of data.attempts.entries()) {
      const degrees = attempt.values.degrees;
      if (typeof degrees === "number" && degrees > 360)
        ctx.addIssue({
          code: "custom",
          path: ["attempts", index, "values", "degrees"],
          message: "La rotazione deve essere compresa tra 0 e 360 gradi.",
        });
      if (
        attempt.values.rotationLevel === "Nessuna" &&
        typeof degrees === "number" &&
        degrees !== 0
      )
        ctx.addIssue({
          code: "custom",
          path: ["attempts", index, "values", "degrees"],
          message: "Con rotazione Nessuna l’angolo deve essere zero.",
        });
      if (
        attempt.values.movementLevel === "Nessuno" &&
        typeof attempt.values.cm === "number" &&
        attempt.values.cm !== 0
      )
        ctx.addIssue({
          code: "custom",
          path: ["attempts", index, "values", "cm"],
          message: "Con spostamento Nessuno la distanza deve essere zero.",
        });
      for (const side of ["left", "right"]) {
        const base = attempt.values[side + "Base"],
          top = attempt.values[side + "Top"];
        if (typeof base === "number" && typeof top === "number" && top < base)
          ctx.addIssue({
            code: "custom",
            path: ["attempts", index, "values", side + "Top"],
            message:
              "La quota in salto non può essere inferiore alla quota da fermo.",
          });
      }
      for (const [key, value] of Object.entries(attempt.values)) {
        if (
          /Hops|Touches|errors|misses|knocked|losses|correct|wrong/.test(key) &&
          typeof value === "number" &&
          !Number.isInteger(value)
        )
          ctx.addIssue({
            code: "custom",
            path: ["attempts", index, "values", key],
            message: "I conteggi devono essere interi.",
          });
      }
    }
    if (data.status !== "done" && !data.reason.trim())
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Indica la motivazione della prova parziale o non eseguita.",
      });
    if (
      data.conditions.protocol === "ALPHA · migliore di due tentativi validi" &&
      data.attempts.filter((a) => a.kind === "formal" && a.valid).length > 2
    )
      ctx.addIssue({
        code: "custom",
        path: ["attempts"],
        message:
          "ALPHA prevede due tentativi validi: marca come da ripetere quelli non ammessi prima di salvare.",
      });
  });
export type MotorAssessment = z.infer<typeof motorAssessmentSchema>;
export type MotorAttempt = z.infer<typeof motorAttemptSchema>;
export type MotorField = {
  key: string;
  label: string;
  unit?: string;
  group: string;
  options?: string[];
  max?: number;
  integer?: boolean;
};
const field = (
  key: string,
  label: string,
  unit = "",
  group = "Misure",
  options?: string[],
): MotorField => ({ key, label, unit, group, options });
export const motorMeasureFields: Record<
  Exclude<MotorTestId, "anthropometry">,
  MotorField[]
> = {
  colors: [
    field("seconds", "Tempo", "s"),
    field("correct", "Risposte corrette"),
    field("wrong", "Risposte errate"),
  ],
  roll: [field("seconds", "Tempo", "s")],
  "high-jump": [
    field("leftBase", "Quota mano da fermo", "cm", "Braccio sinistro"),
    field("leftTop", "Quota mano in salto", "cm", "Braccio sinistro"),
    field("rightBase", "Quota mano da fermo", "cm", "Braccio destro"),
    field("rightTop", "Quota mano in salto", "cm", "Braccio destro"),
  ],
  "long-jump": [field("cm", "Distanza", "cm")],
  slalom: [
    field("seconds", "Tempo andata e ritorno", "s", "Tempo"),
    field("misses", "Coni saltati", "", "Errori"),
    field("knocked", "Coni abbattuti", "", "Errori"),
    field("losses", "Perdite di controllo", "", "Errori"),
  ],
  balance: [
    field("rightTime", "Tenuta", "s", "Gamba destra"),
    field("rightHops", "Saltelli correttivi", "", "Gamba destra"),
    field("rightTouches", "Contatti del piede libero", "", "Gamba destra"),
    field("leftTime", "Tenuta", "s", "Gamba sinistra"),
    field("leftHops", "Saltelli correttivi", "", "Gamba sinistra"),
    field("leftTouches", "Contatti del piede libero", "", "Gamba sinistra"),
  ],
  march: [
    field("seconds", "Durata effettiva", "s", "Durata"),
    field("rotationLevel", "Entità", "", "Rotazione", [
      "Nessuna",
      "Leggera",
      "Importante",
    ]),
    field("rotationDirection", "Verso", "", "Rotazione", [
      "Non applicabile",
      "Destra",
      "Sinistra",
    ]),
    { ...field("degrees", "Angolo osservato", "°", "Rotazione"), max: 360 },
    field("movementLevel", "Entità", "", "Spostamento", [
      "Nessuno",
      "Leggero",
      "Importante",
    ]),
    field("movementDirection", "Direzione", "", "Spostamento", [
      "Non applicabile",
      "Avanti",
      "Indietro",
      "Destra",
      "Sinistra",
      "Avanti a destra",
      "Avanti a sinistra",
      "Indietro a destra",
      "Indietro a sinistra",
    ]),
    field("cm", "Distanza", "cm", "Spostamento"),
  ],
  circuit: [
    field("seconds", "Tempo", "s"),
    field("errors", "Errori di percorso"),
    field("stops", "Interruzioni"),
  ],
};
export const motorConditionFields: Record<MotorTestId, MotorField[]> = {
  anthropometry: [],
  colors: [
    field("signals", "Numero segnali", "", "Segnali"),
    field("distance", "Distanza dal centro", "m", "Allestimento"),
    field("signal", "Segnale", "", "Segnali", ["Vocale", "Visivo"]),
  ],
  roll: [
    field("movement", "Movimento", "", "Variante", [
      "Capovolta avanti",
      "Rotolamento laterale",
    ]),
    field("distance", "Scatto finale", "m", "Allestimento"),
  ],
  "high-jump": [
    field("surface", "Superficie", "", "Allestimento", ["Piana stabile"]),
    field("method", "Metodo", "", "Misurazione", ["Differenza quota mano"]),
  ],
  "long-jump": [
    field("surface", "Superficie", "", "Allestimento", ["Piana stabile"]),
    field("protocol", "Protocollo metrico", "", "Misurazione", [
      "Rilevazione osservativa",
      "ALPHA · migliore di due tentativi validi",
    ]),
  ],
  slalom: [
    field("cones", "Numero coni", "", "Allestimento"),
    field("distance", "Lunghezza", "m", "Allestimento"),
    field("spacing", "Interasse coni", "m", "Allestimento"),
  ],
  balance: [
    field("surface", "Superficie", "", "Superficie e attrezzo", [
      "A terra · stabile",
      "Instabile",
    ]),
    field("device", "Attrezzo", "", "Superficie e attrezzo", [
      "Nessuno",
      "Cuscino propriocettivo",
      "Tavoletta",
      "Altro",
    ]),
    field("foot", "Piede d’appoggio", "", "Posizione", [
      "Pianta a terra",
      "Avampiede",
    ]),
    field("eyes", "Occhi", "", "Vista e durata", ["Aperti", "Chiusi"]),
    field("duration", "Durata prevista", "s", "Vista e durata"),
  ],
  march: [
    field("surface", "Superficie", "", "Allestimento", ["Piana stabile"]),
    field("eyes", "Occhi", "", "Modalità", ["Chiusi"]),
    field("duration", "Durata prevista", "s", "Modalità"),
  ],
  circuit: [
    field("layout", "Versione e allestimento del percorso", "", "Percorso"),
  ],
};
export const motorObservationCriteria: Record<MotorTestId, readonly string[]> =
  {
    anthropometry: [],
    colors: [
      "Raggiunge il colore indicato",
      "Attende il segnale",
      "Rientra al centro",
      "Si arresta senza urtare i coni",
    ],
    roll: [
      "Esegue il movimento concordato",
      "Resta nello spazio del materassino",
      "Si rialza senza aiuto",
      "Passa alla corsa senza interruzione",
    ],
    "high-jump": [
      "Coordina piegamento e spinta",
      "Stacca a due piedi",
      "Raggiunge il riferimento senza sostenersi alla parete",
      "Atterra mantenendo il controllo",
    ],
    "long-jump": [
      "Stacca a due piedi",
      "Coordina lo slancio delle braccia",
      "Atterra sui due piedi",
      "Mantiene l’equilibrio all’arrivo",
    ],
    slalom: [
      "Mantiene la palla vicina",
      "Completa il percorso previsto",
      "Controlla i cambi di direzione",
      "Conduce senza fermarsi per recuperare la palla",
    ],
    balance: [
      "Controlla la postura del tronco",
      "Mantiene il piede libero sollevato",
      "Non effettua saltelli correttivi",
      "Mantiene la posizione senza sostegno esterno",
    ],
    march: [
      "Mantiene il ritmo",
      "Alterna correttamente i passi",
      "Controlla la postura del tronco",
      "Esegue a occhi chiusi senza sostegno esterno",
    ],
    circuit: [
      "Rispetta la sequenza",
      "Completa ostacoli e strisciata",
      "Rispetta gli appoggi nei cerchi",
      "Passa tra le parti senza interruzioni",
    ],
  };
// Short explanatory paraphrases, not a replacement for the administration manual.
export const tgmdLongJumpCriteria = [
  "Prima dello stacco: entrambe le ginocchia piegate e braccia distese dietro la schiena",
  "Braccia spinte con forza avanti e in alto oltre il capo",
  "Stacco e arrivo simultanei sui due piedi",
  "Entrambe le braccia spinte verso il basso durante l’atterraggio",
] as const;
export const tgmdSource =
  "https://static.erickson.it/prod/files/ItemVariant/itemvariant_sfoglialibro/204386_9788859032519_edi2636_test-tgmd-3.pdf";
export function tgmdLongJumpScore(tgmd?: MotorAssessment["tgmd"]) {
  if (
    !tgmd?.confirmedProtocol ||
    tgmd.trials.flat().some((value) => value == null)
  )
    return null;
  return tgmd.trials.flat().filter(Boolean).length;
}
export function newMotorAttempt(
  kind: MotorAttempt["kind"],
  id: string,
): MotorAttempt {
  return { id, kind, valid: true, values: {}, observations: {} };
}
export function motorAssessmentMeasurement(
  id: MotorTestId,
  assessment?: MotorAssessment,
): number | null {
  if (!assessment || assessment.status === "not-done") return null;
  const numeric = (attempt: MotorAttempt, key: string) =>
    typeof attempt.values[key] === "number"
      ? (attempt.values[key] as number)
      : null;
  const formal = assessment.attempts.filter(
    (a) => a.valid && a.kind === "formal",
  );
  if (
    id === "long-jump" &&
    assessment.conditions.protocol ===
      "ALPHA · migliore di due tentativi validi"
  ) {
    const measured = formal
      .map((a) => numeric(a, "cm"))
      .filter((v): v is number => v != null);
    return formal.length === 2 && measured.length === 2
      ? Math.max(...measured)
      : null;
  }
  const attempt = assessment.attempts.find(
    (a) => a.id === assessment.reference && a.valid && a.kind === "formal",
  );
  if (!attempt) return null;
  if (id === "high-jump") {
    const jumps = ["left", "right"].flatMap((side) => {
      const base = numeric(attempt, side + "Base"),
        top = numeric(attempt, side + "Top");
      return base != null && top != null && top >= base
        ? [Math.round((top - base) * 100) / 100]
        : [];
    });
    return jumps.length ? Math.max(...jumps) : null;
  }
  if (id === "balance") {
    const times = [
      numeric(attempt, "leftTime"),
      numeric(attempt, "rightTime"),
    ].filter((v): v is number => v != null);
    return times.length === 2 ? Math.min(...times) : null;
  }
  return numeric(
    attempt,
    id === "long-jump" || id === "march" ? "cm" : "seconds",
  );
}
export function motorResultLines(
  id: MotorTestId,
  result?: MotorTestResult,
): string[] {
  const a = result?.assessment;
  if (!a) return [];
  const lines = [
    `Stato: ${{ done: "Eseguita", partial: "Parziale", "not-done": "Non eseguita" }[a.status]}`,
    ...(a.reason ? [`Motivazione: ${a.reason}`] : []),
  ];
  if (a.legacyMeasurement != null)
    lines.push(`Misura precedente conservata: ${a.legacyMeasurement}`);
  for (const field of motorConditionFields[id]) {
    const v = a.conditions[field.key];
    if (v !== undefined && v !== null && v !== "")
      lines.push(`${field.label}: ${v} ${field.unit ?? ""}`.trim());
  }
  for (const [index, attempt] of a.attempts.entries()) {
    lines.push(
      `Tentativo ${index + 1}: ${attempt.kind === "practice" ? "Prova iniziale" : "Conferma"}${attempt.valid ? "" : " · Da ripetere"}`,
    );
    if (id !== "anthropometry")
      for (const field of motorMeasureFields[id]) {
        const v = attempt.values[field.key];
        if (v !== undefined && v !== null && v !== "")
          lines.push(
            `${field.label}${field.group !== "Misure" ? " · " + field.group : ""}: ${v} ${field.unit ?? ""}`.trim(),
          );
      }
    for (const [key, observation] of Object.entries(attempt.observations)) {
      const [criterion, side] = key.split(":"),
        label = motorObservationCriteria[id][Number(criterion)];
      if (label)
        lines.push(
          `${label}${side ? " · " + (side === "left" ? "sinistra" : "destra") : ""}: ${observation.value == null ? "Non osservato" : observation.value ? "Sì" : "No"}${observation.note ? " · " + observation.note : ""}`,
        );
    }
  }
  if (a.tgmd) {
    const score = tgmdLongJumpScore(a.tgmd);
    lines.push(
      `TGMD-3 · salto in lungo: ${score == null ? "Da completare / protocollo non confermato" : score + "/8 · punteggio grezzo del singolo item"}`,
    );
    a.tgmd.trials.forEach((trial, i) =>
      lines.push(
        `TGMD-3 prova ${i + 1}: ` +
          trial.map((v) => (v == null ? "—" : v ? "1" : "0")).join(", "),
      ),
    );
    a.tgmd.notes.forEach((note, i) => {
      if (note) lines.push(`TGMD-3 criterio ${i + 1}: ${note}`);
    });
  }
  return lines;
}
