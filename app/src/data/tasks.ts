import type { Recurrence, Task, TaskPriority, TaskSource, TaskStatus } from "@/domain/types";
import { nextOccurrence } from "@/domain/recurrence";
import { toDateKey } from "@/domain/dates";
import { type Actor, fromRow, likePattern, logActivity, supabase, toRow, unwrap } from "./db";

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: string | null;
  projectId?: string | null;
  tags?: string[];
  source?: TaskSource;
  relatedPerson?: string | null;
  relatedPersonId?: string | null;
  followUpDate?: string | null;
  recurrence?: Recurrence | null;
  estimatedMinutes?: number | null;
}

export type TaskPatch = Partial<TaskInput> & { completedAt?: string | null; rolledOverCount?: number };

export interface TaskFilter {
  statuses?: TaskStatus[];
  projectId?: string;
  dueFrom?: string;
  dueTo?: string;
  includeCompletedSince?: string;
  limit?: number;
}

/** Derives a sensible status from the due date when the caller didn't pick one. */
export function inferStatus(input: { status?: TaskStatus; dueDate?: string | null }, today = toDateKey(new Date())): TaskStatus {
  if (input.status) return input.status;
  if (!input.dueDate) return "inbox";
  return input.dueDate <= today ? "today" : "upcoming";
}

export async function listTasks(f: TaskFilter = {}): Promise<Task[]> {
  let q = supabase.from("tasks").select("*");
  if (f.statuses) q = q.in("status", f.statuses);
  if (f.projectId) q = q.eq("project_id", f.projectId);
  if (f.dueFrom) q = q.gte("due_date", f.dueFrom);
  if (f.dueTo) q = q.lte("due_date", f.dueTo);
  if (f.includeCompletedSince) {
    q = q.or(`status.neq.completed,completed_at.gte.${f.includeCompletedSince}`);
  } else if (!f.statuses) {
    q = q.neq("status", "completed");
  }
  const rows = unwrap(await q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at").limit(f.limit ?? 500));
  return rows.map((r) => fromRow<Task>(r));
}

export async function getTask(id: string): Promise<Task | null> {
  const row = unwrap(await supabase.from("tasks").select("*").eq("id", id).maybeSingle());
  return row ? fromRow<Task>(row) : null;
}

export async function searchTasks(query: string, opts: { includeCompleted?: boolean; limit?: number } = {}): Promise<Task[]> {
  let q = supabase.from("tasks").select("*").or(`title.ilike.${likePattern(query)},description.ilike.${likePattern(query)},related_person.ilike.${likePattern(query)}`);
  if (!opts.includeCompleted) q = q.neq("status", "completed");
  const rows = unwrap(await q.order("updated_at", { ascending: false }).limit(opts.limit ?? 20));
  return rows.map((r) => fromRow<Task>(r));
}

export async function createTask(input: TaskInput, actor: Actor = "user"): Promise<Task> {
  const row = unwrap(
    await supabase
      .from("tasks")
      .insert(toRow({ ...input, status: inferStatus(input), source: input.source ?? (actor === "assistant" ? "assistant" : "manual") }))
      .select()
      .single(),
  );
  const task = fromRow<Task>(row);
  await logActivity(actor, "task.created", `נוצרה משימה: ${task.title}`, { type: "task", id: task.id }, { dueDate: task.dueDate });
  return task;
}

export async function updateTask(id: string, patch: TaskPatch, actor: Actor = "user"): Promise<Task> {
  const before = await getTask(id);
  if (!before) throw new Error("task not found");
  const next: TaskPatch = { ...patch };
  // Moving an overdue task forward counts as a roll-over (feeds evening review + stale-task hints).
  const today = toDateKey(new Date());
  if (patch.dueDate && before.dueDate && before.dueDate <= today && patch.dueDate > before.dueDate) {
    next.rolledOverCount = before.rolledOverCount + 1;
  }
  if (patch.dueDate !== undefined && patch.status === undefined && before.status !== "completed" && before.status !== "waiting" && before.status !== "someday") {
    next.status = inferStatus({ dueDate: patch.dueDate });
  }
  const row = unwrap(await supabase.from("tasks").update(toRow(next)).eq("id", id).select().single());
  const task = fromRow<Task>(row);
  const action = next.rolledOverCount !== undefined ? "task.rescheduled" : "task.updated";
  await logActivity(actor, action, `${action === "task.rescheduled" ? "נדחתה" : "עודכנה"} משימה: ${task.title}`, { type: "task", id }, {
    changed: Object.keys(patch),
    fromDate: before.dueDate,
    toDate: task.dueDate,
  });
  return task;
}

/** Completes a task; for recurring tasks, creates the next occurrence. */
export async function completeTask(id: string, actor: Actor = "user"): Promise<{ task: Task; next: Task | null }> {
  const row = unwrap(
    await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).select().single(),
  );
  const task = fromRow<Task>(row);
  await logActivity(actor, "task.completed", `הושלמה משימה: ${task.title}`, { type: "task", id });

  let next: Task | null = null;
  if (task.recurrence) {
    const from = task.dueDate ?? toDateKey(new Date());
    const dueDate = nextOccurrence(task.recurrence, from);
    if (dueDate) {
      let remindAt: string | null = null;
      if (task.remindAt && task.dueDate) {
        const shift = new Date(dueDate).getTime() - new Date(task.dueDate).getTime();
        remindAt = new Date(new Date(task.remindAt).getTime() + shift).toISOString();
      }
      next = await createTask(
        {
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueDate,
          dueTime: task.dueTime,
          remindAt,
          projectId: task.projectId,
          tags: task.tags,
          source: "recurrence",
          relatedPerson: task.relatedPerson,
          relatedPersonId: task.relatedPersonId,
          recurrence: task.recurrence,
          estimatedMinutes: task.estimatedMinutes,
        },
        "system",
      );
      await supabase.from("tasks").update({ recurrence_parent_id: task.recurrenceParentId ?? task.id }).eq("id", next.id);
    }
  }
  return { task, next };
}

export async function reopenTask(id: string, actor: Actor = "user"): Promise<Task> {
  const t = await getTask(id);
  if (!t) throw new Error("task not found");
  return updateTask(id, { status: inferStatus({ dueDate: t.dueDate }), completedAt: null }, actor);
}

export async function deleteTask(id: string, actor: Actor = "user"): Promise<void> {
  const t = await getTask(id);
  unwrap(await supabase.from("tasks").delete().eq("id", id));
  await logActivity(actor, "task.deleted", `נמחקה משימה: ${t?.title ?? id}`, { type: "task", id });
}
