/** Keep the layout but detach the saved board and all previous player identities. */
export function prepareReusedBoard(raw?: string | null, teamId?: number | null): string {
  if (!raw) return "";
  try {
    const board = JSON.parse(raw);
    const clean = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(clean);
      if (!value || typeof value !== "object") return value;
      const item = value as Record<string, unknown>;
      const result = Object.fromEntries(Object.entries(item).filter(([key]) => !["playerId", "playerIds", "selectedPlayerIdsJson", "rosterPlayerIds"].includes(key)).map(([key, value]) => [key, clean(value)]));
      if (["player", "opponent", "goalkeeper"].includes(String(item.type))) {
        for (const key of ["name", "displayName", "playerName", "playerPhoto", "playerNumber", "number", "label"]) delete result[key];
      }
      return result;
    };
    const result = clean(board) as Record<string, unknown>;
    if (result.data && typeof result.data === "object") result.data = { ...result.data, teamId: teamId ?? null };
    return JSON.stringify({ ...result, boardId: null });
  } catch { return ""; }
}
