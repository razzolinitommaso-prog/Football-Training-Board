import type { TacticalBoardElement } from "./board-types";
import type { TeamPlayer } from "./use-team-players";

/**
 * Minimal helper for future manual assignment:
 * assigns real players by order to player/goalkeeper markers.
 */
export function assignPlayersToElements(
  elements: TacticalBoardElement[],
  players: TeamPlayer[]
): TacticalBoardElement[] {
  let playerIndex = 0;

  return elements.map((el) => {
    if (!["player", "goalkeeper"].includes(String(el.type))) return el;
    if (el.playerId) return el;

    const player = players[playerIndex++];
    if (!player) return el;

    return {
      ...el,
      playerId: String(player.id),
      name: `${player.firstName} ${player.lastName}`.trim(),
      number: player.jerseyNumber ?? undefined,
    };
  });
}

