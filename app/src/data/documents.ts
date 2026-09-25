import type { DocumentRecord } from "@/domain/types";
import { type Actor, fromRow, likePattern, logActivity, supabase, toRow, unwrap } from "./db";

export async function listDocuments(opts: { projectId?: string; limit?: number } = {}): Promise<DocumentRecord[]> {
  let q = supabase.from("documents").select("*");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  return unwrap(await q.order("created_at", { ascending: false }).limit(opts.limit ?? 200)).map((r) => fromRow<DocumentRecord>(r));
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const row = unwrap(await supabase.from("documents").select("*").eq("id", id).maybeSingle());
  return row ? fromRow<DocumentRecord>(row) : null;
}

export async function findDocumentsByTitle(query: string): Promise<DocumentRecord[]> {
  return unwrap(
    await supabase.from("documents").select("*").or(`title.ilike.${likePattern(query)},file_name.ilike.${likePattern(query)}`).limit(10),
  ).map((r) => fromRow<DocumentRecord>(r));
}

export async function insertDocument(
  input: Pick<DocumentRecord, "title" | "fileName" | "mimeType" | "storagePath" | "source"> &
    Partial<Pick<DocumentRecord, "sizeBytes" | "projectId" | "extraStoragePaths">>,
  actor: Actor = "user",
): Promise<DocumentRecord> {
  const d = fromRow<DocumentRecord>(unwrap(await supabase.from("documents").insert(toRow({ ...input })).select().single()));
  await logActivity(actor, "document.added", `נוסף מסמך: ${d.title}`, { type: "document", id: d.id });
  return d;
}

export async function updateDocument(id: string, patch: Partial<Pick<DocumentRecord, "title" | "projectId">>, actor: Actor = "user") {
  const d = fromRow<DocumentRecord>(unwrap(await supabase.from("documents").update(toRow(patch)).eq("id", id).select().single()));
  await logActivity(actor, "document.updated", `עודכן מסמך: ${d.title}`, { type: "document", id });
  return d;
}

/** Ordered chunks — used to "read" a document without re-downloading the file. */
export async function readDocumentText(id: string, maxChars = 30_000): Promise<{ text: string; truncated: boolean }> {
  const rows = unwrap(
    await supabase.from("document_chunks").select("chunk_index, content, heading").eq("document_id", id).order("chunk_index").limit(1000),
  ) as { content: string }[];
  let text = "";
  for (const r of rows) {
    if (text.length + r.content.length > maxChars) return { text, truncated: true };
    text += (text ? "\n\n" : "") + r.content;
  }
  return { text, truncated: false };
}

export async function deleteDocument(id: string, actor: Actor = "user"): Promise<void> {
  const d = await getDocument(id);
  if (!d) return;
  await supabase.storage.from("documents").remove([d.storagePath, ...d.extraStoragePaths]);
  unwrap(await supabase.from("documents").delete().eq("id", id));
  await logActivity(actor, "document.deleted", `נמחק מסמך: ${d.title}`, { type: "document", id });
}

export async function signedUrl(path: string, seconds = 300): Promise<string | null> {
  const { data } = await supabase.storage.from("documents").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
