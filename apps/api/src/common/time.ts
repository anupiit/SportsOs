/** Campus time zone. All day boundaries (availability grids, "today", analytics buckets) use IST. */
export const IST_OFFSET_MIN = 330;

/** UTC instant for local IST midnight of the given YYYY-MM-DD. */
export function istMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MIN * 60_000);
}

/** YYYY-MM-DD of an instant, in IST. */
export function istDateString(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Minutes since IST midnight. */
export function istMinuteOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Day of week in IST, 0 = Monday … 6 = Sunday. */
export function istWeekday(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return (shifted.getUTCDay() + 6) % 7;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function todayIst(): string {
  return istDateString(new Date());
}
