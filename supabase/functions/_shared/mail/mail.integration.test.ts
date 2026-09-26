// Runs against a local GreenMail server (IMAPS 3993 / SMTPS 3465) when MAIL_IT=1:
//   java -Dgreenmail.setup.test.smtps -Dgreenmail.setup.test.imaps \
//     -Dgreenmail.users=shahar@gmail.test:apppass123,dani@bank.test:danipass -jar greenmail-standalone.jar
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
// @deno-types="npm:@types/nodemailer@7"
import nodemailer from "npm:nodemailer@7";
import { ImapFlow } from "npm:imapflow@1.7.8";
import { findContacts, type MailConfig, mailConfig, readMail, searchMail, sendMail } from "./gmail.ts";

const enabled = Deno.env.get("MAIL_IT") === "1";
const cfgFor = (address: string, password: string): MailConfig =>
  mailConfig((k) =>
    ({
      GMAIL_ADDRESS: address,
      GMAIL_APP_PASSWORD: password,
      MAIL_IMAP_HOST: "127.0.0.1",
      MAIL_IMAP_PORT: "3993",
      MAIL_SMTP_HOST: "127.0.0.1",
      MAIL_SMTP_PORT: "3465",
      MAIL_TLS_INSECURE: "1",
    } as Record<string, string>)[k]
  )!;
const shahar = cfgFor("shahar@gmail.test", "apppass 123"); // spaces are stripped like Google's display format
const dani = cfgFor("dani@bank.test", "danipass");

async function rawInbox(cfg: MailConfig): Promise<string[]> {
  const c = new ImapFlow({
    host: "127.0.0.1",
    port: 3993,
    secure: true,
    auth: { user: cfg.address, pass: cfg.password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  const out: string[] = [];
  try {
    for await (const m of c.fetch("1:*", { source: true })) out.push(new TextDecoder().decode(m.source));
  } finally {
    lock.release();
    await c.logout();
  }
  return out;
}

Deno.test({ name: "gmail flow against a real IMAP/SMTP server", ignore: !enabled, sanitizeOps: false, sanitizeResources: false }, async () => {
  // A unique word per run keeps the test independent of mail left by earlier runs.
  const run = `ריצה${Date.now()}`;
  // Dani writes to Shahar: HTML-only, Hebrew subject. Plus unrelated mail.
  const t = nodemailer.createTransport({
    host: "127.0.0.1",
    port: 3465,
    secure: true,
    auth: { user: dani.address, pass: dani.password },
    tls: { rejectUnauthorized: false },
  });
  await t.sendMail({ from: "news@shop.test", to: "shahar@gmail.test", subject: "Weekly deals", text: "Buy now" });
  await t.sendMail({
    from: '"דני כהן" <dani@bank.test>',
    to: "shahar@gmail.test",
    subject: `טיוטת החוזה לחתימה ${run}`,
    html: "<p>שלום שחר,</p><p>מצורפת <b>טיוטת החוזה</b>. נא לאשר עד יום רביעי.</p>",
  });

  // Search: newest first, Hebrew words matched, unread flag, snippet from HTML.
  const all = await searchMail(shahar, "", 10);
  assert(all.length >= 2);
  assert((all[0].date ?? "") >= (all[1].date ?? ""), "newest first");
  const hits = await searchMail(shahar, `החוזה דני ${run}`, 10);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].from, { name: "דני כהן", email: "dani@bank.test" });
  assert(hits[0].unread);
  assert(hits[0].snippet.includes("טיוטת החוזה"), hits[0].snippet);

  // Read: text from HTML-only mail; reading doesn't mark it as read.
  const msg = await readMail(shahar, hits[0].id);
  assert(msg.text.includes("נא לאשר עד יום רביעי"), msg.text);
  assertEquals((await searchMail(shahar, run, 10))[0].unread, true);

  // Address lookup by Hebrew name, excluding own address.
  const contacts = await findContacts(shahar, "דני");
  assertEquals(contacts.map((c) => c.email), ["dani@bank.test"]);

  // Invitation: Dani receives a text/calendar METHOD:REQUEST part naming him as attendee.
  const sent = await sendMail(shahar, {
    to: [{ name: "דני כהן", email: "dani@bank.test" }],
    subject: "הזמנה: פגישה על החוזה",
    text: "היי דני, מצרף הזמנה.",
    fromName: "שחר",
    invite: {
      title: "פגישה על החוזה",
      start: new Date("2026-10-04T10:00:00+03:00"),
      end: new Date("2026-10-04T11:00:00+03:00"),
      location: "משרד",
    },
  });
  assert(sent.inviteUid);
  const raw = (await rawInbox(dani)).at(-1) ?? "";
  assert(/Content-Type: text\/calendar;[^\n]*method=REQUEST/i.test(raw), "calendar part");
  const unfolded = raw.replace(/\r\n /g, "");
  assert(unfolded.includes("METHOD:REQUEST"));
  assert(unfolded.includes("mailto:dani@bank.test"));
  assert(unfolded.includes("DTSTART:20261004T070000Z"));

  // Wrong app password -> a clear error code for both reading and sending.
  const bad = cfgFor("shahar@gmail.test", "wrong");
  const err = await assertRejects(() => searchMail(bad, "", 1));
  assertEquals((err as { code?: string }).code, "mail_auth_failed");
  const err2 = await assertRejects(() => sendMail(bad, { to: [{ email: "dani@bank.test" }], subject: "x", text: "y" }));
  assertEquals((err2 as { code?: string }).code, "mail_auth_failed");
});

Deno.test("mailConfig: not connected without secrets; strips app-password spaces", () => {
  assertEquals(mailConfig(() => undefined), null);
  const env: Record<string, string> = { GMAIL_ADDRESS: "a@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };
  const c = mailConfig((k) => env[k])!;
  assertEquals(c.password, "abcdefghijklmnop");
  assertEquals([c.imap.host, c.imap.port, c.smtp.host, c.smtp.port], ["imap.gmail.com", 993, "smtp.gmail.com", 465]);
});
