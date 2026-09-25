import { describe, expect, it } from "vitest";
import { chunkText, normalizeText } from "../../supabase/functions/_shared/chunk";

describe("document chunking", () => {
  it("normalizes whitespace", () => {
    expect(normalizeText("a\r\n\r\n\r\n\tb   c")).toBe("a\n\nb c");
  });

  it("keeps small documents in one chunk", () => {
    expect(chunkText("שלום עולם")).toEqual([{ index: 0, content: "שלום עולם", heading: null }]);
  });

  it("splits long text with overlap and tracks section headings", () => {
    const sections = Array.from({ length: 6 }, (_, i) =>
      `סעיף ${i + 1} – נושא ${i + 1}\n${`זהו תוכן הסעיף ה-${i + 1} בהסכם. `.repeat(40)}`,
    ).join("\n\n");
    const chunks = chunkText(sections, { maxChars: 1200, overlap: 150 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.content.length <= 1400)).toBe(true);
    expect(chunks[0].heading).toBe("סעיף 1 – נושא 1");
    const s7 = chunks.find((c) => c.content.includes("הסעיף ה-6"));
    expect(s7?.heading).toBe("סעיף 6 – נושא 6");
    // indices are sequential
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("hard-splits a single giant sentence", () => {
    const chunks = chunkText("א".repeat(5000), { maxChars: 1000, overlap: 0 });
    expect(chunks).toHaveLength(5);
  });
});
