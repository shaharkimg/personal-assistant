import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

// Public values only (see app.config.ts). Secrets never reach the client.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? "";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (SUPABASE_URL && !SUPABASE_URL.startsWith("https://") && !__DEV__) {
  // Encrypted transport is mandatory outside local development.
  throw new Error("SUPABASE_URL must use https");
}
