import {
  jsonb,
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { seasonsTable } from "./seasons";
import { teamsTable } from "./teams";
import { matchesTable } from "./matches";

/** Common tournament identity. Per-team programmes and match preparation stay separate. */
export const sharedTournamentsTable = pgTable("shared_tournaments", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubsTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, {
    onDelete: "restrict",
  }),
  clubSection: text("club_section").notNull(),
  name: text("name").notNull(),
  revision: integer("revision").notNull().default(0),
  location: text("location"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  phases: jsonb("phases")
    .$type<{ id: string; name: string; startDate: string; endDate: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Membership grants no permission: every read/write must also check the session's team scope. */
export const sharedTournamentTeamsTable = pgTable(
  "shared_tournament_teams",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => sharedTournamentsTable.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teamsTable.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("shared_tournament_team_unique").on(
      table.tournamentId,
      table.teamId,
    ),
  ],
);

/** Link real team fixtures; never copy call-ups or match plans into the shared header. */
export const sharedTournamentMatchesTable = pgTable(
  "shared_tournament_matches",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => sharedTournamentsTable.id, { onDelete: "restrict" }),
    entryId: text("entry_id"),
    matchId: integer("match_id")
      .notNull()
      .references(() => matchesTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("shared_tournament_match_unique").on(table.matchId)],
);

export const sharedTournamentDocumentsTable = pgTable(
  "shared_tournament_documents",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => sharedTournamentsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    dataUrl: text("data_url").notNull(),
  },
);
