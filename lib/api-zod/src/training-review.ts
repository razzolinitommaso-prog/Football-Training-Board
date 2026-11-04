import { z } from "zod/v4";
const score = z.number().int().min(1).max(4).nullable();
export const TrainingReviewBody = z.object({
  scores: z.object({
    coherence: score,
    organization: score,
    suitability: score,
    progression: score,
  }),
  note: z.string().trim().max(2000),
  expectedUpdatedAt: z.iso.datetime().nullable(),
});
