import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { playersTable } from "./players";
import { seasonsTable } from "./seasons";

export const playerSeasonStatusTable = pgTable("player_season_status", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").notNull().references(() => seasonsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  transferAmount: integer("transfer_amount"),
  swapPlayerData: jsonb("swap_player_data").$type<{
    firstName?: string; lastName?: string; age?: number;
    height?: number; weight?: number; position?: string;
    isLoan?: boolean;
  }>(),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PlayerSeasonStatus = typeof playerSeasonStatusTable.$inferSelect;
