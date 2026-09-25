// POST /ai-chat — single model step for the app's agent loop.
//
// The mobile app owns the loop and the tool layer (many tools touch on-device data such as
// the calendar and contacts). This function only: authenticates, validates and bounds the
// request, meters usage, and calls the configured AIProvider with server-held API keys.
// It never executes tools, so a client-supplied tool list grants no extra privilege.
import { handler, json } from "../_shared/http.ts";
import { recordTokens, requireUser, startMeteredRequest } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validate.ts";
import { getAIProvider } from "../_shared/ai/index.ts";

const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(100_000) }),
  z.object({
    type: z.literal("image"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    data: z.string().max(7_000_000),
  }),
  z.object({ type: z.literal("document"), mediaType: z.literal("application/pdf"), data: z.string().max(14_000_000) }),
  z.object({
    type: z.literal("tool_call"),
    id: z.string().max(200),
    name: z.string().max(64),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolCallId: z.string().max(200),
    content: z.string().max(200_000),
    isError: z.boolean().optional(),
  }),
]);

const Body = z.object({
  system: z.string().max(40_000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.array(block).max(64),
    providerState: z.object({ provider: z.string(), model: z.string(), raw: z.unknown() }).optional(),
  })).min(1).max(120),
  tools: z.array(z.object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
    description: z.string().max(2000),
    inputSchema: z.record(z.string(), z.unknown()),
  })).max(64).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  maxTokens: z.number().int().min(256).max(32_000).optional(),
  purpose: z.enum(["chat", "classify", "extract"]).optional(),
});

Deno.serve(handler(async (req) => {
  const { userId } = await requireUser(req);
  const body = await parseBody(req, Body);
  await startMeteredRequest(userId);

  const provider = getAIProvider();
  const res = await provider.chat(body);
  await recordTokens(userId, res.usage.inputTokens, res.usage.outputTokens);
  return json(req, res);
}));
