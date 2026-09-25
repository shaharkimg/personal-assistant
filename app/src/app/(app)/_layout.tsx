import React, { useEffect } from "react";
import { AppState } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as QuickActions from "expo-quick-actions";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useShareIntentContext } from "expo-share-intent";
import { registerForPush, setupChannels, urlFromResponse } from "@/services/notifications/NotificationService";
import { scheduleNotificationSync } from "@/services/notifications/sync";
import { useTheme } from "@/theme/tokens";

export default function AppLayout() {
  const c = useTheme();
  const router = useRouter();
  const { hasShareIntent } = useShareIntentContext();

  // Home-screen quick actions (long-press the icon): capture in one tap.
  useQuickActionRouting();
  useEffect(() => {
    void QuickActions.setItems([
      { id: "capture", title: "לכידה מהירה", icon: "compose", params: { href: "/capture" } },
      { id: "voice", title: "דבר עם העוזר", icon: "audio", params: { href: "/capture?voice=1" } },
      { id: "scan", title: "סרוק מסמך", icon: "capturePhoto", params: { href: "/documents?scan=1" } },
      { id: "brief", title: "התקציר היומי", icon: "date", params: { href: "/brief" } },
    ]).catch(() => undefined);
  }, []);

  // Shared content from other apps.
  useEffect(() => {
    if (hasShareIntent) router.push("/share");
  }, [hasShareIntent, router]);

  // Notification taps deep-link into the relevant screen.
  useEffect(() => {
    const last = urlFromResponse(Notifications.getLastNotificationResponse());
    if (last) router.push(last as never);
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const url = urlFromResponse(res);
      if (url) router.push(url as never);
    });
    return () => sub.remove();
  }, [router]);

  // Keep local notifications in sync with the latest data whenever the app comes forward.
  useEffect(() => {
    void setupChannels();
    void registerForPush().catch(() => undefined);
    scheduleNotificationSync(500);
    const sub = AppState.addEventListener("change", (s) => s === "active" && scheduleNotificationSync(500));
    return () => sub.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.text },
        contentStyle: { backgroundColor: c.bg },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ title: "העוזר" }} />
      <Stack.Screen name="capture" options={{ presentation: "formSheet", headerShown: false, sheetAllowedDetents: [0.45, 0.9], sheetGrabberVisible: true }} />
      <Stack.Screen name="share" options={{ presentation: "modal", title: "שותף לעוזר" }} />
      <Stack.Screen name="brief" options={{ title: "התקציר היומי" }} />
      <Stack.Screen name="review" options={{ title: "סיכום היום" }} />
      <Stack.Screen name="waiting" options={{ title: "ממתינים לתשובה" }} />
      <Stack.Screen name="activity" options={{ title: "פעילות העוזר" }} />
      <Stack.Screen name="memory" options={{ title: "מה העוזר זוכר" }} />
      <Stack.Screen name="settings" options={{ title: "הגדרות ופרטיות" }} />
      <Stack.Screen name="tasks/[id]" options={{ title: "משימה" }} />
      <Stack.Screen name="documents/index" options={{ title: "מסמכים" }} />
      <Stack.Screen name="documents/[id]" options={{ title: "מסמך" }} />
      <Stack.Screen name="projects/[id]" options={{ title: "" }} />
    </Stack>
  );
}
