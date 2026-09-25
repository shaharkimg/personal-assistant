import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { createTask, listTasks } from "@/data/tasks";
import type { Task, TaskStatus } from "@/domain/types";
import { compareTasks } from "@/domain/brief";
import { addDays, startOfDay, toDateKey } from "@/domain/dates";
import { Card, Chip, EmptyState, Header, IconButton, Loading, Screen } from "@/components/ui";
import { TaskRow } from "@/components/tasks/TaskRow";
import { invalidateAll, qk } from "@/state/queries";
import { radius, space, type, useTheme } from "@/theme/tokens";

const TABS: { key: TaskStatus; label: string }[] = [
  { key: "today", label: "היום" },
  { key: "upcoming", label: "בקרוב" },
  { key: "inbox", label: "לא מתוזמן" },
  { key: "waiting", label: "ממתין" },
  { key: "someday", label: "מתישהו" },
  { key: "completed", label: "הושלמו" },
];

export default function Tasks() {
  const c = useTheme();
  const [tab, setTab] = useState<TaskStatus>("today");
  const [draft, setDraft] = useState("");
  const q = useQuery({
    queryKey: [...qk.tasks, "all"],
    queryFn: () => listTasks({ includeCompletedSince: startOfDay(addDays(new Date(), -14)).toISOString(), limit: 1000 }),
  });

  const grouped = useMemo(() => {
    const today = toDateKey(new Date());
    const g: Record<TaskStatus, Task[]> = { inbox: [], today: [], upcoming: [], waiting: [], someday: [], completed: [] };
    for (const t of q.data ?? []) {
      // Due/overdue tasks surface in "today" regardless of their stored status.
      const s: TaskStatus = t.status !== "completed" && t.status !== "waiting" && t.status !== "someday" && t.dueDate && t.dueDate <= today ? "today" : t.status;
      g[s].push(t);
    }
    for (const k of Object.keys(g) as TaskStatus[]) {
      g[k].sort(k === "completed" ? (a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : compareTasks);
    }
    return g;
  }, [q.data]);


  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const today = toDateKey(new Date());
    await createTask({
      title,
      status: tab === "completed" ? "inbox" : tab,
      dueDate: tab === "today" ? today : tab === "upcoming" ? toDateKey(addDays(new Date(), 1)) : null,
      source: "manual",
    });
    invalidateAll();
  };

  const items = grouped[tab] ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <Header title="משימות" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
        {TABS.map((t) => (
          <Chip key={t.key} label={`${t.label}${grouped[t.key].length ? ` · ${grouped[t.key].length}` : ""}`} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </ScrollView>
      {tab !== "completed" ? (
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.sm, marginBottom: space.md }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="משימה חדשה…"
            placeholderTextColor={c.textTertiary}
            returnKeyType="done"
            style={[type.body, { flex: 1, color: c.text, paddingVertical: 12, paddingHorizontal: space.sm, textAlign: "right" }]}
          />
          <IconButton icon="add-circle" tone="accent" accessibilityLabel="הוסף משימה" onPress={add} />
        </View>
      ) : null}
      {q.isLoading ? (
        <Loading />
      ) : items.length ? (
        <Card style={{ paddingVertical: space.xs }}>
          {items.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="checkmark-done-outline" title="אין כאן כלום" body="אפשר להוסיף משימה, או פשוט לבקש מהעוזר." />
      )}
    </Screen>
  );
}
