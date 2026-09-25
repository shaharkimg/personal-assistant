import { z } from "zod";
import { defineTool } from "../types";
import { createInboxItem, listInbox } from "@/data/inbox";
import { INBOX_TYPES } from "@/domain/types";

export const inboxTools = [
  defineTool({
    name: "addToInbox",
    label: "שומר ל-Inbox",
    doneLabel: "נשמר ל-Inbox",
    description: "Park something in the Universal Inbox when it is unclear what it should become. Include your best-guess type.",
    schema: z.object({ text: z.string().min(1).max(5000), url: z.string().url().nullish(), suggestedType: z.enum(INBOX_TYPES).nullish() }),
    risk: "safe",
    async run(i) {
      const item = await createInboxItem(
        { kind: i.url ? "link" : "text", rawText: i.text, url: i.url, suggestedType: i.suggestedType ?? null, confidence: i.suggestedType ? 0.5 : null },
        "assistant",
      );
      return { saved: { id: item.id } };
    },
  }),

  defineTool({
    name: "listInbox",
    label: "טוען Inbox",
    doneLabel: "נטען Inbox",
    description: "List unsorted Inbox items.",
    schema: z.object({}),
    risk: "safe",
    async run() {
      return {
        items: (await listInbox("new")).map((i) => ({ id: i.id, kind: i.kind, text: i.rawText?.slice(0, 300), url: i.url, suggestedType: i.suggestedType })),
      };
    },
  }),
];
