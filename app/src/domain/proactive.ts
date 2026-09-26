// Plans local notifications from real state, honoring the user's proactivity level and quiet hours.
import type { CalendarEvent, Proactivity, Task, WaitingFor } from "./types";
import { addDays, addMinutes, atTime, combineDateTime, minutesBetween, timeToMinutes, toDateKey } from "./dates";
import { morningBriefBody, overdueWaiting, tasksForToday } from "./brief";
import { gapBeforeNextEvent } from "./availability";

export interface PlannedNotification {
  /** Stable id so re-planning replaces rather than duplicates. */
  id: string;
  at: Date;
  title: string;
  body: string;
  /** Deep link opened when tapped. */
  url: string;
  kind: "reminder" | "meeting" | "meeting_summary" | "task_nudge" | "waiting" | "free_time" | "brief" | "review";
  /** Set on task notifications so they can offer "done" / "tomorrow" actions. */
  taskId?: string;
}

export interface PlanSettings {
  proactivity: Proactivity;
  quietHoursStart: string;
  quietHoursEnd: string;
  morningBriefTime: string | null;
  eveningReviewTime: string | null;
  meetingLeadMinutes?: number;
}

export interface PlanInput {
  now: Date;
  tasks: Task[];
  waiting: WaitingFor[];
  events: CalendarEvent[];
  settings: PlanSettings;
}

export function isQuietTime(d: Date, start: string, end: string): boolean {
  const m = d.getHours() * 60 + d.getMinutes();
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/** Moves a time out of quiet hours to the end of the quiet window. */
export function deferOutOfQuietHours(d: Date, start: string, end: string): Date {
  if (!isQuietTime(d, start, end)) return d;
  let target = atTime(d, end);
  if (target <= d) target = atTime(addDays(d, 1), end);
  return target;
}

const LEVEL = { off: 0, low: 1, balanced: 2, high: 3 } as const;

export function planNotifications(input: PlanInput, horizonHours = 36): PlannedNotification[] {
  const { now, settings } = input;
  const level = LEVEL[settings.proactivity];
  const horizon = new Date(now.getTime() + horizonHours * 3600_000);
  const out: PlannedNotification[] = [];
  const push = (n: PlannedNotification, respectQuiet = true) => {
    const at = respectQuiet ? deferOutOfQuietHours(n.at, settings.quietHoursStart, settings.quietHoursEnd) : n.at;
    if (at > now && at <= horizon) out.push({ ...n, at });
  };

  // Explicit reminders are always delivered — the user asked for them (and they bypass quiet hours).
  for (const t of input.tasks) {
    if (t.status === "completed" || !t.remindAt) continue;
    push({ id: `rem:${t.id}`, at: new Date(t.remindAt), title: "תזכורת", body: t.title, url: `/tasks/${t.id}`, kind: "reminder", taskId: t.id }, false);
  }
  if (level === 0) return out;

  const lead = settings.meetingLeadMinutes ?? 30;
  for (const e of input.events) {
    if (e.allDay || !e.busy) continue;
    push({
      id: `mtg:${e.id}:${e.start.getTime()}`,
      at: addMinutes(e.start, -lead),
      title: `בעוד ${lead} דקות`,
      body: `יש לך פגישה: ${e.title}${e.location ? ` (${e.location})` : ""}`,
      url: "/",
      kind: "meeting",
    });
  }

  if (settings.morningBriefTime) {
    for (const day of [now, addDays(now, 1)]) {
      push({
        id: `brief:${toDateKey(day)}`,
        at: atTime(day, settings.morningBriefTime),
        title: "בוקר טוב ☀️",
        body: morningBriefBody(input, atTime(day, settings.morningBriefTime)),
        url: "/brief",
        kind: "brief",
      });
    }
  }
  if (level < 2) return out;

  // Nudge for tasks due today that aren't done, late afternoon.
  for (const t of tasksForToday(input.tasks, now).filter((t) => t.priority === "high" || t.priority === "urgent").slice(0, 3)) {
    const at = t.dueDate && t.dueTime ? addMinutes(combineDateTime(t.dueDate, t.dueTime), -60) : atTime(now, "16:00");
    push({ id: `nudge:${t.id}`, at, title: "עדיין פתוח", body: `המשימה "${t.title}" עדיין לא הושלמה.`, url: `/tasks/${t.id}`, kind: "task_nudge", taskId: t.id });
  }

  // Right after a meeting ends: offer a one-minute voice summary (tasks, follow-ups, notes).
  for (const e of input.events) {
    if (e.allDay || !e.busy || minutesBetween(e.start, e.end) < 20) continue;
    push({
      id: `msum:${e.id}:${e.start.getTime()}`,
      at: addMinutes(e.end, 5),
      title: "לסכם את הפגישה?",
      body: `"${e.title}" הסתיימה. דקה של הקלטה ואני ארשום סיכום, משימות ומעקבים.`,
      url: `/capture?meeting=${encodeURIComponent(e.title)}`,
      kind: "meeting_summary",
    });
  }

  for (const w of overdueWaiting(input.waiting, addDays(now, 1))) {
    const due = w.expectedResponseDate! <= toDateKey(now) ? addMinutes(now, 60) : atTime(addDays(now, 1), "09:30");
    const days = Math.max(1, Math.round((now.getTime() - new Date(w.createdAt).getTime()) / 86_400_000));
    push({
      id: `wait:${w.id}`,
      at: due,
      title: "ממתין לתשובה",
      body: `עברו ${days} ימים ועדיין לא סימנת שקיבלת תשובה מ${w.person}. להכין הודעת follow-up?`,
      url: `/chat?prompt=${encodeURIComponent(`הכן הודעת follow-up ל${w.person} לגבי "${w.subject}" (פריט ממתין ${w.id})`)}`,
      kind: "waiting",
    });
  }

  if (settings.eveningReviewTime) {
    push({ id: `review:${toDateKey(now)}`, at: atTime(now, settings.eveningReviewTime), title: "סיכום היום", body: "רוצה לעבור על מה שהספקת היום?", url: "/review", kind: "review" });
  }
  if (level < 3) return out;

  // "You have 20 free minutes before the next meeting" — computed for right now only.
  const gap = gapBeforeNextEvent(input.events, now);
  if (gap && gap.minutes >= 20 && gap.minutes <= 90) {
    const quick = tasksForToday(input.tasks, now).find((t) => (t.estimatedMinutes ?? 15) <= gap.minutes - 5);
    if (quick) {
      push({
        id: `gap:${gap.next.id}`,
        at: addMinutes(now, 1),
        title: `${gap.minutes} דקות פנויות`,
        body: `יש לך ${gap.minutes} דקות פנויות לפני ${gap.next.title}. רוצה לטפל ב"${quick.title}"?`,
        url: `/tasks/${quick.id}`,
        kind: "free_time",
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
