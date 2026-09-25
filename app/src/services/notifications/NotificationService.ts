import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import type { PlannedNotification } from "@/domain/proactive";
import { registerPushToken } from "@/data/profile";

const MANAGED = "pa-managed";
// iOS keeps at most 64 pending local notifications per app.
const MAX_SCHEDULED = 50;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function setupChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "תזכורות",
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync("assistant", {
    name: "עדכונים מהעוזר",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Replaces all app-managed scheduled notifications with the given plan (idempotent).
 * Notifications scheduled by the user elsewhere are left untouched.
 */
export async function applyNotificationPlan(plan: PlannedNotification[]): Promise<number> {
  if (!(await hasNotificationPermission())) return 0;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.[MANAGED])
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const upcoming = plan.slice(0, MAX_SCHEDULED);
  for (const n of upcoming) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: {
        title: n.title,
        body: n.body,
        data: { [MANAGED]: true, url: n.url, kind: n.kind },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.at,
        channelId: n.kind === "reminder" ? "reminders" : "assistant",
      },
    });
  }
  return upcoming.length;
}

/** Registers this device for server push (used by the proactive-scan function). */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice || !(await hasNotificationPermission())) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(data, Platform.OS === "ios" ? "ios" : "android");
}

export function urlFromResponse(res: Notifications.NotificationResponse | null): string | null {
  const url = res?.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("/") ? url : null;
}
