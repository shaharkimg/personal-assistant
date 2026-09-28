import { assertEquals } from "jsr:@std/assert@1";
import { layoutPageText, type PdfTextItem } from "./pdf_layout.ts";

const item = (str: string, x: number, y: number, width: number, dir = "ltr"): PdfTextItem => ({ str, transform: [14, 0, 0, 14, x, y], width, dir });

// Items as Chrome emits them for an RTL paragraph: runs in visual (left-to-right) order.
Deno.test("Hebrew line with dates keeps reading order", () => {
  const items = [
    item("הסכם שכירות", 480, 737, 98, "rtl"),
    item("", 241, 710, 0),
    item(".31.10.2027", 241, 710, 63),
    item(" ", 305, 710, 4),
    item("ומסתיימת ביום", 308, 710, 64, "rtl"),
    item(" ", 372, 710, 4),
    item("1.11.2026", 375, 710, 53),
    item(" ", 429, 710, 4),
    item(". תקופת השכירות מתחילה ביום", 432, 710, 140, "rtl"),
    item("1", 572, 710, 7),
  ];
  assertEquals(layoutPageText(items), "הסכם שכירות\n1. תקופת השכירות מתחילה ביום 1.11.2026 ומסתיימת ביום 31.10.2027.");
});

Deno.test("LTR lines stay left-to-right and gaps become spaces", () => {
  const items = [item("Invoice", 50, 700, 40), item("due", 95, 700, 20), item("31.12.2027.", 120, 700, 60), item("Next line", 50, 680, 50)];
  assertEquals(layoutPageText(items), "Invoice due 31.12.2027.\nNext line");
});
