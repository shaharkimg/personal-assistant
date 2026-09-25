import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { secureStorage } from "./secureStorage";

// Rows are mapped explicitly in src/data (fromRow), so the client is untyped.
export const supabase = createClient<any>(SUPABASE_URL || "https://not-configured.invalid", SUPABASE_ANON_KEY || "anon", {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("not signed in");
  return id;
}

export class FunctionError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
  }
}

/** Invokes an edge function with the user's JWT and normalizes errors. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) {
    let code = "network_error";
    let status: number | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const payload = await ctx.json();
        code = payload.error ?? code;
      } catch {
        /* ignore */
      }
    }
    throw new FunctionError(code, error.message, status);
  }
  return data as T;
}

/** Multipart variant (audio upload). */
export async function callFunctionForm<T>(name: string, form: FormData): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.session?.access_token ?? ""}`, apikey: SUPABASE_ANON_KEY },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new FunctionError(payload.error ?? "error", payload.message ?? res.statusText, res.status);
  return payload as T;
}
