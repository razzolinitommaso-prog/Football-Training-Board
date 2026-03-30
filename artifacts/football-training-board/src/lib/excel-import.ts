import * as XLSX from "xlsx";
import { exportToExcel } from "./excel-export";

export async function parseExcelFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
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

export function mapExcelRowToPlayer(row: Record<string, string>, teams: { id: number; name: string }[]) {
  const teamName = (row["Squadra"] ?? "").trim().toLowerCase();
  const team = teams.find(t => t.name.trim().toLowerCase() === teamName);

  const rawPos = (row["Posizione"] ?? "").trim();
  const position = POSITION_MAP[rawPos] ?? POSITION_MAP[rawPos.toLowerCase()] ?? (rawPos || undefined);

  const jerseyNum = parseInt(row["N° Maglia"] ?? "");
  const height = parseFloat(row["Altezza (cm)"] ?? "");
  const weight = parseFloat(row["Peso (kg)"] ?? "");

  return {
    firstName: (row["Nome"] ?? "").trim(),
    lastName: (row["Cognome"] ?? "").trim(),
    teamId: team?.id ?? null,
    position: position || undefined,
    jerseyNumber: isNaN(jerseyNum) ? null : jerseyNum,
    dateOfBirth: (row["Data di Nascita"] ?? "").trim() || undefined,
    nationality: (row["Nazionalità"] ?? "").trim() || undefined,
    height: isNaN(height) ? null : height,
    weight: isNaN(weight) ? null : weight,
    registered: (row["Tesserato"] ?? "").toLowerCase() === "sì" || (row["Tesserato"] ?? "").toLowerCase() === "si",
    registrationNumber: (row["N° Tessera"] ?? "").trim() || undefined,
    notes: (row["Note"] ?? "").trim() || undefined,
    status: "active",
  };
}

export function isValidPlayerRow(row: Record<string, string>) {
  return (row["Nome"] ?? "").trim().length >= 2 && (row["Cognome"] ?? "").trim().length >= 2;
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

export function mapExcelRowToTeam(row: Record<string, string>) {
  return {
    name: (row["Nome Squadra"] ?? "").trim(),
    category: (row["Categoria"] ?? "").trim() || undefined,
    ageGroup: (row["Fascia d'Età"] ?? "").trim() || undefined,
  };
}

export function isValidTeamRow(row: Record<string, string>) {
  return (row["Nome Squadra"] ?? "").trim().length >= 2;
}

export function downloadTeamTemplate() {
  exportToExcel([
    { "Nome Squadra": "Esordienti 1° anno", "Categoria": "Esordienti", "Fascia d'Età": "U12" },
    { "Nome Squadra": "Pulcini 1° anno", "Categoria": "Pulcini", "Fascia d'Età": "U10" },
  ], "Template_Squadre_FTB", "Squadre");
}
