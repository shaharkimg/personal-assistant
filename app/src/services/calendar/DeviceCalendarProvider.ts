import { Platform } from "react-native";
import * as Calendar from "expo-calendar";
import type { CalendarEvent } from "@/domain/types";
import type { CalendarInfo, CalendarProvider, EventPatch, NewEventInput } from "./CalendarProvider";

function toEvent(e: Calendar.ExpoCalendarEvent, titles: Map<string, string>): CalendarEvent {
  return {
    id: e.id,
    provider: "device",
    calendarId: e.calendarId,
    calendarTitle: titles.get(e.calendarId),
    title: e.title || "(ללא כותרת)",
    start: new Date(e.startDate),
    end: new Date(e.endDate),
    allDay: e.allDay,
    location: e.location || null,
    notes: e.notes || null,
    busy: e.availability !== Calendar.Availability.FREE,
  };
}

export class DeviceCalendarProvider implements CalendarProvider {
  readonly id = "device" as const;
  private calendars: Calendar.ExpoCalendar[] | null = null;

  async isAvailable(): Promise<boolean> {
    const p = await Calendar.getCalendarPermissions();
    return p.granted;
  }

  async requestAccess(): Promise<boolean> {
    const p = await Calendar.requestCalendarPermissions();
    this.calendars = null;
    return p.granted;
  }

  private async loadCalendars(): Promise<Calendar.ExpoCalendar[]> {
    if (!this.calendars) this.calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    return this.calendars;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const cals = await this.loadCalendars();
    return cals.map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color,
      writable: c.allowsModifications,
      primary: Boolean((c as { isPrimary?: boolean }).isPrimary),
      source: c.source?.name ?? "",
    }));
  }

  private async titles(): Promise<Map<string, string>> {
    return new Map((await this.loadCalendars()).map((c) => [c.id, c.title]));
  }

  async listEvents(start: Date, end: Date): Promise<CalendarEvent[]> {
    const cals = await this.loadCalendars();
    if (!cals.length) return [];
    const events = await Calendar.listEvents(cals.map((c) => c.id), start, end);
    const titles = await this.titles();
    return events.map((e) => toEvent(e, titles)).sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  async getEvent(id: string): Promise<CalendarEvent | null> {
    try {
      return toEvent(await Calendar.ExpoCalendarEvent.get(id), await this.titles());
    } catch {
      return null;
    }
  }

  /** Default writable calendar: iOS default calendar, otherwise the primary writable one. */
  private async writableCalendar(preferredId?: string): Promise<Calendar.ExpoCalendar> {
    const cals = await this.loadCalendars();
    if (preferredId) {
      const c = cals.find((x) => x.id === preferredId && x.allowsModifications);
      if (c) return c;
    }
    if (Platform.OS === "ios") {
      try {
        return Calendar.getDefaultCalendarSync();
      } catch {
        /* fall through */
      }
    }
    const writable = cals.filter((c) => c.allowsModifications);
    const primary = writable.find((c) => (c as { isPrimary?: boolean }).isPrimary) ?? writable[0];
    if (!primary) throw new Error("no writable calendar on this device");
    return primary;
  }

  async createEvent(input: NewEventInput): Promise<CalendarEvent> {
    const cal = await this.writableCalendar(input.calendarId);
    const created = await cal.createEvent({
      title: input.title,
      startDate: input.start,
      endDate: input.end,
      allDay: input.allDay ?? false,
      location: input.location ?? undefined,
      notes: input.notes ?? undefined,
      alarms: input.alarmMinutesBefore != null ? [{ relativeOffset: -input.alarmMinutesBefore }] : undefined,
    });
    return toEvent(created, await this.titles());
  }

  async updateEvent(id: string, patch: EventPatch): Promise<CalendarEvent> {
    const ev = await Calendar.ExpoCalendarEvent.get(id);
    await ev.update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.start ? { startDate: patch.start } : {}),
      ...(patch.end ? { endDate: patch.end } : {}),
      ...(patch.location !== undefined ? { location: patch.location ?? "" } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes ?? "" } : {}),
      ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
    });
    return toEvent(await Calendar.ExpoCalendarEvent.get(id), await this.titles());
  }

  async deleteEvent(id: string): Promise<void> {
    const ev = await Calendar.ExpoCalendarEvent.get(id);
    await ev.delete();
  }
}
