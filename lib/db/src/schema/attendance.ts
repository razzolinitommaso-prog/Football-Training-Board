import { pgTable, serial, timestamp, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trainingSessionsTable } from "./training";
import { playersTable } from "./players";
import { clubsTable } from "./clubs";

export const trainingAttendancesTable = pgTable("training_attendances", {
  id: serial("id").primaryKey(),
  trainingSessionId: integer("training_session_id").notNull().references(() => trainingSessionsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("present"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTrainingAttendanceSchema = createInsertSchema(trainingAttendancesTable).omit({ id: true, createdAt: true });
export type InsertTrainingAttendance = z.infer<typeof insertTrainingAttendanceSchema>;
export type TrainingAttendance = typeof trainingAttendancesTable.$inferSelect;
