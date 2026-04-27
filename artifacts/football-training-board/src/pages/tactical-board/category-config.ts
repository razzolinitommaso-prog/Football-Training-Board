import type {
  FootballCategoryId,
  TacticalBoardFormat,
  TacticalBoardPitchType,
} from "./board-types";

export type CategoryBoardDefaults = {
  category: FootballCategoryId;
  format: TacticalBoardFormat;
  pitchType: TacticalBoardPitchType;
};

export const CATEGORY_DEFAULTS: Record<FootballCategoryId, Omit<CategoryBoardDefaults, "category">> = {
  "Piccoli Amici": { format: "3v3", pitchType: "mini" },
  "Primi Calci": { format: "5v5", pitchType: "small" },
  Pulcini: { format: "7v7", pitchType: "medium" },
  Esordienti: { format: "9v9", pitchType: "large" },
  Giovanissimi: { format: "11v11", pitchType: "full" },
  Allievi: { format: "11v11", pitchType: "full" },
  Juniores: { format: "11v11", pitchType: "full" },
  "Prima Squadra": { format: "11v11", pitchType: "full" },
};

export const FOOTBALL_CATEGORIES: FootballCategoryId[] = [
  "Piccoli Amici",
  "Primi Calci",
  "Pulcini",
  "Esordienti",
  "Giovanissimi",
  "Allievi",
  "Juniores",
  "Prima Squadra",
];

export function getCategoryDefaults(category: FootballCategoryId): CategoryBoardDefaults {
  return { category, ...CATEGORY_DEFAULTS[category] };
}

