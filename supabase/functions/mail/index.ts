// POST /mail — the owner's Gmail: search, read, find addresses, send (incl. meeting invitations).
//
// Credentials are server secrets (GMAIL_ADDRESS, GMAIL_APP_PASSWORD) that belong to one mailbox,
// so only the signed-in user whose email matches MAIL_OWNER_EMAIL (default: GMAIL_ADDRESS) may use
// it. Anyone else who signs up to this project gets 403.
import { handler, HttpError, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseBody, z } from "../_shared/validate.ts";
import { findContacts, mailConfig, readMail, searchMail, sendMail } from "../_shared/mail/gmail.ts";

const Person = z.object({ name: z.string().max(120).nullish(), email: z.string().email().max(254) });
const Iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "expected ISO date-time");

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("search"), query: z.string().max(500).default(""), limit: z.number().int().min(1).max(25).default(10) }),
  z.object({ action: z.literal("read"), id: z.string().min(3).max(300) }),
  z.object({ action: z.literal("contacts"), name: z.string().min(1).max(100) }),
  z.object({
    action: z.literal("send"),
    to: z.array(Person).min(1).max(20),
    cc: z.array(Person).max(20).optional(),
    subject: z.string().min(1).max(300),
    text: z.string().min(1).max(20_000),
    fromName: z.string().max(120).nullish(),
    invite: z
      .object({ title: z.string().min(1).max(200), start: Iso, end: Iso, location: z.string().max(300).nullish(), description: z.string().max(4000).nullish() })
      .optional(),
  }),
]);

Deno.serve(handler(async (req) => {
  const { email } = await requireUser(req);
  const body = await parseBody(req, Body);
  const cfg = mailConfig();
  if (!cfg) {
    if (body.action === "status") return json(req, { connected: false });
    throw new HttpError(503, "gmail is not connected", "mail_not_configured");
  }
  const owner = (Deno.env.get("MAIL_OWNER_EMAIL") ?? cfg.address).trim().toLowerCase();
  if (email !== owner) throw new HttpError(403, "this mailbox belongs to another user", "mail_forbidden");

  switch (body.action) {
    case "status":
      await searchMail(cfg, "", 1); // proves the login works
      return json(req, { connected: true, address: cfg.address });
    case "search":
      return json(req, { messages: await searchMail(cfg, body.query, body.limit) });
    case "read":
      return json(req, { message: await readMail(cfg, body.id) });
    case "contacts":
      return json(req, { candidates: await findContacts(cfg, body.name) });
    case "send": {
      const invite = body.invite ? { ...body.invite, start: new Date(body.invite.start), end: new Date(body.invite.end) } : undefined;
      if (invite && invite.end <= invite.start) throw new HttpError(400, "invite ends before it starts", "bad_request");
      return json(req, await sendMail(cfg, { ...body, invite }));
    }
  }
}));
