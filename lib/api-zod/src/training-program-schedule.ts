import { z } from "zod/v4";
/** Dates are inclusive, local calendar dates (YYYY-MM-DD), never UTC instants. */
export type ProgramTrainingSlot = {
  day: string; startTime: string; endTime: string;
  campo?: string | null; lockerRoom?: string | null;
  validFrom?: string | null; validUntil?: string | null;
  jointTeamId?: number | null;
};
export function trainingSlotOnDate(slot: Pick<ProgramTrainingSlot, "validFrom" | "validUntil"> & {day?: string}, date: string): boolean {
  return (!slot.validFrom || slot.validFrom <= date) && (!slot.validUntil || slot.validUntil >= date);
}
export function trainingSlotPeriodsOverlap(a: ProgramTrainingSlot, b: ProgramTrainingSlot): boolean {
  return (a.validFrom || "0000-01-01") <= (b.validUntil || "9999-12-31") && (b.validFrom || "0000-01-01") <= (a.validUntil || "9999-12-31");
}
export const trainingLocalDate = (at: Date = new Date()) => at.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
export function trainingProgramLeader(slots: ProgramTrainingSlot[] | null | undefined, date: string): number | null {
  return slots?.find(slot => slot.jointTeamId && trainingSlotOnDate(slot, date))?.jointTeamId ?? null;
}

export const TrainingProgramBody=z.object({expectedUpdatedAt:z.string(),expectedReferenceUpdatedAt:z.string().optional(),effectiveFrom:z.string(),referenceTeamId:z.number().int().positive().nullable(),trainingSchedule:z.array(z.object({day:z.string(),startTime:z.string(),endTime:z.string(),campo:z.string().nullable().optional(),lockerRoom:z.string().nullable().optional()})).max(21).default([])});
