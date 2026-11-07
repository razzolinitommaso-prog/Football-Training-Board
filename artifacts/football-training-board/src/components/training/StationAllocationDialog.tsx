import { useState } from "react";
import { type StationAllocationGroup, type RotationPhase } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const phaseNames = { iniziale: "fase iniziale", centrale: "fase centrale", finale: "fase finale" };

export function StationAllocationDialog({ phase, sourcePhase, groups, playerName, stationName, pending, error, onManual, onConfirm, onClose }: {
  phase: RotationPhase;
  sourcePhase: RotationPhase;
  groups: StationAllocationGroup[];
  playerName: (id: number) => string;
  stationName: (id: number) => string;
  pending: boolean;
  error: boolean;
  onManual: () => void;
  onConfirm: (indexes: number[], ids: number[]) => void;
  onClose: () => void;
}) {
  const [showGroups, setShowGroups] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const keys = groups.map(group => JSON.stringify([group.playerIds, group.confirmedAt, group.moveFrom]));
  const first = groups.findIndex(group => group.confirmedAt === undefined || group.moveFrom !== undefined);
  const checked = selection ?? (first >= 0 ? [keys[first]] : []);
  const indexes = groups.flatMap((group, index) =>
    checked.includes(keys[index]) && (group.confirmedAt === undefined || group.moveFrom !== undefined) ? [index] : []);

  const ids = indexes.flatMap(index => groups[index].playerIds);
  const moving = indexes.some(index => groups[index].moveFrom !== undefined);
  const available = groups.reduce((sum, group) => sum + group.playerIds.length, 0);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{showGroups ? "Giocatori proposti" : "Vuoi che questa stazione segua la rotazione della precedente?"}</DialogTitle>
        <DialogDescription>{phaseNames[phase][0].toUpperCase() + phaseNames[phase].slice(1)} · Gruppi dalla {phaseNames[sourcePhase]}</DialogDescription>
      </DialogHeader>
      {!showGroups ? <div className="grid gap-2">
        <Button type="button" onClick={() => setShowGroups(true)}>Sì · Mostra i gruppi proposti</Button>
        <Button type="button" variant="outline" onClick={onManual}>No · Scelgo io i giocatori</Button>
      </div> : <>
        {pending ? <p role="status" className="text-sm">Caricamento della rosa e dei gruppi…</p>
          : error ? <p role="alert" className="text-sm text-destructive">Gruppi non disponibili. Riprova oppure scegli i giocatori manualmente.</p>
          : <>
            <p className="text-sm font-medium">{available} disponibili · {ids.length} selezionati</p>
            <div className="space-y-2">
              {groups.map((group, index) => {
                const fixed = group.confirmedAt !== undefined && group.moveFrom === undefined;
                return <label key={group.playerIds.join(",")} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                  {!fixed && <Checkbox checked={indexes.includes(index)} onCheckedChange={value => {
                    setSelection(value ? [...checked, keys[index]] : checked.filter(key => key !== keys[index]));
                  }} />}
                  <span>
                    <span className="font-medium">Gruppo {index + 1} · {group.playerIds.length} giocatori</span>
                    {group.confirmedAt !== undefined && <span className="ml-2 text-xs text-muted-foreground">
                      {group.moveFrom !== undefined ? "Sposta da" : "Confermato in"} {stationName(group.confirmedAt)}
                    </span>}
                    <span className="mt-1 block text-xs text-muted-foreground">{group.playerIds.map(playerName).join(" · ")}</span>
                  </span>
                </label>;
              })}
            </div>
            {first < 0 ? <p className="text-sm text-muted-foreground">Non ci sono altri gruppi da proporre per questa fase.</p>
              : moving ? <p className="text-sm text-muted-foreground">Lo spostamento dei giocatori verrà applicato al salvataggio della stazione.</p>
              : <p className="text-sm text-muted-foreground">Per svolgere la stazione tutti insieme, seleziona tutti i gruppi prima di confermare.</p>}
          </>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onManual}>Scelta manuale</Button>
          <Button type="button" disabled={pending || error || !ids.length} onClick={() => onConfirm(indexes, ids)}>Conferma {ids.length} giocatori</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
