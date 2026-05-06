export type TournamentProgramView = "full" | "qualifying" | "knockout" | "finals";

/** Campi minimi per filtrare le righe (compatibile con TournamentCardMatch). */
export type ProgramFilterMatch = {
  opponent: string;
  homeAway: string;
  competition?: string | null;
  notes?: string | null;
  location?: string | null;
};

function rowSearchText(m: ProgramFilterMatch, teamDisplayName: string, clubLabel: string): string {
  const isHome = m.homeAway === "home";
  const homeSide = isHome ? clubLabel : m.opponent;
  const awaySide = isHome ? m.opponent : teamDisplayName;
  return [homeSide, awaySide, m.opponent, m.competition ?? "", m.notes ?? "", m.location ?? ""].join(" ").toLowerCase();
}

/** Finali: finale (non semifinale), finali posto, pattern tipo FINALE 5° - 6° POSTO / 1°-2° POSTO */
export function isFinalsRow(text: string): boolean {
  const t = text.toLowerCase();
  if (/\bsemifinale\b|\bsemi[\s-]*finale\b/.test(t)) return false;
  if (/\bfinale\b/.test(t)) return true;
  if (/\d+\s*°\s*-?\s*\d+\s*°\s*posto/i.test(text)) return true;
  if (/\d+\s*°\s*-\s*\d+\s*°/i.test(text) && /\bposto\b/i.test(text)) return true;
  if (/finale\s+\d+\s*°\s*-?\s*\d+\s*°\s*posto/i.test(text)) return true;
  if (/\bfinale\s+\d+\s*°\b/i.test(text)) return true;
  return false;
}

/** Fasi a eliminazione (esclusi i match già classificati come finali). */
export function isKnockoutRow(text: string): boolean {
  if (isFinalsRow(text)) return false;
  return /\b(semifinale|semi[\s-]*finale|quarti|quarto|eliminazione|playoff|spareggio)\b/i.test(text);
}

/** Girone di qualificazione: tutto ciò che non è finale né tabellone eliminatorio. */
export function isQualifyingRow(text: string): boolean {
  return !isFinalsRow(text) && !isKnockoutRow(text);
}

export function filterMatchesByProgramView<T extends ProgramFilterMatch>(
  matches: T[],
  view: TournamentProgramView,
  teamDisplayName: string,
  clubLabel: string,
): T[] {
  if (view === "full") return matches;
  return matches.filter((m) => {
    const text = rowSearchText(m, teamDisplayName, clubLabel);
    if (view === "finals") return isFinalsRow(text);
    if (view === "knockout") return isKnockoutRow(text);
    if (view === "qualifying") return isQualifyingRow(text);
    return true;
  });
}
