import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";
import { seasonsTable } from "./seasons";

export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  coachId: integer("coach_id").references(() => usersTable.id, { onDelete: "set null" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  ageGroup: text("age_group"),
  category: text("category"),
  clubSection: text("club_section").notNull().default("scuola_calcio"),
  trainingSchedule: jsonb("training_schedule").$type<{ day: string; startTime: string; endTime: string }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
