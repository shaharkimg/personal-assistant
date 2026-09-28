import { beforeEach, describe, expect, it, vi } from "vitest";

const { send, createEvent, conflictsFor, composer } = vi.hoisted(() => ({
  send: vi.fn(),
  createEvent: vi.fn(),
  conflictsFor: vi.fn(async () => []),
  composer: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  class FunctionError extends Error {
    constructor(public code: string, message = code) {
      super(message);
    }
  }
  return { FunctionError, callFunction: vi.fn(), supabase: {} };
});
vi.mock("@/services/mail/MailService", async () => {
  const actual = await vi.importActual<typeof import("@/services/mail/MailService")>("@/services/mail/MailService");
  return { ...actual, mailService: { send, search: vi.fn(), read: vi.fn(), contacts: vi.fn(), status: vi.fn() } };
});
vi.mock("@/services/calendar/CalendarService", () => ({ calendarService: { createEvent, conflictsFor } }));
vi.mock("@/services/contacts/ContactsService", () => ({ contactsService: {} }));
vi.mock("@/services/messaging/MessagingService", () => ({ messagingService: { sendEmail: composer } }));
vi.mock("@/data/people", () => ({ upsertPerson: vi.fn() }));
vi.mock("@/data/profile", () => ({ getProfile: vi.fn(async () => ({ displayName: "שחר" })) }));

import { ToolRegistry } from "@/assistant/registry";
import { emailTools } from "@/assistant/tools/email";
import { contactTools } from "@/assistant/tools/contacts";
import type { ToolSpec } from "@/assistant/types";
import { FunctionError } from "@/lib/supabase";

const registry = new ToolRegistry([...emailTools, ...contactTools] as ToolSpec[]);
const ctx = { now: new Date("2026-09-26T10:00:00+03:00"), attachments: new Map(), conversationId: null };

const meeting = {
  title: "פגישה על החוזה",
  start: "2026-09-27T10:00:00+03:00",
  durationMinutes: 45,
  attendees: [{ name: "דני כהן", email: "dani@bank.co.il" }],
  location: "המשרד",
  message: "היי דני, מצרף הזמנה. שחר",
};

beforeEach(() => {
  send.mockReset().mockResolvedValue({ messageId: "m1", inviteUid: "u1" });
  createEvent.mockReset().mockResolvedValue({ id: "ev1" });
  composer.mockReset();
});

describe("scheduleMeeting", () => {
  it("asks for confirmation, then sends a real invite and adds it to the calendar", async () => {
    const call = await registry.prepare("scheduleMeeting", meeting, ctx);
    expect(call.ok && call.risk).toBe("confirm");
    if (!call.ok) return;
    expect(call.preview?.editable?.key).toBe("message");
    expect(call.preview?.details?.find((d) => d.label === "מוזמנים")?.value).toBe("דני כהן <dani@bank.co.il>");

    const res = await registry.execute({ ...call, input: { ...(call.input as object), message: "נערך" } }, ctx);
    expect(res.isError).toBe(false);
    expect(send).toHaveBeenCalledWith({
      to: meeting.attendees,
      subject: "הזמנה: פגישה על החוזה",
      text: "נערך",
      fromName: "שחר",
      invite: { title: "פגישה על החוזה", start: "2026-09-27T07:00:00.000Z", end: "2026-09-27T07:45:00.000Z", location: "המשרד", description: undefined },
    });
    expect(createEvent.mock.calls[0][0]).toMatchObject({ title: "פגישה על החוזה", location: "המשרד", notes: "משתתפים: דני כהן <dani@bank.co.il>" });
    expect(JSON.parse(res.content)).toMatchObject({ inviteSent: true, calendarEventId: "ev1" });
  });

  it("reports a calendar failure without hiding that the invite went out", async () => {
    createEvent.mockRejectedValueOnce(new Error("no calendar permission"));
    const call = await registry.prepare("scheduleMeeting", meeting, ctx);
    if (!call.ok) throw new Error(call.error);
    const res = JSON.parse((await registry.execute(call, ctx)).content);
    expect(res.inviteSent).toBe(true);
    expect(res.calendarError).toContain("no calendar permission");
  });

  it("explains a Gmail problem instead of sending", async () => {
    send.mockRejectedValueOnce(new FunctionError("mail_auth_failed", "auth"));
    const call = await registry.prepare("scheduleMeeting", meeting, ctx);
    if (!call.ok) throw new Error(call.error);
    const res = await registry.execute(call, ctx);
    expect(res.isError).toBe(true);
    expect(res.content).toContain("app password");
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects an invented address", async () => {
    const call = await registry.prepare("scheduleMeeting", { ...meeting, attendees: [{ name: "דני" }] }, ctx);
    expect(call.ok).toBe(false);
  });
});

describe("sendEmail", () => {
  const email = { to: ["ruth@x.com"], subject: "עדכון", body: "היי רות" };

  it("sends from Gmail when connected", async () => {
    const call = await registry.prepare("sendEmail", email, ctx);
    if (!call.ok) throw new Error(call.error);
    expect(JSON.parse((await registry.execute(call, ctx)).content)).toEqual({ sent: true, via: "gmail" });
    expect(composer).not.toHaveBeenCalled();
  });

  it("falls back to the phone's email app when Gmail isn't connected", async () => {
    send.mockRejectedValueOnce(new FunctionError("mail_not_configured", "not configured"));
    const call = await registry.prepare("sendEmail", email, ctx);
    if (!call.ok) throw new Error(call.error);
    expect(JSON.parse((await registry.execute(call, ctx)).content)).toEqual({ handedToSystemComposer: true });
    expect(composer).toHaveBeenCalledWith(["ruth@x.com"], "עדכון", "היי רות", "assistant");
  });
});
