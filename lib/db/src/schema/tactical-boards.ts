import { jsonb, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const tacticalBoardsTable = pgTable("tactical_boards", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  boardType: text("board_type"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TacticalBoard = typeof tacticalBoardsTable.$inferSelect;
