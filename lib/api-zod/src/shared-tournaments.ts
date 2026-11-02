import { z } from "zod/v4";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
export const SharedTournamentBody = z
  .object({
    expectedRevision: z.number().int().nonnegative().optional(),
    name: z.string().trim().min(1).max(180),
    location: z.string().trim().max(500).default(""),
    startDate: date,
    endDate: date.nullable().default(null),
    teamIds: z.array(z.number().int().positive()).min(1).max(50),
  })
  .strict()
  .refine(
    (v) => !v.endDate || v.endDate >= v.startDate,
    "La fine precede l’inizio",
  );
export const SharedTournamentProgramBody = z
  .object({
    teamId: z.number().int().positive(),
    expectedRevision: z.number().int().nonnegative(),
    program: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            date: z.string().datetime({ offset: true }),
            homeTeam: z.string().trim().min(1).max(250),
            awayTeam: z.string().trim().min(1).max(250),
            phase: z.string().trim().max(100).default("Gironi"),
            group: z.string().trim().max(100).default(""),
            ownSide: z.enum(["none", "home", "away"]),
          })
          .strict(),
      )
      .max(250),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.program.map((entry) => entry.id)).size ===
      value.program.length,
    "Identificativi gara duplicati",
  );
