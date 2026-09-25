import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { DateKey, DateTime, RecurrenceSchema, TimeHM, Uuid } from "../schemas";
import { completeTask, createTask, deleteTask, getTask, listTasks, searchTasks, updateTask } from "@/data/tasks";
import { findProjectByName } from "@/data/projects";
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from "@/domain/types";
import { describeRecurrence } from "@/domain/recurrence";
import { toDateKey } from "@/domain/dates";

/** Compact view of a task for the model. */
export function taskView(t: Task) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    dueTime: t.dueTime?.slice(0, 5),
    remindAt: t.remindAt ? new Date(t.remindAt) : null,
    project: t.projectId,
    person: t.relatedPerson,
    recurrence: t.recurrence ? describeRecurrence(t.recurrence) : null,
    completedAt: t.completedAt,
    description: t.description,
  };
}

const TaskFields = {
  title: z.string().min(1).max(300).describe("Short actionable title in the user's language"),
  description: z.string().max(4000).nullish(),
  status: z.enum(TASK_STATUSES).nullish().describe("Omit to infer from dueDate (today/upcoming/inbox)"),
  priority: z.enum(TASK_PRIORITIES).nullish(),
  dueDate: DateKey.nullish(),
  dueTime: TimeHM.nullish(),
  remindAt: DateTime.nullish().describe("When to send a reminder notification"),
  projectName: z.string().nullish().describe("Existing project name to attach to"),
  tags: z.array(z.string().max(40)).max(10).nullish(),
  relatedPerson: z.string().max(120).nullish(),
  followUpDate: DateKey.nullish(),
  recurrence: RecurrenceSchema.nullish(),
  estimatedMinutes: z.number().int().min(1).max(1440).nullish(),
};

async function resolveProject(name: string | null | undefined): Promise<string | null | undefined> {
  if (name === undefined) return undefined;
  if (!name) return null;
  const p = await findProjectByName(name);
  if (!p) throw new ToolError(`Project "${name}" not found. Use listProjects or createProject first.`);
  return p.id;
}

export const taskTools = [
  defineTool({
    name: "createTask",
    label: "יוצר משימה",
    doneLabel: "נוצרה משימה",
    description:
      "Create a task in the user's task manager. Use for to-dos (with or without a date). For time-based reminders prefer createReminder. Supports recurrence.",
    schema: z.object(TaskFields),
    risk: "safe",
    async run(i) {
      const t = await createTask(
        {
          title: i.title,
          description: i.description,
          status: i.status ?? undefined,
          priority: i.priority ?? undefined,
          dueDate: i.dueDate,
          dueTime: i.dueTime,
          remindAt: i.remindAt ? new Date(i.remindAt).toISOString() : null,
          projectId: await resolveProject(i.projectName),
          tags: i.tags ?? [],
          relatedPerson: i.relatedPerson,
          followUpDate: i.followUpDate,
          recurrence: i.recurrence ?? null,
          estimatedMinutes: i.estimatedMinutes,
          source: "assistant",
        },
        "assistant",
      );
      return { created: taskView(t) };
    },
  }),

  defineTool({
    name: "createReminder",
    label: "קובע תזכורת",
    doneLabel: "נקבעה תזכורת",
    description:
      "Create a reminder: a task that triggers a notification at remindAt. Use for 'remind me to…' requests. Default times if vague: morning 09:00, noon 12:00, afternoon 16:00, evening 19:00.",
    schema: z.object({
      title: z.string().min(1).max(300),
      remindAt: DateTime,
      notes: z.string().max(2000).nullish(),
      relatedPerson: z.string().max(120).nullish(),
      recurrence: RecurrenceSchema.nullish(),
    }),
    risk: "safe",
    async run(i, ctx) {
      const at = new Date(i.remindAt);
      if (at.getTime() < ctx.now.getTime() - 60_000) throw new ToolError("remindAt is in the past. Ask the user or pick the next occurrence.");
      const t = await createTask(
        {
          title: i.title,
          description: i.notes,
          dueDate: toDateKey(at),
          dueTime: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
          remindAt: at.toISOString(),
          relatedPerson: i.relatedPerson,
          recurrence: i.recurrence ?? null,
          source: "assistant",
        },
        "assistant",
      );
      return { created: taskView(t), notification: "scheduled" };
    },
  }),

  defineTool({
    name: "updateTask",
    label: "מעדכן משימה",
    doneLabel: "עודכנה משימה",
    description: "Update fields of an existing task (reschedule, rename, change priority/status/project). Get the id via searchTasks/listTasks first.",
    schema: z.object(TaskFields).partial().extend({ id: Uuid }),
    risk: "safe",
    async run(i) {
      const { id, projectName, remindAt, ...rest } = i;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (remindAt !== undefined) patch.remindAt = remindAt ? new Date(remindAt).toISOString() : null;
      const projectId = await resolveProject(projectName);
      if (projectId !== undefined) patch.projectId = projectId;
      const t = await updateTask(id, patch, "assistant");
      return { updated: taskView(t) };
    },
  }),

  defineTool({
    name: "completeTask",
    label: "מסמן כבוצע",
    doneLabel: "סומן כבוצע",
    description: "Mark a task as completed. Recurring tasks automatically get their next occurrence.",
    schema: z.object({ id: Uuid }),
    risk: "safe",
    async run({ id }) {
      const { task, next } = await completeTask(id, "assistant");
      return { completed: taskView(task), nextOccurrence: next ? taskView(next) : null };
    },
  }),

  defineTool({
    name: "searchTasks",
    label: "מחפש משימות",
    doneLabel: "חיפוש משימות",
    description: "Full-text search over tasks by title, description or related person.",
    schema: z.object({ query: z.string().min(1).max(200), includeCompleted: z.boolean().nullish() }),
    risk: "safe",
    async run(i) {
      return { tasks: (await searchTasks(i.query, { includeCompleted: i.includeCompleted ?? false })).map(taskView) };
    },
  }),

  defineTool({
    name: "listTasks",
    label: "טוען משימות",
    doneLabel: "נטענו משימות",
    description: "List tasks by status and/or due-date range. For 'what do I need to do today' use statuses [today] plus dueTo=today.",
    schema: z.object({
      statuses: z.array(z.enum(TASK_STATUSES)).nullish(),
      dueFrom: DateKey.nullish(),
      dueTo: DateKey.nullish(),
      projectName: z.string().nullish(),
      limit: z.number().int().min(1).max(100).nullish(),
    }),
    risk: "safe",
    async run(i) {
      const projectId = (await resolveProject(i.projectName)) ?? undefined;
      const tasks = await listTasks({
        statuses: i.statuses ?? undefined,
        dueFrom: i.dueFrom ?? undefined,
        dueTo: i.dueTo ?? undefined,
        projectId,
        limit: i.limit ?? 50,
      });
      return { tasks: tasks.map(taskView) };
    },
  }),

  defineTool({
    name: "deleteTask",
    label: "מוחק משימה",
    doneLabel: "נמחקה משימה",
    description: "Permanently delete a task. Requires user confirmation. Prefer completeTask when the task was done.",
    schema: z.object({ id: Uuid }),
    risk: "confirm",
    async preview({ id }) {
      const t = await getTask(id);
      if (!t) throw new ToolError("task not found");
      return { title: "למחוק את המשימה?", body: t.title, confirmLabel: "מחק", destructive: true };
    },
    async run({ id }) {
      await deleteTask(id, "assistant");
      return { deleted: id };
    },
  }),
];
