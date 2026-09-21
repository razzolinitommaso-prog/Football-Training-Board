import { jsonb, pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { clubsTable } from "./clubs";
import { seasonsTable } from "./seasons";
import { teamsTable } from "./teams";
import { usersTable } from "./users";
import { matchesTable } from "./matches";

export type ChampionshipPointsRule = { win: number; draw: number; loss: number };

export const championshipsTable = pgTable("championships", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => seasonsTable.id, { onDelete: "set null" }),
  section: text("section").notNull(),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category"),
  pointsRule: jsonb("points_rule").$type<ChampionshipPointsRule>().notNull().default({ win: 3, draw: 1, loss: 0 }),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const championshipGroupsTable = pgTable("championship_groups", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  championshipId: integer("championship_id").notNull().references(() => championshipsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const championshipFixturesTable = pgTable("championship_fixtures", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  championshipId: integer("championship_id").notNull().references(() => championshipsTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => championshipGroupsTable.id, { onDelete: "cascade" }),
  matchId: integer("match_id").references(() => matchesTable.id, { onDelete: "set null" }),
  round: integer("round"),
  leg: text("leg"),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  date: timestamp("date", { withTimezone: true }),
  location: text("location"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Championship = typeof championshipsTable.$inferSelect;
export type ChampionshipGroup = typeof championshipGroupsTable.$inferSelect;
export type ChampionshipFixture = typeof championshipFixturesTable.$inferSelect;
