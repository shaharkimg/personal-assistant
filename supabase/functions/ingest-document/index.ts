// POST /ingest-document { documentId } — File -> text extraction -> chunking -> embeddings -> index.
import { handler, HttpError, json } from "../_shared/http.ts";
import { requireUser, startMeteredRequest } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validate.ts";
import { getAIProvider } from "../_shared/ai/index.ts";
import { getEmbeddingProvider } from "../_shared/embeddings/index.ts";
import { extractText } from "../_shared/extract.ts";
import { chunkText } from "../_shared/chunk.ts";

const Body = z.object({ documentId: z.uuid() });
const MAX_CHARS = 400_000;

Deno.serve(handler(async (req) => {
  const { userId, db } = await requireUser(req);
  const { documentId } = await parseBody(req, Body);

  // RLS guarantees the caller owns the row; a foreign id simply returns nothing.
  const { data: doc, error } = await db.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  if (!doc) throw new HttpError(404, "document not found", "not_found");

  await startMeteredRequest(userId);
  await db.from("documents").update({ status: "processing", error: null }).eq("id", documentId);

  try {
    const ai = getAIProvider();
    const paths: string[] = [doc.storage_path, ...(doc.extra_storage_paths ?? [])];
    const texts: string[] = [];
    let pageCount = 0;
    for (const [i, path] of paths.entries()) {
      const { data: blob, error: dlError } = await db.storage.from("documents").download(path);
      if (dlError || !blob) throw dlError ?? new Error("download failed");
      const extracted = await extractText(new Uint8Array(await blob.arrayBuffer()), blob.type || doc.mime_type, ai);
      pageCount += extracted.pageCount ?? 1;
      texts.push(paths.length > 1 ? `[עמוד ${i + 1}]\n${extracted.text}` : extracted.text);
    }
    const fullText = texts.join("\n\n").slice(0, MAX_CHARS);
    const chunks = chunkText(fullText);

    const embedder = getEmbeddingProvider();
    const embeddings = embedder
      ? await embedder.embed(chunks.map((c) => (c.heading ? `${c.heading}\n${c.content}` : c.content)), "document")
      : null;

    await db.from("document_chunks").delete().eq("document_id", documentId);
    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      user_id: userId,
      chunk_index: c.index,
      content: c.content,
      heading: c.heading,
      embedding: embeddings ? JSON.stringify(embeddings[i]) : null,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error: insError } = await db.from("document_chunks").insert(rows.slice(i, i + 100));
      if (insError) throw insError;
    }

    await db.from("documents").update({
      status: "ready",
      char_count: fullText.length,
      chunk_count: chunks.length,
    }).eq("id", documentId);
    await db.from("activity_log").insert({
      actor: "system",
      action: "document.indexed",
      entity_type: "document",
      entity_id: documentId,
      summary: `אינדוקס מסמך: ${doc.title} (${chunks.length} קטעים)`,
      metadata: { pageCount, embedded: Boolean(embeddings) },
    });
    return json(req, { status: "ready", chunks: chunks.length, pageCount, preview: fullText.slice(0, 1500) });
  } catch (e) {
    console.error(e);
    await db.from("documents").update({ status: "failed", error: "extraction_failed" }).eq("id", documentId);
    throw new HttpError(422, "could not process document", "extraction_failed");
  }
}));
