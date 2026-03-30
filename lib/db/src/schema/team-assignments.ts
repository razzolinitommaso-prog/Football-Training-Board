import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

export const teamStaffAssignmentsTable = pgTable("team_staff_assignments", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTeamStaffAssignmentSchema = createInsertSchema(teamStaffAssignmentsTable).omit({ id: true, createdAt: true });
export type InsertTeamStaffAssignment = z.infer<typeof insertTeamStaffAssignmentSchema>;
export type TeamStaffAssignment = typeof teamStaffAssignmentsTable.$inferSelect;
