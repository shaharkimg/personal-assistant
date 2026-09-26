import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildInvite, fold, utc } from "./ics.ts";

Deno.test("UTC timestamps", () => {
  assertEquals(utc(new Date("2026-10-04T10:00:00+03:00")), "20261004T070000Z");
});

Deno.test("folds long Hebrew lines at 75 octets without splitting characters", () => {
  const line = `SUMMARY:${"פגישה ארוכה מאוד ".repeat(8)}`;
  const folded = fold(line);
  const enc = new TextEncoder();
  for (const part of folded.split("\r\n")) assert(enc.encode(part).length <= 75, part);
  assertEquals(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join(""), line);
});

Deno.test("meeting request with organizer, attendees and escaped text", () => {
  const ics = buildInvite({
    uid: "abc@pa",
    title: "פגישה: חוזה, שלב ב'",
    start: new Date("2026-10-04T10:00:00+03:00"),
    end: new Date("2026-10-04T11:00:00+03:00"),
    organizer: { name: "שחר", email: "shahar@gmail.com" },
    attendees: [{ name: 'דני "הבנק" כהן', email: "dani@bank.co.il" }, { email: "ruth@x.com" }],
    location: "תל אביב; קומה 3",
    description: "שורה 1\nשורה 2",
    now: new Date("2026-09-26T08:00:00Z"),
  });
  const unfolded = ics.replace(/\r\n /g, "");
  assert(ics.endsWith("\r\n") && !/[^\r]\n/.test(ics), "CRLF line endings");
  for (const needle of [
    "METHOD:REQUEST",
    "UID:abc@pa",
    "DTSTART:20261004T070000Z",
    "DTEND:20261004T080000Z",
    "SUMMARY:פגישה: חוזה\\, שלב ב'",
    String.raw`LOCATION:תל אביב\; קומה 3`,
    "DESCRIPTION:שורה 1\\nשורה 2",
    'ORGANIZER;CN="שחר":mailto:shahar@gmail.com',
    'ATTENDEE;CN="דני הבנק כהן";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:dani@bank.co.il',
    "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:ruth@x.com",
  ]) assert(unfolded.includes(needle), needle);
});
