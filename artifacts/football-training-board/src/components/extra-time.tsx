import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { extraTimeCatalog, extraTimeShareCents } from "@workspace/api-zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DisclosureSummary } from "@/components/ui/disclosure-summary";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { ReceiptMethodSelect } from "@/components/receipt-method-select";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { isReceiptMethod, paymentStatus, paymentStatuses, receiptMethodLabel } from "@/lib/payment-summary";

type Movement = { id: number; amount: number; status: string; paymentMethod?: string; paymentDate?: string; dueDate?: string };
type RecordedMovement = Movement & { playerId: number; paymentType: string; description?: string };
type Entry = { id: number; participantId: number; formula: string; agreement: string; playerId: number; playerName: string; teamName?: string; shareCents: number; movements: Movement[] };
type Player = { id: number; firstName: string; lastName: string; status?: string };
type Draft = { amount: string; status: string; date: string; method: string };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });
const euro = (cents: number) => money.format(cents / 100);
const cents = (amount: number) => Math.round(amount * 100);
const paid = (entry: Entry) => entry.movements.reduce((sum, movement) => sum + (movement.status === "paid" ? cents(movement.amount) : 0), 0);
const booked = (entry: Entry) => entry.movements.reduce((sum, movement) => sum + cents(movement.amount), 0);
const blank = (): Draft => ({ amount: "", status: "paid", date: "", method: "" });
const valid = (draft: Draft) => Number(draft.amount) >= 0.01 && !!draft.date && (draft.status !== "paid" || isReceiptMethod(draft.method));
const payload = (draft: Draft) => ({ ...draft, amount: Number(draft.amount) });
const localDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const showDate = (date?: string) => date ? date.split("-").reverse().join("/") : "—";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(withApi(path), { credentials: "include", method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Operazione Extra Time non riuscita.");
  return res.status === 204 ? undefined as T : res.json();
}

function MovementFields({ value, onChange, settlement = false }: { value: Draft; onChange: (value: Draft) => void; settlement?: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-2">
    {!settlement && <>
      <label className="text-sm">Tipo<ScrollableSelect aria-label="Tipo movimento" className="mt-1 w-full" value={value.status} onValueChange={status => onChange({ ...value, status })}>
        <option value="paid">Versamento incassato</option><option value="pending">Rata da incassare</option>
      </ScrollableSelect></label>
      <label className="text-sm">Importo (€)<Input className="mt-1" type="number" min="0.01" step="0.01" value={value.amount}
        onChange={event => onChange({ ...value, amount: event.target.value })} /></label>
    </>}
    <label className="text-sm">{value.status === "paid" ? "Data d’incasso" : "Scadenza"}
      <Input className="mt-1" type="date" value={value.date} onChange={event => onChange({ ...value, date: event.target.value })} />
    </label>
    {value.status === "paid" && <ReceiptMethodSelect value={value.method} onChange={method => onChange({ ...value, method })} />}
  </div>;
}

function Catalog() {
  return <section className="space-y-2">
    <h2 className="text-sm font-semibold">Listino Extra Time</h2>
    <div className="grid gap-2 sm:grid-cols-2">
      {extraTimeCatalog.map(item => <div key={item.id} className="rounded-xl border bg-card px-3 py-2.5">
        <h3 className="text-sm font-medium">{item.name}</h3>
        <p className="mt-1 tabular-nums">{euro(item.cents)} <span className="text-xs text-muted-foreground">{item.min > 1 ? "a gruppo" : "totali"}</span></p>
        <p className="text-xs text-muted-foreground">{item.id === "group-3-5" ? "60 min · da 14,00 € a 23,34 € a giocatore" :
          item.id === "group-2" ? "60 min · 25,00 € a giocatore" : `${item.lessons} × 60 min · ${euro(item.cents / item.lessons)} a lezione`}</p>
      </div>)}
    </div>
  </section>;
}

function NewPackage({ players, fixedPlayer, onSave, busy }: { players: Player[]; fixedPlayer?: number; onSave: (body: unknown) => void; busy: boolean }) {
  const [formulaId, setFormulaId] = useState<string>(extraTimeCatalog[0].id);
  const [ids, setIds] = useState<number[]>(fixedPlayer ? [fixedPlayer] : []);
  const [drafts, setDrafts] = useState<Record<number, Draft[]>>({});
  const [agreement, setAgreement] = useState("");
  const formula = extraTimeCatalog.find(item => item.id === formulaId) ?? extraTimeCatalog[0];
  const eligibleCount = ids.length >= formula.min && ids.length <= formula.max;
  const share = (index: number) => extraTimeShareCents(formula.cents, ids.length, index);
  const canSave = eligibleCount && ids.every((id, index) => {
    const rows = drafts[id] ?? [];
    return rows.every(valid) && rows.reduce((sum, row) => sum + cents(Number(row.amount)), 0) <= share(index);
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) onSave({ formula: formula.id, agreement, participants: ids.map(playerId => ({ playerId, movements: (drafts[playerId] ?? []).map(payload) })) });
  }
  return <form className="space-y-4" onSubmit={submit}>
    <label className="block text-sm">Pacchetto<ScrollableSelect aria-label="Pacchetto" className="mt-1 w-full" value={formulaId} onValueChange={setFormulaId}>
      {extraTimeCatalog.map(item => <option key={item.id} value={item.id}>{item.name} · {euro(item.cents)}</option>)}
    </ScrollableSelect></label>
    <div className="space-y-2">
      {ids.length < formula.max && <ScrollableSelect aria-label="Aggiungi giocatore" className="w-full" value="" onValueChange={id => { if (id) setIds(current => [...current, Number(id)]); }}>
        <option value="">Aggiungi giocatore</option>
        {players.filter(player => !ids.includes(player.id)).map(player => <option key={player.id} value={player.id}>{player.lastName} {player.firstName}</option>)}
      </ScrollableSelect>}
      <p className="text-xs text-muted-foreground">Partecipanti {ids.length} · {formula.min === formula.max ? formula.min : `${formula.min}–${formula.max}`} richiesti</p>
    </div>
    {ids.map((id, index) => {
      const player = players.find(item => item.id === id);
      const rows = drafts[id] ?? [];
      return <div key={id} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <strong>{player ? `${player.lastName} ${player.firstName}` : "Giocatore selezionato"}</strong>
          {eligibleCount && <span>Quota {euro(share(index))}</span>}
          {id !== fixedPlayer && <Button type="button" variant="ghost" size="sm" onClick={() => {
            setIds(current => current.filter(value => value !== id));
            setDrafts(current => ({ ...current, [id]: [] }));
          }}>Rimuovi</Button>}
        </div>
        {rows.map((row, position) => <div key={position} className="space-y-1 border-t pt-2">
          <MovementFields value={row} onChange={value => setDrafts(current => ({ ...current, [id]: rows.map((item, i) => i === position ? value : item) }))} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setDrafts(current => ({ ...current, [id]: rows.filter((_, i) => i !== position) }))}>Rimuovi movimento</Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" disabled={rows.length >= 120} onClick={() => setDrafts(current => ({ ...current, [id]: [...rows, blank()] }))}>+ Versamento o rata</Button>
      </div>;
    })}
    <label className="block text-sm">Accordo o note <Input className="mt-1" value={agreement} maxLength={1000} onChange={event => setAgreement(event.target.value)} /></label>
    <Button type="submit" disabled={!canSave || busy}>Salva pacchetto</Button>
  </form>;
}

export function ExtraTime({ playerId, readOnly = false }: { playerId?: number; readOnly?: boolean }) {
  const { role, club } = useAuth();
  const canEdit = role === "secretary" && !readOnly;
  const cache = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [packageFilter, setPackageFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("");
  const [movementEditor, setMovementEditor] = useState<{ entry: Entry; receipt?: Movement; draft: Draft }>();
  const [linkEntry, setLinkEntry] = useState<Entry>();
  const [linkId, setLinkId] = useState("");
  const [error, setError] = useState("");
  const list = useQuery({ queryKey: ["/api/extra-time", club?.id, role, playerId], queryFn: () => request<Entry[]>(`/api/extra-time${playerId ? `?playerId=${playerId}` : ""}`) });
  const playerList = useQuery({ queryKey: ["/api/players", "extra-time", club?.id], queryFn: () => request<Player[]>("/api/players"), enabled: canEdit && dialog });
  const recorded = useQuery({ queryKey: ["/api/player-payments", "extra-time-link", club?.id], queryFn: () => request<RecordedMovement[]>("/api/player-payments"), enabled: canEdit && !!linkEntry });
  const linkedIds = new Set((list.data ?? []).flatMap(entry => entry.movements.map(movement => movement.id)));
  const linkOptions = (recorded.data ?? []).filter(movement => linkEntry && movement.playerId === linkEntry.playerId && movement.status === "paid" &&
    !linkedIds.has(movement.id) && movement.amount > 0 && cents(movement.amount) <= linkEntry.shareCents - booked(linkEntry) &&
    ["player_total_deposit", "player_total_installment", "other", "extra_time_fee"].includes(movement.paymentType));
  const players = [...(playerList.data ?? [])].filter(player => player.status !== "training_trial")
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it"));
  const mutation = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method?: string }) => request(path, method ?? "POST", body),
    onSuccess: async () => {
      setDialog(false);
      setMovementEditor(undefined);
      setLinkEntry(undefined);
      await Promise.all(["/api/extra-time", "/api/player-payments", "/api/players"].map(key => cache.invalidateQueries({ queryKey: [key] })));
    },
    onError: problem => setError(problem.message),
  });
  const entries = (list.data ?? []).filter(entry => (!packageFilter || entry.formula === packageFilter) &&
    (!balanceFilter || (balanceFilter === "paid" ? paid(entry) >= entry.shareCents : paid(entry) < entry.shareCents)) &&
    `${entry.playerName} ${entry.teamName ?? ""}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")));
  const total = entries.reduce((sum, entry) => sum + entry.shareCents, 0);
  const collected = entries.reduce((sum, entry) => sum + paid(entry), 0);
  const outstanding = entries.reduce((sum, entry) => sum + Math.max(0, entry.shareCents - paid(entry)), 0);
  function editMovement(entry: Entry, receipt?: Movement) {
    setError("");
    setMovementEditor({ entry, receipt, draft: {
      ...blank(), amount: receipt ? String(receipt.amount) : "",
      date: receipt?.paymentDate ?? (receipt?.status === "paid" ? "" : receipt ? localDate() : ""),
      method: isReceiptMethod(receipt?.paymentMethod) ? receipt.paymentMethod : "",
    } });
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {!playerId && <h1 className="text-2xl font-semibold">Extra Time</h1>}
      {canEdit && <Button type="button" onClick={() => { setError(""); setDialog(true); }}>+ Aggiungi pacchetto</Button>}
    </div>
    {!playerId && <>
      <div className="grid gap-2 sm:grid-cols-3">
        {[["Valore pacchetti", total], ["Incassato", collected], ["Da incassare", outstanding]].map(([label, amount]) =>
          <div key={label} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg tabular-nums">{euro(Number(amount))}</p></div>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input aria-label="Cerca giocatore o annata" placeholder="Cerca giocatore o annata" value={search} onChange={event => setSearch(event.target.value)} />
        <ScrollableSelect aria-label="Filtra pacchetto" className="w-full" value={packageFilter} onValueChange={setPackageFilter}>
          <option value="">Tutti i pacchetti</option>{extraTimeCatalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </ScrollableSelect>
        <ScrollableSelect aria-label="Filtra stato pagamenti" className="w-full" value={balanceFilter} onValueChange={setBalanceFilter}>
          <option value="">Tutti gli stati</option><option value="paid">Saldati</option><option value="open">Con residuo</option>
        </ScrollableSelect>
      </div>
    </>}
    {list.isPending ? <p role="status">Caricamento pacchetti…</p> : list.isError ? <p role="alert">Impossibile caricare Extra Time. <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>Riprova</Button></p> :
      entries.length === 0 ? <p className="text-sm text-muted-foreground">Nessun pacchetto da mostrare.</p> :
      entries.map(entry => {
        const item = extraTimeCatalog.find(formula => formula.id === entry.formula);
        const received = paid(entry);
        return <details key={entry.participantId} className="rounded-xl border bg-card p-3">
          <DisclosureSummary className="cursor-pointer text-sm font-medium">
            {!playerId && `${entry.playerName} · `}{item?.name ?? "Pacchetto Extra Time"} · {euro(entry.shareCents)}
            <span className="ml-2 text-xs text-muted-foreground">{received >= entry.shareCents ? "Saldato" : `${euro(entry.shareCents - received)} da incassare`}</span>
          </DisclosureSummary>
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted-foreground">{item?.lessons ?? 1} × 60 min · {euro(entry.shareCents / (item?.lessons ?? 1))} a lezione per atleta</p>
            {!playerId && <Link href={`/players?openPlayerId=${entry.playerId}&focus=extra-time`} className="text-primary underline">Apri scheda giocatore</Link>}
            {entry.agreement && <p>Accordo · {entry.agreement}</p>}
            {entry.movements.map(movement => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <div>{paymentStatuses[paymentStatus(movement, localDate())]} · {showDate(movement.status === "paid" ? movement.paymentDate : movement.dueDate)}
                {movement.status === "paid" && ` · ${receiptMethodLabel(movement.paymentMethod)}`}
              </div>
              <span className="tabular-nums">{euro(cents(movement.amount))}</span>
              {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => editMovement(entry, movement)}>
                {movement.status === "paid" ? "Dati incasso" : "Incassa rata"}
              </Button>}
            </div>)}
            {canEdit && booked(entry) < entry.shareCents && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => editMovement(entry)}>+ Versamento o rata</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { setError(""); setLinkId(""); setLinkEntry(entry); }}>Collega incasso esistente</Button>
            </div>}
          </div>
        </details>;
      })}
    {!playerId && <Catalog />}
    <Dialog open={dialog} onOpenChange={open => { if (!mutation.isPending) setDialog(open); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Aggiungi pacchetto Extra Time</DialogTitle></DialogHeader>
        {playerList.isError ? <p role="alert">Impossibile caricare i giocatori. <Button type="button" variant="outline" onClick={() => void playerList.refetch()}>Riprova</Button></p> :
          playerList.isSuccess ? <NewPackage players={players} fixedPlayer={playerId} busy={mutation.isPending} onSave={body => { setError(""); mutation.mutate({ path: "/api/extra-time", body }); }} /> :
          <p role="status">Caricamento giocatori…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!linkEntry} onOpenChange={open => { if (!open && !mutation.isPending) setLinkEntry(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Collega incasso esistente</DialogTitle></DialogHeader>
        {recorded.isError ? <p role="alert">Impossibile caricare i movimenti. <Button type="button" variant="outline" onClick={() => void recorded.refetch()}>Riprova</Button></p>
          : recorded.isPending ? <p role="status">Caricamento movimenti…</p>
          : linkOptions.length === 0 ? <p className="text-sm text-muted-foreground">Nessun incasso compatibile con il residuo.</p>
          : <form className="space-y-3" onSubmit={event => {
            event.preventDefault();
            if (!linkEntry || !linkOptions.some(movement => String(movement.id) === linkId)) return;
            setError("");
            mutation.mutate({ path: `/api/extra-time/participants/${linkEntry.participantId}/movements`, body: { paymentId: Number(linkId) } });
          }}>
            <p className="text-sm text-muted-foreground">Seleziona l’incasso di {linkEntry?.playerName} riferito a questo pacchetto.</p>
            <ScrollableSelect aria-label="Incasso da collegare" className="w-full" value={linkId} onValueChange={setLinkId}>
              <option value="">Scegli incasso</option>
              {linkOptions.map(movement => <option key={movement.id} value={movement.id}>
                {euro(cents(movement.amount))} · {showDate(movement.paymentDate)} · {movement.description || receiptMethodLabel(movement.paymentMethod)}
              </option>)}
            </ScrollableSelect>
            <Button type="submit" disabled={!linkId || mutation.isPending}>Conferma collegamento</Button>
          </form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!movementEditor} onOpenChange={open => { if (!open && !mutation.isPending) setMovementEditor(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{movementEditor?.receipt ? "Dati incasso" : "Versamento o rata"}</DialogTitle></DialogHeader>
        {movementEditor && <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          const { entry, receipt, draft } = movementEditor;
          if (!valid(draft)) return;
          setError("");
          mutation.mutate(receipt ? { path: `/api/player-payments/${receipt.id}`, method: "PATCH", body: { status: "paid", paymentDate: draft.date, paymentMethod: draft.method } } :
            { path: `/api/extra-time/participants/${entry.participantId}/movements`, body: payload(draft) });
        }}>
          <p className="text-sm text-muted-foreground">{movementEditor.entry.playerName} · {euro(movementEditor.receipt ? cents(movementEditor.receipt.amount) : movementEditor.entry.shareCents - booked(movementEditor.entry))}</p>
          <MovementFields value={movementEditor.draft} settlement={!!movementEditor.receipt} onChange={draft => setMovementEditor({ ...movementEditor, draft })} />
          <Button type="submit" disabled={mutation.isPending || !valid(movementEditor.draft)}>Salva movimento</Button>
        </form>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
