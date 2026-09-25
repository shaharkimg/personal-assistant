import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import type { AIChatRequest, AIChatResponse, AIContentBlock, AIMessage, AIProvider, AIStopReason } from "./types.ts";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Anthropic Messages API implementation of AIProvider.
 * Adaptive thinking is on; assistant turns keep their raw content (incl. thinking blocks)
 * in providerState so multi-step tool loops replay them unchanged.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private effort: Effort = "medium",
    private refusalFallback = true,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(req: AIChatRequest): Promise<AIChatResponse> {
    const effort: Effort = req.purpose === "classify" ? "low" : this.effort;
    const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages.map((m) => this.toAnthropic(m)),
      thinking: { type: "adaptive" },
      output_config: {
        effort,
        ...(req.responseSchema ? { format: { type: "json_schema", schema: req.responseSchema } } : {}),
      },
      ...(req.tools?.length && !req.responseSchema
        ? {
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
          })),
        }
        : {}),
    };

    // Server-side refusal fallback routes a refused request to a fallback model automatically.
    const extra = this.refusalFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
    const res = await this.client.beta.messages.create({ ...params, ...extra } as typeof params);

    const content: AIContentBlock[] = [];
    for (const block of res.content) {
      if (block.type === "text") content.push({ type: "text", text: block.text });
      else if (block.type === "tool_use") {
        content.push({ type: "tool_call", id: block.id, name: block.name, input: block.input as Record<string, unknown> });
      }
    }

    return {
      message: {
        role: "assistant",
        content,
        providerState: { provider: this.name, model: res.model, raw: res.content },
      },
      stopReason: mapStop(res.stop_reason),
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      provider: this.name,
      model: res.model,
    };
  }

  private toAnthropic(m: AIMessage): Anthropic.Beta.Messages.BetaMessageParam {
    if (m.role === "assistant" && m.providerState?.provider === this.name && m.providerState.model === this.model) {
      return { role: "assistant", content: m.providerState.raw as Anthropic.Beta.Messages.BetaContentBlockParam[] };
    }
    const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
    for (const b of m.content) {
      switch (b.type) {
        case "text":
          if (b.text) content.push({ type: "text", text: b.text });
          break;
        case "image":
          content.push({ type: "image", source: { type: "base64", media_type: b.mediaType, data: b.data } });
          break;
        case "document":
          content.push({ type: "document", source: { type: "base64", media_type: b.mediaType, data: b.data } });
          break;
        case "tool_call":
          content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
          break;
        case "tool_result":
          content.push({ type: "tool_result", tool_use_id: b.toolCallId, content: b.content, is_error: b.isError });
          break;
      }
    }
    return { role: m.role, content };
  }
}

function mapStop(reason: string | null): AIStopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}
