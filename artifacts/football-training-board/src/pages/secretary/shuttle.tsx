import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Bus, FileDown, FileUp, Filter, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
import { cellToTrimmedString } from "@/lib/excel-import";

type ShuttleDirection = "outbound" | "round_trip" | "return";

type Player = {
  id: number;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  shuttleService?: boolean | null;
  shuttleRoute?: string | null;
  shuttleDirection?: ShuttleDirection | string | null;
};

type Team = {
  id: number;
  name: string;
  seasonId?: number | null;
  seasonName?: string | null;
};

type PlayerPayment = {
  id: number;
  playerId: number;
  amount: number;
  dueDate?: string | null;
  status?: string | null;
  paymentType?: string | null;
  description?: string | null;
};

type WarehouseItem = {
  id: number;
  name: string;
  itemType: string;
  price?: number | null;
  isActive?: number | boolean | null;
  category?: string | null;
  size?: string | null;
  notes?: string | null;
};

type ShuttleImportRow = {
  firstName: string;
  lastName: string;
  birthYear: string;
  phone: string;
  route: string;
  outbound: boolean;
  returnTrip: boolean;
  direction: ShuttleDirection | null;
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}>;

function playerName(player: Player): string {
  return [player.lastName, player.firstName].filter(Boolean).join(" ");
}

function directionLabel(value?: string | null): string {
  if (value === "outbound") return "Solo andata";
  if (value === "return") return "Solo ritorno";
  return "Andata e ritorno";
}

function normalizeBool(value: unknown): boolean {
  const raw = cellToTrimmedString(value).toLowerCase();
  return ["si", "sì", "yes", "true", "1", "x", "attivo"].includes(raw);
}

function normalizeSearch(value: unknown): string {
  return cellToTrimmedString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function playerBirthYear(player: Player): string {
  const year = String(player.dateOfBirth ?? "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function importedDirection(outbound: boolean, returnTrip: boolean): ShuttleDirection | null {
  if (outbound && returnTrip) return "round_trip";
  if (outbound) return "outbound";
  if (returnTrip) return "return";
  return null;
}

function pulminoYesNo(value: boolean) {
  return value ? "SI" : "NO";
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApi(url), {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function shuttleRows(players: Player[]) {
  return players.map((player) => ({
    Nome: player.firstName,
    Cognome: player.lastName,
    Anno: playerBirthYear(player),
    "Cell ragazzo": player.phone ?? "",
    Paese: player.shuttleRoute ?? "",
    Andata: pulminoYesNo(player.shuttleService === true && player.shuttleDirection !== "return"),
    Ritorno: pulminoYesNo(player.shuttleService === true && player.shuttleDirection !== "outbound"),
    Squadra: player.teamName ?? "",
    "Tipo tratta": player.shuttleService ? directionLabel(player.shuttleDirection) : "",
  }));
}

function parsePulminoWorkbook(file: File): Promise<ShuttleImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
        const headerIndex = rawRows.findIndex((row) => {
          const normalized = row.map(normalizeSearch);
          return normalized.includes("nome") && normalized.includes("cognome") && normalized.includes("paese");
        });
        if (headerIndex < 0) throw new Error("Intestazioni pulmino non trovate");
        const headers = rawRows[headerIndex].map(normalizeSearch);
        const indexOf = (header: string) => headers.indexOf(header);
        const nomeIndex = indexOf("nome");
        const cognomeIndex = indexOf("cognome");
        const annoIndex = indexOf("anno");
        const phoneIndex = headers.findIndex((header) => header.includes("cell"));
        const paeseIndex = indexOf("paese");
        const andataIndex = indexOf("andata");
        const ritornoIndex = indexOf("ritorno");

        const rows = rawRows.slice(headerIndex + 1).map((row) => {
          const outbound = normalizeBool(row[andataIndex]);
          const returnTrip = normalizeBool(row[ritornoIndex]);
          return {
            firstName: cellToTrimmedString(row[nomeIndex]).replace(/\s+/g, " "),
            lastName: cellToTrimmedString(row[cognomeIndex]).replace(/\s+/g, " "),
            birthYear: cellToTrimmedString(row[annoIndex]),
            phone: cellToTrimmedString(row[phoneIndex]),
            route: cellToTrimmedString(row[paeseIndex]).replace(/\s+/g, " "),
            outbound,
            returnTrip,
            direction: importedDirection(outbound, returnTrip),
          };
        }).filter((row) => row.firstName && row.lastName && row.route && row.direction);
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Errore nella lettura del file"));
    reader.readAsArrayBuffer(file);
  });
}

async function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const workbookArray = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([workbookArray], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const safeFilename = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  const showSaveFilePicker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (showSaveFilePicker) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: safeFilename,
        types: [{
          description: "File Excel",
          accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
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
  downloadBlob(blob, safeFilename);
}

function buildPulminoWorkbook(rows: ReturnType<typeof shuttleRows>) {
  const data = [
    ["", "FORTIS JUVENTUS 1909"],
    ["NOME", "COGNOME", "ANNO", "CELL RAGAZZO", "PAESE", "ANDATA", "RITORNO"],
    ...rows.map((row) => [row.Nome, row.Cognome, row.Anno, row["Cell ragazzo"], row.Paese, row.Andata, row.Ritorno]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pulmino");
  return workbook;
}

function findImportedPlayer(players: Player[], row: ShuttleImportRow) {
  const first = normalizeSearch(row.firstName);
  const last = normalizeSearch(row.lastName);
  const candidates = players.filter((player) => {
    const direct = normalizeSearch(player.firstName) === first && normalizeSearch(player.lastName) === last;
    const reversed = normalizeSearch(player.firstName) === last && normalizeSearch(player.lastName) === first;
    return direct || reversed;
  });
  if (candidates.length <= 1 || !row.birthYear) return candidates[0];
  return candidates.find((player) => playerBirthYear(player) === row.birthYear) ?? candidates[0];
}

function directionTokens(direction: ShuttleDirection | null) {
  if (direction === "outbound") return ["solo andata", "andata"];
  if (direction === "return") return ["solo ritorno", "ritorno"];
  if (direction === "round_trip") return ["andata ritorno", "andata e ritorno", "ar"];
  return [];
}

function findShuttleFeeItem(items: WarehouseItem[], route: string, direction: ShuttleDirection | null) {
  const active = items.filter((item) =>
    item.itemType === "shuttle_fee" &&
    item.price != null &&
    item.isActive !== 0 &&
    item.isActive !== false
  );
  if (active.length === 0) return undefined;
  const routeToken = normalizeSearch(route);
  const routeMatches = active.filter((item) => {
    const haystack = normalizeSearch([item.name, item.category, item.size, item.notes].filter(Boolean).join(" "));
    return routeToken && haystack.includes(routeToken);
  });
  const scoped = routeMatches.length > 0 ? routeMatches : active;
  const directionMatches = scoped.filter((item) => {
    const haystack = normalizeSearch([item.name, item.category, item.size, item.notes].filter(Boolean).join(" "));
    return directionTokens(direction).some((token) => haystack.includes(normalizeSearch(token)));
  });
  if (directionMatches.length > 0) return directionMatches[0];
  if (routeMatches.length === 1) return routeMatches[0];
  if (active.length === 1) return active[0];
  return undefined;
}

async function upsertShuttlePayment(playerId: number, amount: number, existing?: PlayerPayment) {
  const payload = {
    playerId,
    amount,
    dueDate: existing?.dueDate ?? null,
    status: existing?.status ?? "pending",
    description: "Quota pulmino",
    paymentType: "shuttle_monthly",
    installmentNumber: 1,
    totalInstallments: 1,
    availabilityBlocking: 1,
  };
  if (existing) {
    return apiFetch(`/api/player-payments/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  return apiFetch("/api/player-payments", { method: "POST", body: JSON.stringify(payload) });
}

function pdfEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, (char) => {
      const map: Record<string, string> = {
        à: "a",
        è: "e",
        é: "e",
        ì: "i",
        ò: "o",
        ù: "u",
        À: "A",
        È: "E",
        É: "E",
        Ì: "I",
        Ò: "O",
        Ù: "U",
      };
      return map[char] ?? " ";
    });
}

function buildShuttlePdfBlob(rows: ReturnType<typeof shuttleRows>) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 42;
  const startY = 790;
  const lineHeight = 18;
  const bottomY = 54;
  const objects: string[] = [];
  const pages: number[] = [];
  let content = "";
  let y = startY;

  function addLine(text: string, x = marginX, size = 10) {
    content += `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET\n`;
    y -= lineHeight;
  }

  function finishPage() {
    const contentId = objects.length + 1;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    pages.push(pageId);
    content = "";
    y = startY;
  }

  addLine("ELENCO PULMINO", marginX, 18);
  addLine(`${rows.length} giocatori filtrati`, marginX, 11);
  y -= 8;
  addLine("Nome Cognome | Anno | Telefono | Paese | Andata | Ritorno", marginX, 10);
  y -= 4;

  rows.forEach((row, index) => {
    if (y < bottomY) {
      finishPage();
      addLine("ELENCO PULMINO", marginX, 18);
      addLine("Nome Cognome | Anno | Telefono | Paese | Andata | Ritorno", marginX, 10);
      y -= 4;
    }
    const name = `${row.Nome} ${row.Cognome}`.trim();
    addLine(`${index + 1}. ${name} | ${row.Anno || "-"} | ${row["Cell ragazzo"] || "-"} | ${row.Paese || "-"} | ${row.Andata} | ${row.Ritorno}`);
  });

  if (!content) addLine("Nessun giocatore filtrato.");
  finishPage();

  const catalog = "<< /Type /Catalog /Pages 2 0 R >>";
  const pagesObject = `<< /Type /Pages /Kids [${pages.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const font = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const allObjects = [catalog, pagesObject, font, ...objects];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  allObjects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${allObjects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${allObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const templateRows = [
  { Nome: "MARIO", Cognome: "ROSSI", Anno: "2014", "Cell ragazzo": "", Paese: "RONTA", Andata: "SI", Ritorno: "SI", Squadra: "", "Tipo tratta": "Andata e ritorno" },
  { Nome: "LUCA", Cognome: "BIANCHI", Anno: "2015", "Cell ragazzo": "", Paese: "SCARPERIA", Andata: "SI", Ritorno: "NO", Squadra: "", "Tipo tratta": "Solo andata" },
];

export default function ShuttlePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [directionFilter, setDirectionFilter] = useState("all");

  const { data: players = [], isLoading } = useQuery<Player[]>({
    queryKey: ["/api/players", "shuttle"],
    queryFn: () => apiFetch<Player[]>("/api/players"),
  });
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", "shuttle"],
    queryFn: () => apiFetch<Team[]>("/api/teams"),
  });
  const { data: playerPayments = [] } = useQuery<PlayerPayment[]>({
    queryKey: ["/api/player-payments", "shuttle"],
    queryFn: () => apiFetch<PlayerPayment[]>("/api/player-payments"),
  });
  const { data: warehouseItems = [] } = useQuery<WarehouseItem[]>({
    queryKey: ["/api/warehouse-items", "shuttle"],
    queryFn: () => apiFetch<WarehouseItem[]>("/api/warehouse-items"),
  });

  const updatePlayer = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Player> }) =>
      apiFetch(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/players"] }),
  });

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => playerName(a).localeCompare(playerName(b), "it", { sensitivity: "base" })),
    [players],
  );
  const shuttlePlayers = sortedPlayers.filter((player) => player.shuttleService === true);
  const routes = Array.from(new Set(shuttlePlayers.map((player) => player.shuttleRoute?.trim()).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  const filteredPlayers = shuttlePlayers.filter((player) => {
    if (teamFilter !== "all" && String(player.teamId ?? "") !== teamFilter) return false;
    if (routeFilter !== "all" && (player.shuttleRoute ?? "") !== routeFilter) return false;
    if (directionFilter !== "all" && (player.shuttleDirection ?? "round_trip") !== directionFilter) return false;
    return true;
  });
  const paymentByPlayerId = useMemo(() => {
    const map = new Map<number, PlayerPayment>();
    playerPayments.forEach((payment) => {
      if (payment.paymentType === "shuttle_monthly" && !map.has(payment.playerId)) {
        map.set(payment.playerId, payment);
      }
    });
    return map;
  }, [playerPayments]);

  function savePlayer(player: Player, patch: Partial<Player>) {
    updatePlayer.mutate({
      id: player.id,
      data: {
        shuttleService: patch.shuttleService ?? player.shuttleService ?? false,
        shuttleRoute: patch.shuttleRoute ?? player.shuttleRoute ?? null,
        shuttleDirection: patch.shuttleDirection ?? player.shuttleDirection ?? "round_trip",
      },
    });
  }

  async function importFile(file?: File | null) {
    if (!file) return;
    try {
      const rows = await parsePulminoWorkbook(file);
      let updated = 0;
      let paymentUpdated = 0;
      let paymentSkipped = 0;
      let notFound = 0;
      for (const row of rows) {
        const player = findImportedPlayer(sortedPlayers, row);
        if (!player) {
          notFound++;
          continue;
        }
        await updatePlayer.mutateAsync({
          id: player.id,
          data: {
            shuttleService: true,
            shuttleRoute: row.route || null,
            shuttleDirection: row.direction ?? "round_trip",
          },
        });
        const feeItem = findShuttleFeeItem(warehouseItems, row.route, row.direction);
        if (feeItem?.price != null) {
          const existing = playerPayments.find((payment) => payment.playerId === player.id && payment.paymentType === "shuttle_monthly");
          try {
            await upsertShuttlePayment(player.id, Number(feeItem.price), existing);
            paymentUpdated++;
          } catch {
            paymentSkipped++;
          }
        } else {
          paymentSkipped++;
        }
        updated++;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/player-payments"] });
      toast({
        title: "Import pulmino completato",
        description: `${updated} giocatori aggiornati. Quote aggiornate: ${paymentUpdated}. Non trovati: ${notFound}. Quote senza prezzo/permesso: ${paymentSkipped}.`,
      });
    } catch {
      toast({ title: "Import non riuscito", description: "Controlla che il file sia .xlsx o .xls.", variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function exportTemplate() {
    void downloadWorkbook(buildPulminoWorkbook(templateRows), "modello_pulmino_fortis.xlsx");
  }

  function exportExcel() {
    void downloadWorkbook(buildPulminoWorkbook(shuttleRows(filteredPlayers)), "pulmino.xlsx");
  }

  function exportPdf() {
    const rows = shuttleRows(filteredPlayers);
    downloadBlob(buildShuttlePdfBlob(rows), "pulmino.pdf");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Bus className="h-6 w-6 text-primary" />Pulmino</h1>
          <p className="text-sm text-muted-foreground">Tratte, direzione e riepiloghi dei giocatori che usufruiscono del servizio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={exportTemplate}>
            <FileDown className="h-4 w-4" />Modello
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" />Importa Excel
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={exportExcel}>
            <FileDown className="h-4 w-4" />Excel
          </Button>
          <Button type="button" className="gap-2" onClick={exportPdf}>
            <FileDown className="h-4 w-4" />PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><Filter className="h-4 w-4" />Annata/Squadra</Label>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {teams.map((team) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tratta</Label>
            <Select value={routeFilter} onValueChange={setRouteFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {routes.map((route) => <SelectItem key={route} value={route}>{route}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo tratta</Label>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="outbound">Solo andata</SelectItem>
                <SelectItem value="round_trip">Andata e ritorno</SelectItem>
                <SelectItem value="return">Solo ritorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Caricamento...</CardContent></Card>
      ) : filteredPlayers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nessun giocatore con pulmino per questi filtri.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filteredPlayers.map((player) => (
            <Card key={player.id}>
              <CardContent className="grid gap-3 p-4 lg:grid-cols-[1.5fr_1fr_1fr_auto] lg:items-end">
                <div>
                  <p className="font-semibold">{playerName(player)}</p>
                  <p className="text-sm text-muted-foreground">{player.teamName ?? "Senza squadra"}</p>
                </div>
                <div className="space-y-2">
                  <Label>Tratta</Label>
                  <Input defaultValue={player.shuttleRoute ?? ""} onBlur={(e) => savePlayer(player, { shuttleRoute: e.target.value.trim() || null })} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo tratta</Label>
                  <Select defaultValue={player.shuttleDirection || "round_trip"} onValueChange={(value) => savePlayer(player, { shuttleDirection: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">Solo andata</SelectItem>
                      <SelectItem value="round_trip">Andata e ritorno</SelectItem>
                      <SelectItem value="return">Solo ritorno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{directionLabel(player.shuttleDirection)}</Badge>
                  {paymentByPlayerId.get(player.id)?.amount != null && (
                    <Badge variant="secondary">Quota Euro {Number(paymentByPlayerId.get(player.id)?.amount ?? 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Badge>
                  )}
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => savePlayer(player, { shuttleService: false, shuttleRoute: null, shuttleDirection: null })}>
                    <Save className="h-4 w-4" />Disattiva
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
