import { Router } from "express";
import { createHash } from "node:crypto";
import { db, teamsTable, trainingSessionsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TrainingReviewBody, sessionTeamIds } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  resolveAllowedClubSections,
  normalizeSessionRole,
} from "../lib/club-scope";
import {
  ensureSessionPlans,
  resultRows,
} from "../lib/training-session-planning";

const router = Router();
let ready: Promise<unknown> | undefined;
function ensureReviews() {
  return (ready ??= db
    .execute(
      sql`CREATE TABLE IF NOT EXISTS training_session_reviews (
    session_id integer PRIMARY KEY REFERENCES training_sessions(id) ON DELETE CASCADE,
    club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    reviewer_id integer REFERENCES users(id) ON DELETE SET NULL,
    scores jsonb NOT NULL, note text NOT NULL DEFAULT '', fingerprint text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
    )
    .catch((error) => {
      ready = undefined;
      throw error;
    }));
}
router.use(requireAuth, (req, res, next) => {
  if (
    !req.session.clubId ||
    !req.session.userId ||
    normalizeSessionRole(req.session.role) !== "technical_director"
  ) {
    res.status(403).json({ error: "Area riservata al direttore tecnico" });
    return;
  }
  next();
});

async function fingerprints(
  sessions: (typeof trainingSessionsTable.$inferSelect)[],
) {
  const signatures = new Map<number, string>();
  if (!sessions.length) return signatures;
  await ensureSessionPlans();
  const ids = sql.join(
    sessions.map((s) => sql`${s.id}`),
    sql`, `,
  );
  const links = resultRows<{ sessionId: number }>(
    await db.execute(sql`SELECT l.training_session_id AS "sessionId", e.id, e.updated_at, e.title, e.description, e.training_phase, e.duration_minutes, e.principio, e.equipment, e.selected_player_ids_json
    FROM training_session_exercises l JOIN exercises e ON e.id=l.exercise_id AND e.club_id=${sessions[0].clubId}
    WHERE l.training_session_id IN (${ids}) ORDER BY l.id`),
  );
  const plans = resultRows<{ sessionId: number; plan: unknown }>(
    await db.execute(
      sql`SELECT session_id AS "sessionId", plan FROM training_session_plans WHERE session_id IN (${ids}) AND club_id=${sessions[0].clubId}`,
    ),
  );
  for (const session of sessions)
    signatures.set(
      session.id,
      createHash("sha256")
        .update(
          JSON.stringify([
            session.title,
            session.objectives,
            session.durationMinutes,
            session.description,
            links.filter((l) => l.sessionId === session.id),
            plans.filter((p) => p.sessionId === session.id),
          ]),
        )
        .digest("hex"),
    );
  return signatures;
}

router.get("/training-supervision", async (req, res) => {
  const clubId = req.session.clubId!;
  const section =
    typeof req.query.section === "string" ? req.query.section : undefined;
  if (
    section &&
    !["scuola_calcio", "settore_giovanile", "prima_squadra"].includes(section)
  ) {
    res.status(400).json({ error: "Settore non valido" });
    return;
  }
  const allowed = await resolveAllowedClubSections(req, section);
  const teams = await db
    .select()
    .from(teamsTable)
    .where(
      and(
        eq(teamsTable.clubId, clubId),
        allowed ? inArray(teamsTable.clubSection, allowed) : undefined,
      ),
    );
  const teamId = req.query.teamId == null ? null : Number(req.query.teamId);
  if (
    teamId !== null &&
    (!Number.isSafeInteger(teamId) || !teams.some((t) => t.id === teamId))
  ) {
    res.status(403).json({ error: "Annata non accessibile" });
    return;
  }
  const scopedTeams = teams.filter((t) => !teamId || t.id === teamId);
  const ids = scopedTeams.map((t) => t.id);
  if (!ids.length) {
    res.json({ staff: [], facts: {} });
    return;
  }
  const sessions = (
    await db
      .select()
      .from(trainingSessionsTable)
      .where(eq(trainingSessionsTable.clubId, clubId))
  ).filter((s) =>
    sessionTeamIds(s.teamId, s.notes).some((id) => ids.includes(id)),
  );
  await ensureReviews();
  const staff = resultRows<{ staffRole: string | null; clubSection: string }>(
    await db.execute(sql`SELECT DISTINCT u.id AS "userId", u.first_name || ' ' || u.last_name AS name,
      t.id AS "teamId", t.name AS "teamName", t.club_section AS "clubSection", m.role, m.staff_role AS "staffRole", (t.coach_id=u.id) AS primary
    FROM teams t JOIN club_memberships m ON m.club_id=t.club_id
    JOIN users u ON u.id=m.user_id
    WHERE t.club_id=${clubId} AND t.id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND (t.coach_id=u.id OR EXISTS (SELECT 1 FROM team_staff_assignments a WHERE a.club_id=${clubId} AND a.team_id=t.id AND a.user_id=u.id))
      AND m.role IN ('coach','fitness_coach','athletic_director') ORDER BY name`),
  ).map((person) => {
    try {
      const parsed = JSON.parse(person.staffRole ?? "");
      return {
        ...person,
        staffRole: parsed.bySection?.[person.clubSection] ?? null,
      };
    } catch {
      return person;
    }
  });
  const facts: Record<string, unknown> = {};
  if (sessions.length) {
    const sessionIds = sql.join(
      sessions.map((s) => sql`${s.id}`),
      sql`, `,
    );
    const attendance = resultRows<{ sessionId: number; recorded: number }>(
      await db.execute(sql`SELECT training_session_id AS "sessionId", count(DISTINCT player_id)::int AS recorded
      FROM training_attendances WHERE club_id=${clubId} AND training_session_id IN (${sessionIds}) GROUP BY training_session_id`),
    );
    // Adoption is proven only by an independent source-linked station in a regular session.
    const adopted = resultRows<{ sessionId: number; count: number }>(
      await db.execute(sql`SELECT src.training_session_id AS "sessionId", count(DISTINCT dst.id)::int AS count
      FROM training_session_exercises src JOIN exercises copy ON copy.source_exercise_id=src.exercise_id AND copy.club_id=${clubId}
      JOIN training_session_exercises linked ON linked.exercise_id=copy.id
      JOIN training_sessions dst ON dst.id=linked.training_session_id AND dst.club_id=${clubId} AND dst.session_kind='regular' AND dst.status NOT IN ('cancelled','canceled')
      WHERE src.training_session_id IN (${sessionIds}) GROUP BY src.training_session_id`),
    );
    const reviews = resultRows<{
      sessionId: number;
      scores: unknown;
      note: string;
      fingerprint: string;
      updatedAt: string;
      reviewerName: string;
    }>(
      await db.execute(sql`SELECT r.session_id AS "sessionId", r.scores, r.note, r.fingerprint, r.updated_at AS "updatedAt", u.first_name || ' ' || u.last_name AS "reviewerName"
      FROM training_session_reviews r LEFT JOIN users u ON u.id=r.reviewer_id WHERE r.club_id=${clubId} AND r.session_id IN (${sessionIds})`),
    );
    const signatures = await fingerprints(
      sessions.filter((s) => reviews.some((r) => r.sessionId === s.id)),
    );
    for (const session of sessions) {
      const review = reviews.find((r) => r.sessionId === session.id);
      facts[session.id] = {
        recorded:
          attendance.find((a) => a.sessionId === session.id)?.recorded ?? 0,
        adoptions: adopted.find((a) => a.sessionId === session.id)?.count ?? 0,
        review: review
          ? {
              ...review,
              stale: review.fingerprint !== signatures.get(session.id),
              fingerprint: undefined,
            }
          : null,
      };
    }
  }
  res.json({ staff, facts });
});

router.put("/training-sessions/:id/review", async (req, res) => {
  const parsed = TrainingReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error:
          "Valutazione non valida: usa valori da 1 a 4 oppure Non valutato",
      });
    return;
  }
  if (
    !Object.values(parsed.data.scores).some((value) => value !== null) &&
    !parsed.data.note
  ) {
    res
      .status(400)
      .json({ error: "Inserisci almeno una valutazione o una nota" });
    return;
  }
  const id = Number(req.params.id),
    clubId = req.session.clubId!;
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Seduta non valida" });
    return;
  }
  const [session] = await db
    .select()
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.id, id),
        eq(trainingSessionsTable.clubId, clubId),
      ),
    );
  if (!session || session.sessionKind !== "regular") {
    res.status(404).json({ error: "Seduta non trovata" });
    return;
  }
  const allowed = await resolveAllowedClubSections(req, undefined);
  const [team] = session.teamId
    ? await db
        .select()
        .from(teamsTable)
        .where(
          and(eq(teamsTable.id, session.teamId), eq(teamsTable.clubId, clubId)),
        )
    : [];
  if (!team || (allowed && !allowed.includes(team.clubSection))) {
    res.status(403).json({ error: "Annata non accessibile" });
    return;
  }
  await ensureReviews();
  const signature = (await fingerprints([session])).get(session.id)!;
  const saved = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM training_sessions WHERE id=${id} AND club_id=${clubId} FOR UPDATE`,
    );
    const [previous] = resultRows<{ updatedAt: string }>(
      await tx.execute(
        sql`SELECT updated_at AS "updatedAt" FROM training_session_reviews WHERE session_id=${id} AND club_id=${clubId}`,
      ),
    );
    if (
      (previous ? new Date(previous.updatedAt).toISOString() : null) !==
      parsed.data.expectedUpdatedAt
    )
      return false;
    await tx.execute(sql`INSERT INTO training_session_reviews (session_id,club_id,reviewer_id,scores,note,fingerprint) VALUES (${id},${clubId},${req.session.userId!},${JSON.stringify(parsed.data.scores)}::jsonb,${parsed.data.note},${signature})
      ON CONFLICT (session_id) DO UPDATE SET reviewer_id=excluded.reviewer_id,scores=excluded.scores,note=excluded.note,fingerprint=excluded.fingerprint,updated_at=now()`);
    return true;
  });
  if (!saved) {
    res
      .status(409)
      .json({ error: "La valutazione è cambiata. Ricarica prima di salvare." });
    return;
  }
  res.json({ ok: true });
});
export default router;
