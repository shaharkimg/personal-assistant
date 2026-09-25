import React, { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { createMemory, deleteAllMemories, deleteMemory, listMemories, SensitiveMemoryError } from "@/data/memories";
import { deleteAllConversations, listConversations } from "@/data/conversations";
import { deletePerson, listPeople } from "@/data/people";
import type { MemoryCategory } from "@/domain/types";
import { Button, Card, Chip, IconButton, Row, Screen, SectionHeader, T } from "@/components/ui";
import { invalidateAll, qk } from "@/state/queries";
import { radius, space, type, useTheme } from "@/theme/tokens";

const CATS: { key: MemoryCategory; label: string }[] = [
  { key: "preference", label: "העדפה" },
  { key: "routine", label: "שגרה" },
  { key: "work", label: "עבודה" },
  { key: "relationship", label: "קשר" },
  { key: "fact", label: "עובדה" },
];

/** Everything the assistant keeps about you — visible and deletable, by layer. */
export default function MemoryScreen() {
  const c = useTheme();
  const memories = useQuery({ queryKey: qk.memories, queryFn: listMemories });
  const people = useQuery({ queryKey: [...qk.memories, "people"], queryFn: listPeople });
  const convs = useQuery({ queryKey: qk.conversations, queryFn: () => listConversations(100) });
  const [text, setText] = useState("");
  const [cat, setCat] = useState<MemoryCategory>("preference");

  const add = async (allowSensitive = false) => {
    if (!text.trim()) return;
    try {
      await createMemory(text.trim(), cat, "user_explicit", "user", allowSensitive);
      setText("");
      invalidateAll();
    } catch (e) {
      if (e instanceof SensitiveMemoryError) {
        Alert.alert("מידע רגיש", `${e.message}. לשמור בכל זאת? המידע יישלח לעוזר בכל שיחה.`, [
          { text: "ביטול", style: "cancel" },
          { text: "שמור", style: "destructive", onPress: () => void add(true) },
        ]);
      }
    }
  };

  const confirm = (title: string, fn: () => Promise<unknown>) =>
    Alert.alert(title, "לא ניתן לבטל.", [
      { text: "ביטול", style: "cancel" },
      { text: "מחק", style: "destructive", onPress: async () => { await fn(); invalidateAll(); } },
    ]);

  return (
    <Screen edges={["bottom"]}>
      <T tone="secondary" style={{ marginTop: space.md }}>
        העוזר שומר רק מה שביקשת או אישרת. מידע רגיש (בריאות, כספים, מספרי זהות, סיסמאות) לא נשמר אוטומטית.
      </T>

      <SectionHeader title="העדפות ועובדות לטווח ארוך" />
      <Card style={{ gap: space.sm }}>
        {memories.data?.length ? (
          memories.data.map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <T>{m.content}</T>
                <T variant="caption" tone="tertiary">
                  {CATS.find((x) => x.key === m.category)?.label} · {m.source === "user_explicit" ? "ביקשת לזכור" : "אישרת הצעה"}
                </T>
              </View>
              <IconButton icon="close" size={18} accessibilityLabel="מחק" onPress={() => deleteMemory(m.id).then(invalidateAll)} />
            </View>
          ))
        ) : (
          <T tone="secondary">עוד לא נשמר כלום.</T>
        )}
      </Card>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.md }}>
        {CATS.map((x) => (
          <Chip key={x.key} label={x.label} selected={cat === x.key} onPress={() => setCat(x.key)} />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="למשל: מעדיף פגישות בבוקר"
          placeholderTextColor={c.textTertiary}
          onSubmitEditing={() => add()}
          style={[type.body, { flex: 1, color: c.text, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md, textAlign: "right" }]}
        />
        <IconButton icon="add-circle" tone="accent" size={28} accessibilityLabel="הוסף לזיכרון" onPress={() => add()} />
      </View>
      {memories.data?.length ? <Button title="מחק את כל הזיכרון" variant="ghost" onPress={() => confirm("למחוק את כל הזיכרון?", () => deleteAllMemories())} /> : null}

      <SectionHeader title="אנשים שהעוזר מכיר" />
      <Card style={{ paddingVertical: space.xs }}>
        {people.data?.length ? (
          people.data.map((p) => (
            <Row key={p.id} icon="person-outline" title={p.displayName} right={<IconButton icon="close" size={18} accessibilityLabel="מחק" onPress={() => deletePerson(p.id).then(invalidateAll)} />} />
          ))
        ) : (
          <T tone="secondary">אין. אנשי הקשר שבמכשיר לא מועלים לשרת.</T>
        )}
      </Card>

      <SectionHeader title="היסטוריית שיחות (הקשר קצר טווח)" />
      <Card>
        <T>{convs.data?.length ?? 0} שיחות שמורות</T>
        {convs.data?.length ? <Button compact variant="ghost" title="מחק את כל השיחות" onPress={() => confirm("למחוק את כל השיחות?", deleteAllConversations)} /> : null}
      </Card>

      <T variant="caption" tone="tertiary" style={{ marginTop: space.lg }}>
        משימות, פרויקטים ומסמכים נמחקים מהמסכים שלהם. מחיקה מלאה של החשבון — בהגדרות.
      </T>
    </Screen>
  );
}
