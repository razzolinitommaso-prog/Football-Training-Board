export const feeListRoles = ["admin", "presidente", "director", "secretary", "sporting_director"];
export const feeLabels = { registration_fee: "Iscrizione", insurance_fee: "Assicurazione", annual_fee: "Quota annuale" } as const;
export const MAX_PLAYER_PAYMENT_AMOUNT = 20000;
export type FeeType = keyof typeof feeLabels;
export type FeeInput = { id?: number; itemType: FeeType; name: string; code: string; price: number; isActive?: boolean };
export type FeeItem = Omit<FeeInput, "id" | "price" | "isActive"> & { id: number; price: number | null; isActive: number };

export function listFeesForType<T extends { itemType?: string | null; name: string }>(items: T[], type: FeeType): T[] {
  const legacyAnnual = (item: T) => item.itemType === "registration_fee" && /\bannuale\b/i.test(item.name);
  if (type === "insurance_fee") return items.filter(item => item.itemType === type);
  if (type === "registration_fee") return items.filter(item => item.itemType === type && !legacyAnnual(item));
  const annual = items.filter(item => item.itemType === type || legacyAnnual(item));
  return annual.length ? annual : items.filter(item => item.itemType === "registration_fee");
}

export function parseFeeAmount(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_PLAYER_PAYMENT_AMOUNT || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      throw new Error("Indica un importo tra 0,01 e 20.000 euro, con al massimo due decimali.");
    }
    return value;
  }
  const raw = String(value ?? "").trim().replace(/^€\s*|\s*€$/g, "");
  const valid = /^\d+(?:[.,]\d{1,2})?$/.test(raw) || /^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw);
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const amount = Number(normalized);
  if (!valid || !Number.isFinite(amount) || amount <= 0 || amount > MAX_PLAYER_PAYMENT_AMOUNT) throw new Error("Indica un importo tra 0,01 e 20.000 euro, con al massimo due decimali.");
  return amount;
}

export function parseFeeRows(rows: Record<string, unknown>[]): FeeInput[] {
  if (!rows.length || rows.length > 500) throw new Error("Il listino deve contenere da 1 a 500 voci.");
  return rows.map((row, index) => {
    const name = String(row["Nome quota"] ?? row["Nome articolo"] ?? "").trim();
    const code = String(row["Codice"] ?? row["Codice articolo"] ?? "").trim();
    const rawType = String(row["Tipo"] ?? row["Tipo voce"] ?? "").trim().toLowerCase();
    const rawActive = String(row["Attivo"] ?? "").trim().toLowerCase();
    try {
      const itemType = ["iscrizione", "quota iscrizione", "registration_fee"].includes(rawType) ? "registration_fee"
        : ["assicurazione", "quota assicurazione", "insurance_fee"].includes(rawType) ? "insurance_fee"
        : ["quota annuale", "annual_fee"].includes(rawType) ? "annual_fee" : null;
      if (!itemType) throw new Error("Indica Iscrizione, Assicurazione o Quota annuale nella colonna Tipo.");
      if (!name || name.length > 150) throw new Error("Indica il nome della quota, fino a 150 caratteri.");
      if (code.length > 80) throw new Error("Il codice può avere fino a 80 caratteri.");
      if (rawActive && !["sì", "si", "no", "1", "0", "true", "false"].includes(rawActive)) {
        throw new Error("La colonna Attivo accetta Sì o No.");
      }
      const isActive = rawActive ? ["sì", "si", "1", "true"].includes(rawActive) : undefined;
      return { itemType, name, code, price: parseFeeAmount(row["Importo (€)"] ?? row["Importo"] ?? row["Prezzo listino"]), isActive };
    } catch (error) {
      throw new Error("Voce " + (index + 1) + ": " + (error instanceof Error ? error.message : "Riga non valida."));
    }
  });
}
