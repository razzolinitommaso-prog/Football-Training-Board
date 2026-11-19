import { trainingLocalDate } from "./training-program-schedule";

export type AvailabilityOverrideScope = "training_only" | "training_and_matches";
type Override = { availabilityOverrideActive?: boolean | null; availabilityOverrideScope?: string | null; availabilityOverrideFrom?: string | null; availabilityOverrideUntil?: string | null };
export function activeAvailabilityOverride(player: Override, date = trainingLocalDate()) {
  return player.availabilityOverrideActive === true && !!player.availabilityOverrideUntil &&
    (!player.availabilityOverrideFrom || player.availabilityOverrideFrom <= date) && player.availabilityOverrideUntil >= date;
}
export function trainingOnlyAvailabilityOverride(player: Override, date = trainingLocalDate()) {
  return player.availabilityOverrideScope === "training_only" && activeAvailabilityOverride(player, date);
}
