import OpenAI from "npm:openai@7";
import type { AIChatRequest, AIChatResponse, AIMessage, AIProvider, AIStopReason } from "./types.ts";

/** OpenAI Chat Completions implementation of AIProvider. */
export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(req: AIChatRequest): Promise<AIChatResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: req.system }];
    for (const m of req.messages) messages.push(...this.toOpenAI(m));

    const res = await this.client.chat.completions.create({
      model: this.model,
      max_completion_tokens: req.maxTokens ?? 16000,
      messages,
      ...(req.tools?.length && !req.responseSchema
        ? {
          tools: req.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
        }
        : {}),
      ...(req.responseSchema
        ? { response_format: { type: "json_schema" as const, json_schema: { name: "result", schema: req.responseSchema } } }
        : {}),
    });

    const choice = res.choices[0];
    const content: AIMessage["content"] = [];
    if (choice.message.content) content.push({ type: "text", text: choice.message.content });
    for (const call of choice.message.tool_calls ?? []) {
      if (call.type !== "function") continue;
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = { __invalid_json: call.function.arguments };
      }
      content.push({ type: "tool_call", id: call.id, name: call.function.name, input });
    }

    return {
      message: { role: "assistant", content },
      stopReason: mapStop(choice.finish_reason),
      usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 },
      provider: this.name,
      model: res.model,
    };
  }

  private toOpenAI(m: AIMessage): OpenAI.Chat.ChatCompletionMessageParam[] {
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      const toolCalls = m.content.flatMap((b) =>
        b.type === "tool_call"
          ? [{ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }]
          : []
      );
      return [{ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }];
    }
    const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: b.toolCallId, content: b.isError ? `ERROR: ${b.content}` : b.content });
      } else if (b.type === "text") parts.push({ type: "text", text: b.text });
      else if (b.type === "image") {
        parts.push({ type: "image_url", image_url: { url: `data:${b.mediaType};base64,${b.data}` } });
      } else if (b.type === "document") {
        parts.push({ type: "file", file: { filename: "document.pdf", file_data: `data:${b.mediaType};base64,${b.data}` } });
      }
    }
    if (parts.length) out.push({ role: "user", content: parts });
    return out;
  }
}

function mapStop(reason: string | null | undefined): AIStopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}
