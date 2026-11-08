import { format } from "date-fns";

export type CalendarAppointment = {
  id: number;
  title: string;
  dateFrom: string;
  dateTo: string;
  startTime?: string | null;
  endTime?: string | null;
  frequency?: string | null;
  weekdays?: number[] | null;
  locationName?: string | null;
  notes?: string | null;
};

export function appointmentOccursOn(event: CalendarAppointment, day: Date): boolean {
  const key = format(day, "yyyy-MM-dd");
  return event.dateFrom <= key && key <= event.dateTo &&
    (event.frequency !== "selected_days" || Boolean(event.weekdays?.includes(day.getDay())));
}
