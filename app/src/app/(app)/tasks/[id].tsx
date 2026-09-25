import React, { useEffect, useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { completeTask, deleteTask, getTask, updateTask, type TaskPatch } from "@/data/tasks";
import { listProjects } from "@/data/projects";
import { TASK_PRIORITIES, TASK_STATUSES, type Recurrence, type Task } from "@/domain/types";
import { addDays, toDateKey } from "@/domain/dates";
import { describeRecurrence } from "@/domain/recurrence";
import { Button, Chip, Loading, Screen, SectionHeader, T } from "@/components/ui";
import { invalidateAll, qk, queryClient } from "@/state/queries";
import { radius, space, type, useTheme } from "@/theme/tokens";

const STATUS_LABEL: Record<Task["status"], string> = { inbox: "לא מתוזמן", today: "היום", upcoming: "בקרוב", waiting: "ממתין", someday: "מתישהו", completed: "הושלם" };
const PRIORITY_LABEL: Record<Task["priority"], string> = { low: "נמוכה", normal: "רגילה", high: "גבוהה", urgent: "דחופה" };
const RECURRENCES: { label: string; value: Recurrence | null }[] = [
  { label: "ללא", value: null },
  { label: "כל יום", value: { freq: "daily", interval: 1 } },
  { label: "כל שבוע", value: { freq: "weekly", interval: 1 } },
  { label: "כל חודש", value: { freq: "monthly", interval: 1 } },
  { label: "כל שנה", value: { freq: "yearly", interval: 1 } },
];

export default function TaskDetail() {
  const c = useTheme();
  const router = useRouter();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: qk.task(id), queryFn: () => getTask(id) });
  const projects = useQuery({ queryKey: qk.projects, queryFn: () => listProjects() });
  // Optimistic local edits layered over the server copy.
  const [override, setOverride] = useState<Partial<Task>>({});
  const t: Task | null = q.data ? { ...q.data, ...override } : null;
  useEffect(() => {
    nav.setOptions({ title: t?.status === "completed" ? "משימה שהושלמה" : "משימה" });
  }, [nav, t?.status]);

  if (!t) return <Screen>{q.isLoading ? <Loading /> : <T>המשימה לא נמצאה.</T>}</Screen>;

  const save = async (patch: TaskPatch) => {
    setOverride((o) => ({ ...o, ...(patch as Partial<Task>) }));
    const updated = await updateTask(t.id, patch);
    queryClient.setQueryData(qk.task(id), updated);
    setOverride({});
    invalidateAll();
  };
  const input = [type.body, { color: c.text, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md, textAlign: "right" as const }];
  const today = new Date();
  const dateOptions = [
    { label: "היום", value: toDateKey(today) },
    { label: "מחר", value: toDateKey(addDays(today, 1)) },
    { label: "בעוד שבוע", value: toDateKey(addDays(today, 7)) },
    { label: "ללא תאריך", value: null },
  ];

  return (
    <Screen edges={["bottom"]}>
      <TextInput style={[input, type.title]} defaultValue={t.title} onEndEditing={(e) => e.nativeEvent.text.trim() && save({ title: e.nativeEvent.text.trim() })} multiline />
      <TextInput
        style={[input, { marginTop: space.sm, minHeight: 80, textAlignVertical: "top" }]}
        defaultValue={t.description ?? ""}
        placeholder="פרטים…"
        placeholderTextColor={c.textTertiary}
        onEndEditing={(e) => save({ description: e.nativeEvent.text || null })}
        multiline
      />

      <SectionHeader title="מתי" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {dateOptions.map((o) => (
          <Chip key={o.label} label={o.label} selected={t.dueDate === o.value} onPress={() => save({ dueDate: o.value })} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
        <TextInput style={[input, { flex: 1 }]} defaultValue={t.dueDate ?? ""} placeholder="YYYY-MM-DD" placeholderTextColor={c.textTertiary}
          onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) void save({ dueDate: v || null }); }} />
        <TextInput style={[input, { width: 100 }]} defaultValue={t.dueTime?.slice(0, 5) ?? ""} placeholder="HH:MM" placeholderTextColor={c.textTertiary}
          onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (!v || /^\d{2}:\d{2}$/.test(v)) void save({ dueTime: v || null }); }} />
      </View>

      <SectionHeader title="סטטוס" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {TASK_STATUSES.filter((s) => s !== "completed").map((s) => (
          <Chip key={s} label={STATUS_LABEL[s]} selected={t.status === s} onPress={() => save({ status: s })} />
        ))}
      </View>

      <SectionHeader title="עדיפות" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {TASK_PRIORITIES.map((p) => (
          <Chip key={p} label={PRIORITY_LABEL[p]} selected={t.priority === p} onPress={() => save({ priority: p })} />
        ))}
      </View>

      <SectionHeader title="חזרה" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {RECURRENCES.map((r) => (
          <Chip key={r.label} label={r.label} selected={(t.recurrence?.freq ?? null) === (r.value?.freq ?? null)} onPress={() => save({ recurrence: r.value })} />
        ))}
      </View>
      {t.recurrence ? (
        <T variant="caption" tone="secondary" style={{ marginTop: space.xs }}>
          {describeRecurrence(t.recurrence)} — כשתסמן כבוצע, תיווצר המשימה הבאה.
        </T>
      ) : null}

      {projects.data?.length ? (
        <>
          <SectionHeader title="פרויקט" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Chip label="ללא" selected={!t.projectId} onPress={() => save({ projectId: null })} />
            {projects.data.map((p) => (
              <Chip key={p.id} label={p.name} selected={t.projectId === p.id} onPress={() => save({ projectId: p.id })} />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="איש קשר ומעקב" />
      <TextInput style={input} defaultValue={t.relatedPerson ?? ""} placeholder="קשור ל…" placeholderTextColor={c.textTertiary} onEndEditing={(e) => save({ relatedPerson: e.nativeEvent.text.trim() || null })} />
      <TextInput style={[input, { marginTop: space.sm }]} defaultValue={t.followUpDate ?? ""} placeholder="תאריך מעקב YYYY-MM-DD" placeholderTextColor={c.textTertiary}
        onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) void save({ followUpDate: v || null }); }} />

      <T variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>
        נוצרה {new Date(t.createdAt).toLocaleString("he-IL")} · מקור: {t.source}
        {t.rolledOverCount ? ` · נדחתה ${t.rolledOverCount} פעמים` : ""}
      </T>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        {t.status !== "completed" ? (
          <Button title="סמן כבוצע" icon="checkmark" onPress={async () => { await completeTask(t.id); invalidateAll(); router.back(); }} />
        ) : null}
        <Button
          title="מחק משימה"
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            Alert.alert("למחוק את המשימה?", t.title, [
              { text: "ביטול", style: "cancel" },
              { text: "מחק", style: "destructive", onPress: async () => { await deleteTask(t.id); invalidateAll(); router.back(); } },
            ])
          }
        />
      </View>
    </Screen>
  );
}
