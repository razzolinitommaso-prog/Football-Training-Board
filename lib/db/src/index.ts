import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env before reading DATABASE_URL (import order vs api entrypoints).
dotenv.config();
const envPaths = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../../artifacts/api-server/.env"),
  path.resolve(process.cwd(), "lib/db/.env"),
  path.resolve(process.cwd(), "artifacts/api-server/.env"),
];
for (const p of envPaths) {
  dotenv.config({ path: p });
}

// UTF-8 BOM .env: Node may expose \uFEFFDATABASE_URL instead of DATABASE_URL
const rawUrl =
  process.env.DATABASE_URL ?? process.env["\uFEFFDATABASE_URL"] ?? "";
const databaseUrl = rawUrl.trim() || undefined;

function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

console.log("DB INIT", databaseUrl ? redactDatabaseUrl(databaseUrl) : "(DATABASE_URL unset)");

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set it in artifacts/api-server/.env or lib/db/.env (this package loads both).",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });

pool
  .connect()
  .then((client) => {
    console.log("✅ PostgreSQL connected");
    client.release();
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection failed:", err);
  });

/** Drizzle client; always defined — this module throws during load if DATABASE_URL is missing. */
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Database = typeof db;

/** Same reference as `db` (for clarity at call sites); never null. */
export function getDb(): Database {
  return db;
}

export * from "./schema";
