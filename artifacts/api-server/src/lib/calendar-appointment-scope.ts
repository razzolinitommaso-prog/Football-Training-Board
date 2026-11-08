import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { calendarExtraEventsTable } from "@workspace/db";

// Older club-wide appointments have a section because the editor was opened from it.
export const clubWideAppointment = and(
  inArray(calendarExtraEventsTable.category, ["evento_generico", "riunione", "evento_societario"]),
  eq(calendarExtraEventsTable.targetMode, "all"),
  ne(calendarExtraEventsTable.targetAudience, "teams"),
  sql`coalesce(${calendarExtraEventsTable.teamIds}, '[]'::jsonb) = '[]'::jsonb`,
  sql`coalesce(${calendarExtraEventsTable.playerIds}, '[]'::jsonb) = '[]'::jsonb`,
  sql`coalesce(${calendarExtraEventsTable.memberIds}, '[]'::jsonb) = '[]'::jsonb`,
);
