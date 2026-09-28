// iCalendar (RFC 5545) meeting request. Sent as a text/calendar part with METHOD:REQUEST so Gmail,
// Outlook and Apple Mail show a real invitation with Yes / No / Maybe.

export interface Person {
  name?: string | null;
  email: string;
}

export interface InviteInput {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  organizer: Person;
  attendees: Person[];
  location?: string | null;
  description?: string | null;
  now?: Date;
}

export function buildInvite(i: InviteInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Personal Assistant//HE",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `DTSTAMP:${utc(i.now ?? new Date())}`,
    `DTSTART:${utc(i.start)}`,
    `DTEND:${utc(i.end)}`,
    `SUMMARY:${text(i.title)}`,
    ...(i.location ? [`LOCATION:${text(i.location)}`] : []),
    ...(i.description ? [`DESCRIPTION:${text(i.description)}`] : []),
    `ORGANIZER${cn(i.organizer)}:mailto:${i.organizer.email}`,
    ...i.attendees.map((a) => `ATTENDEE${cn(a)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    "SEQUENCE:0",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** 20261004T070000Z */
export function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT value escaping (RFC 5545 §3.3.11). */
function text(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** ;CN="…" — a quoted parameter value may not contain DQUOTE or control characters. */
function cn(p: Person): string {
  const name = p.name?.replace(/["\r\n\t]/g, "").trim();
  return name ? `;CN="${name}"` : "";
}

/** Folds lines longer than 75 octets without splitting a UTF-8 character (Hebrew is 2 bytes/char). */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join("\r\n ");
}
