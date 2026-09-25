import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import type { Task } from "@/domain/types";
import { T } from "@/components/ui";
import { completeTask, reopenTask } from "@/data/tasks";
import { invalidateAll } from "@/state/queries";
import { fromDateKey, relativeDayLabel, toDateKey } from "@/domain/dates";
import { describeRecurrence } from "@/domain/recurrence";
import { space, useTheme } from "@/theme/tokens";

export function taskMeta(t: Task, now = new Date()): string {
  const parts: string[] = [];
  if (t.dueDate) {
    const overdue = t.status !== "completed" && t.dueDate < toDateKey(now);
    parts.push(`${overdue ? "באיחור · " : ""}${relativeDayLabel(fromDateKey(t.dueDate), now)}${t.dueTime ? ` ${t.dueTime.slice(0, 5)}` : ""}`);
  }
  if (t.remindAt) parts.push("🔔");
  if (t.relatedPerson) parts.push(t.relatedPerson);
  if (t.recurrence) parts.push(describeRecurrence(t.recurrence));
  return parts.join(" · ");
}

export function TaskRow({ task, compact }: { task: Task; compact?: boolean }) {
  const c = useTheme();
  const router = useRouter();
  const done = task.status === "completed";
  const toggle = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (done) await reopenTask(task.id);
    else await completeTask(task.id);
    invalidateAll();
  };
  const meta = taskMeta(task);
  const overdue = !done && task.dueDate !== null && task.dueDate < toDateKey(new Date());
  return (
    <Pressable
      onPress={() => router.push(`/tasks/${task.id}`)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: compact ? 8 : 12, opacity: pressed ? 0.7 : 1 })}
    >
      <Pressable onPress={toggle} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={task.title}>
        <Ionicons
          name={done ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={done ? c.success : task.priority === "urgent" || task.priority === "high" ? c.warning : c.textTertiary}
        />
      </Pressable>
      <View style={{ flex: 1 }}>
        <T variant="body" tone={done ? "tertiary" : "primary"} style={done ? { textDecorationLine: "line-through" } : undefined} numberOfLines={2}>
          {task.title}
        </T>
        {meta ? (
          <T variant="caption" tone={overdue ? "danger" : "secondary"} numberOfLines={1}>
            {meta}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}
