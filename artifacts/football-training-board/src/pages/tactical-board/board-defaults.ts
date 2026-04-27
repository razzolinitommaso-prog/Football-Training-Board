import type { FootballCategoryId, TacticalBoardData } from "./board-types";
import { getCategoryDefaults } from "./category-config";

export type BuildDefaultBoardOptions = {
  category?: FootballCategoryId | null;
};

export function buildDefaultTacticalBoardData(
  opts: BuildDefaultBoardOptions = {}
): TacticalBoardData {
  const category = opts.category ?? "Prima Squadra";
  const { format, pitchType } = getCategoryDefaults(category);

  return {
    category,
    format,
    pitchType,
    preset: null,
    activeTool: "draw",
    focusMode: false,
    teamId: null,
    elements: [],
  };
}

/**
 * Best-effort normalization when loading older boards:
 * - Preserve existing values if present
 * - If category exists but format/pitchType are missing, infer them from category config
 */
export function normalizeTacticalBoardData(data: TacticalBoardData): TacticalBoardData {
  const next: TacticalBoardData = { ...data };
  const category = (next.category ?? null) as FootballCategoryId | string | null;

  if (category && (next.format == null || next.pitchType == null)) {
    // Only fill if it's one of our known categories; otherwise leave as-is.
    if (
      category === "Piccoli Amici" ||
      category === "Primi Calci" ||
      category === "Pulcini" ||
      category === "Esordienti" ||
      category === "Giovanissimi" ||
      category === "Allievi" ||
      category === "Juniores" ||
      category === "Prima Squadra"
    ) {
      const defaults = getCategoryDefaults(category);
      if (next.format == null) next.format = defaults.format;
      if (next.pitchType == null) next.pitchType = defaults.pitchType;
    }
  }

  return next;
}

