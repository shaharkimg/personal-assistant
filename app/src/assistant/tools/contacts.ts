import { z } from "zod";
import { defineTool, ToolError } from "../types";
import { contactsService } from "@/services/contacts/ContactsService";
import { messagingService } from "@/services/messaging/MessagingService";
import { upsertPerson } from "@/data/people";

export const contactTools = [
  defineTool({
    name: "searchContacts",
    label: "מחפש באנשי הקשר",
    doneLabel: "חיפוש באנשי קשר",
    description:
      "Search the device address book by name (runs locally; the address book is never uploaded). Returns up to 5 matches with phones/emails. " +
      "If several match, ask the user which one.",
    schema: z.object({ name: z.string().min(1).max(100) }),
    risk: "safe",
    async run({ name }) {
      const matches = await contactsService.search(name, 5);
      return { contacts: matches };
    },
  }),

  defineTool({
    name: "callContact",
    label: "מחייג",
    doneLabel: "נפתח חייגן",
    description: "Start a phone call. Requires confirmation. Resolve the number with searchContacts first.",
    schema: z.object({ name: z.string().min(1).max(120), phone: z.string().min(3).max(30) }),
    risk: "confirm",
    preview: (i) => ({ title: `להתקשר ל${i.name}?`, body: i.phone, confirmLabel: "התקשר" }),
    async run(i) {
      await messagingService.call(i.phone, i.name, "assistant");
      return { dialing: i.name };
    },
  }),

  defineTool({
    name: "sendMessage",
    label: "מכין הודעה",
    doneLabel: "הודעה הוכנה",
    description:
      "Send a text message (SMS or WhatsApp) on the user's behalf. ALWAYS requires confirmation: the user sees the exact text and can edit it. " +
      "Write the message in the user's voice, short and natural.",
    schema: z.object({
      name: z.string().min(1).max(120),
      phone: z.string().min(3).max(30),
      channel: z.enum(["sms", "whatsapp"]).default("whatsapp"),
      text: z.string().min(1).max(2000),
    }),
    risk: "confirm",
    preview: (i) => ({
      title: `אני עומד לשלוח ל${i.name}${i.channel === "whatsapp" ? " (WhatsApp)" : " (SMS)"}:`,
      body: i.text,
      editable: { key: "text", label: "ההודעה", multiline: true },
      confirmLabel: "שלח",
    }),
    async run(i) {
      if (i.channel === "whatsapp") await messagingService.sendWhatsApp(i.phone, i.text, i.name, "assistant");
      else await messagingService.sendSms(i.phone, i.text, i.name, "assistant");
      await upsertPerson(i.name).catch(() => undefined);
      return { handedToSystemComposer: true, note: "The OS composer opened pre-filled; the user completes sending there." };
    },
  }),

  defineTool({
    name: "sendEmail",
    label: "מכין אימייל",
    doneLabel: "אימייל הוכן",
    description: "Compose an email on the user's behalf. ALWAYS requires confirmation with the full text shown.",
    schema: z.object({
      to: z.array(z.string().email()).min(1).max(10),
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(10_000),
    }),
    risk: "confirm",
    preview: (i) => ({
      title: `אימייל אל ${i.to.join(", ")}`,
      body: i.body,
      details: [{ label: "נושא", value: i.subject }],
      editable: { key: "body", label: "תוכן", multiline: true },
      confirmLabel: "שלח",
    }),
    async run(i) {
      if (!i.to.length) throw new ToolError("no recipients");
      await messagingService.sendEmail(i.to, i.subject, i.body, "assistant");
      return { handedToSystemComposer: true };
    },
  }),
];
