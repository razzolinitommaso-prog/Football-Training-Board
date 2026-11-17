import { motorTestCompletion, motorCompletionLabels, motorTestCatalog, motorTestCycles, summarizeMotorTests, type MotorTestHistory } from "@workspace/api-zod";

export function MotorTestResults({ tests }: { tests: MotorTestHistory[] }) {
  if (!tests.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {(() => {
        const latest = tests[0];
        const completion = motorTestCompletion(latest.tests ?? [], latest.result);
        return <p role="status" className={"rounded-lg border p-2 text-sm " + (completion.status === "complete" ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-amber-300 text-amber-800 dark:text-amber-300")}>
          <strong>{motorCompletionLabels[completion.status]}</strong> · {completion.completed}/{completion.total} prove eseguite · {latest.date.split("-").reverse().join("/")}
          {completion.assessed < completion.completed && <span className="block text-xs">Valutazioni complete: {completion.assessed}/{completion.total}. I voti delle altre prove sono in attesa.</span>}
        </p>;
      })()}
      {(() => {
        const summary = summarizeMotorTests(tests);
        return <p className="text-sm">Indice attuale <strong>{summary.index == null ? "—" : summary.index + "%"}</strong>{summary.growth != null && <> · Crescita <strong>{summary.growth > 0 ? "+" : ""}{summary.growth} p.p.</strong> su {summary.comparable} prove</>}</p>;
      })()}
      {tests.slice(0, 5).map(test => <details key={test.id} className="rounded-lg border bg-background p-2 text-sm">
        <summary className="cursor-pointer font-medium">{test.date.split("-").reverse().join("/")} · {motorTestCycles[test.cycle]} · {motorCompletionLabels[motorTestCompletion(test.tests ?? [], test.result).status]}</summary>
        <p className="mt-2 text-xs text-muted-foreground">Statura {test.result.height ?? "—"} cm · Peso rilevato {test.result.weight ?? "—"} kg</p>
        <ul className="mt-2 divide-y text-xs">
          {motorTestCatalog.map(proof => {
            const value = test.result.tests[proof.id];
            if (!value && !test.tests?.some(item => item.id === proof.id)) return null;
            if (proof.id === "anthropometry") return <li key={proof.id} className="py-2"><strong>{proof.title}</strong><p>Statura {test.result.height ?? "—"} cm · Peso {test.result.weight ?? "—"} kg</p></li>;
            if (!value) return <li key={proof.id} className="py-2"><strong>{proof.title}</strong><p className="text-amber-700">Da eseguire</p></li>;
            const missing = [value.measurement == null ? "Misura" : null, value.score == null ? "Voto" : null].filter(Boolean).join(" e ");
            const ratio = (proof.id === "high-jump" || proof.id === "long-jump") && value.measurement != null && test.result.height
              ? (100 * value.measurement / test.result.height).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + "% della statura" : null;
            return <li key={proof.id} className="space-y-1 py-2"><strong>{proof.title}</strong><p className="text-muted-foreground">{[
              value.measurement != null ? value.measurement + " " + proof.unit : null,
              value.score != null ? value.score + "/10" : null, ratio,
              missing ? missing + " da inserire" : null,
            ].filter(Boolean).join(" · ")}</p>{value.notes && <p className="break-words">{value.notes}</p>}</li>;
          })}
        </ul>
      </details>)}
    </div>
  );
}
