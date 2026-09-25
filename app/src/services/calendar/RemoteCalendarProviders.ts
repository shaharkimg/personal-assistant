import type { CalendarEvent } from "@/domain/types";
import type { CalendarInfo, CalendarProvider, EventPatch, NewEventInput } from "./CalendarProvider";

/**
 * Direct cloud integrations (planned). Most users already sync Google/Outlook into the OS
 * calendar, which DeviceCalendarProvider covers today. Direct providers add server-side
 * features (push when the app is closed, shared calendars, meeting invitations).
 *
 * Integration plan (same for both):
 *   1. OAuth 2.0 + PKCE in the app (expo-auth-session), scopes: Google `calendar.events`,
 *      Microsoft Graph `Calendars.ReadWrite` + `offline_access` — nothing broader.
 *   2. The app sends the auth code to an edge function (`calendar-oauth`) which exchanges it
 *      and stores the refresh token encrypted (Supabase Vault) — tokens never live on the phone.
 *   3. A `calendar-proxy` edge function performs list/create/update/delete with the stored token.
 *   4. The provider below calls that proxy; CalendarService merges it with the device provider
 *      and de-duplicates events that exist in both (by iCalUID).
 */
abstract class RemoteCalendarProvider implements CalendarProvider {
  abstract readonly id: CalendarEvent["provider"];
  async isAvailable() {
    return false;
  }
  async requestAccess(): Promise<boolean> {
    throw new Error(`${this.id} integration is not enabled yet`);
  }
  async listCalendars(): Promise<CalendarInfo[]> {
    return [];
  }
  async listEvents(): Promise<CalendarEvent[]> {
    return [];
  }
  async getEvent(): Promise<CalendarEvent | null> {
    return null;
  }
  createEvent(_: NewEventInput): Promise<CalendarEvent> {
    throw new Error(`${this.id} integration is not enabled yet`);
  }
  updateEvent(_: string, __: EventPatch): Promise<CalendarEvent> {
    throw new Error(`${this.id} integration is not enabled yet`);
  }
  deleteEvent(_: string): Promise<void> {
    throw new Error(`${this.id} integration is not enabled yet`);
  }
}

export class GoogleCalendarProvider extends RemoteCalendarProvider {
  readonly id = "google" as const;
}

export class OutlookCalendarProvider extends RemoteCalendarProvider {
  readonly id = "outlook" as const;
}
