import { pgTable, text, serial, timestamp, integer, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth"),
  nationality: text("nationality"),
  position: text("position"),
  jerseyNumber: integer("jersey_number"),
  status: text("status").notNull().default("active"),
  height: integer("height"),
  weight: integer("weight"),
  notes: text("notes"),
  taxCode: text("tax_code"),
  birthPlace: text("birth_place"),
  address: text("address"),
  medicalCertificateExpiry: date("medical_certificate_expiry"),
  registrationStatus: text("registration_status").default("pending"),
  registered: boolean("registered").default(false),
  registrationNumber: text("registration_number"),
  available: boolean("available").default(true).notNull(),
  unavailabilityReason: text("unavailability_reason"),
  expectedReturn: date("expected_return"),
  clubSection: text("club_section").notNull().default("scuola_calcio"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
