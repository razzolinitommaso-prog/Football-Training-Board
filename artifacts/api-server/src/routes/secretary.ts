import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  registrationsTable,
  playerPaymentsTable,
  playerDocumentsTable,
  equipmentAssignmentsTable,
  playersTable,
  platformAnnouncementsTable,
  trainingSessionsTable,
  matchesTable,
  teamsTable,
  seasonsTable,
  clubNotificationsTable,
  clubNotificationReadsTable,
  clubSecretarySharedFilesTable,
  warehouseItemsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, asc, getTableColumns, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { extraTimeCatalog, extraTimeShareCents } from "@workspace/api-zod";
import { ensureExtraTimeStorage } from "../lib/extra-time-storage";
import { reconcilePaymentAvailability } from "../lib/payment-availability";
import { normalizeSessionRole, resolveAllowedClubSections } from "../lib/club-scope";
import { calendarStaffMessage, encodeCalendarCommunication, readCalendarAudience } from "../lib/parent-calendar-communication";

import {
  advanceKitRequest, cleanKitSlots, ensureWarehouseKitSchema, KitRequestError,
  listKitRequests, lockKitPlayer, requestKitRow, validateKitLinks,
} from "../lib/warehouse-kit";

const router: IRouter = Router();

const PAYMENT_VIEW_ROLES = new Set(["admin", "presidente", "director", "secretary"]);
const PAYMENT_EDIT_ROLES = new Set(["secretary"]);
const WAREHOUSE_VIEW_ROLES = new Set(["admin", "presidente", "director", "secretary", "sporting_director"]);
const WAREHOUSE_EDIT_ROLES = new Set(["secretary"]);
let ensuredClubNotificationTargetColumns = false;

async function ensureClubNotificationTargetColumns() {
  if (ensuredClubNotificationTargetColumns) return;
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_audience TEXT NOT NULL DEFAULT 'all'`);
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_roles JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await db.execute(sql`ALTER TABLE club_notifications ADD COLUMN IF NOT EXISTS target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  ensuredClubNotificationTargetColumns = true;
}

const STAFF_NOTIFICATION_ROLES = new Set([
  "admin",
  "presidente",
  "director",
  "secretary",
  "sporting_director",
  "technical_director",
  "coach",
  "fitness_coach",
  "athletic_director",
]);

function notificationVisibleToUser(
  notification: typeof clubNotificationsTable.$inferSelect,
  userId: number,
  role?: string | null,
) {
  if (notification.createdByUserId === userId) return true;
  const normalizedRole = normalizeSessionRole(role);
  const row = notification as typeof notification & { targetAudience?: string | null; targetRoles?: unknown; targetUserIds?: unknown };
  const targetUserIds = Array.isArray(row.targetUserIds)
    ? row.targetUserIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id))
    : [];
  const targetRoles = Array.isArray(row.targetRoles)
    ? row.targetRoles.map((item: unknown) => normalizeSessionRole(String(item)))
    : [];

  if (targetUserIds.length > 0) return targetUserIds.includes(userId);
  if (targetRoles.length > 0) return targetRoles.includes(normalizedRole);
  if (row.targetAudience === "staff") return STAFF_NOTIFICATION_ROLES.has(normalizedRole);
  if (row.targetAudience === "parents") return false;

  return true;
}

function canViewFinancials(role?: string | null): boolean {
  return PAYMENT_VIEW_ROLES.has(normalizeSessionRole(role));
}

function canEditFinancials(role?: string | null): boolean {
  return PAYMENT_EDIT_ROLES.has(normalizeSessionRole(role));
}

function canViewWarehouse(role?: string | null): boolean {
  return WAREHOUSE_VIEW_ROLES.has(normalizeSessionRole(role));
}

function canEditWarehouse(role?: string | null): boolean {
  return WAREHOUSE_EDIT_ROLES.has(normalizeSessionRole(role));
}

function cleanNumber(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function cleanPrice(value: unknown) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function warehouseSlugPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
}

function makeWarehouseCode(section: string, name: string, category?: string | null, size?: string | null) {
  const prefix = section === "field" ? "CAMPO" : "ABB";
  return [prefix, warehouseSlugPart(category || name), warehouseSlugPart(size || "")]
    .filter(Boolean)
    .join("-");
}

function makeWarehouseItemType(section: string, itemType: unknown, name: string, category?: string | null) {
  const explicit = itemType ? String(itemType).trim() : "";
  if (["registration_fee", "annual_fee", "insurance_fee", "shuttle_fee", "kit", "inventory"].includes(explicit)) return explicit;
  const label = `${category ?? ""} ${name}`.toLowerCase();
  if (label.includes("assicur")) return "insurance_fee";
  if (label.includes("pulmino")) return "shuttle_fee";
  if (label.includes("quota") || label.includes("annuale") || label.includes("iscrizione")) return "annual_fee";
  return section === "apparel" && label.includes("kit") ? "kit" : "inventory";
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureClubNotificationUserState(notificationId: number, userId: number, trashed: boolean) {
  const [existing] = await db
    .select()
    .from(clubNotificationReadsTable)
    .where(and(
      eq(clubNotificationReadsTable.notificationId, notificationId),
      eq(clubNotificationReadsTable.userId, userId),
    ))
    .limit(1);

  const nextState = {
    isTrashed: trashed,
    trashedAt: trashed ? new Date() : null,
  };

  if (existing) {
    await db
      .update(clubNotificationReadsTable)
      .set(nextState)
      .where(eq(clubNotificationReadsTable.id, existing.id));
    return;
  }

  await db.insert(clubNotificationReadsTable).values({
    notificationId,
    userId,
    ...nextState,
  });
}

async function withPlayerName<T extends { playerId: number; clubId: number }>(records: T[]) {
  return Promise.all(records.map(async (r) => {
    const [player] = await db.select().from(playersTable).where(and(eq(playersTable.id, r.playerId), eq(playersTable.clubId, r.clubId)));
    return { ...r, playerName: player ? `${player.firstName} ${player.lastName}` : null };
  }));
}

async function getScopedPlayerIds(req: Request, clubId: number): Promise<number[] | null> {
  const sections = await resolveAllowedClubSections(req, typeof req.query.section === "string" ? req.query.section : undefined);
  if (!sections) return null;
  if (sections.length === 0) return [];
  const rows = await db.select({ id: playersTable.id }).from(playersTable)
    .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.clubSection, sections)));
  return rows.map(r => r.id);
}

router.get("/registrations", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(registrationsTable.clubId, clubId);
  const scopedPlayerIds = await getScopedPlayerIds(req, clubId);
  if (scopedPlayerIds) {
    const ids = scopedPlayerIds;
    where = ids.length > 0
      ? and(eq(registrationsTable.clubId, clubId), inArray(registrationsTable.playerId, ids))
      : and(eq(registrationsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(registrationsTable).where(where).orderBy(desc(registrationsTable.createdAt));
  res.json(await withPlayerName(records));
});

router.post("/registrations", requireAuth, async (req, res): Promise<void> => {
  const { playerId, seasonId, status, registrationDate, notes } = req.body;
  if (!playerId) { res.status(400).json({ error: "playerId required" }); return; }
  const [record] = await db.insert(registrationsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), seasonId: seasonId ?? null,
    status: status ?? "pending", registrationDate: registrationDate ?? null, notes: notes ?? null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/registrations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, registrationDate, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (registrationDate !== undefined) updates.registrationDate = registrationDate;
  if (notes !== undefined) updates.notes = notes;
  const [record] = await db.update(registrationsTable).set(updates)
    .where(and(eq(registrationsTable.id, id), eq(registrationsTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.delete("/registrations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(registrationsTable).where(and(eq(registrationsTable.id, id), eq(registrationsTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

router.get("/player-payments", requireAuth, async (req, res): Promise<void> => {
  if (!canViewFinancials(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato a vedere i pagamenti" });
    return;
  }
  const clubId = req.session.clubId!;
  let where: any = eq(playerPaymentsTable.clubId, clubId);
  const scopedPlayerIds = await getScopedPlayerIds(req, clubId);
  if (scopedPlayerIds) {
    const ids = scopedPlayerIds;
    where = ids.length > 0
      ? and(eq(playerPaymentsTable.clubId, clubId), inArray(playerPaymentsTable.playerId, ids))
      : and(eq(playerPaymentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select({
    ...getTableColumns(playerPaymentsTable),
    playerName: sql<string | null>`${playersTable.firstName} || ' ' || ${playersTable.lastName}`,
    teamId: teamsTable.id,
    teamName: teamsTable.name,
    teamSeason: seasonsTable.name,
  }).from(playerPaymentsTable)
    .leftJoin(playersTable, and(eq(playersTable.id, playerPaymentsTable.playerId), eq(playersTable.clubId, playerPaymentsTable.clubId)))
    .leftJoin(teamsTable, and(eq(teamsTable.id, playersTable.teamId), eq(teamsTable.clubId, playerPaymentsTable.clubId)))
    .leftJoin(seasonsTable, and(eq(seasonsTable.id, teamsTable.seasonId), eq(seasonsTable.clubId, playerPaymentsTable.clubId)))
    .where(where).orderBy(desc(playerPaymentsTable.createdAt));
  res.json(records);
});

const receiptMethods = new Set(["cash", "card", "bank_transfer"]);

function validReceiptMethod(value: unknown): value is string {
  return typeof value === "string" && receiptMethods.has(value);
}

router.post("/player-payments", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare quote e rate" });
    return;
  }
  const { playerId, amount, dueDate, status, paymentDate, description, paymentType, installmentNumber, totalInstallments, annualFeeTotal, availabilityBlocking, paymentMethod } = req.body;
  if (!playerId || amount == null) { res.status(400).json({ error: "playerId and amount required" }); return; }
  if (status === "paid" && !validReceiptMethod(paymentMethod)) {
    res.status(400).json({ error: "Indica il metodo di incasso." });
    return;
  }
  const clubId = req.session.clubId!;
  const [player] = await db.select({ id: playersTable.id }).from(playersTable)
    .where(and(eq(playersTable.id, Number(playerId)), eq(playersTable.clubId, clubId))).limit(1);
  if (!player) { res.status(404).json({ error: "Giocatore non trovato." }); return; }
  const paidDate = status === "paid" ? paymentDate || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }) : null;
  if (paidDate !== null && !isPaymentPlanDate(paidDate)) {
    res.status(400).json({ error: "Data di incasso non valida." });
    return;
  }
  const [record] = await db.insert(playerPaymentsTable).values({
    clubId, playerId: player.id, amount: Number(amount),
    dueDate: dueDate ?? null, status: status ?? "pending", description: description ?? null,
    paymentDate: paidDate,
    paymentType: paymentType ?? "annual_fee_installment",
    installmentNumber: installmentNumber ? Number(installmentNumber) : null,
    totalInstallments: totalInstallments ? Number(totalInstallments) : null,
    annualFeeTotal: annualFeeTotal != null ? Number(annualFeeTotal) : null,
    availabilityBlocking: availabilityBlocking === 0 || availabilityBlocking === false ? 0 : 1,
    paymentMethod: status === "paid" ? paymentMethod : null,
  }).returning();
  await reconcilePaymentAvailability(clubId, player.id, undefined, status === "paid");
  res.status(201).json(record);
});

const paymentPlanTypes = new Set([
  "registration_fee", "annual_fee", "annual_fee_installment", "insurance_fee", "shuttle_monthly",
  "kit_payment", "player_total_installment",
]);
const depositPurposes = new Set(["Generale", "Iscrizione", "Quota annuale", "Assicurazione", "Kit", "Pulmino", "Extra Time"]);

function paymentPlanCents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 20000
    ? Math.round(value * 100) : Number.NaN;
}

function isPaymentPlanDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

type ExtraTimeMovement = { amount: number; status: "paid" | "pending"; date: string; method?: string };
type ExtraTimeParticipant = { playerId: number; movements: ExtraTimeMovement[] };
type PaymentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function validExtraTimeMovement(movement: ExtraTimeMovement) {
  return movement && paymentPlanCents(movement.amount) > 0 && isPaymentPlanDate(movement.date) &&
    ["paid", "pending"].includes(movement.status) && (movement.status !== "paid" || validReceiptMethod(movement.method));
}

async function insertExtraTimeMovements(tx: PaymentTransaction, clubId: number, playerId: number, participantId: number, name: string, movements: ExtraTimeMovement[]) {
  if (!movements.length) return;
  const payments = await tx.insert(playerPaymentsTable).values(movements.map(movement => ({
    clubId, playerId, amount: paymentPlanCents(movement.amount) / 100,
    paymentType: "extra_time_fee", status: movement.status, description: `Extra Time · ${name}`,
    dueDate: movement.status === "pending" ? movement.date : null,
    paymentDate: movement.status === "paid" ? movement.date : null,
    paymentMethod: movement.status === "paid" ? movement.method : null,
  }))).returning({ id: playerPaymentsTable.id });
  await tx.execute(sql`
    INSERT INTO extra_time_receipts (participant_id, payment_id)
    VALUES ${sql.join(payments.map(payment => sql`(${participantId}, ${payment.id})`), sql`, `)}
  `);
}

router.get("/extra-time", requireAuth, async (req, res): Promise<void> => {
  if (!canViewFinancials(req.session.role)) { res.sendStatus(403); return; }
  const clubId = req.session.clubId!;
  const scope = await getScopedPlayerIds(req, clubId);
  const playerId = req.query.playerId === undefined ? undefined : Number(req.query.playerId);
  if (playerId !== undefined && (!Number.isSafeInteger(playerId) || playerId <= 0)) { res.sendStatus(400); return; }
  if (scope?.length === 0) { res.json([]); return; }
  const scoped = scope ? sql`AND p.id IN (${sql.join(scope.map(id => sql`${id}`), sql`, `)})` : sql``;
  const player = playerId === undefined ? sql`` : sql`AND p.id = ${playerId}`;
  await ensureExtraTimeStorage();
  const result = await db.execute(sql`
    SELECT e.id, e.formula, e.agreement, e.created_at AS "createdAt", a.id AS "participantId",
      p.id AS "playerId", concat_ws(' ', p.first_name, p.last_name) AS "playerName", t.name AS "teamName",
      a.share_cents AS "shareCents",
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'amount', m.amount, 'status', m.status, 'paymentDate', m.payment_date,
        'dueDate', m.due_date, 'paymentMethod', m.payment_method
      ) ORDER BY coalesce(m.payment_date, m.due_date), m.id)
      FROM extra_time_receipts r JOIN player_payments m ON m.id = r.payment_id AND m.club_id = e.club_id AND m.player_id = p.id
      WHERE r.participant_id = a.id), '[]'::jsonb) AS movements
    FROM extra_time_packages e JOIN extra_time_participants a ON a.package_id = e.id
    JOIN players p ON p.id = a.player_id AND p.club_id = e.club_id
    LEFT JOIN teams t ON t.id = p.team_id AND t.club_id = e.club_id
    WHERE e.club_id = ${clubId} ${scoped} ${player}
    ORDER BY e.created_at DESC, e.id DESC, a.id
  `);
  res.json(result.rows);
});

router.post("/extra-time", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) { res.sendStatus(403); return; }
  const clubId = req.session.clubId!;
  const formula = extraTimeCatalog.find(item => item.id === req.body?.formula);
  const participants: ExtraTimeParticipant[] = req.body?.participants;
  const agreement = typeof req.body?.agreement === "string" ? req.body.agreement.trim() : "";
  if (!formula || !Array.isArray(participants) || participants.length < formula.min || participants.length > formula.max ||
      agreement.length > 1000 || participants.some((participant, index) =>
        !participant || !Number.isSafeInteger(participant.playerId) || participant.playerId <= 0 ||
        !Array.isArray(participant.movements) || participant.movements.length > 120 ||
        !participant.movements.every(validExtraTimeMovement) ||
        participant.movements.reduce((sum, movement) => sum + paymentPlanCents(movement.amount), 0) >
          extraTimeShareCents(formula.cents, participants.length, index)) ||
      new Set(participants.map(participant => participant.playerId)).size !== participants.length) {
    res.status(400).json({ error: "Controlla pacchetto, partecipanti, importi, date e metodi di incasso." });
    return;
  }
  const ids = participants.map(participant => participant.playerId);
  const scope = await getScopedPlayerIds(req, clubId);
  if (scope && ids.some(id => !scope.includes(id))) { res.sendStatus(403); return; }
  await ensureExtraTimeStorage();
  const packageId = await db.transaction(async tx => {
    const players = await tx.select({ id: playersTable.id }).from(playersTable)
      .where(and(eq(playersTable.clubId, clubId), inArray(playersTable.id, ids), sql`${playersTable.status} <> 'training_trial'`))
      .orderBy(asc(playersTable.id)).for("update");
    if (players.length !== ids.length) return null;
    const pkg = await tx.execute(sql`
      INSERT INTO extra_time_packages (club_id, formula, agreement) VALUES (${clubId}, ${formula.id}, ${agreement}) RETURNING id
    `);
    const id = Number(pkg.rows[0].id);
    for (const [index, participant] of participants.entries()) {
      const share = extraTimeShareCents(formula.cents, ids.length, index);
      const member = await tx.execute(sql`
        INSERT INTO extra_time_participants (package_id, player_id, share_cents) VALUES (${id}, ${participant.playerId}, ${share}) RETURNING id
      `);
      await insertExtraTimeMovements(tx, clubId, participant.playerId, Number(member.rows[0].id), formula.name, participant.movements);
    }
    return id;
  });
  if (packageId === null) { res.status(404).json({ error: "Uno o più giocatori non appartengono alla società." }); return; }
  for (const id of ids) await reconcilePaymentAvailability(clubId, id);
  res.status(201).json({ id: packageId });
});

router.post("/extra-time/participants/:id/movements", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) { res.sendStatus(403); return; }
  const id = Number(req.params.id);
  const clubId = req.session.clubId!;
  const movement: ExtraTimeMovement = req.body;
  const existingPaymentId = req.body?.paymentId;
  const linking = existingPaymentId !== undefined;
  if (!Number.isSafeInteger(id) || id <= 0 || (linking
    ? !Number.isSafeInteger(existingPaymentId) || existingPaymentId <= 0
    : !validExtraTimeMovement(movement))) {
    res.status(400).json({ error: "Controlla importo, data e metodo di incasso." });
    return;
  }
  const scope = await getScopedPlayerIds(req, clubId);
  await ensureExtraTimeStorage();
  const result = await db.transaction(async tx => {
    const { rows: [participant] } = await tx.execute(sql`
      SELECT a.player_id, a.share_cents, e.formula FROM extra_time_participants a
      JOIN extra_time_packages e ON e.id = a.package_id
      WHERE a.id = ${id} AND e.club_id = ${clubId} FOR UPDATE OF a
    `);
    if (!participant || (scope && !scope.includes(Number(participant.player_id)))) return null;
    const { rows: [balance] } = await tx.execute(sql`
      SELECT coalesce(sum(round(m.amount::numeric * 100)), 0) AS booked
      FROM extra_time_receipts r JOIN player_payments m ON m.id = r.payment_id
      WHERE r.participant_id = ${id} AND m.club_id = ${clubId} AND m.player_id = ${Number(participant.player_id)}
    `);
    if (linking) {
      const [existing] = await tx.select().from(playerPaymentsTable).where(and(
        eq(playerPaymentsTable.id, existingPaymentId), eq(playerPaymentsTable.clubId, clubId),
        eq(playerPaymentsTable.playerId, Number(participant.player_id)), eq(playerPaymentsTable.status, "paid"),
      )).for("update");
      const existingCents = paymentPlanCents(existing?.amount);
      if (!existing || !["player_total_deposit", "player_total_installment", "other", "extra_time_fee"].includes(existing.paymentType) ||
          !(existingCents > 0) || Number(balance.booked) + existingCents > Number(participant.share_cents)) return false;
      const attached = await tx.execute(sql`
        INSERT INTO extra_time_receipts (participant_id, payment_id) VALUES (${id}, ${existing.id})
        ON CONFLICT (payment_id) DO NOTHING RETURNING payment_id
      `);
      return attached.rows.length ? Number(participant.player_id) : false;
    }
    if (Number(balance.booked) + paymentPlanCents(movement.amount) > Number(participant.share_cents)) return false;
    const name = extraTimeCatalog.find(item => item.id === participant.formula)?.name ?? "Pacchetto";
    await insertExtraTimeMovements(tx, clubId, Number(participant.player_id), id, name, [movement]);
    return Number(participant.player_id);
  });
  if (result === null) { res.sendStatus(404); return; }
  if (result === false) {
    res.status(409).json({ error: linking ? "Movimento non collegabile o importo superiore al residuo." :
      "L’importo supera il residuo ancora da registrare. Per incassare una rata, selezionala nei movimenti." });
    return;
  }
  await reconcilePaymentAvailability(clubId, result);
  res.sendStatus(204);
});

router.post("/player-payment-plan", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria può modificare quote e rate." });
    return;
  }
  const playerId = Number(req.body.playerId);
  const clubId = req.session.clubId!;
  const scopedPlayers = await getScopedPlayerIds(req, clubId);
  if (!Number.isSafeInteger(playerId) || playerId <= 0 || playerId > 2147483647 || (scopedPlayers && !scopedPlayers.includes(playerId))) {
    res.status(404).json({ error: "Giocatore non trovato." });
    return;
  }
  const total = paymentPlanCents(req.body.total);
  const alreadyPaid = paymentPlanCents(req.body.alreadyPaid);
  const upfront = paymentPlanCents(req.body.upfront);
  const deposits: { amount: number; purpose: string; paymentMethod: string; paymentDate: string }[] = req.body.deposits === undefined
    ? (upfront > 0 ? [{ amount: upfront / 100, purpose: "Generale", paymentMethod: req.body.paymentMethod, paymentDate: todayDateOnly() }] : [])
    : req.body.deposits;
  if (!Array.isArray(deposits) || deposits.length > 120 ||
      deposits.some(deposit => !deposit || !(paymentPlanCents(deposit.amount) > 0) ||
        !depositPurposes.has(deposit.purpose) || !validReceiptMethod(deposit.paymentMethod) || !isPaymentPlanDate(deposit.paymentDate)) ||
      deposits.reduce((sum, deposit) => sum + paymentPlanCents(deposit.amount), 0) !== upfront) {
    res.status(400).json({ error: "Controlla importi, voci, date e metodi di incasso dei versamenti." });
    return;
  }
  const { replaceTypes, installments, expectedPayments } = req.body;
  if (!(total > 0 && alreadyPaid >= 0 && upfront >= 0 && alreadyPaid + upfront <= total) ||
      !Array.isArray(replaceTypes) || !replaceTypes.includes("player_total_installment") ||
      replaceTypes.some((type) => !paymentPlanTypes.has(type)) ||
      !Array.isArray(installments) || installments.length > 120 ||
      installments.some((draft) => !draft || !(paymentPlanCents(draft.amount) > 0) || !isPaymentPlanDate(draft.dueDate) ||
        (draft.purpose !== undefined && draft.purpose !== "Iscrizione" && draft.purpose !== "Assicurazione")) ||
      installments.reduce((sum, draft) => sum + paymentPlanCents(draft.amount), 0) !== total - alreadyPaid - upfront ||
      !Array.isArray(expectedPayments) || expectedPayments.some((row) => !row || !Number.isSafeInteger(row.id))) {
    res.status(400).json({ error: "Importi o scadenze del piano non validi." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [player] = await tx.select({ id: playersTable.id }).from(playersTable)
      .where(and(eq(playersTable.id, playerId), eq(playersTable.clubId, clubId))).for("update");
    if (!player) return "missing";
    const scope = and(eq(playerPaymentsTable.playerId, playerId), eq(playerPaymentsTable.clubId, clubId));
    const current = await tx.select().from(playerPaymentsTable).where(scope).for("update");
    const expected = new Map<number, { status: string; amount: number; dueDate?: string | null }>(expectedPayments.map((row) => [row.id, row]));
    if (expectedPayments.length !== current.length || expected.size !== current.length || current.some((row) => {
      const snapshot = expected.get(row.id);
      return !snapshot || snapshot.status !== row.status ||
        Math.round(Number(snapshot.amount) * 100) !== Math.round(row.amount * 100) ||
        (snapshot.dueDate !== undefined && snapshot.dueDate !== row.dueDate);
    })) return "changed";

    const eligiblePaid = current.reduce((sum, row) =>
      row.status === "paid" && (replaceTypes.includes(row.paymentType) || row.paymentType === "player_total_deposit")
        ? sum + Math.round(row.amount * 100) : sum, 0);
    if (eligiblePaid < alreadyPaid) return "changed";

    const pendingIds = current.filter((row) => row.status !== "paid" && replaceTypes.includes(row.paymentType)).map((row) => row.id);
    if (pendingIds.length) await tx.delete(playerPaymentsTable).where(and(scope, inArray(playerPaymentsTable.id, pendingIds)));
    const shared = { clubId, playerId, annualFeeTotal: total / 100, availabilityBlocking: 1 };
    const rows: (typeof playerPaymentsTable.$inferInsert)[] = installments.map((draft, index) => ({
      ...shared,
      amount: paymentPlanCents(draft.amount) / 100,
      dueDate: draft.dueDate,
      status: "pending",
      description: draft.purpose ? `Piano totale - rata ${index + 1}/${installments.length} - ${draft.purpose}`
        : `Piano totale - rata ${index + 1}/${installments.length}`,
      paymentType: "player_total_installment",
      installmentNumber: index + 1,
      totalInstallments: installments.length,
    }));
    for (const deposit of deposits) {
      rows.push({ ...shared, amount: paymentPlanCents(deposit.amount) / 100, dueDate: deposit.paymentDate, paymentDate: deposit.paymentDate,
        paymentMethod: deposit.paymentMethod, status: "paid", paymentType: "player_total_deposit",
        description: deposit.purpose === "Generale" ? "Piano totale - acconto" : `Piano totale - acconto - ${deposit.purpose}` });
    }
    if (rows.length) await tx.insert(playerPaymentsTable).values(rows);
    return "saved";
  });
  if (result === "missing") { res.status(404).json({ error: "Giocatore non trovato." }); return; }
  if (result === "changed") { res.status(409).json({ error: "I pagamenti sono cambiati. Rivedi il totale e riprova." }); return; }
  await reconcilePaymentAvailability(clubId, playerId, undefined, deposits.length > 0);
  res.sendStatus(204);
});

router.patch("/player-payments/:id/due-date", requireAuth, async (req, res): Promise<void> => {
  if (!["secretary", "presidente"].includes(normalizeSessionRole(req.session.role))) { res.sendStatus(403); return; }
  const id = Number(req.params.id);
  const { dueDate } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id <= 0 || !isPaymentPlanDate(dueDate)) {
    res.status(400).json({ error: "Indica una scadenza valida." }); return;
  }
  const clubId = req.session.clubId!;
  const scope = await getScopedPlayerIds(req, clubId);
  if (scope?.length === 0) { res.sendStatus(404); return; }
  const [record] = await db.update(playerPaymentsTable).set({ dueDate, status: "pending" }).where(and(
    eq(playerPaymentsTable.id, id), eq(playerPaymentsTable.clubId, clubId),
    sql`${playerPaymentsTable.status} <> 'paid'`, scope ? inArray(playerPaymentsTable.playerId, scope) : undefined,
  )).returning();
  if (!record) { res.status(409).json({ error: "La rata non è più modificabile." }); return; }
  await reconcilePaymentAvailability(clubId, record.playerId, undefined, true);
  res.json(record);
});

router.post("/player-payments/settle", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) { res.sendStatus(403); return; }
  const { playerId, ids, paymentDate, paymentMethod } = req.body ?? {};
  if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Array.isArray(ids) || ids.length === 0 || ids.length > 120 ||
      new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0) ||
      !isPaymentPlanDate(paymentDate) || !validReceiptMethod(paymentMethod)) {
    res.status(400).json({ error: "Controlla rate, data e metodo d’incasso." }); return;
  }
  const clubId = req.session.clubId!;
  const scope = await getScopedPlayerIds(req, clubId);
  if (scope && !scope.includes(playerId)) { res.sendStatus(403); return; }
  const count = await db.transaction(async tx => {
    const condition = and(eq(playerPaymentsTable.clubId, clubId), eq(playerPaymentsTable.playerId, playerId),
      inArray(playerPaymentsTable.id, ids), sql`${playerPaymentsTable.status} <> 'paid' AND ${playerPaymentsTable.amount} > 0`);
    const rows = await tx.select({ id: playerPaymentsTable.id }).from(playerPaymentsTable).where(condition)
      .orderBy(asc(playerPaymentsTable.id)).for("update");
    if (rows.length !== ids.length) return 0;
    const updated = await tx.update(playerPaymentsTable).set({ status: "paid", paymentDate, paymentMethod })
      .where(condition).returning({ id: playerPaymentsTable.id });
    return updated.length;
  });
  if (!count) { res.status(409).json({ error: "Le rate sono cambiate. Aggiorna il riepilogo e riprova." }); return; }
  await reconcilePaymentAvailability(clubId, playerId, undefined, true);
  res.sendStatus(204);
});

router.patch("/player-payments/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare quote e rate" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { status, paymentDate, amount, description, dueDate, paymentType, installmentNumber, totalInstallments, annualFeeTotal, availabilityBlocking, paymentMethod } = req.body;
  if (status === "paid" && (!validReceiptMethod(paymentMethod) || !isPaymentPlanDate(paymentDate))) {
    res.status(400).json({ error: "Indica data e metodo di incasso validi." });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (status !== undefined) updates.paymentDate = status === "paid" ? paymentDate : null;
  else if (paymentDate !== undefined) updates.paymentDate = paymentDate;
  if (amount !== undefined) updates.amount = Number(amount);
  if (description !== undefined) updates.description = description;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (paymentType !== undefined) updates.paymentType = paymentType;
  if (installmentNumber !== undefined) updates.installmentNumber = installmentNumber != null ? Number(installmentNumber) : null;
  if (totalInstallments !== undefined) updates.totalInstallments = totalInstallments != null ? Number(totalInstallments) : null;
  if (annualFeeTotal !== undefined) updates.annualFeeTotal = annualFeeTotal != null ? Number(annualFeeTotal) : null;
  if (availabilityBlocking !== undefined) updates.availabilityBlocking = availabilityBlocking === 0 || availabilityBlocking === false ? 0 : 1;
  if (status !== undefined) updates.paymentMethod = status === "paid" ? paymentMethod : null;
  const [record] = await db.update(playerPaymentsTable).set(updates)
    .where(and(eq(playerPaymentsTable.id, id), eq(playerPaymentsTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  await reconcilePaymentAvailability(req.session.clubId!, record.playerId, undefined, status === "paid");
  res.json(record);
});

router.delete("/player-payments/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditFinancials(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare quote e rate" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const clubId = req.session.clubId!;
  const [deleted] = await db.delete(playerPaymentsTable).where(and(eq(playerPaymentsTable.id, id), eq(playerPaymentsTable.clubId, clubId)))
    .returning({ playerId: playerPaymentsTable.playerId });
  if (deleted) await reconcilePaymentAvailability(clubId, deleted.playerId);
  res.sendStatus(204);
});

router.get("/player-documents", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(playerDocumentsTable.clubId, clubId);
  const scopedPlayerIds = await getScopedPlayerIds(req, clubId);
  if (scopedPlayerIds) {
    const ids = scopedPlayerIds;
    where = ids.length > 0
      ? and(eq(playerDocumentsTable.clubId, clubId), inArray(playerDocumentsTable.playerId, ids))
      : and(eq(playerDocumentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(playerDocumentsTable).where(where).orderBy(desc(playerDocumentsTable.createdAt));
  res.json(await withPlayerName(records));
});

router.post("/player-documents", requireAuth, async (req, res): Promise<void> => {
  const { playerId, type, validFrom, expiryDate, notes, fileName, fileType, fileSize, fileData } = req.body;
  if (!playerId || !type) { res.status(400).json({ error: "playerId and type required" }); return; }
  let safeFileName: string | null = null;
  let safeFileType: string | null = null;
  let safeFileSize: number | null = null;
  let safeFileData: string | null = null;
  if (fileData || fileName) {
    if (!fileName || !fileData) {
      res.status(400).json({ error: "fileName e fileData sono obbligatori per allegare un file" });
      return;
    }
    const mime = String(fileType ?? "application/octet-stream").slice(0, 200);
    if (!/^(application\/pdf|image\/jpeg|image\/png|image\/webp|image\/heic|image\/heif)$/i.test(mime)) {
      res.status(400).json({ error: "Formato file non consentito" });
      return;
    }
    const { base64 } = parseBase64Payload(String(fileData));
    if (!base64) {
      res.status(400).json({ error: "Contenuto file non valido" });
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(base64, "base64");
    } catch {
      res.status(400).json({ error: "Contenuto file non valido" });
      return;
    }
    if (buf.length > 8 * 1024 * 1024) {
      res.status(413).json({ error: "File troppo grande: massimo 8MB" });
      return;
    }
    safeFileName = String(fileName).replace(/[/\\]/g, "_").slice(0, 255);
    safeFileType = mime;
    safeFileSize = Number.isFinite(Number(fileSize)) ? Number(fileSize) : buf.length;
    safeFileData = String(fileData).startsWith("data:") ? String(fileData) : `data:${mime};base64,${base64}`;
  }
  const [record] = await db.insert(playerDocumentsTable).values({
    clubId: req.session.clubId!, playerId: Number(playerId), type,
    validFrom: validFrom ?? null,
    expiryDate: expiryDate ?? null,
    fileName: safeFileName,
    fileType: safeFileType,
    fileSize: safeFileSize,
    fileData: safeFileData,
    notes: notes ?? null,
  } as any).returning();
  res.status(201).json(record);
});

router.delete("/player-documents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(playerDocumentsTable).where(and(eq(playerDocumentsTable.id, id), eq(playerDocumentsTable.clubId, req.session.clubId!)));
  res.sendStatus(204);
});

const feeTypes = ["registration_fee", "insurance_fee", "annual_fee"] as const;
type FeeType = typeof feeTypes[number];
type FeeInput = { id?: number; code: string; name: string; itemType: FeeType; price: number; isActive?: boolean };
const feeFields = {
  id: warehouseItemsTable.id, code: warehouseItemsTable.code, name: warehouseItemsTable.name,
  itemType: warehouseItemsTable.itemType, price: warehouseItemsTable.price, isActive: warehouseItemsTable.isActive,
};
const feeScope = (clubId: number) => and(eq(warehouseItemsTable.clubId, clubId), inArray(warehouseItemsTable.itemType, feeTypes));
const feeKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
class FeeListError extends Error {}

function parseFeeInput(value: unknown): FeeInput {
  if (!value || typeof value !== "object") throw new FeeListError("Riga non valida.");
  const { id, code, name, itemType, price, isActive } = value as Record<string, unknown>;
  if (id !== undefined && (typeof id !== "number" || !Number.isInteger(id) || id < 1)) throw new FeeListError("Identificativo non valido.");
  if (typeof name !== "string" || !name.trim() || name.trim().length > 150) throw new FeeListError("Indica un nome tra 1 e 150 caratteri.");
  if (code !== undefined && (typeof code !== "string" || code.trim().length > 80)) throw new FeeListError("Il codice può avere fino a 80 caratteri.");
  if (itemType !== "registration_fee" && itemType !== "insurance_fee" && itemType !== "annual_fee") {
    throw new FeeListError("Indica Iscrizione, Assicurazione o Quota annuale come tipo di quota.");
  }
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 20000 || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
    throw new FeeListError("Indica un importo tra 0,01 e 20.000 euro, con al massimo due decimali.");
  }
  if (isActive !== undefined && typeof isActive !== "boolean") throw new FeeListError("Lo stato deve essere attivo o inattivo.");
  return { id, name: name.trim(), code: typeof code === "string" ? code.trim() : "", itemType, price, isActive };
}

router.get("/fee-list", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !canViewWarehouse(role)) { res.sendStatus(403); return; }
  const items = await db.select(feeFields).from(warehouseItemsTable).where(feeScope(clubId))
    .orderBy(asc(warehouseItemsTable.itemType), asc(warehouseItemsTable.name), asc(warehouseItemsTable.id));
  res.json({
    items: items.map(item => ({ ...item, price: item.price == null ? null : Number(item.price.toFixed(2)) })),
    canEdit: canEditWarehouse(role),
  });
});

router.post("/fee-list", requireAuth, async (req, res): Promise<void> => {
  const { clubId, role } = req.session;
  if (!clubId || !canEditWarehouse(role)) { res.sendStatus(403); return; }
  const createOnly = req.body?.createOnly === true;
  const rawRows: unknown = req.body?.rows;
  if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > 500) {
    res.status(400).json({ error: "Il listino deve contenere da 1 a 500 righe." }); return;
  }
  try {
    const rows = rawRows.map((row, index) => {
      try { return parseFeeInput(row); }
      catch (error) { if (error instanceof FeeListError) throw new FeeListError("Voce " + (index + 1) + ": " + error.message); throw error; }
    });
    if (createOnly && (rows.length !== 1 || rows[0].id !== undefined)) throw new FeeListError("Inserisci una nuova quota alla volta.");
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('fee-list'), ${clubId})`);
      const existing = await tx.select(feeFields).from(warehouseItemsTable).where(feeScope(clubId)).for("update");
      const processed = new Set<number>();
      let created = 0;
      let updated = 0;
      for (const row of rows) {
        const matches = existing.filter(item => row.id !== undefined ? item.id === row.id : item.itemType === row.itemType &&
          (row.code ? feeKey(item.code) === feeKey(row.code) : feeKey(item.name) === feeKey(row.name)));
        const match = matches[0];
        if (row.id !== undefined && !match) throw new FeeListError("La voce selezionata non è disponibile.");
        if (matches.length > 1) throw new FeeListError("Più voci corrispondono a «" + row.name + "». Modifica le voci singolarmente e assegna codici distinti.");
        if (createOnly && match) throw new FeeListError("Questa quota esiste già. Aprila dal listino per modificarla.");
        const generatedCode = "QUOTA-" + feeKey(row.name).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 72);
        const code = row.code || match?.code || generatedCode;
        const codeConflict = existing.some(item => item.id !== match?.id && item.itemType === row.itemType && feeKey(item.code) === feeKey(code));
        if (codeConflict) throw new FeeListError("Il codice «" + code + "» è già usato per questo tipo di quota.");
        const changes = { code, name: row.name, itemType: row.itemType, price: row.price,
          isActive: row.isActive === undefined ? match?.isActive ?? 1 : Number(row.isActive) };
        if (match) {
          if (processed.has(match.id)) throw new FeeListError("La voce «" + row.name + "» è ripetuta nel file.");
          await tx.update(warehouseItemsTable).set(changes).where(and(feeScope(clubId), eq(warehouseItemsTable.id, match.id)));
          Object.assign(match, changes);
          processed.add(match.id);
          updated++;
        } else {
          const [item] = await tx.insert(warehouseItemsTable).values({ ...changes, clubId, section: "fees" }).returning(feeFields);
          existing.push(item);
          processed.add(item.id);
          created++;
        }
      }
      return { created, updated };
    });
    res.json(result);
  } catch (error) {
    if (error instanceof FeeListError) { res.status(400).json({ error: error.message }); return; }
    throw error;
  }
});

router.get("/warehouse-items", requireAuth, async (req, res): Promise<void> => {
  if (!canViewWarehouse(req.session.role)) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  await ensureWarehouseKitSchema();
  const section = String(req.query.section ?? "");
  const clubId = req.session.clubId!;
  const where = section && section !== "all"
    ? and(eq(warehouseItemsTable.clubId, clubId), eq(warehouseItemsTable.section, section))
    : eq(warehouseItemsTable.clubId, clubId);
  const records = await db.select().from(warehouseItemsTable).where(where).orderBy(asc(warehouseItemsTable.name), asc(warehouseItemsTable.size));
  res.json(records);
});

router.post("/warehouse-items", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare il magazzino" });
    return;
  }
  await ensureWarehouseKitSchema();
  const { section, code, name, itemType, price, isActive, category, size, quantityAvailable, quantityReserved, reorderThreshold, supplier, notes } = req.body;
  const cleanSection = section === "field" ? "field" : "apparel";
  const cleanCategory = category ? String(category).trim() : null;
  const cleanSize = size ? String(size).trim() : null;
  const cleanName = String(name ?? cleanCategory ?? "").trim();
  if (!cleanName) { res.status(400).json({ error: "Nome articolo richiesto" }); return; }
  const cleanCode = String(code ?? "").trim() || makeWarehouseCode(cleanSection, cleanName, cleanCategory, cleanSize);
  let kitSlots: string[] | null = null;
  if (cleanSection === "apparel" && req.body.kitSlots !== undefined) {
    try { kitSlots = cleanKitSlots(req.body.kitSlots); }
    catch (error) { if (sendKitError(res, error)) return; throw error; }
  }
  const [record] = await db.insert(warehouseItemsTable).values({
    clubId: req.session.clubId!,
    section: cleanSection,
    kitSlots,
    code: cleanCode,
    name: cleanName,
    itemType: makeWarehouseItemType(cleanSection, itemType, cleanName, cleanCategory),
    price: cleanPrice(price),
    isActive: isActive === 0 || isActive === false ? 0 : 1,
    category: cleanCategory,
    size: cleanSize,
    quantityAvailable: cleanNumber(quantityAvailable),
    quantityReserved: cleanNumber(quantityReserved),
    reorderThreshold: cleanNumber(reorderThreshold),
    supplier: supplier ? String(supplier).trim() : null,
    notes: notes ? String(notes).trim() : null,
  }).returning();
  res.status(201).json(record);
});

router.patch("/warehouse-items/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare il magazzino" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await ensureWarehouseKitSchema();
  const updates: Record<string, unknown> = {};
  if (req.body.kitSlots !== undefined) {
    try { updates.kitSlots = cleanKitSlots(req.body.kitSlots); }
    catch (error) { if (sendKitError(res, error)) return; throw error; }
  }
  for (const key of ["section", "itemType", "category", "size", "supplier", "notes"] as const) {
    if (req.body[key] !== undefined) updates[key] = req.body[key] ? String(req.body[key]).trim() : null;
  }
  if (updates.section !== undefined && updates.section !== "field") updates.section = "apparel";
  const nextSection = String(updates.section ?? req.body.section ?? "apparel") === "field" ? "field" : "apparel";
  const nextCategory = req.body.category !== undefined ? (req.body.category ? String(req.body.category).trim() : null) : undefined;
  const nextSize = req.body.size !== undefined ? (req.body.size ? String(req.body.size).trim() : null) : undefined;
  if (req.body.name !== undefined) {
    const cleanName = String(req.body.name ?? nextCategory ?? "").trim();
    if (!cleanName) { res.status(400).json({ error: "Nome articolo richiesto" }); return; }
    updates.name = cleanName;
  }
  if (req.body.code !== undefined) {
    const fallbackName = String(updates.name ?? req.body.name ?? req.body.category ?? "articolo").trim();
    updates.code = String(req.body.code ?? "").trim() || makeWarehouseCode(nextSection, fallbackName, nextCategory, nextSize);
  }
  if (req.body.itemType !== undefined || req.body.name !== undefined || req.body.category !== undefined || req.body.section !== undefined) {
    const typeName = String(updates.name ?? req.body.name ?? req.body.category ?? "articolo").trim();
    updates.itemType = makeWarehouseItemType(nextSection, req.body.itemType, typeName, nextCategory);
  }
  if (req.body.price !== undefined) updates.price = cleanPrice(req.body.price);
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive === 0 || req.body.isActive === false ? 0 : 1;
  if (req.body.quantityAvailable !== undefined) updates.quantityAvailable = cleanNumber(req.body.quantityAvailable);
  if (req.body.quantityReserved !== undefined) updates.quantityReserved = cleanNumber(req.body.quantityReserved);
  if (req.body.reorderThreshold !== undefined) updates.reorderThreshold = cleanNumber(req.body.reorderThreshold);
  const [record] = await db.update(warehouseItemsTable).set(updates)
    .where(and(eq(warehouseItemsTable.id, id), eq(warehouseItemsTable.clubId, req.session.clubId!))).returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.patch("/warehouse-items/:id/reserve", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare il magazzino" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const delta = Number(req.body.delta ?? 0);
  if (!Number.isFinite(delta) || delta === 0) { res.status(400).json({ error: "delta required" }); return; }
  await ensureWarehouseKitSchema();
  const [existing] = await db.select().from(warehouseItemsTable)
    .where(and(eq(warehouseItemsTable.id, id), eq(warehouseItemsTable.clubId, req.session.clubId!)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const nextReserved = Math.max(0, Number(existing.quantityReserved ?? 0) + delta);
  const [record] = await db.update(warehouseItemsTable)
    .set({ quantityReserved: nextReserved })
    .where(and(eq(warehouseItemsTable.id, id), eq(warehouseItemsTable.clubId, req.session.clubId!)))
    .returning();
  res.json(record);
});

router.delete("/warehouse-items/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) {
    res.status(403).json({ error: "Solo la segreteria puo modificare il magazzino" });
    return;
  }
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(warehouseItemsTable).where(and(eq(warehouseItemsTable.id, id), eq(warehouseItemsTable.clubId, req.session.clubId!)));
  } catch (error) {
    const cause = (error as { code?: string; cause?: { code?: string } }).cause ?? error;
    if ((cause as { code?: string }).code !== "23503") throw error;
    res.status(409).json({ error: "Articolo presente nello storico kit. Puoi disattivarlo nel listino." });
    return;
  }
  res.sendStatus(204);
});

router.get("/equipment", requireAuth, async (req, res): Promise<void> => {
  const clubId = req.session.clubId!;
  let where: any = eq(equipmentAssignmentsTable.clubId, clubId);
  const scopedPlayerIds = await getScopedPlayerIds(req, clubId);
  if (scopedPlayerIds) {
    const ids = scopedPlayerIds;
    where = ids.length > 0
      ? and(eq(equipmentAssignmentsTable.clubId, clubId), inArray(equipmentAssignmentsTable.playerId, ids))
      : and(eq(equipmentAssignmentsTable.clubId, clubId), sql`false`);
  }
  const records = await db.select().from(equipmentAssignmentsTable).where(where);
  res.json(await withPlayerName(records));
});

function sendKitError(res: Response, error: unknown) {
  if (!(error instanceof KitRequestError)) return false;
  res.status(error.status).json({ error: error.message });
  return true;
}

function validKitId(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

router.patch("/warehouse-kit-catalog", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const ids: unknown = req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 2000 || ids.some((id) => !validKitId(id))) {
    res.status(400).json({ error: "Varianti non valide" }); return;
  }
  try {
    const kitSlots = cleanKitSlots(req.body.kitSlots);
    await ensureWarehouseKitSchema();
    const changed = await db.update(warehouseItemsTable).set({ kitSlots })
      .where(and(eq(warehouseItemsTable.clubId, req.session.clubId!), eq(warehouseItemsTable.section, "apparel"),
        inArray(warehouseItemsTable.id, ids))).returning({ id: warehouseItemsTable.id });
    res.json({ updated: changed.length });
  } catch (error) { if (!sendKitError(res, error)) throw error; }
});

router.get("/warehouse-kit-requests", requireAuth, async (req, res): Promise<void> => {
  if (!canViewWarehouse(req.session.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const clubId = req.session.clubId!;
  const playerId = req.query.playerId === undefined ? undefined : Number(req.query.playerId);
  if (playerId !== undefined && !validKitId(playerId)) { res.status(400).json({ error: "Giocatore non valido" }); return; }
  res.json(await listKitRequests(clubId, playerId, await getScopedPlayerIds(req, clubId)));
});

router.post("/warehouse-kit-requests", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const clubId = req.session.clubId!;
  const playerId = Number(req.body.playerId);
  const scope = await getScopedPlayerIds(req, clubId);
  if (!validKitId(playerId) || (scope && !scope.includes(playerId))) {
    res.status(404).json({ error: "Giocatore non trovato" }); return;
  }
  try {
    await requestKitRow(clubId, playerId, String(req.body.rowKey ?? ""), req.body.itemIds, req.body.quantity);
    res.sendStatus(204);
  } catch (error) { if (!sendKitError(res, error)) throw error; }
});

router.patch("/warehouse-kit-requests/:id", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = Number(req.params.id);
  if (!validKitId(id)) { res.status(400).json({ error: "Richiesta non valida" }); return; }
  try {
    const clubId = req.session.clubId!;
    await advanceKitRequest(clubId, id, String(req.body.status ?? ""), await getScopedPlayerIds(req, clubId));
    res.sendStatus(204);
  } catch (error) { if (!sendKitError(res, error)) throw error; }
});

router.post("/equipment", requireAuth, async (req, res): Promise<void> => {
  if (!canEditWarehouse(req.session.role)) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const { kitAssigned, trainingKit, matchKit, notes } = req.body;
  const playerId = Number(req.body.playerId);
  const clubId = req.session.clubId!;
  const scope = await getScopedPlayerIds(req, clubId);
  if (!validKitId(playerId) || (scope && !scope.includes(playerId))) {
    res.status(404).json({ error: "Giocatore non trovato" }); return;
  }
  try {
    await ensureWarehouseKitSchema();
    const result = await db.transaction(async (tx) => {
      await lockKitPlayer(tx, clubId, playerId);
      const [existing] = await tx.select().from(equipmentAssignmentsTable)
        .where(and(eq(equipmentAssignmentsTable.playerId, playerId), eq(equipmentAssignmentsTable.clubId, clubId)))
        .orderBy(asc(equipmentAssignmentsTable.id)).limit(1);
      await validateKitLinks(tx, clubId, playerId, existing?.trainingKit, trainingKit);
      const changes = { kitAssigned: kitAssigned ?? null, trainingKit: trainingKit ?? null, matchKit: matchKit ?? null, notes: notes ?? null };
      if (existing) {
        const [record] = await tx.update(equipmentAssignmentsTable).set(changes)
          .where(eq(equipmentAssignmentsTable.id, existing.id)).returning();
        return { record, status: 200 };
      }
      const [record] = await tx.insert(equipmentAssignmentsTable).values({ ...changes, clubId, playerId }).returning();
      return { record, status: 201 };
    });
    res.status(result.status).json(result.record);
  } catch (error) { if (!sendKitError(res, error)) throw error; }
});

const secretaryOrAdmin = ["admin", "presidente", "secretary", "sporting_director", "director", "technical_director"];

const MAX_SECRETARY_FILE_BYTES = 8 * 1024 * 1024;

function isMissingRelationError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === "42P01") return true;
  return /relation .* does not exist/i.test(String(e?.message ?? err));
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

// --- File segreteria (cloud, per club) ---

router.get("/secretary/club-files", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const clubId = req.session.clubId!;
  try {
    const rows = await db
      .select({
        id: clubSecretarySharedFilesTable.id,
        originalFilename: clubSecretarySharedFilesTable.originalFilename,
        mimeType: clubSecretarySharedFilesTable.mimeType,
        sizeBytes: clubSecretarySharedFilesTable.sizeBytes,
        createdAt: clubSecretarySharedFilesTable.createdAt,
      })
      .from(clubSecretarySharedFilesTable)
      .where(eq(clubSecretarySharedFilesTable.clubId, clubId))
      .orderBy(desc(clubSecretarySharedFilesTable.createdAt));
    res.json(rows);
  } catch (err) {
    if (isMissingRelationError(err)) {
      console.error("[secretary/club-files] tabella assente:", err);
      res.status(503).json({
        error:
          "Database non aggiornato: esegui sul PostgreSQL lo script lib/db/sql/club_secretary_shared_files.sql (crea la tabella club_secretary_shared_files).",
      });
      return;
    }
    console.error("[secretary/club-files] GET:", err);
    res.status(500).json({ error: "Errore nel caricamento elenco file." });
  }
});

router.post("/secretary/club-files", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const { fileName, mimeType, dataBase64 } = req.body as {
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  };
  if (!fileName || !dataBase64) {
    res.status(400).json({ error: "fileName e dataBase64 sono obbligatori" });
    return;
  }
  const { base64, mimeFromDataUrl } = parseBase64Payload(dataBase64);
  if (!base64) {
    res.status(400).json({ error: "Contenuto file non valido" });
    return;
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    res.status(400).json({ error: "Base64 non valido" });
    return;
  }
  if (buf.length === 0) {
    res.status(400).json({ error: "File vuoto" });
    return;
  }
  if (buf.length > MAX_SECRETARY_FILE_BYTES) {
    res.status(413).json({ error: `File troppo grande (max ${MAX_SECRETARY_FILE_BYTES / (1024 * 1024)} MB)` });
    return;
  }
  const safeName = String(fileName).replace(/[/\\]/g, "_").slice(0, 255);
  const mime = String(mimeType || mimeFromDataUrl || "application/octet-stream").slice(0, 200);
  const contentBase64 = buf.toString("base64");
  const [row] = await db
    .insert(clubSecretarySharedFilesTable)
    .values({
      clubId: req.session.clubId!,
      uploadedByUserId: req.session.userId ?? null,
      originalFilename: safeName,
      mimeType: mime,
      contentBase64,
      sizeBytes: buf.length,
    })
    .returning({
      id: clubSecretarySharedFilesTable.id,
      originalFilename: clubSecretarySharedFilesTable.originalFilename,
      mimeType: clubSecretarySharedFilesTable.mimeType,
      sizeBytes: clubSecretarySharedFilesTable.sizeBytes,
      createdAt: clubSecretarySharedFilesTable.createdAt,
    });
  res.status(201).json(row);
});

router.get("/secretary/club-files/export-bundle", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const clubId = req.session.clubId!;
  const rows = await db
    .select()
    .from(clubSecretarySharedFilesTable)
    .where(eq(clubSecretarySharedFilesTable.clubId, clubId))
    .orderBy(desc(clubSecretarySharedFilesTable.createdAt));
  const bundle = rows.map((r) => ({
    id: r.id,
    name: r.originalFilename,
    mimeType: r.mimeType,
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
    dataUrl: `data:${r.mimeType};base64,${r.contentBase64}`,
  }));
  res.json(bundle);
});

router.get("/secretary/club-files/:id/file", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "ID non valido" });
    return;
  }
  const clubId = req.session.clubId!;
  const [row] = await db
    .select()
    .from(clubSecretarySharedFilesTable)
    .where(and(eq(clubSecretarySharedFilesTable.id, id), eq(clubSecretarySharedFilesTable.clubId, clubId)));
  if (!row) {
    res.status(404).json({ error: "Non trovato" });
    return;
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(row.contentBase64, "base64");
  } catch {
    res.status(500).json({ error: "Errore lettura file" });
    return;
  }
  const filename = row.originalFilename.replace(/[\r\n"]/g, "_");
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

router.delete("/secretary/club-files/:id", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) {
    res.status(403).json({ error: "Non autorizzato" });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "ID non valido" });
    return;
  }
  const deleted = await db
    .delete(clubSecretarySharedFilesTable)
    .where(and(eq(clubSecretarySharedFilesTable.id, id), eq(clubSecretarySharedFilesTable.clubId, req.session.clubId!)))
    .returning({ id: clubSecretarySharedFilesTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Non trovato" });
    return;
  }
  res.sendStatus(204);
});

router.get("/secretary/parent-comms", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const records = await db.select().from(platformAnnouncementsTable)
    .where(eq(platformAnnouncementsTable.targetClubId, req.session.clubId!))
    .orderBy(desc(platformAnnouncementsTable.sentAt));
  res.json(records.map(record => record.type === "calendar" && record.source === "secretary"
    ? { ...record, message: calendarStaffMessage(record.message) } : record));
});

router.post("/secretary/parent-comms", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const { title, message, type, calendarAudience } = req.body as { title?: string; message?: string; type?: string; calendarAudience?: unknown };
  if (!title || !message) { res.status(400).json({ error: "Titolo e messaggio obbligatori" }); return; }
  const audience = type === "calendar" ? readCalendarAudience(calendarAudience) : null;
  if (type === "calendar" && !audience) {
    res.status(400).json({ error: "Ricarica il calendario prima di inviarlo alle famiglie." });
    return;
  }
  if (audience) {
    const teamIds = [...new Set(audience.entries.flatMap(entry => entry.teamIds))];
    if (teamIds.length) {
      const teams = await db.select({ id: teamsTable.id }).from(teamsTable)
        .where(and(eq(teamsTable.clubId, req.session.clubId!), inArray(teamsTable.id, teamIds)));
      if (teams.length !== teamIds.length) {
        res.status(400).json({ error: "Il calendario contiene squadre non valide." });
        return;
      }
    }
  }
  const [record] = await db.insert(platformAnnouncementsTable).values({
    title, message: audience ? encodeCalendarCommunication(message, audience) : message,
    type: type ?? "info", source: "secretary", targetClubId: req.session.clubId!,
  }).returning();
  res.status(201).json({ ...record, message });
});

router.delete("/secretary/parent-comms/:id", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = parseInt(String(req.params.id));
  await db.delete(platformAnnouncementsTable)
    .where(and(eq(platformAnnouncementsTable.id, id), eq(platformAnnouncementsTable.targetClubId!, req.session.clubId!)));
  res.json({ success: true });
});

router.get("/secretary/weekly-schedule", requireAuth, async (req, res): Promise<void> => {
  if (!secretaryOrAdmin.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const { from, to } = req.query as { from?: string; to?: string };
  const clubId = req.session.clubId!;
  const fromDate = from ? new Date(from) : (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0); return d; })();
  const toDate = to ? new Date(to) : (() => { const d = new Date(fromDate); d.setDate(d.getDate() + 6); d.setHours(23,59,59,999); return d; })();

  const sessions = await db.select().from(trainingSessionsTable)
    .where(and(eq(trainingSessionsTable.clubId, clubId), gte(trainingSessionsTable.scheduledAt, fromDate), lte(trainingSessionsTable.scheduledAt, toDate)))
    .orderBy(asc(trainingSessionsTable.scheduledAt));

  const matches = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.clubId, clubId), gte(matchesTable.date, fromDate), lte(matchesTable.date, toDate)))
    .orderBy(asc(matchesTable.date));

  const sessionsEnriched = await Promise.all(sessions.map(async (s) => {
    let teamName = null;
    if (s.teamId) { const [t] = await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, s.teamId), eq(teamsTable.clubId, clubId))); teamName = t?.name ?? null; }
    return { ...s, teamName, kind: "training" };
  }));

  const matchesEnriched = await Promise.all(matches.map(async (m) => {
    let teamName = null;
    if (m.teamId) { const [t] = await db.select({ name: teamsTable.name }).from(teamsTable).where(and(eq(teamsTable.id, m.teamId), eq(teamsTable.clubId, clubId))); teamName = t?.name ?? null; }
    return { ...m, teamName, kind: "match" };
  }));

  res.json({ sessions: sessionsEnriched, matches: matchesEnriched, from: fromDate, to: toDate });
});

const clubRoles = ["admin", "secretary", "sporting_director", "director", "technical_director", "coach", "fitness_coach", "athletic_director"];

router.get("/club/platform-announcements", requireAuth, async (req, res): Promise<void> => {
  if (!clubRoles.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const records = await db
    .select()
    .from(platformAnnouncementsTable)
    .where(and(
      eq(platformAnnouncementsTable.targetClubId, req.session.clubId!),
      eq(platformAnnouncementsTable.source, "platform"),
    ))
    .orderBy(desc(platformAnnouncementsTable.sentAt));
  res.json(records);
});

router.patch("/club/platform-announcements/:id/read", requireAuth, async (req, res): Promise<void> => {
  if (!clubRoles.includes(req.session.role ?? "")) { res.status(403).json({ error: "Non autorizzato" }); return; }
  const id = parseInt(String(req.params.id));
  await db
    .update(platformAnnouncementsTable)
    .set({ isRead: true })
    .where(and(
      eq(platformAnnouncementsTable.id, id),
      eq(platformAnnouncementsTable.targetClubId, req.session.clubId!),
    ));
  res.json({ success: true });
});

// --- Club Internal Notifications ---

// GET /club/notifications — list notifications for current club with read status
router.get("/club/notifications", requireAuth, async (req, res) => {
  await ensureClubNotificationTargetColumns();
  const clubId = req.session.clubId!;
  const userId = req.session.userId!;
  const notifications = await db
    .select()
    .from(clubNotificationsTable)
    .where(eq(clubNotificationsTable.clubId, clubId))
    .orderBy(desc(clubNotificationsTable.createdAt));

  const reads = await db
    .select()
    .from(clubNotificationReadsTable)
    .where(eq(clubNotificationReadsTable.userId, userId));

  const stateByNotificationId = new Map(reads.map((r) => [r.notificationId, r]));

  const result = notifications
    .filter((n) => notificationVisibleToUser(n, userId, req.session.role))
    .map((n) => ({
      ...n,
      isRead: stateByNotificationId.has(n.id),
      isTrashed: stateByNotificationId.get(n.id)?.isTrashed ?? false,
      isSent: n.createdByUserId === userId,
    }));
  res.json(result);
});

// POST /club/notifications — create a notification (ruoli direzionali)
router.post("/club/notifications", requireAuth, async (req, res) => {
  await ensureClubNotificationTargetColumns();
  const role = req.session.role;
  if (!["admin", "presidente", "director", "technical_director"].includes(role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { title, message, type } = req.body;
  const targetAudience = String(req.body?.targetAudience ?? "all");
  const targetRoles = Array.isArray(req.body?.targetRoles) ? req.body.targetRoles.map((item: unknown) => String(item)) : [];
  const targetUserIds = Array.isArray(req.body?.targetUserIds)
    ? req.body.targetUserIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
    : [];
  if (!title || !message) {
    res.status(400).json({ error: "title and message are required" });
    return;
  }
  const [notification] = await db
    .insert(clubNotificationsTable)
    .values({
      clubId: req.session.clubId!,
      title: String(title),
      message: String(message),
      type: String(type || "info"),
      targetAudience,
      targetRoles,
      targetUserIds,
      createdByUserId: req.session.userId!,
    } as any)
    .returning();
  res.status(201).json(notification);
});

// PATCH /club/notifications/:id/read — mark a notification as read for the current user
router.patch("/club/notifications/:id/read", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const userId = req.session.userId!;
  const existing = await db
    .select()
    .from(clubNotificationReadsTable)
    .where(
      and(
        eq(clubNotificationReadsTable.notificationId, id),
        eq(clubNotificationReadsTable.userId, userId)
      )
    );
  if (existing.length === 0) {
    await db
      .insert(clubNotificationReadsTable)
      .values({ notificationId: id, userId });
  }
  res.json({ success: true });
});

router.patch("/club/notifications/:id/trash", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;
  const [notification] = await db
    .select({ id: clubNotificationsTable.id })
    .from(clubNotificationsTable)
    .where(and(eq(clubNotificationsTable.id, id), eq(clubNotificationsTable.clubId, clubId)))
    .limit(1);
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  await ensureClubNotificationUserState(id, userId, true);
  res.json({ success: true });
});

router.patch("/club/notifications/:id/restore", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  const userId = req.session.userId!;
  const clubId = req.session.clubId!;
  const [notification] = await db
    .select({ id: clubNotificationsTable.id })
    .from(clubNotificationsTable)
    .where(and(eq(clubNotificationsTable.id, id), eq(clubNotificationsTable.clubId, clubId)))
    .limit(1);
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  await ensureClubNotificationUserState(id, userId, false);
  res.json({ success: true });
});

export default router;
