import React from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickDocument, pickImage, scanDocument, takePhoto, type LocalFile } from "@/services/documents/DocumentService";
import { Row, T } from "@/components/ui";
import { radius, space, useTheme } from "@/theme/tokens";

const OPTIONS = [
  { key: "camera", title: "צילום", subtitle: "מסמך, קבלה, מכתב", icon: "camera-outline" as const, run: async () => [await takePhoto()] },
  { key: "scan", title: "סריקת מסמך", subtitle: "זיהוי שוליים וכמה עמודים", icon: "scan-outline" as const, run: scanDocument },
  { key: "photo", title: "תמונה מהגלריה", icon: "image-outline" as const, run: async () => [await pickImage()] },
  { key: "file", title: "קובץ", subtitle: "PDF, Word, Excel", icon: "document-attach-outline" as const, run: async () => [await pickDocument()] },
];

export function AttachMenu({ visible, onClose, onPicked }: { visible: boolean; onClose: () => void; onPicked: (files: LocalFile[]) => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: c.surface,
          borderTopLeftRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          padding: space.lg,
          paddingBottom: insets.bottom + space.lg,
        }}
      >
        <T variant="heading" style={{ marginBottom: space.sm }}>
          צירוף לעוזר
        </T>
        {OPTIONS.map((o) => (
          <Row
            key={o.key}
            title={o.title}
            subtitle={o.subtitle}
            icon={o.icon}
            onPress={async () => {
              onClose();
              try {
                const files = (await o.run()).filter((f): f is LocalFile => Boolean(f));
                if (files.length) onPicked(files);
              } catch (e) {
                console.warn(e);
              }
            }}
          />
        ))}
      </View>
    </Modal>
  );
}
