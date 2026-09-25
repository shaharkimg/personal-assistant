import type { Note } from "@/domain/types";
import { type Actor, fromRow, likePattern, logActivity, supabase, toRow, unwrap } from "./db";

export interface NoteInput {
  title?: string | null;
  body: string;
  kind?: Note["kind"];
  url?: string | null;
  projectId?: string | null;
  tags?: string[];
  source?: string;
}

export async function listNotes(limit = 100): Promise<Note[]> {
  return unwrap(await supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(limit)).map((r) => fromRow<Note>(r));
}

export async function searchNotes(query: string): Promise<Note[]> {
  return unwrap(
    await supabase.from("notes").select("*").or(`title.ilike.${likePattern(query)},body.ilike.${likePattern(query)}`).limit(20),
  ).map((r) => fromRow<Note>(r));
}

export async function createNote(input: NoteInput, actor: Actor = "user"): Promise<Note> {
  const n = fromRow<Note>(unwrap(await supabase.from("notes").insert(toRow({ ...input })).select().single()));
  await logActivity(actor, "note.created", `נשמרה הערה: ${n.title ?? n.body.slice(0, 40)}`, { type: "note", id: n.id });
  return n;
}

export async function deleteNote(id: string, actor: Actor = "user") {
  unwrap(await supabase.from("notes").delete().eq("id", id));
  await logActivity(actor, "note.deleted", "נמחקה הערה", { type: "note", id });
}
