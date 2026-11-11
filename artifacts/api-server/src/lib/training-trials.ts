import { db } from "@workspace/db";
import { sessionTeamIds, trainingLocalDate } from "@workspace/api-zod";
import { sql } from "drizzle-orm";

export const TRAINING_TRIAL_STATUS = "training_trial";
type Reader = Pick<typeof db, "execute">;

export type TrainingTrial = {
  playerId: number;
  teamId: number;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  medicalCertificate: boolean | null;
  trialWaiver: boolean | null;
  startsOn: string;
  endsOn: string;
  score: number | null;
  decision: "approved" | "rejected" | null;
};

let tableReady: Promise<unknown> | undefined;
export function ensureTrainingTrials() {
  tableReady ??= db.transaction(async tx => {
    await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS training_player_trials (
      player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      starts_on DATE NOT NULL,
      ends_on DATE NOT NULL,
      score INTEGER CHECK (score BETWEEN 1 AND 10),
      decision TEXT CHECK (decision IN ('approved', 'rejected')),
      evaluated_by INTEGER,
      evaluated_at TIMESTAMPTZ,
      CHECK (starts_on <= ends_on)
    )
    `);
    await tx.execute(sql`
      ALTER TABLE training_player_trials
        ADD COLUMN IF NOT EXISTS birth_year INTEGER,
        ADD COLUMN IF NOT EXISTS medical_certificate BOOLEAN,
        ADD COLUMN IF NOT EXISTS trial_waiver BOOLEAN
    `);
  }).catch(error => {
    tableReady = undefined;
    throw error;
  });
  return tableReady;
}

export async function listTrainingTrials(clubId: number, teamIds: number[], reader: Reader = db) {
  if (!teamIds.length) return [];
  await ensureTrainingTrials();
  const result = await reader.execute(sql`
    SELECT t.player_id AS "playerId", t.team_id AS "teamId",
           p.first_name AS "firstName", p.last_name AS "lastName",
           t.birth_year AS "birthYear", t.medical_certificate AS "medicalCertificate",
           t.trial_waiver AS "trialWaiver",
           t.starts_on::text AS "startsOn", t.ends_on::text AS "endsOn",
           t.score, t.decision
    FROM training_player_trials t
    JOIN players p ON p.id = t.player_id AND p.club_id = t.club_id
    WHERE t.club_id = ${clubId} AND t.team_id IN (${sql.join(teamIds.map(id => sql`${id}`), sql`,`)})
    ORDER BY t.starts_on DESC, t.player_id DESC
  `);
  return (Array.isArray(result) ? result : result.rows) as TrainingTrial[];
}

export function trialIncludesDate(trial: TrainingTrial, date: string) {
  return trial.startsOn <= date && date <= trial.endsOn;
}

export async function trainingTrialsForSession(session: {
  clubId: number;
  teamId: number | null;
  notes: string | null;
  scheduledAt: Date;
  sessionKind?: string | null;
}, reader: Reader = db) {
  if (!session.teamId || session.sessionKind === "tipo") return [];
  const trials = await listTrainingTrials(session.clubId, sessionTeamIds(session.teamId, session.notes), reader);
  const date = trainingLocalDate(session.scheduledAt);
  return trials.filter(trial => trialIncludesDate(trial, date));
}

export function validTrainingTrialDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
