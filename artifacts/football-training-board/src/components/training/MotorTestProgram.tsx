import { useRef, useState } from "react";
import {
  motorTestCatalog,
  type MotorTestId,
  type MotorTestSession,
} from "@workspace/api-zod";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MotorTestGuide } from "./MotorTestAssessment";

export function reorderMotorProgram(
  tests: MotorTestSession["tests"],
  from: MotorTestId,
  to: MotorTestId,
) {
  const source = tests.findIndex((t) => t.id === from),
    target = tests.findIndex((t) => t.id === to);
  if (source < 0 || target < 0 || source === target) return tests;
  const next = [...tests];
  const [item] = next.splice(source, 1);
  next.splice(target, 0, item);
  return next;
}
export function MotorTestProgram({
  draft,
  disabled,
  onChange,
}: {
  draft: MotorTestSession;
  disabled: boolean;
  onChange: (next: MotorTestSession) => void;
}) {
  const dragged = useRef<MotorTestId | undefined>(undefined);
  const touchTarget = useRef<MotorTestId | undefined>(undefined);
  const [notice, setNotice] = useState("");
  function move(from: MotorTestId, to: MotorTestId) {
    if (disabled) return;
    onChange({ ...draft, tests: reorderMotorProgram(draft.tests, from, to) });
    setNotice(
      "Ordine modificato. Salva la sessione per aggiornare anche la stazione nella seduta.",
    );
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">
        Programma · ordine di esecuzione
      </h3>
      <p className="text-xs text-muted-foreground">
        Trascina dalla maniglia oppure usa le frecce. L’ordine viene salvato
        anche nelle esercitazioni della stazione collegata.
      </p>
      <ul className="space-y-3">
        {draft.tests.map((test, index) => {
          const item = motorTestCatalog.find((item) => item.id === test.id)!;
          const hasResults = Object.values(draft.results).some(
            (result) =>
              result.tests[test.id] != null ||
              (test.id === "anthropometry" &&
                (result.height != null || result.weight != null)),
          );
          return (
            <li
              key={test.id}
              data-motor-program-id={test.id}
              draggable={!disabled}
              className="space-y-3 rounded-lg border bg-background p-3"
              onDragStart={(e) => {
                dragged.current = test.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", test.id);
              }}
              onDragOver={(e) => {
                if (!disabled) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged.current) move(dragged.current, test.id);
                dragged.current = undefined;
              }}
              onDragEnd={() => {
                dragged.current = undefined;
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  className="touch-none"
                  aria-label={"Trascina " + item.title}
                  onPointerDown={(e) => {
                    if (disabled || e.pointerType === "mouse") return;
                    dragged.current = test.id;
                    touchTarget.current = test.id;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (e.pointerType === "mouse" || !dragged.current) return;
                    const row = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-motor-program-id]");
                    if (row && e.currentTarget.closest("ul")?.contains(row))
                      touchTarget.current = row.dataset
                        .motorProgramId as MotorTestId;
                  }}
                  onPointerUp={() => {
                    if (dragged.current && touchTarget.current)
                      move(dragged.current, touchTarget.current);
                    dragged.current = undefined;
                    touchTarget.current = undefined;
                  }}
                  onPointerCancel={() => {
                    dragged.current = undefined;
                    touchTarget.current = undefined;
                  }}
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
                <strong className="min-w-0 flex-1 text-sm">
                  {index + 1}. {item.title}
                </strong>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={"Sposta prima " + item.title}
                  disabled={disabled || index === 0}
                  onClick={() => move(test.id, draft.tests[index - 1].id)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={"Sposta dopo " + item.title}
                  disabled={disabled || index === draft.tests.length - 1}
                  onClick={() => move(test.id, draft.tests[index + 1].id)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <label className="w-24 text-xs">
                  Minuti
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    disabled={disabled || !!draft.exerciseIds[test.id]}
                    value={test.minutes}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        tests: draft.tests.map((t) =>
                          t.id === test.id
                            ? { ...t, minutes: Number(e.target.value) }
                            : t,
                        ),
                      })
                    }
                  />
                </label>
                {!hasResults && !draft.exerciseIds[test.id] && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || draft.tests.length === 1}
                    onClick={() =>
                      onChange({
                        ...draft,
                        tests: draft.tests.filter((t) => t.id !== test.id),
                      })
                    }
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-primary">
                  Descrizione, materiali e disegno
                </summary>
                <div className="mt-3">
                  <MotorTestGuide id={test.id} minutes={test.minutes} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-primary" role="status">
        {notice}
      </p>
      <p className="rounded-md bg-muted p-3 text-sm">
        {draft.tests.length} prove ·{" "}
        {draft.tests.reduce((sum, t) => sum + t.minutes, 0)} minuti complessivi
      </p>
    </section>
  );
}
