import { z } from "zod";
import type { AIToolDefinition } from "@/services/ai/types";
import { toLocalISO } from "@/domain/dates";
import { type ConfirmationPreview, type Risk, type ToolContext, ToolError, type ToolSpec } from "./types";

export type PreparedCall =
  | { ok: false; error: string }
  | { ok: true; tool: ToolSpec; input: unknown; risk: Risk; preview?: ConfirmationPreview };

const MAX_RESULT_CHARS = 24_000;

/**
 * The only bridge between the model and the app's capabilities. The model sees tool schemas;
 * every call is validated (zod) and risk-classified here before anything runs.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();

  constructor(tools: ToolSpec[]) {
    for (const t of tools) {
      if (this.tools.has(t.name)) throw new Error(`duplicate tool ${t.name}`);
      this.tools.set(t.name, t);
    }
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  definitions(): AIToolDefinition[] {
    return [...this.tools.values()].map((t) => {
      const { $schema: _ignored, ...schema } = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
      return { name: t.name, description: t.description, inputSchema: schema };
    });
  }

  async prepare(name: string, rawInput: unknown, ctx: ToolContext): Promise<PreparedCall> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}". Available: ${this.names().join(", ")}` };
    const parsed = tool.schema.safeParse(rawInput);
    if (!parsed.success) return { ok: false, error: `Invalid input for ${name}: ${z.prettifyError(parsed.error)}` };
    try {
      const risk = typeof tool.risk === "function" ? await tool.risk(parsed.data, ctx) : tool.risk;
      const preview = risk === "confirm" && tool.preview ? await tool.preview(parsed.data, ctx) : undefined;
      return { ok: true, tool, input: parsed.data, risk, preview };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  /** Runs a prepared call. Returns the serialized result for the model. */
  async execute(call: Extract<PreparedCall, { ok: true }>, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
    try {
      // Re-validate: the input may have been edited on the confirmation card.
      const parsed = call.tool.schema.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid input: ${z.prettifyError(parsed.error)}`, isError: true };
      const result = await call.tool.run(parsed.data, ctx);
      return { content: serialize(result), isError: false };
    } catch (e) {
      return { content: errorMessage(e), isError: true };
    }
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof ToolError) return e.message;
  if (e instanceof Error) return `Tool failed: ${e.message}`;
  return "Tool failed";
}

/** JSON with local-time ISO dates, truncated to a safe size. */
export function serialize(value: unknown): string {
  const json = JSON.stringify(value ?? { ok: true }, function (this: Record<string, unknown>, key, v) {
    // JSON.stringify calls toJSON before the replacer, so read the raw value for Dates.
    const raw = key ? this[key] : v;
    if (raw instanceof Date) return toLocalISO(raw);
    if (key && (v === null || v === undefined)) return undefined;
    return v;
  });
  const out = json ?? '{"ok":true}';
  return out.length > MAX_RESULT_CHARS ? `${out.slice(0, MAX_RESULT_CHARS)}… [truncated]` : out;
}
