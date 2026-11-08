import { pool } from "@workspace/db";

export async function ensurePlayerProfileSchema(): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'players'::regclass AND attname = 'profile_history' AND NOT attisdropped
      ) THEN
        ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_history jsonb;
      END IF;

      IF (
        SELECT count(*) FROM pg_attribute
        WHERE attrelid = 'player_fitness_data'::regclass AND NOT attisdropped
          AND attname IN ('height_cm', 'weight_kg', 'observed_role')
      ) < 3 THEN
        ALTER TABLE player_fitness_data
          ADD COLUMN IF NOT EXISTS height_cm real,
          ADD COLUMN IF NOT EXISTS weight_kg real,
          ADD COLUMN IF NOT EXISTS observed_role text;
      END IF;
    END;
    $$;
  `);
}
