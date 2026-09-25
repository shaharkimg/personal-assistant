import type { CalendarEvent, TimeSlot } from "./types";
import { addDays, addMinutes, atTime, DayPart, startOfDay } from "./dates";

export interface AvailabilityOptions {
  rangeStart: Date;
  rangeEnd: Date;
  durationMinutes: number;
  /** Working window per day, "HH:MM". */
  dayStart?: string;
  dayEnd?: string;
  /** Restrict to part of day ("אחר הצהריים" -> afternoon). */
  partOfDay?: Exclude<DayPart, "night"> | null;
  /** Minutes to keep free around existing meetings. */
  bufferMinutes?: number;
  /** Candidate starts align to this many minutes. */
  stepMinutes?: number;
  /** Skip these weekdays (default: Saturday). */
  excludeWeekdays?: number[];
  now?: Date;
}

const PART_WINDOWS: Record<Exclude<DayPart, "night">, [string, string]> = {
  morning: ["08:00", "12:00"],
  noon: ["12:00", "14:00"],
  afternoon: ["13:00", "18:00"],
  evening: ["18:00", "22:00"],
};

function busyIntervals(events: CalendarEvent[], buffer: number): TimeSlot[] {
  return events
    .filter((e) => e.busy && !e.allDay)
    .map((e) => ({ start: addMinutes(e.start, -buffer), end: addMinutes(e.end, buffer) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Merged free intervals inside [from, to] given busy events. */
export function freeIntervals(events: CalendarEvent[], from: Date, to: Date, buffer = 0): TimeSlot[] {
  const busy = busyIntervals(events, buffer);
  const out: TimeSlot[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start > cursor) out.push({ start: cursor, end: b.start < to ? b.start : to });
    if (b.end > cursor) cursor = b.end;
    if (cursor >= to) break;
  }
  if (cursor < to) out.push({ start: cursor, end: to });
  return out;
}

/**
 * Candidate meeting slots of `durationMinutes`, spread across days (at most `perDay` per day)
 * so the user gets real choices instead of five consecutive half-hours.
 */
export function findAvailableSlots(events: CalendarEvent[], opts: AvailabilityOptions, limit = 5, perDay = 2): TimeSlot[] {
  const step = opts.stepMinutes ?? 30;
  const buffer = opts.bufferMinutes ?? 0;
  const exclude = opts.excludeWeekdays ?? [6];
  const now = opts.now ?? new Date();
  const [winStart, winEnd] = opts.partOfDay
    ? PART_WINDOWS[opts.partOfDay]
    : [opts.dayStart ?? "09:00", opts.dayEnd ?? "18:00"];

  const slots: TimeSlot[] = [];
  for (let day = startOfDay(opts.rangeStart); day <= opts.rangeEnd && slots.length < limit; day = addDays(day, 1)) {
    if (exclude.includes(day.getDay())) continue;
    let from = atTime(day, winStart);
    let to = atTime(day, winEnd);
    if (to > opts.rangeEnd) to = opts.rangeEnd;
    if (from < opts.rangeStart) from = opts.rangeStart;
    if (from < now) from = now;
    if (from >= to) continue;
    let taken = 0;
    for (const free of freeIntervals(events, from, to, buffer)) {
      let s = alignUp(free.start, step);
      while (taken < perDay && slots.length < limit && addMinutes(s, opts.durationMinutes) <= free.end) {
        slots.push({ start: s, end: addMinutes(s, opts.durationMinutes) });
        taken++;
        // Next candidate on the same day at least an hour later.
        s = alignUp(addMinutes(s, Math.max(opts.durationMinutes, 60)), step);
      }
      if (taken >= perDay) break;
    }
  }
  return slots;
}

function alignUp(d: Date, step: number): Date {
  const ms = step * 60_000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

/** Events overlapping the proposed interval (busy ones only). */
export function findConflicts(events: CalendarEvent[], start: Date, end: Date, ignoreEventId?: string): CalendarEvent[] {
  return events.filter((e) => e.id !== ignoreEventId && e.busy && !e.allDay && e.start < end && e.end > start);
}

/** Free gaps today between now and the next busy event, used for "you have 20 free minutes" nudges. */
export function gapBeforeNextEvent(events: CalendarEvent[], now: Date): { minutes: number; next: CalendarEvent } | null {
  const next = events
    .filter((e) => e.busy && !e.allDay && e.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (!next) return null;
  const inProgress = events.some((e) => e.busy && !e.allDay && e.start <= now && e.end > now);
  if (inProgress) return null;
  return { minutes: Math.floor((next.start.getTime() - now.getTime()) / 60_000), next };
}
