import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { DateKey, DateTime } from "../schemas";
import { calendarService } from "@/services/calendar/CalendarService";
import type { CalendarEvent } from "@/domain/types";
import { addMinutes, endOfDay, formatTime, fromDateKey, relativeDayLabel, startOfDay } from "@/domain/dates";

function view(e: CalendarEvent) {
  return {
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    location: e.location,
    calendar: e.calendarTitle,
    busy: e.busy,
  };
}

function describe(e: { start: Date; end: Date }): string {
  return `${relativeDayLabel(e.start)} ${formatTime(e.start)}–${formatTime(e.end)}`;
}

const EventInput = z.object({
  title: z.string().min(1).max(200),
  start: DateTime,
  end: DateTime.nullish().describe("Defaults to start + durationMinutes"),
  durationMinutes: z.number().int().min(5).max(24 * 60).nullish(),
  location: z.string().max(200).nullish(),
  notes: z.string().max(4000).nullish(),
  alarmMinutesBefore: z.number().int().min(0).max(10080).nullish(),
});

function range(i: { start: string; end?: string | null; durationMinutes?: number | null }) {
  const start = new Date(i.start);
  const end = i.end ? new Date(i.end) : addMinutes(start, i.durationMinutes ?? 60);
  if (end <= start) throw new ToolError("end must be after start");
  return { start, end };
}

export const calendarTools = [
  defineTool({
    name: "getCalendarEvents",
    label: "בודק ביומן",
    doneLabel: "נבדק היומן",
    description: "Read events from the user's calendars between two dates (inclusive).",
    schema: z.object({ from: DateKey, to: DateKey }),
    risk: "safe",
    async run(i) {
      const events = await calendarService.listEvents(startOfDay(fromDateKey(i.from)), endOfDay(fromDateKey(i.to)));
      return { events: events.map(view) };
    },
  }),

  defineTool({
    name: "findAvailableTimes",
    label: "מחפש זמנים פנויים",
    doneLabel: "נמצאו זמנים",
    description:
      "Find free slots of a given duration. Use whenever the user asks when they're free or asks to schedule something without an exact time; " +
      "then offer 2–3 options and create the event only after the user picks.",
    schema: z.object({
      from: DateKey,
      to: DateKey,
      durationMinutes: z.number().int().min(5).max(600),
      partOfDay: z.enum(["morning", "noon", "afternoon", "evening"]).nullish(),
      limit: z.number().int().min(1).max(10).nullish(),
    }),
    risk: "safe",
    async run(i, ctx) {
      const slots = await calendarService.findSlots(
        {
          rangeStart: startOfDay(fromDateKey(i.from)),
          rangeEnd: endOfDay(fromDateKey(i.to)),
          durationMinutes: i.durationMinutes,
          partOfDay: i.partOfDay ?? null,
          now: ctx.now,
        },
        i.limit ?? 5,
      );
      return { slots: slots.map((s) => ({ start: s.start, end: s.end, label: describe(s) })) };
    },
  }),

  defineTool({
    name: "createCalendarEvent",
    label: "מוסיף ליומן",
    doneLabel: "נוסף ליומן",
    description:
      "Create a calendar event at an exact time. The app checks conflicts: if the slot overlaps another event the user must confirm. " +
      "Don't guess times — use findAvailableTimes when the time is vague.",
    schema: EventInput,
    async risk(i) {
      const { start, end } = range(i);
      return (await calendarService.conflictsFor(start, end)).length ? "confirm" : "safe";
    },
    async preview(i) {
      const { start, end } = range(i);
      const conflicts = await calendarService.conflictsFor(start, end);
      return {
        title: conflicts.length ? "יש התנגשות ביומן" : "להוסיף ליומן?",
        body: `${i.title}\n${describe({ start, end })}`,
        details: conflicts.map((c) => ({ label: "מתנגש עם", value: `${c.title} (${formatTime(c.start)}–${formatTime(c.end)})` })),
        confirmLabel: "הוסף בכל זאת",
      };
    },
    async run(i) {
      const { start, end } = range(i);
      const e = await calendarService.createEvent(
        { title: i.title, start, end, location: i.location, notes: i.notes, alarmMinutesBefore: i.alarmMinutesBefore ?? 15 },
        "assistant",
      );
      return { created: view(e) };
    },
  }),

  defineTool({
    name: "updateCalendarEvent",
    label: "מעדכן אירוע",
    doneLabel: "עודכן אירוע",
    description: "Move or edit an existing calendar event. Always requires user confirmation.",
    schema: z.object({
      id: z.string().min(1),
      title: z.string().max(200).nullish(),
      start: DateTime.nullish(),
      end: DateTime.nullish(),
      location: z.string().max(200).nullish(),
      notes: z.string().max(4000).nullish(),
    }),
    risk: "confirm",
    async preview(i) {
      const e = await calendarService.getEvent(i.id);
      if (!e) throw new ToolError("event not found");
      const start = i.start ? new Date(i.start) : e.start;
      const end = i.end ? new Date(i.end) : new Date(start.getTime() + (e.end.getTime() - e.start.getTime()));
      const conflicts = await calendarService.conflictsFor(start, end, e.id);
      return {
        title: "לעדכן את האירוע?",
        body: `${e.title}\n${describe(e)} ← ${describe({ start, end })}`,
        details: [
          ...(i.title ? [{ label: "כותרת חדשה", value: i.title }] : []),
          ...conflicts.map((c) => ({ label: "מתנגש עם", value: c.title })),
        ],
        confirmLabel: "עדכן",
      };
    },
    async run(i) {
      const e = await calendarService.getEvent(i.id);
      if (!e) throw new ToolError("event not found");
      const start = i.start ? new Date(i.start) : undefined;
      const end = i.end ? new Date(i.end) : start ? new Date(start.getTime() + (e.end.getTime() - e.start.getTime())) : undefined;
      const updated = await calendarService.updateEvent(
        i.id,
        { title: i.title ?? undefined, start, end, location: i.location, notes: i.notes },
        "assistant",
      );
      return { updated: view(updated) };
    },
  }),

  defineTool({
    name: "deleteCalendarEvent",
    label: "מבטל אירוע",
    doneLabel: "בוטל אירוע",
    description: "Delete/cancel a calendar event. Always requires user confirmation.",
    schema: z.object({ id: z.string().min(1) }),
    risk: "confirm",
    async preview({ id }) {
      const e = await calendarService.getEvent(id);
      if (!e) throw new ToolError("event not found");
      return { title: "לבטל את האירוע?", body: `${e.title}\n${describe(e)}`, confirmLabel: "בטל אירוע", destructive: true };
    },
    async run({ id }) {
      await calendarService.deleteEvent(id, "assistant");
      return { deleted: id };
    },
  }),
];
