import { useDialogViewport } from "@/hooks/use-dialog-viewport";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { withApi } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollableSelect } from "@/components/ui/scrollable-select";

type Player = { id: number; firstName: string; lastName: string; teamName?: string | null; dateOfBirth?: string | null; available?: boolean };
type Roster = { workGroups: { id: number; name: string; playerIds?: number[] }[] };
export function TrainingRosterPicker({ players, selectedIds, onConfirm, teamId, sessionId, buttonLabel="Scegli giocatori", showCount=true, disabled=false, excludedIds=[] }: {
  players: Player[]; sessionId?:number; selectedIds: number[]; onConfirm: (ids: number[]) => void; teamId?: string | number | null; buttonLabel?:string;showCount?:boolean;disabled?:boolean;excludedIds?:number[];
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const dialogViewport = useDialogViewport(open, true);
  const [draft, setDraft] = useState<number[]>([]);
  useEffect(()=>{if(excludedIds.length)setDraft(old=>old.filter(id=>!excludedIds.includes(id)));},[excludedIds.join(",")]);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [group, setGroup] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const groups = useQuery({ queryKey: ["training-rosters", Number(teamId), "shared",sessionId], enabled: open && !!teamId, queryFn: async (): Promise<Roster> => {
    const response = await fetch(withApi(sessionId?`/api/training-sessions/${sessionId}/roster?groups=1`:`/api/training-rosters/${teamId}?scope=shared`), { credentials: "include" });
    if (!response.ok) throw new Error("Impossibile caricare i gruppi della rosa");
    return response.json();
  }});
  const unique = [...new Map(players.map(player => [player.id, player])).values()];
  const years = [...new Set(unique.map(p => p.dateOfBirth?.slice(0, 4)).filter((v): v is string => !!v))].sort();
  const groupIds = groups.data?.workGroups.find(g => String(g.id) === group)?.playerIds ?? [];
  const visible = unique.filter(p => `${p.lastName} ${p.firstName} ${p.teamName ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!year || p.dateOfBirth?.startsWith(year)) && (!group || groupIds.includes(p.id)) && (!onlySelected || draft.includes(p.id))).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it"));
  function selectVisible() { setDraft(prev => [...new Set([...prev, ...visible.filter(p => p.available !== false).map(p => p.id)])]); }
  return <>
    <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" disabled={disabled} onClick={() => { setDraft([...selectedIds]); setSearch(""); setYear(""); setGroup(""); setOnlySelected(false); setOpen(true); }}>{buttonLabel}</Button>{showCount&&<span className="text-sm">{selectedIds.length} selezionati</span>}</div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent style={dialogViewport} className="flex h-[90dvh] max-h-[90dvh] w-[calc(100%-1rem)] max-w-5xl flex-col overflow-hidden sm:w-[calc(100%-3rem)]">
        <DialogHeader><DialogTitle>Rosa della stazione</DialogTitle><DialogDescription>Nomi completi, squadra e annata. La scelta viene applicata solo alla conferma.</DialogDescription></DialogHeader>
        <Input aria-label="Cerca giocatori" placeholder="Cerca per nome, cognome o squadra" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <ScrollableSelect className="w-full" aria-label="Filtra annata" value={year} onValueChange={setYear}><option value="">Tutte le annate</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</ScrollableSelect>
          <ScrollableSelect className="w-full" aria-label="Filtra gruppo di lavoro" value={group} onValueChange={setGroup}><option value="">Tutti i gruppi</option>{groups.data?.workGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</ScrollableSelect>
        </div>
        {groups.error && <p role="alert" className="text-xs text-destructive">{groups.error.message}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" size="sm" variant="outline" onClick={selectVisible}>Seleziona visibili</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDraft([])}>Svuota scelta</Button><div className="flex items-center gap-2"><Checkbox id={`${uid}-selected-only`} aria-label="Solo selezionati" checked={onlySelected} onCheckedChange={value => setOnlySelected(!!value)} /><label htmlFor={`${uid}-selected-only`}>Solo selezionati</label></div><span className="ml-auto">{draft.length} selezionati · {visible.length} visibili</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="grid gap-2 md:grid-cols-2">{visible.map(player => <div key={player.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-3">
            <Checkbox id={`${uid}-${player.id}`} aria-label={`${player.lastName} ${player.firstName}`} checked={draft.includes(player.id)} disabled={player.available === false && !draft.includes(player.id)} onCheckedChange={checked => setDraft(prev => checked ? [...new Set([...prev, player.id])] : prev.filter(id => id !== player.id))} />
            <label htmlFor={`${uid}-${player.id}`} className="min-w-0 cursor-pointer break-words"><span className="block font-medium">{player.lastName} {player.firstName}</span><span className="text-xs text-muted-foreground">{[player.teamName, player.dateOfBirth?.slice(0, 4), player.available === false ? "Non disponibile" : null].filter(Boolean).join(" · ")}</span></label>
          </div>)}</div>
          {!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">Nessun giocatore per questi filtri.</p>}
          {draft.some(id => !unique.some(p => p.id === id)) && <p className="mt-3 text-xs text-muted-foreground">La scelta contiene giocatori salvati non presenti nella rosa attualmente caricata. Sono conservati finché non svuoti la scelta.</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button><Button type="button" onClick={() => { onConfirm(draft); setOpen(false); }}>Conferma {draft.length} giocatori</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
