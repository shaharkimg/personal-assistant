import type { Person } from "@/domain/types";
import { type Actor, fromRow, logActivity, supabase, unwrap } from "./db";

/** People are entities the user works with — not a copy of the address book. */
export async function listPeople(): Promise<Person[]> {
  return unwrap(await supabase.from("people").select("*").order("display_name")).map((r) => fromRow<Person>(r));
}

export async function upsertPerson(displayName: string, contactRef?: string | null): Promise<Person> {
  const existing = unwrap(await supabase.from("people").select("*").eq("display_name", displayName).maybeSingle());
  if (existing) {
    if (contactRef && existing.contact_ref !== contactRef) {
      await supabase.from("people").update({ contact_ref: contactRef }).eq("id", existing.id as string);
    }
    return fromRow<Person>(existing);
  }
  return fromRow<Person>(unwrap(await supabase.from("people").insert({ display_name: displayName, contact_ref: contactRef ?? null }).select().single()));
}

export async function linkPersonToProject(projectId: string, personId: string, role: string | null = null, actor: Actor = "user") {
  unwrap(await supabase.from("project_people").upsert({ project_id: projectId, person_id: personId, role }));
  await logActivity(actor, "project.person_linked", "נוסף איש קשר לפרויקט", { type: "project", id: projectId }, { personId });
}

export async function deletePerson(id: string, actor: Actor = "user") {
  unwrap(await supabase.from("people").delete().eq("id", id));
  await logActivity(actor, "person.deleted", "נמחק איש קשר מהזיכרון", { type: "person", id });
}
