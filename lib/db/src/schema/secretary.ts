import { pgTable, text, serial, timestamp, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { playersTable } from "./players";
import { seasonsTable } from "./seasons";
import { usersTable } from "./users";

/** File condivisi dalla segreteria (pianificazione, calendari) — persistenza cloud per club. */
export const clubSecretarySharedFilesTable = pgTable("club_secretary_shared_files", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  /** Contenuto file codificato in base64 (limite lato API). */
  contentBase64: text("content_base64").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrationsTable = pgTable("registrations", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  registrationDate: date("registration_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerPaymentsTable = pgTable("player_payments", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  dueDate: date("due_date"),
  status: text("status").notNull().default("pending"),
  paymentDate: date("payment_date"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerDocumentsTable = pgTable("player_documents", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentAssignmentsTable = pgTable("equipment_assignments", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  kitAssigned: text("kit_assigned"),
  trainingKit: text("training_kit"),
  matchKit: text("match_kit"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRegistrationSchema = createInsertSchema(registrationsTable).omit({ id: true, createdAt: true });
export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
export type Registration = typeof registrationsTable.$inferSelect;

export const insertPlayerPaymentSchema = createInsertSchema(playerPaymentsTable).omit({ id: true, createdAt: true });
export type InsertPlayerPayment = z.infer<typeof insertPlayerPaymentSchema>;
export type PlayerPayment = typeof playerPaymentsTable.$inferSelect;

export const insertPlayerDocumentSchema = createInsertSchema(playerDocumentsTable).omit({ id: true, createdAt: true });
export type InsertPlayerDocument = z.infer<typeof insertPlayerDocumentSchema>;
export type PlayerDocument = typeof playerDocumentsTable.$inferSelect;
