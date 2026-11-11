import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trainingLocalDate } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { ReceiptMethodSelect } from "@/components/receipt-method-select";
import { withApi } from "@/lib/api-base";
import { isReceiptMethod, paymentCategories, paymentCategory, paymentStatus, paymentStatuses, receiptMethodLabel, receiptMethods, type PaymentEntry, type PaymentStatus } from "@/lib/payment-summary";

type Payment = PaymentEntry & {
  id: number;
  playerName?: string | null;
  amount: number;
  paymentDate?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  teamSeason?: string | null;
};
type Player = { id: number; firstName: string; lastName: string };
const paymentTypes = {
  registration_fee: "Quota iscrizione",
  annual_fee_installment: "Quota annuale",
  insurance_fee: "Quota assicurazione",
  kit_payment: "Kit",
  shuttle_monthly: "Pulmino",
  other: "Altro",
};
const blank = { playerId: "", amount: "", status: "pending", paymentType: "registration_fee", dueDate: "", paymentDate: "", paymentMethod: "", description: "" };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonthLabel = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });
const monthKey = (year: string, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const monthDate = (key: string) => new Date(key + "-01T00:00:00Z");
const chartSeries = [
  { key: "cash", label: "Contanti", color: "#059669", stack: "incassato" },
  { key: "card", label: "Carta / Bancomat", color: "#2563eb", stack: "incassato" },
  { key: "bank_transfer", label: "Bonifico", color: "#7c3aed", stack: "incassato" },
  { key: "otherMethod", label: "Altro o senza metodo", color: "#64748b", stack: "incassato" },
  { key: "pending", label: "Da incassare", color: "#d97706", stack: "da-incassare" },
  { key: "overdue", label: "Scaduto", color: "#dc2626", stack: "da-incassare" },
] as const;
const emptyMonth = { cash: 0, card: 0, bank_transfer: 0, otherMethod: 0, pending: 0, overdue: 0 };
type MonthlyAmounts = typeof emptyMonth;
type ChartPeriod = "annual" | "quarterly" | "custom";
const statusVariant = { paid: "default", pending: "secondary", overdue: "destructive" } as const;
const playerName = (player: Player) => [player.lastName, player.firstName].filter(Boolean).join(" ");
const searchKey = (value: string) => value.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const displayDate = (date: string) => date.split("-").reverse().join("/");

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(withApi(url), {
    ...options, credentials: "include", headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? null as T : response.json();
}

export default function PaymentsPage() {
  const { club, user, role } = useAuth();
  const canEdit = role === "secretary";
  const { toast } = useToast();
  const cache = useQueryClient();
  const today = trainingLocalDate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [team, setTeam] = useState("");
  const [receipt, setReceipt] = useState<{ id: number; date: string; method: string }>();
  const [month, setMonth] = useState("");
  const [period, setPeriod] = useState<ChartPeriod>("annual");
  const [year, setYear] = useState(today.slice(0, 4));
  const [quarter, setQuarter] = useState(Math.ceil(Number(today.slice(5, 7)) / 3));
  const [fromMonth, setFromMonth] = useState(today.slice(0, 4) + "-01");
  const [toMonth, setToMonth] = useState(today.slice(0, 7));
  const list = useQuery({
    queryKey: ["/api/player-payments", club?.id, user?.id, role],
    queryFn: () => apiFetch<Payment[]>("/api/player-payments"),
  });
  const { data: players = [] } = useQuery({
    queryKey: ["/api/players", "payment-picker", club?.id, user?.id],
    queryFn: () => apiFetch<Player[]>("/api/players"),
    enabled: canEdit && open,
  });
  const save = useMutation({
    mutationFn: (action: { id?: number; method: "POST" | "PATCH" | "DELETE"; body?: object }) => apiFetch(
      "/api/player-payments" + (action.id ? "/" + action.id : ""),
      { method: action.method, body: action.body ? JSON.stringify(action.body) : undefined },
    ),
    onSuccess: (_, action) => {
      void cache.invalidateQueries({ queryKey: ["/api/player-payments"] });
      void cache.invalidateQueries({ queryKey: ["/api/players"] });
      if (action.method === "POST") { setOpen(false); setDraft(blank); }
      if (action.method === "PATCH") setReceipt(undefined);
    },
    onError: () => toast({ title: "Pagamento non aggiornato", variant: "destructive" }),
  });

  function createPayment(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || !draft.playerId || Number(draft.amount) <= 0 || (draft.status === "paid" && !isReceiptMethod(draft.paymentMethod))) return;
    save.mutate({ method: "POST", body: {
      ...draft, playerId: Number(draft.playerId), amount: Number(draft.amount), dueDate: draft.dueDate || null,
      paymentDate: draft.status === "paid" ? draft.paymentDate || today : null,
      paymentMethod: draft.status === "paid" ? draft.paymentMethod : null,
    } });
  }

  const payments = list.data ?? [];
  const teams = new Map<number, string>();
  for (const payment of payments) {
    if (payment.teamId != null && payment.teamName) {
      teams.set(payment.teamId, [payment.teamName, payment.teamSeason].filter(Boolean).join(" · "));
    }
  }
  const teamOptions = [...teams.entries()].sort(([, a], [, b]) => a.localeCompare(b, "it", { numeric: true }));
  const byCategoryAndName = payments.filter(payment =>
    (!team || (team === "unassigned" ? payment.teamId === null : String(payment.teamId) === team)) &&
    (!category || paymentCategory(payment) === category) &&
    searchKey((payment.playerName ?? "") + " " + (payment.description ?? "")).includes(searchKey(search.trim())),
  );
  const byStatus = byCategoryAndName.filter(payment =>
    (!status || status === paymentStatus(payment, today)) &&
    (!method || (payment.status === "paid" && (method === "missing" ? !payment.paymentMethod : payment.paymentMethod === method))),
  );
  const filtered = byStatus.filter(payment => {
    const effectiveStatus = paymentStatus(payment, today);
    const relevantDate = effectiveStatus === "paid" ? payment.paymentDate : payment.dueDate;
    return !month || relevantDate?.startsWith(month);
  });
  const sums = { paid: 0, pending: 0, overdue: 0 };
  let undatedInSummary = 0;
  for (const payment of filtered) {
    const effectiveStatus = paymentStatus(payment, today);
    const amount = Math.round(payment.amount * 100);
    sums[effectiveStatus] += amount;
    if (effectiveStatus === "paid" && !payment.paymentDate) undatedInSummary += amount;
  }
  const forecastYear = today.slice(0, 4);
  let annualForecast = 0;
  const yearsWithMovements = new Set([year, forecastYear]);
  for (const payment of byCategoryAndName) {
    const date = payment.status === "paid" ? payment.paymentDate : payment.dueDate;
    if (!date) continue;
    const movementYear = date.slice(0, 4);
    yearsWithMovements.add(movementYear);
    if (movementYear === forecastYear) annualForecast += Math.round(payment.amount * 100);
  }
  const years = [...yearsWithMovements].sort().reverse();
  const startMonth = period === "custom" ? fromMonth : monthKey(year, period === "annual" ? 1 : quarter * 3 - 2);
  const endMonth = period === "custom" ? toMonth : monthKey(year, period === "annual" ? 12 : quarter * 3);
  const validRange = /^\d{4}-\d{2}$/.test(startMonth) && /^\d{4}-\d{2}$/.test(endMonth) && startMonth <= endMonth;
  const sameYear = startMonth.slice(0, 4) === endMonth.slice(0, 4);
  const amountsByMonth = new Map<string, MonthlyAmounts>();
  let undatedReceipts = 0;
  let undatedDues = 0;
  for (const payment of byStatus) {
    const state = paymentStatus(payment, today);
    const paid = state === "paid";
    const date = paid ? payment.paymentDate : payment.dueDate;
    const amount = Math.round(payment.amount * 100);
    if (!date) {
      if (paid) undatedReceipts += amount;
      else undatedDues += amount;
      continue;
    }
    const key = date.slice(0, 7);
    const series = paid ? (isReceiptMethod(payment.paymentMethod) ? payment.paymentMethod : "otherMethod") : state;
    const values = amountsByMonth.get(key) ?? { ...emptyMonth };
    values[series] += amount;
    amountsByMonth.set(key, values);
  }
  const chartMonths = [];
  let chartTotal = 0;
  if (validRange) {
    for (const date = monthDate(startMonth); date <= monthDate(endMonth); date.setUTCMonth(date.getUTCMonth() + 1)) {
      const key = date.toISOString().slice(0, 7);
      const values = amountsByMonth.get(key) ?? emptyMonth;
      chartTotal += values.cash + values.card + values.bank_transfer + values.otherMethod;
      chartMonths.push({
        key, cash: values.cash / 100, card: values.card / 100, bank_transfer: values.bank_transfer / 100,
        otherMethod: values.otherMethod / 100, pending: values.pending / 100, overdue: values.overdue / 100,
      });
    }
  }

  return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Banknote className="h-6 w-6 text-primary" />Pagamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta incassi, quote e scadenze della società.</p>
      </div>
      {canEdit && <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Aggiungi pagamento</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Aggiungi pagamento</DialogTitle></DialogHeader>
          <form onSubmit={createPayment} className="space-y-3">
            <label className="block space-y-1 text-sm">Giocatore
              <ScrollableSelect aria-label="Giocatore" className="w-full" value={draft.playerId} onValueChange={value => setDraft({ ...draft, playerId: value })}>
                <option value="" disabled>Scegli giocatore</option>
                {[...players].sort((a, b) => playerName(a).localeCompare(playerName(b), "it")).map(player =>
                  <option key={player.id} value={player.id}>{playerName(player)}</option>,
                )}
              </ScrollableSelect>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 text-sm">Importo (€)<Input required type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
              <label className="block space-y-1 text-sm">Scadenza<Input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
            </div>
            <label className="block space-y-1 text-sm">Tipo
              <ScrollableSelect aria-label="Tipo pagamento" className="w-full" value={draft.paymentType} onValueChange={value => setDraft({ ...draft, paymentType: value })}>
                {Object.entries(paymentTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </ScrollableSelect>
            </label>
            <label className="block space-y-1 text-sm">Stato
              <ScrollableSelect aria-label="Stato pagamento" className="w-full" value={draft.status} onValueChange={value => setDraft({ ...draft, status: value })}>
                {Object.entries(paymentStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </ScrollableSelect>
            </label>
            {draft.status === "paid" && <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">Data di incasso
                <Input type="date" required value={draft.paymentDate || today} onChange={event => setDraft({ ...draft, paymentDate: event.target.value })} />
              </label>
              <ReceiptMethodSelect value={draft.paymentMethod} onChange={paymentMethod => setDraft({ ...draft, paymentMethod })} />
            </div>}
            <label className="block space-y-1 text-sm">Descrizione<Input value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={!draft.playerId || !draft.amount || save.isPending || (draft.status === "paid" && !isReceiptMethod(draft.paymentMethod))}>Salva</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>}
    </div>

    <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 md:grid-cols-3 xl:grid-cols-6">
      <label className="min-w-0 space-y-1 text-xs font-medium">Giocatore o descrizione
        <Input placeholder="Cerca…" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Annata
        <ScrollableSelect aria-label="Filtra per annata" className="w-full" value={team} onValueChange={setTeam}>
          <option value="">Tutte</option>
          {teamOptions.map(([id, label]) => <option key={id} value={String(id)}>{label}</option>)}
          {(team === "unassigned" || payments.some(payment => payment.teamId === null)) && <option value="unassigned">Senza annata</option>}
        </ScrollableSelect>
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Categoria
        <ScrollableSelect aria-label="Categoria" className="w-full" value={category} onValueChange={setCategory}>
          <option value="">Tutte</option>
          {Object.entries(paymentCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </ScrollableSelect>
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Stato
        <ScrollableSelect aria-label="Filtra per stato" className="w-full" value={status} onValueChange={setStatus}>
          <option value="">Tutti</option>
          {Object.entries(paymentStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </ScrollableSelect>
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Mese del riepilogo
        <Input type="month" value={month} onChange={event => setMonth(event.target.value)} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Metodo di incasso
        <ScrollableSelect aria-label="Filtra per metodo di incasso" className="w-full" value={method} onValueChange={setMethod}>
          <option value="">Tutti</option>
          {Object.entries(receiptMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          <option value="missing">Senza metodo</option>
        </ScrollableSelect>
      </label>
    </div>

    {list.isPending ? <p role="status">Caricamento pagamenti…</p> : list.isError ? (
      <div role="alert" className="flex flex-wrap items-center gap-2">Impossibile caricare i pagamenti.
        <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>Riprova</Button>
      </div>
    ) : <>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(paymentStatuses) as PaymentStatus[]).map(key => <Card key={key}><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{paymentStatuses[key]}</p>
          <p className="mt-1 text-lg font-medium tabular-nums">{money.format(sums[key] / 100)}</p>
          {key === "paid" && undatedInSummary > 0 && <p className="mt-1 text-xs text-muted-foreground">Di cui senza data di incasso: {money.format(undatedInSummary / 100)}</p>}
        </CardContent></Card>)}
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Previsione annuale · {forecastYear}</p>
          <p className="mt-1 text-lg font-medium tabular-nums">{money.format(annualForecast / 100)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Incassato + da riscuotere con scadenza nell’anno</p>
        </CardContent></Card>
      </div>

      <section className="rounded-xl border bg-card p-3 sm:p-4">
        <h2 className="text-sm font-medium">Incassi e somme da riscuotere</h2>
        <p className="mt-1 text-xs text-muted-foreground">Gli incassi seguono la data del versamento. Le somme da riscuotere seguono la scadenza.</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium">Vista grafico
            <ScrollableSelect aria-label="Vista grafico" className="w-full" value={period} onValueChange={value => setPeriod(value as ChartPeriod)}>
              <option value="annual">Annuale</option>
              <option value="quarterly">Trimestrale</option>
              <option value="custom">Scegli periodo</option>
            </ScrollableSelect>
          </label>
          {period === "custom" ? <>
            <label className="min-w-0 space-y-1 text-xs font-medium">Dal mese<Input type="month" value={fromMonth} onChange={event => setFromMonth(event.target.value)} /></label>
            <label className="min-w-0 space-y-1 text-xs font-medium">Al mese<Input type="month" value={toMonth} onChange={event => setToMonth(event.target.value)} /></label>
          </> : <label className="space-y-1 text-xs font-medium">Anno
            <ScrollableSelect aria-label="Anno del grafico" className="w-full" value={year} onValueChange={setYear}>
              {years.map(value => <option key={value} value={value}>{value}</option>)}
            </ScrollableSelect>
          </label>}
          {period === "quarterly" && <label className="space-y-1 text-xs font-medium">Trimestre
            <ScrollableSelect aria-label="Trimestre" className="w-full" value={String(quarter)} onValueChange={value => setQuarter(Number(value))}>
              <option value="1">Gen – mar</option><option value="2">Apr – giu</option>
              <option value="3">Lug – set</option><option value="4">Ott – dic</option>
            </ScrollableSelect>
          </label>}
        </div>
        {chartMonths.length ? <>
          <p className="mt-3 text-sm">Incassato nel periodo con data <strong className="tabular-nums">{money.format(chartTotal / 100)}</strong></p>
          <div className="mt-2 overflow-x-auto" aria-label="Incassi e somme da riscuotere per mese">
            <div className="h-52" style={{ minWidth: chartMonths.length > 12 || !sameYear ? chartMonths.length * 64 + 48 : undefined }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartMonths} margin={{ top: 12, right: 8 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="key" interval={0} tickFormatter={key => {
                    const date = monthDate(key);
                    return sameYear ? shortMonthLabel.format(date).slice(0, 3) : monthLabel.format(date);
                  }} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis width={48} domain={[0, "auto"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                  <Tooltip labelFormatter={key => monthLabel.format(monthDate(String(key)))} formatter={value => money.format(Number(value))} />
                  {chartSeries.map(series => <Bar key={series.key} name={series.label} dataKey={series.key} fill={series.color} stackId={series.stack} maxBarSize={32} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda del grafico">
            {chartSeries.map(series => <li key={series.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden="true" />{series.label}
            </li>)}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Le uscite, quando saranno disponibili, compariranno sotto la linea dello zero.</p>
        </> : <p role="status" className="mt-3 text-sm text-muted-foreground">Scegli un mese iniziale e uno finale in ordine cronologico.</p>}
        {undatedReceipts > 0 && <p className="mt-2 text-xs text-muted-foreground">Incassi senza data da attribuire a un mese: {money.format(undatedReceipts / 100)}.</p>}
        {undatedDues > 0 && <p className="mt-2 text-xs text-muted-foreground">Somme da riscuotere senza scadenza: {money.format(undatedDues / 100)}.</p>}
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b px-3 py-2 text-sm font-medium">Movimenti · {filtered.length}</h2>
        {filtered.length ? <ul className="divide-y">{filtered.map(payment => {
          const effectiveStatus = paymentStatus(payment, today);
          return <li key={payment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <div className="min-w-32 flex-1 break-words">
              <p className="text-sm font-medium">{payment.playerName || "Giocatore"}</p>
              <p className="text-xs text-muted-foreground">{paymentCategories[paymentCategory(payment)]}{payment.description && " · " + payment.description}
                {effectiveStatus === "paid" && (payment.paymentDate ? " · Incassato il " + displayDate(payment.paymentDate) : " · Data di incasso mancante")}
                {payment.dueDate && (effectiveStatus !== "paid" || !payment.paymentDate) && " · Scadenza " + displayDate(payment.dueDate)}
                {effectiveStatus === "paid" && " · " + receiptMethodLabel(payment.paymentMethod)}
              </p>
            </div>
            <span className="text-sm tabular-nums">{money.format(payment.amount)}</span>
            <Badge variant={statusVariant[effectiveStatus]}>{paymentStatuses[effectiveStatus]}</Badge>
            {canEdit && <div className="flex items-center gap-1">
              <ScrollableSelect aria-label="Aggiorna stato pagamento" value={payment.status} disabled={save.isPending} onValueChange={value => {
                if (value === "paid") setReceipt({ id: payment.id, date: today, method: "" });
                else save.mutate({ id: payment.id, method: "PATCH", body: { status: value, paymentDate: null, paymentMethod: null } });
              }}>
                {Object.entries(paymentStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </ScrollableSelect>
              {effectiveStatus === "paid" && <Button type="button" variant="outline" size="sm" disabled={save.isPending}
                onClick={() => setReceipt({ id: payment.id, date: payment.paymentDate ?? "", method: isReceiptMethod(payment.paymentMethod) ? payment.paymentMethod : "" })}>Dati incasso</Button>}
              <Button type="button" size="icon" variant="ghost" aria-label="Elimina pagamento" disabled={save.isPending}
                onClick={() => { if (window.confirm("Eliminare questo pagamento?")) save.mutate({ id: payment.id, method: "DELETE" }); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>}
          </li>;
        })}</ul> : <p className="px-3 py-6 text-sm text-muted-foreground">Nessun pagamento per i filtri selezionati.</p>}
      </section>
    </>}
    {canEdit && <Dialog open={Boolean(receipt)} onOpenChange={isOpen => { if (!isOpen && !save.isPending) setReceipt(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registra dati incasso</DialogTitle></DialogHeader>
        {receipt && <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          if (!receipt.date || !isReceiptMethod(receipt.method)) return;
          save.mutate({ id: receipt.id, method: "PATCH", body: { status: "paid", paymentDate: receipt.date, paymentMethod: receipt.method } });
        }}>
          <label className="block space-y-1 text-sm">Data di incasso
            <Input type="date" required value={receipt.date} onChange={event => setReceipt({ ...receipt, date: event.target.value })} />
          </label>
          <ReceiptMethodSelect value={receipt.method} onChange={method => setReceipt({ ...receipt, method })} />
          <Button type="submit" disabled={!receipt.date || !isReceiptMethod(receipt.method) || save.isPending}>Salva incasso</Button>
        </form>}
      </DialogContent>
    </Dialog>}
  </div>;
}
