import { AnthropicProvider } from "./anthropic.ts";
import { OpenAIProvider } from "./openai.ts";
import type { AIProvider } from "./types.ts";

export * from "./types.ts";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
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
