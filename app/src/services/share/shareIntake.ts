import type { ShareIntent } from "expo-share-intent";
import { createInboxItem } from "@/data/inbox";
import { heuristicClassify } from "@/domain/inbox";
import { guessMime, ingestFiles, SUPPORTED_MIME, type LocalFile } from "@/services/documents/DocumentService";
import type { InboxItem } from "@/domain/types";

export interface SharedContent {
  kind: "text" | "link" | "file" | "image";
  text: string | null;
  url: string | null;
  files: LocalFile[];
  title: string | null;
}

/** Normalizes the OS share payload (text, web URL, one or more files). */
export function normalizeShare(intent: ShareIntent): SharedContent {
  const files: LocalFile[] = (intent.files ?? []).map((f) => ({
    uri: f.path.startsWith("file://") || f.path.startsWith("content://") ? f.path : `file://${f.path}`,
    name: f.fileName,
    mimeType: f.mimeType || guessMime(f.fileName),
    size: f.size,
  }));
  const url = intent.webUrl ?? (intent.text?.match(/https?:\/\/\S+/)?.[0] ?? null);
  const kind = files.length ? (files.every((f) => f.mimeType.startsWith("image/")) ? "image" : "file") : url && (!intent.text || intent.text.trim() === url) ? "link" : "text";
  return { kind, text: intent.text ?? null, url, files, title: intent.meta?.title ?? null };
}

/** Saves shared content: files are ingested as documents, everything lands in the Inbox. */
export async function saveShareToInbox(content: SharedContent): Promise<InboxItem> {
  let documentId: string | null = null;
  const files = content.files.filter((f) => SUPPORTED_MIME.includes(f.mimeType));
  if (files.length) {
    const { document } = await ingestFiles(files, { source: "share", title: content.title ?? undefined });
    documentId = document.id;
  }
  const raw = [content.title, content.text].filter(Boolean).join("\n") || null;
  const guess = heuristicClassify(raw ?? "", content.kind);
  return createInboxItem({
    kind: content.kind,
    rawText: raw,
    url: content.url,
    documentId,
    suggestedType: guess.type,
    confidence: guess.confidence,
  });
}
