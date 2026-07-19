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
    if (!t) return undefined;
    const isoMatch = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const slashMatch = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (slashMatch) {
      const [, a, b, rawYear] = slashMatch;
      const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
      const first = Number(a);
      const second = Number(b);
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    const parsed = new Date(t);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return t;
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

export function normalizeImportedTeamDisplayName(value?: unknown): string {
  return cellToTrimmedString(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

const PLAYER_PHONE_KEYS = ["Telefono", "Cellulare", "Telefono Giocatore", "Cellulare Giocatore"];
const PLAYER_EMAIL_KEYS = ["Email", "E-mail", "Email Giocatore", "E-mail Giocatore"];
const PHONE_OWNER_KEYS = ["Telefono riferito a", "Telefono riferito", "Referente telefono", "Intestatario telefono"];
const PARENT_FIRST_NAME_KEYS = ["Nome Genitore", "Nome Tutore", "Nome Referente", "Genitore Nome"];
const PARENT_LAST_NAME_KEYS = ["Cognome Genitore", "Cognome Tutore", "Cognome Referente", "Genitore Cognome"];
const PARENT_PHONE_KEYS = ["Telefono Genitore", "Cellulare Genitore", "Telefono Tutore", "Cellulare Tutore", "Telefono Referente"];
const PARENT_EMAIL_KEYS = ["Email Genitore", "E-mail Genitore", "Email Tutore", "E-mail Tutore", "Email Referente"];
const PARENT_RELATION_KEYS = ["Relazione Genitore", "Parentela", "Rapporto", "Relazione"];
const SECONDARY_FIRST_NAME_KEYS = ["Nome Secondo Referente", "Nome Secondo Genitore", "Nome Altro Referente"];
const SECONDARY_LAST_NAME_KEYS = ["Cognome Secondo Referente", "Cognome Secondo Genitore", "Cognome Altro Referente"];
const SECONDARY_PHONE_KEYS = ["Telefono Secondo Referente", "Cellulare Secondo Referente", "Telefono Secondo Genitore", "Telefono Altro Referente"];
const SECONDARY_EMAIL_KEYS = ["Email Secondo Referente", "E-mail Secondo Referente", "Email Secondo Genitore", "Email Altro Referente"];
const SECONDARY_RELATION_KEYS = ["Relazione Secondo Referente", "Parentela Secondo Referente", "Rapporto Secondo Referente"];

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
  const teamName = normalizeImportedTeamDisplayName(row["Squadra"]);
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
  const phoneOwnerValue = cellToLowerString(readCell(row, PHONE_OWNER_KEYS));
  const parentFirstName = cellToTrimmedString(readCell(row, PARENT_FIRST_NAME_KEYS));
  const parentLastName = cellToTrimmedString(readCell(row, PARENT_LAST_NAME_KEYS));
  const parentPhone = cellToTrimmedString(readCell(row, PARENT_PHONE_KEYS));
  const parentEmail = cellToTrimmedString(readCell(row, PARENT_EMAIL_KEYS));
  const parentRelation = cellToTrimmedString(readCell(row, PARENT_RELATION_KEYS));
  const hasParentContact = Boolean(parentFirstName || parentLastName || parentPhone || parentEmail || parentRelation);

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
    phone: cellToTrimmedString(readCell(row, PLAYER_PHONE_KEYS)) || undefined,
    email: cellToTrimmedString(readCell(row, PLAYER_EMAIL_KEYS)) || undefined,
    phoneOwnerType: phoneOwnerValue.includes("genitore") || phoneOwnerValue.includes("tutore") || phoneOwnerValue.includes("parent") || hasParentContact ? "parent" : "player",
    parentFirstName: parentFirstName || undefined,
    parentLastName: parentLastName || undefined,
    parentPhone: parentPhone || undefined,
    parentEmail: parentEmail || undefined,
    parentRelation: parentRelation || undefined,
    secondaryContactFirstName: cellToTrimmedString(readCell(row, SECONDARY_FIRST_NAME_KEYS)) || undefined,
    secondaryContactLastName: cellToTrimmedString(readCell(row, SECONDARY_LAST_NAME_KEYS)) || undefined,
    secondaryContactPhone: cellToTrimmedString(readCell(row, SECONDARY_PHONE_KEYS)) || undefined,
    secondaryContactEmail: cellToTrimmedString(readCell(row, SECONDARY_EMAIL_KEYS)) || undefined,
    secondaryContactRelation: cellToTrimmedString(readCell(row, SECONDARY_RELATION_KEYS)) || undefined,
    notes: cellToTrimmedString(row["Note"]) || undefined,
    status: "active",
  };
}

export function mapExcelRowToPlayerPreview(row: Record<string, unknown>, teams: { id: number; name: string }[]) {
  const mapped = mapExcelRowToPlayer(row, teams);
  return {
    Nome: mapped.firstName || "",
    Cognome: mapped.lastName || "",
    Squadra: normalizeImportedTeamDisplayName(row["Squadra"]),
    Posizione: mapped.position || "",
    "N° Maglia": mapped.jerseyNumber ?? "",
    "Data di Nascita": mapped.dateOfBirth || "",
    Telefono: mapped.phone || "",
    Email: mapped.email || "",
    "Telefono riferito a": mapped.phoneOwnerType === "parent" ? "Genitore" : "Giocatore",
    "Nome Genitore": mapped.parentFirstName || "",
    "Cognome Genitore": mapped.parentLastName || "",
    "Telefono Genitore": mapped.parentPhone || "",
    "Email Genitore": mapped.parentEmail || "",
    "Relazione Genitore": mapped.parentRelation || "",
    "Nome Secondo Referente": mapped.secondaryContactFirstName || "",
    "Cognome Secondo Referente": mapped.secondaryContactLastName || "",
    "Telefono Secondo Referente": mapped.secondaryContactPhone || "",
    "Email Secondo Referente": mapped.secondaryContactEmail || "",
    "Relazione Secondo Referente": mapped.secondaryContactRelation || "",
    Tesserato: mapped.registered ? "Si" : "",
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
    "Telefono": "",
    "Email": "",
    "Telefono riferito a": "Giocatore",
    "Nome Genitore": "",
    "Cognome Genitore": "",
    "Telefono Genitore": "",
    "Email Genitore": "",
    "Relazione Genitore": "",
    "Nome Secondo Referente": "",
    "Cognome Secondo Referente": "",
    "Telefono Secondo Referente": "",
    "Email Secondo Referente": "",
    "Relazione Secondo Referente": "",
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
