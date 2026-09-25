// Client mirror of supabase/functions/_shared/ai/types.ts (the wire contract of /ai-chat).
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
  responseSchema?: JSONSchema;
  maxTokens?: number;
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
