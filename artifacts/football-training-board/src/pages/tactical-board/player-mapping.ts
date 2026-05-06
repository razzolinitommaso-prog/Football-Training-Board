import type { TacticalBoardElement } from "./board-types";
import type { TeamPlayer } from "./use-team-players";

function formatRosterLastName(player: TeamPlayer) {
  const raw = String(player.lastName || player.firstName || "").trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "")
    .join(" ");
}

function isGoalkeeper(player: TeamPlayer) {
  return String(player.position ?? "").toLowerCase().includes("port");
}

function isAvailable(player: TeamPlayer) {
  return player.available !== false;
}

type OutfieldRoleBand = "defender" | "midfielder" | "attacker" | "unknown";
type LateralBand = "top" | "middle" | "bottom" | "unknown";

function normalizePosition(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyToken(position: string, tokens: string[]) {
  return tokens.some((token) => position === token || position.includes(`${token} `) || position.includes(` ${token}`));
}

function getPlayerBand(player: TeamPlayer): OutfieldRoleBand {
  const position = normalizePosition(player.position);
  if (!position) return "unknown";

  if (hasAnyToken(position, ["dif", "def", "dc", "dd", "ds", "bracc", "terz", "libero"])) {
    return "defender";
  }

  if (hasAnyToken(position, ["cc", "cdc", "med", "median", "centrocamp", "mezz", "regista", "mid", "intern"])) {
    return "midfielder";
  }

  if (hasAnyToken(position, ["att", "fwd", "st", "cf", "punta", "ala", "esterno", "trequart", "wing"])) {
    return "attacker";
  }

  return "unknown";
}

function getSlotBand(slot: TacticalBoardElement): OutfieldRoleBand {
  const x = Number(slot.x ?? 50);
  if (x <= 32) return "defender";
  if (x <= 58) return "midfielder";
  return "attacker";
}

function getPlayerLateralBand(player: TeamPlayer): LateralBand {
  const position = normalizePosition(player.position);
  if (!position) return "unknown";
  if (hasAnyToken(position, ["sx", "sin", "left"])) {
    return "top";
  }
  if (hasAnyToken(position, ["dx", "des", "right"])) {
    return "bottom";
  }
  if (hasAnyToken(position, ["centr", "cc", "dc", "med", "reg", "center"])) {
    return "middle";
  }
  return "unknown";
}

function getSlotLateralBand(slot: TacticalBoardElement): LateralBand {
  const y = Number(slot.y ?? 50);
  if (y <= 36) return "top";
  if (y >= 64) return "bottom";
  return "middle";
}

function pickBestOutfieldPlayer(
  candidates: TeamPlayer[],
  wantedBand: OutfieldRoleBand,
  wantedLateralBand: LateralBand
): TeamPlayer | undefined {
  if (!candidates.length) return undefined;
  const score = (candidate: TeamPlayer) => {
    const band = getPlayerBand(candidate);
    const lateral = getPlayerLateralBand(candidate);
    let value = 0;
    if (band === wantedBand) value += 120;
    else if (band === "unknown") value += 30;
    else value -= 15;

    if (lateral !== "unknown" && lateral === wantedLateralBand) value += 30;
    else if (lateral === "unknown") value += 5;
    else value -= 5;

    return value;
  };

  const sorted = [...candidates].sort((a, b) => {
    const byScore = score(b) - score(a);
    if (byScore !== 0) return byScore;
    const aNum = typeof a.jerseyNumber === "number" ? a.jerseyNumber : Number.MAX_SAFE_INTEGER;
    const bNum = typeof b.jerseyNumber === "number" ? b.jerseyNumber : Number.MAX_SAFE_INTEGER;
    return aNum - bNum;
  });

  return sorted[0];
}

/**
 * Assigns real roster players by order to player/goalkeeper markers.
 */
export function assignPlayersToElements(
  elements: TacticalBoardElement[],
  players: TeamPlayer[]
): TacticalBoardElement[] {
  const usedPlayerIds = new Set(elements.map((el) => el.playerId).filter(Boolean));
  const next = [...elements];

  const fillElement = (index: number, player: TeamPlayer) => {
    usedPlayerIds.add(String(player.id));
    next[index] = {
      ...next[index],
      playerId: String(player.id),
      name: `${player.firstName} ${player.lastName}`.trim(),
      displayName: formatRosterLastName(player),
      number: player.jerseyNumber ?? undefined,
    };
  };

  const getAvailablePlayers = () =>
    players.filter((candidate) => !usedPlayerIds.has(String(candidate.id)) && isAvailable(candidate));

  // 1) Fill goalkeeper slots first with strongest goalkeeper priority.
  next.forEach((el, index) => {
    if (String(el.type) !== "goalkeeper" || el.playerId) return;
    const available = getAvailablePlayers();
    const availableGoalkeepers = available.filter((candidate) => isGoalkeeper(candidate));
    const availableOutfield = available.filter((candidate) => !isGoalkeeper(candidate));
    const goalkeeperByNumberOne = availableGoalkeepers.find((candidate) => candidate.jerseyNumber === 1);
    const outfieldByNumberOne = availableOutfield.find((candidate) => candidate.jerseyNumber === 1);
    const player = goalkeeperByNumberOne ?? availableGoalkeepers[0] ?? outfieldByNumberOne ?? available[0];
    if (player) fillElement(index, player);
  });

  // 2) Fill outfield slots by role + lateral fit.
  next.forEach((el, index) => {
    if (String(el.type) !== "player" || el.playerId) return;
    const available = getAvailablePlayers();
    const availableOutfield = available.filter((candidate) => !isGoalkeeper(candidate));
    const player =
      pickBestOutfieldPlayer(availableOutfield, getSlotBand(el), getSlotLateralBand(el)) ??
      availableOutfield[0] ??
      available[0];
    if (player) fillElement(index, player);
  });

  return next;
}
