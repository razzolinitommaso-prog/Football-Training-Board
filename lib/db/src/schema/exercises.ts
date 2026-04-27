import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";
import { teamsTable } from "./teams";
import { trainingSessionsTable } from "./training";
import { usersTable } from "./users";

export const exercisesTable = pgTable("exercises", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: text("category"),
  description: text("description"),
  durationMinutes: integer("duration_minutes"),
  playersRequired: integer("players_required"),
  equipment: text("equipment"),
  /** @deprecated Usare statoLavagnaJson come fonte primaria */
  drawingData: text("drawing_data"),
  /** @deprecated Usare statoLavagnaJson come fonte primaria */
  drawingElementsJson: text("drawing_elements_json"),
  /** Campo unificato per lo stato completo della lavagna (giocatori, coni, frecce, linee, testi, config campo) */
  statoLavagnaJson: text("stato_lavagna_json"),
  /** Anteprima immagine della lavagna (URL o base64) — predisposizione campo, non auto-generata */
  immagineAnteprima: text("immagine_anteprima"),
  voiceNoteData: text("voice_note_data"),
  videoNoteData: text("video_note_data"),
  caricaRosaIntera: boolean("carica_rosa_intera").notNull().default(false),
  scegliGiocatori: boolean("scegli_giocatori").notNull().default(false),
  selectedPlayerIdsJson: text("selected_player_ids_json"),
  isDraft: boolean("is_draft").notNull().default(false),
  teamId: integer("team_id").references(() => teamsTable.id, { onDelete: "set null" }),
  trainingDay: text("training_day"),
  trainingSession: text("training_session"),
  principio: text("principio"),
  trainingPhase: text("training_phase"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sourceExerciseId: integer("source_exercise_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const trainingSessionExercisesTable = pgTable("training_session_exercises", {
  id: serial("id").primaryKey(),
  trainingSessionId: integer("training_session_id").notNull().references(() => trainingSessionsTable.id, { onDelete: "cascade" }),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "cascade" }),
  order: integer("order").notNull().default(0),
  notes: text("notes"),
});

export const insertExerciseSchema = createInsertSchema(exercisesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercisesTable.$inferSelect;

// ── Training Guidelines Board ──────────────────────────────────────────────
export const trainingGuidelinesTable = pgTable("training_guidelines", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull().default("general"),
  linkedExerciseId: integer("linked_exercise_id").references(() => exercisesTable.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TrainingGuideline = typeof trainingGuidelinesTable.$inferSelect;
