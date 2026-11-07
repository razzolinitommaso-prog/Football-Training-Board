import { stationGroups } from "./station-organization";
import { TRAINING_ROTATION_PHASES, type RotationPhase, type RotationStation, type TrainingRotations } from "./training-rotations";

export type StationAllocationGroup = {
  playerIds: number[];
  confirmedAt?: number;
  moveFrom?: number;
};

/** First assignments describe the original groups even after the circuit has rotated. */
function phaseStations(rotations: TrainingRotations, phase: RotationPhase) {
  const turns = rotations[phase] ?? [];
  const first = new Map<number, RotationStation>();
  for (const turn of turns) {
    for (const station of turn.stations) {
      if (!first.has(station.linkId)) first.set(station.linkId, station);
    }
  }
  return [...first.values()];
}

function stationPartitions(station: RotationStation) {
  const remaining = new Set(station.playerIds);
  const groups = (station.confirmedGroups ?? []).map(group => group.filter(id => remaining.delete(id)));
  return [...groups, [...remaining]].filter(group => group.length);
}

export function stationAllocationProposal(
  rotations: TrainingRotations,
  phase: RotationPhase,
  availableIds: readonly number[],
) {
  const current = phaseStations(rotations, phase);
  const priorPhases = TRAINING_ROTATION_PHASES.slice(0, TRAINING_ROTATION_PHASES.indexOf(phase)).reverse();
  const sourcePhase = current.length ? phase : priorPhases.find(key => phaseStations(rotations, key).length);
  if (!sourcePhase) return null;

  const previousGroups = priorPhases.map(key => phaseStations(rotations, key).flatMap(stationPartitions))
    .find(groups => groups.length) ?? [];
  const currentGroups = current.flatMap(stationPartitions);
  const reference = previousGroups.length ? previousGroups : currentGroups;
  const remaining = new Set([...availableIds].sort((a, b) => a - b));
  const assigned = new Map<number, number>();
  for (const station of current) {
    for (const id of station.playerIds) if (!assigned.has(id)) assigned.set(id, station.linkId);
  }

  const groups: StationAllocationGroup[] = [];
  for (const ids of [...reference, ...currentGroups, [...remaining]]) {
    const byStation = new Map<number | undefined, number[]>();
    for (const id of ids) {
      if (!remaining.delete(id)) continue;
      const owner = assigned.get(id);
      byStation.set(owner, [...(byStation.get(owner) ?? []), id]);
    }
    for (const [confirmedAt, playerIds] of byStation) groups.push({ playerIds, confirmedAt });
  }

  if (groups.every(group => group.confirmedAt !== undefined)) {
    const independent = new Set(stationGroups(rotations[phase] ?? [])
      .filter(group => group.ids.length === 1).map(group => group.ids[0]));
    const station = [...current].reverse().find(item =>
      independent.has(item.linkId) && groups.filter(group => group.confirmedAt === item.linkId).length > 1);
    if (station) {
      const ownedGroups = groups.filter(group => group.confirmedAt === station.linkId);
      for (const group of ownedGroups.slice(1)) group.moveFrom = station.linkId;
    }
  }

  return { sourcePhase, groups };
}
