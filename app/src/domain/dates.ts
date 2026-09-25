// Local-time date helpers. The device runs in the user's timezone, so local Date math is correct
// for everything computed on the phone.

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD in local time. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date at 00:00. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Combines YYYY-MM-DD and HH:MM (local). */
export function combineDateTime(dateKey: string, time: string | null | undefined): Date {
  const d = fromDateKey(dateKey);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

/** HH:MM for a Date (local). */
export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "HH:MM" or "HH:MM:SS" -> minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function atTime(day: Date, time: string): Date {
  const x = startOfDay(day);
  x.setMinutes(timeToMinutes(time));
  return x;
}

const HE_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export function hebrewWeekday(d: Date): string {
  return HE_WEEKDAYS[d.getDay()];
}

/** "היום", "מחר", "יום שלישי 14/10". */
export function relativeDayLabel(d: Date, now = new Date()): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  return `יום ${hebrewWeekday(d)} ${d.getDate()}/${d.getMonth() + 1}`;
}

export type DayPart = "morning" | "noon" | "afternoon" | "evening" | "night";

export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 14) return "noon";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

/** "בוקר טוב, שחר" etc. */
export function greeting(name: string | null | undefined, now = new Date()): string {
  const base = {
    morning: "בוקר טוב",
    noon: "צהריים טובים",
    afternoon: "אחר צהריים טובים",
    evening: "ערב טוב",
    night: "לילה טוב",
  }[dayPart(now)];
  return name ? `${base}, ${name}` : base;
}

/** ISO string with local offset, e.g. 2026-09-25T09:30:00+03:00 — what we show the model. */
export function toLocalISO(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return (
    `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
