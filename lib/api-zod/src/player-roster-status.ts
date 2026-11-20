export const WITHDRAWN_PLAYER_STATUS = "withdrawn";
export const archivedPlayerStatuses = ["withdrawn", "not_renewed", "transferred", "retired_definitive"] as const;
export const playerArchiveLabels: Record<string, string> = { withdrawn: "Ritirato · possibile rientro", not_renewed: "Mancato rinnovo", transferred: "Trasferito ad altra società", retired_definitive: "Ritiro definitivo" };
export const isArchivedPlayer = (player: { status?: string | null }) => archivedPlayerStatuses.includes(player.status as typeof archivedPlayerStatuses[number]);
export const isOperationalPlayer = (player: { status?: string | null; isTest?: boolean }) => !isArchivedPlayer(player) && player.status !== "training_trial" && !player.isTest;
export const isForecastPlayer = (player: { status?: string | null; registered?: boolean | null; isTest?: boolean }) => isOperationalPlayer(player) && player.registered === true;
export const archiveStatusForTransition = (status: string) => ({ not_confirmed: "not_renewed", transfer_free: "transferred", transfer_paid: "transferred", swap: "transferred", swap_permanent: "transferred", swap_loan: "transferred", withdrawn: "withdrawn", retired_definitive: "retired_definitive" } as Record<string, string>)[status];

export function playerStatusAfterWithdrawal(player: { available: boolean | null; unavailabilityReason: string | null }) {
  if (player.available) return "active";
  if (player.unavailabilityReason === "injury") return "injured";
  if (player.unavailabilityReason === "suspended") return "suspended";
  if (player.unavailabilityReason === "pending_transfer") return "pending_transfer";
  return player.unavailabilityReason === "payment" ? "active" : "inactive";
}
