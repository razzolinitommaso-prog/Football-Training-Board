import { db, equipmentAssignmentsTable, playerPaymentKitItemsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { isPaymentKitRow, paymentKitRowKey, paymentKitSlot, PAYMENT_KIT_SLOTS, type KitCatalogItem, type KitRow } from "@workspace/api-zod";
import { KitRequestError, validateKitLinks } from "./warehouse-kit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Payment = { id: number; playerId: number; amount: number };
export type PaymentKitArticle = { id: number; name: string; code: string; size: string | null; rowKey?: string; quantity?: number; slotKey?: string };

function payload(raw: unknown): { kitRows: Partial<KitRow>[]; [key: string]: unknown } {
  if (!raw) return { kitRows: [] };
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return { kitRows: parsed };
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.kitRows)) return parsed;
  } catch { /* Keep older unstructured notes as well as the new kit rows. */ }
  return { kitRows: [], legacyTrainingKit: raw };
}

/** Stale player forms cannot erase or alter articles owned by a payment. */
export function preservePaymentKitRows(before: unknown, incoming: unknown): string | null | undefined {
  if (incoming != null && typeof incoming !== "string") throw new KitRequestError(400, "Formato scheda Kit non valido.");
  const saved = payload(before).kitRows.filter(isPaymentKitRow);
  const next = payload(incoming);
  if (next.kitRows.some(row => row?.sourcePaymentId != null || /^payment:/.test(String(row?.key)))) {
    for (const row of next.kitRows.filter(row => row?.sourcePaymentId != null || /^payment:/.test(String(row?.key)))) {
      if (!saved.some(old => old.key === row.key)) throw new KitRequestError(400, "Gli articoli da Pagamenti si gestiscono dal movimento collegato.");
    }
  }
  if (!saved.length) return incoming as string | null | undefined;
  return JSON.stringify({ ...next, kitRows: [...next.kitRows.filter(row => !/^payment:/.test(String(row?.key))), ...saved] });
}

export async function readPaymentKitRow(tx: Pick<Tx, "select">, clubId: number, playerId: number, paymentId: number) {
  const [equipment] = await tx.select().from(equipmentAssignmentsTable).where(and(
    eq(equipmentAssignmentsTable.clubId, clubId), eq(equipmentAssignmentsTable.playerId, playerId),
  )).orderBy(asc(equipmentAssignmentsTable.id)).limit(1);
  return { equipment, row: payload(equipment?.trainingKit).kitRows.find(row => row.key === paymentKitRowKey(paymentId) && isPaymentKitRow(row)) };
}

/** Caller holds the player lock; receipt, article and assignment commit together. */
export async function syncPaymentKitRow(tx: Tx, clubId: number, payment: Payment, article: PaymentKitArticle, options: { quantity?: unknown; slotKey?: unknown } = {}) {
  const { equipment, row: old } = await readPaymentKitRow(tx, clubId, payment.playerId, payment.id);
  const { rows: [item] } = await tx.execute<KitCatalogItem>(sql`
    SELECT id, name, category, kit_slots AS "kitSlots" FROM warehouse_items
    WHERE club_id = ${clubId} AND id = ${article.id} AND section = 'apparel'
  `);
  if (!item) throw new KitRequestError(404, "Articolo kit non disponibile nel Magazzino della società.");
  const quantity = options.quantity ?? old?.quantity ?? article.quantity ?? 1;
  const count = typeof quantity === "number" ? quantity : Number(quantity);
  const slotKey = options.slotKey ?? old?.slotKey ?? article.slotKey ?? paymentKitSlot(item);
  const slot = PAYMENT_KIT_SLOTS.find(row => row.key === slotKey);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || (slotKey !== "other" && !slot) || !Number.isFinite(payment.amount) || payment.amount <= 0) {
    throw new KitRequestError(400, "Controlla voce kit, quantità (1–1.000 pezzi) e importo.");
  }
  const row: KitRow = { key: paymentKitRowKey(payment.id), sourcePaymentId: payment.id, slotKey: String(slotKey),
    label: slot?.label ?? article.name, area: slot?.area ?? "training", quantity: String(count),
    price: String(payment.amount / count), listItemId: String(article.id), ordered: false, arrived: false };
  const existingRequests = await tx.execute(sql`SELECT id FROM warehouse_kit_requests
    WHERE club_id = ${clubId} AND player_id = ${payment.playerId} AND row_key = ${row.key} AND archived_at IS NULL LIMIT 1`);
  if (existingRequests.rows.length && (!old || old.listItemId !== row.listItemId || old.quantity !== row.quantity || old.slotKey !== row.slotKey)) {
    throw new KitRequestError(409, "Articolo già richiesto al Magazzino: gestisci la richiesta prima di cambiare articolo o quantità.");
  }
  const data = payload(equipment?.trainingKit);
  const trainingKit = JSON.stringify({ ...data, kitRows: [...data.kitRows.filter(r => r.key !== row.key), row] });
  await validateKitLinks(tx, clubId, payment.playerId, equipment?.trainingKit, trainingKit);
  if (equipment) await tx.update(equipmentAssignmentsTable).set({ trainingKit }).where(eq(equipmentAssignmentsTable.id, equipment.id));
  else await tx.insert(equipmentAssignmentsTable).values({ clubId, playerId: payment.playerId, trainingKit });
  const snapshot: PaymentKitArticle = { ...article, rowKey: row.key, quantity: count, slotKey: String(slotKey) };
  await tx.insert(playerPaymentKitItemsTable).values({ paymentId: payment.id, article: snapshot })
    .onConflictDoUpdate({ target: playerPaymentKitItemsTable.paymentId, set: { article: snapshot } });
  return { article: snapshot, row };
}

export async function removePaymentKitRow(tx: Tx, clubId: number, payment: Payment) {
  const { equipment, row } = await readPaymentKitRow(tx, clubId, payment.playerId, payment.id);
  if (!row || !equipment) return;
  const requests = await tx.execute(sql`SELECT id FROM warehouse_kit_requests
    WHERE club_id = ${clubId} AND player_id = ${payment.playerId} AND row_key = ${row.key} LIMIT 1`);
  if (requests.rows.length) throw new KitRequestError(409, "Il kit ha richieste o consegne a Magazzino. Conserva il movimento e gestisci prima la richiesta.");
  const data = payload(equipment.trainingKit);
  await tx.update(equipmentAssignmentsTable).set({ trainingKit: JSON.stringify({ ...data, kitRows: data.kitRows.filter(r => r.key !== row.key) }) })
    .where(eq(equipmentAssignmentsTable.id, equipment.id));
}
