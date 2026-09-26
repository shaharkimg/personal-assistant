import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { Button, Card, Screen, T } from "@/components/ui";
import { radius, space, type, useTheme } from "@/theme/tokens";

/** Must be listed under Authentication → URL Configuration → Redirect URLs in Supabase. */
const AUTH_REDIRECT = "personalassistant://auth-callback";

/**
 * Passwordless sign-in with an email link. Tapping the link on this phone opens the app at
 * /auth-callback, which completes the sign-in. Works with Supabase's default email template.
 */
export default function SignIn() {
  const c = useTheme();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = [type.body, { color: c.text, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, textAlign: "right" as const }];

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: AUTH_REDIRECT,
        data: name.trim() ? { display_name: name.trim() } : undefined,
      },
    });
    setBusy(false);
    if (e) {
      setError(
        e.status === 429
          ? "נשלחו יותר מדי מיילים בזמן קצר. חכה כמה דקות ונסה שוב."
          : "לא הצלחנו לשלוח את הקישור. בדוק את הכתובת ונסה שוב.",
      );
    } else setSent(true);
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <T variant="display">העוזר האישי שלך</T>
          <T variant="body" tone="secondary">
            משימות, יומן, מעקבים ומסמכים — במקום אחד, עם עוזר שמכיר את ההקשר שלך.
          </T>
        </View>
        {!sent ? (
          <>
            <TextInput style={input} placeholder="איך לקרוא לך?" placeholderTextColor={c.textTertiary} value={name} onChangeText={setName} autoComplete="given-name" />
            <TextInput
              style={input}
              placeholder="אימייל"
              placeholderTextColor={c.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Button title="שלח קישור כניסה" onPress={sendLink} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)} />
          </>
        ) : (
          <>
            <Card tone="accent" style={{ gap: space.sm }}>
              <T variant="heading">בדוק את המייל</T>
              <T variant="body">שלחנו קישור כניסה אל {email}.</T>
              <T variant="body">פתח את המייל <T variant="body" style={{ fontWeight: "700" }}>בטלפון הזה</T> ולחץ על {"\"Sign in\""} — האפליקציה תיפתח ותכניס אותך.</T>
              <T variant="caption" tone="secondary">
                לא הגיע? בדוק בתיקיית הספאם. הקישור תקף לזמן קצר ולשימוש אחד.
              </T>
            </Card>
            <Button title="שלח שוב" variant="secondary" onPress={sendLink} loading={busy} />
            <Button title="שינוי כתובת" variant="ghost" onPress={() => setSent(false)} />
          </>
        )}
        {error ? (
          <T variant="caption" tone="danger">
            {error}
          </T>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}
