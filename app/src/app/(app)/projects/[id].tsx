import React, { useEffect } from "react";
import { Alert, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getProjectOverview, updateProject } from "@/data/projects";
import { Button, Card, Chip, Header, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useChat } from "@/state/chat";
import { invalidateAll, qk } from "@/state/queries";
import { space } from "@/theme/tokens";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const nav = useNavigation();
  const setOutbox = useChat((s) => s.setOutbox);
  const q = useQuery({ queryKey: qk.project(id), queryFn: () => getProjectOverview(id) });

  useEffect(() => nav.setOptions({ title: "" }), [nav]);
  if (!q.data) return <Screen edges={["bottom"]}>{q.isLoading ? <Loading /> : <T>הפרויקט לא נמצא.</T>}</Screen>;
  const { project, tasks, waiting, notes, documents, people, conversations } = q.data;
  const open = tasks.filter((t) => t.status !== "completed");

  const ask = (text: string) => {
    setOutbox({ text, files: [] });
    router.push("/chat");
  };

  return (
    <Screen edges={["bottom"]}>
      <Header title={project.name} subtitle={[project.description, project.deadline ? `דדליין: ${project.deadline}` : null].filter(Boolean).join(" · ") || undefined} />
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button compact icon="sparkles-outline" title="מה המצב?" onPress={() => ask(`תן לי תמונת מצב על פרויקט "${project.name}": מה פתוח, מה ממתין, ומה הצעד הבא.`)} />
        <Button compact variant="secondary" icon="add" title="משימה" onPress={() => ask(`הוסף משימה לפרויקט "${project.name}": `)} />
      </View>

      <SectionHeader title={`משימות פתוחות · ${open.length}`} />
      <Card style={{ paddingVertical: space.xs }}>{open.length ? open.map((t) => <TaskRow key={t.id} task={t} compact />) : <T tone="secondary">אין משימות פתוחות.</T>}</Card>

      {waiting.length ? (
        <>
          <SectionHeader title="ממתינים לתשובה" />
          <Card style={{ paddingVertical: space.xs }}>
            {waiting.map((w) => (
              <Row key={w.id} icon="hourglass-outline" title={`${w.person} — ${w.subject}`} subtitle={w.expectedResponseDate} />
            ))}
          </Card>
        </>
      ) : null}

      {people.length ? (
        <>
          <SectionHeader title="אנשים" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {people.map((p) => (
              <Chip key={p.id} icon="person-outline" label={p.displayName} />
            ))}
          </View>
        </>
      ) : null}

      {documents.length ? (
        <>
          <SectionHeader title="מסמכים" />
          <Card style={{ paddingVertical: space.xs }}>
            {documents.map((d) => (
              <Row key={d.id} icon="document-text-outline" title={d.title} onPress={() => router.push(`/documents/${d.id}`)} />
            ))}
          </Card>
        </>
      ) : null}

      {notes.length ? (
        <>
          <SectionHeader title="הערות" />
          <View style={{ gap: space.sm }}>
            {notes.map((n) => (
              <Card key={n.id} tone="muted">
                {n.title ? <T variant="bodyStrong">{n.title}</T> : null}
                <T numberOfLines={6}>{n.body}</T>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      {conversations.length ? (
        <>
          <SectionHeader title="שיחות" />
          <Card style={{ paddingVertical: space.xs }}>
            {conversations.map((cv) => (
              <Row key={cv.id} icon="chatbubble-outline" title={cv.title ?? "שיחה"} onPress={() => router.push({ pathname: "/chat", params: { conversationId: cv.id } })} />
            ))}
          </Card>
        </>
      ) : null}

      <Button
        title="העבר לארכיון"
        variant="ghost"
        icon="archive-outline"
        style={{ marginTop: space.xl }}
        onPress={() =>
          Alert.alert("להעביר לארכיון?", project.name, [
            { text: "ביטול", style: "cancel" },
            { text: "ארכיון", onPress: async () => { await updateProject(project.id, { status: "archived" }); invalidateAll(); router.back(); } },
          ])
        }
      />
    </Screen>
  );
}
