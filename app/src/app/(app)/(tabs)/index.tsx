import React, { useMemo } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { loadBriefInput } from "@/services/briefData";
import { getProfile } from "@/data/profile";
import { buildSuggestions, homeSummary, nextEvent, overdueWaiting, tasksForToday, upcomingReminders } from "@/domain/brief";
import { greeting, toDateKey } from "@/domain/dates";
import { calendarService } from "@/services/calendar/CalendarService";
import { Button, Card, IconButton, Loading, Screen, T } from "@/components/ui";
import { NextMeetingCard, QuickPrompts, RecentDocumentsCard, RemindersCard, SuggestionsCard, TodayTasksCard, WaitingCard } from "@/components/home/HomeCards";
import { Composer } from "@/components/assistant/Composer";
import { useChat } from "@/state/chat";
import { invalidateAll, qk } from "@/state/queries";
import { space, useTheme } from "@/theme/tokens";

export default function Home() {
  const c = useTheme();
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  const profile = useQuery({ queryKey: qk.profile, queryFn: getProfile });
  const data = useQuery({ queryKey: qk.home, queryFn: () => loadBriefInput(new Date()), refetchInterval: 5 * 60_000 });

  const view = useMemo(() => {
    if (!data.data) return null;
    const input = { ...data.data, now: new Date() };
    return {
      input,
      summary: homeSummary(input),
      next: nextEvent(input.events, input.now),
      today: tasksForToday(input.tasks, input.now),
      waiting: input.waiting.filter((w) => w.status === "open").sort((a, b) => Number(overdueWaiting([b], input.now).length) - Number(overdueWaiting([a], input.now).length)),
      reminders: upcomingReminders(input.tasks, input.now),
      suggestions: buildSuggestions(input),
    };
  }, [data.data]);

  const footer = (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, paddingTop: space.sm, backgroundColor: c.bg }}>
        <Composer
          onSend={(text, files) => {
            setOutbox({ text, files });
            router.push("/chat");
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <Screen footer={footer} refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => invalidateAll()} />}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: space.lg }}>
        <View style={{ flex: 1, gap: space.sm }}>
          <T variant="display">{greeting(profile.data?.displayName)}</T>
          <T variant="body" tone="secondary">
            {view?.summary ?? " "}
          </T>
        </View>
        <IconButton icon="chatbubble-ellipses-outline" accessibilityLabel="שיחה עם העוזר" onPress={() => router.push("/chat")} />
      </View>

      {!view ? (
        <Loading />
      ) : (
        <View style={{ marginTop: space.lg }}>
          {!view.input.calendarConnected ? (
            <Card tone="muted" style={{ gap: space.sm, marginBottom: space.md }}>
              <T variant="bodyStrong">חבר את היומן</T>
              <T variant="caption" tone="secondary">
                כדי שאוכל לראות פגישות, למצוא זמנים פנויים ולהכין תקציר יומי מדויק.
              </T>
              <View style={{ flexDirection: "row" }}>
                <Button compact title="אפשר גישה ליומן" icon="calendar-outline" onPress={async () => (await calendarService.requestAccess()) && invalidateAll()} />
              </View>
            </Card>
          ) : null}
          {view.next ? <NextMeetingCard event={view.next} now={view.input.now} /> : null}
          <SuggestionsCard suggestions={view.suggestions} />
          <TodayTasksCard tasks={view.today} />
          <WaitingCard items={view.waiting} today={toDateKey(view.input.now)} />
          <RemindersCard tasks={view.reminders} />
          <RecentDocumentsCard docs={view.input.documents ?? []} />
          <QuickPrompts />
        </View>
      )}
    </Screen>
  );
}
