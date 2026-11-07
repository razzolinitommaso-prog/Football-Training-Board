export const PARENT_ACCESS_CODE_MIN_LENGTH = 6;
export const PARENT_ACCESS_CODE_MAX_LENGTH = 16;

export function normalizeParentAccessCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function validateParentAccessCode(code: string): string | null {
  if (code.length < PARENT_ACCESS_CODE_MIN_LENGTH || code.length > PARENT_ACCESS_CODE_MAX_LENGTH) {
    return "La chiave personale deve avere da 6 a 16 caratteri.";
  }
  return /^[A-Z0-9]+$/.test(code) ? null : "Usa solo lettere e numeri.";
}
