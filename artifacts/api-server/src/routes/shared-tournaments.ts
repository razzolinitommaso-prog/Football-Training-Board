import { Router, type IRouter, type Request } from "express";
import { pool, db, teamsTable, teamStaffAssignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  SharedTournamentBody as bodySchema,
  SharedTournamentProgramBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  isClubWideListRole,
  normalizeSessionRole,
  resolveAllowedClubSections,
} from "../lib/club-scope";

const router: IRouter = Router();
const managers = new Set([
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
]);
const competitionName = (name: string) =>
  /^torneo\b/i.test(name) ? name : `Torneo: ${name}`;
const competitionKey = (name: string) =>
  competitionName(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "-");
const staff = new Set([
  ...managers,
  "coach",
  "fitness_coach",
  "athletic_director",
]);
let ready: Promise<unknown> | undefined;
function ensureTables() {
  return (ready ??= pool
    .query(
      `
    CREATE TABLE IF NOT EXISTS shared_tournaments (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      season_id integer REFERENCES seasons(id) ON DELETE RESTRICT, club_section text NOT NULL,
      name text NOT NULL, location text, start_date date NOT NULL, end_date date,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE shared_tournaments ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS shared_tournament_teams (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE CASCADE,
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
      CONSTRAINT shared_tournament_team_unique UNIQUE(tournament_id,team_id)
    );
    CREATE TABLE IF NOT EXISTS shared_tournament_matches (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE RESTRICT,
      match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE, entry_id text,
      CONSTRAINT shared_tournament_match_unique UNIQUE(match_id)
    );
    ALTER TABLE shared_tournament_matches ADD COLUMN IF NOT EXISTS entry_id text;
    CREATE TABLE IF NOT EXISTS shared_tournament_documents (
      id serial PRIMARY KEY, tournament_id integer NOT NULL REFERENCES shared_tournaments(id) ON DELETE CASCADE,
      file_name text NOT NULL, data_url text NOT NULL
    );
  `,
    )
    .catch((error) => {
      ready = undefined;
      throw error;
    }));
}
async function visibleTeams(req: Request) {
  if (!staff.has(normalizeSessionRole(req.session.role))) return [];
  const sections = await resolveAllowedClubSections(req, undefined);
  let teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.clubId, req.session.clubId!));
  if (sections) teams = teams.filter((t) => sections.includes(t.clubSection));
  if (!isClubWideListRole(req.session.role)) {
    const assigned = await db
      .select({ teamId: teamStaffAssignmentsTable.teamId })
      .from(teamStaffAssignmentsTable)
      .where(
        and(
          eq(teamStaffAssignmentsTable.clubId, req.session.clubId!),
          eq(teamStaffAssignmentsTable.userId, req.session.userId!),
        ),
      );
    const ids = new Set(assigned.map((t) => t.teamId));
    teams = teams.filter((t) => ids.has(t.id));
  }
  return teams;
}
const serialize = (
  row: Record<string, any>,
  teams: { id: number; name: string }[],
) => ({
  id: row.id,
  revision: row.revision,
  name: row.name,
  location: row.location ?? "",
  startDate: row.start_date,
  endDate: row.end_date,
  seasonId: row.season_id,
  section: row.club_section,
  teams: teams
    .filter((t) => (row.team_ids as number[]).includes(t.id))
    .map((t) => ({ id: t.id, name: t.name })),
});

router.get(
  "/shared-tournaments",
  requireAuth,
  async (req, res): Promise<void> => {
    const teams = await visibleTeams(req);
    const teamId = Number(req.query.teamId);
    if (!Number.isInteger(teamId) || !teams.some((t) => t.id === teamId)) {
      res.status(403).json({ error: "Annata non accessibile" });
      return;
    }
    await ensureTables();
    const { rows } = await pool.query(
      `SELECT t.*, t.start_date::text, t.end_date::text,
    ARRAY(SELECT team_id FROM shared_tournament_teams WHERE tournament_id=t.id) AS team_ids
    FROM shared_tournaments t WHERE t.club_id=$1 AND EXISTS
    (SELECT 1 FROM shared_tournament_teams p WHERE p.tournament_id=t.id AND p.team_id=$2)
    ORDER BY t.start_date DESC,t.id DESC`,
      [req.session.clubId, teamId],
    );
    res.json(rows.map((row) => serialize(row, teams)));
  },
);

router.post(
  "/shared-tournaments",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!managers.has(normalizeSessionRole(req.session.role))) {
      res
        .status(403)
        .json({ error: "Creazione riservata alla gestione tornei" });
      return;
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Controlla nome, date e annate del torneo" });
      return;
    }
    const body = parsed.data,
      ids = [...new Set(body.teamIds)];
    const teams = await visibleTeams(req),
      selected = teams.filter((t) => ids.includes(t.id));
    if (
      selected.length !== ids.length ||
      selected.some(
        (t) =>
          t.seasonId !== selected[0]?.seasonId ||
          t.clubSection !== selected[0]?.clubSection,
      )
    ) {
      res.status(403).json({
        error: "Scegli annate autorizzate della stessa stagione e settore",
      });
      return;
    }
    await ensureTables();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(3801,$1::integer)", [
        req.session.clubId,
      ]);
      const conflict = await client.query(
        `SELECT id FROM shared_tournaments WHERE club_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND lower(trim(name))=lower(trim($3))`,
        [req.session.clubId, selected[0].seasonId, body.name],
      );
      const legacy = await client.query(
        `SELECT id FROM matches WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND lower(trim(competition))=lower(trim($3)) LIMIT 1`,
        [req.session.clubId, ids, body.name],
      );
      const existingHeaders = await client.query(
        "SELECT name FROM shared_tournaments WHERE club_id=$1 AND season_id IS NOT DISTINCT FROM $2",
        [req.session.clubId, selected[0].seasonId],
      );
      const existingStates = await client.query(
        "SELECT id FROM tournament_states WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND normalized_competition=$3 LIMIT 1",
        [req.session.clubId, ids, competitionKey(body.name)],
      );
      const existingCompetitions = await client.query(
        "SELECT DISTINCT competition FROM matches WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND competition IS NOT NULL",
        [req.session.clubId, ids],
      );
      const collision =
        existingHeaders.rows.some(
          (row) => competitionKey(row.name) === competitionKey(body.name),
        ) ||
        existingStates.rowCount ||
        existingCompetitions.rows.some(
          (row) =>
            competitionKey(row.competition) === competitionKey(body.name),
        );
      if (collision || conflict.rowCount || legacy.rowCount) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error:
            "Esiste già un torneo con questo nome. Apri quello esistente o scegli un nome distinto.",
        });
        return;
      }
      const {
        rows: [row],
      } = await client.query(
        `INSERT INTO shared_tournaments(club_id,season_id,club_section,name,location,start_date,end_date)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,start_date::text,end_date::text`,
        [
          req.session.clubId,
          selected[0].seasonId,
          selected[0].clubSection,
          body.name,
          body.location,
          body.startDate,
          body.endDate,
        ],
      );
      for (const id of ids)
        await client.query(
          "INSERT INTO shared_tournament_teams(tournament_id,team_id) VALUES($1,$2)",
          [row.id, id],
        );
      await client.query("COMMIT");
      res.status(201).json(serialize({ ...row, team_ids: ids }, teams));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

router.patch(
  "/shared-tournaments/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!managers.has(normalizeSessionRole(req.session.role))) {
      res.status(403).json({ error: "Modifica riservata alla gestione" });
      return;
    }
    const parsed = bodySchema.safeParse(req.body),
      id = Number(req.params.id);
    if (!parsed.success || !Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Dati torneo non validi" });
      return;
    }
    const teams = await visibleTeams(req),
      b = parsed.data;
    await ensureTables();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(3801,$1::integer)", [
        req.session.clubId,
      ]);
      const {
        rows: [t],
      } = await client.query(
        `SELECT *,start_date::text,end_date::text FROM shared_tournaments WHERE id=$1 AND club_id=$2 FOR UPDATE`,
        [id, req.session.clubId],
      );
      const { rows: members } = await client.query(
        "SELECT team_id FROM shared_tournament_teams WHERE tournament_id=$1",
        [id],
      );
      if (
        !t ||
        !members.length ||
        members.some((m) => !teams.some((team) => team.id === m.team_id))
      ) {
        await client.query("ROLLBACK");
        res
          .status(403)
          .json({ error: "Devi poter gestire tutte le annate del torneo" });
        return;
      }
      if (b.expectedRevision !== t.revision) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error:
            "Il torneo è stato aggiornato. Ricarica la pagina prima di modificare i dati comuni.",
        });
        return;
      }
      const memberIds = members.map((m) => m.team_id as number);
      if (
        b.teamIds.length !== memberIds.length ||
        new Set(b.teamIds).size !== memberIds.length ||
        memberIds.some((m) => !b.teamIds.includes(m))
      ) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: "Le annate già iscritte non si cambiano da questa modifica",
        });
        return;
      }
      const headers = await client.query(
        "SELECT name FROM shared_tournaments WHERE club_id=$1 AND season_id IS NOT DISTINCT FROM $2 AND id<>$3",
        [req.session.clubId, t.season_id, id],
      );
      const legacy = await client.query(
        `SELECT DISTINCT m.competition FROM matches m WHERE m.club_id=$1 AND m.team_id=ANY($2::integer[]) AND m.competition IS NOT NULL AND NOT EXISTS(SELECT 1 FROM shared_tournament_matches x WHERE x.match_id=m.id AND x.tournament_id=$3)`,
        [req.session.clubId, memberIds, id],
      );
      if (
        headers.rows.some(
          (row) => competitionKey(row.name) === competitionKey(b.name),
        ) ||
        legacy.rows.some(
          (row) => competitionKey(row.competition) === competitionKey(b.name),
        )
      ) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Nome già usato da un altro torneo" });
        return;
      }
      const outside = await client.query(
        `SELECT m.id FROM matches m JOIN shared_tournament_matches x ON x.match_id=m.id WHERE x.tournament_id=$1 AND ((m.date AT TIME ZONE 'Europe/Rome')::date < $2::date OR (m.date AT TIME ZONE 'Europe/Rome')::date > $3::date) LIMIT 1`,
        [id, b.startDate, b.endDate ?? b.startDate],
      );
      const programmes = await client.query(
        "SELECT program FROM tournament_states WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND normalized_competition=$3",
        [req.session.clubId, memberIds, competitionKey(t.name)],
      );
      const outsideProgramme = programmes.rows.some((row) =>
        (row.program ?? []).some((entry: any) => {
          const day = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Europe/Rome",
          }).format(new Date(entry.date));
          return day < b.startDate || day > (b.endDate ?? b.startDate);
        }),
      );
      if (outside.rowCount || outsideProgramme) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error: "Le date devono comprendere le gare già programmate",
        });
        return;
      }
      const norm = (v: string) =>
        v
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .replace(/\s+/g, "-");
      if (b.name !== t.name) {
        const stateConflict = await client.query(
          `SELECT id FROM tournament_states WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND normalized_competition=$3 AND normalized_competition<>$4 LIMIT 1`,
          [
            req.session.clubId,
            memberIds,
            norm(competitionName(b.name)),
            norm(competitionName(t.name)),
          ],
        );
        if (stateConflict.rowCount) {
          await client.query("ROLLBACK");
          res
            .status(409)
            .json({ error: "Esiste già un programma con il nuovo nome" });
          return;
        }
        for (const table of ["tournament_states", "tournament_documents"]) {
          await client.query(
            `UPDATE ${table} SET competition=$1,normalized_competition=$2 WHERE club_id=$3 AND team_id=ANY($4::integer[]) AND normalized_competition=$5`,
            [
              competitionName(b.name),
              norm(competitionName(b.name)),
              req.session.clubId,
              memberIds,
              norm(competitionName(t.name)),
            ],
          );
        }
      }
      const {
        rows: [row],
      } = await client.query(
        `UPDATE shared_tournaments SET name=$1,location=$2,start_date=$3,end_date=$4,updated_at=now(),revision=revision+1 WHERE id=$5 RETURNING *,start_date::text,end_date::text`,
        [b.name, b.location, b.startDate, b.endDate, id],
      );
      await client.query(
        `UPDATE matches SET competition=$1,location=$2 WHERE club_id=$3 AND id IN(SELECT match_id FROM shared_tournament_matches WHERE tournament_id=$4)`,
        [competitionName(b.name), b.location, req.session.clubId, id],
      );
      await client.query("COMMIT");
      res.json(serialize({ ...row, team_ids: memberIds }, teams));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

router.delete(
  "/shared-tournaments/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!managers.has(normalizeSessionRole(req.session.role))) {
      res.status(403).json({ error: "Eliminazione riservata alla gestione" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Torneo non valido" });
      return;
    }
    const teams = await visibleTeams(req);
    await ensureTables();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const {
        rows: [t],
      } = await client.query(
        "SELECT * FROM shared_tournaments WHERE id=$1 AND club_id=$2 FOR UPDATE",
        [id, req.session.clubId],
      );
      const { rows: members } = await client.query(
        "SELECT team_id FROM shared_tournament_teams WHERE tournament_id=$1",
        [id],
      );
      if (
        !t ||
        !members.length ||
        members.some((m) => !teams.some((team) => team.id === m.team_id))
      ) {
        await client.query("ROLLBACK");
        res
          .status(403)
          .json({ error: "Torneo non accessibile per eliminazione" });
        return;
      }
      const count = await client.query(
        "SELECT id FROM shared_tournament_matches WHERE tournament_id=$1 LIMIT 1",
        [id],
      );
      if (count.rowCount) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error:
            "Il torneo contiene gare. Rimuovile dalle rispettive annate prima di eliminare il torneo: convocazioni e preparazioni non vengono cancellate automaticamente.",
        });
        return;
      }
      for (const table of ["tournament_states", "tournament_documents"])
        await client.query(
          `DELETE FROM ${table} WHERE club_id=$1 AND team_id=ANY($2::integer[]) AND normalized_competition=$3`,
          [
            req.session.clubId,
            members.map((m) => m.team_id),
            competitionKey(t.name),
          ],
        );
      await client.query("DELETE FROM shared_tournaments WHERE id=$1", [id]);
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

async function documentAccess(req: Request, id: number, write = false) {
  if (!Number.isInteger(id) || id <= 0) return false;
  const teams = await visibleTeams(req);
  const { rows } = await pool.query(
    `SELECT p.team_id FROM shared_tournament_teams p JOIN shared_tournaments t ON t.id=p.tournament_id WHERE t.id=$1 AND t.club_id=$2`,
    [id, req.session.clubId],
  );
  return (
    rows.length > 0 &&
    (write
      ? managers.has(normalizeSessionRole(req.session.role)) &&
        rows.every((row) => teams.some((t) => t.id === row.team_id))
      : rows.some((row) => teams.some((t) => t.id === row.team_id)))
  );
}
router.get(
  "/shared-tournaments/:id/documents",
  requireAuth,
  async (req, res): Promise<void> => {
    await ensureTables();
    const id = Number(req.params.id);
    if (!(await documentAccess(req, id))) {
      res.status(403).json({ error: "Torneo non accessibile" });
      return;
    }
    const { rows } = await pool.query(
      'SELECT id,file_name AS name,data_url AS "dataUrl" FROM shared_tournament_documents WHERE tournament_id=$1 ORDER BY id',
      [id],
    );
    res.json(rows);
  },
);
router.post(
  "/shared-tournaments/:id/documents",
  requireAuth,
  async (req, res): Promise<void> => {
    await ensureTables();
    const id = Number(req.params.id);
    if (!(await documentAccess(req, id, true))) {
      res.status(403).json({ error: "Caricamento non autorizzato" });
      return;
    }
    const name = String(req.body?.name ?? "").trim(),
      dataUrl = req.body?.dataUrl;
    if (
      !name ||
      name.length > 180 ||
      typeof dataUrl !== "string" ||
      dataUrl.length > 15_000_000
    ) {
      res.status(400).json({ error: "File non valido (massimo 10 MB)" });
      return;
    }
    const parsed =
      /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        dataUrl,
      );
    if (!parsed) {
      res.status(400).json({ error: "Usa un PDF o una immagine PNG/JPEG" });
      return;
    }
    const bytes = Buffer.from(parsed[2], "base64"),
      mime = parsed[1];
    const valid =
      mime === "application/pdf"
        ? bytes.subarray(0, 5).toString() === "%PDF-"
        : mime === "image/png"
          ? bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid || bytes.length > 10 * 1024 * 1024) {
      res
        .status(400)
        .json({ error: "Contenuto o dimensione del file non valido" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT id FROM shared_tournaments WHERE id=$1 FOR UPDATE",
        [id],
      );
      const {
        rows: [count],
      } = await client.query(
        "SELECT count(*)::int AS n FROM shared_tournament_documents WHERE tournament_id=$1",
        [id],
      );
      if (count.n >= 10) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Massimo 10 allegati per torneo" });
        return;
      }
      const {
        rows: [row],
      } = await client.query(
        "INSERT INTO shared_tournament_documents(tournament_id,file_name,data_url) VALUES($1,$2,$3) RETURNING id,file_name AS name",
        [id, name, dataUrl],
      );
      await client.query("COMMIT");
      res.status(201).json(row);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);
router.delete(
  "/shared-tournaments/:id/documents/:documentId",
  requireAuth,
  async (req, res): Promise<void> => {
    await ensureTables();
    const id = Number(req.params.id),
      documentId = Number(req.params.documentId);
    if (!(await documentAccess(req, id, true))) {
      res.status(403).json({ error: "Eliminazione non autorizzata" });
      return;
    }
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: "Allegato non valido" });
      return;
    }
    await pool.query(
      "DELETE FROM shared_tournament_documents WHERE id=$1 AND tournament_id=$2",
      [documentId, id],
    );
    res.json({ ok: true });
  },
);

router.get(
  "/shared-tournaments/:id/program",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id),
      teamId = Number(req.query.teamId),
      teams = await visibleTeams(req);
    if (!teams.some((t) => t.id === teamId)) {
      res.status(403).json({ error: "Annata non accessibile" });
      return;
    }
    await ensureTables();
    const {
      rows: [t],
    } = await pool.query(
      `SELECT t.* FROM shared_tournaments t JOIN shared_tournament_teams p ON p.tournament_id=t.id WHERE t.id=$1 AND t.club_id=$2 AND p.team_id=$3`,
      [id, req.session.clubId, teamId],
    );
    if (!t) {
      res.status(404).json({ error: "Torneo non accessibile" });
      return;
    }
    const {
      rows: [state],
    } = await pool.query(
      "SELECT program FROM tournament_states WHERE club_id=$1 AND team_id=$2 AND competition=$3 ORDER BY id LIMIT 1",
      [req.session.clubId, teamId, competitionName(t.name)],
    );
    const { rows: matches } = await pool.query(
      `SELECT m.*,x.entry_id FROM matches m JOIN shared_tournament_matches x ON x.match_id=m.id WHERE x.tournament_id=$1 AND m.team_id=$2`,
      [id, teamId],
    );
    const ownName = teams.find((team) => team.id === teamId)!.name;
    const program = (state?.program ?? []).map((entry: any) => {
      const match = matches.find((m) => m.entry_id === entry.id);
      return {
        id: entry.id,
        date: entry.date,
        homeTeam: entry.homeTeam,
        awayTeam: entry.awayTeam,
        group: entry.group ?? "",
        phase: entry.phase ?? "Gironi",
        ownSide: match?.home_away ?? "none",
        matchId: match?.id,
      };
    });
    for (const m of matches)
      if (!program.some((e: any) => e.id === m.entry_id))
        program.push({
          id: m.entry_id ?? `match-${m.id}`,
          date: new Date(m.date).toISOString(),
          homeTeam: m.home_away === "home" ? ownName : m.opponent,
          awayTeam: m.home_away === "away" ? ownName : m.opponent,
          group: "",
          phase: "Gironi",
          ownSide: m.home_away,
          matchId: m.id,
        });
    res.json({ program, revision: t.revision });
  },
);

router.put(
  "/shared-tournaments/:id/program",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!managers.has(normalizeSessionRole(req.session.role))) {
      res.status(403).json({ error: "Programmazione riservata alla gestione" });
      return;
    }
    const parsed = SharedTournamentProgramBody.safeParse(req.body),
      id = Number(req.params.id);
    if (!parsed.success || !Number.isInteger(id) || id <= 0) {
      res.status(400).json({
        error:
          "Controlla le gare: nomi, date, assegnazioni e identificativi devono essere validi",
      });
      return;
    }
    const b = parsed.data,
      teams = await visibleTeams(req);
    if (!teams.some((t) => t.id === b.teamId)) {
      res.status(403).json({ error: "Annata non accessibile" });
      return;
    }
    await ensureTables();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const {
        rows: [t],
      } = await client.query(
        `SELECT t.*,t.start_date::text,t.end_date::text FROM shared_tournaments t JOIN shared_tournament_teams p ON p.tournament_id=t.id WHERE t.id=$1 AND t.club_id=$2 AND p.team_id=$3 FOR UPDATE OF t`,
        [id, req.session.clubId, b.teamId],
      );
      if (!t) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Torneo non accessibile" });
        return;
      }
      if (b.expectedRevision !== t.revision) {
        await client.query("ROLLBACK");
        res.status(409).json({
          error:
            "Il torneo è stato aggiornato. Chiudi il programma, ricarica la pagina e riaprilo prima di salvare.",
        });
        return;
      }
      for (const entry of b.program) {
        const day = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Rome",
        }).format(new Date(entry.date));
        if (day < t.start_date || day > (t.end_date ?? t.start_date)) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error: "Tutte le gare devono rientrare nelle date del torneo",
          });
          return;
        }
      }
      const { rows: existing } = await client.query(
        `SELECT m.*,x.entry_id FROM matches m JOIN shared_tournament_matches x ON x.match_id=m.id WHERE x.tournament_id=$1 AND m.team_id=$2 FOR UPDATE OF m`,
        [id, b.teamId],
      );
      const activeIds = new Set(
        b.program.filter((e) => e.ownSide !== "none").map((e) => e.id),
      );
      for (const match of existing) {
        const entry = b.program.find(
          (e) => e.id === (match.entry_id ?? `match-${match.id}`),
        );
        const opponent =
          entry?.ownSide === "home" ? entry.awayTeam : entry?.homeTeam;
        const changesIdentity =
          !entry ||
          entry.ownSide === "none" ||
          opponent !== match.opponent ||
          entry.ownSide !== match.home_away;
        if (changesIdentity) {
          const related = await client.query(
            "SELECT id FROM call_ups WHERE match_id=$1 LIMIT 1",
            [match.id],
          );
          if (
            related.rowCount ||
            match.match_plan ||
            match.result ||
            match.pre_match_notes ||
            match.post_match_notes
          ) {
            await client.query("ROLLBACK");
            res.status(409).json({
              error:
                "Una gara modificata o rimossa contiene convocazioni, schieramenti o resoconti: gestiscila prima dalla sua scheda partita",
            });
            return;
          }
        }
        if (!entry || !activeIds.has(entry.id)) {
          await client.query("DELETE FROM matches WHERE id=$1 AND club_id=$2", [
            match.id,
            req.session.clubId,
          ]);
        }
      }
      for (const entry of b.program) {
        if (entry.ownSide === "none") continue;
        const opponent =
          entry.ownSide === "home" ? entry.awayTeam : entry.homeTeam;
        const match = existing.find(
          (m) => (m.entry_id ?? `match-${m.id}`) === entry.id,
        );
        if (match) {
          await client.query(
            "UPDATE matches SET opponent=$1,date=$2,home_away=$3,competition=$4,location=$5 WHERE id=$6",
            [
              opponent,
              entry.date,
              entry.ownSide,
              competitionName(t.name),
              t.location,
              match.id,
            ],
          );
          await client.query(
            "UPDATE shared_tournament_matches SET entry_id=$1 WHERE match_id=$2",
            [entry.id, match.id],
          );
        } else {
          const {
            rows: [created],
          } = await client.query(
            `INSERT INTO matches(club_id,team_id,season_id,opponent,date,competition,location,home_away,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              req.session.clubId,
              b.teamId,
              t.season_id,
              opponent,
              entry.date,
              competitionName(t.name),
              t.location,
              entry.ownSide,
              `[FTB_SHARED_TOURNAMENT:${id}]`,
            ],
          );
          await client.query(
            "INSERT INTO shared_tournament_matches(tournament_id,match_id,entry_id) VALUES($1,$2,$3)",
            [id, created.id, entry.id],
          );
        }
      }
      const norm = competitionName(t.name)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/\s+/g, "-");
      const {
        rows: [state],
      } = await client.query(
        "SELECT id,scores FROM tournament_states WHERE club_id=$1 AND team_id=$2 AND normalized_competition=$3 FOR UPDATE",
        [req.session.clubId, b.teamId, norm],
      );
      const scores = Object.fromEntries(
        Object.entries(state?.scores ?? {}).filter(([key]) =>
          b.program.some((e) => e.id === key),
        ),
      );
      const program = b.program.map(({ ownSide, ...entry }) => ({
        ...entry,
        kind: "match",
      }));
      if (state)
        await client.query(
          "UPDATE tournament_states SET program=$1::jsonb,scores=$2::jsonb,updated_at=now() WHERE id=$3",
          [JSON.stringify(program), JSON.stringify(scores), state.id],
        );
      else
        await client.query(
          "INSERT INTO tournament_states(club_id,team_id,competition,normalized_competition,program,scores,pdf_reference_date) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)",
          [
            req.session.clubId,
            b.teamId,
            competitionName(t.name),
            norm,
            JSON.stringify(program),
            JSON.stringify(scores),
            t.start_date,
          ],
        );
      await client.query(
        "UPDATE shared_tournaments SET revision=revision+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);

export default router;
