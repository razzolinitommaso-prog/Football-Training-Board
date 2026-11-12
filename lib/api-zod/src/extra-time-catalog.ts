export const extraTimeCatalog = [
  { id: "individual-1", name: "Lezione individuale", lessons: 1, min: 1, max: 1, cents: 4500 },
  { id: "individual-10", name: "Individuale · 10 lezioni", lessons: 10, min: 1, max: 1, cents: 35000 },
  { id: "group-2", name: "Gruppo · 2 atleti", lessons: 1, min: 2, max: 2, cents: 5000 },
  { id: "group-3-5", name: "Gruppo · 3–5 atleti", lessons: 1, min: 3, max: 5, cents: 7000 },
] as const;

export function extraTimeShareCents(total: number, count: number, index: number) {
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
}
