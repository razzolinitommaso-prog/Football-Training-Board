const MATCH_PLAN_MARKER = "[FTB_MATCH_PLAN]";

export function splitPublicNotesAndPlan(raw?: string | null): { publicNotes: string | null; plan: unknown | null } {
  const text = (raw ?? "").trim();
  if (!text) return { publicNotes: null, plan: null };
  const idx = text.lastIndexOf(MATCH_PLAN_MARKER);
  if (idx < 0) return { publicNotes: text, plan: null };
  const before = text.slice(0, idx).trim();
  const jsonPart = text.slice(idx + MATCH_PLAN_MARKER.length).trim();
  let parsed: unknown = null;
  try {
    parsed = jsonPart ? JSON.parse(jsonPart) : null;
  } catch {
    parsed = null;
  }
  return { publicNotes: before || null, plan: parsed };
}

export function composeNotesWithPlan(publicNotes: string | null, plan: unknown | null): string | null {
  const cleanNotes = (publicNotes ?? "").trim();
  if (plan == null) return cleanNotes || null;
  const encoded = `${MATCH_PLAN_MARKER}${JSON.stringify(plan)}`;
  return cleanNotes ? `${cleanNotes}\n\n${encoded}` : encoded;
}
