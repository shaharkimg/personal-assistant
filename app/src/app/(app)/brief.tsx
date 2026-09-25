import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { loadBriefInput } from "@/services/briefData";
import { getProfile } from "@/data/profile";
import { buildDailyBrief, type BriefLine } from "@/domain/brief";
import { greeting } from "@/domain/dates";
import { Card, Header, Loading, Screen, SectionHeader, T } from "@/components/ui";
import { qk } from "@/state/queries";
import { space } from "@/theme/tokens";

function Lines({ items, empty }: { items: BriefLine[]; empty: string }) {
  const router = useRouter();
  return (
    <Card style={{ gap: space.sm }}>
      {items.length ? (
        items.map((l) => (
          <View key={`${l.ref.type}:${l.ref.id}:${l.text}`} style={{ flexDirection: "row", gap: space.md }}>
            {l.time ? (
              <T variant="bodyStrong" tone="accent" style={{ width: 56 }}>
                {l.time}
              </T>
            ) : (
              <T tone="tertiary">•</T>
            )}
            <T style={{ flex: 1 }} onPress={l.ref.type === "task" ? () => router.push(`/tasks/${l.ref.id}`) : undefined}>
              {l.text}
            </T>
          </View>
        ))
      ) : (
        <T tone="secondary">{empty}</T>
      )}
    </Card>
  );
}

/** Morning brief — every line links to a real record; nothing is generated. */
export default function Brief() {
  const profile = useQuery({ queryKey: qk.profile, queryFn: getProfile });
  const q = useQuery({ queryKey: [...qk.home, "brief"], queryFn: () => loadBriefInput(new Date()) });
  if (!q.data) return <Screen edges={["bottom"]}><Loading /></Screen>;
  const b = buildDailyBrief(q.data, greeting(profile.data?.displayName));
  return (
    <Screen edges={["bottom"]}>
      <Header title={b.greeting} subtitle={new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })} />
      <SectionHeader title="היום" />
      <Lines items={b.events} empty={q.data.calendarConnected ? "אין אירועים ביומן היום." : "היומן לא מחובר."} />
      <SectionHeader title="משימות חשובות" />
      <Lines items={b.importantTasks} empty="אין משימות פתוחות להיום." />
      {b.waiting.length ? (
        <>
          <SectionHeader title="ממתינים לתשובה" />
          <Lines items={b.waiting} empty="" />
        </>
      ) : null}
      {b.attention.length ? (
        <>
          <SectionHeader title="שים לב" />
          <Lines items={b.attention} empty="" />
        </>
      ) : null}
    </Screen>
  );
}
