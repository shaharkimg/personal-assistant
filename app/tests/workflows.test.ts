import { beforeEach, describe, expect, it, vi } from "vitest";
import { at, event, task, waiting } from "./fixtures";

const { createTask, createWaiting, createNote } = vi.hoisted(() => ({
  createTask: vi.fn(),
  createWaiting: vi.fn(),
  createNote: vi.fn(async (input: Record<string, unknown>) => ({ id: "n1", ...input })),
}));
vi.mock("@/data/tasks", () => ({ createTask, completeTask: vi.fn(), deleteTask: vi.fn(), getTask: vi.fn(), listTasks: vi.fn(), searchTasks: vi.fn(), updateTask: vi.fn() }));
vi.mock("@/data/waiting", () => ({ createWaiting }));
vi.mock("@/data/notes", () => ({ createNote }));
vi.mock("@/data/documents", () => ({ getDocument: vi.fn(async (id: string) => ({ id, title: "הסכם שכירות", projectId: "p1" })) }));
vi.mock("@/data/projects", () => ({ findProjectByName: vi.fn(async () => null) }));

import { defaultDeadlineReminder, meetingNoteBody } from "@/domain/workflows";
import { morningBriefBody } from "@/domain/brief";
import { planNotifications } from "@/domain/proactive";
import { ToolRegistry } from "@/assistant/registry";
import { workflowTools } from "@/assistant/tools/workflows";
import type { ToolSpec } from "@/assistant/types";

const registry = new ToolRegistry(workflowTools as ToolSpec[]);
const ctx = { now: at(2026, 9, 26, 10), attachments: new Map(), conversationId: null };

beforeEach(() => {
  createTask.mockReset().mockImplementation(async (input: Record<string, unknown>) => task({ id: `t${createTask.mock.calls.length}`, ...input }));
  createWaiting.mockReset().mockImplementation(async (input: Record<string, unknown>) => waiting({ id: "w1", ...input }));
  createNote.mockClear();
});

describe("deadline reminders", () => {
  const now = at(2026, 9, 26, 10);
  it("3 days before at 09:00", () => {
    expect(defaultDeadlineReminder("2026-10-10", null, now)).toEqual(at(2026, 10, 7, 9));
  });
  it("falls back to the morning of the day when 3 days before has passed", () => {
    expect(defaultDeadlineReminder("2026-09-28", "17:00", now)).toEqual(at(2026, 9, 28, 8));
  });
  it("none for a deadline that already passed", () => {
    expect(defaultDeadlineReminder("2026-09-20", null, now)).toBeNull();
  });
});

describe("meeting note", () => {
  it("lists attendees, decisions, tasks and waiting items", () => {
    const body = meetingNoteBody({
      title: "דני",
      date: "2026-09-26",
      attendees: ["דני", "רותי"],
      summary: "דיברנו על החוזה.",
      decisions: ["חותמים ביום ראשון"],
      tasks: [{ title: "לשלוח טיוטה", dueDate: "2026-09-27" }],
      waitingFor: [{ person: "דני", subject: "אישור מהבנק" }],
    });
    expect(body).toBe(
      "משתתפים: דני, רותי\n\nדיברנו על החוזה.\n\nהחלטות:\n• חותמים ביום ראשון\n\nמשימות:\n• לשלוח טיוטה עד 2026-09-27\n\nממתין ל:\n• דני: אישור מהבנק",
    );
  });
});

describe("morning brief notification", () => {
  const day = at(2026, 9, 27, 8);
  it("summarizes meetings, tasks and waiting from real records", () => {
    const body = morningBriefBody(
      {
        events: [event("ישיבת צוות", at(2026, 9, 27, 9, 30), at(2026, 9, 27, 10)), event("לקוח", at(2026, 9, 27, 14), at(2026, 9, 27, 15))],
        tasks: [task({ title: "דוח רבעוני", status: "today", priority: "high" }), task({ title: "להתקשר לדני", dueDate: "2026-09-27" }), task({ title: "חשבונית", dueDate: "2026-09-27" })],
        waiting: [waiting({ expectedResponseDate: "2026-09-26" })],
      },
      day,
    );
    expect(body).toBe("2 פגישות, הראשונה 09:30 ישיבת צוות · 3 משימות: דוח רבעוני, להתקשר לדני… · דבר אחד ממתין לתשובה");
  });
  it("empty day", () => {
    expect(morningBriefBody({ events: [], tasks: [], waiting: [] }, day)).toBe("יום פנוי — אין פגישות או משימות דחופות.");
  });
});

describe("planner additions", () => {
  const settings = { proactivity: "balanced" as const, quietHoursStart: "22:00", quietHoursEnd: "07:30", morningBriefTime: "08:00", eveningReviewTime: null };
  it("offers a summary 5 minutes after a meeting ends", () => {
    const now = at(2026, 9, 27, 7, 45);
    const plan = planNotifications({ now, tasks: [], waiting: [], events: [event("לקוח", at(2026, 9, 27, 11), at(2026, 9, 27, 12))], settings });
    const s = plan.find((p) => p.kind === "meeting_summary");
    expect(s?.at).toEqual(at(2026, 9, 27, 12, 5));
    expect(s?.url).toBe(`/capture?meeting=${encodeURIComponent("לקוח")}`);
    expect(plan.find((p) => p.kind === "brief")?.body).toBe("פגישה אחת, 11:00 לקוח");
  });
  it("reminders carry the task id for action buttons", () => {
    const now = at(2026, 9, 27, 8);
    const t = task({ id: "abc", remindAt: at(2026, 9, 27, 9).toISOString() });
    expect(planNotifications({ now, tasks: [t], waiting: [], events: [], settings }).find((p) => p.kind === "reminder")?.taskId).toBe("abc");
  });
});

describe("workflow tools", () => {
  it("have valid JSON schemas", () => {
    expect(registry.definitions().map((d) => d.name)).toEqual(["proposeDeadlines", "logMeeting"]);
  });

  it("proposeDeadlines needs confirmation and creates tagged tasks with default reminders", async () => {
    const call = await registry.prepare(
      "proposeDeadlines",
      {
        documentId: "11111111-1111-4111-8111-111111111111",
        deadlines: [
          { title: "הודעה על אי-חידוש", dueDate: "2026-10-10", quote: "יש להודיע 60 יום מראש" },
          { title: "תשלום", dueDate: "2026-10-01", dueTime: "12:00", quote: "התשלום ב-1 לחודש" },
        ],
      },
      ctx,
    );
    expect(call.ok && call.risk).toBe("confirm");
    if (!call.ok) return;
    expect(call.preview?.body).toBe("2026-10-01 12:00 – תשלום\n2026-10-10 – הודעה על אי-חידוש");
    const res = await registry.execute(call, ctx);
    expect(res.isError).toBe(false);
    expect(createTask).toHaveBeenCalledTimes(2);
    expect(createTask.mock.calls[0][0]).toMatchObject({
      dueDate: "2026-10-10",
      remindAt: at(2026, 10, 7, 9).toISOString(),
      tags: ["מועד"],
      projectId: "p1",
      description: 'מתוך "הסכם שכירות": "יש להודיע 60 יום מראש"',
    });
  });

  it("logMeeting saves a note, tasks and waiting items in one confirmed step", async () => {
    const call = await registry.prepare(
      "logMeeting",
      { title: "פגישה עם דני", summary: "סגרנו מחיר.", tasks: [{ title: "לשלוח חוזה" }], waitingFor: [{ person: "דני", subject: "אישור בנק", expectedResponseDate: "2026-09-30" }] },
      ctx,
    );
    expect(call.ok && call.risk).toBe("confirm");
    if (!call.ok) return;
    const res = await registry.execute(call, ctx);
    expect(res.isError).toBe(false);
    expect(createNote.mock.calls[0][0]).toMatchObject({ title: "סיכום פגישה: פגישה עם דני (2026-09-26)", tags: ["פגישה"] });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createWaiting.mock.calls[0][0]).toMatchObject({ person: "דני", expectedResponseDate: "2026-09-30" });
  });
});
