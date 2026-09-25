import type { CalendarEvent, TimeSlot } from "@/domain/types";
import { findAvailableSlots, findConflicts, type AvailabilityOptions } from "@/domain/availability";
import { addDays, endOfDay, startOfDay } from "@/domain/dates";
import { logActivity, type Actor } from "@/data/db";
import type { CalendarProvider, EventPatch, NewEventInput } from "./CalendarProvider";
import { DeviceCalendarProvider } from "./DeviceCalendarProvider";
import { GoogleCalendarProvider, OutlookCalendarProvider } from "./RemoteCalendarProviders";

export class CalendarPermissionError extends Error {
  constructor() {
    super("אין הרשאת גישה ליומן");
  }
}

/** Aggregates providers; writes go to the device calendar unless a provider is specified. */
class CalendarService {
  constructor(private providers: CalendarProvider[]) {}

  private get primary(): CalendarProvider {
    return this.providers[0];
  }

  async hasAccess(): Promise<boolean> {
    return this.primary.isAvailable();
  }

  async requestAccess(): Promise<boolean> {
    return this.primary.requestAccess();
  }

  private async ensureAccess() {
    if (!(await this.primary.isAvailable())) throw new CalendarPermissionError();
  }

  async listEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const all: CalendarEvent[] = [];
    for (const p of this.providers) {
      if (await p.isAvailable()) all.push(...(await p.listEvents(start, end)));
    }
    return all.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /** Today + tomorrow, tolerant of missing permission (returns []). */
  async listNearTerm(now = new Date(), days = 2): Promise<CalendarEvent[]> {
    if (!(await this.hasAccess())) return [];
    return this.listEvents(startOfDay(now), endOfDay(addDays(now, days - 1)));
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    await this.ensureAccess();
    return this.primary.getEvent(id);
  }

  async findSlots(opts: AvailabilityOptions, limit = 5): Promise<TimeSlot[]> {
    await this.ensureAccess();
    const events = await this.listEvents(startOfDay(opts.rangeStart), endOfDay(opts.rangeEnd));
    return findAvailableSlots(events, opts, limit);
  }

  async conflictsFor(start: Date, end: Date, ignoreId?: string): Promise<CalendarEvent[]> {
    await this.ensureAccess();
    const events = await this.listEvents(startOfDay(start), endOfDay(end));
    return findConflicts(events, start, end, ignoreId);
  }

  async createEvent(input: NewEventInput, actor: Actor): Promise<CalendarEvent> {
    await this.ensureAccess();
    const e = await this.primary.createEvent(input);
    await logActivity(actor, "calendar.created", `נוסף אירוע: ${e.title}`, { type: "event", id: e.id }, { start: e.start.toISOString() });
    return e;
  }

  async updateEvent(id: string, patch: EventPatch, actor: Actor): Promise<CalendarEvent> {
    await this.ensureAccess();
    const e = await this.primary.updateEvent(id, patch);
    await logActivity(actor, "calendar.updated", `עודכן אירוע: ${e.title}`, { type: "event", id }, { changed: Object.keys(patch) });
    return e;
  }

  async deleteEvent(id: string, actor: Actor): Promise<void> {
    await this.ensureAccess();
    const e = await this.primary.getEvent(id);
    await this.primary.deleteEvent(id);
    await logActivity(actor, "calendar.deleted", `בוטל אירוע: ${e?.title ?? id}`, { type: "event", id });
  }
}

export const calendarService = new CalendarService([
  new DeviceCalendarProvider(),
  new GoogleCalendarProvider(),
  new OutlookCalendarProvider(),
]);
