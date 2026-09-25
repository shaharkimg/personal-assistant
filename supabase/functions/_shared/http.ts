// Small HTTP helpers shared by all edge functions.

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  // Native apps do not send Origin; browsers (dev web build) must be allow-listed.
  const origin = req.headers.get("origin");
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    ...(allow ? { "Access-Control-Allow-Origin": allow, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Wraps a handler with CORS preflight, method check and uniform error responses. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.code, message: err.message }, err.status);
      // Never leak provider errors / stack traces to the client.
      console.error(err);
      return json(req, { error: "internal_error" }, 500);
    }
  };
}
