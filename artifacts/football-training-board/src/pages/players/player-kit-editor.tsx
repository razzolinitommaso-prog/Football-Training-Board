import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  describeKitVariant, KIT_REQUEST_STATUS, kitRowHasContent, kitRowItemIds, kitRowNeedsLink, REPRESENTATION_COMPONENTS, REPRESENTATION_SET,
  suggestKitSlots, type KitCatalogItem, type KitRequestLine, type KitRow,
} from "@/lib/player-kit-catalog";

export type PlayerKitVariant = KitCatalogItem & {
  price?: number | null;
  quantityAvailable?: number | null;
  quantityReserved?: number | null;
};

const areas = [
  { value: "training", label: "Allenamento" },
  { value: "match", label: "Gara" },
  { value: "representation", label: "Rappresentanza" },
] as const;

export function PlayerKitEditor({ rows, items, requests, busy, requestsUnavailable, updateRow, requestRow, formatEuro, rowTotal, parsePrice }: {
  rows: KitRow[];
  items: PlayerKitVariant[];
  requests: KitRequestLine[];
  busy: boolean;
  requestsUnavailable: boolean;
  updateRow: (key: string, patch: Partial<KitRow>) => void;
  requestRow: (key: string) => void;
  formatEuro: (value: number) => string;
  rowTotal: (row: KitRow) => number;
  parsePrice: (value: string) => number;
}) {
  const [area, setArea] = useState("training");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const activeIds = new Set(byId.keys());
  const missing = (row: KitRow) => kitRowNeedsLink(row, activeIds);
  const rowsToShow = onlyUnlinked ? rows.filter(missing) : rows.filter((row) => row.area === area);
  const unlinked = rows.filter(missing).length;
  const net = (item: PlayerKitVariant) => Math.max(0, Number(item.quantityAvailable ?? 0) - Number(item.quantityReserved ?? 0));
  const priceOf = (ids: string[]) => ids.reduce((sum, id) => sum + Number(byId.get(id)?.price ?? 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={onlyUnlinked ? "" : area} onValueChange={(value) => { setOnlyUnlinked(false); setArea(value); }}>
          <TabsList className="h-auto flex-wrap">
            {areas.map(({ value, label }) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Button type="button" size="sm" variant={onlyUnlinked ? "secondary" : "ghost"} aria-pressed={onlyUnlinked}
          onClick={() => setOnlyUnlinked((value) => !value)}>Da collegare · {unlinked}</Button>
      </div>
      {requestsUnavailable && <p className="text-sm text-destructive">Stato richieste non disponibile. Ricarica per gestire il magazzino.</p>}
      {rowsToShow.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nessuna voce da collegare.</p>}
      <div className="divide-y divide-border">
        {rowsToShow.map((row) => {
          const componentSlots = row.key === REPRESENTATION_SET ? REPRESENTATION_COMPONENTS : [{ key: row.key, label: row.label }];
          const ids = kitRowItemIds(row);
          const selection = row.componentItemIds?.some(Boolean) ? row.componentItemIds : [row.listItemId ?? ""];
          const lines = requests.filter((line) => line.rowKey === row.key);
          const open = lines.some((line) => line.status !== "delivered");
          const linked = ids.length === componentSlots.length && ids.every((id) => byId.has(id));
          const linkedItems = ids.flatMap((id) => { const item = byId.get(id); return item ? [item] : []; });
          const availability = linked && linkedItems.length ? Math.min(...linkedItems.map(net)) : null;
          const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
          const isLoan = row.assignment === "loan";
          const empty = !kitRowHasContent(row) && row.assignment !== "manual";
          const catalogPrice = priceOf(ids);
          const restoreCatalogPrice = linked && !isLoan && parsePrice(row.price) !== catalogPrice;
          const clear = () => updateRow(row.key, {
            listItemId: "", componentItemIds: undefined, assignment: undefined,
            quantity: "1", price: "", ordered: false, arrived: false,
          });

          return (
            <div key={row.key} className="min-w-0 space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium">{row.label}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {componentSlots.length > 1 && !empty && <Button type="button" variant="ghost" size="sm" className="h-7"
                    disabled={busy || open} onClick={clear}>Nessun indumento</Button>}
                  <span className="text-sm tabular-nums">€ {formatEuro(rowTotal(row))}</span>
                </div>
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem] sm:items-end">
                <div className="min-w-0 space-y-1.5">
                  {componentSlots.map((slot, index) => {
                    const selected = selection[index];
                    const options = items.filter((item) => String(item.id) === selected ||
                      (item.kitSlots ?? suggestKitSlots(item)).includes(slot.key));
                    return (
                      <Select key={slot.key} value={selected || (empty ? "_none" : "_manual")} disabled={busy || open}
                        onValueChange={(value) => {
                          if (value === "_none") { clear(); return; }
                          const next = componentSlots.map((_, i) => i === index ? (value === "_manual" ? "" : value) : selection[i] || "");
                          const price = isLoan ? "0" : next.some(Boolean) ? String(priceOf(next)) : row.price;
                          const assignment = isLoan ? "loan" : next.some(Boolean) ? undefined : "manual";
                          updateRow(row.key, componentSlots.length > 1
                            ? { componentItemIds: next, listItemId: "", price, assignment, ordered: false, arrived: false }
                            : { listItemId: next[0], price, assignment, ordered: false, arrived: false });
                        }}>
                        <SelectTrigger className="w-full min-w-0 [&>span]:truncate" aria-label={`Variante · ${slot.label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-w-[calc(100vw-2rem)]">
                          {(componentSlots.length === 1 || empty) && <SelectItem value="_none">Nessun indumento</SelectItem>}
                          <SelectItem value="_manual">{componentSlots.length > 1 ? `${slot.label} · da collegare` : "Manuale"}</SelectItem>
                          {options.length === 0 && <SelectItem value="_unavailable" disabled>Nessuna variante a listino</SelectItem>}
                          {selected && !byId.has(selected) && <SelectItem value={selected} disabled>Variante non attiva · #{selected}</SelectItem>}
                          {options.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)} textValue={describeKitVariant(item)}>
                              <span className="whitespace-normal">{describeKitVariant(item)} · € {formatEuro(Number(item.price))} · Disp. {net(item)}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })}
                </div>
                <div className="grid grid-cols-[5rem_7rem] gap-2 sm:contents">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Pezzi</span>
                    <Input aria-label={`Pezzi · ${row.label}`} type="number" min={1} step={1} value={row.quantity}
                      disabled={busy || open || empty} onChange={(event) => updateRow(row.key, { quantity: event.target.value })} />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>Prezzo unit. €</span>
                    <Input aria-label={`Prezzo unitario · ${row.label}`} type="number" min={0} step="0.01" value={row.price}
                      disabled={busy || empty || isLoan} onChange={(event) => updateRow(row.key, { price: event.target.value })} />
                  </label>
                </div>
              </div>
              {!empty && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={isLoan} disabled={busy}
                      onChange={(event) => updateRow(row.key, event.target.checked
                        ? { assignment: "loan", price: "0" }
                        : { assignment: ids.length ? undefined : "manual", price: ids.length ? String(catalogPrice) : "" })} />
                    Comodato d’uso
                  </label>
                  {restoreCatalogPrice && <Button type="button" variant="ghost" size="sm" className="h-7"
                    disabled={busy} onClick={() => updateRow(row.key, { price: String(catalogPrice) })}>
                    Usa prezzo di listino · € {formatEuro(catalogPrice)}
                  </Button>}
                </div>
              )}
              {(lines.length > 0 || availability !== null || missing(row)) && (
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {lines.length > 0 ? lines.map((line) =>
                      `${componentSlots.length > 1 ? `${line.itemName} · ` : ""}${KIT_REQUEST_STATUS[line.status]} (${line.quantity})`
                    ).join(" · ") : availability === null ? "Da collegare"
                      : availability >= quantity ? `Disponibili ${availability}` : `Disponibili ${availability} · Mancanti ${quantity - availability}`}
                  </span>
                  {linked && lines.length === 0 && <Button type="button" variant="ghost" size="sm" className="h-7"
                    disabled={busy || requestsUnavailable} onClick={() => requestRow(row.key)}>Richiedi a Magazzino</Button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
