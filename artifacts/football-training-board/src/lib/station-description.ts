// Additive metadata before the existing inner-exercise suffix. No database migration.
const VARIANTS = "\n\n[FTB_STATION_VARIANTS]";
const EXERCISES = "\n\n[FTB_EXERCISE_STATIONS]";
export function parseStationDescription(raw?: string | null) {
  const text = raw ?? "";
  const exerciseIndex = text.indexOf(EXERCISES);
  const suffix = exerciseIndex >= 0 ? text.slice(exerciseIndex) : "";
  const head = exerciseIndex >= 0 ? text.slice(0, exerciseIndex) : text;
  const index = head.lastIndexOf(VARIANTS);
  if (index >= 0) {
    try {
      const parsed = JSON.parse(head.slice(index + VARIANTS.length));
      if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) return { description: head.slice(0, index).trim(), variants: parsed as string[], suffix };
    } catch { /* Preserve unrecognized or malformed legacy text verbatim. */ }
  }
  return { description: head, variants: [] as string[], suffix };
}
export function composeStationDescription(description: string, variants: string[], suffix = ""): string | null {
  const values = variants.map(value => value.trim()).filter(Boolean);
  return (description.trim() + (values.length ? VARIANTS + JSON.stringify(values) : "") + suffix) || null;
}
