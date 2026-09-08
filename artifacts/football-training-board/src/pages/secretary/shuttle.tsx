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
import { parseExcelFile, cellToTrimmedString } from "@/lib/excel-import";
import { exportToExcel } from "@/lib/excel-export";

type ShuttleDirection = "outbound" | "round_trip" | "return";

type Player = {
  id: number;
  firstName: string;
  lastName: string;
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

function playerName(player: Player): string {
  return [player.lastName, player.firstName].filter(Boolean).join(" ");
}

function directionLabel(value?: string | null): string {
  if (value === "outbound") return "Solo andata";
  if (value === "return") return "Solo ritorno";
  return "Andata e ritorno";
}

function normalizeDirection(value: unknown): ShuttleDirection {
  const raw = cellToTrimmedString(value).toLowerCase();
  if (raw.includes("solo") && raw.includes("ritorno")) return "return";
  if (raw.includes("solo") && raw.includes("andata")) return "outbound";
  if (raw === "return") return "return";
  if (raw === "outbound") return "outbound";
  return "round_trip";
}

function normalizeBool(value: unknown): boolean {
  const raw = cellToTrimmedString(value).toLowerCase();
  return ["si", "sì", "yes", "true", "1", "x", "attivo"].includes(raw);
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
    Cognome: player.lastName,
    Nome: player.firstName,
    Squadra: player.teamName ?? "",
    Pulmino: player.shuttleService ? "Si" : "No",
    Tratta: player.shuttleRoute ?? "",
    "Tipo tratta": player.shuttleService ? directionLabel(player.shuttleDirection) : "",
  }));
}

const templateRows = [
  { Cognome: "Rossi", Nome: "Mario", Squadra: "Allievi A", Pulmino: "Si", Tratta: "Ronta", "Tipo tratta": "Andata e ritorno" },
  { Cognome: "Bianchi", Nome: "Luca", Squadra: "Allievi B", Pulmino: "Si", Tratta: "Ronta", "Tipo tratta": "Solo andata" },
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
      const rows = await parseExcelFile(file);
      let updated = 0;
      for (const row of rows) {
        const firstName = cellToTrimmedString(row.Nome);
        const lastName = cellToTrimmedString(row.Cognome);
        if (!firstName || !lastName) continue;
        const player = sortedPlayers.find((item) =>
          item.firstName.localeCompare(firstName, "it", { sensitivity: "base" }) === 0 &&
          item.lastName.localeCompare(lastName, "it", { sensitivity: "base" }) === 0
        );
        if (!player) continue;
        await updatePlayer.mutateAsync({
          id: player.id,
          data: {
            shuttleService: normalizeBool(row.Pulmino),
            shuttleRoute: cellToTrimmedString(row.Tratta) || null,
            shuttleDirection: normalizeDirection(row["Tipo tratta"]),
          },
        });
        updated++;
      }
      toast({ title: "Import pulmino completato", description: `${updated} giocatori aggiornati.` });
    } catch {
      toast({ title: "Import non riuscito", description: "Controlla che il file sia .xlsx o .xls.", variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function exportPdf() {
    const rows = shuttleRows(filteredPlayers);
    const htmlRows = rows.map((row) => `
      <tr>
        <td>${row.Cognome}</td>
        <td>${row.Nome}</td>
        <td>${row.Squadra}</td>
        <td>${row.Tratta}</td>
        <td>${row["Tipo tratta"]}</td>
      </tr>
    `).join("");
    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Popup bloccato", description: "Consenti i popup per esportare/stampare il PDF.", variant: "destructive" });
      return;
    }
    win.document.write(`<!doctype html>
      <html><head><title>Pulmino</title>
      <style>
        body{font-family:Arial,sans-serif;margin:32px;color:#111827}
        h1{font-size:26px;margin:0 0 8px} p{margin:0 0 18px;color:#4b5563}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d1d5db;padding:8px;text-align:left}
        th{background:#f3f4f6}
      </style></head><body>
      <h1>Elenco pulmino</h1><p>${filteredPlayers.length} giocatori filtrati</p>
      <table><thead><tr><th>Cognome</th><th>Nome</th><th>Squadra</th><th>Tratta</th><th>Tipo tratta</th></tr></thead><tbody>${htmlRows}</tbody></table>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`);
    win.document.close();
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
          <Button type="button" variant="outline" className="gap-2" onClick={() => exportToExcel(templateRows, "modello_pulmino.xlsx", "Pulmino", { preferSavePicker: true })}>
            <FileDown className="h-4 w-4" />Modello
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" />Importa Excel
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => exportToExcel(shuttleRows(filteredPlayers), "pulmino.xlsx", "Pulmino", { preferSavePicker: true })}>
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
