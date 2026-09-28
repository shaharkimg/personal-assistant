// Gmail over IMAP (read/search) and SMTP (send) with a Google app password.
// Read-only on the mailbox: messages are fetched with BODY.PEEK, so nothing is marked as read.
import { ImapFlow } from "npm:imapflow@1.7.8";
// @deno-types="npm:@types/nodemailer@7"
import nodemailer from "npm:nodemailer@7";
// @deno-types="npm:@types/mailparser@3"
import { simpleParser } from "npm:mailparser@3";
import { HttpError } from "../http.ts";
import { buildInvite, type Person } from "./ics.ts";

export interface MailConfig {
  address: string;
  password: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
  /** Test servers only (self-signed certificates). */
  insecureTls: boolean;
}

/** null when Gmail isn't connected (secrets not set). */
export function mailConfig(env = (k: string) => Deno.env.get(k)): MailConfig | null {
  const address = env("GMAIL_ADDRESS")?.trim();
  // Google shows app passwords in groups of four ("abcd efgh ijkl mnop").
  const password = env("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!address || !password) return null;
  return {
    address,
    password,
    imap: { host: env("MAIL_IMAP_HOST") ?? "imap.gmail.com", port: Number(env("MAIL_IMAP_PORT") ?? 993) },
    // 465 (implicit TLS): Supabase Edge Functions block outbound 25 and 587.
    smtp: { host: env("MAIL_SMTP_HOST") ?? "smtp.gmail.com", port: Number(env("MAIL_SMTP_PORT") ?? 465) },
    insecureTls: env("MAIL_TLS_INSECURE") === "1",
  };
}

export interface MailSummary {
  id: string;
  from: Person | null;
  to: Person[];
  subject: string;
  date: string | null;
  unread: boolean;
  snippet: string;
}

export interface MailMessage extends Omit<MailSummary, "snippet"> {
  cc: Person[];
  text: string;
  truncated: boolean;
  attachments: { name: string; size: number }[];
}

const SNIPPET_BYTES = 16_384;
const MAX_TEXT = 30_000;
const FALLBACK_SCAN = 300;

async function withImap<T>(cfg: MailConfig, fn: (client: ImapFlow, gmail: boolean) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: true,
    auth: { user: cfg.address, pass: cfg.password },
    logger: false,
    ...(cfg.insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
  try {
    await client.connect();
  } catch (e) {
    throw mailError(e);
  }
  try {
    return await fn(client, client.capabilities.has("X-GM-EXT-1"));
  } finally {
    await client.logout().catch(() => undefined);
  }
}

function mailError(e: unknown): HttpError {
  const err = e as { authenticationFailed?: boolean; code?: string; responseCode?: number };
  if (err?.authenticationFailed || err?.code === "EAUTH" || err?.responseCode === 535) {
    return new HttpError(502, "gmail rejected the app password", "mail_auth_failed");
  }
  console.error("mail error", e);
  return new HttpError(502, "could not reach gmail", "mail_unreachable");
}

/** Gmail's "All Mail" so searches cover inbox, sent and archive; INBOX elsewhere. */
async function openMailbox(client: ImapFlow, gmail: boolean): Promise<string> {
  if (gmail) {
    const all = (await client.list()).find((m) => m.specialUse === "\\All");
    if (all) return all.path;
  }
  return "INBOX";
}

function person(a: { name?: string; address?: string } | undefined | null): Person | null {
  return a?.address ? { name: a.name || null, email: a.address.toLowerCase() } : null;
}

function people(list: { name?: string; address?: string }[] | undefined): Person[] {
  return (list ?? []).map(person).filter((p): p is Person => p !== null);
}

export function encodeId(mailbox: string, uid: number): string {
  return `${uid}@${mailbox}`;
}

export function decodeId(id: string): { mailbox: string; uid: number } {
  const at = id.indexOf("@");
  const uid = Number(id.slice(0, at));
  if (at < 1 || !Number.isInteger(uid) || uid <= 0) throw new HttpError(400, "invalid message id", "bad_request");
  return { uid, mailbox: id.slice(at + 1) };
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Case-insensitive match of every query word against sender, recipients, subject and snippet. */
export function matchesQuery(m: MailSummary, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [m.subject, m.snippet, m.from?.name, m.from?.email, ...m.to.flatMap((p) => [p.name, p.email])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * Newest first. On Gmail the query uses Gmail search syntax (is:unread newer_than:2d from:…).
 * Elsewhere (and in tests) recent messages are filtered locally by the query words.
 */
export async function searchMail(cfg: MailConfig, query: string, limit: number): Promise<MailSummary[]> {
  return await withImap(cfg, async (client, gmail) => {
    const mailbox = await openMailbox(client, gmail);
    const lock = await client.getMailboxLock(mailbox);
    try {
      let uids: number[];
      if (gmail) {
        uids = ((await client.search({ gmraw: query.trim() || "in:inbox" }, { uid: true })) || []) as number[];
      } else {
        uids = ((await client.search({ all: true }, { uid: true })) || []) as number[];
      }
      uids.sort((a, b) => b - a);
      const window = gmail || !query.trim() ? uids.slice(0, limit) : uids.slice(0, FALLBACK_SCAN);
      if (!window.length) return [];

      const out: MailSummary[] = [];
      for await (const msg of client.fetch(
        window,
        { envelope: true, flags: true, internalDate: true, source: { start: 0, maxLength: SNIPPET_BYTES } },
        { uid: true },
      )) {
        let snippet = "";
        try {
          if (!msg.source) throw new Error("no source");
          const parsed = await simpleParser(msg.source);
          snippet = oneLine(parsed.text ?? "", 240);
        } catch {
          /* partial source can be unparseable; the envelope is enough */
        }
        const date = msg.envelope?.date ?? msg.internalDate;
        out.push({
          id: encodeId(mailbox, msg.uid),
          from: person(msg.envelope?.from?.[0]),
          to: people(msg.envelope?.to),
          subject: msg.envelope?.subject ?? "",
          date: date ? new Date(date).toISOString() : null,
          unread: !msg.flags?.has("\\Seen"),
          snippet,
        });
      }
      out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
      return (gmail ? out : out.filter((m) => matchesQuery(m, query))).slice(0, limit);
    } finally {
      lock.release();
    }
  });
}

export async function readMail(cfg: MailConfig, id: string): Promise<MailMessage> {
  const { mailbox, uid } = decodeId(id);
  return await withImap(cfg, async (client) => {
    const lock = await client.getMailboxLock(mailbox).catch(() => {
      throw new HttpError(404, "mailbox not found", "not_found");
    });
    try {
      const msg = await client.fetchOne(String(uid), { envelope: true, flags: true, source: true }, { uid: true });
      if (!msg || !msg.source) throw new HttpError(404, "message not found", "not_found");
      const parsed = await simpleParser(msg.source);
      const text = (parsed.text ?? "").trim();
      return {
        id,
        from: person(msg.envelope?.from?.[0]),
        to: people(msg.envelope?.to),
        cc: people(msg.envelope?.cc),
        subject: msg.envelope?.subject ?? parsed.subject ?? "",
        date: parsed.date ? parsed.date.toISOString() : null,
        unread: !msg.flags?.has("\\Seen"),
        text: text.slice(0, MAX_TEXT),
        truncated: text.length > MAX_TEXT,
        attachments: parsed.attachments
          .filter((a) => a.contentDisposition === "attachment" || a.filename)
          .map((a) => ({ name: a.filename ?? "attachment", size: a.size })),
      };
    } finally {
      lock.release();
    }
  });
}

export interface ContactCandidate extends Person {
  count: number;
  lastSeen: string | null;
}

/** People whose name or address matches, from the headers of recent mail (sent and received). */
export async function findContacts(cfg: MailConfig, name: string): Promise<ContactCandidate[]> {
  const q = name.trim().toLowerCase();
  const query = `from:(${name}) OR to:(${name}) OR cc:(${name})`;
  return await withImap(cfg, async (client, gmail) => {
    const mailbox = await openMailbox(client, gmail);
    const lock = await client.getMailboxLock(mailbox);
    try {
      const uids = (((gmail
        ? await client.search({ gmraw: query }, { uid: true })
        : await client.search({ all: true }, { uid: true })) || []) as number[]).sort((a, b) => b - a).slice(0, gmail ? 60 : FALLBACK_SCAN);
      const found = new Map<string, ContactCandidate>();
      if (!uids.length) return [];
      for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
        const date = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null;
        for (const p of [...people(msg.envelope?.from), ...people(msg.envelope?.to), ...people(msg.envelope?.cc)]) {
          if (p.email === cfg.address.toLowerCase()) continue;
          if (!(p.name?.toLowerCase().includes(q) || p.email.includes(q))) continue;
          const prev = found.get(p.email);
          found.set(p.email, {
            email: p.email,
            name: prev?.name ?? p.name,
            count: (prev?.count ?? 0) + 1,
            lastSeen: [prev?.lastSeen, date].filter(Boolean).sort().pop() ?? null,
          });
        }
      }
      return [...found.values()].sort((a, b) => b.count - a.count || (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "")).slice(0, 5);
    } finally {
      lock.release();
    }
  });
}

export interface SendInput {
  to: Person[];
  cc?: Person[];
  subject: string;
  text: string;
  fromName?: string | null;
  invite?: { title: string; start: Date; end: Date; location?: string | null; description?: string | null };
}

export async function sendMail(cfg: MailConfig, input: SendInput): Promise<{ messageId: string; inviteUid: string | null }> {
  const transport = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: true,
    auth: { user: cfg.address, pass: cfg.password },
    ...(cfg.insecureTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
  const from = { name: input.fromName ?? "", address: cfg.address };
  const fmt = (p: Person) => ({ name: p.name ?? "", address: p.email });
  const inviteUid = input.invite ? `${crypto.randomUUID()}@personal-assistant` : null;
  try {
    const info = await transport.sendMail({
      from,
      to: input.to.map(fmt),
      cc: input.cc?.map(fmt),
      subject: input.subject,
      text: input.text,
      ...(input.invite && inviteUid
        ? {
          icalEvent: {
            method: "REQUEST",
            filename: "invite.ics",
            content: buildInvite({
              uid: inviteUid,
              title: input.invite.title,
              start: input.invite.start,
              end: input.invite.end,
              location: input.invite.location,
              description: input.invite.description,
              organizer: { name: input.fromName, email: cfg.address },
              attendees: [...input.to, ...(input.cc ?? [])],
            }),
          },
        }
        : {}),
    });
    return { messageId: info.messageId, inviteUid };
  } catch (e) {
    throw mailError(e);
  }
}
