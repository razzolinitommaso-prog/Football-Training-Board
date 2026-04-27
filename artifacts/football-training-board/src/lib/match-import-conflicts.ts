import { normalizeName } from "./match-calendar-pdf";
import type { MatchImportRow } from "./match-calendar-excel";

export type ExistingMatchForImport = {
  id: number;
  date: string;
  opponent: string;
  homeAway: string;
};

/** Chiave univoca per confronto import vs calendario esistente (stesso giorno, avversario, casa/trasferta). */
export function matchImportFingerprint(r: { date: string; opponent: string; homeAway: string }): string {
  const d = new Date(r.date);
  if (Number.isNaN(d.getTime())) return `invalid|${normalizeName(r.opponent)}|${r.homeAway}`;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}|${normalizeName(r.opponent)}|${String(r.homeAway).toLowerCase()}`;
}

export function findImportDuplicateConflicts(
  rows: MatchImportRow[],
  existing: ExistingMatchForImport[],
): { conflictIds: number[]; examples: string[] } {
  const byKey = new Map<string, number>();
  for (const e of existing) {
    byKey.set(matchImportFingerprint(e), e.id);
  }
  const conflictIds: number[] = [];
  const seenIds = new Set<number>();
  const examples: string[] = [];
  for (const r of rows) {
    const id = byKey.get(matchImportFingerprint(r));
    if (id !== undefined && !seenIds.has(id)) {
      seenIds.add(id);
      conflictIds.push(id);
      const d = new Date(r.date);
      const dateStr = Number.isNaN(d.getTime()) ? r.date : d.toLocaleDateString("it-IT");
      const tipo = r.homeAway === "home" ? "Casa" : "Trasferta";
      examples.push(`${dateStr} · ${r.opponent} · ${tipo}`);
    }
  }
  return { conflictIds, examples: examples.slice(0, 6) };
}

/**
 * Stessa logica dell'import: stesso giorno calendario, avversario normalizzato, casa/trasferta.
 * Per ogni gruppo con più partite resta quella con id minore; gli altri id sono duplicati rimovibili.
 */
export function getDuplicateMatchIdsToRemove(existing: ExistingMatchForImport[]): number[] {
  const byKey = new Map<string, number[]>();
  for (const e of existing) {
    const k = matchImportFingerprint(e);
    const arr = byKey.get(k) ?? [];
    arr.push(e.id);
    byKey.set(k, arr);
  }
  const out: number[] = [];
  for (const ids of byKey.values()) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort((a, b) => a - b);
    out.push(...sorted.slice(1));
  }
  return out;
}
