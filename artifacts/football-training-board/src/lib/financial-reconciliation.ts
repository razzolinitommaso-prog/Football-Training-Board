import { reconcileIncome,reconcileExpenses } from "@workspace/api-zod";
export { reconcileIncome,reconcileExpenses,type AuditIssue } from "@workspace/api-zod";
import type {PaymentEntry} from "./payment-summary";
import type { MemberExpenses } from "./member-services";

export type AuditIncome = PaymentEntry & {
  id: number;
  playerId: number;
  amount: number;
  paymentDate?: string | null;
  playerName?: string | null;
};
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
