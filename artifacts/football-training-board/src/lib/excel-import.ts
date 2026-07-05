import * as XLSX from "xlsx";
import { exportToExcel } from "./excel-export";

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

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function readCell(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  const normalizedKeys = new Set(keys.map(normalizeHeader));
  for (const [rowKey, value] of Object.entries(row)) {
    if (normalizedKeys.has(normalizeHeader(rowKey))) return value;
  }
  return "";
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

const JERSEY_KEYS = ["N° Maglia", "NÂ° Maglia", "NÃ‚Â° Maglia", "NÃƒâ€šÃ‚Â° Maglia"];
const NATIONALITY_KEYS = ["Nazionalità", "NazionalitÃ ", "NazionalitÃƒÂ ", "NazionalitÃƒÆ’Ã‚Â "];
const REGISTRATION_NUMBER_KEYS = ["N° Tessera", "NÂ° Tessera", "NÃ‚Â° Tessera", "NÃƒâ€šÃ‚Â° Tessera"];
const TEAM_AGE_GROUP_KEYS = ["Fascia d'Età", "Fascia d'EtÃ ", "Fascia d'EtÃƒÂ ", "Fascia d'EtÃƒÆ’Ã‚Â "];
const LAST_FIRST_NAME_KEYS = ["Cognome Nome", "Cognome e Nome"];
const FIRST_LAST_NAME_KEYS = ["Nome Cognome", "Nome e Cognome", "Nome Completo", "Giocatore", "Player"];

function splitNameParts(value: string, order: "last_first" | "first_last") {
  const fullName = value.replace(/\s+/g, " ").trim();
  if (!fullName) return { firstName: "", lastName: "" };

  if (fullName.includes(",")) {
    const [lastName, ...firstNameParts] = fullName.split(",").map(part => part.trim()).filter(Boolean);
    return {
      firstName: firstNameParts.join(" "),
      lastName: lastName ?? "",
    };
  }

  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length === 1) return { firstName: "", lastName: parts[0] };

  if (order === "first_last") {
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1],
    };
  }

  return {
    firstName: parts.slice(1).join(" "),
    lastName: parts[0],
  };
}

function splitImportedPlayerName(row: Record<string, unknown>) {
  const explicitFirstName = cellToTrimmedString(readCell(row, ["Nome"]));
  const explicitLastName = cellToTrimmedString(readCell(row, ["Cognome"]));
  if (explicitFirstName && explicitLastName) {
    return { firstName: explicitFirstName, lastName: explicitLastName };
  }

  const lastFirstName = cellToTrimmedString(readCell(row, LAST_FIRST_NAME_KEYS));
  if (lastFirstName) return splitNameParts(lastFirstName, "last_first");

  const firstLastName = cellToTrimmedString(readCell(row, FIRST_LAST_NAME_KEYS));
  if (firstLastName) return splitNameParts(firstLastName, "first_last");

  if (explicitFirstName && !explicitLastName) {
    return splitNameParts(explicitFirstName, "last_first");
  }

  return { firstName: explicitFirstName, lastName: explicitLastName };
}

export function mapExcelRowToPlayer(row: Record<string, unknown>, teams: { id: number; name: string }[]) {
  const importedName = splitImportedPlayerName(row);
  const teamName = cellToTrimmedString(row["Squadra"]).toLowerCase();
  const team = teams.find(t => t.name.trim().toLowerCase() === teamName);

  const rawPos = cellToTrimmedString(row["Posizione"]);
  const position = POSITION_MAP[rawPos] ?? POSITION_MAP[rawPos.toLowerCase()] ?? (rawPos || undefined);

  const jerseyRaw = readCell(row, JERSEY_KEYS);
  const jerseyNum =
    typeof jerseyRaw === "number" ? Math.round(jerseyRaw) : parseInt(cellToTrimmedString(jerseyRaw), 10);
  const heightRaw = row["Altezza (cm)"];
  const height =
    typeof heightRaw === "number" ? heightRaw : parseFloat(cellToTrimmedString(heightRaw));
  const weightRaw = row["Peso (kg)"];
  const weight =
    typeof weightRaw === "number" ? weightRaw : parseFloat(cellToTrimmedString(weightRaw));
  const registeredValue = cellToLowerString(row["Tesserato"]);

  return {
    firstName: importedName.firstName,
    lastName: importedName.lastName,
    teamId: team?.id ?? null,
    position: position || undefined,
    jerseyNumber: isNaN(jerseyNum) ? null : jerseyNum,
    dateOfBirth: cellToDateOfBirth(row["Data di Nascita"]),
    nationality: cellToTrimmedString(readCell(row, NATIONALITY_KEYS)) || undefined,
    height: isNaN(height) ? null : height,
    weight: isNaN(weight) ? null : weight,
    registered: registeredValue === "sì" || registeredValue === "si" || registeredValue === "sã¬",
    registrationNumber: cellToTrimmedString(readCell(row, REGISTRATION_NUMBER_KEYS)) || undefined,
    notes: cellToTrimmedString(row["Note"]) || undefined,
    status: "active",
  };
}

export function isValidPlayerRow(row: Record<string, unknown>) {
  const importedName = splitImportedPlayerName(row);
  return importedName.firstName.length >= 2 && importedName.lastName.length >= 2;
}

export function downloadPlayerTemplate() {
  exportToExcel([{
    "Cognome Nome": "",
    "Nome Cognome": "",
    "Nome": "",
    "Cognome": "",
    "Squadra": "",
    "Posizione": "",
    "N° Maglia": "",
    "Data di Nascita": "",
    "Nazionalità": "",
    "Altezza (cm)": "",
    "Peso (kg)": "",
    "Tesserato": "",
    "N° Tessera": "",
    "Note": "",
  }], "Template_Giocatori_FTB", "Giocatori", { preferSavePicker: true });
}

// --- Team import ---

function generatedTeamImportName(row: Record<string, unknown>) {
  const name = cellToTrimmedString(row["Nome Squadra"]);
  if (name) return name;
  return [
    cellToTrimmedString(row["Categoria"]),
    cellToTrimmedString(readCell(row, TEAM_AGE_GROUP_KEYS)),
  ].filter(Boolean).join(" ").trim() || "Squadra";
}

export function mapExcelRowToTeam(row: Record<string, unknown>) {
  return {
    name: generatedTeamImportName(row),
    category: cellToTrimmedString(row["Categoria"]) || undefined,
    ageGroup: cellToTrimmedString(readCell(row, TEAM_AGE_GROUP_KEYS)) || undefined,
  };
}

export function isValidTeamRow(row: Record<string, unknown>) {
  return generatedTeamImportName(row).length >= 2 && cellToTrimmedString(row["Categoria"]).length >= 2;
}

export function downloadTeamTemplate() {
  exportToExcel([
    { "Categoria": "Esordienti", "Fascia d'Età": "1 anno", "Nome Squadra": "" },
    { "Categoria": "Pulcini", "Fascia d'Età": "2 anno", "Nome Squadra": "" },
  ], "Template_Squadre_FTB", "Squadre", { preferSavePicker: true });
}
