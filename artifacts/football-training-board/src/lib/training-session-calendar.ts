import { sessionTeamIds, type ProgramTrainingSlot } from "@workspace/api-zod";
import { format } from "date-fns";
import { managerTrainingEvents, type ManagerTrainingCalendar } from "@/lib/team-manager-training-calendar";

export type SessionPreparation = { exerciseCount: number; phases: string[]; complete: boolean };
export type CalendarSession = { id: number; teamId: number | null; notes?:string|null; durationMinutes?:number|null; title: string; scheduledAt: string; status: string; sessionKind: string; preparation?: SessionPreparation };
export type SessionCalendarTeam = { id: number; name: string; clubSection?: string | null; trainingSchedule?: ProgramTrainingSlot[] | null; seasonTrainingStartDate?: string | null; officialTrainingEndDate?: string | null };
export type SessionCalendarRow = { id: string; date: string; time: string; title: string; status: "complete" | "pending" | "cancelled" | "relocated" | "planned" | "unknown"; sessionId?: number; detail?: string; exerciseCount?: number; endTime?: string };
const key = (date: Date) => format(date, "yyyy-MM-dd|HH:mm");

export function sessionCalendarRows(team: SessionCalendarTeam | null, sessions: CalendarSession[], changes: ManagerTrainingCalendar["changes"], from: Date, to: Date, includeSchedule = true): SessionCalendarRow[] {
  const bySlot = new Map<string, CalendarSession[]>();
  const fromKey = format(from, "yyyy-MM-dd"), toKey = format(to, "yyyy-MM-dd");
  const own = sessions.filter(session => session.sessionKind === "regular" && (session.teamId === (team?.id ?? null) || !!team&&sessionTeamIds(session.teamId,session.notes).includes(team.id))).filter(session => {
    const at = new Date(session.scheduledAt);
    return Number.isFinite(at.getTime()) && format(at, "yyyy-MM-dd") >= fromKey && format(at, "yyyy-MM-dd") <= toKey;
  });
  for (const session of own) {
    const slot = key(new Date(session.scheduledAt));
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), session]);
  }
  const rows: SessionCalendarRow[] = [];
  const append = (session: CalendarSession) => {
    const at = new Date(session.scheduledAt);
    rows.push({id: `session-${session.id}`, date: format(at, "yyyy-MM-dd"), time: format(at, "HH:mm"), title: session.notes?.includes("[FTB_PROGRAM_TEAMS]") ? `Congiunto · ${session.title}` : session.title,
      status: ["cancelled", "canceled"].includes(session.status) ? "cancelled" : !session.preparation ? "unknown" : session.preparation.complete ? "complete" : "pending",
      sessionId: session.id, exerciseCount: session.preparation?.exerciseCount,
    });
  };
  if (team && includeSchedule) {
    const calendar: ManagerTrainingCalendar = {start: team.seasonTrainingStartDate ?? null, end: team.officialTrainingEndDate ?? null,
      slots: (team.trainingSchedule ?? []).map(slot => ({...slot, campo: slot.campo ?? null})), changes};
    for (const event of managerTrainingEvents(calendar, [], from, to)) {
      const at = new Date(event.date!); const slot = key(at); let existing = bySlot.get(slot) ?? [];
      if(!existing.length&&event.status!=="cancelled"&&event.status!=="relocated") {
        existing=own.filter(session=>bySlot.has(key(new Date(session.scheduledAt)))&&session.teamId!==team.id&&sessionTeamIds(session.teamId,session.notes).includes(team.id)&&!['cancelled','canceled'].includes(session.status)&&at.getTime()<Date.parse(session.scheduledAt)+(session.durationMinutes??90)*60000&&(event.endTime?new Date(`${format(at,"yyyy-MM-dd")}T${event.endTime}:00`).getTime():at.getTime()+90*60000)>Date.parse(session.scheduledAt));
        for(const session of existing)bySlot.delete(key(new Date(session.scheduledAt)));
      }
      if (event.status === "cancelled" || event.status === "relocated") {
        rows.push({id: event.id, date: format(at,"yyyy-MM-dd"), time: format(at,"HH:mm"), title: event.title, status: event.status, sessionId: existing[0]?.id, detail: event.detail});
        // Keep genuine duplicate sessions visible, but never turn this slot into a create action.
        for (const extra of existing.slice(1)) append(extra);
      } else if (existing.length) existing.forEach(append);
      else rows.push({id:event.id, date:format(at,"yyyy-MM-dd"), time:format(at,"HH:mm"), title:event.title, status:"planned", detail:event.detail, endTime:event.endTime ?? undefined});
      bySlot.delete(slot);
    }
  }
  for (const sessions of bySlot.values()) sessions.forEach(append);
  return rows.sort((a,b) => `${a.date}|${a.time}`.localeCompare(`${b.date}|${b.time}`) || a.id.localeCompare(b.id));
}
