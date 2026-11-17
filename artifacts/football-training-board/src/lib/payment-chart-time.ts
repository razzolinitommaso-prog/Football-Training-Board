const dayMs = 86_400_000;
const parseDay = (day: string) => new Date(day + "T00:00:00Z");
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export function addChartDays(day: string, days: number) { return isoDay(new Date(parseDay(day).getTime() + days * dayMs)); }
export function chartMonday(day: string) { return addChartDays(day, -(parseDay(day).getUTCDay() + 6) % 7); }
export function chartMonthEnd(month: string) {
  const date = parseDay(month + "-01");
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return isoDay(date);
}
export function paymentChartWindow(startMonth: string, endMonth: string, zoom: number, focus: string) {
  const lower = startMonth + "-01", upper = chartMonthEnd(endMonth);
  const anchor = focus < lower ? lower : focus > upper ? upper : focus;
  let from = lower, to = upper;
  if (zoom === 1) { from = addChartDays(chartMonday(anchor), -21); to = addChartDays(from, 48); }
  if (zoom === 2) { from = chartMonday(anchor); to = addChartDays(from, 6); }
  if (zoom === 3) { from = anchor; to = anchor; }
  from = from < lower ? lower : from;
  to = to > upper ? upper : to;
  const keys = new Set<string>();
  if (zoom === 3) {
    for (let hour = 0; hour < 24; hour++) keys.add(anchor + "T" + String(hour).padStart(2, "0"));
  } else if (zoom === 0) {
    const date = parseDay(from);
    while (isoDay(date) <= to) { keys.add(isoDay(date).slice(0, 7)); date.setUTCMonth(date.getUTCMonth() + 1); }
  } else {
    for (let date = from; date <= to; date = addChartDays(date, 1)) keys.add(paymentChartKey(date, zoom));
  }
  return { from, to, anchor, keys: [...keys], hasPrevious: from > lower, hasNext: to < upper };
}
export function paymentChartKey(day: string, zoom: number, time?: string | null) {
  if (zoom === 0) return day.slice(0, 7);
  if (zoom === 1) return chartMonday(day);
  if (zoom === 3) return time ? day + "T" + time.slice(0, 2) : "";
  return day;
}
