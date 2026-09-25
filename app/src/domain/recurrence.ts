import type { Recurrence } from "./types";
import { addDays, fromDateKey, toDateKey } from "./dates";

/**
 * Next occurrence strictly after `fromKey` (YYYY-MM-DD) for a recurrence rule, or null when
 * the rule has ended. Monthly rules clamp to the last day of shorter months (31 -> 30/28).
 */
export function nextOccurrence(rule: Recurrence, fromKey: string, anchorKey: string = fromKey): string | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const from = fromDateKey(fromKey);
  const anchor = fromDateKey(anchorKey);
  let next: Date;

  switch (rule.freq) {
    case "daily":
      next = addDays(from, interval);
      break;
    case "weekly": {
      const days = rule.byWeekday?.length ? [...new Set(rule.byWeekday)].sort((a, b) => a - b) : [anchor.getDay()];
      // Look for a later weekday in the same week first; otherwise jump `interval` weeks.
      const later = days.find((d) => d > from.getDay());
      if (later !== undefined) next = addDays(from, later - from.getDay());
      else next = addDays(from, 7 * (interval - 1) + (7 - from.getDay()) + days[0]);
      break;
    }
    case "monthly": {
      const targetDay = anchor.getDate();
      const y = from.getFullYear();
      const m = from.getMonth() + interval;
      const lastDay = new Date(y, m + 1, 0).getDate();
      next = new Date(y, m, Math.min(targetDay, lastDay));
      break;
    }
    case "yearly": {
      const y = from.getFullYear() + interval;
      const lastDay = new Date(y, anchor.getMonth() + 1, 0).getDate();
      next = new Date(y, anchor.getMonth(), Math.min(anchor.getDate(), lastDay));
      break;
    }
  }

  const key = toDateKey(next);
  if (rule.until && key > rule.until) return null;
  return key;
}

const HE_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export function describeRecurrence(rule: Recurrence): string {
  const n = Math.max(1, rule.interval || 1);
  let s: string;
  switch (rule.freq) {
    case "daily":
      s = n === 1 ? "כל יום" : `כל ${n} ימים`;
      break;
    case "weekly":
      s = n === 1 ? "כל שבוע" : `כל ${n} שבועות`;
      if (rule.byWeekday?.length) s += ` (${rule.byWeekday.map((d) => HE_DAYS[d]).join(", ")})`;
      break;
    case "monthly":
      s = n === 1 ? "כל חודש" : `כל ${n} חודשים`;
      break;
    case "yearly":
      s = n === 1 ? "כל שנה" : `כל ${n} שנים`;
      break;
  }
  return rule.until ? `${s} עד ${rule.until}` : s;
}
