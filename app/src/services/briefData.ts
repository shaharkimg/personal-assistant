import type { BriefInput } from "@/domain/brief";
import { addDays, startOfDay } from "@/domain/dates";
import { listTasks } from "@/data/tasks";
import { listWaiting } from "@/data/waiting";
import { listInbox } from "@/data/inbox";
import { listDocuments } from "@/data/documents";
import { calendarService } from "@/services/calendar/CalendarService";

/** Everything the home screen, briefs and the notification planner need — from real sources only. */
export async function loadBriefInput(now = new Date(), days = 2): Promise<BriefInput & { calendarConnected: boolean }> {
  const calendarConnected = await calendarService.hasAccess().catch(() => false);
  const [tasks, waiting, events, inbox, documents] = await Promise.all([
    listTasks({ includeCompletedSince: startOfDay(addDays(now, -1)).toISOString() }),
    listWaiting("open"),
    calendarConnected ? calendarService.listNearTerm(now, days).catch(() => []) : Promise.resolve([]),
    listInbox("new").catch(() => []),
    listDocuments({ limit: 5 }).catch(() => []),
  ]);
  return { now, tasks, waiting, events, inbox, documents, calendarConnected };
}
