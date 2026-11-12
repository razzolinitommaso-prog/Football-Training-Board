import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { trainingLocalDate } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { ReceiptMethodSelect } from "@/components/receipt-method-select";
import { useAuth } from "@/hooks/use-auth";
import { withApi } from "@/lib/api-base";
import { isReceiptMethod, paymentCategories, paymentCategory, paymentStatus, paymentStatuses, receiptMethodLabel, type PaymentEntry } from "@/lib/payment-summary";

export type PlayerLedgerPayment = PaymentEntry & { id: number; amount: number; paymentDate?: string | null };
type LedgerPayment = PlayerLedgerPayment & { playerId: number };
type Player = { id: number; firstName: string; lastName: string; teamId?: number | null; clubSection?: string };
type Team = { id: number; name: string; clubSection: string };
type Editor = { action: "due" | "settle" | "add"; ids: number[]; date: string; method: string; amount: string; paymentType: string; status: "paid" | "pending"; description: string };
const paymentTypes = { registration_fee: "Iscrizione · prima rata", annual_fee_installment: "Quota annuale", insurance_fee: "Assicurazione", kit_payment: "Kit", shuttle_monthly: "Pulmino", other: "Altro" };
const sectors = { scuola_calcio: "Scuola Calcio", settore_giovanile: "Settore Giovanile", prima_squadra: "Prima Squadra" };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });
const sum = (payments: PlayerLedgerPayment[]) => payments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0) / 100;
const displayDate = (date?: string | null) => date?.split("-").reverse().join("/") ?? "—";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(withApi(path), { method, credentials: "include",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Operazione non riuscita.");
  return response.status === 204 ? undefined as T : response.json();
}

export function PlayerPaymentRegister({ playerId, payments, allowSecretaryEdit = true, onDelete }: {
  playerId: number; payments: PlayerLedgerPayment[]; allowSecretaryEdit?: boolean; onDelete?: (id: number) => void;
}) {
  const { role } = useAuth();
  const canCollect = role === "secretary" && allowSecretaryEdit;
  const canReschedule = canCollect || role === "presidente";
  const cache = useQueryClient();
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState("");
  const today = trainingLocalDate();
  const openPayments = payments.filter(payment => payment.status !== "paid" && payment.amount > 0);
  const overdue = openPayments.filter(payment => paymentStatus(payment, today) === "overdue");
  const save = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body: object }) => request(path, method, body),
    onSuccess: async () => {
      setEditor(undefined);
      await Promise.all(["/api/player-payments", "/api/players", "/api/extra-time"].map(key => cache.invalidateQueries({ queryKey: [key] })));
    },
    onError: error => setError(error.message),
  });
  function open(action: Editor["action"], rows: PlayerLedgerPayment[] = []) {
    setError("");
    setEditor({ action, ids: rows.map(payment => payment.id), date: action === "due" ? rows[0]?.dueDate ?? "" : today,
      method: "", amount: "", paymentType: "annual_fee_installment", status: "paid", description: "" });
  }
  const requiresMethod = editor?.action === "settle" || (editor?.action === "add" && editor.status === "paid");
  const invalid = !editor?.date || (requiresMethod && !isReceiptMethod(editor.method)) || (editor.action === "add" && !(Number(editor.amount) >= 0.01 && Number(editor.amount) <= 20000));
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[["Totale registrato", sum(payments)], ["Incassato", sum(payments.filter(payment => payment.status === "paid"))],
        ["Residuo", sum(openPayments)], ["Di cui scaduto", sum(overdue)]].map(([label, amount]) =>
        <div key={label} className="rounded-lg border bg-card p-2.5"><p className="text-xs text-muted-foreground">{label}</p><p className="tabular-nums font-medium">{money.format(Number(amount))}</p></div>)}
    </div>
    {canCollect && <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => open("add")}>+ Aggiungi voce</Button>
      {openPayments.length > 0 && <Button type="button" size="sm" variant="outline" onClick={() => open("settle", openPayments)}>Incassa saldo · {money.format(sum(openPayments))}</Button>}
    </div>}
    <div className="divide-y rounded-lg border bg-card">
      {payments.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nessun movimento registrato.</p>}
      {payments.map(payment => <div key={payment.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <div className="min-w-32 flex-1">
          <p>{payment.description || paymentCategories[paymentCategory(payment)]}</p>
          <p className="text-xs text-muted-foreground">{paymentStatuses[paymentStatus(payment, today)]} · {displayDate(payment.status === "paid" ? payment.paymentDate : payment.dueDate)}
            {payment.status === "paid" && ` · ${receiptMethodLabel(payment.paymentMethod)}`}</p>
        </div>
        <strong className="tabular-nums">{money.format(payment.amount)}</strong>
        {payment.status !== "paid" && canReschedule && <Button type="button" size="sm" variant="outline" onClick={() => open("due", [payment])}>Modifica scadenza</Button>}
        {payment.status !== "paid" && canCollect && payment.amount > 0 && <Button type="button" size="sm" onClick={() => open("settle", [payment])}>Incassa rata</Button>}
        {canCollect && onDelete && <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(payment.id)}>Elimina</Button>}
      </div>)}
    </div>
    <Dialog open={!!editor} onOpenChange={value => { if (!value && !save.isPending) setEditor(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editor?.action === "due" ? "Modifica scadenza" : editor?.action === "settle" ? "Registra incasso" : "Aggiungi voce"}</DialogTitle></DialogHeader>
        {editor && <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          if (invalid || save.isPending) return;
          setError("");
          if (editor.action === "due") {
            save.mutate({ path: `/api/player-payments/${editor.ids[0]}/due-date`, method: "PATCH", body: { dueDate: editor.date } });
          } else if (editor.action === "settle") {
            save.mutate({ path: "/api/player-payments/settle", method: "POST", body: { playerId, ids: editor.ids, paymentDate: editor.date, paymentMethod: editor.method } });
          } else {
            save.mutate({ path: "/api/player-payments", method: "POST", body: {
              playerId, amount: Number(editor.amount), status: editor.status, paymentType: editor.paymentType,
              description: editor.description.trim() || paymentTypes[editor.paymentType as keyof typeof paymentTypes],
              dueDate: editor.status === "pending" ? editor.date : null,
              paymentDate: editor.status === "paid" ? editor.date : null, paymentMethod: editor.status === "paid" ? editor.method : null,
            } });
          }
        }}>
          {editor.action === "settle" && <p className="text-sm">Importo da incassare <strong>{money.format(sum(payments.filter(payment => editor.ids.includes(payment.id))))}</strong></p>}
          {editor.action === "add" && <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">Voce<ScrollableSelect aria-label="Voce" className="mt-1 w-full" value={editor.paymentType} onValueChange={paymentType => setEditor({ ...editor, paymentType })}>
              {Object.entries(paymentTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </ScrollableSelect></label>
            <label className="block text-sm">Importo (€)<Input type="number" min="0.01" max="20000" step="0.01" value={editor.amount} onChange={event => setEditor({ ...editor, amount: event.target.value })} /></label>
            <label className="block text-sm">Stato<ScrollableSelect aria-label="Stato nuova voce" className="mt-1 w-full" value={editor.status} onValueChange={value => setEditor({ ...editor, status: value === "pending" ? "pending" : "paid", date: value === "pending" ? "" : today })}>
              <option value="paid">Incassato subito</option><option value="pending">Da incassare</option>
            </ScrollableSelect></label>
            <label className="block text-sm">Descrizione<Input value={editor.description} onChange={event => setEditor({ ...editor, description: event.target.value })} /></label>
          </div>}
          <label className="block text-sm">{editor.action === "due" ? "Nuova scadenza" : requiresMethod ? "Data d’incasso" : "Scadenza"}
            <Input type="date" required value={editor.date} onChange={event => setEditor({ ...editor, date: event.target.value })} />
          </label>
          {requiresMethod && <ReceiptMethodSelect value={editor.method} onChange={method => setEditor({ ...editor, method })} />}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={invalid || save.isPending}>{editor.action === "due" ? "Salva scadenza" : editor.action === "add" ? "Registra voce" : "Salva incasso"}</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}

export function PlayerPaymentWorkspace({ payments }: { payments: LedgerPayment[] }) {
  const { club, role, user } = useAuth();
  const [sector, setSector] = useState("");
  const [team, setTeam] = useState("");
  const [name, setName] = useState("");
  const [situation, setSituation] = useState("");
  const [selected, setSelected] = useState<number>();
  const players = useQuery({ queryKey: ["/api/players", "cash-desk", club?.id, role, user?.id], queryFn: () => request<Player[]>("/api/players") });
  const teams = useQuery({ queryKey: ["/api/teams", "cash-desk", club?.id, role, user?.id], queryFn: () => request<Team[]>("/api/teams") });
  const byPlayer = new Map<number, LedgerPayment[]>();
  for (const payment of payments) {
    const entries = byPlayer.get(payment.playerId) ?? [];
    entries.push(payment);
    byPlayer.set(payment.playerId, entries);
  }
  const availableTeams = (teams.data ?? []).filter(item => !sector || item.clubSection === sector);
  const byTeam = new Map((teams.data ?? []).map(item => [item.id, item]));
  const today = trainingLocalDate();
  const matches = (players.data ?? []).filter(player => {
    const rows = byPlayer.get(player.id) ?? [];
    const playerSector = player.clubSection || byTeam.get(player.teamId ?? 0)?.clubSection;
    if ((sector && playerSector !== sector) || (team && String(player.teamId) !== team)) return false;
    if (!`${player.firstName} ${player.lastName} ${player.lastName} ${player.firstName}`.toLocaleLowerCase("it").includes(name.trim().toLocaleLowerCase("it"))) return false;
    if (situation === "new") return !rows.length;
    if (situation === "missing") return rows.some(row => row.status === "paid" ? !row.paymentDate || !row.paymentMethod : !row.dueDate);
    if (situation === "active") return rows.some(row => paymentStatus(row, today) === "pending" && !!row.dueDate);
    if (situation === "overdue") return rows.some(row => paymentStatus(row, today) === "overdue");
    return true;
  }).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "it"));
  const player = (players.data ?? []).find(item => item.id === selected);
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Settore<ScrollableSelect aria-label="Settore" className="mt-1 w-full" value={sector} onValueChange={value => { setSector(value); setTeam(""); setSelected(undefined); }}>
        <option value="">Tutti</option>{Object.entries(sectors).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </ScrollableSelect></label>
      <label className="text-sm">Annata<ScrollableSelect aria-label="Annata" className="mt-1 w-full" value={team} onValueChange={value => { setTeam(value); setSelected(undefined); }}>
        <option value="">Tutte</option>{availableTeams.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </ScrollableSelect></label>
      <label className="text-sm">Cerca giocatore<Input className="mt-1" value={name} onChange={event => { setName(event.target.value); setSelected(undefined); }} /></label>
      <label className="text-sm">Situazione<ScrollableSelect aria-label="Situazione" className="mt-1 w-full" value={situation} onValueChange={value => { setSituation(value); setSelected(undefined); }}>
        <option value="">Tutte</option><option value="new">Da registrare</option><option value="missing">Dati mancanti</option>
        <option value="active">In corso</option><option value="overdue">Scaduti</option>
      </ScrollableSelect></label>
    </div>
    {players.isError || teams.isError ? <p role="alert">Impossibile caricare giocatori e annate. <Button size="sm" variant="outline" onClick={() => { void players.refetch(); void teams.refetch(); }}>Riprova</Button></p> :
      players.isPending || teams.isPending ? <p role="status">Caricamento giocatori…</p> : <ScrollableSelect aria-label="Seleziona giocatore" className="w-full sm:w-80" value={selected ? String(selected) : ""} onValueChange={value => setSelected(value ? Number(value) : undefined)}>
        <option value="">{matches.length ? "Seleziona giocatore" : "Nessun giocatore corrispondente"}</option>
        {matches.map(item => <option key={item.id} value={item.id}>{item.lastName} {item.firstName} · {byTeam.get(item.teamId ?? 0)?.name ?? "Senza annata"}</option>)}
        {player && !matches.some(item => item.id === player.id) && <option value={player.id}>{player.lastName} {player.firstName}</option>}
      </ScrollableSelect>}
    {player && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{player.firstName} {player.lastName}</h2>
        <Link href={`/players?openPlayerId=${player.id}&focus=quotes`} className="text-sm text-primary underline">Apri scheda giocatore</Link>
      </div>
      <PlayerPaymentRegister key={player.id} playerId={player.id} payments={byPlayer.get(player.id) ?? []} />
    </>}
  </section>;
}
