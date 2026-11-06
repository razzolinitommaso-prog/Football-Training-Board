import { useState } from "react";
import {
  addStationPass,
  copyStationPassToFollowing,
  inheritPreviousStationGroups,
  prepareStationOrganization,
  repeatStationPlayers,
  setStationPassPlayers,
  stationGroups,
  TRAINING_ROTATION_PHASES,
  type TrainingRotations,
  type RotationPhase,
} from "@workspace/api-zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { TrainingRosterPicker } from "./TrainingRosterPicker";
type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId: number | null;
};
export function StationPassEditor({
  value,
  phase,
  id,
  activities,
  players,
  disabled,
  readOnly,
  sessionId,
  teamId,
  onChange,
  onOpenBoard,
  onClose,
}: {
  value: TrainingRotations;
  phase: RotationPhase;
  id: number;
  activities: { id: number; title: string }[];
  players: Player[];
  disabled: boolean;
  readOnly: boolean;
  sessionId?: number;
  teamId: number | null;
  onChange: (next: TrainingRotations) => void;
  onOpenBoard: (phase: RotationPhase, id: number, pass: number) => void;
  onClose: () => void;
}) {
  const [pass, setPass] = useState(0),
    [stationId, setStationId] = useState(id),
    [following, setFollowing] = useState(false);
  const turns = value[phase] ?? [],
    group = stationGroups(turns).find((g) => g.ids.includes(id));
  if (!group) return null;
  const index = group.indexes[Math.min(pass, group.indexes.length - 1)],
    turn = turns[index],
    station = turn.stations.find((s) => s.linkId === stationId)!;
  const previous =
    pass > 0
      ? turns[group.indexes[pass - 1]]?.stations.find(
          (s) => s.linkId === stationId,
        )
      : undefined;
  const names = (ids: number[]) =>
    ids
      .map((id) => {
        const p = players.find((p) => p.id === id);
        return p ? [p.lastName, p.firstName].join(" ") : "Giocatore " + id;
      })
      .join(" · ");
  const title = (id: number) =>
    activities.find((a) => a.id === id)?.title ?? "Stazione";
  function change(nextTurns: typeof turns) {
    let next = prepareStationOrganization({ ...value, [phase]: nextTurns });
    if (following) next = copyStationPassToFollowing(next, phase, id, pass);
    onChange(next);
  }
  const total =
    group.indexes.reduce(
      (sum, i) => sum + Math.max(...turns[i].stations.map((s) => s.seconds)),
      0,
    ) / 60;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl min-w-0 grid-cols-[minmax(0,1fr)] max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
        <DialogHeader>
          <DialogTitle>Personalizza scambi</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          La modifica aggiorna tutte le card del gruppo. Ogni bambino compare
          una sola volta nello stesso passaggio.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ScrollableSelect
            aria-label="Passaggio da modificare"
            value={pass}
            onValueChange={(v) => setPass(Number(v))}
          >
            {group.indexes.map((_, i) => (
              <option key={i} value={i}>
                Passaggio {i + 1}
              </option>
            ))}
          </ScrollableSelect>
          <ScrollableSelect
            aria-label="Stazione da modificare"
            value={stationId}
            onValueChange={(v) => setStationId(Number(v))}
          >
            {group.ids.map((id) => (
              <option key={id} value={id}>
                {title(id)}
              </option>
            ))}
          </ScrollableSelect>
        </div>
        {TRAINING_ROTATION_PHASES.indexOf(phase) > 0 && (
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              disabled={disabled}
              checked={!!turns[group.indexes[0]].groupSource}
              onCheckedChange={(checked) => {
                if (checked)
                  onChange(inheritPreviousStationGroups(value, phase, id));
                else
                  onChange({
                    ...value,
                    [phase]: turns.map((t, i) =>
                      group.indexes.includes(i)
                        ? { ...t, groupSource: undefined }
                        : t,
                    ),
                  });
              }}
            />
            Mantieni gruppi e ordine della fase precedente compatibile
          </label>
        )}
        <div className="space-y-2 rounded-lg border p-3 text-xs">
          {turn.stations.map((s) => (
            <p key={s.linkId}>
              <strong>
                {title(s.linkId)} · {s.playerIds.length}:
              </strong>{" "}
              {names(s.playerIds) || "Da assegnare"}
            </p>
          ))}
          <p className="text-muted-foreground">
            Attività del gruppo: {total} min · {group.indexes.length} passaggi
          </p>
        </div>
        {!readOnly && (
          <>
            <TrainingRosterPicker
              players={players}
              selectedIds={station.playerIds}
              sessionId={sessionId}
              teamId={teamId}
              disabled={disabled}
              buttonLabel="Modifica partecipanti del passaggio"
              onConfirm={(ids) =>
                change(
                  setStationPassPlayers(
                    turns,
                    stationId,
                    pass,
                    ids.filter((id) => players.some((p) => p.id === id)),
                  ),
                )
              }
            />
            {previous && (
              <TrainingRosterPicker
                players={players.filter((p) =>
                  previous.playerIds.includes(p.id),
                )}
                selectedIds={[]}
                sessionId={sessionId}
                teamId={teamId}
                disabled={disabled}
                buttonLabel="Scegli chi resta a ripetere"
                showCount={false}
                onConfirm={(ids) =>
                  change(
                    repeatStationPlayers(
                      turns,
                      stationId,
                      pass,
                      ids.filter((id) => players.some((p) => p.id === id)),
                    ),
                  )
                }
              />
            )}
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={following}
                onCheckedChange={(v) => setFollowing(v === true)}
                disabled={disabled}
              />
              Applica anche allo stesso passaggio nelle fasi successive
              compatibili
            </label>
            <p className="text-[11px] text-muted-foreground">
              Un bambino spostato viene tolto dall'altra stazione contemporanea.
              Una ripetizione nello stesso passaggio non aggiunge minuti. Se il
              numero di stazioni o passaggi cambia, la fase va adattata
              separatamente.
            </p>
            {index < turns.length - 1 && (
              <label className="flex items-center gap-2 text-xs">
                Recupero dopo il passaggio
                <Input
                  aria-label="Recupero dopo il passaggio scelto"
                  className="w-20"
                  type="number"
                  min={0}
                  max={300}
                  step="any"
                  disabled={disabled}
                  value={(turn.recoverySeconds ?? 0) / 60}
                  onChange={(e) => {
                    const min = Number(e.target.value);
                    if (Number.isFinite(min) && min >= 0 && min <= 300)
                      change(
                        turns.map((t, i) =>
                          i === index
                            ? { ...t, recoverySeconds: Math.round(min * 60) }
                            : t,
                        ),
                      );
                  }}
                />
                min
              </label>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onOpenBoard(phase, stationId, pass)}
          >
            Lavagna del passaggio
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled || turns.length >= 100}
              onClick={() => {
                change(addStationPass(turns, id));
                setPass(group.indexes.length);
              }}
            >
              ＋ Aggiungi passaggio
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            Fine
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Salva organizzazione per conservare le modifiche.
        </p>
      </DialogContent>
    </Dialog>
  );
}
