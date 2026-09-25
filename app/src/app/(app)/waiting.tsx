import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { listWaiting, updateWaiting } from "@/data/waiting";
import { addDays, toDateKey } from "@/domain/dates";
import { Button, Card, Chip, EmptyState, Loading, Screen, T } from "@/components/ui";
import { useChat } from "@/state/chat";
import { invalidateAll, qk } from "@/state/queries";
import { space } from "@/theme/tokens";

export default function Waiting() {
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  const q = useQuery({ queryKey: qk.waiting, queryFn: () => listWaiting("open") });
  const today = toDateKey(new Date());

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    invalidateAll();
  };

  return (
    <Screen edges={["bottom"]}>
      {q.isLoading ? (
        <Loading />
      ) : q.data?.length ? (
        <View style={{ gap: space.md, marginTop: space.md }}>
          {q.data.map((w) => {
            const overdue = Boolean(w.expectedResponseDate && w.expectedResponseDate <= today);
            return (
              <Card key={w.id} tone={overdue ? "warning" : "default"} style={{ gap: space.sm }}>
                <T variant="bodyStrong">{w.person}</T>
                <T>{w.subject}</T>
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  <Chip label={`מאז ${w.createdAt.slice(0, 10)}`} />
                  {w.expectedResponseDate ? <Chip tone={overdue ? "warning" : "default"} label={overdue ? "עבר המועד" : `עד ${w.expectedResponseDate}`} /> : null}
                </View>
                {w.notes ? <T variant="caption" tone="secondary">{w.notes}</T> : null}
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  <Button compact title="קיבלתי תשובה" icon="checkmark" onPress={() => act(() => updateWaiting(w.id, { status: "received" }))} />
                  <Button
                    compact
                    variant="secondary"
                    title="הכן follow-up"
                    icon="chatbubble-ellipses-outline"
                    onPress={() => {
                      setOutbox({ text: `הכן הודעת follow-up קצרה ל${w.person} לגבי "${w.subject}" (פריט ממתין ${w.id}) והצע לשלוח.`, files: [] });
                      router.push("/chat");
                    }}
                  />
                  <Button compact variant="ghost" title="+3 ימים" onPress={() => act(() => updateWaiting(w.id, { expectedResponseDate: toDateKey(addDays(new Date(), 3)) }))} />
                  <Button compact variant="ghost" title="בטל מעקב" onPress={() => act(() => updateWaiting(w.id, { status: "cancelled" }))} />
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <EmptyState icon="hourglass-outline" title="לא מחכים לאף אחד" body={'נסה: "שלחתי לדני את ההסכם, תזכיר לי אם הוא לא חוזר אליי תוך שלושה ימים".'} />
      )}
    </Screen>
  );
}
