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

export type ParsedExcelSheet = {
  name: string;
  rows: Record<string, unknown>[];
  rawRows?: unknown[][];
};

export async function parseExcelWorkbook(file: File): Promise<ParsedExcelSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheets = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          return {
            name,
            rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
              defval: "",
              raw: false,
            }),
            rawRows: XLSX.utils.sheet_to_json<unknown[]>(ws, {
              defval: "",
              raw: false,
              header: 1,
            }),
          };
        });
        resolve(sheets);
      } catch {
        reject(new Error("File non valido. Assicurati di caricare un file .xlsx o .xls"));
      }
    };
    reader.onerror = () => reject(new Error("Errore nella lettura del file"));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseExcelFile(file: File, sheetName?: string): Promise<Record<string, unknown>[]> {
  const sheets = await parseExcelWorkbook(file);
  if (!sheetName) return sheets[0]?.rows ?? [];
  return sheets.find((sheet) => sheet.name === sheetName)?.rows ?? [];
}

function normalizeImportToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAdministrativeSheetName(name: string): boolean {
  const n = normalizeImportToken(name);
  return /\b(quote|quota|pagamenti|pagamento|pulmino|trasporto|riepilogo|totali|kit|contabilita|contabile|privacy)\b/.test(n);
}

function looksLikeTeamSheetName(name: string): boolean {
  const n = normalizeImportToken(name);
  return (
    /\b(20)?\d{2}\b/.test(n) ||
    /\b(piccoli|primi|pulcini|esordienti|giovanissimi|allievi|juniores|under|u\s?\d{2}|prima squadra)\b/.test(n)
  );
}

function headerScore(key: string, values: unknown[]): number {
  const h = normalizeImportToken(key);
  if (!h || /^__empty/.test(h)) return 0;
  let score = 0;
  if (/\b(cognome|nome|nominativo|giocatore|atleta|data nascita|nato|tessera|matricola|certificato|visita|telefono|cellulare|email|mail|squadra|annata|ruolo)\b/.test(h)) {
    score += 4;
  }
  const filled = values.filter((v) => cellToTrimmedString(v)).length;
  if (filled >= 2) score += 1;
  return score;
}

function inferColumnField(key: string, values: unknown[]): string | null {
  const h = normalizeImportToken(key);
  const sample = values.map(cellToTrimmedString).filter(Boolean).slice(0, 12);
  const sampleText = normalizeImportToken(sample.join(" "));

  if (/\b(cognome nome|nome cognome|nominativo|giocatore|atleta|nome completo)\b/.test(h)) return "Cognome Nome";
  if (/\bcognome\b/.test(h) && !/\bnome\b/.test(h)) return "Cognome";
  if (/\bnome\b/.test(h) && !/\bcognome\b/.test(h)) return "Nome";
  if (/\b(data nascita|nato il|nascita|dob)\b/.test(h)) return "Data di Nascita";
  if (/\b(luogo nascita|nato a|comune nascita)\b/.test(h)) return "Luogo di Nascita";
  if (/\b(tessera|matricola|cartellino)\b/.test(h)) return "N° Tessera";
  if (/\b(certificato|visita|scadenza)\b/.test(h)) return "Certificato medico";
  if (/\b(cellulare|telefono|tel)\b/.test(h)) return /\b(genitore|madre|padre|tutore|referente)\b/.test(h) ? "Telefono Genitore" : "Telefono";
  if (/\b(e mail|email|mail)\b/.test(h)) return /\b(genitore|madre|padre|tutore|referente)\b/.test(h) ? "Email Genitore" : "Email";
  if (/\b(squadra|annata|categoria|gruppo)\b/.test(h)) return "Squadra";
  if (/\b(ruolo|posizione)\b/.test(h)) return "Posizione";
  if (/\b(note|annotazioni)\b/.test(h)) return "Note";

  const dateLike = values.filter(isLikelyImportDateValue).length;
  if (dateLike >= Math.max(2, Math.ceil(sample.length * 0.55))) return "Data di Nascita";
  const emailLike = sample.filter((v) => /@/.test(v)).length;
  if (emailLike >= 2) return "Email";
  const phoneLike = sample.filter((v) => /\+?\d[\d\s/.-]{6,}/.test(v)).length;
  if (phoneLike >= 2) return "Telefono";
  const registrationLike = sample.filter((v) => /^\d{5,8}$/.test(v.replace(/\s+/g, ""))).length;
  if (registrationLike >= 2) return "N° Tessera";
  const nameLike = sample.filter((v) => /^[A-Za-zÀ-ÿ' -]{4,}$/.test(v) && v.trim().split(/\s+/).length >= 2).length;
  if (nameLike >= 2) return "Cognome Nome";
  if (/\b(gk|portiere|difensore|centrocampista|attaccante|def|mid|fwd)\b/.test(sampleText)) return "Posizione";
  return null;
}

function rawHeaderScore(row: unknown[]): number {
  return row.reduce<number>((sum, cell) => {
    const h = normalizeImportToken(cellToTrimmedString(cell));
    if (!h) return sum;
    if (/\b(nome|cognome|nominativo|giocatore|atleta|luogo|data|nascita|matric|tessera|tel|telefono|visita|certificato|email|mail|ruolo|squadra)\b/.test(h)) {
      return sum + 2;
    }
    return sum;
  }, 0);
}

function isLikelyImportDateValue(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number") return Number.isFinite(value) && value > 20000 && value < 80000;
  const text = cellToTrimmedString(value);
  if (!text) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return true;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return true;
  if (/^(?:ag|ago|scad|visita|cert)\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i.test(text)) return true;
  return false;
}

function isLikelyProgressiveColumn(values: unknown[]): boolean {
  const nums = values
    .map((value) => Number(cellToTrimmedString(value)))
    .filter((value) => Number.isFinite(value));
  if (nums.length < 3) return false;
  const small = nums.filter((value) => value > 0 && value < 300).length;
  if (small < Math.ceil(nums.length * 0.8)) return false;
  let sequential = 0;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] >= nums[i - 1] && nums[i] - nums[i - 1] <= 3) sequential++;
  }
  return sequential >= Math.max(2, nums.length - 2);
}

function adaptiveRowsFromRawSheet(sheet: ParsedExcelSheet): Record<string, unknown>[] {
  const rawRows = (sheet.rawRows ?? []).filter((row) => row.some((cell) => cellToTrimmedString(cell)));
  if (rawRows.length === 0) return [];

  let headerIndex = rawRows.findIndex((row) => rawHeaderScore(row) >= 4);
  if (headerIndex < 0) headerIndex = -1;
  const header = headerIndex >= 0 ? rawRows[headerIndex] : [];
  const dataRows = rawRows.slice(Math.max(headerIndex + 1, 0));
  const maxCols = Math.max(...rawRows.map((row) => row.length), 0);
  const columnMap = new Map<number, string>();
  let dateColumnCount = 0;

  for (let col = 0; col < maxCols; col++) {
    const headerLabel = cellToTrimmedString(header[col] ?? "");
    const values = dataRows.map((row) => row[col]);
    if (isLikelyProgressiveColumn(values)) continue;
    let field = inferColumnField(headerLabel || `col_${col}`, values);
    if (!field) {
      const sample = values.map(cellToTrimmedString).filter(Boolean).slice(0, 14);
      const dateLike = values.filter(isLikelyImportDateValue).length;
      if (dateLike >= Math.max(2, Math.ceil(sample.length * 0.5))) {
        field = dateColumnCount === 0 ? "Data di Nascita" : "Certificato medico";
        dateColumnCount++;
      }
    } else if (field === "Data di Nascita") {
      field = dateColumnCount === 0 ? "Data di Nascita" : "Certificato medico";
      dateColumnCount++;
    }
    if (field && !Array.from(columnMap.values()).includes(field)) columnMap.set(col, field);
  }

  if (![...columnMap.values()].some((field) => ["Cognome Nome", "Nome", "Cognome"].includes(field))) return [];

  return dataRows
    .map((row) => {
      const mapped: Record<string, unknown> = { __sheetName: sheet.name, Squadra: sheet.name };
      for (const [col, field] of columnMap.entries()) {
        const value = row[col];
        if (cellToTrimmedString(value)) mapped[field] = value;
      }
      if (!rowHasLikelyPlayerData(mapped)) return null;
      if (mapped["Luogo di Nascita"]) {
        mapped["Note"] = [mapped["Note"], `Luogo nascita: ${cellToTrimmedString(mapped["Luogo di Nascita"])}`]
          .map(cellToTrimmedString)
          .filter(Boolean)
          .join(" - ");
      }
      return mapped;
    })
    .filter((row): row is Record<string, unknown> => Boolean(row));
}

function rowHasLikelyPlayerData(row: Record<string, unknown>): boolean {
  const joined = Object.values(row).map(cellToTrimmedString).filter(Boolean).join(" ");
  if (!joined) return false;
  if (/\b(totale|saldo|quota|pagamento|iban|bonifico)\b/i.test(joined)) return false;
  const words = joined.split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ]{2,}/.test(w));
  return words.length >= 2;
}

export function prepareAdaptivePlayerImportRows(sheets: ParsedExcelSheet[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const sheet of sheets) {
    if (!sheet.rows.length && !(sheet.rawRows?.length)) continue;
    const sheetLooksRelevant = looksLikeTeamSheetName(sheet.name) || !isAdministrativeSheetName(sheet.name);
    if (!sheetLooksRelevant || isAdministrativeSheetName(sheet.name)) continue;

    const rawAdaptiveRows = adaptiveRowsFromRawSheet(sheet);
    if (rawAdaptiveRows.length > 0) {
      out.push(...rawAdaptiveRows);
      continue;
    }

    const keys = Array.from(new Set(sheet.rows.flatMap((row) => Object.keys(row))));
    const usefulKeys = keys.filter((key) => headerScore(key, sheet.rows.map((row) => row[key])) > 0);
    const columnMap = new Map<string, string>();
    for (const key of usefulKeys.length > 0 ? usefulKeys : keys) {
      const field = inferColumnField(key, sheet.rows.map((row) => row[key]));
      if (field && !Array.from(columnMap.values()).includes(field)) columnMap.set(key, field);
    }

    const hasNameMapping = Array.from(columnMap.values()).some((field) => ["Cognome Nome", "Nome Cognome", "Nome", "Cognome"].includes(field));
    if (!hasNameMapping && !looksLikeTeamSheetName(sheet.name)) continue;

    for (const row of sheet.rows) {
      if (!rowHasLikelyPlayerData(row)) continue;
      const mapped: Record<string, unknown> = { __sheetName: sheet.name };
      for (const [key, field] of columnMap.entries()) {
        const value = row[key];
        if (cellToTrimmedString(value)) mapped[field] = value;
      }
      if (!mapped.Squadra) mapped.Squadra = sheet.name;
      if (!hasNameMapping) {
        const values = Object.values(row).map(cellToTrimmedString).filter(Boolean);
        mapped["Cognome Nome"] = values.find((value) => /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]{2,}/.test(value)) ?? "";
      }
      mapped["Note"] = [mapped["Note"], mapped["Luogo di Nascita"] ? `Luogo nascita: ${mapped["Luogo di Nascita"]}` : ""]
        .map(cellToTrimmedString)
        .filter(Boolean)
        .join(" - ");
      out.push(mapped);
    }
  }
  return out;
}

// --- Player import ---

const POSITION_MAP: Record<string, string> = {
  "portiere": "GK", "gk": "GK", "goalkeeper": "GK",
  "difensore": "DEF", "def": "DEF", "defender": "DEF",
  "centrocampista": "MID", "mid": "MID", "midfielder": "MID",
  "attaccante": "FWD", "fwd": "FWD", "forward": "FWD",
  "GK": "GK", "DEF": "DEF", "MID": "MID", "FWD": "FWD",
};

const PLAYER_META_MARKER = "[FTB_PLAYER_META]";
const PLAYER_POSITION_KEYS = ["Posizione", "Ruolo", "Ruolo generico", "Posizione generica"];
const PLAYER_SPECIFIC_ROLE_KEYS = ["Ruolo specifico", "Posizione specifica", "Ruolo dettagliato"];

type ImportedRole = {
  position?: string;
  specificRole?: string;
};

function normalizeRoleToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[+/\\_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function roleFromToken(token: string): ImportedRole {
  const normalized = normalizeRoleToken(token);
  const compact = normalized.replace(/\s+/g, "");
  if (!normalized) return {};

  if (["gk", "por", "portiere", "portieri", "goalkeeper"].includes(compact)) {
    return { position: "GK" };
  }
  if (["dc", "cb", "centrale", "centraledifesa", "centraledidifesa", "difensorecentrale"].includes(compact)) {
    return { position: "DEF", specificRole: "CB" };
  }
  if (["lib", "libero"].includes(compact)) {
    return { position: "DEF", specificRole: "LIB" };
  }
  if (["terzino", "terzini", "fb", "esternobasso", "bassodifesa"].includes(compact)) {
    return { position: "DEF", specificRole: "FB" };
  }
  if (["br", "braccetto"].includes(compact)) {
    return { position: "DEF", specificRole: "BR" };
  }
  if (["difensore", "difensori", "def", "defender"].includes(compact)) {
    return { position: "DEF" };
  }
  if (["centrocampista", "centrocampisti", "centrocampo", "mid", "midfielder", "cm", "cc", "centralemid"].includes(compact)) {
    return { position: "MID", specificRole: "CM" };
  }
  if (["reg", "play", "playmaker", "mediano"].includes(compact)) {
    return { position: "MID", specificRole: "REG" };
  }
  if (["trequartista", "am"].includes(compact)) {
    return { position: "MID", specificRole: "AM" };
  }
  if (["attaccante", "attaccanti", "att", "punta", "centravanti", "fwd", "forward", "st"].includes(compact)) {
    return { position: "FWD", specificRole: "ST" };
  }
  if (["esterno", "esterni", "ala", "wing", "winger", "wf", "attaccanteesterno", "esternoalto"].includes(compact)) {
    return { position: "FWD", specificRole: "WF" };
  }
  if (["wm", "centrocampistaesterno"].includes(compact)) {
    return { position: "MID", specificRole: "WM" };
  }
  if (["wa"].includes(compact)) {
    return { position: "FWD", specificRole: "WA" };
  }

  return {};
}

function parseImportedRole(rawPosition: string, rawSpecificRole: string): ImportedRole {
  const explicitSpecific = roleFromToken(rawSpecificRole);
  const direct = roleFromToken(rawPosition);
  if (direct.position || direct.specificRole || explicitSpecific.specificRole) {
    return {
      position: direct.position ?? explicitSpecific.position,
      specificRole: explicitSpecific.specificRole ?? direct.specificRole,
    };
  }

  const parts = rawPosition.split(/[+/\\,;-]+/).map(part => part.trim()).filter(Boolean);
  const parsedParts = parts.map(roleFromToken).filter(part => part.position || part.specificRole);
  if (parsedParts.length === 0) return { position: POSITION_MAP[rawPosition] ?? POSITION_MAP[rawPosition.toLowerCase()] ?? undefined };

  const firstDefensive = parsedParts.find(part => part.position === "DEF");
  const firstForward = parsedParts.find(part => part.position === "FWD");
  const firstMidfield = parsedParts.find(part => part.position === "MID");
  const selected = firstDefensive ?? firstForward ?? firstMidfield ?? parsedParts[0];
  return {
    position: selected.position,
    specificRole: explicitSpecific.specificRole ?? selected.specificRole,
  };
}

function composeImportedPlayerNotes(notesRaw: string, specificRole?: string): string | undefined {
  const cleanNotes = notesRaw.trim();
  if (!specificRole) return cleanNotes || undefined;
  const encoded = `${PLAYER_META_MARKER}${JSON.stringify({
    primarySpecificRole: specificRole,
  })}`;
  return cleanNotes ? `${encoded}\n${cleanNotes}` : encoded;
}

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
const SHUTTLE_KEYS = ["Pulmino", "Servizio Pulmino", "Usufruisce Pulmino", "Trasporto", "Servizio Trasporto"];
const REGISTERED_KEYS = ["Tesserato", "Tesseramento", "Tesserato stagione", "Tesserato annuale"];
const MEDICAL_CERTIFICATE_KEYS = [
  "Certificato medico",
  "Scadenza certificato",
  "Scadenza Certificato",
  "Scadenza certificato medico",
  "Certificato",
  "Medical Certificate Expiry",
];

function cellToBoolean(value: unknown): boolean {
  const normalized = cellToLowerString(value);
  return ["si", "sì", "yes", "true", "1", "x"].includes(normalized);
}

function cellToOptionalBoolean(value: unknown): boolean | undefined {
  const raw = cellToTrimmedString(value);
  if (!raw) return undefined;

  const normalized = cellToLowerString(value);
  if (["si", "sì", "sã¬", "yes", "true", "1", "x"].includes(normalized)) return true;
  if (["no", "false", "0", "n"].includes(normalized)) return false;
  return undefined;
}

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
  const teamName = normalizeImportedTeamDisplayName(row["Squadra"] || row.__sheetName);
  const team = teams.find(t => t.name.trim().toLowerCase() === teamName);

  const rawPos = cellToTrimmedString(readCell(row, PLAYER_POSITION_KEYS));
  const rawSpecificRole = cellToTrimmedString(readCell(row, PLAYER_SPECIFIC_ROLE_KEYS));
  const importedRole = parseImportedRole(rawPos, rawSpecificRole);
  const position = importedRole.position;

  const jerseyRaw = readCell(row, JERSEY_KEYS);
  const jerseyNum =
    typeof jerseyRaw === "number" ? Math.round(jerseyRaw) : parseInt(cellToTrimmedString(jerseyRaw), 10);
  const heightRaw = row["Altezza (cm)"];
  const height =
    typeof heightRaw === "number" ? heightRaw : parseFloat(cellToTrimmedString(heightRaw));
  const weightRaw = row["Peso (kg)"];
  const weight =
    typeof weightRaw === "number" ? weightRaw : parseFloat(cellToTrimmedString(weightRaw));
  const registeredRaw = readCell(row, REGISTERED_KEYS);
  const registeredValue = cellToOptionalBoolean(registeredRaw);
  const phoneOwnerValue = cellToLowerString(readCell(row, PHONE_OWNER_KEYS));
  const parentFirstName = cellToTrimmedString(readCell(row, PARENT_FIRST_NAME_KEYS));
  const parentLastName = cellToTrimmedString(readCell(row, PARENT_LAST_NAME_KEYS));
  const parentPhone = cellToTrimmedString(readCell(row, PARENT_PHONE_KEYS));
  const parentEmail = cellToTrimmedString(readCell(row, PARENT_EMAIL_KEYS));
  const parentRelation = cellToTrimmedString(readCell(row, PARENT_RELATION_KEYS));
  const hasParentContact = Boolean(parentFirstName || parentLastName || parentPhone || parentEmail || parentRelation);
  const shuttleRaw = readCell(row, SHUTTLE_KEYS);

  const mapped: Record<string, unknown> = {
    firstName: importedName.firstName,
    lastName: importedName.lastName,
    teamId: team?.id ?? null,
    position: position || undefined,
    jerseyNumber: isNaN(jerseyNum) ? null : jerseyNum,
    dateOfBirth: cellToDateOfBirth(row["Data di Nascita"]),
    nationality: cellToTrimmedString(readCell(row, NATIONALITY_KEYS)) || undefined,
    height: isNaN(height) ? null : height,
    weight: isNaN(weight) ? null : weight,
    medicalCertificateExpiry: cellToDateOfBirth(readCell(row, MEDICAL_CERTIFICATE_KEYS)),
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
    notes: composeImportedPlayerNotes(cellToTrimmedString(row["Note"]), importedRole.specificRole),
  };
  if (registeredValue !== undefined) {
    mapped.registered = registeredValue;
  }
  if (cellToTrimmedString(shuttleRaw)) {
    mapped.shuttleService = cellToBoolean(shuttleRaw);
  }
  return mapped;
}

export function mapExcelRowToPlayerPreview(row: Record<string, unknown>, teams: { id: number; name: string }[]) {
  const mapped = mapExcelRowToPlayer(row, teams);
  const registeredValue = cellToOptionalBoolean(readCell(row, REGISTERED_KEYS));
  return {
    Nome: mapped.firstName || "",
    Cognome: mapped.lastName || "",
    Squadra: normalizeImportedTeamDisplayName(row["Squadra"] || row.__sheetName),
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
    "Pulmino": mapped.shuttleService ? "Si" : "No",
    "Nome Secondo Referente": mapped.secondaryContactFirstName || "",
    "Cognome Secondo Referente": mapped.secondaryContactLastName || "",
    "Telefono Secondo Referente": mapped.secondaryContactPhone || "",
    "Email Secondo Referente": mapped.secondaryContactEmail || "",
    "Relazione Secondo Referente": mapped.secondaryContactRelation || "",
    Tesserato: registeredValue === true ? "Si" : registeredValue === false ? "No" : "",
    "Certificato medico": mapped.medicalCertificateExpiry || "",
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
    "Pulmino": "",
    "Tesserato": "",
    "N° Tessera": "",
    "Certificato medico": "",
    "Note": "",
  }], "Template_Giocatori_FTB", "Giocatori", { preferSavePicker: true });
}

// --- Team import ---

function generatedTeamImportName(row: Record<string, unknown>) {
  const name = cellToTrimmedString(row["Nome Squadra"]);
  if (name) return name;
  const importedTeamName = cellToTrimmedString(row["Squadra"]);
  if (importedTeamName) return importedTeamName;
  return [
    cellToTrimmedString(row["Categoria"]),
    cellToTrimmedString(readCell(row, TEAM_AGE_GROUP_KEYS)),
  ].filter(Boolean).join(" ").trim() || "Squadra";
}

function importedTeamCategory(row: Record<string, unknown>) {
  return cellToTrimmedString(row["Categoria"]) || cellToTrimmedString(row["Squadra"]) || undefined;
}

function importedTeamAgeGroup(row: Record<string, unknown>) {
  const explicitAgeGroup = cellToTrimmedString(readCell(row, TEAM_AGE_GROUP_KEYS));
  if (explicitAgeGroup) return explicitAgeGroup;
  const birthDate = cellToDateOfBirth(row["Data di Nascita"]);
  const year = birthDate?.match(/^(\d{4})-/)?.[1];
  return year || undefined;
}

export function mapExcelRowToTeam(row: Record<string, unknown>) {
  return {
    name: generatedTeamImportName(row),
    category: importedTeamCategory(row),
    ageGroup: importedTeamAgeGroup(row),
  };
}

export function isValidTeamRow(row: Record<string, unknown>) {
  return generatedTeamImportName(row).length >= 2 && Boolean(importedTeamCategory(row));
}

export function downloadTeamTemplate() {
  exportToExcel([
    { "Categoria": "Esordienti", "Fascia d'Età": "1 anno", "Nome Squadra": "" },
    { "Categoria": "Pulcini", "Fascia d'Età": "2 anno", "Nome Squadra": "" },
  ], "Template_Squadre_FTB", "Squadre", { preferSavePicker: true });
}
