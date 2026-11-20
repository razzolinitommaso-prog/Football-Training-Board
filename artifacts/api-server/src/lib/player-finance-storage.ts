import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
export type PlayerFinanceTx = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export const playerFinanceRows = <T>(result: unknown): T[] =>
  (result as { rows: T[] }).rows;
let ready: Promise<void> | undefined;
export function ensurePlayerFinanceStorage() {
  ready ??= db
    .transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ftb-playerFinance-services-v1'))`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_profiles (
      club_id integer NOT NULL REFERENCES clubs(id), player_id integer NOT NULL REFERENCES players(id),
      revision integer NOT NULL DEFAULT 0, medical_from date, medical_until date, medical_document_id integer,
      notes text NOT NULL DEFAULT '', updated_by integer, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(club_id,player_id))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_contracts (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), player_id integer NOT NULL REFERENCES players(id),
      revision integer NOT NULL, data jsonb NOT NULL, updated_by integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS player_finance_contracts_owner_idx ON player_finance_contracts(club_id,player_id)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_dues (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), player_id integer NOT NULL REFERENCES players(id),
      contract_id uuid NOT NULL REFERENCES player_finance_contracts(id), month text NOT NULL, due_date date NOT NULL,
      amount_cents integer NOT NULL CHECK(amount_cents>=0), details jsonb NOT NULL, canceled boolean NOT NULL DEFAULT false,
      UNIQUE(contract_id,month))`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS player_finance_dues_club_idx ON player_finance_dues(club_id,player_id,due_date)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_expense_receipts (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), due_id integer NOT NULL REFERENCES player_finance_dues(id),
      amount_cents integer NOT NULL CHECK(amount_cents>0), paid_date date NOT NULL, method text NOT NULL,
      document_id integer, notes text NOT NULL DEFAULT '', created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS player_finance_receipts_due_idx ON player_finance_expense_receipts(club_id,due_id)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_documents (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), player_id integer NOT NULL REFERENCES players(id),
      kind text NOT NULL CHECK(kind IN ('medical','contract','receipt')), file_name text NOT NULL, file_type text NOT NULL,
      file_size integer NOT NULL, file_data text NOT NULL, created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS player_finance_service_audit (
      id serial PRIMARY KEY, club_id integer NOT NULL, player_id integer NOT NULL, actor_id integer NOT NULL,
      area text NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
    })
    .catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
export async function lockPlayerFinance(
  tx: PlayerFinanceTx,
  clubId: number,
  userId: number,
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${clubId},${userId})`);
  const playerFinances = await tx.execute(
    sql`SELECT id FROM players WHERE club_id=${clubId} AND id=${userId} AND club_section='prima_squadra'`,
  );
  if (!playerFinances.rows.length)
    throw new PlayerFinanceError(404, "Membro non trovato nella società.");
}
export class PlayerFinanceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function auditPlayerFinance(
  tx: PlayerFinanceTx,
  clubId: number,
  userId: number,
  actorId: number,
  area: string,
  before: unknown,
  after: unknown,
) {
  await tx.execute(sql`INSERT INTO player_finance_service_audit(club_id,player_id,actor_id,area,before_data,after_data)
    VALUES(${clubId},${userId},${actorId},${area},${JSON.stringify(before ?? null)}::jsonb,${JSON.stringify(after ?? null)}::jsonb)`);
}
