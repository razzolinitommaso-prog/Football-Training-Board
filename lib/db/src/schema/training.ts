import { pgTable, text, serial, timestamp, integer, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes"),
  location: text("location"),
  status: text("status").notNull().default("scheduled"),
  objectives: text("objectives"),
  notes: text("notes"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sessionKind: text("session_kind").notNull().default("regular"),
  sentToUserIds: jsonb("sent_to_user_ids").$type<number[]>(),
  tdComment: text("td_comment"),
  tdGuidelines: text("td_guidelines"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const trainingDirectivesTable = pgTable("training_directives", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("general"),
  sentToUserIds: jsonb("sent_to_user_ids").$type<number[]>().notNull().default([]),
  scheduledFor: text("scheduled_for"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TrainingDirective = typeof trainingDirectivesTable.$inferSelect;

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;

// Session-local timing overrides: source library exercises remain unchanged.
export const trainingSessionPlansTable = pgTable("training_session_plans", {
  sessionId: integer("session_id").primaryKey().references(() => trainingSessionsTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  plan: jsonb("plan").$type<{ recoveries: [number, number]; timings: Record<string, { seconds: number; stations: number[]; signature: string }> }>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingSessionSuppressionsTable = pgTable("training_session_suppressions", {
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
}, table => [primaryKey({columns:[table.clubId,table.teamId,table.scheduledAt]})]);
