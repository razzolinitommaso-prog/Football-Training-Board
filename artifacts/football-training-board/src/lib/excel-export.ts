import * as XLSX from "xlsx";

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
}>;

function autoFitColumns(ws: XLSX.WorkSheet, data: Record<string, any>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const colWidths = keys.map((key) => {
    const maxLen = Math.max(
      key.length,
      ...data.map((row) => String(row[key] ?? "").length)
    );
    return { wch: Math.min(maxLen + 2, 50) };
  });
  ws["!cols"] = colWidths;
}

async function downloadWorkbook(wb: XLSX.WorkBook, filename: string, preferSavePicker = false) {
  const safeFilename = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const workbookArray = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([workbookArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const showSaveFilePicker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (preferSavePicker && showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: safeFilename,
        types: [{
          description: "File Excel",
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
          },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportToExcel(rows: Record<string, any>[], filename: string, sheetName = "Dati", options?: { preferSavePicker?: boolean }) {
  const ws = XLSX.utils.json_to_sheet(rows);
  autoFitColumns(ws, rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  void downloadWorkbook(wb, filename, options?.preferSavePicker);
}

export function exportMultiSheet(sheets: { name: string; rows: Record<string, any>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    autoFitColumns(ws, sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  downloadWorkbook(wb, filename);
}

// --- Data mappers ---

export function mapPlayersForExcel(players: any[], teams: any[]) {
  const teamMap: Record<number, string> = {};
  if (teams) teams.forEach((t: any) => { teamMap[t.id] = t.name; });

  return players.map((p) => ({
    "Nome": p.firstName ?? "",
    "Cognome": p.lastName ?? "",
    "Squadra": p.teamId ? (teamMap[p.teamId] ?? "") : "",
    "Posizione": p.position ?? "",
    "N° Maglia": p.jerseyNumber ?? "",
    "Data di Nascita": p.dateOfBirth ?? "",
    "Nazionalità": p.nationality ?? "",
    "Altezza (cm)": p.height ?? "",
    "Peso (kg)": p.weight ?? "",
    "Stato": p.status ?? "",
    "Disponibile": p.available === false ? "No" : "Sì",
    "Motivo Indisponibilità": p.unavailabilityReason ?? "",
    "Rientro Previsto": p.expectedReturn ?? "",
    "Tesserato": p.registered ? "Sì" : "No",
    "N° Tessera": p.registrationNumber ?? "",
    "Note": p.notes ?? "",
  }));
}

export function mapTeamsForExcel(teams: any[]) {
  return teams.map((t) => ({
    "Nome Squadra": t.name ?? "",
    "Categoria": t.category ?? "",
    "Fascia d'Età": t.ageGroup ?? "",
    "N° Giocatori": t.playerCount ?? "",
    "N° Allenatori": t.coachCount ?? "",
  }));
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Amministratore",
  secretary: "Segreteria",
  sporting_director: "Direttore Sportivo",
  coach: "Allenatore",
  director: "Direttore Generale",
  technical_director: "Direttore Tecnico",
  athletic_director: "Responsabile Atletico",
  fitness_coach: "Preparatore Atletico",
};

export function mapMembersForExcel(members: any[]) {
  return members.map((m) => ({
    "Nome": m.firstName ?? "",
    "Cognome": m.lastName ?? "",
    "Email": m.email ?? "",
    "Ruolo": ROLE_LABELS[m.role] ?? m.role ?? "",
    "Ruolo Staff": m.staffRole ?? "",
    "Tesserato": m.registered ? "Sì" : "No",
    "N° Tessera": m.registrationNumber ?? "",
    "Telefono": m.phone ?? "",
    "Tipo Licenza": m.licenseType ?? "",
    "Specializzazione": m.specialization ?? "",
  }));
}
