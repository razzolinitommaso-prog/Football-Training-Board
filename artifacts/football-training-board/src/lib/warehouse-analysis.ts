import type { MemberExpenses } from "./member-services";
export type Purchase = {
  id: string;
  itemId: number;
  itemName: string;
  size: string | null;
  quantity: number;
  unitCents: number;
  amountCents: number;
  paidCents: number;
  purchaseDate: string;
  dueDate: string;
  supplier: string;
  reference: string;
  loadStock: boolean;
};
export type WarehouseFinance = {
  purchases: Purchase[];
  receipts: {
    id: string;
    purchaseId: string;
    amountCents: number;
    paidDate: string;
    method: string;
  }[];
};
export type StockItem = {
  id: number;
  name: string;
  code: string;
  size: string | null;
  price: number | null;
  quantityAvailable: number;
  quantityReserved: number;
  unitCents: number | null;
  costSource?: string;
};
export type WarehouseAnalysis = WarehouseFinance & {
  items: StockItem[];
  requests: {
    id: number;
    playerId: number;
    rowKey: string;
    archived?: boolean;
    itemId: number;
    quantity: number;
    status: "pending" | "reserved" | "ordered" | "arrived" | "delivered";
    date: string;
  }[];
  sales: {
    id: number;
    date: string | null;
    status: string;
    amount: number;
    article: {
      id: number;
      name: string;
      size?: string | null;
      quantity?: number;
    };
  }[];
};
export const inWarehousePeriod = (
  date: string | null,
  from: string,
  to: string,
) =>
  !!date &&
  (!from || date.slice(0, 10) >= from) &&
  (!to || date.slice(0, 10) <= to);
/** Every tied mode is retained; quantities, not receipt counts, carry the weight. */
export function weightedModes(rows: { value: string; quantity: number }[]) {
  const counts = new Map<string, number>();
  for (const r of rows)
    if (r.quantity > 0)
      counts.set(r.value, (counts.get(r.value) ?? 0) + r.quantity);
  const maximum = Math.max(0, ...counts.values());
  return [...counts]
    .filter(([, n]) => n === maximum)
    .map(([value, quantity]) => ({ value, quantity }));
}
export function warehouseStatistics(
  data: WarehouseAnalysis,
  from: string,
  to: string,
  articleName = "",
) {
  const article = (name: string | undefined) =>
    !articleName ||
    name?.trim().toLocaleLowerCase("it") ===
      articleName.trim().toLocaleLowerCase("it");
  const requests = data.requests
    .filter((r) => article(data.items.find((i) => i.id === r.itemId)?.name))
    .filter((r) => inWarehousePeriod(r.date, from, to));
  const sales = data.sales
    .filter((r) => article(r.article.name))
    .filter((r) => r.status === "paid" && inWarehousePeriod(r.date, from, to));
  const purchases = data.purchases
    .filter((r) => article(r.itemName))
    .filter((r) => inWarehousePeriod(r.purchaseDate, from, to));
  const groups = new Map<
    string,
    {
      name: string;
      requested: { value: string; quantity: number }[];
      sold: { value: string; quantity: number }[];
    }
  >();
  const group = (name: string) => {
    const key = name.trim().toLocaleLowerCase("it");
    if (!groups.has(key)) groups.set(key, { name, requested: [], sold: [] });
    return groups.get(key)!;
  };
  for (const r of requests) {
    const item = data.items.find((i) => i.id === r.itemId);
    if (item)
      group(item.name).requested.push({
        value: item.size || "Taglia non indicata",
        quantity: r.quantity,
      });
  }
  for (const r of sales)
    group(r.article.name).sold.push({
      value: r.article.size || "Taglia non indicata",
      quantity: r.article.quantity ?? 1,
    });
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, "0");
    return {
      month,
      sold: sales
        .filter((r) => r.date?.slice(5, 7) === month)
        .reduce((n, r) => n + (r.article.quantity ?? 1), 0),
      purchased: purchases
        .filter((r) => r.purchaseDate.slice(5, 7) === month)
        .reduce((n, r) => n + r.quantity, 0),
    };
  });
  return {
    groups: [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "it"),
    ),
    months,
    mostSold: weightedModes(
      sales.map((r) => ({
        value: r.article.name,
        quantity: r.article.quantity ?? 1,
      })),
    ),
    mostPurchased: weightedModes(
      purchases.map((r) => ({ value: r.itemName, quantity: r.quantity })),
    ),
    purchased: purchases.reduce((n, r) => n + r.quantity, 0),
    sold: sales.reduce((n, r) => n + (r.article.quantity ?? 1), 0),
  };
}
/** Adapt supplier costs to the same proven quadrature/export engine, with independent IDs. */
export function warehouseExpenseData(data: WarehouseFinance): MemberExpenses {
  const ids = new Map(data.purchases.map((p, index) => [p.id, index + 1]));
  const details = (p?: Purchase) => ({
    title: p?.reference ?? "Acquisto KIT",
    role: "supplier",
    seasonId: 0,
    compensationCents: 0,
    reimbursementCents: 0,
    terms: "supplier",
    allocations: [],
  });
  return {
    dues: data.purchases.map((p) => ({
      id: ids.get(p.id)!,
      userId: 0,
      name: `KIT · ${p.itemName} · ${p.supplier}`,
      amountCents: p.amountCents,
      paidCents: p.paidCents,
      dueDate: p.dueDate,
      month: p.purchaseDate.slice(0, 7),
      details: details(p),
      contractId: p.id,
    })),
    receipts: data.receipts.map((r) => ({
      ...r,
      dueId: ids.get(r.purchaseId) ?? 0,
      userId: 0,
      name: "Fornitore KIT",
      documentId: null,
      notes: "",
      month:
        data.purchases
          .find((p) => p.id === r.purchaseId)
          ?.purchaseDate.slice(0, 7) ?? r.paidDate.slice(0, 7),
      details: details(data.purchases.find((p) => p.id === r.purchaseId)),
    })),
  };
}
