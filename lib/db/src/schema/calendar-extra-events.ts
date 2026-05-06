import { pgTable, text, serial, timestamp, integer, jsonb, date } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";

export const calendarExtraEventsTable = pgTable("calendar_extra_events", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  section: text("section").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  dateFrom: date("date_from").notNull(),
  dateTo: date("date_to").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  frequency: text("frequency").notNull().default("everyday"),
  weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
  targetMode: text("target_mode").notNull().default("all"),
  teamIds: jsonb("team_ids").$type<number[]>().notNull().default([]),
  playerIds: jsonb("player_ids").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

