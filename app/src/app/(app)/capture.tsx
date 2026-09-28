import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { createAssistantSession } from "@/assistant/session";
import { turnContext } from "@/assistant/prompt";
import { createInboxItem } from "@/data/inbox";
import { heuristicClassify } from "@/domain/inbox";
import { Composer } from "@/components/assistant/Composer";
import { Button, T } from "@/components/ui";
import { invalidateAll } from "@/state/queries";
import { useChat } from "@/state/chat";
import { ingestFiles, type LocalFile } from "@/services/documents/DocumentService";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { space, useTheme } from "@/theme/tokens";

/**
 * Quick Capture: open, say "מחר להתקשר לעירייה", done. The assistant performs one action
 * without follow-up questions; if anything fails the raw text is kept in the Inbox so
 * nothing is ever lost.
 */
export default function Capture() {
  const c = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ voice?: string; meeting?: string }>();
  // Meeting mode: dictate what happened, then hand off to the chat so the summary can be confirmed.
  const meeting = params.meeting !== undefined ? (params.meeting === "1" ? "" : params.meeting) : null;
  const autoVoice = meeting !== null ? "1" : params.voice;
  const setOutbox = useChat((s) => s.setOutbox);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const capture = async (text: string, files: LocalFile[] = []) => {
    if (meeting !== null) {
      setOutbox({ text: `סיכום פגישה${meeting ? ` "${meeting}"` : ""}: ${text}`, files });
      router.replace("/chat");
      return;
    }
    setStatus("working");
    try {
      if (files.length) {
        const { document } = await ingestFiles(files, { source: "upload" });
        await createInboxItem({ kind: files[0].mimeType.startsWith("image/") ? "image" : "file", rawText: text || null, documentId: document.id, suggestedType: "document" });
        setMessage(`נשמר: ${document.title}`);
      } else {
        const engine = await createAssistantSession({ mode: "quick_capture" });
        const res = await engine.send([{ type: "text", text: turnContext(new Date()) }, { type: "text", text }], text);
        if (res.status === "error" || !res.actions.length) throw new Error(res.text);
        await createInboxItem({ kind: "text", rawText: text, status: "processed", suggestedType: null });
        setMessage(res.text || "נשמר.");
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setStatus("done");
      invalidateAll();
      closeTimer.current = setTimeout(() => router.back(), 1600);
    } catch {
      // Offline / model unavailable: keep the thought in the Inbox.
      const guess = heuristicClassify(text, "text");
      await createInboxItem({ kind: "text", rawText: text, suggestedType: guess.type, confidence: guess.confidence }).catch(() => undefined);
      invalidateAll();
      setMessage("שמרתי ב-Inbox — אמיין את זה כשאפשר.");
      setStatus("error");
      closeTimer.current = setTimeout(() => router.back(), 2000);
    }
  };

  const voice = useVoiceInput((t) => void capture(t));
  useEffect(() => {
    if (autoVoice === "1") void voice.start();
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, gap: space.lg, paddingTop: space.xl }}>
      <T variant="title">{meeting !== null ? "סיכום פגישה" : "לכידה מהירה"}</T>
      {meeting !== null ? (
        <T tone="secondary">{`${meeting ? `"${meeting}" — ` : ""}ספר מה סוכם, מה אתה צריך לעשות ומה אחרים הבטיחו.`}</T>
      ) : null}
      {status === "idle" ? (
        autoVoice === "1" && voice.state !== "idle" ? (
          <View style={{ gap: space.md }}>
            <T variant="body" tone={voice.state === "recording" ? "danger" : "secondary"}>
              {voice.state === "recording" ? `מקשיב… ${voice.seconds}ש׳` : voice.state === "transcribing" ? "מתמלל…" : voice.error}
            </T>
            {voice.state === "recording" ? <Button title="סיום" icon="stop" onPress={() => void voice.stop()} /> : null}
            {voice.state === "error" ? <Composer autoFocus onSend={(t, f) => void capture(t, f)} placeholder="אפשר גם לכתוב" /> : null}
          </View>
        ) : (
          <Composer autoFocus onSend={(t, f) => void capture(t, f)} placeholder='למשל: "מחר להתקשר לעירייה"' />
        )
      ) : (
        <View style={{ gap: space.sm }}>
          <T variant="heading" tone={status === "error" ? "warning" : status === "done" ? "success" : "secondary"}>
            {status === "working" ? "מטפל בזה…" : status === "done" ? "✓ בוצע" : "נשמר ל-Inbox"}
          </T>
          {message ? <T tone="secondary">{message}</T> : null}
        </View>
      )}
    </View>
  );
}
