import type { Memory, MemoryCategory } from "@/domain/types";
import { detectSensitive, SENSITIVE_LABELS } from "@/domain/sensitive";
import { type Actor, fromRow, logActivity, supabase, unwrap } from "./db";

export class SensitiveMemoryError extends Error {
  constructor(public kinds: string[]) {
    super(`לא נשמר: המידע כולל ${kinds.join(", ")}`);
  }
}

export async function listMemories(): Promise<Memory[]> {
  return unwrap(await supabase.from("memories").select("*").order("category").order("created_at", { ascending: false })).map((r) =>
    fromRow<Memory>(r),
  );
}

/**
 * Stores a long-term memory. Only called after the user explicitly asked or approved.
 * Sensitive content is refused unless `allowSensitive` (set only from the Memory screen,
 * where the user types it themselves).
 */
export async function createMemory(
  content: string,
  category: MemoryCategory,
  source: Memory["source"],
  actor: Actor = "user",
  allowSensitive = false,
): Promise<Memory> {
  const kinds = detectSensitive(content);
  if (kinds.length && !allowSensitive) throw new SensitiveMemoryError(kinds.map((k) => SENSITIVE_LABELS[k]));
  const m = fromRow<Memory>(unwrap(await supabase.from("memories").insert({ content, category, source }).select().single()));
  await logActivity(actor, "memory.saved", `נשמר בזיכרון: ${content.slice(0, 60)}`, { type: "memory", id: m.id });
  return m;
}

export async function deleteMemory(id: string, actor: Actor = "user") {
  unwrap(await supabase.from("memories").delete().eq("id", id));
  await logActivity(actor, "memory.deleted", "נמחק פריט מהזיכרון", { type: "memory", id });
}

export async function deleteAllMemories(actor: Actor = "user") {
  unwrap(await supabase.from("memories").delete().not("id", "is", null));
  await logActivity(actor, "memory.cleared", "נמחק כל הזיכרון ארוך הטווח");
}

export async function touchMemories(ids: string[]) {
  if (ids.length) await supabase.from("memories").update({ last_used_at: new Date().toISOString() }).in("id", ids);
}
