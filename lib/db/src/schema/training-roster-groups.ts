import { pgTable, serial, integer, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { seasonsTable } from "./seasons";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

export const trainingRosterGroupsTable = pgTable("training_roster_groups", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  anchorTeamId: integer("anchor_team_id").references(() => teamsTable.id, { onDelete: "cascade" }),
  criterion: text("criterion").notNull().default("manual"),
  birthYear: integer("birth_year"),
  archived: boolean("archived").notNull().default(false),
});
export const trainingRosterGroupTeamsTable = pgTable("training_roster_group_teams", {
  groupId: integer("group_id").notNull().references(() => trainingRosterGroupsTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("training_roster_group_team_unique").on(table.teamId)]);
export const trainingRosterGroupPlayersTable = pgTable("training_roster_group_players", {
  groupId: integer("group_id").notNull().references(() => trainingRosterGroupsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
}, table => [uniqueIndex("training_roster_group_player_unique").on(table.groupId, table.playerId)]);
