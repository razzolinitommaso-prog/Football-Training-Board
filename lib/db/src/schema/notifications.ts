import { boolean, pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";

export const clubNotificationsTable = pgTable("club_notifications", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").references(() => clubsTable.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clubNotificationReadsTable = pgTable("club_notification_reads", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").references(() => clubNotificationsTable.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  isTrashed: boolean("is_trashed").notNull().default(false),
  trashedAt: timestamp("trashed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
