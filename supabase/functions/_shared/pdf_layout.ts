// Rebuilds reading-order text from PDF text items using their positions.
//
// Many producers (Chrome, Word) emit a Hebrew line's runs in visual left-to-right order, so
// joining items in stream order swaps numbers and dates with the words around them
// ("מתחילה ביום 1.11.2026 ומסתיימת ביום 31.10.2027" came out pairing the wrong dates).
// Geometry is the ground truth: group items into lines by y, then order each line right-to-left
// when it contains RTL text.

export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, x, y] */
  transform: number[];
  width: number;
  height?: number;
  dir?: string;
}

const RTL_CHARS = /[֐-׿؀-ۿ]/;
const LEADING_PUNCT = /^([.,:;!?]+)(.*)$/s;

export function layoutPageText(items: PdfTextItem[]): string {
  const lines: { y: number; size: number; items: PdfTextItem[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const y = it.transform[5];
    const size = Math.abs(it.transform[3]) || it.height || 10;
    const line = lines.find((l) => Math.abs(l.y - y) <= Math.max(l.size, size) * 0.4);
    if (line) line.items.push(it);
    else lines.push({ y, size, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(renderLine).filter((l) => l.trim()).join("\n");
}

function renderLine(line: { size: number; items: PdfTextItem[] }): string {
  const rtl = line.items.some((i) => i.dir === "rtl" || RTL_CHARS.test(i.str));
  const x = (i: PdfTextItem) => i.transform[4];
  const ordered = [...line.items].sort((a, b) => (rtl ? x(b) - x(a) : x(a) - x(b)));
  let out = "";
  let prev: PdfTextItem | null = null;
  for (const it of ordered) {
    let s = it.str;
    // A sentence-final "." that sits left of a number is grouped into the LTR run in visual order.
    if (rtl && !RTL_CHARS.test(s)) {
      const m = LEADING_PUNCT.exec(s);
      if (m && m[2]) s = m[2] + m[1];
    }
    if (prev) {
      const gap = rtl ? x(prev) - (x(it) + it.width) : x(it) - (x(prev) + prev.width);
      if (gap > line.size * 0.15 && !/\s$/.test(out) && !/^\s/.test(s)) out += " ";
    }
    out += s;
    prev = it;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}
