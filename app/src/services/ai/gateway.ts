import { callFunction } from "@/lib/supabase";
import type { AIChatRequest, AIChatResponse } from "./types";

/**
 * The only way the app talks to a language model: through the authenticated /ai-chat edge
 * function, which holds the provider keys. Swapping providers happens server-side.
 */
export interface AIGateway {
  chat(req: AIChatRequest): Promise<AIChatResponse>;
}

export const aiGateway: AIGateway = {
  chat: (req) => callFunction<AIChatResponse>("ai-chat", req),
};

export function textOf(res: AIChatResponse): string {
  return res.message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
}
