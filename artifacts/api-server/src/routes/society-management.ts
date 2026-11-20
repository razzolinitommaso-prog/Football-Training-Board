import { Router } from "express";
import {
  db,
  playersTable,
  teamsTable,
  clubsTable,
  clubMembershipsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { memberZod as z } from "@workspace/api-zod";
import {
  memberDate,
  archiveStatusForTransition,
  isArchivedPlayer,
  playerStatusAfterWithdrawal,
  trainingLocalDate,
} from "@workspace/api-zod";
import { createAuthToken, requireAuth } from "../lib/auth";
import { ensureSocietyStorage } from "../lib/society-storage";
import { ensureMemberStorage } from "../lib/member-storage";
import { ensurePlayerFinanceStorage } from "../lib/player-finance-storage";
import { canAssignMemberRole } from "./clubs";
const canManagePlayerSection = (
  role: string,
  section: string | undefined,
  playerSection: string | null,
) =>
  [
    "admin",
    "presidente",
    "director",
    "sporting_director",
    "technical_director",
  ].includes(role) ||
  (role === "secretary" && Boolean(section) && section === playerSection);
const router = Router();
const management = [
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
];
const finance = ["admin", "presidente", "director", "secretary"];
const sections = ["scuola_calcio", "settore_giovanile", "prima_squadra"];
const roles = [
  ...management,
  "coach",
  "fitness_coach",
  "athletic_director",
  "team_manager",
  "collaborator",
  "warehouse_keeper",
  "maintenance",
  "groundskeeper",
  "driver",
  "physiotherapist",
  "doctor",
  "communications",
  "event_manager",
  "administrative_manager",
  "other",
] as const;
const route =
  (fn: (req: any, res: any) => Promise<unknown>) =>
  (req: any, res: any, next: any) =>
    void fn(req, res).catch((e: any) =>
      e instanceof z.ZodError
        ? res
            .status(400)
            .json({ error: e.issues.map((i: any) => i.message).join(" · ") })
        : e.status
          ? res.status(e.status).json({ error: e.message })
          : next(e),
    );
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const audit = async (
  tx: any,
  req: any,
  area: string,
  subject: number | null,
  data: any,
) =>
  tx.execute(
    sql`INSERT INTO society_audit(club_id,actor_id,area,subject_id,data) VALUES(${req.session.clubId},${req.session.userId},${area},${subject},${JSON.stringify(data)}::jsonb)`,
  );
router.get(
  "/society-management/choices",
  requireAuth,
  route(async (req, res) => {
    await ensureSocietyStorage();
    const r = await db.execute(
      sql`SELECT DISTINCT c.id,c.name,m.role FROM clubs c JOIN club_memberships m ON m.club_id=c.id WHERE m.user_id=${req.session.userId} AND m.role<>'parent' AND NOT EXISTS(SELECT 1 FROM member_dismissals d WHERE d.club_id=m.club_id AND d.user_id=m.user_id AND d.role=m.role AND d.effective_date<=CURRENT_DATE) ORDER BY c.name,m.role`,
    );
    res.json(r.rows);
  }),
);
router.use(
  ["/society-management", "/player-positions"],
  requireAuth,
  (req, res, next) => {
    if (
      !management.includes(req.session.role ?? "") &&
      !(
        req.path === "/switch" &&
        req.method === "POST" &&
        roles.includes(req.session.role as any)
      )
    ) {
      res
        .status(403)
        .json({ error: "Operazione riservata alla gestione della società." });
      return;
    }
    void ensureSocietyStorage().then(() => next(), next);
  },
);
async function group(req: any, tx: any = db) {
  const rows = await tx.execute(
    sql`SELECT g.id,g.name,EXISTS(SELECT 1 FROM society_group_managers m WHERE m.group_id=g.id AND m.user_id=${req.session.userId}) AS manager FROM society_groups g JOIN society_group_clubs c ON c.group_id=g.id WHERE c.club_id=${req.session.clubId}`,
  );
  return rows.rows[0] as
    | { id: number; name: string; manager: boolean }
    | undefined;
}
router.get(
  "/society-management",
  route(async (req, res) => {
    const g = await group(req);
    const clubs = await db.execute(
      sql`SELECT DISTINCT c.id,c.name,c.fiscal_code AS "fiscalCode",m.role FROM clubs c JOIN club_memberships m ON m.club_id=c.id AND m.user_id=${req.session.userId} WHERE NOT EXISTS(SELECT 1 FROM member_dismissals d WHERE d.club_id=m.club_id AND d.user_id=m.user_id AND d.role=m.role AND d.effective_date<=CURRENT_DATE) ORDER BY c.name,m.role`,
    );
    const own = await db.execute(
      sql`SELECT DISTINCT u.id,concat_ws(' ',u.last_name,u.first_name) AS name,m.role,d.effective_date AS "effectiveDate",d.notes,d.revision FROM club_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN member_dismissals d ON d.club_id=m.club_id AND d.user_id=m.user_id AND d.role=m.role WHERE m.club_id=${req.session.clubId} AND m.role<>'parent' ORDER BY name,m.role`,
    );
    const groupClubs = g?.manager
      ? (
          await db.execute(
            sql`SELECT c.id,c.name,c.fiscal_code AS "fiscalCode" FROM clubs c JOIN society_group_clubs gc ON gc.club_id=c.id WHERE gc.group_id=${g.id} ORDER BY c.name`,
          )
        ).rows
      : [];
    res.json({
      group: g,
      clubs: clubs.rows,
      members: own.rows,
      groupClubs,
      roles,
      canAdmin: ["admin", "presidente"].includes(req.session.role),
      canFinance: finance.includes(req.session.role),
    });
  }),
);
router.post(
  "/society-management/group",
  route(async (req, res) => {
    if (!["admin", "presidente"].includes(req.session.role))
      fail(403, "Solo Presidente o Amministratore possono creare il gruppo.");
    const { name } = z
      .object({ name: z.string().trim().min(2).max(150) })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('society-group'),${req.session.clubId})`,
      );
      if (await group(req, tx))
        fail(409, "La società appartiene già a un gruppo.");
      const r = await tx.execute<{ id: number }>(
        sql`INSERT INTO society_groups(name,created_by) VALUES(${name},${req.session.userId}) RETURNING id`,
      );
      const id = r.rows[0].id;
      await tx.execute(
        sql`INSERT INTO society_group_clubs VALUES(${req.session.clubId},${id})`,
      );
      await tx.execute(
        sql`INSERT INTO society_group_managers VALUES(${id},${req.session.userId})`,
      );
      await audit(tx, req, "group", id, { name });
    });
    res.sendStatus(201);
  }),
);
router.post(
  "/society-management/clubs",
  route(async (req, res) => {
    const g = await group(req);
    if (!g?.manager)
      fail(403, "Richiesta abilitazione esplicita alla gestione del gruppo.");
    const body = z
      .object({
        name: z.string().trim().min(2).max(150),
        fiscalCode: z.string().trim().max(30).optional(),
        clubId: z.number().int().positive().optional(),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      let id = body.clubId;
      if (id) {
        const access = await tx
          .select()
          .from(clubMembershipsTable)
          .where(
            and(
              eq(clubMembershipsTable.clubId, id),
              eq(clubMembershipsTable.userId, req.session.userId),
            ),
          );
        if (!access.some((m) => ["admin", "presidente"].includes(m.role)))
          fail(
            403,
            "Per collegare una società esistente devi esserne Presidente o Amministratore.",
          );
      } else {
        const [club] = await tx
          .insert(clubsTable)
          .values({ name: body.name, fiscalCode: body.fiscalCode || null })
          .returning();
        id = club.id;
        await tx
          .insert(clubMembershipsTable)
          .values({
            clubId: id,
            userId: req.session.userId,
            role: "admin",
            clubSection: sections,
          });
      }
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('society-group'),${id})`,
      );
      if (
        (
          await tx.execute(
            sql`SELECT 1 FROM society_group_clubs WHERE club_id=${id}`,
          )
        ).rows.length
      )
        fail(409, "Società già collegata a un gruppo.");
      await tx.execute(
        sql`INSERT INTO society_group_clubs VALUES(${id},${g!.id})`,
      );
      await audit(tx, req, "group-club", id!, body);
    });
    res.sendStatus(201);
  }),
);
router.post(
  "/society-management/access",
  route(async (req, res) => {
    const g = await group(req);
    if (!g?.manager) fail(403, "Gestione gruppo non abilitata.");
    const body = z
      .object({
        userId: z.number().int().positive(),
        clubIds: z.array(z.number().int().positive()).min(1).max(100),
        role: z.enum(roles),
        sections: z
          .array(
            z.enum(["scuola_calcio", "settore_giovanile", "prima_squadra"]),
          )
          .min(1),
        groupManager: z.boolean().default(false),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      if (
        !(
          await tx.execute(
            sql`SELECT 1 FROM club_memberships WHERE user_id=${body.userId} AND club_id=${req.session.clubId}`,
          )
        ).rows.length
      )
        fail(404, "Seleziona un membro della società corrente.");
      for (const id of [...new Set(body.clubIds)]) {
        if (
          !(
            await tx.execute(
              sql`SELECT 1 FROM society_group_clubs WHERE club_id=${id} AND group_id=${g!.id}`,
            )
          ).rows.length
        )
          fail(403, "Società estranea al gruppo.");
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${id},${body.userId})`,
        );
        if (
          !(
            await tx.execute(
              sql`SELECT 1 FROM club_memberships WHERE club_id=${id} AND user_id=${body.userId} AND role=${body.role}`,
            )
          ).rows.length
        )
          await tx
            .insert(clubMembershipsTable)
            .values({
              clubId: id,
              userId: body.userId,
              role: body.role,
              clubSection: body.sections,
            });
        else
          await tx
            .update(clubMembershipsTable)
            .set({ clubSection: body.sections })
            .where(
              and(
                eq(clubMembershipsTable.clubId, id),
                eq(clubMembershipsTable.userId, body.userId),
                eq(clubMembershipsTable.role, body.role),
              ),
            );
        // Restoring a dismissed role requires its own explicit operation, not an incidental grant.
      }
      if (body.groupManager)
        await tx.execute(
          sql`INSERT INTO society_group_managers VALUES(${g!.id},${body.userId}) ON CONFLICT DO NOTHING`,
        );
      else if (body.userId !== req.session.userId)
        await tx.execute(
          sql`DELETE FROM society_group_managers WHERE group_id=${g!.id} AND user_id=${body.userId}`,
        );
      await audit(tx, req, "access", body.userId, body);
    });
    res.sendStatus(204);
  }),
);
router.post(
  "/society-management/switch",
  route(async (req, res) => {
    const { clubId, role } = z
      .object({ clubId: z.number().int().positive(), role: z.enum(roles) })
      .parse(req.body);
    const rows = await db
      .select()
      .from(clubMembershipsTable)
      .where(
        and(
          eq(clubMembershipsTable.userId, req.session.userId),
          eq(clubMembershipsTable.clubId, clubId),
          eq(clubMembershipsTable.role, role),
        ),
      );
    if (
      !rows.length ||
      (
        await db.execute(
          sql`SELECT 1 FROM member_dismissals WHERE club_id=${clubId} AND user_id=${req.session.userId} AND role=${role} AND effective_date<=CURRENT_DATE`,
        )
      ).rows.length
    )
      fail(403, "Accesso non autorizzato o incarico esonerato.");
    req.session.clubId = clubId;
    req.session.role = role;
    req.session.section = rows[0].clubSection[0];
    res.json({
      authToken: createAuthToken({
        userId: req.session.userId,
        clubId,
        role,
        section: req.session.section,
      }),
    });
  }),
);
router.put(
  "/society-management/members/:id/dismissal",
  route(async (req, res) => {
    if (
      !["admin", "presidente", "director", "secretary"].includes(
        req.session.role,
      )
    )
      fail(403, "Non autorizzato a modificare gli incarichi.");
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        role: z.enum(roles),
        effectiveDate: memberDate,
        notes: z.string().trim().min(5).max(3000),
        restore: z.boolean().default(false),
      })
      .parse(req.body);
    if(!canAssignMemberRole(req.session.role,body.role))fail(403,"Non puoi modificare un incarico superiore alle tue autorizzazioni.");
    if (id === req.session.userId)
      fail(409, "Non puoi modificare il tuo incarico da questa operazione.");
    if (
      ["admin", "presidente"].includes(body.role) &&
      !["admin", "presidente"].includes(req.session.role)
    )
      fail(
        403,
        "Solo Presidente o Amministratore possono modificare questo incarico.",
      );
    await db.transaction(async (tx) => {
      const m = await tx.execute(
        sql`SELECT 1 FROM club_memberships WHERE club_id=${req.session.clubId} AND user_id=${id} AND role=${body.role}`,
      );
      if (!m.rows.length) fail(404, "Incarico non trovato.");
      if (body.restore)
        await tx.execute(
          sql`DELETE FROM member_dismissals WHERE club_id=${req.session.clubId} AND user_id=${id} AND role=${body.role}`,
        );
      else
        await tx.execute(
          sql`INSERT INTO member_dismissals(club_id,user_id,role,effective_date,notes,updated_by) VALUES(${req.session.clubId},${id},${body.role},${body.effectiveDate},${body.notes},${req.session.userId}) ON CONFLICT(club_id,user_id,role) DO UPDATE SET effective_date=excluded.effective_date,notes=excluded.notes,revision=member_dismissals.revision+1,updated_by=excluded.updated_by`,
        );
      await audit(
        tx,
        req,
        body.restore ? "restore-member" : "dismiss-member",
        id,
        body,
      );
    });
    res.sendStatus(204);
  }),
);
router.get(
  "/society-management/summary",
  route(async (req, res) => {
    if (!finance.includes(req.session.role))
      fail(403, "Riepiloghi economici riservati.");
    const g = await group(req);
    if (!g) fail(404, "Nessun gruppo configurato.");
    const result = await db.execute(
      sql`SELECT c.id,c.name,(SELECT count(*)::integer FROM players p WHERE p.club_id=c.id AND NOT p.is_test) AS players,(SELECT count(*)::integer FROM players p WHERE p.club_id=c.id AND NOT p.is_test AND p.status NOT IN ('withdrawn','not_renewed','transferred','retired_definitive','training_trial')) AS active FROM clubs c JOIN society_group_clubs gc ON gc.club_id=c.id WHERE gc.group_id=${g!.id} AND EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=c.id AND m.user_id=${req.session.userId} AND m.role IN ('admin','presidente','director','secretary') AND NOT EXISTS(SELECT 1 FROM member_dismissals d WHERE d.club_id=m.club_id AND d.user_id=m.user_id AND d.role=m.role AND d.effective_date<=CURRENT_DATE))`,
    );
    await ensureMemberStorage();
    await ensurePlayerFinanceStorage();
    const records = [];
    for (const c of result.rows as any[]) {
      const income = (
        await db.execute<{ total: string }>(
          sql`SELECT coalesce(sum(x.amount),0)::text AS total FROM player_payments x JOIN players p ON p.id=x.player_id AND p.club_id=x.club_id WHERE x.club_id=${c.id} AND x.status='paid' AND NOT p.is_test`,
        )
      ).rows[0].total;
      const costs = (
        await db.execute<{ paid: number; remaining: number }>(
          sql`SELECT coalesce(sum(paid),0)::integer AS paid,coalesce(sum(greatest(amount_cents-paid,0)),0)::integer AS remaining FROM (SELECT d.amount_cents,coalesce((SELECT sum(r.amount_cents) FROM member_expense_receipts r WHERE r.club_id=d.club_id AND r.due_id=d.id),0) AS paid FROM member_dues d WHERE d.club_id=${c.id} AND NOT d.canceled UNION ALL SELECT d.amount_cents,coalesce((SELECT sum(r.amount_cents) FROM player_finance_expense_receipts r WHERE r.club_id=d.club_id AND r.due_id=d.id),0) AS paid FROM player_finance_dues d JOIN players p ON p.id=d.player_id AND p.club_id=d.club_id WHERE d.club_id=${c.id} AND NOT d.canceled AND NOT p.is_test) costs`,
        )
      ).rows[0];
      const format = (n: number) =>
        new Intl.NumberFormat("it-IT", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
      records.push({
        ...c,
        income: format(Number(income)),
        expenses: format(costs.paid / 100),
        remaining: format(costs.remaining / 100),
      });
    }
    res.json(records);
  }),
);
router.get(
  "/player-positions/:id",
  route(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [p] = await db
      .select()
      .from(playersTable)
      .where(
        and(
          eq(playersTable.id, id),
          eq(playersTable.clubId, req.session.clubId),
        ),
      );
    if (
      !p ||
      !canManagePlayerSection(
        req.session.role,
        req.session.section,
        p.clubSection,
      )
    )
      fail(404, "Giocatore non accessibile.");
    const position = (
      await db.execute(
        sql`SELECT revision,effective_date AS "effectiveDate",notes,state FROM player_positions WHERE player_id=${id} AND club_id=${req.session.clubId}`,
      )
    ).rows[0] ?? {
      revision: 0,
      state: isArchivedPlayer(p) ? p.status : "active",
      notes: "",
      effectiveDate: trainingLocalDate(),
    };
    res.json({ ...position, state: isArchivedPlayer(p) ? p.status : "active" });
  }),
);
router.put(
  "/player-positions/:id",
  route(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z
      .object({
        state: z.enum([
          "active",
          "withdrawn",
          "not_renewed",
          "transferred",
          "retired_definitive",
        ]),
        revision: z.number().int().min(0),
        effectiveDate: memberDate,
        notes: z.string().trim().min(3).max(3000),
      })
      .parse(req.body);
    if (body.effectiveDate > trainingLocalDate())
      fail(400, "La decorrenza non può essere futura.");
    await db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(playersTable)
        .where(
          and(
            eq(playersTable.id, id),
            eq(playersTable.clubId, req.session.clubId),
          ),
        )
        .for("update");
      if (
        !p ||
        !canManagePlayerSection(
          req.session.role,
          req.session.section,
          p.clubSection,
        )
      )
        fail(404, "Giocatore non accessibile.");
      const old = (
        await tx.execute<{ revision: number }>(
          sql`SELECT * FROM player_positions WHERE player_id=${id}`,
        )
      ).rows[0];
      if ((old?.revision ?? 0) !== body.revision)
        fail(409, "Posizione aggiornata da un altro utente. Ricarica.");
      const status =
        body.state === "active" ? playerStatusAfterWithdrawal(p) : body.state;
      await tx
        .update(playersTable)
        .set({ status })
        .where(eq(playersTable.id, id));
      await tx.execute(
        sql`INSERT INTO player_positions(club_id,player_id,revision,state,effective_date,notes,updated_by) VALUES(${req.session.clubId},${id},${body.revision + 1},${body.state},${body.effectiveDate},${body.notes},${req.session.userId}) ON CONFLICT(player_id) DO UPDATE SET revision=excluded.revision,state=excluded.state,effective_date=excluded.effective_date,notes=excluded.notes,updated_by=excluded.updated_by`,
      );
      await tx.execute(
        sql`UPDATE player_season_status SET status=${body.state === "active" ? "confirmed" : body.state === "not_renewed" ? "not_confirmed" : body.state === "transferred" ? "transfer_free" : body.state},notes=${body.notes},updated_at=now() WHERE player_id=${id} AND club_id=${req.session.clubId} AND season_id IN (SELECT id FROM seasons WHERE club_id=${req.session.clubId} AND is_active)`,
      );
      await audit(tx, req, "player-position", id, {
        before: p.status,
        ...body,
      });
    });
    res.sendStatus(204);
  }),
);
router.post(
  "/society-management/test-player",
  route(async (req, res) => {
    if (!finance.includes(req.session.role))
      fail(403, "Creazione scheda test non autorizzata.");
    const club = req.session.clubId;
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('test-player'),${club})`,
      );
      const old = (
        await tx.execute<{ id: number }>(
          sql`SELECT id FROM players WHERE club_id=${club} AND is_test ORDER BY id LIMIT 1`,
        )
      ).rows[0];
      if (old) return old;
      let [team] = await tx
        .select()
        .from(teamsTable)
        .where(
          and(
            eq(teamsTable.clubId, club),
            eq(teamsTable.clubSection, "prima_squadra"),
            sql`(${teamsTable.seasonId} IS NULL OR ${teamsTable.seasonId} IN (SELECT id FROM seasons WHERE club_id=${club} AND is_active))`,
          ),
        );
      if (!team) {
        [team] = await tx
          .insert(teamsTable)
          .values({
            clubId: club,
            clubSection: "prima_squadra",
            name: "Prima Squadra · TEST",
            category: "Prima Squadra",
          })
          .returning();
      }
      const [p] = await tx
        .insert(playersTable)
        .values({
          clubId: club,
          teamId: team.id,
          clubSection: "prima_squadra",
          firstName: "Giocatore",
          lastName: "TEST · dimostrativo",
          status: "inactive",
          registered: false,
          available: false,
        })
        .returning();
      await tx.execute(sql`UPDATE players SET is_test=true WHERE id=${p.id}`);
      await audit(tx, req, "test-player", p.id, {});
      return { id: p.id };
    });
    res.json(result);
  }),
);
export default router;
