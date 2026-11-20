import { z } from "zod/v4";
import { PLAYER_KIT_SLOTS } from "./player-kit-catalog";
export { z as memberZod };

export const memberRoleLabels = {
  coach: "Allenatore",
  fitness_coach: "Preparatore",
  athletic_director: "Responsabile preparatori",
  collaborator: "Collaboratore",
  technical_director: "Direttore tecnico",
  sporting_director: "Direttore sportivo",
  team_manager: "Dirigente",
  director: "Direttore generale",
  presidente: "Presidente",
  admin: "Amministratore",
  secretary: "Segreteria",
} as const;
export const memberRole = z.enum(
  Object.keys(memberRoleLabels) as [
    keyof typeof memberRoleLabels,
    ...(keyof typeof memberRoleLabels)[],
  ],
);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const memberDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(value + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }, "Data non valida");
const cents = z.number().int().min(0).max(100_000_000);
export const memberContractInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    title: z.string().trim().min(1).max(150),
    role: memberRole,
    seasonId: z.number().int().positive(),
    fromMonth: month,
    toMonth: month,
    contractType: z.enum(["volunteer", "annual", "other"]),
    amountMode: z.enum(["monthly", "total"]),
    compensationCents: cents,
    reimbursementCents: cents,
    terms: z.enum(["30", "60", "90"]),
    lastPaymentDate: memberDate,
    allocations: z
      .array(
        z.object({
          teamId: z.number().int().positive(),
          share: z.number().int().min(1).max(10000),
        }),
      )
      .max(30),
    notes: z.string().max(3000),
    documentId: z.number().int().positive().nullable(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const n = memberMonthCount(v.fromMonth, v.toMonth);
    if (n < 1 || n > 60)
      ctx.addIssue({
        code: "custom",
        path: ["toMonth"],
        message: "Indica un periodo da 1 a 60 mesi.",
      });
    if (v.contractType === "volunteer" && v.compensationCents !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["compensationCents"],
        message:
          "Il contratto volontario non prevede un compenso. I rimborsi sono separati.",
      });
    if (
      v.allocations.length &&
      (v.allocations.reduce((n, a) => n + a.share, 0) !== 10000 ||
        new Set(v.allocations.map((a) => a.teamId)).size !==
          v.allocations.length)
    )
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Le quote per annata devono sommare 100%, senza duplicati.",
      });
    if (n > 0 && v.lastPaymentDate < memberFmDate(v.toMonth, v.terms))
      ctx.addIssue({
        code: "custom",
        path: ["lastPaymentDate"],
        message: "Il termine ultimo precede la scadenza dell’ultima rata.",
      });
  });
export type MemberContract = z.infer<typeof memberContractInput>;
export function memberMonthCount(from: string, to: string) {
  const [y, m] = from.split("-").map(Number),
    [ty, tm] = to.split("-").map(Number);
  return (ty - y) * 12 + tm - m + 1;
}
export function memberFmDate(month: string, terms: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m + Number(terms) / 30, 0))
    .toISOString()
    .slice(0, 10);
}
export function memberAmountParts(total: number, count: number) {
  const first = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) =>
    i === count - 1 ? total - first * (count - 1) : first,
  );
}
export function memberInstallments(c: MemberContract) {
  const n = memberMonthCount(c.fromMonth, c.toMonth),
    [year, m] = c.fromMonth.split("-").map(Number);
  const compensation =
    c.amountMode === "total"
      ? memberAmountParts(c.compensationCents, n)
      : (Array(n).fill(c.compensationCents) as number[]);
  const reimbursements =
    c.amountMode === "total"
      ? memberAmountParts(c.reimbursementCents, n)
      : (Array(n).fill(c.reimbursementCents) as number[]);
  return Array.from({ length: n }, (_, i) => {
    const month = new Date(Date.UTC(year, m - 1 + i, 1))
        .toISOString()
        .slice(0, 7),
      amountCents = compensation[i] + reimbursements[i];
    let allocated = 0;
    const allocations = c.allocations.map((a, j) => {
      const cents =
        j === c.allocations.length - 1
          ? amountCents - allocated
          : Math.floor((amountCents * a.share) / 10000);
      allocated += cents;
      return { teamId: a.teamId, amountCents: cents };
    });
    return {
      month,
      dueDate: memberFmDate(month, c.terms),
      amountCents,
      compensationCents: compensation[i],
      reimbursementCents: reimbursements[i],
      allocations,
    };
  });
}
export function memberKitSlots(roles: string[]) {
  if (roles.some((role) => ["admin", "presidente", "secretary"].includes(role)))
    return [];
  const training = roles.some((role) =>
    [
      "coach",
      "fitness_coach",
      "athletic_director",
      "technical_director",
      "sporting_director",
    ].includes(role),
  );
  return PLAYER_KIT_SLOTS.filter(
    (slot) =>
      slot.key.startsWith("rep_") ||
      (training && "area" in slot && slot.area === "training"),
  );
}
export const memberMoney = (cents: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    useGrouping: "always" as any,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
