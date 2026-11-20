import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { isDeepStrictEqual } from "node:util";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { memberZod as z } from "@workspace/api-zod";
import {
  memberContractInput,
  memberDate,
  memberInstallments,
  memberKitSlots,
  suggestKitSlots,
  trainingLocalDate,
  sessionTeamIds,
  type MemberContract,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";
import {
  ensureMemberStorage,
  lockMember,
  MemberError,
  auditMember,
  type MemberTx,
} from "../lib/member-storage";
import { parseDocumentUpload } from "../lib/document-upload";
import { ensureWarehouseKitSchema } from "../lib/warehouse-kit";

const router = Router();
const viewers = [
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
];
const financiers = ["admin", "presidente", "director", "secretary"];
const canFinance = (req: Request) =>
  financiers.includes(normalizeSessionRole(req.session.role));
const ids = (req: Request) => ({
  club: Number(req.session.clubId),
  actor: Number(req.session.userId),
  user: Number(req.params.userId),
});
const validId = (id: number) =>
  Number.isSafeInteger(id) && id > 0 && id <= 2147483647;
type Handle = (req: Request, res: Response) => Promise<unknown>;
const handle =
  (fn: Handle) => (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res).catch((e) =>
      e instanceof MemberError
        ? res.status(e.status).json({ error: e.message })
        : e instanceof z.ZodError
          ? res
              .status(400)
              .json({ error: e.issues.map((i) => i.message).join(" · ") })
          : next(e),
    );
router.use("/member-services", requireAuth, async (req, res, next) => {
  try {
    if (
      !req.session.clubId ||
      !viewers.includes(normalizeSessionRole(req.session.role))
    ) {
      res.status(403).json({ error: "Non autorizzato ai registri membri." });
      return;
    }
    await ensureMemberStorage();
    next();
  } catch (e) {
    next(e);
  }
});
const finance = (req: Request) => {
  if (!canFinance(req))
    throw new MemberError(
      403,
      "Compensi e contratti sono riservati a Presidente, DG e Segreteria.",
    );
};
async function member(
  club: number,
  user: number,
  reader: Pick<typeof db, "execute"> = db,
) {
  if (!validId(user)) throw new MemberError(400, "Membro non valido.");
  const rows = await reader.execute(
    sql`SELECT user_id FROM club_memberships WHERE club_id=${club} AND user_id=${user} AND role<>'parent'`,
  );
  if (!rows.rows.length)
    throw new MemberError(404, "Membro non trovato nella società.");
}
async function members(club: number, reader: Pick<typeof db, "execute"> = db) {
  const { rows } = await reader.execute<{
    id: number;
    name: string;
    email: string;
    phone: string | null;
    roles: string[];
    sections: string[];
    teamIds: number[];
  }>(sql`
    SELECT u.id,concat_ws(' ',u.last_name,u.first_name) AS name,u.email,max(m.phone) AS phone,
      array_agg(DISTINCT CASE WHEN m.staff_role IN ('collaboratore','stagista') THEN 'collaborator' ELSE m.role END) AS roles,
      ARRAY(SELECT DISTINCT unnest(mm.club_section) FROM club_memberships mm WHERE mm.club_id=${club} AND mm.user_id=u.id) AS sections,
      ARRAY(SELECT DISTINCT a.team_id FROM team_staff_assignments a WHERE a.club_id=${club} AND a.user_id=u.id
        UNION SELECT id FROM teams WHERE club_id=${club} AND coach_id=u.id) AS "teamIds"
    FROM users u JOIN club_memberships m ON m.user_id=u.id AND m.club_id=${club} AND m.role<>'parent' GROUP BY u.id ORDER BY lower(u.last_name),lower(u.first_name),u.id`);
  const contracts = (
    await reader.execute<{ user_id: number; data: MemberContract }>(
      sql`SELECT user_id,data FROM member_contracts WHERE club_id=${club}`,
    )
  ).rows;
  const today = trainingLocalDate().slice(0, 7);
  return rows.map((m) => {
    const active = contracts
      .filter(
        (c) =>
          c.user_id === m.id &&
          c.data.active &&
          c.data.fromMonth <= today &&
          c.data.toMonth >= today,
      )
      .map((c) => c.data);
    return {
      ...m,
      roles: [...new Set([...m.roles, ...active.map((c) => c.role)])],
      teamIds: [
        ...new Set([
          ...m.teamIds,
          ...active.flatMap((c) => c.allocations.map((a) => a.teamId)),
        ]),
      ],
      duties: contracts
        .filter((c) => c.user_id === m.id)
        .map((c) => ({
          id: c.data.id,
          title: c.data.title,
          role: c.data.role,
          fromMonth: c.data.fromMonth,
          toMonth: c.data.toMonth,
          active: c.data.active,
          teamIds: c.data.allocations.map((a) => a.teamId),
        })),
    };
  });
}
router.get(
  "/member-services",
  handle(async (req, res) => {
    const club = req.session.clubId!;
    const [list, teams, seasons] = await Promise.all([
      members(club),
      db.execute(
        sql`SELECT id,name,club_section AS section,season_id AS "seasonId" FROM teams WHERE club_id=${club} ORDER BY name`,
      ),
      db.execute(
        sql`SELECT id,name,start_date AS "startDate",end_date AS "endDate",is_active AS "isActive" FROM seasons WHERE club_id=${club} ORDER BY start_date DESC`,
      ),
    ]);
    res.json({
      members: list,
      teams: teams.rows,
      seasons: seasons.rows,
      canFinance: canFinance(req),
      canManageKit: normalizeSessionRole(req.session.role) === "secretary",
    });
  }),
);
router.get(
  "/member-services/expenses",
  handle(async (req, res) => {
    finance(req);
    const club = req.session.clubId!;
    const { rows: dues } =
      await db.execute(sql`SELECT d.id,d.user_id AS "userId",d.contract_id AS "contractId",d.month,d.due_date AS "dueDate",d.amount_cents AS "amountCents",d.details,
    concat_ws(' ',u.last_name,u.first_name) AS name,coalesce(sum(r.amount_cents),0)::integer AS "paidCents"
    FROM member_dues d JOIN users u ON u.id=d.user_id LEFT JOIN member_expense_receipts r ON r.due_id=d.id AND r.club_id=d.club_id
    WHERE d.club_id=${club} AND NOT d.canceled GROUP BY d.id,u.id ORDER BY d.due_date,d.id`);
    const { rows: receipts } =
      await db.execute(sql`SELECT r.id,r.due_id AS "dueId",r.amount_cents AS "amountCents",r.paid_date AS "paidDate",r.method,r.document_id AS "documentId",r.notes,d.user_id AS "userId",d.details,d.month,concat_ws(' ',u.last_name,u.first_name) AS name
    FROM member_expense_receipts r JOIN member_dues d ON d.id=r.due_id AND d.club_id=r.club_id JOIN users u ON u.id=d.user_id WHERE r.club_id=${club} ORDER BY r.paid_date DESC,r.created_at DESC`);
    res.json({ dues, receipts });
  }),
);
router.get(
  "/member-services/:userId/profile",
  handle(async (req, res) => {
    const { club, user } = ids(req);
    await member(club, user);
    const person = (await members(club)).find((m) => m.id === user)!;
    const profile = (
      await db.execute(
        sql`SELECT revision,medical_from AS "medicalFrom",medical_until AS "medicalUntil",medical_document_id AS "medicalDocumentId",notes FROM member_profiles WHERE club_id=${club} AND user_id=${user}`,
      )
    ).rows[0] ?? {
      revision: 0,
      medicalFrom: null,
      medicalUntil: null,
      medicalDocumentId: null,
      notes: "",
    };
    const documents = (
      await db.execute(
        sql`SELECT id,kind,file_name AS "fileName",file_type AS "fileType",created_at AS "createdAt" FROM member_documents WHERE club_id=${club} AND user_id=${user} AND (${canFinance(req)} OR kind='medical') ORDER BY created_at DESC`,
      )
    ).rows;
    const contracts = canFinance(req)
      ? (
          await db.execute<{ data: MemberContract }>(
            sql`SELECT data FROM member_contracts WHERE club_id=${club} AND user_id=${user} ORDER BY data->>'fromMonth',id`,
          )
        ).rows.map((r) => r.data)
      : [];
    res.json({
      person,
      profile,
      documents,
      contracts,
      canFinance: canFinance(req),
      kitSlots: memberKitSlots(person.roles),
    });
  }),
);
router.put(
  "/member-services/:userId/profile",
  handle(async (req, res) => {
    finance(req);
    const { club, user, actor } = ids(req);
    const data = z
      .object({
        revision: z.number().int().min(0),
        medicalFrom: memberDate.nullable(),
        medicalUntil: memberDate.nullable(),
        medicalDocumentId: z.number().int().positive().nullable(),
        notes: z.string().max(3000),
      })
      .parse(req.body);
    if (
      data.medicalFrom &&
      data.medicalUntil &&
      data.medicalUntil < data.medicalFrom
    )
      throw new MemberError(
        400,
        "La scadenza del certificato precede il rilascio.",
      );
    await db.transaction(async (tx) => {
      await lockMember(tx, club, user);
      const old = (
        await tx.execute<{ revision: number }>(
          sql`SELECT * FROM member_profiles WHERE club_id=${club} AND user_id=${user} FOR UPDATE`,
        )
      ).rows[0];
      if ((old?.revision ?? 0) !== data.revision)
        throw new MemberError(
          409,
          "La scheda è stata aggiornata. Ricarica prima di salvare.",
        );
      if (data.medicalDocumentId)
        await ownDocument(tx, club, user, data.medicalDocumentId, "medical");
      await tx.execute(sql`INSERT INTO member_profiles(club_id,user_id,revision,medical_from,medical_until,medical_document_id,notes,updated_by) VALUES(${club},${user},${data.revision + 1},${data.medicalFrom},${data.medicalUntil},${data.medicalDocumentId},${data.notes},${actor})
      ON CONFLICT(club_id,user_id) DO UPDATE SET revision=excluded.revision,medical_from=excluded.medical_from,medical_until=excluded.medical_until,medical_document_id=excluded.medical_document_id,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now()`);
      await auditMember(tx, club, user, actor, "profile", old, data);
    });
    res.sendStatus(204);
  }),
);
async function ownDocument(
  tx: Pick<MemberTx, "execute">,
  club: number,
  user: number,
  id: number,
  kind: string,
) {
  const row = await tx.execute(
    sql`SELECT id FROM member_documents WHERE id=${id} AND club_id=${club} AND user_id=${user} AND kind=${kind}`,
  );
  if (!row.rows.length)
    throw new MemberError(
      400,
      "Documento non appartenente al membro o alla tipologia indicata.",
    );
}
router.post(
  "/member-services/:userId/documents",
  handle(async (req, res) => {
    finance(req);
    const { club, user, actor } = ids(req);
    await member(club, user);
    const kind = z
      .enum(["medical", "contract", "receipt"])
      .parse(req.body.kind);
    const parsed = parseDocumentUpload(req.body, 8 * 1024 * 1024);
    if (parsed.error !== undefined)
      throw new MemberError(parsed.status ?? 400, parsed.error);
    const f = parsed.attachment;
    const result = await db.execute(
      sql`INSERT INTO member_documents(club_id,user_id,kind,file_name,file_type,file_size,file_data,created_by) VALUES(${club},${user},${kind},${f.fileName},${f.fileType},${f.fileSize},${f.fileData},${actor}) RETURNING id`,
    );
    res.status(201).json(result.rows[0]);
  }),
);
router.get(
  "/member-services/:userId/documents/:documentId",
  handle(async (req, res) => {
    const { club, user } = ids(req);
    await member(club, user);
    const id = Number(req.params.documentId);
    if (!validId(id)) throw new MemberError(400, "Documento non valido.");
    const doc = (
      await db.execute<{ kind: string; fileData: string; fileName: string }>(
        sql`SELECT kind,file_name AS "fileName",file_type AS "fileType",file_data AS "fileData" FROM member_documents WHERE club_id=${club} AND user_id=${user} AND id=${id}`,
      )
    ).rows[0];
    if (!doc) throw new MemberError(404, "Documento non trovato.");
    if (doc.kind !== "medical") finance(req);
    res.setHeader("Cache-Control", "no-store");
    res.json(doc);
  }),
);

router.put(
  "/member-services/:userId/contracts/:contractId",
  handle(async (req, res) => {
    finance(req);
    const { club, user, actor } = ids(req),
      c = memberContractInput.parse(req.body);
    if (c.id !== req.params.contractId)
      throw new MemberError(400, "Incarico non valido.");
    const saved = await db.transaction(async (tx) => {
      await lockMember(tx, club, user);
      const old = (
        await tx.execute<{
          club_id: number;
          user_id: number;
          revision: number;
          data: MemberContract;
        }>(
          sql`SELECT club_id,user_id,revision,data FROM member_contracts WHERE id=${c.id} FOR UPDATE`,
        )
      ).rows[0];
      if (old && (old.club_id !== club || old.user_id !== user))
        throw new MemberError(404, "Incarico non trovato.");
      if ((old?.revision ?? 0) !== c.revision)
        throw new MemberError(
          409,
          "L’incarico è stato aggiornato da un altro utente. Ricarica.",
        );
      const season = (
        await tx.execute<{ start_date: string; end_date: string }>(
          sql`SELECT start_date,end_date FROM seasons WHERE id=${c.seasonId} AND club_id=${club}`,
        )
      ).rows[0];
      if (
        !season ||
        c.fromMonth < season.start_date.slice(0, 7) ||
        c.toMonth > season.end_date.slice(0, 7)
      )
        throw new MemberError(
          400,
          "Il periodo deve rientrare nella stagione selezionata.",
        );
      for (const allocation of c.allocations) {
        const team = await tx.execute(
          sql`SELECT id FROM teams WHERE id=${allocation.teamId} AND club_id=${club} AND season_id=${c.seasonId}`,
        );
        if (!team.rows.length)
          throw new MemberError(
            400,
            "Annata non appartenente alla stagione o alla società.",
          );
      }
      if (c.documentId)
        await ownDocument(tx, club, user, c.documentId, "contract");
      const next = { ...c, revision: c.revision + 1 };
      const installments = memberInstallments(c),
        generated = c.active ? installments : [];
      const previous = (
        await tx.execute<{
          id: number;
          month: string;
          amount_cents: number;
          due_date: string;
          details: any;
          paid: number;
        }>(
          sql`SELECT d.*,coalesce((SELECT sum(amount_cents)::integer FROM member_expense_receipts r WHERE r.due_id=d.id AND r.club_id=d.club_id),0) AS paid FROM member_dues d WHERE d.club_id=${club} AND d.contract_id=${c.id} FOR UPDATE`,
        )
      ).rows;
      for (const p of previous.filter((p) => p.paid > 0)) {
        const g = installments.find((g) => g.month === p.month);
        // Archiving keeps paid history; every economic edit of a paid installment is rejected.
        if (
          !g ||
          g.amountCents !== p.amount_cents ||
          g.compensationCents !== p.details.compensationCents ||
          g.reimbursementCents !== p.details.reimbursementCents ||
          g.dueDate !== p.due_date ||
          !isDeepStrictEqual(g.allocations, p.details.allocations) ||
          c.role !== p.details.role ||
          c.title !== p.details.title ||
          c.seasonId !== p.details.seasonId
        )
          throw new MemberError(
            409,
            "L’accordo modifica rate già pagate, anche parzialmente. Mantieni il periodo storico e crea un nuovo incarico dalla nuova decorrenza.",
          );
      }
      await tx.execute(
        sql`INSERT INTO member_contracts(id,club_id,user_id,revision,data,updated_by) VALUES(${c.id},${club},${user},${next.revision},${JSON.stringify(next)}::jsonb,${actor}) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_by=excluded.updated_by,updated_at=now()`,
      );
      for (const g of generated) {
        const prior = previous.find((p) => p.month === g.month);
        if (prior?.paid) continue;
        const details = {
          ...g,
          title: c.title,
          role: c.role,
          seasonId: c.seasonId,
          terms: c.terms,
          lastPaymentDate: c.lastPaymentDate,
        };
        await tx.execute(sql`INSERT INTO member_dues(club_id,user_id,contract_id,month,due_date,amount_cents,details) VALUES(${club},${user},${c.id},${g.month},${g.dueDate},${g.amountCents},${JSON.stringify(details)}::jsonb)
        ON CONFLICT(contract_id,month) DO UPDATE SET due_date=excluded.due_date,amount_cents=excluded.amount_cents,details=excluded.details,canceled=false`);
      }
      for (const prior of previous)
        if (!prior.paid && !generated.some((g) => g.month === prior.month))
          await tx.execute(
            sql`UPDATE member_dues SET canceled=true WHERE id=${prior.id} AND club_id=${club}`,
          );
      await auditMember(tx, club, user, actor, "contract", old?.data, next);
      return next;
    });
    res.json(saved);
  }),
);
router.post(
  "/member-services/expenses/:dueId/pay",
  handle(async (req, res) => {
    finance(req);
    const { club, actor } = ids(req),
      dueId = Number(req.params.dueId);
    if (!validId(dueId)) throw new MemberError(400, "Rata non valida.");
    const input = z
      .object({
        id: z.string().uuid(),
        amountCents: z.number().int().positive().max(100_000_000),
        paidDate: memberDate,
        method: z.enum(["cash", "card", "bank_transfer", "other"]),
        documentId: z.number().int().positive().nullable(),
        notes: z.string().max(1500),
      })
      .parse(req.body);
    if (input.paidDate > trainingLocalDate())
      throw new MemberError(
        400,
        "Un pagamento eseguito non può avere una data futura.",
      );
    await db.transaction(async (tx) => {
      const due = (
        await tx.execute<{
          user_id: number;
          amount_cents: number;
          canceled: boolean;
          details: any;
        }>(
          sql`SELECT * FROM member_dues WHERE club_id=${club} AND id=${dueId} FOR UPDATE`,
        )
      ).rows[0];
      if (!due || due.canceled) throw new MemberError(404, "Rata non trovata.");
      const old = (
        await tx.execute<any>(
          sql`SELECT * FROM member_expense_receipts WHERE id=${input.id}`,
        )
      ).rows[0];
      if (old) {
        if (
          old.club_id === club &&
          old.due_id === dueId &&
          old.amount_cents === input.amountCents &&
          old.paid_date === input.paidDate &&
          old.method === input.method &&
          old.document_id === input.documentId &&
          old.notes === input.notes
        )
          return;
        throw new MemberError(409, "Identificativo pagamento già utilizzato.");
      }
      const paid = Number(
        (
          await tx.execute<{ total: number }>(
            sql`SELECT coalesce(sum(amount_cents),0)::integer AS total FROM member_expense_receipts WHERE club_id=${club} AND due_id=${dueId}`,
          )
        ).rows[0].total,
      );
      if (input.amountCents > due.amount_cents - paid)
        throw new MemberError(
          409,
          "L’importo supera il residuo della rata. Ricarica prima di pagare.",
        );
      if (input.documentId)
        await ownDocument(tx, club, due.user_id, input.documentId, "receipt");
      if (due.details.reimbursementCents > 0 && !input.documentId)
        throw new MemberError(
          400,
          "Allega il giustificativo per una rata che comprende rimborsi.",
        );
      await tx.execute(
        sql`INSERT INTO member_expense_receipts(id,club_id,due_id,amount_cents,paid_date,method,document_id,notes,created_by) VALUES(${input.id},${club},${dueId},${input.amountCents},${input.paidDate},${input.method},${input.documentId},${input.notes},${actor})`,
      );
      await auditMember(
        tx,
        club,
        due.user_id,
        actor,
        "expense",
        { dueId, paidCents: paid },
        { ...input, dueId },
      );
    });
    res.sendStatus(204);
  }),
);

router.get(
  "/member-services/attendance",
  handle(async (req, res) => {
    const club = req.session.clubId!,
      from = memberDate.parse(req.query.from),
      through = memberDate.parse(req.query.through),
      teamId = req.query.teamId ? Number(req.query.teamId) : null;
    if (
      from > through ||
      new Date(through).getTime() - new Date(from).getTime() > 370 * 86400000
    )
      throw new MemberError(400, "Seleziona un periodo fino a un anno.");
    if (teamId && !validId(teamId))
      throw new MemberError(400, "Annata non valida.");
    const [people, training, games] = await Promise.all([
      members(club),
      db.execute<any>(
        sql`SELECT id,team_id AS "teamId",scheduled_at AS date,title,notes FROM training_sessions WHERE club_id=${club} AND (scheduled_at AT TIME ZONE 'Europe/Rome')::date BETWEEN ${from}::date AND ${through}::date AND coalesce(session_kind,'regular') NOT IN ('tipo') AND coalesce(status,'') NOT IN ('cancelled','canceled') AND coalesce(notes,'') NOT IN ('[FTB_AUTO_TRAINING] GROUPED','[FTB_AUTO_TRAINING] PROGRAM') ORDER BY scheduled_at,id`,
      ),
      db.execute<any>(
        sql`SELECT id,team_id AS "teamId",CASE WHEN is_postponed THEN reschedule_date ELSE date END AS date,opponent AS title,notes FROM matches WHERE club_id=${club} AND (CASE WHEN is_postponed THEN reschedule_date ELSE date END AT TIME ZONE 'Europe/Rome')::date BETWEEN ${from}::date AND ${through}::date ORDER BY date,id`,
      ),
    ]);
    const events = [
      ...training.rows.map((e) => ({ ...e, kind: "training" })),
      ...games.rows.map((e) => ({ ...e, kind: "match" })),
    ]
      .filter(
        (e) => !teamId || sessionTeamIds(e.teamId, e.notes).includes(teamId),
      )
      .map(({ notes, ...e }) => ({
        ...e,
        teamIds: sessionTeamIds(e.teamId, notes),
      }));
    const records = (
      await db.execute<any>(
        sql`SELECT user_id AS "userId",event_kind AS kind,event_id AS "eventId",status,notes,revision,roles FROM member_attendances WHERE club_id=${club}`,
      )
    ).rows.filter((r) =>
      events.some((e) => e.id === r.eventId && e.kind === r.kind),
    );
    const list = people.filter(
      (p) =>
        !teamId ||
        p.teamIds.includes(teamId) ||
        p.roles.some((r) =>
          [
            "director",
            "technical_director",
            "sporting_director",
            "presidente",
            "admin",
            "secretary",
          ].includes(r),
        ) ||
        records.some((r) => r.userId === p.id),
    );
    res.json({
      members: list,
      events,
      records: records.map((r) => ({
        ...r,
        status: r.status === "unrecorded" ? null : r.status,
      })),
    });
  }),
);
router.put(
  "/member-services/attendance",
  handle(async (req, res) => {
    const { club, actor } = ids(req),
      body = z
        .object({
          kind: z.enum(["training", "match"]),
          eventId: z.number().int().positive(),
          records: z
            .array(
              z.object({
                userId: z.number().int().positive(),
                status: z.enum(["present", "absent"]).nullable(),
                notes: z.string().max(1000),
                revision: z.number().int().min(0),
              }),
            )
            .max(500),
        })
        .parse(req.body);
    if (new Set(body.records.map((r) => r.userId)).size !== body.records.length)
      throw new MemberError(400, "Membro ripetuto nell’appello.");
    const people = await members(club);
    await db.transaction(async (tx) => {
      const table =
        body.kind === "training" ? sql`training_sessions` : sql`matches`;
      const event = await tx.execute(
        sql`SELECT id FROM ${table} WHERE club_id=${club} AND id=${body.eventId} FOR UPDATE`,
      );
      if (!event.rows.length) throw new MemberError(404, "Evento non trovato.");
      for (const r of body.records) {
        const p = people.find((p) => p.id === r.userId);
        if (!p)
          throw new MemberError(404, "Membro non appartenente alla società.");
        const old = (
          await tx.execute<any>(
            sql`SELECT * FROM member_attendances WHERE club_id=${club} AND user_id=${r.userId} AND event_kind=${body.kind} AND event_id=${body.eventId} FOR UPDATE`,
          )
        ).rows[0];
        if ((old?.revision ?? 0) !== r.revision)
          throw new MemberError(
            409,
            "L’appello è stato aggiornato. Ricarica prima di salvare.",
          );
        await tx.execute(
          sql`INSERT INTO member_attendances(club_id,user_id,event_kind,event_id,status,notes,roles,recorded_by,revision) VALUES(${club},${r.userId},${body.kind},${body.eventId},${r.status ?? "unrecorded"},${r.notes},${JSON.stringify(p.roles)}::jsonb,${actor},${r.revision + 1}) ON CONFLICT(club_id,user_id,event_kind,event_id) DO UPDATE SET status=excluded.status,notes=excluded.notes,roles=excluded.roles,recorded_by=excluded.recorded_by,revision=excluded.revision,updated_at=now()`,
        );
        await auditMember(tx, club, r.userId, actor, "attendance", old, {
          ...r,
          kind: body.kind,
          eventId: body.eventId,
        });
      }
    });
    res.sendStatus(204);
  }),
);
const kitEditor = (req: Request) => {
  if (normalizeSessionRole(req.session.role) !== "secretary")
    throw new MemberError(
      403,
      "La gestione della dotazione e del magazzino è riservata alla Segreteria.",
    );
};
async function kitPolicy(
  club: number,
  user: number,
  slot: string,
  reader: Pick<typeof db, "execute"> = db,
) {
  const person = (await members(club, reader)).find((p) => p.id === user);
  if (!person || !memberKitSlots(person.roles).some((s) => s.key === slot))
    throw new MemberError(
      403,
      "Voce KIT non prevista per i ruoli attivi del membro.",
    );
}
async function memberKitRequests(club: number, user?: number) {
  return (
    await db.execute(sql`SELECT r.id,r.user_id AS "userId",concat_ws(' ',u.last_name,u.first_name) AS name,r.slot,r.item_id AS "itemId",w.name AS "itemName",w.size,w.code,r.quantity,r.status,r.archived
  FROM member_kit_requests r JOIN users u ON u.id=r.user_id JOIN warehouse_items w ON w.id=r.item_id AND w.club_id=r.club_id WHERE r.club_id=${club} ${user ? sql`AND r.user_id=${user}` : sql``} ORDER BY r.id DESC`)
  ).rows;
}
router.get(
  "/member-services/kit-catalog",
  handle(async (req, res) => {
    await ensureWarehouseKitSchema();
    const club = req.session.clubId!;
    const data = (
      await db.execute(
        sql`SELECT id,name,code,size,category,notes,kit_slots AS "kitSlots",quantity_available AS "quantityAvailable",quantity_reserved AS "quantityReserved" FROM warehouse_items WHERE club_id=${club} AND section='apparel' AND is_active<>0 ORDER BY name,size,id`,
      )
    ).rows;
    res.json(data);
  }),
);
router.get(
  "/member-services/kit-requests",
  handle(async (req, res) => {
    res.json(await memberKitRequests(req.session.clubId!));
  }),
);
router.get(
  "/member-services/:userId/kit",
  handle(async (req, res) => {
    const { club, user } = ids(req);
    await member(club, user);
    const rows = (
      await db.execute(
        sql`SELECT k.slot,k.item_id AS "itemId",k.quantity,k.revision,w.name AS "itemName",w.size FROM member_kit_rows k JOIN warehouse_items w ON w.id=k.item_id AND w.club_id=k.club_id WHERE k.club_id=${club} AND k.user_id=${user} ORDER BY k.slot`,
      )
    ).rows;
    res.json({
      rows,
      requests: await memberKitRequests(club, user),
      canEdit: normalizeSessionRole(req.session.role) === "secretary",
    });
  }),
);
router.put(
  "/member-services/:userId/kit/:slot",
  handle(async (req, res) => {
    kitEditor(req);
    await ensureWarehouseKitSchema();
    const { club, user, actor } = ids(req),
      slot = String(req.params.slot);
    await kitPolicy(club, user, slot);
    const body = z
      .object({
        itemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(1000),
        revision: z.number().int().min(0),
      })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await lockMember(tx, club, user);
      await kitPolicy(club, user, slot, tx);
      const old = (
        await tx.execute<any>(
          sql`SELECT * FROM member_kit_rows WHERE club_id=${club} AND user_id=${user} AND slot=${slot} FOR UPDATE`,
        )
      ).rows[0];
      if ((old?.revision ?? 0) !== body.revision)
        throw new MemberError(
          409,
          "La dotazione è stata aggiornata. Ricarica.",
        );
      const item = (
        await tx.execute<any>(
          sql`SELECT id,name,category,notes,kit_slots AS "kitSlots" FROM warehouse_items WHERE club_id=${club} AND id=${body.itemId} AND section='apparel' AND is_active<>0 FOR UPDATE`,
        )
      ).rows[0];
      if (!item || !(item.kitSlots ?? suggestKitSlots(item)).includes(slot))
        throw new MemberError(
          400,
          "Scegli una variante collegata a questa voce KIT nel catalogo magazzino.",
        );
      const lines = (
        await tx.execute<any>(
          sql`SELECT status FROM member_kit_requests WHERE club_id=${club} AND user_id=${user} AND slot=${slot} AND NOT archived AND status<>'canceled'`,
        )
      ).rows;
      if (
        old &&
        (old.item_id !== body.itemId || old.quantity !== body.quantity)
      ) {
        if (lines.some((r) => r.status !== "delivered"))
          throw new MemberError(
            409,
            "Gestisci o annulla la richiesta aperta prima di cambiare articolo o quantità.",
          );
        await tx.execute(
          sql`UPDATE member_kit_requests SET archived=true WHERE club_id=${club} AND user_id=${user} AND slot=${slot} AND NOT archived`,
        );
      }
      await tx.execute(
        sql`INSERT INTO member_kit_rows(club_id,user_id,slot,item_id,quantity,revision) VALUES(${club},${user},${slot},${body.itemId},${body.quantity},${body.revision + 1}) ON CONFLICT(club_id,user_id,slot) DO UPDATE SET item_id=excluded.item_id,quantity=excluded.quantity,revision=excluded.revision`,
      );
      await auditMember(tx, club, user, actor, "kit-selection", old, {
        slot,
        ...body,
      });
    });
    res.sendStatus(204);
  }),
);
router.post(
  "/member-services/:userId/kit/:slot/request",
  handle(async (req, res) => {
    kitEditor(req);
    const { club, user, actor } = ids(req),
      slot = String(req.params.slot);
    await kitPolicy(club, user, slot);
    const body = z
      .object({ revision: z.number().int().positive() })
      .parse(req.body);
    await db.transaction(async (tx) => {
      await lockMember(tx, club, user);
      await kitPolicy(club, user, slot, tx);
      const row = (
        await tx.execute<any>(
          sql`SELECT * FROM member_kit_rows WHERE club_id=${club} AND user_id=${user} AND slot=${slot} FOR UPDATE`,
        )
      ).rows[0];
      if (!row || row.revision !== body.revision)
        throw new MemberError(
          409,
          "Salva e ricarica la voce KIT prima di richiederla.",
        );
      const existing = await tx.execute(
        sql`SELECT id FROM member_kit_requests WHERE club_id=${club} AND user_id=${user} AND slot=${slot} AND NOT archived AND status<>'canceled'`,
      );
      if (existing.rows.length) return;
      const item = (
        await tx.execute<any>(
          sql`SELECT quantity_available AS available,quantity_reserved AS reserved,is_active,section FROM warehouse_items WHERE club_id=${club} AND id=${row.item_id} FOR UPDATE`,
        )
      ).rows[0];
      if (!item || item.is_active === 0 || item.section !== "apparel")
        throw new MemberError(
          400,
          "Articolo non più disponibile nel catalogo.",
        );
      const reserved = Math.min(
        row.quantity,
        Math.max(0, item.available - item.reserved),
      );
      if (reserved)
        await tx.execute(
          sql`UPDATE warehouse_items SET quantity_reserved=quantity_reserved+${reserved},updated_at=now() WHERE club_id=${club} AND id=${row.item_id}`,
        );
      for (const line of [
        { status: "reserved", quantity: reserved },
        { status: "pending", quantity: row.quantity - reserved },
      ])
        if (line.quantity)
          await tx.execute(
            sql`INSERT INTO member_kit_requests(club_id,user_id,slot,item_id,quantity,status,created_by) VALUES(${club},${user},${slot},${row.item_id},${line.quantity},${line.status},${actor})`,
          );
      await auditMember(tx, club, user, actor, "kit-request", null, {
        slot,
        quantity: row.quantity,
        itemId: row.item_id,
      });
    });
    res.sendStatus(204);
  }),
);
router.post(
  "/member-services/:userId/kit/:slot/new-cycle",
  handle(async (req, res) => {
    kitEditor(req);
    const { club, user, actor } = ids(req),
      slot = String(req.params.slot);
    await kitPolicy(club, user, slot);
    await db.transaction(async (tx) => {
      await lockMember(tx, club, user);
      await kitPolicy(club, user, slot, tx);
      const lines = (
        await tx.execute<any>(
          sql`SELECT status FROM member_kit_requests WHERE club_id=${club} AND user_id=${user} AND slot=${slot} AND NOT archived AND status<>'canceled'`,
        )
      ).rows;
      if (lines.some((l) => l.status !== "delivered"))
        throw new MemberError(
          409,
          "Completa o annulla prima le richieste aperte.",
        );
      await tx.execute(
        sql`UPDATE member_kit_requests SET archived=true WHERE club_id=${club} AND user_id=${user} AND slot=${slot} AND NOT archived`,
      );
      await auditMember(tx, club, user, actor, "kit-new-cycle", null, { slot });
    });
    res.sendStatus(204);
  }),
);
router.patch(
  "/member-services/kit-requests/:requestId",
  handle(async (req, res) => {
    kitEditor(req);
    const { club, actor } = ids(req),
      id = Number(req.params.requestId),
      next = z
        .enum(["ordered", "arrived", "delivered", "canceled"])
        .parse(req.body.status);
    if (!validId(id)) throw new MemberError(400, "Richiesta non valida.");
    const transitions: Record<string, string[]> = {
      ordered: ["pending"],
      arrived: ["ordered"],
      delivered: ["reserved", "arrived"],
      canceled: ["pending", "reserved", "ordered", "arrived"],
    };
    await db.transaction(async (tx) => {
      const owner = (
        await tx.execute<any>(
          sql`SELECT user_id FROM member_kit_requests WHERE id=${id} AND club_id=${club}`,
        )
      ).rows[0];
      if (!owner) throw new MemberError(404, "Richiesta non trovata.");
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${club},${owner.user_id})`,
      );
      const line = (
        await tx.execute<any>(
          sql`SELECT * FROM member_kit_requests WHERE id=${id} AND club_id=${club} FOR UPDATE`,
        )
      ).rows[0];
      if (line.status === next) return;
      if (line.archived || !transitions[next].includes(line.status))
        throw new MemberError(409, "La richiesta è già stata aggiornata.");
      if (next !== "canceled")
        await kitPolicy(club, line.user_id, line.slot, tx);
      const delta =
        next === "arrived"
          ? line.quantity
          : next === "delivered"
            ? -line.quantity
            : 0;
      if (delta) {
        const stock = await tx.execute(
          sql`UPDATE warehouse_items SET quantity_available=quantity_available+${delta},quantity_reserved=quantity_reserved+${delta},updated_at=now() WHERE id=${line.item_id} AND club_id=${club} AND quantity_available+${delta}>=0 AND quantity_reserved+${delta}>=0 RETURNING id`,
        );
        if (!stock.rows.length)
          throw new MemberError(
            409,
            "Giacenza o riserva non sufficiente per la consegna.",
          );
      }
      if (
        next === "canceled" &&
        ["reserved", "arrived"].includes(line.status)
      ) {
        const released = await tx.execute(
          sql`UPDATE warehouse_items SET quantity_reserved=quantity_reserved-${line.quantity},updated_at=now() WHERE id=${line.item_id} AND club_id=${club} AND quantity_reserved>=${line.quantity} RETURNING id`,
        );
        if (!released.rows.length)
          throw new MemberError(
            409,
            "Riserva non coerente: verifica il magazzino prima di annullare.",
          );
      }
      await tx.execute(
        sql`UPDATE member_kit_requests SET status=${next},updated_at=now() WHERE id=${id} AND club_id=${club}`,
      );
      await auditMember(tx, club, line.user_id, actor, "kit-status", line, {
        id,
        status: next,
      });
    });
    res.sendStatus(204);
  }),
);
export default router;
