import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { seasonsTable } from "./seasons";
import { playersTable } from "./players";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, { onDelete: "set null" }),
  opponent: text("opponent").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  competition: text("competition"),
  location: text("location"),
  homeAway: text("home_away").notNull().default("home"),
  result: text("result"),
  notes: text("notes"),
  preMatchNotes: text("pre_match_notes"),
  postMatchNotes: text("post_match_notes"),
  isPostponed: boolean("is_postponed").notNull().default(false),
  rescheduleDate: timestamp("reschedule_date", { withTimezone: true }),
  rescheduleTbd: boolean("reschedule_tbd").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callUpsTable = pgTable("call_ups", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;

export const insertCallUpSchema = createInsertSchema(callUpsTable).omit({ id: true, createdAt: true });
export type InsertCallUp = z.infer<typeof insertCallUpSchema>;
export type CallUp = typeof callUpsTable.$inferSelect;
