// Text extraction for the ingestion pipeline: File -> plain text.
import { extractText as extractPdfText, getDocumentProxy } from "npm:unpdf@1";
import mammoth from "npm:mammoth@1";
import { Buffer } from "node:buffer";
import * as XLSX from "npm:xlsx@0.18.5";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import type { AIProvider } from "./ai/types.ts";

export interface Extracted {
  text: string;
  pageCount?: number;
  method: "pdf-text" | "pdf-vision" | "docx" | "xlsx" | "plain" | "vision";
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const OCR_PROMPT =
  "Transcribe ALL text in this document image exactly as written, preserving the original language (often Hebrew), " +
  "headings, numbering and table rows (use ' | ' between cells). Do not summarize, translate or add commentary. " +
  "If there is no text, reply with an empty string.";

export async function extractText(bytes: Uint8Array, mimeType: string, ai: AIProvider): Promise<Extracted> {
  const mime = mimeType.toLowerCase();

  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractPdfText(pdf, { mergePages: false });
    const joined = (text as string[]).map((t, i) => `[עמוד ${i + 1}]\n${t}`).join("\n\n");
    // Scanned PDFs have (almost) no text layer — fall back to the model's document vision.
    if (joined.replace(/\[עמוד \d+\]|\s/g, "").length > 40 * totalPages) {
      return { text: joined, pageCount: totalPages, method: "pdf-text" };
    }
    const res = await ai.chat({
      system: OCR_PROMPT,
      purpose: "extract",
      messages: [{
        role: "user",
        content: [{ type: "document", mediaType: "application/pdf", data: encodeBase64(bytes) }, { type: "text", text: "Transcribe." }],
      }],
    });
    return { text: textOf(res.message.content), pageCount: totalPages, method: "pdf-vision" };
  }

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: value, method: "docx" };
  }

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" || mime === "text/csv"
  ) {
    const wb = XLSX.read(bytes, { type: "array" });
    const parts = wb.SheetNames.map((name) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: " | ", blankrows: false });
      return `## ${name}\n${csv}`;
    });
    return { text: parts.join("\n\n"), method: "xlsx" };
  }

  if ((IMAGE_TYPES as readonly string[]).includes(mime)) {
    const res = await ai.chat({
      system: OCR_PROMPT,
      purpose: "extract",
      messages: [{
        role: "user",
        content: [{ type: "image", mediaType: mime as ImageType, data: encodeBase64(bytes) }, { type: "text", text: "Transcribe." }],
      }],
    });
    return { text: textOf(res.message.content), method: "vision" };
  }

  if (mime.startsWith("text/") || mime === "application/json") {
    return { text: new TextDecoder().decode(bytes), method: "plain" };
  }

  throw new Error(`unsupported mime type ${mimeType}`);
}

function textOf(content: { type: string; text?: string }[]): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
}
