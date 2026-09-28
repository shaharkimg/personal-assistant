import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Button, EmptyState, Loading, Screen, T } from "@/components/ui";
import { space } from "@/theme/tokens";

/**
 * Target of the sign-in link (personalassistant://auth-callback?code=…). Exchanges the one-time
 * code for a session; the root auth gate then moves to the app.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(params.error_description ? "הקישור לא תקף או שפג תוקפו." : null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !params.code) return;
    started.current = true;
    void supabase.auth.exchangeCodeForSession(params.code).then(({ error: e }) => {
      // The code is bound to this device: a link opened on another device (or twice) fails here.
      if (e) setError("הקישור לא תקף, כבר נוצל, או נפתח במכשיר אחר. בקש קישור חדש ופתח אותו בטלפון.");
    });
  }, [params.code]);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: "center", gap: space.md }}>
        {error || !params.code ? (
          <EmptyState
            icon="alert-circle-outline"
            title="הכניסה לא הצליחה"
            body={error ?? "הקישור חסר פרטים."}
            action={<Button title="בקש קישור חדש" onPress={() => router.replace("/sign-in")} />}
          />
        ) : (
          <>
            <Loading />
            <T variant="body" tone="secondary" style={{ textAlign: "center" }}>
              מכניס אותך…
            </T>
          </>
        )}
      </View>
    </Screen>
  );
}
