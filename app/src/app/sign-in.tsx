import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { Button, Screen, T } from "@/components/ui";
import { radius, space, type, useTheme } from "@/theme/tokens";

/** Passwordless sign-in with a one-time code sent by email. */
export default function SignIn() {
  const c = useTheme();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = [type.body, { color: c.text, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, textAlign: "right" as const }];

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, data: name.trim() ? { display_name: name.trim() } : undefined },
    });
    setBusy(false);
    if (e) setError("לא הצלחנו לשלוח קוד. בדוק את הכתובת ונסה שוב.");
    else setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    setBusy(false);
    if (e) setError("הקוד שגוי או שפג תוקפו.");
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
        {step === "email" ? (
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
            <Button title="שלח קוד כניסה" onPress={sendCode} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email)} />
          </>
        ) : (
          <>
            <T variant="body" tone="secondary">
              שלחנו קוד בן 6 ספרות אל {email}
            </T>
            <TextInput
              style={[input, { letterSpacing: 8, textAlign: "center", fontSize: 24 }]}
              placeholder="000000"
              placeholderTextColor={c.textTertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
            />
            <Button title="כניסה" onPress={verify} loading={busy} disabled={code.length < 6} />
            <Button title="שינוי כתובת" variant="ghost" onPress={() => setStep("email")} />
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
