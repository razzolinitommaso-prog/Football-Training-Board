import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
let ready: Promise<unknown> | undefined;
export function ensureWarehouseFinance() {
  return (ready ??= db
    .transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(73319822)`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS warehouse_costs (
      club_id integer NOT NULL REFERENCES clubs(id), item_id integer NOT NULL REFERENCES warehouse_items(id),
      unit_cents integer NOT NULL CHECK(unit_cents>=0), source text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(club_id,item_id))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS warehouse_purchases (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), item_id integer NOT NULL REFERENCES warehouse_items(id),
      quantity integer NOT NULL CHECK(quantity>0), unit_cents integer NOT NULL CHECK(unit_cents>=0),
      amount_cents integer NOT NULL CHECK(amount_cents>=0), purchase_date date NOT NULL, due_date date NOT NULL,
      supplier text NOT NULL, reference text NOT NULL, item_name text NOT NULL, size text, load_stock boolean NOT NULL,
      created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(amount_cents=quantity::bigint*unit_cents))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS warehouse_expense_receipts (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), purchase_id uuid NOT NULL REFERENCES warehouse_purchases(id),
      amount_cents integer NOT NULL CHECK(amount_cents>0), paid_date date NOT NULL, method text NOT NULL CHECK(method IN ('cash','card','bank_transfer')),
      created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS warehouse_purchases_club_idx ON warehouse_purchases(club_id,purchase_date)`,
      );
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS warehouse_receipts_club_idx ON warehouse_expense_receipts(club_id,purchase_id)`,
      );
    })
    .catch((e) => {
      ready = undefined;
      throw e;
    }));
}
export async function warehouseExpenses(clubId: number) {
  await ensureWarehouseFinance();
  return db.transaction(
    async (tx) => {
      const purchases = (
        await tx.execute(
          sql`SELECT p.id,p.item_id AS "itemId",p.item_name AS "itemName",p.size,p.quantity,p.unit_cents AS "unitCents",p.amount_cents AS "amountCents",p.purchase_date::text AS "purchaseDate",p.due_date::text AS "dueDate",p.supplier,p.reference,p.load_stock AS "loadStock",COALESCE(sum(r.amount_cents),0)::integer AS "paidCents" FROM warehouse_purchases p LEFT JOIN warehouse_expense_receipts r ON r.purchase_id=p.id AND r.club_id=p.club_id WHERE p.club_id=${clubId} GROUP BY p.id ORDER BY p.purchase_date DESC,p.id`,
        )
      ).rows;
      const receipts = (
        await tx.execute(
          sql`SELECT id,purchase_id AS "purchaseId",amount_cents AS "amountCents",paid_date::text AS "paidDate",method FROM warehouse_expense_receipts WHERE club_id=${clubId} ORDER BY paid_date,id`,
        )
      ).rows;
      return { purchases, receipts };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
