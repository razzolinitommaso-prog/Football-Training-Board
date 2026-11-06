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
  activities: (RotationActivity & { title: string })[];
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
  const [draftVersion, setDraftVersion] = useState(version);
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
    setDraft((old) => ({ ...old, [phase]: value }));
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
                  if (
                    !window.confirm(
                      checked
                        ? "Associare queste stazioni in contemporanea? Condivideranno la durata e i giocatori saranno distribuiti senza duplicati. Le rotazioni e i recuperi dei soli gruppi coinvolti andranno reimpostati."
                        : "Separare questa stazione? Il gruppo coinvolto ripartirà dalla prima distribuzione; gli altri gruppi restano invariati.",
                    )
                  )
                    return;
                  change(
                    phase,
                    associateStation(
                      turns,
                      activity.id,
                      previous.id,
                      checked === true,
                    ),
                  );
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
            <label className="flex items-center gap-2">
              {group.ids.length > 1 ? "Minuti per passaggio" : "Minuti"}
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
          {group.ids.length > 1 && activity.id === group.ids[0] && (
            <details className="rounded-md border bg-muted/10">
              <DisclosureSummary className="p-2 text-[11px] font-medium">
                Rotazioni giocatori · {group.indexes.length}{" "}
                {group.indexes.length === 1 ? "passaggio" : "passaggi"}
              </DisclosureSummary>
              <div className="space-y-2 border-t p-2">
                <p className="text-[10px] text-muted-foreground">
                  La prima distribuzione del mister guida gli scambi.{" "}
                  {used.size} giocatori distinti.
                </p>
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal text-[11px]"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        group.indexes.length > 1 &&
                        !window.confirm(
                          "Rigenerare gli scambi da questa prima distribuzione? Le modifiche ai passaggi di questo gruppo saranno sostituite.",
                        )
                      )
                        return;
                      change(phase, rotateStationGroup(turns, activity.id));
                    }}
                  >
                    Ruota su tutte le stazioni associate
                  </Button>
                )}
                {group.indexes.map((turnIndex, pass) => (
                  <div
                    key={turns[turnIndex].id}
                    className="space-y-1 border-t pt-2"
                  >
                    <p className="font-medium">Passaggio {pass + 1}</p>
                    {turns[turnIndex].stations.map((s) => (
                      <p key={s.linkId} className="break-words text-[10px]">
                        <strong>{title(s.linkId)}:</strong>{" "}
                        {names(s.playerIds) || "Da assegnare"}
                      </p>
                    ))}
                    {turnIndex < turns.length - 1 && (
                      <label className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        {pass < group.indexes.length - 1
                          ? "Recupero prima dello scambio"
                          : "Recupero prima della stazione successiva"}
                        <span className="flex items-center gap-1">
                          <Input
                            className="h-7 w-14"
                            aria-label={
                              "Recupero " +
                              activity.title +
                              " passaggio " +
                              (pass + 1)
                            }
                            type="number"
                            min={0}
                            max={300}
                            step="any"
                            disabled={disabled}
                            value={(turns[turnIndex].recoverySeconds ?? 0) / 60}
                            onChange={(e) => {
                              const min = Number(e.target.value);
                              if (
                                Number.isFinite(min) &&
                                min >= 0 &&
                                min <= 300
                              )
                                change(
                                  phase,
                                  turns.map((t, i) =>
                                    i === turnIndex
                                      ? {
                                          ...t,
                                          recoverySeconds: Math.round(min * 60),
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
                  </div>
                ))}
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
  return <>{children({ toolbar, stations })}</>;
}
