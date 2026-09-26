import { callFunction, FunctionError } from "@/lib/supabase";

// Mirrors supabase/functions/mail. Gmail credentials never reach the device.
export interface MailPerson {
  name?: string | null;
  email: string;
}

export interface MailSummary {
  id: string;
  from: MailPerson | null;
  to: MailPerson[];
  subject: string;
  date: string | null;
  unread: boolean;
  snippet: string;
}

export interface MailMessage extends Omit<MailSummary, "snippet"> {
  cc: MailPerson[];
  text: string;
  truncated: boolean;
  attachments: { name: string; size: number }[];
}

export interface MailInvite {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string | null;
}

export type MailStatus = { connected: false } | { connected: true; address: string };

export const mailService = {
  status: () => callFunction<MailStatus>("mail", { action: "status" }),
  search: async (query: string, limit = 10) => (await callFunction<{ messages: MailSummary[] }>("mail", { action: "search", query, limit })).messages,
  read: async (id: string) => (await callFunction<{ message: MailMessage }>("mail", { action: "read", id })).message,
  contacts: async (name: string) =>
    (await callFunction<{ candidates: (MailPerson & { count: number; lastSeen: string | null })[] }>("mail", { action: "contacts", name })).candidates,
  send: (input: { to: MailPerson[]; cc?: MailPerson[]; subject: string; text: string; fromName?: string | null; invite?: MailInvite }) =>
    callFunction<{ messageId: string; inviteUid: string | null }>("mail", { action: "send", ...input }),
};

/** Hebrew explanation for mail errors; the model relays it to the user. */
export function mailErrorMessage(e: unknown): string {
  const code = e instanceof FunctionError ? e.code : (e as { code?: string })?.code;
  switch (code) {
    case "mail_not_configured":
      return "Gmail isn't connected yet. Tell the user: create a Google app password and set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in Supabase secrets (see README).";
    case "mail_forbidden":
      return "This Gmail belongs to a different account than the one signed in to the app (MAIL_OWNER_EMAIL / GMAIL_ADDRESS mismatch).";
    case "mail_auth_failed":
      return "Gmail rejected the app password. Tell the user to create a new app password and update GMAIL_APP_PASSWORD.";
    case "mail_unreachable":
      return "Couldn't reach Gmail right now. Suggest trying again shortly.";
    default:
      return "Mail request failed.";
  }
}
