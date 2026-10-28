export function divideExerciseMinutes<T extends { durationMinutes: string }>(stations: T[], totalMinutes: number): T[] {
  if (!stations.length || !Number.isFinite(totalMinutes) || totalMinutes <= 0) return stations;
  const seconds = Math.round(totalMinutes * 60);
  const base = Math.floor(seconds / stations.length);
  const remainder = seconds % stations.length;
  return stations.map((station, index) => ({ ...station, durationMinutes: String((base + (index < remainder ? 1 : 0)) / 60) }));
}

export function sumExerciseMinutes(stations: { durationMinutes: string }[]): number {
  const seconds = stations.reduce((sum, station) => {
    const minutes = Number(station.durationMinutes);
    return sum + (Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0);
  }, 0);
  return seconds / 60;
}

// A root equipment list describes the overall provision, not another copy of each station.
export function mergeExerciseMaterials(root: Partial<Record<string, number>>, stations: Partial<Record<string, number>>) {
  const result = { ...root };
  for (const [id, quantity] of Object.entries(stations)) result[id] = Math.max(Number(result[id]) || 0, Number(quantity) || 0);
  return result;
}
