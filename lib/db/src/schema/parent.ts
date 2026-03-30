import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";
import { playersTable } from "./players";

export const parentPlayerRelationsTable = pgTable("parent_player_relations", {
  id: serial("id").primaryKey(),
  parentUserId: integer("parent_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentNotificationsTable = pgTable("parent_notifications", {
  id: serial("id").primaryKey(),
  parentUserId: integer("parent_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parentDocumentUploadsTable = pgTable("parent_document_uploads", {
  id: serial("id").primaryKey(),
  parentUserId: integer("parent_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  fileData: text("file_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
