import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/data/conversations", () => ({ appendMessage: vi.fn() }));

import { AssistantEngine, windowMessages } from "@/assistant/engine";
import { ToolRegistry, serialize } from "@/assistant/registry";
import { defineTool, type ToolSpec } from "@/assistant/types";
import type { AIChatRequest, AIChatResponse, AIMessage } from "@/services/ai/types";

function reply(content: AIMessage["content"], stopReason: AIChatResponse["stopReason"] = "end_turn"): AIChatResponse {
  return { message: { role: "assistant", content }, stopReason, usage: { inputTokens: 0, outputTokens: 0 }, provider: "fake", model: "fake" };
}

function scriptedGateway(steps: ((req: AIChatRequest) => AIChatResponse)[]) {
  const requests: AIChatRequest[] = [];
  return {
    requests,
    chat: async (req: AIChatRequest) => {
      requests.push(structuredClone(req));
      const step = steps.shift();
      if (!step) throw new Error("no more scripted steps");
      return step(req);
    },
  };
}

const created: unknown[] = [];
const sent: unknown[] = [];
const tools = [
  defineTool({
    name: "createTask",
    label: "יוצר משימה",
    description: "create",
    schema: z.object({ title: z.string().min(1), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }),
    risk: "safe",
    run: async (i) => {
      created.push(i);
      return { id: "t1", ...i };
    },
  }),
  defineTool({
    name: "sendMessage",
    label: "שולח הודעה",
    description: "send",
    schema: z.object({ name: z.string(), text: z.string().min(1) }),
    risk: "confirm",
    preview: (i) => ({ title: `לשלוח ל${i.name}?`, body: i.text, confirmLabel: "שלח", editable: { key: "text", label: "הודעה" } }),
    run: async (i) => {
      sent.push(i);
      return { sent: true };
    },
  }),
] as ToolSpec[];

function engine(gateway: ReturnType<typeof scriptedGateway>) {
  return new AssistantEngine({ gateway, registry: new ToolRegistry(tools), system: async () => "sys", conversationId: null, persist: false });
}

describe("tool registry", () => {
  const reg = new ToolRegistry(tools);
  const ctx = { now: new Date(), attachments: new Map(), conversationId: null };

  it("exposes JSON schemas without $schema", () => {
    const defs = reg.definitions();
    expect(defs.map((d) => d.name)).toEqual(["createTask", "sendMessage"]);
    expect(defs[0].inputSchema).toMatchObject({ type: "object", required: ["title"] });
    expect(defs[0].inputSchema).not.toHaveProperty("$schema");
  });

  it("rejects unknown tools and invalid input before running anything", async () => {
    expect(await reg.prepare("dropTable", {}, ctx)).toMatchObject({ ok: false });
    const bad = await reg.prepare("createTask", { title: "", dueDate: "tomorrow" }, ctx);
    expect(bad.ok).toBe(false);
  });

  it("classifies risk", async () => {
    expect(await reg.prepare("sendMessage", { name: "רועי", text: "היי" }, ctx)).toMatchObject({ ok: true, risk: "confirm" });
  });

  it("serializes dates as local ISO and drops nulls", () => {
    const out = JSON.parse(serialize({ at: new Date(2026, 8, 25, 9, 30), x: null, list: [] }));
    expect(out.at).toMatch(/^2026-09-25T09:30:00/);
    expect(out).not.toHaveProperty("x");
    expect(out.list).toEqual([]);
  });
});

describe("assistant engine", () => {
  it("runs safe tools immediately and returns the final reply", async () => {
    const gw = scriptedGateway([
      () => reply([{ type: "tool_call", id: "c1", name: "createTask", input: { title: "להתקשר לעירייה", dueDate: "2026-09-26" } }], "tool_use"),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        expect(last.content[0]).toMatchObject({ type: "tool_result", toolCallId: "c1" });
        return reply([{ type: "text", text: "נוספה משימה למחר." }]);
      },
    ]);
    const e = engine(gw);
    const res = await e.send([{ type: "text", text: "מחר להתקשר לעירייה" }], "מחר להתקשר לעירייה");
    expect(res).toMatchObject({ status: "done", text: "נוספה משימה למחר.", actions: ["יוצר משימה"] });
    expect(created).toContainEqual({ title: "להתקשר לעירייה", dueDate: "2026-09-26" });
  });

  it("feeds validation errors back to the model so it can correct itself", async () => {
    const gw = scriptedGateway([
      () => reply([{ type: "tool_call", id: "c1", name: "createTask", input: { title: "x", dueDate: "מחר" } }], "tool_use"),
      (req) => {
        const r = req.messages[req.messages.length - 1].content[0];
        expect(r).toMatchObject({ type: "tool_result", isError: true });
        return reply([{ type: "text", text: "תיקנתי" }]);
      },
    ]);
    expect((await engine(gw).send([{ type: "text", text: "x" }], "x")).status).toBe("done");
  });

  it("pauses for confirmation and executes the edited input only after approval", async () => {
    sent.length = 0;
    const gw = scriptedGateway([
      () => reply([{ type: "text", text: "הכנתי טיוטה." }, { type: "tool_call", id: "c9", name: "sendMessage", input: { name: "רועי", text: "היי רועי" } }], "tool_use"),
      () => reply([{ type: "text", text: "נשלח." }]),
    ]);
    const e = engine(gw);
    const res = await e.send([{ type: "text", text: "תשלח לרועי" }], "תשלח לרועי");
    expect(res.status).toBe("needs_confirmation");
    if (res.status !== "needs_confirmation") return;
    expect(res.pending.preview.body).toBe("היי רועי");
    expect(sent).toHaveLength(0);

    const done = await e.resolve("confirm", { text: "היי רועי, מה שלומך?" });
    expect(done).toMatchObject({ status: "done", text: "נשלח." });
    expect(sent).toEqual([{ name: "רועי", text: "היי רועי, מה שלומך?" }]);
  });

  it("cancel never executes and tells the model", async () => {
    sent.length = 0;
    const gw = scriptedGateway([
      () => reply([{ type: "tool_call", id: "c2", name: "sendMessage", input: { name: "דני", text: "?" } }], "tool_use"),
      (req) => {
        expect(req.messages[req.messages.length - 1].content[0]).toMatchObject({ isError: true });
        return reply([{ type: "text", text: "בסדר, לא שלחתי." }]);
      },
    ]);
    const e = engine(gw);
    await e.send([{ type: "text", text: "x" }], "x");
    expect(await e.resolve("cancel")).toMatchObject({ status: "done", text: "בסדר, לא שלחתי." });
    expect(sent).toHaveLength(0);
  });

  it("a new message while a confirmation is pending cancels it in the same turn", async () => {
    sent.length = 0;
    const gw = scriptedGateway([
      () => reply([{ type: "tool_call", id: "c3", name: "sendMessage", input: { name: "דני", text: "?" } }], "tool_use"),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        expect(last.role).toBe("user");
        expect(last.content.map((b) => b.type)).toEqual(["tool_result", "text"]);
        return reply([{ type: "text", text: "ok" }]);
      },
    ]);
    const e = engine(gw);
    await e.send([{ type: "text", text: "a" }], "a");
    expect(await e.send([{ type: "text", text: "עזוב, משהו אחר" }], "b")).toMatchObject({ status: "done" });
    expect(sent).toHaveLength(0);
  });

  it("reports gateway failures without throwing", async () => {
    const gw = { chat: async () => Promise.reject(Object.assign(new Error("x"), { code: "rate_limited" })) };
    const e = new AssistantEngine({ gateway: gw, registry: new ToolRegistry(tools), system: async () => "s", conversationId: null, persist: false });
    expect((await e.send([{ type: "text", text: "x" }], "x")).text).toContain("מגבלת");
  });
});

describe("context window", () => {
  it("starts at a clean user turn and strips provider state when truncating", () => {
    const msgs: AIMessage[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: [{ type: "text", text: `q${i}` }] });
      msgs.push({ role: "assistant", content: [{ type: "tool_call", id: `c${i}`, name: "createTask", input: {} }], providerState: { provider: "p", model: "m", raw: [] } });
      msgs.push({ role: "user", content: [{ type: "tool_result", toolCallId: `c${i}`, content: "{}" }] });
      msgs.push({ role: "assistant", content: [{ type: "text", text: `a${i}` }] });
    }
    const w = windowMessages(msgs, 7);
    expect(w[0]).toMatchObject({ role: "user", content: [{ type: "text" }] });
    expect(w.some((m) => m.providerState)).toBe(false);
    expect(windowMessages(msgs.slice(0, 4), 40)[1].providerState).toBeDefined();
  });
});
