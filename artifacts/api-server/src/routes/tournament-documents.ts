import { Router, type IRouter, type Request } from "express";
import { db, teamsTable, tournamentDocumentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const UPLOAD_ROLES = ["admin", "director", "secretary", "presidente"];
const MAX_TOURNAMENT_DOC_BYTES = 8 * 1024 * 1024;

function normalizeTournamentKeyPart(value: unknown): string {
  let s = String(value ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  try {
    s = s.normalize("NFD").replace(/\p{M}/gu, "");
  } catch {
    s = s
      .replace(/[àáâãäå]/g, "a")
      .replace(/[èéêë]/g, "e")
      .replace(/[ìíîï]/g, "i")
      .replace(/[òóôõö]/g, "o")
      .replace(/[ùúûü]/g, "u")
      .replace(/ç/g, "c")
      .replace(/ñ/g, "n");
  }
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s/g, "-");
  return s || "unknown";
}

function parseBase64Payload(raw: string): { base64: string; mimeFromDataUrl?: string } {
  const s = String(raw ?? "").trim();
  if (s.startsWith("data:")) {
    const comma = s.indexOf(",");
    if (comma === -1) return { base64: "" };
    const meta = s.slice(5, comma);
    const mimeMatch = /^([^;]+)/.exec(meta);
    const mimeFromDataUrl = mimeMatch?.[1]?.trim() || undefined;
    return { base64: s.slice(comma + 1), mimeFromDataUrl };
  }
  return { base64: s };
}

/** Allineato al filtro sezione di GET /api/matches con teamId. */
async function assertTeamAccessibleInSession(req: Request, teamId: number): Promise<boolean> {
  const clubId = req.session.clubId!;
  const sectionFilter = req.session.section;
  const [team] = await db
    .select({
      id: teamsTable.id,
      clubId: teamsTable.clubId,
      clubSection: teamsTable.clubSection,
    })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team || team.clubId !== clubId) return false;
  if (!sectionFilter) return true;
  return (team.clubSection ?? "").trim() === String(sectionFilter).trim();
}

router.get("/tournament-documents", requireAuth, async (req, res): Promise<void> => {
  const teamId = Number.parseInt(String(req.query.teamId ?? ""), 10);
  if (!Number.isFinite(teamId) || teamId <= 0) {
    res.status(400).json({ error: "teamId richiesto" });
    return;
  }
  const ok = await assertTeamAccessibleInSession(req, teamId);
  if (!ok) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const clubId = req.session.clubId!;
  const competitionQ = String(req.query.competition ?? "").trim();
  const norm = competitionQ ? normalizeTournamentKeyPart(competitionQ) : null;

  try {
    const conditions = [
      eq(tournamentDocumentsTable.clubId, clubId),
      eq(tournamentDocumentsTable.teamId, teamId),
    ];
    if (norm) {
      conditions.push(eq(tournamentDocumentsTable.normalizedCompetition, norm));
    }
    const rows = await db
      .select()
      .from(tournamentDocumentsTable)
      .where(and(...conditions))
      .orderBy(desc(tournamentDocumentsTable.createdAt));

    res.json({
      documents: rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        competition: r.competition,
        normalizedCompetition: r.normalizedCompetition,
        fileName: r.fileName,
        fileType: r.fileType,
        fileSize: r.fileSize,
        dataUrl: r.dataUrl,
        createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
      })),
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "42P01" || /relation .* does not exist/i.test(String(e?.message ?? err))) {
      res.status(503).json({ error: "Tabella tournament_documents non presente: eseguire migrazione DB" });
      return;
    }
    throw err;
  }
});

router.post("/tournament-documents", requireAuth, async (req, res): Promise<void> => {
  if (!UPLOAD_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Solo segreteria o ruoli equivalenti possono caricare allegati torneo" });
    return;
  }
  const clubId = req.session.clubId!;
  const userId = req.session.userId!;
  const body = req.body as {
    teamId?: unknown;
    competition?: unknown;
    fileName?: unknown;
    fileType?: unknown;
    fileSize?: unknown;
    dataUrl?: unknown;
  };
  const teamId = Number.parseInt(String(body.teamId ?? ""), 10);
  const competition = String(body.competition ?? "").trim();
  const fileName = String(body.fileName ?? "").trim();
  const fileType = String(body.fileType ?? "application/octet-stream").slice(0, 200);
  const fileSize = Number(body.fileSize);
  const dataUrlRaw = String(body.dataUrl ?? "").trim();

  if (!Number.isFinite(teamId) || teamId <= 0 || !competition || !fileName || !dataUrlRaw) {
    res.status(400).json({ error: "teamId, competition, fileName e dataUrl sono obbligatori" });
    return;
  }
  if (!Number.isFinite(fileSize) || fileSize < 0) {
    res.status(400).json({ error: "fileSize non valido" });
    return;
  }

  const teamOk = await assertTeamAccessibleInSession(req, teamId);
  if (!teamOk) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const [team] = await db
    .select({ clubId: teamsTable.clubId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team || team.clubId !== clubId) {
    res.status(403).json({ error: "Squadra non valida" });
    return;
  }

  const { base64 } = parseBase64Payload(dataUrlRaw);
  if (!base64) {
    res.status(400).json({ error: "dataUrl non valida" });
    return;
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    res.status(400).json({ error: "Base64 non valida" });
    return;
  }
  if (buf.length === 0) {
    res.status(400).json({ error: "File vuoto" });
    return;
  }
  if (buf.length > MAX_TOURNAMENT_DOC_BYTES) {
    res
      .status(413)
      .json({ error: `File troppo grande (max ${MAX_TOURNAMENT_DOC_BYTES / (1024 * 1024)} MB)` });
    return;
  }

  const normalizedCompetition = normalizeTournamentKeyPart(competition);
  const safeName = fileName.replace(/[/\\]/g, "_").slice(0, 255);
  const storedDataUrl = dataUrlRaw.startsWith("data:") ? dataUrlRaw : `data:${fileType};base64,${base64}`;

  try {
    const [row] = await db
      .insert(tournamentDocumentsTable)
      .values({
        clubId,
        teamId,
        competition,
        normalizedCompetition,
        fileName: safeName,
        fileType,
        fileSize: buf.length,
        dataUrl: storedDataUrl,
        uploadedByUserId: userId,
      })
      .returning();

    if (!row) {
      res.status(500).json({ error: "Salvataggio fallito" });
      return;
    }
    res.status(201).json({
      id: row.id,
      teamId: row.teamId,
      competition: row.competition,
      normalizedCompetition: row.normalizedCompetition,
      fileName: row.fileName,
      fileType: row.fileType,
      fileSize: row.fileSize,
      dataUrl: row.dataUrl,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "42P01" || /relation .* does not exist/i.test(String(e?.message ?? err))) {
      res.status(503).json({ error: "Tabella tournament_documents non presente: eseguire migrazione DB" });
      return;
    }
    throw err;
  }
});

export default router;
