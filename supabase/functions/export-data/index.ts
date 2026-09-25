// POST /export-data — returns everything stored about the caller as one JSON document.
import { handler, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";

const TABLES = [
  "profiles", "projects", "people", "project_people", "tasks", "waiting_for", "notes", "documents",
  "inbox_items", "memories", "conversations", "messages", "activity_log",
] as const;

Deno.serve(handler(async (req) => {
  const { userId, db } = await requireUser(req);
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId };
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select("*").limit(50_000);
    if (error) throw error;
    out[table] = data;
  }
  // Signed links to original files (valid 1 hour) instead of inlining binaries.
  const docs = (out.documents as { storage_path: string }[]) ?? [];
  if (docs.length) {
    const { data } = await db.storage.from("documents").createSignedUrls(docs.map((d) => d.storage_path), 3600);
    out.documentFiles = data;
  }
  await db.from("activity_log").insert({ actor: "user", action: "privacy.export", summary: "ייצוא כל המידע" });
  return json(req, out);
}));
