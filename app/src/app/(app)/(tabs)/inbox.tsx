import React, { useState } from "react";
import { Alert, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { deleteInboxItem, listInbox, updateInboxItem } from "@/data/inbox";
import { INBOX_TYPE_LABELS } from "@/domain/inbox";
import { INBOX_TYPES, type InboxItem, type InboxType } from "@/domain/types";
import { classifyItem, convertInboxItem, NeedsDetailsError } from "@/services/inboxProcessing";
import { Button, Card, Chip, EmptyState, Header, IconButton, Loading, Screen, T } from "@/components/ui";
import { useChat } from "@/state/chat";
import { invalidateAll, qk } from "@/state/queries";
import { relativeDayLabel } from "@/domain/dates";
import { space } from "@/theme/tokens";

const KIND_ICON = { text: "text-outline", voice: "mic-outline", file: "document-outline", image: "image-outline", link: "link-outline" } as const;

function InboxCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const setOutbox = useChat((s) => s.setOutbox);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const type = item.finalType ?? item.suggestedType;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      invalidateAll();
    } catch (e) {
      if (e instanceof NeedsDetailsError) {
        setOutbox({ text: `תקבע לי אירוע לפי זה: ${item.rawText ?? ""}`, files: [] });
        router.push("/chat");
      } else Alert.alert("לא הצלחתי", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Chip icon={KIND_ICON[item.kind]} label={relativeDayLabel(new Date(item.createdAt))} />
        <View style={{ flex: 1 }} />
        <IconButton icon="trash-outline" size={18} accessibilityLabel="מחק" onPress={() => run("delete", () => deleteInboxItem(item.id))} />
      </View>
      {item.suggestion?.title ? <T variant="bodyStrong">{item.suggestion.title}</T> : null}
      {item.rawText ? <T numberOfLines={5}>{item.rawText}</T> : null}
      {item.url ? <T tone="accent" numberOfLines={1}>{item.url}</T> : null}
      {item.documentId ? <T variant="caption" tone="secondary" onPress={() => router.push(`/documents/${item.documentId}`)}>📎 קובץ מצורף — פתח</T> : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
        <T variant="caption" tone="secondary">
          {type ? `נראה כמו:` : "עוד לא מוין"}
        </T>
        {type ? <Chip label={INBOX_TYPE_LABELS[type]} selected onPress={() => setChoosing(!choosing)} /> : null}
        <Chip label={choosing ? "סגור" : "שנה סיווג"} icon="swap-horizontal" onPress={() => setChoosing(!choosing)} />
      </View>
      {choosing ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {INBOX_TYPES.map((t) => (
            <Chip
              key={t}
              label={INBOX_TYPE_LABELS[t]}
              selected={t === type}
              onPress={async () => {
                setChoosing(false);
                await updateInboxItem(item.id, { finalType: t as InboxType });
                invalidateAll();
              }}
            />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {type ? (
          <Button compact title={`צור ${INBOX_TYPE_LABELS[type]}`} icon="checkmark" loading={busy === "convert"} onPress={() => run("convert", () => convertInboxItem(item, type))} />
        ) : null}
        <Button compact variant="secondary" title="מיין עם AI" icon="sparkles-outline" loading={busy === "classify"} onPress={() => run("classify", () => classifyItem(item))} />
      </View>
    </Card>
  );
}

export default function Inbox() {
  const router = useRouter();
  const q = useQuery({ queryKey: qk.inbox, queryFn: () => listInbox("new") });
  const [sorting, setSorting] = useState(false);

  const sortAll = async () => {
    setSorting(true);
    for (const item of (q.data ?? []).filter((i) => !i.suggestion)) await classifyItem(item).catch(() => undefined);
    setSorting(false);
    invalidateAll();
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <Header
        title="Inbox"
        subtitle="כל מה שנזרק לכאן — העוזר ממיין, אתה מאשר."
        right={<IconButton icon="add-circle" tone="accent" size={28} accessibilityLabel="לכידה מהירה" onPress={() => router.push("/capture")} />}
      />
      {q.data?.some((i) => !i.suggestion) ? (
        <Button title="מיין הכול עם AI" variant="secondary" icon="sparkles-outline" loading={sorting} onPress={sortAll} style={{ marginBottom: space.md }} />
      ) : null}
      {q.isLoading ? (
        <Loading />
      ) : q.data?.length ? (
        <View style={{ gap: space.md }}>
          {q.data.map((i) => (
            <InboxCard key={i.id} item={i} />
          ))}
        </View>
      ) : (
        <EmptyState icon="file-tray-outline" title="ה-Inbox ריק" body="אפשר לשתף לכאן קבצים, קישורים וטקסט מכל אפליקציה, או ללחוץ + ללכידה מהירה." />
      )}
    </Screen>
  );
}
