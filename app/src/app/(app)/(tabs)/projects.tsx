import React, { useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createProject, listProjects } from "@/data/projects";
import { Card, EmptyState, Header, IconButton, Loading, Row, Screen } from "@/components/ui";
import { invalidateAll, qk } from "@/state/queries";
import { radius, space, type, useTheme } from "@/theme/tokens";

export default function Projects() {
  const c = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: qk.projects, queryFn: () => listProjects() });
  const [name, setName] = useState("");

  const add = async () => {
    if (!name.trim()) return;
    const p = await createProject({ name: name.trim() });
    setName("");
    invalidateAll();
    router.push(`/projects/${p.id}`);
  };

  return (
    <Screen>
      <Header title="פרויקטים" subtitle="משימות, מסמכים, אנשים והערות — מקובצים לפי הקשר." />
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.sm, marginBottom: space.md }}>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          placeholder="פרויקט חדש (למשל: חתונה, בית)…"
          placeholderTextColor={c.textTertiary}
          style={[type.body, { flex: 1, color: c.text, paddingVertical: 12, paddingHorizontal: space.sm, textAlign: "right" }]}
        />
        <IconButton icon="add-circle" tone="accent" accessibilityLabel="צור פרויקט" onPress={add} />
      </View>
      {q.isLoading ? (
        <Loading />
      ) : q.data?.length ? (
        <Card style={{ paddingVertical: space.xs }}>
          {q.data.map((p) => (
            <Row key={p.id} icon="folder-outline" title={p.name} subtitle={p.deadline ? `דדליין: ${p.deadline}` : p.description} onPress={() => router.push(`/projects/${p.id}`)} />
          ))}
        </Card>
      ) : (
        <EmptyState icon="folder-open-outline" title="עוד אין פרויקטים" body="פרויקט עוזר לעוזר להבין הקשרים — למשל כל מה שקשור לחתונה." />
      )}
    </Screen>
  );
}
