import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clubsTable = pgTable("clubs", {
  id: serial("id").primaryKey(),

  // Dati principali
  name: text("name").notNull(),
  legalName: text("legal_name"),
  city: text("city"),
  country: text("country"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  foundedYear: integer("founded_year"),
  description: text("description"),
  accessCode: text("access_code"),
  parentCode: text("parent_code"),

  // Dati fiscali / fatturazione
  vatNumber: text("vat_number"),
  fiscalCode: text("fiscal_code"),
  sdiCode: text("sdi_code"),
  pec: text("pec"),

  // Contatti principali
  phone: text("phone"),
  email: text("email"),
  website: text("website"),

  // Sede legale
  legalAddress: text("legal_address"),
  legalCity: text("legal_city"),
  legalZip: text("legal_zip"),
  legalProvince: text("legal_province"),

  // Sede operativa
  operationalAddress: text("operational_address"),
  operationalCity: text("operational_city"),
  operationalZip: text("operational_zip"),
  operationalProvince: text("operational_province"),

  // Referente principale
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClubSchema = createInsertSchema(clubsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubsTable.$inferSelect;
