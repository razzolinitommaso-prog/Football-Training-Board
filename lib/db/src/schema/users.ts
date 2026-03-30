import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const clubMembershipsTable = pgTable("club_memberships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("coach"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  registered: boolean("registered").default(false),
  registrationNumber: text("registration_number"),
  phone: text("phone"),
  licenseType: text("license_type"),
  specialization: text("specialization"),
  staffRole: text("staff_role"),
  degreeScienzeMoto: boolean("degree_scienze_moto").default(false),
  degreeScienzeMotoType: text("degree_scienze_moto_type"),
  clubSection: text("club_section").array().notNull().default(sql`ARRAY['scuola_calcio']`),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertClubMembershipSchema = createInsertSchema(clubMembershipsTable).omit({ id: true, joinedAt: true });
export type InsertClubMembership = z.infer<typeof insertClubMembershipSchema>;
export type ClubMembership = typeof clubMembershipsTable.$inferSelect;
