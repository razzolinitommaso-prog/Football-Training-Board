import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { seasonsTable } from "./seasons";

export const observedPlayersTable = pgTable("observed_players", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").notNull().references(() => seasonsTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth"),
  position: text("position"),
  height: integer("height"),
  weight: integer("weight"),
  clubOrigin: text("club_origin"),
  notes: text("notes"),
  acquisitionStatus: text("acquisition_status").notNull().default("pending"),
  transferAmount: integer("transfer_amount"),
  departingPlayerData: jsonb("departing_player_data").$type<{
    firstName?: string; lastName?: string; position?: string;
    clubDestination?: string; notes?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ObservedPlayer = typeof observedPlayersTable.$inferSelect;
