// Scheduled (pg_cron / Supabase scheduled function) — sends server push for items that
// need attention even when the app is closed: overdue waiting-for items and overdue tasks.
// Authenticated with a shared secret header, runs with the service role.
import { handler, HttpError, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/auth.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");

interface Profile {
  id: string;
  timezone: string;
  proactivity: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

function localParts(tz: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

function inQuietHours(time: string, start: string, end: string): boolean {
  const s = start.slice(0, 5), e = end.slice(0, 5);
  return s <= e ? time >= s && time < e : time >= s || time < e;
}

Deno.serve(handler(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) throw new HttpError(401, "unauthorized", "unauthorized");
  const db = adminClient();
  const { data: profiles, error } = await db.from("profiles").select("id, timezone, proactivity, quiet_hours_start, quiet_hours_end")
    .neq("proactivity", "off");
  if (error) throw error;

  const messages: { to: string; title: string; body: string; data: Record<string, string> }[] = [];
  for (const p of (profiles ?? []) as Profile[]) {
    const { date, time } = localParts(p.timezone);
    if (inQuietHours(time, p.quiet_hours_start, p.quiet_hours_end)) continue;

    const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", p.id);
    if (!tokens?.length) continue;

    // Nudge at most once per 24h per waiting item.
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: waiting } = await db.from("waiting_for").select("id, person, subject, expected_response_date")
      .eq("user_id", p.id).eq("status", "open").lte("expected_response_date", date)
      .or(`last_nudged_at.is.null,last_nudged_at.lt.${dayAgo}`).limit(3);

    for (const w of waiting ?? []) {
      for (const t of tokens) {
        messages.push({
          to: t.token,
          title: "ממתין לתשובה",
          body: `${w.person} עדיין מסומן כממתין לתשובה על "${w.subject}". רוצה שאכין הודעת follow-up?`,
          data: { url: `/chat?prompt=${encodeURIComponent(`הכן הודעת follow-up ל${w.person} לגבי ${w.subject}`)}` },
        });
      }
      await db.from("waiting_for").update({ last_nudged_at: new Date().toISOString() }).eq("id", w.id);
    }
  }

  // Expo push service accepts batches of up to 100.
  for (let i = 0; i < messages.length; i += 100) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(Deno.env.get("EXPO_ACCESS_TOKEN") ? { Authorization: `Bearer ${Deno.env.get("EXPO_ACCESS_TOKEN")}` } : {}) },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
  }
  return json(req, { sent: messages.length });
}));
