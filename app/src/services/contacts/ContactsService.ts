import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from "expo-contacts";

export interface ContactMatch {
  id: string;
  name: string;
  phones: { label: string | null; number: string }[];
  emails: { label: string | null; address: string }[];
  company: string | null;
}

const FIELDS = [ContactField.FULL_NAME, ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.NICKNAME, ContactField.PHONES, ContactField.EMAILS, ContactField.COMPANY] as const;

/**
 * On-device contact lookup. The address book is never uploaded: searches run locally and only
 * the few matches relevant to the user's request are passed to the assistant.
 */
class ContactsService {
  async hasAccess(): Promise<boolean> {
    return (await getPermissionsAsync()).granted;
  }

  async requestAccess(): Promise<boolean> {
    return (await requestPermissionsAsync()).granted;
  }

  async search(query: string, limit = 5): Promise<ContactMatch[]> {
    if (!(await this.hasAccess())) throw new Error("אין הרשאת גישה לאנשי הקשר");
    const q = query.trim();
    if (!q) return [];
    let rows = await Contact.getAllDetails(FIELDS, { name: q, limit: limit * 3 });
    // Some platforms match only name prefixes — fall back to a local contains-match.
    if (!rows.length) {
      const all = await Contact.getAllDetails(FIELDS, { limit: 5000 });
      const needle = normalize(q);
      rows = all.filter((c) => normalize([c.fullName, c.givenName, c.familyName, c.nickname, c.company].filter(Boolean).join(" ")).includes(needle));
    }
    return rows.slice(0, limit).map((c) => ({
      id: c.id,
      name: c.fullName || [c.givenName, c.familyName].filter(Boolean).join(" ") || c.company || "",
      phones: (c.phones ?? []).filter((p) => p.number).map((p) => ({ label: p.label ?? null, number: p.number! })),
      emails: (c.emails ?? []).filter((e) => e.address).map((e) => ({ label: e.label ?? null, address: e.address! })),
      company: c.company ?? null,
    }));
  }

  async pick(): Promise<ContactMatch | null> {
    const c = await Contact.presentPicker();
    if (!c) return null;
    const d = await c.getDetails(FIELDS);
    return {
      id: d.id,
      name: d.fullName ?? "",
      phones: (d.phones ?? []).filter((p) => p.number).map((p) => ({ label: p.label ?? null, number: p.number! })),
      emails: (d.emails ?? []).filter((e) => e.address).map((e) => ({ label: e.label ?? null, address: e.address! })),
      company: d.company ?? null,
    };
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[֑-ׇ]/g, "").replace(/\s+/g, " ").trim();
}

export const contactsService = new ContactsService();
