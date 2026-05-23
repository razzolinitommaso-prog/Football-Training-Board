import { Router, type IRouter, type Request } from "express";
import { db, teamsTable, tournamentDocumentsTable, tournamentStatesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const UPLOAD_ROLES = ["admin", "director", "secretary", "presidente"];
const MAX_TOURNAMENT_DOC_BYTES = 8 * 1024 * 1024;

type TournamentProgramEntry = {
  id: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  phase?: string | null;
  group?: string | null;
};

type TournamentProgramScore = {
  homeScore: number | null;
  awayScore: number | null;
};

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

function normalizeProgram(value: unknown): TournamentProgramEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const date = String(row.date ?? "").trim();
    const homeTeam = String(row.homeTeam ?? "").trim();
    const awayTeam = String(row.awayTeam ?? "").trim();
    if (!id || !date || !homeTeam || !awayTeam) return [];
    return [{
      id,
      date,
      homeTeam,
      awayTeam,
      phase: row.phase == null ? null : String(row.phase),
      group: row.group == null ? null : String(row.group),
    }];
  });
}

function normalizeScores(value: unknown): Record<string, TournamentProgramScore> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, TournamentProgramScore> = {};
  for (const [key, rawScore] of Object.entries(value as Record<string, unknown>)) {
    if (!rawScore || typeof rawScore !== "object" || Array.isArray(rawScore)) continue;
    const score = rawScore as Record<string, unknown>;
    const home = score.homeScore == null ? null : Number(score.homeScore);
    const away = score.awayScore == null ? null : Number(score.awayScore);
    out[key] = {
      homeScore: Number.isFinite(home) ? home : null,
      awayScore: Number.isFinite(away) ? away : null,
    };
  }
  return out;
}

function normalizePdfReferenceDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

    const stateRows = await db
      .select()
      .from(tournamentStatesTable)
      .where(and(
        eq(tournamentStatesTable.clubId, clubId),
        eq(tournamentStatesTable.teamId, teamId),
      ));

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
      states: stateRows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        competition: r.competition,
        normalizedCompetition: r.normalizedCompetition,
        program: r.program,
        scores: r.scores,
        pdfReferenceDate: r.pdfReferenceDate,
        updatedAt: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
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

router.put("/tournament-documents/state", requireAuth, async (req, res): Promise<void> => {
  if (!UPLOAD_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Solo segreteria o ruoli equivalenti possono aggiornare programma torneo" });
    return;
  }
  const clubId = req.session.clubId!;
  const userId = req.session.userId!;
  const body = req.body as {
    teamId?: unknown;
    competition?: unknown;
    program?: unknown;
    scores?: unknown;
    pdfReferenceDate?: unknown;
  };
  const teamId = Number.parseInt(String(body.teamId ?? ""), 10);
  const competition = String(body.competition ?? "").trim();
  if (!Number.isFinite(teamId) || teamId <= 0 || !competition) {
    res.status(400).json({ error: "teamId e competition sono obbligatori" });
    return;
  }
  const teamOk = await assertTeamAccessibleInSession(req, teamId);
  if (!teamOk) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const normalizedCompetition = normalizeTournamentKeyPart(competition);
  const program = normalizeProgram(body.program);
  const scores = normalizeScores(body.scores);
  const pdfReferenceDate = normalizePdfReferenceDate(body.pdfReferenceDate);

  const [existing] = await db
    .select({ id: tournamentStatesTable.id })
    .from(tournamentStatesTable)
    .where(and(
      eq(tournamentStatesTable.clubId, clubId),
      eq(tournamentStatesTable.teamId, teamId),
      eq(tournamentStatesTable.normalizedCompetition, normalizedCompetition),
    ))
    .limit(1);

  const values = {
    clubId,
    teamId,
    competition,
    normalizedCompetition,
    program,
    scores,
    pdfReferenceDate,
    updatedByUserId: userId,
  };

  const [row] = existing
    ? await db.update(tournamentStatesTable).set(values).where(eq(tournamentStatesTable.id, existing.id)).returning()
    : await db.insert(tournamentStatesTable).values(values).returning();

  if (!row) {
    res.status(500).json({ error: "Salvataggio stato torneo fallito" });
    return;
  }

  res.json({
    id: row.id,
    teamId: row.teamId,
    competition: row.competition,
    normalizedCompetition: row.normalizedCompetition,
    program: row.program,
    scores: row.scores,
    pdfReferenceDate: row.pdfReferenceDate,
    updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
  });
});

router.delete("/tournament-documents/state", requireAuth, async (req, res): Promise<void> => {
  if (!UPLOAD_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Solo segreteria o ruoli equivalenti possono eliminare lo stato torneo" });
    return;
  }
  const clubId = req.session.clubId!;
  const teamId = Number.parseInt(String(req.query.teamId ?? ""), 10);
  const competition = String(req.query.competition ?? "").trim();
  if (!Number.isFinite(teamId) || teamId <= 0 || !competition) {
    res.status(400).json({ error: "teamId e competition sono obbligatori" });
    return;
  }
  const teamOk = await assertTeamAccessibleInSession(req, teamId);
  if (!teamOk) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const normalizedCompetition = normalizeTournamentKeyPart(competition);
  await db
    .delete(tournamentStatesTable)
    .where(and(
      eq(tournamentStatesTable.clubId, clubId),
      eq(tournamentStatesTable.teamId, teamId),
      eq(tournamentStatesTable.normalizedCompetition, normalizedCompetition),
    ));
  await db
    .delete(tournamentDocumentsTable)
    .where(and(
      eq(tournamentDocumentsTable.clubId, clubId),
      eq(tournamentDocumentsTable.teamId, teamId),
      eq(tournamentDocumentsTable.normalizedCompetition, normalizedCompetition),
    ));

  res.json({ ok: true });
});

router.patch("/tournament-documents/:id", requireAuth, async (req, res): Promise<void> => {
  if (!UPLOAD_ROLES.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Solo segreteria o ruoli equivalenti possono rinominare allegati torneo" });
    return;
  }
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const fileName = String((req.body as { fileName?: unknown }).fileName ?? "").trim();
  if (!Number.isFinite(id) || id <= 0 || !fileName) {
    res.status(400).json({ error: "id e fileName sono obbligatori" });
    return;
  }

  const clubId = req.session.clubId!;
  const [existing] = await db
    .select({ id: tournamentDocumentsTable.id, teamId: tournamentDocumentsTable.teamId, clubId: tournamentDocumentsTable.clubId })
    .from(tournamentDocumentsTable)
    .where(eq(tournamentDocumentsTable.id, id))
    .limit(1);

  if (!existing || existing.clubId !== clubId) {
    res.status(404).json({ error: "Documento non trovato" });
    return;
  }
  const teamOk = await assertTeamAccessibleInSession(req, existing.teamId);
  if (!teamOk) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }

  const safeName = fileName.replace(/[/\\]/g, "_").slice(0, 255);
  const [row] = await db
    .update(tournamentDocumentsTable)
    .set({ fileName: safeName })
    .where(eq(tournamentDocumentsTable.id, id))
    .returning();

  if (!row) {
    res.status(500).json({ error: "Rinomina fallita" });
    return;
  }

  res.json({
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
});

export default router;
