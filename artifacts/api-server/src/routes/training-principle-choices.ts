import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, trainingPrincipleChoicesTable } from "@workspace/db";
import { encodeCustomTrainingPrinciple, normalizePrincipleSection, trainingPrinciple } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";

const router = Router();
const staff = new Set(["admin", "presidente", "director", "sporting_director", "technical_director", "coach", "fitness_coach", "athletic_director"]);
let schema: Promise<unknown> | undefined;

router.use("/training-principle-choices", requireAuth, async (req, res, next) => {
  const { clubId, userId, role } = req.session;
  const section = normalizePrincipleSection(typeof req.query.section === "string" ? req.query.section : null);
  if (!clubId || !userId || !section || !staff.has(normalizeSessionRole(role)) ||
      !(await resolveAllowedClubSections(req, section))?.includes(section)) {
    res.sendStatus(403);
    return;
  }
  schema ??= db.execute(sql`
    CREATE TABLE IF NOT EXISTS training_principle_choices (
      club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section TEXT NOT NULL,
      parent TEXT NOT NULL,
      label TEXT NOT NULL,
      normalized_label TEXT NOT NULL,
      PRIMARY KEY (club_id, user_id, section, parent, normalized_label)
    )
  `).catch(error => { schema = undefined; throw error; });
  await schema;
  res.locals.principleScope = { clubId, userId, section };
  next();
});

router.get("/training-principle-choices", async (_req, res) => {
  const { clubId, userId, section } = res.locals.principleScope;
  const rows = await db.select({ parent: trainingPrincipleChoicesTable.parent, label: trainingPrincipleChoicesTable.label })
    .from(trainingPrincipleChoicesTable).where(and(
      eq(trainingPrincipleChoicesTable.clubId, clubId), eq(trainingPrincipleChoicesTable.userId, userId),
      eq(trainingPrincipleChoicesTable.section, section),
    )).orderBy(trainingPrincipleChoicesTable.label);
  res.json(rows.map(({ parent, label }) => ({ parent, label, value: encodeCustomTrainingPrinciple(parent, label) })));
});

router.post("/training-principle-choices", async (req, res) => {
  const { clubId, userId, section } = res.locals.principleScope;
  const parent = typeof req.body?.parent === "string" ? req.body.parent : null;
  const label = typeof req.body?.label === "string" ? req.body.label.trim().replace(/\s+/g, " ").normalize("NFC") : "";
  const catalogParent = trainingPrinciple(parent);
  if (parent === null || (parent !== "" && (!catalogParent || catalogParent.section !== section || catalogParent.depth > 2)) ||
      !label || label.length > 160) {
    res.status(400).json({ error: "Voce o principio di riferimento non valido." });
    return;
  }
  const normalizedLabel = label.toLocaleLowerCase("it");
  const [saved] = await db.insert(trainingPrincipleChoicesTable).values({ clubId, userId, section, parent, label, normalizedLabel })
    .onConflictDoUpdate({
      target: [trainingPrincipleChoicesTable.clubId, trainingPrincipleChoicesTable.userId, trainingPrincipleChoicesTable.section,
        trainingPrincipleChoicesTable.parent, trainingPrincipleChoicesTable.normalizedLabel],
      set: { label: sql`${trainingPrincipleChoicesTable.label}` },
    }).returning({ label: trainingPrincipleChoicesTable.label });
  res.json({ parent, label: saved.label, value: encodeCustomTrainingPrinciple(parent, saved.label) });
});

export default router;
