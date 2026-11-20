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
  trainingLocalDate,
  type MemberContract,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { normalizeSessionRole } from "../lib/club-scope";
import {
  ensurePlayerFinanceStorage,
  lockPlayerFinance,
  PlayerFinanceError,
  auditPlayerFinance,
  type PlayerFinanceTx,
} from "../lib/player-finance-storage";
import { parseDocumentUpload } from "../lib/document-upload";

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
      e instanceof PlayerFinanceError
        ? res.status(e.status).json({ error: e.message })
        : e instanceof z.ZodError
          ? res
              .status(400)
              .json({ error: e.issues.map((i) => i.message).join(" · ") })
          : next(e),
    );
router.use("/player-finance", requireAuth, async (req, res, next) => {
  try {
    if (
      !req.session.clubId ||
      !viewers.includes(normalizeSessionRole(req.session.role))
    ) {
      res.status(403).json({ error: "Non autorizzato ai registri membri." });
      return;
    }
    await ensurePlayerFinanceStorage();
    next();
  } catch (e) {
    next(e);
  }
});
const finance = (req: Request) => {
  if (!canFinance(req))
    throw new PlayerFinanceError(
      403,
      "Compensi e contratti sono riservati a Presidente, DG e Segreteria.",
    );
};
async function member(
  club: number,
  user: number,
  reader: Pick<typeof db, "execute"> = db,
) {
  if (!validId(user))
    throw new PlayerFinanceError(400, "Giocatore non valido.");
  if (
    !(
      await reader.execute(
        sql`SELECT id FROM players WHERE club_id=${club} AND id=${user} AND club_section='prima_squadra'`,
      )
    ).rows.length
  )
    throw new PlayerFinanceError(404, "Giocatore Prima Squadra non trovato.");
}
async function members(club: number, reader: Pick<typeof db, "execute"> = db) {
  return (
    await reader.execute<any>(
      sql`SELECT id,concat_ws(' ',last_name,first_name) AS name,coalesce(email,'') AS email,phone,ARRAY['player']::text[] AS roles,ARRAY['prima_squadra']::text[] AS sections,ARRAY[team_id] AS "teamIds",'[]'::jsonb AS duties FROM players WHERE club_id=${club} AND club_section='prima_squadra'`,
    )
  ).rows;
}
router.get(
  "/player-finance",
  handle(async (req, res) => {
    const club = req.session.clubId!;
    const [list, teams, seasons] = await Promise.all([
      members(club),
      db.execute(
        sql`SELECT id,name,club_section AS section,coalesce(season_id,(SELECT id FROM seasons WHERE club_id=${club} AND is_active ORDER BY start_date DESC,id DESC LIMIT 1)) AS "seasonId" FROM teams WHERE club_id=${club} AND club_section='prima_squadra' ORDER BY name`,
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
  "/player-finance/expenses",
  handle(async (req, res) => {
    finance(req);
    const club = req.session.clubId!;
    const { rows: dues } =
      await db.execute(sql`SELECT d.id,d.player_id AS "userId",d.contract_id AS "contractId",d.month,d.due_date AS "dueDate",d.amount_cents AS "amountCents",d.details,
    concat_ws(' ',u.last_name,u.first_name) AS name,coalesce(sum(r.amount_cents),0)::integer AS "paidCents"
    FROM player_finance_dues d JOIN players u ON u.id=d.player_id LEFT JOIN player_finance_expense_receipts r ON r.due_id=d.id AND r.club_id=d.club_id
    WHERE d.club_id=${club} AND NOT d.canceled AND (NOT u.is_test OR u.id=${Number(req.query.playerId) || 0}) GROUP BY d.id,u.id ORDER BY d.due_date,d.id`);
    const { rows: receipts } =
      await db.execute(sql`SELECT r.id,r.due_id AS "dueId",r.amount_cents AS "amountCents",r.paid_date AS "paidDate",r.method,r.document_id AS "documentId",r.notes,d.player_id AS "userId",d.details,d.month,concat_ws(' ',u.last_name,u.first_name) AS name
    FROM player_finance_expense_receipts r JOIN player_finance_dues d ON d.id=r.due_id AND d.club_id=r.club_id JOIN players u ON u.id=d.player_id WHERE r.club_id=${club} AND (NOT u.is_test OR u.id=${Number(req.query.playerId) || 0}) ORDER BY r.paid_date DESC,r.created_at DESC`);
    res.json({ dues, receipts });
  }),
);
router.get(
  "/player-finance/:userId/profile",
  handle(async (req, res) => {
    const { club, user } = ids(req);
    await member(club, user);
    const person = (await members(club)).find((m) => m.id === user)!;
    const profile = (
      await db.execute(
        sql`SELECT revision,medical_from AS "medicalFrom",medical_until AS "medicalUntil",medical_document_id AS "medicalDocumentId",notes FROM player_finance_profiles WHERE club_id=${club} AND player_id=${user}`,
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
        sql`SELECT id,kind,file_name AS "fileName",file_type AS "fileType",created_at AS "createdAt" FROM player_finance_documents WHERE club_id=${club} AND player_id=${user} AND (${canFinance(req)} OR kind='medical') ORDER BY created_at DESC`,
      )
    ).rows;
    const contracts = canFinance(req)
      ? (
          await db.execute<{ data: MemberContract }>(
            sql`SELECT data FROM player_finance_contracts WHERE club_id=${club} AND player_id=${user} ORDER BY data->>'fromMonth',id`,
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
  "/player-finance/:userId/profile",
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
      throw new PlayerFinanceError(
        400,
        "La scadenza del certificato precede il rilascio.",
      );
    await db.transaction(async (tx) => {
      await lockPlayerFinance(tx, club, user);
      const old = (
        await tx.execute<{ revision: number }>(
          sql`SELECT * FROM player_finance_profiles WHERE club_id=${club} AND player_id=${user} FOR UPDATE`,
        )
      ).rows[0];
      if ((old?.revision ?? 0) !== data.revision)
        throw new PlayerFinanceError(
          409,
          "La scheda è stata aggiornata. Ricarica prima di salvare.",
        );
      if (data.medicalDocumentId)
        await ownDocument(tx, club, user, data.medicalDocumentId, "medical");
      await tx.execute(sql`INSERT INTO player_finance_profiles(club_id,player_id,revision,medical_from,medical_until,medical_document_id,notes,updated_by) VALUES(${club},${user},${data.revision + 1},${data.medicalFrom},${data.medicalUntil},${data.medicalDocumentId},${data.notes},${actor})
      ON CONFLICT(club_id,player_id) DO UPDATE SET revision=excluded.revision,medical_from=excluded.medical_from,medical_until=excluded.medical_until,medical_document_id=excluded.medical_document_id,notes=excluded.notes,updated_by=excluded.updated_by,updated_at=now()`);
      await auditPlayerFinance(tx, club, user, actor, "profile", old, data);
    });
    res.sendStatus(204);
  }),
);
async function ownDocument(
  tx: Pick<PlayerFinanceTx, "execute">,
  club: number,
  user: number,
  id: number,
  kind: string,
) {
  const row = await tx.execute(
    sql`SELECT id FROM player_finance_documents WHERE id=${id} AND club_id=${club} AND player_id=${user} AND kind=${kind}`,
  );
  if (!row.rows.length)
    throw new PlayerFinanceError(
      400,
      "Documento non appartenente al membro o alla tipologia indicata.",
    );
}
router.post(
  "/player-finance/:userId/documents",
  handle(async (req, res) => {
    finance(req);
    const { club, user, actor } = ids(req);
    await member(club, user);
    const kind = z
      .enum(["medical", "contract", "receipt"])
      .parse(req.body.kind);
    const parsed = parseDocumentUpload(req.body, 8 * 1024 * 1024);
    if (parsed.error !== undefined)
      throw new PlayerFinanceError(parsed.status ?? 400, parsed.error);
    const f = parsed.attachment;
    const result = await db.execute(
      sql`INSERT INTO player_finance_documents(club_id,player_id,kind,file_name,file_type,file_size,file_data,created_by) VALUES(${club},${user},${kind},${f.fileName},${f.fileType},${f.fileSize},${f.fileData},${actor}) RETURNING id`,
    );
    res.status(201).json(result.rows[0]);
  }),
);
router.get(
  "/player-finance/:userId/documents/:documentId",
  handle(async (req, res) => {
    const { club, user } = ids(req);
    await member(club, user);
    const id = Number(req.params.documentId);
    if (!validId(id))
      throw new PlayerFinanceError(400, "Documento non valido.");
    const doc = (
      await db.execute<{ kind: string; fileData: string; fileName: string }>(
        sql`SELECT kind,file_name AS "fileName",file_type AS "fileType",file_data AS "fileData" FROM player_finance_documents WHERE club_id=${club} AND player_id=${user} AND id=${id}`,
      )
    ).rows[0];
    if (!doc) throw new PlayerFinanceError(404, "Documento non trovato.");
    if (doc.kind !== "medical") finance(req);
    res.setHeader("Cache-Control", "no-store");
    res.json(doc);
  }),
);

router.put(
  "/player-finance/:userId/contracts/:contractId",
  handle(async (req, res) => {
    finance(req);
    const { club, user, actor } = ids(req),
      c = memberContractInput.parse(req.body);
    await member(club, user);
    if (c.role !== "player")
      throw new PlayerFinanceError(400, "Seleziona Giocatore Prima Squadra.");
    if (c.id !== req.params.contractId)
      throw new PlayerFinanceError(400, "Incarico non valido.");
    const saved = await db.transaction(async (tx) => {
      await lockPlayerFinance(tx, club, user);
      const old = (
        await tx.execute<{
          club_id: number;
          player_id: number;
          revision: number;
          data: MemberContract;
        }>(
          sql`SELECT club_id,player_id,revision,data FROM player_finance_contracts WHERE id=${c.id} FOR UPDATE`,
        )
      ).rows[0];
      if (old && (old.club_id !== club || old.player_id !== user))
        throw new PlayerFinanceError(404, "Incarico non trovato.");
      if ((old?.revision ?? 0) !== c.revision)
        throw new PlayerFinanceError(
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
        throw new PlayerFinanceError(
          400,
          "Il periodo deve rientrare nella stagione selezionata.",
        );
      for (const allocation of c.allocations) {
        const team = await tx.execute(
          sql`SELECT id FROM teams WHERE id=${allocation.teamId} AND club_id=${club} AND club_section='prima_squadra' AND (season_id=${c.seasonId} OR (season_id IS NULL AND ${c.seasonId}=(SELECT id FROM seasons WHERE club_id=${club} AND is_active ORDER BY start_date DESC,id DESC LIMIT 1)))`,
        );
        if (!team.rows.length)
          throw new PlayerFinanceError(
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
          sql`SELECT d.*,coalesce((SELECT sum(amount_cents)::integer FROM player_finance_expense_receipts r WHERE r.due_id=d.id AND r.club_id=d.club_id),0) AS paid FROM player_finance_dues d WHERE d.club_id=${club} AND d.contract_id=${c.id} FOR UPDATE`,
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
          throw new PlayerFinanceError(
            409,
            "L’accordo modifica rate già pagate, anche parzialmente. Mantieni il periodo storico e crea un nuovo incarico dalla nuova decorrenza.",
          );
      }
      await tx.execute(
        sql`INSERT INTO player_finance_contracts(id,club_id,player_id,revision,data,updated_by) VALUES(${c.id},${club},${user},${next.revision},${JSON.stringify(next)}::jsonb,${actor}) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_by=excluded.updated_by,updated_at=now()`,
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
        await tx.execute(sql`INSERT INTO player_finance_dues(club_id,player_id,contract_id,month,due_date,amount_cents,details) VALUES(${club},${user},${c.id},${g.month},${g.dueDate},${g.amountCents},${JSON.stringify(details)}::jsonb)
        ON CONFLICT(contract_id,month) DO UPDATE SET due_date=excluded.due_date,amount_cents=excluded.amount_cents,details=excluded.details,canceled=false`);
      }
      for (const prior of previous)
        if (!prior.paid && !generated.some((g) => g.month === prior.month))
          await tx.execute(
            sql`UPDATE player_finance_dues SET canceled=true WHERE id=${prior.id} AND club_id=${club}`,
          );
      await auditPlayerFinance(
        tx,
        club,
        user,
        actor,
        "contract",
        old?.data,
        next,
      );
      return next;
    });
    res.json(saved);
  }),
);
router.post(
  "/player-finance/expenses/:dueId/pay",
  handle(async (req, res) => {
    finance(req);
    const { club, actor } = ids(req),
      dueId = Number(req.params.dueId);
    if (!validId(dueId)) throw new PlayerFinanceError(400, "Rata non valida.");
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
      throw new PlayerFinanceError(
        400,
        "Un pagamento eseguito non può avere una data futura.",
      );
    await db.transaction(async (tx) => {
      const due = (
        await tx.execute<{
          player_id: number;
          amount_cents: number;
          canceled: boolean;
          details: any;
        }>(
          sql`SELECT * FROM player_finance_dues WHERE club_id=${club} AND id=${dueId} FOR UPDATE`,
        )
      ).rows[0];
      if (!due || due.canceled)
        throw new PlayerFinanceError(404, "Rata non trovata.");
      const old = (
        await tx.execute<any>(
          sql`SELECT * FROM player_finance_expense_receipts WHERE id=${input.id}`,
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
        throw new PlayerFinanceError(
          409,
          "Identificativo pagamento già utilizzato.",
        );
      }
      const paid = Number(
        (
          await tx.execute<{ total: number }>(
            sql`SELECT coalesce(sum(amount_cents),0)::integer AS total FROM player_finance_expense_receipts WHERE club_id=${club} AND due_id=${dueId}`,
          )
        ).rows[0].total,
      );
      if (input.amountCents > due.amount_cents - paid)
        throw new PlayerFinanceError(
          409,
          "L’importo supera il residuo della rata. Ricarica prima di pagare.",
        );
      if (input.documentId)
        await ownDocument(tx, club, due.player_id, input.documentId, "receipt");
      if (due.details.reimbursementCents > 0 && !input.documentId)
        throw new PlayerFinanceError(
          400,
          "Allega il giustificativo per una rata che comprende rimborsi.",
        );
      await tx.execute(
        sql`INSERT INTO player_finance_expense_receipts(id,club_id,due_id,amount_cents,paid_date,method,document_id,notes,created_by) VALUES(${input.id},${club},${dueId},${input.amountCents},${input.paidDate},${input.method},${input.documentId},${input.notes},${actor})`,
      );
      await auditPlayerFinance(
        tx,
        club,
        due.player_id,
        actor,
        "expense",
        { dueId, paidCents: paid },
        { ...input, dueId },
      );
    });
    res.sendStatus(204);
  }),
);

export default router;
