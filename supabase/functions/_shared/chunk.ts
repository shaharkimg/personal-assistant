// Pure text chunking used by the ingestion pipeline (no Deno APIs, unit-tested from the app).

export interface Chunk {
  index: number;
  content: string;
  heading: string | null;
}

export interface ChunkOptions {
  /** Target size in characters (~4 chars/token for Latin, less for Hebrew). */
  maxChars?: number;
  /** Characters of overlap carried from the previous chunk for context continuity. */
  overlap?: number;
}

const HEADING_RE = /^(#{1,6}\s+.+|(?:סעיף|פרק|section|article|chapter)\s*[\d.א-ת]+.*|\d+(?:\.\d+)*[.)]\s+\S.{0,80})$/i;

/** Normalizes whitespace while keeping paragraph breaks. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Splits text into overlapping chunks on paragraph/sentence boundaries, tracking the
 * nearest preceding heading (e.g. "סעיף 7 – תקופת ההתקשרות") so retrieval can cite sections.
 */
export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 1800;
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(maxChars / 3));
  const text = normalizeText(raw);
  if (!text) return [];

  const paragraphs = text.split(/\n\s*\n|\n(?=\s*(?:#{1,6}\s|\d+(?:\.\d+)*[.)]\s|סעיף\s))/);
  const chunks: Chunk[] = [];
  let current = "";
  let carried = ""; // overlap copied from the previous chunk (not new content)
  let currentHeading: string | null = null;
  let lastHeading: string | null = null;

  const flush = () => {
    const content = current.trim();
    if (content) chunks.push({ index: chunks.length, content, heading: currentHeading });
    current = overlap > 0 && content.length > overlap ? content.slice(-overlap).replace(/^\S*\s/, "") : "";
    carried = current;
    currentHeading = lastHeading;
  };

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    const firstLine = p.split("\n")[0].trim();
    if (HEADING_RE.test(firstLine) && firstLine.length <= 120) {
      lastHeading = firstLine.replace(/^#+\s*/, "");
      if (current.trim().length > maxChars / 3) flush();
      if (!currentHeading) currentHeading = lastHeading;
    }
    for (const piece of splitLong(p, maxChars)) {
      if (current.length + piece.length + 2 > maxChars && current.trim()) flush();
      current += (current ? "\n\n" : "") + piece;
      if (!currentHeading) currentHeading = lastHeading;
    }
  }
  // Emit the tail unless it is only the overlap carried from the previous chunk.
  if (current.trim() && current !== carried) {
    chunks.push({ index: chunks.length, content: current.trim(), heading: currentHeading });
  }
  return chunks;
}

function splitLong(p: string, maxChars: number): string[] {
  if (p.length <= maxChars) return [p];
  const sentences = p.split(/(?<=[.!?։׃])\s+/);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > maxChars) {
      if (buf) out.push(buf), (buf = "");
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars));
      continue;
    }
    if (buf.length + s.length + 1 > maxChars) out.push(buf), (buf = "");
    buf += (buf ? " " : "") + s;
  }
  if (buf) out.push(buf);
  return out;
}
