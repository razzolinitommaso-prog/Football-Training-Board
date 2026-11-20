import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
export type MemberTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const memberRows = <T>(result: unknown): T[] =>
  (result as { rows: T[] }).rows;
let ready: Promise<void> | undefined;
export function ensureMemberStorage() {
  ready ??= db
    .transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('ftb-member-services-v1'))`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_profiles (
      club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      revision integer NOT NULL DEFAULT 0, medical_from date, medical_until date, medical_document_id integer,
      notes text NOT NULL DEFAULT '', updated_by integer, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(club_id,user_id))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_contracts (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      revision integer NOT NULL, data jsonb NOT NULL, updated_by integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS member_contracts_owner_idx ON member_contracts(club_id,user_id)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_dues (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      contract_id uuid NOT NULL REFERENCES member_contracts(id), month text NOT NULL, due_date date NOT NULL,
      amount_cents integer NOT NULL CHECK(amount_cents>=0), details jsonb NOT NULL, canceled boolean NOT NULL DEFAULT false,
      UNIQUE(contract_id,month))`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS member_dues_club_idx ON member_dues(club_id,user_id,due_date)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_expense_receipts (
      id uuid PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), due_id integer NOT NULL REFERENCES member_dues(id),
      amount_cents integer NOT NULL CHECK(amount_cents>0), paid_date date NOT NULL, method text NOT NULL,
      document_id integer, notes text NOT NULL DEFAULT '', created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(
        sql`CREATE INDEX IF NOT EXISTS member_receipts_due_idx ON member_expense_receipts(club_id,due_id)`,
      );
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_documents (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      kind text NOT NULL CHECK(kind IN ('medical','contract','receipt')), file_name text NOT NULL, file_type text NOT NULL,
      file_size integer NOT NULL, file_data text NOT NULL, created_by integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_attendances (
      club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      event_kind text NOT NULL CHECK(event_kind IN ('training','match')), event_id integer NOT NULL,
      status text NOT NULL CHECK(status IN ('present','absent','unrecorded')), notes text NOT NULL DEFAULT '',
      revision integer NOT NULL DEFAULT 1, roles jsonb NOT NULL, recorded_by integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(club_id,user_id,event_kind,event_id))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_kit_rows (
      club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id), slot text NOT NULL,
      item_id integer NOT NULL REFERENCES warehouse_items(id), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
      revision integer NOT NULL DEFAULT 1, PRIMARY KEY(club_id,user_id,slot))`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_kit_requests (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id), user_id integer NOT NULL REFERENCES users(id),
      slot text NOT NULL, item_id integer NOT NULL REFERENCES warehouse_items(id), quantity integer NOT NULL CHECK(quantity>0),
      status text NOT NULL CHECK(status IN ('pending','reserved','ordered','arrived','delivered','canceled')),
      archived boolean NOT NULL DEFAULT false, created_by integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
      await tx.execute(sql`CREATE TABLE IF NOT EXISTS member_service_audit (
      id serial PRIMARY KEY, club_id integer NOT NULL, user_id integer NOT NULL, actor_id integer NOT NULL,
      area text NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
    })
    .catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
export async function lockMember(tx: MemberTx, clubId: number, userId: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${clubId},${userId})`);
  const members = await tx.execute(
    sql`SELECT user_id FROM club_memberships WHERE club_id=${clubId} AND user_id=${userId} AND role<>'parent'`,
  );
  if (!members.rows.length)
    throw new MemberError(404, "Membro non trovato nella società.");
}
export class MemberError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function auditMember(
  tx: MemberTx,
  clubId: number,
  userId: number,
  actorId: number,
  area: string,
  before: unknown,
  after: unknown,
) {
  await tx.execute(sql`INSERT INTO member_service_audit(club_id,user_id,actor_id,area,before_data,after_data)
    VALUES(${clubId},${userId},${actorId},${area},${JSON.stringify(before ?? null)}::jsonb,${JSON.stringify(after ?? null)}::jsonb)`);
}
