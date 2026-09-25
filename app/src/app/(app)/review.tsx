import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { loadBriefInput } from "@/services/briefData";
import { buildEveningReview } from "@/domain/brief";
import { addDays, toDateKey } from "@/domain/dates";
import { updateTask } from "@/data/tasks";
import { Button, Card, Header, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { invalidateAll, qk } from "@/state/queries";
import { space, useTheme } from "@/theme/tokens";

export default function Review() {
  const c = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: [...qk.home, "review"], queryFn: () => loadBriefInput(new Date()) });
  if (!q.data) return <Screen edges={["bottom"]}><Loading /></Screen>;
  const r = buildEveningReview(q.data);
  const pct = r.planned ? Math.round((r.completed / r.planned) * 100) : 0;

  const moveAllToTomorrow = async () => {
    const tomorrow = toDateKey(addDays(new Date(), 1));
    for (const l of r.carriedOver) await updateTask(l.ref.id, { dueDate: tomorrow });
    invalidateAll();
  };

  return (
    <Screen edges={["bottom"]}>
      <Header title="סיכום היום" />
      <Card tone="accent" style={{ gap: space.sm }}>
        <T variant="title">{r.planned ? `השלמת ${r.completed} מתוך ${r.planned} משימות` : `השלמת ${r.completed} משימות`}</T>
        {r.planned ? (
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface, overflow: "hidden" }}>
            <View style={{ width: `${pct}%`, height: 8, backgroundColor: c.accent }} />
          </View>
        ) : null}
        <T tone="secondary">{r.tomorrowFirst ? `מחר הפגישה הראשונה שלך ב-${r.tomorrowFirst.time} (${r.tomorrowFirst.text}).` : "אין פגישות ביומן למחר."}</T>
      </Card>

      {r.carriedOver.length ? (
        <>
          <SectionHeader title={`עוברות למחר · ${r.carriedOver.length}`} />
          <Card style={{ paddingVertical: space.xs }}>
            {r.carriedOver.map((l) => (
              <Row key={l.ref.id} icon="arrow-undo-outline" title={l.text} onPress={() => router.push(`/tasks/${l.ref.id}`)} />
            ))}
          </Card>
          <Button title="העבר הכול למחר" variant="secondary" icon="calendar-outline" onPress={moveAllToTomorrow} style={{ marginTop: space.md }} />
        </>
      ) : null}

      {r.waiting.length ? (
        <>
          <SectionHeader title="עדיין ממתין לתשובה" />
          <Card style={{ paddingVertical: space.xs }}>
            {r.waiting.map((l) => (
              <Row key={l.ref.id} icon="hourglass-outline" title={l.text} onPress={() => router.push("/waiting")} />
            ))}
          </Card>
        </>
      ) : null}

      {r.completedTasks.length ? (
        <>
          <SectionHeader title="הושלמו היום" />
          <Card style={{ paddingVertical: space.xs }}>
            {r.completedTasks.map((l) => (
              <Row key={l.ref.id} icon="checkmark-circle-outline" title={l.text} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
