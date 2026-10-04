// Calendar helpers for Europe/Berlin. Days are "YYYY-MM-DD" strings in Berlin
// local time; instants are UTC Dates. No library: Intl gives the offset.

export const TZ = "Europe/Berlin";
const DAY_MS = 86_400_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

// Berlin calendar day of an instant.
export function berlinDay(d: Date): string {
  return dayFmt.format(d); // en-CA → YYYY-MM-DD
}

// "HH:MM" in Berlin.
export function berlinTime(d: Date): string {
  return timeFmt.format(d);
}

function offsetMs(instant: Date): number {
  // Offset = (wall clock interpreted as UTC) - instant.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

// Instant of 00:00 Berlin on the given day.
export function berlinMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess));
  // Re-check once in case the guess fell on the other side of a DST switch.
  t = guess - offsetMs(new Date(t));
  return new Date(t);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from a to b (b - a).
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

// 0 = Monday … 6 = Sunday.
export function weekdayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// Monday of the Berlin week containing the instant.
export function weekStartOf(d: Date): string {
  const day = berlinDay(d);
  return addDays(day, -weekdayIndex(day));
}

// ISO week number of a day.
export function isoWeek(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

// "05.10." for labels.
export function fmtDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}.`;
}

export const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
