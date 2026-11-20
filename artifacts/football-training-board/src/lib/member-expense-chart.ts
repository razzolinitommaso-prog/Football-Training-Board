import type { MemberDue, MemberExpenses } from "./member-services";

// Allocate cumulative paid cents, then take the difference for each receipt.
// This preserves each annata's full cost even with many small partial payments.
export function memberAllocatedAmount(
  amount: number,
  details: MemberDue["details"],
  team: string,
) {
  if (!team) return amount;
  const allocations = details.allocations;
  if (team === "unassigned") return allocations.length ? 0 : amount;
  const total = allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (!total) return 0;
  let used = 0;
  return allocations.reduce((selected, row, index) => {
    const share =
      index === allocations.length - 1
        ? amount - used
        : Math.floor((amount * row.amountCents) / total);
    used += share;
    return selected + (row.teamId === Number(team) ? share : 0);
  }, 0);
}

export function memberExpenseMovements(
  data: MemberExpenses | undefined,
  team: string,
  today: string,
) {
  const paidByDue = new Map<number, number>();
  const receipts = [...(data?.receipts ?? [])].sort(
    (a, b) => a.paidDate.localeCompare(b.paidDate) || a.id.localeCompare(b.id),
  );
  const paid = receipts.map((row) => {
    const before = paidByDue.get(row.dueId) ?? 0,
      after = before + row.amountCents;
    paidByDue.set(row.dueId, after);
    return {
      date: row.paidDate,
      amount:
        memberAllocatedAmount(after, row.details, team) -
        memberAllocatedAmount(before, row.details, team),
      key: "memberPaid" as const,
    };
  });
  const pending = (data?.dues ?? []).map((row) => ({
    date: row.dueDate,
    amount: Math.max(
      0,
      memberAllocatedAmount(row.amountCents, row.details, team) -
        memberAllocatedAmount(row.paidCents, row.details, team),
    ),
    key:
      row.dueDate < today
        ? ("memberOverdue" as const)
        : ("memberPending" as const),
  }));
  return [...paid, ...pending];
}
