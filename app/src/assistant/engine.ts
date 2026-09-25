import type { AIChatResponse, AIContentBlock, AIMessage } from "@/services/ai/types";
import type { AIGateway } from "@/services/ai/gateway";
import { appendMessage } from "@/data/conversations";
import type { ToolRegistry, PreparedCall } from "./registry";
import type { Attachment, ConfirmationPreview, ToolContext } from "./types";

export type EngineEvent =
  | { type: "thinking" }
  | { type: "tool_started"; name: string; label: string }
  | { type: "tool_finished"; name: string; ok: boolean };

export interface PendingConfirmation {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  preview: ConfirmationPreview;
}

export type TurnResult =
  | { status: "done"; text: string; actions: string[] }
  | { status: "needs_confirmation"; text: string; pending: PendingConfirmation; actions: string[] }
  | { status: "error"; text: string; actions: string[] };

type ToolCallBlock = Extract<AIContentBlock, { type: "tool_call" }>;
type ToolResultBlock = Extract<AIContentBlock, { type: "tool_result" }>;

interface Suspended {
  calls: ToolCallBlock[];
  results: ToolResultBlock[];
  index: number;
  prepared: Extract<PreparedCall, { ok: true }>;
  steps: number;
  textSoFar: string;
}

export interface EngineOptions {
  gateway: AIGateway;
  registry: ToolRegistry;
  system: () => Promise<string>;
  conversationId: string | null;
  /** Persist messages (disabled in tests / quick capture if desired). */
  persist?: boolean;
  onEvent?: (e: EngineEvent) => void;
  maxSteps?: number;
  /** Size of the short-term context window, in messages. */
  windowSize?: number;
}

/**
 * The agent loop. Runs on the device because many tools need on-device data (calendar,
 * contacts, files); the model itself is reached only through the /ai-chat gateway.
 *
 *   user message → model → tool calls → validate → (confirm?) → execute → results → model → … → reply
 */
export class AssistantEngine {
  readonly messages: AIMessage[] = [];
  readonly attachments = new Map<string, Attachment>();
  private suspended: Suspended | null = null;
  private actions: string[] = [];

  constructor(private opts: EngineOptions) {}

  get conversationId() {
    return this.opts.conversationId;
  }

  set conversationId(id: string | null) {
    this.opts.conversationId = id;
  }

  get hasPending(): boolean {
    return this.suspended !== null;
  }

  /** Restores prior model-visible history (e.g. when reopening a conversation). */
  load(history: AIMessage[]) {
    this.messages.push(...history);
  }

  private ctx(): ToolContext {
    return { now: new Date(), attachments: this.attachments, conversationId: this.opts.conversationId };
  }

  private async record(message: AIMessage, text: string | null) {
    this.messages.push(message);
    if (this.opts.persist !== false && this.opts.conversationId) {
      await appendMessage(this.opts.conversationId, message, text).catch((e) => console.warn("persist failed", e));
    }
  }

  async send(content: AIContentBlock[], displayText: string | null): Promise<TurnResult> {
    this.actions = [];
    let prefix: AIContentBlock[] = [];
    if (this.suspended) {
      // A new message while a confirmation is open means the user moved on: the pending call
      // and any calls after it are answered as cancelled in the same user turn.
      const s = this.suspended;
      this.suspended = null;
      for (let i = s.index; i < s.calls.length; i++) {
        s.results.push({ type: "tool_result", toolCallId: s.calls[i].id, content: "Not executed: the user moved on without confirming.", isError: true });
      }
      prefix = s.results;
    }
    await this.record({ role: "user", content: [...prefix, ...content] }, displayText);
    return this.loop(0, "");
  }

  async resolve(decision: "confirm" | "cancel", editedInput?: Record<string, unknown>): Promise<TurnResult> {
    const s = this.suspended;
    if (!s) return { status: "error", text: "אין פעולה שממתינה לאישור.", actions: [] };
    this.suspended = null;
    const call = s.calls[s.index];
    if (decision === "confirm") {
      const prepared = editedInput ? { ...s.prepared, input: { ...(s.prepared.input as object), ...editedInput } } : s.prepared;
      this.opts.onEvent?.({ type: "tool_started", name: call.name, label: prepared.tool.label });
      const r = await this.opts.registry.execute(prepared, this.ctx());
      this.opts.onEvent?.({ type: "tool_finished", name: call.name, ok: !r.isError });
      if (!r.isError) this.actions.push(prepared.tool.doneLabel ?? prepared.tool.label);
      s.results.push({ type: "tool_result", toolCallId: call.id, content: r.content, isError: r.isError });
    } else {
      s.results.push({ type: "tool_result", toolCallId: call.id, content: "The user cancelled this action. Do not retry it unless asked.", isError: true });
    }
    // Any remaining calls from the same model turn are processed now.
    const cont = await this.processCalls(s.calls, s.results, s.index + 1, s.steps, s.textSoFar);
    if (cont) return cont;
    await this.record({ role: "user", content: s.results }, null);
    // Continue so the model can report the outcome (or acknowledge the cancellation).
    return this.loop(s.steps + 1, "");
  }

  /** Runs tool calls from index `from`; returns a TurnResult if it has to pause for confirmation. */
  private async processCalls(calls: ToolCallBlock[], results: ToolResultBlock[], from: number, steps: number, textSoFar: string): Promise<TurnResult | null> {
    const ctx = this.ctx();
    for (let i = from; i < calls.length; i++) {
      const call = calls[i];
      const prepared = await this.opts.registry.prepare(call.name, call.input, ctx);
      if (!prepared.ok) {
        results.push({ type: "tool_result", toolCallId: call.id, content: prepared.error, isError: true });
        continue;
      }
      if (prepared.risk === "confirm") {
        this.suspended = { calls, results, index: i, prepared, steps, textSoFar };
        return {
          status: "needs_confirmation",
          text: textSoFar,
          actions: this.actions,
          pending: {
            toolCallId: call.id,
            toolName: call.name,
            input: prepared.input as Record<string, unknown>,
            preview: prepared.preview ?? { title: prepared.tool.label, confirmLabel: "אישור" },
          },
        };
      }
      this.opts.onEvent?.({ type: "tool_started", name: call.name, label: prepared.tool.label });
      const r = await this.opts.registry.execute(prepared, ctx);
      this.opts.onEvent?.({ type: "tool_finished", name: call.name, ok: !r.isError });
      if (!r.isError) this.actions.push(prepared.tool.doneLabel ?? prepared.tool.label);
      results.push({ type: "tool_result", toolCallId: call.id, content: r.content, isError: r.isError });
    }
    return null;
  }

  private async loop(steps: number, textSoFar: string): Promise<TurnResult> {
    const max = this.opts.maxSteps ?? 10;
    const system = await this.opts.system();
    while (steps < max) {
      this.opts.onEvent?.({ type: "thinking" });
      let res: AIChatResponse;
      try {
        res = await this.opts.gateway.chat({
          system,
          messages: windowMessages(this.messages, this.opts.windowSize ?? 40),
          tools: this.opts.registry.definitions(),
          purpose: "chat",
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        const text =
          code === "rate_limited" ? "הגעת למגבלת השימוש היומית. נסה שוב מחר." : "לא הצלחתי להתחבר לעוזר כרגע. בדוק את החיבור ונסה שוב.";
        return { status: "error", text, actions: this.actions };
      }

      const text = res.message.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
      await this.record(res.message, text || null);
      if (text) textSoFar = textSoFar ? `${textSoFar}\n\n${text}` : text;

      if (res.stopReason === "refusal") {
        return { status: "done", text: textSoFar || "אני לא יכול לעזור בבקשה הזו.", actions: this.actions };
      }
      const calls = res.message.content.filter((b): b is ToolCallBlock => b.type === "tool_call");
      if (!calls.length) {
        return { status: "done", text: textSoFar || (res.stopReason === "max_tokens" ? "התשובה נקטעה. נסה לנסח בקצרה." : ""), actions: this.actions };
      }

      const results: ToolResultBlock[] = [];
      const paused = await this.processCalls(calls, results, 0, steps, textSoFar);
      if (paused) return paused;
      await this.record({ role: "user", content: results }, null);
      // Only the latest model text is shown once tools ran; interim narration is dropped.
      textSoFar = "";
      steps++;
    }
    return { status: "done", text: textSoFar || "עצרתי אחרי מספר צעדים. אפשר לנסח את הבקשה אחרת?", actions: this.actions };
  }
}

/**
 * Short-term context: the last `size` messages, starting at a clean user turn so every
 * tool_result keeps its tool_call. When older turns are dropped, provider state (e.g. thinking
 * blocks) is stripped so the model only sees an append-only history.
 */
export function windowMessages(messages: AIMessage[], size: number): AIMessage[] {
  if (messages.length <= size) return messages;
  let start = messages.length - size;
  while (start < messages.length) {
    const m = messages[start];
    if (m.role === "user" && !m.content.some((b) => b.type === "tool_result")) break;
    start++;
  }
  return messages.slice(start).map((m) => (m.providerState ? { role: m.role, content: m.content } : m));
}
