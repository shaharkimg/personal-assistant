// Provider-agnostic AI contracts. Everything above this layer (edge functions and the
// mobile app) speaks only these types, so switching Anthropic <-> OpenAI <-> anything
// else is a configuration change, not a rewrite.

export type JSONSchema = Record<string, unknown>;

export type AIContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string }
  | { type: "document"; mediaType: "application/pdf"; data: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface AIMessage {
  role: "user" | "assistant";
  content: AIContentBlock[];
  /**
   * Opaque provider-native content for assistant turns (e.g. Anthropic thinking blocks).
   * Replayed verbatim when the same provider+model continues the conversation, ignored otherwise.
   */
  providerState?: { provider: string; model: string; raw: unknown };
}

export interface AIToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface AIChatRequest {
  system: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  /** When set, the model must answer with JSON matching this schema (no tools). */
  responseSchema?: JSONSchema;
  maxTokens?: number;
  /** Lets providers pick cheaper/faster settings for simple jobs. */
  purpose?: "chat" | "classify" | "extract";
}

export type AIStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface AIChatResponse {
  message: AIMessage;
  stopReason: AIStopReason;
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  chat(req: AIChatRequest): Promise<AIChatResponse>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(audio: Blob, opts: { language?: string; fileName: string }): Promise<{ text: string; language?: string }>;
}
