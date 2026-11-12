export const paymentViewRoles = ["admin", "presidente", "director", "secretary"];

export const paymentCategories = { kit: "Kit", quotes: "Quote", shuttle: "Pulmino", extra_time: "Extra Time", other: "Altro" } as const;
export type PaymentCategory = keyof typeof paymentCategories;
export const paymentStatuses = { paid: "Incassato", pending: "Da incassare", overdue: "Scaduto" } as const;
export type PaymentStatus = keyof typeof paymentStatuses;
export const receiptMethods = { cash: "Contanti", card: "Carta / Bancomat (POS)", bank_transfer: "Bonifico" } as const;
export const depositPurposes = ["Generale", "Iscrizione", "Quota annuale", "Assicurazione", "Kit", "Pulmino", "Extra Time"] as const;
export type ReceiptMethod = keyof typeof receiptMethods;

export function isReceiptMethod(value: unknown): value is ReceiptMethod {
  return typeof value === "string" && Object.hasOwn(receiptMethods, value);
}

export function receiptMethodLabel(value?: string | null) {
  return isReceiptMethod(value) ? receiptMethods[value] : value ? "Altro metodo" : "Metodo da indicare";
}

export type PaymentEntry = {
  paymentType?: string | null;
  description?: string | null;
  status: string;
  dueDate?: string | null;
  paymentMethod?: string | null;
};

export function paymentCategory(payment: PaymentEntry): PaymentCategory {
  switch (payment.paymentType) {
    case "extra_time_fee": return "extra_time";
    case "player_total_installment":
      return / - (Iscrizione|Assicurazione)$/.test(payment.description ?? "") ? "quotes" : "other";
    case "player_total_deposit": {
      const purpose = payment.description?.split(" - ")[2];
      if (purpose === "Kit") return "kit";
      if (purpose === "Pulmino") return "shuttle";
      if (purpose === "Extra Time") return "extra_time";
      return purpose === "Iscrizione" || purpose === "Quota annuale" || purpose === "Assicurazione" ? "quotes" : "other";
    }
    case "kit_payment": return "kit";
    case "shuttle_monthly": return "shuttle";
    case "registration_fee":
    case "insurance_fee":
    case "annual_fee":
      return "quotes";
    case "annual_fee_installment":
    case null:
    case undefined: {
      // Older generic entries could carry only the label.
      const label = payment.description?.trim().toLocaleLowerCase("it") ?? "";
      if (/^kit\b/.test(label)) return "kit";
      if (/^(quota )?pulmino\b/.test(label)) return "shuttle";
      if (/^quota (iscrizione|annuale|assicurazione)\b/.test(label)) return "quotes";
      return payment.paymentType === "annual_fee_installment" ? "quotes" : "other";
    }
    default: return "other";
  }
}

export function paymentStatus(payment: PaymentEntry, today: string): PaymentStatus {
  if (payment.status === "paid") return "paid";
  if (payment.status === "overdue" || (payment.dueDate && payment.dueDate < today)) return "overdue";
  return "pending";
}

export function quotePaymentStatus(payments: PaymentEntry[], today: string) {
  const unified = payments.some(payment => ["player_total_deposit", "player_total_installment"].includes(payment.paymentType ?? ""));
  const quotes = payments.filter(payment => payment.paymentType === "player_total_installment" ||
    (payment.paymentType !== "player_total_deposit" && paymentCategory(payment) === "quotes"));
  if (quotes.some(payment => paymentStatus(payment, today) === "overdue")) return { tone: "red" as const, label: "Scadute" };
  if (unified) {
    if (quotes.some(payment => payment.status !== "paid" && !payment.dueDate)) return { tone: "yellow" as const, label: "Scadenze da indicare" };
    return { tone: "green" as const, label: quotes.some(payment => payment.status !== "paid") ? "In regola · piano in corso" : "In regola" };
  }
  if (quotes.some(payment => paymentStatus(payment, today) === "pending")) return { tone: "yellow" as const, label: "Da saldare" };
  if (!quotes.length) return { tone: "yellow" as const, label: "Quote da registrare" };
  if (!quotes.some(payment => payment.paymentType === "registration_fee" || /^quota iscrizione\b/i.test(payment.description?.trim() ?? ""))) {
    return { tone: "yellow" as const, label: "Iscrizione da verificare" };
  }
  return { tone: "green" as const, label: "In regola" };
}

export const economicPaymentTypes = {
  registration: ["registration_fee"],
  annual: ["annual_fee", "annual_fee_installment"],
  insurance: ["insurance_fee"],
  shuttle: ["shuttle_monthly"],
  kit: ["kit_payment"],
} as const;

export type EconomicCharges = Record<keyof typeof economicPaymentTypes, number>;
type EconomicPayment = PaymentEntry & { amount: number; annualFeeTotal?: number | null };

const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;

export function playerEconomicBalance(
  charges: EconomicCharges,
  extraTime: number,
  payments: EconomicPayment[],
  useSavedPlan: boolean,
  upfront: number,
  settle: boolean,
  registrationIsInstallment = false,
) {
  const types: string[] = ["player_total_installment"];
  let quotes = 0;
  let gross = cents(extraTime);
  let recorded = 0;
  let bookedDirect = 0;
  for (const [key, accepted] of Object.entries(economicPaymentTypes)) {
    const group = payments.filter((payment) => accepted.some((type) => type === payment.paymentType));
    const entered = cents(charges[key as keyof EconomicCharges]);
    const paid = group.reduce((sum, payment) => sum + (payment.status === "paid" ? cents(payment.amount) : 0), 0);
    const booked = group.reduce((sum, payment) => sum + cents(payment.amount), 0);
    bookedDirect += booked;
    if (key === "registration" && registrationIsInstallment) {
      recorded += paid;
      types.push(...accepted);
      continue;
    }
    const target = entered || (key === "shuttle" ? 0 : booked);
    gross += target;
    if (key !== "kit") quotes += target;
    recorded += Math.min(target, paid);
    if (target > 0) types.push(...accepted);
  }
  const unified = payments.filter((payment) =>
    payment.paymentType === "player_total_deposit" || payment.paymentType === "player_total_installment");
  const directTotal = gross;
  if (useSavedPlan) {
    gross = Math.max(gross, ...unified.map((payment) => cents(payment.annualFeeTotal ?? 0)),
      bookedDirect + unified.reduce((sum, payment) => sum + cents(payment.amount), 0));
  }
  recorded = Math.min(gross, recorded + unified.reduce((sum, payment) =>
    sum + (payment.status === "paid" ? cents(payment.amount) : 0), 0));
  const outstanding = gross - recorded;
  const newPayment = settle ? outstanding : cents(upfront);
  return {
    quotes: quotes / 100, savedPlanBalance: (gross - directTotal) / 100, total: gross / 100, alreadyPaid: recorded / 100, outstanding: outstanding / 100,
    upfront: newPayment / 100, residual: Math.max(0, outstanding - newPayment) / 100,
    replaceTypes: types,
  };
}
