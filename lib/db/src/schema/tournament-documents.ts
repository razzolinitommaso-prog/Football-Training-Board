import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

/** Allegati condivisi per scheda torneo (stessa squadra + competizione), visibili a tutti i ruoli del club. */
export const tournamentDocumentsTable = pgTable("tournament_documents", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  competition: text("competition").notNull(),
  normalizedCompetition: text("normalized_competition").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  /** Data URL (`data:mime;base64,...`) come inviata dal client. */
  dataUrl: text("data_url").notNull(),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TournamentDocumentRow = typeof tournamentDocumentsTable.$inferSelect;
