import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const trainingCalendarOverridesTable = pgTable("training_calendar_overrides", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  originalDate: date("original_date").notNull(),
  originalStartTime: text("original_start_time").notNull(),
  originalEndTime: text("original_end_time").notNull(),
  status: text("status").notNull().default("moved"),
  newDate: date("new_date"),
  newStartTime: text("new_start_time"),
  newEndTime: text("new_end_time"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TrainingCalendarOverride = typeof trainingCalendarOverridesTable.$inferSelect;
