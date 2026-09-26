import React, { useEffect, useState } from "react";
import { Alert, Linking, Switch, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getPermissionsAsync as contactsPerm } from "expo-contacts";
import { getProfile, updateProfile, exportAllData, deleteAccount } from "@/data/profile";
import type { Proactivity, Profile } from "@/domain/types";
import { FunctionError, supabase } from "@/lib/supabase";
import { calendarService } from "@/services/calendar/CalendarService";
import { contactsService } from "@/services/contacts/ContactsService";
import { hasNotificationPermission, requestNotificationPermission } from "@/services/notifications/NotificationService";
import { syncNotifications } from "@/services/notifications/sync";
import { canUseBiometrics, isAppLockEnabled, setAppLockEnabled } from "@/services/security/appLock";
import { Button, Card, Chip, Row, Screen, SectionHeader, T } from "@/components/ui";
import { invalidateAll, qk } from "@/state/queries";
import { mailService } from "@/services/mail/MailService";
import { space } from "@/theme/tokens";

const LEVELS: { key: Proactivity; label: string; body: string }[] = [
  { key: "off", label: "כבוי", body: "רק תזכורות שביקשת במפורש." },
  { key: "low", label: "נמוכה", body: "+ התראה לפני פגישות ותקציר בוקר." },
  { key: "balanced", label: "מאוזנת", body: "+ מעקב אחרי ממתינים ומשימות חשובות שלא הושלמו, סיכום ערב." },
  { key: "high", label: "גבוהה", body: "+ הצעות יזומות, כמו לנצל זמן פנוי לפני פגישה." },
];

function PermissionRow({ title, subtitle, check, request }: { title: string; subtitle: string; check: () => Promise<boolean>; request: () => Promise<boolean> }) {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    void check().then(setGranted);
  }, [check]);
  return (
    <Row
      title={title}
      subtitle={subtitle}
      icon={granted ? "checkmark-circle-outline" : "alert-circle-outline"}
      right={
        granted ? (
          <T variant="caption" tone="success">מאושר</T>
        ) : (
          <Button
            compact
            variant="secondary"
            title="אפשר"
            onPress={async () => {
              const ok = await request();
              setGranted(ok);
              if (!ok) void Linking.openSettings();
              invalidateAll();
            }}
          />
        )
      }
    />
  );
}

const MAIL_ERRORS: Record<string, string> = {
  mail_forbidden: "ה-Gmail שמחובר בשרת שייך לחשבון אחר",
  mail_auth_failed: "גוגל דחה את סיסמת האפליקציה — צור חדשה",
  mail_unreachable: "אין חיבור ל-Gmail כרגע",
};

function GmailRow() {
  const status = useQuery({ queryKey: ["mail-status"], queryFn: () => mailService.status(), retry: false, staleTime: 60_000 });
  const code = status.error instanceof FunctionError ? status.error.code : null;
  const subtitle = status.isLoading
    ? "בודק…"
    : status.data?.connected
      ? `מחובר: ${status.data.address}`
      : status.data
        ? "לא מחובר (ראה הוראות ב-README)"
        : (code && MAIL_ERRORS[code]) ?? "הבדיקה נכשלה";
  return (
    <Row
      title="Gmail"
      subtitle={subtitle}
      icon={status.data?.connected ? "checkmark-circle-outline" : "mail-outline"}
      right={<Button compact variant="ghost" title="בדוק" loading={status.isFetching} onPress={() => void status.refetch()} />}
    />
  );
}

export default function Settings() {
  const profile = useQuery({ queryKey: qk.profile, queryFn: getProfile });
  const [lock, setLock] = useState(false);
  const [bio, setBio] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void isAppLockEnabled().then(setLock);
    void canUseBiometrics().then(setBio);
  }, []);

  const save = async (patch: Partial<Profile>) => {
    await updateProfile(patch);
    invalidateAll();
    void syncNotifications();
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await exportAllData();
      const file = new File(Paths.cache, `assistant-export-${new Date().toISOString().slice(0, 10)}.json`);
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "ייצוא המידע שלך" });
    } catch (e) {
      Alert.alert("הייצוא נכשל", (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const removeAccount = () =>
    Alert.alert("למחוק את החשבון?", "כל המשימות, המסמכים, הזיכרון, השיחות והפעילות יימחקו לצמיתות מהשרת.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק הכול",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAccount();
            await supabase.auth.signOut();
          } catch (e) {
            Alert.alert("המחיקה נכשלה", (e as Error).message);
          }
        },
      },
    ]);

  const p = profile.data;
  return (
    <Screen edges={["bottom"]}>
      <SectionHeader title="רמת יוזמה" />
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {LEVELS.map((l) => (
            <Chip key={l.key} label={l.label} selected={p?.proactivity === l.key} onPress={() => save({ proactivity: l.key })} />
          ))}
        </View>
        <T variant="caption" tone="secondary">
          {LEVELS.find((l) => l.key === p?.proactivity)?.body}
        </T>
        <T variant="caption" tone="tertiary">
          שעות שקט: {p?.quietHoursStart.slice(0, 5)}–{p?.quietHoursEnd.slice(0, 5)} · תקציר בוקר: {p?.morningBriefTime?.slice(0, 5) ?? "כבוי"} · סיכום ערב:{" "}
          {p?.eveningReviewTime?.slice(0, 5) ?? "כבוי"}
        </T>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label={p?.morningBriefTime ? "כבה תקציר בוקר" : "הפעל תקציר בוקר"} onPress={() => save({ morningBriefTime: p?.morningBriefTime ? null : "08:00" })} />
          <Chip label={p?.eveningReviewTime ? "כבה סיכום ערב" : "הפעל סיכום ערב"} onPress={() => save({ eveningReviewTime: p?.eveningReviewTime ? null : "20:30" })} />
        </View>
      </Card>

      <SectionHeader title="הרשאות מערכת" />
      <Card style={{ paddingVertical: space.xs }}>
        <PermissionRow title="יומן" subtitle="קריאה וכתיבה של אירועים" check={() => calendarService.hasAccess()} request={() => calendarService.requestAccess()} />
        <PermissionRow title="אנשי קשר" subtitle="חיפוש מקומי בלבד" check={async () => (await contactsPerm()).granted} request={() => contactsService.requestAccess()} />
        <PermissionRow title="התראות" subtitle="תזכורות ועדכונים" check={hasNotificationPermission} request={requestNotificationPermission} />
      </Card>

      <SectionHeader title="חשבונות מחוברים" />
      <Card style={{ paddingVertical: space.xs }}>
        <GmailRow />
      </Card>
      <T variant="caption" tone="tertiary" style={{ marginTop: space.xs }}>
        מיקרופון ומצלמה מתבקשים רק ברגע השימוש הראשון.
      </T>

      <SectionHeader title="אבטחה" />
      <Card>
        <Row
          title="נעילה ביומטרית"
          subtitle={bio ? "Face ID / טביעת אצבע בכל פתיחה" : "לא זמין במכשיר"}
          icon="finger-print"
          right={<Switch value={lock} disabled={!bio} onValueChange={async (v) => {
                if (await setAppLockEnabled(v)) setLock(v);
              }} />}
        />
      </Card>

      <SectionHeader title="המידע שלך" />
      <View style={{ gap: space.sm }}>
        <Button title="ייצוא כל המידע (JSON)" variant="secondary" icon="download-outline" loading={exporting} onPress={exportData} />
        <Button title="התנתק" variant="secondary" icon="log-out-outline" onPress={() => supabase.auth.signOut()} />
        <Button title="מחיקת החשבון וכל המידע" variant="danger" icon="trash-outline" onPress={removeAccount} />
      </View>
    </Screen>
  );
}
