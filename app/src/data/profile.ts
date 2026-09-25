import type { ActivityEntry, Profile } from "@/domain/types";
import { callFunction } from "@/lib/supabase";
import { fromRow, logActivity, supabase, toRow, unwrap } from "./db";

export async function getProfile(): Promise<Profile | null> {
  const row = unwrap(await supabase.from("profiles").select("*").maybeSingle());
  return row ? fromRow<Profile>(row) : null;
}

export async function updateProfile(patch: Partial<Omit<Profile, "id">>): Promise<Profile> {
  const { data: session } = await supabase.auth.getSession();
  const id = session.session?.user.id;
  const row = unwrap(await supabase.from("profiles").update(toRow(patch)).eq("id", id!).select().single());
  await logActivity("user", "settings.updated", "עודכנו הגדרות", undefined, { changed: Object.keys(patch) });
  return fromRow<Profile>(row);
}

export async function listActivity(limit = 100, before?: number): Promise<ActivityEntry[]> {
  let q = supabase.from("activity_log").select("*").order("id", { ascending: false }).limit(limit);
  if (before) q = q.lt("id", before);
  return unwrap(await q).map((r) => fromRow<ActivityEntry>(r));
}

export async function clearActivity() {
  unwrap(await supabase.from("activity_log").delete().not("id", "is", null));
}

export function exportAllData(): Promise<Record<string, unknown>> {
  return callFunction("export-data", {});
}

export function deleteAccount(): Promise<{ deleted: boolean }> {
  return callFunction("delete-account", { confirm: "DELETE" });
}

export async function registerPushToken(token: string, platform: "ios" | "android") {
  await supabase.from("push_tokens").upsert({ token, platform, updated_at: new Date().toISOString() });
}
