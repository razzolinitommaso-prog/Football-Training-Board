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
