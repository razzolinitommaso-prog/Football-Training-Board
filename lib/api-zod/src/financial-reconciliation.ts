/** Pure accounting checks shared by the UI, workbook and complete snapshot audit. */
export type AuditIncomeRow={id:number;playerId:number;amount:number;status:string;paymentDate?:string|null;dueDate?:string|null;paymentMethod?:string|null;paymentType?:string|null;description?:string|null};
export type AuditExpensesData={dues:{id:number;amountCents:number;paidCents:number;details:{allocations:{amountCents:number}[]}}[];receipts:{id:string;dueId:number;amountCents:number}[]};
const isReceiptMethod=(value:unknown)=>typeof value==="string"&&["cash","card","bank_transfer"].includes(value);
function paymentStatus(payment:AuditIncomeRow,today:string):"paid"|"overdue"|"pending"{
  if(payment.status==="paid")return "paid";
  if(payment.status==="overdue"||(payment.dueDate&&payment.dueDate<today))return "overdue";
  return "pending";
}

export type AuditIssue = { source: string; record: string; message: string };
export function reconcileIncome(rows: AuditIncomeRow[], today: string) {
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

export function reconcileExpenses(data: AuditExpensesData, source: string) {
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

export type ClubDataAudit={clubId:number;asOf:string;tables:number;rows:number;integrity:boolean;externalReferences:number;scope:string;income:ReturnType<typeof reconcileIncome>&{available:boolean;records:number;missingPlayers:number};members:ReturnType<typeof reconcileExpenses>&{available:boolean;records:number;receipts:number};senior:ReturnType<typeof reconcileExpenses>&{available:boolean;records:number;receipts:number};warehouse?:ReturnType<typeof reconcileExpenses>&{available:boolean;records:number;receipts:number};references:{checked:number;missing:number;issues:AuditIssue[]};warnings:string[]};