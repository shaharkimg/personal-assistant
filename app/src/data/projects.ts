import type { DocumentRecord, Note, Person, Project, Task, WaitingFor } from "@/domain/types";
import { type Actor, fromRow, logActivity, supabase, toRow, unwrap } from "./db";

export interface ProjectInput {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  deadline?: string | null;
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  let q = supabase.from("projects").select("*");
  if (!includeArchived) q = q.eq("status", "active");
  return unwrap(await q.order("created_at")).map((r) => fromRow<Project>(r));
}

export async function getProject(id: string): Promise<Project | null> {
  const row = unwrap(await supabase.from("projects").select("*").eq("id", id).maybeSingle());
  return row ? fromRow<Project>(row) : null;
}

/** Case-insensitive lookup so the assistant can resolve "פרויקט חתונה" to an id. */
export async function findProjectByName(name: string): Promise<Project | null> {
  const rows = unwrap(await supabase.from("projects").select("*").eq("status", "active").ilike("name", `%${name.replace(/[%_]/g, "")}%`).limit(1));
  return rows[0] ? fromRow<Project>(rows[0]) : null;
}

export async function createProject(input: ProjectInput, actor: Actor = "user"): Promise<Project> {
  const p = fromRow<Project>(unwrap(await supabase.from("projects").insert(toRow({ ...input })).select().single()));
  await logActivity(actor, "project.created", `נוצר פרויקט: ${p.name}`, { type: "project", id: p.id });
  return p;
}

export async function updateProject(id: string, patch: Partial<ProjectInput> & { status?: Project["status"] }, actor: Actor = "user"): Promise<Project> {
  const p = fromRow<Project>(unwrap(await supabase.from("projects").update(toRow(patch)).eq("id", id).select().single()));
  await logActivity(actor, patch.status === "archived" ? "project.archived" : "project.updated", `עודכן פרויקט: ${p.name}`, { type: "project", id });
  return p;
}

export interface ProjectOverview {
  project: Project;
  tasks: Task[];
  waiting: WaitingFor[];
  notes: Note[];
  documents: DocumentRecord[];
  people: Person[];
  conversations: { id: string; title: string | null; updatedAt: string }[];
}

export async function getProjectOverview(id: string): Promise<ProjectOverview | null> {
  const project = await getProject(id);
  if (!project) return null;
  const [tasks, waiting, notes, documents, people, conversations] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", id).order("status").order("due_date", { nullsFirst: false }),
    supabase.from("waiting_for").select("*").eq("project_id", id).eq("status", "open"),
    supabase.from("notes").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("documents").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_people").select("people(*)").eq("project_id", id),
    supabase.from("conversations").select("id, title, updated_at").eq("project_id", id).order("updated_at", { ascending: false }).limit(20),
  ]);
  return {
    project,
    tasks: unwrap(tasks).map((r) => fromRow<Task>(r)),
    waiting: unwrap(waiting).map((r) => fromRow<WaitingFor>(r)),
    notes: unwrap(notes).map((r) => fromRow<Note>(r)),
    documents: unwrap(documents).map((r) => fromRow<DocumentRecord>(r)),
    people: (unwrap(people) as unknown as { people: Record<string, unknown> | null }[])
      .filter((r) => r.people)
      .map((r) => fromRow<Person>(r.people!)),
    conversations: unwrap(conversations).map((r) => fromRow<{ id: string; title: string | null; updatedAt: string }>(r)),
  };
}
