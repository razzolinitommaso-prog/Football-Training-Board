import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { pool } from "@workspace/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type PlayerBackupRow = {
  club_id: number;
  team_id: number | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  nationality: string | null;
  position: string | null;
  jersey_number: number | null;
  status: string | null;
  height: number | null;
  weight: number | null;
  notes: string | null;
  tax_code: string | null;
  birth_place: string | null;
  address: string | null;
  medical_certificate_expiry: string | null;
  registration_status: string | null;
  registered: boolean | null;
  registration_number: string | null;
  available: boolean | null;
  unavailability_reason: string | null;
  expected_return: string | null;
  club_section: string | null;
  created_at: string | null;
  updated_at: string | null;
};

async function readBackupPlayers(): Promise<PlayerBackupRow[]> {
  const backupPath = path.resolve(__dirname, "../../../db-export/players.json");
  const raw = await fs.readFile(backupPath, "utf8");
  return JSON.parse(raw) as PlayerBackupRow[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function main(): Promise<void> {
  const [, , firstNameArg, lastNameArg, teamIdArg] = process.argv;
  if (!firstNameArg || !lastNameArg || !teamIdArg) {
    throw new Error("Uso: pnpm --filter @workspace/api-server exec tsx ./src/scripts/restore-player.ts <nome> <cognome> <teamId>");
  }

  const firstName = normalize(firstNameArg);
  const lastName = normalize(lastNameArg);
  const teamId = Number.parseInt(teamIdArg, 10);
  if (Number.isNaN(teamId)) {
    throw new Error(`teamId non valido: ${teamIdArg}`);
  }

  const backupPlayers = await readBackupPlayers();
  const backup = backupPlayers.find(
    (row) =>
      row.team_id === teamId &&
      normalize(row.first_name) === firstName &&
      normalize(row.last_name) === lastName,
  );

  if (!backup) {
    throw new Error("Giocatore non trovato nel backup");
  }

  const existing = await pool.query<{ id: number }>(
    `
      SELECT id
      FROM players
      WHERE team_id = $1
        AND lower(first_name) = $2
        AND lower(last_name) = $3
      LIMIT 1
    `,
    [teamId, firstName, lastName],
  );

  if (existing.rows[0]) {
    console.log(`Giocatore già presente con id=${existing.rows[0].id}`);
    return;
  }

  const inserted = await pool.query<{ id: number }>(
    `
      INSERT INTO players (
        club_id,
        team_id,
        first_name,
        last_name,
        date_of_birth,
        nationality,
        position,
        jersey_number,
        status,
        height,
        weight,
        notes,
        tax_code,
        birth_place,
        address,
        medical_certificate_expiry,
        registration_status,
        registered,
        registration_number,
        available,
        unavailability_reason,
        expected_return,
        club_section,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      )
      RETURNING id
    `,
    [
      backup.club_id,
      backup.team_id,
      backup.first_name,
      backup.last_name,
      backup.date_of_birth,
      backup.nationality,
      backup.position,
      backup.jersey_number,
      backup.status ?? "active",
      backup.height,
      backup.weight,
      backup.notes,
      backup.tax_code,
      backup.birth_place,
      backup.address,
      backup.medical_certificate_expiry,
      backup.registration_status ?? "pending",
      backup.registered ?? true,
      backup.registration_number,
      backup.available ?? true,
      backup.unavailability_reason,
      backup.expected_return,
      backup.club_section ?? "scuola_calcio",
      backup.created_at,
      backup.updated_at,
    ],
  );

  console.log(`Giocatore ripristinato con id=${inserted.rows[0]?.id ?? "N/A"}`);
}

main()
  .catch((error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

