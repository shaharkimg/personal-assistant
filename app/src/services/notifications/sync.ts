import { planNotifications } from "@/domain/proactive";
import { getProfile } from "@/data/profile";
import { loadBriefInput } from "@/services/briefData";
import { applyNotificationPlan } from "./NotificationService";

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced re-plan of local notifications from current state. */
export function scheduleNotificationSync(delayMs = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNotifications().catch((e) => console.warn("notification sync failed", e)), delayMs);
}

export async function syncNotifications(): Promise<number> {
  const now = new Date();
  const [input, profile] = await Promise.all([loadBriefInput(now, 2), getProfile()]);
  if (!profile) return 0;
  const plan = planNotifications({
    now,
    tasks: input.tasks,
    waiting: input.waiting,
    events: input.events,
    settings: {
      proactivity: profile.proactivity,
      quietHoursStart: profile.quietHoursStart,
      quietHoursEnd: profile.quietHoursEnd,
      morningBriefTime: profile.morningBriefTime,
      eveningReviewTime: profile.eveningReviewTime,
    },
  });
  return applyNotificationPlan(plan);
}
