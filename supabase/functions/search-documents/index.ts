// POST /search-documents { query, documentIds?, limit? } — hybrid (vector + keyword) retrieval.
import { handler, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validate.ts";
import { getEmbeddingProvider } from "../_shared/embeddings/index.ts";

const Body = z.object({
  query: z.string().min(1).max(1000),
  documentIds: z.array(z.uuid()).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

Deno.serve(handler(async (req) => {
  const { db } = await requireUser(req);
  const { query, documentIds, limit } = await parseBody(req, Body);

  const embedder = getEmbeddingProvider();
  const [embedding] = embedder ? await embedder.embed([query], "query") : [null];

  // RPC is SECURITY INVOKER: RLS restricts matches to the caller's chunks.
  const { data, error } = await db.rpc("match_document_chunks", {
    query_embedding: embedding ? JSON.stringify(embedding) : null,
    query_text: query,
    match_count: limit ?? 8,
    filter_document_ids: documentIds ?? null,
  });
  if (error) throw error;

  const ids = [...new Set((data ?? []).map((r: { document_id: string }) => r.document_id))];
  const { data: docs } = ids.length
    ? await db.from("documents").select("id, title, file_name, created_at").in("id", ids)
    : { data: [] };
  const byId = new Map((docs ?? []).map((d: { id: string }) => [d.id, d]));
  return json(req, {
    results: (data ?? []).map((r: Record<string, unknown>) => ({ ...r, document: byId.get(r.document_id as string) })),
  });
}));
