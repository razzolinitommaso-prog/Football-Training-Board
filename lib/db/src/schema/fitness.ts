import { pgTable, text, serial, timestamp, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { playersTable } from "./players";
import { usersTable } from "./users";

export const fitnessProgramsTable = pgTable("fitness_programs", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  durationWeeks: integer("duration_weeks"),
  intensityLevel: text("intensity_level").notNull().default("medium"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const playerFitnessDataTable = pgTable("player_fitness_data", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  endurance: real("endurance"),
  strength: real("strength"),
  speed: real("speed"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFitnessProgramSchema = createInsertSchema(fitnessProgramsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFitnessProgram = z.infer<typeof insertFitnessProgramSchema>;
export type FitnessProgram = typeof fitnessProgramsTable.$inferSelect;

export const insertPlayerFitnessDataSchema = createInsertSchema(playerFitnessDataTable).omit({ id: true, createdAt: true });
export type InsertPlayerFitnessData = z.infer<typeof insertPlayerFitnessDataSchema>;
export type PlayerFitnessData = typeof playerFitnessDataTable.$inferSelect;
