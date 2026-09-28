import React, { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { deleteDocument, getDocument, readDocumentText, signedUrl } from "@/data/documents";
import { reindexDocument } from "@/services/documents/DocumentService";
import { Button, Card, Chip, Header, Loading, Screen, SectionHeader, T } from "@/components/ui";
import { useChat } from "@/state/chat";
import { invalidateAll, qk } from "@/state/queries";
import { space } from "@/theme/tokens";

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  const doc = useQuery({ queryKey: qk.document(id), queryFn: () => getDocument(id), refetchInterval: (q) => (q.state.data?.status === "processing" ? 2500 : false) });
  const text = useQuery({ queryKey: [...qk.document(id), "text"], queryFn: () => readDocumentText(id, 4000), enabled: doc.data?.status === "ready" });
  const [busy, setBusy] = useState(false);

  if (!doc.data) return <Screen edges={["bottom"]}>{doc.isLoading ? <Loading /> : <T>המסמך לא נמצא.</T>}</Screen>;
  const d = doc.data;
  const ask = (prompt: string) => {
    setOutbox({ text: `${prompt} (מסמך: "${d.title}", id ${d.id})`, files: [] });
    router.push("/chat");
  };

  return (
    <Screen edges={["bottom"]}>
      <Header title={d.title} subtitle={d.fileName} />
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Chip label={{ uploaded: "הועלה", processing: "מעבד…", ready: "מוכן לחיפוש", failed: "העיבוד נכשל" }[d.status]} tone={d.status === "failed" ? "danger" : d.status === "ready" ? "success" : "default"} />
        {d.chunkCount ? <Chip label={`${d.chunkCount} קטעים`} /> : null}
      </View>

      {d.status === "ready" ? (
        <>
          <SectionHeader title="שאל את העוזר" />
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button compact icon="sparkles-outline" title="סכם" onPress={() => ask("סכם לי את המסמך")} />
            <Button compact variant="secondary" title="חלץ מועדים" onPress={() => ask("מצא את כל המועדים והתאריכים החשובים במסמך וצור להם תזכורות")} />
            <Button compact variant="secondary" title="צור משימות" onPress={() => ask("צור משימות לפי מה שנדרש במסמך")} />
          </View>
          <SectionHeader title="תחילת הטקסט" />
          <Card tone="muted">{text.data ? <T selectable>{text.data.text}{text.data.truncated ? "…" : ""}</T> : <Loading />}</Card>
        </>
      ) : null}

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button title="פתח את הקובץ המקורי" variant="secondary" icon="open-outline" onPress={async () => { const url = await signedUrl(d.storagePath); if (url) await Linking.openURL(url); }} />
        {d.status === "failed" ? (
          <Button title="נסה לעבד שוב" variant="secondary" icon="refresh" loading={busy} onPress={async () => { setBusy(true); await reindexDocument(d.id).catch(() => undefined); setBusy(false); invalidateAll(); }} />
        ) : null}
        <Button
          title="מחק מסמך"
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            Alert.alert("למחוק את המסמך?", "הקובץ והאינדקס יימחקו לצמיתות.", [
              { text: "ביטול", style: "cancel" },
              { text: "מחק", style: "destructive", onPress: async () => { await deleteDocument(d.id); invalidateAll(); router.back(); } },
            ])
          }
        />
      </View>
    </Screen>
  );
}
