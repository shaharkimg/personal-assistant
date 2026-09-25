import React, { useEffect, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/data/documents";
import { ingestFiles, pickDocument, scanDocument, searchDocuments, takePhoto, type LocalFile, type SearchHit } from "@/services/documents/DocumentService";
import { Button, Card, EmptyState, Loading, Row, Screen, SectionHeader, T } from "@/components/ui";
import { invalidateAll, qk } from "@/state/queries";
import { relativeDayLabel } from "@/domain/dates";
import { radius, space, type, useTheme } from "@/theme/tokens";

export default function Documents() {
  const c = useTheme();
  const router = useRouter();
  const { scan } = useLocalSearchParams<{ scan?: string }>();
  const q = useQuery({ queryKey: qk.documents, queryFn: () => listDocuments(), refetchInterval: (query) => (query.state.data?.some((d) => d.status === "processing" || d.status === "uploaded") ? 3000 : false) });
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const add = async (get: () => Promise<LocalFile[]>, source: "upload" | "camera" | "scan") => {
    try {
      const files = await get();
      if (!files.length) return;
      setBusy(true);
      const { document } = await ingestFiles(files, { source });
      invalidateAll();
      router.push(`/documents/${document.id}`);
    } catch (e) {
      Alert.alert("לא הצלחתי להוסיף את המסמך", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Opened from the "סרוק מסמך" quick action: start the scanner right away.
  useEffect(() => {
    if (scan !== "1") return;
    const id = setTimeout(() => void add(scanDocument, "scan"), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  const search = async () => {
    if (!query.trim()) return setHits(null);
    setBusy(true);
    try {
      setHits(await searchDocuments(query.trim()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md, flexWrap: "wrap" }}>
        <Button compact icon="document-attach-outline" title="קובץ" onPress={() => add(async () => [await pickDocument()].filter(Boolean) as LocalFile[], "upload")} />
        <Button compact variant="secondary" icon="scan-outline" title="סריקה" onPress={() => add(scanDocument, "scan")} />
        <Button compact variant="secondary" icon="camera-outline" title="צילום" onPress={() => add(async () => [await takePhoto()].filter(Boolean) as LocalFile[], "camera")} />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        placeholder="חיפוש בתוך המסמכים…"
        placeholderTextColor={c.textTertiary}
        returnKeyType="search"
        style={[type.body, { marginTop: space.md, color: c.text, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: space.md, textAlign: "right" }]}
      />
      {busy ? <Loading /> : null}
      {hits ? (
        <>
          <SectionHeader title={`תוצאות · ${hits.length}`} action="נקה" onAction={() => setHits(null)} />
          <View style={{ gap: space.sm }}>
            {hits.map((h) => (
              <Card key={`${h.document_id}:${h.chunk_index}`} onPress={() => router.push(`/documents/${h.document_id}`)} style={{ gap: 4 }}>
                <T variant="label" tone="accent">
                  {h.document?.title}
                  {h.heading ? ` · ${h.heading}` : ""}
                </T>
                <T numberOfLines={5}>{h.content}</T>
              </Card>
            ))}
          </View>
        </>
      ) : q.isLoading ? (
        <Loading />
      ) : q.data?.length ? (
        <Card style={{ paddingVertical: space.xs, marginTop: space.lg }}>
          {q.data.map((d) => (
            <Row
              key={d.id}
              icon={d.mimeType.startsWith("image/") ? "image-outline" : d.mimeType.includes("sheet") ? "grid-outline" : "document-text-outline"}
              title={d.title}
              subtitle={d.status === "ready" ? `${relativeDayLabel(new Date(d.createdAt))} · ${d.chunkCount ?? 0} קטעים` : d.status === "failed" ? "העיבוד נכשל" : "מעבד…"}
              onPress={() => router.push(`/documents/${d.id}`)}
            />
          ))}
        </Card>
      ) : (
        <EmptyState icon="documents-outline" title="עוד אין מסמכים" body="הוסף הסכמים, קבלות או מכתבים — ואז שאל: ״מה כתוב בהסכם עם X?״" />
      )}
    </Screen>
  );
}
