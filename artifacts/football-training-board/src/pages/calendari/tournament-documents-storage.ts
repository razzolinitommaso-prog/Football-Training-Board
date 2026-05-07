/**
 * Tipi e utilità client per allegati torneo (persistenza su backend).
 */

export type StoredTournamentAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
};

/** Normalizza la competizione per confronto con `normalizedCompetition` lato API. */
export function normalizeTournamentKeyPart(value: unknown): string {
  let s = String(value ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  try {
    s = s.normalize("NFD").replace(/\p{M}/gu, "");
  } catch {
    s = s.replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u").replace(/ç/g, "c").replace(/ñ/g, "n");
  }
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s/g, "-");
  return s || "unknown";
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("Lettura file fallita"));
    r.readAsDataURL(file);
  });
}

const PDF_REF_PREFIX = "ftb-pdf-ref";

function pdfRefStorageKey(teamId: number, competition: string): string {
  return `${PDF_REF_PREFIX}:${teamId}:${normalizeTournamentKeyPart(competition)}`;
}

/** Data locale YYYY-MM-DD salvata per squadra + competizione (import PDF torneo senza date nel testo). */
export function getTournamentPdfReferenceDate(teamId: number, competition: string): string | null {
  try {
    const v = localStorage.getItem(pdfRefStorageKey(teamId, competition));
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setTournamentPdfReferenceDate(teamId: number, competition: string, ymdOrNull: string | null): void {
  const key = pdfRefStorageKey(teamId, competition);
  try {
    const t = (ymdOrNull ?? "").trim();
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, t);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Converte YYYY-MM-DD in ISO UTC usato da `fallbackDateIso` del parser (mezzogiorno locale). */
export function ymdLocalNoonToIso(ymd: string): string | undefined {
  const t = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  const [y, m, d] = t.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}
