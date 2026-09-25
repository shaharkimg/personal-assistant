import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconButton, T } from "@/components/ui";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { LocalFile } from "@/services/documents/DocumentService";
import { radius, space, type, useTheme } from "@/theme/tokens";
import { AttachMenu } from "./AttachMenu";

/**
 * The central "מה תרצה שאעשה?" input: text, a prominent mic, and attachments.
 * `sendOnVoice` sends the transcript immediately (voice-first flow).
 */
export function Composer({
  onSend,
  disabled,
  placeholder = "מה תרצה שאעשה?",
  autoFocus,
  sendOnVoice = true,
  allowAttachments = true,
  initialText = "",
}: {
  onSend: (text: string, files: LocalFile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  sendOnVoice?: boolean;
  allowAttachments?: boolean;
  initialText?: string;
}) {
  const c = useTheme();
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [menu, setMenu] = useState(false);

  const submit = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v && !files.length) return;
      onSend(v, files);
      setText("");
      setFiles([]);
    },
    [files, onSend],
  );

  const voice = useVoiceInput(
    useCallback(
      (transcript: string) => {
        if (sendOnVoice) submit(transcript);
        else setText((t) => (t ? `${t} ${transcript}` : transcript));
      },
      [sendOnVoice, submit],
    ),
  );

  const recording = voice.state === "recording";
  const transcribing = voice.state === "transcribing";

  return (
    <View style={{ gap: space.sm }}>
      {files.length ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {files.map((f, i) => (
            <View key={f.uri} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surfaceMuted, borderRadius: radius.sm, padding: 6 }}>
              {f.mimeType.startsWith("image/") ? (
                <Image source={{ uri: f.uri }} style={{ width: 32, height: 32, borderRadius: 6 }} />
              ) : (
                <Ionicons name="document-text-outline" size={20} color={c.accent} />
              )}
              <T variant="caption" numberOfLines={1} style={{ maxWidth: 140 }}>
                {f.name}
              </T>
              <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="הסר קובץ">
                <Ionicons name="close-circle" size={18} color={c.textTertiary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {voice.error ? (
        <T variant="caption" tone="danger">
          {voice.error}
        </T>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.xs,
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: recording ? c.danger : c.border,
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          shadowColor: "#000",
          shadowOpacity: c.dark ? 0 : 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        {allowAttachments ? <IconButton icon="add" accessibilityLabel="צרף קובץ או צילום" onPress={() => setMenu(true)} disabled={disabled} /> : null}
        {recording || transcribing ? (
          <View style={{ flex: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: space.sm }}>
            <T variant="body" tone={recording ? "danger" : "secondary"}>
              {recording ? `מקשיב… ${voice.seconds}ש׳ · הקש לסיום` : "מתמלל…"}
            </T>
          </View>
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={c.textTertiary}
            multiline
            autoFocus={autoFocus}
            editable={!disabled}
            onSubmitEditing={() => submit(text)}
            submitBehavior="submit"
            returnKeyType="send"
            style={[type.body, { flex: 1, color: c.text, textAlign: "right", paddingVertical: 10, paddingHorizontal: space.sm, maxHeight: 140 }]}
            accessibilityLabel="בקשה לעוזר"
          />
        )}
        {text.trim() || files.length ? (
          <IconButton icon="arrow-up" tone="filled" size={20} accessibilityLabel="שלח" onPress={() => submit(text)} disabled={disabled} />
        ) : transcribing ? (
          <View style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : (
          <Pressable
            onPress={voice.toggle}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={recording ? "סיים הקלטה" : "דבר עם העוזר"}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: recording ? c.danger : c.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name={recording ? "stop" : "mic"} size={22} color={c.onAccent} />
          </Pressable>
        )}
      </View>
      <AttachMenu visible={menu} onClose={() => setMenu(false)} onPicked={(f) => setFiles((prev) => [...prev, ...f])} />
    </View>
  );
}
