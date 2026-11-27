type ResultFixture = {
  id: number;
  date?: string | null;
  round?: number | null;
  leg?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
};
/** Select complete results without letting later kickoffs hide the club's game. */
export function championshipRecentResults<T extends ResultFixture>(
  fixtures: T[],
  isClub: (fixture: T) => boolean,
) {
  const time = (row: T) => {
    const n = Date.parse(row.date ?? "");
    return Number.isFinite(n) ? n : 0;
  };
  const played = fixtures
    .filter((row) => row.homeScore != null && row.awayScore != null)
    .sort((a, b) => time(b) - time(a) || a.id - b.id);
  const clubResult = played.find(isClub) ?? null,
    latest = played[0];
  const roundResults = !latest
    ? []
    : played.filter((row) =>
        latest.round != null
          ? row.round === latest.round && (row.leg ?? "") === (latest.leg ?? "")
          : row.date?.slice(0, 10) === latest.date?.slice(0, 10),
      );
  return {
    clubResult,
    roundResults,
    otherResults: roundResults.filter((row) => row.id !== clubResult?.id),
  };
}
