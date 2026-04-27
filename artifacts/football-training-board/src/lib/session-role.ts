/** Allineato a `normalizeSessionRole` lato API (`club-scope.ts`). */
export function normalizeSessionRole(role: unknown): string {
  return String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}
