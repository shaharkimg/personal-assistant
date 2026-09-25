import type { InboxItem, InboxSuggestion, InboxType } from "@/domain/types";
import { addDays, combineDateTime, toDateKey } from "@/domain/dates";
import { createTask } from "@/data/tasks";
import { createWaiting } from "@/data/waiting";
import { createNote } from "@/data/notes";
import { markInboxProcessed, updateInboxItem } from "@/data/inbox";
import { classifyInboxText } from "@/assistant/session";
import { calendarService } from "@/services/calendar/CalendarService";

/** Runs the AI classifier on an inbox item and stores the suggestion (user can still override). */
export async function classifyItem(item: InboxItem): Promise<InboxItem> {
  const text = [item.rawText, item.url].filter(Boolean).join("\n");
  const c = await classifyInboxText(text || "(file)", item.kind);
  const suggestion: InboxSuggestion = {
    title: c.title,
    dueDate: c.dueDate,
    dueTime: c.dueTime,
    person: c.person,
    expectedResponseDate: c.expectedResponseDate,
    durationMinutes: c.durationMinutes,
    summary: c.summary,
  };
  return updateInboxItem(item.id, { suggestedType: c.type, confidence: c.confidence, suggestion });
}

export class NeedsDetailsError extends Error {}

/** Converts an inbox item into the chosen entity type. */
export async function convertInboxItem(item: InboxItem, type: InboxType): Promise<{ type: string; id: string }> {
  const s = item.suggestion ?? {};
  const title = (s.title || item.rawText || item.url || "פריט מה-Inbox").split("\n")[0].slice(0, 300);
  const body = [item.rawText, item.url].filter(Boolean).join("\n");
  let ref: { type: string; id: string };

  switch (type) {
    case "task": {
      const t = await createTask({ title, description: body !== title ? body : null, dueDate: s.dueDate ?? null, dueTime: s.dueTime ?? null, source: "inbox" });
      ref = { type: "task", id: t.id };
      break;
    }
    case "reminder": {
      const date = s.dueDate ?? toDateKey(addDays(new Date(), 1));
      const at = combineDateTime(date, s.dueTime ?? "09:00");
      const t = await createTask({ title, dueDate: date, dueTime: s.dueTime ?? "09:00", remindAt: at.toISOString(), source: "inbox" });
      ref = { type: "task", id: t.id };
      break;
    }
    case "waiting_for": {
      const w = await createWaiting({
        person: s.person || "לא צוין",
        subject: title,
        expectedResponseDate: s.expectedResponseDate ?? toDateKey(addDays(new Date(), 3)),
        notes: body !== title ? body : null,
      });
      ref = { type: "waiting_for", id: w.id };
      break;
    }
    case "event": {
      if (!s.dueDate || !s.dueTime) throw new NeedsDetailsError("חסר תאריך ושעה לאירוע");
      const start = combineDateTime(s.dueDate, s.dueTime);
      const end = new Date(start.getTime() + (s.durationMinutes ?? 60) * 60_000);
      const e = await calendarService.createEvent({ title, start, end, notes: body || null }, "user");
      ref = { type: "event", id: e.id };
      break;
    }
    case "document":
      if (item.documentId) {
        ref = { type: "document", id: item.documentId };
        break;
      }
    // falls through — a text item can't become a document; keep it as reference.
    case "note":
    case "reference": {
      const n = await createNote({
        title: s.title ?? null,
        body: body || title,
        kind: type === "note" ? "note" : item.url ? "link" : "reference",
        url: item.url,
        source: "inbox",
      });
      ref = { type: "note", id: n.id };
      break;
    }
  }
  await markInboxProcessed(item.id, type, ref);
  return ref;
}
