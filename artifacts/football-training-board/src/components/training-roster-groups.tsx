import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";

type Team = { id: number; name: string; seasonId: number | null; clubSection: string };
type Group = { id: number; name: string; kind: string; teamIds?: number[]; anchorTeamId?: number | null; criterion: string; birthYear?: number | null; playerIds?: number[] };
type Config = { teams: Team[]; sharedGroups: Group[]; workGroups: Group[] };
type Player = { id: number; firstName: string; lastName: string; teamName?: string | null; dateOfBirth?: string | null; available?: boolean };
type Roster = { group?: Group; teamIds: number[]; teamPlayerIds: number[]; players: Player[]; workGroups: Group[] };
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(withApi(path), { ...options, credentials: "include", headers: { "Content-Type": "application/json" } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Operazione non riuscita");
  return body;
}
const field = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";
const action = "rounded-md border px-3 py-2 text-sm disabled:opacity-50";

export function TrainingRosterManager({ kind }: { kind: "shared" | "work" }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [anchor, setAnchor] = useState("");
  const [criterion, setCriterion] = useState("manual");
  const [year, setYear] = useState("");
  const [playerIds, setPlayerIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["training-rosters", "config"], queryFn: () => request<Config>("/api/training-rosters/config"), enabled: open });
  const roster = useQuery({ queryKey: ["training-rosters", Number(anchor), "shared"], queryFn: () => request<Roster>(`/api/training-rosters/${anchor}?scope=shared`), enabled: open && kind === "work" && !!anchor });
  const clear = () => { setId(null); setName(""); setTeamIds([]); setAnchor(""); setCriterion("manual"); setYear(""); setPlayerIds([]); setError(""); };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["training-rosters"] });
  const toggle = (items: number[], value: number) => items.includes(value) ? items.filter(id => id !== value) : [...items, value];
  async function save() {
    setBusy(true); setError("");
    try {
      await request(`/api/training-rosters/groups${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify({ kind, name, teamIds, anchorTeamId: Number(anchor), criterion, birthYear: Number(year), playerIds }) });
      clear(); await invalidate();
    } catch (err) { setError(err instanceof Error ? err.message : "Errore"); } finally { setBusy(false); }
  }
  return <details className="rounded-xl border bg-card p-3" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">{kind === "shared" ? "Squadre unite per gli allenamenti" : "Gruppi di lavoro della rosa"}</summary>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">{kind === "shared" ? "Unisci rose per allenamenti ed esercitazioni. Squadre, partite e convocazioni restano distinte. Sono selezionabili solo squadre già autorizzate della stessa stagione e sezione." : "Crea gruppi per annata, scelta manuale, livello o obiettivo. Un giocatore può appartenere a più gruppi. Le modifiche non cambiano i partecipanti delle esercitazioni già salvate."}</p>
      {(error || config.error || roster.error) && <p role="alert" className="text-sm text-red-600">{error || config.error?.message || roster.error?.message}</p>}
      {config.isLoading ? <p>Caricamento…</p> : !config.data?.teams.length ? <p>Nessuna squadra autorizzata.</p> : <>
        <div className="space-y-2">{(kind === "shared" ? config.data.sharedGroups : config.data.workGroups).map(group => <div key={group.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
          <span className="min-w-0 break-words text-sm">{group.name}{kind === "shared" ? ` · ${(group.teamIds ?? []).map(id => config.data!.teams.find(team => team.id === id)?.name).join(" + ")}` : ` · ${config.data!.teams.find(team => team.id === group.anchorTeamId)?.name ?? ""}`}</span>
          <div className="flex gap-2"><button type="button" className={action} onClick={() => { setId(group.id); setName(group.name); setTeamIds(group.teamIds ?? []); setAnchor(String(group.anchorTeamId ?? "")); setCriterion(group.criterion); setYear(String(group.birthYear ?? "")); setPlayerIds(group.playerIds ?? []); setError(""); }}>Modifica</button>
          <button type="button" disabled={busy} className={action} onClick={async () => { if (!window.confirm("Disattivare il gruppo? Lo storico delle esercitazioni rimane invariato.")) return; setBusy(true); try { await request(`/api/training-rosters/groups/${group.id}`, { method: "DELETE" }); clear(); await invalidate(); } catch (err) { setError(err instanceof Error ? err.message : "Errore"); } finally { setBusy(false); } }}>Disattiva</button></div>
        </div>)}</div>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Nome del gruppo<input aria-label="Nome del gruppo" value={name} maxLength={100} onChange={event => setName(event.target.value)} className={field} /></label>
          {kind === "shared" ? <fieldset className="max-h-52 space-y-2 overflow-y-auto"><legend className="text-sm">Squadre da unire</legend>{config.data.teams.map(team => <label key={team.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={teamIds.includes(team.id)} onChange={() => setTeamIds(toggle(teamIds, team.id))} />{team.name}</label>)}</fieldset> : <>
            <label className="space-y-1 text-sm">Rosa di riferimento<select aria-label="Rosa di riferimento" className={field} value={anchor} onChange={event => { setAnchor(event.target.value); setPlayerIds([]); }}><option value="">Scegli squadra</option>{config.data.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label className="space-y-1 text-sm">Criterio<select aria-label="Criterio gruppo" className={field} value={criterion} onChange={event => setCriterion(event.target.value)}><option value="manual">Scelta manuale</option><option value="year">Annata automatica</option><option value="level">Livello di lavoro</option><option value="objective">Obiettivo</option></select></label>
            {criterion === "year" ? <label className="space-y-1 text-sm">Anno di nascita<input aria-label="Anno di nascita" type="number" min={1900} max={2200} className={field} value={year} onChange={event => setYear(event.target.value)} /></label> : <div className="space-y-2 sm:col-span-2"><input aria-label="Cerca giocatori del gruppo" placeholder="Cerca giocatori" className={field} value={search} onChange={event => setSearch(event.target.value)} /><div className="max-h-52 space-y-2 overflow-y-auto">{roster.data?.players.filter(player => `${player.firstName} ${player.lastName}`.toLowerCase().includes(search.toLowerCase())).map(player => <label key={player.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={playerIds.includes(player.id)} onChange={() => setPlayerIds(toggle(playerIds, player.id))} />{player.firstName} {player.lastName}<span className="text-xs text-muted-foreground">{player.teamName}</span></label>)}</div><p className="text-xs">{playerIds.length} selezionati</p></div>}
          </>}
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" className={action} disabled={busy || !name.trim() || (kind === "shared" ? teamIds.length < 2 : !anchor || roster.isFetching || (criterion === "year" ? !year || Number(year) < 1900 || Number(year) > 2200 : !playerIds.length))} onClick={() => void save()}>{busy ? "Salvataggio…" : id ? "Salva gruppo" : "Crea gruppo"}</button><button type="button" className={action} onClick={clear}>Annulla modifica</button></div>
        </div>
      </>}
    </div>}
  </details>;
}

export function TrainingRosterOptions({ teamId, onSelect }: { teamId?: string | number | null; onSelect: (ids: number[]) => void }) {
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const query = useQuery({ queryKey: ["training-rosters", Number(teamId), "shared"], queryFn: () => request<Roster>(`/api/training-rosters/${teamId}?scope=shared`), enabled: !!teamId });
  if (!teamId) return null;
  if (query.error) return <p role="alert" className="text-sm text-red-600">{query.error.message}</p>;
  const data = query.data;
  if (!data) return <p className="text-xs">Caricamento rosa allenamento…</p>;
  const usableIds = new Set(data.players.filter(player => player.available !== false).map(player => player.id));
  return <div className="space-y-2 rounded-md border p-3">
    <p className="text-sm font-medium">{data.group ? `Rosa condivisa: ${data.group.name}` : "Rosa allenamento della squadra"}</p>
    <div className="flex flex-wrap gap-2"><button type="button" className={action} onClick={() => { setSelectedGroups([]); onSelect(data.teamPlayerIds.filter(id => usableIds.has(id))); }}>Carica solo questa squadra</button>{data.group && <button type="button" className={action} onClick={() => { setSelectedGroups([]); onSelect([...usableIds]); }}>Carica tutta la rosa condivisa</button>}</div>
    {!!data.workGroups.length && <fieldset className="max-h-44 space-y-2 overflow-y-auto"><legend className="text-sm">Gruppi di lavoro</legend>{data.workGroups.map(group => <label className="flex min-h-10 items-center gap-2 text-sm" key={group.id}><input type="checkbox" checked={selectedGroups.includes(group.id)} onChange={() => {
      const next = selectedGroups.includes(group.id) ? selectedGroups.filter(id => id !== group.id) : [...selectedGroups, group.id];
      setSelectedGroups(next); onSelect([...new Set(data.workGroups.filter(group => next.includes(group.id)).flatMap(group => group.playerIds ?? []))].filter(id => usableIds.has(id)));
    }} />{group.name} ({(group.playerIds ?? []).filter(id => usableIds.has(id)).length})</label>)}</fieldset>}
    <p className="text-xs text-muted-foreground">Puoi completare la scelta usando i singoli nomi. I partecipanti salvati restano quelli selezionati oggi.</p>
  </div>;
}
