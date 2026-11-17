export const WITHDRAWN_PLAYER_STATUS = "withdrawn";

export function playerStatusAfterWithdrawal(player: { available: boolean | null; unavailabilityReason: string | null }) {
  if (player.available) return "active";
  if (player.unavailabilityReason === "injury") return "injured";
  if (player.unavailabilityReason === "suspended") return "suspended";
  if (player.unavailabilityReason === "pending_transfer") return "pending_transfer";
  return player.unavailabilityReason === "payment" ? "active" : "inactive";
}
