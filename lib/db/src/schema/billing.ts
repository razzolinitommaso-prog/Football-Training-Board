import { pgTable, text, serial, timestamp, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  planName: text("plan_name").notNull().default("standard"),
  status: text("status").notNull().default("active"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  maxTeams: integer("max_teams").notNull().default(3),
  maxPlayers: integer("max_players").notNull().default(50),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const billingPaymentsTable = pgTable("billing_payments", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  paymentDate: date("payment_date"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const insertBillingPaymentSchema = createInsertSchema(billingPaymentsTable).omit({ id: true, createdAt: true });
export type InsertBillingPayment = z.infer<typeof insertBillingPaymentSchema>;
export type BillingPayment = typeof billingPaymentsTable.$inferSelect;
