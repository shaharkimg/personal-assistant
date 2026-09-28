import React, { useEffect, useState } from "react";
import { AppState, I18nManager, StyleSheet, View } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { ShareIntentProvider } from "expo-share-intent";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isConfigured } from "@/lib/env";
import { queryClient } from "@/state/queries";
import { authenticate, isAppLockEnabled } from "@/services/security/appLock";
import { Button, EmptyState, Screen, T } from "@/components/ui";
import { useTheme } from "@/theme/tokens";

// Hebrew-first UI. The native side is also configured RTL via app.config.ts (extra.forcesRTL).
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

function useAuthGate(session: Session | null | undefined) {
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (session === undefined || !isConfigured) return;
    // auth-callback must stay reachable while signed out: it is where the sign-in link lands.
    const inAuth = segments[0] === "sign-in" || segments[0] === "auth-callback";
    if (!session && !inAuth) router.replace("/sign-in");
    else if (session && inAuth) router.replace("/");
  }, [session, segments, router]);
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const unlock = async () => {
    if (await authenticate()) onUnlock();
  };
  useEffect(() => {
    void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <EmptyState icon="lock-closed-outline" title="העוזר נעול" body="המידע שלך מוגן. אמת את זהותך כדי להמשיך." action={<Button title="פתח" icon="finger-print" onPress={unlock} />} />
      </View>
    </Screen>
  );
}

export default function RootLayout() {
  const c = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // App lock: require biometrics on launch and whenever the app returns from background.
  useEffect(() => {
    void isAppLockEnabled().then(setLocked);
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background" && (await isAppLockEnabled())) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  useAuthGate(session);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShareIntentProvider options={{ resetOnBackground: true }}>
            <StatusBar style={c.dark ? "light" : "dark"} />
            {/* The navigator always stays mounted; lock / setup screens overlay it. */}
            <Slot />
            {!isConfigured ? (
              <View style={StyleSheet.absoluteFill}>
                <Screen>
                  <EmptyState icon="construct-outline" title="האפליקציה עוד לא מחוברת לשרת" body="הגדר EXPO_PUBLIC_SUPABASE_URL ו-EXPO_PUBLIC_SUPABASE_ANON_KEY בקובץ .env (ראה README)." />
                  <T variant="caption" tone="tertiary" style={{ textAlign: "center" }}>
                    מפתחות AI לעולם לא נשמרים באפליקציה — רק בשרת.
                  </T>
                </Screen>
              </View>
            ) : locked && session ? (
              <View style={StyleSheet.absoluteFill}>
                <LockScreen onUnlock={() => setLocked(false)} />
              </View>
            ) : null}
          </ShareIntentProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
