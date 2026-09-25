import type { z } from "zod";
import type { LocalFile } from "@/services/documents/DocumentService";

/**
 * safe    — internal and reversible (create task, search): runs immediately.
 * confirm — external or destructive (send message, delete, cancel meeting, big calendar change):
 *           the engine pauses and the UI shows a confirmation card first.
 */
export type Risk = "safe" | "confirm";

export interface Attachment {
  id: string;
  file: LocalFile;
}

export interface ToolContext {
  now: Date;
  attachments: Map<string, Attachment>;
  conversationId: string | null;
}

export interface ConfirmationPreview {
  title: string;
  body?: string;
  details?: { label: string; value: string }[];
  /** Field of the tool input the user may edit before confirming (e.g. the message text). */
  editable?: { key: string; label: string; multiline?: boolean };
  confirmLabel: string;
  destructive?: boolean;
}

export interface ToolSpec<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** Short Hebrew label shown while the tool runs ("יוצר משימה…"). */
  label: string;
  /** Past-tense label for the "done" chip ("נוצרה משימה"). */
  doneLabel?: string;
  risk: Risk | ((input: z.infer<S>, ctx: ToolContext) => Risk | Promise<Risk>);
  preview?: (input: z.infer<S>, ctx: ToolContext) => ConfirmationPreview | Promise<ConfirmationPreview>;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): ToolSpec<S> {
  return spec;
}

/** Thrown by a tool when the input is valid but can't be acted on; message goes back to the model. */
export class ToolError extends Error {}
