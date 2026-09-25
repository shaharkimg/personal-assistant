import React from "react";
import { FlatList, View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listActivity } from "@/data/profile";
import type { ActivityEntry } from "@/domain/types";
import { formatTime, relativeDayLabel, toDateKey } from "@/domain/dates";
import { EmptyState, Loading, T } from "@/components/ui";
import { qk } from "@/state/queries";
import { space, useTheme } from "@/theme/tokens";

const ACTOR = { assistant: "העוזר", user: "אתה", system: "מערכת" } as const;

/** Audit log: everything the assistant (and you) changed, newest first. */
export default function Activity() {
  const c = useTheme();
  const q = useInfiniteQuery({
    queryKey: qk.activity,
    queryFn: ({ pageParam }) => listActivity(50, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length === 50 ? last[last.length - 1].id : undefined),
  });
  const items = q.data?.pages.flat() ?? [];

  const renderItem = ({ item, index }: { item: ActivityEntry; index: number }) => {
    const d = new Date(item.occurredAt);
    const newDay = index === 0 || toDateKey(new Date(items[index - 1].occurredAt)) !== toDateKey(d);
    return (
      <View>
        {newDay ? (
          <T variant="label" tone="tertiary" style={{ marginTop: space.lg, marginBottom: space.sm }}>
            {relativeDayLabel(d)}
          </T>
        ) : null}
        <View style={{ flexDirection: "row", gap: space.md, paddingVertical: 8 }}>
          <T variant="caption" tone="secondary" style={{ width: 44 }}>
            {formatTime(d)}
          </T>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: item.actor === "assistant" ? c.accent : c.textTertiary }} />
          <View style={{ flex: 1 }}>
            <T variant="body">{item.summary}</T>
            <T variant="caption" tone="tertiary">
              {ACTOR[item.actor]} · {item.action}
            </T>
          </View>
        </View>
      </View>
    );
  };

  if (q.isLoading) return <Loading />;
  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 80 }}
      data={items}
      keyExtractor={(i) => String(i.id)}
      renderItem={renderItem}
      onEndReached={() => q.hasNextPage && q.fetchNextPage()}
      ListEmptyComponent={<EmptyState icon="pulse-outline" title="עוד אין פעילות" />}
    />
  );
}
