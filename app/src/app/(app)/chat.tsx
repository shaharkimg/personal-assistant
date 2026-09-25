import React, { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAssistant } from "@/hooks/useAssistant";
import { loadMessages } from "@/data/conversations";
import { useChat } from "@/state/chat";
import { MessageBubble } from "@/components/assistant/MessageBubble";
import { ConfirmationCard } from "@/components/assistant/ConfirmationCard";
import { Composer } from "@/components/assistant/Composer";
import { EmptyState, T } from "@/components/ui";
import { space, useTheme } from "@/theme/tokens";

export default function Chat() {
  const c = useTheme();
  const params = useLocalSearchParams<{ prompt?: string; conversationId?: string }>();
  const { items, busyLabel, pending, outbox, setOutbox, reset } = useChat();
  const { send, resolve } = useAssistant({ conversationId: params.conversationId ?? null });
  const list = useRef<FlatList>(null);
  const started = useRef(false);

  useEffect(() => {
    reset();
    // Reopened conversation: show its earlier messages (the engine reloads the model context itself).
    if (params.conversationId) {
      void loadMessages(params.conversationId).then((msgs) =>
        reset(msgs.filter((m) => m.text && !m.text.startsWith("[now:")).map((m) => ({ id: m.id, role: m.role, text: m.text! }))),
      );
    }
    return () => reset();
  }, [reset, params.conversationId]);

  // Deliver a message composed on another screen (home composer, suggestion, notification).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (outbox) {
      setOutbox(null);
      void send(outbox.text, outbox.files);
    } else if (params.prompt) {
      void send(params.prompt);
    }
  }, [outbox, params.prompt, send, setOutbox]);

  useEffect(() => {
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  }, [items.length, pending, busyLabel]);

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <MessageBubble item={item} />}
          contentContainerStyle={{ padding: space.lg, gap: 2, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon="sparkles-outline"
              title="במה אפשר לעזור?"
              body={'לדוגמה: "תזכיר לי לדבר עם רועי מחר בבוקר", "מתי אני פנוי ביום ראשון?", "מה כתוב בהסכם עם דני?"'}
            />
          }
          ListFooterComponent={
            <View style={{ gap: space.md, marginTop: space.sm }}>
              {busyLabel ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-end" }}>
                  <ActivityIndicator size="small" color={c.accent} />
                  <T variant="caption" tone="secondary">
                    {busyLabel}
                  </T>
                </View>
              ) : null}
              {pending ? (
                <ConfirmationCard
                  key={pending.toolCallId}
                  pending={pending}
                  onConfirm={(edited) => void resolve("confirm", edited)}
                  onCancel={() => void resolve("cancel")}
                />
              ) : null}
            </View>
          }
        />
        <View style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          <Composer onSend={(t, f) => void send(t, f)} disabled={Boolean(busyLabel)} placeholder="כתוב או דבר…" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
