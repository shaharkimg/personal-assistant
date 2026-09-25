import { Linking, Platform } from "react-native";
import * as SMS from "expo-sms";
import * as MailComposer from "expo-mail-composer";
import { logActivity, type Actor } from "@/data/db";

/**
 * Outgoing communication. Every method opens the OS composer/dialer pre-filled — the user
 * presses the final "send"/"call" in the system UI, on top of the in-app confirmation card.
 */
export const messagingService = {
  async call(phone: string, name: string, actor: Actor) {
    const url = `tel:${phone.replace(/[^\d+]/g, "")}`;
    await Linking.openURL(url);
    await logActivity(actor, "contact.call", `חיוג ל${name}`);
  },

  async sendSms(phone: string, body: string, name: string, actor: Actor) {
    if (await SMS.isAvailableAsync()) {
      await SMS.sendSMSAsync([phone], body);
    } else {
      await Linking.openURL(`sms:${phone}${Platform.OS === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}`);
    }
    await logActivity(actor, "message.sms", `הודעת SMS ל${name}`, undefined, { length: body.length });
  },

  async sendWhatsApp(phone: string, body: string, name: string, actor: Actor) {
    const digits = toInternational(phone);
    await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(body)}`);
    await logActivity(actor, "message.whatsapp", `הודעת WhatsApp ל${name}`, undefined, { length: body.length });
  },

  async sendEmail(to: string[], subject: string, body: string, actor: Actor) {
    if (await MailComposer.isAvailableAsync()) {
      await MailComposer.composeAsync({ recipients: to, subject, body });
    } else {
      await Linking.openURL(`mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    }
    await logActivity(actor, "message.email", `אימייל ל${to.join(", ")}: ${subject}`);
  },
};

/** 050-123-4567 -> 972501234567 (Israeli local numbers), otherwise digits only. */
export function toInternational(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}
