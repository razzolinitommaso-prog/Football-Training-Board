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
  return next;
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
      stations: turn.stations.map((s) => ({
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
          id: "associated-" + first.map((s) => s.linkId).join("-"),
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
  return result;
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
    recoverySeconds:
      group.indexes[index] === undefined
        ? 0
        : (turns[group.indexes[index]].recoverySeconds ?? 0),
    stations: first.map((station, i) => ({
      ...station,
      playerIds: [
        ...first[(i - index + first.length) % first.length].playerIds,
      ],
    })),
  }));
  passes[passes.length - 1].recoverySeconds = 0;
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
      for (const station of turn.stations)
        for (const [key, value] of Object.entries(
          materials[station.linkId] ?? {},
        ))
          concurrent[key] = (concurrent[key] ?? 0) + Math.max(0, value);
      for (const [key, value] of Object.entries(concurrent))
        total[key] = Math.max(total[key] ?? 0, value);
    }
  return total;
}
