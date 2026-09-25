import type { WaitingFor, WaitingStatus } from "@/domain/types";
import { type Actor, fromRow, likePattern, logActivity, supabase, toRow, unwrap } from "./db";

export interface WaitingInput {
  person: string;
  personId?: string | null;
  subject: string;
  expectedResponseDate?: string | null;
  relatedTaskId?: string | null;
  projectId?: string | null;
  notes?: string | null;
}

export async function listWaiting(status: WaitingStatus | "all" = "open"): Promise<WaitingFor[]> {
  let q = supabase.from("waiting_for").select("*");
  if (status !== "all") q = q.eq("status", status);
  const rows = unwrap(await q.order("expected_response_date", { ascending: true, nullsFirst: false }).limit(300));
  return rows.map((r) => fromRow<WaitingFor>(r));
}

export async function getWaiting(id: string): Promise<WaitingFor | null> {
  const row = unwrap(await supabase.from("waiting_for").select("*").eq("id", id).maybeSingle());
  return row ? fromRow<WaitingFor>(row) : null;
}

export async function searchWaiting(query: string): Promise<WaitingFor[]> {
  const rows = unwrap(
    await supabase.from("waiting_for").select("*").eq("status", "open")
      .or(`person.ilike.${likePattern(query)},subject.ilike.${likePattern(query)}`).limit(20),
  );
  return rows.map((r) => fromRow<WaitingFor>(r));
}

export async function createWaiting(input: WaitingInput, actor: Actor = "user"): Promise<WaitingFor> {
  const row = unwrap(await supabase.from("waiting_for").insert(toRow({ ...input })).select().single());
  const w = fromRow<WaitingFor>(row);
  await logActivity(actor, "waiting.created", `ממתין לתשובה מ${w.person}: ${w.subject}`, { type: "waiting_for", id: w.id }, {
    expectedResponseDate: w.expectedResponseDate,
  });
  return w;
}

export async function updateWaiting(id: string, patch: Partial<WaitingInput> & { status?: WaitingStatus }, actor: Actor = "user"): Promise<WaitingFor> {
  const extra = patch.status && patch.status !== "open" ? { resolvedAt: new Date().toISOString() } : {};
  const row = unwrap(await supabase.from("waiting_for").update(toRow({ ...patch, ...extra })).eq("id", id).select().single());
  const w = fromRow<WaitingFor>(row);
  const label = patch.status === "received" ? `התקבלה תשובה מ${w.person}` : patch.status === "cancelled" ? `בוטל מעקב אחרי ${w.person}` : `עודכן מעקב: ${w.person}`;
  await logActivity(actor, patch.status ? `waiting.${patch.status}` : "waiting.updated", label, { type: "waiting_for", id });
  return w;
}

export async function deleteWaiting(id: string, actor: Actor = "user"): Promise<void> {
  unwrap(await supabase.from("waiting_for").delete().eq("id", id));
  await logActivity(actor, "waiting.deleted", "נמחק פריט מעקב", { type: "waiting_for", id });
}
