import { useState } from "react";
import { TRAINING_METHOD_GUIDES, TRAINING_ROTATION_PHASES, normalizePrincipleSection, sessionObjectiveLabel } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const phases = { iniziale: "Iniziale", centrale: "Centrale", finale: "Finale" };

export function TrainingMethodGuides({ section, onPrepare }: { section?: string | null; onPrepare?: (guideId: string) => void }) {
  const scope = normalizePrincipleSection(section);
  const guides = TRAINING_METHOD_GUIDES.filter(guide => !scope || guide.section === scope);
  const [selected, setSelected] = useState("esordienti");
  const guide = guides.find(item => item.id === selected) ?? guides[0];
  if (!guide) return null;

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label="Linee guida metodologiche">
    <div>
      <h2 className="text-lg font-semibold">Linee guida metodologiche</h2>
      <p className="text-sm text-muted-foreground">Indicazioni del direttore tecnico e sedute tipo da adattare alla propria annata.</p>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Fascia della guida">
      {guides.map(item => <Button key={item.id} type="button" size="sm" variant={item.id === guide.id ? "secondary" : "outline"}
        aria-pressed={item.id === guide.id} onClick={() => setSelected(item.id)}>{item.label}</Button>)}
    </div>
    <div className="rounded-lg border bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{guide.label}</h3>
        <Badge variant="outline">Esempio · {guide.stations.reduce((sum, station) => sum + station.durationMinutes, 0)} min</Badge>
      </div>
      <p className="mt-1 text-sm">{guide.focus}</p>
      <p className="mt-1 text-xs text-muted-foreground">Obiettivo d’esempio · {sessionObjectiveLabel(guide.objective)}</p>
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="rounded-lg border p-3">
        <h3 className="mb-2 font-semibold">Struttura della seduta tipo</h3>
        {TRAINING_ROTATION_PHASES.map(phase => {
          const stations = guide.stations.filter(station => station.phase === phase);
          return <div key={phase} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 border-t py-2 text-sm">
            <div><p className="font-medium">{phases[phase]}</p><p className="text-xs text-muted-foreground">{stations.reduce((sum, station) => sum + station.durationMinutes, 0)} min</p></div>
            <ul>{stations.map(station => <li key={station.title}>{station.durationMinutes}′ · {station.title}</li>)}</ul>
          </div>;
        })}
      </div>
      <div className="space-y-3 rounded-lg border p-3 text-sm">
        <div><h3 className="font-semibold">Indicazioni per il mister</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4">{guide.guidance.map(note => <li key={note}>{note}</li>)}</ul></div>
        <div><h3 className="font-semibold">Cosa osservare in campo</h3><p>{guide.observe}</p></div>
        {guide.transition && <div><h3 className="font-semibold">Passaggio ai Giovanissimi</h3><p>{guide.transition}</p></div>}
      </div>
    </div>
    {onPrepare && <div className="flex justify-end"><Button type="button" onClick={() => onPrepare(guide.id)}>Prepara proposta da questo modello</Button></div>}
  </section>;
}
