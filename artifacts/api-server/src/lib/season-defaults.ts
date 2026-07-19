export type SeasonDefaults = {
  name: string;
  startDate: string;
  endDate: string;
};

function fullYearFromShort(value: number): number {
  return value < 100 ? 2000 + value : value;
}

export function defaultSeasonName(date = new Date()): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 6 ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
}

export function normalizeSeasonName(input?: string | null): SeasonDefaults {
  const raw = (input ?? "").trim();
  const fallback = defaultSeasonName();
  const candidate = raw || fallback;
  const match = candidate.match(/^(\d{2}|\d{4})\s*[\/-]\s*(\d{2}|\d{4})$/);

  if (!match) {
    const startYear = Number(defaultSeasonName().slice(0, 4));
    return {
      name: fallback,
      startDate: `${startYear}-07-01`,
      endDate: `${startYear + 1}-06-30`,
    };
  }

  const startYear = fullYearFromShort(Number(match[1]));
  const endYear = fullYearFromShort(Number(match[2]));
  const normalizedEndYear = endYear <= startYear ? startYear + 1 : endYear;

  return {
    name: `${startYear}/${normalizedEndYear}`,
    startDate: `${startYear}-07-01`,
    endDate: `${normalizedEndYear}-06-30`,
  };
}
