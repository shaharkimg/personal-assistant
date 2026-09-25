import React from "react";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { listConversations } from "@/data/conversations";
import { Card, Header, Row, Screen, SectionHeader } from "@/components/ui";
import { qk } from "@/state/queries";
import { relativeDayLabel } from "@/domain/dates";
import { space } from "@/theme/tokens";

export default function More() {
  const router = useRouter();
  const convs = useQuery({ queryKey: qk.conversations, queryFn: () => listConversations(8) });
  return (
    <Screen>
      <Header title="עוד" />
      <Card style={{ paddingVertical: space.xs }}>
        <Row icon="sunny-outline" title="התקציר היומי" onPress={() => router.push("/brief")} />
        <Row icon="moon-outline" title="סיכום היום" onPress={() => router.push("/review")} />
        <Row icon="hourglass-outline" title="ממתינים לתשובה" onPress={() => router.push("/waiting")} />
        <Row icon="documents-outline" title="מסמכים" onPress={() => router.push("/documents")} />
      </Card>
      <SectionHeader title="שקיפות ושליטה" />
      <Card style={{ paddingVertical: space.xs }}>
        <Row icon="pulse-outline" title="פעילות העוזר" subtitle="כל מה שבוצע, מתי ועל ידי מי" onPress={() => router.push("/activity")} />
        <Row icon="bulb-outline" title="מה העוזר זוכר" subtitle="צפייה ומחיקה של זיכרון" onPress={() => router.push("/memory")} />
        <Row icon="settings-outline" title="הגדרות ופרטיות" subtitle="יוזמה, הרשאות, ייצוא ומחיקה" onPress={() => router.push("/settings")} />
      </Card>
      {convs.data?.length ? (
        <>
          <SectionHeader title="שיחות אחרונות" />
          <Card style={{ paddingVertical: space.xs }}>
            {convs.data.map((cv) => (
              <Row
                key={cv.id}
                icon="chatbubble-outline"
                title={cv.title ?? "שיחה"}
                subtitle={relativeDayLabel(new Date(cv.updatedAt))}
                onPress={() => router.push({ pathname: "/chat", params: { conversationId: cv.id } })}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
