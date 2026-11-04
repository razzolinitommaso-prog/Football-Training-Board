import { parentPlayedMinutes } from "@workspace/api-zod";

/** A published call-up is a plan; only the match report establishes participation. */
export function playerMatchAttendance(
  matches: Array<{ id: number; matchPlan: unknown }>,
  callups: Array<{ matchId: number; playerId: number; status: string }>,
  playerId: number,
) {
  const matchIds = new Set(matches.map(match => match.id));
  const called = new Set(callups.filter(row => row.playerId === playerId && matchIds.has(row.matchId) &&
    !["available", "unavailable", "availability", "absent", "declined", "not_called"].includes(row.status.toLowerCase()))
    .map(row => row.matchId));
  const minutes = matches.filter(match => called.has(match.id)).map(match => parentPlayedMinutes(match.matchPlan, playerId));
  const recorded = minutes.filter((value): value is number => value !== null);
  const appearances = recorded.filter(value => value > 0).length;
  return {
    totalPastMatches: matches.length,
    callups: called.size,
    appearances,
    recorded: recorded.length,
    unrecorded: called.size - recorded.length,
    minutes: recorded.length ? recorded.reduce((sum, value) => sum + value, 0) : null,
    percentage: recorded.length ? Math.round(appearances / recorded.length * 100) : null,
  };
}
