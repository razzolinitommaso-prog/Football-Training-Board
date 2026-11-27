import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";
import { ensureWarehouseKitSchema } from "../lib/warehouse-kit";
import {
  ensureWarehouseFinance,
  warehouseExpenses,
} from "../lib/warehouse-finance";
const router = Router();
const view = new Set(["admin", "presidente", "director", "secretary"]);
router.use("/warehouse-finance", requireAuth, (req, res, next) => {
    if (!view.has(normalizeSessionRole(req.session.role))) {
    res.status(403).json({ error: "Non autorizzato ai costi di magazzino" });
    return;
  }
  next();
});
const validDate = (s: unknown) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const integer = (n: unknown, min: number) =>
  typeof n === "number" &&
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= 2147483647;
router.get("/warehouse-finance", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await warehouseExpenses(req.session.clubId!));
});
router.get("/warehouse-finance/analysis", async (req, res) => {
  await ensureWarehouseKitSchema();
  await ensureWarehouseFinance();
  const club = req.session.clubId!;
  const items = (
    await db.execute(
      sql`SELECT w.id,w.name,w.code,w.size,w.price,w.quantity_available AS "quantityAvailable",w.quantity_reserved AS "quantityReserved",c.unit_cents AS "unitCents",c.source AS "costSource" FROM warehouse_items w LEFT JOIN warehouse_costs c ON c.item_id=w.id AND c.club_id=w.club_id WHERE w.club_id=${club} AND w.section='apparel' ORDER BY w.name,w.size`,
    )
  ).rows;
  const requests = (
    await db.execute(
      sql`SELECT id,player_id AS "playerId",row_key AS "rowKey",item_id AS "itemId",quantity,status,(archived_at IS NOT NULL) AS archived,(created_at AT TIME ZONE 'Europe/Rome')::date::text AS date FROM warehouse_kit_requests WHERE club_id=${club}`,
    )
  ).rows;
  const sales = (
    await db.execute(
      sql`SELECT p.id,p.payment_date::text AS date,p.status,p.amount,k.article FROM player_payments p JOIN player_payment_kit_items k ON k.payment_id=p.id WHERE p.club_id=${club} AND NOT EXISTS (SELECT 1 FROM players x WHERE x.id=p.player_id AND coalesce(x.is_test,false))`,
    )
  ).rows;
  res.setHeader("Cache-Control", "no-store");
  res.json({ items, requests, sales, ...(await warehouseExpenses(club)) });
});
router.post("/warehouse-finance/purchases", async (req, res) => {
  if (normalizeSessionRole(req.session.role) !== "secretary") {
    res.status(403).json({ error: "Solo Segreteria registra acquisti" });
    return;
  }
  const b = req.body,
    club = req.session.clubId!;
  if (
    !uuid(b.id) ||
    !integer(b.itemId, 1) ||
    !integer(b.quantity, 1) ||
    !integer(b.unitCents, 0) ||
    !integer(b.quantity * b.unitCents, 0) ||
    !validDate(b.purchaseDate) ||
    !validDate(b.dueDate) ||
    b.dueDate < b.purchaseDate ||
    typeof b.supplier !== "string" ||
    !b.supplier.trim() ||
    typeof b.reference !== "string" ||
    !b.reference.trim() ||
    typeof b.loadStock !== "boolean"
  ) {
    res
      .status(400)
      .json({
        error:
          "Completa articolo, quantità, costo, fornitore, riferimento e date valide. La scadenza non può precedere l’acquisto.",
      });
    return;
  }
  await ensureWarehouseFinance();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${b.id}))`);
      const prior = (
        await tx.execute(
          sql`SELECT * FROM warehouse_purchases WHERE id=${b.id}::uuid`,
        )
      ).rows[0];
      if (prior) {
        if (
          prior.club_id !== club ||
          prior.item_id !== b.itemId ||
          prior.quantity !== b.quantity ||
          prior.unit_cents !== b.unitCents ||
          String(prior.purchase_date).slice(0, 10) !== b.purchaseDate ||
          String(prior.due_date).slice(0, 10) !== b.dueDate ||
          prior.supplier !== b.supplier.trim() ||
          prior.reference !== b.reference.trim() ||
          prior.load_stock !== b.loadStock
        )
          throw Error("Identificativo acquisto già utilizzato");
        return prior;
      }
      const item = (
        await tx.execute(
          sql`SELECT * FROM warehouse_items WHERE id=${b.itemId} AND club_id=${club} AND section='apparel' FOR UPDATE`,
        )
      ).rows[0];
      if (!item) throw Error("Articolo non trovato in questa società");
      const inserted = (
        await tx.execute(
          sql`INSERT INTO warehouse_purchases(id,club_id,item_id,quantity,unit_cents,amount_cents,purchase_date,due_date,supplier,reference,item_name,size,load_stock,created_by) VALUES(${b.id}::uuid,${club},${b.itemId},${b.quantity},${b.unitCents},${b.quantity * b.unitCents},${b.purchaseDate}::date,${b.dueDate}::date,${b.supplier.trim()},${b.reference.trim()},${item.name},${item.size},${b.loadStock},${req.session.userId!}) RETURNING id`,
        )
      ).rows[0];
      if (b.loadStock)
        await tx.execute(
          sql`UPDATE warehouse_items SET quantity_available=quantity_available+${b.quantity},updated_at=now() WHERE id=${b.itemId} AND club_id=${club}`,
        );
      await tx.execute(
        sql`INSERT INTO warehouse_costs(club_id,item_id,unit_cents,source) VALUES(${club},${b.itemId},${b.unitCents},'Ultimo acquisto registrato') ON CONFLICT(club_id,item_id) DO UPDATE SET unit_cents=EXCLUDED.unit_cents,source=EXCLUDED.source,updated_at=now()`,
      );
      return inserted;
    });
    res.status(201).json(result);
  } catch (e) {
    res
      .status(400)
      .json({
        error:
          e instanceof Error && !("cause" in e)
            ? e.message
            : "Registrazione non riuscita. Nessun dato modificato; riprova.",
      });
  }
});
router.post("/warehouse-finance/receipts", async (req, res) => {
  if (normalizeSessionRole(req.session.role) !== "secretary") {
    res
      .status(403)
      .json({ error: "Solo Segreteria registra pagamenti fornitori" });
    return;
  }
  const b = req.body,
    club = req.session.clubId!;
  if (
    !uuid(b.id) ||
    !uuid(b.purchaseId) ||
    !integer(b.amountCents, 1) ||
    !validDate(b.paidDate) ||
    !["cash", "card", "bank_transfer"].includes(b.method)
  ) {
    res
      .status(400)
      .json({ error: "Indica importo positivo, data e metodo di pagamento" });
    return;
  }
  await ensureWarehouseFinance();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${b.id}))`);
      const prior = (
        await tx.execute(
          sql`SELECT * FROM warehouse_expense_receipts WHERE id=${b.id}::uuid`,
        )
      ).rows[0];
      if (prior) {
        if (
          prior.club_id !== club ||
          prior.purchase_id !== b.purchaseId ||
          prior.amount_cents !== b.amountCents ||
          prior.method !== b.method ||
          String(prior.paid_date).slice(0, 10) !== b.paidDate
        )
          throw Error("Identificativo pagamento già utilizzato");
        return;
      }
      const p = (
        await tx.execute(
          sql`SELECT * FROM warehouse_purchases WHERE id=${b.purchaseId}::uuid AND club_id=${club} FOR UPDATE`,
        )
      ).rows[0];
      if (!p) throw Error("Acquisto non trovato in questa società");
      const paid = (
        await tx.execute(
          sql`SELECT COALESCE(sum(amount_cents),0)::integer AS total FROM warehouse_expense_receipts WHERE purchase_id=${b.purchaseId}::uuid AND club_id=${club}`,
        )
      ).rows[0];
      if (Number(paid.total) + b.amountCents > Number(p.amount_cents))
        throw Error("Il pagamento supera il residuo dovuto");
      if (b.paidDate < String(p.purchase_date).slice(0, 10))
        throw Error("La data di pagamento precede l’acquisto");
      await tx.execute(
        sql`INSERT INTO warehouse_expense_receipts(id,club_id,purchase_id,amount_cents,paid_date,method,created_by) VALUES(${b.id}::uuid,${club},${b.purchaseId}::uuid,${b.amountCents},${b.paidDate}::date,${b.method},${req.session.userId!})`,
      );
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
export default router;
