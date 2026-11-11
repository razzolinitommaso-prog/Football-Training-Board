const marker = "\n\n[FTB_PARENT_CALENDAR_V1]";

type CalendarEntry = { teamIds: number[]; text: string };
type CalendarAudience = { entries: CalendarEntry[]; note: string };

export function readCalendarAudience(value: unknown): CalendarAudience | null {
  if (!value || typeof value !== "object") return null;
  const { entries, note } = value as Partial<CalendarAudience>;
  if (!Array.isArray(entries) || entries.length > 1000 ||
      typeof note !== "string" || note.length > 4000) return null;
  if (entries.some(entry => !entry || typeof entry.text !== "string" ||
      !entry.text.trim() || entry.text.length > 1000 ||
      !Array.isArray(entry.teamIds) || !entry.teamIds.length || entry.teamIds.length > 100 ||
      entry.teamIds.some(id => !Number.isSafeInteger(id) || id <= 0))) return null;
  return { entries, note };
}

export function encodeCalendarCommunication(message: string, audience: CalendarAudience) {
  return message + marker + JSON.stringify(audience);
}

export function calendarStaffMessage(message: string) {
  const index = message.lastIndexOf(marker);
  return index < 0 ? message : message.slice(0, index);
}

export function calendarParentMessage(message: string, teamId: number | null) {
  const index = message.lastIndexOf(marker);
  if (teamId === null || index < 0) return null;
  try {
    const audience = readCalendarAudience(JSON.parse(message.slice(index + marker.length)));
    if (!audience) return null;
    const visible = audience.entries.filter(entry => entry.teamIds.includes(teamId));
    if (!visible.length) return null;
    return visible.map(entry => entry.text).join("\n") + (audience.note ? "\n\n📝 " + audience.note : "");
  } catch {
    return null;
  }
}
