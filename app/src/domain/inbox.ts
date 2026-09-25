// Inbox classification contract + a local heuristic used when offline or when the model is unavailable.
import { z } from "zod";
import { INBOX_TYPES, type InboxType } from "./types";

export const InboxClassificationSchema = z.object({
  type: z.enum(INBOX_TYPES),
  confidence: z.number().min(0).max(1),
  title: z.string().describe("Short actionable title in the user's language"),
  dueDate: z.string().nullable().describe("YYYY-MM-DD if a date is mentioned, else null"),
  dueTime: z.string().nullable().describe("HH:MM if a time is mentioned, else null"),
  person: z.string().nullable().describe("Person involved, if any"),
  expectedResponseDate: z.string().nullable().describe("For waiting_for: when a reply is expected (YYYY-MM-DD)"),
  durationMinutes: z.number().nullable().describe("For events: duration in minutes"),
  summary: z.string().nullable().describe("One-line summary for notes/references/documents"),
});
export type InboxClassification = z.infer<typeof InboxClassificationSchema>;

export const INBOX_TYPE_LABELS: Record<InboxType, string> = {
  task: "משימה",
  note: "הערה",
  document: "מסמך",
  reminder: "תזכורת",
  event: "אירוע",
  waiting_for: "ממתין לתשובה",
  reference: "חומר עזר",
};

const URL_RE = /https?:\/\/\S+/i;

/** Cheap rule-based guess; the model's classification replaces it when available. */
export function heuristicClassify(text: string, kind: "text" | "voice" | "file" | "image" | "link"): { type: InboxType; confidence: number } {
  const t = text.trim();
  if (kind === "file" || kind === "image") return { type: "document", confidence: 0.6 };
  if (kind === "link" || (URL_RE.test(t) && t.replace(URL_RE, "").trim().length < 20)) return { type: "reference", confidence: 0.7 };
  if (/(תזכיר|להזכיר|remind)/i.test(t)) return { type: "reminder", confidence: 0.7 };
  if (/(מחכה ל|ממתין ל|לא חזר|waiting for|שלחתי ל)/i.test(t)) return { type: "waiting_for", confidence: 0.6 };
  if (/(פגישה|לקבוע|meeting|זום|zoom)/i.test(t)) return { type: "event", confidence: 0.5 };
  if (/^(ל[א-ת]+|לקנות|להתקשר|לשלוח|לבדוק|call|buy|send|check)\b/i.test(t) || /(מחר|היום|ביום|עד)/.test(t)) {
    return { type: "task", confidence: 0.55 };
  }
  if (/(רעיון|idea)/i.test(t)) return { type: "note", confidence: 0.6 };
  return { type: "note", confidence: 0.3 };
}
