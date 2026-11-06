type Player = {
  id: number;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number | null;
};
export function boardPlayerIds(raw?: string | null): number[] {
  try {
    const board = JSON.parse(raw ?? "null"),
      data = board?.data;
    return [
      ...new Set<number>(
        [
          data?.elements,
          ...(data?.animation?.frames ?? []).map(
            (frame: any) => frame.elements,
          ),
        ]
          .flatMap((elements) => (Array.isArray(elements) ? elements : []))
          .filter((item) => ["player", "goalkeeper"].includes(item?.type))
          .map((item) => Number(item.playerId))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];
  } catch {
    return [];
  }
}
/** One assigned roster in menus and board. Preserve drawings, equipment and frame positions. */
export function syncExerciseBoardRoster(
  raw: string | null | undefined,
  ids: number[],
  players: Player[] = [],
): string {
  let board: any;
  try {
    board = JSON.parse(raw ?? "null");
  } catch {
    return raw ?? "";
  }
  board =
    board && typeof board === "object"
      ? board
      : { source: "tactical-board", boardId: null, data: { elements: [] } };
  if (!board.data || typeof board.data !== "object") return raw ?? "";
  const roster = [
      ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
    ],
    allowed = new Set(roster);
  const originalIds = boardPlayerIds(raw),
    added = roster.filter((id) => !originalIds.includes(id));
  const project = (elements: any[]) => {
    const seen = new Set<number>(),
      vacancies: any[] = [];
    const result = (Array.isArray(elements) ? elements : [])
      .filter((item) => {
        if (
          !["player", "goalkeeper"].includes(item?.type) ||
          !Number.isSafeInteger(Number(item.playerId)) ||
          Number(item.playerId) <= 0
        )
          return true;
        const id = Number(item.playerId);
        if (!allowed.has(id)) {
          vacancies.push(item);
          return false;
        }
        seen.add(id);
        return true;
      })
      .map((item) => {
        const p = players.find((p) => p.id === Number(item.playerId));
        return p
          ? {
              ...item,
              name: [p.firstName, p.lastName].filter(Boolean).join(" "),
              displayName: p.lastName ?? item.displayName,
              number: p.jerseyNumber ?? item.number,
            }
          : { ...item };
      });
    added
      .filter((id) => !seen.has(id))
      .forEach((id, index) => {
        const p = players.find((p) => p.id === id),
          slot = vacancies.shift();
        result.push({
          ...slot,
          id: slot?.id ?? "roster-" + id,
          type: slot?.type ?? "player",
          playerId: String(id),
          name: p
            ? [p.firstName, p.lastName].filter(Boolean).join(" ")
            : "Giocatore " + id,
          displayName: p?.lastName ?? "Giocatore " + id,
          number: p?.jerseyNumber ?? undefined,
          x: slot?.x ?? 30 + (index % 5) * 10,
          y: slot?.y ?? 30 + Math.floor(index / 5) * 12,
        });
      });
    return result;
  };
  const elements = project(board.data.elements ?? []);
  const animation = board.data.animation;
  return JSON.stringify({
    ...board,
    data: {
      ...board.data,
      elements,
      ...(Array.isArray(animation?.frames)
        ? {
            animation: {
              ...animation,
              frames: animation.frames.map((frame: any) => ({
                ...frame,
                elements: project(frame.elements),
              })),
            },
          }
        : {}),
    },
  });
}
