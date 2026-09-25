import React, { useState } from "react";
import { TextInput, View } from "react-native";
import type { PendingConfirmation } from "@/assistant/engine";
import { Button, Card, T } from "@/components/ui";
import { radius, space, type, useTheme } from "@/theme/tokens";

/** "אני עומד לשלוח לרועי: … [שלח] [ערוך] [בטל]" */
export function ConfirmationCard({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirmation;
  onConfirm: (edited?: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const c = useTheme();
  const { preview } = pending;
  const editableKey = preview.editable?.key;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(editableKey ? String(pending.input[editableKey] ?? "") : "");

  return (
    <Card tone={preview.destructive ? "warning" : "accent"} style={{ gap: space.md }}>
      <T variant="heading">{preview.title}</T>
      {editing && editableKey ? (
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={preview.editable?.multiline}
          autoFocus
          style={[
            type.body,
            { color: c.text, backgroundColor: c.surface, borderRadius: radius.sm, padding: space.md, minHeight: 80, textAlign: "right", textAlignVertical: "top" },
          ]}
        />
      ) : preview.body ? (
        <View style={{ backgroundColor: c.surface, borderRadius: radius.sm, padding: space.md }}>
          <T variant="body">{editableKey ? value : preview.body}</T>
        </View>
      ) : null}
      {preview.details?.map((d, i) => (
        <T key={i} variant="caption" tone="secondary">
          {d.label}: {d.value}
        </T>
      ))}
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button
          title={preview.confirmLabel}
          variant={preview.destructive ? "danger" : "primary"}
          compact
          onPress={() => onConfirm(editableKey && value !== String(pending.input[editableKey] ?? "") ? { [editableKey]: value } : undefined)}
        />
        {editableKey ? <Button title={editing ? "סיום עריכה" : "ערוך"} variant="secondary" compact onPress={() => setEditing(!editing)} /> : null}
        <Button title="בטל" variant="ghost" compact onPress={onCancel} />
      </View>
    </Card>
  );
}
