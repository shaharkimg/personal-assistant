import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { DateKey, DateTime, TimeHM, Uuid } from "../schemas";
import { createTask } from "@/data/tasks";
import { createWaiting } from "@/data/waiting";
import { createNote } from "@/data/notes";
import { getDocument } from "@/data/documents";
import { findProjectByName } from "@/data/projects";
import { toDateKey } from "@/domain/dates";
import { defaultDeadlineReminder, meetingNoteBody } from "@/domain/workflows";
import { taskView } from "./tasks";

const Deadline = z.object({
  title: z.string().min(1).max(300).describe("Actionable title, e.g. 'להגיש כתב הגנה – תיק כהן'"),
  dueDate: DateKey,
  dueTime: TimeHM.nullish(),
  remindAt: DateTime.nullish().describe("Omit to default to 3 days before at 09:00"),
  quote: z.string().min(1).max(500).describe("The exact sentence from the document this date comes from"),
  priority: z.enum(["normal", "high", "urgent"]).nullish(),
});

const MeetingTask = z.object({
  title: z.string().min(1).max(300),
  dueDate: DateKey.nullish(),
  relatedPerson: z.string().max(120).nullish().describe("Who it involves (not necessarily the owner)"),
  priority: z.enum(["low", "normal", "high", "urgent"]).nullish(),
});

const MeetingWaiting = z.object({
  person: z.string().min(1).max(120),
  subject: z.string().min(1).max(300),
  expectedResponseDate: DateKey.nullish(),
});

async function projectId(name: string | null | undefined): Promise<string | null> {
  if (!name) return null;
  const p = await findProjectByName(name);
  if (!p) throw new ToolError(`Project "${name}" not found. Use listProjects or omit projectName.`);
  return p.id;
}

export const workflowTools = [
  defineTool({
    name: "proposeDeadlines",
    label: "מכין רשימת מועדים",
    doneLabel: "נוספו מועדים",
    description:
      "Create reminders for the deadlines and important dates found in a document (filing deadlines, hearings, payment dates, notice periods, renewals, expiries). " +
      "Read the document first (readDocument), then call this ONCE with every actionable date; the user approves the whole list on one card. " +
      "Compute derived dates ('within 30 days of receipt') only when the anchor date is stated; otherwise mention it in your reply instead of guessing.",
    schema: z.object({
      documentId: Uuid,
      deadlines: z.array(Deadline).min(1).max(30),
    }),
    risk: "confirm",
    async preview(i) {
      const doc = await getDocument(i.documentId);
      const sorted = [...i.deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return {
        title: `${i.deadlines.length} מועדים מתוך "${doc?.title ?? "המסמך"}"`,
        body: sorted.map((d) => `${d.dueDate}${d.dueTime ? ` ${d.dueTime}` : ""} – ${d.title}`).join("\n"),
        details: [{ label: "תזכורת", value: "3 ימים לפני כל מועד ב-09:00, אלא אם צוין אחרת" }],
        confirmLabel: "צור תזכורות",
      };
    },
    async run(i, ctx) {
      const doc = await getDocument(i.documentId);
      if (!doc) throw new ToolError("document not found");
      const created = [];
      for (const d of i.deadlines) {
        const remindAt = d.remindAt ? new Date(d.remindAt) : defaultDeadlineReminder(d.dueDate, d.dueTime, ctx.now);
        const t = await createTask(
          {
            title: d.title,
            description: `מתוך "${doc.title}": "${d.quote}"`,
            dueDate: d.dueDate,
            dueTime: d.dueTime,
            remindAt: remindAt && remindAt > ctx.now ? remindAt.toISOString() : null,
            priority: d.priority ?? "high",
            projectId: doc.projectId,
            tags: ["מועד"],
            source: "assistant",
          },
          "assistant",
        );
        created.push(taskView(t));
      }
      return { created, pastDates: i.deadlines.filter((d) => d.dueDate < toDateKey(ctx.now)).map((d) => d.title) };
    },
  }),

  defineTool({
    name: "logMeeting",
    label: "מסכם פגישה",
    doneLabel: "נשמר סיכום פגישה",
    description:
      "Save everything from a meeting the user just had, in one step: a summary note, action items as tasks, and things others owe them as waiting-for items. " +
      "Use when the user describes or dictates a meeting ('סיכום פגישה…', 'היה לי עכשיו פגישה עם…'). Call it ONCE with all items. " +
      "Afterwards, if someone should get a follow-up message, offer a short draft (and send it only via sendMessage).",
    schema: z.object({
      title: z.string().min(1).max(200).describe("Meeting title or with whom"),
      date: DateKey.nullish().describe("Defaults to today"),
      attendees: z.array(z.string().max(120)).max(20).nullish(),
      summary: z.string().min(1).max(4000).describe("Short summary in the user's language: what was discussed"),
      decisions: z.array(z.string().max(300)).max(20).nullish(),
      tasks: z.array(MeetingTask).max(20).nullish().describe("Things the USER needs to do"),
      waitingFor: z.array(MeetingWaiting).max(20).nullish().describe("Things OTHERS promised to send or do"),
      projectName: z.string().nullish(),
    }),
    risk: "confirm",
    preview(i) {
      const lines = [i.summary];
      if (i.tasks?.length) lines.push("", "משימות:", ...i.tasks.map((t) => `• ${t.title}${t.dueDate ? ` (עד ${t.dueDate})` : ""}`));
      if (i.waitingFor?.length) lines.push("", "ממתין ל:", ...i.waitingFor.map((w) => `• ${w.person}: ${w.subject}`));
      return {
        title: `סיכום: ${i.title}`,
        body: lines.join("\n"),
        details: [
          { label: "יישמרו", value: `הערת סיכום, ${i.tasks?.length ?? 0} משימות, ${i.waitingFor?.length ?? 0} מעקבים` },
        ],
        confirmLabel: "שמור",
      };
    },
    async run(i, ctx) {
      const date = i.date ?? toDateKey(ctx.now);
      const project = await projectId(i.projectName);
      const note = await createNote(
        {
          title: `סיכום פגישה: ${i.title} (${date})`,
          body: meetingNoteBody({ ...i, date }),
          kind: "note",
          projectId: project,
          tags: ["פגישה"],
          source: "assistant",
        },
        "assistant",
      );
      const tasks = [];
      for (const t of i.tasks ?? []) {
        tasks.push(
          taskView(
            await createTask(
              {
                title: t.title,
                description: `מתוך הפגישה "${i.title}" (${date})`,
                dueDate: t.dueDate,
                priority: t.priority ?? undefined,
                relatedPerson: t.relatedPerson,
                projectId: project,
                tags: ["פגישה"],
                source: "assistant",
              },
              "assistant",
            ),
          ),
        );
      }
      const waiting = [];
      for (const w of i.waitingFor ?? []) {
        const item = await createWaiting(
          { person: w.person, subject: w.subject, expectedResponseDate: w.expectedResponseDate, projectId: project, notes: `מהפגישה "${i.title}" (${date})` },
          "assistant",
        );
        waiting.push({ id: item.id, person: item.person, subject: item.subject, expectedResponseDate: item.expectedResponseDate });
      }
      return { noteId: note.id, tasks, waiting };
    },
  }),
];
