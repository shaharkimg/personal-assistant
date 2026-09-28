// Pure helpers for multi-item workflows (deadlines from documents, meeting summaries).
import { addDays, atTime, combineDateTime, fromDateKey } from "./dates";

/**
 * Default reminder for a deadline: 3 days before at 09:00, or the morning of the day if that
 * has passed. Returns null when the deadline itself is already past.
 */
export function defaultDeadlineReminder(dueDate: string, dueTime: string | null | undefined, now: Date): Date | null {
  const due = combineDateTime(dueDate, dueTime ?? "23:59");
  if (due <= now) return null;
  const day = fromDateKey(dueDate);
  for (const candidate of [atTime(addDays(day, -3), "09:00"), atTime(day, "08:00")]) {
    if (candidate > now && candidate < due) return candidate;
  }
  return null;
}

export interface MeetingSummaryInput {
  title: string;
  date: string;
  attendees?: string[] | null;
  summary: string;
  decisions?: string[] | null;
  tasks?: { title: string; dueDate?: string | null; relatedPerson?: string | null }[] | null;
  waitingFor?: { person: string; subject: string; expectedResponseDate?: string | null }[] | null;
}

/** Note body for a meeting summary; plain text so it reads well anywhere. */
export function meetingNoteBody(m: MeetingSummaryInput): string {
  const lines: string[] = [];
  if (m.attendees?.length) lines.push(`משתתפים: ${m.attendees.join(", ")}`, "");
  lines.push(m.summary.trim());
  const section = (title: string, items: string[]) => {
    if (!items.length) return;
    lines.push("", `${title}:`, ...items.map((i) => `• ${i}`));
  };
  section("החלטות", m.decisions ?? []);
  section(
    "משימות",
    (m.tasks ?? []).map((t) => [t.title, t.relatedPerson ? `(${t.relatedPerson})` : "", t.dueDate ? `עד ${t.dueDate}` : ""].filter(Boolean).join(" ")),
  );
  section(
    "ממתין ל",
    (m.waitingFor ?? []).map((w) => `${w.person}: ${w.subject}${w.expectedResponseDate ? ` (עד ${w.expectedResponseDate})` : ""}`),
  );
  return lines.join("\n");
}
