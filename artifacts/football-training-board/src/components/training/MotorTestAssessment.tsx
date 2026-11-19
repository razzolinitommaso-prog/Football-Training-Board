import { useState } from "react";
import {
  motorTestCatalog,
  motorDiagramImage,
  motorConditionFields,
  motorMeasureFields,
  motorObservationCriteria,
  motorAssessmentMeasurement,
  motorLegacyAssessment,
  newMotorAttempt,
  tgmdLongJumpCriteria,
  tgmdLongJumpScore,
  tgmdSource,
  type MotorTestId,
  type MotorTestResult,
  type MotorAssessment,
  type MotorField,
} from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

export function MotorTestGuide({
  id,
  minutes,
}: {
  id: MotorTestId;
  minutes?: number;
}) {
  const item = motorTestCatalog.find((item) => item.id === id)!;
  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm">{item.title}</strong>
        {minutes != null && (
          <span className="text-xs text-muted-foreground">
            {minutes} minuti
          </span>
        )}
      </div>
      <p className="text-sm">
        <strong>Esecuzione · </strong>
        {item.instructions}
      </p>
      <p className="text-xs">
        <strong>Materiali · </strong>
        {item.materials}
      </p>
      <img
        className="max-h-60 w-full rounded-md object-contain"
        src={motorDiagramImage(id)}
        alt={"Schema illustrativo · " + item.title}
      />
      <p className="text-xs text-muted-foreground">
        Schema illustrativo dell’esercizio. Per una valutazione standardizzata
        applicare le istruzioni del protocollo adottato.
      </p>
    </section>
  );
}
export function MotorTestReferences() {
  return (
    <section className="space-y-3 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">Riferimenti e risultati</h3>
      <p>
        <strong>Misure e osservazioni:</strong> centimetri, secondi, errori e
        note restano distinti. I flag didattici non generano voti automatici o
        percentili.
      </p>
      <p>
        <strong>TGMD-3 · edizione italiana:</strong> il salto in lungo da fermo
        è una prova prevista. Ogni criterio descrive un comportamento da
        osservare; per ciascuna delle due prove formali si registra 1 se
        eseguito correttamente, 0 altrimenti. La familiarizzazione non entra nel
        punteggio. Una casella vuota significa da osservare, non zero.
      </p>
      <p>
        Il singolo item ha un punteggio grezzo da 0 a 8. Non è un voto su dieci
        e non consente da solo di calcolare un percentile o l’Indice
        grosso-motorio. Servono le prove e le tabelle complete previste dal
        manuale e l’età esatta in anni e mesi.
      </p>
      <p>
        Corsa e saltelli monopodalici richiedono prove autonome secondo
        protocollo: non si ricavano dallo sprint del circuito o dai saltelli
        correttivi dell’equilibrio. Conduzione della palla attraverso i coni,
        equilibrio statico, marcia, capovolta e salto verticale non sono item
        TGMD-3.
      </p>
      <a
        className="text-primary underline"
        href={tgmdSource}
        target="_blank"
        rel="noopener noreferrer"
      >
        Manuale e presentazione dell’edizione italiana TGMD-3
      </a>
      <p>
        <strong>Salto in lungo · ALPHA:</strong> il risultato metrico è il
        migliore dei due tentativi validi. Le misure ALPHA e le osservazioni
        TGMD-3 rimangono registrazioni separate; non si presume che una
        somministrazione valga automaticamente per entrambe.
      </p>
      <a
        className="text-primary underline"
        href="https://profith.ugr.es/en/resources/how-to-assess-fitness-in-children-and-adolescents-the-alpha-fitness-test-battery/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Protocolli e risorse ALPHA
      </a>
      <p>
        Confrontare misure soltanto con stessa versione del percorso,
        superficie, occhi, durata e modalità. Con un valore iniziale zero non si
        calcola una variazione percentuale. I voti 1–10 precedenti sono
        conservati come storico, senza conversioni TGMD-3.
      </p>
    </section>
  );
}
function blankAssessment(
  id: Exclude<MotorTestId, "anthropometry">,
  value: MotorTestResult,
): MotorAssessment {
  return motorLegacyAssessment(id, value);
}
export function MotorTestAssessmentEditor({
  id,
  value,
  disabled,
  onChange,
}: {
  id: Exclude<MotorTestId, "anthropometry">;
  value: MotorTestResult;
  disabled: boolean;
  onChange: (patch: Partial<MotorTestResult>) => void;
}) {
  const [side, setSide] = useState("right");
  const [preview] = useState(() => blankAssessment(id, value));
  const assessment = value.assessment ?? preview;
  const reference =
    assessment.attempts.find((a) => a.id === assessment.reference) ??
    assessment.attempts[0];
  function update(patch: Partial<MotorAssessment>) {
    const next = { ...assessment, ...patch };
    onChange({
      assessment: next,
      measurement: motorAssessmentMeasurement(id, next) ?? (next.status === "done" ? next.legacyMeasurement ?? null : null),
    });
  }
  const updateAttempt = (
    index: number,
    patch: Partial<MotorAssessment["attempts"][number]>,
  ) =>
    update({
      attempts: assessment.attempts.map((a, i) =>
        i === index ? { ...a, ...patch } : a,
      ),
    });
  function renderField(
    def: MotorField,
    current: string | number | null | undefined,
    save: (v: string | number | null) => void,
    off = false,
  ) {
    return (
      <label key={def.key} className="min-w-0 text-xs">
        {def.label}
        {def.unit ? " · " + def.unit : ""}
        {def.options ? (
          <ScrollableSelect
            aria-label={def.label}
            className="mt-1 w-full"
            value={String(current ?? "")}
            disabled={disabled || off}
            onValueChange={save}
          >
            <option value="">Da specificare</option>
            {def.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </ScrollableSelect>
        ) : (
          <Input
            className="mt-1"
            aria-label={def.label + (def.unit ? " · " + def.unit : "")}
            type={def.key === "layout" ? "text" : "number"}
            min={0}
            max={def.max ?? 10000}
            step={
              /Hops|Touches|misses|knocked|losses|correct|wrong|errors|stops/.test(
                def.key,
              )
                ? 1
                : "any"
            }
            value={current ?? ""}
            disabled={disabled || off}
            onChange={(e) =>
              save(
                e.target.value === ""
                  ? null
                  : def.key === "layout"
                    ? e.target.value
                    : Number(e.target.value),
              )
            }
          />
        )}
      </label>
    );
  }
  const groups = (fields: MotorField[]) => [
    ...new Set(fields.map((f) => f.group)),
  ];
  return (
    <div className="space-y-4">
      {(value.assessment?.legacyMeasurement ??
        (!value.assessment ? value.measurement : null)) != null && (
        <p className="text-xs text-muted-foreground">
          Misura precedente conservata:{" "}
          {value.assessment?.legacyMeasurement ?? value.measurement} {motorTestCatalog.find(test => test.id === id)?.unit}.
          {id === "balance" || id === "high-jump" ? " Il valore storico non specifica il lato e resta distinto dalle nuove misure." : " Riportata nel tentativo di conferma."}
        </p>
      )}
      {!value.assessment && id === "high-jump" && Object.keys(assessment.attempts[1].values).length > 0 && <p className="rounded-lg bg-muted p-3 text-xs">Misure Sx/Dx riportate dalle note originali nei campi di partenza e arrivo. Controllale prima di confermarle. Le note restano conservate integralmente.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          Stato della prova
          <ScrollableSelect
            className="mt-1 w-full"
            value={assessment.status}
            disabled={disabled}
            onValueChange={(v) =>
              update({ status: v as MotorAssessment["status"] })
            }
          >
            <option value="done">Eseguita</option>
            <option value="partial">Parziale</option>
            <option value="not-done">Non eseguita</option>
          </ScrollableSelect>
        </label>
        {assessment.status !== "done" && (
          <label className="text-xs">
            Motivazione
            <Textarea
              maxLength={1000}
              rows={2}
              value={assessment.reason}
              disabled={disabled}
              onChange={(e) => update({ reason: e.target.value })}
            />
          </label>
        )}
      </div>
      <section className="space-y-3 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">Condizioni di esecuzione</h4>
        {groups(motorConditionFields[id]).map((group) => (
          <div key={group} className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">{group}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {motorConditionFields[id]
                .filter((f) => f.group === group)
                .map((def) =>
                  renderField(def, assessment.conditions[def.key], (v) =>
                    update({
                      conditions: { ...assessment.conditions, [def.key]: v },
                    }),
                  ),
                )}
            </div>
          </div>
        ))}
        {id === "balance" && (
          <p className="text-xs text-muted-foreground">
            Saltelli correttivi e contatti del piede libero sono distinti. La
            superficie instabile costituisce una variante separata.
          </p>
        )}
      </section>
      <section className="space-y-3 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">Misurazioni e tentativi</h4>
        {assessment.attempts.map((attempt, index) => (
          <div key={attempt.id} className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm">Tentativo {index + 1}</strong>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="radio"
                  name={"reference-" + id}
                  checked={reference?.id === attempt.id}
                  disabled={disabled}
                  onChange={() => update({ reference: attempt.id })}
                />
                Osserva questo tentativo
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                Funzione
                <ScrollableSelect
                  className="mt-1 w-full"
                  value={attempt.kind}
                  disabled={disabled}
                  onValueChange={(v) =>
                    updateAttempt(index, { kind: v as "practice" | "formal" })
                  }
                >
                  <option value="practice">
                    Prova iniziale · familiarizzazione
                  </option>
                  <option value="formal">Conferma · prova misurata</option>
                </ScrollableSelect>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={attempt.valid}
                  disabled={disabled}
                  onChange={(e) =>
                    updateAttempt(index, { valid: e.target.checked })
                  }
                />
                Tentativo valido
              </label>
            </div>
            {groups(motorMeasureFields[id]).map((group) => (
              <div key={group} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {group}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {motorMeasureFields[id]
                    .filter((f) => f.group === group)
                    .map((def) => {
                      const noRotation =
                          attempt.values.rotationLevel === "Nessuna",
                        noMovement = attempt.values.movementLevel === "Nessuno";
                      return renderField(
                        def,
                        attempt.values[def.key],
                        (v) => {
                          const values = { ...attempt.values, [def.key]: v };
                          if (def.key === "rotationLevel" && v === "Nessuna") {
                            values.degrees = 0;
                            values.rotationDirection = "Non applicabile";
                          }
                          if (def.key === "movementLevel" && v === "Nessuno") {
                            values.cm = 0;
                            values.movementDirection = "Non applicabile";
                          }
                          updateAttempt(index, { values });
                        },
                        (noRotation &&
                          ["degrees", "rotationDirection"].includes(def.key)) ||
                          (noMovement &&
                            ["cm", "movementDirection"].includes(def.key)),
                      );
                    })}
                </div>
              </div>
            ))}
            {id === "high-jump" && (
              <p className="text-xs">
                Elevazione:{" "}
                {(["left", "right"] as const)
                  .map((s) => {
                    const b = attempt.values[s + "Base"],
                      t = attempt.values[s + "Top"];
                    return (
                      (s === "left" ? "sinistra " : "destra ") +
                      (typeof b === "number" && typeof t === "number" && t >= b
                        ? (t - b).toLocaleString("it-IT") + " cm"
                        : "—")
                    );
                  })
                  .join(" · ")}
              </p>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || assessment.attempts.length >= 12}
          onClick={() =>
            update({
              attempts: [
                ...assessment.attempts,
                newMotorAttempt("formal", crypto.randomUUID()),
              ],
            })
          }
        >
          Aggiungi misurazione
        </Button>
        <p className="rounded-md bg-muted p-2 text-xs">
          Misura di riepilogo:{" "}
          {motorAssessmentMeasurement(id, assessment) ?? "Da completare"}
          {motorAssessmentMeasurement(id, assessment) != null
            ? " " + motorTestCatalog.find((t) => t.id === id)!.unit
            : ""}
          {id === "balance"
            ? " · tenuta minore dei due lati (dettaglio sopra)"
            : ""}
        </p>
        {id === "long-jump" &&
          assessment.conditions.protocol ===
            "ALPHA · migliore di due tentativi validi" && (
            <p className="text-xs text-muted-foreground">
              Registra due conferme valide e misurate: il risultato è il
              migliore. La prova iniziale non viene conteggiata. Eventuali
              ripetizioni devono rispettare il protocollo.
            </p>
          )}
      </section>
      {reference && (
        <section className="space-y-3 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">
            Qualità dell’esecuzione · osservazioni
          </h4>
          <p className="text-xs text-muted-foreground">
            Sul tentativo selezionato. Questi flag didattici non producono un
            punteggio TGMD-3.
          </p>
          {id === "balance" && (
            <label className="block max-w-52 text-xs">
              Gamba osservata
              <ScrollableSelect
                className="mt-1 w-full"
                value={side}
                onValueChange={setSide}
              >
                <option value="right">Destra</option>
                <option value="left">Sinistra</option>
              </ScrollableSelect>
            </label>
          )}
          {motorObservationCriteria[id].map((criterion, index) => {
            const key = String(index) + (id === "balance" ? ":" + side : "");
            const item = reference.observations[key] ?? {
              value: null,
              note: "",
            };
            const set = (patch: Partial<typeof item>) =>
              updateAttempt(assessment.attempts.indexOf(reference), {
                observations: {
                  ...reference.observations,
                  [key]: { ...item, ...patch },
                },
              });
            return (
              <div key={key} className="space-y-2 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">{criterion}</p>
                  <div
                    role="group"
                    aria-label={criterion}
                    className="flex flex-wrap gap-1"
                  >
                    {(
                      [
                        [true, "Sì"],
                        [false, "No"],
                        [null, "Non osservato"],
                      ] as const
                    ).map(([v, label]) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={item.value === v ? "default" : "outline"}
                        aria-pressed={item.value === v}
                        disabled={disabled}
                        onClick={() => set({ value: v })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <label className="block text-xs">
                  Nota sul criterio
                  <Textarea
                    rows={2}
                    maxLength={1000}
                    value={item.note}
                    disabled={disabled}
                    onChange={(e) => set({ note: e.target.value })}
                  />
                </label>
              </div>
            );
          })}
        </section>
      )}
      {id === "long-jump" && (
        <section className="space-y-3 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">
            TGMD-3 · salto in lungo da fermo
          </h4>
          <p className="text-xs">
            Criterio = comportamento osservabile. Prova 1 e Prova 2 = due
            esecuzioni formali. 1 = criterio eseguito correttamente; 0 = non
            eseguito correttamente; vuoto = da osservare. Familiarizzazione
            esclusa.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!assessment.tgmd}
              disabled={disabled}
              onChange={(e) =>
                update({
                  tgmd: e.target.checked
                    ? {
                        edition: "tgmd3-it-2023",
                        confirmedProtocol: false,
                        trials: [
                          [null, null, null, null],
                          [null, null, null, null],
                        ],
                        notes: ["", "", "", ""],
                      }
                    : undefined,
                })
              }
            />
            Aggiungi valutazione TGMD-3
          </label>
          {assessment.tgmd && (
            <>
              <a
                href={tgmdSource}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Istruzioni e protocollo italiano: applicare il manuale completo
              </a>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={assessment.tgmd.confirmedProtocol}
                  disabled={disabled}
                  onChange={(e) =>
                    update({
                      tgmd: {
                        ...assessment.tgmd!,
                        confirmedProtocol: e.target.checked,
                      },
                    })
                  }
                />
                Confermo di avere somministrato e osservato le due prove secondo
                il manuale TGMD-3, edizione italiana 2023. I testi sotto sono
                spiegazioni sintetiche dei criteri.
              </label>
              {tgmdLongJumpCriteria.map((criterion, index) => (
                <div key={criterion} className="space-y-2 border-t pt-3">
                  <p className="text-sm">
                    <strong>Criterio {index + 1} · </strong>
                    {criterion}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([0, 1] as const).map((trial) => (
                      <label key={trial} className="text-xs">
                        Prova {trial + 1}
                        <ScrollableSelect
                          className="mt-1 w-full"
                          aria-label={`TGMD-3 criterio ${index + 1} prova ${trial + 1}`}
                          value={
                            assessment.tgmd!.trials[trial][index] == null
                              ? ""
                              : assessment.tgmd!.trials[trial][index]
                                ? "1"
                                : "0"
                          }
                          disabled={disabled}
                          onValueChange={(v) => {
                            const trials = assessment.tgmd!.trials.map(
                              (row) => [...row],
                            ) as NonNullable<MotorAssessment["tgmd"]>["trials"];
                            trials[trial][index] = v === "" ? null : v === "1";
                            update({ tgmd: { ...assessment.tgmd!, trials } });
                          }}
                        >
                          <option value="">Da osservare</option>
                          <option value="1">1 · Eseguito correttamente</option>
                          <option value="0">
                            0 · Non eseguito correttamente
                          </option>
                        </ScrollableSelect>
                      </label>
                    ))}
                  </div>
                  <label className="block text-xs">
                    Nota sul criterio TGMD-3
                    <Textarea
                      rows={2}
                      maxLength={1000}
                      value={assessment.tgmd!.notes[index]}
                      disabled={disabled}
                      onChange={(e) => {
                        const notes = [...assessment.tgmd!.notes];
                        notes[index] = e.target.value;
                        update({ tgmd: { ...assessment.tgmd!, notes } });
                      }}
                    />
                  </label>
                </div>
              ))}
              <p className="rounded-md bg-muted p-3 text-sm">
                Punteggio grezzo dell’item:{" "}
                <strong>
                  {tgmdLongJumpScore(assessment.tgmd) == null
                    ? "Da completare / protocollo non confermato"
                    : tgmdLongJumpScore(assessment.tgmd) + "/8"}
                </strong>
                . Non è un voto su dieci né un percentile.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
