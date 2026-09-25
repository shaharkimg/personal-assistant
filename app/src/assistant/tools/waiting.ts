import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { DateKey, Uuid } from "../schemas";
import { createWaiting, getWaiting, listWaiting, searchWaiting, updateWaiting } from "@/data/waiting";
import { upsertPerson } from "@/data/people";
import { findProjectByName } from "@/data/projects";
import type { WaitingFor } from "@/domain/types";
import { toDateKey } from "@/domain/dates";

function view(w: WaitingFor, today: string) {
  return {
    id: w.id,
    person: w.person,
    subject: w.subject,
    since: w.createdAt.slice(0, 10),
    expectedResponseDate: w.expectedResponseDate,
    overdue: Boolean(w.expectedResponseDate && w.expectedResponseDate <= today),
    status: w.status,
    notes: w.notes,
    relatedTaskId: w.relatedTaskId,
  };
}

export const waitingTools = [
  defineTool({
    name: "createWaitingFor",
    label: "מוסיף למעקב",
    doneLabel: "נוסף למעקב",
    description:
      "Track something the user is waiting on from another person (e.g. 'I sent Danny the contract, remind me if he doesn't reply within 3 days'). " +
      "expectedResponseDate = when to follow up if no reply. The app nudges the user automatically after that date.",
    schema: z.object({
      person: z.string().min(1).max(120),
      subject: z.string().min(1).max(300),
      expectedResponseDate: DateKey.nullish(),
      notes: z.string().max(2000).nullish(),
      relatedTaskId: Uuid.nullish(),
      projectName: z.string().nullish(),
    }),
    risk: "safe",
    async run(i, ctx) {
      const person = await upsertPerson(i.person).catch(() => null);
      const project = i.projectName ? await findProjectByName(i.projectName) : null;
      const w = await createWaiting(
        {
          person: i.person,
          personId: person?.id ?? null,
          subject: i.subject,
          expectedResponseDate: i.expectedResponseDate,
          notes: i.notes,
          relatedTaskId: i.relatedTaskId,
          projectId: project?.id ?? null,
        },
        "assistant",
      );
      return { created: view(w, toDateKey(ctx.now)) };
    },
  }),

  defineTool({
    name: "listWaitingFor",
    label: "בודק מה ממתין לתשובה",
    doneLabel: "נבדקו ממתינים",
    description: "List open items the user is waiting on (optionally filtered by person/subject text). Overdue ones are flagged.",
    schema: z.object({ query: z.string().max(200).nullish() }),
    risk: "safe",
    async run(i, ctx) {
      const items = i.query ? await searchWaiting(i.query) : await listWaiting("open");
      return { waiting: items.map((w) => view(w, toDateKey(ctx.now))) };
    },
  }),

  defineTool({
    name: "getWaitingFor",
    label: "טוען פריט מעקב",
    doneLabel: "נטען פריט מעקב",
    description: "Get one waiting-for item by id (e.g. to draft a follow-up message).",
    schema: z.object({ id: Uuid }),
    risk: "safe",
    async run({ id }, ctx) {
      const w = await getWaiting(id);
      if (!w) throw new ToolError("waiting item not found");
      return view(w, toDateKey(ctx.now));
    },
  }),

  defineTool({
    name: "resolveWaitingFor",
    label: "מעדכן מעקב",
    doneLabel: "עודכן מעקב",
    description: "Mark a waiting-for item as received (reply arrived) or cancelled, or push its follow-up date.",
    schema: z.object({
      id: Uuid,
      status: z.enum(["received", "cancelled", "open"]),
      expectedResponseDate: DateKey.nullish(),
      notes: z.string().max(2000).nullish(),
    }),
    risk: "safe",
    async run(i, ctx) {
      const w = await updateWaiting(
        i.id,
        { status: i.status, expectedResponseDate: i.expectedResponseDate ?? undefined, notes: i.notes ?? undefined },
        "assistant",
      );
      return { updated: view(w, toDateKey(ctx.now)) };
    },
  }),
];
