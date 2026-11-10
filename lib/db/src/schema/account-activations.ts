import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";

export const accountActivationsTable = pgTable("account_activations", {
  kind: text("kind").$type<"staff" | "parent">().notNull(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  subjectId: integer("subject_id").notNull(),
  digest: text("digest").notNull().unique(),
  channel: text("channel").$type<"email" | "sms">().notNull(),
  destination: text("destination").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  status: text("status").notNull(),
  existingAccount: boolean("existing_account").notNull(),
  loginHash: text("login_hash"),
}, (table) => [
  primaryKey({ columns: [table.kind, table.clubId, table.subjectId] }),
  index("account_activations_login").on(table.kind, table.destination, table.clubId).where(sql`${table.loginHash} IS NOT NULL`),
]);
