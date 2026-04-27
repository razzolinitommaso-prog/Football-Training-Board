import * as XLSX from "xlsx";
import { exportToExcel } from "./excel-export";
import { cellToTrimmedString } from "./excel-import";

/** Intestazioni fisse — stesso ordine in template, export e import */
export const MATCH_CALENDAR_COLUMNS = [
  "Data e ora",
  "Avversario",
  "Casa o Trasferta",
  "Competizione",
  "Luogo",
  "Note",
] as const;

export function downloadMatchCalendarTemplate(teamLabel: string) {
  exportToExcel(
    [
      {
        "Data e ora": "2025-09-15T15:00",
        Avversario: "ASD Esempio",
        "Casa o Trasferta": "Casa",
        Competizione: "Campionato",
        Luogo: "Campo Comunale",
        Note: "",
      },
    ],
    `Modello_Calendario_${teamLabel.replace(/[^\w\s-]/g, "").slice(0, 40) || "Squadra"}`,
    "Partite",
  );
}

export function exportMatchesToExcel(
  matches: Array<{
    date: string;
    opponent: string;
    homeAway: string;
    competition?: string | null;
    location?: string | null;
    notes?: string | null;
  }>,
  teamLabel: string,
) {
  const rows = matches.map((m) => ({
    "Data e ora": m.date.includes("T") ? m.date.slice(0, 16) : m.date,
    Avversario: m.opponent,
    "Casa o Trasferta": m.homeAway === "home" ? "Casa" : "Trasferta",
    Competizione: m.competition ?? "",
    Luogo: m.location ?? "",
    Note: m.notes ?? "",
  }));
  exportToExcel(
    rows,
    `Calendario_${teamLabel.replace(/[^\w\s-]/g, "").slice(0, 40) || "export"}`,
    "Partite",
  );
}

function parseHomeAway(raw: string): "home" | "away" {
  const s = raw.trim().toLowerCase();
  if (["casa", "home", "h"].includes(s)) return "home";
  return "away";
}

export type MatchImportRow = {
  opponent: string;
  date: string;
  homeAway: "home" | "away";
  competition?: string | null;
  location?: string | null;
  notes?: string | null;
};

export function mapExcelRowToMatch(row: Record<string, unknown>): MatchImportRow | null {
  const opponent = cellToTrimmedString(row["Avversario"]);
  const dateRaw = cellToTrimmedString(row["Data e ora"]);
  if (!opponent || !dateRaw) return null;

  let iso: string;
  try {
    const d = new Date(dateRaw);
    if (isNaN(d.getTime())) return null;
    iso = d.toISOString();
  } catch {
    return null;
  }

  const ha = parseHomeAway(cellToTrimmedString(row["Casa o Trasferta"]) || "Trasferta");
  return {
    opponent,
    date: iso,
    homeAway: ha,
    competition: cellToTrimmedString(row["Competizione"]) || null,
    location: cellToTrimmedString(row["Luogo"]) || null,
    notes: cellToTrimmedString(row["Note"]) || null,
  };
}

export async function parseMatchCalendarExcelFile(file: File): Promise<Record<string, unknown>[]> {
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
        reject(new Error("File non valido"));
      }
    };
    reader.onerror = () => reject(new Error("Errore lettura file"));
    reader.readAsArrayBuffer(file);
  });
}
