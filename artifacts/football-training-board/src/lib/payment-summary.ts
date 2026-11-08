export const paymentViewRoles = ["admin", "presidente", "director", "secretary"];

export const paymentCategories = { kit: "Kit", quotes: "Quote", shuttle: "Pulmino", other: "Altro" } as const;
export type PaymentCategory = keyof typeof paymentCategories;
export const paymentStatuses = { paid: "Incassato", pending: "Da incassare", overdue: "Scaduto" } as const;
export type PaymentStatus = keyof typeof paymentStatuses;

export type PaymentEntry = {
  paymentType?: string | null;
  description?: string | null;
  status: string;
  dueDate?: string | null;
};

export function paymentCategory(payment: PaymentEntry): PaymentCategory {
  switch (payment.paymentType) {
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
  const quotes = payments.filter(payment => paymentCategory(payment) === "quotes");
  if (quotes.some(payment => paymentStatus(payment, today) === "overdue")) return { tone: "red" as const, label: "Scadute" };
  if (quotes.some(payment => paymentStatus(payment, today) === "pending")) return { tone: "yellow" as const, label: "Da saldare" };
  if (payments.some(payment => ["player_total_deposit", "player_total_installment"].includes(payment.paymentType ?? ""))) {
    return { tone: "yellow" as const, label: "Quote da verificare" };
  }
  if (!quotes.length) return { tone: "yellow" as const, label: "Quote da registrare" };
  if (!quotes.some(payment => payment.paymentType === "registration_fee" || /^quota iscrizione\b/i.test(payment.description?.trim() ?? ""))) {
    return { tone: "yellow" as const, label: "Iscrizione da verificare" };
  }
  return { tone: "green" as const, label: "In regola" };
}
