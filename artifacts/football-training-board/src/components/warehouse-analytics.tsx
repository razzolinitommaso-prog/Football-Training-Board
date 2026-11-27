import { paymentCategory } from "@/lib/payment-summary";
import { inWarehousePeriod } from "@/lib/warehouse-analysis";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { withApi } from "@/lib/api-base";
import {
  warehouseStatistics,
  warehouseExpenseData,
  type WarehouseAnalysis,
  type Purchase,
} from "@/lib/warehouse-analysis";
import { estimateKitPotential } from "@/lib/kit-potential";
import { suggestKitSlots } from "@/lib/player-kit-catalog";
import { isForecastPlayer, trainingLocalDate } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FinancialReconciliation } from "@/components/financial-reconciliation";
import { exportToExcel } from "@/lib/excel-export";
import { parseMemberMoney, memberAmountText } from "@/lib/member-services";
const money = (c: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    c / 100,
  );
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(withApi(path), {
    credentials: "include",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "Operazione non riuscita");
  return data;
}
export function WarehouseAnalytics() {
  const { club, user, role } = useAuth(),
    { toast } = useToast(),
    qc = useQueryClient();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("stock"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [itemFilter, setItemFilter] = useState("");
  const [statsArticle, setStatsArticle] = useState("");
  const enabled =
    open &&
    ["admin", "presidente", "director", "secretary"].includes(role ?? "");
  const data = useQuery({
    queryKey: ["warehouse-analysis", club?.id, user?.id, role],
    queryFn: () => api<WarehouseAnalysis>("/api/warehouse-finance/analysis"),
    enabled,
  });
  const players = useQuery({
    queryKey: ["warehouse-analysis-roster", club?.id, user?.id, role],
    queryFn: () => api<any[]>("/api/players"),
    enabled,
  });
  const equipment = useQuery({
    queryKey: ["warehouse-analysis-equipment", club?.id, user?.id, role],
    queryFn: () => api<any[]>("/api/equipment"),
    enabled,
  });
  const catalog = useQuery({
    queryKey: ["warehouse-analysis-catalog", club?.id, user?.id, role],
    queryFn: () => api<any[]>("/api/warehouse-items?section=apparel"),
    enabled,
  });
  const payments = useQuery({
    queryKey: ["warehouse-analysis-payments", club?.id, user?.id, role],
    queryFn: () => api<any[]>("/api/player-payments"),
    enabled,
  });
  const [purchaseOpen, setPurchaseOpen] = useState(false),
    [paying, setPaying] = useState<Purchase | null>(null);
  const [purchase, setPurchase] = useState({
    id: "",
    itemId: "",
    quantity: "1",
    unitCost: "",
    purchaseDate: trainingLocalDate(),
    dueDate: trainingLocalDate(),
    supplier: "",
    reference: "",
    loadStock: false,
  });
  const [receipt, setReceipt] = useState({
    id: "",
    amount: "",
    paidDate: trainingLocalDate(),
    method: "bank_transfer",
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["warehouse-analysis"] });
    void qc.invalidateQueries({ queryKey: ["warehouse-finance"] });
    void qc.invalidateQueries({ queryKey: ["/api/warehouse-items"] });
  };
  const save = useMutation({
    mutationFn: () =>
      api("/api/warehouse-finance/purchases", {
        ...purchase,
        itemId: Number(purchase.itemId),
        quantity: Number(purchase.quantity),
        unitCents: parseMemberMoney(purchase.unitCost),
      }),
    onSuccess: () => {
      refresh();
      setPurchaseOpen(false);
      toast({ title: "Acquisto KIT registrato" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const pay = useMutation({
    mutationFn: () =>
      api("/api/warehouse-finance/receipts", {
        ...receipt,
        purchaseId: paying?.id,
        amountCents: parseMemberMoney(receipt.amount),
      }),
    onSuccess: () => {
      refresh();
      setPaying(null);
      toast({ title: "Pagamento fornitore registrato" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  if (!["admin", "presidente", "director", "secretary"].includes(role ?? ""))
    return null;
  const d = data.data,
    stats = d ? warehouseStatistics(d, from, to, statsArticle) : null;
  const potential =
    d && players.data && equipment.data && catalog.data && payments.data
      ? estimateKitPotential(
          players.data.filter(isForecastPlayer).map((p) => p.id),
          equipment.data,
          catalog.data,
          d.requests.map((r) => ({
            ...r,
            playerName: "",
            itemName: d.items.find((i) => i.id === r.itemId)?.name ?? "",
          })),
          payments.data,
        )
      : null;
  const known = d?.items.filter((i) => i.unitCents !== null) ?? [],
    unknown =
      d?.items.filter((i) => i.quantityAvailable > 0 && i.unitCents === null) ??
      [];
  const kitIncome = (payments.data ?? []).filter(
    (p) =>
      paymentCategory(p) === "kit" &&
      p.status === "paid" &&
      inWarehousePeriod(p.paymentDate, from, to),
  );
  const cashIn = kitIncome.reduce((n, p) => n + Math.round(p.amount * 100), 0),
    cashOut = (d?.receipts ?? [])
      .filter((r) => inWarehousePeriod(r.paidDate, from, to))
      .reduce((n, r) => n + r.amountCents, 0);
  const missingArticles = kitIncome.filter((p) => !p.kitArticle).length;
  const names = [
    ...new Set([
      ...(d?.items ?? []).map((i) => i.name),
      ...(d?.sales ?? []).map((s) => s.article.name),
      ...(d?.purchases ?? []).map((p) => p.itemName),
    ]),
  ].sort((a, b) => a.localeCompare(b, "it"));
  const peak = (kind: "sold" | "purchased") => {
    const rows = stats?.months ?? [],
      maximum = Math.max(0, ...rows.map((m) => m[kind]));
    return maximum
      ? rows
          .filter((m) => m[kind] === maximum)
          .map((m) =>
            new Date(`2026-${m.month}-01`).toLocaleDateString("it-IT", {
              month: "long",
            }),
          )
          .join(" · ") + ` (${maximum} pezzi)`
      : "Nessun dato";
  };
  const max = Math.max(
    1,
    ...(stats?.months.flatMap((m) => [m.sold, m.purchased]) ?? []),
  );
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Analisi KIT · giacenze, taglie e costi
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>KIT · quadro generale</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {[
              ["stock", "Giacenze e fabbisogno"],
              ["sizes", "Taglie e stagionalità"],
              ["finance", "Acquisti e uscite"],
            ].map(([key, label]) => (
              <Button
                key={key}
                variant={tab === key ? "default" : "outline"}
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          {data.isPending ? (
            <p role="status">Caricamento analisi…</p>
          ) : data.isError ? (
            <p role="alert">
              Analisi non disponibile.{" "}
              <Button onClick={() => void data.refetch()}>Riprova</Button>
            </p>
          ) : (
            d && (
              <>
                {tab === "stock" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        [
                          "Giacenti",
                          String(
                            d.items.reduce(
                              (n, i) => n + i.quantityAvailable,
                              0,
                            ),
                          ),
                        ],
                        [
                          "Riservati",
                          String(
                            d.items.reduce((n, i) => n + i.quantityReserved, 0),
                          ),
                        ],
                        [
                          "Liberi",
                          String(
                            d.items.reduce(
                              (n, i) =>
                                n +
                                Math.max(
                                  0,
                                  i.quantityAvailable - i.quantityReserved,
                                ),
                              0,
                            ),
                          ),
                        ],
                        [
                          "Valore stock · ultimo costo noto",
                          known.length
                            ? money(
                                known.reduce(
                                  (n, i) =>
                                    n + i.quantityAvailable * i.unitCents!,
                                  0,
                                ),
                              )
                            : "Costi da completare",
                        ],
                        [
                          "Articoli giacenti senza costo",
                          String(unknown.length),
                        ],
                        [
                          "Valore stock · listino (prezzi noti)",
                          money(d.items.reduce((n,i)=>n+Math.round((i.price??0)*100)*i.quantityAvailable,0)),
                        ],
                        [
                          "Potenziale vendita · giocatori",
                          potential
                            ? money(potential.cents)
                            : "In caricamento / dati incompleti",
                        ],
                      ].map(([label, value]) => (
                        <Card key={label}>
                          <CardContent className="p-4">
                            <p className="text-sm text-muted-foreground">
                              {label}
                            </p>
                            <strong className="text-xl">{value}</strong>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Il valore delle giacenze è una stima all’ultimo costo
                      registrato, non un’uscita di cassa. I costi mancanti sono
                      esclusi. Il potenziale è al prezzo di vendita,
                      indipendente dalla disponibilità fisica. Il fabbisogno per
                      taglia include solo richieste collegate a un articolo; le
                      taglie dei giocatori senza richiesta restano da
                      raccogliere.
                    </p>
                    {potential && (
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full min-w-[620px] text-sm">
                          <caption className="p-3 text-left font-semibold">
                            Articoli ancora da proporre ai giocatori e copertura
                            delle giacenze
                          </caption>
                          <thead>
                            <tr>
                              {[
                                "Voce KIT",
                                "Da proporre",
                                "Giacenti",
                                "Liberi",
                                "Copertura liberi / potenziali",
                              ].map((label) => (
                                <th className="p-2 text-left" key={label}>
                                  {label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {potential.breakdown.map((line) => {
                              const items = (catalog.data ?? []).filter((i) =>
                                  (i.kitSlots ?? suggestKitSlots(i)).includes(
                                    line.key,
                                  ),
                                ),
                                ids = new Set(items.map((i) => i.id)),
                                matching = d.items.filter((i) => ids.has(i.id)),
                                stock = matching.reduce(
                                  (n, i) => n + i.quantityAvailable,
                                  0,
                                ),
                                free = matching.reduce(
                                  (n, i) =>
                                    n +
                                    Math.max(
                                      0,
                                      i.quantityAvailable - i.quantityReserved,
                                    ),
                                  0,
                                );
                              return (
                                <tr key={line.key} className="border-t">
                                  <td className="p-2">{line.label}</td>
                                  <td>{line.quantity}</td>
                                  <td>{stock}</td>
                                  <td>{free}</td>
                                  <td>
                                    {free} / {line.quantity} ·{" "}
                                    {Math.min(
                                      100,
                                      Math.round((100 * free) / line.quantity),
                                    )}
                                    %
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground p-3">
                          Copertura indicativa per articolo, da confermare con
                          le taglie. Un articolo collegato a più voci non va
                          sommato più volte. Le richieste già avviate sono nel
                          fabbisogno per taglia sotto.
                        </p>
                      </div>
                    )}
                    {[players, equipment, catalog, payments].some(
                      (q) => q.isError,
                    ) && (
                      <p role="alert">
                        Potenziale non calcolabile: una sorgente giocatori/KIT
                        non è disponibile.{" "}
                        <Button
                          variant="outline"
                          onClick={() => {
                            void players.refetch();
                            void equipment.refetch();
                            void catalog.refetch();
                            void payments.refetch();
                          }}
                        >
                          Riprova dati potenziale
                        </Button>
                      </p>
                    )}
                    <Input
                      placeholder="Cerca articolo o taglia"
                      aria-label="Cerca articolo o taglia"
                      value={itemFilter}
                      onChange={(e) => setItemFilter(e.target.value)}
                    />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[650px]">
                        <thead>
                          <tr>
                            {[
                              "Articolo / taglia",
                              "Giacenti",
                              "Riservati",
                              "Liberi",
                              "Da soddisfare",
                              "Da acquistare",
                              "Costo unitario",
                            ].map((v) => (
                              <th key={v} className="p-2 text-left">
                                {v}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.items
                            .filter((i) =>
                              `${i.name} ${i.size ?? ""}`
                                .toLowerCase()
                                .includes(itemFilter.toLowerCase()),
                            )
                            .map((i) => {
                              const pending = d.requests
                                  .filter(
                                    (r) =>
                                      !r.archived &&
                                      r.itemId === i.id &&
                                      r.status === "pending",
                                  )
                                  .reduce((n, r) => n + r.quantity, 0),
                                incoming = d.requests
                                  .filter(
                                    (r) =>
                                      r.itemId === i.id &&
                                      r.status === "ordered",
                                  )
                                  .reduce((n, r) => n + r.quantity, 0),
                                need = pending + incoming,
                                free = Math.max(
                                  0,
                                  i.quantityAvailable - i.quantityReserved,
                                );
                              return (
                                <tr className="border-t" key={i.id}>
                                  <td className="p-2">
                                    {i.name} · {i.size || "Taglia da indicare"}
                                  </td>
                                  <td>{i.quantityAvailable}</td>
                                  <td>{i.quantityReserved}</td>
                                  <td>{free}</td>
                                  <td>{need}</td>
                                  <td>
                                    {Math.max(0, pending - free)}
                                    {incoming > 0 && (
                                      <span className="block text-xs text-muted-foreground">
                                        Già ordinati: {incoming}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {i.unitCents === null
                                      ? "Da completare"
                                      : money(i.unitCents)}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    {potential && (
                      <p className="text-sm">
                        {potential.withoutKit} giocatori senza KIT ·{" "}
                        {potential.partialKit} KIT parziali ·{" "}
                        {potential.toVerify} da verificare.{" "}
                        {potential.unpricedItems > 0
                          ? `Prezzo mancante per ${potential.unpricedItems} voci: potenziale parziale. `
                          : ""}
                        Il potenziale non è un credito registrato.
                      </p>
                    )}
                  </>
                )}
                {(tab === "sizes" || tab === "finance") && (
                  <div className="flex flex-wrap gap-3">
                    <label>
                      Dal
                      <Input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Al
                      <Input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                      }}
                    >
                      Tutto lo storico
                    </Button>
                  </div>
                )}
                {tab === "sizes" && (
                  <label className="text-sm">
                    Articolo delle statistiche
                    <select
                      className="block border rounded p-2 w-full"
                      value={statsArticle}
                      onChange={(e) => setStatsArticle(e.target.value)}
                    >
                      <option value="">Tutti gli articoli</option>
                      {names.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {tab === "sizes" && stats && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Le vendite per quantità includono solo pagamenti incassati
                      con articolo collegato; non indicano le consegne.{" "}
                      {missingArticles > 0
                        ? `Nel periodo ci sono ${missingArticles} incassi KIT senza articolo: presenti negli euro, esclusi dalle statistiche quantità/taglie.`
                        : ""}
                    </p>
                    <p className="text-sm">
                      Moda ponderata sulle quantità; tutte le parità sono
                      mostrate. Richieste (incluse le archiviate) alla data di
                      creazione, vendite alla data dell’incasso, acquisti alla
                      data del documento.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[
                        ["Articolo più venduto ai giocatori", stats.mostSold],
                        [
                          "Articolo più acquistato dalla società",
                          stats.mostPurchased,
                        ],
                      ].map(([label, rows]) => (
                        <Card key={String(label)}>
                          <CardContent className="p-4">
                            <h3 className="font-semibold">{String(label)}</h3>
                            {(
                              rows as { value: string; quantity: number }[]
                            ).map((r) => (
                              <p key={r.value}>
                                {r.value} · {r.quantity} pezzi
                              </p>
                            ))}
                            {!(rows as unknown[]).length && (
                              <p>Nessun dato nel periodo</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr>
                            <th className="p-2 text-left">Articolo</th>
                            <th className="text-left">Moda taglia richiesta</th>
                            <th className="text-left">Moda taglia venduta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.groups.map((g) => (
                            <tr key={g.name} className="border-t">
                              <td className="p-2">{g.name}</td>
                              {[g.requested, g.sold].map((rows, index) => {
                                const modes = rows.reduce(
                                    (map, r) =>
                                      map.set(
                                        r.value,
                                        (map.get(r.value) ?? 0) + r.quantity,
                                      ),
                                    new Map<string, number>(),
                                  ),
                                  top = Math.max(0, ...modes.values());
                                return (
                                  <td key={index}>
                                    {[...modes]
                                      .filter(([, n]) => n === top)
                                      .map(([size, n]) => `${size} (${n})`)
                                      .join(" · ") || "Nessun dato"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-sm">
                      Picco vendite: {peak("sold")} · Picco acquisti:{" "}
                      {peak("purchased")}
                    </p>
                    <h3 className="font-semibold">
                      Stagionalità · pezzi per mese
                    </h3>
                    <p className="text-xs">
                      Verde: venduti · Blu: acquistati. Le quantità non sono
                      sommate agli euro.
                    </p>
                    {stats.months.map((m) => (
                      <div
                        key={m.month}
                        className="grid grid-cols-[3rem_1fr_5rem] gap-2 items-center text-sm"
                      >
                        <span>
                          {new Date(`2026-${m.month}-01`).toLocaleDateString(
                            "it-IT",
                            { month: "short" },
                          )}
                        </span>
                        <div className="space-y-1">
                          <div
                            className="h-2 rounded bg-emerald-500"
                            style={{ width: `${(100 * m.sold) / max}%` }}
                          />
                          <div
                            className="h-2 rounded bg-blue-500"
                            style={{ width: `${(100 * m.purchased) / max}%` }}
                          />
                        </div>
                        <span>
                          {m.sold} / {m.purchased}
                        </span>
                      </div>
                    ))}
                    <p>
                      Venduti {stats.sold} · Acquistati {stats.purchased}.
                      Giacenze attuali{" "}
                      {d.items.reduce((n, i) => n + i.quantityAvailable, 0)}{" "}
                      (comprendono i carichi storici).
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        exportToExcel(
                          stats.groups.map((g) => ({
                            Articolo: g.name,
                            Richieste: g.requested.reduce(
                              (n, r) => n + r.quantity,
                              0,
                            ),
                            Venduti: g.sold.reduce((n, r) => n + r.quantity, 0),
                          })),
                          "analisi-kit",
                        )
                      }
                    >
                      Esporta riepilogo Excel
                    </Button>
                  </>
                )}
                {tab === "finance" && (
                  <>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        [
                          "Incassato KIT",
                          payments.isSuccess
                            ? money(cashIn)
                            : "Dati incompleti",
                        ],
                        ["Fornitori pagati", money(cashOut)],
                        [
                          "Saldo cassa KIT",
                          payments.isSuccess
                            ? money(cashIn - cashOut)
                            : "Dati incompleti",
                        ],
                        [
                          "Fornitori da pagare",
                          money(
                            d.purchases
                              .filter((p) =>
                                inWarehousePeriod(p.dueDate, from, to),
                              )
                              .reduce(
                                (n, p) => n + p.amountCents - p.paidCents,
                                0,
                              ),
                          ),
                        ],
                      ].map(([label, value]) => (
                        <Card key={label}>
                          <CardContent className="p-4">
                            <p className="text-sm text-muted-foreground">
                              {label}
                            </p>
                            <strong>{value}</strong>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Il saldo di cassa non è un utile. Entrate e pagamenti
                      seguono il periodo sopra; il residuo segue la scadenza.
                      Stock e potenziale non entrano nella cassa.
                    </p>
                    {role === "secretary" && (
                      <Button
                        onClick={() => {
                          setPurchase({ ...purchase, id: crypto.randomUUID() });
                          setPurchaseOpen(true);
                        }}
                      >
                        Registra acquisto fornitore
                      </Button>
                    )}
                    <p className="text-sm">
                      Le uscite entrano nel grafico Pagamenti: pagato alla data
                      del pagamento, residuo alla scadenza. Il semplice carico
                      di magazzino non crea un’uscita.
                    </p>
                    {d.purchases
                      .filter(
                        (p) =>
                          (!from || p.purchaseDate >= from) &&
                          (!to || p.purchaseDate <= to),
                      )
                      .map((p) => (
                        <Card key={p.id}>
                          <CardContent className="p-4 space-y-2">
                            <strong>
                              {p.itemName} · {p.size || "—"}
                            </strong>
                            <p className="text-sm">
                              {p.supplier} · {p.reference} · {p.purchaseDate} ·{" "}
                              {p.quantity} pezzi × {money(p.unitCents)}
                            </p>
                            <p>
                              Totale {money(p.amountCents)} · Pagato{" "}
                              {money(p.paidCents)} · Residuo{" "}
                              {money(p.amountCents - p.paidCents)} · Scadenza{" "}
                              {p.dueDate}
                            </p>
                            {role === "secretary" &&
                              p.amountCents > p.paidCents && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setPaying(p);
                                    setReceipt({
                                      id: crypto.randomUUID(),
                                      amount: memberAmountText(
                                        p.amountCents - p.paidCents,
                                      ),
                                      paidDate: trainingLocalDate(),
                                      method: "bank_transfer",
                                    });
                                  }}
                                >
                                  Registra pagamento
                                </Button>
                              )}
                          </CardContent>
                        </Card>
                      ))}
                    {!d.purchases.length && (
                      <p>
                        Nessun acquisto registrato. I costi storici non vengono
                        inventati.
                      </p>
                    )}
                    <FinancialReconciliation
                      payments={[]}
                      warehouse={warehouseExpenseData(d)}
                      today={trainingLocalDate()}
                      complete={data.isSuccess}
                    />
                  </>
                )}
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Acquisto KIT dal fornitore</DialogTitle>
          </DialogHeader>
          <label>
            Articolo
            <select
              className="border rounded p-2 w-full"
              value={purchase.itemId}
              onChange={(e) =>
                setPurchase({ ...purchase, itemId: e.target.value })
              }
            >
              <option value="">Seleziona articolo e taglia</option>
              {d?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.size || "—"}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["quantity", "Quantità", "number"],
              ["unitCost", "Costo unitario totale da pagare (€)", "text"],
              ["supplier", "Fornitore", "text"],
              ["reference", "Riferimento documento", "text"],
              ["purchaseDate", "Data acquisto", "date"],
              ["dueDate", "Scadenza pagamento", "date"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key}>
              {label}
              <Input
                type={type}
                value={purchase[key]}
                onChange={(e) =>
                  setPurchase({ ...purchase, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={purchase.loadStock}
              onChange={(e) =>
                setPurchase({ ...purchase, loadStock: e.target.checked })
              }
            />
            Carica anche le quantità a magazzino. Lascia spento se l’arrivo è
            già stato registrato dall’ordine o dai carichi esistenti.
          </label>
          <Button
            disabled={save.isPending || !purchase.unitCost.trim()}
            onClick={() => save.mutate()}
          >
            Conferma acquisto
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!paying} onOpenChange={(v) => !v && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagamento fornitore</DialogTitle>
          </DialogHeader>
          <label>
            Importo €
            <Input
              value={receipt.amount}
              onChange={(e) =>
                setReceipt({ ...receipt, amount: e.target.value })
              }
            />
          </label>
          <label>
            Data
            <Input
              type="date"
              value={receipt.paidDate}
              onChange={(e) =>
                setReceipt({ ...receipt, paidDate: e.target.value })
              }
            />
          </label>
          <label>
            Metodo
            <select
              className="border rounded p-2 w-full"
              value={receipt.method}
              onChange={(e) =>
                setReceipt({ ...receipt, method: e.target.value })
              }
            >
              <option value="bank_transfer">Bonifico</option>
              <option value="cash">Contanti</option>
              <option value="card">Carta</option>
            </select>
          </label>
          <Button disabled={pay.isPending} onClick={() => pay.mutate()}>
            Conferma pagamento
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
