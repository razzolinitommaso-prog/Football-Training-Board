import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { useState, type ReactNode } from "react";
import { ChevronDown, Eye, ImageIcon, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type SessionOverviewExercise = {
  id: number;
  title: string;
  phase: string | null;
  duration: number | null;
  preview: string | null;
  principle: string | null;
  players: number | null;
  available: boolean;
};

type Props = {
  editor?: ReactNode;
  rotation?:ReactNode;
  phaseMinutes?:Record<string,number>;
  phaseRecoveries?: ReactNode[];
  metadata: { label: string; value: string }[];
  badges: ReactNode;
  principle: string;
  slot: string | null;
  exercises: SessionOverviewExercise[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  readOnly: boolean;
  duration: number | null;
  plannedMinutes: number;
  recovery: ReactNode;
  organization: ReactNode;
  onAdd: (phase: string) => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
};

const durationLabel=(minutes:number)=>{const seconds=Math.round(minutes*60);return seconds%60===0?`${seconds/60} min`:`${Math.floor(seconds/60)} min ${seconds%60} s`;};
const PHASES = [{ key: "iniziale", label: "Fase iniziale" }, { key: "centrale", label: "Fase centrale" }, { key: "finale", label: "Fase finale" }];

export function TrainingSessionOverview(props: Props) {
  const [removePhase, setRemovePhase] = useState<string | null>(null);
  const known = new Set(PHASES.map(phase => phase.key));
  const phases = props.exercises.some(exercise => !known.has(exercise.phase ?? ""))
    ? [...PHASES, { key: "", label: "Da assegnare a una fase" }] : PHASES;
  return <div className="space-y-4 pt-2">
    <div className="flex flex-wrap items-center gap-2">{props.badges}{props.readOnly && <Badge variant="outline">Sola consultazione</Badge>}</div>
    {props.editor}
    {props.metadata.length>0&&<dl className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-4">
      {props.metadata.map(item => <div key={item.label} className="min-w-0"><dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</dt><dd className="mt-1 break-words text-sm font-semibold">{item.value}</dd></div>)}
    </dl>}
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Obiettivo della seduta</p><p className="mt-1 text-sm font-semibold">{props.principle}</p></div>
      {props.slot && <Badge variant="outline">{props.slot}</Badge>}
    </div>
    {props.loading ? <p role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Caricamento stazioni...</p>
      : props.error ? <div role="alert" className="rounded-xl border p-4 text-sm"><p>Impossibile caricare le stazioni. Nessun dato è stato modificato.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={props.onRetry}>Riprova</Button></div>
      : <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{props.exercises.length} {props.exercises.length === 1 ? "stazione" : "stazioni"}</span><span>{durationLabel(props.plannedMinutes)}{props.duration ? ` / ${durationLabel(props.duration)}` : ""} pianificati</span></div>
        <div className="rounded-xl border bg-muted/10 p-3 text-sm">{props.recovery}</div>
        {props.rotation}
        {phases.map((phase, phaseIndex) => {
          const exercises = props.exercises.filter(exercise => phase.key ? exercise.phase === phase.key : !known.has(exercise.phase ?? ""));
          const minutes = props.phaseMinutes?.[phase.key] ?? exercises.reduce((sum, exercise) => sum + (exercise.duration ?? 0), 0);
          return <div key={phase.key || "unassigned"} className="space-y-3"><section className="rounded-xl border bg-background">
            <div className="flex items-center justify-between gap-2 px-3 pt-3">
              <h3 className="text-sm font-semibold">{phase.label}</h3>
              {!props.readOnly && <div className="flex shrink-0 items-center gap-1"><Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={() => props.onAdd(phase.key)} aria-label={`Aggiungi stazione: ${phase.label}`}><Plus className="h-3.5 w-3.5"/><span className="hidden min-[400px]:inline">Aggiungi</span></Button><Button type="button" size="icon" variant={removePhase === phase.key ? "secondary" : "ghost"} className="h-8 w-8" disabled={exercises.length === 0} aria-label={`Gestisci rimozione: ${phase.label}`} aria-pressed={removePhase === phase.key} onClick={() => setRemovePhase(removePhase === phase.key ? null : phase.key)}>−</Button></div>}
            </div>
            <details open className="group/phase">
              <DisclosureSummary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground outline-offset-2 [&::-webkit-details-marker]:hidden" indicator={false}><span>{exercises.length} {exercises.length === 1 ? "stazione" : "stazioni"} · {durationLabel(minutes)}</span><span className="flex items-center gap-1">Apri / chiudi<ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open/phase:rotate-180"/></span></DisclosureSummary>
              <div className="grid grid-cols-2 gap-2 p-2 pt-0 sm:gap-3 sm:p-3 sm:pt-0">
                {exercises.map(exercise => <article key={exercise.id} className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
                  <button type="button" disabled={!exercise.available} onClick={() => props.onView(exercise.id)} className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Apri stazione: ${exercise.title}`}>
                    <div className="flex h-24 items-center justify-center border-b bg-muted/20 p-1 sm:h-32">
                      {exercise.preview ? <img src={exercise.preview} alt={`Lavagna: ${exercise.title}`} className="h-full w-full object-contain"/> : <span className="flex flex-col items-center gap-2 p-2 text-center text-[11px] text-muted-foreground"><ImageIcon aria-hidden="true" className="h-6 w-6 opacity-50"/>Anteprima non disponibile</span>}
                    </div>
                    <div className="space-y-1 p-2 sm:p-3"><h4 className="break-words text-xs font-semibold leading-snug sm:text-sm"><span className="mr-1 text-[10px] font-normal text-muted-foreground">#{props.exercises.indexOf(exercise) + 1}</span>{exercise.title}</h4><p className="text-[11px] text-muted-foreground">{exercise.duration !== null ? durationLabel(exercise.duration) : "Durata da indicare"}{exercise.players ? ` · ${exercise.players} giocatori` : ""}</p>{exercise.principle && <p className="break-words text-[10px] text-primary">{exercise.principle}</p>}</div>
                  </button>
                  <div className="flex items-center justify-between gap-1 border-t p-1.5">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-[11px]" disabled={!exercise.available} onClick={() => props.onView(exercise.id)}><Eye className="mr-1 h-3 w-3"/>Dettagli</Button>
                    {!props.readOnly && <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Azioni: ${exercise.title}`}><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{exercise.available && <DropdownMenuItem onClick={() => props.onEdit(exercise.id)}><Pencil className="mr-2 h-4 w-4"/>Modifica stazione</DropdownMenuItem>}<DropdownMenuItem className="text-destructive" onClick={() => props.onRemove(exercise.id)}><Trash2 className="mr-2 h-4 w-4"/>Rimuovi dalla seduta</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
                  </div>
                  {!props.readOnly && removePhase === phase.key && <Button type="button" size="sm" variant="ghost" className="m-1 h-auto whitespace-normal text-[11px] text-destructive" onClick={() => props.onRemove(exercise.id)}>Rimuovi dalla seduta</Button>}
                </article>)}
                {!props.readOnly ? Array.from({length:Math.max(0, 2 - exercises.length)},(_,emptyIndex)=><button key={`empty-${emptyIndex}`} type="button" onClick={() => props.onAdd(phase.key)} className="flex min-h-36 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3 text-center text-xs text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Compila spazio vuoto: ${phase.label}`}><Plus aria-hidden="true" className="h-6 w-6"/><span>Aggiungi stazione</span><span className="text-[10px] text-muted-foreground">Spazio da compilare</span></button>) : exercises.length === 0 && <p className="col-span-2 py-5 text-center text-xs text-muted-foreground">Nessuna stazione in questa fase.</p>}
              </div>
            </details>
          </section>{phaseIndex < 2 && props.phaseRecoveries?.[phaseIndex]}</div>;
        })}
      </>}
    <details className="rounded-xl border"><DisclosureSummary className="cursor-pointer px-3 py-3 text-sm font-medium">Organizzazione e note</DisclosureSummary><div className="space-y-3 border-t p-3 text-sm">{props.organization}</div></details>
  </div>;
}
