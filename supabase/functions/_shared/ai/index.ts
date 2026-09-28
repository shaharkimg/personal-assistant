import { AnthropicProvider } from "./anthropic.ts";
import { OpenAIProvider } from "./openai.ts";
import type { AIProvider } from "./types.ts";
import { HttpError } from "../http.ts";

export * from "./types.ts";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(503, `missing secret ${name}`, "ai_not_configured");
  return v;
}

/**
 * Picks the chat provider from secrets. API keys only ever live in Supabase secrets
 * (`supabase secrets set ...`) — never in the mobile bundle.
 */
export function getAIProvider(): AIProvider {
  const provider = Deno.env.get("AI_PROVIDER") ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(
        required("ANTHROPIC_API_KEY"),
        Deno.env.get("AI_MODEL") ?? "claude-opus-5",
        (Deno.env.get("AI_EFFORT") as "low" | "medium" | "high") ?? "medium",
        Deno.env.get("AI_REFUSAL_FALLBACK") !== "false",
      );
    case "openai":
      return new OpenAIProvider(required("OPENAI_API_KEY"), Deno.env.get("AI_MODEL") ?? "gpt-5");
    default:
      throw new Error(`unknown AI_PROVIDER ${provider}`);
  }
}
