import type { CalendarEvent } from "@/domain/types";

export interface NewEventInput {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  notes?: string | null;
  allDay?: boolean;
  /** Minutes before start for a native alarm. */
  alarmMinutesBefore?: number | null;
  calendarId?: string;
}

export type EventPatch = Partial<Omit<NewEventInput, "calendarId">>;

export interface CalendarInfo {
  id: string;
  title: string;
  color?: string;
  writable: boolean;
  primary: boolean;
  source: string;
}

/**
 * One calendar backend. The device provider reads/writes the OS calendar (which already syncs
 * Google / Exchange / iCloud accounts the user added to the phone). Direct cloud providers
 * (Google Calendar API, Microsoft Graph) implement the same interface — see RemoteCalendarProviders.ts.
 */
export interface CalendarProvider {
  readonly id: CalendarEvent["provider"];
  isAvailable(): Promise<boolean>;
  requestAccess(): Promise<boolean>;
  listCalendars(): Promise<CalendarInfo[]>;
  listEvents(start: Date, end: Date): Promise<CalendarEvent[]>;
  getEvent(id: string): Promise<CalendarEvent | null>;
  createEvent(input: NewEventInput): Promise<CalendarEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
}
