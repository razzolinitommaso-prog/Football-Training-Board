import { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { PoolClient } from "pg";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { canBackupClub, clubBackup } from "../lib/club-backup";

const router = Router();
router.get("/club-backup", requireAuth, async (req, res) => {
  if (!canBackupClub(req.session.role)) { res.status(403).json({ error: "Backup completo riservato a Presidente e Amministratore" }); return; }
  let client: PoolClient | undefined;
  let stage = "connection";
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='60s'");
    stage = "preparation";
    const chunks = clubBackup(client, req.session.clubId!);
    // Validate catalog metadata before a failing stream can destroy the HTTP response.
    const first = await chunks.next();
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="backup-societa-${req.session.clubId}-${new Date().toISOString().slice(0,10)}.ndjson.gz"`);
    stage = "stream";
    await pipeline(Readable.from((async function* () {
      if (!first.done) yield first.value;
      yield* chunks;
    })()), createGzip(), res);
    await client.query("COMMIT");
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    // No SQL, record content or credentials in the client response or diagnostic log.
    console.error("[club-backup] export failed", { stage });
    if (!res.headersSent && !res.destroyed) {
      res.removeHeader("Content-Disposition");
      res.status(500).json({ error: "Backup non completato durante la preparazione. Riprova; se persiste segnala il codice BACKUP_PREPARATION_FAILED.", code: "BACKUP_PREPARATION_FAILED" });
    }
    else res.destroy(error instanceof Error ? error : undefined);
  } finally { client?.release(); }
});
export default router;
