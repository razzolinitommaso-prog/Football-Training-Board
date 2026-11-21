import { Router } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { canBackupClub, clubBackup } from "../lib/club-backup";

const router = Router();
router.get("/club-backup", requireAuth, async (req, res) => {
  if (!canBackupClub(req.session.role)) { res.status(403).json({ error: "Backup completo riservato a Presidente e Amministratore" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='60s'");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="backup-societa-${req.session.clubId}-${new Date().toISOString().slice(0,10)}.ndjson.gz"`);
    await pipeline(Readable.from(clubBackup(client, req.session.clubId!)), createGzip(), res);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (!res.headersSent && !res.destroyed) res.status(500).json({ error: "Backup non completato. Riprova; non usare un file privo di manifesto finale." });
    else res.destroy(error instanceof Error ? error : undefined);
  } finally { client.release(); }
});
export default router;
