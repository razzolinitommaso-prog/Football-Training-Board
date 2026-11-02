import type { SharedTournamentPhase } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export const newTournamentPhase = (
  index: number,
  startDate = "",
  endDate = "",
): SharedTournamentPhase => ({
  id: crypto.randomUUID(),
  name: index === 1 ? "1ª fase" : index + "ª fase",
  startDate,
  endDate: endDate || startDate,
});
export function phaseDateBounds(phases: SharedTournamentPhase[]) {
  return {
    startDate:
      phases
        .map((p) => p.startDate)
        .filter(Boolean)
        .sort()[0] ?? "",
    endDate:
      phases
        .map((p) => p.endDate || p.startDate)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
  };
}
export default function TournamentPhasesFields({
  value,
  onChange,
}: {
  value: SharedTournamentPhase[];
  onChange: (phases: SharedTournamentPhase[]) => void;
}) {
  const change = (id: string, patch: Partial<SharedTournamentPhase>) =>
    onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">Fasi del torneo</legend>
      <p className="text-xs text-muted-foreground">
        Una o più fasi, anche in mesi diversi. Gironi e accoppiamenti si
        preparano nella scheda di ciascuna annata.
      </p>
      {value.map((phase, i) => (
        <div key={phase.id} className="space-y-3 rounded-lg border p-3">
          <div>
            <Label htmlFor={phase.id + "-name"}>Nome fase {i + 1}</Label>
            <Input
              id={phase.id + "-name"}
              required
              maxLength={100}
              value={phase.name}
              onChange={(e) => change(phase.id, { name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={phase.id + "-start"}>Data inizio fase</Label>
              <Input
                id={phase.id + "-start"}
                type="date"
                required
                value={phase.startDate}
                onChange={(e) =>
                  change(phase.id, {
                    startDate: e.target.value,
                    ...(!phase.endDate ? { endDate: e.target.value } : {}),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor={phase.id + "-end"}>Data fine fase</Label>
              <Input
                id={phase.id + "-end"}
                type="date"
                required
                min={phase.startDate}
                value={phase.endDate}
                onChange={(e) => change(phase.id, { endDate: e.target.value })}
              />
            </div>
          </div>
          {value.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((p) => p.id !== phase.id))}
            >
              Rimuovi fase {i + 1}
            </Button>
          )}
        </div>
      ))}
      {value.every((p) => p.startDate && p.endDate) && (
        <p className="text-xs text-muted-foreground">
          Periodo complessivo:{" "}
          {phaseDateBounds(value).startDate.split("-").reverse().join("/")} —{" "}
          {phaseDateBounds(value).endDate?.split("-").reverse().join("/")}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={value.length >= 20}
        onClick={() =>
          (() => {
            let index = value.length + 1;
            while (value.some((p) => p.name === `${index}ª fase`)) index++;
            onChange([...value, newTournamentPhase(index)]);
          })()
        }
      >
        + Aggiungi fase
      </Button>
    </fieldset>
  );
}
