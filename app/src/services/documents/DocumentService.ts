import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import DocumentScanner from "react-native-document-scanner-plugin";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { callFunction, currentUserId, supabase } from "@/lib/supabase";
import { insertDocument } from "@/data/documents";
import type { Actor } from "@/data/db";
import type { DocumentRecord } from "@/domain/types";

export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number | null;
}

export const SUPPORTED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_BYTES = 25 * 1024 * 1024;

export async function pickDocument(): Promise<LocalFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: SUPPORTED_MIME, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name, mimeType: a.mimeType ?? guessMime(a.name), size: a.size };
}

export async function pickImage(): Promise<LocalFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  return res.canceled ? null : imageAsset(res.assets[0]);
}

export async function takePhoto(): Promise<LocalFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("אין הרשאת מצלמה");
  const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  return res.canceled ? null : imageAsset(res.assets[0]);
}

/** Native document scanner (edge detection + perspective correction). Returns one file per page. */
export async function scanDocument(): Promise<LocalFile[]> {
  const { scannedImages, status } = await DocumentScanner.scanDocument({ maxNumDocuments: 20, croppedImageQuality: 85 });
  if (status === "cancel" || !scannedImages?.length) return [];
  return scannedImages.map((uri, i) => ({ uri, name: `scan-${Date.now()}-${i + 1}.jpg`, mimeType: "image/jpeg" }));
}

function imageAsset(a: ImagePicker.ImagePickerAsset): LocalFile {
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize };
}

export function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      csv: "text/csv",
      txt: "text/plain",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    } as Record<string, string>
  )[ext ?? ""] ?? "application/octet-stream";
}

export async function readBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

async function uploadFile(file: LocalFile): Promise<{ path: string; size: number }> {
  if (!SUPPORTED_MIME.includes(file.mimeType)) throw new Error("סוג קובץ לא נתמך");
  const bytes = await new File(file.uri).arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new Error("הקובץ גדול מ-25MB");
  const uid = await currentUserId();
  const safeName = file.name.replace(/[^\w.\-֐-׿]/g, "_").slice(-80);
  const path = `${uid}/${Crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("documents").upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return { path, size: bytes.byteLength };
}

/**
 * Ingestion pipeline entry point: upload -> documents row -> /ingest-document
 * (extract -> chunk -> embed -> index). Multiple files (scanned pages) become one document.
 */
export async function ingestFiles(
  files: LocalFile[],
  opts: { title?: string; source: DocumentRecord["source"]; projectId?: string | null; actor?: Actor },
): Promise<{ document: DocumentRecord; preview?: string }> {
  if (!files.length) throw new Error("no files");
  const uploads = [];
  for (const f of files) uploads.push(await uploadFile(f));
  const first = files[0];
  const document = await insertDocument(
    {
      title: opts.title ?? first.name.replace(/\.[^.]+$/, ""),
      fileName: first.name,
      mimeType: first.mimeType,
      storagePath: uploads[0].path,
      extraStoragePaths: uploads.slice(1).map((u) => u.path),
      sizeBytes: uploads.reduce((s, u) => s + u.size, 0),
      source: opts.source,
      projectId: opts.projectId ?? null,
    },
    opts.actor ?? "user",
  );
  try {
    const res = await callFunction<{ status: string; preview: string }>("ingest-document", { documentId: document.id });
    return { document: { ...document, status: "ready" }, preview: res.preview };
  } catch {
    return { document: { ...document, status: "failed" } };
  }
}

export async function reindexDocument(id: string) {
  return callFunction<{ status: string }>("ingest-document", { documentId: id });
}

export interface SearchHit {
  document_id: string;
  chunk_index: number;
  content: string;
  heading: string | null;
  score: number;
  document?: { id: string; title: string; file_name: string; created_at: string };
}

export async function searchDocuments(query: string, documentIds?: string[], limit = 8): Promise<SearchHit[]> {
  const res = await callFunction<{ results: SearchHit[] }>("search-documents", { query, documentIds, limit });
  return res.results;
}
