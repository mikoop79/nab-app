// Date helpers. All dates are plain YYYY-MM-DD strings in Sydney time, so a
// purchase at 11pm Sunday lands in the right week whatever the server's timezone.

export const TIMEZONE = "Australia/Sydney";

export interface Week {
  /** Monday, YYYY-MM-DD */
  start: string;
  /** Sunday, YYYY-MM-DD */
  end: string;
}

/** Today's date in Sydney. */
export function todayInSydney(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Monday–Sunday week that contains `date`. */
export function weekContaining(date: string): Week {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const start = addDays(date, dow === 0 ? -6 : 1 - dow);
  return { start, end: addDays(start, 6) };
}

/** The last fully finished Monday–Sunday week before `today`. */
export function lastCompleteWeek(today: string): Week {
  return weekContaining(addDays(weekContaining(today).start, -1));
}

export function previousWeek(week: Week): Week {
  return weekContaining(addDays(week.start, -1));
}

/** Normalises a Basiq date or timestamp to a Sydney YYYY-MM-DD. */
export function toSydneyDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayInSydney(new Date(value));
}
