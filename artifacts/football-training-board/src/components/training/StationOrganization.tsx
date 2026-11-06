import { StationPassEditor } from "./StationPassEditor";
import {
  ExerciseTacticalBoard,
  detachExerciseBoard,
} from "@/components/exercise-tactical-board";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  boardPlayerIds,
  prepareStationOrganization,
  setStationPassPlayers,
  inheritPreviousStationGroups,
} from "@workspace/api-zod";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  assignStationPlayers,
  associateStation,
  rotateStationGroup,
  stationGroups,
  reconcileStationOrganization,
  excludeTrainingPlayers,
  validateTrainingRotations,
  TRAINING_ROTATION_PHASES,
  type TrainingRotations,
  type RotationPhase,
  type RotationActivity,
} from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { TrainingRosterPicker } from "./TrainingRosterPicker";
import { withApi } from "@/lib/api-base";
import { useAuth } from "@/hooks/use-auth";

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  teamId: number | null;
  available?: boolean;
};
export function StationOrganization({
  activities,
  saved,
  version,
  sessionId,
  teamId,
  teamIds,
  blockedPlayerIds,
  attendanceLoading,
  readOnly,
  onSave,
  onDirtyChange,
  onPreviewChange,
  children,
}: {
  activities: (RotationActivity & {
    title: string;
    boardJson?: string | null;
    equipment?: string | null;
  })[];
  saved?: TrainingRotations;
  version?: string;
  sessionId?: number;
  teamId: number | null;
  teamIds: number[];
  blockedPlayerIds: number[];
  attendanceLoading: boolean;
  readOnly: boolean;
  onSave: (
    value: TrainingRotations,
    recalculate: boolean,
    version?: string,
  ) => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
  onPreviewChange: (value: TrainingRotations | null) => void;
  children: (content: {
    toolbar: ReactNode;
    stations: Record<number, ReactNode>;
  }) => ReactNode;
}) {
  const { club, user } = useAuth();
  const [draft, setDraft] = useState(() =>
      reconcileStationOrganization(saved, activities),
    ),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    text: string;
    apply: () => void;
  } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draftVersion, setDraftVersion] = useState(version);
  const [customizing, setCustomizing] = useState<{
    phase: RotationPhase;
    id: number;
  } | null>(null);
  const [boardTarget, setBoardTarget] = useState<{
    phase: RotationPhase;
    id: number;
    pass: number;
  } | null>(null);
  const signature = JSON.stringify([saved, activities, version]);
  const roster = useQuery<Player[]>({
    queryKey: [
      "station-organization-roster",
      club?.id,
      user?.id,
      sessionId,
      teamId,
      teamIds.join(","),
    ],
    enabled: !!teamId,
    queryFn: async () => {
      if (sessionId) {
        const r = await fetch(
          withApi("/api/training-sessions/" + sessionId + "/roster"),
          { credentials: "include" },
        );
        if (!r.ok) throw Error("Rosa della seduta non disponibile");
        return r.json();
      }
      const rows = await Promise.all(
        (teamIds.length ? teamIds : teamId ? [teamId] : []).map(async (id) => {
          const r = await fetch(
            withApi("/api/training-rosters/" + id + "?scope=team"),
            { credentials: "include" },
          );
          if (!r.ok) throw Error("Rosa non disponibile");
          return (await r.json()).players as Player[];
        }),
      );
      return [...new Map(rows.flat().map((p) => [p.id, p])).values()];
    },
  });
  const players = (roster.data ?? [])
    .filter(
      (p) =>
        !blockedPlayerIds.includes(p.id) &&
        (sessionId != null || p.available !== false),
    )
    .map((p) => ({ ...p, available: true }));
  useEffect(() => {
    if (!dirty) {
      setDraft(reconcileStationOrganization(saved, activities));
      setDraftVersion(version);
    }
  }, [signature, dirty]);
  useEffect(() => {
    setDraft((old) => excludeTrainingPlayers(old, blockedPlayerIds));
  }, [blockedPlayerIds.join(",")]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    onPreviewChange(dirty ? draft : null);
  }, [dirty, draft, onPreviewChange]);
  const disabled =
    readOnly || attendanceLoading || roster.isLoading || !!roster.error || busy;
  const issue = roster.isSuccess
    ? validateTrainingRotations(
        draft,
        activities,
        players.map((p) => p.id),
      )
    : null;
  const title = (id: number) =>
    activities.find((a) => a.id === id)?.title ?? "Stazione";
  const names = (ids: number[]) =>
    ids
      .map((id) => {
        const p = players.find((p) => p.id === id);
        return p ? [p.lastName, p.firstName].join(" ") : "Giocatore " + id;
      })
      .join(" · ");
  function change(
    phase: RotationPhase,
    value: NonNullable<TrainingRotations[RotationPhase]>,
  ) {
    setDraft((old) =>
      excludeTrainingPlayers(
        prepareStationOrganization({ ...old, [phase]: value }),
        blockedPlayerIds,
      ),
    );
    setDirty(true);
    setError("");
  }
  async function save() {
    if (disabled || issue) return;
    setBusy(true);
    try {
      await onSave(draft, false, draftVersion);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito");
    } finally {
      setBusy(false);
    }
  }
  const stations: Record<number, ReactNode> = {};
  for (const phase of TRAINING_ROTATION_PHASES) {
    const turns = draft[phase] ?? [],
      phaseActivities = activities.filter((a) => a.phase === phase),
      groups = stationGroups(turns);
    phaseActivities.forEach((activity, index) => {
      const group = groups.find((g) => g.ids.includes(activity.id));
      if (!group) return;
      const station = turns
        .flatMap((t) => t.stations)
        .find((s) => s.linkId === activity.id)!;
      const previous = phaseActivities[index - 1];
      const associated = !!previous && group.ids.includes(previous.id);
      const firstAssignments = group.ids.map(
        (id) => turns.flatMap((t) => t.stations).find((s) => s.linkId === id)!,
      );
      const elsewhere = firstAssignments
        .filter((s) => s.linkId !== activity.id)
        .flatMap((s) => s.playerIds);
      const used = new Set(firstAssignments.flatMap((s) => s.playerIds));
      stations[activity.id] = (
        <div className="space-y-2 border-t px-2 py-2 text-xs sm:px-3">
          {previous && (
            <label className="flex items-start gap-2">
              <Checkbox
                checked={associated}
                disabled={disabled}
                aria-label={"Associa alla precedente: " + activity.title}
                onCheckedChange={(checked) => {
                  setConfirmation({
                    text: checked
                      ? "Associare queste stazioni? Verrà generato il giro completo dei gruppi; i recuperi dei soli gruppi coinvolti andranno reimpostati."
                      : "Separare questa stazione? Il gruppo coinvolto ripartirà dalla prima distribuzione; gli altri gruppi restano invariati.",
                    apply: () => {
                      let next = {
                        ...draft,
                        [phase]: associateStation(
                          turns,
                          activity.id,
                          previous.id,
                          checked === true,
                        ),
                      };
                      if (checked)
                        next = inheritPreviousStationGroups(
                          next,
                          phase,
                          activity.id,
                        );
                      setDraft(
                        excludeTrainingPlayers(
                          prepareStationOrganization(next),
                          blockedPlayerIds,
                        ),
                      );
                      setDirty(true);
                    },
                  });
                }}
              />
              <span>
                Associa alla precedente{" "}
                <span className="block text-[10px] text-muted-foreground">
                  {associated
                    ? "In contemporanea con " + title(previous.id)
                    : "Stazione indipendente"}
                </span>
              </span>
            </label>
          )}
          <p className="break-words text-[11px] text-muted-foreground">
            {names(station.playerIds) || "Giocatori da assegnare"}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex w-full min-w-0 flex-col items-start gap-1 text-[10px] sm:w-auto sm:flex-row sm:items-center sm:gap-2 sm:text-xs">
              <span className="break-normal">
                {group.ids.length > 1 ? "Minuti per passaggio" : "Minuti"}
              </span>
              <Input
                className="h-8 w-16 text-xs"
                aria-label={"Minuti stazione: " + activity.title}
                type="number"
                min={1 / 60}
                max={300}
                step="any"
                value={Number((station.seconds / 60).toFixed(3))}
                disabled={disabled}
                onChange={(e) => {
                  const minutes = Number(e.target.value);
                  if (
                    !Number.isFinite(minutes) ||
                    minutes <= 0 ||
                    minutes > 300
                  )
                    return;
                  change(
                    phase,
                    turns.map((t, i) =>
                      !group.indexes.includes(i)
                        ? t
                        : {
                            ...t,
                            stations: t.stations.map((s) => ({
                              ...s,
                              seconds: Math.max(1, Math.round(minutes * 60)),
                            })),
                          },
                    ),
                  );
                }}
              />
            </label>
            {!readOnly && (
              <TrainingRosterPicker
                sessionId={sessionId}
                teamId={teamId}
                players={players.filter((p) => !elsewhere.includes(p.id))}
                selectedIds={station.playerIds}
                excludedIds={[...blockedPlayerIds, ...elsewhere]}
                disabled={disabled}
                buttonLabel="Giocatori"
                showCount={false}
                onConfirm={(ids) =>
                  change(
                    phase,
                    assignStationPlayers(
                      turns,
                      activity.id,
                      ids.filter(
                        (id) =>
                          !elsewhere.includes(id) &&
                          players.some((p) => p.id === id),
                      ),
                    ),
                  )
                }
              />
            )}
          </div>
          {group.ids.length === 1 && group.indexes[0] < turns.length - 1 && (
            <label className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
              Recupero successivo
              <span className="flex items-center gap-1">
                <Input
                  className="h-7 w-14"
                  type="number"
                  min={0}
                  max={300}
                  disabled={disabled}
                  aria-label={"Recupero dopo stazione: " + activity.title}
                  value={(turns[group.indexes[0]].recoverySeconds ?? 0) / 60}
                  onChange={(e) => {
                    const minutes = Number(e.target.value);
                    if (
                      Number.isFinite(minutes) &&
                      minutes >= 0 &&
                      minutes <= 300
                    )
                      change(
                        phase,
                        turns.map((t, i) =>
                          i === group.indexes[0]
                            ? {
                                ...t,
                                recoverySeconds: Math.round(minutes * 60),
                              }
                            : t,
                        ),
                      );
                  }}
                />
                min
              </span>
            </label>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={disabled}
            onClick={() => setBoardTarget({ phase, id: activity.id, pass: 0 })}
          >
            Lavagna
          </Button>
          {group.ids.length > 1 && (
            <details
              open={expanded[phase + group.ids.join("-")] ?? false}
              className="rounded-md border bg-muted/10"
            >
              <DisclosureSummary
                onClick={(e) => {
                  e.preventDefault();
                  const key = phase + group.ids.join("-");
                  setExpanded((old) => ({ ...old, [key]: !old[key] }));
                }}
                className="p-2 text-[11px] font-medium"
              >
                Rotazioni giocatori · {group.indexes.length} passaggi
              </DisclosureSummary>
              <div className="space-y-2 border-t p-2">
                {group.indexes.map((index, pass) => {
                  const current = turns[index].stations.find(
                    (s) => s.linkId === activity.id,
                  )!;
                  return (
                    <div
                      key={turns[index].id}
                      className="space-y-1 border-b pb-2 text-[10px]"
                    >
                      <p className="font-medium">
                        Passaggio {pass + 1} · {current.seconds / 60} min
                        {current.manualPlayers ? " · Personalizzato" : ""}
                      </p>
                      <p className="break-words text-muted-foreground">
                        {names(current.playerIds) || "Da assegnare"}
                      </p>
                      <button
                        type="button"
                        className="text-primary underline"
                        disabled={disabled}
                        onClick={() =>
                          setBoardTarget({ phase, id: activity.id, pass })
                        }
                      >
                        Lavagna{current.boardJson ? " salvata" : ""}
                      </button>
                    </div>
                  );
                })}
                <p className="text-[11px]">
                  Totale attività:{" "}
                  <strong>
                    {group.indexes.reduce(
                      (sum, i) =>
                        sum +
                        Math.max(...turns[i].stations.map((s) => s.seconds)),
                      0,
                    ) / 60}{" "}
                    min
                  </strong>
                </p>
                {turns[group.indexes[0]].groupSource && (
                  <p className="text-[10px] text-muted-foreground">
                    Gruppi iniziali mantenuti dalla fase precedente.
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto w-full whitespace-normal text-[11px]"
                  onClick={() => setCustomizing({ phase, id: activity.id })}
                >
                  Personalizza scambi
                </Button>
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto whitespace-normal text-[10px]"
                    disabled={disabled}
                    onClick={() => {
                      setConfirmation({
                        text: "Rigenerare il giro completo? Le eccezioni manuali di questo gruppo saranno sostituite.",
                        apply: () =>
                          change(phase, rotateStationGroup(turns, activity.id)),
                      });
                    }}
                  >
                    Ripristina giro automatico
                  </Button>
                )}
              </div>
            </details>
          )}
        </div>
      );
    });
  }
  const toolbar = (
    <>
      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-primary/5 p-3 text-xs">
          <span>Organizzazione delle stazioni da salvare</span>
          <Button
            type="button"
            size="sm"
            disabled={disabled || !!issue}
            onClick={() => void save()}
          >
            Salva organizzazione
          </Button>
        </div>
      )}
      {(issue || error || roster.error) && (
        <p
          role="alert"
          className="rounded-lg border p-2 text-xs text-destructive"
        >
          {error || roster.error?.message || issue}
        </p>
      )}
    </>
  );
  const targetActivity = boardTarget
    ? activities.find((a) => a.id === boardTarget.id)
    : undefined;
  const targetGroup = boardTarget
    ? stationGroups(draft[boardTarget.phase] ?? []).find((g) =>
        g.ids.includes(boardTarget.id),
      )
    : undefined;
  const targetIndex = boardTarget
    ? targetGroup?.indexes[boardTarget.pass]
    : undefined;
  const targetStation =
    targetIndex !== undefined && boardTarget
      ? draft[boardTarget.phase]?.[targetIndex].stations.find(
          (s) => s.linkId === boardTarget.id,
        )
      : undefined;
  function updateAll(next: TrainingRotations) {
    setDraft(
      excludeTrainingPlayers(
        prepareStationOrganization(next),
        blockedPlayerIds,
      ),
    );
    setDirty(true);
    setError("");
  }
  async function saveBoard(raw: string, preview: string) {
    if (!boardTarget || targetIndex === undefined || !targetStation) return;
    const ids = boardPlayerIds(raw).filter((id) =>
      players.some((p) => p.id === id),
    );
    const turns = draft[boardTarget.phase] ?? [],
      changed =
        ids.length !== targetStation.playerIds.length ||
        ids.some((id) => !targetStation.playerIds.includes(id));
    let next = {
      ...draft,
      [boardTarget.phase]: changed
        ? setStationPassPlayers(turns, boardTarget.id, boardTarget.pass, ids)
        : turns,
    };
    next[boardTarget.phase] = next[boardTarget.phase]!.map((t, i) =>
      i === targetIndex
        ? {
            ...t,
            stations: t.stations.map((s) =>
              s.linkId === boardTarget.id
                ? {
                    ...s,
                    boardJson: raw,
                    boardPreview:
                      preview.startsWith("data:image/") &&
                      preview.length <= 4000000
                        ? preview
                        : undefined,
                  }
                : s,
            ),
          }
        : t,
    );
    next = excludeTrainingPlayers(
      prepareStationOrganization(next),
      blockedPlayerIds,
    );
    setDraft(next);
    setDirty(true);
    setBusy(true);
    try {
      await onSave(next, false, draftVersion);
      setDirty(false);
      setBoardTarget(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Lavagna non salvata: conserva le modifiche e riprova.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {children({ toolbar, stations })}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma organizzazione</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{confirmation?.text}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              Annulla
            </Button>
            <Button
              onClick={() => {
                confirmation?.apply();
                setConfirmation(null);
              }}
            >
              Conferma
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {customizing && (
        <StationPassEditor
          value={draft}
          phase={customizing.phase}
          id={customizing.id}
          activities={activities}
          players={players}
          disabled={disabled}
          readOnly={readOnly}
          sessionId={sessionId}
          teamId={teamId}
          onChange={updateAll}
          onOpenBoard={(phase, id, pass) => setBoardTarget({ phase, id, pass })}
          onClose={() => setCustomizing(null)}
        />
      )}
      <Dialog
        open={!!targetStation}
        onOpenChange={(open) => {
          if (!open && !busy) setBoardTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-w-xl min-w-0 grid-cols-[minmax(0,1fr)] max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
          <DialogHeader>
            <DialogTitle>
              Lavagna · {targetActivity?.title} · Passaggio{" "}
              {(boardTarget?.pass ?? 0) + 1}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {names(targetStation?.playerIds ?? []) || "Giocatori da assegnare"}
          </p>
          <p className="text-xs text-muted-foreground">
            I selezionati sono già schierati. La rosa disponibile segue le
            presenze della seduta. La lavagna e la rotazione vengono salvate
            insieme nella seduta.
          </p>
          {targetStation && !readOnly && (
            <ExerciseTacticalBoard
              title={
                (targetActivity?.title ?? "Stazione") +
                " · Passaggio " +
                ((boardTarget?.pass ?? 0) + 1)
              }
              teamId={teamId}
              programSessionId={sessionId}
              rotationContext={
                boardTarget && targetIndex !== undefined
                  ? {
                      sessionId,
                      linkId: boardTarget.id,
                      phase: boardTarget.phase,
                      pass: boardTarget.pass,
                      turnId: draft[boardTarget.phase]![targetIndex].id,
                    }
                  : undefined
              }
              value={
                targetStation.boardJson ??
                detachExerciseBoard(targetActivity?.boardJson)
              }
              rosterPlayerIds={targetStation.playerIds}
              allowedPlayerIds={players.map((p) => p.id)}
              rosterPlayers={players}
              equipment={targetActivity?.equipment}
              disabled={disabled}
              onSave={(result) =>
                void saveBoard(result.statoLavagnaJson, result.drawingData)
              }
            />
          )}
          {targetStation?.boardPreview && (
            <img
              src={targetStation.boardPreview}
              alt="Lavagna del passaggio salvata"
              className="max-h-96 w-full object-contain"
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
