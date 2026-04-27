import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type JsonRow = Record<string, unknown>;

const TABLE_FILES = [
  { table: "clubs", file: "clubs.json" },
  { table: "users", file: "users.json" },
  { table: "club_memberships", file: "club_memberships.json" },
  { table: "teams", file: "teams.json" },
  { table: "players", file: "players.json" },
] as const;

function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, "\"\"")}"`;
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) throw new Error("DATABASE_URL senza nome database");

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const adminClient = new pg.Client({ connectionString: adminUrl.toString() });

  await adminClient.connect();
  try {
    const exists = await adminClient.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [dbName],
    );
    if (!exists.rows[0]?.exists) {
      await adminClient.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
      console.log(`[db] creato database locale: ${dbName}`);
    } else {
      console.log(`[db] database gia presente: ${dbName}`);
    }
  } finally {
    await adminClient.end();
  }
}

async function getTableColumns(client: pg.Pool, table: string): Promise<string[]> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table],
  );
  return res.rows.map((r) => r.column_name);
}

async function getJsonColumns(client: pg.Pool, table: string): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND data_type IN ('json', 'jsonb')
    `,
    [table],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

async function importTable(client: pg.Pool, table: string, rows: JsonRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const dbColumns = await getTableColumns(client, table);
  const jsonColumns = await getJsonColumns(client, table);
  if (dbColumns.length === 0) {
    throw new Error(`Tabella non trovata: ${table}. Esegui prima lo schema sync.`);
  }

  let imported = 0;
  for (const row of rows) {
    const rowColumns = Object.keys(row).filter((k) => dbColumns.includes(k));
    if (rowColumns.length === 0) continue;

    const quotedColumns = rowColumns.map(quoteIdent).join(", ");
    const placeholders = rowColumns.map((_, i) => `$${i + 1}`).join(", ");
    const values = rowColumns.map((k) => {
      const value = (row as JsonRow)[k];
      if (!jsonColumns.has(k)) return value;
      if (value == null) return null;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        try {
          return JSON.stringify(JSON.parse(trimmed));
        } catch {
          return null;
        }
      }
      return JSON.stringify(value);
    });

    const hasId = rowColumns.includes("id");
    const updatable = rowColumns.filter((c) => c !== "id");
    const onConflict = hasId
      ? updatable.length > 0
        ? `ON CONFLICT ("id") DO UPDATE SET ${updatable
            .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
            .join(", ")}`
        : `ON CONFLICT ("id") DO NOTHING`
      : "";

    const sql = `INSERT INTO ${quoteIdent(table)} (${quotedColumns}) VALUES (${placeholders}) ${onConflict}`;
    await client.query(sql, values);
    imported += 1;
  }

  const hasIdColumn = dbColumns.includes("id");
  if (hasIdColumn) {
    await client.query(
      `
      SELECT setval(
        pg_get_serial_sequence($1, 'id'),
        COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1),
        true
      )
    `,
      [`public.${table}`],
    );
  }

  return imported;
}

async function ensureTestUser(client: pg.Pool): Promise<void> {
  const testEmail = "test@gavinana.it";
  const plainPassword = "123456";

  const clubRes = await client.query<{ id: number; name: string }>(
    `
      SELECT id, name
      FROM clubs
      WHERE name ILIKE '%gavinana%'
      ORDER BY
        CASE WHEN name ILIKE '%gavinana firenze%' THEN 0 ELSE 1 END,
        id
      LIMIT 1
    `,
  );
  const club = clubRes.rows[0];
  if (!club) {
    console.log("[auth] nessun club Gavinana trovato, salto creazione utente test");
    return;
  }

  const userRes = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [testEmail],
  );

  let userId: number;
  if (!userRes.rows[0]) {
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const created = await client.query<{ id: number }>(
      `
        INSERT INTO users (email, password_hash, first_name, last_name, is_super_admin)
        VALUES ($1, $2, 'Test', 'Gavinana', false)
        RETURNING id
      `,
      [testEmail, passwordHash],
    );
    userId = created.rows[0].id;
    console.log(`[auth] creato utente test: ${testEmail}`);
  } else {
    userId = userRes.rows[0].id;
    console.log(`[auth] utente test gia presente: ${testEmail}`);
  }

  const membershipRes = await client.query<{ id: number }>(
    "SELECT id FROM club_memberships WHERE user_id = $1 AND club_id = $2 LIMIT 1",
    [userId, club.id],
  );

  if (!membershipRes.rows[0]) {
    await client.query(
      `
        INSERT INTO club_memberships (user_id, club_id, role, registered, club_section)
        VALUES ($1, $2, 'admin', true, ARRAY['scuola_calcio','settore_giovanile','prima_squadra'])
      `,
      [userId, club.id],
    );
    console.log(`[auth] assegnato ruolo admin a ${testEmail} su club ${club.name}`);
  } else {
    await client.query("UPDATE club_memberships SET role = 'admin' WHERE id = $1", [
      membershipRes.rows[0].id,
    ]);
    console.log(`[auth] membership aggiornata ad admin per ${testEmail}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL non configurata");

  await ensureDatabaseExists(databaseUrl);
  const dbModule = await import("@workspace/db");
  const currentPool = dbModule.pool;
  importedPool = currentPool;

  const exportDir = path.resolve(__dirname, "../../../db-export");

  console.log(`[import] sorgente: ${exportDir}`);
  const totals: Record<string, number> = {};

  for (const entry of TABLE_FILES) {
    const filePath = path.join(exportDir, entry.file);
    const content = await fs.readFile(filePath, "utf8");
    const rows = JSON.parse(content) as JsonRow[];
    const count = await importTable(currentPool, entry.table, rows);
    totals[entry.table] = count;
    console.log(`[import] ${entry.table}: ${count} record importati`);
  }

  await ensureTestUser(currentPool);

  console.log("[import] completato");
  console.log(JSON.stringify({ totals }, null, 2));
}

let importedPool: pg.Pool | null = null;

main()
  .catch((error) => {
    console.error("[import] errore:", error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (importedPool) {
      await importedPool.end().catch(() => {});
    }
  });
