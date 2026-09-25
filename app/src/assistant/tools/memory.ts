import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { Uuid } from "../schemas";
import { createMemory, deleteMemory, listMemories, SensitiveMemoryError } from "@/data/memories";
import { detectSensitive, SENSITIVE_LABELS } from "@/domain/sensitive";

const CATEGORY_LABEL = { preference: "העדפה", fact: "עובדה", routine: "שגרה", relationship: "קשר", work: "עבודה" } as const;

export const memoryTools = [
  defineTool({
    name: "saveMemory",
    label: "שומר לזיכרון",
    doneLabel: "נשמר בזיכרון",
    description:
      "Save a long-term preference/fact about the user. Only when the user explicitly asks you to remember something, or agreed to your suggestion. " +
      "Never for health, financial, ID, password or other sensitive data. The user confirms before it is stored.",
    schema: z.object({
      content: z.string().min(1).max(500).describe("Third-person, self-contained, e.g. 'מעדיף פגישות בבוקר'"),
      category: z.enum(["preference", "fact", "routine", "relationship", "work"]),
      userExplicitlyAsked: z.boolean().describe("true if the user said 'remember…'"),
    }),
    risk: "confirm",
    preview(i) {
      const sensitive = detectSensitive(i.content);
      if (sensitive.length) {
        throw new ToolError(
          `Refused: looks like sensitive data (${sensitive.map((k) => SENSITIVE_LABELS[k]).join(", ")}). Tell the user it wasn't saved; they can add it manually in the Memory screen if they insist.`,
        );
      }
      return { title: "לשמור בזיכרון?", body: i.content, details: [{ label: "סוג", value: CATEGORY_LABEL[i.category] }], confirmLabel: "שמור", editable: { key: "content", label: "מה לזכור" } };
    },
    async run(i) {
      try {
        const m = await createMemory(i.content, i.category, i.userExplicitlyAsked ? "user_explicit" : "user_approved", "assistant");
        return { saved: { id: m.id } };
      } catch (e) {
        if (e instanceof SensitiveMemoryError) throw new ToolError(e.message);
        throw e;
      }
    },
  }),

  defineTool({
    name: "listMemories",
    label: "טוען זיכרון",
    doneLabel: "נטען זיכרון",
    description: "List what the assistant remembers about the user (to answer 'what do you know about me?').",
    schema: z.object({}),
    risk: "safe",
    async run() {
      return { memories: (await listMemories()).map((m) => ({ id: m.id, category: m.category, content: m.content })) };
    },
  }),

  defineTool({
    name: "forgetMemory",
    label: "מוחק מהזיכרון",
    doneLabel: "נמחק מהזיכרון",
    description: "Delete a stored memory by id. Requires confirmation.",
    schema: z.object({ id: Uuid }),
    risk: "confirm",
    async preview({ id }) {
      const m = (await listMemories()).find((x) => x.id === id);
      if (!m) throw new ToolError("memory not found");
      return { title: "למחוק מהזיכרון?", body: m.content, confirmLabel: "מחק", destructive: true };
    },
    async run({ id }) {
      await deleteMemory(id, "assistant");
      return { deleted: id };
    },
  }),
];
