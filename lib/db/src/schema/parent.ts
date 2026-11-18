import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { teamsTable } from "./teams";
import { sharedTournamentsTable } from "./shared-tournaments";
import { clubsTable } from "./clubs";
import { usersTable } from "./users";
import { playersTable } from "./players";

export const parentTournamentAvailabilityTable = pgTable("parent_tournament_availability", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(()=>clubsTable.id,{onDelete:"cascade"}),
  teamId: integer("team_id").notNull().references(()=>teamsTable.id,{onDelete:"cascade"}),
  playerId: integer("player_id").notNull().references(()=>playersTable.id,{onDelete:"cascade"}),
  tournamentId: integer("tournament_id").references(()=>sharedTournamentsTable.id,{onDelete:"cascade"}),
  tournamentKey: text("tournament_key").notNull(),
  status: text("status").notNull(), reason: text("reason"), notes: text("notes"),
  responseMode: text("response_mode").notNull().default('all'),
  availableDates: jsonb('available_dates').$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[uniqueIndex("parent_tournament_reply_unique").on(table.clubId,table.teamId,table.playerId,table.tournamentKey),check("parent_tournament_reply_status",sql`${table.status} IN ('available','unavailable')`)]);

export const parentPlayerRelationsTable = pgTable("parent_player_relations", {
  id: serial("id").primaryKey(),
  parentUserId: integer("parent_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerParentDelegatesTable = pgTable("player_parent_delegates", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  relation: text("relation").notNull(),
  phone: text("phone"),
  email: text("email"),
  accessCode: text("access_code").notNull(),
  personalAccessCodeHash: text("personal_access_code_hash"),
  personalAccessCodeSetAt: timestamp("personal_access_code_set_at", { withTimezone: true }),
  resetRequestedAt: timestamp("reset_requested_at", { withTimezone: true }),
  accessVersion: text("access_version"),
  deliveryChannel: text("delivery_channel").notNull().default("manual"),
  deliveryStatus: text("delivery_status").notNull().default("ready"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
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
