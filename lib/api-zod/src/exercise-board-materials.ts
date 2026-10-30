type Quantities = Record<string, number>;
function document(raw?: string | null): { extra: Record<string, unknown>; items: Quantities; notes: string } {
  try {
    const parsed = JSON.parse(raw || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)) {
      const items: Quantities = {};
      for (const [key, value] of Object.entries(parsed.items)) { const quantity = Number(value); if (Number.isFinite(quantity) && quantity > 0) items[key] = quantity; }
      return { extra: parsed, items, notes: typeof parsed.notes === "string" ? parsed.notes : "" };
    }
  } catch { /* A pre-existing handwritten materials list is retained as notes. */ }
  return { extra: {}, items: {}, notes: raw ?? "" };
}
export function readMaterialSelection(raw?: string | null): Quantities { return document(raw).items; }
export function materialNotes(raw?: string | null): string { return document(raw).notes; }
export function writeMaterialSelection(selection: Partial<Quantities>, previous?: string | null): string {
  const current = document(previous);
  const items = Object.fromEntries(Object.entries(selection).filter(([, qty]) => Number.isFinite(Number(qty)) && Number(qty) > 0).map(([key, qty]) => [key, Number(qty)]));
  if (!Object.keys(items).length) return current.notes;
  return JSON.stringify({ ...current.extra, version: 1, items, ...(current.notes ? { notes: current.notes } : {}) });
}
export function writeMaterialNotes(previous: string | null | undefined, notes: string): string {
  const current = document(previous);
  return writeMaterialSelection(current.items, JSON.stringify({ ...current.extra, items: current.items, notes }));
}
const MATERIALS: Record<string, string> = {
  cone: "coni", ball: "palloni", disc: "cinesini", cinesino: "cinesini", sagoma: "sagome", flag: "bandierine",
  ladder: "scalette", pole: "paletti", vest: "casacche", medusa: "meduse", freeKickWall: "barriere_punizioni",
  inflatableDummy: "dummy_gonfiabili", plyoBox: "box_pliometrico", goalMini: "porticine", goal5: "porte_ridotte",
  goal7: "porte_ridotte", goal9: "porte_ridotte", goal11: "porte_regolamentari", goal: "porte_ridotte", goalLarge: "porte_ridotte",
};
export function boardMaterialQuantities(raw?: string | null): Quantities {
  if (!raw) return {};
  try {
    const board = JSON.parse(raw), data = board?.data;
    if (!data || typeof data !== "object") return {};
    const snapshots: unknown[] = [data.elements, ...(Array.isArray(data.animation?.frames) ? data.animation.frames.map((frame: { elements?: unknown }) => frame?.elements) : [])];
    const maximum: Quantities = {};
    for (const snapshot of snapshots) {
      if (!Array.isArray(snapshot)) continue;
      const counts: Quantities = {};
      for (const item of snapshot) {
        if (!item || typeof item !== "object") continue;
        const id = item.type === "hurdle" ? "ostacoli_" + (["20", "40", "60", "80"].includes(String(item.equipFormat)) ? item.equipFormat : "40") : MATERIALS[item.type];
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }
      // Repeated frames are the same equipment in motion, not extra supplies.
      for (const [id, quantity] of Object.entries(counts)) maximum[id] = Math.max(maximum[id] ?? 0, quantity);
    }
    return maximum;
  } catch { return {}; }
}
export function mergeBoardMaterials(previous: string | null | undefined, board: string): string {
  const derived = boardMaterialQuantities(board);
  if (!Object.keys(derived).length) return previous ?? "";
  const merged = readMaterialSelection(previous);
  for (const [id, quantity] of Object.entries(derived)) merged[id] = Math.max(merged[id] ?? 0, quantity);
  return writeMaterialSelection(merged, previous);
}
