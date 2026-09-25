import OpenAI from "npm:openai@7";
import type { EmbeddingProvider } from "../ai/types.ts";

/** OpenAI-compatible embeddings (OpenAI, Azure OpenAI, or any compatible gateway via EMBEDDINGS_BASE_URL). */
class OpenAIEmbeddings implements EmbeddingProvider {
  readonly name = "openai";
  readonly dimensions = 1536; // must match document_chunks.embedding
  private client: OpenAI;

  constructor(apiKey: string, private model: string, baseURL?: string) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    // Batch to stay under request size limits.
    for (let i = 0; i < texts.length; i += 64) {
      const res = await this.client.embeddings.create({
        model: this.model,
        input: texts.slice(i, i + 64),
        dimensions: this.dimensions,
      });
      out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return out;
  }
}

/** Returns null when no embeddings key is configured — retrieval then falls back to full-text search only. */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const key = Deno.env.get("EMBEDDINGS_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  return new OpenAIEmbeddings(
    key,
    Deno.env.get("EMBEDDINGS_MODEL") ?? "text-embedding-3-small",
    Deno.env.get("EMBEDDINGS_BASE_URL") ?? undefined,
  );
}
