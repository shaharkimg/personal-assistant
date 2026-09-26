import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface AuthContext {
  userId: string;
  email: string | null;
  /** Client bound to the caller's JWT: every query is subject to RLS. */
  db: SupabaseClient;
}

/** Verifies the caller's JWT and returns a user-scoped client. */
export async function requireUser(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "missing token", "unauthorized");
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(authHeader.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError(401, "invalid token", "unauthorized");
  return { userId: data.user.id, email: data.user.email?.toLowerCase() ?? null, db };
}

/** Service-role client. Use only for operations RLS cannot express (usage metering, account deletion, cron). */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_REQUEST_LIMIT") ?? "500");

/** Counts one AI request for the user today; throws 429 above the configured daily limit. */
export async function startMeteredRequest(userId: string): Promise<void> {
  await bump(userId, 0, 0, 1);
}

/** Records token usage for a finished request (does not count as a new request). */
export async function recordTokens(userId: string, inputTokens: number, outputTokens: number): Promise<void> {
  await bump(userId, inputTokens, outputTokens, 0).catch((e) => console.error("usage record failed", e));
}

async function bump(userId: string, input: number, output: number, count: number): Promise<void> {
  const { error } = await adminClient().rpc("bump_ai_usage", {
    p_user: userId,
    p_input: input,
    p_output: output,
    p_limit: DAILY_LIMIT,
    p_count: count,
  });
  if (error) {
    if (error.code === "P0001") throw new HttpError(429, "daily AI limit reached", "rate_limited");
    throw error;
  }
}
