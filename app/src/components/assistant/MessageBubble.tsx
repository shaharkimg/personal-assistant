import React from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatItem } from "@/state/chat";
import { T } from "@/components/ui";
import { radius, space, useTheme } from "@/theme/tokens";

export function MessageBubble({ item }: { item: ChatItem }) {
  const c = useTheme();
  if (item.role === "system") {
    return (
      <T variant="caption" tone="tertiary" style={{ textAlign: "center", marginVertical: space.xs }}>
        {item.text}
      </T>
    );
  }
  const mine = item.role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-start" : "flex-end", marginVertical: space.xs }}>
      <View
        style={{
          maxWidth: "88%",
          backgroundColor: mine ? c.accent : item.error ? c.dangerSoft : c.surface,
          borderRadius: radius.lg,
          borderTopRightRadius: mine ? radius.lg : 6,
          borderTopLeftRadius: mine ? 6 : radius.lg,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          gap: 6,
        }}
      >
        {item.imageUri ? <Image source={{ uri: item.imageUri }} style={{ width: 180, height: 180, borderRadius: radius.sm }} /> : null}
        {item.attachmentName ? (
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            <Ionicons name="document-text-outline" size={16} color={mine ? c.onAccent : c.accent} />
            <T variant="caption" tone={mine ? "onAccent" : "secondary"}>
              {item.attachmentName}
            </T>
          </View>
        ) : null}
        {item.text ? (
          <T variant="body" tone={mine ? "onAccent" : item.error ? "danger" : "primary"} selectable>
            {item.text}
          </T>
        ) : null}
        {item.actions?.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {[...new Set(item.actions)].map((a) => (
              <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.successSoft, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Ionicons name="checkmark" size={12} color={c.success} />
                <T variant="caption" tone="success">
                  {a.replace(/…$/, "")}
                </T>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
