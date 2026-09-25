import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { CalendarEvent, DocumentRecord, Task, WaitingFor } from "@/domain/types";
import type { Suggestion } from "@/domain/brief";
import { formatTime, minutesBetween, relativeDayLabel } from "@/domain/dates";
import { Button, Card, Chip, Row, SectionHeader, T } from "@/components/ui";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useChat } from "@/state/chat";
import { space, useTheme } from "@/theme/tokens";

export function NextMeetingCard({ event, now }: { event: CalendarEvent; now: Date }) {
  const c = useTheme();
  const inMin = minutesBetween(now, event.start);
  const when = event.start <= now ? "עכשיו" : inMin < 60 ? `בעוד ${inMin} דק׳` : `${relativeDayLabel(event.start, now)} ${formatTime(event.start)}`;
  return (
    <Card tone="accent" style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="calendar" size={16} color={c.accent} />
        <T variant="label" tone="accent">
          הפגישה הבאה · {when}
        </T>
      </View>
      <T variant="title">{event.title}</T>
      <T variant="caption" tone="secondary">
        {formatTime(event.start)}–{formatTime(event.end)}
        {event.location ? ` · ${event.location}` : ""}
      </T>
    </Card>
  );
}

export function TodayTasksCard({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  return (
    <>
      <SectionHeader title="משימות להיום" action="הכול" onAction={() => router.push("/tasks")} />
      <Card style={{ paddingVertical: space.sm }}>
        {tasks.length ? tasks.slice(0, 6).map((t) => <TaskRow key={t.id} task={t} compact />) : <T tone="secondary">אין משימות פתוחות להיום.</T>}
        {tasks.length > 6 ? (
          <T variant="caption" tone="accent" onPress={() => router.push("/tasks")} style={{ paddingTop: space.sm }}>
            ועוד {tasks.length - 6}…
          </T>
        ) : null}
      </Card>
    </>
  );
}

export function WaitingCard({ items, today }: { items: WaitingFor[]; today: string }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <>
      <SectionHeader title="ממתינים לתשובה" action="הכול" onAction={() => router.push("/waiting")} />
      <Card style={{ paddingVertical: space.xs }}>
        {items.slice(0, 4).map((w) => (
          <Row
            key={w.id}
            icon="hourglass-outline"
            title={`${w.person} — ${w.subject}`}
            subtitle={w.expectedResponseDate ? (w.expectedResponseDate <= today ? "עבר המועד לתשובה" : `מחכה עד ${w.expectedResponseDate}`) : "ללא מועד"}
            onPress={() => router.push("/waiting")}
          />
        ))}
      </Card>
    </>
  );
}

export function RemindersCard({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  if (!tasks.length) return null;
  return (
    <>
      <SectionHeader title="תזכורות" />
      <Card style={{ paddingVertical: space.xs }}>
        {tasks.slice(0, 4).map((t) => (
          <Row
            key={t.id}
            icon="notifications-outline"
            title={t.title}
            subtitle={`${relativeDayLabel(new Date(t.remindAt!))} ${formatTime(new Date(t.remindAt!))}`}
            onPress={() => router.push(`/tasks/${t.id}`)}
          />
        ))}
      </Card>
    </>
  );
}

export function SuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  if (!suggestions.length) return null;
  return (
    <>
      <SectionHeader title="כדאי לטפל" />
      <View style={{ gap: space.sm }}>
        {suggestions.slice(0, 4).map((s) => (
          <Card key={s.id} tone={s.kind === "follow_up" || s.kind === "overdue" ? "warning" : "muted"} style={{ gap: space.sm }}>
            <T variant="bodyStrong">{s.title}</T>
            <T variant="caption" tone="secondary">
              {s.body}
            </T>
            <View style={{ flexDirection: "row" }}>
              {s.prompt ? (
                <Button
                  compact
                  title={s.kind === "follow_up" ? "הכן הודעה" : "טפל בזה"}
                  icon="sparkles-outline"
                  onPress={() => {
                    setOutbox({ text: s.prompt!, files: [] });
                    router.push("/chat");
                  }}
                />
              ) : s.href ? (
                <Button compact variant="secondary" title="פתח" onPress={() => router.push(s.href as never)} />
              ) : null}
            </View>
          </Card>
        ))}
      </View>
    </>
  );
}

export function RecentDocumentsCard({ docs }: { docs: DocumentRecord[] }) {
  const router = useRouter();
  if (!docs.length) return null;
  return (
    <>
      <SectionHeader title="מסמכים אחרונים" action="הכול" onAction={() => router.push("/documents")} />
      <Card style={{ paddingVertical: space.xs }}>
        {docs.slice(0, 3).map((d) => (
          <Row
            key={d.id}
            icon={d.mimeType.startsWith("image/") ? "image-outline" : "document-text-outline"}
            title={d.title}
            subtitle={d.status === "ready" ? relativeDayLabel(new Date(d.createdAt)) : d.status === "failed" ? "העיבוד נכשל" : "מעבד…"}
            onPress={() => router.push(`/documents/${d.id}`)}
          />
        ))}
      </Card>
    </>
  );
}

export function QuickPrompts() {
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  const prompts = ["מה אני צריך לעשות היום?", "מתי אני פנוי השבוע?", "יש משהו חשוב ששכחתי?", "תסכם לי את היום"];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.lg }}>
      {prompts.map((p) => (
        <Chip
          key={p}
          label={p}
          onPress={() => {
            setOutbox({ text: p, files: [] });
            router.push("/chat");
          }}
        />
      ))}
    </View>
  );
}
