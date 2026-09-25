import type { CalendarEvent, Task, WaitingFor } from "@/domain/types";

let n = 0;
export function task(p: Partial<Task> = {}): Task {
  n++;
  return {
    id: `t${n}`,
    title: `task ${n}`,
    description: null,
    status: "inbox",
    priority: "normal",
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: "2026-09-20T08:00:00.000Z",
    dueDate: null,
    dueTime: null,
    remindAt: null,
    completedAt: null,
    projectId: null,
    tags: [],
    source: "manual",
    relatedPerson: null,
    relatedPersonId: null,
    followUpDate: null,
    recurrence: null,
    recurrenceParentId: null,
    estimatedMinutes: null,
    rolledOverCount: 0,
    ...p,
  };
}

export function event(title: string, start: Date, end: Date, p: Partial<CalendarEvent> = {}): CalendarEvent {
  n++;
  return { id: `e${n}`, provider: "device", calendarId: "c1", title, start, end, allDay: false, location: null, notes: null, busy: true, ...p };
}

export function waiting(p: Partial<WaitingFor> = {}): WaitingFor {
  n++;
  return {
    id: `w${n}`,
    person: "דני",
    personId: null,
    subject: "ההסכם",
    createdAt: "2026-09-21T08:00:00.000Z",
    expectedResponseDate: null,
    status: "open",
    relatedTaskId: null,
    projectId: null,
    notes: null,
    lastNudgedAt: null,
    resolvedAt: null,
    ...p,
  };
}

/** Local date helper: at(2026, 9, 25, 9, 30) */
export function at(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min);
}
