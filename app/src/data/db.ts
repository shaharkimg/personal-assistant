import { supabase } from "@/lib/supabase";
import type { ActivityEntry } from "@/domain/types";

export { supabase };

export type Actor = ActivityEntry["actor"];

type Row = Record<string, unknown>;

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Shallow snake_case -> camelCase (jsonb payloads are left untouched). */
export function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out as T;
}

/** Shallow camelCase -> snake_case, dropping undefined values. */
export function toRow(obj: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[snake(k)] = v;
  return out;
}

/** Throws on error; after that the payload is present (maybeSingle() may still yield null at runtime). */
export function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/** Quoted ilike pattern safe to embed in a PostgREST `.or()` filter string. */
export function likePattern(q: string): string {
  const cleaned = q.replace(/[%_*]/g, " ").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${cleaned}%"`;
}

/** Appends to the audit log. Failures are reported but never block the user's action. */
export async function logActivity(
  actor: Actor,
  action: string,
  summary: string,
  entity?: { type: string; id: string },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    actor,
    action,
    summary,
    entity_type: entity?.type ?? null,
    entity_id: entity?.id ?? null,
    metadata,
  });
  if (error) console.warn("activity log failed", error.message);
}
