import {
  isReceiptMethod,
  paymentStatus,
  type PaymentEntry,
} from "./payment-summary";
import type { MemberExpenses } from "./member-services";

export type AuditIncome = PaymentEntry & {
  id: number;
  playerId: number;
  amount: number;
  paymentDate?: string | null;
  playerName?: string | null;
};
export type AuditIssue = { source: string; record: string; message: string };
export function reconcileIncome(rows: AuditIncome[], today: string) {
  const totals = { registered: 0, paid: 0, pending: 0, overdue: 0 };
  const issues: AuditIssue[] = [],
    seen = new Set<number>(),
    signatures = new Map<string, number>();
  for (const row of rows) {
    const record = String(row.id),
      issue = (message: string) =>
        issues.push({ source: "Entrate", record, message });
    if (seen.has(row.id)) {
      issue("ID ripetuto nella risposta: verificare il registro");
      continue;
    }
    seen.add(row.id);
    if (
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      !Number.isSafeInteger(Math.round(row.amount * 100))
    ) {
      issue("Importo non valido");
      continue;
    }
    const cents = Math.round(row.amount * 100),
      state = paymentStatus(row, today);
    totals.registered += cents;
    totals[state] += cents;
    const date = state === "paid" ? row.paymentDate : row.dueDate;
    if (!date)
      issue(state === "paid" ? "Data incasso mancante" : "Scadenza mancante");
    if (state === "paid" && !isReceiptMethod(row.paymentMethod))
      issue("Metodo incasso mancante o da verificare");
    if (
      row.status !== "paid" &&
      row.status !== "pending" &&
      row.status !== "overdue"
    )
      issue("Stato pagamento da verificare");
    const signature = JSON.stringify([
      row.playerId,
      row.paymentType,
      cents,
      row.status,
      date,
      row.description,
      row.paymentMethod,
    ]);
    const prior = signatures.get(signature);
    if (prior !== undefined)
      issue(
        `Possibile duplicato del movimento ${prior}: verificare, non eliminare automaticamente`,
      );
    else signatures.set(signature, row.id);
  }
  const residual = totals.pending + totals.overdue;
  return {
    ...totals,
    residual,
    balanced: totals.registered === totals.paid + residual,
    issues,
  };
}

export function reconcileExpenses(data: MemberExpenses, source: string) {
  const issues: AuditIssue[] = [],
    receiptsByDue = new Map<number, number>();
  let due = 0,
    paid = 0,
    residual = 0;
  const seenReceipts = new Set<string>(),
    seenDues = new Set<number>();
  for (const row of data.receipts) {
    if (seenReceipts.has(row.id)) {
      issues.push({ source, record: row.id, message: "Ricevuta ripetuta" });
      continue;
    }
    seenReceipts.add(row.id);
    if (!Number.isSafeInteger(row.amountCents) || row.amountCents <= 0) {
      issues.push({
        source,
        record: row.id,
        message: "Importo ricevuta non valido",
      });
      continue;
    }
    paid += row.amountCents;
    receiptsByDue.set(
      row.dueId,
      (receiptsByDue.get(row.dueId) ?? 0) + row.amountCents,
    );
  }
  for (const row of data.dues) {
    const record = String(row.id),
      issue = (message: string) => issues.push({ source, record, message });
    if (seenDues.has(row.id)) {
      issue("Rata ripetuta");
      continue;
    }
    seenDues.add(row.id);
    if (
      !Number.isSafeInteger(row.amountCents) ||
      row.amountCents < 0 ||
      !Number.isSafeInteger(row.paidCents) ||
      row.paidCents < 0
    ) {
      issue("Importi rata non validi");
      continue;
    }
    due += row.amountCents;
    residual += Math.max(0, row.amountCents - row.paidCents);
    if (row.paidCents !== (receiptsByDue.get(row.id) ?? 0))
      issue("Pagato della rata diverso dalla somma delle ricevute");
    if (row.paidCents > row.amountCents)
      issue("Versamenti superiori al dovuto");
    if (
      row.details.allocations.length &&
      row.details.allocations.reduce((n, a) => n + a.amountCents, 0) !==
        row.amountCents
    )
      issue("Ripartizione annate diversa dal dovuto");
  }
  for (const id of receiptsByDue.keys())
    if (!seenDues.has(id))
      issues.push({
        source,
        record: String(id),
        message: "Ricevuta senza rata attiva: verificare lo storico",
      });
  return { due, paid, residual, balanced: due === paid + residual, issues };
}

export function financialExportSheets(
  payments: AuditIncome[],
  members: MemberExpenses | undefined,
  senior: MemberExpenses | undefined,
  today: string,
) {
  const income = reconcileIncome(payments, today);
  const sources = [
    { data: members, label: "Membri" },
    { data: senior, label: "Prima Squadra" },
  ].filter((row): row is { data: MemberExpenses; label: string } => !!row.data);
  const costs = sources.map((row) => ({
    ...row,
    audit: reconcileExpenses(row.data, row.label),
  }));
  return [
    {
      name: "Quadrature",
      rows: [
        { Voce: "Entrate registrate", Importo: income.registered / 100 },
        { Voce: "Incassato", Importo: income.paid / 100 },
        { Voce: "Residuo entrate", Importo: income.residual / 100 },
        { Voce: "Non scaduto", Importo: income.pending / 100 },
        { Voce: "Scaduto", Importo: income.overdue / 100 },
        ...costs.flatMap(({ label, audit }) => [
          { Voce: label + " · dovuto", Importo: audit.due / 100 },
          { Voce: label + " · pagato", Importo: audit.paid / 100 },
          { Voce: label + " · residuo", Importo: audit.residual / 100 },
        ]),
      ],
    },
    {
      name: "Segnalazioni",
      rows: [...income.issues, ...costs.flatMap((row) => row.audit.issues)].map(
        (row) => ({
          Sorgente: row.source,
          Record: row.record,
          Problema: row.message,
        }),
      ),
    },
    {
      name: "Entrate",
      rows: payments.map((row) => ({
        ID: row.id,
        Giocatore: row.playerName ?? row.playerId,
        Voce: row.description ?? row.paymentType,
        Importo: row.amount,
        Stato: row.status,
        DataIncasso: row.paymentDate ?? "",
        Scadenza: row.dueDate ?? "",
        Metodo: row.paymentMethod ?? "",
      })),
    },
    ...costs.flatMap(({ data, label }) => [
      {
        name: label + " rate",
        rows: data.dues.map((row) => ({
          ID: row.id,
          Persona: row.name,
          Accordo: row.details.title,
          Dovuto: row.amountCents / 100,
          Pagato: row.paidCents / 100,
          Residuo: (row.amountCents - row.paidCents) / 100,
          Scadenza: row.dueDate,
        })),
      },
      {
        name: label + " ricevute",
        rows: data.receipts.map((row) => ({
          ID: row.id,
          Rata: row.dueId,
          Persona: row.name,
          Importo: row.amountCents / 100,
          Data: row.paidDate,
          Metodo: row.method,
        })),
      },
    ]),
  ];
}
