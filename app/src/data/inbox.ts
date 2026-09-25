import type { InboxItem, InboxSuggestion, InboxType } from "@/domain/types";
import { type Actor, fromRow, logActivity, supabase, toRow, unwrap } from "./db";

export interface InboxInput {
  kind: InboxItem["kind"];
  rawText?: string | null;
  url?: string | null;
  documentId?: string | null;
  suggestedType?: InboxType | null;
  suggestion?: InboxSuggestion | null;
  confidence?: number | null;
  status?: InboxItem["status"];
  finalType?: InboxType | null;
  processedRefType?: string | null;
  processedRefId?: string | null;
}

export async function listInbox(status: InboxItem["status"] | "all" = "new"): Promise<InboxItem[]> {
  let q = supabase.from("inbox_items").select("*");
  if (status !== "all") q = q.eq("status", status);
  return unwrap(await q.order("created_at", { ascending: false }).limit(200)).map((r) => fromRow<InboxItem>(r));
}

export async function createInboxItem(input: InboxInput, actor: Actor = "user"): Promise<InboxItem> {
  const item = fromRow<InboxItem>(unwrap(await supabase.from("inbox_items").insert(toRow({ ...input })).select().single()));
  await logActivity(actor, "inbox.captured", `נקלט ל-Inbox: ${(item.rawText ?? item.url ?? "קובץ").slice(0, 60)}`, { type: "inbox", id: item.id });
  return item;
}

export async function updateInboxItem(id: string, patch: Partial<InboxInput>): Promise<InboxItem> {
  return fromRow<InboxItem>(unwrap(await supabase.from("inbox_items").update(toRow(patch)).eq("id", id).select().single()));
}

export async function markInboxProcessed(id: string, finalType: InboxType, ref: { type: string; id: string }, actor: Actor = "user") {
  await updateInboxItem(id, { status: "processed", finalType, processedRefType: ref.type, processedRefId: ref.id });
  await logActivity(actor, "inbox.processed", `מוין מה-Inbox כ-${finalType}`, { type: "inbox", id }, { ref });
}

export async function deleteInboxItem(id: string) {
  unwrap(await supabase.from("inbox_items").delete().eq("id", id));
}
