import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { DateKey } from "../schemas";
import { createProject, findProjectByName, getProjectOverview, listProjects } from "@/data/projects";
import { createNote, searchNotes } from "@/data/notes";
import { linkPersonToProject, upsertPerson } from "@/data/people";
import { taskView } from "./tasks";

export const projectTools = [
  defineTool({
    name: "listProjects",
    label: "טוען פרויקטים",
    doneLabel: "נטענו פרויקטים",
    description: "List the user's active projects (e.g. עבודה, חתונה, בית).",
    schema: z.object({}),
    risk: "safe",
    async run() {
      return { projects: (await listProjects()).map((p) => ({ id: p.id, name: p.name, deadline: p.deadline, description: p.description })) };
    },
  }),

  defineTool({
    name: "createProject",
    label: "יוצר פרויקט",
    doneLabel: "נוצר פרויקט",
    description: "Create a new project to group tasks, documents, notes, people and deadlines.",
    schema: z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).nullish(), deadline: DateKey.nullish() }),
    risk: "safe",
    async run(i) {
      const existing = await findProjectByName(i.name);
      if (existing && existing.name === i.name) return { existing: { id: existing.id, name: existing.name } };
      const p = await createProject({ name: i.name, description: i.description, deadline: i.deadline }, "assistant");
      return { created: { id: p.id, name: p.name } };
    },
  }),

  defineTool({
    name: "getProjectOverview",
    label: "טוען פרויקט",
    doneLabel: "נטען פרויקט",
    description: "Everything linked to a project: tasks, waiting-for, notes, documents, people, recent conversations.",
    schema: z.object({ name: z.string().min(1).max(120) }),
    risk: "safe",
    async run({ name }) {
      const p = await findProjectByName(name);
      if (!p) throw new ToolError(`project "${name}" not found`);
      const o = await getProjectOverview(p.id);
      if (!o) throw new ToolError("project not found");
      return {
        project: { id: o.project.id, name: o.project.name, deadline: o.project.deadline, description: o.project.description },
        tasks: o.tasks.map(taskView),
        waiting: o.waiting.map((w) => ({ id: w.id, person: w.person, subject: w.subject, expected: w.expectedResponseDate })),
        notes: o.notes.map((n) => ({ id: n.id, title: n.title, body: n.body.slice(0, 500) })),
        documents: o.documents.map((d) => ({ id: d.id, title: d.title })),
        people: o.people.map((x) => x.displayName),
      };
    },
  }),

  defineTool({
    name: "addPersonToProject",
    label: "מקשר איש קשר לפרויקט",
    doneLabel: "קושר לפרויקט",
    description: "Link a person to a project (stores only the name, not contact details).",
    schema: z.object({ projectName: z.string().min(1), person: z.string().min(1).max(120), role: z.string().max(60).nullish() }),
    risk: "safe",
    async run(i) {
      const p = await findProjectByName(i.projectName);
      if (!p) throw new ToolError(`project "${i.projectName}" not found`);
      const person = await upsertPerson(i.person);
      await linkPersonToProject(p.id, person.id, i.role ?? null, "assistant");
      return { linked: { project: p.name, person: person.displayName } };
    },
  }),

  defineTool({
    name: "createNote",
    label: "שומר הערה",
    doneLabel: "נשמרה הערה",
    description: "Save a note, idea, reference or link (non-actionable information).",
    schema: z.object({
      title: z.string().max(200).nullish(),
      body: z.string().min(1).max(20_000),
      kind: z.enum(["note", "idea", "reference", "link"]).default("note"),
      url: z.string().url().nullish(),
      projectName: z.string().nullish(),
      tags: z.array(z.string().max(40)).max(10).nullish(),
    }),
    risk: "safe",
    async run(i) {
      const project = i.projectName ? await findProjectByName(i.projectName) : null;
      const n = await createNote(
        { title: i.title, body: i.body, kind: i.kind, url: i.url, projectId: project?.id ?? null, tags: i.tags ?? [], source: "assistant" },
        "assistant",
      );
      return { created: { id: n.id, title: n.title } };
    },
  }),

  defineTool({
    name: "searchNotes",
    label: "מחפש בהערות",
    doneLabel: "חיפוש בהערות",
    description: "Search saved notes and references.",
    schema: z.object({ query: z.string().min(1).max(200) }),
    risk: "safe",
    async run({ query }) {
      return { notes: (await searchNotes(query)).map((n) => ({ id: n.id, title: n.title, body: n.body.slice(0, 1000), url: n.url })) };
    },
  }),
];
