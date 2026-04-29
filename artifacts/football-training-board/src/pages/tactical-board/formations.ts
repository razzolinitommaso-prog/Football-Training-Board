export type FormationPresetId = "4-3-3" | "4-2-3-1" | "3-5-2" | "2-3-1" | "3-2-1" | "3-3-2" | "3-4-1" | "4-3-1" | "1-2-1" | "2-1-1";

export type GameFormat = "3v3" | "5v5" | "7v7" | "9v9" | "11v11";

export type FormationRole = "goalkeeper" | "player";

export type FormationSlot = { x: number; y: number; role: FormationRole };

export const FORMATIONS: Record<
  FormationPresetId,
  { formats: GameFormat[]; slots: FormationSlot[] }
> = {
  "4-3-3": {
    formats: ["11v11"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 25, y: 20, role: "player" },
      { x: 25, y: 40, role: "player" },
      { x: 25, y: 60, role: "player" },
      { x: 25, y: 80, role: "player" },
      { x: 45, y: 30, role: "player" },
      { x: 45, y: 50, role: "player" },
      { x: 45, y: 70, role: "player" },
      { x: 70, y: 25, role: "player" },
      { x: 70, y: 50, role: "player" },
      { x: 70, y: 75, role: "player" },
    ],
  },
  "4-2-3-1": {
    formats: ["11v11"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 25, y: 20, role: "player" },
      { x: 25, y: 40, role: "player" },
      { x: 25, y: 60, role: "player" },
      { x: 25, y: 80, role: "player" },
      { x: 42, y: 40, role: "player" },
      { x: 42, y: 60, role: "player" },
      { x: 60, y: 25, role: "player" },
      { x: 60, y: 50, role: "player" },
      { x: 60, y: 75, role: "player" },
      { x: 75, y: 50, role: "player" },
    ],
  },
  "3-5-2": {
    formats: ["11v11"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 25, y: 30, role: "player" },
      { x: 25, y: 50, role: "player" },
      { x: 25, y: 70, role: "player" },
      { x: 40, y: 15, role: "player" },
      { x: 40, y: 35, role: "player" },
      { x: 40, y: 50, role: "player" },
      { x: 40, y: 65, role: "player" },
      { x: 40, y: 85, role: "player" },
      { x: 70, y: 40, role: "player" },
      { x: 70, y: 60, role: "player" },
    ],
  },
  "2-3-1": {
    formats: ["7v7"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 28, y: 35, role: "player" },
      { x: 28, y: 65, role: "player" },
      { x: 48, y: 25, role: "player" },
      { x: 48, y: 50, role: "player" },
      { x: 48, y: 75, role: "player" },
      { x: 72, y: 50, role: "player" },
    ],
  },
  "3-2-1": {
    formats: ["7v7"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 28, y: 25, role: "player" },
      { x: 28, y: 50, role: "player" },
      { x: 28, y: 75, role: "player" },
      { x: 50, y: 38, role: "player" },
      { x: 50, y: 62, role: "player" },
      { x: 72, y: 50, role: "player" },
    ],
  },
  "3-3-2": {
    formats: ["9v9"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 27, y: 25, role: "player" },
      { x: 27, y: 50, role: "player" },
      { x: 27, y: 75, role: "player" },
      { x: 48, y: 25, role: "player" },
      { x: 48, y: 50, role: "player" },
      { x: 48, y: 75, role: "player" },
      { x: 72, y: 38, role: "player" },
      { x: 72, y: 62, role: "player" },
    ],
  },
  "3-4-1": {
    formats: ["9v9"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 27, y: 25, role: "player" },
      { x: 27, y: 50, role: "player" },
      { x: 27, y: 75, role: "player" },
      { x: 47, y: 18, role: "player" },
      { x: 47, y: 40, role: "player" },
      { x: 47, y: 60, role: "player" },
      { x: 47, y: 82, role: "player" },
      { x: 72, y: 50, role: "player" },
    ],
  },
  "4-3-1": {
    formats: ["9v9"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 25, y: 20, role: "player" },
      { x: 25, y: 40, role: "player" },
      { x: 25, y: 60, role: "player" },
      { x: 25, y: 80, role: "player" },
      { x: 48, y: 25, role: "player" },
      { x: 48, y: 50, role: "player" },
      { x: 48, y: 75, role: "player" },
      { x: 72, y: 50, role: "player" },
    ],
  },
  "1-2-1": {
    formats: ["5v5"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 32, y: 50, role: "player" },
      { x: 52, y: 32, role: "player" },
      { x: 52, y: 68, role: "player" },
      { x: 74, y: 50, role: "player" },
    ],
  },
  "2-1-1": {
    formats: ["5v5"],
    slots: [
      { x: 10, y: 50, role: "goalkeeper" },
      { x: 32, y: 35, role: "player" },
      { x: 32, y: 65, role: "player" },
      { x: 54, y: 50, role: "player" },
      { x: 74, y: 50, role: "player" },
    ],
  },
};

export function isFormationPresetId(x: string): x is FormationPresetId {
  return x in FORMATIONS;
}

export const LEGACY_FORMATIONS: Record<string, [number, number][]> = {
  "4-3-3": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.36, 0.25], [0.36, 0.5], [0.36, 0.75],
    [0.45, 0.1], [0.45, 0.5], [0.45, 0.9],
  ],
  "4-4-2": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.34, 0.15], [0.34, 0.38], [0.34, 0.62], [0.34, 0.85],
    [0.45, 0.3], [0.45, 0.7],
  ],
  "4-2-3-1": [
    [0.06, 0.5],
    [0.2, 0.15], [0.2, 0.38], [0.2, 0.62], [0.2, 0.85],
    [0.32, 0.35], [0.32, 0.65],
    [0.4, 0.15], [0.4, 0.5], [0.4, 0.85],
    [0.47, 0.5],
  ],
  "3-5-2": [
    [0.06, 0.5],
    [0.2, 0.25], [0.2, 0.5], [0.2, 0.75],
    [0.32, 0.1], [0.34, 0.32], [0.34, 0.5], [0.34, 0.68], [0.32, 0.9],
    [0.45, 0.3], [0.45, 0.7],
  ],
};

