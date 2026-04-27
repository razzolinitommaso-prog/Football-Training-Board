import * as XLSX from "xlsx";
import { exportToExcel } from "./excel-export";

/** Excel cells are often string | number | Date | boolean — never assume .trim() exists. */
export function cellToTrimmedString(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "Sì" : "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value).trim();
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

/** Prefer ISO date YYYY-MM-DD; supports Excel serial numbers (giorni) when in a typical date range. */
export function cellToDateOfBirth(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.floor(value);
    // Excel serial date range (roughly 1954–2078); avoids treating jersey-like integers as dates
    if (n > 20000 && n < 80000) {
      const d = new Date((value - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return String(value).trim() || undefined;
  }
  return undefined;
}

function cellToLowerString(value: unknown): string {
  return cellToTrimmedString(value).toLowerCase();
}

export async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
          raw: false,
        });
        resolve(rows);
      } catch {
        reject(new Error("File non valido. Assicurati di caricare un file .xlsx o .xls"));
      }
    };
    reader.onerror = () => reject(new Error("Errore nella lettura del file"));
    reader.readAsArrayBuffer(file);
  });
}

// --- Player import ---

const POSITION_MAP: Record<string, string> = {
  "portiere": "GK", "gk": "GK", "goalkeeper": "GK",
  "difensore": "DEF", "def": "DEF", "defender": "DEF",
  "centrocampista": "MID", "mid": "MID", "midfielder": "MID",
  "attaccante": "FWD", "fwd": "FWD", "forward": "FWD",
  "GK": "GK", "DEF": "DEF", "MID": "MID", "FWD": "FWD",
};

export function mapExcelRowToPlayer(row: Record<string, unknown>, teams: { id: number; name: string }[]) {
  const teamName = cellToTrimmedString(row["Squadra"]).toLowerCase();
  const team = teams.find(t => t.name.trim().toLowerCase() === teamName);

  const rawPos = cellToTrimmedString(row["Posizione"]);
  const position = POSITION_MAP[rawPos] ?? POSITION_MAP[rawPos.toLowerCase()] ?? (rawPos || undefined);

  const jerseyRaw = row["N° Maglia"];
  const jerseyNum =
    typeof jerseyRaw === "number" ? Math.round(jerseyRaw) : parseInt(cellToTrimmedString(jerseyRaw), 10);
  const heightRaw = row["Altezza (cm)"];
  const height =
    typeof heightRaw === "number" ? heightRaw : parseFloat(cellToTrimmedString(heightRaw));
  const weightRaw = row["Peso (kg)"];
  const weight =
    typeof weightRaw === "number" ? weightRaw : parseFloat(cellToTrimmedString(weightRaw));

  return {
    firstName: cellToTrimmedString(row["Nome"]),
    lastName: cellToTrimmedString(row["Cognome"]),
    teamId: team?.id ?? null,
    position: position || undefined,
    jerseyNumber: isNaN(jerseyNum) ? null : jerseyNum,
    dateOfBirth: cellToDateOfBirth(row["Data di Nascita"]),
    nationality: cellToTrimmedString(row["Nazionalità"]) || undefined,
    height: isNaN(height) ? null : height,
    weight: isNaN(weight) ? null : weight,
    registered: cellToLowerString(row["Tesserato"]) === "sì" || cellToLowerString(row["Tesserato"]) === "si",
    registrationNumber: cellToTrimmedString(row["N° Tessera"]) || undefined,
    notes: cellToTrimmedString(row["Note"]) || undefined,
    status: "active",
  };
}

export function isValidPlayerRow(row: Record<string, unknown>) {
  return cellToTrimmedString(row["Nome"]).length >= 2 && cellToTrimmedString(row["Cognome"]).length >= 2;
}

export function downloadPlayerTemplate() {
  exportToExcel([{
    "Nome": "Mario",
    "Cognome": "Rossi",
    "Squadra": "Esordienti 1° anno",
    "Posizione": "GK",
    "N° Maglia": "1",
    "Data di Nascita": "2012-03-15",
    "Nazionalità": "Italiana",
    "Altezza (cm)": "165",
    "Peso (kg)": "55",
    "Tesserato": "Sì",
    "N° Tessera": "12345",
    "Note": "",
  }], "Template_Giocatori_FTB", "Giocatori");
}

// --- Team import ---

export function mapExcelRowToTeam(row: Record<string, unknown>) {
  return {
    name: cellToTrimmedString(row["Nome Squadra"]),
    category: cellToTrimmedString(row["Categoria"]) || undefined,
    ageGroup: cellToTrimmedString(row["Fascia d'Età"]) || undefined,
  };
}

export function isValidTeamRow(row: Record<string, unknown>) {
  return cellToTrimmedString(row["Nome Squadra"]).length >= 2;
}

export function downloadTeamTemplate() {
  exportToExcel([
    { "Nome Squadra": "Esordienti 1° anno", "Categoria": "Esordienti", "Fascia d'Età": "U12" },
    { "Nome Squadra": "Pulcini 1° anno", "Categoria": "Pulcini", "Fascia d'Età": "U10" },
  ], "Template_Squadre_FTB", "Squadre");
}
