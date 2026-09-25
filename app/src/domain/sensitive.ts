// Guards the memory system: sensitive data is never saved automatically.

export type SensitiveKind = "national_id" | "credit_card" | "bank_account" | "password" | "health" | "government_id";

function luhn(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Israeli ID (ת.ז.) check digit. */
export function isValidIsraeliId(id: string): boolean {
  if (!/^\d{5,9}$/.test(id)) return false;
  const s = id.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(s[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

const HEALTH_RE =
  /(אבחנ|אבחון|מחל[הת]|תרופ|טיפול\s+(?:פסיכולוגי|תרופתי)|כימותרפ|הריון|דיכאון|חרדה|סוכרת|diagnos|medication|therapy|pregnan|hiv|cancer|depress)/i;
const PASSWORD_RE = /(סיסמ[הא]|password|passcode|pin\s*code|קוד\s+סודי|קוד\s+גישה|api[_\s-]?key|secret)/i;
const BANK_RE = /(IL\d{2}\s?(?:\d{4}\s?){4}\d{3}|מספר\s+חשבון|חשבון\s+בנק|account\s+number|iban)/i;
const GOV_ID_RE = /(דרכון|passport|רישיון\s+נהיגה|driver'?s?\s+licen[cs]e)/i;

export function detectSensitive(text: string): SensitiveKind[] {
  const found = new Set<SensitiveKind>();
  for (const m of text.matchAll(/\b\d[\d -]{11,22}\d\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) found.add("credit_card");
  }
  for (const m of text.matchAll(/\b\d{9}\b/g)) {
    if (isValidIsraeliId(m[0])) found.add("national_id");
  }
  if (HEALTH_RE.test(text)) found.add("health");
  if (PASSWORD_RE.test(text)) found.add("password");
  if (BANK_RE.test(text)) found.add("bank_account");
  if (GOV_ID_RE.test(text)) found.add("government_id");
  return [...found];
}

export const SENSITIVE_LABELS: Record<SensitiveKind, string> = {
  national_id: "מספר תעודת זהות",
  credit_card: "מספר כרטיס אשראי",
  bank_account: "פרטי חשבון בנק",
  password: "סיסמה או קוד גישה",
  health: "מידע רפואי",
  government_id: "מסמך מזהה",
};
