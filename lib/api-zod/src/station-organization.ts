import {
  boardPlayerIds,
  syncExerciseBoardRoster,
} from "./exercise-board-roster";
import { boardMaterialQuantities } from "./exercise-board-materials";
import {
  TRAINING_ROTATION_PHASES,
  type TrainingRotations,
  type RotationActivity,
  type RotationPhase,
  type RotationTurn,
} from "./training-rotations";

export type StationSource = { seconds: number; playerIds: number[] };
export type StationSources = Record<string, StationSource>;
export type StationGroup = { ids: number[]; indexes: number[] };
const unique = (ids: number[]) => [
  ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
];
export function stationGroups(turns: RotationTurn[]): StationGroup[] {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    if (!parent.has(id)) parent.set(id, id);
    const p = parent.get(id)!;
    return p === id ? id : find(p);
  };
  for (const turn of turns)
    for (const station of turn.stations) {
      const root = find(turn.stations[0].linkId);
      parent.set(find(station.linkId), root);
    }
  const groups = new Map<number, StationGroup>();
  turns.forEach((turn, index) =>
    turn.stations.forEach((station) => {
      const root = find(station.linkId);
      const group = groups.get(root) ?? { ids: [], indexes: [] };
      if (!group.ids.includes(station.linkId)) group.ids.push(station.linkId);
      if (!group.indexes.includes(index)) group.indexes.push(index);
      groups.set(root, group);
    }),
  );
  return [...groups.values()];
}
export function firstStationAssignment(
  rotations: TrainingRotations,
  id: number,
) {
  return TRAINING_ROTATION_PHASES.flatMap((phase) => rotations[phase] ?? [])
    .flatMap((turn) => turn.stations)
    .find((station) => station.linkId === id);
}
export function stationSources(activities: RotationActivity[]): StationSources {
  return Object.fromEntries(
    activities.map((a) => [
      String(a.id),
      { seconds: a.seconds, playerIds: unique(a.playerIds) },
    ]),
  );
}
/** Read projection only: missing/new stations are independent, old custom allocations survive. */
export function reconcileStationOrganization(
  saved: TrainingRotations | undefined,
  activities: RotationActivity[],
  sources?: StationSources,
): TrainingRotations {
  const next: TrainingRotations = {};
  for (const phase of TRAINING_ROTATION_PHASES) {
    const items = activities.filter((a) => a.phase === phase);
    const turns = (saved?.[phase] ?? [])
      .map((turn) => ({
        ...turn,
        stations: turn.stations
          .filter((s) => items.some((a) => a.id === s.linkId))
          .map((s) => ({ ...s, playerIds: unique(s.playerIds) })),
      }))
      .filter((turn) => turn.stations.length);
    for (const item of items)
      if (
        !turns.some((turn) => turn.stations.some((s) => s.linkId === item.id))
      )
        turns.push({
          id: "station-" + item.id,
          stations: [
            {
              linkId: item.id,
              seconds: Math.max(1, Math.round(item.seconds || 900)),
              playerIds: unique(item.playerIds),
            },
          ],
        });
    if (turns.length)
      turns[turns.length - 1] = {
        ...turns[turns.length - 1],
        recoverySeconds: 0,
      };
    next[phase] = turns;
    for (const item of items) {
      const previous = sources?.[item.id];
      if (!previous) continue;
      if (previous.seconds !== item.seconds) {
        const group: StationGroup | undefined = stationGroups(
          next[phase]!,
        ).find((g) => g.ids.includes(item.id));
        next[phase] = next[phase]!.map((turn) => ({
          ...turn,
          stations: turn.stations.map((s) =>
            group?.ids.includes(s.linkId)
              ? { ...s, seconds: Math.max(1, Math.round(item.seconds || 900)) }
              : s,
          ),
        }));
      }
      if (
        JSON.stringify(previous.playerIds) !==
        JSON.stringify(unique(item.playerIds))
      )
        next[phase] = assignStationPlayers(
          next[phase]!,
          item.id,
          item.playerIds,
        );
    }
  }
  for (const phase of TRAINING_ROTATION_PHASES)
    for (const group of stationGroups(next[phase] ?? [])) {
      if (
        group.ids.length > 1 &&
        group.indexes.length === 1 &&
        !next[phase]![group.indexes[0]].stations.some((s) => s.manualPlayers)
      )
        next[phase] = rotateStationGroup(next[phase]!, group.ids[0]);
    }
  return prepareStationOrganization(next);
}
/** Redistribute following passages from the coach's first assignment, never across independent groups. */
export function assignStationPlayers(
  turns: RotationTurn[],
  id: number,
  ids: number[],
): RotationTurn[] {
  const group = stationGroups(turns).find((g) => g.ids.includes(id));
  if (!group) return turns;
  const chosen = unique(ids),
    used = new Set(chosen);
  const first = group.ids.map((linkId) => ({
    linkId,
    playerIds:
      linkId === id
        ? chosen
        : unique(
            turns.flatMap((t) => t.stations).find((s) => s.linkId === linkId)
              ?.playerIds ?? [],
          ).filter((player) => !used.has(player)),
  }));
  first.forEach((s) => {
    s.playerIds = s.playerIds.filter((player) => {
      if (s.linkId === id) return true;
      if (used.has(player)) return false;
      used.add(player);
      return true;
    });
  });
  return turns.map((turn, index) => {
    const pass = group.indexes.indexOf(index);
    if (pass < 0) return turn;
    return {
      ...turn,
      groupSource: undefined,
      stations:
        turn.stations.some((s) => s.manualPlayers) && pass > 0
          ? turn.stations
          : turn.stations.map((s) => ({
              ...s,
              playerIds: [
                ...first[
                  (group.ids.indexOf(s.linkId) -
                    (pass % first.length) +
                    first.length) %
                    first.length
                ].playerIds,
              ],
            })),
    };
  });
}
export function associateStation(
  turns: RotationTurn[],
  id: number,
  previousId: number,
  associated: boolean,
): RotationTurn[] {
  const groups = stationGroups(turns),
    own = groups.find((g) => g.ids.includes(id)),
    previous = groups.find((g) => g.ids.includes(previousId));
  if (!own || !previous || id === previousId) return turns;
  if (associated && own === previous) return turns;
  const affected = associated
    ? [...new Set([...own.indexes, ...previous.indexes])]
    : own.indexes;
  const ids = associated ? unique([...previous.ids, ...own.ids]) : own.ids;
  const first = ids.map((linkId) => ({
    ...turns.flatMap((t) => t.stations).find((s) => s.linkId === linkId)!,
    playerIds: [
      ...turns.flatMap((t) => t.stations).find((s) => s.linkId === linkId)!
        .playerIds,
    ],
  }));
  const seen = new Set<number>();
  let overlap = false;
  first.forEach((s) =>
    s.playerIds.forEach((player) => {
      if (seen.has(player)) overlap = true;
      seen.add(player);
    }),
  );
  if (associated && overlap) {
    const pool = [...seen];
    first.forEach((s, i) => {
      s.playerIds = pool.filter((_, index) => index % first.length === i);
    });
  }
  const baseIndex = Math.min(...affected),
    base = turns[baseIndex];
  const replacements: RotationTurn[] = associated
    ? [
        {
          id: "associated-" + previousId + "-" + id,
          stations: first.map((s) => ({ ...s, seconds: first[0].seconds })),
          recoverySeconds: 0,
        },
      ]
    : [
        ...(first.filter((s) => s.linkId !== id).length
          ? [
              {
                id: base.id + "-rest",
                stations: first.filter((s) => s.linkId !== id),
                recoverySeconds: 0,
              },
            ]
          : []),
        {
          id: "station-" + id,
          stations: first.filter((s) => s.linkId === id),
          recoverySeconds: 0,
        },
      ];
  const result = turns.flatMap((turn, index) =>
    index === baseIndex ? replacements : affected.includes(index) ? [] : [turn],
  );
  if (result.length)
    result[result.length - 1] = {
      ...result[result.length - 1],
      recoverySeconds: 0,
    };
  return associated ? rotateStationGroup(result, id) : result;
}
export function rotateStationGroup(
  turns: RotationTurn[],
  id: number,
): RotationTurn[] {
  const group = stationGroups(turns).find((g) => g.ids.includes(id));
  if (!group || group.ids.length < 2) return turns;
  const first = group.ids.map(
    (linkId) =>
      turns.flatMap((t) => t.stations).find((s) => s.linkId === linkId)!,
  );
  const passes = first.map((_, index) => ({
    id: "rotation-" + id + "-" + index,
    groupSource: turns[group.indexes[0]].groupSource,
    recoverySeconds:
      group.indexes[index] === undefined || group.indexes.length === 1
        ? 0
        : (turns[group.indexes[index]].recoverySeconds ?? 0),
    stations: first.map((station, i) => ({
      ...station,
      manualPlayers: undefined,
      boardJson: turns[group.indexes[index]]?.stations.find(s=>s.linkId===station.linkId)?.boardJson,
      boardPreview: turns[group.indexes[index]]?.stations.find(s=>s.linkId===station.linkId)?.boardPreview,
      playerIds: [
        ...first[(i - index + first.length) % first.length].playerIds,
      ],
    })),
  }));
  passes[passes.length - 1].recoverySeconds =
    group.indexes.at(-1)! < turns.length - 1
      ? (turns[group.indexes.at(-1)!].recoverySeconds ?? 0)
      : 0;
  return turns.flatMap((turn, index) =>
    index === group.indexes[0]
      ? passes
      : group.indexes.includes(index)
        ? []
        : [turn],
  );
}
/** Concurrent supplies add up; sequential groups/passages reuse the same supplies. */
export function sessionMaterialQuantities(
  rotations: TrainingRotations,
  materials: Record<string, Record<string, number>>,
): Record<string, number> {
  const total: Record<string, number> = {};
  for (const phase of TRAINING_ROTATION_PHASES)
    for (const turn of rotations[phase] ?? []) {
      const concurrent: Record<string, number> = {};
      for (const station of turn.stations) {
        const required = { ...(materials[station.linkId] ?? {}) };
        for (const [key, quantity] of Object.entries(
          boardMaterialQuantities(station.boardJson),
        ))
          required[key] = Math.max(required[key] ?? 0, quantity);
        for (const [key, quantity] of Object.entries(required))
          concurrent[key] = (concurrent[key] ?? 0) + Math.max(0, quantity);
      }
      for (const [key, value] of Object.entries(concurrent))
        total[key] = Math.max(total[key] ?? 0, value);
    }
  return total;
}

/** Change one passage only. Selecting a player transfers them from a concurrent station. */
export function setStationPassPlayers(
  turns: RotationTurn[],
  id: number,
  pass: number,
  ids: number[],
): RotationTurn[] {
  const group = stationGroups(turns).find((g) => g.ids.includes(id));
  const index = group?.indexes[pass];
  if (index === undefined) return turns;
  const chosen = unique(ids);
  return turns.map((turn, i) =>
    i !== index
      ? turn
      : {
          ...turn,
          stations: turn.stations.map((station) => ({
            ...station,
            manualPlayers: true,
            playerIds:
              station.linkId === id
                ? chosen
                : station.playerIds.filter(
                    (player) => !chosen.includes(player),
                  ),
          })),
        },
  );
}
export function repeatStationPlayers(
  turns: RotationTurn[],
  id: number,
  pass: number,
  ids: number[],
): RotationTurn[] {
  const group = stationGroups(turns).find((g) => g.ids.includes(id));
  if (!group || pass < 1) return turns;
  const previous = turns[group.indexes[pass - 1]]?.stations.find(
      (s) => s.linkId === id,
    ),
    current = turns[group.indexes[pass]]?.stations.find((s) => s.linkId === id);
  return previous && current
    ? setStationPassPlayers(
        turns,
        id,
        pass,
        unique([
          ...current.playerIds,
          ...ids.filter((player) => previous.playerIds.includes(player)),
        ]),
      )
    : turns;
}
export function addStationPass(
  turns: RotationTurn[],
  id: number,
): RotationTurn[] {
  const group = stationGroups(turns).find((g) => g.ids.includes(id));
  if (!group || turns.length >= 100) return turns;
  const last = group.indexes.at(-1)!,
    first = group.ids.map(
      (linkId) =>
        turns.flatMap((t) => t.stations).find((s) => s.linkId === linkId)!,
    );
  const pass = group.indexes.length;
  const next = {
    id: "pass-" + id + "-" + Date.now(),
    stations: first.map((s, i) => ({
      ...s,
      manualPlayers: undefined,
      boardJson: undefined,
      boardPreview: undefined,
      playerIds: [
        ...first[(i - (pass % first.length) + first.length) % first.length]
          .playerIds,
      ],
    })),
    recoverySeconds: 0,
  };
  return turns.flatMap((t, i) => (i === last ? [t, next] : [t]));
}
/** Carry the original starting order, never the final positions after rotation. */
export function inheritStationGroups(
  rotations: TrainingRotations,
  phase: RotationPhase,
  id: number,
  sourcePhase: RotationPhase,
  sourceId: number,
): TrainingRotations {
  if (
    TRAINING_ROTATION_PHASES.indexOf(sourcePhase) >=
    TRAINING_ROTATION_PHASES.indexOf(phase)
  )
    return rotations;
  const group = stationGroups(rotations[phase] ?? []).find((g) =>
      g.ids.includes(id),
    ),
    source = stationGroups(rotations[sourcePhase] ?? []).find((g) =>
      g.ids.includes(sourceId),
    );
  if (!group || !source || group.ids.length !== source.ids.length)
    return rotations;
  return resolveInheritedStationGroups({
    ...rotations,
    [phase]: rotations[phase]!.map((t, i) =>
      group.indexes.includes(i)
        ? { ...t, groupSource: { phase: sourcePhase, linkId: sourceId } }
        : t,
    ),
  });
}
export function previousPhaseWithPlayers(rotations: TrainingRotations, phase: RotationPhase) {
  const source = TRAINING_ROTATION_PHASES.slice(0, TRAINING_ROTATION_PHASES.indexOf(phase))
    .reverse()
    .find(previous => rotations[previous]?.length);
  if (source && rotations[source]?.some(turn => turn.stations.some(station => station.playerIds.length))) {
    return source;
  }
  return undefined;
}

export function inheritPreviousPhasePlayers(
  rotations: TrainingRotations,
  phase: RotationPhase,
  stationId: number,
): TrainingRotations {
  const turns = rotations[phase] ?? [];
  const group = stationGroups(turns).find(candidate => candidate.ids.includes(stationId));
  if (group?.ids.length !== 1) return rotations;
  const source = previousPhaseWithPlayers(rotations, phase);
  if (!source) return rotations;

  return prepareStationOrganization({
    ...rotations,
    [phase]: turns.map((turn, index) => {
      if (!group.indexes.includes(index)) return turn;
      return {
        ...turn,
        groupSource: { phase: source },
        stations: index === group.indexes[0]
          ? turn.stations.map(station => ({ ...station, manualPlayers: undefined }))
          : turn.stations,
      };
    }),
  });
}

export function resolveInheritedStationGroups(
  rotations: TrainingRotations,
): TrainingRotations {
  const next = { ...rotations };
  for (const phase of TRAINING_ROTATION_PHASES) {
    let turns = next[phase] ?? [];
    for (const group of stationGroups(turns)) {
      const origin = turns[group.indexes[0]].groupSource;
      if (
        !origin ||
        TRAINING_ROTATION_PHASES.indexOf(origin.phase) >=
          TRAINING_ROTATION_PHASES.indexOf(phase)
      )
        continue;
      const sourceTurns = next[origin.phase] ?? [];
      const wholePhase = origin.linkId === undefined;
      const sourceId = origin.linkId;
      const source = sourceId === undefined ? undefined : stationGroups(sourceTurns).find(g => g.ids.includes(sourceId));
      const assignments = wholePhase && group.ids.length === 1 && sourceTurns.length
        ? [unique(sourceTurns.flatMap(turn => turn.stations.flatMap(station => station.playerIds)))]
        : source && source.ids.length === group.ids.length
          ? source.ids.map(linkId => sourceTurns.flatMap(turn => turn.stations).find(station => station.linkId === linkId)!.playerIds)
          : [];
      if (!assignments.length) {
        turns = turns.map((t, i) =>
          group.indexes.includes(i) ? { ...t, groupSource: undefined } : t,
        );
        continue;
      }
      turns = turns.map((turn, index) => {
        const pass = group.indexes.indexOf(index);
        if (pass < 0 || turn.stations.some((s) => s.manualPlayers)) return turn;
        return {
          ...turn,
          stations: turn.stations.map((s) => ({
            ...s,
            playerIds: [
              ...assignments[
                (group.ids.indexOf(s.linkId) -
                  (pass % assignments.length) +
                  assignments.length) %
                  assignments.length
              ],
            ],
          })),
        };
      });
    }
    next[phase] = turns;
  }
  return next;
}
export function inheritPreviousStationGroups(
  rotations: TrainingRotations,
  phase: RotationPhase,
  id: number,
): TrainingRotations {
  const target = stationGroups(rotations[phase] ?? []).find((g) =>
    g.ids.includes(id),
  );
  if (!target) return rotations;
  for (const previous of [...TRAINING_ROTATION_PHASES]
    .slice(0, TRAINING_ROTATION_PHASES.indexOf(phase))
    .reverse()) {
    const candidates = stationGroups(rotations[previous] ?? []).filter(
      (g) => g.ids.length === target.ids.length,
    );
    if (candidates.length !== 1) continue;
    return inheritStationGroups(
      rotations,
      phase,
      id,
      previous,
      candidates[0].ids[0],
    );
  }
  return rotations;
}

export function prepareStationOrganization(
  rotations: TrainingRotations,
): TrainingRotations {
  const next = resolveInheritedStationGroups(rotations);
  for (const phase of TRAINING_ROTATION_PHASES)
    next[phase] = (next[phase] ?? []).map((turn) => ({
      ...turn,
      stations: turn.stations.map((station) => {
        const confirmedGroups = station.confirmedGroups?.map(group =>
          group.filter(id => station.playerIds.includes(id))).filter(group => group.length);
        const assignment = confirmedGroups ? { ...station, confirmedGroups } : station;
        if (!station.boardJson) return assignment;
        const ids = boardPlayerIds(station.boardJson);
        if (
          ids.length === station.playerIds.length &&
          ids.every((id) => station.playerIds.includes(id))
        )
          return assignment;
        return {
          ...assignment,
          boardJson: syncExerciseBoardRoster(
            station.boardJson,
            station.playerIds,
          ),
          boardPreview: undefined,
        };
      }),
    }));
  return next;
}
export function copyStationPassToFollowing(
  rotations: TrainingRotations,
  phase: RotationPhase,
  id: number,
  pass: number,
): TrainingRotations {
  const sourceTurns = rotations[phase] ?? [],
    source = stationGroups(sourceTurns).find((g) => g.ids.includes(id));
  if (!source) return rotations;
  const current = sourceTurns[source.indexes[pass]];
  if (!current) return rotations;
  const next = { ...rotations };
  for (const later of TRAINING_ROTATION_PHASES.slice(
    TRAINING_ROTATION_PHASES.indexOf(phase) + 1,
  )) {
    const groups = stationGroups(next[later] ?? []).filter(
      (g) => g.ids.length === source.ids.length,
    );
    if (groups.length !== 1) continue;
    const group = groups[0],
      index = group.indexes[pass];
    if (index === undefined) continue;
    next[later] = next[later]!.map((turn, i) =>
      i !== index
        ? turn
        : {
            ...turn,
            stations: turn.stations.map((station) => ({
              ...station,
              manualPlayers: true,
              playerIds: [
                ...(current.stations.find(
                  (s) =>
                    s.linkId === source.ids[group.ids.indexOf(station.linkId)],
                )?.playerIds ?? []),
              ],
            })),
          },
    );
  }
  return prepareStationOrganization(next);
}
