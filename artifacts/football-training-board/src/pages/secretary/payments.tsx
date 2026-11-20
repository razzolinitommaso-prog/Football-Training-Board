import { isForecastPlayer } from "@workspace/api-zod";
import { addChartDays, paymentChartKey, paymentChartWindow } from "@/lib/payment-chart-time";
import { PlayerPaymentWorkspace } from "@/components/player-payment-register";
import { FinanceApiProvider, MemberExpensesPanel } from "@/components/members/member-finance";
import { MemberWorkspace } from "@/components/members/member-workspace";
import { memberApi, memberExpenseRoles, type MemberExpenses } from "@/lib/member-services";
import { memberExpenseMovements } from "@/lib/member-expense-chart";
import { PaymentKitOrderButton } from "@/components/payment-kit-order";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { Bar, BarChart, Line, LineChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trainingLocalDate } from "@workspace/api-zod";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollableSelect } from "@/components/ui/scrollable-select";
import { ReceiptMethodSelect } from "@/components/receipt-method-select";
import { withApi } from "@/lib/api-base";
import { estimateKitPotential, type KitPotentialEquipment, type KitPotentialItem } from "@/lib/kit-potential";
import type { KitRequestLine } from "@/lib/player-kit-catalog";
import { isReceiptMethod, paymentCategories, paymentCategory, paymentStatus, paymentStatuses, paymentStatusTone, receiptMethodLabel, receiptMethods, type PaymentEntry, type PaymentStatus } from "@/lib/payment-summary";

type Payment = PaymentEntry & {
  id: number;
  playerId: number;
  playerName?: string | null;
  amount: number;
  paymentDate?: string | null;
  paymentTime?: string | null;
  teamId?: number | null;
  supplementalTeamId?: number | null;
  teamName?: string | null;
  teamSeason?: string | null;
};
type Player = { id: number; firstName: string; lastName: string; teamId?: number | null; supplementalTeamId?: number | null;status?:string;registered?:boolean|null;isTest?:boolean };
function matchesAnnata(row: { teamId?: number | null; supplementalTeamId?: number | null }, team: string) {
  if (!team) return true;
  if (team === "unassigned") return row.teamId == null && row.supplementalTeamId == null;
  return row.teamId === Number(team) || row.supplementalTeamId === Number(team);
}
type KitTeam = { id: number; name: string; seasonName?: string | null };
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: true });
const axisAmount = new Intl.NumberFormat("it-IT", { useGrouping: true });
const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonthLabel = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });
const monthKey = (year: string, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const monthDate = (key: string) => new Date(key + "-01T00:00:00Z");
const ledgerStatusLabels = { ...paymentStatuses, pending: "Da incassare · non scaduti" };
const chartSeries = [
  { key: "cash", label: "Contanti", color: "#059669", stack: "incassato" },
  { key: "card", label: "Carta / Bancomat", color: "#2563eb", stack: "incassato" },
  { key: "bank_transfer", label: "Bonifico", color: "#7c3aed", stack: "incassato" },
  { key: "otherMethod", label: "Altro o senza metodo", color: "#64748b", stack: "incassato" },
  { key: "pending", label: ledgerStatusLabels.pending, color: "#d97706", stack: "da-incassare" },
  { key: "overdue", label: "Scaduto", color: "#dc2626", stack: "da-incassare" },
  { key: "memberPaid", label: "Uscite membri · pagate", color: "#0f766e", stack: "uscite" },
  { key: "memberPending", label: "Uscite membri · da pagare", color: "#b45309", stack: "uscite" },
  { key: "memberOverdue", label: "Uscite membri · scadute", color: "#be123c", stack: "uscite" },
] as const;
const emptyMonth = { cash: 0, card: 0, bank_transfer: 0, otherMethod: 0, pending: 0, overdue: 0, memberPaid: 0, memberPending: 0, memberOverdue: 0 };
type MonthlyAmounts = typeof emptyMonth;
const receiptSeries = chartSeries.filter(series => series.stack === "incassato");
const scaleLabel = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true });

function chartScale(maxAmount: number) {
  if (maxAmount <= 10000) return [1000, 5000, 10000].find(limit => limit >= maxAmount) ?? 1000;
  const magnitude = 10 ** Math.floor(Math.log10(maxAmount));
  return ([1, 2, 5, 10].find(step => step * magnitude >= maxAmount) ?? 10) * magnitude;
}
type ChartPeriod = "annual" | "quarterly" | "custom";
const searchKey = (value: string) => value.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const displayDate = (date: string) => date.split("-").reverse().join("/");

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(withApi(url), {
    ...options, credentials: "include", headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Operazione non riuscita.");
  return response.status === 204 ? null as T : response.json();
}

export default function PaymentsPage() {
  const { club, user, role } = useAuth();
  const canEdit = role === "secretary";
  const { toast } = useToast();
  const cache = useQueryClient();
  const today = trainingLocalDate();
  const [view, setView] = useState<"players" | "ledger" | "members">("players");
  const canFinance = memberExpenseRoles.includes(role ?? "");
  const [workspaceMember, setWorkspaceMember] = useState<number|null>(null);
  const [includeExpenses, setIncludeExpenses] = useState(true);
  const expenses = useQuery({queryKey:["member-services",club?.id,user?.id,role,"expenses"], queryFn:()=>memberApi<MemberExpenses>("/expenses"),enabled:canFinance});
  const [focusPlayerSearch, setFocusPlayerSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [team, setTeam] = useState("");
  const [receipt, setReceipt] = useState<{ id: number; date: string; time?: string; method: string }>();
  const [month, setMonth] = useState("");
  const [chartType, setChartType] = useState<"bars" | "lines">("bars");
  const [zoom, setZoom] = useState(0);
  const [focus, setFocus] = useState("");
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const [period, setPeriod] = useState<ChartPeriod>("annual");
  const [year, setYear] = useState(today.slice(0, 4));
  const [quarter, setQuarter] = useState(Math.ceil(Number(today.slice(5, 7)) / 3));
  const [fromMonth, setFromMonth] = useState(today.slice(0, 4) + "-01");
  const [toMonth, setToMonth] = useState(today.slice(0, 7));
  const list = useQuery({
    queryKey: ["/api/player-payments", club?.id, user?.id, role],
    queryFn: () => apiFetch<Payment[]>("/api/player-payments"),
  });
  const showKit = view === "ledger" && category === "kit";
  const kitRoster = useQuery({
    queryKey: ["/api/players", "kit-potential", club?.id, user?.id, role],
    queryFn: () => apiFetch<Player[]>("/api/players"), enabled: showKit,
  });
  const rosterTeams = useQuery({
    queryKey: ["/api/teams", "payment-annate", club?.id, user?.id, role],
    queryFn: () => apiFetch<KitTeam[]>("/api/teams"), enabled: view === "ledger",
  });
  const kitEquipment = useQuery({
    queryKey: ["/api/equipment", club?.id, user?.id, role],
    queryFn: () => apiFetch<KitPotentialEquipment[]>("/api/equipment"), enabled: showKit,
  });
  const kitCatalog = useQuery({
    queryKey: ["/api/warehouse-items", "kit-potential", club?.id, user?.id, role],
    queryFn: () => apiFetch<KitPotentialItem[]>("/api/warehouse-items?section=apparel"), enabled: showKit,
  });
  const kitRequests = useQuery({
    queryKey: ["/api/warehouse-kit-requests", club?.id, user?.id],
    queryFn: () => apiFetch<KitRequestLine[]>("/api/warehouse-kit-requests"), enabled: showKit,
  });
  const save = useMutation({
    mutationFn: (action: { id: number; method: "PATCH" | "DELETE"; body?: object }) => apiFetch(
      "/api/player-payments" + (action.id ? "/" + action.id : ""),
      { method: action.method, body: action.body ? JSON.stringify(action.body) : undefined },
    ),
    onSuccess: (_, action) => {
      void cache.invalidateQueries({ queryKey: ["/api/player-payments"] });
      void cache.invalidateQueries({ queryKey: ["/api/players"] });
      void cache.invalidateQueries({ queryKey: ["/api/equipment"] });
      void cache.invalidateQueries({ queryKey: ["/api/player-payment-kit-order"] });
      if (action.method === "PATCH") setReceipt(undefined);
    },
    onError: error => toast({ title: "Pagamento non aggiornato", description: error.message, variant: "destructive" }),
  });

  const playerExpenses=useQuery({queryKey:['member-services','senior-expenses',club?.id,user?.id,role],queryFn:()=>apiFetch<MemberExpenses>('/api/player-finance/expenses'),enabled:canFinance});
  const payments = list.data ?? [];
  const teams = new Map<number, string>();
  for (const payment of payments) {
    if (payment.teamId != null && payment.teamName) {
      teams.set(payment.teamId, [payment.teamName, payment.teamSeason].filter(Boolean).join(" · "));
    }
  }
  for (const entry of rosterTeams.data ?? []) teams.set(entry.id, [entry.name, entry.seasonName].filter(Boolean).join(" · "));
  const kitQueries = [kitRoster, rosterTeams, kitEquipment, kitCatalog, kitRequests];
  const kitLoadError = kitQueries.some(query => query.isError);
  const kitPotential = showKit && !kitLoadError && kitQueries.every(query => query.isSuccess)
    ? estimateKitPotential(
      (kitRoster.data ?? []).filter(player =>
        isForecastPlayer(player) && matchesAnnata(player, team) &&
        searchKey(`${player.firstName} ${player.lastName} ${player.lastName} ${player.firstName}`).includes(searchKey(search.trim())),
      ).map(player => player.id), kitEquipment.data ?? [], kitCatalog.data ?? [], kitRequests.data ?? [], payments,
    ) : undefined;
  const teamOptions = [...teams.entries()].sort(([, a], [, b]) => a.localeCompare(b, "it", { numeric: true }));
  const byCategoryAndName = payments.filter(payment =>
    matchesAnnata(payment, team) &&
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
  const nextForecastYear = String(Number(forecastYear) + 1);
  const annualForecasts = new Map([[forecastYear, 0], [nextForecastYear, 0]]);
  const yearsWithMovements = new Set([year, ...annualForecasts.keys()]);
  for (const payment of byCategoryAndName) {
    if(payment.status!=="paid" && (payment as Payment & {forecastEligible?:boolean}).forecastEligible===false)continue;
    const date = payment.status === "paid" ? payment.paymentDate : payment.dueDate;
    if (!date) continue;
    const movementYear = date.slice(0, 4);
    yearsWithMovements.add(movementYear);
    const forecast = annualForecasts.get(movementYear);
    if (forecast !== undefined) annualForecasts.set(movementYear, forecast + Math.round(payment.amount * 100));
  }
  for (const row of [...(expenses.data?.dues ?? []),...(playerExpenses.data?.dues ?? []).map(d=>({...d,id:-d.id,userId:-d.userId}))]) yearsWithMovements.add(row.dueDate.slice(0,4));
  for (const row of [...(expenses.data?.receipts ?? []),...(playerExpenses.data?.receipts ?? []).map(r=>({...r,id:"player:"+r.id,dueId:-r.dueId,userId:-r.userId}))]) yearsWithMovements.add(row.paidDate.slice(0,4));
  const years = [...yearsWithMovements].sort().reverse();
  const startMonth = period === "custom" ? fromMonth : monthKey(year, period === "annual" ? 1 : quarter * 3 - 2);
  const endMonth = period === "custom" ? toMonth : monthKey(year, period === "annual" ? 12 : quarter * 3);
  const validRange = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(startMonth) && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(endMonth) && startMonth <= endMonth;
  const chartWindow = validRange ? paymentChartWindow(startMonth, endMonth, zoom, focus || today) : null;
  // Player-specific filters keep the existing income-only meaning.
  const showExpenses = canFinance && includeExpenses && !category && !search.trim() && !status && !method;
  const seriesForView = zoom === 3 ? receiptSeries : chartSeries.filter(series=>showExpenses || series.stack!=="uscite");
  const amounts = new Map(chartWindow?.keys.map(key => [key, { ...emptyMonth }]));
  const bucketDates = new Map<string, string>();
  const hourlyReceipts = new Map<string, { id: number; time: string; amount: number; method: string }[]>();
  const periodTotals = { ...emptyMonth };
  let undatedReceipts = 0, undatedDues = 0, untimedReceipts = 0;
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
    if (!chartWindow || date < chartWindow.from || date > chartWindow.to || (zoom === 3 && !paid)) continue;
    if (zoom === 3 && !payment.paymentTime) { untimedReceipts += amount; continue; }
    const key = paymentChartKey(date, zoom, payment.paymentTime);
    const values = amounts.get(key);
    if (!values) continue;
    const series = paid ? (isReceiptMethod(payment.paymentMethod) ? payment.paymentMethod : "otherMethod") : state;
    values[series] += amount;
    periodTotals[series] += amount;
    if (!bucketDates.has(key) || date < bucketDates.get(key)!) bucketDates.set(key, date);
    if (zoom === 3 && payment.paymentTime) {
      const rows = hourlyReceipts.get(key) ?? [];
      rows.push({ id: payment.id, time: payment.paymentTime, amount, method: receiptMethodLabel(payment.paymentMethod) });
      hourlyReceipts.set(key, rows);
    }
  }
  let untimedExpenses = 0;
  const addExpense=(date:string,amount:number,key:"memberPaid"|"memberPending"|"memberOverdue")=>{
    if(!showExpenses||!chartWindow||date<chartWindow.from||date>chartWindow.to)return;
    if(zoom===3){if(key==="memberPaid")untimedExpenses+=amount;return;}
    const bucket=paymentChartKey(date,zoom);const values=amounts.get(bucket);if(!values)return;
    values[key]-=amount;periodTotals[key]-=amount;
    if(!bucketDates.has(bucket)||date<bucketDates.get(bucket)!)bucketDates.set(bucket,date);
  };
  for(const row of memberExpenseMovements({dues:[...(expenses.data?.dues??[]),...(playerExpenses.data?.dues??[]).map(d=>({...d,id:-d.id}))],receipts:[...(expenses.data?.receipts??[]),...(playerExpenses.data?.receipts??[]).map(r=>({...r,dueId:-r.dueId}))]},team,today))addExpense(row.date,row.amount,row.key);
  const chartPoints = [...amounts].map(([key, values]) => ({ key, ...Object.fromEntries(chartSeries.map(series => [series.key, values[series.key] / 100])) }));
  const [selectedHour, setSelectedHour] = useState("");
  const activeHour = amounts.has(selectedHour) ? selectedHour : [...hourlyReceipts.keys()].sort()[0] ?? chartPoints[0]?.key;
  const selectedReceipts = (activeHour ? hourlyReceipts.get(activeHour) ?? [] : []).sort((a, b) => a.time.localeCompare(b.time));
  const axisLabel = (key: string) => zoom === 3 ? key.slice(-2) + ":00" : zoom === 0
    ? (startMonth.slice(0, 4) === endMonth.slice(0, 4) ? shortMonthLabel : monthLabel).format(monthDate(key))
    : key.slice(8, 10) + "/" + key.slice(5, 7);
  const changeZoom = (next: number) => {
    if (chartWindow) setFocus(chartWindow.anchor);
    setSelectedHour("");
    setZoom(Math.max(0, Math.min(3, next)));
  };
  const pan = (direction: number) => {
    if (zoom === 0) {
      if (period === "annual") setYear(String(Math.min(9998, Math.max(1000, Number(year) + direction))));
      if (period === "quarterly") {
        const next = quarter + direction;
        if (next < 1 || next > 4) setYear(String(Math.min(9998, Math.max(1000, Number(year) + direction))));
        setQuarter((next + 3) % 4 + 1);
      }
      setFocus("");
      return;
    }
    if (!chartWindow || (direction < 0 ? !chartWindow.hasPrevious : !chartWindow.hasNext)) return;
    setFocus(addChartDays(chartWindow.anchor, direction * [0, 28, 7, 1][zoom]));
    setSelectedHour("");
  };
  const pickBucket = (key?: string) => {
    if (!key) return;
    if (zoom === 3) setSelectedHour(key);
    else setFocus(bucketDates.get(key) ?? (zoom === 0 ? key + "-01" : key));
  };
  const chartTotal = receiptSeries.reduce((sum, series) => sum + periodTotals[series.key], 0);
  const periodScale = chartScale(Math.max(...Object.values(periodTotals).map(Math.abs)) / 100);

  return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Banknote className="h-6 w-6 text-primary" />Pagamenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta incassi, quote e scadenze della società.</p>
        {canFinance&&<details className="mt-3"><summary className="cursor-pointer font-medium">Compensi e rimborsi · giocatori Prima Squadra</summary><div className="mt-3"><FinanceApiProvider playerId={0}><MemberExpensesPanel/></FinanceApiProvider><a className="underline" href="/prima-squadra/players">Apri giocatori per gestire gli accordi</a></div></details>}
      </div>
      {canEdit && view === "ledger" && (
        <Button type="button" onClick={() => { setFocusPlayerSearch(true); setView("players"); }}>
          <Plus className="h-4 w-4" />Aggiungi pagamento
        </Button>
      )}
    </div>

    <div className="flex flex-wrap gap-2">
      <Button type="button" aria-pressed={view === "players"} variant={view === "players" ? "default" : "outline"} onClick={() => { setFocusPlayerSearch(false); setView("players"); }}>Incassi giocatori</Button>
      <Button type="button" aria-pressed={view === "ledger"} variant={view === "ledger" ? "default" : "outline"} onClick={() => setView("ledger")}>Registro e grafici</Button>
      {canFinance&&<Button type="button" aria-pressed={view==="members"} variant={view==="members"?"default":"outline"} onClick={()=>setView("members")}>Compensi e rimborsi membri</Button>}
    </div>
    {view==="ledger"&&canFinance&&<div className="space-y-2 rounded-xl border bg-card p-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={includeExpenses} onChange={event=>setIncludeExpenses(event.target.checked)}/>Mostra nel grafico anche le uscite membri</label><p className="text-xs text-muted-foreground">Uscite sotto lo zero: pagamenti alla data effettiva, residui alla scadenza. Il filtro annata segue la ripartizione del contratto. I filtri giocatore, categoria, stato e metodo mostrano soltanto gli incassi giocatori.</p>{expenses.isPending?<p role="status">Caricamento uscite membri…</p>:expenses.isError?<p role="alert">Uscite membri non disponibili. <Button variant="outline" size="sm" onClick={()=>void expenses.refetch()}>Riprova</Button></p>:null}{zoom===3&&untimedExpenses>0&&<p>Uscite pagate senza orario, escluse dal dettaglio orario: {money.format(untimedExpenses/100)}</p>}</div>}
    {view === "ledger" && <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 md:grid-cols-3 xl:grid-cols-6">
      <label className="min-w-0 space-y-1 text-xs font-medium">Giocatore o descrizione
        <Input placeholder="Cerca…" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium">Annata
        <ScrollableSelect aria-label="Filtra per annata" className="w-full" value={team} onValueChange={setTeam}>
          <option value="">Tutte</option>
          {teamOptions.map(([id, label]) => <option key={id} value={String(id)}>{label}</option>)}
          {(team === "unassigned" || payments.some(payment => matchesAnnata(payment, "unassigned")) || (showKit && kitRoster.data?.some(player => matchesAnnata(player, "unassigned")))) && <option value="unassigned">Senza annata</option>}
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
          {Object.entries(ledgerStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
    </div>}

    {view==="members"&&canFinance?<MemberExpensesPanel onOpenMember={setWorkspaceMember}/>:list.isPending ? <p role="status">Caricamento pagamenti…</p> : list.isError ? (
      <div role="alert" className="flex flex-wrap items-center gap-2">Impossibile caricare i pagamenti.
        <Button type="button" variant="outline" size="sm" onClick={() => void list.refetch()}>Riprova</Button>
      </div>
    ) : view === "players" ? <PlayerPaymentWorkspace payments={payments} focusSearch={focusPlayerSearch} /> : <>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(ledgerStatusLabels) as PaymentStatus[]).map(key => <Card key={key}><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{ledgerStatusLabels[key]}</p>
          <p className="mt-1 text-lg font-medium tabular-nums">{money.format(sums[key] / 100)}</p>
          {key === "paid" && undatedInSummary > 0 && <p className="mt-1 text-xs text-muted-foreground">Di cui senza data di incasso: {money.format(undatedInSummary / 100)}</p>}
        </CardContent></Card>)}
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Previsione annuale</p>
          <dl className="mt-1 divide-y">
            {[...annualForecasts].map(([forecastYearLabel, amount]) => (
              <div key={forecastYearLabel} className="flex flex-wrap items-baseline justify-between gap-x-2 py-1">
                <dt className="text-xs font-medium">{forecastYearLabel}</dt>
                <dd className="text-base font-medium tabular-nums">{money.format(amount / 100)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-xs text-muted-foreground">Incassato + da riscuotere con scadenza nell’anno</p>
        </CardContent></Card>
      </div>

      {showKit && <Card><CardContent className="space-y-3 p-3 sm:p-4">
        <h2 className="text-sm font-medium">Potenziale kit</h2>
        {kitLoadError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          Stima non disponibile.
          <Button type="button" variant="outline" size="sm" onClick={() => { for (const query of kitQueries) if (query.isError) void query.refetch(); }}>Riprova</Button>
        </div> : kitPotential ? <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 rounded-lg bg-primary/5 px-3 py-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Incasso potenziale stimato</p>
              <p className="text-lg font-semibold tabular-nums">{money.format(kitPotential.cents / 100)}</p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">Giocatori senza kit</p>
              <p className="text-lg font-medium tabular-nums">{kitPotential.withoutKit}</p>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">Giocatori con kit da completare</p>
              <p className="text-lg font-medium tabular-nums">{kitPotential.partialKit}</p>
            </div>
          </div>
          {kitPotential.unpricedItems > 0 && <p className="text-xs text-muted-foreground">Voci senza prezzo utilizzabile, escluse dalla stima: {kitPotential.unpricedItems}.</p>}
          {kitPotential.toVerify > 0 && <p className="text-xs text-muted-foreground">Giocatori con kit o pagamenti da verificare: {kitPotential.toVerify}.</p>}
          <p className="text-xs text-muted-foreground">Una unità per voce mancante al prezzo di listino più basso. La stima segue annata e nome del giocatore e resta separata dagli incassi e dalla previsione annuale.</p>
        </> : <p role="status" className="text-sm text-muted-foreground">Calcolo del potenziale kit…</p>}
      </CardContent></Card>}

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
        {chartWindow ? <>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-medium">Tipo di grafico<ScrollableSelect aria-label="Tipo di grafico" value={chartType} onValueChange={value => setChartType(value as typeof chartType)}><option value="bars">Barre</option><option value="lines">Linee</option></ScrollableSelect></label>
            <label className="space-y-1 text-xs font-medium">Scala temporale<ScrollableSelect aria-label="Scala temporale" value={String(zoom)} onValueChange={value => changeZoom(Number(value))}>{["Mesi", "Settimane", "Giorni", "Ore"].map((label, index) => <option value={index} key={label}>{label}</option>)}</ScrollableSelect></label>
            <div className="flex gap-1" role="group" aria-label="Navigazione temporale">
              <Button type="button" size="icon" variant="outline" aria-label="Periodo precedente" disabled={zoom === 0 ? period === "custom" : !chartWindow.hasPrevious} onClick={() => pan(-1)}>←</Button>
              <Button type="button" size="icon" variant="outline" aria-label="Periodo successivo" disabled={zoom === 0 ? period === "custom" : !chartWindow.hasNext} onClick={() => pan(1)}>→</Button>
              <Button type="button" size="icon" variant="outline" aria-label="Riduci zoom temporale" disabled={zoom === 0} onClick={() => changeZoom(zoom - 1)}>−</Button>
              <Button type="button" size="icon" variant="outline" aria-label="Aumenta zoom temporale" disabled={zoom === 3} onClick={() => changeZoom(zoom + 1)}>+</Button>
            </div>
          </div>
          {zoom > 0 && <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">Vai al giorno<Input type="date" className="w-auto" min={startMonth + "-01"} max={paymentChartWindow(startMonth, endMonth, 0, today).to} value={chartWindow.anchor} onChange={event => { if (event.target.value) { setFocus(event.target.value); setSelectedHour(""); } }} /></label>}
          <p className="mt-3 text-sm" aria-live="polite">{displayDate(chartWindow.from)}{chartWindow.from === chartWindow.to ? "" : " – " + displayDate(chartWindow.to)} · {zoom === 3 ? "Incassato con orario" : "Incassato"} <strong className="tabular-nums">{money.format(chartTotal / 100)}</strong></p>
          <div className="mt-2 h-56 min-w-0 touch-pan-y" aria-label="Incassi e somme da riscuotere nel periodo visibile"
            onPointerDown={event => { dragStart.current = event.clientX; dragged.current = false; }} onPointerCancel={() => { dragStart.current = null; }}
            onPointerUp={event => { const distance = dragStart.current === null ? 0 : event.clientX - dragStart.current; dragStart.current = null; if (Math.abs(distance) > 36) { dragged.current = true; pan(distance < 0 ? 1 : -1); } }}>
            <ResponsiveContainer width="100%" height="100%">
              {(() => {
                const Chart = chartType === "bars" ? BarChart : LineChart;
                return <Chart data={chartPoints} margin={{ top: 12, right: 12 }} onClick={state => { if (!dragged.current) pickBucket(state?.activeLabel == null ? undefined : String(state.activeLabel)); }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="key" minTickGap={12} tickFormatter={axisLabel} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis width={64} domain={["auto", "auto"]} tickFormatter={value => axisAmount.format(value)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                  <Tooltip labelFormatter={key => axisLabel(String(key))} formatter={value => money.format(Number(value))} />
                  {seriesForView.map(series => chartType === "bars"
                    ? <Bar key={series.key} name={series.label} dataKey={series.key} fill={series.color} stackId={series.stack} maxBarSize={32} />
                    : <Line key={series.key} name={series.label} dataKey={series.key} stroke={series.color} strokeWidth={2} dot={false} strokeDasharray={series.key === "pending" ? "6 4" : series.key === "overdue" ? "2 3" : undefined} />)}
                </Chart>;
              })()}
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda del grafico">
            {seriesForView.map(series => <li key={series.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} aria-hidden="true" />{series.label}</li>)}
          </ul>
          {zoom < 3 ? <p className="mt-2 text-xs text-muted-foreground">Seleziona un punto e premi + per avvicinarti. Trascina il grafico o usa le frecce per scorrere.</p> : <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
            <label className="flex flex-wrap items-center gap-2">Ora<ScrollableSelect aria-label="Ora del dettaglio" value={activeHour ?? ""} onValueChange={setSelectedHour}>{chartPoints.map(({ key }) => <option key={key} value={key}>{axisLabel(key)}</option>)}</ScrollableSelect></label>
            {selectedReceipts.length ? <ul className="space-y-1">{selectedReceipts.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2"><span>{row.time} · {row.method}</span><strong>{money.format(row.amount / 100)}</strong></li>)}</ul> : <p className="text-muted-foreground">Nessun incasso con orario in questa fascia.</p>}
            {untimedReceipts > 0 && <p className="text-muted-foreground">Incassi del giorno senza orario: {money.format(untimedReceipts / 100)}.</p>}
          </div>}
          <p className="mt-2 text-xs text-muted-foreground">Gli incassi sono sopra lo zero; le uscite membri sono sotto lo zero quando abilitate. Le schede riepilogative in alto riguardano gli incassi giocatori.</p>
        </> : <p role="status" className="mt-3 text-sm text-muted-foreground">Scegli un mese iniziale e uno finale in ordine cronologico.</p>}
        {undatedReceipts > 0 && <p className="mt-2 text-xs text-muted-foreground">Incassi senza data da attribuire a un mese: {money.format(undatedReceipts / 100)}.</p>}
        {undatedDues > 0 && <p className="mt-2 text-xs text-muted-foreground">Somme da riscuotere senza scadenza: {money.format(undatedDues / 100)}.</p>}
      </section>

      {chartWindow && <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-labelledby="payment-period-heading">
        <div>
          <h2 id="payment-period-heading" className="text-sm font-medium">Incassi per metodo e somme da riscuotere</h2>
          <p className="mt-1 text-xs text-muted-foreground">Stesso periodo visibile nel grafico</p>
        </div>
        <ul className="space-y-3">
          {seriesForView.map(series => {
            const amount = periodTotals[series.key] / 100;
            return <li key={series.key}>
              <div className="mb-1 flex flex-wrap justify-between gap-x-3 text-sm">
                <span>{series.label}</span>
                <span className="font-medium tabular-nums">{money.format(amount)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100,Math.abs(amount) / periodScale * 100)}%`, backgroundColor: series.color }} />
              </div>
            </li>;
          })}
        </ul>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{scaleLabel.format(0)}</span><span>{scaleLabel.format(periodScale)}</span>
        </div>
      </section>}

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
            <Badge variant="outline" className={paymentStatusTone[effectiveStatus]}>{ledgerStatusLabels[effectiveStatus]}</Badge>
            {payment.kitArticle && <PaymentKitOrderButton paymentId={payment.id} />}
            {canEdit && <div className="flex items-center gap-1">
              <ScrollableSelect aria-label="Aggiorna stato pagamento" value={payment.status} disabled={save.isPending} onValueChange={value => {
                if (value === "paid") setReceipt({ id: payment.id, date: today, method: "" });
                else save.mutate({ id: payment.id, method: "PATCH", body: { status: value, paymentDate: null, paymentMethod: null } });
              }}>
                {Object.entries(paymentStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </ScrollableSelect>
              {effectiveStatus === "paid" && <Button type="button" variant="outline" size="sm" disabled={save.isPending}
                onClick={() => setReceipt({ id: payment.id, date: payment.paymentDate ?? "", time: payment.paymentTime ?? "", method: isReceiptMethod(payment.paymentMethod) ? payment.paymentMethod : "" })}>Dati incasso</Button>}
              <Button type="button" size="icon" variant="ghost" aria-label="Elimina pagamento" disabled={save.isPending}
                onClick={() => { if (window.confirm("Eliminare questo pagamento?")) save.mutate({ id: payment.id, method: "DELETE" }); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>}
          </li>;
        })}</ul> : <p className="px-3 py-6 text-sm text-muted-foreground">Nessun pagamento per i filtri selezionati.</p>}
      </section>
    </>}
    <MemberWorkspace memberId={workspaceMember} open={workspaceMember!==null} onOpenChange={open=>{if(!open)setWorkspaceMember(null);}}/>
    {canEdit && <Dialog open={Boolean(receipt)} onOpenChange={isOpen => { if (!isOpen && !save.isPending) setReceipt(undefined); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registra dati incasso</DialogTitle></DialogHeader>
        {receipt && <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          if (!receipt.date || !isReceiptMethod(receipt.method)) return;
          save.mutate({ id: receipt.id, method: "PATCH", body: { status: "paid", paymentDate: receipt.date, paymentTime: receipt.time || null, paymentMethod: receipt.method } });
        }}>
          <label className="block space-y-1 text-sm">Data di incasso
            <Input type="date" required value={receipt.date} onChange={event => setReceipt({ ...receipt, date: event.target.value })} />
          </label>
          <label className="block space-y-1 text-sm">Orario d’incasso (facoltativo)
            <Input type="time" value={receipt.time ?? ""} onChange={event => setReceipt({ ...receipt, time: event.target.value })} />
          </label>
          <ReceiptMethodSelect value={receipt.method} onChange={method => setReceipt({ ...receipt, method })} />
          <Button type="submit" disabled={!receipt.date || !isReceiptMethod(receipt.method) || save.isPending}>Salva incasso</Button>
        </form>}
      </DialogContent>
    </Dialog>}
  </div>;
}
